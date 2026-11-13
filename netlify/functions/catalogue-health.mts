import type { Config } from '@netlify/functions';
import marker from '../../refresh/last-run.json';
import { assessRefresh } from '../../lib/freshness.mjs';

export default async () => {
  const now = Date.now();
  const catalogue = assessRefresh(marker, now);
  return Response.json({
    schema_version: '1.0.0',
    status: catalogue.status,
    checked_at: new Date(now).toISOString(),
    catalogue,
    scope: 'Age of the last validated catalogue refresh deployed to this site. Not a guarantee of completeness or upstream availability.'
  }, {
    status: catalogue.status === 'current' ? 200 : 503,
    headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }
  });
};

export const config: Config = { path: '/api/health' };
