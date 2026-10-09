import { describe, expect, it } from 'vitest';

import committed from '../../openapi/openapi.json?raw';
import {
  OPENAPI_VERSION,
  buildOpenApiDocument,
  serializeOpenApiDocument,
} from '../openapi/index.js';

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

/** Collects every `$ref` value in the document. */
function collectRefs(node: unknown, refs: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, refs);
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') refs.push(value);
      else collectRefs(value, refs);
    }
  }
  return refs;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

describe('OpenAPI generation', () => {
  const json = serializeOpenApiDocument(buildOpenApiDocument());
  const document: unknown = JSON.parse(json);

  it('is deterministic (byte-identical across runs)', () => {
    expect(serializeOpenApiDocument(buildOpenApiDocument())).toBe(json);
  });

  it('matches the committed openapi/openapi.json (run `pnpm --filter shared openapi:generate`)', () => {
    expect(json).toBe(committed);
  });

  it('lists components and paths in stable, sorted order', () => {
    expect(isRecord(document)).toBe(true);
    if (!isRecord(document) || !isRecord(document.components)) return;
    expect(Object.keys(document.paths as object)).toMatchInlineSnapshot(`
      [
        "/api/v1/openapi.json",
        "/health/live",
        "/health/ready",
      ]
    `);
    expect(Object.keys(document.components.schemas as object)).toMatchInlineSnapshot(`
      [
        "AcceptedMessage",
        "HealthCheck",
        "HealthLive",
        "HealthReport",
        "HealthStatus",
        "Job",
        "JobAccepted",
        "JobError",
        "JobResult",
        "JobStatus",
        "Money",
        "ProblemDetails",
        "ProblemFieldError",
      ]
    `);
  });

  it('is a structurally valid OpenAPI 3.1 document', () => {
    if (!isRecord(document)) throw new Error('document is not an object');
    expect(document.openapi).toBe(OPENAPI_VERSION);
    expect(document.openapi).toMatch(/^3\.1\.\d+$/);

    const { info, paths, components } = document;
    if (!isRecord(info) || !isRecord(paths) || !isRecord(components)) {
      throw new Error('info, paths and components must be objects');
    }
    expect(typeof info.title).toBe('string');
    expect(typeof info.version).toBe('string');

    for (const [path, item] of Object.entries(paths)) {
      expect(path.startsWith('/')).toBe(true);
      if (!isRecord(item)) throw new Error(`path item ${path} is not an object`);
      const operations = Object.entries(item).filter(([key]) => HTTP_METHODS.has(key));
      expect(operations.length).toBeGreaterThan(0);
      for (const [method, operation] of operations) {
        if (!isRecord(operation) || !isRecord(operation.responses)) {
          throw new Error(`${method} ${path} has no responses`);
        }
        for (const [status, response] of Object.entries(operation.responses)) {
          expect(status).toMatch(/^([1-5]\d{2}|default)$/);
          expect(isRecord(response) && typeof response.description === 'string').toBe(true);
        }
      }
    }

    const schemas = components.schemas;
    if (!isRecord(schemas)) throw new Error('components.schemas must be an object');
    for (const name of ['ProblemDetails', 'HealthReport']) {
      expect(schemas[name]).toBeDefined();
    }
    for (const ref of collectRefs(document)) {
      const match = /^#\/components\/schemas\/(.+)$/.exec(ref);
      expect(match, `unexpected $ref ${ref}`).not.toBeNull();
      expect(schemas[match?.[1] ?? ''], `dangling $ref ${ref}`).toBeDefined();
    }
  });

  it('describes ProblemDetails per RFC 9457 with requestId and errors[]', () => {
    if (!isRecord(document) || !isRecord(document.components)) return;
    const schemas = document.components.schemas as Record<string, Record<string, unknown>>;
    const problem = schemas.ProblemDetails;
    expect(problem?.required).toEqual(['type', 'title', 'status', 'requestId']);
    expect(Object.keys(problem?.properties as object)).toEqual([
      'type',
      'title',
      'status',
      'detail',
      'instance',
      'requestId',
      'errors',
    ]);
  });
});
