#!/usr/bin/env node
// "The Lineup" EDL (96 BPM): the title over the first reveal, twenty-four two-beat tank reveals across the
// source-backed fleet (each titled by the tank's name alone), the end card.
//   node tools/media-r5/motion/lineup-gen.mjs   (writes shots/media-r5/motion/lineup/edl.json; footage <id>.mp4)
import { SITE_URL } from '../paths.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CAST, CAST_NAMES } from '../cast.mjs';
import { SHOTS as SHOT_ROOT } from '../paths.mjs';
import { b, beats, canvas, footage, writeEdl } from './edl-common.mjs';

const project = 'lineup', src = footage(project), shots = [], titles = [];
// Round 2 (owner 2026-10-02: "upgrade the videos"): each tank's beat is its own site-fifty fight, entered half a second
// before the take's best moment (its still), so the two beats land on the round leaving the barrel or the hit.
const STILL_MS = Object.fromEntries(JSON.parse(readFileSync(join(SHOT_ROOT, 'site50/site50-manifest.json'), 'utf8')).map(m => [m.id, m.still.tMs]));
const REVEALS = [['s06-farm-charge', CAST.kf51], ['s01-main-street-push', CAST.leo2a6], ['s02-factory-road', CAST.tusk], ['s03-square-pass', CAST.leclerc],
  ['s04-column-under-fire', CAST.t90m], ['s05-barn-advance', CAST.t14], ['s07-lake-shellfire', CAST.strv122], ['s08-market-push', CAST.m1a2],
  ['s09-harbor-run', CAST.leo], ['s10-ford-shellfire', CAST.ztz100], ['s11-container-rows', CAST.challenger1], ['s12-gantry-advance', CAST.t90ms],
  ['s13-farm-race', CAST.k2], ['s14-snow-push', CAST.t80u], ['s15-orchard-column', CAST.arieteC1], ['s26-minaret-fire', CAST.merkava3d],
  ['s27-caravanserai-kill', CAST.merkava], ['s30-temple-village', CAST.k1a1], ['s35-farm-village', CAST.type90], ['s36-barn-knockout', CAST.type10],
  ['s39-lakeside-village', CAST.chieftain10], ['s32-yard-salvo', CAST.sepv3], ['s21-fields-assault', CAST.t90sm], ['s25-alpine-village', CAST.leo2a5]];
const inOf = id => Math.max(0, +((STILL_MS[id] ?? 1000) / 1000 - 0.5).toFixed(2));
shots.push({ id: REVEALS[0][0], src: src(REVEALS[0][0]), start: 0, dur: b(2), in: 0 });
titles.push({ kind: 'line', text: 'The lineup', start: b(0, 1), dur: b(1, 2.5), align: 'center' });
REVEALS.forEach(([id, tank], i) => {
  const at = b(2 + Math.floor(i / 2), (i % 2) * 2);
  shots.push({ id, src: src(id), start: at, dur: beats(2), in: inOf(id) });
  titles.push({ kind: 'tank', name: CAST_NAMES[tank][0], start: at, dur: beats(2) });
});
const end = b(2 + REVEALS.length / 2);
writeEdl(project, { fps: 30, ...canvas(1920, 1080), duration: +(end + 4.5).toFixed(3), letterbox: 2.39, letterboxIn: 0.15, audio: 'assets/audio/mix.wav', grain: 0.06, shots, titles,
  flashes: [{ t: b(2), frames: 3 }, ...REVEALS.map((_, i) => ({ t: b(2 + Math.floor(i / 2), (i % 2) * 2), frames: 1, peak: 0.35 })).slice(1), { t: end, frames: 3 }],
  endcard: { start: end, url: SITE_URL } });
