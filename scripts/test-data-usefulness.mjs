import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalog = JSON.parse(await readFile("site/data/catalog.json", "utf8"));
const records = catalog.records;

assert.ok(records.length >= 250, `catalogue unexpectedly small: ${records.length}`);
assert.equal(new Set(records.map((record) => record.id)).size, records.length, "stable IDs are not unique");
assert.ok(!("collections" in catalog), "obsolete public collection metadata remains");
assert.ok(records.every((record) => !("collections" in record)), "obsolete collection membership remains on records");
assert.ok(records.every((record) => record.name && record.name.trim().length >= 2), "a record has no usable name");
assert.ok(records.every((record) => record.description && record.description.trim().length >= 20), "a record has no useful description");
assert.ok(records.every((record) => record.record_type), "a record is missing its type");
assert.ok(records.every((record) => record.preferred_source?.url?.startsWith("https://")), "a record is missing a preferred source");
assert.ok(records.every((record) => Array.isArray(record.topics) && record.topics.length > 0), "a record has no topic");
assert.ok(records.every((record) => !/UK AI Security Institute \/ upstream authors|Upstream authors \/ Inspect Evals Register|Research collaboration/i.test(record.organisation || "")), "ambiguous organisation labels remain");
assert.ok(records.every((record) => record.record_type !== "evaluation-support-task"), "unscored support tasks should not be public catalogue records");

const reviewed = records.filter((record) => record.review_status === "reviewed");
assert.ok(reviewed.length >= 15, "review coverage regressed");
for (const record of reviewed) {
  assert.ok(record.measures && !/not independently assessed/i.test(record.measures), `${record.id}: reviewed record lacks a bounded construct statement`);
  assert.ok(record.does_not_measure && !/no inference beyond/i.test(record.does_not_measure), `${record.id}: reviewed record lacks an inference ceiling`);
  assert.ok(record.editorial_reviewed_at, `${record.id}: reviewed record lacks a review date`);
}

const duplicateRegisterNames = Object.entries(records
  .filter((record) => record.source_type === "inspect-register")
  .reduce((groups, record) => {
    const key = record.name.toLowerCase();
    groups[key] ||= [];
    groups[key].push(record.id);
    return groups;
  }, {}))
  .filter(([, ids]) => ids.length > 1);
assert.equal(duplicateRegisterNames.length, 0, `register variants have ambiguous duplicate names: ${JSON.stringify(duplicateRegisterNames)}`);

console.log(`Validated usefulness and evidence boundaries for ${records.length} public catalogue records; ${reviewed.length} independently reviewed.`);
