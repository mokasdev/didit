import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const configFile = 'didit.config.json';
const checkId = /^[a-z][a-z0-9-]{0,39}$/;
const reserved = new Set(['local', 'circleci', 'deploy', 'smoke']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const argv = value => Array.isArray(value) && value.length > 0 && value.length <= 100
  && value.every(a => typeof a === 'string' && !a.includes('\0')) && value[0].trim().length > 0;

const starter = {
  version: 1,
  checks: { test: { command: ['node', '--test'] } },
  profiles: { default: ['test'] },
};

export async function initProject(root) {
  await writeFile(join(root, configFile), JSON.stringify(starter, null, 2) + '\n', { flag: 'wx' })
    .catch(error => {
      if (error.code === 'EEXIST') throw new Error(configFile + ' already exists; left unchanged');
      throw error;
    });
}

export async function loadProject(root) {
  const path = join(root, configFile);
  const stat = await lstat(path).catch(error => {
    if (error.code === 'ENOENT') throw new Error(configFile + ' not found; run didit init');
    throw error;
  });
  if (!stat.isFile()) throw new Error(configFile + ' must be a regular file');
  if (stat.size > 65536) throw new Error(configFile + ' exceeds 64 KiB');
  const data = await readFile(path);
  if (data.length > 65536) throw new Error(configFile + ' exceeds 64 KiB');
  let config;
  try { config = JSON.parse(data.toString('utf8').replace(/^\uFEFF/, '')); }
  catch { throw new Error(configFile + ' is not valid JSON'); }
  if (!object(config) || Object.keys(config).some(k => !['version', 'checks', 'profiles'].includes(k))
    || config.version !== 1 || !object(config.checks) || !object(config.profiles)) {
    throw new Error('Expected config version 1 with checks and profiles objects');
  }
  const checks = new Map();
  const entries = Object.entries(config.checks);
  if (!entries.length || entries.length > 50) throw new Error('Define between 1 and 50 checks');
  for (const [id, spec] of entries) {
    if (!checkId.test(id) || reserved.has(id) || !object(spec)
      || Object.keys(spec).some(k => !['command', 'windows'].includes(k))
      || !argv(spec.command) || (Object.hasOwn(spec, 'windows') && !argv(spec.windows))) {
      throw new Error('Invalid command definition for check: ' + id);
    }
    checks.set(id, process.platform === 'win32' && spec.windows ? spec.windows : spec.command);
  }
  const profiles = new Map();
  for (const [id, names] of Object.entries(config.profiles)) {
    if (!checkId.test(id) || !Array.isArray(names) || names.length === 0
      || new Set(names).size !== names.length || names.some(n => !checks.has(n))) {
      throw new Error('Invalid check selection for profile: ' + id);
    }
    profiles.set(id, names);
  }
  if (!profiles.has('default')) throw new Error('Define a default profile');
  return { checks, profiles, fingerprint: createHash('sha256').update(data).digest('hex') };
}

export function selection(project, profile, only) {
  if (profile && only) throw new Error('Use either --profile or --only');
  if (only) {
    const checks = [...new Set(only.split(','))];
    for (const id of checks) if (!project.checks.has(id)) throw new Error('Unknown check: ' + id);
    return checks;
  }
  const id = profile ?? 'default';
  if (!project.profiles.has(id)) throw new Error('Unknown profile: ' + id);
  return project.profiles.get(id);
}

export function junit({ checks, missingRequired }, required) {
  const esc = value => String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[c]);
  const selected = required.length ? checks.filter(c => required.includes(c.id)) : checks;
  const missing = new Set(missingRequired);
  const cases = selected.map(check => {
    const time = ((check.durationMs ?? 0) / 1000).toFixed(3);
    const failed = missing.has(check.id) || (check.source === 'command' && check.status === 'failed');
    const skipped = !failed && (check.source !== 'command' || check.status !== 'passed');
    const detail = failed
      ? '<failure message="' + esc(missing.has(check.id) ? 'Required command check did not pass: ' + check.status : 'Exit ' + check.exitCode) + '" />'
      : skipped ? '<skipped message="' + esc(check.source === 'manual' ? 'Manual evidence' : check.status) + '" />' : '';
    return { failed, skipped, xml: '  <testcase classname="didit" name="' + esc(check.id) + '" time="' + time + '">' + detail + '</testcase>' };
  });
  return ['<?xml version="1.0" encoding="UTF-8"?>',
    '<testsuite name="didit" tests="' + cases.length + '" failures="' + cases.filter(c => c.failed).length
      + '" skipped="' + cases.filter(c => c.skipped).length + '" errors="0">',
    ...cases.map(c => c.xml), '</testsuite>'].join('\n');
}
