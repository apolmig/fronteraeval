// Read-only HTTP audit. Pass a preview origin to check its pages with production canonicals.
import { writeFile } from 'node:fs/promises';
const origin = new URL(process.argv[2] || 'https://fronteraeval.org').origin;
const canonicalOrigin = 'https://fronteraeval.org';
const failures = [];
const request = async (path) => {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${response.status} ${path}`);
  return response;
};
const catalog = await (await request('/data/catalog.json')).json();
const sitemap = await (await request('/sitemap.xml')).text();
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const expected = catalog.records.map((record) => `${canonicalOrigin}/evaluations/${String(record.slug || record.id || record.name).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'evaluation'}/`);
for (const url of [...expected, `${canonicalOrigin}/brief/`]) if (!urls.includes(url)) failures.push({ url, problem: 'missing from sitemap' });
if (new Set(urls).size !== urls.length) failures.push({ problem: 'duplicate sitemap URLs' });
if (urls.some((url) => !url.startsWith(`${canonicalOrigin}/`) || url.includes('#'))) failures.push({ problem: 'noncanonical sitemap URL' });
const pending = [...new Set([...urls, `${canonicalOrigin}/brief/`])];
let checked = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (pending.length) {
    const url = pending.shift();
    try {
      const response = await request(new URL(url).pathname);
      const html = await response.text();
      const canonical = [...html.matchAll(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/g)].map((match) => match[1]);
      if (canonical.length !== 1 || canonical[0] !== url) failures.push({ url, problem: 'canonical mismatch', canonical });
      for (const metadata of ['property="og:image"', 'name="twitter:card"']) if (!html.includes(metadata)) failures.push({ url, problem: `missing ${metadata}` });
      if (origin.includes('deploy-preview-') && !/noindex/i.test(response.headers.get('x-robots-tag') || '')) failures.push({ url, problem: 'preview has no noindex response header' });
      checked++;
    } catch (error) { failures.push({ url, problem: error.message }); }
  }
}));
const png = Buffer.from(await (await request('/social-card.png')).arrayBuffer());
const image = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
if (png.toString('ascii', 1, 4) !== 'PNG' || image.width !== 1200 || image.height !== 630) failures.push({ problem: 'invalid social card', image });
const report = { audited_at: new Date().toISOString(), origin, records: catalog.records.length, catalog_generated_at: catalog.generated_at, sitemap_urls: urls.length, checked_pages: checked, social_image: image, failures };
if (process.argv[3]) await writeFile(process.argv[3], `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
