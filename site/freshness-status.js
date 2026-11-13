(() => {
  'use strict';
  const DAY = 86400000;
  const timestamp = value => typeof value === 'string' ? Date.parse(value) : NaN;
  function date(value) {
    const time = timestamp(value);
    return Number.isFinite(time) ? new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC'
    }).format(time) + ' UTC' : 'Not recorded';
  }
  function summarize(catalogue, observation, now = Date.now()) {
    const health = observation?.publication_health;
    const clocks = health?.clocks || {};
    const source = catalogue?.source_observed_at;
    const fallback = { status: 'unknown', current: false, label: `Source snapshot ${date(source)}` };
    if (!health?.catalogue?.source_commit || !clocks.generated_at) return fallback;
    if (health.catalogue.source_commit !== catalogue?.inspect_source_commit ||
        health.catalogue.records !== catalogue?.records?.length || clocks.generated_at !== catalogue?.generated_at) {
      return { status: 'new-version', current: false, label: 'A newer catalogue is available. Reload to update.' };
    }
    const validated = timestamp(clocks.validated_at);
    const published = timestamp(clocks.publication_verified_at);
    if (!Number.isFinite(validated) || validated > now) {
      return { status: 'unverified', current: false, label: 'Catalogue validation unavailable' };
    }
    if (now - validated > 8 * DAY || health.status === 'stale') {
      return { status: 'stale', current: false, label: `Catalogue needs an update. Last validated ${date(clocks.validated_at)}` };
    }
    if (health.status !== 'current' || !Number.isFinite(published) || published > now || now - published > 1.5 * DAY) {
      return { status: 'unverified', current: false, label: 'Publication verification pending' };
    }
    return { status: 'current', current: true, label: `Catalogue validated ${date(clocks.validated_at)}` };
  }
  globalThis.FronteraFreshness = { date, summarize };
})();
