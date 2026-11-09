'use client';

import { MessageCircle, PhoneCall, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { BrandIcon } from './brand-icons';

export interface FloatingContactProps {
  /** Digits only for wa.me (empty = hidden). */
  whatsapp: string;
  /** tel: target (empty = hidden). */
  phone: string;
  labels: { whatsapp: string; call: string; toggle: string; close: string; message: string };
}

const fab =
  'group relative flex h-13 w-13 items-center justify-center rounded-full shadow-[0_10px_30px_-8px_rgb(15_23_42/0.45)] ring-1 ring-black/5 transition hover:-translate-y-0.5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary-600';

function Tip({ text }: { text: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute end-full me-3 hidden translate-x-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap text-white opacity-0 shadow-lg transition group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 sm:block"
    >
      {text}
    </span>
  );
}

/**
 * Floating WhatsApp + Call buttons (bottom-right, every page). Desktop: two stacked buttons with hover tooltips.
 * Small screens: one button that expands into both, so content stays readable. Hidden on print.
 */
export function FloatingContact({ whatsapp, phone, labels }: FloatingContactProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (!whatsapp && !phone) return null;

  const items = (
    <>
      {whatsapp ? (
        <a
          href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(labels.message)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={labels.whatsapp}
          className={`${fab} bg-[#25D366] text-white hover:bg-[#1ebe5b]`}
        >
          <BrandIcon name="whatsapp" className="h-6 w-6" />
          <Tip text={labels.whatsapp} />
        </a>
      ) : null}
      {phone ? (
        <a href={`tel:${phone}`} aria-label={labels.call} className={`${fab} bg-accent text-white hover:bg-accent-hover`}>
          <PhoneCall className="h-5 w-5" aria-hidden="true" />
          <Tip text={labels.call} />
        </a>
      ) : null}
    </>
  );

  return (
    <div
      className="fixed end-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 print:hidden"
      data-floating-contact=""
    >
      {/* sm and up: always both */}
      <div className="hidden flex-col items-end gap-3 sm:flex">{items}</div>
      {/* phones: one expandable button */}
      <div className="flex flex-col items-end gap-3 sm:hidden">
        <div id={id} hidden={!open} className="flex flex-col items-end gap-3">
          {items}
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          aria-label={open ? labels.close : labels.toggle}
          onClick={() => setOpen((v) => !v)}
          className={`${fab} bg-slate-900 text-white`}
        >
          {open ? <X className="h-5 w-5" aria-hidden="true" /> : <MessageCircle className="h-6 w-6" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
