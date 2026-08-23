import { readFile } from "node:fs/promises";

const catalog = JSON.parse(await readFile("site/data/catalog.json", "utf8"));
const required = [
  "id", "name", "source_type", "source_url", "topics", "review_status",
  "measures", "does_not_measure", "best_for", "not_sufficient_for", "links"
];
const errors = [];
const ids = new Set();
let sourceLinks = 0;
let enrichedRegisterEntries = 0;

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

  if (!["imported", "catalogued", "reviewed"].includes(record.review_status)) {
    errors.push(`invalid status ${record.id}`);
  }
  if (!isHTTPS(record.source_url)) errors.push(`invalid source ${record.id}`);
  if (!Array.isArray(record.links) || record.links.length === 0) errors.push(`missing source links ${record.id}`);

  const linkURLs = new Set();
  for (const link of record.links || []) {
    if (!link?.label || !link?.kind || !isHTTPS(link?.url)) errors.push(`invalid link in ${record.id}`);
    if (linkURLs.has(link.url)) errors.push(`duplicate link in ${record.id}: ${link.url}`);
    linkURLs.add(link.url);
    sourceLinks += 1;
  }

  for (const topic of record.topics) {
    if (!catalog.topics[topic]) errors.push(`unknown topic ${topic} in ${record.id}`);
  }

  if (record.source_type === "inspect-register") {
    if (!record.registry_url || !isHTTPS(record.registry_url)) errors.push(`missing registry provenance ${record.id}`);
    if (record.metadata_enriched) enrichedRegisterEntries += 1;
  }

  if (record.reported_results && !Array.isArray(record.reported_results)) {
    errors.push(`reported_results must be an array in ${record.id}`);
  }
}

if (catalog.stats.records !== catalog.records.length) errors.push("stats mismatch");
if (catalog.records.length < 250) errors.push(`catalog too small: ${catalog.records.length}`);
if (!catalog.inspect_source_commit) errors.push("missing Inspect source commit");
if (enrichedRegisterEntries < 30) errors.push(`too few enriched register entries: ${enrichedRegisterEntries}`);
if (sourceLinks < catalog.records.length) errors.push("not every record has a source link");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `Validated ${catalog.records.length} records; ` +
  `${enrichedRegisterEntries} enriched register entries; ` +
  `${sourceLinks} source links; ` +
  `${catalog.stats.review_status.reviewed || 0} editorially reviewed.`
);
