import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalog = JSON.parse(await readFile("site/data/catalog.json", "utf8"));
const audit = JSON.parse(await readFile("site/data/attribution-audit.json", "utf8"));
const byID = new Map(catalog.records.map(record => [record.id, record]));

function record(id) {
  const value = byID.get(id);
  assert.ok(value, `missing record ${id}`);
  return value;
}

function roleNames(value, roleName) {
  return (value.attribution?.roles || [])
    .filter(item => item.role === roleName)
    .map(item => item.name);
}

for (const value of catalog.records) {
  assert.ok(value.attribution, `${value.id}: missing attribution`);
  assert.ok(value.attribution.primary, `${value.id}: missing primary attribution`);
  assert.ok(value.organisation, `${value.id}: missing legacy display organisation`);
  assert.ok(value.organisation_role, `${value.id}: missing organisation role`);
  assert.ok(value.preferred_source?.url?.startsWith("https://"), `${value.id}: missing preferred source`);
  assert.ok(Array.isArray(value.attribution.roles) && value.attribution.roles.length > 0, `${value.id}: missing attribution roles`);
  assert.ok(!/UK AI Security Institute \/ upstream authors/i.test(value.organisation), `${value.id}: ambiguous legacy attribution`);
  assert.ok(!/Upstream authors \/ Inspect Evals Register/i.test(value.organisation), `${value.id}: ambiguous register attribution`);

  for (const item of value.attribution.roles) {
    assert.ok(item.role, `${value.id}: role without type`);
    assert.ok(item.role_label, `${value.id}: role without label`);
    assert.ok(item.name, `${value.id}: role without name`);
    if (item.url) assert.ok(item.url.startsWith("https://"), `${value.id}: non-HTTPS attribution URL`);
  }

  if (value.review_status === "reviewed") {
    assert.equal(value.editorial_reviewed_at, "2026-08-23", `${value.id}: review date must be fixed, not regenerated`);
    assert.ok(!["host-only", "unresolved"].includes(value.attribution_status), `${value.id}: reviewed record has weak attribution`);
  }
}

const ape = record("inspect:ape_eval");
assert.equal(ape.organisation, "FAR AI");
assert.equal(ape.organisation_role, "Evaluation developed by");
assert.equal(ape.attribution.primary.role, "evaluation_developer");
assert.ok(ape.attribution.primary.url.includes("far.ai"));
assert.ok(roleNames(ape, "reference_implementation").some(name => /FAR AI/i.test(name)));
assert.ok(roleNames(ape, "inspect_implementation").includes("Inspect Evals"));
assert.ok(!roleNames(ape, "evaluation_developer").some(name => /UK AI Security Institute|Inspect Evals/i.test(name)));
assert.ok(ape.attribution.note.includes("not the originator"));
assert.deepEqual(ape.evidence_reach, ["controlled-model-behaviour"], "APE must not claim a controlled human effect");
assert.match(ape.measures, /attempt/i);
assert.doesNotMatch(ape.measures, /persuasion effectiveness/i);

const makeMePay = record("inspect:make_me_pay");
assert.match(makeMePay.measures, /model-to-model/i);
assert.doesNotMatch(makeMePay.measures, /human susceptibility/i);

const sadInfluence = record("inspect:sad_influence");
assert.match(sadInfluence.measures, /situational-awareness/i);
assert.doesNotMatch(sadInfluence.measures, /human persuasion/i);

for (const id of [
  "canonical:metr-time-horizons",
  "canonical:re-bench",
  "canonical:ailuminate",
  "canonical:wmdp",
  "canonical:frontiermath"
]) {
  assert.equal(record(id).attribution.primary.role, "evaluation_developer", `${id}: canonical source should identify its developer`);
}

assert.equal(audit.reviewed_attribution_problems.length, 0, "reviewed attribution problems remain");
assert.equal(audit.unresolved_records.length, 0, "unresolved records remain");
assert.equal(catalog.stats.attribution.reviewed_attribution_problems, 0);
assert.ok(catalog.stats.attribution.inspect_host_roles > 0, "Inspect host role should be preserved explicitly");

console.log(
  `Validated attribution roles for ${catalog.records.length} records: ` +
  `${catalog.stats.attribution.status.verified} verified, ` +
  `${catalog.stats.attribution.status["source-derived"]} source-derived, ` +
  `${catalog.stats.attribution.status["host-only"]} host-only.`
);
