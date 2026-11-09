import type { ReactNode } from 'react';
import { Outlet } from 'react-router';
import { cn } from '../lib/cn';
import { useCommonTranslation } from '../lib/i18n';
import { BRAND, BrandLogo } from './Brand';
import { ThemeToggle } from './controls';

export interface PublicLayoutProps {
  /** header slot; omit for the default (logo + theme), `null` for none */
  header?: ReactNode;
  /** footer slot; omit for the default (copyright), `null` for none */
  footer?: ReactNode;
  /** page content (default: <Outlet /> for layout routes) */
  children?: ReactNode;
  className?: string;
  /** class of the <main> element */
  contentClassName?: string;
}

export function DefaultPublicHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <BrandLogo to="/" />
        <div className="flex items-center gap-2">
          {actions}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export function DefaultPublicFooter({ children }: { children?: ReactNode }) {
  const { t } = useCommonTranslation();
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div>
          <BrandLogo tagline />
        </div>
        {children}
        <p>
          © {new Date().getFullYear()} {BRAND.name}. {t('layout.allRightsReserved')}
        </p>
      </div>
    </footer>
  );
}

/** Marketing / public page shell with header and footer slots. */
export function PublicLayout({ header, footer, children, className, contentClassName }: PublicLayoutProps) {
  const { t } = useCommonTranslation();
  return (
    <div className={cn('flex min-h-screen flex-col bg-canvas text-fg', className)}>
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-surface px-4 py-2 text-sm font-medium text-fg shadow focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        {t('layout.skipToContent')}
      </a>
      {header === undefined ? <DefaultPublicHeader /> : header}
      <main id="main-content" tabIndex={-1} className={cn('flex-1 focus:outline-none', contentClassName)}>
        {children ?? <Outlet />}
      </main>
      {footer === undefined ? <DefaultPublicFooter /> : footer}
    </div>
  );
}
