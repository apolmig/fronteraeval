import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import marker from '../../refresh/last-run.json';
import deployment from '../../site/data/deployment.json';
import { assessPublication, receiptKey } from '../../lib/publication.mjs';

export default async () => {
  let receipt: unknown = null;
  try {
    receipt = await getStore('fronteraeval-live', { consistency: 'strong' }).get(receiptKey(deployment), { type: 'json' });
  } catch { /* No stored verification means unverified, never an assumed success. */ }
  const now = Date.now();
  const health = assessPublication(marker, deployment, receipt, now);
  return Response.json({
    schema_version: '1.1.0',
    ...health,
    checked_at: new Date(now).toISOString(),
    scope: 'Validated refresh age and a recent public-byte verification for this deploy. Not a guarantee of coverage or upstream availability.'
  }, {
    status: health.status === 'current' ? 200 : 503,
    headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }
  });
};

export const config: Config = { path: '/api/health' };
