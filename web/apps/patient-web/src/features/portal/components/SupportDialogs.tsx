import { useState } from 'react';
import { Link } from 'react-router';
import { MessageCircle, Phone, ShieldAlert, Siren } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage, travelApi, type CoordinatorRef, type Uuid } from '@hig/shared/api';
import { useCulturalTips, useHelplines, usePatientProfile } from '../api/queries';
import { paths } from '../lib/paths';
import { Button, ConfirmDialog, Modal, Skeleton, Textarea } from '../ui/primitives';

const HELPLINE_LABELS: Record<string, string> = {
  '24x7': '24/7 patient helpline',
  whatsapp: 'WhatsApp support',
  emergency: 'Emergency services (India)',
};

/** "+91-90000-00000" -> "+919000000000" for tel:/wa.me links */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function whatsappHref(phone: string): string {
  return `https://wa.me/${phone.replace(/[^\d]/g, '')}`;
}

export function HelplineList({ coordinator }: { coordinator?: CoordinatorRef | null }) {
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
        <li className="py-3 text-sm text-red-600">Helplines could not be loaded. In an emergency in India dial 112.</li>
      ) : (
        Object.entries(helplines.data).map(([key, phone]) => (
          <li key={key} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-medium">{HELPLINE_LABELS[key] ?? key}</p>
              <p className="text-sm text-muted">{phone}</p>
            </div>
            {key === 'whatsapp' ? (
              <a
                href={whatsappHref(phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
              >
                <MessageCircle className="h-4 w-4" aria-hidden /> Chat
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
                <Phone className="h-4 w-4" aria-hidden /> Call
              </a>
            )}
          </li>
        ))
      )}
      {coordinator ? (
        <li className="flex items-center justify-between gap-3 py-3">
          <div>
            <p className="text-sm font-medium">Your coordinator · {coordinator.full_name}</p>
            <p className="text-sm text-muted">{coordinator.phone ?? 'Reach out via Messages'}</p>
          </div>
          {coordinator.phone ? (
            <a
              href={telHref(coordinator.phone)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
            >
              <Phone className="h-4 w-4" aria-hidden /> Call
            </a>
          ) : (
            <Link to={paths.messages} className="text-sm font-semibold text-violet-600">
              Message
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
            <p className="text-sm text-muted">Your emergency contact · {contact.phone}</p>
          </div>
          <a
            href={telHref(contact.phone)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border-strong px-3 py-2 text-sm font-semibold hover:bg-surface-2"
          >
            <Phone className="h-4 w-4" aria-hidden /> Call
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
  return (
    <Modal open={open} onClose={onClose} title="Emergency contacts" description="Tap to call. Calls use your phone's dialer.">
      <HelplineList coordinator={coordinator} />
      <p className="mt-3 text-xs text-muted">
        If you are outside India and need urgent medical help, call your local emergency number.
      </p>
    </Modal>
  );
}

const GUIDE_SECTIONS = [
  {
    title: 'Documents to carry',
    items: [
      'Passport valid for at least 6 months, plus 2 photocopies',
      'Printed e-Medical visa (and e-Medical Attendant visa for companions)',
      'Hospital invitation letter and your booking confirmation',
      'All previous medical reports, scans and prescriptions',
      'Travel insurance policy and emergency contact details',
    ],
  },
  {
    title: 'Health & medication',
    items: [
      'Carry enough regular medication for the whole stay, in original packaging, with prescriptions',
      'Tell your coordinator about allergies and current medicines before you fly',
      'Drink bottled or filtered water and avoid uncooked street food before your procedure',
    ],
  },
  {
    title: 'Money & connectivity',
    items: [
      'Cards are widely accepted; keep some Indian Rupees for small purchases',
      'Your coordinator can help you get a local SIM card on arrival',
      'Keep receipts - your insurer may ask for them',
    ],
  },
  {
    title: 'On arrival',
    items: [
      'Your airport pickup driver will hold a sign with your name at the arrivals exit',
      'Share your live location with your coordinator when you land',
      'Save the 24/7 helpline number on your phone',
    ],
  },
];

export function PreArrivalGuideDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tips = useCulturalTips();
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Pre-arrival guide" description="Everything to prepare before you travel to India.">
      <div className="space-y-5">
        {GUIDE_SECTIONS.map((section) => (
          <div key={section.title}>
            <h3 className="font-semibold">{section.title}</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
        {tips.data && tips.data.length > 0 ? (
          <div>
            <h3 className="font-semibold">Cultural tips</h3>
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
      toast.success('SOS sent. Your coordinator and our support team have been alerted and will call you now.');
      setOpen(false);
      setMessage('');
    } catch (err) {
      toast.error(`SOS could not be sent: ${errorMessage(err)}. Please call the helpline or 112.`);
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
        SOS
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => void send()}
        title="Send an SOS alert?"
        confirmLabel="Send SOS now"
        tone="danger"
        loading={sending}
      >
        <div className="space-y-3">
          <p className="flex gap-2">
            <ShieldAlert className="h-5 w-5 shrink-0 text-danger" aria-hidden />
            Your coordinator and the 24/7 support team will be alerted immediately with your location (if you allow it).
            For a life-threatening emergency also call <a className="font-semibold text-red-600" href="tel:112">112</a>.
          </p>
          <label className="block text-sm font-medium" htmlFor="sos-message">
            What is happening? (optional)
          </label>
          <Textarea
            id="sos-message"
            maxLength={1000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. severe pain at the hotel, need help"
          />
        </div>
      </ConfirmDialog>
    </>
  );
}
