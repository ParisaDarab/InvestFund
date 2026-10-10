#!/usr/bin/env node
// Writes the OpenAPI 3.1 document generated from the shared Zod schemas.
//
// Usage (after `pnpm --filter shared build`, which `openapi:generate` runs first):
//   node scripts/generate-openapi.mjs [output-file]
// Default output: packages/shared/openapi/openapi.json. The output is deterministic.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildOpenApiDocument, serializeOpenApiDocument } from '../dist/openapi/index.js';

const defaultOutput = fileURLToPath(new URL('../openapi/openapi.json', import.meta.url));
const output = resolve(process.argv[2] ?? defaultOutput);

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, serializeOpenApiDocument(buildOpenApiDocument()), 'utf8');
console.log(`openapi: wrote ${output}`);
