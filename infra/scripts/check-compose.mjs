#!/usr/bin/env node
// Static checks on the Compose file (P0-INFRA-01 criterion 4, plus sandbox isolation).
//
// Usage: node infra/scripts/check-compose.mjs [--file infra/docker-compose.yml]
//
// Resolves the file with every profile enabled (`docker compose config`, which needs the Docker
// CLI but not a running daemon) and fails if:
//   - a published port is not bound to 127.0.0.1;
//   - an image has no explicit tag or uses `latest` (also the FROM lines of Dockerfiles that exist);
//   - the `sandbox` network is not `internal: true`, or `api` / `worker` join any other network.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { file: { type: 'string', default: 'infra/docker-compose.yml' } },
});
const composeFile = resolve(values.file);

const config = JSON.parse(
  execFileSync(
    'docker',
    ['compose', '-f', composeFile, '--profile', '*', 'config', '--format', 'json'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  ),
);

/** @type {string[]} */
const problems = [];

/** `name[:tag][@digest]` → true when the reference pins a tag other than `latest` (or a digest). */
function isPinned(reference) {
  if (reference.includes('@sha256:')) return true;
  const lastSegment = reference.slice(reference.lastIndexOf('/') + 1);
  const colon = lastSegment.indexOf(':');
  if (colon === -1) return false;
  const tag = lastSegment.slice(colon + 1);
  return tag !== '' && tag !== 'latest';
}

/** FROM references in a Dockerfile, ignoring stage aliases (`FROM build AS runtime`). */
function dockerfileBaseImages(path) {
  const stages = new Set();
  const images = [];
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/i.exec(line);
    if (!match) continue;
    const [, image, alias] = match;
    if (!stages.has(image) && image !== 'scratch') images.push(image);
    if (alias) stages.add(alias);
  }
  return images;
}

for (const [name, service] of Object.entries(config.services ?? {})) {
  for (const port of service.ports ?? []) {
    if (port.published !== undefined && port.host_ip !== '127.0.0.1') {
      problems.push(
        `${name}: port ${String(port.published)}:${String(port.target)} is bound to ` +
          `${port.host_ip ?? '0.0.0.0 (all interfaces)'}, expected 127.0.0.1`,
      );
    }
  }

  if (service.image !== undefined && service.build === undefined && !isPinned(service.image)) {
    problems.push(`${name}: image "${service.image}" must use an explicit tag other than latest`);
  }

  if (service.build !== undefined) {
    const dockerfile = resolve(service.build.context, service.build.dockerfile ?? 'Dockerfile');
    if (existsSync(dockerfile)) {
      for (const image of dockerfileBaseImages(dockerfile)) {
        if (!isPinned(image)) {
          problems.push(`${name}: ${dockerfile} uses base image "${image}" without a pinned tag`);
        }
      }
    } else {
      console.warn(`check-compose: ${name}: ${dockerfile} does not exist yet (skipped)`);
    }
  }
}

const sandbox = Object.entries(config.networks ?? {}).find(([key]) => key === 'sandbox')?.[1];
if (sandbox?.internal !== true) {
  problems.push('networks.sandbox must be internal: true');
}
for (const name of ['api', 'worker']) {
  const networks = Object.keys(config.services?.[name]?.networks ?? {});
  if (networks.length !== 1 || networks[0] !== 'sandbox') {
    problems.push(
      `${name}: must be attached only to the sandbox network (found: ${networks.join(', ')})`,
    );
  }
}

if (problems.length > 0) {
  console.error(`check-compose: ${String(problems.length)} problem(s) in ${composeFile}:`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`check-compose: OK (${String(Object.keys(config.services ?? {}).length)} services)`);
