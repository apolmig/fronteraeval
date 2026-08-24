import { readFile, writeFile } from "node:fs/promises";

const CATALOG_PATH = "site/data/catalog.json";
const REGISTRY_PATH = "data/source-registry.json";
const OVERRIDES_PATH = "data/source-overrides.json";
const CSV_PATH = "site/data/catalog.csv";
const FRESHNESS_PATH = "site/data/freshness.json";
const AUDIT_PATH = "site/data/source-audit.json";

const [catalog, registry, overrides, freshness] = await Promise.all([
  readFile(CATALOG_PATH, "utf8").then(JSON.parse),
  readFile(REGISTRY_PATH, "utf8").then(JSON.parse),
  readFile(OVERRIDES_PATH, "utf8").then(JSON.parse),
  readFile(FRESHNESS_PATH, "utf8").then(JSON.parse)
]);

const appliedAt = new Date().toISOString();
const fixedReviewDate = overrides.reviewed_at || "2026-08-24";

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function safeURL(value) {
  const raw = clean(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function sourceKey(record) {
  if (record.source_type === "inspect-internal") {
    const module = clean(record.source_url).match(/\/src\/inspect_evals\/([^/?#]+)/)?.[1];
    return `inspect-family:${module || record.id.split(":").slice(1).join(":")}`;
  }
  return record.id;
}

function roleLabel(role) {
  return ({
    evaluation_developer: "Evaluation developed by",
    original_research: "Original research by",
    original_benchmark_source: "Original benchmark source",
    paper_authors: "Original paper authors",
    implementation_maintainer: "Reference implementation by",
    unknown: "Origin not verified"
  })[role] || "Source attribution";
}

function addLink(links, link) {
  const url = safeURL(link?.url);
  if (!url) return;
  const kind = clean(link.kind || "source");
  const label = clean(link.label || "Source");
  const key = `${kind}|${url}`;
  if (links.some(item => `${item.kind}|${item.url}` === key)) return;
  links.push({ kind, label, url, primary: Boolean(link.primary) });
}

function preferredSource(entry) {
  if (entry.origin?.evidence_url) {
    return {
      label: entry.origin.role_label || roleLabel(entry.origin.role),
      kind: entry.origin.role || "origin",
      url: entry.origin.evidence_url
    };
  }
  const paper = entry.papers?.find(item => item.url);
  if (paper) return { label: "Paper", kind: "paper", url: paper.url };
  if (entry.implementation?.url) return { label: "Reference implementation", kind: "implementation", url: entry.implementation.url };
  if (entry.inspect?.url) return { label: entry.inspect.role === "registry_entry" ? "Inspect registry entry" : "Inspect implementation", kind: "inspect", url: entry.inspect.url };
  return null;
}

function paperPrimary(entry) {
  return entry.papers?.[0] || {
    status: entry.paper_status || "not-found",
    url: null,
    title: null,
    authors: [],
    arxiv_id: null,
    source: null
  };
}

const statusCounts = { verified: 0, "source-derived": 0, "paper-only": 0, "host-only": 0, unresolved: 0 };
const paperCounts = { present: 0, "not-found": 0, "not-applicable": 0 };
const unresolvedRecords = [];
const hostOnlyRecords = [];
const paperMissingRecords = [];
const reviewedProblems = [];
const inspectAsOrigin = [];
const duplicateResourceProblems = [];

for (const record of catalog.records) {
  const key = sourceKey(record);
  const entry = registry.entries?.[key];
  if (!entry) throw new Error(`${record.id}: missing source-registry entry ${key}`);

  const origin = {
    ...entry.origin,
    role_label: entry.origin?.role_label || roleLabel(entry.origin?.role)
  };
  const paper = paperPrimary(entry);
  const links = [];

  addLink(links, {
    kind: origin.role || "origin",
    label: origin.role_label,
    url: origin.evidence_url,
    primary: true
  });
  for (const item of entry.papers || []) addLink(links, { kind: "paper", label: item.title ? `Paper: ${item.title}` : "Paper", url: item.url });
  if (entry.implementation?.url) addLink(links, { kind: "implementation", label: "Reference implementation", url: entry.implementation.url });
  if (entry.inspect?.url) addLink(links, {
    kind: entry.inspect.role === "registry_entry" ? "inspect-registry" : "inspect-implementation",
    label: entry.inspect.role === "registry_entry" ? "Inspect Evals Register" : "Inspect implementation",
    url: entry.inspect.url
  });
  for (const dataset of entry.datasets || []) addLink(links, { kind: "dataset", label: dataset.provider ? `Dataset: ${dataset.provider}` : "Dataset", url: dataset.url });
  for (const page of entry.official_pages || []) addLink(links, { kind: "official", label: "Official or project page", url: page });

  const preferred = preferredSource(entry);
  if (preferred) {
    const found = links.find(link => link.url === safeURL(preferred.url));
    if (found) found.primary = true;
  }

  record.source_key = key;
  record.record_type = entry.record_type;
  record.topic_provenance = record.review_status === "reviewed" ? "editorial" : record.source_type === "canonical-source" ? "curated" : "heuristic";
  record.source_resolution = {
    schema_version: registry.schema_version,
    status: entry.status,
    method: entry.resolution_method,
    resolved_at: registry.generated_at,
    note: entry.note || null
  };
  record.origin = origin;
  record.paper = paper;
  record.papers = entry.papers || [];
  record.paper_status = entry.paper_status;
  record.reference_implementation = entry.implementation || null;
  record.inspect_provenance = entry.inspect || null;
  record.datasets = entry.datasets || [];
  record.organisation = origin.name;
  record.organisation_role = origin.role_label;
  record.attribution_status = entry.status;
  record.preferred_source = preferred;
  record.links = links;
  record.resource_count = links.length;
  record.paper_url = paper.url || null;
  record.code_url = entry.implementation?.url || null;
  record.metadata = {
    ...(record.metadata || {}),
    source_search: [
      origin.name,
      origin.organization,
      origin.role_label,
      paper.title,
      ...(paper.authors || []),
      entry.implementation?.owner,
      entry.record_type
    ].filter(Boolean).join(" ")
  };

  if (record.review_status === "reviewed") {
    record.editorial_reviewed_at = fixedReviewDate;
    record.editorial_review = {
      reviewer: "FronteraEval",
      reviewed_at: fixedReviewDate,
      scope: "construct, inference boundary, provenance and source attribution"
    };
  }

  statusCounts[entry.status] = (statusCounts[entry.status] || 0) + 1;
  paperCounts[entry.paper_status] = (paperCounts[entry.paper_status] || 0) + 1;
  if (entry.status === "unresolved") unresolvedRecords.push(record.id);
  if (entry.status === "host-only") hostOnlyRecords.push(record.id);
  if (entry.paper_status !== "present") paperMissingRecords.push({ id: record.id, status: entry.paper_status, record_type: entry.record_type });
  if (record.review_status === "reviewed" && ["host-only", "unresolved"].includes(entry.status)) reviewedProblems.push(record.id);
  if (/Inspect Evals|UK AI Security Institute/i.test(origin.name) && record.source_type === "inspect-internal" && !/agentharm|aisi|replibench|realitytest/i.test(record.id)) inspectAsOrigin.push(record.id);

  const resourceKeys = links.map(link => `${link.kind}|${link.url}`);
  if (new Set(resourceKeys).size !== resourceKeys.length) duplicateResourceProblems.push(record.id);
}

catalog.schema_version = "0.6.0";
catalog.source_registry_version = registry.schema_version;
catalog.source_registry_generated_at = registry.generated_at;
catalog.stats.source_resolution = {
  status: statusCounts,
  paper_status: paperCounts,
  source_groups: registry.stats?.source_groups || Object.keys(registry.entries || {}).length,
  records: catalog.records.length,
  inspect_as_origin_problems: inspectAsOrigin.length,
  reviewed_source_problems: reviewedProblems.length,
  duplicate_resource_problems: duplicateResourceProblems.length
};

const audit = {
  schema_version: "2.0.0",
  generated_at: appliedAt,
  source_registry_generated_at: registry.generated_at,
  inspect_source_commit: catalog.inspect_source_commit,
  records: catalog.records.length,
  source_groups: Object.keys(registry.entries || {}).length,
  status: statusCounts,
  paper_status: paperCounts,
  reviewed_source_problems: reviewedProblems,
  inspect_as_origin_problems: inspectAsOrigin,
  duplicate_resource_problems: duplicateResourceProblems,
  host_only_records: hostOnlyRecords,
  unresolved_records: unresolvedRecords,
  records_without_paper: paperMissingRecords,
  policy: "An Inspect implementation or registry entry is provenance, not authorship. Unknown origin remains explicit."
};

await writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
await writeFile(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`);

const quote = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
const header = [
  "id", "name", "record_type", "origin", "origin_role", "organization", "source_status",
  "paper_status", "paper_title", "paper_url", "paper_authors", "implementation_url",
  "inspect_role", "inspect_url", "source_type", "topics", "review_status", "last_source_check"
];
const rows = catalog.records.map(record => [
  record.id,
  record.name,
  record.record_type,
  record.origin?.name,
  record.origin?.role_label,
  record.origin?.organization,
  record.attribution_status,
  record.paper_status,
  record.paper?.title,
  record.paper?.url,
  (record.paper?.authors || []).join("|"),
  record.reference_implementation?.url,
  record.inspect_provenance?.role,
  record.inspect_provenance?.url,
  record.source_type,
  (record.topics || []).join("|"),
  record.review_status,
  record.last_source_check
]);
await writeFile(CSV_PATH, `${[header, ...rows].map(row => row.map(quote).join(",")).join("\n")}\n`);

await writeFile(FRESHNESS_PATH, `${JSON.stringify({
  ...freshness,
  checked_at: appliedAt,
  source_registry_generated_at: registry.generated_at,
  source_resolution_status: statusCounts,
  paper_status: paperCounts,
  source_resolution_problems: reviewedProblems.length + inspectAsOrigin.length + duplicateResourceProblems.length
}, null, 2)}\n`);

console.log(JSON.stringify(catalog.stats.source_resolution));
