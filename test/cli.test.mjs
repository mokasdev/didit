import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('../bin/didit.mjs', import.meta.url));
function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'didit-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  };
  git('init', '-q');
  return {
    cwd, git,
    run: (...args) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' }),
    write: (path, value) => writeFileSync(join(cwd, path), value),
  };
}

test('initial report keeps unverified stages separate', t => {
  const { run } = fixture(t);
  const r = run('report');
  assert.equal(r.status, 0, r.stderr);
  for (const label of ['Local command', 'CircleCI', 'Production deployment', 'Live smoke test']) {
    assert.ok(r.stdout.includes('| ' + label + ' | Not checked |'));
  }
});

test('records success and failure, propagates the exit code and omits output and arguments', t => {
  const { run, cwd } = fixture(t);
  const pass = run('run', '--', process.execPath, '-e', 'console.log("private-example")');
  assert.equal(pass.status, 0, pass.stderr);
  assert.match(pass.stdout, /private-example/);
  assert.match(run('report').stdout, /Passed \(exit 0\)/);
  assert.equal(run('run', '--', process.execPath, '-e', 'process.exit(7)').status, 7);
  assert.match(run('report').stdout, /Failed \(exit 7\)/);
  assert.doesNotMatch(readFileSync(join(cwd, '.git', 'didit-receipt.json'), 'utf8'), /private-example|process\.exit/);
});

test('an untracked edit with unchanged size invalidates the pass', t => {
  const { run, write } = fixture(t);
  write('hello world', 'aa');
  assert.equal(run('run', '--', process.execPath, '-e', '').status, 0);
  write('hello world', 'bb');
  assert.match(run('report').stdout, /Stale/);
});

test('staging an unchanged file invalidates the pass', t => {
  const { run, write, git } = fixture(t);
  write('hello.txt', 'hello');
  assert.equal(run('run', '--', process.execPath, '-e', '').status, 0);
  git('add', 'hello.txt');
  assert.match(run('report').stdout, /Stale/);
});

test('a run that writes a nonignored file is not verified', t => {
  const { run } = fixture(t);
  const r = run('run', '--', process.execPath, '-e', 'require("fs").writeFileSync("new", "1")');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /result is unverified/);
  assert.match(run('report').stdout, /Unverified/);
});

test('ignored output is excluded from the snapshot', t => {
  const { run, write } = fixture(t);
  write('.gitignore', 'output.log\n');
  const r = run('run', '--', process.execPath, '-e', 'require("fs").writeFileSync("output.log", "1")');
  assert.equal(r.status, 0, r.stderr);
  assert.match(run('report').stdout, /Passed/);
});

test('a launch failure clears previous evidence', t => {
  const { run } = fixture(t);
  assert.equal(run('run', '--', process.execPath, '-e', '').status, 0);
  assert.equal(run('run', '--', 'didit-nonexistent-executable-for-test').status, 2);
  assert.match(run('report').stdout, /Local command \| Not checked/);
});

test('runs from a subdirectory but reports the repository snapshot', t => {
  const { cwd, run } = fixture(t);
  const nested = join(cwd, 'nested');
  mkdirSync(nested);
  const r = spawnSync(process.execPath, [cli, 'run', '--', process.execPath, '-e',
    'if (!process.cwd().endsWith("nested")) process.exit(1)'], { cwd: nested, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(run('report').stdout, /Passed/);
});


test('named command results are independent and gates fail closed', t => {
  const { run, write } = fixture(t);
  assert.equal(run('run', '--check', 'lint', '--', process.execPath, '-e', '').status, 0);
  assert.equal(run('run', '--check', 'test', '--', process.execPath, '-e', 'process.exit(7)').status, 7);
  const r = run('report', '--format', 'json', '--require', 'lint,test,build');
  assert.equal(r.status, 1, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.deepEqual(report.missingRequired, ['test', 'build']);
  assert.equal(report.checks.find(c => c.id === 'lint').source, 'command');
  assert.equal(typeof report.checks.find(c => c.id === 'lint').durationMs, 'number');
  assert.equal(run('report', '--require', 'lint').status, 0);
  write('new', 'x');
  assert.equal(run('report', '--require', 'lint').status, 1);
});

test('external evidence is labelled manual, cannot satisfy a gate, and becomes stale', t => {
  const { run, write } = fixture(t);
  assert.equal(run('record', 'circleci', 'passed', '--ref', 'https://example.com/runs/42').status, 0);
  assert.equal(run('record', 'circleci', 'failed', '--ref', 'https://example.com/runs/43?token=secret').status, 2);
  assert.equal(run('run', '--check', 'circleci', '--', process.execPath, '-e', '').status, 2);
  assert.match(run('report').stdout, /Manually reported passed \(not independently verified\)/);
  const r = run('report', '--format', 'json', '--require', 'circleci');
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).checks.find(c => c.id === 'circleci').ref, 'https://example.com/runs/42');
  write('new', 'x');
  assert.match(run('report').stdout, /CircleCI \| Stale/);
});

test('reads a v0.1 default receipt', t => {
  const { run, write } = fixture(t);
  const { snapshot } = JSON.parse(run('report', '--format', 'json').stdout);
  write('.git/didit-receipt.json', JSON.stringify({
    version: 1, before: snapshot, after: snapshot, exitCode: 0,
  }));
  assert.equal(run('report', '--require', 'local').status, 0);
});

test('rejects path-like names and does not overwrite a locked check', t => {
  const { run, write } = fixture(t);
  assert.equal(run('run', '--check', '../test', '--', process.execPath, '-e', '').status, 2);
  assert.equal(run('run', '--', process.execPath, '-e', '').status, 0);
  write('.git/didit-receipt.json.lock', '');
  assert.match(run('run', '--', process.execPath, '-e', 'process.exit(7)').stderr, /already locked/);
  assert.match(run('report').stdout, /Passed \(exit 0\)/);
});
