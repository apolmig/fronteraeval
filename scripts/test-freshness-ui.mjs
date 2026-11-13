import test from 'node:test';
import assert from 'node:assert/strict';
await import('../site/freshness-status.js');
const { summarize, date } = globalThis.FronteraFreshness;
const now = Date.parse('2026-11-13T20:00:00Z');
const catalogue = { inspect_source_commit: 'source-a', generated_at: '2026-11-13T19:00:00Z', source_observed_at: '2026-11-13T18:00:00Z', records: [{}] };
const health = {
  status: 'current', catalogue: { source_commit: 'source-a', records: 1 },
  clocks: { generated_at: catalogue.generated_at, validated_at: '2026-11-13T18:30:00Z', publication_verified_at: '2026-11-13T19:30:00Z' }
};
const observed = h => ({ status: 'current', checked_at: '2026-11-08T02:17:00Z', publication_health: h });
test('old source sweep cannot replace the newer validated catalogue date', () => {
  const result = summarize(catalogue, observed(health), now);
  assert.equal(result.current, true);
  assert.match(result.label, /13 Nov 2026, 18:30 UTC/);
  assert.doesNotMatch(result.label, /8 Nov/);
});
test('unverified, unavailable and malformed states never turn the indicator green', () => {
  for (const h of [null, {}, { ...health, status: 'unverified' }, { ...health, clocks: { ...health.clocks, validated_at: 'invalid' } },
    { ...health, clocks: { ...health.clocks, publication_verified_at: '2026-11-14T00:00:00Z' } }]) {
    assert.equal(summarize(catalogue, observed(h), now).current, false);
  }
  assert.equal(date('bad-date'), 'Not recorded');
  assert.equal(summarize(catalogue, null, now).label, 'Source snapshot 13 Nov 2026, 18:00 UTC');
});
test('a browser left open ages validation and receipts without waiting for a new response', () => {
  assert.equal(summarize(catalogue, observed(health), now + 37 * 3600000).status, 'unverified');
  assert.equal(summarize(catalogue, observed(health), now + 9 * 86400000).status, 'stale');
  const stale = { ...health, clocks: { ...health.clocks, validated_at: '2026-11-01T18:30:00Z' } };
  assert.equal(summarize(catalogue, observed(stale), now).status, 'stale');
});
test('a newer deployment does not certify the old catalogue loaded by a tab', () => {
  for (const changed of [
    { ...catalogue, inspect_source_commit: 'source-b' },
    { ...catalogue, generated_at: '2026-11-13T17:00:00Z' },
    { ...catalogue, records: [{}, {}] }
  ]) assert.equal(summarize(changed, observed(health), now).status, 'new-version');
});
