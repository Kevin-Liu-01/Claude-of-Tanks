#!/usr/bin/env node
// Cut-down EDLs on the 96 BPM grid: the 30 s trailer and the 15 s vertical.
//   node tools/media-r5/motion/cuts-gen.mjs c30|v15   (writes shots/media-r5/motion/<project>/edl.json)
import { SITE_URL } from '../paths.mjs';
import { b, beats, footage, writeEdl } from './edl-common.mjs';

const which = process.argv[2];
const project = which === 'v15' ? 'vertical-15' : which === 'c30' ? 'cut-30' : null;
if (!project) throw new Error('usage: cuts-gen.mjs c30|v15');
const src = footage(project), shots = [];
const cut = (id, bar, beat, n, inSec = 0) => shots.push({ id, src: src(id), start: b(bar, beat), dur: beats(n), in: inSec });
if (which === 'c30') {
  cut('t01-street-passby', 0, 0, 2);
  cut('t02-street-fire', 0, 2, 2, 0.15);
  cut('t03-street-kill', 1, 0, 4, 1.0);
  cut('t04-lake-pan', 2, 0, 4, 0.4);
  cut('t05-lake-track', 3, 0, 4, 0.3);
  ['t34-runway-pan', 't27-wadi-pan', 't11-canyon-lead', 't36-canyon-orbit'].forEach((id, i) => cut(id, 4 + Math.floor(i / 2), (i % 2) * 2, 2));
  cut('t13-ford-fight', 6, 0, 4);
  cut('t23-slowmo-kill', 7, 0, 4);
  ['t17-yard-salvo', 't18-village-chase', 't40-street-follow', 't21-earthrise-chase'].forEach((id, i) => cut(id, 8 + Math.floor(i / 2), (i % 2) * 2, 2));
  writeEdl(project, { fps: 30, width: 1920, height: 1080, duration: 30, letterbox: 2.39, letterboxIn: 0.2, audio: 'assets/audio/mix.wav', grain: 0.07, shots,
    titles: [
      { kind: 'logo', start: b(1), dur: 2.4 },
      { kind: 'section', text: 'DAWN', start: b(2, 0.5), dur: b(0, 3.5) },
      { kind: 'stat', num: 217, label: 'Tanks', start: b(4, 0.5), dur: b(0, 3.5) },
      { kind: 'line', text: 'Physical ballistics. Real armor.', start: b(6, 0.5), dur: b(0, 3.5) },
      { kind: 'stat', num: 33, label: 'Battlefields', start: b(8, 0.5), dur: b(0, 3.5) },
    ],
    flashes: [{ t: b(1), frames: 3 }, { t: b(4), frames: 2 }, { t: b(7), frames: 4 }, { t: b(8), frames: 2 }, { t: b(10), frames: 3 }],
    endcard: { start: b(10), url: SITE_URL } });
} else {
  // head-on and behind-the-tank shots survive the 9:16 frame (side profiles don't)
  cut('t09-runway-lead-p', 0, 0, 4);
  ['t11-canyon-lead-p', 't02-street-fire-p', 't18-village-chase-p', 't03-street-kill-p', 't25-night-flare-p', 't21-earthrise-chase-p']
    .forEach((id, i) => cut(id, 1 + Math.floor(i / 2), (i % 2) * 2, 2));
  writeEdl(project, { fps: 30, width: 1080, height: 1920, duration: 15, letterbox: 0, safeTop: 210, safeBottom: 470, typeScale: 1.25, audio: 'assets/audio/mix.wav', grain: 0.06, shots,
    titles: [
      { kind: 'logo', start: 0.15, dur: 2.2 },
      { kind: 'stat', num: 217, label: 'Tanks', start: b(1, 0.25), dur: b(0, 3.5) },
      { kind: 'stat', num: 33, label: 'Battlefields', start: b(2, 0.25), dur: b(0, 3.5) },
      { kind: 'line', text: 'Every hour of the day', start: b(3, 0.25), dur: b(0, 3.5) },
    ],
    flashes: [{ t: b(1), frames: 2 }, { t: b(4), frames: 3 }],
    endcard: { start: b(4), url: SITE_URL } });
}
