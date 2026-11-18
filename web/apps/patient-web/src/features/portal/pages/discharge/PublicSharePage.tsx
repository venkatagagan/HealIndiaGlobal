/**
 * Public, read-only discharge summary for the patient's home doctor (/app/share/:token, no login): patient and
 * hospital details, every section, PDF / FHIR / document downloads, expiry and confidentiality notices.
 * Not indexed (robots noindex while mounted; the API also sends X-Robots-Tag) and printable.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, Download, FileCode2, Lock, Printer, ShieldAlert } from 'lucide-react';
import {
  GENDER_LABELS,
  errorMessage,
  isApiError,
  publicDischargeApi,
  type DischargeAttachment,
  type Gender,
} from '@hig/shared/api';
import { BrandLogo, LanguageSwitcher } from '@hig/shared/layout';
import { useAppTranslation } from '../../../../i18n';
import { formatDate, formatDateTime, useDocumentTitle } from '../../lib/shared';
import { Alert, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, Skeleton } from '../../ui/primitives';
import { DischargeSummaryView } from './DischargeSummaryView';

/** Adds `<meta name=...>` tags while the page is mounted (and restores what was there). */
function useHeadMeta(entries: Record<string, string>) {
  const serialized = JSON.stringify(entries);
  useEffect(() => {
    const created: HTMLMetaElement[] = [];
    const restored: [HTMLMetaElement, string][] = [];
    for (const [name, content] of Object.entries(JSON.parse(serialized) as Record<string, string>)) {
      const existing = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      if (existing) {
        restored.push([existing, existing.content]);
        existing.content = content;
      } else {
        const meta = document.createElement('meta');
        meta.name = name;
        meta.content = content;
        document.head.appendChild(meta);
        created.push(meta);
      }
    }
    return () => {
      created.forEach((m) => m.remove());
      restored.forEach(([m, content]) => (m.content = content));
    };
  }, [serialized]);
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-fg">{children}</dd>
    </div>
  );
}

export function PublicSharePage() {
  const { t } = useAppTranslation();
  const { token = '' } = useParams();
  useDocumentTitle(t('discharge.public.documentTitle'));
  // the link is a secret: never indexed, never sent on as a referrer
  useHeadMeta({ robots: 'noindex,nofollow,noarchive', referrer: 'no-referrer' });
  const share = useQuery({
    queryKey: ['public-discharge-share', token],
    queryFn: () => publicDischargeApi.get(token),
    enabled: !!token,
    retry: (count, error) => !(isApiError(error) && error.status < 500) && count < 2,
    staleTime: 5 * 60_000,
  });
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      if (isApiError(err) && err.code === 'share_not_found') toast.error(t('discharge.public.invalidTitle'));
      else toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const data = share.data;
  const invalid = !token || (isApiError(share.error) && (share.error.code === 'share_not_found' || share.error.isNotFound));

  return (
    <div className="min-h-screen bg-bg text-fg print:bg-white">
      <header className="border-b border-border bg-surface print:border-0">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <BrandLogo subtitle={t('discharge.public.headerSubtitle')} />
          <div className="flex items-center gap-2 print:hidden">
            <LanguageSwitcher saveToProfile={false} />
            {data ? (
              <Button variant="outline" size="sm" icon={<Printer className="size-4" aria-hidden />} onClick={() => window.print()}>
                {t('discharge.public.print')}
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {share.isPending && token ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        ) : invalid ? (
          <EmptyState
            className="mt-10"
            icon={<Lock className="size-8" aria-hidden />}
            title={t('discharge.public.invalidTitle')}
            description={t('discharge.public.invalidBody')}
          />
        ) : share.isError || !data ? (
          <ErrorState error={share.error} onRetry={() => void share.refetch()} />
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t('discharge.public.title')}</h1>
              <p className="mt-1 text-sm text-muted">
                {data.shared_by_name
                  ? t('discharge.public.sharedBy', { name: data.shared_by_name })
                  : t('discharge.public.sharedByPatient')}
              </p>
            </div>

            <Alert tone="amber" icon={<ShieldAlert className="size-5" aria-hidden />} title={t('discharge.public.confidentialTitle')}>
              {t('discharge.public.confidentialBody')}
            </Alert>
            <p className="flex items-center gap-2 text-sm text-muted">
              <Clock className="size-4" aria-hidden />
              {t('discharge.public.expires', { date: formatDateTime(data.expires_at) })}
            </p>

            <div className="flex flex-wrap gap-2 print:hidden">
              <Button
                icon={<Download className="size-4" aria-hidden />}
                loading={busy === 'pdf'}
                onClick={() => void run('pdf', () => publicDischargeApi.downloadPdf(token))}
              >
                {t('discharge.public.downloadPdf')}
              </Button>
              <Button
                variant="outline"
                icon={<FileCode2 className="size-4" aria-hidden />}
                loading={busy === 'fhir'}
                onClick={() => void run('fhir', () => publicDischargeApi.downloadFhir(token))}
              >
                {t('discharge.public.downloadFhir')}
              </Button>
            </div>
            <p className="text-xs text-muted print:hidden">{t('discharge.public.fhirHint')}</p>

            <DischargeSummaryView
              summary={data.summary}
              attachments={data.documents}
              busyAttachmentId={busy}
              onDownloadAttachment={(doc: DischargeAttachment) => void run(doc.id, () => publicDischargeApi.downloadDocument(token, doc))}
              extraFacts={
                <>
                  <Fact label={t('discharge.public.patient')}>{data.patient_name}</Fact>
                  <Fact label={t('discharge.public.dateOfBirth')}>{formatDate(data.patient_date_of_birth)}</Fact>
                  <Fact label={t('discharge.public.sex')}>
                    {data.patient_sex ? (GENDER_LABELS[data.patient_sex as Gender] ?? data.patient_sex) : '—'}
                  </Fact>
                </>
              }
            />

            <Card className="break-inside-avoid print:shadow-none">
              <CardHeader title={t('discharge.public.hospitalContact')} description={data.hospital_name} />
              <CardBody>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
                  <Fact label={t('discharge.public.address')}>{data.hospital_address || '—'}</Fact>
                  <Fact label={t('discharge.public.phone')}>
                    {data.hospital_phone ? (
                      <a href={`tel:${data.hospital_phone.replace(/[^+\d]/g, '')}`} dir="ltr" className="text-primary-ink hover:underline">
                        {data.hospital_phone}
                      </a>
                    ) : (
                      '—'
                    )}
                  </Fact>
                  <Fact label={t('discharge.public.email')}>
                    {data.hospital_email ? (
                      <a href={`mailto:${data.hospital_email}`} dir="ltr" className="break-all text-primary-ink hover:underline">
                        {data.hospital_email}
                      </a>
                    ) : (
                      '—'
                    )}
                  </Fact>
                </dl>
              </CardBody>
            </Card>

            <footer className="space-y-1 border-t border-border pt-4 text-xs text-muted">
              <p>{t('discharge.public.footerDisclaimer')}</p>
              <p>{t('discharge.public.footerAudit')}</p>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
