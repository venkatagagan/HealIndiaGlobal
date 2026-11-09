import type { Metadata } from 'next';
import { getDictionary } from '@/i18n';
import { faqContent, markdownToPlain, parseFaq, resolveContentHref } from '@/lib/content';
import { faqLd } from '@/lib/jsonld';
import { href, routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { PageHero } from '@/components/page-hero';
import { ContentNotices, ContentPending } from '@/components/content-article';
import { JsonLd } from '@/components/json-ld';
import { MarkdownContent } from '@/components/markdown';
import { ButtonLink } from '@/components/ui';
import { AssessmentCta } from '@/components/cta';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary();
  return pageMetadata({ path: routes.faq, title: t.faq.metaTitle, description: t.faq.metaDescription });
}

export default async function FaqPage() {
  const t = getDictionary();
  const page = faqContent();
  const sections = page ? parseFaq(page.body) : [];

  return (
    <>
      {sections.length ? (
        <JsonLd data={faqLd(sections.flatMap((s) => s.items).map((i) => ({ question: markdownToPlain(i.question), answer: markdownToPlain(i.answer) })))} />
      ) : null}
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: t.faq.title, path: href(routes.faq) },
        ]}
        title={t.faq.title}
        intro={t.faq.intro}
      />
      <div className="container-page space-y-12 py-8 sm:py-10">
        {page ? <ContentNotices page={page} t={t} /> : <ContentPending t={t} />}
        {sections.length ? (
          <div className="grid gap-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <nav aria-labelledby="faq-toc" className="hidden lg:block">
              <h2 id="faq-toc" className="text-sm font-semibold text-slate-900">
                {t.guides.onThisPage}
              </h2>
              <ol className="sticky top-24 mt-3 space-y-2 text-sm">
                {sections.map((s, i) => (
                  <li key={s.title}>
                    <a href={`#faq-${i + 1}`} className="text-slate-700 hover:text-primary-800 hover:underline">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            <div className="space-y-10">
              {sections.map((s, i) => (
                <section key={s.title} aria-labelledby={`faq-${i + 1}`}>
                  {s.title ? (
                    <h2 id={`faq-${i + 1}`} className="scroll-mt-24 text-xl font-bold tracking-tight text-slate-900">
                      {s.title}
                    </h2>
                  ) : null}
                  <div className="mt-4 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
                    {s.items.map((item) => (
                      <details key={item.question} className="px-5 py-4">
                        <summary className="cursor-pointer font-semibold text-slate-900">
                          <h3 className="inline">{markdownToPlain(item.question)}</h3>
                        </summary>
                        <MarkdownContent resolveHref={(h) => resolveContentHref(page!.path, h)} className="mt-3 text-base">
                          {item.answer}
                        </MarkdownContent>
                      </details>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-surface p-6">
          <p className="text-lg font-semibold">{t.faq.stillQuestions}</p>
          <ButtonLink href={href(routes.contact)} variant="secondary">
            {t.faq.contactUs}
          </ButtonLink>
        </div>
        <AssessmentCta title={t.home.ctaTitle} body={t.home.ctaBody} button={t.common.getAssessment} />
      </div>
    </>
  );
}
