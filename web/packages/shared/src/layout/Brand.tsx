import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '../lib/cn';

export const BRAND = {
  name: 'Heal India Global',
  tagline: 'Your Gateway to Indian Medical Excellence',
} as const;

/** Lotus-plus mark path (design/logo/logo-mark.svg, viewBox 0 0 128 128; the plus is an even-odd cut-out). */
const MARK_PATH =
  'M64 12C66 21 71 29 77 37C83 45 85 54 85 65C85 85 75 99 64 108C53 99 43 85 43 65C43 54 45 45 51 37C57 29 62 21 64 12ZM62 54H66Q68 54 68 56V62H74Q76 62 76 64V68Q76 70 74 70H68V76Q68 78 66 78H62Q60 78 60 76V70H54Q52 70 52 68V64Q52 62 54 62H60V56Q60 54 62 54ZM68 112C92 114 114 92 116 44C102 52 91 62 90 76C89 92 80 104 68 112ZM60 112C36 114 14 92 12 44C26 52 37 62 38 76C39 92 48 104 60 112ZM74 116C96 119 114 108 122 86C112 89 105 95 100 101C94 108 85 113 74 116ZM54 116C32 119 14 108 6 86C16 89 23 95 28 101C34 108 43 113 54 116Z';

/** Official Heal India Global logo mark (lotus + medical plus, mark gradient). Decorative. */
export function BrandMark({ className, mono = false }: { className?: string; /** single colour (currentColor) */ mono?: boolean }) {
  const gradientId = `hig-mark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (mono) {
    return (
      <svg viewBox="0 0 128 128" className={cn('size-9 shrink-0', className)} aria-hidden focusable="false">
        <path fill="currentColor" fillRule="evenodd" d={MARK_PATH} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 128 128" className={cn('size-9 shrink-0', className)} aria-hidden focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="20" y1="114" x2="108" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#22C55E" />
          <stop offset=".3" stopColor="#10B981" />
          <stop offset=".62" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <path fill={`url(#${gradientId})`} fillRule="evenodd" d={MARK_PATH} />
    </svg>
  );
}

export interface BrandLogoProps {
  /** small caption under the name (e.g. "Agent portal"); `tagline` shows the brand tagline */
  subtitle?: ReactNode;
  tagline?: boolean;
  /** mark only */
  compact?: boolean;
  /** wrap in a react-router <Link> */
  to?: string;
  /** wrap in a plain <a> (cross-app links) */
  href?: string;
  className?: string;
}

/** "Heal India Global" wordmark with the logo mark. */
export function BrandLogo({ subtitle, tagline = false, compact = false, to, href, className }: BrandLogoProps) {
  const content = (
    <span className={cn('inline-flex min-w-0 items-center gap-2.5', className)}>
      <BrandMark />
      {compact ? (
        <span className="sr-only">{BRAND.name}</span>
      ) : (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[15px] font-bold tracking-tight text-fg">{BRAND.name}</span>
          {(subtitle || tagline) && (
            <span className="block truncate text-xs font-medium text-muted">{subtitle ?? BRAND.tagline}</span>
          )}
        </span>
      )}
    </span>
  );
  const linkClass =
    'inline-flex min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg';
  if (to) {
    return (
      <Link to={to} className={linkClass}>
        {content}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} className={linkClass}>
        {content}
      </a>
    );
  }
  return content;
}
