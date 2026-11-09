import type { Metadata } from 'next';
import { LegalPage, legalMetadata } from '@/components/legal-page';

export function generateMetadata(): Promise<Metadata> {
  return legalMetadata('privacy');
}

export default function PrivacyPage() {
  return <LegalPage doc="privacy" />;
}
