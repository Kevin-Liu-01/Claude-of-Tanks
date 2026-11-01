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
/**
 * A battlefield's survey (lab --features in a render hold): the media lane's local dumps, read from MEDIA_R5_FEATURES
 * (another dump folder under review) or shots/media-r5/features. MEDIA_R5_FEATURES=off reads none (null), so a
 * default-tier receipt stages and judges a take alike on every machine (267: fleet.selftest).
 */
export const surveyPath = (map) => process.env.MEDIA_R5_FEATURES === 'off' ? null
  : join(process.env.MEDIA_R5_FEATURES ?? join(SHOTS, 'features'), `features-${map}.json`);
// Public address shown on end cards (src/officialHost.ts is the site's own record of it).
export const SITE_URL = 'cot.kevinliu.studio';
