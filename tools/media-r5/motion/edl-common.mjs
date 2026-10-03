// Shared EDL helpers for the r5 motion projects: the 96 BPM grid of the score, footage lookup with numbered
// placeholders for shots not rendered yet, and the project writer.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MOTION } from '../paths.mjs';

export const BPM = 96, BEAT = 60 / BPM, BAR = BEAT * 4;
/** The films' canvas scale over the 1080p design grid: 2 renders them at 2160p (owner 2026-10-03: super high quality);
 * MEDIA_R5_FILM_SCALE=1 brings back 1080p drafts. Type scales with the canvas in build.mjs; pixel safe zones use px(). */
export const FILM_SCALE = Number(process.env.MEDIA_R5_FILM_SCALE ?? 2);
export const canvas = (w, h) => ({ width: w * FILM_SCALE, height: h * FILM_SCALE });
export const px = v => Math.round(v * FILM_SCALE);
/** Seconds at a bar + beat position on the score grid. */
export const b = (bar, beat = 0) => +(bar * BAR + beat * BEAT).toFixed(4);
export const beats = n => +(n * BEAT).toFixed(4);

/** Resolves a shot id to its footage in <project>/assets/shots, or the next placeholder clip. */
export function footage(project) {
  let ph = 0;
  return id => existsSync(join(MOTION, project, 'assets/shots', `${id}.mp4`)) ? `assets/shots/${id}.mp4` : `assets/shots/ph0${(ph++ % 6) + 1}.mp4`;
}

export function writeEdl(project, edl) {
  mkdirSync(join(MOTION, project), { recursive: true });
  writeFileSync(join(MOTION, project, 'edl.json'), JSON.stringify(edl, null, 1));
  const missing = edl.shots.filter(s => s.src.includes('/ph0')).length;
  console.log(`${project}: ${edl.shots.length} cuts, ${missing} placeholders, ${edl.duration}s`);
}
