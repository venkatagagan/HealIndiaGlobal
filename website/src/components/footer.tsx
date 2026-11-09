import Link from 'next/link';
import { ArrowRight, BadgeCheck, LockKeyhole, Mail, PhoneCall, ShieldCheck } from 'lucide-react';
import type { Dictionary } from '@/i18n';
import { fmt } from '@/i18n/format';
import { href, routes } from '@/lib/routes';
import type { Specialty } from '@/lib/data/types';
import { getSiteConfig } from '@/lib/site-config';
import { assessmentUrl } from '@/config/site';
import { BrandIcon, socialOf } from './brand-icons';
import { FooterColumns, type FooterColumn } from './footer-columns';
import { Logo } from './logo';

export async function Footer({ t, specialties }: { t: Dictionary; specialties: Specialty[] }) {
  const f = t.footer;
  // Contact, social links, credit and disclaimer: site settings (System -> Website & contact), env as fallback.
  const site = await getSiteConfig();
  const numbers = site.contact;
  const email = site.contact.email;
  // GA4 sets cookies after consent; plausible/off do not.
  const usesCookies = site.analytics.provider === 'ga4';

  const columns: FooterColumn[] = [
    {
      title: f.treatments,
      links: [
        ...specialties.slice(0, 6).map((s) => ({ href: href(routes.specialty(s.slug)), label: s.name })),
        { href: href(routes.treatments), label: t.nav.allTreatments },
      ],
    },
    {
      title: f.patients,
      links: [
        { href: href(routes.hospitals), label: t.nav.hospitals },
        { href: href(routes.doctors), label: t.nav.doctors },
        { href: href(routes.destinations), label: t.nav.destinations },
        { href: href(routes.costs), label: t.nav.costGuides },
        { href: href(routes.guides), label: t.nav.guides },
        { href: href(routes.stories), label: t.nav.stories },
        { href: href(routes.faq), label: t.nav.faq },
      ],
    },
    {
      title: f.partners,
      links: [
        { href: href(routes.forHospitals), label: t.nav.forHospitals },
        { href: href(routes.forAgents), label: t.nav.forAgents },
        { href: href(routes.login), label: t.nav.login },
        { href: href(routes.register), label: t.nav.getStarted },
      ],
    },
    {
      title: f.company,
      links: [
        { href: href(routes.about), label: t.nav.about },
        { href: href(routes.contact), label: t.nav.contact },
        { href: href(routes.deleteAccount), label: f.deleteAccount },
      ],
    },
  ];
  const legal = [
    { href: href(routes.terms), label: f.terms },
    { href: href(routes.privacy), label: f.privacy },
    { href: href(routes.refunds), label: f.refunds },
  ];
  const contactCls = 'inline-flex items-center gap-2 text-slate-300 transition-colors hover:text-white';

  return (
    <footer className="relative isolate overflow-hidden bg-night text-slate-300 print:hidden" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">
        {t.common.brand}
      </h2>
      {/* soft brand glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(40rem_16rem_at_0%_0%,rgb(24_121_78/0.16),transparent_70%),radial-gradient(44rem_18rem_at_100%_0%,rgb(23_107_135/0.3),transparent_70%)]"
      />
      <div className="container-page grid gap-8 py-10 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] lg:gap-14 lg:py-10">
        <div className="space-y-4">
          <Logo href={href(routes.home)} label={`${t.common.brand} - ${t.common.home}`} dark />
          <p className="text-sm leading-relaxed text-slate-300">{f.tagline}</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label={f.contactTitle}>
            <li>
              <a href={`mailto:${email}`} className={contactCls}>
                <Mail className="h-4 w-4 text-champagne" aria-hidden="true" />
                {email}
              </a>
            </li>
            {numbers.whatsapp ? (
              <li>
                <a href={`https://wa.me/${numbers.whatsapp}`} target="_blank" rel="noopener noreferrer" className={contactCls}>
                  <BrandIcon name="whatsapp" className="h-4 w-4 text-health-400" />
                  <span>
                    <span className="sr-only">{f.whatsapp}: </span>
                    {numbers.whatsappDisplay}
                  </span>
                </a>
              </li>
            ) : null}
            {numbers.phone ? (
              <li>
                <a href={`tel:${numbers.phone}`} className={contactCls}>
                  <PhoneCall className="h-4 w-4 text-champagne" aria-hidden="true" />
                  <span>
                    <span className="sr-only">{f.call}: </span>
                    {numbers.phoneDisplay}
                  </span>
                </a>
              </li>
            ) : null}
          </ul>
          <p className="text-xs leading-relaxed text-slate-400">
            <strong className="font-semibold text-slate-200">{f.disclaimerTitle}: </strong>
            {site.footer.disclaimer || f.disclaimerShort}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <FooterColumns columns={columns} />
          <div className="flex flex-col gap-3 rounded-2xl border border-night-line bg-night-card/70 p-3 sm:flex-row sm:items-center sm:justify-between sm:ps-4">
            <ul className="flex flex-wrap gap-2 text-xs font-medium text-slate-200">
              {[
                { icon: LockKeyhole, label: f.trustPayments },
                { icon: BadgeCheck, label: f.trustAccredited },
                { icon: ShieldCheck, label: f.trustPrivacy },
              ].map(({ icon: Icon, label }) => (
                <li key={label} className="inline-flex items-center gap-1.5 rounded-full border border-night-line bg-night-card px-2.5 py-1">
                  <Icon className="h-3.5 w-3.5 text-champagne" aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>
            <a
              href={assessmentUrl()}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-deep hover:bg-brand-hover"
            >
              {t.common.getAssessment}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-night-line bg-[#102538]">
        <div className="container-page flex flex-col gap-3 py-4 text-xs text-slate-400 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
            <p className="text-slate-300">{fmt(f.rights, { year: new Date().getFullYear() })}</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {legal.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
              {usesCookies ? (
                <li>
                  <a href="#cookie-settings" data-cookie-settings="" className="hover:text-white">
                    {f.cookieSettings}
                  </a>
                </li>
              ) : null}
            </ul>
            {usesCookies ? null : <p className="text-slate-400">{f.cookies}</p>}
          </div>
          <div className="flex items-center gap-4">
            {site.social.length ? (
              <ul className="flex items-center gap-1" aria-label={f.social}>
                {site.social.map(({ url }) => {
                  const s = socialOf(url);
                  return (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={s.name}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
                      >
                        <BrandIcon name={s.glyph} className="h-4 w-4" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {site.footer.developerName ? (
              <p>
                {f.developedBy}{' '}
                <a href={site.footer.developerUrl} target="_blank" rel="noopener" className="font-semibold text-slate-200 hover:text-white">
                  {site.footer.developerName}
                </a>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </footer>
  );
}
