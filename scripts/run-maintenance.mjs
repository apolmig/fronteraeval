#!/usr/bin/env node
// Portable maintenance worker. It uses Git and Netlify Git CD, not GitHub Actions.
import { spawn } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const persistent = {
  refresh: ['data/source-registry.json', 'refresh/last-run.json', 'refresh/source-link-audit.json'],
  discovery: ['discovery/external-candidates.json', 'discovery/external-candidates.md']
};

export async function runMaintenance({ mode = 'prepare', job = 'refresh', repository = 'https://github.com/apolmig/fronteraeval.git', stateDir = join(homedir(), '.local/state/fronteraeval') } = {}) {
  if (!['prepare', 'publish'].includes(mode) || !Object.hasOwn(persistent, job)) throw new Error('Invalid maintenance mode or job');
  // Credentials belong in the SSH agent or Git credential helper, never the URL/log.
  if (repository.includes('://')) {
    const url = new URL(repository);
    if (url.username || url.password || !['https:', 'file:'].includes(url.protocol)) throw new Error('Use HTTPS without embedded credentials, SSH, or a local repository');
  } else if (!repository.startsWith('/') && !/^git@[^\s:]+:[^\s]+$/.test(repository)) throw new Error('Unsupported repository locator');
  stateDir = resolve(stateDir);
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(stateDir, `${job}-`));
  const checkout = join(directory, 'checkout');
  const report = { schema_version: '1.0.0', job, mode, status: 'running', started_at: new Date().toISOString(), directory, checkout, steps: [], published_commit: null };
  const save = () => writeFile(join(directory, 'result.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await save();
  console.log(`Maintenance evidence: ${directory}`);
  const baseEnv = { ...process.env, REFRESH_INSPECT: '0', GIT_TERMINAL_PROMPT: '0', npm_config_update_notifier: 'false' };
  async function command(stage, executable, args, { env = {}, cwd = checkout, allowed = [0], timeout = 20 * 60 * 1000 } = {}) {
    const step = { stage, started_at: new Date().toISOString(), status: 'running' };
    report.steps.push(step); await save();
    console.log(stage);
    const log = join(directory, `${String(report.steps.length).padStart(2, '0')}-${stage}.log`);
    let output = '';
    const code = await new Promise((resolveCode, reject) => {
      const grouped = process.platform !== 'win32';
      const child = spawn(executable, args, { cwd, env: { ...baseEnv, ...env }, detached: grouped, stdio: ['ignore', 'pipe', 'pipe'] });
      let timedOut = false;
      const stop = signal => { try { grouped ? process.kill(-child.pid, signal) : child.kill(signal); } catch {} };
      const timer = setTimeout(() => { timedOut = true; stop('SIGTERM'); }, timeout);
      const forced = setTimeout(() => stop('SIGKILL'), timeout + 5000);
      const chunks = [];
      for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { chunks.push(chunk); });
      child.on('error', error => { clearTimeout(timer); clearTimeout(forced); reject(error); });
      child.on('close', async (exitCode, signal) => {
        clearTimeout(timer); clearTimeout(forced);
        output = Buffer.concat(chunks).toString();
        try {
          await appendFile(log, output, { mode: 0o600 });
          step.exit_code = exitCode; step.signal = signal; step.timed_out = timedOut;
          resolveCode(timedOut ? 124 : exitCode ?? 1);
        } catch (error) { reject(error); }
      });
    });
    step.completed_at = new Date().toISOString(); step.status = allowed.includes(code) ? 'completed' : 'failed';
    await save();
    if (!allowed.includes(code)) throw new Error(`${stage} failed (exit ${code}); see ${log}`);
    return { code, output };
  }
  const git = (stage, args, options) => command(stage, 'git', args, options);
  const npm = (stage, args, options) => command(stage, 'npm', args, options);
  const node = (stage, args, options) => command(stage, process.execPath, args, options);
  let partialDiscovery = false;
  try {
    await git('clone', ['clone', '--single-branch', '--branch', 'main', '--', repository, checkout], { cwd: directory });
    report.base_commit = (await git('base-commit', ['rev-parse', 'HEAD'])).output.trim();
    await npm('install', ['ci', '--no-audit', '--no-fund']);
    if (job === 'refresh') {
      await npm('refresh', ['run', 'refresh:sources'], { env: { REFRESH_INSPECT: '1' } });
      await npm('validate-refresh', ['run', 'check']);
      await npm('audit-links', ['run', 'audit:links', '--', '--fail-critical']);
      await node('write-marker', ['scripts/write-refresh-marker.mjs']);
    } else {
      await npm('build-discovery-baseline', ['run', 'build']);
      await node('test-discovery', ['--test', 'scripts/test-external-discovery.mjs']);
      const scan = await node('discover', ['scripts/discover-external-evals.mjs'], { allowed: [0, 2] });
      partialDiscovery = scan.code !== 0;
      const queue = JSON.parse(await readFile(join(checkout, 'discovery/external-candidates.json'), 'utf8'));
      const checkedAt = Date.parse(queue.checked_at);
      if (!Array.isArray(queue.sources) || !Number.isFinite(checkedAt) || checkedAt < Date.parse(report.started_at) || checkedAt > Date.now()) throw new Error('Discovery did not write a fresh observation');
      report.discovery_coverage = queue.coverage;
      report.discovery_source_errors = queue.sources.filter(source => source.status === 'error').length;
      partialDiscovery ||= report.discovery_source_errors > 0;
    }
    await git('stage-persistent-data', ['add', '--', ...persistent[job]]);
    const staged = (await git('inspect-staged-files', ['diff', '--cached', '--name-only'])).output.trim().split('\n').filter(Boolean);
    if (staged.some(file => !persistent[job].includes(file))) throw new Error('Unexpected file in maintenance commit');
    report.changed_files = staged;
    if (staged.length) {
      await git('commit', ['-c', 'user.name=fronteraeval-maintenance', '-c', 'user.email=fronteraeval-bot@users.noreply.github.com', 'commit', '-m', `chore: validated ${job} maintenance`]);
    }
    report.commit = (await git('tested-commit', ['rev-parse', 'HEAD'])).output.trim();
    // Repeat the ordinary deploy build against the new marker on the final commit.
    await npm('build-pinned', ['run', 'build']);
    await npm('validate-pinned', ['run', 'check']);
    if (mode === 'prepare') {
      report.status = partialDiscovery ? 'prepared-with-source-errors' : 'prepared';
    } else {
      // A normal push rejects concurrent main updates. Never rebase tested inputs.
      if (staged.length) await git('push', ['push', 'origin', 'HEAD:main']);
      report.published_commit = report.commit;
      const attempts = 30;
      let verified = false;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        const result = await node(`verify-production-${attempt}`, ['scripts/verify-production.mjs'], { env: { EXPECTED_COMMIT: report.commit }, allowed: [0, 1], timeout: 30000 });
        if (result.code === 0) { verified = true; break; }
        if (attempt < attempts) await new Promise(resolveWait => setTimeout(resolveWait, 20000));
      }
      if (!verified) throw new Error('The pushed commit was not verified in production; do not report a successful refresh');
      report.publication_verified_at = new Date().toISOString();
      const notification = await npm('indexnow', ['run', 'submit:indexnow'], { allowed: [0, 1], timeout: 5 * 60 * 1000 });
      let accepted = false;
      for (const line of notification.output.split('\n')) {
        try { const result = JSON.parse(line); accepted ||= [200, 202].includes(result.status) && result.submitted > 0; } catch {}
      }
      report.indexnow = notification.code === 0 && accepted ? 'accepted' : 'failed-or-unverified';
      report.status = partialDiscovery || report.indexnow !== 'accepted' ? 'published-with-warnings' : 'published';
    }
  } catch (error) {
    report.status = report.published_commit ? 'publication-unverified' : 'failed';
    report.error = error instanceof Error ? error.message : String(error);
  }
  report.completed_at = new Date().toISOString();
  await save();
  console.log(JSON.stringify({ status: report.status, commit: report.commit || null, directory }));
  return report;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('node scripts/run-maintenance.mjs [--prepare|--publish] [--job refresh|discovery] [--state-dir PATH] [--repository URL]\nDefault: prepare refresh, with no push. Publish is explicit and requires existing Git write credentials.');
  } else {
    if (Number(process.versions.node.split('.')[0]) !== 22) throw new Error('Maintenance requires Node.js 22');
    const options = {};
    for (let index = 0; index < args.length; index++) {
      const arg = args[index];
      if (arg === '--prepare' || arg === '--publish') {
        if (options.mode) throw new Error('Choose one maintenance mode');
        options.mode = arg.slice(2);
      } else if (['--job', '--state-dir', '--repository'].includes(arg)) {
        const value = args[++index]; if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
        options[{ '--job': 'job', '--state-dir': 'stateDir', '--repository': 'repository' }[arg]] = value;
      } else throw new Error(`Unknown option: ${arg}`);
    }
    options.repository ||= process.env.FRONTERAEVAL_REPOSITORY;
    options.stateDir ||= process.env.FRONTERAEVAL_STATE_DIR;
    const report = await runMaintenance(options);
    process.exitCode = ['prepared', 'published'].includes(report.status) ? 0 : report.status.includes('warnings') || report.status === 'prepared-with-source-errors' ? 2 : 1;
  }
}
