// src/world/props.js — rocks, ~10-building village, walls and cover props.
// Contract: docs/ARCHITECTURE.md §3.2. All geometry composed BufferGeometry,
// all textures canvas-generated, everything merged into few draw calls.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { _LAYOUT } from './terrain.js';

export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Canvas textures
// ---------------------------------------------------------------------------

function toTexture(px, s, { srgb = false, anisotropy = 4 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = s;
  c.getContext('2d').putImageData(new ImageData(px, s, s), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function normalFromHeight(h, s, strength, anisotropy) {
  const px = new Uint8ClampedArray(s * s * 4);
  const H = (x, y) => h[((y + s) % s) * s + ((x + s) % s)];
  const v = new THREE.Vector3();
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
    const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
    v.set(-dx * strength, -dy * strength, 1).normalize();
    const i = (y * s + x) * 4;
    px[i] = v.x * 127.5 + 127.5; px[i + 1] = v.y * 127.5 + 127.5; px[i + 2] = v.z * 127.5 + 127.5; px[i + 3] = 255;
  }
  return toTexture(px, s, { anisotropy });
}

const _col = new THREE.Color();

function makePlaster(noi, anisotropy) {
  const s = 256, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = y * s + x, j = i * 4;
    const n1 = noi.noise(x * 0.045, y * 0.045) * 0.5 + 0.5;
    const n2 = noi.noise(x * 0.16 + 40, y * 0.16 - 21) * 0.5 + 0.5;
    const stain = smoothstep(0.62, 0.9, noi.noise(x * 0.02 - 90, y * 0.05 + 33) * 0.5 + 0.5);
    const l = 0.55 + n1 * 0.09 + n2 * 0.05 - stain * 0.12; // kept below bloom threshold in full sun
    _col.setHSL(0.09, 0.10 - stain * 0.04, l);
    px[j] = _col.r * 255; px[j + 1] = _col.g * 255; px[j + 2] = _col.b * 255; px[j + 3] = 255;
    hgt[i] = n1 * 0.5 + n2 * 0.5;
  }
  return { albedo: toTexture(px, s, { srgb: true, anisotropy }), normal: normalFromHeight(hgt, s, 1.2, anisotropy) };
}

function makeRoofTiles(noi, anisotropy) {
  const s = 256, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  const rowH = 32, tileW = 42;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = y * s + x, j = i * 4;
    const row = Math.floor(y / rowH);
    const off = (row % 2) * tileW * 0.5;
    const tile = Math.floor((x + off) / tileW);
    const tRng = noi.noise(tile * 13.7 + 3, row * 7.9 - 11) * 0.5 + 0.5; // per-tile tone
    const inRowY = (y % rowH) / rowH;
    const inTileX = ((x + off) % tileW) / tileW;
    const gap = (inRowY < 0.10 || inTileX < 0.06) ? 1 : 0;
    const curve = Math.sin(inTileX * Math.PI) * 0.5 + 0.5;
    const wear = noi.noise(x * 0.1 - 60, y * 0.1 + 45) * 0.5 + 0.5;
    _col.setHSL(0.028 + tRng * 0.02, 0.42 - wear * 0.12, (0.26 + tRng * 0.10 + curve * 0.04) * (gap ? 0.45 : 1));
    px[j] = _col.r * 255; px[j + 1] = _col.g * 255; px[j + 2] = _col.b * 255; px[j + 3] = 255;
    hgt[i] = gap ? 0.1 : 0.4 + curve * 0.5 + (1 - inRowY) * 0.15;
  }
  return { albedo: toTexture(px, s, { srgb: true, anisotropy }), normal: normalFromHeight(hgt, s, 2.4, anisotropy) };
}

function makeStone(noi, anisotropy) {
  const s = 256, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  const rowH = 36;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = y * s + x, j = i * 4;
    const row = Math.floor(y / rowH);
    const stoneW = 52;
    const off = (row % 2) * stoneW * 0.5;
    const st = Math.floor((x + off) / stoneW);
    const tone = noi.noise(st * 17.1 + row * 5.3, row * 11.7 - st * 3.1) * 0.5 + 0.5;
    const inY = (y % rowH) / rowH, inX = ((x + off) % stoneW) / stoneW;
    const mortar = (inY < 0.12 || inX < 0.09) ? 1 : 0;
    const grain = noi.noise(x * 0.12 + 8, y * 0.12 - 77) * 0.5 + 0.5;
    _col.setHSL(0.083, 0.06 + tone * 0.05, mortar ? 0.34 : 0.40 + tone * 0.16 + grain * 0.05);
    px[j] = _col.r * 255; px[j + 1] = _col.g * 255; px[j + 2] = _col.b * 255; px[j + 3] = 255;
    hgt[i] = mortar ? 0.12 : 0.55 + tone * 0.25 + grain * 0.2 - Math.pow(Math.abs(inX - 0.55) * 2, 3) * 0.15;
  }
  return { albedo: toTexture(px, s, { srgb: true, anisotropy }), normal: normalFromHeight(hgt, s, 2.6, anisotropy) };
}

function makeWood(noi, anisotropy) {
  const s = 256, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  const plankW = 42;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = y * s + x, j = i * 4;
    const plank = Math.floor(x / plankW);
    const tone = noi.noise(plank * 23.7, plank * 9.1 + 4) * 0.5 + 0.5;
    const inX = (x % plankW) / plankW;
    const gapped = inX < 0.07 ? 1 : 0;
    const grain = noi.noise(x * 0.30 + plank * 50, y * 0.02) * 0.5 + 0.5;
    _col.setHSL(0.070 + tone * 0.015, 0.32 - grain * 0.08, (0.185 + tone * 0.08 + grain * 0.05) * (gapped ? 0.5 : 1));
    px[j] = _col.r * 255; px[j + 1] = _col.g * 255; px[j + 2] = _col.b * 255; px[j + 3] = 255;
    hgt[i] = gapped ? 0.1 : 0.5 + grain * 0.4;
  }
  return { albedo: toTexture(px, s, { srgb: true, anisotropy }), normal: normalFromHeight(hgt, s, 1.8, anisotropy) };
}

function makeStraw(noi, anisotropy) {
  const s = 128, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = y * s + x, j = i * 4;
    const streak = noi.noise(x * 0.03, y * 0.5) * 0.5 + 0.5;
    const fine = noi.noise(x * 0.4 + 31, y * 0.9 - 12) * 0.5 + 0.5;
    _col.setHSL(0.115 + streak * 0.02, 0.45, 0.34 + streak * 0.14 + fine * 0.08);
    px[j] = _col.r * 255; px[j + 1] = _col.g * 255; px[j + 2] = _col.b * 255; px[j + 3] = 255;
    hgt[i] = streak * 0.5 + fine * 0.5;
  }
  return { albedo: toTexture(px, s, { srgb: true, anisotropy }), normal: normalFromHeight(hgt, s, 1.6, anisotropy) };
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

function box(w, h, d, uvScale = 0.5) {
  const g = new THREE.BoxGeometry(w, h, d);
  return scaleUV(g, Math.max(w, d) * uvScale, h * uvScale);
}

// triangular gable prism: width w, height h, thickness t (along z)
function gablePrism(w, h, t) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  return scaleUV(g, 0.4, 0.4);
}

// ---------------------------------------------------------------------------
// Building assembly — parts are pushed into per-material buckets, then merged
// ---------------------------------------------------------------------------

function makeCottage(rng, buckets, wallBucket = 'plaster') {
  const w = 5.2 + rng() * 1.2, d = 7.0 + rng() * 2.2;
  const wallH = 2.9, roofH = 1.9 + rng() * 0.4, over = 0.35;
  const parts = { plaster: [], stone: [], roof: [], wood: [], dark: [] };
  parts.stone.push(box(w + 0.3, 1.0, d + 0.3).translate(0, -0.1, 0)); // foundation (sinks)
  parts[wallBucket].push(box(w, wallH, d).translate(0, wallH / 2, 0));
  parts[wallBucket].push(gablePrism(w, roofH, 0.32).translate(0, wallH, d / 2 - 0.16));
  parts[wallBucket].push(gablePrism(w, roofH, 0.32).translate(0, wallH, -d / 2 + 0.16));
  // roof slabs
  const slope = Math.hypot(w / 2 + over, roofH + 0.1);
  const ang = Math.atan2(roofH + 0.1, w / 2 + over);
  for (const side of [-1, 1]) {
    const slab = box(slope + 0.15, 0.12, d + over * 2, 0.35);
    slab.rotateZ(side * ang);
    slab.translate(-side * (w / 4 + over / 2), wallH + roofH / 2 + 0.06, 0);
    parts.roof.push(slab);
  }
  parts.stone.push(box(0.55, 1.6, 0.55).translate(w * 0.22, wallH + roofH - 0.2, d * 0.22)); // chimney
  // door on +z gable end
  parts.wood.push(box(1.1, 2.1, 0.10).translate(w * 0.08, 1.05, d / 2 + 0.10));
  parts.dark.push(box(0.86, 1.9, 0.06).translate(w * 0.08, 1.0, d / 2 + 0.16));
  // windows on long sides
  const nw = 2 + ((rng() * 2) | 0);
  for (let k = 0; k < nw; k++) {
    const zz = -d / 2 + (k + 0.5) * (d / nw);
    for (const side of [-1, 1]) {
      if (rng() < 0.2) continue;
      parts.wood.push(box(0.10, 1.06, 0.86).translate(side * (w / 2 + 0.04), 1.7, zz));
      parts.dark.push(box(0.06, 0.9, 0.7).translate(side * (w / 2 + 0.10), 1.7, zz));
    }
  }
  mergeInto(buckets, parts);
  return { w: w + 0.3, d: d + 0.3, h: wallH + roofH };
}

function makeBarn(rng, buckets) {
  const w = 7.5 + rng() * 1.2, d = 11 + rng() * 2, wallH = 3.6, roofH = 2.6, over = 0.45;
  const parts = { plaster: [], stone: [], roof: [], wood: [], dark: [] };
  parts.stone.push(box(w + 0.3, 1.2, d + 0.3).translate(0, -0.1, 0));
  parts.wood.push(box(w, wallH, d).translate(0, wallH / 2, 0));
  parts.wood.push(gablePrism(w, roofH, 0.3).translate(0, wallH, d / 2 - 0.15));
  parts.wood.push(gablePrism(w, roofH, 0.3).translate(0, wallH, -d / 2 + 0.15));
  const slope = Math.hypot(w / 2 + over, roofH + 0.1);
  const ang = Math.atan2(roofH + 0.1, w / 2 + over);
  for (const side of [-1, 1]) {
    const slab = box(slope + 0.15, 0.14, d + over * 2, 0.35);
    slab.rotateZ(side * ang);
    slab.translate(-side * (w / 4 + over / 2), wallH + roofH / 2 + 0.07, 0);
    parts.roof.push(slab);
  }
  parts.dark.push(box(2.6, 2.9, 0.10).translate(0, 1.45, d / 2 + 0.08)); // big barn door
  parts.wood.push(box(2.9, 3.1, 0.06).translate(0, 1.55, d / 2 + 0.02));
  mergeInto(buckets, parts);
  return { w: w + 0.3, d: d + 0.3, h: wallH + roofH };
}

function makeTower(rng, buckets) {
  const w = 3.4, d = 3.4, wallH = 6.4 + rng() * 0.8;
  const parts = { plaster: [], stone: [], roof: [], wood: [], dark: [] };
  parts.stone.push(box(w + 0.4, 1.2, d + 0.4).translate(0, -0.1, 0));
  parts.stone.push(box(w, wallH, d, 0.7).translate(0, wallH / 2, 0));
  const spire = new THREE.ConeGeometry(w * 0.78, 2.6, 4, 1);
  spire.rotateY(Math.PI / 4);
  scaleUV(spire, 2, 2);
  spire.translate(0, wallH + 1.3, 0);
  parts.roof.push(spire);
  for (let k = 0; k < 3; k++) {
    const yy = 1.8 + k * 1.7;
    parts.dark.push(box(0.5, 0.8, 0.06).translate(0, yy, d / 2 + 0.04));
    parts.dark.push(box(0.06, 0.8, 0.5).translate(w / 2 + 0.04, yy, 0));
  }
  parts.wood.push(box(1.0, 2.2, 0.1).translate(0, 1.1, -d / 2 - 0.06));
  mergeInto(buckets, parts);
  return { w: w + 0.4, d: d + 0.4, h: wallH + 2.6 };
}

function makeRuin(rng, buckets) {
  const w = 6.0 + rng(), d = 8.0 + rng() * 1.5;
  const parts = { plaster: [], stone: [], roof: [], wood: [], dark: [] };
  parts.stone.push(box(w + 0.3, 1.0, d + 0.3).translate(0, -0.1, 0));
  // four broken walls: sequences of piers with varying heights
  const t = 0.5;
  const walls = [
    { len: d, rot: 0, ox: -w / 2 + t / 2, oz: 0 },
    { len: d, rot: 0, ox: w / 2 - t / 2, oz: 0 },
    { len: w - 2 * t, rot: Math.PI / 2, ox: 0, oz: -d / 2 + t / 2 },
    { len: w - 2 * t, rot: Math.PI / 2, ox: 0, oz: d / 2 - t / 2 },
  ];
  for (const wl of walls) {
    const segs = 3 + ((rng() * 3) | 0);
    const segLen = wl.len / segs;
    for (let k = 0; k < segs; k++) {
      if (rng() < 0.3) continue; // collapsed gap
      const hh = 0.9 + rng() * 2.1;
      const b = box(t, hh, segLen * 0.94, 0.7);
      b.translate(0, hh / 2, -wl.len / 2 + (k + 0.5) * segLen);
      if (wl.rot) b.rotateY(wl.rot);
      b.translate(wl.ox, 0, wl.oz);
      parts.stone.push(b);
    }
  }
  mergeInto(buckets, parts);
  return { w: w + 0.3, d: d + 0.3, h: 3.0 };
}

const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _one = new THREE.Vector3(1, 1, 1);
const _posv = new THREE.Vector3();

function mergeInto(buckets, parts, transform = null) {
  for (const key of Object.keys(parts)) {
    for (const g of parts[key]) {
      if (transform) g.applyMatrix4(transform);
      buckets[key].push(g);
    }
  }
}

// ---------------------------------------------------------------------------
// createProps
// ---------------------------------------------------------------------------

/**
 * Create rocks, village buildings, walls and cover props.
 * @param {object} heightField HeightField from terrain.createHeightField
 * @param {object} engineCtx EngineCtx (ARCHITECTURE §2.8)
 * @param {number} [seed=2002] props seed
 * @returns {{group:THREE.Group, obstacles:Array<{min:number[],max:number[]}>,
 *   colliders:Array<{min:number[],max:number[]}>, features:{buildings:Array<object>}}}
 */
export function createProps(heightField, engineCtx, seed = 2002) {
  const rng = mulberry32(seed);
  const noi = new SimplexNoise({ random: mulberry32(seed + 7) });
  const aniso = engineCtx.anisotropy ?? 4;
  const group = new THREE.Group();
  group.name = 'props';
  const v = _LAYOUT.village;

  const plaster = makePlaster(noi, aniso);
  const roofT = makeRoofTiles(noi, aniso);
  const stone = makeStone(noi, aniso);
  const wood = makeWood(noi, aniso);
  const straw = makeStraw(noi, aniso);

  const mats = {
    plaster: new THREE.MeshStandardMaterial({ map: plaster.albedo, normalMap: plaster.normal, roughness: 0.93, metalness: 0 }),
    roof: new THREE.MeshStandardMaterial({ map: roofT.albedo, normalMap: roofT.normal, roughness: 0.82, metalness: 0 }),
    stone: new THREE.MeshStandardMaterial({ map: stone.albedo, normalMap: stone.normal, roughness: 0.9, metalness: 0 }),
    wood: new THREE.MeshStandardMaterial({ map: wood.albedo, normalMap: wood.normal, roughness: 0.8, metalness: 0 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x161a1d, roughness: 0.35, metalness: 0.15 }),
    straw: new THREE.MeshStandardMaterial({ map: straw.albedo, normalMap: straw.normal, roughness: 0.95, metalness: 0 }),
    rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }),
  };
  for (const m of Object.values(mats)) engineCtx.setupShadowMaterial(m);

  const buckets = { plaster: [], stone: [], roof: [], wood: [], dark: [], straw: [] };
  const obstacles = [];
  const colliders = [];
  const buildingFeatures = [];

  function groundFit(x, z, w, d, rot) {
    const cs = Math.abs(Math.cos(rot)), sn = Math.abs(Math.sin(rot));
    const hx = (w * cs + d * sn) / 2, hz = (w * sn + d * cs) / 2;
    const hs = [
      heightField.getHeightAt(x - hx, z - hz), heightField.getHeightAt(x + hx, z - hz),
      heightField.getHeightAt(x - hx, z + hz), heightField.getHeightAt(x + hx, z + hz),
      heightField.getHeightAt(x, z),
    ];
    return { y: Math.min(...hs), spread: Math.max(...hs) - Math.min(...hs), hx, hz };
  }

  function addFootprintAABB(list, x, z, y, hx, hz, h) {
    list.push({ min: [x - hx, y, z - hz], max: [x + hx, y + h, z + hz] });
  }

  // --- village buildings along the roads ---
  const roads = _LAYOUT.roads;
  const junction = { x: 20, z: 73 };
  const candidates = [];
  for (const nodes of roads) {
    for (let i = 1; i < nodes.length - 1; i++) {
      const [nx, nz] = nodes[i];
      if (nx < v.x0 + 6 || nx > v.x1 - 6 || nz < v.z0 + 6 || nz > v.z1 - 6) continue;
      if (Math.hypot(nx - junction.x, nz - junction.z) < 22) continue; // keep the plaza open
      const tx = nodes[i + 1][0] - nodes[i - 1][0], tz = nodes[i + 1][1] - nodes[i - 1][1];
      const tl = Math.hypot(tx, tz);
      candidates.push({ x: nx, z: nz, tx: tx / tl, tz: tz / tl });
    }
  }
  const builders = [makeCottage, makeBarn, makeCottage, makeTower, makeCottage, makeRuin,
    makeCottage, makeBarn, makeCottage, makeCottage];
  let bi = 0;
  const placedB = [];
  for (const cand of candidates) {
    if (bi >= builders.length) break;
    for (const side of [-1, 1]) {
      if (bi >= builders.length) break;
      if (rng() < 0.25) continue;
      const lat = 10 + rng() * 4;
      const px = cand.x + -cand.tz * side * lat;
      const pz = cand.z + cand.tx * side * lat;
      if (px < v.x0 || px > v.x1 || pz < v.z0 || pz > v.z1) continue;
      if (heightField._roadDist(px, pz) < 7.5) continue;
      let clear = true;
      for (const pb of placedB) if (Math.hypot(px - pb.x, pz - pb.z) < pb.rr + 9) { clear = false; break; }
      if (!clear) continue;
      const rot = Math.atan2(cand.tx, cand.tz) + (rng() - 0.5) * 0.10;
      const tmp = { plaster: [], stone: [], roof: [], wood: [], dark: [], straw: [] };
      const info = builders[bi](rng, tmp, rng() < 0.75 ? 'plaster' : 'stone');
      const fit = groundFit(px, pz, info.w, info.d, rot);
      if (fit.spread > 1.7) continue;
      _quat.setFromAxisAngle(_upAxis, rot);
      _mat4.compose(_posv.set(px, fit.y + 0.05, pz), _quat, _one);
      mergeInto(buckets, tmp, _mat4);
      addFootprintAABB(obstacles, px, pz, fit.y, fit.hx, fit.hz, info.h);
      addFootprintAABB(colliders, px, pz, fit.y, fit.hx, fit.hz, info.h);
      buildingFeatures.push({ x: px, z: pz, w: info.w, d: info.d, rot });
      placedB.push({ x: px, z: pz, rr: Math.max(info.w, info.d) * 0.75 });
      bi++;
    }
  }

  // --- low stone walls (cover) — axis-aligned runs for tight AABBs ---
  function addWallRun(x0, z0, x1, z1, gapAt = -1) {
    const along = Math.hypot(x1 - x0, z1 - z0);
    const nSeg = Math.max(1, Math.round(along / 6));
    const dx = (x1 - x0) / nSeg, dz = (z1 - z0) / nSeg;
    for (let k = 0; k < nSeg; k++) {
      if (k === gapAt) continue;
      const cx = x0 + dx * (k + 0.5), cz = z0 + dz * (k + 0.5);
      if (heightField._roadDist(cx, cz) < 5.5) continue;
      const y = heightField.getHeightAt(cx, cz) - 0.15;
      const h = 1.0 + rng() * 0.25;
      const horizontal = Math.abs(dx) > Math.abs(dz);
      const len = Math.abs(horizontal ? dx : dz) * 0.96;
      const g = box(horizontal ? len : 0.45, h, horizontal ? 0.45 : len, 0.7);
      g.translate(cx, y + h / 2, cz);
      buckets.stone.push(g);
      const hx = (horizontal ? len : 0.45) / 2, hz = (horizontal ? 0.45 : len) / 2;
      obstacles.push({ min: [cx - hx, y, cz - hz], max: [cx + hx, y + h, cz + hz] });
      colliders.push({ min: [cx - hx, y, cz - hz], max: [cx + hx, y + h, cz + hz] });
    }
  }
  addWallRun(v.x0 + 4, 8, v.x0 + 4, 64, 2);
  addWallRun(v.x0 + 4, 8, v.x0 + 40, 8, 3);
  addWallRun(v.x1 - 6, 30, v.x1 - 6, 96, 4);
  addWallRun(-8, v.z1 - 10, 52, v.z1 - 10, 2);
  addWallRun(38, v.z0 + 6, 74, v.z0 + 6, 1);
  addWallRun(-44, 108, -10, 108, 0);

  // --- village well near the junction ---
  {
    let wx = junction.x + 9, wz = junction.z + 7;
    for (let i = 0; i < 20 && heightField._roadDist(wx, wz) < 6.5; i++) { wx += 2; wz += 1; }
    const wy = heightField.getHeightAt(wx, wz);
    const ring = new THREE.CylinderGeometry(1.0, 1.1, 0.9, 10, 1);
    scaleUV(ring, 3, 0.5);
    ring.translate(wx, wy + 0.45, wz);
    buckets.stone.push(ring);
    for (const s of [-1, 1]) {
      const post = box(0.14, 1.9, 0.14);
      post.translate(wx + s * 0.85, wy + 0.95, wz);
      buckets.wood.push(post);
    }
    const wroof = gablePrism(2.4, 0.7, 1.4);
    wroof.rotateY(Math.PI / 2);
    wroof.translate(wx, wy + 1.9, wz);
    buckets.roof.push(wroof);
    obstacles.push({ min: [wx - 1.1, wy, wz - 1.1], max: [wx + 1.1, wy + 2.6, wz + 1.1] });
    colliders.push({ min: [wx - 1.1, wy, wz - 1.1], max: [wx + 1.1, wy + 2.6, wz + 1.1] });
  }

  // --- hay bales + crates near buildings ---
  for (let i = 0; i < Math.min(5, placedB.length); i++) {
    const pb = placedB[i];
    const n = 1 + ((rng() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const a = rng() * Math.PI * 2, r = pb.rr + 2 + rng() * 4;
      const x = pb.x + Math.cos(a) * r, z = pb.z + Math.sin(a) * r;
      if (heightField._roadDist(x, z) < 4.5) continue;
      const y = heightField.getHeightAt(x, z);
      if (rng() < 0.5) {
        const bale = new THREE.CylinderGeometry(0.75, 0.75, 1.5, 12, 1);
        scaleUV(bale, 2, 1);
        bale.rotateZ(Math.PI / 2);
        bale.rotateY(rng() * Math.PI);
        bale.translate(x, y + 0.72, z);
        buckets.straw.push(bale);
      } else {
        const cs = 0.9 + rng() * 0.4;
        const crate = box(cs, cs, cs, 1.0);
        crate.rotateY(rng() * Math.PI * 0.5);
        crate.translate(x, y + cs / 2 - 0.04, z);
        buckets.wood.push(crate);
      }
    }
  }

  // --- rocks (instanced, 3 displaced-icosahedron variants) ---
  const rockGeos = [];
  for (let vi = 0; vi < 3; vi++) {
    const g = new THREE.IcosahedronGeometry(1, vi === 2 ? 2 : 1);
    const p = g.attributes.position;
    const vr = mulberry32(seed + 30 + vi);
    const tmpv = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      tmpv.set(p.getX(i), p.getY(i), p.getZ(i));
      const f = 1 + noi.noise3d(tmpv.x * 1.4 + vi * 9, tmpv.y * 1.4, tmpv.z * 1.4) * 0.34;
      tmpv.multiplyScalar(f);
      tmpv.y = Math.max(tmpv.y, -0.55);
      p.setXYZ(i, tmpv.x, tmpv.y * 0.82, tmpv.z);
    }
    g.computeVertexNormals();
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const l = 0.42 + vr() * 0.10 + p.getY(i) * 0.06;
      _col.setHSL(0.083, 0.05, clamp(l, 0.2, 0.62), THREE.SRGBColorSpace);
      col[i * 3] = _col.r; col[i * 3 + 1] = _col.g; col[i * 3 + 2] = _col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    rockGeos.push(g);
  }
  const rockPlacements = [[], [], []];
  for (let i = 0, placed = 0; i < 900 && placed < 120; i++) {
    const x = (rng() * 2 - 1) * 485, z = (rng() * 2 - 1) * 485;
    const vv = (rng() * 3) | 0;
    const yawR = rng() * Math.PI * 2;
    const sc = 0.5 + Math.pow(rng(), 1.6) * 2.1;
    if (x > v.x0 - 8 && x < v.x1 + 8 && z > v.z0 - 8 && z < v.z1 + 8) continue;
    if (heightField._roadDist(x, z) < 6) continue;
    if (heightField.getGroundType(x, z) === 'soft') continue;
    let nearSpawn = false;
    for (const s of [_LAYOUT.spawns.player, ..._LAYOUT.spawns.enemies]) {
      if (Math.hypot(x - s.x, z - s.z) < 16) { nearSpawn = true; break; }
    }
    if (nearSpawn) continue;
    const steep = heightField.getNormalAt(x, z).y < 0.93;
    if (!steep && rng() > 0.30) continue; // prefer rocky slopes
    const y = heightField.getHeightAt(x, z) - 0.22 * sc;
    _quat.setFromAxisAngle(_upAxis, yawR);
    _mat4.compose(_posv.set(x, y, z), _quat, new THREE.Vector3(sc, sc * (0.8 + rng() * 0.35), sc));
    rockPlacements[vv].push(_mat4.clone());
    if (sc >= 1.25) {
      const e = sc * 1.15;
      obstacles.push({ min: [x - e, y, z - e], max: [x + e, y + sc * 1.1, z + e] });
      colliders.push({ min: [x - e, y, z - e], max: [x + e, y + sc * 1.1, z + e] });
    }
    placed++;
  }
  for (let vi = 0; vi < 3; vi++) {
    if (rockPlacements[vi].length === 0) continue;
    const im = new THREE.InstancedMesh(rockGeos[vi], mats.rock, rockPlacements[vi].length);
    for (let i = 0; i < rockPlacements[vi].length; i++) im.setMatrixAt(i, rockPlacements[vi][i]);
    im.castShadow = true;
    im.receiveShadow = true;
    im.matrixAutoUpdate = false;
    im.computeBoundingSphere();
    group.add(im);
  }

  // --- merge buckets into one mesh per material ---
  for (const key of Object.keys(buckets)) {
    if (buckets[key].length === 0) continue;
    // mergeGeometries requires uniform indexing (ExtrudeGeometry is non-indexed)
    const merged = mergeGeometries(buckets[key].map((g) => (g.index ? g.toNonIndexed() : g)), false);
    const mesh = new THREE.Mesh(merged, mats[key]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }

  return { group, obstacles, colliders, features: { buildings: buildingFeatures } };
}
