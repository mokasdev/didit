import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run npm run smoke:pack');
const temp = await mkdtemp(join(tmpdir(), 'didit-package-'));

function exec(executable, args, cwd, status = 0) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', timeout: 60_000 });
  if (result.error) throw result.error;
  assert.equal(result.status, status, [
    args.join(' '), result.stdout, result.stderr,
  ].join('\n'));
  return result.stdout;
}

try {
  const project = join(temp, 'consumer');
  await mkdir(project);
  const [pack] = JSON.parse(exec(process.execPath, [npm, 'pack', '--json', '--pack-destination', temp], process.cwd()));
  await writeFile(join(project, 'package.json'), JSON.stringify({
    name: 'didit-smoke-consumer', version: '1.0.0', private: true,
  }));
  exec(process.execPath, [npm, 'install', '--offline', '--no-audit', '--no-fund', '--ignore-scripts',
    '--no-package-lock', join(temp, pack.filename)], project);
  exec('git', ['init', '-q'], project);
  await writeFile(join(project, '.gitignore'), 'node_modules/\n');
  const trial = join(project, 'example.test.cjs');
  await writeFile(trial, 'require("node:test")("works", () => {});\n');
  const didit = (args, status) => exec(process.execPath, [npm, 'exec', '--offline', '--', 'didit', ...args], project, status);
  assert.equal(didit(['--version']).trim(), pack.version);
  assert.match(didit(['init']), /Created didit.config.json/);
  didit(['check']);
  const reportArgs = ['report', '--profile', 'default', '--format', 'json'];
  let report = JSON.parse(didit(reportArgs));
  assert.deepEqual(report.missingRequired, []);
  assert.equal(report.checks.find(c => c.id === 'test').status, 'passed');
  await writeFile(trial, 'require("node:test")("changed", () => {});\n');
  report = JSON.parse(didit(reportArgs, 1));
  assert.deepEqual(report.missingRequired, ['test']);
  assert.equal(report.checks.find(c => c.id === 'test').status, 'stale');
  console.log('Packaged CLI: version, init, check, report and stale gate passed');
} finally {
  await rm(temp, { recursive: true, force: true });
}
