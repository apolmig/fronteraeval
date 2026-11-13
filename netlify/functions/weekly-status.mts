import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import marker from '../../refresh/last-run.json';
import deployment from '../../site/data/deployment.json';
import { assessSweep } from '../../lib/freshness.mjs';
import { assessPublication, receiptKey } from '../../lib/publication.mjs';

export default async () => {
  let snapshot: unknown = null;
  let receipt: unknown = null;
  try {
    const store = getStore('fronteraeval-live', { consistency: 'strong' });
    [snapshot, receipt] = await Promise.all([
      store.get('weekly-status', { type: 'json' }).catch(() => null),
      store.get(receiptKey(deployment), { type: 'json' }).catch(() => null)
    ]);
  } catch {
    // An unavailable store must not invent a successful source observation.
  }
  // Public reads never start a crawler. Only the scheduled sweep writes state.
  const now = Date.now();
  return Response.json({
    ...assessSweep(snapshot, marker, now),
    publication_health: assessPublication(marker, deployment, receipt, now)
  }, {
    headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }
  });
};

export const config: Config = { path: '/api/weekly-status' };
