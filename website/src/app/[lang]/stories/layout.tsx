import type { ReactNode } from 'react';
import { EnglishOnly } from '@/components/english-only';

/** Patient stories are English only (see components/english-only.tsx). */
export default function StoriesLayout({ children }: { children: ReactNode }) {
  return <EnglishOnly>{children}</EnglishOnly>;
}
