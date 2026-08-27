import { readFile, writeFile } from "node:fs/promises";
import YAML from "yaml";

const REPO = "UKGovernmentBEIS/inspect_evals";
const USER_AGENT = "FronteraEval/0.3 (+https://fronteraeval.org)";
const CATALOG_PATH = "site/data/catalog.json";
const CSV_PATH = "site/data/catalog.csv";
const FRESHNESS_PATH = "site/data/freshness.json";

const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
const freshness = JSON.parse(await readFile(FRESHNESS_PATH, "utf8"));
const commitSha = String(catalog.inspect_source_commit || "main");
const enrichedAt = new Date().toISOString();

const assessmentCorrections = {
  "inspect:ape_eval": {
    measures: "Whether the evaluated model attempts persuasion across harmful, controversial, and benign topics in a multi-model simulated conversation.",
    does_not_measure: "Persuasion effectiveness, human belief change, durable behaviour, covert deployment, campaign-scale targeting, or electoral outcomes.",
    best_for: "Testing willingness to attempt persuasion and related safeguard behaviour under the APE protocol.",
    not_sufficient_for: "Claims that a model is effective at persuading people or can independently manipulate an electorate.",
    evidence_reach: ["controlled-model-behaviour"]
  },
  "inspect:make_me_pay": {
    measures: "Whether a simulated mark model donates money after social-engineering attempts by a con-artist model in a bounded model-to-model interaction.",
    does_not_measure: "Human susceptibility, fraud prevalence, real-world financial harm, or population-level behavioural effects.",
    best_for: "Testing social-engineering dynamics and model susceptibility in a controlled synthetic interaction.",
    not_sufficient_for: "Estimating real human victimisation or operational fraud capability.",
    evidence_reach: ["controlled-model-behaviour"]
  },
  "inspect:sad_influence": {
    measures: "Situational-awareness behaviour in the SAD influence task, within a broader suite testing model knowledge of itself and its circumstances.",
    does_not_measure: "Persuasion of human audiences, strategic deployment, durable behavioural change, or societal effects.",
    best_for: "Probing a bounded component of model situational awareness relevant to oversight.",
    not_sufficient_for: "Claims that a model can autonomously manipulate people or evade oversight in deployment.",
    evidence_reach: ["controlled-model-behaviour"]
  }
};

function cleanText(value) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function isSupportOnlyTask(comment) {
  const text = cleanText(comment) || "";
  return /(?:produces?|returns?)\s+no\s+scored\s+metrics|no\s+scored\s+metrics|not\s+scored|setup task/i.test(text);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function safeURL(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const cleaned = value.trim().replace(/[?#]$/, "");
  try {
    const url = new URL(cleaned);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function addLink(links, kind, label, url, primary = false) {
  const href = safeURL(url);
  if (!href || links.some((link) => link.url === href)) return;
  links.push({ kind, label, url: href, primary });
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

function moduleFromRecord(record) {
  return String(record.source_url || "").match(/\/src\/inspect_evals\/([^/?#]+)/)?.[1] || null;
}

function normalizeExternalAssets(assets) {
  return asArray(assets).map((asset) => ({
    type: cleanText(asset?.type),
    source: cleanText(asset?.source),
    fetch_method: cleanText(asset?.fetch_method),
    state: cleanText(asset?.state),
    comment: cleanText(asset?.comment)
  })).slice(0, 20);
}

const internalRecords = catalog.records.filter((record) => record.source_type === "inspect-internal");
const recordsByModule = new Map();
for (const record of internalRecords) {
  const module = moduleFromRecord(record);
  if (!module) continue;
  if (!recordsByModule.has(module)) recordsByModule.set(module, []);
  recordsByModule.get(module).push(record);
}

let modulesEnriched = 0;
let internalEntriesEnriched = 0;
let metadataFailures = 0;

await mapLimit([...recordsByModule.entries()], 10, async ([module, records]) => {
  const metadataURL = `https://github.com/${REPO}/blob/${commitSha}/src/inspect_evals/${module}/eval.yaml`;
  const rawURL = `https://raw.githubusercontent.com/${REPO}/${commitSha}/src/inspect_evals/${module}/eval.yaml`;

  try {
    const metadata = YAML.parse(await fetchText(rawURL)) || {};
    const title = cleanText(metadata.title);
    const description = cleanText(metadata.description);
    const paperURL = safeURL(metadata.arxiv);
    const tasks = asArray(metadata.tasks);
    const taskMap = new Map(tasks.map((task) => [cleanText(task?.name), task]));
    const singleTask = tasks.length === 1;

    for (const record of records) {
      const taskName = String(record.id).split(":").slice(1).join(":");
      const task = taskMap.get(taskName) || null;
      const links = Array.isArray(record.links) ? [...record.links] : [];

      addLink(links, "paper", "Paper or research source", paperURL);
      addLink(links, "metadata", "Inspect evaluation metadata", metadataURL);

      if (singleTask && title) record.name = title;
      if (description) record.description = description;
      record.links = links;
      record.paper_url = paperURL;
      record.metadata_url = metadataURL;
      record.family_title = title;
      record.group = cleanText(metadata.group);
      record.version = cleanText(metadata.version);
      record.contributors = asArray(metadata.contributors).map(cleanText).filter(Boolean);
      record.tags = [...new Set([
        ...asArray(record.tags).map(cleanText).filter(Boolean),
        ...asArray(metadata.tags).map(cleanText).filter(Boolean),
        cleanText(metadata.group)
      ].filter(Boolean))];
      const taskComment = cleanText(task?.comment);
      const supportOnly = isSupportOnlyTask(taskComment);
      record.task = {
        name: taskName,
        dataset_samples: task?.dataset_samples ?? null,
        comment: taskComment,
        support_only: supportOnly
      };
      record.tasks = tasks.map((item) => ({
        name: cleanText(item?.name) || "task",
        dataset_samples: item?.dataset_samples ?? null,
        comment: cleanText(item?.comment),
        support_only: isSupportOnlyTask(item?.comment)
      })).slice(0, 32);
      if (supportOnly) record.record_type = "evaluation-support-task";
      record.protocol = {
        ...(record.protocol || {}),
        version: cleanText(metadata.version),
        dataset_samples: task?.dataset_samples ?? null,
        dependency: cleanText(metadata.dependency),
        requires_internet: Boolean(metadata?.metadata?.requires_internet),
        sandbox: asArray(metadata?.metadata?.sandbox).map(cleanText).filter(Boolean)
      };
      record.external_assets = normalizeExternalAssets(metadata.external_assets);
      record.metadata_enriched = true;
      record.metadata_source = "Inspect internal eval.yaml";
      record.metadata_enriched_at = enrichedAt.slice(0, 10);
      record.provenance = {
        ...(record.provenance || {}),
        source_sha: commitSha,
        internal_metadata_url: metadataURL,
        enrichment: "Inspect internal evaluation metadata"
      };

      const correction = assessmentCorrections[record.id];
      if (correction) Object.assign(record, correction);

      record.resource_count = record.links.length;
      internalEntriesEnriched += 1;
    }
    modulesEnriched += 1;
  } catch (error) {
    metadataFailures += 1;
    for (const record of records) {
      record.internal_metadata_error = error instanceof Error ? error.message : String(error);
    }
  }
});

const excludedSupportTasks = catalog.records.filter((record) => record.record_type === "evaluation-support-task");
catalog.records = catalog.records.filter((record) => record.record_type !== "evaluation-support-task");

function countBy(records, key) {
  return records.reduce((counts, record) => {
    const value = record[key];
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

catalog.stats.records = catalog.records.length;
catalog.stats.sources = countBy(catalog.records, "source_type");
catalog.stats.review_status = countBy(catalog.records, "review_status");

const linkedResources = catalog.records.reduce((sum, record) => sum + (Array.isArray(record.links) ? record.links.length : 0), 0);
const entriesWithPaper = catalog.records.filter((record) => Boolean(record.paper_url)).length;
const entriesWithVersion = catalog.records.filter((record) => Boolean(record.version || record.protocol?.version || record.protocol?.implementation_commit)).length;

catalog.schema_version = "0.3.0";
catalog.enriched_at = enrichedAt;
catalog.stats.enrichment = {
  ...(catalog.stats.enrichment || {}),
  internal_modules_enriched: modulesEnriched,
  internal_entries_enriched: internalEntriesEnriched,
  internal_metadata_failures: metadataFailures,
  support_tasks_excluded: excludedSupportTasks.length,
  entries_with_paper: entriesWithPaper,
  entries_with_version: entriesWithVersion,
  linked_resources: linkedResources
};

await writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);

const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const header = [
  "id", "name", "family_title", "organisation", "group", "source_type", "topics",
  "review_status", "version", "dataset_samples", "source_url", "paper_url", "code_url",
  "metadata_url", "registry_url", "resource_count", "models_reported", "last_source_check"
];
const rows = catalog.records.map((record) => [
  record.id,
  record.name,
  record.family_title,
  record.organisation,
  record.group,
  record.source_type,
  record.topics.join("|"),
  record.review_status,
  record.version || record.protocol?.version || record.protocol?.implementation_commit,
  record.task?.dataset_samples ?? record.protocol?.dataset_samples,
  record.source_url,
  record.paper_url,
  record.code_url,
  record.metadata_url,
  record.registry_url,
  record.resource_count,
  asArray(record.models_reported).join("|"),
  record.last_source_check
]);
await writeFile(CSV_PATH, `${[header, ...rows].map((row) => row.map(quote).join(",")).join("\n")}\n`);

await writeFile(FRESHNESS_PATH, `${JSON.stringify({
  ...freshness,
  checked_at: enrichedAt,
  internal_modules_enriched: modulesEnriched,
  internal_entries_enriched: internalEntriesEnriched,
  internal_metadata_failures: metadataFailures,
  support_tasks_excluded: excludedSupportTasks.length,
  entries_with_paper: entriesWithPaper,
  entries_with_version: entriesWithVersion,
  linked_resources: linkedResources
}, null, 2)}\n`);

console.log(JSON.stringify({
  internal_modules_enriched: modulesEnriched,
  internal_entries_enriched: internalEntriesEnriched,
  internal_metadata_failures: metadataFailures,
  support_tasks_excluded: excludedSupportTasks.length,
  entries_with_paper: entriesWithPaper,
  linked_resources: linkedResources
}));
