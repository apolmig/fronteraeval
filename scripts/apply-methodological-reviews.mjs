import { readdir, readFile, writeFile } from "node:fs/promises";

const CATALOG_PATH = "site/data/catalog.json";
const CSV_PATH = "site/data/catalog.csv";
const AUDIT_PATH = "site/data/source-audit.json";
const REVIEWS_DIR = "data/methodological-reviews";

const [catalog, policy, audit, filenames] = await Promise.all([
  readFile(CATALOG_PATH, "utf8").then(JSON.parse),
  readFile(`${REVIEWS_DIR}/_policy.json`, "utf8").then(JSON.parse),
  readFile(AUDIT_PATH, "utf8").then(JSON.parse).catch(() => null),
  readdir(REVIEWS_DIR)
]);

const reviews = [];
for (const filename of filenames.filter((name) => name.endsWith(".json") && !name.startsWith("_"))) {
  reviews.push(JSON.parse(await readFile(`${REVIEWS_DIR}/${filename}`, "utf8")));
}

const recordsById = new Map(catalog.records.map((record) => [record.id, record]));
const missing = [];
const applied = [];
const required = [
  "construct", "unit_of_analysis", "interaction_type", "target_outcome", "elicitation",
  "scoring", "measures", "does_not_measure", "best_for", "not_sufficient_for",
  "protocol_dependence", "implementation_dependence", "limitations", "comparability",
  "decision_relevance", "source_basis"
];

for (const review of reviews) {
  if (!review.id) throw new Error("Methodological review missing id");
  const record = recordsById.get(review.id);
  if (!record) {
    missing.push(review.id);
    continue;
  }
  for (const field of required) {
    if (review[field] == null || review[field] === "" || (Array.isArray(review[field]) && review[field].length === 0)) {
      throw new Error(`${review.id}: methodological review missing ${field}`);
    }
  }

  record.review_status = "reviewed";
  record.editorial_reviewed_at = review.reviewed_at || policy.reviewed_at;
  record.measures = review.measures;
  record.does_not_measure = review.does_not_measure;
  record.best_for = review.best_for;
  record.not_sufficient_for = review.not_sufficient_for;
  record.evidence_reach = review.evidence_reach || ["controlled-model-behaviour"];
  record.methodological_review = {
    status: "reviewed",
    review_type: review.review_type || policy.review_type,
    replication_status: review.replication_status || policy.replication_status,
    reviewed_at: review.reviewed_at || policy.reviewed_at,
    review_confidence: review.review_confidence || "moderate",
    construct: review.construct,
    unit_of_analysis: review.unit_of_analysis,
    interaction_type: review.interaction_type,
    target_outcome: review.target_outcome,
    human_participants: review.human_participants || "Not recorded",
    elicitation: review.elicitation,
    scoring: review.scoring,
    protocol_dependence: review.protocol_dependence,
    implementation_dependence: review.implementation_dependence,
    limitations: review.limitations,
    comparability: review.comparability,
    decision_relevance: review.decision_relevance,
    source_basis: review.source_basis,
    review_scope: policy.scope,
    review_limit: policy.limit
  };
  applied.push(review.id);
}

if (missing.length) throw new Error(`Methodological review targets missing from catalogue: ${missing.join(", ")}`);
if (new Set(applied).size !== applied.length) throw new Error("Duplicate methodological review ids");

const reviewStatus = {};
for (const record of catalog.records) reviewStatus[record.review_status] = (reviewStatus[record.review_status] || 0) + 1;
catalog.stats.review_status = reviewStatus;
catalog.stats.methodological_reviews = {
  documentary: catalog.records.filter((record) => record.methodological_review?.review_type === "documentary").length,
  independently_replicated: catalog.records.filter((record) => record.methodological_review?.replication_status === "independently-replicated").length,
  added_by_registry: applied.length,
  registry_schema_version: policy.schema_version,
  reviewed_at: policy.reviewed_at
};

if (audit) {
  audit.reviewed_source_problems = catalog.records
    .filter((record) => record.review_status === "reviewed" && ["host-only", "unresolved"].includes(record.attribution_status))
    .map((record) => record.id);
  audit.methodological_reviews = catalog.stats.methodological_reviews;
  await writeFile(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`);
}

await writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);

const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const header = [
  "id", "name", "organisation", "organisation_role", "attribution_status", "record_type",
  "source_type", "topics", "review_status", "methodological_review_type", "replication_status",
  "code_available", "inspect_compatible", "source_url", "paper_url", "version", "last_source_check"
];
const rows = catalog.records.map((record) => [
  record.id, record.name, record.organisation, record.organisation_role, record.attribution_status,
  record.record_type, record.source_type, (record.topics || []).join("|"), record.review_status,
  record.methodological_review?.review_type || "", record.methodological_review?.replication_status || "",
  record.code_available, record.inspect_compatible, record.source_url,
  record.paper?.url || record.paper_url || "", record.version || "", record.last_source_check
]);
await writeFile(CSV_PATH, `${[header, ...rows].map((row) => row.map(quote).join(",")).join("\n")}\n`);

console.log(JSON.stringify({
  applied_methodological_reviews: applied.length,
  total_reviewed_records: reviewStatus.reviewed || 0,
  documentary_reviews: catalog.stats.methodological_reviews.documentary,
  independently_replicated: catalog.stats.methodological_reviews.independently_replicated
}));
