/** Client-side helpers for captured report pages (no dependencies: canvas + createImageBitmap). */

export const DOCAI_MAX_LONG_EDGE = 2400;
export const DOCAI_JPEG_QUALITY = 0.85;
export const DOCAI_MAX_PAGES = 10;
export const DOCAI_MAX_UPLOAD_MB = 10;

export const DOCAI_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif';

const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];

export function fileExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

export function isPdf(file: Blob & { name?: string }): boolean {
  return file.type === 'application/pdf' || fileExtension(file.name ?? '') === 'pdf';
}

export function isHeic(file: Blob & { name?: string }): boolean {
  const ext = fileExtension(file.name ?? '');
  return /image\/hei[cf]/.test(file.type) || ext === 'heic' || ext === 'heif';
}

export function isDicom(file: File): boolean {
  return file.type === 'application/dicom' || fileExtension(file.name) === 'dcm';
}

export function isAcceptedReportFile(file: File): boolean {
  if (isPdf(file)) return true;
  if (file.type.startsWith('image/') && !file.type.includes('svg')) return true;
  return ALLOWED_EXT.includes(fileExtension(file.name));
}

/** Browsers other than Safari can't decode HEIC: those files are uploaded unchanged (the server converts them). */
function canDecodeInBrowser(file: File): boolean {
  if (isPdf(file)) return false;
  if (isHeic(file)) return false;
  return file.type.startsWith('image/');
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      // honour EXIF orientation where supported (Chrome/Firefox/Safari 17+)
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch {
      /* fall back to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Downscale an image so its long edge is at most `maxEdge` px and re-encode as JPEG (quality 0.85). Re-encoding
 * through a canvas also drops EXIF metadata (GPS). PDFs, HEIC (when not decodable) and unreadable files are
 * returned unchanged. Never upscales; keeps the original when the result would be larger.
 */
export async function downscaleImage(file: File, maxEdge = DOCAI_MAX_LONG_EDGE, quality = DOCAI_JPEG_QUALITY): Promise<File> {
  if (!canDecodeInBrowser(file) || typeof document === 'undefined') return file;
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await loadBitmap(file);
  } catch {
    return file;
  }
  const width = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const height = 'naturalHeight' in source ? source.naturalHeight : source.height;
  if (!width || !height) return file;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.fillStyle = '#ffffff'; // transparent PNGs -> white paper
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  if ('close' in source && typeof source.close === 'function') source.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) return file;
  if (scale === 1 && blob.size >= file.size && file.type === 'image/jpeg') return file;
  const base = file.name.replace(/\.[^.]+$/, '') || 'page';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
