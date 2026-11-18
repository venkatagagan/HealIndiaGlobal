'use client';

import { useEffect } from 'react';
import { captureRef } from '@/lib/referral';

/** Remembers `?ref=CODE` from any page so the sign-up form can use it later (renders nothing). */
export function ReferralCapture() {
  useEffect(() => {
    if (window.location.search.includes('ref')) captureRef();
  }, []);
  return null;
}
