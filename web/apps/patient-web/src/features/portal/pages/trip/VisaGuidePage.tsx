/**
 * Visa guide by nationality (GET /travel/visa-guide): route, checklist (ticks kept in this browser only),
 * processing time, attendants and the official website; plus the hospital's invitation letter once issued
 * (when opened from a trip: ?booking=<id>).
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { CheckCircle2, Circle, Download, ExternalLink, FileText, Globe2, Info, Timer, Users } from 'lucide-react';
import { documentsApi, errorMessage, type VisaLetterFields, type VisaRoute } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { useVisaGuide } from '../../api/phase1';
import { useBooking, usePatientProfile, useVisaRequests } from '../../api/queries';
import { BackLink, StatusBadge } from '../../components/common';
import { countryName, countryOptions } from '../../lib/countries';
import { paths } from '../../lib/paths';
import { useMe } from '../../lib/session';
import { cn, formatDate, formatNumber, prefs, useDocumentTitle } from '../../lib/shared';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  ProgressBar,
  Select,
  Skeleton,
} from '../../ui/primitives';

const ROUTE_KEYS: Record<VisaRoute, { title: string; body: string }> = {
  e_visa: { title: 'visaGuide.route.eVisa', body: 'visaGuide.route.eVisaBody' },
  regular_visa: { title: 'visaGuide.route.regular', body: 'visaGuide.route.regularBody' },
  not_required: { title: 'visaGuide.route.none', body: 'visaGuide.route.noneBody' },
};

function readTicks(key: string): string[] {
  try {
    const raw = prefs.get(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeTicks(key: string, ticks: string[]) {
  try {
    prefs.set(key, JSON.stringify(ticks));
  } catch {
    /* storage unavailable */
  }
}

function InvitationLetters({ bookingId }: { bookingId: string }) {
  const { t } = useAppTranslation();
  const booking = useBooking(bookingId);
  const visa = useVisaRequests({ case_id: booking.data?.case_id, page_size: 20 }, !!booking.data);
  if (!booking.data || !visa.data) return null;
  const items = visa.data.items as (typeof visa.data.items[number] & VisaLetterFields)[];
  if (!items.length) return null;

  async function download(id: string) {
    try {
      await documentsApi.downloadAndSave({ id, file_name: 'invitation-letter.pdf' });
    } catch (err) {
      toast.error(errorMessage(err, t('trip.hub.downloadFailed')));
    }
  }

  return (
    <Card>
      <CardHeader title={t('visaGuide.letterTitle')} description={t('visaGuide.letterHint')} />
      <CardBody>
        <ul className="space-y-2">
          {items.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-fg">{t(`visaGuide.type.${v.visa_type}`, { defaultValue: v.visa_type })}</p>
                {v.invitation_letter_approved_at ? (
                  <p className="text-xs text-muted">{t('visaGuide.letterIssued', { date: formatDate(v.invitation_letter_approved_at) })}</p>
                ) : (
                  <p className="text-xs text-muted">{t('visaGuide.letterPending')}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={v.status} />
                {v.invitation_letter_document_id ? (
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Download className="size-4" aria-hidden />}
                    onClick={() => void download(v.invitation_letter_document_id as string)}
                  >
                    {t('visaGuide.downloadLetter')}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

export function VisaGuidePage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('visaGuide.title'));
  const [params, setParams] = useSearchParams();
  const me = useMe();
  const profile = usePatientProfile(!!me.data && !me.data.is_guest);
  const bookingId = params.get('booking');
  const nationality = (params.get('nationality') ?? profile.data?.nationality ?? '').toUpperCase() || null;
  const guide = useVisaGuide(nationality);
  const storageKey = `visa_checklist:${nationality ?? ''}`;
  const [ticksState, setTicksState] = useState<{ key: string; ticks: string[] }>(() => ({ key: storageKey, ticks: readTicks(storageKey) }));
  const ticks = ticksState.key === storageKey ? ticksState.ticks : readTicks(storageKey);

  const toggle = (itemKey: string) => {
    const next = ticks.includes(itemKey) ? ticks.filter((k) => k !== itemKey) : [...ticks, itemKey];
    writeTicks(storageKey, next);
    setTicksState({ key: storageKey, ticks: next });
  };

  const checklist = useMemo(() => [...(guide.data?.checklist ?? [])].sort((a, b) => a.sort_order - b.sort_order), [guide.data]);
  const done = checklist.filter((c) => ticks.includes(c.item_key)).length;
  const g = guide.data;
  const country = g?.country_name ?? countryName(nationality);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        back={<BackLink to={bookingId ? paths.trip(bookingId) : paths.tripIndex}>{t('visaGuide.back')}</BackLink>}
        title={t('visaGuide.title')}
        description={t('visaGuide.subtitle')}
      />

      <Card>
        <CardBody>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-fg">{t('visaGuide.pickNationality')}</span>
            <Select
              value={nationality ?? ''}
              onChange={(e) => {
                const next = new URLSearchParams(params);
                if (e.target.value) next.set('nationality', e.target.value);
                else next.delete('nationality');
                setParams(next, { replace: true });
              }}
            >
              <option value="">{t('visaGuide.choose')}</option>
              {countryOptions()
                .filter((o) => o.value !== 'IN')
                .map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
            </Select>
          </label>
        </CardBody>
      </Card>

      {!nationality ? (
        <EmptyState icon={<Globe2 className="size-6" aria-hidden />} title={t('visaGuide.pickNationality')} description={t('visaGuide.pickMessage')} />
      ) : guide.isPending ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : guide.isError ? (
        <ErrorState error={guide.error} onRetry={() => void guide.refetch()} />
      ) : g ? (
        <>
          <Card>
            <CardHeader title={t(ROUTE_KEYS[g.visa_route].title)} description={t('visaGuide.for', { country })} />
            <CardBody className="space-y-4">
              <p className="text-sm text-fg/80">{t(ROUTE_KEYS[g.visa_route].body)}</p>
              {g.is_default ? <Alert tone="amber">{t('visaGuide.defaultNote')}</Alert> : null}
              <ul className="grid gap-3 sm:grid-cols-2">
                {g.typical_processing_days != null ? (
                  <li className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm">
                    <Timer className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                    {t('visaGuide.processing', { count: g.typical_processing_days, days: formatNumber(g.typical_processing_days) })}
                  </li>
                ) : null}
                {g.visa_route !== 'not_required' ? (
                  <li className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm">
                    <Users className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                    {t('visaGuide.attendants', { count: g.max_attendants, formatted: formatNumber(g.max_attendants) })}
                  </li>
                ) : null}
              </ul>
              {g.notes ? (
                <p className="flex items-start gap-2 text-sm text-muted">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {g.notes}
                </p>
              ) : null}
              {g.official_url ? (
                <a
                  href={g.official_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-ink hover:underline"
                >
                  <ExternalLink className="size-4" aria-hidden />
                  {t('visaGuide.official')}
                </a>
              ) : null}
            </CardBody>
          </Card>

          {checklist.length ? (
            <Card>
              <CardHeader
                title={t('visaGuide.checklist')}
                description={t('visaGuide.progress', { done: formatNumber(done), total: formatNumber(checklist.length) })}
              />
              <CardBody className="space-y-3">
                <ProgressBar value={(done / checklist.length) * 100} />
                <ul className="space-y-2">
                  {checklist.map((item) => {
                    const ticked = ticks.includes(item.item_key);
                    return (
                      <li key={item.item_key}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={ticked}
                          onClick={() => toggle(item.item_key)}
                          className={cn(
                            'flex w-full items-start gap-3 rounded-xl border p-3 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            ticked ? 'border-success/40 bg-success-soft' : 'border-border hover:bg-surface-2',
                          )}
                        >
                          {ticked ? (
                            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-ink" aria-hidden />
                          ) : (
                            <Circle className="mt-0.5 size-5 shrink-0 text-border-strong" aria-hidden />
                          )}
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-2 font-medium text-fg">
                              {item.title}
                              {!item.required ? <Badge>{t('visaGuide.optional')}</Badge> : null}
                            </span>
                            {item.description ? <span className="mt-0.5 block text-sm text-muted">{item.description}</span> : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-muted">{t('visaGuide.ticksLocal')}</p>
              </CardBody>
            </Card>
          ) : null}

          {bookingId ? <InvitationLetters bookingId={bookingId} /> : null}

          <p className="flex items-start gap-2 text-xs text-muted">
            <FileText className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t('visaGuide.disclaimer')}
          </p>
        </>
      ) : null}
    </div>
  );
}
