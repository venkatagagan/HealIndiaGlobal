import { getHospital } from '@/lib/data/catalog';
import { defaultOgImage, ogImage, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og';

export const revalidate = 3600;
export const alt = 'Hospital profile on Heal India Global';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const h = (await getHospital(slug)).data;
  if (!h) return defaultOgImage();
  return ogImage({
    eyebrow: `Hospital · ${[h.city, h.state].filter(Boolean).join(', ')}`,
    title: h.name,
    subtitle: h.specialties.length ? h.specialties.slice(0, 5).join(' · ') : h.description,
    chips: [...h.accreditations.map((a) => a.toUpperCase()), h.international_desk ? 'International patient desk' : null],
  });
}
