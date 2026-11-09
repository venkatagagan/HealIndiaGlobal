import { getDictionary } from '@/i18n';
import { isGuideSlug } from '@/lib/guides';
import { defaultOgImage, ogImage, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og';

export const alt = 'Patient guide on Heal India Global';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isGuideSlug(slug)) return defaultOgImage();
  const item = getDictionary().guides.items[slug];
  return ogImage({ eyebrow: 'Patient guide', title: item.title, subtitle: item.description });
}
