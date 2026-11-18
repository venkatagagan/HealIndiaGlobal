'use client';

import NextLink from 'next/link';
import type { ComponentProps } from 'react';
import { localizePath } from '@/i18n/config';
import { useLocale } from './locale-provider';

/**
 * `next/link` that keeps the page language: an internal path such as "/hospitals" becomes "/ar/hospitals" on an
 * Arabic page. Already-prefixed paths, external URLs, English-only pages and non-page paths are left unchanged.
 */
export default function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  const locale = useLocale();
  const target = typeof href === 'string' ? localizePath(href, locale) : href;
  return <NextLink href={target} {...props} />;
}
