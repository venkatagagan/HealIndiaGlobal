/**
 * WhatsApp updates (backend `modules/messaging/whatsapp*.py`): the signed-in user's opt-in with a 6-digit code,
 * and the staff status / delivery log (template + status only, never message bodies or secrets).
 */
import { api } from '../client';
import type { IsoDateTime, Page, PageParams, Uuid } from '../types';

export type WhatsAppOptInStatus = 'none' | 'pending' | 'active' | 'opted_out';

export interface WhatsAppStatusOut {
  /** WhatsApp is configured on this server */
  available: boolean;
  status: WhatsAppOptInStatus;
  phone_masked: string | null;
  verified_at: IsoDateTime | null;
  opted_in_at: IsoDateTime | null;
  opted_out_at: IsoDateTime | null;
  code_expires_at: IsoDateTime | null;
}

export type WhatsAppMessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped';
export const WHATSAPP_MESSAGE_STATUSES = [
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
  'skipped',
] as const satisfies readonly WhatsAppMessageStatus[];

export interface WhatsAppTemplateInfo {
  name: string;
  category: string;
  kinds: string[];
  languages: string[];
}

export interface WhatsAppProviderStatusOut {
  provider: string;
  configured: boolean;
  webhook_configured: boolean;
  verify_token_set: boolean;
  phone_number_id_set: boolean;
  graph_api_version: string;
  daily_limit_per_user: number;
  templates: WhatsAppTemplateInfo[];
  opted_in_users: number;
  pending_users: number;
  opted_out_users: number;
  sent_last_24h: number;
  failed_last_24h: number;
}

/** Admin log row: template + delivery status only (never the message text or parameters). */
export interface WhatsAppMessageOut {
  id: Uuid;
  user_id: Uuid | null;
  kind: string;
  template_name: string;
  language_code: string;
  phone_masked: string | null;
  status: WhatsAppMessageStatus;
  error_code: string | null;
  error_title: string | null;
  created_at: IsoDateTime;
  sent_at: IsoDateTime | null;
  delivered_at: IsoDateTime | null;
  read_at: IsoDateTime | null;
  failed_at: IsoDateTime | null;
}

export interface WhatsAppMessageListParams extends PageParams {
  status?: WhatsAppMessageStatus;
  template?: string;
}

export const whatsappApi = {
  status: () => api.get<WhatsAppStatusOut>('/me/whatsapp'),
  /** send a 6-digit code on WhatsApp to `phone` (E.164, e.g. +234 803 123 4567) */
  verify: (phone: string) => api.post<WhatsAppStatusOut>('/me/whatsapp/verify', { phone }),
  confirm: (code: string) => api.post<WhatsAppStatusOut>('/me/whatsapp/confirm', { code }),
  /** stop WhatsApp updates (same as replying STOP) */
  optOut: () => api.delete<WhatsAppStatusOut>('/me/whatsapp'),
};

export const adminWhatsappApi = {
  status: () => api.get<WhatsAppProviderStatusOut>('/admin/whatsapp/status'),
  messages: (params: WhatsAppMessageListParams) => api.get<Page<WhatsAppMessageOut>>('/admin/whatsapp/messages', params),
};
