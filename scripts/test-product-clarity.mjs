import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [index, app, controls, enhancements, readme, buildSource, searchEngine, styles, controlsStyles] = await Promise.all([
  readFile("site/index.html", "utf8"),
  readFile("site/app.js", "utf8"),
  readFile("site/ui-controls.js", "utf8"),
  readFile("site/enhancements.js", "utf8"),
  readFile("README.md", "utf8"),
  readFile("scripts/build.mjs", "utf8"),
  readFile("site/search-engine.js", "utf8"),
  readFile("site/styles.css", "utf8"),
  readFile("site/ui-controls.css", "utf8")
]);

assert.ok(!index.includes('data-nav="collection"'), "Collections navigation remains");
assert.ok(!app.includes('class="collection-strip"'), "Homepage collection strip remains");
assert.ok(!app.includes("function renderAgencyTransfer"), "Collection page renderer remains");
assert.match(app, /location\.replace\("#\/evals\?q=harmful%20manipulation"\)/, "Legacy collection URL should redirect to a useful search");
assert.match(app, /Origin pending review/, "Live entries must not attribute authorship to the Inspect host");
assert.doesNotMatch(app, /UK AI Security Institute \/ upstream authors/, "Ambiguous live-entry attribution remains");
assert.doesNotMatch(buildSource, /UK AI Security Institute \/ upstream authors/, "Build seed still conflates host with origin");
assert.doesNotMatch(buildSource, /agencyTransfer|collections:/, "Obsolete collection metadata remains in the build");
assert.doesNotMatch(searchEngine, /record\.collections|intent\.collections|collection match/, "Obsolete collection scoring remains in search");
assert.match(app, /catalogue records/, "Homepage should distinguish records from evaluations");
assert.match(enhancements, /Independent reviews/, "Data page should expose review depth");
assert.match(enhancements, /Catalogue size is not review depth/, "Data page should state the coverage boundary");
assert.match(controls, /not a claim to have solved evaluation discovery/i, "About lacks epistemic humility");
assert.match(controls, /not exhaustive/i, "About must state incomplete coverage");
assert.match(readme, /bounded documentary assessment/i, "README must distinguish review from replication");
assert.doesNotMatch(styles, /\.collection-(?:strip|row|head|overview)/, "Dead collection styles remain");
assert.doesNotMatch(controlsStyles, /data-nav=\"collection\"|\.collection-(?:strip|head|row)/, "Collection-specific control styles remain");

console.log("Validated simplified navigation, humble About copy, conservative attribution, and useful coverage reporting.");
