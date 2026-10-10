/**
 * Email copy for notification types. Short, factual and free of confidential content: no message
 * text, offer conditions, amounts in disputes or documents. The link always points to the app,
 * where the user must sign in to see details.
 */
import type { NotificationType } from '@investfund/shared';

type Data = Readonly<Record<string, string>>;

const COPY: Record<NotificationType, (d: Data) => { subject: string; line: string }> = {
  connection_requested: (d) => ({
    subject: `New connection request for ${d.startupName ?? 'your startup'}`,
    line: `${d.actorName ?? 'A supporter'} would like to connect about ${d.startupName ?? 'your startup'}.`,
  }),
  connection_accepted: (d) => ({
    subject: `${d.startupName ?? 'A founder'} accepted your connection request`,
    line: 'You can now message each other privately on InvestFund.',
  }),
  connection_declined: (d) => ({
    subject: `Update on your request to ${d.startupName ?? 'a startup'}`,
    line: 'The founder declined your connection request.',
  }),
  message_received: (d) => ({
    subject: `New message from ${d.actorName ?? 'a connection'}`,
    line: `You have a new message about ${d.startupName ?? 'a startup'}.`,
  }),
  offer_received: (d) => ({
    subject: `New funding proposal for ${d.startupName ?? 'your startup'}`,
    line: `${d.actorName ?? 'Someone'} sent a funding proposal. Review it on InvestFund.`,
  }),
  offer_countered: (d) => ({
    subject: `Counteroffer received for ${d.startupName ?? 'a startup'}`,
    line: `${d.actorName ?? 'The other party'} proposed different terms.`,
  }),
  offer_revised: (d) => ({
    subject: `Proposal updated for ${d.startupName ?? 'a startup'}`,
    line: `${d.actorName ?? 'The other party'} revised their proposal.`,
  }),
  offer_accepted: (d) => ({
    subject: `Proposal accepted for ${d.startupName ?? 'a startup'}`,
    line: 'Your proposal was accepted on the platform. This is not a payment or a legal agreement.',
  }),
  offer_declined: (d) => ({
    subject: `Proposal declined for ${d.startupName ?? 'a startup'}`,
    line: `${d.actorName ?? 'The other party'} declined the proposal.`,
  }),
  offer_withdrawn: (d) => ({
    subject: `Proposal withdrawn for ${d.startupName ?? 'a startup'}`,
    line: `${d.actorName ?? 'The other party'} withdrew their proposal.`,
  }),
  offer_expired: (d) => ({
    subject: `Proposal expired for ${d.startupName ?? 'a startup'}`,
    line: 'A proposal passed its response deadline without an answer.',
  }),
  funding_reported: (d) => ({
    subject: `Funding reported for ${d.startupName ?? 'your startup'}`,
    line: `${d.actorName ?? 'The supporter'} reported sending funds outside the platform. Please confirm whether you received them.`,
  }),
  receipt_confirmed: (d) => ({
    subject: `Receipt confirmed for ${d.startupName ?? 'a startup'}`,
    line: 'The founder confirmed receipt of the reported funds.',
  }),
  receipt_disputed: (d) => ({
    subject: `Receipt not confirmed for ${d.startupName ?? 'a startup'}`,
    line: 'The founder reported that the funds have not been received yet.',
  }),
  deal_completed: (d) => ({
    subject: `Funding outcome completed for ${d.startupName ?? 'a startup'}`,
    line: 'Both parties have confirmed the reported funding.',
  }),
  cancellation_requested: (d) => ({
    subject: `Cancellation requested for ${d.startupName ?? 'a startup'}`,
    line: `${d.actorName ?? 'The other party'} asked to cancel the agreed funding. Please respond on InvestFund.`,
  }),
  cancellation_rejected: (d) => ({
    subject: `Cancellation not agreed for ${d.startupName ?? 'a startup'}`,
    line: 'Your cancellation request was not agreed.',
  }),
  cancellation_withdrawn: (d) => ({
    subject: `Cancellation request withdrawn for ${d.startupName ?? 'a startup'}`,
    line: 'The cancellation request was withdrawn.',
  }),
  deal_cancelled: (d) => ({
    subject: `Funding cancelled for ${d.startupName ?? 'a startup'}`,
    line: 'The agreed funding was cancelled. The reason is recorded on InvestFund.',
  }),
  document_shared: (d) => ({
    subject: `A document was shared with you`,
    line: `${d.startupName ?? 'A startup'} shared a confidential document with you.`,
  }),
  report_resolved: () => ({
    subject: 'Your report has been reviewed',
    line: 'An administrator reviewed a report you submitted. Thank you for helping keep InvestFund safe.',
  }),
  startup_archived_by_admin: (d) => ({
    subject: `${d.startupName ?? 'Your startup'} was archived by an administrator`,
    line: 'An administrator archived this listing after a review. Contact support if you believe this is a mistake.',
  }),
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);

export function renderEmail(
  template: string,
  data: Data,
  webOrigin: string,
): { subject: string; text: string; html: string } | null {
  const copy = COPY[template as NotificationType] as
    ((d: Data) => { subject: string; line: string }) | undefined;
  if (copy === undefined) return null;
  const { subject, line } = copy(data);
  const link = new URL(data.link ?? '/app', webOrigin).toString();
  const footer =
    'You receive this because you have an InvestFund account. Manage email notifications in Settings.';
  return {
    subject,
    text: `${line}\n\nOpen InvestFund: ${link}\n\n${footer}\n`,
    html: `<p>${escapeHtml(line)}</p><p><a href="${escapeHtml(link)}">Open InvestFund</a></p><p style="color:#666;font-size:12px">${escapeHtml(footer)}</p>`,
  };
}
