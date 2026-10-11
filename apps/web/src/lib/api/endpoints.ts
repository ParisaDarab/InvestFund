/**
 * Typed API calls (one function per endpoint), all through `apiFetch` with the shared response
 * schemas. Keep business rules out of here: this layer only moves data.
 */
import {
  AdminOverview,
  AdminReport,
  AdminReportPage,
  BlockList,
  ConnectionPage,
  ConnectionView,
  ConversationList,
  ConversationSummary,
  CurrentUser,
  DealPage,
  DealView,
  DocumentList,
  DocumentView,
  FounderProfile,
  MessagePage,
  MessageView,
  NotificationPage,
  OwnedStartup,
  OwnedStartupList,
  RecommendationPage,
  ReportReceipt,
  SessionResponse,
  StartupDetail,
  StartupPage,
  StartupRelationship,
  SupporterProfile,
  UnreadCounts,
  type ConnectionAction,
  type CreateReportRequest,
  type CreateStartupRequest,
  type DealActionRequest,
  type FounderProfileInput,
  type OfferTerms,
  type ReplaceMilestonesRequest,
  type ResolveReportRequest,
  type RespondToOfferRequest,
  type SupporterProfileInput,
  type UpdateDocumentSharingRequest,
  type UpdateStartupRequest,
} from '@investfund/shared';

import { apiFetch, buildApiUrl, ApiError } from './client';

type Query = Record<string, string | number | readonly string[] | undefined | null>;

/** `?a=1&b=x,y` from defined values only. */
export function toQuery(query: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text === '' ? '' : `?${text}`;
}

export const api = {
  // Auth (cookie)
  refresh: () => apiFetch('/auth/refresh', { method: 'POST', body: {}, schema: SessionResponse }),
  logout: () => apiFetch('/auth/logout', { method: 'POST', body: {} }),
  googleStartUrl: (returnTo?: string, loginHint?: string) =>
    buildApiUrl(`/auth/google/start${toQuery({ returnTo, loginHint })}`),

  // Account
  me: () => apiFetch('/me', { schema: CurrentUser }),
  updateMe: (body: { name?: string; emailNotifications?: boolean }) =>
    apiFetch('/me', { method: 'PATCH', body, schema: CurrentUser }),
  chooseRole: (role: 'founder' | 'supporter') =>
    apiFetch('/me/role', { method: 'POST', body: { role }, schema: CurrentUser }),
  unread: () => apiFetch('/me/unread', { schema: UnreadCounts }),
  founderProfile: () => apiFetch('/me/founder-profile', { schema: FounderProfile }),
  saveFounderProfile: (body: FounderProfileInput) =>
    apiFetch('/me/founder-profile', { method: 'PUT', body, schema: FounderProfile }),
  supporterProfile: () => apiFetch('/me/supporter-profile', { schema: SupporterProfile }),
  saveSupporterProfile: (body: SupporterProfileInput) =>
    apiFetch('/me/supporter-profile', { method: 'PUT', body, schema: SupporterProfile }),

  // Startups and discovery
  searchStartups: (query: Query) => apiFetch(`/startups${toQuery(query)}`, { schema: StartupPage }),
  startupBySlug: (slug: string) =>
    apiFetch(`/startups/by-slug/${encodeURIComponent(slug)}`, { schema: StartupDetail }),
  relationship: (id: string) =>
    apiFetch(`/startups/${id}/relationship`, { schema: StartupRelationship }),
  myStartups: () => apiFetch('/startups/mine', { schema: OwnedStartupList }),
  myStartup: (id: string) => apiFetch(`/startups/mine/${id}`, { schema: OwnedStartup }),
  createStartup: (body: CreateStartupRequest) =>
    apiFetch('/startups', { method: 'POST', body, schema: OwnedStartup }),
  updateStartup: (id: string, body: UpdateStartupRequest) =>
    apiFetch(`/startups/${id}`, { method: 'PATCH', body, schema: OwnedStartup }),
  replaceMilestones: (id: string, body: ReplaceMilestonesRequest) =>
    apiFetch(`/startups/${id}/milestones`, { method: 'PUT', body, schema: OwnedStartup }),
  startupStatus: (
    id: string,
    action: 'publish' | 'unpublish' | 'archive' | 'restore',
    version: number,
  ) =>
    apiFetch(`/startups/${id}/${action}`, {
      method: 'POST',
      body: { version },
      schema: OwnedStartup,
    }),
  save: (id: string) => apiFetch(`/startups/${id}/save`, { method: 'PUT' }),
  unsave: (id: string) => apiFetch(`/startups/${id}/save`, { method: 'DELETE' }),
  saved: () => apiFetch('/saved-startups', { schema: StartupPage }),
  recommendations: (cursor?: string) =>
    apiFetch(`/recommendations${toQuery({ cursor, limit: 12 })}`, { schema: RecommendationPage }),

  // Connections and conversations
  connections: (query: Query) =>
    apiFetch(`/connections${toQuery(query)}`, { schema: ConnectionPage }),
  requestConnection: (startupId: string, message: string | null) =>
    apiFetch('/connections', {
      method: 'POST',
      body: { startupId, message },
      schema: ConnectionView,
    }),
  actOnConnection: (id: string, action: ConnectionAction) =>
    apiFetch(`/connections/${id}/actions`, {
      method: 'POST',
      body: { action },
      schema: ConnectionView,
    }),
  conversations: () => apiFetch('/conversations', { schema: ConversationList }),
  conversation: (id: string) => apiFetch(`/conversations/${id}`, { schema: ConversationSummary }),
  messages: (id: string, cursor?: string) =>
    apiFetch(`/conversations/${id}/messages${toQuery({ cursor, limit: 30 })}`, {
      schema: MessagePage,
    }),
  sendMessage: (id: string, clientMessageId: string, body: string) =>
    apiFetch(`/conversations/${id}/messages`, {
      method: 'POST',
      body: { clientMessageId, body },
      schema: MessageView,
    }),
  markRead: (id: string) => apiFetch(`/conversations/${id}/read`, { method: 'POST' }),

  // Deals
  deals: (query: Query) => apiFetch(`/deals${toQuery(query)}`, { schema: DealPage }),
  deal: (id: string) => apiFetch(`/deals/${id}`, { schema: DealView }),
  createDeal: (connectionId: string, terms: OfferTerms) =>
    apiFetch('/deals', { method: 'POST', body: { connectionId, terms }, schema: DealView }),
  respondToOffer: (dealId: string, offerId: string, body: RespondToOfferRequest) =>
    apiFetch(`/deals/${dealId}/offers/${offerId}/respond`, {
      method: 'POST',
      body,
      schema: DealView,
    }),
  dealAction: (dealId: string, body: DealActionRequest) =>
    apiFetch(`/deals/${dealId}/actions`, { method: 'POST', body, schema: DealView }),

  // Notifications
  notifications: (query: Query) =>
    apiFetch(`/notifications${toQuery(query)}`, { schema: NotificationPage }),
  markNotificationsRead: (body: { ids: string[] } | { all: true }) =>
    apiFetch('/notifications/read', { method: 'POST', body }),

  // Documents
  documents: (startupId: string) =>
    apiFetch(`/startups/${startupId}/documents`, { schema: DocumentList }),
  updateSharing: (id: string, body: UpdateDocumentSharingRequest) =>
    apiFetch(`/documents/${id}/sharing`, { method: 'PUT', body, schema: DocumentView }),
  deleteDocument: (id: string) => apiFetch(`/documents/${id}`, { method: 'DELETE' }),

  // Moderation and admin
  blocks: () => apiFetch('/blocks', { schema: BlockList }),
  block: (userId: string) => apiFetch('/blocks', { method: 'POST', body: { userId } }),
  unblock: (userId: string) => apiFetch(`/blocks/${userId}`, { method: 'DELETE' }),
  report: (body: CreateReportRequest) =>
    apiFetch('/reports', { method: 'POST', body, schema: ReportReceipt }),
  adminOverview: () => apiFetch('/admin/overview', { schema: AdminOverview }),
  adminReports: (query: Query) =>
    apiFetch(`/admin/reports${toQuery(query)}`, { schema: AdminReportPage }),
  adminReport: (id: string) => apiFetch(`/admin/reports/${id}`, { schema: AdminReport }),
  resolveReport: (id: string, body: ResolveReportRequest) =>
    apiFetch(`/admin/reports/${id}/resolve`, { method: 'POST', body, schema: AdminReport }),
  adminUserAction: (id: string, action: 'suspend' | 'reinstate') =>
    apiFetch(`/admin/users/${id}/actions`, { method: 'POST', body: { action } }),
};

/**
 * Raw-body upload and authorised download. They bypass `apiFetch` (binary bodies) but use the
 * same base URL and access token.
 */
export async function uploadDocument(
  token: string,
  startupId: string,
  file: File,
  visibility: 'all_connections' | 'selected',
): Promise<DocumentView> {
  const url = buildApiUrl(
    `/startups/${startupId}/documents${toQuery({ fileName: file.name, visibility })}`,
  );
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: file,
    });
  } catch (cause) {
    throw new ApiError({
      kind: 'network',
      method: 'POST',
      endpoint: '/startups/documents',
      message: 'Upload failed',
      cause,
    });
  }
  const json: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const problem = json as { title?: string; detail?: string } | undefined;
    throw new ApiError({
      kind: 'http',
      method: 'POST',
      endpoint: '/startups/documents',
      status: response.status,
      message: problem?.detail ?? problem?.title ?? 'Upload failed',
    });
  }
  return DocumentView.parse(json);
}

export async function downloadDocument(
  token: string,
  documentId: string,
  fileName: string,
): Promise<void> {
  const response = await fetch(buildApiUrl(`/documents/${documentId}/download`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new ApiError({
      kind: 'http',
      method: 'GET',
      endpoint: '/documents/download',
      status: response.status,
      message: 'Download failed',
    });
  }
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(href);
  }, 10_000);
}
