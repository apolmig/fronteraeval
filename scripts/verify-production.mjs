import { verifyPublication } from '../lib/publication.mjs';
import { readFile } from 'node:fs/promises';

const expected = JSON.parse(await readFile('refresh/last-run.json', 'utf8'));
const expectedCommit = process.env.EXPECTED_COMMIT;
if (!/^[a-f0-9]{40}$/.test(expectedCommit || '')) throw new Error('EXPECTED_COMMIT must identify the tested production commit');
const paths = ['weekly-refresh.json', 'catalog.json', 'deployment.json', '../api/health'];
const responses = await Promise.all(paths.map(async path => {
  const url = path === '../api/health' ? 'https://fronteraeval.org/api/health' : `https://fronteraeval.org/data/${path}`;
  const response = await fetch(`${url}?verify=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}));
const deployment = JSON.parse(responses[2]);
const marker = JSON.parse(responses[0]);
const health = JSON.parse(responses[3]);
const receipt = verifyPublication(deployment, responses[0], responses[1], deployment);
if (deployment.commit !== expectedCommit || marker.refreshed_at !== expected.refreshed_at || marker.inspect_source_commit !== expected.inspect_source_commit || marker.records !== expected.records || receipt.status !== 'verified' || health.status !== 'current' || health.publication?.commit !== expectedCommit) throw new Error('Production does not match the tested commit, catalogue and validated refresh');
console.log(JSON.stringify({ status: 'verified', commit: expectedCommit, deploy_id: deployment.deploy_id, refreshed_at: marker.refreshed_at, records: marker.records }));
