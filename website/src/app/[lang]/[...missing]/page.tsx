import { notFound } from 'next/navigation';

/**
 * Any path no other route matches (and switched-off languages, which src/proxy.ts rewrites here) renders the
 * localized 404 page (../not-found.tsx) inside the root layout, with a 404 status.
 */
export default function Missing(): never {
  notFound();
}
