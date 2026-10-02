#!/usr/bin/env node
// "The Lineup" EDL (96 BPM): the title over the first reveal, twelve two-beat tank reveals (each titled by the
// tank's name alone), the end card.
//   node tools/media-r5/motion/lineup-gen.mjs   (writes shots/media-r5/motion/lineup/edl.json; footage <id>.mp4)
import { SITE_URL } from '../paths.mjs';
import { REVEALS } from '../reveal.mjs';
import { CAST_NAMES } from '../cast.mjs';
import { b, beats, footage, writeEdl } from './edl-common.mjs';

const project = 'lineup', src = footage(project), shots = [], titles = [];
shots.push({ id: REVEALS[0][0], src: src(REVEALS[0][0]), start: 0, dur: b(2), in: 0 });
titles.push({ kind: 'line', text: 'The lineup', start: b(0, 1), dur: b(1, 2.5), align: 'center' });
REVEALS.forEach(([id, tank], i) => {
  const at = b(2 + Math.floor(i / 2), (i % 2) * 2);
  shots.push({ id, src: src(id), start: at, dur: beats(2), in: 0.35 });
  titles.push({ kind: 'tank', name: CAST_NAMES[tank][0], start: at, dur: beats(2) });
});
const end = b(2 + REVEALS.length / 2);
writeEdl(project, { fps: 30, width: 1920, height: 1080, duration: +(end + 4.5).toFixed(3), letterbox: 2.39, letterboxIn: 0.15, audio: 'assets/audio/mix.wav', grain: 0.06, shots, titles,
  flashes: [{ t: b(2), frames: 3 }, ...REVEALS.map((_, i) => ({ t: b(2 + Math.floor(i / 2), (i % 2) * 2), frames: 1, peak: 0.35 })).slice(1), { t: end, frames: 3 }],
  endcard: { start: end, url: SITE_URL } });
