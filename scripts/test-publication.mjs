import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyPublication, assessPublication, MAX_VERIFICATION_AGE_MS } from '../lib/publication.mjs';
const now = Date.parse('2026-11-13T18:00:00Z');
const marker = { status: 'completed', refreshed_at: '2026-11-13T12:00:00Z', inspect_source_commit: 'a'.repeat(40), records: 1 };
const catalogue = { inspect_source_commit: marker.inspect_source_commit, records: [{ id: 'one' }] };
const markerText = JSON.stringify(marker);
const catalogueText = JSON.stringify(catalogue);
const hash = text => createHash('sha256').update(text).digest('hex');
const deployment = { deploy_id: 'deploy-one', commit: 'b'.repeat(40), catalogue_sha256: hash(catalogueText), marker_sha256: hash(markerText), refreshed_at: marker.refreshed_at, generated_at: '2026-11-13T11:00:00Z', source_observed_at: '2026-11-13T10:00:00Z' };
const receipt = verifyPublication(deployment, markerText, catalogueText, deployment, now);

test('public-byte verification requires the exact deploy, commit, marker and catalogue', () => {
  assert.equal(receipt.status, 'verified');
  for (const field of ['commit', 'deploy_id']) assert.equal(verifyPublication(deployment, markerText, catalogueText, { ...deployment, [field]: 'other' }, now).status, 'mismatch');
  assert.equal(verifyPublication(deployment, markerText, catalogueText + ' ', deployment, now).status, 'mismatch');
  assert.equal(verifyPublication(deployment, markerText + ' ', catalogueText, deployment, now).status, 'mismatch');
});

test('a new build needs its own receipt; a recent marker alone is unverified', () => {
  assert.equal(assessPublication(marker, deployment, null, now).status, 'unverified');
  assert.equal(assessPublication(marker, { ...deployment, deploy_id: 'new-deploy' }, receipt, now).status, 'unverified');
  assert.equal(assessPublication(marker, deployment, { ...receipt, status: 'failed' }, now).status, 'unverified');
});

test('independent verification expires if its scheduler stops', () => {
  assert.equal(assessPublication(marker, deployment, receipt, now).status, 'current');
  assert.equal(assessPublication(marker, deployment, receipt, now + MAX_VERIFICATION_AGE_MS + 1).status, 'unverified');
  assert.equal(assessPublication(marker, deployment, { ...receipt, verified_at: 'not-a-date' }, now).status, 'unverified');
  assert.equal(assessPublication(marker, deployment, { ...receipt, verified_at: new Date(now + 3600000).toISOString() }, now).status, 'unverified');
});

test('successful publication verification does not renew stale source validation', () => {
  const stale = { ...marker, refreshed_at: '2026-11-01T12:00:00Z' };
  assert.equal(assessPublication(stale, deployment, receipt, now).status, 'stale');
  assert.deepEqual(assessPublication(marker, deployment, receipt, now).clocks, { source_observed_at: deployment.source_observed_at, generated_at: deployment.generated_at, validated_at: marker.refreshed_at, publication_verified_at: receipt.verified_at });
});
