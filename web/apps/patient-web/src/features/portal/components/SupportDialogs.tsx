import { useState } from 'react';
import { Link } from 'react-router';
import { MessageCircle, Phone, ShieldAlert, Siren } from 'lucide-react';
import { Trans } from 'react-i18next';
import { toast } from 'sonner';
import { errorMessage, travelApi, type CoordinatorRef, type Uuid } from '@hig/shared/api';
import { useAppTranslation } from '../../../i18n';
import { useCulturalTips, useHelplines, usePatientProfile } from '../api/queries';
import { paths } from '../lib/paths';
import { Button, ConfirmDialog, Modal, Skeleton, Textarea } from '../ui/primitives';

/** Helpline keys from GET /travel/helplines that have a label in the catalog (`support.helplines.<key>`). */
const HELPLINE_KEYS: Record<string, string> = {
  '24x7': 'support.helplines.patient',
  whatsapp: 'support.helplines.whatsapp',
  emergency: 'support.helplines.emergency',
};

/** "+91-90000-00000" -> "+919000000000" for tel:/wa.me links */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function whatsappHref(phone: string): string {
  return `https://wa.me/${phone.replace(/[^\d]/g, '')}`;
}

export function HelplineList({ coordinator }: { coordinator?: CoordinatorRef | null }) {
  const { t } = useAppTranslation();
  const helplines = useHelplines();
  const profile = usePatientProfile();
  const contact = profile.data?.emergency_contact;
  return (
    <ul className="divide-y divide-border">
      {helplines.isPending ? (
        <li className="py-3">
          <Skeleton className="h-10 w-full" />
        </li>
      ) : helplines.isError ? (
        <li className="py-3 text-sm text-red-600">{t('support.helplines.loadError')}</li>
      ) : (
        Object.entries(helplines.data).map(([key, phone]) => (
          <li key={key} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-medium">{HELPLINE_KEYS[key] ? t(HELPLINE_KEYS[key]) : key}</p>
              <p className="text-sm text-muted" dir="ltr">
                {phone}
              </p>
            </div>
            {key === 'whatsapp' ? (
              <a
                href={whatsappHref(phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
              >
                <MessageCircle className="h-4 w-4" aria-hidden /> {t('support.chat')}
              </a>
            ) : (
              <a
                href={telHref(phone)}
                className={
                  key === 'emergency'
                    ? 'inline-flex items-center gap-1.5 rounded-xl bg-danger-strong px-3 py-2 text-sm font-semibold text-white hover:bg-danger-hover'
                    : 'inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700'
                }
              >
                <Phone className="h-4 w-4" aria-hidden /> {t('support.call')}
              </a>
            )}
          </li>
        ))
      )}
      {coordinator ? (
        <li className="flex items-center justify-between gap-3 py-3">
          <div>
            <p className="text-sm font-medium">{t('support.coordinator', { name: coordinator.full_name })}</p>
            <p className="text-sm text-muted">
              {coordinator.phone ? <span dir="ltr">{coordinator.phone}</span> : t('support.reachViaMessages')}
            </p>
          </div>
          {coordinator.phone ? (
            <a
              href={telHref(coordinator.phone)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
            >
              <Phone className="h-4 w-4" aria-hidden /> {t('support.call')}
            </a>
          ) : (
            <Link to={paths.messages} className="text-sm font-semibold text-violet-600">
              {t('support.message')}
            </Link>
          )}
        </li>
      ) : null}
      {contact?.phone ? (
        <li className="flex items-center justify-between gap-3 py-3">
          <div>
            <p className="text-sm font-medium">
              {contact.name} ({contact.relationship})
            </p>
            <p className="text-sm text-muted">{t('support.emergencyContact', { phone: contact.phone })}</p>
          </div>
          <a
            href={telHref(contact.phone)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border-strong px-3 py-2 text-sm font-semibold hover:bg-surface-2"
          >
            <Phone className="h-4 w-4" aria-hidden /> {t('support.call')}
          </a>
        </li>
      ) : null}
    </ul>
  );
}

export function EmergencyContactsDialog({
  open,
  onClose,
  coordinator,
}: {
  open: boolean;
  onClose: () => void;
  coordinator?: CoordinatorRef | null;
}) {
  const { t } = useAppTranslation();
  return (
    <Modal open={open} onClose={onClose} title={t('support.emergencyDialog.title')} description={t('support.emergencyDialog.description')}>
      <HelplineList coordinator={coordinator} />
      <p className="mt-3 text-xs text-muted">{t('support.emergencyDialog.outsideIndia')}</p>
    </Modal>
  );
}

/** Pre-arrival guide: section id -> number of items (`support.guide.<id>.title`, `support.guide.<id>.item<n>`). */
const GUIDE_SECTIONS: readonly { id: string; items: number }[] = [
  { id: 'documents', items: 5 },
  { id: 'health', items: 3 },
  { id: 'money', items: 3 },
  { id: 'arrival', items: 3 },
];

export function PreArrivalGuideDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useAppTranslation();
  const tips = useCulturalTips();
  return (
    <Modal open={open} onClose={onClose} size="lg" title={t('support.guide.title')} description={t('support.guide.description')}>
      <div className="space-y-5">
        {GUIDE_SECTIONS.map((section) => (
          <div key={section.id}>
            <h3 className="font-semibold">{t(`support.guide.${section.id}.title`)}</h3>
            <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-muted">
              {Array.from({ length: section.items }, (_, i) => (
                <li key={i}>{t(`support.guide.${section.id}.item${i + 1}`)}</li>
              ))}
            </ul>
          </div>
        ))}
        {tips.data && tips.data.length > 0 ? (
          <div>
            <h3 className="font-semibold">{t('support.guide.culturalTips')}</h3>
            <ul className="mt-2 space-y-2">
              {tips.data.slice(0, 6).map((tip) => (
                <li key={tip.id} className="rounded-xl bg-surface-2 p-3 text-sm">
                  <p className="font-medium">{tip.title}</p>
                  <p className="mt-0.5 text-muted">{tip.body}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/** Large SOS button with confirmation; sends location when the browser grants it. */
export function SosButton({ caseId, className }: { caseId?: Uuid | null; className?: string }) {
  const { t } = useAppTranslation();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function currentPosition(): Promise<{ lat: number; lng: number } | null> {
    if (!('geolocation' in navigator)) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
      );
    });
  }

  async function send() {
    setSending(true);
    try {
      const pos = await currentPosition();
      await travelApi.sos({
        ...(pos ?? {}),
        ...(message.trim() ? { message: message.trim().slice(0, 1000) } : {}),
        ...(caseId ? { case_id: caseId } : {}),
      });
      toast.success(t('support.sos.sent'));
      setOpen(false);
      setMessage('');
    } catch (err) {
      toast.error(t('support.sos.failed', { error: errorMessage(err) }));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button
        variant="danger"
        size="lg"
        className={className}
        icon={<Siren className="h-5 w-5" aria-hidden />}
        onClick={() => setOpen(true)}
      >
        {t('support.sos.button')}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => void send()}
        title={t('support.sos.confirmTitle')}
        confirmLabel={t('support.sos.confirm')}
        tone="danger"
        loading={sending}
      >
        <div className="space-y-3">
          <p className="flex gap-2">
            <ShieldAlert className="h-5 w-5 shrink-0 text-danger" aria-hidden />
            <span>
              <Trans
                t={t}
                i18nKey="support.sos.body"
                components={{ 0: <a className="font-semibold text-red-600" href="tel:112" /> }}
              />
            </span>
          </p>
          <label className="block text-sm font-medium" htmlFor="sos-message">
            {t('support.sos.messageLabel')}
          </label>
          <Textarea
            id="sos-message"
            maxLength={1000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('support.sos.messagePlaceholder')}
          />
        </div>
      </ConfirmDialog>
    </>
  );
}
