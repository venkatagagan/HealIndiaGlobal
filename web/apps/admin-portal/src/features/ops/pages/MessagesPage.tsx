import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MessageSquarePlus, Paperclip, Send } from 'lucide-react';
import {
  CONVERSATION_KIND_LABELS,
  messagingApi,
  USER_ROLE_LABELS,
  type ConversationOut,
  type MessageOut,
} from '@hig/shared/api';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, Spinner, Textarea } from '../ui';
import { FilterSearch, QuickFilters } from '@hig/shared/ui';
import { cn, formatDateTime, formatRelative, useDocumentTitle } from '../lib/format';
import { opsKeys, useOpsMutation } from '../lib/mutations';
import { opsPaths } from '../lib/paths';
import { useCurrentUser } from '../lib/session';
import { useListParams } from '../lib/useListParams';

const PAGE = 30;
const KIND_TABS = ['support', 'case', 'direct'] as const;
type KindTab = (typeof KIND_TABS)[number];
const KIND_TAB_LABELS: Record<KindTab, string> = { support: 'Support', case: 'Cases', direct: 'Direct' };

function conversationTitle(c: ConversationOut, myId: string | undefined): string {
  if (c.subject) return c.subject;
  const others = c.participants.filter((p) => p.user_id !== myId).map((p) => p.full_name);
  return others.join(', ') || CONVERSATION_KIND_LABELS[c.kind];
}

export default function MessagesPage() {
  useDocumentTitle('Support inbox');
  const me = useCurrentUser();
  const { values, set } = useListParams(['kind', 'c', 'case_id', 'q'] as const);
  const list = useQuery({
    queryKey: [...opsKeys.conversations, 'list'],
    queryFn: () => messagingApi.listConversations(),
    refetchInterval: 20_000,
  });

  const filtered = useMemo(() => {
    let rows = list.data ?? [];
    if (values.kind) rows = rows.filter((c) => c.kind === values.kind);
    if (values.q) {
      const needle = values.q.toLowerCase();
      rows = rows.filter(
        (c) =>
          conversationTitle(c, me.data?.id).toLowerCase().includes(needle) ||
          c.participants.some((p) => p.full_name.toLowerCase().includes(needle)) ||
          (c.last_message?.body ?? '').toLowerCase().includes(needle),
      );
    }
    return [...rows].sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''));
  }, [list.data, values.kind, values.q, me.data?.id]);

  // deep link from a case: open its conversation
  const caseConversation = values.case_id ? list.data?.find((c) => c.case_id === values.case_id) : undefined;
  useEffect(() => {
    if (caseConversation && values.c !== caseConversation.id) set({ c: caseConversation.id });
  }, [caseConversation, values.c, set]);

  const selected = list.data?.find((c) => c.id === values.c) ?? null;
  const unreadTotal = (list.data ?? []).reduce((a, c) => a + c.unread_count, 0);

  const startCaseConversation = useOpsMutation({
    mutationFn: () => messagingApi.createConversation({ case_id: values.case_id }),
    success: 'Conversation started',
    invalidate: [opsKeys.conversations],
    onSuccess: (c) => set({ c: c.id }),
  });

  return (
    <div>
      <PageHeader
        title="Support inbox"
        description={unreadTotal > 0 ? `${unreadTotal} unread message${unreadTotal === 1 ? '' : 's'}` : 'Conversations with patients, agents and hospitals.'}
      />
      {values.case_id && !caseConversation && list.isSuccess && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-[#161B22]">
          <span>You are not yet part of a conversation for this case.</span>
          <Button size="sm" icon={<MessageSquarePlus className="size-4" />} loading={startCaseConversation.isPending} onClick={() => startCaseConversation.mutate()}>
            Open case conversation
          </Button>
        </div>
      )}
      <div className="grid h-[calc(100vh-14rem)] min-h-[28rem] grid-cols-1 gap-4 md:grid-cols-[20rem_minmax(0,1fr)]">
        <Card className={cn('flex min-h-0 flex-col', selected && 'hidden md:flex')} bodyClassName="flex min-h-0 flex-1 flex-col p-0">
          <div className="space-y-2 border-b border-slate-200 p-3 dark:border-slate-700/60">
            <FilterSearch value={values.q} onChange={(q) => set({ q })} placeholder="Search people or messages…" label="Search conversations" />
            <QuickFilters
              label="Conversation type"
              className="-mx-1"
              value={(KIND_TABS as readonly string[]).includes(values.kind) ? (values.kind as KindTab) : ''}
              onChange={(kind) => set({ kind })}
              items={[
                { value: '', label: 'All', count: list.data?.length },
                ...KIND_TABS.map((k) => ({ value: k, label: KIND_TAB_LABELS[k], count: (list.data ?? []).filter((c) => c.kind === k).length })),
              ]}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.isLoading ? (
              <LoadingState />
            ) : list.error ? (
              <ErrorState error={list.error} onRetry={() => void list.refetch()} />
            ) : filtered.length === 0 ? (
              <EmptyState title="No conversations" />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => set({ c: c.id, case_id: null })}
                      className={cn(
                        'flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none dark:hover:bg-[#1F2630]',
                        c.id === values.c && 'bg-green-50 dark:bg-green-500/10',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn('truncate text-sm', c.unread_count > 0 && 'font-semibold')}>
                          {conversationTitle(c, me.data?.id)}
                        </span>
                        {c.unread_count > 0 && (
                          <span className="rounded-full bg-green-700 px-1.5 text-[11px] font-semibold text-white">{c.unread_count}</span>
                        )}
                      </span>
                      <span className="truncate text-xs text-slate-500">{c.last_message?.body ?? 'No messages yet'}</span>
                      <span className="flex items-center gap-2 text-[11px] text-slate-400">
                        <Badge tone={c.kind === 'support' ? 'amber' : c.kind === 'case' ? 'blue' : 'neutral'}>
                          {CONVERSATION_KIND_LABELS[c.kind]}
                        </Badge>
                        {formatRelative(c.last_message_at, '')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
        <Card className={cn('flex min-h-0 flex-col', !selected && 'hidden md:flex')} bodyClassName="flex min-h-0 flex-1 flex-col p-0">
          {selected ? (
            <Thread conversation={selected} myId={me.data?.id} onBack={() => set({ c: null })} />
          ) : (
            <EmptyState title="Select a conversation" description="Pick a conversation on the left to read and reply." />
          )}
        </Card>
      </div>
    </div>
  );
}

function Thread({ conversation, myId, onBack }: { conversation: ConversationOut; myId: string | undefined; onBack: () => void }) {
  const qc = useQueryClient();
  const key = [...opsKeys.conversations, 'messages', conversation.id];
  const messages = useInfiniteQuery({
    queryKey: key,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => messagingApi.listMessages(conversation.id, { before: pageParam, limit: PAGE }),
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE) return undefined;
      const oldest = [...lastPage].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      return oldest?.created_at;
    },
    refetchInterval: 10_000,
  });
  const [body, setBody] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const ordered = useMemo(() => {
    const all = new Map<string, MessageOut>();
    for (const page of messages.data?.pages ?? []) for (const m of page) all.set(m.id, m);
    return Array.from(all.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [messages.data]);
  const newestId = ordered[ordered.length - 1]?.id;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [newestId]);

  // mark read when opened / new messages arrive
  useEffect(() => {
    if (!newestId || conversation.unread_count === 0) return;
    messagingApi
      .markRead(conversation.id)
      .then(() => qc.invalidateQueries({ queryKey: [...opsKeys.conversations, 'list'] }))
      .catch(() => undefined);
  }, [newestId, conversation.id, conversation.unread_count, qc]);

  const send = useOpsMutation({
    mutationFn: (text: string) => messagingApi.sendMessage(conversation.id, { body: text }),
    invalidate: [key, [...opsKeys.conversations, 'list']],
    onSuccess: () => setBody(''),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (text) send.mutate(text);
  };

  return (
    <>
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700/60">
        <Button variant="ghost" size="sm" className="md:hidden" aria-label="Back to conversations" icon={<ArrowLeft className="size-4" />} onClick={onBack} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{conversationTitle(conversation, myId)}</p>
          <p className="truncate text-xs text-slate-500">
            {conversation.participants.map((p) => `${p.full_name} (${USER_ROLE_LABELS[p.role] ?? p.role})`).join(' · ')}
          </p>
        </div>
        {conversation.case_id && (
          <Link to={opsPaths.case(conversation.case_id)} className="shrink-0 text-xs text-green-700 hover:underline dark:text-green-400">
            Open case
          </Link>
        )}
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
        {messages.hasNextPage && (
          <div className="text-center">
            <Button variant="ghost" size="sm" loading={messages.isFetchingNextPage} onClick={() => void messages.fetchNextPage()}>
              Load earlier messages
            </Button>
          </div>
        )}
        {messages.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : messages.error ? (
          <ErrorState error={messages.error} onRetry={() => void messages.refetch()} />
        ) : ordered.length === 0 ? (
          <EmptyState title="No messages yet" description="Send the first message below." />
        ) : (
          ordered.map((m) => {
            const mine = m.sender.id === myId;
            return (
              <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                    mine ? 'rounded-br-sm bg-green-700 text-white' : 'rounded-bl-sm bg-slate-100 text-slate-900 dark:bg-[#1F2630] dark:text-slate-100',
                  )}
                >
                  {!mine && (
                    <p className="mb-0.5 text-[11px] font-semibold opacity-80">
                      {m.sender.full_name} · {USER_ROLE_LABELS[m.sender.role] ?? m.sender.role}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  {m.attachment_document_ids.length > 0 && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] opacity-80">
                      <Paperclip className="size-3" aria-hidden /> {m.attachment_document_ids.length} attachment
                      {m.attachment_document_ids.length === 1 ? '' : 's'} (see case documents)
                    </p>
                  )}
                  <p className={cn('mt-0.5 text-right text-[10px]', mine ? 'text-white/80' : 'text-slate-500')}>
                    {formatDateTime(m.created_at, 'd MMM, HH:mm')}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={submit} className="flex items-end gap-2 border-t border-slate-200 p-3 dark:border-slate-700/60">
        <Textarea
          aria-label="Message"
          rows={2}
          value={body}
          maxLength={5000}
          placeholder="Write a reply… (Ctrl+Enter to send)"
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              const text = body.trim();
              if (text && !send.isPending) send.mutate(text);
            }
          }}
        />
        <Button type="submit" loading={send.isPending} disabled={!body.trim()} icon={<Send className="size-4" />}>
          Send
        </Button>
      </form>
    </>
  );
}
