import type { Dictionary } from '@/i18n';
import { href, routes } from '@/lib/routes';
import { getNavData } from '@/lib/nav';
import { AuthNav } from './auth-nav';
import { Logo } from './logo';
import { MegaMenu, MobileNav } from './mega-menu';

export async function Header({ t }: { t: Dictionary }) {
  const data = await getNavData(t);
  const n = t.nav;
  const authLabels = { login: n.login, getStarted: n.getStarted, goToPortal: n.goToPortal };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white text-slate-900 shadow-[0_1px_0_0_rgb(176_141_87/0.35)]">
      <div className="container-page flex h-16 items-center gap-3">
        <Logo href={href(routes.home)} label={`${t.common.brand} - ${t.common.home}`} />
        <MegaMenu data={data} />
        <div className="ms-auto flex items-center gap-1.5">
          <div className="hidden sm:block">
            <AuthNav loginHref={href(routes.login)} registerHref={href(routes.register)} labels={authLabels} />
          </div>
          <MobileNav
            data={data}
            footer={
              <div className="sm:hidden">
                <AuthNav compact loginHref={href(routes.login)} registerHref={href(routes.register)} labels={authLabels} />
              </div>
            }
          />
        </div>
      </div>
    </header>
  );
}
