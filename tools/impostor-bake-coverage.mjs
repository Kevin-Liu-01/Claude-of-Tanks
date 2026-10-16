#!/usr/bin/env node
// tools/impostor-bake-coverage.mjs — the far-tier impostor bake's crown coverage against the near tier's (trees Fix B,
// 2026-10-15; the ground lane's Kestrel trees plan, DEFECT 1 "Secondary").
//
// A CPU replica of treeImpostors.ts's atlas bake for one map: it records the ground ring's bake scene through a stub
// renderer and rasterises each row's capture (azimuth 0) exactly as BAKE_VERTEX / BAKE_FRAGMENT draw it: the leaf
// clusters turned toward the orthographic capture camera, the leaf atlas sampled trilinear with its anisotropic
// footprint at the pixel centre, the bake's mip coverage give-back, then the 0.38 cut, no MSAA. The same raster under
// the near material's laws (vegetation.ts mipAlphaGuard, the same cut) is what an in-border tree of that species
// shows at that screen size. Both are measured as crown fill: covered px / px inside the crown envelope (a disc
// closing of the near-law crown at four times the tile).
//
//   bake         the baked tile's crown fill (foliage), at the tile's own size
//   near         the near tier's crown fill at the same screen size (the tile's), under the near law
//   ratio        bake / near: the bake keeps the crown's coverage when this sits in 0.9–1.1
//   at[D]        the tree at D m (chase 60°, 1440 px tall): the near tier's silhouette (cards + trunk, near law) and
//                the far impostor's (the baked tile, box mips, trilinear, the impostor program's own give-back, its 0.5
//                cut). An impostor ratio well above 1 at 400–900 m is a far forest turning heavier than its trees.
//
// Fragments: the separate foliage pieces (8-connected) of the baked tile. The near tier's foliage textures upload with
// three's default flipY (v = 1 at the image's first row; treeGrowth.ts lays its spray tiles out so), and the sampler
// here reads them the same way.
//
//   node tools/impostor-bake-coverage.mjs                         # the default maps, a table
//   node tools/impostor-bake-coverage.mjs --maps=all --json=out.json
//   node tools/impostor-bake-coverage.mjs --maps=airfield --bake-boost=0   # main's bake before Fix B (no give-back)
//   options: --maps=a,b|all  --distances=300,450,600,900  --bake-boost=<per mip>  --bake-max=<mip cap>  --json=<path>
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import * as THREE from 'three';
import { createHeightField } from '../src/world/terrain.ts';
import { createVegetation } from '../src/world/vegetation.ts';
import { MAP_IDS, getMapConfig } from '../src/world/maps/index.ts';
import { treeBiomeSlot } from '../src/world/treeBiomes.ts';
import {
  TREE_IMPOSTOR_ALPHA_TEST, TREE_IMPOSTOR_BAKE_ALPHA_TEST, TREE_IMPOSTOR_BAKE_MIP_BOOST, TREE_IMPOSTOR_BAKE_MIP_MAX,
  TREE_IMPOSTOR_MIP_BOOST, TREE_IMPOSTOR_MIP_MAX,
} from '../src/world/treeImpostors.ts';

/** The maps the default run measures: the four thin-needle atlases (pine, Aleppo pine, pinyon, red pine), the
 * longleaf, and the far-view gate's maps (Verdant, Autumn, Longleaf, Frontier). */
export const IMPOSTOR_COVERAGE_MAPS = Object.freeze(['airfield', 'orchard', 'skybridge', 'caldera', 'longleaf', 'verdant', 'autumn', 'frontier']);
export const IMPOSTOR_COVERAGE_DISTANCES = Object.freeze([300, 450, 600, 900]);
/** The screen the distances are measured on: a 60° vertical field of view on a 1440 px tall view. */
const VIEW_H = 1440, FOCAL = VIEW_H / (2 * Math.tan(Math.PI / 6));
/** The leaf atlas' anisotropy (vegetation.ts foliage textures). */
const LEAF_ANISOTROPY = 8;

/** The near material's mip coverage give-back, read from vegetation.ts (mipAlphaGuard's constants). */
export function readNearMipLaw(source = readFileSync(fileURLToPath(new URL('../src/world/vegetation.ts', import.meta.url)), 'utf8')) {
  const boost = /const MIP_ALPHA_BOOST = ([\d.]+);/.exec(source), max = /const MIP_ALPHA_MAX = ([\d.]+);/.exec(source);
  if (!boost || !max) throw new Error('impostor-bake-coverage: vegetation.ts mipAlphaGuard constants not found');
  return { boost: Number(boost[1]), max: Number(max[1]) };
}

// ---- the leaf atlas: alpha mip pyramids (box, as generateMipmap) and the trilinear anisotropic sample -------------
function pyramidOf(cache, texture) {
  let pyramid = cache.get(texture);
  if (pyramid) return pyramid;
  const image = texture.image;
  if (!image?.data || !(image.width > 0)) throw new Error('impostor-bake-coverage: a leaf atlas without pixel data');
  let w = image.width, h = image.height, a = new Float32Array(w * h);
  // flipY (three's default for a Texture): texel row t (v from the bottom) is the image's row h - 1 - t
  for (let t = 0; t < h; t++) for (let x = 0; x < w; x++) a[t * w + x] = image.data[((h - 1 - t) * w + x) * 4 + 3] / 255;
  pyramid = [{ w, h, a }];
  while (w > 1 || h > 1) {
    const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1), b = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      const x0 = Math.min(w - 1, 2 * x), x1 = Math.min(w - 1, 2 * x + 1), y0 = Math.min(h - 1, 2 * y), y1 = Math.min(h - 1, 2 * y + 1);
      b[y * nw + x] = (a[y0 * w + x0] + a[y0 * w + x1] + a[y1 * w + x0] + a[y1 * w + x1]) / 4;
    }
    pyramid.push({ w: nw, h: nh, a: b });
    w = nw; h = nh; a = b;
  }
  cache.set(texture, pyramid);
  return pyramid;
}
function bilinear(level, u, v, clampEdge = true) {
  const { w, h, a } = level;
  const x = u * w - 0.5, y = v * h - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const s = clampEdge
    ? (i, j) => a[Math.min(h - 1, Math.max(0, j)) * w + Math.min(w - 1, Math.max(0, i))]
    : (i, j) => (i < 0 || j < 0 || i >= w || j >= h) ? 0 : a[j * w + i];
  return (s(x0, y0) * (1 - fx) + s(x0 + 1, y0) * fx) * (1 - fy) + (s(x0, y0 + 1) * (1 - fx) + s(x0 + 1, y0 + 1) * fx) * fy;
}
function trilinear(pyramid, u, v, lod, clampEdge = true) {
  const top = pyramid.length - 1, l = Math.min(top, Math.max(0, lod));
  const l0 = Math.floor(l), l1 = Math.min(top, l0 + 1), f = l - l0;
  return bilinear(pyramid[l0], u, v, clampEdge) * (1 - f) + bilinear(pyramid[l1], u, v, clampEdge) * f;
}
/** The hardware's sample (anisotropic: the level of the major axis over the probe count) and the give-back's level
 * (the shader's isotropic 0.5·log2(max(|dx|², |dy|², 1))). */
function sampleLeafAlpha(pyramid, u, v, dudx, dvdx, dudy, dvdy) {
  const w0 = pyramid[0].w, h0 = pyramid[0].h;
  const lx = Math.hypot(dudx * w0, dvdx * h0), ly = Math.hypot(dudy * w0, dvdy * h0);
  const major = Math.max(lx, ly), minor = Math.max(1e-6, Math.min(lx, ly));
  const probes = Math.min(Math.ceil(major / minor), LEAF_ANISOTROPY);
  const lod = Math.max(0, Math.log2(Math.max(1e-6, major / probes)));
  const mip = Math.max(0, Math.log2(Math.max(1, major)));
  return { a: trilinear(pyramid, u, v, lod), mip };
}

// ---- the bake, recorded --------------------------------------------------------------------------------------------
function recordingRenderer() {
  const captures = [];
  let target = null;
  return {
    captures,
    getRenderTarget: () => target, setRenderTarget(t) { target = t; }, clear() {}, getClearColor: c => c,
    getClearAlpha: () => 1, setClearColor() {}, autoClear: true, shadowMap: { autoUpdate: true }, xr: { enabled: false },
    render(scene, camera) {
      let mode = -1;
      const meshes = [];
      scene.traverse((o) => {
        if (!o.isMesh) return;
        const u = o.material.uniforms;
        mode = u.uMode.value;
        meshes.push({ geometry: o.geometry, matrixWorld: o.matrixWorld.clone(), map: u.map.value, alphaTest: u.uAlphaTest.value,
          billboard: !!(o.material.defines && 'COT_BAKE_BILLBOARD' in o.material.defines), fragmentShader: o.material.fragmentShader });
      });
      if (mode === 0) captures.push({ camera: camera.clone(), meshes });
    },
  };
}

/** Build a map's vegetation with a recording renderer and bake its atlas: the library and the ground ring's capture. */
export function recordImpostorBake(mapId) {
  const savedDocument = globalThis.document, savedImageData = globalThis.ImageData;
  globalThis.ImageData = ImageData;
  globalThis.document = { createElement() { return createCanvas(1, 1); } };
  try {
    const cfg = getMapConfig(mapId);
    const field = createHeightField(1337, cfg);
    const renderer = recordingRenderer();
    const world = createVegetation(field, { renderer, setupShadowMaterial() {} }, 2001, cfg);
    const library = world._treeImpostors;
    if (!library) throw new Error(`impostor-bake-coverage: ${mapId} has no impostor library (mobile tier?)`);
    library.ensureBaked();
    const ground = renderer.captures[0];
    if (!ground) throw new Error(`impostor-bake-coverage: ${mapId}: no albedo capture recorded`);
    return { cfg, world, library, ground, captures: renderer.captures };
  } finally {
    if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument;
    if (savedImageData === undefined) delete globalThis.ImageData; else globalThis.ImageData = savedImageData;
  }
}

// ---- the raster ------------------------------------------------------------------------------------------------------
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _c = new THREE.Vector3(), _r = new THREE.Vector3();
/**
 * Rasterise row `row` (azimuth 0) of a capture into a res × res mask (res = the tile reproduces the bake; another res
 * is the near tier at that screen size). law: the mip give-back { boost, max } before the material's own cut.
 */
function rasterRow(state, row, res, law) {
  const { capture, width: W, height: H, tile, pyramids } = state;
  const cam = capture.camera;
  cam.updateMatrixWorld(true);
  const view = cam.matrixWorld.clone().invert(), proj = cam.projectionMatrix;
  const toCam = new THREE.Vector3(view.elements[2], view.elements[6], view.elements[10]);
  const foliage = new Uint8Array(res * res), trunk = new Uint8Array(res * res);
  const scale = res / tile, tx0 = 0, ty0 = row * tile;
  for (const m of capture.meshes) {
    // this copy's tile: its origin projects into azimuth 0's column and this row
    _v.set(0, 0, 0).applyMatrix4(m.matrixWorld).applyMatrix4(view).applyMatrix4(proj);
    const ox = (_v.x * 0.5 + 0.5) * W, oy = (_v.y * 0.5 + 0.5) * H;
    if (Math.floor(ox / tile) !== 0 || Math.floor(oy / tile) !== row) continue;
    const g = m.geometry, pos = g.getAttribute('position'), uv = g.getAttribute('uv');
    const axis = g.getAttribute('aAxis'), leaf = g.getAttribute('aLeaf'), card = g.getAttribute('aCard');
    const mvp = proj.clone().multiply(view).multiply(m.matrixWorld);
    const camModel = toCam.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(m.matrixWorld).transpose());
    const n = pos.count, P = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      _v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (m.billboard && axis) {
        _a.set(axis.getX(i), axis.getY(i), axis.getZ(i));
        if (_a.lengthSq() > 0.5) {
          _r.crossVectors(_a, camModel);
          const rl = _r.length();
          if (rl > 1e-4) {
            _c.set(card.getX(i), card.getY(i), card.getZ(i));
            _v.copy(_c).addScaledVector(_r, leaf.getX(i) / rl).addScaledVector(_a, leaf.getY(i));
            _v.y -= leaf.getZ(i);
          }
        }
      }
      _v.applyMatrix4(mvp);
      P[i * 2] = ((_v.x * 0.5 + 0.5) * W - tx0) * scale;
      P[i * 2 + 1] = ((_v.y * 0.5 + 0.5) * H - ty0) * scale;
    }
    const isFoliage = m.alphaTest > 0;
    const pyramid = isFoliage ? pyramidOf(pyramids, m.map) : null;
    const idx = g.index ? g.index.array : null, tris = idx ? idx.length / 3 : n / 3;
    for (let t = 0; t < tris; t++) {
      const i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
      const x0 = P[i0 * 2], y0 = P[i0 * 2 + 1], x1 = P[i1 * 2], y1 = P[i1 * 2 + 1], x2 = P[i2 * 2], y2 = P[i2 * 2 + 1];
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (Math.abs(area) < 1e-9) continue;
      const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(res - 1, Math.ceil(Math.max(x0, x1, x2)));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(res - 1, Math.ceil(Math.max(y0, y1, y2)));
      if (minX > maxX || minY > maxY) continue;
      let u0 = 0, v0 = 0, u1 = 0, v1 = 0, u2 = 0, v2 = 0, dudx = 0, dvdx = 0, dudy = 0, dvdy = 0;
      if (isFoliage) {
        u0 = uv.getX(i0); v0 = uv.getY(i0); u1 = uv.getX(i1); v1 = uv.getY(i1); u2 = uv.getX(i2); v2 = uv.getY(i2);
        // the orthographic capture: affine gradients per pixel
        dudx = ((u1 - u0) * (y2 - y0) - (u2 - u0) * (y1 - y0)) / area;
        dudy = ((u2 - u0) * (x1 - x0) - (u1 - u0) * (x2 - x0)) / area;
        dvdx = ((v1 - v0) * (y2 - y0) - (v2 - v0) * (y1 - y0)) / area;
        dvdy = ((v2 - v0) * (x1 - x0) - (v1 - v0) * (x2 - x0)) / area;
      }
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) / area;
        const w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const k = y * res + x;
        if (!isFoliage) { trunk[k] = 1; continue; }
        if (foliage[k]) continue;
        const s = sampleLeafAlpha(pyramid, w0 * u0 + w1 * u1 + w2 * u2, w0 * v0 + w1 * v1 + w2 * v2, dudx, dvdx, dudy, dvdy);
        if (s.a * (1 + Math.min(s.mip, law.max) * law.boost) >= m.alphaTest) foliage[k] = 1;
      }
    }
  }
  return { foliage, trunk };
}

// ---- measures --------------------------------------------------------------------------------------------------------
function fragmentsOf(mask, res) {
  const seen = new Uint8Array(res * res), stack = [];
  let count = 0;
  for (let i = 0; i < res * res; i++) {
    if (!mask[i] || seen[i]) continue;
    count++; stack.push(i); seen[i] = 1;
    while (stack.length) {
      const k = stack.pop(), x = k % res, y = (k / res) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= res || ny >= res) continue;
        const j = ny * res + nx;
        if (mask[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
  }
  return count;
}
/** The crown envelope: a disc closing (dilate, then erode) of the reference mask. */
function envelopeOf(mask, res, r) {
  const dil = new Uint8Array(res * res), out = new Uint8Array(res * res), offs = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) offs.push([dx, dy]);
  for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
    if (!mask[y * res + x]) continue;
    for (const [dx, dy] of offs) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < res && ny < res) dil[ny * res + nx] = 1; }
  }
  for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
    let all = 1;
    for (const [dx, dy] of offs) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= res || ny >= res || !dil[ny * res + nx]) { all = 0; break; } }
    out[y * res + x] = all;
  }
  return out;
}
function resample(mask, res, to) {
  const out = new Uint8Array(to * to);
  for (let y = 0; y < to; y++) for (let x = 0; x < to; x++) out[y * to + x] = mask[Math.floor((y + 0.5) * res / to) * res + Math.floor((x + 0.5) * res / to)];
  return out;
}
function union(a, b) { const out = new Uint8Array(a.length); for (let i = 0; i < a.length; i++) out[i] = a[i] | b[i]; return out; }
function fillOf(mask, envelope) {
  let inside = 0, covered = 0;
  for (let i = 0; i < mask.length; i++) if (envelope[i]) { inside++; if (mask[i]) covered++; }
  return covered / Math.max(1, inside);
}
/** The far impostor drawn res px tall: the baked tile's coverage with box mips, sampled trilinear at the pixel centre,
 * the impostor program's give-back on the tile's texel footprint, its own cut (treeImpostors.ts applyTreeImpostorProgram). */
function impostorAt(tileMask, tile, res) {
  const pyramid = [{ w: tile, h: tile, a: Float32Array.from(tileMask) }];
  for (let w = tile; w > 1;) {
    const prev = pyramid[pyramid.length - 1], nw = w >> 1, b = new Float32Array(nw * nw);
    for (let y = 0; y < nw; y++) for (let x = 0; x < nw; x++) {
      b[y * nw + x] = (prev.a[2 * y * w + 2 * x] + prev.a[2 * y * w + 2 * x + 1] + prev.a[(2 * y + 1) * w + 2 * x] + prev.a[(2 * y + 1) * w + 2 * x + 1]) / 4;
    }
    pyramid.push({ w: nw, h: nw, a: b });
    w = nw;
  }
  const mip = Math.max(0, Math.log2(tile / res));
  const giveBack = 1 + Math.min(mip, TREE_IMPOSTOR_MIP_MAX) * TREE_IMPOSTOR_MIP_BOOST;
  const out = new Uint8Array(res * res);
  for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
    out[y * res + x] = trilinear(pyramid, (x + 0.5) / res, (y + 0.5) / res, mip, false) * giveBack >= TREE_IMPOSTOR_ALPHA_TEST ? 1 : 0;
  }
  return out;
}

const round = (x, d = 3) => +x.toFixed(d);

/**
 * Per ground row of a map's atlas: the baked crown fill under the bake law against the near tier's at the tile's own
 * screen size, and the near tier's and the far impostor's silhouettes at the given distances.
 */
export function measureImpostorBakeCoverage(mapId, options = {}) {
  const distances = options.distances ?? IMPOSTOR_COVERAGE_DISTANCES;
  const nearLaw = options.nearLaw ?? readNearMipLaw();
  const bakeLaw = options.bakeLaw ?? { boost: TREE_IMPOSTOR_BAKE_MIP_BOOST, max: TREE_IMPOSTOR_BAKE_MIP_MAX };
  const recorded = options.recorded ?? recordImpostorBake(mapId);
  const { library, ground } = recorded;
  const tile = library.tile;
  const state = { capture: ground, width: library.width, height: library.height, tile, pyramids: new Map() };
  const rows = [];
  for (let row = 0; row < library.groundRows; row++) {
    const meta = library.rows[row];
    const form = treeBiomeSlot(mapId, meta.species)?.form ?? meta.species;
    // the crown envelope: the near law at four times the tile, closed
    const refRes = tile * 4;
    const envRef = envelopeOf(rasterRow(state, row, refRes, nearLaw).foliage, refRes, 6);
    const envTile = resample(envRef, refRes, tile);
    const baked = rasterRow(state, row, tile, bakeLaw);
    const nearTile = rasterRow(state, row, tile, nearLaw);
    const bake = fillOf(baked.foliage, envTile), near = fillOf(nearTile.foliage, envTile);
    const entry = {
      map: mapId, species: meta.species, form, variant: meta.variant, cellM: round(meta.cellM, 2), tile,
      bake: round(bake), near: round(near), ratio: round(bake / Math.max(1e-6, near)),
      fragments: { bake: fragmentsOf(baked.foliage, tile), near: fragmentsOf(nearTile.foliage, tile) }, at: {},
    };
    const bakedTile = union(baked.foliage, baked.trunk);
    for (const d of distances) {
      const res = Math.max(8, Math.round(FOCAL * meta.cellM / d));
      const env = resample(envRef, refRes, res);
      const nearD = rasterRow(state, row, res, nearLaw);
      const nearFill = fillOf(union(nearD.foliage, nearD.trunk), env), impFill = fillOf(impostorAt(bakedTile, tile, res), env);
      entry.at[d] = { px: res, near: round(nearFill), impostor: round(impFill), ratio: round(impFill / Math.max(1e-6, nearFill)) };
    }
    rows.push(entry);
  }
  return { map: mapId, tile, groundRows: library.groundRows, bakeLaw, nearLaw, rows };
}

// ---- the command line ------------------------------------------------------------------------------------------------
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (name) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const mapsArg = arg('maps');
  const maps = !mapsArg ? IMPOSTOR_COVERAGE_MAPS : mapsArg === 'all' ? MAP_IDS : mapsArg.split(',');
  const distances = arg('distances') ? arg('distances').split(',').map(Number) : IMPOSTOR_COVERAGE_DISTANCES;
  const bakeLaw = { boost: arg('bake-boost') !== undefined ? Number(arg('bake-boost')) : TREE_IMPOSTOR_BAKE_MIP_BOOST,
    max: arg('bake-max') !== undefined ? Number(arg('bake-max')) : TREE_IMPOSTOR_BAKE_MIP_MAX };
  const nearLaw = readNearMipLaw();
  const reports = [];
  console.log(`bake law: give-back ${bakeLaw.boost}/mip to ${bakeLaw.max}, cut ${TREE_IMPOSTOR_BAKE_ALPHA_TEST}; near law ${nearLaw.boost}/mip to ${nearLaw.max}; impostor ${TREE_IMPOSTOR_MIP_BOOST}/mip to ${TREE_IMPOSTOR_MIP_MAX}, cut ${TREE_IMPOSTOR_ALPHA_TEST}`);
  console.log(['map', 'form/v', 'tile', 'bake', 'near', 'ratio', 'frag b/n', ...distances.map(d => `${d}m imp/near`)].join('\t'));
  for (const id of maps) {
    if (!getMapConfig(id).vegetation.species.length) continue;
    let report;
    try { report = measureImpostorBakeCoverage(id, { distances, bakeLaw, nearLaw }); } catch (error) { console.log(`${id}\t(skipped: ${error.message})`); continue; }
    reports.push(report);
    for (const r of report.rows) {
      console.log([id, `${r.form}/${r.variant}`, r.tile, r.bake, r.near, r.ratio, `${r.fragments.bake}/${r.fragments.near}`,
        ...distances.map(d => `${r.at[d].impostor}/${r.at[d].near}=${r.at[d].ratio}`)].join('\t'));
    }
  }
  const json = arg('json');
  if (json) writeFileSync(json, JSON.stringify({ bakeLaw, nearLaw, distances, reports }, null, 1));
}
