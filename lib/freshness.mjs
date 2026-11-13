// Source observation and validated catalogue publication are separate clocks.
export const MAX_REFRESH_AGE_MS = 8 * 24 * 60 * 60 * 1000;

export function assessTimestamp(value, now = Date.now(), maxAge = MAX_REFRESH_AGE_MS) {
  const timestamp = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(now) || !Number.isFinite(maxAge) || maxAge <= 0) {
    throw new TypeError('Invalid freshness clock or age limit');
  }
  if (!Number.isFinite(timestamp)) return { status: 'unknown', age_days: null, timestamp: null };
  const age = now - timestamp;
  if (age < 0) return { status: 'invalid-future', age_days: null, timestamp: value };
  return {
    status: age > maxAge ? 'stale' : 'current',
    age_days: Math.round(Math.max(0, age) / 86400000 * 100) / 100,
    timestamp: value
  };
}

export function assessRefresh(marker, now = Date.now()) {
  const age = assessTimestamp(marker?.refreshed_at, now);
  return {
    ...age,
    status: marker?.status === 'completed' ? age.status : 'unknown',
    records: Number.isInteger(marker?.records) ? marker.records : null,
    source_commit: marker?.inspect_source_commit || null,
    max_age_days: MAX_REFRESH_AGE_MS / 86400000
  };
}

export function assessSweep(snapshot, marker, now = Date.now()) {
  const publication = assessRefresh(marker, now);
  const observation = assessTimestamp(snapshot?.checked_at, now);
  const badLinks = Array.isArray(snapshot?.source_checks) && snapshot.source_checks.some(check => check.ok === false);
  const priorState = snapshot?.status;
  let status = 'build-snapshot';
  if (publication.status === 'stale' || observation.status === 'stale') status = 'stale';
  else if (priorState === 'failed' || priorState === 'degraded') status = 'degraded';
  else if (publication.status === 'current' && observation.status === 'current' && priorState === 'current') status = badLinks ? 'degraded' : 'current';
  else if (publication.status !== 'current') status = 'unverified';
  return {
    ...(snapshot && typeof snapshot === 'object' ? snapshot : {}),
    status,
    checked_at: snapshot?.checked_at || null,
    freshness: { evaluated_at: new Date(now).toISOString(), catalogue: publication, source_observation: observation }
  };
}
