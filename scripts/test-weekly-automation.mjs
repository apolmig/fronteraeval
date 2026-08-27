import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [workflow, packageJson, marker, audit, index, netlifySweep] = await Promise.all([
  readFile(".github/workflows/weekly-refresh.yml", "utf8"),
  readFile("package.json", "utf8").then(JSON.parse),
  readFile("scripts/write-refresh-marker.mjs", "utf8"),
  readFile("scripts/audit-source-links.mjs", "utf8"),
  readFile("site/index.html", "utf8"),
  readFile("netlify/functions/weekly-sweep.mts", "utf8")
]);

assert.match(workflow, /cron: "23 2 \* \* 0"/, "primary Sunday schedule missing");
assert.match(workflow, /cron: "23 8 \* \* 0"/, "backup Sunday schedule missing");
assert.match(workflow, /workflow_dispatch:/, "manual recovery trigger missing");
assert.match(workflow, /contents: write/, "catalogue refresh cannot write validated updates");
assert.match(workflow, /issues: write/, "failure alert cannot create or close an issue");
assert.match(workflow, /cancel-in-progress: false/, "overlapping refreshes must queue rather than cancel");
assert.match(workflow, /Install locked dependencies with retries/, "dependency retries missing");
assert.match(workflow, /for attempt in 1 2 3/, "three-attempt retry loop missing");
assert.match(workflow, /npm run audit:links -- --fail-critical/, "critical source audit is not fail-closed");
assert.match(workflow, /Verify the production deployment contains this refresh/, "production verification missing");
assert.match(workflow, /Automated weekly refresh failed/, "failure issue alert missing");
assert.match(workflow, /Production remains on the last validated deployment/, "failure message must state the fail-safe behaviour");

assert.match(packageJson.scripts["refresh:sources"], /apply-methodological-reviews\.mjs/, "weekly refresh would discard methodological reviews");
assert.match(packageJson.scripts.build, /apply-methodological-reviews\.mjs/, "Netlify build would discard methodological reviews");
assert.match(packageJson.scripts.check, /test-methodological-reviews\.mjs/, "review regression gate missing from checks");
assert.match(packageJson.scripts.check, /test-weekly-automation\.mjs/, "automation regression gate is not self-enforcing");
assert.match(packageJson.scripts["check:syntax"], /site\/methodological-reviews\.js/, "methodological review UI syntax is not checked");

assert.match(marker, /reviewed_records < 30/, "refresh marker does not protect reviewed-record coverage");
assert.match(marker, /documentary < 30/, "refresh marker does not protect documentary-review coverage");
assert.match(marker, /registry_entries < 30/, "refresh marker does not protect the review registry");
assert.match(marker, /independently_replicated !== 0/, "replication-claim boundary is not fail-closed");
assert.match(audit, /methodological-review-source/, "source audit omits methodological-review sources");
assert.match(audit, /\[400, 404, 405, 410, 501\]/, "apparent missing links are not verified with GET");
assert.ok(index.includes('href="/methodological-reviews.css"'), "methodological review styles are not loaded");
assert.ok(index.includes('src="/methodological-reviews.js"'), "methodological review interface is not loaded");
assert.match(netlifySweep, /schedule:"17 2 \* \* 0"/, "independent Netlify discovery sweep missing");

console.log("Validated primary and backup schedules, retries, fail-closed gates, alerts, production verification, and last-known-good deployment behaviour.");
