#!/usr/bin/env node
// "Around the Clock" trailer EDL on the score's grid (96 BPM, bar = 2.5 s): midnight to midnight across the
// battlefields, then Mars and the Moon. Large type only: section words, two counts, three lines, the lockup.
//   node tools/media-r5/motion/edl-gen.mjs   (writes shots/media-r5/motion/trailer-24h/edl.json)
import { SITE_URL } from '../paths.mjs';
import { b, beats, footage, writeEdl } from './edl-common.mjs';

const project = 'trailer-24h', src = footage(project), shots = [];
const cut = (id, bar, beat, n, inSec = 0) => shots.push({ id, src: src(id), start: b(bar, beat), dur: beats(n), in: inSec });
// COLD OPEN — Steinburg, night (bars 0–2): pass-by, fire, the kill; the title (bar 3) over the aftermath
cut('t01-street-passby', 0, 0, 5);
cut('t02-street-fire', 1, 1, 3);
cut('t03-street-kill', 2, 0, 4);
cut('t03-street-kill', 3, 0, 4, 1.2);
// DAWN — Glacier Pass + Kestrel (bars 4–7): pan, car-to-car, tele pan, lead car
cut('t04-lake-pan', 4, 0, 4);
cut('t05-lake-track', 5, 0, 4);
cut('t34-runway-pan', 6, 0, 4);
cut('t09-runway-lead', 7, 0, 4);
// MORNING (bars 8–11): crane, viaduct pan + deck, the ford
cut('t06-lake-crane', 8, 0, 4);
cut('t07-viaduct-pan', 9, 0, 4);
cut('t41-viaduct-deck', 10, 0, 4);
cut('t08-ford-wake', 11, 0, 4);
// NOON — eight fast cuts (bars 12–15)
['t27-wadi-pan', 't31-plaza-fire', 't29-verdant-fire', 't30-harbor-follow', 't10-wadi-kill', 't32-towers-follow', 't33-mine-noon', 't22-assault-follow']
  .forEach((id, i) => cut(id, 12 + Math.floor(i / 2), (i % 2) * 2, 2, (i % 2) * 0.1));
// GOLDEN (bars 16–18) + the slow-motion kill (bar 19)
cut('t11-canyon-lead', 16, 0, 4);
cut('t36-canyon-orbit', 17, 0, 4);
cut('t12-mine-fire', 18, 0, 2);
cut('t13-ford-fight', 18, 2, 2);
cut('t23-slowmo-kill', 19, 0, 4);
// SUNSET + the Studio (bars 20–23)
cut('t15-strand-follow', 20, 0, 4);
cut('t24-studio-ui', 21, 0, 6);
cut('t14-lighthouse-passby', 22, 2, 2.5);
cut('t16-fjord-passby', 23, 0.5, 3.5);
// NIGHT climax — eight cuts (bars 24–27)
['t20-tracks-follow', 't19-avenue-chase', 't17-yard-salvo', 't40-street-follow', 't18-village-chase', 't25-night-flare', 't26-night-barrage', 't03-street-kill']
  .forEach((id, i) => cut(id, 24 + Math.floor(i / 2), (i % 2) * 2, 2, (i % 3) * 0.2));
// BEYOND (bar 28): Mars, then the Moon
cut('t37-mars-drone', 28, 0, 2);
cut('t21-earthrise-chase', 28, 2, 2);

writeEdl(project, { fps: 30, width: 1920, height: 1080, duration: 80, letterbox: 2.39, letterboxIn: 0.25, audio: 'assets/audio/mix.wav', grain: 0.07, shots,
  titles: [
    { kind: 'logo', start: b(3), dur: 2.45 },
    { kind: 'section', text: 'DAWN', start: b(4, 0.5), dur: b(0, 4) },
    { kind: 'stat', num: 33, label: 'Battlefields', start: b(9, 0), dur: b(0, 4) - 0.1 },
    { kind: 'stat', num: 217, label: 'Tanks', start: b(12, 2), dur: b(0, 4) },
    { kind: 'line', text: 'Physical ballistics. Real armor.', start: b(16, 0.5), dur: b(0, 4) },
    { kind: 'section', text: 'SUNSET', start: b(20, 0.5), dur: b(0, 3.5) },
    { kind: 'line', text: 'Direct your own war film', start: b(21, 0.5), dur: b(0, 5) },
    { kind: 'section', text: 'NIGHT', start: b(24, 0.5), dur: b(0, 3.5) },
    { kind: 'line', text: 'Mars. The Moon.', start: b(28, 0.5), dur: b(0, 3.5) },
  ],
  flashes: [{ t: b(3), frames: 3 }, { t: b(4), frames: 2, peak: 0.6 }, { t: b(12), frames: 2 }, { t: b(16), frames: 2, color: '#ffd27a', peak: 0.5 },
    { t: b(19), frames: 4 }, { t: b(24), frames: 2 }, { t: b(29), frames: 3 }],
  endcard: { start: b(29), url: SITE_URL } });
