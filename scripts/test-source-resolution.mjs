import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const [catalog, registry, audit] = await Promise.all([
  readFile("site/data/catalog.json", "utf8").then(JSON.parse),
  readFile("data/source-registry.json", "utf8").then(JSON.parse),
  readFile("site/data/source-audit.json", "utf8").then(JSON.parse)
]);

const byID = new Map(catalog.records.map(record => [record.id, record]));
const allowedInspectOrigins = new Set(["inspect:agentharm"]);
const pendingArxivGroups = new Set();

function paperResolved(paper) {
  return Boolean(paper?.title && Array.isArray(paper?.authors) && paper.authors.length > 0);
}

for (const record of catalog.records) {
  assert.ok(record.source_key, `${record.id}: missing source key`);
  assert.ok(registry.entries[record.source_key], `${record.id}: registry entry missing`);
  assert.ok(record.record_type, `${record.id}: missing record type`);
  assert.ok(record.source_resolution?.status, `${record.id}: missing source resolution`);
  assert.ok(record.origin?.name, `${record.id}: missing origin display`);
  assert.ok(record.origin?.role, `${record.id}: missing origin role type`);
  assert.ok(record.origin?.role_label, `${record.id}: missing origin role label`);
  assert.ok(["verified", "source-derived", "paper-only", "host-only", "unresolved"].includes(record.attribution_status), `${record.id}: invalid source status`);
  assert.ok(["present", "not-found", "not-applicable"].includes(record.paper_status), `${record.id}: invalid paper status`);
  assert.ok(record.preferred_source?.url?.startsWith("https://"), `${record.id}: missing preferred source`);
  assert.ok(Array.isArray(record.links) && record.links.length > 0, `${record.id}: missing links`);
  assert.equal(new Set(record.links.map(link => `${link.kind}|${link.url}`)).size, record.links.length, `${record.id}: duplicate resource links`);

  if (record.paper_status === "present") {
    assert.ok(record.paper?.url?.startsWith("https://"), `${record.id}: paper URL missing`);
    if (record.paper?.arxiv_id && !paperResolved(record.paper)) pendingArxivGroups.add(record.source_key);
  }

  if (record.source_type === "inspect-internal" && !allowedInspectOrigins.has(record.id)) {
    assert.ok(!/^Inspect Evals$/i.test(record.origin.name), `${record.id}: Inspect host used as origin`);
    assert.ok(!/^UK AI Security Institute$/i.test(record.origin.name), `${record.id}: AISI host used as origin without explicit override`);
  }

  if (record.review_status === "reviewed") {
    assert.ok(!["host-only", "unresolved"].includes(record.attribution_status), `${record.id}: reviewed record has unresolved origin`);
    assert.equal(record.editorial_reviewed_at, "2026-08-24", `${record.id}: editorial review date is not fixed`);
    if (record.paper?.arxiv_id) assert.ok(paperResolved(record.paper), `${record.id}: reviewed paper metadata unresolved`);
  }
}

const ape = byID.get("inspect:ape_eval");
assert.equal(ape.origin.organization, "FAR AI");
assert.equal(ape.origin.role, "evaluation_developer");
assert.equal(ape.attribution_status, "verified");
assert.ok(ape.paper.url.includes("2506.02873"));
assert.ok(ape.paper.title);
assert.ok(ape.paper.authors.length >= 2);
assert.ok(ape.reference_implementation.url.includes("AlignmentResearch/AttemptPersuadeEval"));
assert.equal(ape.inspect_provenance.role, "maintained_implementation");
assert.deepEqual(ape.evidence_reach, ["controlled-model-behaviour"]);
assert.match(ape.measures, /attempt/i);
assert.doesNotMatch(ape.measures, /persuasion effectiveness/i);

const agentHarm = byID.get("inspect:agentharm");
assert.match(agentHarm.origin.name, /Gray Swan AI.*UK AI Security Institute/i);
assert.ok(agentHarm.paper.url.includes("2410.09024"));

const makeMePay = byID.get("inspect:make_me_pay");
assert.match(makeMePay.measures, /model-to-model/i);

const sad = byID.get("inspect:sad_influence");
assert.match(sad.measures, /situational-awareness/i);

for (const id of [
  "canonical:metr-time-horizons",
  "canonical:re-bench",
  "canonical:ailuminate",
  "canonical:wmdp",
  "canonical:frontiermath"
]) {
  const record = byID.get(id);
  assert.equal(record.attribution_status, "verified", `${id}: canonical source must be verified`);
  assert.ok(record.origin.organization, `${id}: canonical source must identify its organisation`);
}

assert.equal(audit.reviewed_source_problems.length, 0, "reviewed source problems remain");
assert.equal(audit.inspect_as_origin_problems.length, 0, "Inspect host is still used as origin");
assert.equal(audit.duplicate_resource_problems.length, 0, "duplicate resources remain");
assert.equal(audit.unresolved_records.length, 0, "unresolved source records remain");
assert.equal(audit.records, catalog.records.length);
assert.ok(registry.stats.source_groups >= 190, `too few source groups: ${registry.stats.source_groups}`);
assert.ok((registry.stats.arxiv_metadata_pending || 0) <= Math.max(3, Math.ceil((registry.stats.arxiv_papers || 0) * 0.03)), `too many pending arXiv papers: ${registry.stats.arxiv_metadata_pending}`);
assert.equal(pendingArxivGroups.size, registry.stats.arxiv_metadata_pending || 0, "pending paper count is inconsistent across registry and catalogue");

try {
  await access(".github/workflows/apply-attribution-audit.yml");
  assert.fail("obsolete attribution bootstrap workflow still exists");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

try {
  await access("dummy.txt");
  assert.fail("dummy.txt still exists");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

console.log(
  `Validated source resolution for ${catalog.records.length} records across ${registry.stats.source_groups} source groups: ` +
  `${audit.status.verified || 0} verified, ${audit.status["source-derived"] || 0} source-derived, ` +
  `${audit.status["paper-only"] || 0} paper-only, ${audit.status["host-only"] || 0} host-only, ` +
  `${audit.status.unresolved || 0} unresolved; ${pendingArxivGroups.size} arXiv groups pending metadata.`
);
