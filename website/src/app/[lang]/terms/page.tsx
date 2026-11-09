import type { Metadata } from 'next';
import { LegalPage, legalMetadata } from '@/components/legal-page';

export function generateMetadata(): Promise<Metadata> {
  return legalMetadata('terms');
}

export default function TermsPage() {
  return <LegalPage doc="terms" />;
}
