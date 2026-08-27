import { mkdir, readFile, writeFile } from "node:fs/promises";

const DRY_RUN = process.argv.includes("--dry-run");
const FAIL_CRITICAL = process.argv.includes("--fail-critical");
const limitArg = process.argv.find((argument) => argument.startsWith("--limit="));
const LIMIT = limitArg ? Math.max(1, Number(limitArg.split("=")[1]) || 1) : Infinity;
const OUTPUT_PATH = "refresh/source-link-audit.json";
const USER_AGENT = "FronteraEval/0.8 (+https://fronteraeval.org; source-health-audit)";
const TIMEOUT_MS = 12000;
const CONCURRENCY = Math.max(1, Math.min(12, Number(process.env.SOURCE_AUDIT_CONCURRENCY || 8)));

const catalog = JSON.parse(await readFile("site/data/catalog.json", "utf8"));

function safeURL(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function normaliseURL(value) {
  const url = safeURL(value);
  if (!url) return null;
  return url.replace(/\/$/, "");
}

function addCandidate(map, record, role, value, critical = false) {
  const url = normaliseURL(value);
  if (!url) return;
  if (!map.has(url)) map.set(url, { url, roles: new Set(), records: new Set(), critical: false });
  const candidate = map.get(url);
  candidate.roles.add(role);
  candidate.records.add(record.id);
  candidate.critical ||= critical;
}

const candidates = new Map();
for (const record of catalog.records) {
  const highValueRecord = record.review_status === "reviewed" || record.source_type === "canonical-source";
  addCandidate(candidates, record, "preferred-source", record.preferred_source?.url || record.source_url, highValueRecord);
  addCandidate(candidates, record, "paper", record.paper?.url || record.paper_url, highValueRecord && record.paper_status === "present");
  addCandidate(candidates, record, "reference-implementation", record.reference_implementation?.url || record.code_url, highValueRecord);
  addCandidate(candidates, record, "metadata", record.metadata_url, false);
  addCandidate(candidates, record, "registry", record.registry_url, false);
  for (const link of record.links || []) {
    const role = String(link.kind || "source");
    const critical = highValueRecord && ["paper", "evaluation_developer", "implementation", "code", "official"].includes(role);
    addCandidate(candidates, record, role, link.url, critical);
  }
}

const queue = [...candidates.values()]
  .sort((left, right) => Number(right.critical) - Number(left.critical) || left.url.localeCompare(right.url))
  .slice(0, LIMIT)
  .map((candidate) => ({
    url: candidate.url,
    roles: [...candidate.roles].sort(),
    records: [...candidate.records].sort(),
    critical: candidate.critical
  }));

function classifyStatus(status) {
  if (status >= 200 && status < 400) return "reachable";
  if ([401, 403, 429].includes(status)) return "restricted";
  if ([404, 410].includes(status)) return "missing";
  if ([408, 425].includes(status) || status >= 500) return "transient";
  return "unexpected";
}

async function request(url, method) {
  return fetch(url, {
    method,
    redirect: "follow",
    headers: {
      "user-agent": USER_AGENT,
      accept: method === "GET" ? "text/html,application/json,text/plain;q=0.8,*/*;q=0.5" : "*/*",
      ...(method === "GET" ? { range: "bytes=0-2047" } : {})
    },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
}

async function inspect(candidate) {
  const started = Date.now();
  let method = "HEAD";
  let response;
  let error = null;

  try {
    response = await request(candidate.url, method);
    if ([400, 405, 501].includes(response.status)) {
      method = "GET";
      response = await request(candidate.url, method);
    }
  } catch (firstError) {
    error = firstError instanceof Error ? firstError.message : String(firstError);
    try {
      method = "GET";
      response = await request(candidate.url, method);
      error = null;
    } catch (secondError) {
      error = secondError instanceof Error ? secondError.message : String(secondError);
    }
  }

  if (!response) {
    return { ...candidate, status: null, category: "network-error", method, elapsed_ms: Date.now() - started, error };
  }

  return {
    ...candidate,
    status: response.status,
    category: classifyStatus(response.status),
    method,
    final_url: response.url || candidate.url,
    elapsed_ms: Date.now() - started,
    error: null
  };
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

if (DRY_RUN) {
  console.log(JSON.stringify({ mode: "dry-run", records: catalog.records.length, unique_urls: queue.length, critical_urls: queue.filter((item) => item.critical).length }));
  process.exit(0);
}

const results = await mapLimit(queue, CONCURRENCY, inspect);
const counts = results.reduce((summary, result) => {
  summary[result.category] = (summary[result.category] || 0) + 1;
  return summary;
}, {});
const criticalFailures = results.filter((result) => result.critical && result.category === "missing");
const reviewedFailures = results.filter((result) => result.category === "missing" && result.records.some((id) => catalog.records.find((record) => record.id === id)?.review_status === "reviewed"));

const report = {
  schema_version: "1.0.0",
  generated_at: new Date().toISOString(),
  inspect_source_commit: catalog.inspect_source_commit || catalog.inspect_source_sha || null,
  policy: "Confirmed 404/410 responses are treated as missing. Access restrictions, rate limits, timeouts and server errors are reported separately and do not by themselves establish that a source is broken.",
  totals: {
    catalogue_records: catalog.records.length,
    unique_urls: results.length,
    critical_urls: results.filter((result) => result.critical).length,
    ...counts,
    critical_missing: criticalFailures.length,
    reviewed_missing: reviewedFailures.length
  },
  critical_failures: criticalFailures,
  reviewed_failures: reviewedFailures,
  results
};

await mkdir("refresh", { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.totals));

if (FAIL_CRITICAL && criticalFailures.length) process.exit(1);
