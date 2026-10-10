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
        "/api/v1/admin/overview",
        "/api/v1/admin/reports",
        "/api/v1/admin/reports/{reportId}",
        "/api/v1/admin/reports/{reportId}/resolve",
        "/api/v1/admin/users/{userId}/actions",
        "/api/v1/auth/google/callback",
        "/api/v1/auth/google/start",
        "/api/v1/auth/logout",
        "/api/v1/auth/refresh",
        "/api/v1/blocks",
        "/api/v1/blocks/{userId}",
        "/api/v1/connections",
        "/api/v1/connections/{connectionId}",
        "/api/v1/connections/{connectionId}/actions",
        "/api/v1/conversations",
        "/api/v1/conversations/{conversationId}",
        "/api/v1/conversations/{conversationId}/messages",
        "/api/v1/conversations/{conversationId}/read",
        "/api/v1/deals",
        "/api/v1/deals/{dealId}",
        "/api/v1/deals/{dealId}/actions",
        "/api/v1/deals/{dealId}/offers/{offerId}/respond",
        "/api/v1/documents/{documentId}",
        "/api/v1/documents/{documentId}/download",
        "/api/v1/documents/{documentId}/sharing",
        "/api/v1/me",
        "/api/v1/me/founder-profile",
        "/api/v1/me/role",
        "/api/v1/me/supporter-profile",
        "/api/v1/me/unread",
        "/api/v1/notifications",
        "/api/v1/notifications/read",
        "/api/v1/openapi.json",
        "/api/v1/realtime/stream",
        "/api/v1/recommendations",
        "/api/v1/reports",
        "/api/v1/saved-startups",
        "/api/v1/startups",
        "/api/v1/startups/by-slug/{slug}",
        "/api/v1/startups/mine",
        "/api/v1/startups/mine/{startupId}",
        "/api/v1/startups/{startupId}",
        "/api/v1/startups/{startupId}/documents",
        "/api/v1/startups/{startupId}/milestones",
        "/api/v1/startups/{startupId}/relationship",
        "/api/v1/startups/{startupId}/save",
        "/api/v1/startups/{startupId}/{action}",
        "/health/live",
        "/health/ready",
      ]
    `);
    expect(Object.keys(document.components.schemas as object)).toMatchInlineSnapshot(`
      [
        "AcceptedMessage",
        "AdminOverview",
        "AdminReport",
        "AdminReportPage",
        "AdminUserActionRequest",
        "BlockList",
        "BlockRequest",
        "BlockedUser",
        "ChooseRoleRequest",
        "Connection",
        "ConnectionAction",
        "ConnectionActionRequest",
        "ConnectionPage",
        "ConnectionStatus",
        "ConversationList",
        "ConversationSummary",
        "Country",
        "CreateConnectionRequest",
        "CreateDealRequest",
        "CreateReportRequest",
        "CreateStartupRequest",
        "Currency",
        "CurrentUser",
        "Deal",
        "DealAction",
        "DealActionRequest",
        "DealEvent",
        "DealPage",
        "DealStatus",
        "DealSummary",
        "Document",
        "DocumentList",
        "DocumentVisibility",
        "FounderProfile",
        "FounderProfileInput",
        "FundingPurpose",
        "FundingType",
        "HealthCheck",
        "HealthLive",
        "HealthReport",
        "HealthStatus",
        "Job",
        "JobAccepted",
        "JobError",
        "JobResult",
        "JobStatus",
        "MarkNotificationsReadRequest",
        "MatchFactorScore",
        "Message",
        "MessagePage",
        "Milestone",
        "Money",
        "Notification",
        "NotificationPage",
        "Offer",
        "OfferStatus",
        "OfferTerms",
        "OwnedStartup",
        "OwnedStartupList",
        "PersonSummary",
        "ProblemDetails",
        "ProblemFieldError",
        "Recommendation",
        "RecommendationPage",
        "ReplaceMilestonesRequest",
        "ReportAction",
        "ReportCategory",
        "ReportReceipt",
        "ReportStatus",
        "ReportTargetType",
        "ResolveReportRequest",
        "RespondToOfferRequest",
        "RuleIssue",
        "Sector",
        "SendMessageRequest",
        "SessionResponse",
        "Stage",
        "StartupDetail",
        "StartupPage",
        "StartupRef",
        "StartupRelationship",
        "StartupStatus",
        "StartupSummary",
        "SupporterProfile",
        "SupporterProfileInput",
        "UnreadCounts",
        "UpdateAccountRequest",
        "UpdateDocumentSharingRequest",
        "UpdateStartupRequest",
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
