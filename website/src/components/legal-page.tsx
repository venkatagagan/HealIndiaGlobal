import type { Metadata } from 'next';
import { getDictionary } from '@/i18n';
import { legalDocument, resolveLegalHref, tableOfContents, type LegalDoc } from '@/lib/content';
import { TocNav } from './toc-nav';
import { href, routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { PageHero } from './page-hero';
import { InlineNote } from './data-notice';
import { MarkdownContent } from './markdown';
import Link from 'next/link';

const PATHS: Record<LegalDoc, string> = { terms: routes.terms, privacy: routes.privacy, refunds: routes.refunds };
/** Search titles (50-60 characters with the site-name suffix); the on-page heading stays t.legal[doc].title. */
const LEGAL_SEO_TITLE: Record<LegalDoc, string> = {
  terms: 'Website and service terms of use',
  privacy: 'Privacy policy: how we protect your data',
  refunds: 'Cancellation and refund policy',
};

export async function legalMetadata(doc: LegalDoc): Promise<Metadata> {
  const t = getDictionary();
  const legal = legalDocument(doc);
  return pageMetadata({
    path: PATHS[doc],
    title: [LEGAL_SEO_TITLE[doc], t.legal[doc].title],
    description: t.legal[doc].metaDescription,
    // Drafts and placeholders are not indexed.
    noindex: !legal || legal.isDraft,
  });
}

/**
 * Terms / Privacy / Refund policy. Renders the legal drafts from docs/legal (synced to content-snapshot/legal)
 * with a visible "draft" banner; without them, a short honest summary.
 */
export async function LegalPage({ doc }: { doc: LegalDoc }) {
  const t = getDictionary();
  const legal = legalDocument(doc);
  const title = t.legal[doc].title;
  return (
    <>
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: title, path: href(PATHS[doc]) },
        ]}
        title={title}
      />
      <div className="container-page space-y-6 py-8 sm:py-10">
        {legal ? (
          <>
            {legal.isDraft ? <InlineNote tone="amber" text={t.legal.draftBanner} /> : null}
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-12">
              <MarkdownContent resolveHref={(h) => resolveLegalHref(h)} className="max-w-3xl min-w-0">
                {legal.body}
              </MarkdownContent>
              <aside className="order-first lg:order-none">
                <TocNav items={tableOfContents(legal.body)} title={t.guides.onThisPage} />
              </aside>
            </div>
          </>
        ) : (
          <>
            <InlineNote tone="amber" text={t.legal.placeholderBanner} />
            <ul className="max-w-3xl list-disc space-y-3 ps-6 text-slate-700">
              {t.legal.placeholders[doc].map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        )}
        {doc === 'privacy' ? (
          <p className="max-w-3xl rounded-2xl border border-slate-200 bg-surface p-5 text-slate-700">
            {t.legal.deleteAccountNote}{' '}
            <Link href={href(routes.deleteAccount)} className="font-semibold text-primary-800 hover:underline">
              {t.legal.deleteAccountLink}
            </Link>
          </p>
        ) : null}
      </div>
    </>
  );
}
