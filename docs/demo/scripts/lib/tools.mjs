// Paths and toolchain shared by recorder.mjs and finalize.mjs (no Laragon; everything under the repo's .devtools).
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '../../../..');
export const DEMO_DIR = path.join(REPO, 'docs', 'demo');

function findFfmpeg() {
  const root = path.join(REPO, '.devtools', 'ffmpeg');
  for (const entry of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    const bin = path.join(root, entry, 'bin');
    if (fs.existsSync(path.join(bin, 'ffmpeg.exe'))) return { ffmpeg: path.join(bin, 'ffmpeg.exe'), ffprobe: path.join(bin, 'ffprobe.exe') };
  }
  throw new Error(`ffmpeg not found under ${root} (unzip a static build, e.g. gyan.dev "release essentials", there)`);
}
export const FF = findFfmpeg();

export function probeDuration(file) {
  const out = execFileSync(FF.ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  return Number(String(out).trim());
}

export function run(bin, args) {
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${path.basename(bin)} failed: ${r.stderr}`);
  return r;
}

/** 83.4 -> "00:01:23.400" */
export function vtt(s) {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

/** 83.4 -> "1:23" */
export function fmt(s) {
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
}
