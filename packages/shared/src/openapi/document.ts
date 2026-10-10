/**
 * OpenAPI 3.1 document generated from the shared Zod schemas.
 *
 * Each contract card registers its components and paths in `createOpenApiRegistry()`.
 * The output is deterministic: components and paths are sorted by name, so generating twice
 * gives byte-identical JSON (see `serializeOpenApiDocument`).
 */
import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import { AcceptedMessage, Job, JobAccepted, Money, ProblemDetails } from '../api/common.js';
import { HealthLive, HealthReport } from '../api/system.js';
import { PROBLEM_CONTENT_TYPE } from '../constants/problem-types.js';

import { registerMarketplacePaths } from './paths.js';

export const OPENAPI_VERSION = '3.1.0';
export const API_TITLE = 'InvestFund API';
export const API_VERSION = '1.0.0';

type OpenApiDocument = ReturnType<OpenApiGeneratorV31['generateDocument']>;
export type { OpenApiDocument };

const problemResponse = (description: string) => ({
  description,
  content: { [PROBLEM_CONTENT_TYPE]: { schema: ProblemDetails } },
});

/**
 * Components emitted even when no registered path references them yet. Each schema names its
 * component through `.meta({ id })`; schemas they embed (for example `JobStatus`) follow.
 */
export const COMPONENT_SCHEMAS = [
  AcceptedMessage,
  HealthReport,
  Job,
  JobAccepted,
  Money,
  ProblemDetails,
] as const;

/** Registers the system paths (docs/API.md §5). Later contract cards add their paths here. */
export function createOpenApiRegistry(): OpenAPIRegistry {
  const registry = new OpenAPIRegistry();

  registry.registerPath({
    method: 'get',
    path: '/health/live',
    operationId: 'getHealthLive',
    summary: 'Liveness: the process is up',
    tags: ['system'],
    responses: {
      200: { description: 'Alive', content: { 'application/json': { schema: HealthLive } } },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/health/ready',
    operationId: 'getHealthReady',
    summary: 'Readiness: database and storage are reachable',
    tags: ['system'],
    responses: {
      200: { description: 'Ready', content: { 'application/json': { schema: HealthReport } } },
      503: {
        description: 'At least one check failed',
        content: { 'application/json': { schema: HealthReport } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/openapi.json',
    operationId: 'getOpenApiDocument',
    summary: 'This OpenAPI 3.1 document',
    tags: ['system'],
    responses: {
      200: {
        description: 'OpenAPI document',
        content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } },
      },
      429: problemResponse('Rate limit exceeded'),
    },
  });

  registerMarketplacePaths(registry);
  return registry;
}

/** Builds the OpenAPI 3.1 document with components and paths in a stable, sorted order. */
export function buildOpenApiDocument(): OpenApiDocument {
  const generator = new OpenApiGeneratorV31([
    ...createOpenApiRegistry().definitions,
    // Plain Zod schemas must be wrapped: zod v4 schemas have their own `type` property.
    ...COMPONENT_SCHEMAS.map((schema) => ({ type: 'schema' as const, schema })),
  ]);
  const document = generator.generateDocument({
    openapi: OPENAPI_VERSION,
    info: {
      title: API_TITLE,
      version: API_VERSION,
      description: 'Generated from the Zod schemas in `@investfund/shared`. Do not edit by hand.',
    },
    tags: [
      { name: 'system', description: 'Health and API metadata' },
      { name: 'auth', description: 'Google sign-in and sessions' },
      { name: 'account', description: 'Current user, onboarding and profiles' },
      { name: 'startups', description: 'Startups, discovery and recommendations' },
      { name: 'connections', description: 'Connection requests' },
      { name: 'conversations', description: 'Private messaging and real time' },
      { name: 'deals', description: 'Grant and donation offers and outcomes' },
      { name: 'notifications', description: 'In-app notifications' },
      { name: 'documents', description: 'Confidential documents' },
      { name: 'moderation', description: 'Blocking and reporting' },
      { name: 'admin', description: 'Administration' },
    ],
  });
  return {
    ...document,
    paths: sortKeys(document.paths ?? {}),
    components: {
      ...document.components,
      schemas: sortKeys(document.components?.schemas ?? {}),
    },
  };
}

/** Serialises the document as 2-space-indented JSON with a trailing newline (LF). */
export function serializeOpenApiDocument(document: OpenApiDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function sortKeys<Value>(record: Record<string, Value>): Record<string, Value> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}
