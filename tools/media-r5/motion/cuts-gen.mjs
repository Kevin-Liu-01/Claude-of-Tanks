#!/usr/bin/env node
// Cut-down EDLs on the 96 BPM grid: the 30 s trailer and the 15 s vertical.
//   node tools/media-r5/motion/cuts-gen.mjs c30|v15   (writes shots/media-r5/motion/<project>/edl.json)
import { SITE_URL } from '../paths.mjs';
import { b, beats, canvas, footage, px, writeEdl } from './edl-common.mjs';

const which = process.argv[2];
const project = which === 'v15' ? 'vertical-15' : which === 'c30' ? 'cut-30' : null;
if (!project) throw new Error('usage: cuts-gen.mjs c30|v15');
const src = footage(project), shots = [];
const cut = (id, bar, beat, n, inSec = 0) => shots.push({ id, src: src(id), start: b(bar, beat), dur: beats(n), in: inSec });
if (which === 'c30') {
  // round 2: the site fifty (night open, morning, day fights, the knockout, sunset into the night climax)
  cut('s16-street-duel', 0, 0, 2);
  cut('s18-street-knockout', 0, 2, 2, 0.15);
  cut('s41-church-tower', 1, 0, 4, 0.6);
  cut('s10-ford-shellfire', 2, 0, 4, 0.4);
  cut('s01-main-street-push', 3, 0, 4, 0.3);
  ['s04-column-under-fire', 's17-crossroads-fire', 's26-minaret-fire', 's21-fields-assault'].forEach((id, i) => cut(id, 4 + Math.floor(i / 2), (i % 2) * 2, 2));
  cut('s06-farm-charge', 6, 0, 4);
  cut('s27-caravanserai-kill', 7, 0, 4, 0.6);
  ['s45-harbor-wide', 's34-furnace-salvo', 's38-church-knockout', 's47-ironworks-crane'].forEach((id, i) => cut(id, 8 + Math.floor(i / 2), (i % 2) * 2, 2));
  writeEdl(project, { fps: 30, ...canvas(1920, 1080), duration: 30, letterbox: 2.39, letterboxIn: 0.2, audio: 'assets/audio/mix.wav', grain: 0.07, shots,
    titles: [
      { kind: 'logo', start: b(1), dur: 2.4 },
      { kind: 'section', text: 'MORNING', start: b(2, 0.5), dur: b(0, 3.5) },
      { kind: 'stat', num: 219, label: 'Tanks', start: b(4, 0.5), dur: b(0, 3.5) },
      { kind: 'line', text: 'Physical ballistics. Real armor.', start: b(6, 0.5), dur: b(0, 3.5) },
      { kind: 'stat', num: 33, label: 'Battlefields', start: b(8, 0.5), dur: b(0, 3.5) },
    ],
    flashes: [{ t: b(1), frames: 3 }, { t: b(4), frames: 2 }, { t: b(7), frames: 4 }, { t: b(8), frames: 2 }, { t: b(10), frames: 3 }],
    endcard: { start: b(10), url: SITE_URL } });
} else {
  // head-on and front-quarter shots survive the 9:16 frame (side profiles and reverses don't); round 5 takes from the
  // site fifty (s27's knockout reverse frames its target off-centre, so the oasis take is s08's low lead)
  cut('s06-farm-charge-p', 0, 0, 4);
  ['s01-main-street-push-p', 's16-street-duel-p', 's11-container-rows-p', 's08-market-push-p', 's14-snow-push-p', 's33-water-tower-p']
    .forEach((id, i) => cut(id, 1 + Math.floor(i / 2), (i % 2) * 2, 2));
  writeEdl(project, { fps: 30, ...canvas(1080, 1920), duration: 15, letterbox: 0, safeTop: px(210), safeBottom: px(470), typeScale: 1.25, audio: 'assets/audio/mix.wav', grain: 0.06, shots,
    titles: [
      { kind: 'logo', start: 0.15, dur: 2.2 },
      { kind: 'stat', num: 219, label: 'Tanks', start: b(1, 0.25), dur: b(0, 3.5) },
      { kind: 'stat', num: 33, label: 'Battlefields', start: b(2, 0.25), dur: b(0, 3.5) },
      { kind: 'line', text: 'Every hour of the day', start: b(3, 0.25), dur: b(0, 3.5) },
    ],
    flashes: [{ t: b(1), frames: 2 }, { t: b(4), frames: 3 }],
    endcard: { start: b(4), url: SITE_URL } });
}
