#!/usr/bin/env node
// The blind A/B's stimuli for one draw per far hull (far-hull-273), by the registration written before the frames
// (far-hull-273-evidence/ab-registration.md): from tools/far-hull-truth.mjs's frames (after = A, the one far hull draw;
// before = B, the far LOD's draws as they were), per map and view the four largest far vehicles at least 14 px tall, a
// square crop centred on each (side max(64, 2 x the box's larger side)), scaled 4x, before and after side by side as
// "1" and "2", which side is after drawn by a seeded RNG; 6 control pairs (before against before). The key and the
// critics' orders go beside the stimuli's folder (<out>-key.json, <out>-orders.json); the critics see only trial-NN.png.
//
//   node tools/far-hull-ab.mjs --truth=<dir with <label>-desktop.json and the frames> --label=<label> --out=<dir> [--seed=273]
//   node tools/far-hull-ab.mjs --tally --out=<dir> --answers=<a.json,b.json,c.json>
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { encodeRgbPng } from './frame-capture-compare.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const out = path.resolve(arg('out', '.qa-dev/far-hull-ab'));
const seed = Number(arg('seed', 273));
mkdirSync(out, { recursive: true });
/** The key and the orders live beside the stimuli's folder, never in it (the critics open that folder). */
const keyFile = path.join(path.dirname(out), `${path.basename(out)}-key.json`);
const ordersFile = path.join(path.dirname(out), `${path.basename(out)}-orders.json`);

/** mulberry32 */
function rng(s) { return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Binomial lower tail P(X <= k | n, 1/2). */
function lowerTail(k, n) { let p = 0, c = 1; for (let i = 0; i <= n; i++) { if (i > 0) c = c * (n - i + 1) / i; if (i <= k) p += c; } return p / 2 ** n; }

function crop(rgb, width, height, cx, cy, side) {
  const s = side * 4;
  const out = new Uint8Array(s * s * 3);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const sx = Math.min(width - 1, Math.max(0, Math.floor(cx - side / 2 + x / 4))), sy = Math.min(height - 1, Math.max(0, Math.floor(cy - side / 2 + y / 4)));
    const o = (y * s + x) * 3, i = (sy * width + sx) * 3;
    out[o] = rgb[i]; out[o + 1] = rgb[i + 1]; out[o + 2] = rgb[i + 2];
  }
  return { data: out, size: s };
}

/** Two crops side by side with a grey gap and a digit-free layout (the critics are told left is 1, right is 2). */
function pair(left, right) {
  const s = left.size, gap = 16, w = s * 2 + gap;
  const out = new Uint8Array(w * s * 3).fill(128);
  for (let y = 0; y < s; y++) {
    out.set(left.data.subarray(y * s * 3, (y + 1) * s * 3), y * w * 3);
    out.set(right.data.subarray(y * s * 3, (y + 1) * s * 3), (y * w + s + gap) * 3);
  }
  return { data: out, width: w, height: s };
}

if (process.argv.includes('--tally')) {
  const key = JSON.parse(readFileSync(keyFile, 'utf8'));
  const files = arg('answers', '').split(',').filter(Boolean);
  const rows = [];
  let wins = 0, n = 0;
  for (const file of files) {
    const answers = JSON.parse(readFileSync(file, 'utf8'));
    let w = 0, t = 0, controlOne = 0, controls = 0;
    for (const trial of key.trials) {
      const a = Number(answers[trial.id]);
      if (a !== 1 && a !== 2) throw new Error(`${file}: no answer for ${trial.id}`);
      if (trial.control) { controls++; if (a === 1) controlOne++; continue; }
      t++; if (a === trial.after) w++;
    }
    rows.push({ critic: path.basename(file), afterWins: w, trials: t, p: +lowerTail(w, t).toFixed(4), controlSideOne: `${controlOne}/${controls}` });
    wins += w; n += t;
  }
  const p = lowerTail(wins, n);
  const tally = { pooled: { afterWins: wins, trials: n, p: +p.toFixed(4), pass: p >= 0.10 }, critics: rows };
  writeFileSync(path.join(path.dirname(out), `${path.basename(out)}-tally.json`), JSON.stringify(tally, null, 1));
  console.log(JSON.stringify(tally, null, 1));
  process.exit(0);
}

const truth = path.resolve(arg('truth', '.'));
const label = arg('label', 'new');
const report = JSON.parse(readFileSync(path.join(truth, `${label}-desktop.json`), 'utf8'));
const random = rng(seed);
const trials = [];
const sources = [];
for (const [mapId, entry] of Object.entries(report.maps)) {
  for (const [view, v] of Object.entries(entry.views)) {
    if (!v.boxes) continue;
    const big = v.boxes.map((b) => ({ ...b, h: b.box[3] - b.box[1], w: b.box[2] - b.box[0] })).filter((b) => b.h >= 14)
      .sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || a.name.localeCompare(b.name)).slice(0, 4);
    for (const b of big) sources.push({ mapId, view, width: v.width, height: v.height, ...b });
  }
}
const frames = new Map();
const frame = (mapId, view, which) => {
  const k = `${mapId}-${view}-${which}`;
  if (!frames.has(k)) frames.set(k, readFileSync(path.join(truth, `${label}-desktop-${mapId}-${view}-${which}.rgb`)));
  return frames.get(k);
};
for (const s of sources) {
  const side = Math.max(64, 2 * Math.max(s.w, s.h));
  const cx = (s.box[0] + s.box[2]) / 2, cy = (s.box[1] + s.box[3]) / 2;
  const after = crop(frame(s.mapId, s.view, 'A'), s.width, s.height, cx, cy, side);
  const before = crop(frame(s.mapId, s.view, 'B'), s.width, s.height, cx, cy, side);
  const afterSide = random() < 0.5 ? 1 : 2;
  trials.push({ source: `${s.mapId}/${s.view}/${s.name}`, after: afterSide, image: afterSide === 1 ? pair(after, before) : pair(before, after) });
}
// the control pairs: before against before, at seeded positions
const controlSources = sources.length ? Array.from({ length: 6 }, (_, i) => sources[Math.floor(random() * sources.length)] ?? sources[i % sources.length]) : [];
for (const s of controlSources) {
  const side = Math.max(64, 2 * Math.max(s.w, s.h));
  const cx = (s.box[0] + s.box[2]) / 2, cy = (s.box[1] + s.box[3]) / 2;
  const before = crop(frame(s.mapId, s.view, 'B'), s.width, s.height, cx, cy, side);
  trials.splice(Math.floor(random() * (trials.length + 1)), 0, { source: `${s.mapId}/${s.view}/${s.name}`, control: true, after: 0, image: pair(before, before) });
}
const key = { seed, label, truth, trials: [] };
trials.forEach((t, i) => {
  const id = `trial-${String(i + 1).padStart(2, '0')}`;
  writeFileSync(path.join(out, `${id}.png`), encodeRgbPng(t.image.width, t.image.height, t.image.data));
  key.trials.push({ id, source: t.source, after: t.after, control: !!t.control });
});
writeFileSync(keyFile, JSON.stringify(key, null, 1));
// each critic's order (seed + critic index), so no two critics meet the trials in one order
const orders = [1, 2, 3].map((c) => { const r = rng(seed + c); const ids = key.trials.map((t) => t.id); for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; } return ids; });
writeFileSync(ordersFile, JSON.stringify(orders, null, 1));
console.log(`${trials.length} trials (${trials.filter((t) => t.control).length} controls) in ${out}`);
