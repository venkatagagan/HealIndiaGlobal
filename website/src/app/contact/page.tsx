import type { Metadata } from 'next';
import { LifeBuoy, Mail, MessagesSquare, PhoneCall } from 'lucide-react';
import { getDictionary } from '@/i18n';
import { fmt } from '@/i18n/format';
import { CONTACT_ENDPOINT, PORTALS } from '@/config/site';
import { getSiteConfig } from '@/lib/site-config';
import { href, routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { PageHero } from '@/components/page-hero';
import { ContactForm } from '@/components/contact-form';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary();
  return pageMetadata({ path: routes.contact, title: t.contact.metaTitle, description: t.contact.metaDescription });
}

export default async function ContactPage() {
  const t = getDictionary();
  // Email and helplines: System -> Website & contact in the staff console (env fallback).
  const { contact } = await getSiteConfig();
  const CONTACT_EMAIL = contact.email;
  const helplines = [
    { label: 'Phone', value: contact.phoneDisplay, href: contact.phone ? `tel:${contact.phone}` : '' },
    { label: 'WhatsApp', value: contact.whatsappDisplay, href: contact.whatsapp ? `https://wa.me/${contact.whatsapp}` : '' },
  ].filter((h) => h.href);
  const c = t.contact;

  return (
    <>
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: c.title, path: href(routes.contact) },
        ]}
        title={c.title}
        intro={c.intro}
      />
      <div className="container-page grid gap-10 py-8 sm:py-10 lg:grid-cols-[1.6fr_1fr]">
        <section aria-label={c.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
          <ContactForm
            email={CONTACT_EMAIL}
            endpoint={CONTACT_ENDPOINT}
            labels={{
              name: c.name,
              email: c.email,
              phone: c.phone,
              country: c.country,
              topic: c.topic,
              topics: c.topics,
              message: c.message,
              sendEmail: c.sendEmail,
              send: c.send,
              sending: c.sending,
              sent: c.sent,
              mailtoOpened: c.mailtoOpened,
              error: c.error,
              required: c.required,
              invalidEmail: c.invalidEmail,
              medicalWarning: c.medicalWarning,
              privacyNote: c.privacyNote,
            }}
          />
        </section>
        <aside className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-surface p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <Mail className="h-5 w-5 text-primary-700" aria-hidden="true" />
              {c.emailUs}
            </h2>
            <a href={`mailto:${CONTACT_EMAIL}`} className="mt-2 block font-medium break-all text-primary-700 underline underline-offset-4">
              {CONTACT_EMAIL}
            </a>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-surface p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <MessagesSquare className="h-5 w-5 text-primary-700" aria-hidden="true" />
              {c.patientsTitle}
            </h2>
            <p className="mt-2 text-sm text-slate-700">{c.patientsBody}</p>
            <a href={PORTALS.patient} className="mt-3 inline-block text-sm font-semibold text-primary-700 underline underline-offset-4">
              {t.nav.goToPortal}
            </a>
          </div>
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-950">
            <h2 className="flex items-center gap-2 font-semibold">
              <LifeBuoy className="h-5 w-5" aria-hidden="true" />
              {c.helplinesTitle}
            </h2>
            <p className="mt-2 text-sm">{fmt(c.helplineEmergency, { number: contact.emergency })}</p>
            {contact.emergency ? (
              <a
                href={`tel:${contact.emergency}`}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
              >
                <PhoneCall className="h-4 w-4" aria-hidden="true" />
                {`Call ${contact.emergency}`}
              </a>
            ) : null}
            {helplines.length ? (
              <dl className="mt-3 space-y-1 text-sm">
                {helplines.map((h) => (
                  <div key={h.label} className="flex justify-between gap-3">
                    <dt>{h.label}</dt>
                    <dd className="font-semibold">
                      <a href={h.href} className="hover:underline" {...(h.href.startsWith('https:') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                        {h.value}
                      </a>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {contact.supportHours ? <p className="mt-3 text-sm">{contact.supportHours}</p> : null}
          </div>
        </aside>
      </div>
    </>
  );
}
