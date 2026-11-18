import { Mail, MapPin, PhoneCall, ShieldCheck } from 'lucide-react';
import type { Dictionary } from '@/i18n';
import { fmt, formatNumber } from '@/i18n/format';
import type { PrivacyContact, PrivacyPerson } from '@/lib/site-config';

/** Anchor of the card on the privacy policy (linked from the footer). */
export const PRIVACY_CONTACT_ID = 'grievance-officer';

function Person({ title, person }: { title: string; person: PrivacyPerson }) {
  return (
    <div>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {person.name ? <p className="text-slate-800">{person.name}</p> : null}
      <ul className="mt-1 space-y-1 text-sm">
        {person.email ? (
          <li className="flex items-center gap-2">
            <Mail className="h-4 w-4 shrink-0 text-primary-700" aria-hidden="true" />
            <a href={`mailto:${person.email}`} className="break-all text-primary-700 underline underline-offset-4">
              {person.email}
            </a>
          </li>
        ) : null}
        {person.phone ? (
          <li className="flex items-center gap-2">
            <PhoneCall className="h-4 w-4 shrink-0 text-primary-700" aria-hidden="true" />
            <a href={`tel:${person.phone.replace(/[^\d+]/g, '')}`} className="text-primary-700 underline underline-offset-4" dir="ltr">
              {person.phone}
            </a>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/** Grievance Officer / DPO card (privacy policy and contact page). Fields that are not published are left out. */
export function PrivacyContactCard({ t, contact, id }: { t: Dictionary; contact: PrivacyContact; id: string }) {
  const l = t.privacyContact;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="max-w-3xl scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
      <h2 id={`${id}-title`} className="flex items-center gap-2 text-lg font-bold">
        <ShieldCheck className="h-5 w-5 text-primary-700" aria-hidden="true" />
        {l.title}
      </h2>
      <p className="mt-2 text-sm text-slate-700">{l.intro}</p>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {contact.grievanceOfficer ? <Person title={l.grievanceOfficer} person={contact.grievanceOfficer} /> : null}
        {contact.dataProtectionOfficer ? <Person title={l.dpo} person={contact.dataProtectionOfficer} /> : null}
      </div>
      {contact.postalAddress ? (
        <div className="mt-4 flex items-start gap-2 text-sm">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary-700" aria-hidden="true" />
          <p>
            <span className="font-semibold text-slate-900">{l.postalAddress}: </span>
            <span className="whitespace-pre-line text-slate-800">{contact.postalAddress}</span>
          </p>
        </div>
      ) : null}
      {contact.responseDays ? <p className="mt-4 text-sm text-slate-700">{fmt(l.responseDays, { days: formatNumber(contact.responseDays) })}</p> : null}
      <p className="mt-2 text-sm text-slate-700">
        {contact.boardUrl ? (
          <a href={contact.boardUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-primary-800">
            {l.board}
          </a>
        ) : (
          l.board
        )}
      </p>
    </section>
  );
}
