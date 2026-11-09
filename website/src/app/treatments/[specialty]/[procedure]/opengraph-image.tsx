import { getProcedure } from '@/lib/data/catalog';
import { defaultOgImage, ogImage, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og';

export const revalidate = 3600;
export const alt = 'Procedure guide on Heal India Global';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ specialty: string; procedure: string }> }) {
  const { procedure: slug } = await params;
  const p = (await getProcedure(slug)).data;
  if (!p) return defaultOgImage();
  return ogImage({
    eyebrow: p.specialty.name,
    title: p.name,
    subtitle: p.description,
    chips: [
      p.total_stay_days ? `About ${p.total_stay_days} days in India` : null,
      p.hospital_stay_days === 0 ? 'Day care' : p.hospital_stay_days ? `${p.hospital_stay_days} nights in hospital` : null,
    ],
  });
}
