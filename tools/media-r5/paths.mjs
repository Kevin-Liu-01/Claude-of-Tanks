// Where the r5 media toolkit reads and writes. Scripts live here; generated scenes, motion projects, renders and
// the kit stay out of git under shots/media-r5 (shots/ is ignored).
import { realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOL = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(TOOL, '../..');
export const SHOTS = join(REPO, 'shots/media-r5');
export const FINAL = join(SHOTS, 'final');
export const MOTION = join(SHOTS, 'motion');
export const KIT = join(SHOTS, 'kit');
// A battlefield's survey (lab --features in a render hold) is the media lane's local dump, and survey reads are opt-in
// (267, Main): MEDIA_R5_FEATURES naming a folder (another dump under review, or the media suite's: readSurveys), or a
// media tool run from the command line (its entry under tools/media-r5), reads them, from shots/media-r5/features by
// default. A receipt's run (its entry a *.selftest.mjs, or a process the receipt runner started: run-selftests gives
// every child COT_SELFTEST_RUN_DIR) reads none and hands MEDIA_R5_FEATURES=off to every process it starts (duels.selftest
// runs site50.mjs), so every receipt stages and judges a take alike on every machine by construction.
const entry = (() => { try { return realpathSync(process.argv[1] ?? ''); } catch { return ''; } })();
const RECEIPT_RUN = entry.endsWith('.selftest.mjs') || Boolean(process.env.COT_SELFTEST_RUN_DIR);
if (RECEIPT_RUN && !process.env.MEDIA_R5_FEATURES) process.env.MEDIA_R5_FEATURES = 'off';
const MEDIA_TOOL_RUN = entry.startsWith(TOOL + sep) && !RECEIPT_RUN;
/** The folder battlefield surveys are read from, or null when survey reads are off. */
export const surveyDirectory = () => {
  const dir = process.env.MEDIA_R5_FEATURES;
  return dir === 'off' ? null : dir || (MEDIA_TOOL_RUN ? join(SHOTS, 'features') : null);
};
/** A receipt's opt-in (the media suite's): MEDIA_R5_FEATURES when it names a folder, else the media lane's own dumps. */
export function readSurveys() {
  if (!process.env.MEDIA_R5_FEATURES || process.env.MEDIA_R5_FEATURES === 'off') process.env.MEDIA_R5_FEATURES = join(SHOTS, 'features');
}
/** A battlefield's survey file, or null when survey reads are off. */
export const surveyPath = (map) => { const dir = surveyDirectory(); return dir ? join(dir, `features-${map}.json`) : null; };
// Public address shown on end cards (src/officialHost.ts is the site's own record of it).
export const SITE_URL = 'cot.kevinliu.studio';
