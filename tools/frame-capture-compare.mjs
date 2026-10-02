#!/usr/bin/env node
// Cross-build capture comparison for the frame-budget probe (2026-10-02, the frame-budget lane). With --shots the
// probe reads every pose back once more as 8-bit luminance (`captureLuminance`, in the page: the wind clock set, one
// lighting update and one post transaction, the canvas read in the same task) and writes `<tag>-<slot>-<viewport>-
// <view>.lum`. Two page loads of one build differ wherever the scene animates or accumulates (the cloud history, the
// water, effects), so a build-to-build difference counts only on STABLE pixels: those both builds reproduce across
// their own two loads (A B B A gives two of each). A stable pixel that differs between the builds is the change.
//
//   node tools/frame-capture-compare.mjs --dir=<probe out> [--labels=base,new] [--threshold=1] [--png]
//
// Writes <dir>/capture-compare.json and, with --png, one diff image per pose (grey: the first build; red: darker in
// the second build, green: brighter, on stable pixels; blue: pixels unstable within a build, excluded).
import path from 'node:path';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { isMainModule } from './map-probe-runtime.mjs';

/** Page side (serialized): the current state rendered once and read back as luminance, base64. */
export function captureLuminance() {
  const D = window.__DEBUG;
  D.world?.setWindTime?.(12.5);
  D.lighting.update(false, 1 / 60);
  D.post.render(0, 0);
  const src = D.renderer.domElement;
  const cv = document.createElement('canvas');
  cv.width = src.width; cv.height = src.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const out = new Uint8Array(cv.width * cv.height);
  for (let p = 0, q = 0; p < out.length; p++, q += 4) out[p] = Math.round(0.299 * d[q] + 0.587 * d[q + 1] + 0.114 * d[q + 2]);
  let s = '';
  for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
  return { width: cv.width, height: cv.height, b64: btoa(s) };
}

/** A .lum file: a 16-byte header (magic, width, height) and the luminance bytes. */
export function encodeLum({ width, height, b64 }) {
  const body = Buffer.from(b64, 'base64');
  const head = Buffer.alloc(16);
  head.write('LUM1', 0, 'ascii'); head.writeUInt32LE(width, 4); head.writeUInt32LE(height, 8);
  return Buffer.concat([head, body]);
}

export function decodeLum(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'LUM1') throw new Error('not a LUM1 capture');
  const width = buffer.readUInt32LE(4), height = buffer.readUInt32LE(8);
  return { width, height, data: new Uint8Array(buffer.buffer, buffer.byteOffset + 16, width * height) };
}

/**
 * Compare two loads of build A and two of build B (one pose). A pixel is stable when each build reproduces it within
 * `threshold` across its own loads; `changed` counts stable pixels where the builds differ by more than `threshold`
 * (in both pairings, A1/B1 and A2/B2).
 */
export function compareCaptureSet(a1, a2, b1, b2, threshold = 1) {
  const n = a1.length;
  if (![a2, b1, b2].every((x) => x.length === n)) throw new Error('captures differ in size');
  let floorA = 0, floorB = 0, raw = 0, stable = 0, changed = 0, darker = 0, maxChanged = 0;
  const classes = new Uint8Array(n); // 0 same, 1 unstable, 2 darker in B, 3 brighter in B
  for (let p = 0; p < n; p++) {
    const fa = Math.abs(a1[p] - a2[p]), fb = Math.abs(b1[p] - b2[p]);
    if (fa > threshold) floorA++;
    if (fb > threshold) floorB++;
    const d1 = b1[p] - a1[p], d2 = b2[p] - a2[p];
    if (Math.abs(d1) > threshold) raw++;
    if (fa > threshold || fb > threshold) { classes[p] = 1; continue; }
    stable++;
    if (Math.abs(d1) > threshold && Math.abs(d2) > threshold && Math.sign(d1) === Math.sign(d2)) {
      changed++;
      if (d1 < 0) { darker++; classes[p] = 2; } else classes[p] = 3;
      maxChanged = Math.max(maxChanged, Math.min(Math.abs(d1), Math.abs(d2)));
    }
  }
  return { pixels: n, floorA, floorB, raw, stable, changed, darker, brighter: changed - darker, maxChanged, classes };
}

// --- PNG (RGB8, no filter) -----------------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function encodeRgbPng(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

/** The diff image of one pose: grey base (build A), red / green the stable changes, blue the excluded pixels. */
function diffImage(width, height, base, classes) {
  const rgb = new Uint8Array(width * height * 3);
  for (let p = 0, q = 0; p < classes.length; p++, q += 3) {
    const g = base[p] * 0.45;
    const c = classes[p];
    rgb[q] = c === 2 ? 255 : g; rgb[q + 1] = c === 3 ? 255 : g; rgb[q + 2] = c === 1 ? Math.min(255, g + 70) : g;
  }
  return encodeRgbPng(width, height, rgb);
}

function run({ dir, labels, threshold, png }) {
  const files = readdirSync(dir).filter((n) => n.endsWith('.lum'));
  // <tag>-<map>-s<i>-<label>-<viewport>-<view>.lum
  const poses = new Map();
  for (const name of files) {
    const m = /^.+?-(.+)-s(\d+)-([^-]+)-(\d+x\d+)-(.+)\.lum$/.exec(name);
    if (!m) continue;
    const [, mapId, order, label, viewport, view] = m;
    const key = `${mapId} ${viewport} ${view}`;
    if (!poses.has(key)) poses.set(key, []);
    poses.get(key).push({ order: Number(order), label, file: path.join(dir, name) });
  }
  const [la, lb] = labels;
  const results = [];
  for (const [key, list] of [...poses].sort()) {
    list.sort((x, y) => x.order - y.order);
    const of = (l) => list.filter((x) => x.label === l);
    const A = of(la), B = of(lb);
    if (A.length < 2 || B.length < 2) { results.push({ pose: key, skipped: `need two loads of each build (have ${A.length} ${la}, ${B.length} ${lb})` }); continue; }
    const [a1, a2] = A.slice(0, 2).map((x) => decodeLum(readFileSync(x.file)));
    const [b1, b2] = B.slice(0, 2).map((x) => decodeLum(readFileSync(x.file)));
    const r = compareCaptureSet(a1.data, a2.data, b1.data, b2.data, threshold);
    const { classes, ...counts } = r;
    const row = { pose: key, ...counts, stableShare: +(r.stable / r.pixels).toFixed(4) };
    if (png) {
      const out = path.join(dir, `capture-diff-${key.replace(/[^a-z0-9]+/gi, '-')}.png`);
      writeFileSync(out, diffImage(a1.width, a1.height, a1.data, classes));
      row.png = path.basename(out);
    }
    results.push(row);
  }
  writeFileSync(path.join(dir, 'capture-compare.json'), JSON.stringify({ labels, threshold, results }, null, 1));
  for (const r of results) {
    console.log(r.skipped ? `${r.pose}: ${r.skipped}` : `${r.pose}: floor ${la} ${r.floorA} / ${lb} ${r.floorB} px; raw ${r.raw}; stable ${(r.stableShare * 100).toFixed(1)} %; changed on stable ${r.changed} px (max Δ ${r.maxChanged})`);
  }
  return results;
}

if (isMainModule(import.meta.url)) {
  const o = { dir: null, labels: ['base', 'new'], threshold: 1, png: false };
  for (const arg of process.argv.slice(2)) {
    const m = /^--([a-z]+)(?:=(.*))?$/.exec(arg);
    if (!m) { console.error(`Unknown argument ${arg}`); process.exit(1); }
    if (m[1] === 'dir') o.dir = path.resolve(m[2]);
    else if (m[1] === 'labels') o.labels = m[2].split(',');
    else if (m[1] === 'threshold') o.threshold = Number(m[2]);
    else if (m[1] === 'png') o.png = true;
    else { console.error(`Unknown argument --${m[1]}`); process.exit(1); }
  }
  if (!o.dir) { console.error('--dir=<probe out> is required'); process.exit(1); }
  run(o);
}
