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
