/**
 * "Insurance & pay later" (/app/insurance, CG-18): partner insurance products and pay-later partners for the
 * patient's country, the hand-off request dialog, and the patient's own requests. The platform lists partners
 * for information and passes contact details on with consent; it never sells insurance or decides on credit.
 * `?case=` / `?booking=` (from the booking flow) link the requests sent from here; `#pay-later` and
 * `#my-requests` jump to those sections.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { CreditCard, Inbox, ShieldCheck } from 'lucide-react';
import { errorMessage, isApiError } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import {
  OPEN_LEAD_STATUSES,
  useCancelLead,
  useLeads,
  useOfferings,
  type LeadOut,
  type OfferingOut,
  type PartnerKind,
} from '../../api/partners';
import { LeadStatusBadge, PartnerDisclaimer, PartnerLink, safePartnerUrl, usePatientCountry } from '../../components/partners';
import { countryName, countryOptions } from '../../lib/countries';
import { cn, formatDate, formatMoneyRange, useDocumentTitle } from '../../lib/shared';
import {
  Alert,
  Badge,
  Button,
  buttonClass,
  Card,
  CardBody,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Select,
  SkeletonList,
} from '../../ui/primitives';
import { LeadRequestDialog, type LeadTarget } from './LeadRequestDialog';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALL = 'all';
const CATEGORIES = ['medical_travel', 'complication', 'health', 'other'] as const;

export function InsurancePage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('insurance.title'));
  const [search] = useSearchParams();
  const location = useLocation();
  const caseParam = search.get('case');
  const bookingParam = search.get('booking');
  const caseId = caseParam && UUID.test(caseParam) ? caseParam : null;
  const bookingId = bookingParam && UUID.test(bookingParam) ? bookingParam : null;

  const homeCountry = usePatientCountry();
  const [choice, setChoice] = useState<string | null>(null);
  const selected = choice ?? homeCountry ?? ALL;
  const country = selected === ALL ? null : selected;

  const insurance = useOfferings('insurance', country);
  const payLater = useOfferings('pay_later', country);
  const [target, setTarget] = useState<LeadTarget | null>(null);
  const open = (offering: OfferingOut) => setTarget({ offering, caseId, bookingId });

  // jump to #pay-later / #my-requests once the lists above have rendered (react-router does not scroll to hashes)
  const scrolledFor = useRef<string | null>(null);
  const ready = !insurance.isPending && !payLater.isPending;
  useEffect(() => {
    const id = location.hash.replace(/^#/, '');
    if (!id || !ready || scrolledFor.current === location.key) return;
    scrolledFor.current = location.key;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    el.focus({ preventScroll: true });
  }, [location.hash, location.key, ready]);

  const options = countryOptions();

  return (
    <div className="space-y-10">
      <PageHeader title={t('insurance.title')} description={t('insurance.description')} />

      <div className="flex flex-wrap items-end gap-4">
        <Field label={t('insurance.country.label')} htmlFor="ins-country" hint={t('insurance.country.hint')} className="w-full sm:w-80">
          <Select id="ins-country" value={selected} onChange={(e) => setChoice(e.target.value)}>
            <option value={ALL}>{t('insurance.country.all')}</option>
            {homeCountry && !options.some((o) => o.value === homeCountry) ? (
              <option value={homeCountry}>{countryName(homeCountry)}</option>
            ) : null}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {caseId || bookingId ? (
        <Alert tone="blue">{bookingId ? t('insurance.linked.booking') : t('insurance.linked.case')}</Alert>
      ) : null}

      {/* Insurance */}
      <section aria-labelledby="ins-products-title" className="space-y-4">
        <SectionTitle id="ins-products-title" icon={<ShieldCheck className="h-5 w-5" aria-hidden />} title={t('insurance.products.title')} />
        <PartnerDisclaimer kind="insurance" />
        <OfferingList
          kind="insurance"
          query={insurance}
          onRequest={open}
          showAllCountries={country ? () => setChoice(ALL) : undefined}
        />
      </section>

      {/* Pay later */}
      <section id="pay-later" tabIndex={-1} aria-labelledby="ins-paylater-title" className="scroll-mt-20 space-y-4 focus:outline-none">
        <SectionTitle id="ins-paylater-title" icon={<CreditCard className="h-5 w-5" aria-hidden />} title={t('financing.title')} />
        <p className="text-sm text-muted">{t('financing.description')}</p>
        <PartnerDisclaimer kind="pay_later" />
        <p className="text-sm text-fg">{t('financing.howItWorks')}</p>
        <OfferingList
          kind="pay_later"
          query={payLater}
          onRequest={open}
          showAllCountries={country ? () => setChoice(ALL) : undefined}
        />
      </section>

      {/* My requests */}
      <section id="my-requests" tabIndex={-1} aria-labelledby="ins-requests-title" className="scroll-mt-20 space-y-4 focus:outline-none">
        <SectionTitle id="ins-requests-title" icon={<Inbox className="h-5 w-5" aria-hidden />} title={t('insurance.requests.title')} />
        <p className="text-sm text-muted">{t('insurance.requests.description')}</p>
        <MyRequests />
      </section>

      <LeadRequestDialog target={target} defaultCountry={country ?? homeCountry} onClose={() => setTarget(null)} />
    </div>
  );
}

function SectionTitle({ id, icon, title }: { id: string; icon: ReactNode; title: string }) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-lg font-semibold text-fg">
      <span className="text-primary">{icon}</span>
      {title}
    </h2>
  );
}

function OfferingList({
  kind,
  query,
  onRequest,
  showAllCountries,
}: {
  kind: PartnerKind;
  query: ReturnType<typeof useOfferings>;
  onRequest: (o: OfferingOut) => void;
  showAllCountries?: () => void;
}) {
  const { t } = useAppTranslation();
  if (query.isPending) return <SkeletonList rows={2} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const items = query.data.filter((o) => o.is_active !== false);
  if (!items.length) {
    const ns = kind === 'insurance' ? 'insurance.products' : 'financing';
    return (
      <EmptyState
        icon={kind === 'insurance' ? <ShieldCheck className="h-8 w-8" aria-hidden /> : <CreditCard className="h-8 w-8" aria-hidden />}
        title={t(`${ns}.empty`)}
        description={t(`${ns}.emptyHint`)}
        action={
          showAllCountries ? (
            <Button variant="outline" size="sm" onClick={showAllCountries}>
              {t('insurance.country.showAll')}
            </Button>
          ) : undefined
        }
      />
    );
  }
  return (
    <ul className={cn('grid gap-4 md:grid-cols-2', query.isPlaceholderData && 'opacity-60')} aria-busy={query.isFetching || undefined}>
      {items.map((o) => (
        <li key={o.id} className="flex">
          <OfferingCard offering={o} onRequest={() => onRequest(o)} />
        </li>
      ))}
    </ul>
  );
}

function OfferingCard({ offering: o, onRequest }: { offering: OfferingOut; onRequest: () => void }) {
  const { t } = useAppTranslation();
  const website = safePartnerUrl(o.website_url);
  const hasPrice = o.price_min_minor != null || o.price_max_minor != null;
  const category = o.kind === 'insurance' ? ((CATEGORIES as readonly string[]).includes(o.category ?? '') ? o.category : o.category ? 'other' : null) : null;
  const countries = o.countries.length ? o.countries.map(countryName).join(', ') : t('insurance.card.allCountries');
  return (
    <Card className="flex w-full flex-col">
      <CardBody className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm text-muted">{o.provider_name}</p>
            <h3 className="font-semibold text-fg">{o.product_name}</h3>
          </div>
          {category ? <Badge tone="blue">{t(`insurance.category.${category}`)}</Badge> : null}
        </div>
        {o.summary ? <p className="whitespace-pre-line text-sm text-fg">{o.summary}</p> : null}
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-xs font-medium text-muted">{t('insurance.card.countries')}</dt>
            <dd>{countries}</dd>
          </div>
          {hasPrice && o.currency ? (
            <div>
              <dt className="text-xs font-medium text-muted">{t('insurance.card.price')}</dt>
              <dd>
                <span className="font-semibold tabular-nums">{formatMoneyRange(o.price_min_minor, o.price_max_minor, o.currency)}</span>
                {o.price_note ? <span className="text-muted"> · {o.price_note}</span> : null}
                <span className="mt-0.5 block text-xs text-muted">{t('insurance.card.priceIndicative')}</span>
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <Button size="sm" onClick={onRequest} aria-label={`${o.kind === 'insurance' ? t('insurance.card.requestQuote') : t('financing.card.checkEligibility')} – ${o.provider_name}, ${o.product_name}`}>
            {o.kind === 'insurance' ? t('insurance.card.requestQuote') : t('financing.card.checkEligibility')}
          </Button>
          {website ? (
            <PartnerLink href={website} className={buttonClass('ghost', 'sm')}>
              {t('insurance.card.website', { provider: o.provider_name })}
            </PartnerLink>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

function MyRequests() {
  const { t } = useAppTranslation();
  const insurance = useLeads('insurance');
  const financing = useLeads('pay_later');
  const cancelInsurance = useCancelLead('insurance');
  const cancelFinancing = useCancelLead('pay_later');
  const [withdraw, setWithdraw] = useState<LeadOut | null>(null);

  if (insurance.isPending || financing.isPending) return <SkeletonList rows={2} />;
  const failed = insurance.isError ? insurance : financing.isError ? financing : null;
  if (failed) {
    return (
      <ErrorState
        error={failed.error}
        onRetry={() => {
          void insurance.refetch();
          void financing.refetch();
        }}
      />
    );
  }
  const leads = [...(insurance.data ?? []), ...(financing.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (!leads.length) {
    return <EmptyState title={t('insurance.requests.empty')} description={t('insurance.requests.emptyHint')} />;
  }

  const cancel = withdraw?.kind === 'pay_later' ? cancelFinancing : cancelInsurance;
  const confirmWithdraw = () => {
    if (!withdraw) return;
    cancel.mutate(withdraw.id, {
      onSuccess: () => {
        toast.success(t('insurance.requests.withdrawn'));
        setWithdraw(null);
      },
      onError: (err) => {
        toast.error(
          isApiError(err) && err.code === 'lead_not_open'
            ? t('insurance.requests.notOpen')
            : errorMessage(err, t('insurance.requests.withdrawFailed')),
        );
        setWithdraw(null);
      },
    });
  };

  return (
    <>
      <ul className="space-y-3">
        {leads.map((lead) => {
          const href = lead.status !== 'cancelled' ? safePartnerUrl(lead.partner_website_url) : null;
          const isOpen = OPEN_LEAD_STATUSES.includes(lead.status);
          return (
            <li key={lead.id}>
              <Card>
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-fg">{lead.provider_name}</p>
                      <LeadStatusBadge status={lead.status} />
                    </div>
                    <p className="text-sm text-muted">
                      {lead.product_name} · {t(`insurance.requests.kind.${lead.kind}`)}
                    </p>
                    <p className="text-xs text-muted">{t('insurance.requests.sent', { date: formatDate(lead.created_at) })}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {href ? (
                      <PartnerLink href={href} className={buttonClass('outline', 'sm')}>
                        {t('insurance.requests.continue')}
                      </PartnerLink>
                    ) : null}
                    {isOpen ? (
                      <Button variant="ghost" size="sm" onClick={() => setWithdraw(lead)}>
                        {t('insurance.requests.withdraw')}
                      </Button>
                    ) : null}
                  </div>
                </CardBody>
              </Card>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={!!withdraw}
        onClose={() => setWithdraw(null)}
        onConfirm={confirmWithdraw}
        title={t('insurance.requests.withdrawTitle')}
        confirmLabel={t('insurance.requests.withdraw')}
        tone="danger"
        loading={cancel.isPending}
      >
        {withdraw ? t('insurance.requests.withdrawText', { provider: withdraw.provider_name }) : null}
      </ConfirmDialog>
    </>
  );
}
