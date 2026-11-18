import { getSpecialty } from '@/lib/data/catalog';
import { defaultOgImage, ogImage, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og';

export const revalidate = 3600;
export const alt = 'Treatment in India on Heal India Global';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ specialty: string }> }) {
  const { specialty: slug } = await params;
  const s = (await getSpecialty(slug)).data;
  if (!s) return defaultOgImage();
  return ogImage({
    eyebrow: 'Treatment in India',
    title: s.name,
    subtitle: s.description,
    chips: [s.procedures_count ? `${s.procedures_count} ${s.procedures_count === 1 ? 'procedure' : 'procedures'}` : null],
  });
}
