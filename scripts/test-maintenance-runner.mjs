import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const runner = resolve('scripts/run-maintenance.mjs');
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
async function fixture(discovery = false) {
  const root = await mkdtemp(join(tmpdir(), 'fronteraeval-worker-test-'));
  const repo = join(root, 'seed'), remote = join(root, 'remote.git'), state = join(root, 'state');
  await mkdir(repo);
  for (const folder of ['scripts', 'data', 'refresh', 'discovery']) await mkdir(join(repo, folder));
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.name', 'Fixture']); git(repo, ['config', 'user.email', 'fixture@example.invalid']);
  const scripts = Object.fromEntries(['refresh:sources', 'check', 'audit:links', 'build', 'submit:indexnow'].map(name => [name, `node stages.mjs ${name}`]));
  await writeFile(join(repo, 'package.json'), JSON.stringify({ name: 'maintenance-fixture', version: '1.0.0', type: 'module', scripts }));
  await writeFile(join(repo, 'package-lock.json'), JSON.stringify({ name: 'maintenance-fixture', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'maintenance-fixture', version: '1.0.0' } } }));
  await writeFile(join(repo, 'stages.mjs'), `
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const stage=process.argv[2];
fs.appendFileSync(process.env.MAINTENANCE_TRACE,stage+'\\n');
if(stage==='refresh:sources') {
  if(process.env.REFRESH_INSPECT!=='1') throw new Error('Refresh was not explicitly selected');
  fs.writeFileSync('data/source-registry.json',JSON.stringify({source:'new'}));
  fs.writeFileSync('unrelated-generated.txt','must never enter commit');
}
if(stage==='check' && process.env.FAIL_CHECK==='1') process.exit(1);
if(stage==='audit:links') fs.writeFileSync('refresh/source-link-audit.json',JSON.stringify({critical_missing:0}));
if(stage==='build') {
  if(process.env.REFRESH_INSPECT==='1') throw new Error('Deploy build must remain pinned');
  if(!JSON.parse(fs.readFileSync('refresh/last-run.json')).validated) throw new Error('Marker not validated before build');
  if(process.env.CONCURRENT_MAIN==='1') {
    const dir=process.env.CONCURRENT_CHECKOUT;
    execFileSync('git',['clone',process.env.FIXTURE_REMOTE,dir],{stdio:'pipe'});
    fs.writeFileSync(dir+'/human-change.txt','preserve concurrent work');
    execFileSync('git',['add','.'],{cwd:dir});
    execFileSync('git',['-c','user.name=Other','-c','user.email=other@example.invalid','commit','-m','Concurrent update'],{cwd:dir,stdio:'pipe'});
    execFileSync('git',['push','origin','main'],{cwd:dir,stdio:'pipe'});
  }
}
if(stage==='submit:indexnow') {
  if(process.env.INDEXNOW_PENDING==='1') console.log(JSON.stringify({status:'pending-site-verification',submitted:0}));
  else console.log(JSON.stringify({status:200,submitted:1}));
}
`);
  await writeFile(join(repo, 'scripts/write-refresh-marker.mjs'), `import fs from 'node:fs';fs.appendFileSync(process.env.MAINTENANCE_TRACE,'marker\\n');if(!fs.existsSync('refresh/source-link-audit.json'))throw new Error('Audit required');fs.writeFileSync('refresh/last-run.json',JSON.stringify({validated:true}));`);
  await writeFile(join(repo, 'scripts/verify-production.mjs'), `import fs from 'node:fs';import {execFileSync} from 'node:child_process';fs.appendFileSync(process.env.MAINTENANCE_TRACE,'verify\\n');const remote=execFileSync('git',['--git-dir='+process.env.FIXTURE_REMOTE,'rev-parse','main'],{encoding:'utf8'}).trim();if(remote!==process.env.EXPECTED_COMMIT)throw new Error('Wrong publication commit');`);
  await writeFile(join(repo, 'scripts/test-external-discovery.mjs'), `import test from 'node:test';test('fixture discovery contract',()=>{});`);
  await writeFile(join(repo, 'scripts/discover-external-evals.mjs'), `import fs from 'node:fs';fs.appendFileSync(process.env.MAINTENANCE_TRACE,'discover\\n');fs.mkdirSync('discovery',{recursive:true});fs.writeFileSync('discovery/external-candidates.json',JSON.stringify({checked_at:process.env.DISCOVERY_DATE,sources:[],coverage:'partial'}));fs.writeFileSync('discovery/external-candidates.md','fixture queue');`);
  await writeFile(join(repo, 'data/source-registry.json'), '{"source":"old"}');
  await writeFile(join(repo, 'refresh/last-run.json'), JSON.stringify({ validated: discovery }));
  await writeFile(join(repo, 'refresh/source-link-audit.json'), '{}');
  git(repo, ['add', '.']); git(repo, ['commit', '-m', 'Fixture baseline']);
  git(root, ['clone', '--bare', repo, remote]);
  const original = git(repo, ['rev-parse', 'HEAD']);
  const trace = join(root, 'trace.txt');
  const execute = async (extraArgs = [], env = {}) => {
    const result = spawnSync(process.execPath, [runner, '--repository', remote, '--state-dir', state, ...extraArgs], {
      encoding: 'utf8', env: { ...process.env, MAINTENANCE_TRACE: trace, FIXTURE_REMOTE: remote, CONCURRENT_CHECKOUT: join(root, 'concurrent'), npm_config_cache: join(root, 'npm-cache'), ...env }, timeout: 60000
    });
    const entries = await readdir(state);
    const report = JSON.parse(await readFile(join(state, entries[0], 'result.json'), 'utf8'));
    return { ...result, report, trace: (await readFile(trace, 'utf8')).trim().split('\n') };
  };
  return { root, repo, remote, state, original, execute, remoteHead: () => git(root, ['--git-dir=' + remote, 'rev-parse', 'main']) };
}

test('default prepare validates a real isolated Git commit and never pushes', async () => {
  const f = await fixture();
  try {
    const r = await f.execute();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.report.status, 'prepared');
    assert.equal(f.remoteHead(), f.original);
    assert.notEqual(r.report.commit, f.original);
    assert.deepEqual(r.trace, ['refresh:sources', 'check', 'audit:links', 'marker', 'build', 'check']);
    assert.deepEqual(git(r.report.checkout, ['diff-tree', '--no-commit-id', '--name-only', '-r', r.report.commit]).split('\n'), ['data/source-registry.json', 'refresh/last-run.json', 'refresh/source-link-audit.json']);
    assert.ok(await readFile(join(r.report.checkout, 'unrelated-generated.txt')));
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('a failed quality gate never writes a marker or publishes a commit', async () => {
  const f = await fixture();
  try {
    const r = await f.execute(['--publish'], { FAIL_CHECK: '1' });
    assert.equal(r.status, 1);
    assert.equal(r.report.status, 'failed');
    assert.equal(f.remoteHead(), f.original);
    assert.equal(r.report.published_commit, null);
    assert.deepEqual(r.trace, ['refresh:sources', 'check']);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('publish verifies the exact pushed commit before notifying IndexNow', async () => {
  const f = await fixture();
  try {
    const r = await f.execute(['--publish']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.report.status, 'published');
    assert.equal(f.remoteHead(), r.report.commit);
    assert.equal(r.report.published_commit, r.report.commit);
    assert.ok(r.report.publication_verified_at);
    assert.deepEqual(r.trace.slice(-2), ['verify', 'submit:indexnow']);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('a concurrent main update rejects publication without rebasing tested inputs', async () => {
  const f = await fixture();
  try {
    const r = await f.execute(['--publish'], { CONCURRENT_MAIN: '1' });
    assert.equal(r.status, 1);
    assert.equal(r.report.status, 'failed');
    assert.notEqual(f.remoteHead(), f.original);
    assert.notEqual(f.remoteHead(), r.report.commit);
    assert.equal(git(f.root, ['--git-dir=' + f.remote, 'show', 'main:human-change.txt']), 'preserve concurrent work');
    assert.equal(git(f.root, ['--git-dir=' + f.remote, 'show', 'main:data/source-registry.json']), '{"source":"old"}');
    assert.ok(!r.trace.includes('verify'));
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('IndexNow pending is a visible partial outcome even when its script exits zero', async () => {
  const f = await fixture();
  try {
    const r = await f.execute(['--publish'], { INDEXNOW_PENDING: '1' });
    assert.equal(r.status, 2);
    assert.equal(r.report.status, 'published-with-warnings');
    assert.equal(r.report.indexnow, 'failed-or-unverified');
    assert.equal(f.remoteHead(), r.report.commit);
    assert.ok(r.report.publication_verified_at);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

for (const [name, timestamp] of [['invalid', 'not-a-date'], ['old', '2020-01-01T00:00:00Z'], ['future', '2999-01-01T00:00:00Z']]) {
  test(`discovery rejects an ${name} observation timestamp before committing or pushing`, async () => {
    const f = await fixture(true);
    try {
      const r = await f.execute(['--publish', '--job', 'discovery'], { DISCOVERY_DATE: timestamp });
      assert.equal(r.status, 1);
      assert.equal(r.report.status, 'failed');
      assert.match(r.report.error, /fresh observation/);
      assert.equal(f.remoteHead(), f.original);
      assert.equal(r.report.published_commit, null);
      assert.ok(!r.report.steps.some(step => step.stage === 'commit' || step.stage === 'push'));
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
}
