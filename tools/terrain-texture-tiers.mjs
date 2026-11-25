#!/usr/bin/env node
// tools/terrain-texture-tiers.mjs — the battle's photo sets per texture tier, generated from the committed sources
// (texture-diet-277: the terrain; building-tex-diet-277: the village buildings. Kevin 2026-11-25: phones fetched the
// desktop's 1K JPGs, and "the shrink battle textures is smart").
//
// Two groups, each with its own sources, output directory and ledger:
//   terrain    the ambientCG / Poly Haven 1K JPG sets in public/textures/terrain/ the splat plan routes
//   buildings  the ambientCG 1K JPG sets in public/textures/buildings/ (plaster, roof, wood, brick), Plaster 007 from its
//              first-party Color-even and NormalGL-smooth derivatives (docs/ATTRIBUTION.md)
// The sources are CC0 (docs/ATTRIBUTION.md), kept as they were downloaded (or derived) and dropped from dist/
// (tools/tool-only-public-files.mjs): no page fetches them. Every tier holds three files a set, the ones the composer reads
// (src/world/sourcedTextures.ts):
//   <tier>/<Base>_Color.webp     the albedo, lossy (-q 92 -sharp_yuv): the JPGs were near-lossless (15 bits a pixel)
//   <tier>/<Base>_NormalGL.webp  the OpenGL normal, near-lossless 40: lossy WebP's 4:2:0 chroma smeared grass normals 10°
//   <tier>/<Base>_ORM.webp       occlusion (R) and roughness (G) packed, B = 0 (neither terrain nor buildings have metal),
//                                near-lossless 40
// Tiers: `1k` at the sources' 1024 px, `512` a 2x2 box filter of them (the colour averaged in linear light, the normals
// as unit vectors renormalised, the ORM as data). The quality preset picks the tier (engine/quality.ts terrainTextureTier).
//
//   node tools/terrain-texture-tiers.mjs [--group=terrain|buildings]          regenerate the tiers and ledger (default both)
//   node tools/terrain-texture-tiers.mjs --check                               every group's sources and outputs match its
//                                                                              ledger's digests (no encoder needed)
//
// A ledger (src/world/terrainTextureTiers.ledger.json, src/world/buildingTextureTiers.ledger.json) records each source's and
// output's SHA-256 and bytes, the encode settings, the libwebp version, and the measured error of every output against its
// reference at that size (mean normal angle, per-channel PSNR), so a later run with another libwebp is visible as a byte
// change, not a silent one.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeRgba, encodeWebp, webpVersion } from './webp-codec.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TERRAIN_DIR = 'public/textures/terrain';
const BUILDINGS_DIR = 'public/textures/buildings';

/** Every terrain photo set the splat plan routes (sourcedTextures.ts SETS), by its source naming. */
export const TERRAIN_SOURCES = Object.freeze([
  ['Grass004', 'acg'], ['withered_grass', 'ph'], ['Ground071', 'acg'], ['Ground093C', 'acg'],
  ['Snow010A', 'acg'], ['Rock058', 'acg'], ['PavingStones046', 'acg'],
].map(([base, naming]) => Object.freeze({ base, naming, dir: TERRAIN_DIR })));

/**
 * (building-tex-diet-277) every village building set (sourcedTextures.ts SETS plaster, roof, wood, brick). Plaster 007's
 * colour and normal sources are its first-party derivatives (the facades lane, 2026-10-06/07), the maps the battle drew.
 */
export const BUILDING_SOURCES = Object.freeze([
  { base: 'Plaster007', naming: 'acg', dir: BUILDINGS_DIR,
    override: { color: `${BUILDINGS_DIR}/Plaster007_1K-JPG_Color-even.jpg`, normal: `${BUILDINGS_DIR}/Plaster007_1K-JPG_NormalGL-smooth.jpg` } },
  { base: 'RoofingTiles012A', naming: 'acg', dir: BUILDINGS_DIR },
  { base: 'Planks023A', naming: 'acg', dir: BUILDINGS_DIR },
  { base: 'Bricks097', naming: 'acg', dir: BUILDINGS_DIR },
].map((set) => Object.freeze(set)));

/** The generator's groups: each writes its sets' tiers beside their sources and pins them in its own ledger. */
export const GROUPS = Object.freeze({
  terrain: Object.freeze({ dir: TERRAIN_DIR, ledger: 'src/world/terrainTextureTiers.ledger.json', sets: TERRAIN_SOURCES }),
  buildings: Object.freeze({ dir: BUILDINGS_DIR, ledger: 'src/world/buildingTextureTiers.ledger.json', sets: BUILDING_SOURCES }),
});

export const TIERS = Object.freeze({ '1k': 1024, 512: 512 });

const ENCODE = Object.freeze({
  Color: ['-q', '92', '-sharp_yuv', '-m', '6'],
  NormalGL: ['-lossless', '-near_lossless', '40', '-z', '9'],
  ORM: ['-lossless', '-near_lossless', '40', '-z', '9'],
});

/** A set's four source files (repo-relative). */
export function sourceFiles({ base, naming, dir = TERRAIN_DIR, override = {} }) {
  const files = naming === 'acg'
    ? { color: `${dir}/${base}_1K-JPG_Color.jpg`, normal: `${dir}/${base}_1K-JPG_NormalGL.jpg`,
      rough: `${dir}/${base}_1K-JPG_Roughness.jpg`, ao: `${dir}/${base}_1K-JPG_AmbientOcclusion.jpg` }
    : { color: `${dir}/${base}_diff_1k.jpg`, normal: `${dir}/${base}_nor_gl_1k.jpg`,
      rough: `${dir}/${base}_rough_1k.jpg`, ao: `${dir}/${base}_ao_1k.jpg` };
  return { ...files, ...override };
}

/** A set's output file for a tier and role (repo-relative); `dir` is its group's directory (default the terrain's). */
export const outputFile = (tier, base, role, dir = TERRAIN_DIR) => `${dir}/${tier}/${base}_${role}.webp`;

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const abs = (rel) => path.join(ROOT, rel);

// --- pixel kernels (pure) ---------------------------------------------------------------------------------------------
const toLinear = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const LIN = Float64Array.from({ length: 256 }, (_, i) => toLinear(i));
const toSrgb8 = (v) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));

/**
 * 2x2 box filter of a `size` x `height` image (height defaults to size; Bricks 097 is 1024 x 512). mode: 'srgb' (RGB
 * averaged in linear light), 'normal' (unit vectors, renormalised), 'data'.
 */
export function halve(rgba, size, mode, height = size) {
  const w = size >> 1, h = height >> 1, out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = [((2 * y) * size + 2 * x) * 4, ((2 * y) * size + 2 * x + 1) * 4,
      ((2 * y + 1) * size + 2 * x) * 4, ((2 * y + 1) * size + 2 * x + 1) * 4];
    const o = (y * w + x) * 4;
    if (mode === 'normal') {
      let nx = 0, ny = 0, nz = 0;
      for (const i of s) {
        const vx = rgba[i] / 127.5 - 1, vy = rgba[i + 1] / 127.5 - 1, vz = rgba[i + 2] / 127.5 - 1;
        const l = Math.hypot(vx, vy, vz) || 1;
        nx += vx / l; ny += vy / l; nz += vz / l;
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      out[o] = Math.round((nx / l + 1) * 127.5); out[o + 1] = Math.round((ny / l + 1) * 127.5);
      out[o + 2] = Math.round((nz / l + 1) * 127.5);
    } else {
      for (let c = 0; c < 3; c++) {
        out[o + c] = mode === 'srgb'
          ? toSrgb8((LIN[rgba[s[0] + c]] + LIN[rgba[s[1] + c]] + LIN[rgba[s[2] + c]] + LIN[rgba[s[3] + c]]) / 4)
          : (rgba[s[0] + c] + rgba[s[1] + c] + rgba[s[2] + c] + rgba[s[3] + c] + 2) >> 2;
      }
    }
    out[o + 3] = 255;
  }
  return out;
}

/** R = occlusion, G = roughness (each source's red channel), B = 0, A = 255. */
export function packOrm(ao, rough) {
  const out = new Uint8Array(ao.length);
  for (let i = 0; i < out.length; i += 4) { out[i] = ao[i]; out[i + 1] = rough[i]; out[i + 2] = 0; out[i + 3] = 255; }
  return out;
}

function psnr(a, b, channels) {
  let se = 0, n = 0;
  for (let i = 0; i < a.length; i += 4) for (const c of channels) { const d = a[i + c] - b[i + c]; se += d * d; n++; }
  return se === 0 ? null : +(10 * Math.log10((255 * 255) / (se / n))).toFixed(2);
}

function meanNormalAngle(a, b) {
  let sum = 0, n = 0;
  for (let i = 0; i < a.length; i += 4) {
    const ax = a[i] / 127.5 - 1, ay = a[i + 1] / 127.5 - 1, az = a[i + 2] / 127.5 - 1;
    const bx = b[i] / 127.5 - 1, by = b[i + 1] / 127.5 - 1, bz = b[i + 2] / 127.5 - 1;
    const d = (ax * bx + ay * by + az * bz) / ((Math.hypot(ax, ay, az) || 1) * (Math.hypot(bx, by, bz) || 1));
    sum += Math.acos(Math.min(1, Math.max(-1, d))) * 180 / Math.PI; n++;
  }
  return +(sum / n).toFixed(3);
}

// --- generate ---------------------------------------------------------------------------------------------------------
function generate(groupName) {
  const group = GROUPS[groupName];
  const ledger = {
    note: `Generated by \`node tools/terrain-texture-tiers.mjs --group=${groupName}\` from the CC0 sources in ${group.dir}/ `
      + '(docs/ATTRIBUTION.md); checked by `--check` (tools/terrain-texture-tiers.selftest.mjs). Error is each output against '
      + 'its reference at the same size (the decoded source, or its box-filtered half for 512).',
    encoder: webpVersion(), encode: ENCODE, tiers: TIERS, sets: {},
  };
  for (const set of group.sets) {
    const files = sourceFiles(set);
    const entry = { sources: {}, outputs: {} };
    for (const [role, rel] of Object.entries(files)) {
      const buf = readFileSync(abs(rel));
      entry.sources[role] = { file: rel, bytes: buf.length, sha256: sha256(buf) };
    }
    const dec = Object.fromEntries(Object.entries(files).map(([role, rel]) => [role, decodeRgba(abs(rel))]));
    // the tier is the width; a set may be wider than tall (Bricks 097 is 1024 x 512), its maps all one size
    const size = dec.color.width, height = dec.color.height;
    for (const d of Object.values(dec)) {
      if (d.width !== size || d.height !== height) throw new Error(`${set.base}: sources differ in size`);
    }
    let ref = { Color: dec.color.rgba, NormalGL: dec.normal.rgba, ORM: packOrm(dec.ao.rgba, dec.rough.rgba) };
    let at = size, atH = height;
    for (const [tier, px] of Object.entries(TIERS).sort((a, b) => b[1] - a[1])) {
      while (at > px) {
        ref = { Color: halve(ref.Color, at, 'srgb', atH), NormalGL: halve(ref.NormalGL, at, 'normal', atH),
          ORM: halve(ref.ORM, at, 'data', atH) };
        at >>= 1; atH >>= 1;
      }
      if (at !== px) throw new Error(`${set.base}: ${size} px sources cannot make the ${tier} tier`);
      mkdirSync(abs(`${group.dir}/${tier}`), { recursive: true });
      entry.outputs[tier] = {};
      for (const role of ['Color', 'NormalGL', 'ORM']) {
        const bytes = encodeWebp(ref[role], at, atH, ENCODE[role]);
        const rel = outputFile(tier, set.base, role, group.dir);
        writeFileSync(abs(rel), bytes);
        const back = decodeRgba(abs(rel)).rgba;
        const error = role === 'NormalGL' ? { meanAngleDeg: meanNormalAngle(ref[role], back) }
          : role === 'ORM' ? { psnrAo: psnr(ref[role], back, [0]), psnrRough: psnr(ref[role], back, [1]) }
            : { psnrRgb: psnr(ref[role], back, [0, 1, 2]) };
        // `size` is the width; `height` is recorded only where it differs (a square set's ledger stays as it was)
        entry.outputs[tier][role] = { file: rel, size: at, ...(atH !== at ? { height: atH } : {}), bytes: bytes.length,
          sha256: sha256(bytes), error };
        console.log(`${rel.padEnd(64)} ${String(bytes.length).padStart(8)} B  ${JSON.stringify(error)}`);
      }
    }
    ledger.sets[set.base] = entry;
  }
  writeFileSync(abs(group.ledger), `${JSON.stringify(ledger, null, 1)}\n`);
  console.log(`wrote ${group.ledger}`);
}

/** Every source and output each group's ledger names exists with its recorded digest; returns the problems (empty when clean). */
export function checkLedger(root = ROOT) {
  const problems = [];
  for (const [groupName, group] of Object.entries(GROUPS)) {
    let ledger;
    try { ledger = JSON.parse(readFileSync(path.join(root, group.ledger), 'utf8')); } catch {
      problems.push(`${groupName}: no ledger at ${group.ledger}`); continue;
    }
    const expectSets = group.sets.map((s) => s.base).sort();
    if (JSON.stringify(Object.keys(ledger.sets).sort()) !== JSON.stringify(expectSets)) problems.push(`${groupName}: the ledger's sets are not the group's`);
    for (const set of group.sets) {
      const entry = ledger.sets[set.base];
      if (!entry) continue;
      for (const [role, file] of Object.entries(sourceFiles(set))) {
        if (entry.sources[role]?.file !== file) problems.push(`${set.base}: the ${role} source is not ${file}`);
      }
      const files = [...Object.values(entry.sources), ...Object.values(entry.outputs).flatMap((t) => Object.values(t))];
      for (const { file, sha256: want, bytes } of files) {
        let buf;
        try { buf = readFileSync(path.join(root, file)); } catch { problems.push(`${set.base}: ${file} is missing`); continue; }
        if (buf.length !== bytes || sha256(buf) !== want) problems.push(`${set.base}: ${file} differs from the ledger`);
      }
      for (const tier of Object.keys(TIERS)) {
        for (const role of ['Color', 'NormalGL', 'ORM']) {
          if (entry.outputs[tier]?.[role]?.file !== outputFile(tier, set.base, role, group.dir)) problems.push(`${set.base}: no ${tier} ${role}`);
        }
      }
    }
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.includes('--check')) {
    const problems = checkLedger();
    for (const p of problems) console.error(p);
    console.log(problems.length ? `FAIL ${problems.length}` : 'every group\'s texture tiers match its ledger');
    process.exit(problems.length ? 1 : 0);
  }
  const only = process.argv.find((a) => a.startsWith('--group='))?.slice(8);
  if (only && !GROUPS[only]) throw new Error(`--group must be one of ${Object.keys(GROUPS).join(', ')}`);
  for (const groupName of only ? [only] : Object.keys(GROUPS)) generate(groupName);
}
