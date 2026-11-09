import { getDoctor } from '@/lib/data/catalog';
import { defaultOgImage, ogImage, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og';

export const revalidate = 3600;
export const alt = 'Doctor profile on Heal India Global';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = (await getDoctor(slug)).data;
  if (!d) return defaultOgImage();
  return ogImage({
    eyebrow: d.specialty ? `Doctor · ${d.specialty.name}` : 'Doctor',
    title: d.full_name,
    subtitle: d.hospital ? `${d.hospital.name}, ${d.hospital.city}` : null,
    chips: [
      ...d.qualifications.slice(0, 3),
      d.experience_years ? `${d.experience_years} years of experience` : null,
    ],
  });
}
