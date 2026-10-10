// Where the r5 media toolkit reads and writes. Scripts live here; generated scenes, motion projects, renders and
// the kit stay out of git under shots/media-r5 (shots/ is ignored).
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOL = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(TOOL, '../..');
export const SHOTS = join(REPO, 'shots/media-r5');
export const FINAL = join(SHOTS, 'final');
export const MOTION = join(SHOTS, 'motion');
export const KIT = join(SHOTS, 'kit');
// Public address shown on end cards (src/officialHost.ts is the site's own record of it).
export const SITE_URL = 'cot.kevinliu.studio';
