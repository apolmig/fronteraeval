import test from 'node:test';
import assert from 'node:assert/strict';
import { assessTimestamp, assessRefresh, assessSweep, MAX_REFRESH_AGE_MS } from '../lib/freshness.mjs';
const now = Date.parse('2026-11-13T18:00:00Z');
const iso = offset => new Date(now + offset).toISOString();
const recent = { status: 'completed', refreshed_at: iso(-86400000), records: 330 };

test('a persisted current state expires without a new write', () => {
  const result = assessSweep({ status: 'current', checked_at: iso(-10 * 86400000) }, recent, now);
  assert.equal(result.status, 'stale');
});
test('a fresh sweep cannot hide a stale validated catalogue', () => {
  const result = assessSweep({ status: 'current', checked_at: iso(-1000) }, { ...recent, refreshed_at: iso(-12 * 86400000) }, now);
  assert.equal(result.status, 'stale');
  assert.equal(result.freshness.catalogue.status, 'stale');
});
test('missing, invalid and future timestamps cannot become current', () => {
  for (const value of [null, undefined, '', 'not-a-date', 1]) assert.equal(assessTimestamp(value, now).status, 'unknown');
  assert.equal(assessTimestamp(iso(3600000), now).status, 'invalid-future');
  assert.notEqual(assessSweep(null, recent, now).status, 'current');
  assert.equal(assessRefresh({ ...recent, status: 'failed' }, now).status, 'unknown');
});
test('age boundary and fresh successful state', () => {
  assert.equal(assessTimestamp(iso(-MAX_REFRESH_AGE_MS), now).status, 'current');
  assert.equal(assessTimestamp(iso(-MAX_REFRESH_AGE_MS - 1), now).status, 'stale');
  assert.equal(assessSweep({ status: 'current', checked_at: iso(-1000), source_checks: [] }, recent, now).status, 'current');
});
test('source failures are visible without changing publication provenance', () => {
  const result = assessSweep({ status: 'current', checked_at: iso(-1000), source_checks: [{ ok: false }] }, recent, now);
  assert.equal(result.status, 'degraded');
  assert.equal(result.freshness.catalogue.records, 330);
});
