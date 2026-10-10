#!/usr/bin/env node
// Waits until every service of the Compose project is healthy, then checks that the database has
// the required extensions. Used locally, by the sandbox smoke test (P0-TEST-02) and by CI.
//
// Usage:
//   node infra/scripts/compose-health.mjs [--file infra/docker-compose.yml] [--profile sandbox]
//                                         [--timeout 60] [--skip-extensions]
//
// Expected services are those enabled for the given profiles (`docker compose config --services`).
// Exits 0 when all are healthy within the timeout (in seconds) and `vector` and `citext` are
// installed; exits 1 otherwise. Prints the time it took, for the phase test report.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';

const REQUIRED_EXTENSIONS = ['vector', 'citext'];

const { values } = parseArgs({
  options: {
    file: { type: 'string', default: 'infra/docker-compose.yml' },
    profile: { type: 'string', multiple: true, default: [] },
    timeout: { type: 'string', default: '60' },
    'skip-extensions': { type: 'boolean', default: false },
  },
});

const timeoutMs = Number(values.timeout) * 1000;
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  console.error('compose-health: --timeout must be a positive number of seconds');
  process.exit(2);
}

const baseArgs = [
  'compose',
  '-f',
  resolve(values.file),
  ...values.profile.flatMap((profile) => ['--profile', profile]),
];

/** @param {string[]} args */
function compose(args) {
  return execFileSync('docker', [...baseArgs, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** `docker compose ps --format json` prints one JSON object per line (or one array, in old versions). */
function containerStates() {
  const out = compose(['ps', '--all', '--format', 'json']).trim();
  if (out === '') return [];
  const rows = out.startsWith('[')
    ? JSON.parse(out)
    : out.split('\n').map((line) => JSON.parse(line));
  return rows.map((row) => ({ service: row.Service, state: row.State, health: row.Health ?? '' }));
}

const expected = compose(['config', '--services'])
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)
  .sort();
const started = Date.now();
console.log(`compose-health: waiting up to ${values.timeout}s for: ${expected.join(', ')}`);

/** @type {Map<string, string>} */
let status = new Map();
for (;;) {
  const states = containerStates();
  status = new Map(
    expected.map((service) => {
      const container = states.find((row) => row.service === service);
      if (container === undefined) return [service, 'missing'];
      if (container.state !== 'running') return [service, container.state];
      return [service, container.health === '' ? 'running (no healthcheck)' : container.health];
    }),
  );

  const failed = [...status].filter(([, s]) => ['exited', 'dead', 'unhealthy'].includes(s));
  if (failed.length > 0) {
    console.error('compose-health: FAIL');
    for (const [service, s] of failed) console.error(`  ${service}: ${s}`);
    console.error(
      `Inspect with: docker compose -f ${values.file} logs ${failed.map(([n]) => n).join(' ')}`,
    );
    process.exit(1);
  }
  if ([...status.values()].every((s) => s === 'healthy')) break;
  if (Date.now() - started > timeoutMs) {
    console.error(`compose-health: FAIL, not healthy after ${values.timeout}s`);
    for (const [service, s] of status) console.error(`  ${service}: ${s}`);
    process.exit(1);
  }
  await sleep(1000);
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(`compose-health: all ${String(expected.length)} services healthy after ${seconds}s`);

if (!values['skip-extensions'] && expected.includes('postgres')) {
  const installed = compose([
    'exec',
    '-T',
    'postgres',
    'sh',
    '-c',
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT extname FROM pg_extension ORDER BY extname"',
  ])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const missing = REQUIRED_EXTENSIONS.filter((name) => !installed.includes(name));
  if (missing.length > 0) {
    console.error(`compose-health: FAIL, missing extensions: ${missing.join(', ')}`);
    console.error(`Installed: ${installed.join(', ')}`);
    process.exit(1);
  }
  console.log(`compose-health: extensions OK (${installed.join(', ')})`);
}
