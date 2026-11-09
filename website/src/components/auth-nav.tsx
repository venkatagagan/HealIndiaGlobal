'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { checkSession, portalUrl } from '@/lib/auth-client';
import type { PortalRole } from '@/config/site';
import { buttonClass } from './ui';

interface Props {
  loginHref: string;
  registerHref: string;
  labels: { login: string; getStarted: string; goToPortal: string };
  compact?: boolean;
  /** On the medical-blue header: white button, white login link. */
  onBrand?: boolean;
}

/** "Log in / Get started", or "Go to my portal" when a public-door session exists. */
export function AuthNav({ loginHref, registerHref, labels, compact = false, onBrand = false }: Props) {
  const [role, setRole] = useState<PortalRole | null>(null);

  useEffect(() => {
    let alive = true;
    const run = () => {
      if (document.visibilityState !== 'visible') return;
      checkSession().then((r) => {
        if (alive) setRole(r);
      });
    };
    run();
    document.addEventListener('visibilitychange', run);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', run);
    };
  }, []);

  if (role) {
    return (
      <a href={portalUrl(role)} className={buttonClass('primary', 'sm', onBrand ? 'focus-visible:outline-white' : '')}>
        <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
        {labels.goToPortal}
      </a>
    );
  }
  return (
    <div className={`flex items-center ${compact ? 'flex-col items-stretch gap-2' : 'gap-1.5'}`}>
      <Link href={loginHref} className={buttonClass(compact ? 'secondary' : 'link', 'sm', compact ? '' : `no-underline hover:underline px-2.5 ${onBrand ? 'text-white hover:text-white focus-visible:outline-white' : 'text-slate-800'}`)}>
        {labels.login}
      </Link>
      <Link href={registerHref} className={buttonClass('primary', 'sm', onBrand ? 'focus-visible:outline-white' : '')}>
        {labels.getStarted}
      </Link>
    </div>
  );
}
