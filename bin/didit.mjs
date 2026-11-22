#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { lstat, readlink, readFile, rename, rm, writeFile, mkdir, open, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { configFile, initProject, junit, loadProject, selection } from './project.mjs';

const usage = [
  'Usage: didit run [--check NAME] -- <executable> [args...]',
  '       didit record <circleci|deploy|smoke> <passed|failed> --ref REFERENCE',
  '       didit init',
  '       didit check [--profile NAME | --only NAME[,NAME...]] [--dry-run] [--fail-fast]',
  '       didit report [--format markdown|json|junit] [--require NAME[,NAME...] | --profile NAME]',
  '       didit --version',
].join('\n');

function git(cwd, args, optional = false) {
  const r = spawnSync('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status === 0) return r.stdout;
  if (optional && r.status === 1) return null;
  throw new Error(r.stderr.toString().trim() || 'Git command failed');
}

const digest = () => createHash('sha256');

async function snapshot(root) {
  const head = git(root, ['rev-parse', '--verify', '-q', 'HEAD'], true)?.toString().trim() ?? null;
  const index = git(root, ['ls-files', '--stage', '-z']);
  if (/(^|\0)160000 /.test(index.toString())) {
    throw new Error('Git submodules are not supported by didit snapshots');
  }

  const listing = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  const paths = [...new Set(listing.toString('utf8').split('\0').filter(Boolean))].sort();
  if (!listing.equals(Buffer.from(listing.toString('utf8')))) {
    throw new Error('Snapshot contains non-UTF-8 filenames');
  }

  const hash = digest();
  hash.update(JSON.stringify([head, digest().update(index).digest('hex')]));
  for (const path of paths) {
    const full = join(root, path);
    const stat = await lstat(full).catch(error => {
      if (['ENOENT', 'ENOTDIR'].includes(error.code)) return null;
      throw error;
    });
    let entry;
    if (!stat) entry = ['missing'];
    else if (stat.isSymbolicLink()) {
      entry = ['link', digest().update(await readlink(full, { encoding: 'buffer' })).digest('hex')];
    } else if (stat.isFile()) {
      const file = digest();
      for await (const chunk of createReadStream(full)) file.update(chunk);
      entry = ['file', stat.mode & 0o111, file.digest('hex')];
    } else if (stat.isDirectory()) throw new Error('Nested Git repositories or directory replacements are not supported');
    else throw new Error('Snapshot contains an unsupported file type');
    hash.update(JSON.stringify([path, entry]));
  }
  return hash.digest('hex');
}

const builtins = new Map([
  ['local', 'Local command'],
  ['circleci', 'CircleCI'],
  ['deploy', 'Production deployment'],
  ['smoke', 'Live smoke test'],
]);
const external = new Set(['circleci', 'deploy', 'smoke']);
const namePattern = /^[a-z][a-z0-9-]{0,39}$/;
const refPattern = /^(?:[A-Za-z0-9][A-Za-z0-9._:-]{0,159}|https:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?(?:\/[A-Za-z0-9._~%/:-]*)?)$/;
const shaPattern = /^[0-9a-f]{64}$/;

function name(value) {
  if (typeof value !== 'string' || !namePattern.test(value)) throw new Error('Invalid check name');
  return value;
}

function options(args, allowed, booleans = []) {
  const parsed = Object.create(null);
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!allowed.includes(flag) || flag in parsed) throw new Error('Invalid or repeated option: ' + flag);
    if (booleans.includes(flag)) parsed[flag] = true;
    else {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error('Missing value for ' + flag);
      parsed[flag] = value;
    }
  }
  return parsed;
}

function parse(args) {
  const [action, ...tail] = args;
  if (action === 'run') {
    const separator = tail.indexOf('--');
    if (separator < 0 || !tail[separator + 1]) throw new Error('Expected -- <executable> [args...]');
    const opts = options(tail.slice(0, separator), ['--check']);
    const check = name(opts['--check'] ?? 'local');
    if (external.has(check)) throw new Error('Use record for external checks');
    return { action, check, command: tail.slice(separator + 1) };
  }
  if (action === 'record') {
    const [id, status, ...flags] = tail;
    const check = name(id);
    const ref = options(flags, ['--ref'])['--ref'];
    if (!external.has(check) || !['passed', 'failed'].includes(status) || !ref || !refPattern.test(ref)) {
      throw new Error('Expected an external check, passed or failed, and a reference ID or HTTPS URL without credentials or query');
    }
    return { action, check, status, ref };
  }
  if (action === 'init' && tail.length === 0) return { action };
  if (action === 'check') {
    const opts = options(tail, ['--profile', '--only', '--dry-run', '--fail-fast'], ['--dry-run', '--fail-fast']);
    return { action, profile: opts['--profile'], only: opts['--only'],
      dryRun: opts['--dry-run'], failFast: opts['--fail-fast'] };
  }
  if (action === 'report') {
    const opts = options(tail, ['--format', '--require', '--profile']);
    const format = opts['--format'] ?? 'markdown';
    if (!['markdown', 'json', 'junit'].includes(format)) throw new Error('Unknown report format');
    if (opts['--profile'] && opts['--require']) throw new Error('Use either --profile or --require');
    const required = [...new Set((opts['--require']?.split(',') ?? []).map(name))];
    return { action, format, required, profile: opts['--profile'] };
  }
  throw new Error(usage);
}

function targetFor(gitDir, check) {
  return check === 'local'
    ? resolve(gitDir, 'didit-receipt.json')
    : resolve(gitDir, 'didit-checks', check + '.json');
}

async function readReceipt(target, check) {
  const raw = await readFile(target, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (raw === undefined) return null;
  const r = JSON.parse(raw);
  const snapshots = r && typeof r.before === 'string' && shaPattern.test(r.before)
    && typeof r.after === 'string' && shaPattern.test(r.after);
  const measured = Number.isInteger(r?.exitCode) && r.exitCode >= 0;
  const valid = snapshots && (
    (r.version === 1 && check === 'local' && measured)
    || (r.version === 2 && r.check === check && (
      (r.source === 'command' && !external.has(check) && measured && Number.isFinite(r.durationMs) && r.durationMs >= 0)
      || (r.source === 'manual' && external.has(check) && ['passed', 'failed'].includes(r.result)
        && typeof r.ref === 'string' && refPattern.test(r.ref))
    ))
  );
  if (!valid) throw new Error('Invalid receipt for ' + check);
  return r;
}

function row(id, receipt, current) {
  const label = builtins.get(id) ?? id;
  if (!receipt) return { id, label, source: null, status: 'not_checked' };
  const source = receipt.source ?? 'command';
  const result = source === 'manual' ? receipt.result : receipt.exitCode === 0 ? 'passed' : 'failed';
  const status = receipt.before !== receipt.after ? 'unverified'
    : receipt.after !== current ? 'stale' : result;
  const finishedAt = typeof receipt.finishedAt === 'string' && Number.isFinite(Date.parse(receipt.finishedAt))
    ? new Date(receipt.finishedAt).toISOString() : null;
  return { id, label, source, status, result, finishedAt, snapshot: receipt.after,
    ...(source === 'manual' ? { ref: receipt.ref } : { exitCode: receipt.exitCode, durationMs: receipt.durationMs ?? null, origin: receipt.origin === 'project' ? 'project' : 'ad-hoc' }),
  };
}

function markdown({ snapshot: current, checks, missingRequired }) {
  const lines = [
    '## Verification receipt', '',
    'Git snapshot (SHA-256): ' + current, '',
    '| Check | Status |', '| --- | --- |',
  ];
  for (const check of checks) {
    let status;
    if (check.status === 'not_checked') status = 'Not checked';
    else if (check.status === 'unverified') status = 'Unverified — working tree changed during run';
    else if (check.status === 'stale') status = 'Stale — working tree changed since recording';
    else if (check.source === 'manual') status = 'Manually reported ' + check.status + ' (not independently verified)';
    else status = (check.status === 'passed' ? 'Passed' : 'Failed') + ' (exit ' + check.exitCode + ')';
    if (check.durationMs !== null && check.durationMs !== undefined) status += ' · ' + check.durationMs + ' ms';
    if (check.ref) status += ' · ' + String.fromCharCode(96) + check.ref + String.fromCharCode(96);
    lines.push('| ' + check.label + ' | ' + status + ' |');
  }
  if (missingRequired.length) lines.push('', 'Required checks not passing: ' + missingRequired.join(', '));
  return lines.join('\n');
}

async function report(gitDir, current, { format, required, configFingerprint }) {
  const files = await readdir(resolve(gitDir, 'didit-checks')).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const known = files.filter(file => file.endsWith('.json')).map(file => file.slice(0, -5))
    .filter(id => namePattern.test(id) && !builtins.has(id)).sort();
  const ids = [...new Set([...builtins.keys(), ...known, ...required])];
  const fingerprints = new Map();
  const checks = await Promise.all(ids.map(async id => {
    const receipt = await readReceipt(targetFor(gitDir, id), id);
    fingerprints.set(id, receipt?.configFingerprint);
    return row(id, receipt, current);
  }));
  const missingRequired = required.filter(id => !checks.some(check => check.id === id
    && check.status === 'passed' && check.source === 'command' && (!configFingerprint || (check.origin === 'project' && fingerprints.get(check.id) === configFingerprint))));
  const output = { schemaVersion: 1, snapshot: current, checks, missingRequired };
  console.log(format === 'json' ? JSON.stringify(output, null, 2) : format === 'junit' ? junit(output, required) : markdown(output));
  return missingRequired.length ? 1 : 0;
}

async function save(target, receipt) {
  const temp = target + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temp, JSON.stringify(receipt) + '\n', { flag: 'wx', mode: 0o600 });
    await rename(temp, target);
  } finally {
    await rm(temp, { force: true });
  }
}

async function main(args) {
  if (args.length === 0 || (args.length === 1 && ['--help', '-h'].includes(args[0]))) {
    console.log(usage);
    return 0;
  }
  if (args.length === 1 && ['--version', '-v'].includes(args[0])) {
    console.log(JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version);
    return 0;
  }
  const parsed = parse(args);
  const cwd = process.cwd();
  const root = git(cwd, ['rev-parse', '--show-toplevel']).toString().replace(/\r?\n$/, '');
  const gitDir = git(cwd, ['rev-parse', '--absolute-git-dir']).toString().replace(/\r?\n$/, '');
  const repo = { root, gitDir, cwd };
  if (parsed.action === 'init') {
    await initProject(root);
    console.log('Created ' + configFile);
    return 0;
  }
  if (parsed.action === 'report') {
    if (parsed.profile) {
      const project = await loadProject(root);
      parsed.required = selection(project, parsed.profile);
      parsed.configFingerprint = project.fingerprint;
    }
    return report(gitDir, await snapshot(root), parsed);
  }
  if (parsed.action === 'check') return checkProject(repo, parsed);
  return execute(repo, parsed);
}

async function checkProject({ root, gitDir }, parsed) {
  const project = await loadProject(root);
  const names = selection(project, parsed.profile, parsed.only);
  if (parsed.dryRun) {
    console.log(names.join('\n'));
    return 0;
  }
  const attempted = new Set();
  let infra = false;
  for (const check of names) {
    console.error('didit: running ' + check);
    attempted.add(check);
    try {
      const rc = await execute({ root, gitDir, cwd: root }, { action: 'run', check, origin: 'project', configFingerprint: project.fingerprint, command: project.checks.get(check) });
      if (rc !== 0 && parsed.failFast) break;
    } catch (error) {
      infra = true;
      console.error('didit: ' + check + ': ' + error.message);
      if (parsed.failFast) break;
    }
  }
  const current = await snapshot(root);
  if ((await loadProject(root)).fingerprint !== project.fingerprint) {
    console.error('didit: project configuration changed during checks');
    return 1;
  }
  let passed = true;
  for (const check of names) {
    const status = attempted.has(check)
      ? row(check, await readReceipt(targetFor(gitDir, check), check), current).status
      : 'not_run';
    console.error('didit: ' + check + ': ' + status);
    if (status !== 'passed') passed = false;
  }
  return infra ? 2 : passed ? 0 : 1;
}

async function execute({ root, gitDir, cwd }, parsed) {
  const target = targetFor(gitDir, parsed.check);
  await mkdir(dirname(target), { recursive: true });
  const lock = target + '.lock';
  const handle = await open(lock, 'wx', 0o600).catch(error => {
    if (error.code === 'EEXIST') throw new Error('Check already locked: ' + parsed.check + ' (' + lock + ')');
    throw error;
  });
  try {
    if (parsed.action === 'record') {
      const current = await snapshot(root);
      await save(target, { version: 2, check: parsed.check, source: 'manual',
        before: current, after: current, result: parsed.status, ref: parsed.ref, finishedAt: new Date().toISOString() });
      return 0;
    }
    await rm(target, { force: true });
    const before = await snapshot(root);
    const [executable, ...commandArgs] = parsed.command;
    const start = performance.now();
    const result = spawnSync(executable, commandArgs, { cwd, stdio: 'inherit', shell: false });
    const durationMs = Math.round(performance.now() - start);
    const finishedAt = new Date().toISOString();
    if (result.error) throw result.error;
    if (result.status === null) throw new Error('Command ended without an exit code: ' + result.signal);
    const after = await snapshot(root);
    await save(target, { version: 2, check: parsed.check, source: 'command',
      before, after, exitCode: result.status, durationMs, finishedAt, origin: parsed.origin, configFingerprint: parsed.configFingerprint });
    if (before !== after) console.error('didit: working tree changed during the run; result is unverified');
    return result.status;
  } finally {
    await handle.close();
    await rm(lock, { force: true });
  }
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error('didit: ' + error.message);
  process.exitCode = 2;
}
