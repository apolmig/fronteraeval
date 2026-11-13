import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";

await mkdir("site/data", { recursive: true });

async function publish(source, destination, fallback) {
  try {
    const content = await readFile(source, "utf8");
    JSON.parse(content);
    await writeFile(destination, content.endsWith("\n") ? content : `${content}\n`);
  } catch {
    await writeFile(destination, `${JSON.stringify(fallback, null, 2)}\n`);
  }
}

await publish("refresh/last-run.json", "site/data/weekly-refresh.json", {
  schema_version: "2.0.0",
  status: "not-yet-run",
  refreshed_at: null
});

await publish("refresh/source-link-audit.json", "site/data/source-link-audit.json", {
  schema_version: "1.0.0",
  status: "not-yet-run",
  generated_at: null,
  totals: { unique_urls: 0, critical_missing: 0, reviewed_missing: 0 },
  results: []
});

console.log("Published refresh metadata to site/data.");

const catalogText = await readFile("site/data/catalog.json", "utf8");
const catalogue = JSON.parse(catalogText);
const markerText = await readFile("site/data/weekly-refresh.json", "utf8");
const marker = JSON.parse(markerText);
let commit = process.env.COMMIT_REF || null;
if (!commit) {
  try { commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch {}
}
await writeFile("site/data/deployment.json", JSON.stringify({
  schema_version: "1.0.0",
  commit,
  deploy_id: process.env.DEPLOY_ID || null,
  context: process.env.CONTEXT || "local",
  generated_at: catalogue.generated_at,
  source_observed_at: catalogue.source_observed_at || null,
  inspect_source_commit: catalogue.inspect_source_commit,
  records: catalogue.records.length,
  refreshed_at: marker.refreshed_at || null,
  catalogue_sha256: createHash("sha256").update(catalogText).digest("hex"),
  marker_sha256: createHash("sha256").update(markerText).digest("hex")
}, null, 2) + "\n");
