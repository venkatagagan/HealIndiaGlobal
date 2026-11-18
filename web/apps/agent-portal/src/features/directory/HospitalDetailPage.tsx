import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { ArrowLeft, BadgeCheck, BedDouble, Calendar, Globe, Globe2, MapPin, Phone, Plane, Send, Star } from 'lucide-react';
import { PACKAGE_TIER_LABELS, type HospitalProcedureOut } from '@hig/shared/api';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, LoadingBlock, Money, PageHeader, Tabs } from '../../components/ui';
import { qk } from '../../lib/queries';
import { formatDate, formatMoneyRange, formatNumber, useDocumentTitle } from '../../lib/shared';
import { languageLabel } from '../../lib/constants';
import { useAppTranslation } from '../../i18n';
import { approxRangeText, ApproxMoney, useDisplayCurrency } from '../../lib/displayCurrency';
import { phase1Api } from '../../lib/phase1Api';
import { EnquiryDialog, type EnquiryTarget } from '../cases/EnquiryDialog';
import { DoctorCardView } from './DoctorsPage';

type Tab = 'overview' | 'doctors' | 'procedures' | 'reviews';

export function HospitalDetailPage() {
  const { t } = useAppTranslation();
  const { slug = '' } = useParams();
  const currency = useDisplayCurrency();
  const query = useQuery({ queryKey: [...qk.hospital(slug), { currency }], queryFn: () => phase1Api.getHospital(slug, currency) });
  const h = query.data;
  useDocumentTitle(h?.name ?? t('hospitalDetail.fallbackTitle'));
  const [tab, setTab] = useState<Tab>('overview');
  const [enquiry, setEnquiry] = useState<EnquiryTarget | null>(null);

  const back = (
    <Link to="/hospitals" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
      <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden /> {t('hospitalDetail.back')}
    </Link>
  );
  if (query.isPending) return <LoadingBlock />;
  if (query.isError || !h) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const baseTarget: EnquiryTarget = { hospital_id: h.id, hospital_name: h.name };
  const enquireFor = (proc?: HospitalProcedureOut) =>
    setEnquiry(proc ? { ...baseTarget, procedure_id: proc.procedure.id, procedure_name: proc.procedure.name } : baseTarget);

  return (
    <div>
      <PageHeader
        back={back}
        title={h.name}
        description={
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" aria-hidden /> {h.address ?? `${h.city}${h.state ? `, ${h.state}` : ''}`}
          </span>
        }
        actions={
          <Button icon={<Send className="h-4 w-4" aria-hidden />} onClick={() => enquireFor()}>
            {t('hospitalDetail.sendEnquiry')}
          </Button>
        }
      />
      {h.cover_image_url && <img src={h.cover_image_url} alt="" className="mb-6 h-56 w-full rounded-xl object-cover" />}
      <div className="mb-6 flex flex-wrap gap-2">
        {h.accreditations.map((a) => (
          <Badge key={a} tone="info">
            <BadgeCheck className="h-3 w-3" aria-hidden /> {a.toUpperCase()}
          </Badge>
        ))}
        {h.rating_avg != null && (
          <Badge>
            <Star className="h-3 w-3 fill-current text-amber-500" aria-hidden /> {formatNumber(Number(h.rating_avg), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} · {t('hospitalDetail.reviewCount', { count: h.rating_count })}
          </Badge>
        )}
        {h.international_desk && (
          <Badge tone="accent">
            <Globe2 className="h-3 w-3" aria-hidden /> {t('hospitalDetail.internationalDesk')}
          </Badge>
        )}
      </div>

      <Tabs<Tab>
        className="mb-6"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: t('hospitalDetail.tabs.overview') },
          { value: 'doctors', label: t('hospitalDetail.tabs.doctors'), count: h.doctors.length },
          { value: 'procedures', label: t('hospitalDetail.tabs.procedures'), count: h.procedures.length },
          { value: 'reviews', label: t('hospitalDetail.tabs.reviews'), count: h.reviews.length },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title={t('hospitalDetail.about')} />
            <p className="p-5 text-sm leading-relaxed whitespace-pre-line">{h.description ?? t('hospitalDetail.noDescription')}</p>
            {h.specialties.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-border p-5">
                {h.specialties.map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title={t('hospitalDetail.facts')} />
            <ul className="space-y-3 p-5 text-sm">
              {h.established_year && (
                <li className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted" aria-hidden /> {t('hospitalDetail.established', { year: h.established_year })}
                </li>
              )}
              {h.bed_count && (
                <li className="flex items-center gap-2">
                  <BedDouble className="h-4 w-4 text-muted" aria-hidden /> {t('hospitalDetail.beds', { count: h.bed_count, n: formatNumber(h.bed_count) })}
                </li>
              )}
              {h.airport_distance_km != null && (
                <li className="flex items-center gap-2">
                  <Plane className="h-4 w-4 text-muted" aria-hidden /> {t('hospitalDetail.airportDistance', { km: formatNumber(Number(h.airport_distance_km), { maximumFractionDigits: 0 }) })}
                </li>
              )}
              {h.languages.length > 0 && (
                <li className="flex items-center gap-2">
                  <Globe2 className="h-4 w-4 text-muted" aria-hidden /> {h.languages.map(languageLabel).join(', ')}
                </li>
              )}
              {h.phone && (
                <li className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted" aria-hidden /> {h.phone}
                </li>
              )}
              {h.website && (
                <li className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted" aria-hidden />
                  <a href={h.website} target="_blank" rel="noopener noreferrer" className="text-primary-ink hover:underline">
                    {t('hospitalDetail.website')}
                  </a>
                </li>
              )}
            </ul>
          </Card>
        </div>
      )}

      {tab === 'doctors' &&
        (h.doctors.length === 0 ? (
          <Card>
            <EmptyState title={t('hospitalDetail.noDoctors')} />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {h.doctors.map((d) => (
              <DoctorCardView key={d.id} doctor={d} />
            ))}
          </div>
        ))}

      {tab === 'procedures' &&
        (h.procedures.length === 0 ? (
          <Card>
            <EmptyState title={t('hospitalDetail.noProcedures')} description={t('hospitalDetail.noProceduresHint')} />
          </Card>
        ) : (
          <div className="space-y-4">
            {h.procedures.map((p) => (
              <Card key={p.id}>
                <CardHeader
                  title={p.procedure.name}
                  description={
                    <>
                      {formatMoneyRange(p.price_min_minor, p.price_max_minor, p.currency)}
                      {approxRangeText(p.display_price_min, p.display_price_max, p.currency) ? ` (${approxRangeText(p.display_price_min, p.display_price_max, p.currency)})` : ''}
                      {p.hospital_stay_days ? ` · ${t('hospitalDetail.stayDays', { count: p.hospital_stay_days })}` : ''}
                      {p.success_rate_pct != null ? ` · ${t('hospitalDetail.successRate', { pct: formatNumber(Number(p.success_rate_pct), { maximumFractionDigits: 0 }) })}` : ''}
                    </>
                  }
                  actions={
                    <Button size="sm" variant="outline" onClick={() => enquireFor(p)}>
                      {t('hospitalDetail.requestQuote')}
                    </Button>
                  }
                />
                {(p.inclusions.length > 0 || p.packages.length > 0) && (
                  <div className="space-y-4 p-5">
                    {p.inclusions.length > 0 && (
                      <p className="text-sm">
                        <span className="font-medium">{t('hospitalDetail.includes')}</span> <span className="text-muted">{p.inclusions.join(', ')}</span>
                      </p>
                    )}
                    {p.exclusions.length > 0 && (
                      <p className="text-sm">
                        <span className="font-medium">{t('hospitalDetail.excludes')}</span> <span className="text-muted">{p.exclusions.join(', ')}</span>
                      </p>
                    )}
                    {p.packages.length > 0 && (
                      <div className="grid gap-3 sm:grid-cols-3">
                        {p.packages.map((pk) => (
                          <div key={pk.id} className="rounded-lg border border-border p-3">
                            <p className="text-xs font-semibold text-muted uppercase">{PACKAGE_TIER_LABELS[pk.tier]}</p>
                            <p className="font-medium">{pk.name}</p>
                            <p className="mt-1 font-semibold">
                              <Money minor={pk.price_minor} currency={pk.currency} />
                              <ApproxMoney display={pk.display_price} original={pk.currency} block />
                            </p>
                            {pk.description && <p className="mt-1 text-xs text-muted">{pk.description}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        ))}

      {tab === 'reviews' && (
        <Card>
          {h.reviews.length === 0 ? (
            <EmptyState title={t('hospitalDetail.noReviews')} />
          ) : (
            <ul className="divide-y divide-border">
              {h.reviews.map((r) => (
                <li key={r.id} className="space-y-1 p-5">
                  <div className="flex items-center gap-2">
                    <span className="flex" aria-label={t('hospitalDetail.ratingOutOf5', { rating: r.rating })}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star key={i} className={`h-4 w-4 ${i < r.rating ? 'fill-amber-500 text-amber-500' : 'text-border'}`} aria-hidden />
                      ))}
                    </span>
                    {r.title && <span className="font-medium">{r.title}</span>}
                  </div>
                  {r.body && <p className="text-sm">{r.body}</p>}
                  <p className="text-xs text-muted">
                    {r.patient_name ?? t('hospitalDetail.verifiedPatient')} · {formatDate(r.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <EnquiryDialog open={enquiry !== null} onClose={() => setEnquiry(null)} targets={enquiry ? [enquiry] : []} />
    </div>
  );
}
