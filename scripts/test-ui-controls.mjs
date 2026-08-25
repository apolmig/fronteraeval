import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [index, controls, theme, styles, polish] = await Promise.all([
  readFile("site/index.html", "utf8"),
  readFile("site/ui-controls.js", "utf8"),
  readFile("site/theme-init.js", "utf8"),
  readFile("site/ui-controls.css", "utf8"),
  readFile("site/ui-polish.css", "utf8")
]);

assert.ok(index.includes('id="command-search-trigger"'), "Ctrl K search trigger missing");
assert.ok(index.includes('aria-keyshortcuts="Control+K Meta+K"'), "keyboard shortcut metadata missing");
assert.ok(index.includes('id="theme-toggle"'), "theme toggle missing");
assert.ok(index.includes('data-nav="about"'), "About navigation missing");
assert.ok(index.includes('src="/theme-init.js"'), "early theme initializer missing");
assert.ok(index.includes('src="/ui-controls.js"'), "UI controls script missing");
assert.ok(index.includes('href="/ui-controls.css"'), "UI controls stylesheet missing");
assert.ok(index.includes('href="/ui-polish.css"'), "responsive UI polish stylesheet missing");
assert.ok(index.indexOf('src="/theme-init.js"') < index.indexOf('href="/styles.css"'), "theme must initialize before styles load");

assert.match(controls, /FronteraSearch/, "command palette must use the semantic search engine");
assert.match(controls, /event\.ctrlKey \|\| event\.metaKey/, "Ctrl/Cmd K shortcut handler missing");
assert.match(controls, /#\/about/, "About route missing from command palette");
assert.match(controls, /Cambridge ERA research fellowship/, "fellowship origin text missing");
assert.match(controls, /https:\/\/miguelguerrero\.eu/, "personal-site attribution link missing");
assert.match(controls, /Related results are not necessarily equivalent measures/, "semantic-search inference warning missing");
assert.match(theme, /fronteraeval-theme/, "persistent theme key missing");
assert.match(theme, /prefers-color-scheme: dark/, "system theme fallback missing");
assert.match(styles, /:root\[data-theme="dark"\]/, "dark theme token overrides missing");
assert.match(styles, /\.command-palette/, "command palette styles missing");
assert.match(styles, /\.about-page/, "About page styles missing");
assert.match(polish, /\.site-header nav\{display:none!important\}/, "mobile header must hide overflowing navigation");
assert.match(polish, /\.header-search-label\{display:inline\}/, "mobile search trigger must remain understandable");
assert.match(polish, /::-webkit-search-cancel-button/, "native palette clear icon should be suppressed");

console.log("Validated Ctrl K semantic search, light/dark themes, About, and responsive header controls.");
