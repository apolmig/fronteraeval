import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const generator = resolve('scripts/generate-discovery.mjs');
test('discovery outputs do not turn source observations into content updates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fronteraeval-discovery-'));
  try {
    await mkdir(join(dir, 'site/data'), { recursive: true });
    const catalog = {
      generated_at: '2026-10-01T10:00:00Z', topics: {},
      records: [
        { id: 'review:one', name: 'Reviewed record', review_status: 'reviewed', methodological_review: { reviewed_at: '2026-08-27' }, last_source_check: '2026-10-01' },
        { id: 'import:two', name: 'Imported record', last_source_check: '2026-10-01' }
      ]
    };
    const generate = async () => {
      await writeFile(join(dir, 'site/data/catalog.json'), JSON.stringify(catalog));
      execFileSync(process.execPath, [generator], { cwd: dir, stdio: 'pipe' });
      return Promise.all(['sitemap.xml', 'feed.xml', 'evaluations/review-one/index.html', 'evaluations/import-two/index.html'].map((path) => readFile(join(dir, 'site', path), 'utf8')));
    };
    const before = await generate();
    catalog.generated_at = '2026-11-13T10:00:00Z';
    for (const record of catalog.records) record.last_source_check = '2026-11-13';
    const after = await generate();
    assert.deepEqual(after, before, 'an observation-only rebuild must not advertise modified content');
    assert.ok(!after[0].includes('<lastmod>'), 'omit lastmod until actual page revisions are tracked');
    assert.ok(after[1].includes('<updated>2026-08-27T00:00:00Z</updated>'));
    assert.ok(!after[1].includes('import-two'), 'undated imported record is not a dated editorial update');
    catalog.records.pop();
    await writeFile(join(dir, 'site/data/catalog.json'), JSON.stringify(catalog));
    execFileSync(process.execPath, [generator], { cwd: dir, stdio: 'pipe' });
    await assert.rejects(readFile(join(dir, 'site/evaluations/import-two/index.html')), { code: 'ENOENT' });
    catalog.records.push({ id: 'review-one', name: 'Colliding record' });
    await assert.rejects(generate(), /Duplicate evaluation slug/);
    assert.equal(await readFile(join(dir, 'site/evaluations/review-one/index.html'), 'utf8'), before[2], 'a collision fails before removing valid pages');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
