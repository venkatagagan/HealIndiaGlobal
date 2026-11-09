import { defaultOgImage, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og';

export const alt = 'Heal India Global - plan medical treatment at partner hospitals in India';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return defaultOgImage();
}
