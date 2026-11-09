import type { Metadata } from 'next';
import { LegalPage, legalMetadata } from '@/components/legal-page';

export function generateMetadata(): Promise<Metadata> {
  return legalMetadata('refunds');
}

export default function RefundPolicyPage() {
  return <LegalPage doc="refunds" />;
}
