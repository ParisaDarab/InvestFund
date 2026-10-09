/**
 * `@investfund/shared`: API contracts shared by `apps/api` and `apps/web`.
 * OpenAPI generation lives in the separate `@investfund/shared/openapi` entry point so that
 * browser bundles never include the generator.
 */
export * from './api/common.js';
export * from './api/system.js';
export * from './constants/problem-types.js';
export * from './constants/rate-limits.js';
export * from './money.js';
