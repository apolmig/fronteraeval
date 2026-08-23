import { readFile, writeFile } from "node:fs/promises";

const catalogPath = "site/data/catalog.json";
const csvPath = "site/data/catalog.csv";
const freshnessPath = "site/data/freshness.json";
const auditPath = "site/data/attribution-audit.json";

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));

const DOMAIN_PLACEHOLDERS = new Map([
  ["arxiv.org", "Original paper authors"],
  ["doi.org", "Original paper authors"],
  ["github.com", "Reference implementation maintainers"],
  ["raw.githubusercontent.com", "Reference implementation maintainers"],
  ["huggingface.co", "Dataset maintainers"]
]);

function quote(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function statusFor(primary) {
  if (!primary) return "unresolved";
  if (["verified", "curated", "verified-source"].includes(primary.confidence)) return "verified";
  if (primary.confidence === "source-derived") return "source-derived";
  if (["inspect_implementation", "inspect_registry"].includes(primary.role)) return "host-only";
  return "unresolved";
}

const unresolved = [];
const hostOnly = [];
const sourceDerived = [];
const verified = [];
const reviewedProblems = [];
const oldAmbiguousLabels = [];

for (const record of catalog.records) {
  const attribution = record.attribution || {};
  const primary = attribution.primary || null;

  if (primary && DOMAIN_PLACEHOLDERS.has(String(primary.name).toLowerCase())) {
    primary.name = DOMAIN_PLACEHOLDERS.get(String(primary.name).toLowerCase());
    if (primary.role === "paper") {
      primary.role = "original_authors";
      primary.role_label = "Original authors";
    }
  }

  if (primary) {
    record.organisation = primary.name;
    record.organisation_role = primary.role_label;
  }

  if (/upstream authors/i.test(record.organisation || "")) {
    oldAmbiguousLabels.push(record.id);
    record.organisation = primary?.name || "Attribution pending";
    record.organisation_role = primary?.role_label || "Attribution status";
  }

  const status = statusFor(primary);
  attribution.status = status;
  record.attribution_status = status;
  record.attribution = attribution;

  if (record.review_status === "reviewed") {
    if (!record.editorial_reviewed_at) reviewedProblems.push(`${record.id}: missing review date`);
    if (["host-only", "unresolved"].includes(status)) reviewedProblems.push(`${record.id}: ${status} attribution`);
  }

  if (status === "verified") verified.push(record.id);
  else if (status === "source-derived") sourceDerived.push(record.id);
  else if (status === "host-only") hostOnly.push(record.id);
  else unresolved.push(record.id);
}

const statusCounts = {
  verified: verified.length,
  "source-derived": sourceDerived.length,
  "host-only": hostOnly.length,
  unresolved: unresolved.length
};

catalog.stats.attribution = {
  ...(catalog.stats.attribution || {}),
  status: statusCounts,
  reviewed_attribution_problems: reviewedProblems.length,
  old_ambiguous_labels_removed: oldAmbiguousLabels.length
};

const audit = {
  schema_version: "1.0.0",
  generated_at: catalog.generated_at,
  inspect_source_commit: catalog.inspect_source_commit || catalog.inspect_source_sha,
  records: catalog.records.length,
  status: statusCounts,
  reviewed_attribution_problems: reviewedProblems,
  ambiguous_legacy_labels_removed: oldAmbiguousLabels,
  host_only_records: hostOnly,
  unresolved_records: unresolved,
  note: "Host-only means that FronteraEval can verify the Inspect implementation or registry role but has not yet verified the original evaluation developer. It must not be presented as authorship."
};

await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`);

const header = [
  "id", "name", "organisation", "organisation_role", "attribution_status",
  "source_type", "topics", "review_status", "preferred_source_label",
  "preferred_source_url", "paper_url", "reference_implementation",
  "inspect_host", "last_source_check", "editorial_reviewed_at"
];
const rows = catalog.records.map(record => {
  const roles = record.attribution?.roles || [];
  const paper = roles.find(item => item.role === "paper");
  const implementation = roles.find(item => item.role === "reference_implementation");
  const inspect = roles.find(item => ["inspect_implementation", "inspect_registry"].includes(item.role));
  return [
    record.id,
    record.name,
    record.organisation,
    record.organisation_role,
    record.attribution_status,
    record.source_type,
    (record.topics || []).join("|"),
    record.review_status,
    record.preferred_source?.label,
    record.preferred_source?.url,
    paper?.url,
    implementation?.url,
    inspect?.name,
    record.last_source_check,
    record.editorial_reviewed_at
  ];
});
await writeFile(csvPath, [header, ...rows].map(row => row.map(quote).join(",")).join("\n") + "\n");

let freshness = {};
try {
  freshness = JSON.parse(await readFile(freshnessPath, "utf8"));
} catch {
  freshness = {};
}
freshness.attribution = catalog.stats.attribution;
freshness.attribution_audit = "/data/attribution-audit.json";
await writeFile(freshnessPath, `${JSON.stringify(freshness, null, 2)}\n`);

console.log(JSON.stringify({
  attribution_status: statusCounts,
  reviewed_attribution_problems: reviewedProblems.length,
  host_only_records: hostOnly.length,
  unresolved_records: unresolved.length
}));
