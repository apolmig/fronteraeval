import { readFile } from "node:fs/promises";

const catalog = JSON.parse(await readFile("site/data/catalog.json", "utf8"));
const audit = JSON.parse(await readFile("site/data/source-audit.json", "utf8"));
const required = [
  "id", "name", "source_type", "source_url", "topics", "review_status",
  "measures", "does_not_measure", "best_for", "not_sufficient_for", "links",
  "source_key", "record_type", "source_resolution", "origin", "paper_status",
  "preferred_source"
];
const errors = [];
const ids = new Set();
let sourceLinks = 0;
let enrichedRegisterEntries = 0;
let enrichedInternalEntries = 0;

function isHTTPS(value) {
  try {
    return new URL(String(value)).protocol === "https:";
  } catch {
    return false;
  }
}

for (const [index, record] of catalog.records.entries()) {
  for (const key of required) if (!(key in record)) errors.push(`record ${index} missing ${key}`);
  if (ids.has(record.id)) errors.push(`duplicate ${record.id}`);
  ids.add(record.id);

  if (!["imported", "catalogued", "reviewed"].includes(record.review_status)) errors.push(`invalid review status ${record.id}`);
  if (!["verified", "source-derived", "paper-only", "host-only", "unresolved"].includes(record.attribution_status)) errors.push(`invalid source status ${record.id}`);
  if (!["present", "not-found", "not-applicable"].includes(record.paper_status)) errors.push(`invalid paper status ${record.id}`);
  if (!isHTTPS(record.source_url)) errors.push(`invalid source ${record.id}`);
  if (!isHTTPS(record.preferred_source?.url)) errors.push(`invalid preferred source ${record.id}`);
  if (!Array.isArray(record.links) || record.links.length === 0) errors.push(`missing source links ${record.id}`);

  const linkKeys = new Set();
  for (const link of record.links || []) {
    if (!link?.label || !link?.kind || !isHTTPS(link?.url)) errors.push(`invalid link in ${record.id}`);
    const key = `${link.kind}|${link.url}`;
    if (linkKeys.has(key)) errors.push(`duplicate link in ${record.id}: ${key}`);
    linkKeys.add(key);
    sourceLinks += 1;
  }

  for (const topic of record.topics) if (!catalog.topics[topic]) errors.push(`unknown topic ${topic} in ${record.id}`);

  if (record.source_type === "inspect-register") {
    if (!record.registry_url || !isHTTPS(record.registry_url)) errors.push(`missing registry provenance ${record.id}`);
    if (record.metadata_enriched) enrichedRegisterEntries += 1;
  }

  if (record.source_type === "inspect-internal" && record.metadata_source === "Inspect internal eval.yaml") {
    if (!record.metadata_url || !isHTTPS(record.metadata_url)) errors.push(`missing internal metadata provenance ${record.id}`);
    enrichedInternalEntries += 1;
  }

  if (record.paper_status === "present" && !isHTTPS(record.paper?.url)) errors.push(`present paper without URL ${record.id}`);
  if (record.paper?.arxiv_id && (!record.paper.title || !record.paper.authors?.length)) errors.push(`incomplete arXiv metadata ${record.id}`);
  if (record.reported_results && !Array.isArray(record.reported_results)) errors.push(`reported_results must be an array in ${record.id}`);
}

const ape = catalog.records.find(record => record.id === "inspect:ape_eval");
if (!ape || /effectiveness|human effect/i.test(ape.measures)) errors.push("APE assessment must distinguish attempts from persuasion effectiveness");
if (ape?.evidence_reach?.includes("controlled-human-effect")) errors.push("APE must not claim controlled human-effect evidence");

if (catalog.stats.records !== catalog.records.length) errors.push("stats mismatch");
if (catalog.records.length < 250) errors.push(`catalog too small: ${catalog.records.length}`);
if (!catalog.inspect_source_commit) errors.push("missing Inspect source commit");
if (enrichedRegisterEntries < 30) errors.push(`too few enriched register entries: ${enrichedRegisterEntries}`);
if (enrichedInternalEntries < 150) errors.push(`too few enriched internal entries: ${enrichedInternalEntries}`);
if (sourceLinks < catalog.records.length) errors.push("not every record has a source link");
if (audit.reviewed_source_problems?.length) errors.push(`reviewed source problems: ${audit.reviewed_source_problems.join(", ")}`);
if (audit.inspect_as_origin_problems?.length) errors.push(`Inspect used as origin: ${audit.inspect_as_origin_problems.join(", ")}`);
if (audit.duplicate_resource_problems?.length) errors.push(`duplicate resources: ${audit.duplicate_resource_problems.join(", ")}`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `Validated ${catalog.records.length} records; ${enrichedRegisterEntries} register entries; ` +
  `${enrichedInternalEntries} internal tasks; ${sourceLinks} role-labelled source links; ` +
  `${catalog.stats.review_status.reviewed || 0} editorially reviewed.`
);
