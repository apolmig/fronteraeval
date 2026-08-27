import { readFile, writeFile } from "node:fs/promises";
import YAML from "yaml";

const REPO = "UKGovernmentBEIS/inspect_evals";
const USER_AGENT = "FronteraEval/0.2 (+https://fronteraeval.org)";
const CATALOG_PATH = "site/data/catalog.json";
const CSV_PATH = "site/data/catalog.csv";
const FRESHNESS_PATH = "site/data/freshness.json";

const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
const freshness = JSON.parse(await readFile(FRESHNESS_PATH, "utf8"));

function cleanText(value) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function safeURL(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
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

function normalizeMetrics(metrics) {
  if (Array.isArray(metrics)) {
    return metrics
      .map((metric) => ({
        key: cleanText(metric?.key) || cleanText(metric?.name) || "metric",
        value: metric?.value ?? metric?.score ?? null
      }))
      .filter((metric) => metric.value !== null)
      .slice(0, 16);
  }
  if (metrics && typeof metrics === "object") {
    return Object.entries(metrics)
      .map(([key, value]) => ({ key, value }))
      .slice(0, 16);
  }
  return [];
}

function normalizeResults(report) {
  const raw = asArray(report?.results);
  return raw.slice(0, 24).map((result) => ({
    model: cleanText(result?.model) || "Unspecified model",
    provider: cleanText(result?.provider),
    metrics: normalizeMetrics(result?.metrics)
  }));
}

function normalizeTasks(tasks) {
  return asArray(tasks).map((task) => ({
    name: cleanText(task?.name) || "task",
    path: cleanText(task?.task_path)
  })).slice(0, 24);
}

function humaniseTaskVariant(value, familyTitle = "") {
  const familyTokens = new Set(String(familyTitle).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean));
  const tokens = String(value || "").toLowerCase().split(/[_-]+/).filter((token) => token && !familyTokens.has(token));
  const replacements = { refmodel: "reference model", gen: "generation", debug: "debugging", prereqs: "prerequisites" };
  const words = tokens.flatMap((token) => (replacements[token] || token).split(" "));
  return words.join(" ").replace(/\b\w/g, (character) => character.toUpperCase()) || "Task variant";
}

async function fetchJSON(url) {
  const response = await fetch(url, {
    headers: { accept: "application/vnd.github+json", "user-agent": USER_AGENT }
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
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

const commit = await fetchJSON(`https://api.github.com/repos/${REPO}/commits/main`);
const commitSha = String(commit.sha);
const enrichedAt = new Date().toISOString();

let enrichedRegisterEntries = 0;
let registerParseFailures = 0;
let resultBearingEntries = 0;
let linkedResources = 0;

const registerRecords = catalog.records.filter((record) => record.source_type === "inspect-register");

await mapLimit(registerRecords, 8, async (record) => {
  const slug = String(record.id).split(":").slice(1).join(":");
  const registryURL = `https://github.com/${REPO}/blob/${commitSha}/register/${slug}/eval.yaml`;
  const rawURL = `https://raw.githubusercontent.com/${REPO}/${commitSha}/register/${slug}/eval.yaml`;
  const links = [];

  try {
    const metadata = YAML.parse(await fetchText(rawURL)) || {};
    const codeURL = safeURL(metadata?.source?.repository_url);
    const paperURL = safeURL(metadata?.arxiv);
    const documentationURL = safeURL(metadata?.documentation_url || metadata?.docs_url || metadata?.homepage);
    const datasetURL = safeURL(metadata?.dataset_url || metadata?.dataset?.url);

    addLink(links, "code", "Implementation", codeURL, Boolean(codeURL));
    addLink(links, "paper", "Paper", paperURL, !codeURL && Boolean(paperURL));
    addLink(links, "documentation", "Documentation", documentationURL, !codeURL && !paperURL && Boolean(documentationURL));
    addLink(links, "dataset", "Dataset", datasetURL);
    addLink(links, "registry", "Inspect registry entry", registryURL, links.length === 0);
    addLink(links, "framework", "Inspect documentation", "https://inspect.aisi.org.uk/");

    const results = normalizeResults(metadata?.evaluation_report);
    const tasks = normalizeTasks(metadata?.tasks);
    const description = cleanText(metadata?.description);
    const commonTitle = cleanText(metadata?.common_title);
    const fullTitle = cleanText(metadata?.full_title);

    record.name = commonTitle || fullTitle || record.name;
    if (description) record.description = description;
    record.source_url = codeURL || paperURL || documentationURL || registryURL;
    record.links = links;
    record.paper_title = cleanText(metadata?.paper_title);
    record.paper_url = paperURL;
    record.code_url = codeURL;
    record.registry_url = registryURL;
    record.documentation_url = documentationURL;
    record.dataset_url = datasetURL;
    record.tags = asArray(metadata?.tags).map(cleanText).filter(Boolean);
    record.contributors = asArray(metadata?.contributors).map(cleanText).filter(Boolean);
    record.tasks = tasks;
    record.protocol = {
      implementation_commit: cleanText(metadata?.source?.repository_commit),
      report_commit: cleanText(metadata?.evaluation_report?.commit),
      report_timestamp: cleanText(metadata?.evaluation_report?.timestamp),
      command: cleanText(metadata?.evaluation_report?.command),
      source_comment: cleanText(metadata?.source?.comment)
    };
    record.reported_results = results;
    record.reported_result_count = asArray(metadata?.evaluation_report?.results).length;
    record.reported_results_truncated = record.reported_result_count > results.length;
    record.report_notes = asArray(metadata?.evaluation_report?.notes).map(cleanText).filter(Boolean).slice(0, 12);
    record.models_reported = results.map((result) => result.model);
    record.metadata_enriched = true;
    record.metadata_enriched_at = enrichedAt.slice(0, 10);
    record.provenance = {
      ...(record.provenance || {}),
      source_sha: commitSha,
      registry_url: registryURL,
      enrichment: "Inspect Evals register metadata"
    };

    enrichedRegisterEntries += 1;
    linkedResources += links.length;
    if (results.length) resultBearingEntries += 1;
  } catch (error) {
    registerParseFailures += 1;
    addLink(links, "registry", "Inspect registry entry", registryURL, true);
    addLink(links, "framework", "Inspect documentation", "https://inspect.aisi.org.uk/");
    record.source_url = registryURL;
    record.registry_url = registryURL;
    record.links = links;
    record.metadata_enriched = false;
    record.enrichment_error = error instanceof Error ? error.message : String(error);
    record.provenance = { ...(record.provenance || {}), source_sha: commitSha, registry_url: registryURL };
  }
});

const registerNameGroups = new Map();
for (const record of registerRecords) {
  const key = String(record.name || "").toLowerCase();
  if (!registerNameGroups.has(key)) registerNameGroups.set(key, []);
  registerNameGroups.get(key).push(record);
}
for (const group of registerNameGroups.values()) {
  if (group.length < 2) continue;
  for (const record of group) {
    const familyTitle = record.name;
    const variant = humaniseTaskVariant(record.tasks?.[0]?.name || record.id.split(":").pop(), familyTitle);
    record.family_title = familyTitle;
    record.variant_title = variant;
    record.name = `${familyTitle} — ${variant}`;
  }
}

for (const record of catalog.records) {
  if (record.source_type === "inspect-internal") {
    record.source_url = String(record.source_url).replace(/\/tree\/[^/]+\//, `/tree/${commitSha}/`);
    record.links = [
      { kind: "code", label: "Inspect implementation", url: record.source_url, primary: true },
      { kind: "framework", label: "Inspect documentation", url: "https://inspect.aisi.org.uk/", primary: false },
      { kind: "repository", label: "Inspect Evals repository", url: `https://github.com/${REPO}`, primary: false }
    ];
    record.provenance = { ...(record.provenance || {}), source_sha: commitSha };
    linkedResources += record.links.length;
  } else if (record.source_type === "canonical-source") {
    const kind = String(record.source_url).includes("github.com") ? "code" : String(record.source_url).includes("arxiv.org") ? "paper" : "official";
    record.links = [{ kind, label: kind === "code" ? "Implementation" : kind === "paper" ? "Paper" : "Official source", url: record.source_url, primary: true }];
    linkedResources += 1;
  }
  record.resource_count = Array.isArray(record.links) ? record.links.length : 0;
}

catalog.schema_version = "0.2.0";
catalog.inspect_source_commit = commitSha;
catalog.enriched_at = enrichedAt;
catalog.stats.enrichment = {
  register_entries_enriched: enrichedRegisterEntries,
  register_parse_failures: registerParseFailures,
  entries_with_reported_results: resultBearingEntries,
  linked_resources: linkedResources
};

await writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);

const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const header = [
  "id", "name", "organisation", "source_type", "topics", "review_status",
  "source_url", "paper_url", "code_url", "registry_url", "resource_count",
  "models_reported", "last_source_check"
];
const rows = catalog.records.map((record) => [
  record.id,
  record.name,
  record.organisation,
  record.source_type,
  record.topics.join("|"),
  record.review_status,
  record.source_url,
  record.paper_url,
  record.code_url,
  record.registry_url,
  record.resource_count,
  asArray(record.models_reported).join("|"),
  record.last_source_check
]);
await writeFile(CSV_PATH, `${[header, ...rows].map((row) => row.map(quote).join(",")).join("\n")}\n`);

await writeFile(FRESHNESS_PATH, `${JSON.stringify({
  ...freshness,
  checked_at: enrichedAt,
  inspect_source_commit: commitSha,
  register_entries_enriched: enrichedRegisterEntries,
  register_parse_failures: registerParseFailures,
  entries_with_reported_results: resultBearingEntries,
  linked_resources: linkedResources
}, null, 2)}\n`);

console.log(JSON.stringify(catalog.stats.enrichment));
