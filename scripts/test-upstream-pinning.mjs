import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const builder = fileURLToPath(new URL('./build.mjs', import.meta.url));
const pinned = 'a'.repeat(40);
const latest = 'b'.repeat(40);

for (const refresh of [false, true]) test(`${refresh ? 'refresh resolves main once' : 'deploy never resolves main'} and all source downloads use one immutable commit`, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fronteraeval-pinning-'));
  try {
    await mkdir(join(directory, 'refresh'));
    await writeFile(join(directory, 'refresh/last-run.json'), JSON.stringify({ inspect_source_commit: pinned, refreshed_at: '2026-11-01T12:00:00Z' }));
    const mock = join(directory, 'fetch.mjs');
    await writeFile(mock, `
      import { appendFileSync } from 'node:fs';
      globalThis.fetch = async (url) => {
        appendFileSync('requests.jsonl', JSON.stringify(url) + '\\n');
        const sha = ${JSON.stringify(refresh ? latest : pinned)};
        if (url.endsWith('/commits/main')) return Response.json({ sha });
        if (url.endsWith('/' + sha + '/src/inspect_evals/_registry.py')) return new Response('from inspect_evals.example import example\\n');
        if (url.endsWith('/git/trees/' + sha + '?recursive=1')) return Response.json({ sha: 'c'.repeat(40), tree: [], truncated: false });
        throw new Error('Unexpected source: ' + url);
      };
    `);
    const env = { ...process.env, REFRESH_INSPECT: refresh ? '1' : '0' };
    execFileSync(process.execPath, ['--import', mock, builder], { cwd: directory, env, stdio: 'pipe' });
    const requests = (await readFile(join(directory, 'requests.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(requests.filter(url => url.endsWith('/commits/main')).length, refresh ? 1 : 0);
    const catalogue = JSON.parse(await readFile(join(directory, 'site/data/catalog.json'), 'utf8'));
    assert.equal(catalogue.inspect_source_commit, refresh ? latest : pinned);
    assert.equal(catalogue.records.find(record => record.id === 'inspect:example').provenance.source_sha, refresh ? latest : pinned);
    if (!refresh) {
      assert.equal(catalogue.source_observed_at, '2026-11-01T12:00:00Z');
      assert.ok(catalogue.records.every(record => record.last_source_check === '2026-11-01'));
    }
    else assert.ok(Date.parse(catalogue.source_observed_at) > Date.parse('2026-11-01T12:00:00Z'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
