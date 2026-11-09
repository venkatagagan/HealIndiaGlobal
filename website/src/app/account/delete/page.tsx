import type { Metadata } from 'next';
import Link from 'next/link';
import { Archive, CircleCheck, LogIn, Mail, TriangleAlert } from 'lucide-react';
import { getDictionary } from '@/i18n';
import { PORTALS, type PortalRole } from '@/config/site';
import { getSiteConfig } from '@/lib/site-config';
import { href, routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { AccountDeletedBanner } from '@/components/account-deleted-banner';
import { PageHero } from '@/components/page-hero';
import { ButtonLink } from '@/components/ui';

/**
 * Public account-deletion page (app-store requirement): how any user deletes their account, what is erased and what
 * is retained (mirrors RETENTION_RULES in backend/app/modules/auth/service.py and section 9 of the privacy policy).
 */

/** Each portal's account page, where the "Delete account" action lives. */
const ACCOUNT_PAGES: Record<PortalRole, string> = {
  patient: new URL('profile?tab=privacy', PORTALS.patient).toString(),
  agent: new URL('profile', PORTALS.agent).toString(),
  hospital: new URL('profile', PORTALS.hospital).toString(),
};

/** Public login door with `next` pointing at the role's account page (the door only honours same-portal `next`). */
function signInHref(role: PortalRole): string {
  return `${href(routes.login)}?next=${encodeURIComponent(ACCOUNT_PAGES[role])}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary();
  return pageMetadata({
    path: routes.deleteAccount,
    title: t.accountDeletion.metaTitle,
    description: t.accountDeletion.metaDescription,
    descriptionExtras: ['Deletion is permanent.'],
  });
}

export default async function DeleteAccountPage() {
  const CONTACT_EMAIL = (await getSiteConfig()).contact.email;
  const t = getDictionary();
  const c = t.accountDeletion;
  return (
    <>
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: c.title, path: href(routes.deleteAccount) },
        ]}
        title={c.title}
        intro={c.intro}
      />
      <AccountDeletedBanner />
      <div className="container-page grid gap-10 py-8 sm:py-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 max-w-3xl space-y-12">
          <section aria-labelledby="how-title">
            <h2 id="how-title" className="text-2xl font-bold tracking-tight">
              {c.howTitle}
            </h2>
            <ol className="mt-5 list-decimal space-y-3 ps-6 text-slate-700 marker:font-semibold marker:text-primary-700">
              {c.steps.map((step) => (
                <li key={step} className="ps-1 leading-relaxed">
                  {step}
                </li>
              ))}
            </ol>
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <h3 className="font-semibold">{c.blockersTitle}</h3>
                <p className="mt-1 text-sm leading-relaxed">{c.blockers}</p>
              </div>
            </div>
          </section>

          <section aria-labelledby="deleted-title">
            <h2 id="deleted-title" className="text-2xl font-bold tracking-tight">
              {c.deletedTitle}
            </h2>
            <ul className="mt-5 space-y-3">
              {c.deleted.map((line) => (
                <li key={line} className="flex items-start gap-3 text-slate-700">
                  <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-ink" aria-hidden="true" />
                  {line}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="retained-title">
            <h2 id="retained-title" className="text-2xl font-bold tracking-tight">
              {c.retainedTitle}
            </h2>
            <ul className="mt-5 space-y-3">
              {c.retained.map((line) => (
                <li key={line} className="flex items-start gap-3 text-slate-700">
                  <Archive className="mt-0.5 h-5 w-5 shrink-0 text-primary-700" aria-hidden="true" />
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-slate-700">{c.hospitalRecords}</p>
            <p className="mt-3">
              <Link href={href(routes.privacy)} className="font-semibold text-primary-800 underline-offset-4 hover:underline">
                {c.privacyLink}
              </Link>
            </p>
          </section>
        </div>

        <aside className="space-y-6">
          <section aria-labelledby="signin-title" className="rounded-2xl border border-slate-200 bg-surface p-6 lg:sticky lg:top-24">
            <h2 id="signin-title" className="flex items-center gap-2 text-lg font-bold">
              <LogIn className="h-5 w-5 text-primary-700" aria-hidden="true" />
              {c.signInTitle}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{c.signInBody}</p>
            <div className="mt-5 grid gap-2">
              <ButtonLink href={signInHref('patient')} variant="primary">
                {c.signInPatient}
              </ButtonLink>
              <ButtonLink href={signInHref('agent')} variant="secondary">
                {c.signInAgent}
              </ButtonLink>
              <ButtonLink href={signInHref('hospital')} variant="secondary">
                {c.signInHospital}
              </ButtonLink>
            </div>
            <div className="mt-6 border-t border-slate-200 pt-5">
              <h3 className="flex items-center gap-2 font-semibold">
                <Mail className="h-4 w-4 text-primary-700" aria-hidden="true" />
                {c.helpTitle}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">
                {c.help}{' '}
                <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Account deletion request')}`} className="font-semibold text-primary-800 hover:underline">
                  {CONTACT_EMAIL}
                </a>
              </p>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
