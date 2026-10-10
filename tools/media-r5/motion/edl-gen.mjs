#!/usr/bin/env node
// "Around the Clock" trailer EDL on the score's grid (96 BPM, bar = 2.5 s): midnight to midnight across the
// battlefields, then Mars and the Moon. Large type only: section words, two counts, three lines, the lockup.
//   node tools/media-r5/motion/edl-gen.mjs   (writes shots/media-r5/motion/trailer-24h/edl.json)
import { SITE_URL } from '../paths.mjs';
import { b, beats, canvas, footage, writeEdl } from './edl-common.mjs';

const project = 'trailer-24h', src = footage(project), shots = [];
const cut = (id, bar, beat, n, inSec = 0) => shots.push({ id, src: src(id), start: b(bar, beat), dur: beats(n), in: inSec });
// Round 2 (owner 2026-10-02: "upgrade the videos"): cut from the site fifty — fights in full swing on the best
// battlefields, the camouflage-contrast lighting — on the same 96 BPM bars and sections.
// COLD OPEN — Steinburg at night (bars 0–2): the duel, the knockout, the street from the church tower; the title over the aftermath
cut('s16-street-duel', 0, 0, 5);
cut('s18-street-knockout', 1, 1, 3);
cut('s41-church-tower', 2, 0, 4);
cut('s18-street-knockout', 3, 0, 4, 1.2);
// MORNING (bars 4–7): the ford under shellfire, the temple village, the farm village, the river village
cut('s10-ford-shellfire', 4, 0, 4);
cut('s30-temple-village', 5, 0, 4);
cut('s35-farm-village', 6, 0, 4);
cut('s37-river-village', 7, 0, 4);
// DAY (bars 8–11): the main street push, the column under fire, the factory road, the harbor run
cut('s01-main-street-push', 8, 0, 4);
cut('s04-column-under-fire', 9, 0, 4);
cut('s02-factory-road', 10, 0, 4);
cut('s09-harbor-run', 11, 0, 4);
// NOON — eight fast cuts (bars 12–15)
['s17-crossroads-fire', 's21-fields-assault', 's26-minaret-fire', 's25-alpine-village', 's28-fjord-village', 's11-container-rows', 's23-village-crossroads', 's19-roof-tiles']
  .forEach((id, i) => cut(id, 12 + Math.floor(i / 2), (i % 2) * 2, 2, (i % 2) * 0.1));
// GOLDEN (bars 16–18) + the knockout (bar 19)
cut('s32-yard-salvo', 16, 0, 4);
cut('s06-farm-charge', 17, 0, 4);
cut('s07-lake-shellfire', 18, 0, 2);
cut('s24-ice-duel', 18, 2, 2);
cut('s27-caravanserai-kill', 19, 0, 4, 0.6);
// SUNSET + the Studio (bars 20–23)
cut('s20-road-return-fire', 20, 0, 4);
cut('t24-studio-ui', 21, 0, 6);
cut('s44-oasis-sunset', 22, 2, 2.5);
cut('s45-harbor-wide', 23, 0.5, 3.5);
// NIGHT climax — eight cuts (bars 24–27)
['s34-furnace-salvo', 's33-water-tower', 's38-church-knockout', 's22-walking-barrage', 's47-ironworks-crane', 's16-street-duel', 's41-church-tower', 's18-street-knockout']
  .forEach((id, i) => cut(id, 24 + Math.floor(i / 2), (i % 2) * 2, 2, (i % 3) * 0.2 + (i >= 5 ? 1.5 : 0)));
// BEYOND (bar 28): Mars, then the Moon
cut('t37-mars-drone', 28, 0, 2);
cut('t21-earthrise-chase', 28, 2, 2);

writeEdl(project, { fps: 30, ...canvas(1920, 1080), duration: 80, letterbox: 2.39, letterboxIn: 0.25, audio: 'assets/audio/mix.wav', grain: 0.07, shots,
  titles: [
    { kind: 'logo', start: b(3), dur: 2.45 },
    { kind: 'section', text: 'MORNING', start: b(4, 0.5), dur: b(0, 4) },
    { kind: 'stat', num: 33, label: 'Battlefields', start: b(9, 0), dur: b(0, 4) - 0.1 },
    { kind: 'stat', num: 219, label: 'Tanks', start: b(12, 2), dur: b(0, 4) },
    { kind: 'line', text: 'Physical ballistics. Real armor.', start: b(16, 0.5), dur: b(0, 4) },
    { kind: 'section', text: 'SUNSET', start: b(20, 0.5), dur: b(0, 3.5) },
    { kind: 'line', text: 'Direct your own war film', start: b(21, 0.5), dur: b(0, 5) },
    { kind: 'section', text: 'NIGHT', start: b(24, 0.5), dur: b(0, 3.5) },
    { kind: 'line', text: 'Mars. The Moon.', start: b(28, 0.5), dur: b(0, 3.5) },
  ],
  flashes: [{ t: b(3), frames: 3 }, { t: b(4), frames: 2, peak: 0.6 }, { t: b(12), frames: 2 }, { t: b(16), frames: 2, color: '#ffd27a', peak: 0.5 },
    { t: b(19), frames: 4 }, { t: b(24), frames: 2 }, { t: b(29), frames: 3 }],
  endcard: { start: b(29), url: SITE_URL } });
