import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, Headset, MessageSquare, Plus, Send } from 'lucide-react';
import {
  USER_ROLE_LABELS,
  errorMessage,
  messagingApi,
  type ConversationOut,
  type MessageOut,
} from '@hig/shared/api';
import { useAuth } from '../../auth/AuthProvider';
import { Button, Card, EmptyState, ErrorState, FormField, Input, LoadingBlock, Modal, Spinner, Textarea } from '../../components/ui';
import { initials } from '../../lib/format';
import { qk } from '../../lib/queries';
import { useRealtimeConnected, useRealtimeEvent } from '../../lib/realtime';
import { cn, formatDate, formatRelative, formatTime, useDocumentTitle } from '../../lib/shared';

const PAGE = 30;

function title(c: ConversationOut, myId: string | undefined): string {
  if (c.subject) return c.subject;
  const others = c.participants.filter((p) => p.user_id !== myId).map((p) => p.full_name);
  return others.length ? others.slice(0, 3).join(', ') : c.kind === 'support' ? 'Support' : 'Conversation';
}

function sortAsc(messages: MessageOut[]): MessageOut[] {
  return [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function MessagesPage() {
  useDocumentTitle('Messages');
  const { conversationId } = useParams();
  const [params] = useSearchParams();
  const caseId = params.get('case');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const connected = useRealtimeConnected();
  const [newOpen, setNewOpen] = useState(false);

  const conversations = useQuery({
    queryKey: qk.conversations,
    queryFn: messagingApi.listConversations,
    refetchInterval: connected ? false : 30_000,
  });

  // /messages?case=<id>: open (or create) the case conversation
  const resolving = useRef(false);
  useEffect(() => {
    if (!caseId || !conversations.data || resolving.current) return;
    const existing = conversations.data.find((c) => c.case_id === caseId);
    if (existing) {
      navigate(`/messages/${existing.id}`, { replace: true });
      return;
    }
    resolving.current = true;
    messagingApi
      .createConversation({ case_id: caseId })
      .then((created) => {
        void queryClient.invalidateQueries({ queryKey: qk.conversations });
        navigate(`/messages/${created.id}`, { replace: true });
      })
      .catch((error: unknown) => {
        toast.error(errorMessage(error));
        navigate('/messages', { replace: true });
      })
      .finally(() => {
        resolving.current = false;
      });
  }, [caseId, conversations.data, navigate, queryClient]);

  const selected = conversations.data?.find((c) => c.id === conversationId) ?? null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
          <p className="text-sm text-muted">Talk to hospitals, coordinators and support about your cases.</p>
        </div>
        <Button variant="outline" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setNewOpen(true)}>
          Contact support
        </Button>
      </div>
      <Card className="flex h-[calc(100vh-13rem)] min-h-[480px] overflow-hidden">
        <aside className={cn('w-full shrink-0 border-r border-border md:w-80', conversationId && 'hidden md:block')} aria-label="Conversations">
          {conversations.isPending ? (
            <LoadingBlock />
          ) : conversations.isError ? (
            <ErrorState error={conversations.error} onRetry={() => void conversations.refetch()} />
          ) : conversations.data.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-6 w-6" />}
              title="No conversations yet"
              description="A conversation is created automatically for every case."
            />
          ) : (
            <ul className="h-full divide-y divide-border overflow-y-auto">
              {[...conversations.data]
                .sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''))
                .map((c) => (
                  <li key={c.id}>
                    <Link
                      to={`/messages/${c.id}`}
                      aria-current={c.id === conversationId ? 'page' : undefined}
                      className={cn('block px-4 py-3 hover:bg-surface-2', c.id === conversationId && 'bg-primary-soft')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{title(c, user?.id)}</p>
                        {c.last_message_at && <span className="shrink-0 text-xs text-muted">{formatRelative(c.last_message_at)}</span>}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs text-muted">
                          {c.last_message ? `${c.last_message.sender.full_name}: ${c.last_message.body}` : 'No messages yet'}
                        </p>
                        {c.unread_count > 0 && (
                          <span className="rounded-full bg-primary-700 px-1.5 text-xs font-semibold text-white">{c.unread_count}</span>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </aside>
        <section className={cn('min-w-0 flex-1 flex-col', conversationId ? 'flex' : 'hidden md:flex')}>
          {caseId ? (
            <LoadingBlock label="Opening case conversation…" />
          ) : selected ? (
            <Thread key={selected.id} conversation={selected} myId={user?.id} />
          ) : conversationId && conversations.isSuccess ? (
            <EmptyState title="Conversation not found" description="It may have been removed or you no longer have access." />
          ) : (
            <EmptyState icon={<MessageSquare className="h-6 w-6" />} title="Select a conversation" className="h-full" />
          )}
        </section>
      </Card>
      <NewSupportConversation open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

function Thread({ conversation, myId }: { conversation: ConversationOut; myId: string | undefined }) {
  const queryClient = useQueryClient();
  const key = qk.messages(conversation.id);
  const [body, setBody] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const messages = useInfiniteQuery({
    queryKey: key,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => messagingApi.listMessages(conversation.id, { limit: PAGE, ...(pageParam ? { before: pageParam } : {}) }),
    getNextPageParam: (last) => (last.length < PAGE ? undefined : sortAsc(last)[0]?.id),
  });

  const all = useMemo(() => {
    const seen = new Set<string>();
    const out: MessageOut[] = [];
    for (const page of messages.data?.pages ?? []) {
      for (const m of page) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          out.push(m);
        }
      }
    }
    return sortAsc(out);
  }, [messages.data]);

  // mark read when opened and whenever new messages arrive
  const lastId = all[all.length - 1]?.id;
  useEffect(() => {
    if (!lastId) return;
    void messagingApi
      .markRead(conversation.id)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: qk.conversations });
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      })
      .catch(() => undefined);
  }, [conversation.id, lastId, queryClient]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [all.length]);

  useRealtimeEvent('message.created', (event) => {
    const m = event.data;
    if (m.conversation_id !== conversation.id) return;
    queryClient.setQueryData<InfiniteData<MessageOut[], string | undefined>>(key, (old) => {
      if (!old) return old;
      if (old.pages.some((p) => p.some((x) => x.id === m.id))) return old;
      const [first, ...rest] = old.pages;
      return { ...old, pages: [[...(first ?? []), m], ...rest] };
    });
  });

  const send = useMutation({
    mutationFn: (text: string) => messagingApi.sendMessage(conversation.id, { body: text }),
    onSuccess: (m) => {
      setBody('');
      stickToBottom.current = true;
      queryClient.setQueryData<InfiniteData<MessageOut[], string | undefined>>(key, (old) => {
        if (!old) return old;
        if (old.pages.some((p) => p.some((x) => x.id === m.id))) return old;
        const [first, ...rest] = old.pages;
        return { ...old, pages: [[...(first ?? []), m], ...rest] };
      });
      void queryClient.invalidateQueries({ queryKey: qk.conversations });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const submit = () => {
    const text = body.trim();
    if (!text || send.isPending) return;
    send.mutate(text);
  };

  return (
    <>
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Link to="/messages" className="rounded p-1 text-muted hover:text-fg md:hidden" aria-label="Back to conversations">
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{title(conversation, myId)}</p>
          <p className="truncate text-xs text-muted">
            {conversation.participants.map((p) => `${p.full_name} (${USER_ROLE_LABELS[p.role] ?? p.role})`).join(' · ')}
          </p>
        </div>
        {conversation.case_id && (
          <Link to={`/cases/${conversation.case_id}`} className="shrink-0 text-sm font-medium text-primary-ink hover:underline">
            Open case
          </Link>
        )}
      </header>
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        aria-live="polite"
      >
        {messages.hasNextPage && (
          <div className="flex justify-center">
            <Button size="sm" variant="ghost" loading={messages.isFetchingNextPage} onClick={() => void messages.fetchNextPage()}>
              Load earlier messages
            </Button>
          </div>
        )}
        {messages.isPending ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : messages.isError ? (
          <ErrorState error={messages.error} onRetry={() => void messages.refetch()} />
        ) : all.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">No messages yet. Say hello 👋</p>
        ) : (
          all.map((m, i) => {
            const mine = m.sender.id === myId;
            const prev = all[i - 1];
            const newDay = !prev || prev.created_at.slice(0, 10) !== m.created_at.slice(0, 10);
            return (
              <div key={m.id}>
                {newDay && <p className="my-2 text-center text-xs text-muted">{formatDate(m.created_at, 'EEEE, d MMM yyyy')}</p>}
                <div className={cn('flex items-end gap-2', mine && 'flex-row-reverse')}>
                  {!mine && (
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-violet-700 dark:text-violet-300"
                      aria-hidden
                    >
                      {initials(m.sender.full_name)}
                    </span>
                  )}
                  <div className={cn('max-w-[75%] rounded-2xl px-3.5 py-2 text-sm', mine ? 'rounded-br-sm bg-primary-700 text-white' : 'rounded-bl-sm bg-surface-2')}>
                    {!mine && (
                      <p className="mb-0.5 text-xs font-semibold">
                        {m.sender.full_name} <span className="font-normal text-muted">· {USER_ROLE_LABELS[m.sender.role] ?? m.sender.role}</span>
                      </p>
                    )}
                    <p className="break-words whitespace-pre-wrap">{m.body}</p>
                    {m.attachment_document_ids.length > 0 && (
                      <p className={cn('mt-1 text-xs', mine ? 'text-white/80' : 'text-muted')}>
                        {m.attachment_document_ids.length} attachment{m.attachment_document_ids.length === 1 ? '' : 's'} — see case documents
                      </p>
                    )}
                    <p className={cn('mt-1 text-right text-[10px]', mine ? 'text-white/70' : 'text-muted')}>{formatTime(m.created_at)}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="composer" className="sr-only">
          Message
        </label>
        <Textarea
          id="composer"
          rows={1}
          maxLength={5000}
          className="max-h-40 min-h-10 resize-none"
          placeholder="Write a message…  (Enter to send, Shift+Enter for a new line)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button type="submit" size="icon" aria-label="Send message" loading={send.isPending} disabled={!body.trim()} icon={send.isPending ? undefined : <Send className="h-4 w-4" aria-hidden />} />
      </form>
    </>
  );
}

function NewSupportConversation({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const create = useMutation({
    mutationFn: async () => {
      const conversation = await messagingApi.createConversation({ subject: subject.trim() });
      if (message.trim()) await messagingApi.sendMessage(conversation.id, { body: message.trim() });
      return conversation;
    },
    onSuccess: (conversation) => {
      void queryClient.invalidateQueries({ queryKey: qk.conversations });
      setSubject('');
      setMessage('');
      onClose();
      navigate(`/messages/${conversation.id}`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <Headset className="h-5 w-5 text-primary" aria-hidden /> Contact support
        </span>
      }
      description="Our patient-care team usually replies within a few hours."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={create.isPending} disabled={subject.trim().length < 3} onClick={() => create.mutate()}>
            Start conversation
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Subject" htmlFor="sup-subject" required>
          <Input id="sup-subject" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
        </FormField>
        <FormField label="Message" htmlFor="sup-message">
          <Textarea id="sup-message" rows={4} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
