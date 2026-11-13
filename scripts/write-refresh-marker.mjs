import { readFile, mkdir, writeFile } from "node:fs/promises";

const CHECK_ONLY = process.argv.includes("--check");
const [catalog, audit, registry, linkAudit] = await Promise.all([
  readFile("site/data/catalog.json", "utf8").then(JSON.parse),
  readFile("site/data/source-audit.json", "utf8").then(JSON.parse),
  readFile("data/source-registry.json", "utf8").then(JSON.parse),
  readFile("refresh/source-link-audit.json", "utf8").then(JSON.parse).catch(() => null)
]);

const enrichment = catalog.stats?.enrichment || {};
const methodologicalReviews = catalog.stats?.methodological_reviews || {};
const reviewStatus = catalog.stats?.review_status || {};
const sourceProblems =
  (audit.reviewed_source_problems?.length || 0) +
  (audit.inspect_as_origin_problems?.length || 0) +
  (audit.duplicate_resource_problems?.length || 0) +
  (audit.unresolved_records?.length || 0);

const marker = {
  schema_version: "2.1.0",
  status: sourceProblems === 0 ? "completed" : "completed-with-source-problems",
  refreshed_at: new Date().toISOString(),
  source_observed_at: catalog.source_observed_at || null,
  generated_at: catalog.generated_at || null,
  inspect_source_commit: catalog.inspect_source_commit,
  records: catalog.stats.records,
  source_groups: registry.stats.source_groups,
  methodological_reviews: {
    reviewed_records: reviewStatus.reviewed || 0,
    needs_reevaluation: methodologicalReviews.needs_reevaluation || 0,
    documentary: methodologicalReviews.documentary || 0,
    independently_replicated: methodologicalReviews.independently_replicated || 0,
    registry_entries: methodologicalReviews.added_by_registry || 0,
    reviewed_at: methodologicalReviews.reviewed_at || null
  },
  source_resolution: {
    verified: audit.status.verified || 0,
    source_derived: audit.status["source-derived"] || 0,
    paper_only: audit.status["paper-only"] || 0,
    host_only: audit.status["host-only"] || 0,
    unresolved: audit.status.unresolved || 0
  },
  papers: {
    present_records: audit.paper_status.present || 0,
    not_found_records: audit.paper_status["not-found"] || 0,
    not_applicable_records: audit.paper_status["not-applicable"] || 0,
    unique_arxiv_papers: registry.stats.arxiv_papers || 0,
    arxiv_metadata_resolved: registry.stats.arxiv_metadata_resolved || 0,
    arxiv_metadata_pending: registry.stats.arxiv_metadata_pending || 0,
    metadata_request_failures: registry.stats.arxiv_metadata_failures || 0
  },
  upstream_enrichment: {
    internal_entries: enrichment.internal_entries_enriched || 0,
    register_entries: enrichment.register_entries_enriched || 0,
    reported_result_entries: enrichment.entries_with_reported_results || 0,
    linked_resources: enrichment.linked_resources || 0
  },
  quality: {
    source_resolution_problems: sourceProblems,
    reviewed_source_problems: audit.reviewed_source_problems?.length || 0,
    inspect_as_origin_problems: audit.inspect_as_origin_problems?.length || 0,
    duplicate_resource_problems: audit.duplicate_resource_problems?.length || 0,
    unresolved_records: audit.unresolved_records?.length || 0
  },
  source_links: {
    audited_at: linkAudit?.generated_at || null,
    unique_urls: linkAudit?.totals?.unique_urls || 0,
    reachable: linkAudit?.totals?.reachable || 0,
    restricted: linkAudit?.totals?.restricted || 0,
    transient: (linkAudit?.totals?.transient || 0) + (linkAudit?.totals?.["network-error"] || 0),
    critical_missing: linkAudit?.totals?.critical_missing || 0,
    reviewed_missing: linkAudit?.totals?.reviewed_missing || 0
  }
};

const errors = [];
if (!marker.inspect_source_commit) errors.push("missing Inspect source commit");
if (registry.inspect_source_commit !== catalog.inspect_source_commit) errors.push("source registry and catalogue refer to different Inspect commits");
if (enrichment.register_parse_failures > 0 || enrichment.internal_metadata_failures > 0) errors.push("upstream enrichment has partial failures");
if (!CHECK_ONLY) {
  const observed = Date.parse(marker.source_observed_at);
  const audited = Date.parse(linkAudit?.generated_at);
  if (!Number.isFinite(observed) || observed > Date.now() || Date.now() - observed > 6 * 60 * 60 * 1000) errors.push("refresh requires a real recent source observation (REFRESH_INSPECT=1)");
  if (!Number.isFinite(audited) || audited < observed || audited > Date.now() || !marker.source_links.unique_urls) errors.push("refresh requires a completed link audit after source observation");
}
if (marker.records < 250) errors.push(`catalogue unexpectedly small: ${marker.records}`);
if (marker.source_groups < 190) errors.push(`source registry unexpectedly small: ${marker.source_groups}`);
if (marker.methodological_reviews.reviewed_records + marker.methodological_reviews.needs_reevaluation < 30) errors.push(`documented review coverage regression: ${marker.methodological_reviews.reviewed_records} current + ${marker.methodological_reviews.needs_reevaluation} requiring reevaluation`);
if (marker.methodological_reviews.documentary < 30) errors.push(`documentary review regression: ${marker.methodological_reviews.documentary}`);
if (marker.methodological_reviews.registry_entries < 30) errors.push(`methodological review registry regression: ${marker.methodological_reviews.registry_entries}`);
if (marker.methodological_reviews.independently_replicated !== 0) errors.push("documentary reviews are being represented as independent replications");
if (marker.papers.arxiv_metadata_pending > Math.max(3, Math.ceil(marker.papers.unique_arxiv_papers * 0.03))) {
  errors.push(`too many unresolved arXiv papers: ${marker.papers.arxiv_metadata_pending}`);
}
if (marker.quality.reviewed_source_problems > 0) errors.push("reviewed records have source-resolution problems");
if (marker.quality.inspect_as_origin_problems > 0) errors.push("Inspect hosting is still used as evaluation origin");
if (marker.quality.duplicate_resource_problems > 0) errors.push("duplicate source resources remain");
if (marker.quality.unresolved_records > 0) errors.push("unresolved catalogue records remain");
if (!CHECK_ONLY && marker.source_links.critical_missing > 0) errors.push("critical source links are confirmed missing");
if (!CHECK_ONLY && marker.source_links.reviewed_missing > 0) errors.push("reviewed source links are confirmed missing");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

if (!CHECK_ONLY) {
  await mkdir("refresh", { recursive: true });
  await writeFile("refresh/last-run.json", `${JSON.stringify(marker, null, 2)}\n`);
}

console.log(JSON.stringify({
  mode: CHECK_ONLY ? "check" : "write",
  status: marker.status,
  records: marker.records,
  source_groups: marker.source_groups,
  documentary_reviews: marker.methodological_reviews.documentary,
  verified: marker.source_resolution.verified,
  paper_only: marker.source_resolution.paper_only,
  host_only: marker.source_resolution.host_only,
  arxiv_pending: marker.papers.arxiv_metadata_pending,
  source_problems: marker.quality.source_resolution_problems,
  source_urls: marker.source_links.unique_urls,
  critical_missing: marker.source_links.critical_missing
}));
