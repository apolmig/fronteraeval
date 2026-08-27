import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const REVIEWS_DIR = "data/methodological-reviews";
const [catalog, policy, filenames, methodUi, index] = await Promise.all([
  readFile("site/data/catalog.json", "utf8").then(JSON.parse),
  readFile(`${REVIEWS_DIR}/_policy.json`, "utf8").then(JSON.parse),
  readdir(REVIEWS_DIR),
  readFile("site/methodological-reviews.js", "utf8"),
  readFile("site/index.html", "utf8")
]);

const reviewFiles = filenames.filter((name) => name.endsWith(".json") && !name.startsWith("_"));
const reviews = await Promise.all(reviewFiles.map((name) => readFile(`${REVIEWS_DIR}/${name}`, "utf8").then(JSON.parse)));
const records = new Map(catalog.records.map((record) => [record.id, record]));
const wave1 = [
  "inspect:paperbench", "inspect:mle_bench", "inspect:frontier_cs_research",
  "canonical:terminal-bench", "inspect:swe_bench", "inspect:osworld",
  "canonical:webarena", "canonical:workarena", "canonical:jailbreakbench",
  "canonical:harmbench", "inspect:strong_reject", "canonical:agentdojo",
  "inspect:agentharm", "inspect:cybench", "inspect:cve_bench"
];
const wave2 = [
  "inspect:ape_eval", "inspect:mask", "inspect:makemesay", "inspect:make_me_pay",
  "inspect:sycophancy", "inspect:agentic_misalignment", "inspect:sad_influence",
  "register:machiavelli", "register:deceptionbench", "register:manager_coercion_benchmark",
  "canonical:metr-time-horizons", "canonical:re-bench", "canonical:ailuminate",
  "canonical:wmdp", "canonical:frontiermath"
];
const requiredIds = [...wave1, ...wave2];

assert.equal(policy.review_type, "documentary");
assert.equal(policy.replication_status, "not-replicated");
assert.equal(reviews.length, requiredIds.length, "unexpected methodological-review registry count");
assert.equal(new Set(reviews.map((review) => review.id)).size, reviews.length, "duplicate review ids");
assert.equal(catalog.stats.methodological_reviews?.added_by_registry, 30, "registry count mismatch");
assert.equal(catalog.stats.methodological_reviews?.documentary, 30, "documentary review count mismatch");
assert.equal(catalog.stats.methodological_reviews?.independently_replicated, 0, "documentary reviews must not be represented as replications");
assert.ok((catalog.stats.review_status?.reviewed || 0) >= 30, "catalogue should contain at least 30 reviewed records");

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
  assert.ok(record.evidence_reach.length > 0, `${id}: bounded evidence reach missing`);
  assert.doesNotMatch(`${record.measures} ${record.best_for}`, /universal safety|complete safety|replace.*(engineer|researcher)|electoral effect|real-world incident rate/i, `${id}: overclaim in positive interpretation`);
}

assert.deepEqual(records.get("inspect:ape_eval").evidence_reach, ["controlled-model-behaviour"]);
assert.match(records.get("inspect:ape_eval").does_not_measure, /persuasion effectiveness on humans/i);
assert.match(records.get("inspect:mask").does_not_measure, /private internal beliefs/i);
assert.match(records.get("inspect:makemesay").does_not_measure, /human persuasion/i);
assert.match(records.get("inspect:make_me_pay").does_not_measure, /human susceptibility/i);
assert.match(records.get("inspect:sad_influence").does_not_measure, /persuasion of humans/i);
assert.match(records.get("register:machiavelli").does_not_measure, /political manipulation/i);
assert.match(records.get("canonical:metr-time-horizons").does_not_measure, /literal autonomous runtime|jobs automatable/i);
assert.match(records.get("canonical:re-bench").does_not_measure, /research taste|AI R&D/i);
assert.match(records.get("canonical:ailuminate").does_not_measure, /complete product safety case/i);
assert.match(records.get("canonical:wmdp").does_not_measure, /operational CBRN|tool use/i);
assert.match(records.get("canonical:frontiermath").does_not_measure, /AI safety|research autonomy/i);
assert.match(methodUi, /Documentary review, not an independent replication/i, "UI must expose the review boundary");
assert.match(methodUi, /Methodological assessment/, "methodological assessment UI missing");
assert.ok(index.includes('src="/methodological-reviews.js"'), "methodological review script not loaded");
assert.ok(index.includes('href="/methodological-reviews.css"'), "methodological review styles not loaded");

console.log(`Validated ${requiredIds.length} documentary methodological reviews; ${catalog.stats.review_status.reviewed} reviewed records in total; 0 independent replications claimed.`);
