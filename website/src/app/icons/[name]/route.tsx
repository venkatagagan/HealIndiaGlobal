import fs from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';

/**
 * PNG app icons rendered at build time from the design-system SVGs (public/brand/icons): used by
 * manifest.webmanifest, the apple-touch-icon and the Organization logo in JSON-LD (Google wants a raster logo).
 */
const ICONS = {
  'icon-192.png': { size: 192, file: 'app-icon.svg' },
  'icon-512.png': { size: 512, file: 'app-icon.svg' },
  'maskable-512.png': { size: 512, file: 'maskable-icon.svg' },
  'apple-touch-icon.png': { size: 180, file: 'app-icon-ios.svg' },
} as const;

type IconName = keyof typeof ICONS;

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(ICONS).map((name) => ({ name }));
}

function svgDataUri(file: string): string | null {
  for (const candidate of [file, 'favicon.svg']) {
    try {
      const svg = fs.readFileSync(path.join(process.cwd(), 'public', 'brand', 'icons', candidate));
      return `data:image/svg+xml;base64,${svg.toString('base64')}`;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const icon = ICONS[name as IconName];
  if (!icon) return new Response('Not found', { status: 404 });
  const src = svgDataUri(icon.file);
  const { size } = icon;
  return new ImageResponse(
    src ? (
      // eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by ImageResponse, not shown in the page
      <img src={src} width={size} height={size} alt="" />
    ) : (
      <div style={{ width: size, height: size, background: '#10B981', display: 'flex' }} />
    ),
    { width: size, height: size, headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
  );
}
