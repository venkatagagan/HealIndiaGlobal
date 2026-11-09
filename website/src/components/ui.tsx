import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

type Variant = 'primary' | 'accent' | 'secondary' | 'outline' | 'onDark' | 'inverse' | 'link';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline-offset-4 disabled:opacity-60 disabled:cursor-not-allowed';

const variants: Record<Variant, string> = {
  // White on teal #0F766E: 5.5:1.
  primary: 'bg-brand text-brand-deep hover:bg-brand-hover shadow-sm',
  accent: 'bg-accent text-white hover:bg-accent-hover shadow-sm',
  secondary: 'bg-white text-slate-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50',
  // Navy outline on light surfaces (secondary hero action).
  outline: 'bg-transparent text-slate-900 ring-1 ring-inset ring-slate-900/80 hover:bg-white',
  onDark: 'bg-white/10 text-white ring-1 ring-inset ring-white/40 hover:bg-white/20',
  // On the blue->green brand band: white button, medical-blue text (6.1:1).
  inverse: 'bg-white text-primary-800 hover:bg-primary-50 shadow-sm',
  link: 'text-primary-700 underline underline-offset-4 hover:text-primary-900 px-0 py-0',
};

const sizes: Record<Size, string> = {
  sm: 'px-3.5 py-2 text-sm',
  md: 'px-5 py-3 text-base',
  lg: 'px-6 py-3.5 text-base sm:text-lg',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra = ''): string {
  return [base, variants[variant], variant === 'link' ? '' : sizes[size], extra].filter(Boolean).join(' ');
}

interface ButtonLinkProps extends Omit<ComponentProps<'a'>, 'href'> {
  href: string;
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

/** Internal paths use next/link; absolute URLs (portals) render a plain anchor. */
export function ButtonLink({ href, variant = 'primary', size = 'md', className = '', children, ...rest }: ButtonLinkProps) {
  const cls = buttonClass(variant, size, className);
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} className={cls} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} {...rest}>
      {children}
    </Link>
  );
}

type BadgeTone = 'green' | 'primary' | 'slate' | 'amber' | 'blue' | 'onDark';
const tones: Record<BadgeTone, string> = {
  green: 'bg-health-100 text-health-800 ring-health-600/20',
  primary: 'bg-primary-100 text-primary-800 ring-primary-600/20',
  slate: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  amber: 'bg-amber-100 text-amber-900 ring-amber-600/20',
  blue: 'bg-primary-50 text-primary-800 ring-primary-600/20',
  onDark: 'bg-white/10 text-white ring-white/25',
};

export function Badge({ tone = 'slate', children, className = '' }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function SectionHeader({
  id,
  eyebrow,
  title,
  subtitle,
  align = 'start',
  dark = false,
  action,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: 'start' | 'center';
  dark?: boolean;
  action?: ReactNode;
}) {
  return (
    <div
      className={`mb-5 flex flex-col gap-3 sm:mb-6 ${align === 'center' ? 'items-center text-center' : 'sm:flex-row sm:items-end sm:justify-between'}`}
    >
      <div className={align === 'center' ? 'max-w-2xl' : 'max-w-3xl'}>
        {eyebrow ? (
          <p className={`mb-2 text-sm font-semibold tracking-wide uppercase ${dark ? 'text-health-400' : 'text-primary-700'}`}>
            {eyebrow}
          </p>
        ) : null}
        <h2 id={id} className={`text-2xl font-bold tracking-tight sm:text-3xl ${dark ? 'text-white' : 'text-slate-900'}`}>
          {title}
        </h2>
        {subtitle ? <p className={`mt-3 text-base sm:text-lg ${dark ? 'text-slate-300' : 'text-slate-600'}`}>{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white shadow-card ${className}`}>{children}</div>;
}

/** Dashed-free description list item used for key facts. */
export function Fact({ label, value, icon }: { label: string; value: ReactNode; icon?: ReactNode }) {
  return (
    // A <dl> group may only contain <dt>/<dd> (axe "definition-list"), so the icon sits inside the <dt>.
    <div className={icon ? 'relative ps-8' : undefined}>
      <dt className="text-sm text-slate-600">
        {icon ? (
          <span className="absolute start-0 top-0.5 text-primary-700" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {label}
      </dt>
      <dd className="font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
