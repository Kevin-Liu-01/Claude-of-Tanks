#!/usr/bin/env node
// generate-garage-display-atlas.mjs (garage r9, 2026-10-17): the Garages' ONE display atlas and its manifest.
//
// The owner (2026-10-17): "we can certainly put up more areas of images of tanks, computers or screens showing tanks,
// banners of the game and brand and its logos". Every printed surface in every Garage (banners, crests, nameboards,
// framed prints, monitor readouts, map screens, safety pictograms, stencils, decals, lamp lenses) samples one
// 2048 x 1024 atlas through named rects. Geometry references rect NAMES, never pixels, so the private-v2 rebrand is a
// re-run of this tool on new public/brand art with no geometry change.
//
// Inputs (only these; never public/media/modern, showcase-r2, garage-environments-r2 or presentation-r1):
//   - public/brand: logo-mark.svg, logo-mark-metal.svg, logo-mark-bw.svg, logo-full.svg, logo-full-metal.svg (the
//     current brand; rasterised by the repo's puppeteer Chrome so the embedded Inter wordmark renders exactly)
//   - public/media/site50-r14/stills: the featured battlefield stills the game already shows
//   - public/icons: the exhibit tanks' armour and module readouts
//   - public/maps/thumbs: the ten Garage maps
//   - tools/fonts/InterVariable.woff2 (OFL; see docs/ATTRIBUTION.md) for nameboards, numerals and plates
// Everything else (pictograms, plates, decals, lenses) is drawn here.
//
// Outputs:
//   public/textures/garage/garage-display-atlas.webp     2048 x 1024 albedo (alpha for decals and stencils)
//   public/textures/garage/garage-display-emissive.webp  1024 x 512 emission (screens and lenses glow, prints barely)
//   src/ui/garageDisplayAtlas.generated.ts               the manifest: every rect by name, the input hash
//
// Usage: node tools/generate-garage-display-atlas.mjs           (regenerate; launches Chrome for the brand SVGs)
//        node tools/generate-garage-display-atlas.mjs --check   (receipt: inputs unchanged since the last run, layout
//                                                                and files consistent; no browser, no rendering)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);
const OUT_ALBEDO = 'public/textures/garage/garage-display-atlas.webp';
const OUT_EMISSIVE = 'public/textures/garage/garage-display-emissive.webp';
const OUT_MANIFEST = 'src/ui/garageDisplayAtlas.generated.ts';
const FONT = 'tools/fonts/InterVariable.woff2';
const W = 2048, H = 1024, EW = 1024, EH = 512;
const PAD = 2; // edge extrusion on every side of every rect (mip bleed)
const MAX_ALBEDO_BYTES = 650_000;
const MAX_EMISSIVE_BYTES = 160_000;
const ALBEDO_QUALITY = 84;
const EMISSIVE_QUALITY = 80;

/** The ten Garages: their map, nameboard text and finish, and their own battlefield still. */
const GARAGES = Object.freeze([
  { map: 'verdant', name: 'VERDANT FIELDS', still: 's21-fields-assault-close', board: { bg: '#25302a', ink: '#ecefe6', rule: '#c39a35', style: 'plate' } },
  { map: 'desert', name: 'SIROCCO WADI', still: 's26-minaret-fire', board: { bg: '#b49866', ink: '#241d15', rule: '#6e4426', style: 'painted' } },
  { map: 'winter', name: 'FROSTHOLLOW', still: 's38-church-knockout-close', board: { bg: '#2b3331', ink: '#eef2f2', rule: '#83b9d4', style: 'timber' } },
  { map: 'urban', name: 'STEINBURG', still: 's19-roof-tiles-close', board: { bg: '#1c1e1f', ink: '#e4d9c6', rule: '#b39040', style: 'cast' } },
  { map: 'coastal', name: 'SALTMERE BAY', still: 's29-fjord-road-kill', board: { bg: '#1e3442', ink: '#f2f1ea', rule: '#d9d4c2', style: 'plate' } },
  { map: 'railyard', name: 'CINDER JUNCTION', still: 's33-water-tower-close', board: { bg: '#1d3d78', ink: '#f5f5f1', rule: '#f5f5f1', style: 'enamel' } },
  { map: 'monsoon', name: 'MONSOON RIDGE', still: 's30-temple-village-close', board: { bg: '#2b4937', ink: '#eef0e6', rule: '#c8a640', style: 'painted' } },
  { map: 'alpine', name: 'GLACIER PASS', still: 's07-lake-shellfire', board: { bg: '#37424a', ink: '#f0f4f6', rule: '#97b8c7', style: 'plate' } },
  { map: 'badlands', name: 'REDROCK DIVIDE', still: null, board: { bg: '#6c3923', ink: '#f3e6d4', rule: '#e0a060', style: 'painted' } },
  { map: 'foundry', name: 'IRONWORKS', still: 's34-furnace-salvo-4k', board: { bg: '#191919', ink: '#e6b03a', rule: '#e6b03a', style: 'stencil' } },
]);
/** A Garage whose map has no still of its own shows its sister map's (Redrock shares the Sirocco desert still). */
const MEDIA_ALIASES = Object.freeze({ badlands: 'desert' });
/** Monitor readouts: the five exhibits' own armour and module sheets. */
const READOUTS = Object.freeze([
  ['readout.armor.abrams', 'm1a1_abrams_hc_armor_side.png'],
  ['readout.modules.abrams', 'm1a1_abrams_hc_modules_side.png'],
  ['readout.armor.leopard', 'leo2a4m_armor_side.png'],
  ['readout.modules.t90', 't90am_modules_side.png'],
  ['readout.armor.k2', 'xk2_black_panther_armor_side.png'],
  ['readout.modules.burlak', 't90a_burlak_proto_modules_side.png'],
]);
const PICTOGRAMS = Object.freeze([
  'extinguisher', 'callpoint', 'ear', 'eye', 'head', 'gloves', 'overhead', 'forklift', 'electric', 'flammable',
  'tankcrossing', 'nosmoking', 'eyewash', 'firstaid', 'exit', 'speed10',
]);
const BRAND = Object.freeze({
  mark: 'public/brand/logo-mark.svg', markMetal: 'public/brand/logo-mark-metal.svg', markBw: 'public/brand/logo-mark-bw.svg',
  full: 'public/brand/logo-full.svg', fullMetal: 'public/brand/logo-full-metal.svg',
});

const stillPath = (id) => {
  const thumb = `public/media/site50-r14/stills/${id}-thumb.webp`;
  return fs.existsSync(path.join(ROOT, thumb)) ? thumb : `public/media/site50-r14/stills/${id}.webp`;
};

/** Every rect, by name: size, emission (0..1 of its albedo in the emissive atlas), what draws it. */
function atlasItems() {
  const items = [];
  const add = (name, w, h, kind, emission, extra = {}) => items.push({ name, w, h, kind, emission, ...extra });
  add('brand.banner.v', 160, 640, 'brand', 0.05);
  add('brand.banner.h', 1024, 160, 'brand', 0.05);
  add('brand.crest.color', 160, 160, 'brand', 0.06);
  add('brand.crest.metal', 160, 160, 'brand', 0.04);
  add('stencil.crest', 160, 160, 'stencil', 0);
  add('brand.wordmark.light', 512, 96, 'brand', 0.06);
  add('brand.wordmark.metal', 512, 96, 'brand', 0.04);
  add('stencil.wordmark', 512, 96, 'stencil', 0);
  add('brand.stripe', 320, 32, 'brand', 0.04);
  for (const garage of GARAGES) {
    if (garage.still) add(`media.${garage.map}`, 320, 180, 'media', 0.14, { source: stillPath(garage.still) });
    add(`map.${garage.map}`, 160, 90, 'map', 0.5, { source: `public/maps/thumbs/${garage.map}.webp` });
    add(`name.${garage.map}`, 320, 64, 'name', 0.05, { garage });
  }
  for (const [name, file] of READOUTS) add(name, 256, 128, 'readout', 0.6, { source: `public/icons/${file}` });
  for (const id of PICTOGRAMS) add(`picto.${id}`, 80, 80, 'picto', id === 'exit' ? 0.85 : 0.08);
  for (let n = 1; n <= 8; n += 1) add(`num.0${n}`, 64, 64, 'numeral', 0);
  for (const [id, tone] of [['warm', '#fff0cf'], ['amber', '#ffae3c'], ['green', '#72e08f'], ['monitor', '#a7bfdc'], ['red', '#ff5b48']]) {
    add(`glow.${id}`, 48, 48, 'glow', 1, { tone });
  }
  for (const [id, label] of [['5', 'SWL 5 t'], ['20', 'SWL 20 t'], ['40', 'SWL 40 t']]) add(`plate.swl.${id}`, 128, 48, 'plate', 0.03, { label });
  add('decal.blot', 64, 64, 'decal', 0);
  add('decal.pool', 128, 128, 'decal', 0);
  add('decal.grime', 128, 64, 'decal', 0);
  add('decal.oil', 96, 96, 'decal', 0);
  add('decal.drip', 32, 128, 'decal', 0);
  add('decal.chevron', 256, 32, 'decal', 0);
  add('decal.paint.white', 64, 16, 'decal', 0);
  add('decal.paint.yellow', 64, 16, 'decal', 0);
  add('stencil.diamond', 64, 64, 'stencil', 0);
  add('stencil.fuel', 128, 48, 'stencil', 0, { label: 'F-34' });
  add('stencil.code', 192, 48, 'stencil', 0, { label: 'COTU 227 1' });
  for (const [id, tone] of [['dark', '#0d1317'], ['paper', '#e6e1d4'], ['cork', '#8a6a44'], ['steel', '#5d6367']]) {
    add(`panel.${id}`, 32, 32, 'panel', id === 'dark' ? 0 : 0.02, { tone });
  }
  return items;
}

/** Deterministic MaxRects packing (best short-side fit, largest first); throws when the set no longer fits. */
function pack(items) {
  const order = [...items].sort((a, b) => (Math.max(b.w, b.h) - Math.max(a.w, a.h)) || (b.w * b.h - a.w * a.h)
    || a.name.localeCompare(b.name));
  let free = [{ x: 0, y: 0, w: W, h: H }];
  const placed = new Map();
  const contains = (a, b) => b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
  for (const item of order) {
    const w = item.w + PAD * 2, h = item.h + PAD * 2;
    let best = null;
    for (const rect of free) {
      if (rect.w < w || rect.h < h) continue;
      const shortSide = Math.min(rect.w - w, rect.h - h), longSide = Math.max(rect.w - w, rect.h - h);
      if (!best || shortSide < best.shortSide || (shortSide === best.shortSide && (longSide < best.longSide
        || (longSide === best.longSide && (rect.y < best.y || (rect.y === best.y && rect.x < best.x)))))) {
        best = { x: rect.x, y: rect.y, shortSide, longSide };
      }
    }
    if (!best) throw new Error(`display atlas: ${item.name} (${item.w}x${item.h}) does not fit in ${W}x${H}`);
    const used = { x: best.x, y: best.y, w, h };
    placed.set(item.name, { x: best.x + PAD, y: best.y + PAD, w: item.w, h: item.h });
    const next = [];
    for (const rect of free) {
      if (used.x >= rect.x + rect.w || used.x + used.w <= rect.x || used.y >= rect.y + rect.h || used.y + used.h <= rect.y) {
        next.push(rect);
        continue;
      }
      if (used.x > rect.x) next.push({ x: rect.x, y: rect.y, w: used.x - rect.x, h: rect.h });
      if (used.x + used.w < rect.x + rect.w) next.push({ x: used.x + used.w, y: rect.y, w: rect.x + rect.w - used.x - used.w, h: rect.h });
      if (used.y > rect.y) next.push({ x: rect.x, y: rect.y, w: rect.w, h: used.y - rect.y });
      if (used.y + used.h < rect.y + rect.h) next.push({ x: rect.x, y: used.y + used.h, w: rect.w, h: rect.y + rect.h - used.y - used.h });
    }
    free = next.filter((rect, index) => !next.some((other, j) => j !== index && contains(other, rect)
      && !(contains(rect, other) && j > index)));
  }
  return placed;
}

function inputFiles(items) {
  const files = new Set([SELF, FONT, ...Object.values(BRAND)].map((file) => path.relative(ROOT, path.resolve(ROOT, file))));
  for (const item of items) if (item.source) files.add(item.source);
  return [...files].sort();
}

function inputHash(items) {
  const hash = crypto.createHash('sha256');
  for (const file of inputFiles(items)) {
    hash.update(file);
    hash.update(fs.readFileSync(path.join(ROOT, file)));
  }
  return hash.digest('hex');
}

function manifestOf(items, placed, hash, bytes) {
  const rects = {};
  for (const item of [...items].sort((a, b) => a.name.localeCompare(b.name))) {
    const r = placed.get(item.name);
    // half a texel inside the rect so bilinear taps never reach the neighbour
    rects[item.name] = {
      u0: +((r.x + 0.5) / W).toFixed(6), v0: +(1 - (r.y + r.h - 0.5) / H).toFixed(6),
      u1: +((r.x + r.w - 0.5) / W).toFixed(6), v1: +(1 - (r.y + 0.5) / H).toFixed(6),
      px: [r.x, r.y, r.w, r.h], kind: item.kind,
    };
  }
  return { url: `/${OUT_ALBEDO.replace(/^public\//, '')}`, emissiveUrl: `/${OUT_EMISSIVE.replace(/^public\//, '')}`,
    width: W, height: H, emissiveWidth: EW, emissiveHeight: EH, inputHash: hash, bytes, aliases: MEDIA_ALIASES,
    garages: GARAGES.map((garage) => garage.map), rects };
}

function manifestSource(manifest) {
  const json = JSON.stringify(manifest, null, 1).replace(/\n\s*/g, ' ');
  return `// Generated by tools/generate-garage-display-atlas.mjs (garage r9). Do not edit: re-run the tool.
// The Garages' one display atlas: every banner, crest, nameboard, print, readout, map screen, pictogram, stencil,
// decal and lamp lens samples a named rect of it. Geometry references rect names only (garageDisplayAtlas.ts).
/* atlas-json */
export const GARAGE_DISPLAY_ATLAS_MANIFEST = ${json} as const;
/* /atlas-json */
`;
}

function readManifest() {
  const file = path.join(ROOT, OUT_MANIFEST);
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/export const GARAGE_DISPLAY_ATLAS_MANIFEST = ([\s\S]*?) as const;/);
  return match ? JSON.parse(match[1]) : null;
}

function webpSize(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') throw new Error(`${file}: not a webp`);
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)];
  if (chunk === 'VP8 ') return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  if (chunk === 'VP8L') { const v = bytes.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
  throw new Error(`${file}: unknown webp chunk ${chunk}`);
}

function check() {
  const items = atlasItems();
  const placed = pack(items);
  const stored = readManifest();
  const failures = [];
  if (!stored) failures.push(`${OUT_MANIFEST} is missing or unreadable`);
  const hash = inputHash(items);
  if (stored && stored.inputHash !== hash) failures.push('an atlas input changed since the last generation (re-run the tool)');
  if (stored) {
    const expected = manifestOf(items, placed, hash, stored.bytes);
    if (JSON.stringify(expected.rects) !== JSON.stringify(stored.rects)) failures.push('the packed layout differs from the manifest');
    for (const [file, w, h, limit, key] of [[OUT_ALBEDO, W, H, MAX_ALBEDO_BYTES, 'albedo'], [OUT_EMISSIVE, EW, EH, MAX_EMISSIVE_BYTES, 'emissive']]) {
      const full = path.join(ROOT, file);
      if (!fs.existsSync(full)) { failures.push(`${file} is missing`); continue; }
      const [fw, fh] = webpSize(full);
      if (fw !== w || fh !== h) failures.push(`${file} is ${fw}x${fh}, expected ${w}x${h}`);
      const size = fs.statSync(full).size;
      if (size > limit) failures.push(`${file} is ${size} bytes (limit ${limit})`);
      if (stored.bytes?.[key] !== size) failures.push(`${file} is ${size} bytes but the manifest records ${stored.bytes?.[key]}`);
    }
  }
  for (const file of inputFiles(items)) {
    if (/public\/media\/(modern|showcase-r2|garage-environments-r2|presentation-r1)\//.test(file)) failures.push(`forbidden input ${file}`);
  }
  if (failures.length) {
    console.error(`garage display atlas check FAILED:\n  ${failures.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`garage display atlas check: ${items.length} rects, inputs ${hash.slice(0, 12)}, files within budget`);
}

// ----------------------------------------------------------------------------------------------- drawing

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

async function rasteriseBrand(jobs) {
  const puppeteer = (await import('puppeteer')).default;
  const browser = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body style="margin:0;background:transparent"></body></html>');
    const out = new Map();
    for (const job of jobs) {
      const svg = fs.readFileSync(path.join(ROOT, job.file), 'utf8');
      const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
      const dataUrl = await page.evaluate(async (src, w, h) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const context = canvas.getContext('2d');
        const scale = Math.min(w / image.width, h / image.height);
        const dw = image.width * scale, dh = image.height * scale;
        context.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
        return canvas.toDataURL('image/png');
      }, uri, job.w, job.h);
      out.set(job.key, Buffer.from(dataUrl.split(',')[1], 'base64'));
    }
    return out;
  } finally {
    await browser.close();
  }
}

async function generate() {
  const { createCanvas, loadImage, GlobalFonts } = await import('@napi-rs/canvas');
  GlobalFonts.registerFromPath(path.join(ROOT, FONT), 'GarageInter');
  const items = atlasItems();
  const placed = pack(items);
  const brand = await rasteriseBrand([
    { key: 'mark', file: BRAND.mark, w: 512, h: 512 },
    { key: 'markMetal', file: BRAND.markMetal, w: 512, h: 512 },
    { key: 'markBw', file: BRAND.markBw, w: 512, h: 512 },
    { key: 'full', file: BRAND.full, w: 2000, h: 840 },
    { key: 'fullMetal', file: BRAND.fullMetal, w: 2000, h: 840 },
  ]);
  const img = {};
  for (const [key, buffer] of brand) img[key] = await loadImage(buffer);

  /** The wordmark alone: the lockup's text, right of its crest, trimmed to its pixels. */
  const wordmarkOf = (image) => {
    const probe = createCanvas(image.width, image.height);
    const g = probe.getContext('2d');
    g.drawImage(image, 0, 0);
    // the text starts after the first clear gap of columns right of the crest
    const full = g.getImageData(0, 0, image.width, image.height).data;
    const columnInk = (x) => { for (let y = 0; y < image.height; y += 1) if (full[(y * image.width + x) * 4 + 3] > 24) return true; return false; };
    let x0 = Math.round(image.width * 0.3), gap = 0;
    for (let x = x0; x < image.width * 0.6; x += 1) {
      gap = columnInk(x) ? 0 : gap + 1;
      if (gap >= 10) { x0 = x; break; }
    }
    while (x0 < image.width && !columnInk(x0)) x0 += 1;
    const data = g.getImageData(x0, 0, image.width - x0, image.height).data;
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    const rowW = image.width - x0;
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < rowW; x += 1) {
        if (data[(y * rowW + x) * 4 + 3] > 24) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      }
    }
    const crop = createCanvas(maxX - minX + 1, maxY - minY + 1);
    crop.getContext('2d').drawImage(probe, x0 + minX, minY, crop.width, crop.height, 0, 0, crop.width, crop.height);
    return crop;
  };
  const word = wordmarkOf(img.full);
  const wordMetal = wordmarkOf(img.fullMetal);

  const albedo = createCanvas(W, H);
  const a = albedo.getContext('2d');
  a.clearRect(0, 0, W, H);

  const fit = (g, image, x, y, w, h, mode = 'contain') => {
    const scale = mode === 'cover' ? Math.max(w / image.width, h / image.height) : Math.min(w / image.width, h / image.height);
    const dw = image.width * scale, dh = image.height * scale;
    g.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  };
  const weave = (g, x, y, w, h, seed, strength = 0.06) => {
    const random = rng(seed);
    g.save();
    for (let i = 0; i < (w * h) / 6; i += 1) {
      g.fillStyle = random() < 0.5 ? `rgba(255,255,255,${strength * random()})` : `rgba(0,0,0,${strength * 1.4 * random()})`;
      g.fillRect(x + Math.floor(random() * w), y + Math.floor(random() * h), 1 + Math.floor(random() * 2), 1);
    }
    for (let yy = 0; yy < h; yy += 2) { g.fillStyle = `rgba(0,0,0,${strength * 0.35})`; g.fillRect(x, y + yy, w, 1); }
    g.restore();
  };
  const fieldGradient = (g, x, y, w, h, vertical = true) => {
    const gradient = vertical ? g.createLinearGradient(x, y, x, y + h) : g.createLinearGradient(x, y, x + w, y);
    gradient.addColorStop(0, '#1b2834');
    gradient.addColorStop(1, '#0e161d');
    g.fillStyle = gradient;
    g.fillRect(x, y, w, h);
  };
  const pinstripes = (g, x, y, w, h, inset, width = 3) => {
    g.strokeStyle = '#e8ad48';
    g.lineWidth = width;
    g.strokeRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
  };
  const text = (g, label, x, y, w, h, { weight = 800, color = '#fff', align = 'center', spacing = 0, size = null } = {}) => {
    let px = size ?? Math.floor(h * 0.62);
    g.save();
    g.fillStyle = color;
    g.textBaseline = 'middle';
    const measure = () => {
      g.font = `${weight} ${px}px GarageInter`;
      return g.measureText(label).width + spacing * (label.length - 1);
    };
    while (measure() > w * 0.92 && px > 6) px -= 1;
    const total = measure();
    let cx = align === 'left' ? x : x + (w - total) / 2;
    for (const ch of label) {
      g.fillText(ch, cx, y + h / 2 + px * 0.04);
      cx += g.measureText(ch).width + spacing;
    }
    g.restore();
  };

  const draw = {
    'brand.banner.v': (g, r) => {
      fieldGradient(g, r.x, r.y, r.w, r.h);
      weave(g, r.x, r.y, r.w, r.h, 11);
      pinstripes(g, r.x, r.y, r.w, r.h, 7, 3);
      fit(g, img.mark, r.x + 14, r.y + 22, r.w - 28, r.w - 28);
      // the wordmark runs up the banner
      g.save();
      g.translate(r.x + r.w / 2, r.y + r.w + 8 + (r.h - r.w - 70) / 2);
      g.rotate(-Math.PI / 2);
      const len = r.h - r.w - 70, tall = r.w * 0.5;
      fit(g, word, -len / 2, -tall / 2, len, tall);
      g.restore();
      g.fillStyle = '#e8ad48';
      for (let i = 0; i < 3; i += 1) g.fillRect(r.x + r.w / 2 - 22 + i * 18, r.y + r.h - 34, 8, 8);
    },
    'brand.banner.h': (g, r) => {
      fieldGradient(g, r.x, r.y, r.w, r.h, false);
      weave(g, r.x, r.y, r.w, r.h, 12);
      pinstripes(g, r.x, r.y, r.w, r.h, 7, 3);
      fit(g, img.mark, r.x + 26, r.y + 12, r.h - 24, r.h - 24);
      fit(g, word, r.x + r.h + 24, r.y + 30, r.w * 0.52, r.h - 60);
      g.fillStyle = '#e8ad48';
      for (let i = 0; i < 6; i += 1) g.fillRect(r.x + r.w - 220 + i * 30, r.y + r.h / 2 - 5, 16, 10);
    },
    'brand.crest.color': (g, r) => {
      const gradient = g.createRadialGradient(r.x + r.w / 2, r.y + r.h * 0.4, 4, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.75);
      gradient.addColorStop(0, '#1d2a36'); gradient.addColorStop(1, '#0b1117');
      g.fillStyle = gradient; g.fillRect(r.x, r.y, r.w, r.h);
      fit(g, img.mark, r.x + 8, r.y + 8, r.w - 16, r.h - 16);
    },
    'brand.crest.metal': (g, r) => {
      const gradient = g.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
      gradient.addColorStop(0, '#9aa1a6'); gradient.addColorStop(0.5, '#6f767c'); gradient.addColorStop(1, '#565c61');
      g.fillStyle = gradient; g.fillRect(r.x, r.y, r.w, r.h);
      const random = rng(31);
      for (let y = 0; y < r.h; y += 1) { g.fillStyle = `rgba(255,255,255,${0.05 * random()})`; g.fillRect(r.x, r.y + y, r.w, 1); }
      fit(g, img.markMetal, r.x + 10, r.y + 10, r.w - 20, r.h - 20);
    },
    'stencil.crest': (g, r) => stencilFrom(g, img.markBw, r, '#1b1d1f', true),
    'brand.wordmark.light': (g, r) => { g.fillStyle = '#111921'; g.fillRect(r.x, r.y, r.w, r.h); fit(g, word, r.x + 18, r.y + 14, r.w - 36, r.h - 28); },
    'brand.wordmark.metal': (g, r) => { g.fillStyle = '#151b20'; g.fillRect(r.x, r.y, r.w, r.h); fit(g, wordMetal, r.x + 18, r.y + 14, r.w - 36, r.h - 28); },
    'stencil.wordmark': (g, r) => stencilFrom(g, word, r, '#ebe8df', false),
    'brand.stripe': (g, r) => {
      g.fillStyle = '#121a21'; g.fillRect(r.x, r.y, r.w, r.h);
      g.fillStyle = '#e8ad48';
      g.fillRect(r.x, r.y + 4, r.w, 3); g.fillRect(r.x, r.y + r.h - 7, r.w, 3);
      for (let x = 8; x < r.w; x += 28) g.fillRect(r.x + x, r.y + 12, 14, 8);
    },
  };

  /** A stencil from a rendered mark: paint where the source is dark (`fromDark`) or where it is opaque. */
  function stencilFrom(g, image, r, paint, fromDark) {
    const tmp = createCanvas(r.w, r.h);
    const t = tmp.getContext('2d');
    fit(t, image, 4, 4, r.w - 8, r.h - 8);
    const data = t.getImageData(0, 0, r.w, r.h);
    const [pr, pg, pb] = [1, 3, 5].map((i) => parseInt(paint.slice(i, i + 2), 16));
    const random = rng(r.w * 31 + r.h);
    for (let i = 0; i < data.data.length; i += 4) {
      const alpha = data.data[i + 3] / 255;
      const luma = (data.data[i] * 0.299 + data.data[i + 1] * 0.587 + data.data[i + 2] * 0.114) / 255;
      let cover = fromDark ? alpha * (1 - luma) : alpha * luma;
      cover = cover > 0.5 ? 1 : cover * 2 * cover; // crisp paint edge
      cover *= 0.82 + 0.18 * random(); // worn paint
      data.data[i] = pr; data.data[i + 1] = pg; data.data[i + 2] = pb; data.data[i + 3] = Math.round(cover * 255);
    }
    t.putImageData(data, 0, 0);
    g.drawImage(tmp, r.x, r.y);
  }

  const pictogram = (g, id, r) => {
    const s = r.w, x = r.x, y = r.y;
    const P = (fx, fy) => [x + fx * s, y + fy * s];
    const red = '#c8362b', blue = '#1f5fa8', green = '#1e8a4c', yellow = '#f2c230', black = '#1a1a1a', white = '#f7f7f2';
    const square = (color) => { g.fillStyle = color; g.fillRect(x + 2, y + 2, s - 4, s - 4); };
    const disc = (color) => { g.fillStyle = color; g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.46, 0, Math.PI * 2); g.fill(); };
    const triangle = () => {
      g.fillStyle = black; g.beginPath(); g.moveTo(...P(0.5, 0.05)); g.lineTo(...P(0.97, 0.9)); g.lineTo(...P(0.03, 0.9)); g.closePath(); g.fill();
      g.fillStyle = yellow; g.beginPath(); g.moveTo(...P(0.5, 0.15)); g.lineTo(...P(0.88, 0.84)); g.lineTo(...P(0.12, 0.84)); g.closePath(); g.fill();
    };
    const prohibition = () => {
      g.fillStyle = white; g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.46, 0, Math.PI * 2); g.fill();
      g.strokeStyle = red; g.lineWidth = s * 0.09; g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.41, 0, Math.PI * 2); g.stroke();
    };
    const slash = () => { g.strokeStyle = red; g.lineWidth = s * 0.09; g.beginPath(); g.moveTo(...P(0.21, 0.21)); g.lineTo(...P(0.79, 0.79)); g.stroke(); };
    const fill = (color) => { g.fillStyle = color; };
    const poly = (points) => { g.beginPath(); g.moveTo(...P(...points[0])); for (const p of points.slice(1)) g.lineTo(...P(...p)); g.closePath(); g.fill(); };
    const circle = (fx, fy, fr) => { g.beginPath(); g.arc(...P(fx, fy), fr * s, 0, Math.PI * 2); g.fill(); };
    const rect = (fx, fy, fw, fh) => g.fillRect(...P(fx, fy), fw * s, fh * s);
    switch (id) {
      case 'extinguisher':
        square(red); fill(white);
        g.beginPath(); g.roundRect(...P(0.4, 0.34), 0.22 * s, 0.5 * s, 0.07 * s); g.fill();
        rect(0.46, 0.24, 0.1, 0.1); rect(0.36, 0.22, 0.26, 0.05);
        g.strokeStyle = white; g.lineWidth = s * 0.04; g.beginPath(); g.moveTo(...P(0.4, 0.26)); g.quadraticCurveTo(...P(0.22, 0.3), ...P(0.24, 0.58)); g.stroke();
        break;
      case 'callpoint':
        square(red); g.strokeStyle = white; g.lineWidth = s * 0.06; g.strokeRect(...P(0.22, 0.22), 0.56 * s, 0.56 * s);
        fill(white); circle(0.5, 0.5, 0.11);
        rect(0.62, 0.58, 0.2, 0.08); rect(0.66, 0.66, 0.16, 0.07);
        break;
      case 'ear':
        disc(blue); g.strokeStyle = white; g.lineWidth = s * 0.07;
        g.beginPath(); g.arc(...P(0.5, 0.55), 0.25 * s, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
        fill(white); g.beginPath(); g.roundRect(...P(0.2, 0.47), 0.14 * s, 0.24 * s, 0.05 * s); g.fill();
        g.beginPath(); g.roundRect(...P(0.66, 0.47), 0.14 * s, 0.24 * s, 0.05 * s); g.fill();
        break;
      case 'eye':
        disc(blue); fill(white);
        g.beginPath(); g.ellipse(...P(0.35, 0.5), 0.13 * s, 0.1 * s, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(...P(0.65, 0.5), 0.13 * s, 0.1 * s, 0, 0, Math.PI * 2); g.fill();
        rect(0.46, 0.47, 0.08, 0.05); rect(0.12, 0.47, 0.1, 0.05); rect(0.78, 0.47, 0.1, 0.05);
        break;
      case 'head':
        disc(blue); fill(white);
        g.beginPath(); g.arc(...P(0.5, 0.6), 0.24 * s, Math.PI, 0); g.fill();
        rect(0.18, 0.58, 0.64, 0.07); rect(0.47, 0.3, 0.06, 0.12);
        break;
      case 'gloves':
        disc(blue); fill(white);
        g.beginPath(); g.roundRect(...P(0.36, 0.42), 0.28 * s, 0.32 * s, 0.06 * s); g.fill();
        for (let i = 0; i < 4; i += 1) { g.beginPath(); g.roundRect(...P(0.36 + i * 0.072, 0.22), 0.055 * s, 0.24 * s, 0.03 * s); g.fill(); }
        g.beginPath(); g.roundRect(...P(0.24, 0.46), 0.14 * s, 0.07 * s, 0.03 * s); g.fill();
        break;
      case 'overhead':
        triangle(); fill(black);
        rect(0.485, 0.3, 0.03, 0.22);
        g.strokeStyle = black; g.lineWidth = s * 0.035; g.beginPath(); g.arc(...P(0.5, 0.52), 0.05 * s, 0, Math.PI); g.stroke();
        poly([[0.5, 0.56], [0.36, 0.66], [0.64, 0.66]]); rect(0.34, 0.66, 0.32, 0.12);
        break;
      case 'forklift':
        triangle(); fill(black);
        rect(0.3, 0.5, 0.24, 0.16); rect(0.38, 0.4, 0.12, 0.1); rect(0.56, 0.36, 0.03, 0.34); rect(0.59, 0.66, 0.14, 0.03);
        circle(0.35, 0.7, 0.045); circle(0.5, 0.7, 0.045);
        break;
      case 'electric':
        triangle(); fill(black);
        poly([[0.54, 0.28], [0.4, 0.56], [0.5, 0.56], [0.44, 0.78], [0.62, 0.48], [0.52, 0.48], [0.58, 0.28]]);
        break;
      case 'flammable':
        triangle(); fill(black);
        g.beginPath(); g.moveTo(...P(0.5, 0.32)); g.bezierCurveTo(...P(0.66, 0.46), ...P(0.66, 0.62), ...P(0.6, 0.72));
        g.lineTo(...P(0.4, 0.72)); g.bezierCurveTo(...P(0.32, 0.6), ...P(0.4, 0.5), ...P(0.46, 0.44));
        g.bezierCurveTo(...P(0.46, 0.52), ...P(0.5, 0.56), ...P(0.52, 0.56)); g.bezierCurveTo(...P(0.56, 0.48), ...P(0.52, 0.4), ...P(0.5, 0.32));
        g.fill(); rect(0.32, 0.74, 0.36, 0.04);
        break;
      case 'tankcrossing':
        fill(red); poly([[0.5, 0.05], [0.97, 0.9], [0.03, 0.9]]);
        fill(white); poly([[0.5, 0.2], [0.85, 0.82], [0.15, 0.82]]);
        fill(black); g.beginPath(); g.roundRect(...P(0.26, 0.62), 0.48 * s, 0.1 * s, 0.05 * s); g.fill();
        rect(0.3, 0.55, 0.38, 0.08); rect(0.4, 0.48, 0.18, 0.08); rect(0.56, 0.5, 0.2, 0.025);
        break;
      case 'nosmoking':
        prohibition(); fill(black); rect(0.24, 0.52, 0.42, 0.08); fill('#6b6b6b'); rect(0.66, 0.52, 0.08, 0.08);
        g.strokeStyle = black; g.lineWidth = s * 0.03; g.beginPath(); g.moveTo(...P(0.7, 0.48)); g.quadraticCurveTo(...P(0.64, 0.38), ...P(0.7, 0.3)); g.stroke();
        slash();
        break;
      case 'eyewash':
        square(green); fill(white);
        g.beginPath(); g.ellipse(...P(0.5, 0.62), 0.2 * s, 0.1 * s, 0, 0, Math.PI * 2); g.fill();
        fill(green); circle(0.5, 0.62, 0.05); fill(white);
        for (const [fx, fy] of [[0.36, 0.3], [0.5, 0.24], [0.64, 0.3]]) circle(fx, fy, 0.045);
        rect(0.44, 0.78, 0.12, 0.08);
        break;
      case 'firstaid':
        square(green); fill(white); rect(0.42, 0.2, 0.16, 0.6); rect(0.2, 0.42, 0.6, 0.16);
        break;
      case 'exit':
        square(green); fill(white);
        g.strokeStyle = white; g.lineWidth = s * 0.04; g.strokeRect(...P(0.58, 0.2), 0.24 * s, 0.62 * s);
        circle(0.38, 0.26, 0.06);
        g.lineWidth = s * 0.06; g.lineCap = 'round';
        g.beginPath(); g.moveTo(...P(0.36, 0.36)); g.lineTo(...P(0.32, 0.56)); g.lineTo(...P(0.44, 0.72)); g.moveTo(...P(0.32, 0.56)); g.lineTo(...P(0.2, 0.74));
        g.moveTo(...P(0.36, 0.4)); g.lineTo(...P(0.5, 0.48)); g.moveTo(...P(0.36, 0.4)); g.lineTo(...P(0.24, 0.48)); g.stroke();
        g.lineCap = 'butt';
        break;
      case 'speed10':
        prohibition(); text(g, '10', x, y, s, s, { color: black, weight: 800, size: Math.floor(s * 0.42) });
        break;
      default: throw new Error(`no pictogram ${id}`);
    }
  };

  const nameboard = (g, r, garage) => {
    const { bg, ink, rule, style } = garage.board;
    g.save();
    if (style === 'enamel') {
      g.fillStyle = '#e9e9e4'; g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, 10); g.fill();
      g.fillStyle = bg; g.beginPath(); g.roundRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 8); g.fill();
      g.strokeStyle = rule; g.lineWidth = 2; g.beginPath(); g.roundRect(r.x + 7, r.y + 7, r.w - 14, r.h - 14, 6); g.stroke();
    } else {
      g.fillStyle = bg; g.fillRect(r.x, r.y, r.w, r.h);
      if (style === 'timber') { const random = rng(77); for (let yy = 0; yy < r.h; yy += 2) { g.fillStyle = `rgba(0,0,0,${0.08 * random()})`; g.fillRect(r.x, r.y + yy, r.w, 1); } }
      g.strokeStyle = rule; g.lineWidth = style === 'cast' ? 4 : 2; g.strokeRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10);
    }
    fit(g, img.mark, r.x + 10, r.y + 8, r.h - 16, r.h - 16);
    text(g, garage.name, r.x + r.h, r.y + 6, r.w - r.h - 14, r.h - 12, { color: ink, weight: 800, spacing: style === 'stencil' ? 5 : 2 });
    if (style === 'stencil') {
      // stencil bridges cut through the letters
      g.globalCompositeOperation = 'destination-out';
      for (let xx = r.x + r.h; xx < r.x + r.w - 10; xx += 17) { g.fillRect(xx, r.y + r.h * 0.47, 2, 3); }
      g.globalCompositeOperation = 'source-over';
    }
    weave(g, r.x, r.y, r.w, r.h, r.x + r.y, 0.05);
    g.restore();
  };

  const decal = {
    'decal.blot': (g, r) => {
      const gradient = g.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 0, r.x + r.w / 2, r.y + r.h / 2, r.w / 2);
      gradient.addColorStop(0, 'rgba(0,0,0,0.62)'); gradient.addColorStop(0.55, 'rgba(0,0,0,0.32)'); gradient.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gradient; g.fillRect(r.x, r.y, r.w, r.h);
    },
    'decal.pool': (g, r) => {
      const gradient = g.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 0, r.x + r.w / 2, r.y + r.h / 2, r.w / 2);
      gradient.addColorStop(0, 'rgba(255,226,178,0.42)'); gradient.addColorStop(0.5, 'rgba(255,214,160,0.18)'); gradient.addColorStop(1, 'rgba(255,210,150,0)');
      g.fillStyle = gradient; g.fillRect(r.x, r.y, r.w, r.h);
    },
    'decal.grime': (g, r) => {
      const random = rng(91);
      for (let i = 0; i < 260; i += 1) {
        const cx = r.x + r.w * (0.1 + 0.8 * random()), cy = r.y + r.h * (0.15 + 0.7 * random()), rr = 2 + random() * 9;
        const edge = Math.min(cx - r.x, r.x + r.w - cx, cy - r.y, r.y + r.h - cy) / (r.h / 2);
        g.fillStyle = `rgba(22,19,16,${0.09 * random() * Math.min(1, edge * 1.5)})`;
        g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.fill();
      }
    },
    'decal.oil': (g, r) => {
      const random = rng(93);
      for (let i = 0; i < 40; i += 1) {
        const ang = random() * Math.PI * 2, dist = random() * r.w * 0.28;
        g.fillStyle = `rgba(12,11,10,${0.14 + 0.1 * random()})`;
        g.beginPath(); g.ellipse(r.x + r.w / 2 + Math.cos(ang) * dist, r.y + r.h / 2 + Math.sin(ang) * dist, 6 + random() * 14, 5 + random() * 10, ang, 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = 'rgba(8,8,8,0.22)'; g.lineWidth = 2; g.beginPath(); g.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w * 0.36, r.h * 0.32, 0.3, 0, Math.PI * 2); g.stroke();
    },
    'decal.drip': (g, r) => {
      const random = rng(95);
      for (let i = 0; i < 6; i += 1) {
        const cx = r.x + 6 + random() * (r.w - 12), len = r.h * (0.4 + 0.6 * random());
        const gradient = g.createLinearGradient(0, r.y, 0, r.y + len);
        gradient.addColorStop(0, 'rgba(92,48,26,0.55)'); gradient.addColorStop(1, 'rgba(92,48,26,0)');
        g.fillStyle = gradient; g.fillRect(cx, r.y, 2 + random() * 3, len);
      }
    },
    'decal.chevron': (g, r) => {
      g.save(); g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
      g.fillStyle = '#d9a92e'; g.fillRect(r.x, r.y, r.w, r.h);
      g.fillStyle = '#1b1b1a';
      for (let xx = -r.h; xx < r.w + r.h; xx += r.h * 2) { g.beginPath(); g.moveTo(r.x + xx, r.y + r.h); g.lineTo(r.x + xx + r.h, r.y); g.lineTo(r.x + xx + r.h * 2, r.y); g.lineTo(r.x + xx + r.h, r.y + r.h); g.closePath(); g.fill(); }
      g.globalCompositeOperation = 'destination-out';
      const random = rng(97);
      for (let i = 0; i < 160; i += 1) { g.fillStyle = `rgba(0,0,0,${0.5 * random()})`; g.fillRect(r.x + random() * r.w, r.y + random() * r.h, 1 + random() * 4, 1 + random() * 2); }
      g.restore();
    },
    'decal.paint.white': (g, r) => paintStrip(g, r, '#e8e6de', 101),
    'decal.paint.yellow': (g, r) => paintStrip(g, r, '#d8aa30', 103),
  };
  function paintStrip(g, r, color, seed) {
    g.save(); g.fillStyle = color; g.fillRect(r.x, r.y, r.w, r.h);
    g.globalCompositeOperation = 'destination-out';
    const random = rng(seed);
    for (let i = 0; i < 120; i += 1) { g.fillStyle = `rgba(0,0,0,${0.6 * random()})`; g.fillRect(r.x + random() * r.w, r.y + random() * r.h, 1 + random() * 5, 1 + random() * 2); }
    g.restore();
  }

  const emissionOf = new Map();
  for (const item of items) {
    const r = placed.get(item.name);
    emissionOf.set(item.name, item.emission);
    a.save();
    a.beginPath(); a.rect(r.x, r.y, r.w, r.h); a.clip();
    if (draw[item.name]) draw[item.name](a, r);
    else if (decal[item.name]) decal[item.name](a, r);
    else if (item.kind === 'media') {
      const image = await loadImage(path.join(ROOT, item.source));
      fit(a, image, r.x, r.y, r.w, r.h, 'cover');
    } else if (item.kind === 'map' || item.kind === 'readout') {
      a.fillStyle = '#0c1216'; a.fillRect(r.x, r.y, r.w, r.h);
      const image = await loadImage(path.join(ROOT, item.source));
      fit(a, image, r.x, r.y, r.w, r.h, item.kind === 'map' ? 'cover' : 'contain');
    } else if (item.kind === 'name') nameboard(a, r, item.garage);
    else if (item.kind === 'picto') { a.fillStyle = '#f2f2ec'; a.fillRect(r.x, r.y, r.w, r.h); pictogram(a, item.name.slice(6), r); }
    else if (item.kind === 'numeral') {
      text(a, item.name.slice(4), r.x, r.y, r.w, r.h, { color: '#ecebe4', weight: 800, size: Math.floor(r.h * 0.78), spacing: 1 });
      a.globalCompositeOperation = 'destination-out'; a.fillRect(r.x, r.y + r.h * 0.48, r.w, 3); a.globalCompositeOperation = 'source-over';
    } else if (item.kind === 'glow') {
      const gradient = a.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 0, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.72);
      gradient.addColorStop(0, item.tone); gradient.addColorStop(1, '#3a3632');
      a.fillStyle = gradient; a.fillRect(r.x, r.y, r.w, r.h);
    } else if (item.kind === 'plate') {
      a.fillStyle = '#e0b13a'; a.fillRect(r.x, r.y, r.w, r.h);
      a.strokeStyle = '#1a1a1a'; a.lineWidth = 3; a.strokeRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
      a.fillStyle = '#1a1a1a'; for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { a.beginPath(); a.arc(r.x + 9 + fx * (r.w - 18), r.y + 9 + fy * (r.h - 18), 2.2, 0, Math.PI * 2); a.fill(); }
      text(a, item.label, r.x + 10, r.y + 6, r.w - 20, r.h - 12, { color: '#1a1a1a', weight: 800 });
    } else if (item.name === 'stencil.diamond') {
      a.fillStyle = '#d8762a'; a.beginPath(); a.moveTo(r.x + r.w / 2, r.y + 3); a.lineTo(r.x + r.w - 3, r.y + r.h / 2); a.lineTo(r.x + r.w / 2, r.y + r.h - 3); a.lineTo(r.x + 3, r.y + r.h / 2); a.closePath(); a.fill();
      text(a, '1.1', r.x, r.y + r.h * 0.2, r.w, r.h * 0.6, { color: '#1a1a1a', weight: 800 });
    } else if (item.kind === 'stencil') {
      text(a, item.label, r.x + 4, r.y + 4, r.w - 8, r.h - 8, { color: '#ebe8df', weight: 800, spacing: 3 });
      a.globalCompositeOperation = 'destination-out'; a.fillRect(r.x, r.y + r.h * 0.5, r.w, 2); a.globalCompositeOperation = 'source-over';
    } else if (item.kind === 'panel') {
      a.fillStyle = item.tone; a.fillRect(r.x, r.y, r.w, r.h);
      weave(a, r.x, r.y, r.w, r.h, r.x * 7 + r.y, 0.05);
    } else throw new Error(`no drawer for ${item.name}`);
    a.restore();
    // edge extrusion: smear each border row/column PAD texels outward (mips sample clean edges)
    a.drawImage(albedo, r.x, r.y, r.w, 1, r.x, r.y - PAD, r.w, PAD);
    a.drawImage(albedo, r.x, r.y + r.h - 1, r.w, 1, r.x, r.y + r.h, r.w, PAD);
    a.drawImage(albedo, r.x, r.y - PAD, 1, r.h + PAD * 2, r.x - PAD, r.y - PAD, PAD, r.h + PAD * 2);
    a.drawImage(albedo, r.x + r.w - 1, r.y - PAD, 1, r.h + PAD * 2, r.x + r.w, r.y - PAD, PAD, r.h + PAD * 2);
  }

  // emission: each rect's albedo scaled by its emission factor, at half resolution
  const emissive = createCanvas(EW, EH);
  const e = emissive.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, EW, EH);
  for (const item of items) {
    const factor = emissionOf.get(item.name);
    if (!(factor > 0)) continue;
    const r = placed.get(item.name);
    const sx = EW / W, sy = EH / H;
    const ex = (r.x - PAD) * sx, ey = (r.y - PAD) * sy, ew = (r.w + PAD * 2) * sx, eh = (r.h + PAD * 2) * sy;
    e.drawImage(albedo, r.x - PAD, r.y - PAD, r.w + PAD * 2, r.h + PAD * 2, ex, ey, ew, eh);
    e.fillStyle = `rgba(0,0,0,${(1 - factor).toFixed(3)})`;
    e.fillRect(ex, ey, ew, eh);
  }

  const albedoBytes = await albedo.encode('webp', ALBEDO_QUALITY);
  const emissiveBytes = await emissive.encode('webp', EMISSIVE_QUALITY);
  fs.writeFileSync(path.join(ROOT, OUT_ALBEDO), albedoBytes);
  fs.writeFileSync(path.join(ROOT, OUT_EMISSIVE), emissiveBytes);
  const hash = inputHash(items);
  const manifest = manifestOf(items, placed, hash, { albedo: albedoBytes.length, emissive: emissiveBytes.length });
  fs.writeFileSync(path.join(ROOT, OUT_MANIFEST), manifestSource(manifest));
  console.log(`garage display atlas: ${items.length} rects; albedo ${albedoBytes.length} B, emissive ${emissiveBytes.length} B`);
  if (albedoBytes.length > MAX_ALBEDO_BYTES || emissiveBytes.length > MAX_EMISSIVE_BYTES) {
    console.error('garage display atlas: over its byte budget');
    process.exit(1);
  }
}

if (process.argv.includes('--check')) check();
else await generate();
