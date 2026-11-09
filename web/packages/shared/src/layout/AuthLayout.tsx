import type { ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/cn';
import { useCommonTranslation } from '../lib/i18n';
import { BRAND, BrandLogo } from './Brand';
import { ThemeToggle } from './controls';

export interface AuthLayoutProps {
  children?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** replaces the logo above the form */
  brand?: ReactNode;
  /** below the form (links to register / help) */
  footer?: ReactNode;
  /** replaces the gradient side panel content; `false` hides the panel */
  aside?: ReactNode | false;
  showThemeToggle?: boolean;
  className?: string;
}

/** Centered sign-in / sign-up shell with the brand gradient panel on large screens. */
export function AuthLayout({
  children,
  title,
  subtitle,
  brand,
  footer,
  aside,
  showThemeToggle = true,
  className,
}: AuthLayoutProps) {
  const { t } = useCommonTranslation();
  const showAside = aside !== false;
  return (
    <div className={cn('grid min-h-screen bg-canvas text-fg', showAside && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]', className)}>
      <div className="relative flex flex-col px-4 py-8 sm:px-6 lg:px-12">
        <div className="flex items-center justify-between gap-2">
          {brand ?? <BrandLogo tagline />}
          <div className="flex items-center gap-1">
            {showThemeToggle && <ThemeToggle />}
          </div>
        </div>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          {title && <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>}
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
          <div className={cn(title || subtitle ? 'mt-8' : '')}>{children}</div>
          {footer && <div className="mt-8 text-center text-sm text-muted">{footer}</div>}
        </main>
        <p className="text-center text-xs text-muted">
          © {new Date().getFullYear()} {BRAND.name}. {t('layout.allRightsReserved')}
        </p>
      </div>
      {showAside && (
        <aside className="relative hidden overflow-hidden bg-linear-to-br from-hero-from via-hero-via to-hero-to text-white lg:flex">
          <div className="pointer-events-none absolute -end-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-32 -start-16 size-96 rounded-full bg-cyan-300/20 blur-3xl" aria-hidden />
          <div className="relative flex w-full flex-col justify-center p-12 xl:p-16">
            {aside ?? (
              <>
                <p className="text-sm font-semibold uppercase tracking-widest text-white/80">{BRAND.name}</p>
                <h2 className="mt-4 max-w-md text-4xl font-bold leading-tight tracking-tight">{t('layout.asideTitle')}</h2>
                <p className="mt-4 max-w-md text-lg text-white/85">{t('brand.tagline')}</p>
                <ul className="mt-10 flex max-w-md flex-col gap-4">
                  {[t('layout.asidePoint1'), t('layout.asidePoint2'), t('layout.asidePoint3')].map((point) => (
                    <li key={point} className="flex items-start gap-3 text-base text-white/90">
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-200" aria-hidden />
                      {point}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
