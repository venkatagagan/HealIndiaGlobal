import { api } from '../client';
import type {
  ConversationCreateIn,
  ConversationOut,
  MessageCreateIn,
  MessageListParams,
  MessageOut,
  NotificationListParams,
  NotificationOut,
  Page,
  UnreadCountOut,
  Uuid,
} from '../types';
import { seg } from './_util';

/** PLAN 8.9 - conversations & messages. Realtime: `useRealtime` / `useRealtimeEvent` from @hig/shared/lib. */
export const messagingApi = {
  listConversations: () => api.get<ConversationOut[]>('/conversations'),
  createConversation: (body: ConversationCreateIn) => api.post<ConversationOut>('/conversations', body),
  /** pass `before` to page backwards */
  listMessages: (conversationId: Uuid, params?: MessageListParams) =>
    api.get<MessageOut[]>(`/conversations/${seg(conversationId)}/messages`, params),
  sendMessage: (conversationId: Uuid, body: MessageCreateIn) =>
    api.post<MessageOut>(`/conversations/${seg(conversationId)}/messages`, body),
  markRead: (conversationId: Uuid) => api.post<void>(`/conversations/${seg(conversationId)}/read`, {}),
};

/** PLAN 8.9 - notifications */
export const notificationsApi = {
  list: (params?: NotificationListParams) => api.get<Page<NotificationOut>>('/notifications', params),
  unreadCount: () => api.get<UnreadCountOut>('/notifications/unread-count'),
  markRead: (id: Uuid) => api.post<void>(`/notifications/${seg(id)}/read`, {}),
  markAllRead: () => api.post<void>('/notifications/read-all', {}),
};
