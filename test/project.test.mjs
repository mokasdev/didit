import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../bin/didit.mjs', import.meta.url));
const ok = { command: [process.execPath, '-e', ''] };
const fail = { command: [process.execPath, '-e', 'process.exit(7)'] };

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'didit-project-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  assert.equal(spawnSync('git', ['init', '-q'], { cwd }).status, 0);
  const config = join(cwd, 'didit.config.json');
  return {
    config,
    cwd,
    run: (...args) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' }),
    write: (checks, profiles) => writeFileSync(config, JSON.stringify({ version: 1, checks, profiles })),
  };
}

test('init creates valid config without overwriting existing contents', t => {
  const { config, run } = fixture(t);
  assert.equal(run('init').status, 0);
  const before = readFileSync(config, 'utf8');
  assert.equal(run('init').status, 2);
  assert.equal(readFileSync(config, 'utf8'), before);
  assert.equal(run('check', '--dry-run').stdout.trim(), 'test');
});

test('dry-run lists selection, never runs a command, and rejects bad profiles', t => {
  const { run, write, cwd } = fixture(t);
  write({ lint: ok, test: { command: [process.execPath, '-e', 'require("node:fs").writeFileSync("marker","x")'] } },
    { default: ['test', 'lint'], quick: ['lint'] });
  const r = run('check', '--dry-run', '--only', 'test,lint');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'test\nlint'.replace('\n', r.stdout.includes('\r\n') ? '\r\n' : '\n'));
  assert.throws(() => readFileSync(join(cwd, 'marker')), { code: 'ENOENT' });
  assert.equal(run('check', '--dry-run', '--profile', 'quick').stdout.trim(), 'lint');
  assert.equal(run('check', '--profile', 'quick', '--only', 'test').status, 2);
  assert.equal(run('check', '--profile', 'unknown').status, 2);
});

test('projects run sequentially, support a platform override and produce gated JUnit', t => {
  const { run, write } = fixture(t);
  const windows = process.platform === 'win32' ? { command: fail.command, windows: ok.command }
    : { command: ok.command, windows: fail.command };
  write({ lint: windows, test: fail }, { default: ['test', 'lint'], quick: ['lint'] });
  const batch = run('check');
  assert.equal(batch.status, 1, batch.stderr);
  assert.match(batch.stderr, /test: failed/);
  assert.match(batch.stderr, /lint: passed/);
  const r = run('report', '--profile', 'default', '--format', 'junit');
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /tests="2" failures="1" skipped="0"/);
  assert.match(r.stdout, /name="test".*<failure /);
  assert.equal(run('report', '--profile', 'quick').status, 0);
});

test('fail-fast does not execute later checks and ad-hoc passes do not satisfy profile gates', t => {
  const { run, write } = fixture(t);
  write({ lint: ok, test: fail }, { default: ['test', 'lint'], quick: ['lint'] });
  const r = run('check', '--fail-fast');
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /lint: not_run/);
  assert.doesNotMatch(r.stderr, /running lint/);
  assert.equal(run('run', '--check', 'lint', '--', ...ok.command).status, 0);
  assert.equal(run('report', '--require', 'lint').status, 0);
  const gated = run('report', '--profile', 'quick', '--format', 'json');
  assert.equal(gated.status, 1);
  assert.deepEqual(JSON.parse(gated.stdout).missingRequired, ['lint']);
  assert.equal(run('check', '--profile', 'quick').status, 0);
  assert.equal(run('report', '--profile', 'quick').status, 0);
});

test('configuration changed by a check cannot produce a passing profile', t => {
  const { run, write } = fixture(t);
  const command = [process.execPath, '-e',
    'require("node:fs").appendFileSync("didit.config.json", " ")'];
  write({ alter: { command }, lint: ok }, { default: ['alter', 'lint'], quick: ['lint'] });
  const r = run('check');
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /configuration changed/);
  assert.equal(run('report', '--profile', 'quick').status, 1);
});

test('rejects invalid JSON schema and marks launch errors separately', t => {
  const { run, write } = fixture(t);
  write({ lint: { command: 'node --check foo' } }, { default: ['lint'] });
  assert.equal(run('check', '--dry-run').status, 2);
  write({ lint: { command: ['didit-no-such-fixture-command'] } }, { default: ['lint'] });
  const r = run('check');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /lint: not_checked/);
});
