/** Builds every domain module's router for `createApp` (mounted under `/api/v1`). */
import { buildAdminRoutes } from './admin/admin.routes.js';
import { buildAuthRoutes } from './auth/auth.routes.js';
import { buildConnectionRoutes } from './connections/connections.routes.js';
import { buildConversationRoutes } from './conversations/conversations.routes.js';
import { buildDealRoutes } from './deals/deals.routes.js';
import { buildDocumentRoutes } from './documents/documents.routes.js';
import { buildBlockRoutes, buildReportRoutes } from './moderation/moderation.routes.js';
import { buildNotificationRoutes } from './notifications/notifications.routes.js';
import { buildRealtimeRoutes } from './realtime/realtime.routes.js';
import {
  buildRecommendationRoutes,
  buildSavedRoutes,
  buildStartupRoutes,
} from './startups/startups.routes.js';
import { buildUserRoutes } from './users/users.routes.js';

import type { ApiModule } from '../app.js';
import type { ModuleContext } from './context.js';

export function buildModules(ctx: ModuleContext): ApiModule[] {
  const docs = buildDocumentRoutes(ctx);
  return [
    { path: '/auth', router: buildAuthRoutes(ctx) },
    { path: '/me', router: buildUserRoutes(ctx) },
    // Before `/startups` so `/startups/:id/documents` is not taken by the status-action route.
    { path: '/startups/:startupId/documents', router: docs.startupDocuments },
    { path: '/startups', router: buildStartupRoutes(ctx) },
    { path: '/recommendations', router: buildRecommendationRoutes(ctx) },
    { path: '/saved-startups', router: buildSavedRoutes(ctx) },
    { path: '/connections', router: buildConnectionRoutes(ctx) },
    { path: '/conversations', router: buildConversationRoutes(ctx) },
    { path: '/deals', router: buildDealRoutes(ctx) },
    { path: '/notifications', router: buildNotificationRoutes(ctx) },
    { path: '/documents', router: docs.documents },
    { path: '/blocks', router: buildBlockRoutes(ctx) },
    { path: '/reports', router: buildReportRoutes(ctx) },
    { path: '/admin', router: buildAdminRoutes(ctx) },
    { path: '/realtime', router: buildRealtimeRoutes(ctx) },
  ];
}
