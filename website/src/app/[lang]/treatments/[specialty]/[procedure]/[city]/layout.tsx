import type { ReactNode } from 'react';
import { EnglishOnly } from '@/components/english-only';

/** Procedure x city pages are English only (see components/english-only.tsx). */
export default function ProcedureCityLayout({ children }: { children: ReactNode }) {
  return <EnglishOnly>{children}</EnglishOnly>;
}
