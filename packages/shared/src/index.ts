/**
 * `@investfund/shared`: API contracts and domain rules shared by `apps/api` and `apps/web`.
 * OpenAPI generation lives in the separate `@investfund/shared/openapi` entry point so that
 * browser bundles never include the generator.
 */
export * from './api/auth.js';
export * from './api/common.js';
export * from './api/connections.js';
export * from './api/deals.js';
export * from './api/documents.js';
export * from './api/fields.js';
export * from './api/moderation.js';
export * from './api/notifications.js';
export * from './api/profiles.js';
export * from './api/startups.js';
export * from './api/system.js';
export * from './constants/problem-types.js';
export * from './constants/rate-limits.js';
export * from './constants/user-roles.js';
export * from './domain/index.js';
export * from './money.js';
