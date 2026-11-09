'use client';

import { useId, useState, type FormEvent } from 'react';
import { buttonClass } from './ui';

export interface ContactLabels {
  name: string;
  email: string;
  phone: string;
  country: string;
  topic: string;
  topics: Record<string, string>;
  message: string;
  sendEmail: string;
  send: string;
  sending: string;
  sent: string;
  mailtoOpened: string;
  error: string;
  /** 429 from the enquiries endpoint */
  tooMany: string;
  /** label of the hidden anti-spam field (screen readers skip it; bots fill it) */
  honeypot: string;
  required: string;
  invalidEmail: string;
  medicalWarning: string;
  privacyNote: string;
}

type Status = { kind: 'idle' | 'sending' | 'sent' | 'mailto' | 'error'; text?: string };

/**
 * Contact form. POSTs JSON to `endpoint` (src/config/site.ts CONTACT_ENDPOINT: NEXT_PUBLIC_CONTACT_ENDPOINT, else the
 * API's public `POST {NEXT_PUBLIC_API_BASE}/site/enquiries`, which answers 202 and is rate limited to 5 messages per
 * 10 minutes per IP) and only reports success on a 2xx answer; a 429 asks the visitor to try again later. The body is
 * `{name, email, phone?, country?, topic, message, website}` where `website` is a visually hidden honeypot field that
 * people leave empty and bots fill (the API accepts such posts with 202 but stores nothing). When no endpoint can be
 * determined the form opens the visitor's email app with the message pre-filled; it never pretends a message was sent.
 */
export function ContactForm({ labels, email, endpoint }: { labels: ContactLabels; email: string; endpoint: string }) {
  const id = useId();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fill = (s: string) => s.replace('{email}', email);

  function validate(data: Record<string, string>) {
    const e: Record<string, string> = {};
    if (!data.name?.trim()) e.name = labels.required;
    if (!data.email?.trim()) e.email = labels.required;
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) e.email = labels.invalidEmail;
    if (!data.message?.trim()) e.message = labels.required;
    return e;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    const e = validate(data);
    setErrors(e);
    if (Object.keys(e).length) return;
    const topic = labels.topics[data.topic ?? 'other'] ?? data.topic ?? '';

    if (endpoint) {
      setStatus({ kind: 'sending' });
      const phone = data.phone?.trim() ?? '';
      const country = data.country?.trim() ?? '';
      const payload = {
        name: data.name?.trim() ?? '',
        email: data.email?.trim() ?? '',
        ...(phone ? { phone } : {}),
        ...(country ? { country } : {}),
        topic: data.topic || 'other',
        message: data.message?.trim() ?? '',
        website: data.website ?? '',
      };
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.status === 429) {
          setStatus({ kind: 'error', text: labels.tooMany });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        form.reset();
        setStatus({ kind: 'sent', text: labels.sent });
      } catch {
        setStatus({ kind: 'error', text: fill(labels.error) });
      }
      return;
    }

    const body = [
      data.message?.trim() ?? '',
      '',
      '--',
      `${labels.name}: ${data.name?.trim() ?? ''}`,
      `${labels.email}: ${data.email?.trim() ?? ''}`,
      data.phone?.trim() ? `${labels.phone}: ${data.phone.trim()}` : '',
      data.country?.trim() ? `${labels.country}: ${data.country.trim()}` : '',
    ]
      .filter((line, i) => line !== '' || i === 1)
      .join('\n');
    const url = `mailto:${email}?subject=${encodeURIComponent(`[${topic}] ${data.name?.trim() ?? ''}`)}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
    setStatus({ kind: 'mailto', text: fill(labels.mailtoOpened) });
  }

  const field = 'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900 aria-invalid:border-red-600';
  const err = (name: string) =>
    errors[name] ? (
      <p id={`${id}-${name}-err`} className="mt-1 text-sm text-red-700">
        {errors[name]}
      </p>
    ) : null;

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="space-y-5"
    >
      <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        {labels.medicalWarning}
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-name`} className="mb-1.5 block text-sm font-medium">
            {labels.name}
          </label>
          <input id={`${id}-name`} name="name" autoComplete="name" required maxLength={200} className={field} aria-invalid={!!errors.name} aria-describedby={errors.name ? `${id}-name-err` : undefined} />
          {err('name')}
        </div>
        <div>
          <label htmlFor={`${id}-email`} className="mb-1.5 block text-sm font-medium">
            {labels.email}
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            className={field}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? `${id}-email-err` : undefined}
          />
          {err('email')}
        </div>
        <div>
          <label htmlFor={`${id}-phone`} className="mb-1.5 block text-sm font-medium">
            {labels.phone}
          </label>
          <input id={`${id}-phone`} name="phone" type="tel" autoComplete="tel" maxLength={32} className={field} />
        </div>
        <div>
          <label htmlFor={`${id}-country`} className="mb-1.5 block text-sm font-medium">
            {labels.country}
          </label>
          <input id={`${id}-country`} name="country" autoComplete="country-name" maxLength={100} className={field} />
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-topic`} className="mb-1.5 block text-sm font-medium">
          {labels.topic}
        </label>
        <select id={`${id}-topic`} name="topic" defaultValue="patient" className={field}>
          {Object.entries(labels.topics).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-message`} className="mb-1.5 block text-sm font-medium">
          {labels.message}
        </label>
        <textarea
          id={`${id}-message`}
          name="message"
          rows={6}
          required
          maxLength={4000}
          className={field}
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? `${id}-message-err` : undefined}
        />
        {err('message')}
      </div>
      {/* Honeypot: hidden from people and assistive tech; bots that fill every field reveal themselves. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>{labels.honeypot}</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className={buttonClass('primary', 'md')} disabled={status.kind === 'sending'}>
          {status.kind === 'sending' ? labels.sending : endpoint ? labels.send : labels.sendEmail}
        </button>
        <p className="text-sm text-slate-600">{labels.privacyNote}</p>
      </div>
      <div aria-live="polite">
        {status.text ? (
          <p
            className={`rounded-xl px-4 py-3 text-sm ${
              status.kind === 'error' ? 'bg-red-50 text-red-800' : status.kind === 'sent' ? 'bg-health-50 text-health-900' : 'bg-slate-50 text-slate-800'
            }`}
          >
            {status.text}
          </p>
        ) : null}
      </div>
    </form>
  );
}
