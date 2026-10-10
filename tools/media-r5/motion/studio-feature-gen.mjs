#!/usr/bin/env node
// "Scene Studio" feature film EDL (30 s, 96 BPM): the real Studio UI, captured frame by frame, cut against what it
// makes — staging, any hour, film looks, a tracked lens, motion-blurred export. One large line per idea.
//   node tools/media-r5/motion/studio-feature-gen.mjs   (writes shots/media-r5/motion/studio-feature/edl.json)
import { SITE_URL } from '../paths.mjs';
import { b, beats, footage, writeEdl } from './edl-common.mjs';

const project = 'studio-feature', src = footage(project), shots = [], titles = [];
const cut = (id, bar, beat, n, inSec = 0) => shots.push({ id, src: src(id), start: b(bar, beat), dur: beats(n), in: inSec });
const say = (text, bar, beat, n) => titles.push({ kind: 'line', text, start: b(bar, beat), dur: beats(n) });
cut('ui-feature-stage', 0, 0, 8); say('Scene Studio', 0, 0.5, 6.5);
cut('x05-leo2a7v', 2, 0, 4, 0.2); say('Stage any of 219 tanks', 2, 0.25, 3.6);
cut('ui-feature-time', 3, 0, 8); say('Any hour of the day', 3, 0.5, 7);
cut('ui-trailer', 5, 0, 8); say('Grade it like film', 5, 0.5, 7);
cut('t05-lake-track', 7, 0, 4, 0.3); say('Track. Pan. Crane. Orbit.', 7, 0.25, 3.6);
cut('t36-canyon-orbit', 8, 0, 4, 0.2);
cut('b01-pan-runway', 9, 0, 4); say('Real motion blur', 9, 0.25, 3.6);
cut('t34-runway-pan', 10, 0, 4, 0.4);
const end = b(11);
writeEdl(project, { fps: 30, width: 1920, height: 1080, duration: 30, letterbox: 0, audio: 'assets/audio/mix.wav', grain: 0.04, shots, titles,
  flashes: [{ t: b(2), frames: 2, peak: 0.5 }, { t: b(5), frames: 2, peak: 0.5 }, { t: b(9), frames: 3 }, { t: end, frames: 3 }],
  endcard: { start: end, url: SITE_URL } });
