import Link from 'next/link';
import { getDictionary } from '@/i18n';
import { illustration } from '@/lib/brand';
import { href, routes } from '@/lib/routes';
import { buttonClass } from '@/components/ui';

/** 404 page (rendered inside the root layout with header and footer). */
export default function NotFound() {
  const c = getDictionary().notFound;
  const art = illustration('error');
  return (
    <div className="container-page flex flex-col items-center py-10 text-center sm:py-14">
      {art ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={art} alt="" width={240} height={180} className="h-40 w-auto" />
      ) : null}
      <p className="mt-6 text-sm font-semibold tracking-wide text-primary-700 uppercase">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">{c.title}</h1>
      <p className="mt-3 max-w-lg text-slate-600">{c.body}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href={href(routes.home)} className={buttonClass('primary', 'md')}>
          {c.home}
        </Link>
        <Link href={href(routes.treatments)} className={buttonClass('secondary', 'md')}>
          {c.treatments}
        </Link>
      </div>
    </div>
  );
}
