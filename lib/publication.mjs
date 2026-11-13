import { createHash } from 'node:crypto';
import { assessRefresh, assessTimestamp } from './freshness.mjs';

export const MAX_VERIFICATION_AGE_MS = 36 * 60 * 60 * 1000;
export const receiptKey = deployment => `publication/${deployment.deploy_id || 'unavailable'}`;

// Verify public bytes, not just a timestamp that an unrelated build can copy.
export function verifyPublication(deployment, markerText, catalogueText, remoteDeployment, now = Date.now()) {
  const marker = JSON.parse(markerText);
  const catalogue = JSON.parse(catalogueText);
  const digest = text => createHash('sha256').update(text).digest('hex');
  const matched = Boolean(deployment.deploy_id && deployment.commit &&
    deployment.deploy_id === remoteDeployment.deploy_id && deployment.commit === remoteDeployment.commit &&
    deployment.catalogue_sha256 === digest(catalogueText) && deployment.marker_sha256 === digest(markerText) &&
    marker.inspect_source_commit === catalogue.inspect_source_commit &&
    marker.records === catalogue.records?.length && marker.refreshed_at === deployment.refreshed_at);
  return {
    status: matched ? 'verified' : 'mismatch',
    verified_at: matched ? new Date(now).toISOString() : null,
    checked_at: new Date(now).toISOString(),
    deploy_id: deployment.deploy_id,
    commit: deployment.commit,
    catalogue_sha256: deployment.catalogue_sha256,
    marker_sha256: deployment.marker_sha256,
    refreshed_at: marker.refreshed_at || null,
    catalogue_status: assessRefresh(marker, now).status
  };
}

export function assessPublication(marker, deployment, receipt, now = Date.now()) {
  const catalogue = assessRefresh(marker, now);
  const verification = assessTimestamp(receipt?.verified_at, now, MAX_VERIFICATION_AGE_MS);
  const matched = Boolean(deployment.deploy_id && receipt?.status === 'verified' &&
    receipt.deploy_id === deployment.deploy_id && receipt.commit === deployment.commit &&
    receipt.catalogue_sha256 === deployment.catalogue_sha256 && receipt.marker_sha256 === deployment.marker_sha256 &&
    receipt.refreshed_at === marker?.refreshed_at);
  return {
    status: catalogue.status !== 'current' ? catalogue.status : matched && verification.status === 'current' ? 'current' : 'unverified',
    catalogue,
    publication: { status: matched ? verification.status : 'unverified', verified_at: matched ? receipt.verified_at : null, deploy_id: deployment.deploy_id, commit: deployment.commit },
    clocks: { source_observed_at: deployment.source_observed_at || null, generated_at: deployment.generated_at || null, validated_at: marker?.refreshed_at || null, publication_verified_at: matched ? receipt.verified_at : null }
  };
}
