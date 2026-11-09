import Link from 'next/link';
import { brandMark } from '@/lib/brand';

/** Inline fallback mark (used only when design/logo assets are not available). */
export function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="hig-mark" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#22C55E" />
          <stop offset="0.35" stopColor="#10B981" />
          <stop offset="0.65" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#hig-mark)" />
      <path
        d="M17.5 11a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5v6.5H29a1.5 1.5 0 0 1 1.5 1.5v2a1.5 1.5 0 0 1-1.5 1.5h-6.5V29a1.5 1.5 0 0 1-1.5 1.5h-2a1.5 1.5 0 0 1-1.5-1.5v-6.5H11A1.5 1.5 0 0 1 9.5 21v-2a1.5 1.5 0 0 1 1.5-1.5h6.5z"
        fill="#fff"
      />
    </svg>
  );
}

/** Mark (from design/ when available) + HTML wordmark in the site font. */
export function Logo({ href, label, dark = false }: { href: string; label: string; dark?: boolean }) {
  // `dark`: white wordmark for the medical-blue header and the navy footer ("Global" in champagne: 4.9:1 on navy, large bold text).
  const mark = brandMark();
  return (
    <Link href={href} className={`flex shrink-0 items-center gap-2 rounded-lg ${dark ? "focus-visible:outline-white" : ""}`} aria-label={label}>
      {mark ? (
        // Small static SVG from design/: a plain <img> avoids the image optimizer for vector files.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mark} alt="" width={36} height={36} className="h-9 w-9" />
      ) : (
        <BrandMark />
      )}
      <span className={`text-lg leading-none font-extrabold tracking-tight ${dark ? 'text-white' : 'text-slate-900'}`}>
        Heal India <span className={dark ? 'text-champagne' : 'text-primary-600'}>Global</span>
      </span>
    </Link>
  );
}
