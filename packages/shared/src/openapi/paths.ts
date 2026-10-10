/**
 * Marketplace endpoints registered in the OpenAPI document (docs/API.md §6). Each entry names its
 * request and response schemas from `../api`; the generator turns `.meta({ id })` schemas into
 * shared components.
 */
import { z } from 'zod';

import {
  ChooseRoleRequest,
  CurrentUser,
  GoogleStartQuery,
  SessionResponse,
  UpdateAccountRequest,
} from '../api/auth.js';
import { ProblemDetails } from '../api/common.js';
import {
  ConnectionActionRequest,
  ConnectionListQuery,
  ConnectionPage,
  ConnectionView,
  ConversationList,
  ConversationSummary,
  CreateConnectionRequest,
  MessageListQuery,
  MessagePage,
  MessageView,
  SendMessageRequest,
  UnreadCounts,
} from '../api/connections.js';
import {
  CreateDealRequest,
  DealActionRequest,
  DealListQuery,
  DealPage,
  DealView,
  RespondToOfferRequest,
} from '../api/deals.js';
import {
  DocumentList,
  DocumentView,
  UpdateDocumentSharingRequest,
  UploadDocumentQuery,
} from '../api/documents.js';
import {
  AdminOverview,
  AdminReport,
  AdminReportPage,
  AdminReportQuery,
  AdminUserActionRequest,
  BlockList,
  BlockRequest,
  CreateReportRequest,
  ReportReceipt,
  ResolveReportRequest,
} from '../api/moderation.js';
import {
  MarkNotificationsReadRequest,
  NotificationListQuery,
  NotificationPage,
} from '../api/notifications.js';
import {
  FounderProfile,
  FounderProfileInput,
  SupporterProfile,
  SupporterProfileInput,
} from '../api/profiles.js';
import {
  CreateStartupRequest,
  OwnedStartup,
  OwnedStartupList,
  RecommendationPage,
  RecommendationQuery,
  ReplaceMilestonesRequest,
  StartupDetail,
  StartupPage,
  StartupRelationship,
  StartupSearchQuery,
  StartupVersionRequest,
  UpdateStartupRequest,
} from '../api/startups.js';
import { PROBLEM_CONTENT_TYPE } from '../constants/problem-types.js';

import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Auth = 'public' | 'bearer' | 'cookie';

interface Endpoint {
  readonly method: Method;
  readonly path: string;
  readonly operationId: string;
  readonly tag: string;
  readonly summary: string;
  readonly auth: Auth;
  readonly params?: Record<string, 'uuid' | 'slug' | 'action'>;
  readonly query?: z.ZodObject;
  readonly body?: z.ZodType;
  readonly bodyContentType?: string;
  /** Success status and schema; `null` schema = no body. */
  readonly ok: readonly [number, z.ZodType | null];
}

const id = 'uuid' as const;

export const ENDPOINTS: readonly Endpoint[] = [
  // Auth
  {
    method: 'get',
    path: '/api/v1/auth/google/start',
    operationId: 'startGoogleSignIn',
    tag: 'auth',
    summary: 'Redirect to Google (PKCE)',
    auth: 'public',
    query: GoogleStartQuery,
    ok: [303, null],
  },
  {
    method: 'get',
    path: '/api/v1/auth/google/callback',
    operationId: 'googleCallback',
    tag: 'auth',
    summary: 'OAuth callback; sets the refresh cookie',
    auth: 'public',
    ok: [303, null],
  },
  {
    method: 'post',
    path: '/api/v1/auth/refresh',
    operationId: 'refreshSession',
    tag: 'auth',
    summary: 'Rotate the refresh token and issue an access token',
    auth: 'cookie',
    body: z.object({}),
    ok: [200, SessionResponse],
  },
  {
    method: 'post',
    path: '/api/v1/auth/logout',
    operationId: 'logout',
    tag: 'auth',
    summary: 'Revoke the session',
    auth: 'cookie',
    body: z.object({}),
    ok: [204, null],
  },
  // Account
  {
    method: 'get',
    path: '/api/v1/me',
    operationId: 'getMe',
    tag: 'account',
    summary: 'Current user',
    auth: 'bearer',
    ok: [200, CurrentUser],
  },
  {
    method: 'patch',
    path: '/api/v1/me',
    operationId: 'updateMe',
    tag: 'account',
    summary: 'Update account settings',
    auth: 'bearer',
    body: UpdateAccountRequest,
    ok: [200, CurrentUser],
  },
  {
    method: 'post',
    path: '/api/v1/me/role',
    operationId: 'chooseRole',
    tag: 'account',
    summary: 'Choose founder or supporter (once)',
    auth: 'bearer',
    body: ChooseRoleRequest,
    ok: [200, CurrentUser],
  },
  {
    method: 'get',
    path: '/api/v1/me/unread',
    operationId: 'getUnreadCounts',
    tag: 'account',
    summary: 'Unread messages and notifications',
    auth: 'bearer',
    ok: [200, UnreadCounts],
  },
  {
    method: 'get',
    path: '/api/v1/me/founder-profile',
    operationId: 'getFounderProfile',
    tag: 'account',
    summary: 'Own founder profile',
    auth: 'bearer',
    ok: [200, FounderProfile],
  },
  {
    method: 'put',
    path: '/api/v1/me/founder-profile',
    operationId: 'putFounderProfile',
    tag: 'account',
    summary: 'Create or update the founder profile',
    auth: 'bearer',
    body: FounderProfileInput,
    ok: [200, FounderProfile],
  },
  {
    method: 'get',
    path: '/api/v1/me/supporter-profile',
    operationId: 'getSupporterProfile',
    tag: 'account',
    summary: 'Own supporter profile',
    auth: 'bearer',
    ok: [200, SupporterProfile],
  },
  {
    method: 'put',
    path: '/api/v1/me/supporter-profile',
    operationId: 'putSupporterProfile',
    tag: 'account',
    summary: 'Create or update the supporter profile and preferences',
    auth: 'bearer',
    body: SupporterProfileInput,
    ok: [200, SupporterProfile],
  },
  // Startups
  {
    method: 'get',
    path: '/api/v1/startups',
    operationId: 'searchStartups',
    tag: 'startups',
    summary: 'Search published startups',
    auth: 'public',
    query: StartupSearchQuery,
    ok: [200, StartupPage],
  },
  {
    method: 'post',
    path: '/api/v1/startups',
    operationId: 'createStartup',
    tag: 'startups',
    summary: 'Create a draft startup',
    auth: 'bearer',
    body: CreateStartupRequest,
    ok: [201, OwnedStartup],
  },
  {
    method: 'get',
    path: '/api/v1/startups/by-slug/{slug}',
    operationId: 'getStartupBySlug',
    tag: 'startups',
    summary: 'Public startup detail',
    auth: 'public',
    params: { slug: 'slug' },
    ok: [200, StartupDetail],
  },
  {
    method: 'get',
    path: '/api/v1/startups/mine',
    operationId: 'listMyStartups',
    tag: 'startups',
    summary: "The founder's startups",
    auth: 'bearer',
    ok: [200, OwnedStartupList],
  },
  {
    method: 'get',
    path: '/api/v1/startups/mine/{startupId}',
    operationId: 'getMyStartup',
    tag: 'startups',
    summary: 'Owner view of a startup',
    auth: 'bearer',
    params: { startupId: id },
    ok: [200, OwnedStartup],
  },
  {
    method: 'patch',
    path: '/api/v1/startups/{startupId}',
    operationId: 'updateStartup',
    tag: 'startups',
    summary: 'Update a startup (optimistic concurrency)',
    auth: 'bearer',
    params: { startupId: id },
    body: UpdateStartupRequest,
    ok: [200, OwnedStartup],
  },
  {
    method: 'put',
    path: '/api/v1/startups/{startupId}/milestones',
    operationId: 'replaceMilestones',
    tag: 'startups',
    summary: 'Replace the milestone list',
    auth: 'bearer',
    params: { startupId: id },
    body: ReplaceMilestonesRequest,
    ok: [200, OwnedStartup],
  },
  {
    method: 'post',
    path: '/api/v1/startups/{startupId}/{action}',
    operationId: 'changeStartupStatus',
    tag: 'startups',
    summary: 'publish | unpublish | archive | restore',
    auth: 'bearer',
    params: { startupId: id, action: 'action' },
    body: StartupVersionRequest,
    ok: [200, OwnedStartup],
  },
  {
    method: 'get',
    path: '/api/v1/startups/{startupId}/relationship',
    operationId: 'getStartupRelationship',
    tag: 'startups',
    summary: "The viewer's relationship with a startup",
    auth: 'bearer',
    params: { startupId: id },
    ok: [200, StartupRelationship],
  },
  {
    method: 'put',
    path: '/api/v1/startups/{startupId}/save',
    operationId: 'saveStartup',
    tag: 'startups',
    summary: 'Save a startup',
    auth: 'bearer',
    params: { startupId: id },
    ok: [204, null],
  },
  {
    method: 'delete',
    path: '/api/v1/startups/{startupId}/save',
    operationId: 'unsaveStartup',
    tag: 'startups',
    summary: 'Remove a saved startup',
    auth: 'bearer',
    params: { startupId: id },
    ok: [204, null],
  },
  {
    method: 'get',
    path: '/api/v1/recommendations',
    operationId: 'getRecommendations',
    tag: 'startups',
    summary: 'Personalised, explained recommendations',
    auth: 'bearer',
    query: RecommendationQuery,
    ok: [200, RecommendationPage],
  },
  {
    method: 'get',
    path: '/api/v1/saved-startups',
    operationId: 'listSavedStartups',
    tag: 'startups',
    summary: 'Saved startups',
    auth: 'bearer',
    ok: [200, StartupPage],
  },
  // Connections and conversations
  {
    method: 'get',
    path: '/api/v1/connections',
    operationId: 'listConnections',
    tag: 'connections',
    summary: 'Connections of the caller',
    auth: 'bearer',
    query: ConnectionListQuery,
    ok: [200, ConnectionPage],
  },
  {
    method: 'post',
    path: '/api/v1/connections',
    operationId: 'requestConnection',
    tag: 'connections',
    summary: 'Request a connection',
    auth: 'bearer',
    body: CreateConnectionRequest,
    ok: [201, ConnectionView],
  },
  {
    method: 'get',
    path: '/api/v1/connections/{connectionId}',
    operationId: 'getConnection',
    tag: 'connections',
    summary: 'A connection',
    auth: 'bearer',
    params: { connectionId: id },
    ok: [200, ConnectionView],
  },
  {
    method: 'post',
    path: '/api/v1/connections/{connectionId}/actions',
    operationId: 'actOnConnection',
    tag: 'connections',
    summary: 'Accept, decline or withdraw',
    auth: 'bearer',
    params: { connectionId: id },
    body: ConnectionActionRequest,
    ok: [200, ConnectionView],
  },
  {
    method: 'get',
    path: '/api/v1/conversations',
    operationId: 'listConversations',
    tag: 'conversations',
    summary: 'Conversations with unread counts',
    auth: 'bearer',
    ok: [200, ConversationList],
  },
  {
    method: 'get',
    path: '/api/v1/conversations/{conversationId}',
    operationId: 'getConversation',
    tag: 'conversations',
    summary: 'A conversation',
    auth: 'bearer',
    params: { conversationId: id },
    ok: [200, ConversationSummary],
  },
  {
    method: 'get',
    path: '/api/v1/conversations/{conversationId}/messages',
    operationId: 'listMessages',
    tag: 'conversations',
    summary: 'Message history (newest first)',
    auth: 'bearer',
    params: { conversationId: id },
    query: MessageListQuery,
    ok: [200, MessagePage],
  },
  {
    method: 'post',
    path: '/api/v1/conversations/{conversationId}/messages',
    operationId: 'sendMessage',
    tag: 'conversations',
    summary: 'Send a message (idempotent per clientMessageId)',
    auth: 'bearer',
    params: { conversationId: id },
    body: SendMessageRequest,
    ok: [201, MessageView],
  },
  {
    method: 'post',
    path: '/api/v1/conversations/{conversationId}/read',
    operationId: 'markConversationRead',
    tag: 'conversations',
    summary: 'Mark as read',
    auth: 'bearer',
    params: { conversationId: id },
    ok: [204, null],
  },
  {
    method: 'get',
    path: '/api/v1/realtime/stream',
    operationId: 'openRealtimeStream',
    tag: 'conversations',
    summary: 'Server-Sent Events stream of the caller',
    auth: 'bearer',
    ok: [200, null],
  },
  // Deals
  {
    method: 'get',
    path: '/api/v1/deals',
    operationId: 'listDeals',
    tag: 'deals',
    summary: 'Deals of the caller',
    auth: 'bearer',
    query: DealListQuery,
    ok: [200, DealPage],
  },
  {
    method: 'post',
    path: '/api/v1/deals',
    operationId: 'createDeal',
    tag: 'deals',
    summary: 'Open a negotiation with a first proposal',
    auth: 'bearer',
    body: CreateDealRequest,
    ok: [201, DealView],
  },
  {
    method: 'get',
    path: '/api/v1/deals/{dealId}',
    operationId: 'getDeal',
    tag: 'deals',
    summary: 'Deal with full history',
    auth: 'bearer',
    params: { dealId: id },
    ok: [200, DealView],
  },
  {
    method: 'post',
    path: '/api/v1/deals/{dealId}/offers/{offerId}/respond',
    operationId: 'respondToOffer',
    tag: 'deals',
    summary: 'Accept, decline, counter, revise or withdraw',
    auth: 'bearer',
    params: { dealId: id, offerId: id },
    body: RespondToOfferRequest,
    ok: [200, DealView],
  },
  {
    method: 'post',
    path: '/api/v1/deals/{dealId}/actions',
    operationId: 'actOnDeal',
    tag: 'deals',
    summary: 'Outcome lifecycle action',
    auth: 'bearer',
    params: { dealId: id },
    body: DealActionRequest,
    ok: [200, DealView],
  },
  // Notifications
  {
    method: 'get',
    path: '/api/v1/notifications',
    operationId: 'listNotifications',
    tag: 'notifications',
    summary: 'Notifications',
    auth: 'bearer',
    query: NotificationListQuery,
    ok: [200, NotificationPage],
  },
  {
    method: 'post',
    path: '/api/v1/notifications/read',
    operationId: 'markNotificationsRead',
    tag: 'notifications',
    summary: 'Mark notifications read',
    auth: 'bearer',
    body: MarkNotificationsReadRequest,
    ok: [204, null],
  },
  // Documents
  {
    method: 'get',
    path: '/api/v1/startups/{startupId}/documents',
    operationId: 'listDocuments',
    tag: 'documents',
    summary: 'Documents visible to the caller',
    auth: 'bearer',
    params: { startupId: id },
    ok: [200, DocumentList],
  },
  {
    method: 'post',
    path: '/api/v1/startups/{startupId}/documents',
    operationId: 'uploadDocument',
    tag: 'documents',
    summary: 'Upload (raw body)',
    auth: 'bearer',
    params: { startupId: id },
    query: UploadDocumentQuery,
    body: z.string().meta({ format: 'binary' }),
    bodyContentType: 'application/pdf',
    ok: [201, DocumentView],
  },
  {
    method: 'get',
    path: '/api/v1/documents/{documentId}/download',
    operationId: 'downloadDocument',
    tag: 'documents',
    summary: 'Authorised download',
    auth: 'bearer',
    params: { documentId: id },
    ok: [200, null],
  },
  {
    method: 'put',
    path: '/api/v1/documents/{documentId}/sharing',
    operationId: 'updateDocumentSharing',
    tag: 'documents',
    summary: 'Change visibility and grants',
    auth: 'bearer',
    params: { documentId: id },
    body: UpdateDocumentSharingRequest,
    ok: [200, DocumentView],
  },
  {
    method: 'delete',
    path: '/api/v1/documents/{documentId}',
    operationId: 'deleteDocument',
    tag: 'documents',
    summary: 'Delete a document',
    auth: 'bearer',
    params: { documentId: id },
    ok: [204, null],
  },
  // Moderation and admin
  {
    method: 'get',
    path: '/api/v1/blocks',
    operationId: 'listBlocks',
    tag: 'moderation',
    summary: 'Users blocked by the caller',
    auth: 'bearer',
    ok: [200, BlockList],
  },
  {
    method: 'post',
    path: '/api/v1/blocks',
    operationId: 'blockUser',
    tag: 'moderation',
    summary: 'Block a user',
    auth: 'bearer',
    body: BlockRequest,
    ok: [204, null],
  },
  {
    method: 'delete',
    path: '/api/v1/blocks/{userId}',
    operationId: 'unblockUser',
    tag: 'moderation',
    summary: 'Unblock a user',
    auth: 'bearer',
    params: { userId: id },
    ok: [204, null],
  },
  {
    method: 'post',
    path: '/api/v1/reports',
    operationId: 'createReport',
    tag: 'moderation',
    summary: 'Report a user or listing',
    auth: 'bearer',
    body: CreateReportRequest,
    ok: [201, ReportReceipt],
  },
  {
    method: 'get',
    path: '/api/v1/admin/overview',
    operationId: 'getAdminOverview',
    tag: 'admin',
    summary: 'Operational overview',
    auth: 'bearer',
    ok: [200, AdminOverview],
  },
  {
    method: 'get',
    path: '/api/v1/admin/reports',
    operationId: 'listReports',
    tag: 'admin',
    summary: 'Report queue',
    auth: 'bearer',
    query: AdminReportQuery,
    ok: [200, AdminReportPage],
  },
  {
    method: 'get',
    path: '/api/v1/admin/reports/{reportId}',
    operationId: 'getReport',
    tag: 'admin',
    summary: 'Report detail',
    auth: 'bearer',
    params: { reportId: id },
    ok: [200, AdminReport],
  },
  {
    method: 'post',
    path: '/api/v1/admin/reports/{reportId}/resolve',
    operationId: 'resolveReport',
    tag: 'admin',
    summary: 'Resolve or dismiss a report',
    auth: 'bearer',
    params: { reportId: id },
    body: ResolveReportRequest,
    ok: [200, AdminReport],
  },
  {
    method: 'post',
    path: '/api/v1/admin/users/{userId}/actions',
    operationId: 'adminUserAction',
    tag: 'admin',
    summary: 'Suspend or reinstate a user',
    auth: 'bearer',
    params: { userId: id },
    body: AdminUserActionRequest,
    ok: [204, null],
  },
];

const paramSchema = (kind: 'uuid' | 'slug' | 'action') =>
  kind === 'uuid'
    ? z.uuid()
    : kind === 'slug'
      ? z.string().regex(/^[a-z0-9-]+$/)
      : z.enum(['publish', 'unpublish', 'archive', 'restore']);

export function registerMarketplacePaths(registry: OpenAPIRegistry): void {
  registry.registerComponent('securitySchemes', 'bearer', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });
  registry.registerComponent('securitySchemes', 'refreshCookie', {
    type: 'apiKey',
    in: 'cookie',
    name: 'if_refresh',
  });
  const problem = (description: string) => ({
    description,
    content: { [PROBLEM_CONTENT_TYPE]: { schema: ProblemDetails } },
  });

  for (const e of ENDPOINTS) {
    const [status, schema] = e.ok;
    const params =
      e.params === undefined
        ? undefined
        : z.object(
            Object.fromEntries(
              Object.entries(e.params).map(([key, kind]) => [key, paramSchema(kind)]),
            ),
          );
    registry.registerPath({
      method: e.method,
      path: e.path,
      operationId: e.operationId,
      summary: e.summary,
      tags: [e.tag],
      ...(e.auth === 'bearer'
        ? { security: [{ bearer: [] }] }
        : e.auth === 'cookie'
          ? { security: [{ refreshCookie: [] }] }
          : {}),
      request: {
        ...(params === undefined ? {} : { params }),
        ...(e.query === undefined ? {} : { query: e.query }),
        ...(e.body === undefined
          ? {}
          : {
              body: { content: { [e.bodyContentType ?? 'application/json']: { schema: e.body } } },
            }),
      },
      responses: {
        [status]:
          schema === null
            ? { description: status === 303 ? 'Redirect' : status === 204 ? 'No content' : 'OK' }
            : { description: 'OK', content: { 'application/json': { schema } } },
        ...(e.auth === 'public' ? {} : { 401: problem('Not authenticated') }),
        ...(e.method === 'get'
          ? {}
          : {
              400: problem('Validation error'),
              409: problem('Conflict or stale version'),
              422: problem('Business rule violation'),
            }),
        404: problem('Not found or not visible to the caller'),
        429: problem('Rate limit exceeded'),
      },
    });
  }
}
