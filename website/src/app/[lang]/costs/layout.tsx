import type { ReactNode } from 'react';
import { EnglishOnly } from '@/components/english-only';

/** Cost guides are English only (see components/english-only.tsx). */
export default function CostsLayout({ children }: { children: ReactNode }) {
  return <EnglishOnly>{children}</EnglishOnly>;
}
