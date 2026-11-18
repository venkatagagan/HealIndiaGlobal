import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { ArrowLeft, BadgeCheck, CalendarDays, Send, Star, Stethoscope, Video } from 'lucide-react';
import { catalogApi, type HospitalProcedureOut } from '@hig/shared/api';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, LoadingBlock, PageHeader } from '../../components/ui';
import { qk } from '../../lib/queries';
import { cn, formatDate, formatMoney, formatMoneyRange, formatNumber, isoDateFromToday, useDocumentTitle } from '../../lib/shared';
import { languageLabel } from '../../lib/constants';
import { useAppTranslation } from '../../i18n';
import { EnquiryDialog, type EnquiryTarget } from '../cases/EnquiryDialog';

export function DoctorDetailPage() {
  const { t } = useAppTranslation();
  const { doctorId = '' } = useParams();
  const query = useQuery({ queryKey: qk.doctor(doctorId), queryFn: () => catalogApi.getDoctor(doctorId) });
  const d = query.data;
  useDocumentTitle(d?.full_name ?? t('doctorDetail.fallbackTitle'));
  const from = isoDateFromToday(1);
  const to = isoDateFromToday(60);
  const availability = useQuery({
    queryKey: ['availability', 'doctor', doctorId, from, to],
    queryFn: () => catalogApi.doctorAvailability(doctorId, { from, to }),
    enabled: Boolean(d),
  });
  const [enquiry, setEnquiry] = useState<EnquiryTarget | null>(null);

  if (query.isPending) return <LoadingBlock />;
  if (query.isError || !d) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const base: EnquiryTarget = {
    hospital_id: d.hospital.id,
    hospital_name: d.hospital.name,
    doctor_id: d.id,
    doctor_name: d.full_name,
    specialty_id: d.specialty.id,
  };
  const enquire = (p?: HospitalProcedureOut) =>
    setEnquiry(p ? { ...base, procedure_id: p.procedure.id, procedure_name: p.procedure.name } : base);
  const days = (availability.data ?? []).filter((a) => a.available > 0);

  return (
    <div>
      <PageHeader
        back={
          <Link to="/doctors" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
            <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden /> {t('doctorDetail.back')}
          </Link>
        }
        title={d.full_name}
        description={d.experience_years ? `${d.specialty.name} · ${t('doctorDetail.experience', { count: d.experience_years })}` : d.specialty.name}
        actions={
          <Button icon={<Send className="h-4 w-4" aria-hidden />} onClick={() => enquire()}>
            {t('doctorDetail.sendEnquiry')}
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <div className="flex flex-wrap gap-4">
              {d.photo_url ? (
                <img src={d.photo_url} alt="" className="h-24 w-24 rounded-xl object-cover" />
              ) : (
                <span className="flex h-24 w-24 items-center justify-center rounded-xl bg-primary-soft text-primary-ink">
                  <Stethoscope className="h-10 w-10" aria-hidden />
                </span>
              )}
              <div className="min-w-0 flex-1 space-y-2">
                <Link to={`/hospitals/${d.hospital.slug}`} className="font-medium text-primary-ink hover:underline">
                  {d.hospital.name}, {d.hospital.city}
                </Link>
                <div className="flex flex-wrap gap-1.5">
                  {d.hospital.accreditations.map((a) => (
                    <Badge key={a} tone="info">
                      <BadgeCheck className="h-3 w-3" aria-hidden /> {a.toUpperCase()}
                    </Badge>
                  ))}
                  {d.success_rate_pct != null && <Badge tone="success">{t('doctorDetail.successRate', { pct: formatNumber(Number(d.success_rate_pct), { maximumFractionDigits: 0 }) })}</Badge>}
                  {d.rating_avg != null && (
                    <Badge>
                      <Star className="h-3 w-3 fill-current text-amber-500" aria-hidden /> {formatNumber(Number(d.rating_avg), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ({t('doctorDetail.reviewCount', { count: d.rating_count })})
                    </Badge>
                  )}
                  {d.teleconsult_available && (
                    <Badge tone="accent">
                      <Video className="h-3 w-3" aria-hidden /> {t('doctorDetail.teleconsult')}
                      {d.consultation_fee_minor != null ? ` · ${formatMoney(d.consultation_fee_minor, d.currency)}` : ''}
                    </Badge>
                  )}
                </div>
                {d.qualifications.length > 0 && <p className="text-sm">{d.qualifications.join(', ')}</p>}
                {d.languages.length > 0 && <p className="text-sm text-muted">{t('doctorDetail.speaks', { languages: d.languages.map(languageLabel).join(', ') })}</p>}
              </div>
            </div>
            {d.bio && <p className="mt-4 text-sm leading-relaxed whitespace-pre-line">{d.bio}</p>}
            {d.sub_specialties.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {d.sub_specialties.map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title={t('doctorDetail.procedures')} />
            {d.procedures.length === 0 ? (
              <EmptyState title={t('doctorDetail.noProcedures')} className="py-8" />
            ) : (
              <ul className="divide-y divide-border">
                {d.procedures.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{p.procedure.name}</p>
                      <p className="text-xs text-muted">
                        {formatMoneyRange(p.price_min_minor, p.price_max_minor, p.currency)}
                        {p.hospital_stay_days ? ` · ${t('doctorDetail.stayDays', { count: p.hospital_stay_days })}` : ''}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => enquire(p)}>
                      {t('doctorDetail.requestQuote')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader title={t('doctorDetail.availability')} description={t('doctorDetail.next60Days')} />
          <div className="p-5">
            {availability.isPending ? (
              <LoadingBlock className="py-4" />
            ) : days.length === 0 ? (
              <p className="text-sm text-muted">
                {d.next_available_date ? t('doctorDetail.nextAvailable', { date: formatDate(d.next_available_date) }) : t('doctorDetail.noSlots')}
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-2">
                {days.slice(0, 16).map((a) => (
                  <li
                    key={`${a.date}-${a.slot_kind}`}
                    className={cn('rounded-lg border px-2 py-1.5 text-xs', 'border-primary/40 bg-primary-soft text-primary-ink')}
                  >
                    <span className="flex items-center gap-1 font-medium">
                      <CalendarDays className="h-3 w-3" aria-hidden /> {formatDate(a.date, 'EEE d MMM')}
                    </span>
                    {a.slot_kind === 'consultation' ? t('doctorDetail.consultation') : t('doctorDetail.admission')} · {t('doctorDetail.slotsLeft', { count: a.available })}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
      <EnquiryDialog open={enquiry !== null} onClose={() => setEnquiry(null)} targets={enquiry ? [enquiry] : []} />
    </div>
  );
}
