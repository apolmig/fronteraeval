import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

await import("../site/search-engine.js");

const catalog = JSON.parse(await readFile("site/data/catalog.json", "utf8"));
const engine = globalThis.FronteraSearch;
assert.ok(engine?.search, "search engine was not initialised");

const topicLabels = Object.fromEntries(
  Object.entries(catalog.topics).map(([id, topic]) => [id, topic.label])
);

const cases = [
  {
    query: "harmful manipulation",
    intent: "Harmful manipulation and influence",
    expected: ["inspect:ape_eval", "inspect:makemesay", "inspect:make_me_pay"],
    top: 12
  },
  {
    query: "autonomous R&D",
    intent: "Autonomous AI R&D",
    expected: ["canonical:re-bench", "canonical:metr-time-horizons"],
    top: 12
  },
  {
    query: "jailbreak robustness",
    intent: "Jailbreak and safeguard robustness",
    expected: ["canonical:jailbreakbench", "canonical:harmbench"],
    top: 12
  },
  {
    query: "scheming",
    intent: "Scheming and strategic deception",
    expected: ["inspect:agentic_misalignment", "register:deceptionbench"],
    top: 15
  },
  {
    query: "persusasion",
    expected: ["inspect:ape_eval", "inspect:makemesay"],
    top: 20
  }
];

for (const testCase of cases) {
  const result = engine.search(catalog.records, testCase.query, { topicLabels });
  const ids = result.results.slice(0, testCase.top).map((entry) => entry.record.id);
  assert.ok(result.results.length > 0, `${testCase.query}: expected non-empty results`);
  assert.ok(
    testCase.expected.some((id) => ids.includes(id)),
    `${testCase.query}: expected one of ${testCase.expected.join(", ")} in top ${testCase.top}; got ${ids.join(", ")}`
  );
  if (testCase.intent) {
    assert.ok(
      result.interpretation?.labels.includes(testCase.intent),
      `${testCase.query}: missing intent ${testCase.intent}`
    );
  }
  console.log(`\n${testCase.query}`);
  for (const entry of result.results.slice(0, 5)) {
    console.log(`  ${entry.score.toFixed(2)}  ${entry.record.id}  ${entry.record.name}`);
  }
}

const filtered = engine.search(catalog.records, "harmful manipulation", {
  topicLabels,
  filters: { status: "reviewed" }
});
assert.ok(filtered.results.length > 0, "review-state filtering removed all semantic results");
assert.ok(filtered.results.every((entry) => entry.record.review_status === "reviewed"));

console.log(`\nValidated hybrid semantic search across ${catalog.records.length} records.`);
