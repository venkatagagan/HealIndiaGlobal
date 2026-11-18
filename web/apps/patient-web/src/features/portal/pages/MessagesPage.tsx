import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, EyeOff, LifeBuoy, Paperclip, Send, X } from 'lucide-react';
import { documentsApi, errorMessage, type ConversationOut, type DocumentOut, type MessageOut } from '@hig/shared/api';
import { ReportButton } from '@hig/shared/ui';
import {
  useConversations,
  useCreateConversation,
  useMarkConversationRead,
  useMessages,
  useSendMessage,
} from '../api/queries';
import { useAppTranslation } from '../../../i18n';
import { Avatar, UploadButton } from '../components/common';
import { useRealtimeConnection } from '../lib/realtime';
import { paths } from '../lib/paths';
import { useMe } from '../lib/session';
import { cn, formatDate, formatRelative, formatTime, useDocumentTitle } from '../lib/shared';
import { Button, EmptyState, ErrorState, Skeleton, SkeletonList, Textarea } from '../ui/primitives';

type TFn = ReturnType<typeof useAppTranslation>['t'];

function conversationTitle(t: TFn, c: ConversationOut, myId: string | undefined): string {
  if (c.subject) return c.subject;
  const others = c.participants.filter((p) => p.user_id !== myId).map((p) => p.full_name);
  return others.length ? others.join(', ') : c.kind === 'support' ? t('messages.support') : t('messages.conversation');
}

export function MessagesPage() {
  const { conversationId } = useParams();
  const { t } = useAppTranslation();
  useDocumentTitle(t('messages.title'));
  const navigate = useNavigate();
  const me = useMe();
  const conversations = useConversations();
  const create = useCreateConversation();
  const realtime = useRealtimeConnection(true);

  const sorted = [...(conversations.data ?? [])].sort((a, b) =>
    (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''),
  );
  const active = sorted.find((c) => c.id === conversationId) ?? null;

  async function contactSupport() {
    const existing = sorted.find((c) => c.kind === 'support');
    if (existing) {
      navigate(paths.conversation(existing.id));
      return;
    }
    try {
      const created = await create.mutateAsync({ subject: t('messages.support') });
      navigate(paths.conversation(created.id));
    } catch (err) {
      toast.error(errorMessage(err, t('messages.supportFailed')));
    }
  }

  return (
    <div className="-mt-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t('messages.title')}</h1>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-slate-500" aria-live="polite">
            <span className={cn('h-2 w-2 rounded-full', realtime === 'open' ? 'bg-green-500' : 'bg-slate-400')} aria-hidden />
            {realtime === 'open' ? t('messages.live') : t('messages.connecting')}
          </span>
          <Button variant="outline" size="sm" icon={<LifeBuoy className="h-4 w-4" aria-hidden />} onClick={() => void contactSupport()} loading={create.isPending}>
            {t('messages.contactSupport')}
          </Button>
        </div>
      </div>
      <div className="grid h-[calc(100vh-13rem)] min-h-[28rem] overflow-hidden rounded-2xl border border-slate-200 bg-white md:grid-cols-[18rem_1fr] dark:border-slate-800 dark:bg-[#161B22]">
        <aside className={cn('overflow-y-auto border-e border-slate-200 dark:border-slate-800', conversationId && 'hidden md:block')}>
          {conversations.isPending ? (
            <div className="p-4">
              <SkeletonList rows={4} />
            </div>
          ) : conversations.isError ? (
            <div className="p-4">
              <ErrorState error={conversations.error} onRetry={() => void conversations.refetch()} />
            </div>
          ) : sorted.length === 0 ? (
            <div className="p-4">
              <EmptyState title={t('messages.emptyTitle')} description={t('messages.emptyText')} />
            </div>
          ) : (
            <ul>
              {sorted.map((c) => {
                const title = conversationTitle(t, c, me.data?.id);
                return (
                  <li key={c.id}>
                    <Link
                      to={paths.conversation(c.id)}
                      className={cn(
                        'flex gap-3 border-b border-slate-100 px-4 py-3 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900',
                        c.id === conversationId && 'bg-green-50 dark:bg-green-500/10',
                      )}
                    >
                      <Avatar name={title} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn('truncate text-sm', c.unread_count ? 'font-bold' : 'font-medium')}>{title}</p>
                          {c.last_message_at ? <span className="shrink-0 text-[11px] text-slate-500">{formatRelative(c.last_message_at)}</span> : null}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs text-slate-500">{c.last_message?.body ?? t('messages.noMessages')}</p>
                          {c.unread_count ? (
                            <span className="rounded-full bg-green-700 px-1.5 text-[11px] font-semibold text-white">{c.unread_count}</span>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
        <section className={cn('flex min-h-0 flex-col', !conversationId && 'hidden md:flex')}>
          {conversationId ? (
            active || conversations.isPending ? (
              <ChatPane key={conversationId} conversationId={conversationId} conversation={active} myId={me.data?.id} />
            ) : (
              <div className="p-6">
                <EmptyState title={t('messages.notFound')} action={<Link to={paths.messages} className="text-green-600">{t('messages.backToMessages')}</Link>} />
              </div>
            )
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState title={t('messages.selectTitle')} description={t('messages.selectText')} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ChatPane({
  conversationId,
  conversation,
  myId,
}: {
  conversationId: string;
  conversation: ConversationOut | null;
  myId: string | undefined;
}) {
  const { t } = useAppTranslation();
  const messages = useMessages(conversationId);
  const send = useSendMessage(conversationId);
  const markRead = useMarkConversationRead();
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<DocumentOut[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const count = messages.data?.length ?? 0;
  const { mutate: markReadMutate } = markRead;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
    if (count > 0) markReadMutate(conversationId);
  }, [count, conversationId, markReadMutate]);

  const ordered = [...(messages.data ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = body.trim();
    if (!text && attachments.length === 0) return;
    try {
      await send.mutateAsync({
        body: text || t('messages.sharedDocument'),
        ...(attachments.length ? { attachment_document_ids: attachments.map((a) => a.id) } : {}),
      });
      setBody('');
      setAttachments([]);
    } catch (err) {
      toast.error(errorMessage(err, t('messages.notSent')));
    }
  }

  const title = conversation ? conversationTitle(t, conversation, myId) : t('messages.conversation');

  return (
    <>
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <Link to={paths.messages} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 md:hidden dark:hover:bg-slate-800" aria-label={t('messages.backToConversations')}>
          <ArrowLeft className="h-5 w-5 rtl:-scale-x-100" />
        </Link>
        <Avatar name={title} size={36} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{title}</p>
          {conversation ? (
            <p className="truncate text-xs text-slate-500">
              {conversation.participants.map((p) => p.full_name).join(', ')}
              {conversation.case_id ? (
                <>
                  {' · '}
                  <Link to={paths.case(conversation.case_id)} className="text-green-700 hover:underline dark:text-green-400">
                    {t('messages.viewCase')}
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite" aria-relevant="additions">
        {messages.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="ms-auto h-12 w-1/2" />
          </div>
        ) : messages.isError ? (
          <ErrorState error={messages.error} onRetry={() => void messages.refetch()} />
        ) : ordered.length === 0 ? (
          <p className="pt-10 text-center text-sm text-slate-500">{t('messages.sayHello')}</p>
        ) : (
          ordered.map((m, i) => {
            const prev = ordered[i - 1];
            const newDay = !prev || formatDate(prev.created_at) !== formatDate(m.created_at);
            return (
              <div key={m.id}>
                {newDay ? <p className="my-2 text-center text-xs text-slate-400">{formatDate(m.created_at, 'EEEE d MMMM')}</p> : null}
                <MessageBubble message={m} mine={m.sender.id === myId} />
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={(e) => void submit(e)} className="border-t border-slate-200 p-3 dark:border-slate-800">
        {attachments.length ? (
          <ul className="mb-2 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <li key={a.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs dark:bg-slate-800">
                <Paperclip className="h-3 w-3" aria-hidden /> {a.file_name}
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                  aria-label={t('messages.removeAttachment', { name: a.file_name })}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex items-end gap-2">
          <UploadButton
            kind="other"
            caseId={conversation?.case_id ?? undefined}
            label=""
            variant="outline"
            onUploaded={(doc) => setAttachments((prev) => [...prev, doc])}
          />
          <Textarea
            rows={1}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder={t('messages.placeholder')}
            aria-label={t('messages.messageLabel')}
            maxLength={5000}
            className="max-h-40 min-h-10 resize-y"
          />
          <Button type="submit" loading={send.isPending} disabled={!body.trim() && attachments.length === 0} aria-label={t('messages.send')} icon={<Send className="h-4 w-4" aria-hidden />} />
        </div>
      </form>
    </>
  );
}

function MessageBubble({ message, mine }: { message: MessageOut; mine: boolean }) {
  const { t } = useAppTranslation();
  async function openAttachment(id: string) {
    try {
      const doc = await documentsApi.get(id);
      await documentsApi.downloadAndSave(doc);
    } catch (err) {
      toast.error(errorMessage(err, t('messages.attachmentUnavailable')));
    }
  }
  return (
    <div className={cn('group flex flex-col', mine ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm',
          mine ? 'rounded-ee-sm bg-green-700 text-white' : 'rounded-es-sm bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100',
        )}
      >
        {!mine ? (
          <p className="mb-0.5 text-xs font-semibold text-violet-600 dark:text-violet-400">
            {message.sender.full_name}
            <span className="font-normal text-slate-500"> · {message.sender.role === 'hospital' ? t('messages.roles.hospital') : message.sender.role === 'patient' ? t('messages.roles.patient') : t('messages.roles.team')}</span>
          </p>
        ) : null}
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        {message.attachment_document_ids.length ? (
          <ul className="mt-1 space-y-0.5">
            {message.attachment_document_ids.map((id, idx) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => void openAttachment(id)}
                  className={cn('inline-flex items-center gap-1 text-xs underline', mine ? 'text-white/90' : 'text-green-700 dark:text-green-400')}
                >
                  <Paperclip className="h-3 w-3" aria-hidden /> {t('messages.attachment', { n: idx + 1 })}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <p className={cn('mt-0.5 text-end text-[10px]', mine ? 'text-white/80' : 'text-slate-500')}>{formatTime(message.created_at)}</p>
      </div>
      {message.hidden ? (
        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500">
          <EyeOff className="h-3 w-3" aria-hidden /> {t('messages.hidden')}
        </p>
      ) : null}
      {!mine ? (
        <ReportButton
          targetType="message"
          targetId={message.id}
          aria-label={t('messages.reportFrom', { name: message.sender.full_name })}
          className="mt-0.5 h-6 px-1.5 text-[11px]"
        />
      ) : null}
    </div>
  );
}
