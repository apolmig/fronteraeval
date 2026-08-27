import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const REVIEWS_DIR = "data/methodological-reviews";
const [catalog, policy, filenames, enhancements] = await Promise.all([
  readFile("site/data/catalog.json", "utf8").then(JSON.parse),
  readFile(`${REVIEWS_DIR}/_policy.json`, "utf8").then(JSON.parse),
  readdir(REVIEWS_DIR),
  readFile("site/enhancements.js", "utf8")
]);

const reviewFiles = filenames.filter((name) => name.endsWith(".json") && !name.startsWith("_"));
const reviews = await Promise.all(reviewFiles.map((name) => readFile(`${REVIEWS_DIR}/${name}`, "utf8").then(JSON.parse)));
const records = new Map(catalog.records.map((record) => [record.id, record]));
const requiredIds = [
  "inspect:paperbench", "inspect:mle_bench", "inspect:frontier_cs_research",
  "canonical:terminal-bench", "inspect:swe_bench", "inspect:osworld",
  "canonical:webarena", "canonical:workarena", "canonical:jailbreakbench",
  "canonical:harmbench", "inspect:strong_reject", "canonical:agentdojo",
  "inspect:agentharm", "inspect:cybench", "inspect:cve_bench"
];

assert.equal(policy.review_type, "documentary");
assert.equal(policy.replication_status, "not-replicated");
assert.equal(reviews.length, requiredIds.length, "unexpected wave-1 review count");
assert.equal(new Set(reviews.map((review) => review.id)).size, reviews.length, "duplicate review ids");
assert.ok((catalog.stats.review_status?.reviewed || 0) >= 30, "catalogue should contain at least 30 reviewed records after wave 1");
assert.equal(catalog.stats.methodological_reviews?.added_by_registry, 15, "wave-1 registry count mismatch");
assert.equal(catalog.stats.methodological_reviews?.independently_replicated, 0, "documentary reviews must not be represented as replications");

const requiredFields = [
  "construct", "unit_of_analysis", "interaction_type", "target_outcome", "elicitation",
  "scoring", "protocol_dependence", "implementation_dependence", "limitations",
  "comparability", "decision_relevance", "source_basis"
];

for (const id of requiredIds) {
  const record = records.get(id);
  assert.ok(record, `${id}: record missing`);
  assert.equal(record.review_status, "reviewed", `${id}: review status not applied`);
  assert.equal(record.editorial_reviewed_at, "2026-08-27", `${id}: review date mismatch`);
  const review = record.methodological_review;
  assert.ok(review, `${id}: structured methodological review missing`);
  assert.equal(review.review_type, "documentary", `${id}: review type must be documentary`);
  assert.equal(review.replication_status, "not-replicated", `${id}: replication status must be explicit`);
  for (const field of requiredFields) assert.ok(review[field] && (!Array.isArray(review[field]) || review[field].length), `${id}: missing ${field}`);
  assert.ok(review.source_basis.every((source) => /^https:\/\//.test(source.url)), `${id}: invalid review source`);
  assert.ok(record.evidence_reach.includes("controlled-model-behaviour"), `${id}: bounded evidence reach missing`);
  assert.doesNotMatch(`${record.measures} ${record.best_for}`, /universal safety|complete safety|general autonomy|replace.*(engineer|researcher)/i, `${id}: overclaim in positive interpretation`);
}

assert.match(records.get("inspect:paperbench").does_not_measure, /original research|scientific autonomy/i);
assert.match(records.get("inspect:mle_bench").does_not_measure, /production|research/i);
assert.match(records.get("canonical:jailbreakbench").does_not_measure, /universal jailbreak/i);
assert.match(records.get("canonical:harmbench").does_not_measure, /real-world harm/i);
assert.match(records.get("inspect:agentharm").does_not_measure, /deployment|real-world misuse/i);
assert.match(records.get("inspect:cybench").does_not_measure, /real-world intrusion/i);
assert.match(records.get("inspect:cve_bench").does_not_measure, /real-world|arbitrary systems/i);
assert.match(enhancements, /Documentary review, not an independent replication/i, "UI must expose the review boundary");
assert.match(enhancements, /Methodological assessment/, "methodological assessment UI missing");

console.log(`Validated ${requiredIds.length} documentary methodological reviews; ${catalog.stats.review_status.reviewed} reviewed records in total; 0 independent replications claimed.`);
