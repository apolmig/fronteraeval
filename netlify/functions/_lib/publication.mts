import { getStore } from '@netlify/blobs';
import deployment from '../../../site/data/deployment.json';
import { verifyPublication, receiptKey } from '../../../lib/publication.mjs';

// Runs on Netlify, independently of GitHub runners. Logs are not an email alert.
export async function verifyProduction() {
  if (deployment.context !== 'production') return { status: 'skipped-nonproduction' };
  const store = getStore('fronteraeval-live', { consistency: 'strong' });
  let receipt;
  try {
    const paths = ['weekly-refresh.json', 'catalog.json', 'deployment.json'];
    const responses = await Promise.all(paths.map(async path => {
      const response = await fetch(`https://fronteraeval.org/data/${path}?verification=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`Public ${path}: HTTP ${response.status}`);
      return response.text();
    }));
    receipt = verifyPublication(deployment, responses[0], responses[1], JSON.parse(responses[2]));
  } catch (error) {
    receipt = { status: 'failed', checked_at: new Date().toISOString(), verified_at: null, error: error instanceof Error ? error.message : String(error) };
  }
  await store.setJSON(receiptKey(deployment), receipt);
  console.log(JSON.stringify({ event: 'fronteraeval_publication_verification', ...receipt }));
  if (receipt.status !== 'verified' || receipt.catalogue_status !== 'current') throw new Error('Production catalogue is stale or unverified; see publication verification log');
  return receipt;
}
