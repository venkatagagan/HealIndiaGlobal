import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, MessageSquare, Send, Wifi, WifiOff } from 'lucide-react';
import {
  USER_ROLE_LABELS,
  errorMessage,
  messagingApi,
  type ConversationOut,
  type MessageOut,
} from '@hig/shared/api';
import { useAuth } from '../../auth/AuthProvider';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Skeleton, Spinner, Textarea } from '../../components/ui';
import { cn, formatDate, formatRelative, toDate } from '../../lib/format';
import { qk } from '../../lib/queries';
import { useRealtimeConnected, useRealtimeEvent } from '../../lib/realtime';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

const PAGE = 50;

function sortAsc(list: MessageOut[]): MessageOut[] {
  const unique = new Map(list.map((m) => [m.id, m]));
  return [...unique.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function conversationTitle(c: ConversationOut, myId: string | undefined): string {
  if (c.subject) return c.subject;
  const others = c.participants.filter((p) => p.user_id !== myId).map((p) => p.full_name);
  return others.join(', ') || 'Conversation';
}

function ConversationList({
  conversations,
  selectedId,
  myId,
  onSelect,
}: {
  conversations: ConversationOut[];
  selectedId: string | null;
  myId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const sorted = [...conversations].sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''));
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {sorted.map((c) => {
        const active = c.id === selectedId;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                active ? 'bg-brand-50 dark:bg-brand-500/10' : 'hover:bg-slate-50 dark:hover:bg-raised-dark/50',
              )}
            >
              <Avatar name={conversationTitle(c, myId)} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{conversationTitle(c, myId)}</span>
                  {c.last_message_at && <span className="shrink-0 text-[11px] text-slate-500">{formatRelative(c.last_message_at)}</span>}
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-slate-500">
                    {c.last_message ? `${c.last_message.sender.full_name}: ${c.last_message.body}` : 'No messages yet'}
                  </span>
                  {c.unread_count > 0 && <Badge tone="green">{c.unread_count}</Badge>}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Thread({ conversation, myId }: { conversation: ConversationOut; myId: string | undefined }) {
  const queryClient = useQueryClient();
  const key = qk.messages(conversation.id);
  const [draft, setDraft] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = useQuery({
    queryKey: key,
    queryFn: async () => {
      const list = await messagingApi.listMessages(conversation.id, { limit: PAGE });
      setHasMore(list.length >= PAGE);
      return sortAsc(list);
    },
  });

  const markRead = useMutation({
    mutationFn: () => messagingApi.markRead(conversation.id),
    onSuccess: () => {
      queryClient.setQueryData<ConversationOut[]>(qk.conversations, (prev) =>
        prev?.map((c) => (c.id === conversation.id ? { ...c, unread_count: 0 } : c)),
      );
    },
  });
  const { mutate: markReadMutate } = markRead;

  const lastId = messages.data?.[messages.data.length - 1]?.id;
  useEffect(() => {
    if (!lastId) return;
    bottomRef.current?.scrollIntoView({ block: 'end' });
    markReadMutate();
  }, [lastId, markReadMutate]);

  const send = useMutation({
    mutationFn: (body: string) => messagingApi.sendMessage(conversation.id, { body }),
    onSuccess: (msg) => {
      queryClient.setQueryData<MessageOut[]>(key, (prev) => sortAsc([...(prev ?? []), msg]));
      queryClient.setQueryData<ConversationOut[]>(qk.conversations, (prev) =>
        prev?.map((c) => (c.id === conversation.id ? { ...c, last_message: msg, last_message_at: msg.created_at } : c)),
      );
      setDraft('');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const loadOlder = async () => {
    const oldest = messages.data?.[0];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const older = await messagingApi.listMessages(conversation.id, { before: oldest.id, limit: PAGE });
      setHasMore(older.length >= PAGE);
      queryClient.setQueryData<MessageOut[]>(key, (prev) => sortAsc([...older, ...(prev ?? [])]));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoadingOlder(false);
    }
  };

  const submit = () => {
    const body = draft.trim();
    if (!body || send.isPending) return;
    send.mutate(body);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <p className="font-semibold text-slate-900 dark:text-white">{conversationTitle(conversation, myId)}</p>
        <p className="truncate text-xs text-slate-500">
          {conversation.participants.map((p) => `${p.full_name} (${USER_ROLE_LABELS[p.role] ?? p.role})`).join(' · ')}
          {conversation.case_id && (
            <>
              {' · '}
              <Link to={`/cases/${conversation.case_id}`} className="text-brand-600 hover:underline dark:text-brand-400">
                Open case
              </Link>
            </>
          )}
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="ml-auto h-12 w-1/2" />
          </div>
        ) : messages.isError ? (
          <ErrorState error={messages.error} onRetry={() => void messages.refetch()} />
        ) : messages.data.length === 0 ? (
          <EmptyState title="No messages yet" description="Start the conversation with the patient and their coordinator." />
        ) : (
          <>
            {hasMore && (
              <div className="text-center">
                <Button variant="ghost" size="sm" loading={loadingOlder} onClick={() => void loadOlder()}>
                  Load earlier messages
                </Button>
              </div>
            )}
            {messages.data.map((m, i, all) => {
              const mine = m.sender.id === myId;
              const day = formatDate(m.created_at);
              const prev = all[i - 1];
              const showDay = !prev || formatDate(prev.created_at) !== day;
              return (
                <div key={m.id}>
                  {showDay && <p className="my-2 text-center text-[11px] font-medium text-slate-400">{day}</p>}
                  <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm',
                        mine
                          ? 'rounded-br-sm bg-brand-700 text-white'
                          : 'rounded-bl-sm bg-slate-100 text-slate-900 dark:bg-raised-dark dark:text-slate-100',
                      )}
                    >
                      {!mine && (
                        <p className="mb-0.5 text-[11px] font-semibold opacity-80">
                          {m.sender.full_name} · {USER_ROLE_LABELS[m.sender.role] ?? m.sender.role}
                        </p>
                      )}
                      <p className="break-words whitespace-pre-wrap">{m.body}</p>
                      {m.attachment_document_ids.length > 0 && (
                        <p className="mt-1 text-[11px] opacity-80">{m.attachment_document_ids.length} attachment(s) - see case documents</p>
                      )}
                      <p className={cn('mt-0.5 text-right text-[10px]', mine ? 'text-white/80' : 'text-slate-500')}>
                        {toDate(m.created_at)?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </>
        )}
      </div>
      <form
        className="flex items-end gap-2 border-t border-slate-200 p-3 dark:border-slate-800"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="message-draft" className="sr-only">
          Message
        </label>
        <Textarea
          id="message-draft"
          rows={2}
          maxLength={5000}
          value={draft}
          placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="resize-none"
        />
        <Button type="submit" size="icon" className="h-10 w-10" aria-label="Send message" loading={send.isPending} disabled={!draft.trim()}>
          {!send.isPending && <Send className="h-4 w-4" aria-hidden />}
        </Button>
      </form>
    </div>
  );
}

export function MessagesPage() {
  useDocumentTitle('Messages');
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const connected = useRealtimeConnected();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('c');
  const conversations = useQuery({ queryKey: qk.conversations, queryFn: messagingApi.listConversations });

  useRealtimeEvent('message.created', (event) => {
    if (event.type !== 'message.created') return;
    const msg = event.data;
    if (queryClient.getQueryData(qk.messages(msg.conversation_id))) {
      queryClient.setQueryData<MessageOut[]>(qk.messages(msg.conversation_id), (prev) => sortAsc([...(prev ?? []), msg]));
    }
    const known = queryClient
      .getQueryData<ConversationOut[]>(qk.conversations)
      ?.some((c) => c.id === msg.conversation_id);
    if (!known) {
      void queryClient.invalidateQueries({ queryKey: qk.conversations });
      return;
    }
    queryClient.setQueryData<ConversationOut[]>(qk.conversations, (prev) =>
      prev?.map((c) =>
        c.id === msg.conversation_id
          ? {
              ...c,
              last_message: msg,
              last_message_at: msg.created_at,
              unread_count: msg.conversation_id === selectedId || msg.sender.id === user?.id ? c.unread_count : c.unread_count + 1,
            }
          : c,
      ),
    );
  });

  const selected = useMemo(
    () => conversations.data?.find((c) => c.id === selectedId) ?? null,
    [conversations.data, selectedId],
  );
  const select = (id: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set('c', id);
      else next.delete('c');
      return next;
    });

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Messages</h1>
          <p className="text-sm text-slate-500">Case conversations with patients, agents and care coordinators.</p>
        </div>
        <span
          className={cn('inline-flex items-center gap-1.5 text-xs', connected ? 'text-brand-600' : 'text-slate-400')}
          title={connected ? 'Live updates connected' : 'Reconnecting…'}
        >
          {connected ? <Wifi className="h-4 w-4" aria-hidden /> : <WifiOff className="h-4 w-4" aria-hidden />}
          {connected ? 'Live' : 'Offline'}
        </span>
      </div>
      <Card className="flex h-[calc(100vh-12rem)] min-h-[28rem] overflow-hidden">
        <div
          className={cn(
            'w-full shrink-0 overflow-y-auto border-r border-slate-200 md:w-80 dark:border-slate-800',
            selectedId ? 'hidden md:block' : 'block',
          )}
        >
          {conversations.isPending ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : conversations.isError ? (
            <ErrorState error={conversations.error} onRetry={() => void conversations.refetch()} />
          ) : conversations.data.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-6 w-6" aria-hidden />}
              title="No conversations"
              description="A conversation is created automatically for every new case."
            />
          ) : (
            <ConversationList conversations={conversations.data} selectedId={selectedId} myId={user?.id} onSelect={select} />
          )}
        </div>
        <div className={cn('min-w-0 flex-1', selectedId ? 'block' : 'hidden md:block')}>
          {selectedId && (
            <Button variant="ghost" size="sm" className="m-2 md:hidden" icon={<ArrowLeft className="h-4 w-4" aria-hidden />} onClick={() => select(null)}>
              Conversations
            </Button>
          )}
          {selected ? (
            <Thread key={selected.id} conversation={selected} myId={user?.id} />
          ) : selectedId && conversations.isPending ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <EmptyState
              className="h-full"
              icon={<MessageSquare className="h-6 w-6" aria-hidden />}
              title={selectedId ? 'Conversation not found' : 'Select a conversation'}
            />
          )}
        </div>
      </Card>
    </>
  );
}
