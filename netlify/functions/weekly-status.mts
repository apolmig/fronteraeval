import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import marker from '../../refresh/last-run.json';
import { assessSweep } from '../../lib/freshness.mjs';

export default async () => {
  let snapshot: unknown = null;
  try {
    const store = getStore('fronteraeval-live', { consistency: 'strong' });
    snapshot = await store.get('weekly-status', { type: 'json' });
  } catch {
    // An unavailable store must not invent a successful source observation.
  }
  // Public reads never start a crawler. Only the scheduled sweep writes state.
  return Response.json(assessSweep(snapshot, marker), {
    headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }
  });
};

export const config: Config = { path: '/api/weekly-status' };
