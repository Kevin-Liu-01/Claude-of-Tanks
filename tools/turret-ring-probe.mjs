#!/usr/bin/env node
// Claude of Tanks — turret-ring probe (tank-opt RING stream, 2026-10-16; the ring re-verify's counterexamples).
// Copyright © 2026 Kevin B. Liu. Created, designed and directed by Kevin B. Liu. Reserved Content
// (LicenseRef-Claude-of-Tanks-Proprietary-Content-1.0; LICENSE-POLICY.md, NOTICE.md). Claude was a development tool for
// this file, not an author. provenance: urn:claude-of-tanks:tool:turret-ring-probe
//
// An independent CPU orthographic z-buffer (no Raycaster) on the builds the game uses — the player's (HIGH geometry),
// every bot's and mobile tank's (LOW), the gallery's — with the burn hook's vertex dents applied on the CPU as the shader
// applies them (per vertex, hull-frame meshes carrying this visual's burn material) at the wreck's own dent share:
//   live     at the kill, half way through the dents' ramp and settled (setDestroyed ageS 0 / 0.175 / 1000, so the plate
//            and the hull are compared at one share), the hull standing over the plate's race and opening (strict and
//            by more than 1 cm); synthetic dents the planner can make (a roof dent near the rim, the same climbing, a
//            side corner's climbing shear) and, with --stress, the deepest it makes (0.28 m) tight and wide round the ring
//            pushing in flat and climbing — each capped round the race as the planner caps it (capTurretRingDents; with
//            --uncapped, as asked), joined to the wreck's own plan and cut and plated for it as a kill cuts (with
//            --no-recut, on the kill's own cut) through the runtime's own plate law (turretRingPlateDents); the exterior
//            from 80 directions against the same wreck with its hull's meshes back on their geometry, both with the wreck's
//            settled dents (a pixel deeper by 2 cm whose first hit is not the plate is a hole the cut opened, unless it is
//            the dents' own reshaping: see below); with the player's build, the exterior's guard; the lifecycle and
//            fingerprint;
//   hulk     the cook-off hulk against its ring:false twin: the placement budget, the top view over the opening, and the
//            exterior from 80 directions (a pixel deeper by 3 cm that never passed through the opening: a hole).
//
// The live exterior and its dents (release 240). The cut moves the new corners it gives a long face past the live dent
// zone (turretRingWell.ts placeForDents, rimR + LIVE_ZONE_M) so that, dented, they land on the plane the face's own
// corners bend to; inside the zone its split faces follow the dent field by design. Rasterised without dents (as this
// pass first was), the cut wreck therefore differs from the uncut one by that compensation wherever a split face lies:
// vt4a1 counted 19 735 "hole" pixels at dent share 0 and the same 19 735 at share 1, and its flagged deck face, cut
// alone, keeps its whole area (0 of 1 891 samples outside the prism lost) — no opening, the compensation measured
// undented. With both rasters dented (as the coverage passes are), seed 4242 counts 0, and seed 77 keeps 2-4 cm of
// reshaping about 1.7 m out, where a long deck face reaches into the zone and bends with the field there. So a pixel no
// more than EXT_TOL_M deeper whose first hit is on the same mesh as the uncut wreck's, within EXT_TOL_R_M of the rim
// (LIVE_ZONE_M + 0.3), is that reshaping and not counted. The guard keeps the tolerance from hiding a real hole: a
// GUARD_HALF_M-square opening cut through the deck inside that radius, and one outside it, must each add more than
// GATE_EXT_PX hole pixels over the player's wreck without them, or --gate fails.
//
// The cut's reshaping (243). Within the zone the cut's corners follow the field and past it they lie on their face's own
// dented plane, so a long face's pieces carry the zone's reshaping out along them (vt4a1 seed 77: 2.7 m out), and a
// grazing view reads a sag of a few cm as many cm deeper (5 deg down: 2 cm reads 23 cm): 7 340 of its pixels, none of
// them an opening (the trace: the same deck, lower). So the exterior also lets a pixel pass when the cut wreck still has a
// face of the mesh the eye saw, facing the same way, along that face's normal within the most the cut can move that face
// (reshapeBound: the field's departure from the face's dented plane over its part inside the zone, sampled; 0 for a face
// clear of the zone or undented, so a crack anywhere else still counts), and reports what is left by kind: see-through
// inside the wreck's outline, see-through at it (the outline receded: a pixel both rasters see past within
// SILHOUETTE_PX), and a deeper hit. The guard's openings must still count, and do (vt4a1: 194 / 216 px).
//
//   node tools/turret-ring-probe.mjs --ids=t90m_proryv,t72b3 [--seeds=77,4242,9001] [--stress] [--uncapped] [--no-recut] [--no-live] [--no-hulk]
//        [--receipts=<receipts.json>] [--render=<dir>] [--far-samples=<n>] --out=<rows.jsonl> [--gate]
import * as THREE from 'three';
import { uniqueIds } from './id-list.mjs';
import { appendFileSync } from 'node:fs';

await import('./tank-surface-collect.mjs');
const { TANK_SPECS } = await import('../src/vehicles/specs.ts');
const { ensureInteriorFills, closedInteriorFillGeometry } = await import('../src/vehicles/interiorFills.ts');
const { geometryFingerprint } = await import('../src/vehicles/tankAssets.ts');
const { bakeTankWreck } = await import('../src/world/wrecks.ts');
const { collectWreckSolids } = await import('../src/world/wreckCollision.ts');
const { createTank, ensureTankBuilder } = await import('../src/vehicles/fleetFactory.ts');
const { turretRingPlateDents, turretRingDentShare, capTurretRingDents, createTurretRingPresentation } = await import('../src/vehicles/turretRingWell.ts');
const { getSpec } = await import('../src/vehicles/specs.ts');
const { combatAnatomyCalibration, registerCombatAnatomyCalibrations } = await import('../src/vehicles/combatAnatomyCalibrationRegistry.ts');
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, fallback = '') => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const ids = uniqueIds(opt('ids').split(',').filter(Boolean), 'turret-ring-probe --ids');
const OUT = opt('out');
const SEEDS = opt('seeds', '77,4242,9001').split(',').map(Number);
const SKIP_HULK = args.includes('--no-hulk');
const STRESS = args.includes('--stress');
// (246) synthetic dents as the planner leaves them: capTurretRingDents holds each one's field on the race's rim to 3 cm
const UNCAPPED = args.includes('--uncapped');
// (246) each synthetic dent joins the wreck's own plan, and the hull is cut and plated for that plan as a kill cuts it
// (at shares 0, 0.5 and 1, the worst kept). With --no-recut, as through 244: the dent alone on the cut the kill placed
// for its own plan, whose corners near the rim sit pre-placed for dents the check leaves out
const RECUT = !args.includes('--no-recut');
const SKIP_LIVE = args.includes('--no-live');
const RENDER = opt('render');
const FAR_SAMPLES = Number(opt('far-samples', '0'));
const { createCanvas } = await import('@napi-rs/canvas');
const { writeFileSync } = await import('node:fs');

/** Shade a raster (front faces, Lambert on a fixed light) into an RGBA buffer; no hit = magenta. */
function shade(view, R, T, img, x0, width) {
  const L = new THREE.Vector3(0.4, 0.8, 0.45).normalize();
  for (let p = 0; p < R.zFront.length; p++) {
    const i = p % view.n, j = (p / view.n) | 0;
    const o = ((view.n - 1 - j) * width + x0 + i) * 4;
    const t = R.triFront[p];
    if (t < 0) { img[o] = 255; img[o + 1] = 0; img[o + 2] = 255; img[o + 3] = 255; continue; }
    const P = T.pos, q = t * 9;
    const e1 = [P[q + 3] - P[q], P[q + 4] - P[q + 1], P[q + 5] - P[q + 2]], e2 = [P[q + 6] - P[q], P[q + 7] - P[q + 1], P[q + 8] - P[q + 2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (T.flags[t] & 16) { nx = -nx; ny = -ny; nz = -nz; }
    if ((T.flags[t] & 1) && nx * view.d.x + ny * view.d.y + nz * view.d.z > 0) { nx = -nx; ny = -ny; nz = -nz; }
    const k = 0.25 + 0.75 * Math.max(0, nx * L.x + ny * L.y + nz * L.z);
    const back = R.backAny[p] && R.zAny[p] < R.zFront[p] - 0.005;
    img[o] = back ? 255 : 200 * k; img[o + 1] = back ? 140 * k : 200 * k; img[o + 2] = back ? 0 : 190 * k; img[o + 3] = 255;
  }
}
function renderPair(path, view, A, TA, B, TB) {
  const w = view.n * 2 + 4, h = view.n;
  const canvas = createCanvas(w, h), ctx = canvas.getContext('2d');
  const data = ctx.createImageData(w, h);
  shade(view, A, TA, data.data, 0, w);
  shade(view, B, TB, data.data, view.n + 4, w);
  ctx.putImageData(data, 0, 0);
  writeFileSync(path, canvas.toBuffer('image/png'));
}
const RECEIPTS = opt('receipts') ? JSON.parse(readFileSync(opt('receipts'), 'utf8')).receipts : null;

const BUILDS = {
  // the player's own tank on desktop (rosterState battleGeometryQuality: playerActor && !mobile)
  player: (camoSeed) => ({ camoSeed, quality: 'low', geometryQuality: 'high', batchStatic: true, battleDetailLod: false, eraVisualBindingReceipt: false }),
  // every battle bot, and every tank on mobile
  bot: (camoSeed) => ({ camoSeed, quality: 'low', geometryQuality: 'low', batchStatic: true, battleDetailLod: true, eraVisualBindingReceipt: false }),
  // the gallery / Studio / garage style build (no static batching)
  gallery: (camoSeed) => ({ camoSeed, quality: 'high' }),
};

// ------------------------------------------------------------------------------------------------ triangle collection
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _m = new THREE.Matrix4(), _im = new THREE.Matrix4();

function drawnMaterial(material) {
  if (!material || material.visible === false || material.colorWrite === false) return false;
  if (material.transparent && (material.opacity ?? 1) < 0.98) return false;
  if (material.alphaTest > 0) return false;
  return true;
}

function sameFrame(a, b) {
  const x = a.elements, y = b.elements;
  for (let i = 0; i < 16; i++) if (Math.abs(x[i] - y[i]) >= 1e-4) return false;
  return true;
}

/** World triangles of every drawn mesh under `owner` (skip subtrees in `skip`), LOD level 0, instanced expanded.
 *  dent: {burnU, hullWorld} applies the burn hook's vertex dent (crK = 1) to hull-frame meshes with that burn material. */
function collect(owner, skip, dent = null, filter = () => true) {
  const share = dent?.share ?? 1;
  owner.updateMatrixWorld(true);
  const out = { pos: [], flags: [], names: [] }; // flags: bit0 twoSided, bit1 interiorFill, bit2 instanced, bit3 dented
  const stack = [owner];
  while (stack.length) {
    const o = stack.pop();
    if (skip.has(o) || o.visible === false) continue;
    if (o.isLOD && o.levels?.length) { stack.push(o.levels[0].object); continue; }
    for (let i = o.children.length - 1; i >= 0; i--) stack.push(o.children[i]);
    if (!o.isMesh || o.isBatchedMesh || !o.geometry?.getAttribute('position')) continue;
    if (o.userData.authoredShadowProxy || o.userData.vehicleMarking) continue;
    if (!filter(o)) continue;
    const geo = o.geometry, pos = geo.getAttribute('position'), index = geo.index;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const groups = Array.isArray(o.material) && geo.groups.length ? geo.groups : [{ start: 0, count: index ? index.count : pos.count, materialIndex: 0 }];
    const instances = o.isInstancedMesh ? o.count : 1;
    let dents = null;
    if (dent && !o.isInstancedMesh && sameFrame(o.matrixWorld, dent.hullWorld) && mats.some((m) => m?.userData?.__burnU === dent.burnU)) {
      dents = dent.list;
    }
    for (let inst = 0; inst < instances; inst++) {
      if (o.isInstancedMesh) { o.getMatrixAt(inst, _im); _m.multiplyMatrices(o.matrixWorld, _im); } else _m.copy(o.matrixWorld);
      const flip = _m.determinant() < 0;
      for (const g of groups) {
        const mat = mats[g.materialIndex ?? 0] ?? mats[0];
        if (!drawnMaterial(mat)) continue;
        const two = mat.side === THREE.DoubleSide;
        const end = Math.min(g.start + g.count, index ? index.count : pos.count);
        for (let k = g.start; k + 2 < end; k += 3) {
          const i0 = index ? index.getX(k) : k, i1 = index ? index.getX(k + 1) : k + 1, i2 = index ? index.getX(k + 2) : k + 2;
          const vs = [_a.fromBufferAttribute(pos, i0), _b.fromBufferAttribute(pos, i1), _c.fromBufferAttribute(pos, i2)];
          const rest = dents ? [_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _c.x, _c.y, _c.z] : null;
          for (const v of vs) {
            if (dents) {
              let dx = 0, dy = 0, dz = 0;
              for (const d of dents) {
                const ex = v.x - d.cx, ey = v.y - d.cy, ez = v.z - d.cz, r2 = ex * ex + ey * ey + ez * ez;
                if (r2 >= d.r2) continue;
                const q = 1 - r2 / d.r2;
                dx += d.dx * q * q * d.depth; dy += d.dy * q * q * d.depth; dz += d.dz * q * q * d.depth;
              }
              v.x += dx * share; v.y += dy * share; v.z += dz * share;
            }
            v.applyMatrix4(_m);
          }
          out.pos.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _c.x, _c.y, _c.z);
          (out.rest ??= [])[out.flags.length] = rest;
          out.flags.push((two ? 1 : 0) | (o.userData.interiorFill ? 2 : 0) | (o.isInstancedMesh ? 4 : 0) | (dents ? 8 : 0) | (flip ? 16 : 0));
          out.names.push(o.name || '?');
        }
      }
    }
  }
  if (dent) out.dent = { list: dent.list, share };
  return out;
}

function geometryTris(geometry, matrix, flagBits = 0) {
  const out = { pos: [], flags: [] };
  const pos = geometry.getAttribute('position'), index = geometry.index;
  const count = index ? index.count : pos.count;
  const flip = matrix.determinant() < 0;
  for (let k = 0; k + 2 < count; k += 3) {
    const i0 = index ? index.getX(k) : k, i1 = index ? index.getX(k + 1) : k + 1, i2 = index ? index.getX(k + 2) : k + 2;
    _a.fromBufferAttribute(pos, i0).applyMatrix4(matrix);
    _b.fromBufferAttribute(pos, i1).applyMatrix4(matrix);
    _c.fromBufferAttribute(pos, i2).applyMatrix4(matrix);
    out.pos.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _c.x, _c.y, _c.z);
    out.flags.push(flagBits | (flip ? 16 : 0));
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the rasteriser
/** An orthographic view looking along `dir` through `centre`, a square of 2·half metres at `res` m per pixel. */
function makeView(dir, centre, half, res) {
  const d = dir.clone().normalize();
  const a = Math.abs(d.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(d, a).normalize();
  const v = new THREE.Vector3().crossVectors(u, d).normalize();
  const n = Math.ceil((2 * half) / res);
  return { d, u, v, c: centre.clone(), half, res, n };
}

/** Rasterise triangles: per pixel the nearest front face's depth (and its triangle) and the nearest face of either side. */
function raster(view, tris) {
  const { d, u, v, c, half, res, n } = view;
  const zFront = new Float64Array(n * n).fill(Infinity), triFront = new Int32Array(n * n).fill(-1);
  const zAny = new Float64Array(n * n).fill(Infinity), backAny = new Uint8Array(n * n);
  const P = tris.pos, F = tris.flags;
  const pu = [0, 0, 0], pv = [0, 0, 0], pz = [0, 0, 0];
  for (let t = 0; t < F.length; t++) {
    const o = t * 9;
    for (let k = 0; k < 3; k++) {
      const x = P[o + 3 * k] - c.x, y = P[o + 3 * k + 1] - c.y, z = P[o + 3 * k + 2] - c.z;
      pu[k] = x * u.x + y * u.y + z * u.z; pv[k] = x * v.x + y * v.y + z * v.z; pz[k] = x * d.x + y * d.y + z * d.z;
    }
    const minU = Math.min(pu[0], pu[1], pu[2]), maxU = Math.max(pu[0], pu[1], pu[2]);
    const minV = Math.min(pv[0], pv[1], pv[2]), maxV = Math.max(pv[0], pv[1], pv[2]);
    if (maxU < -half || minU > half || maxV < -half || minV > half) continue;
    // world winding normal vs view direction: front if n·d < 0 (flip for a mirrored matrix)
    const e1x = P[o + 3] - P[o], e1y = P[o + 4] - P[o + 1], e1z = P[o + 5] - P[o + 2];
    const e2x = P[o + 6] - P[o], e2y = P[o + 7] - P[o + 1], e2z = P[o + 8] - P[o + 2];
    let nd = (e1y * e2z - e1z * e2y) * d.x + (e1z * e2x - e1x * e2z) * d.y + (e1x * e2y - e1y * e2x) * d.z;
    if (F[t] & 16) nd = -nd;
    const two = F[t] & 1;
    const front = two || nd < 0;
    const area = (pu[1] - pu[0]) * (pv[2] - pv[0]) - (pu[2] - pu[0]) * (pv[1] - pv[0]);
    if (Math.abs(area) < 1e-14) continue;
    const i0 = Math.max(0, Math.floor((minU + half) / res)), i1 = Math.min(n - 1, Math.floor((maxU + half) / res));
    const j0 = Math.max(0, Math.floor((minV + half) / res)), j1 = Math.min(n - 1, Math.floor((maxV + half) / res));
    for (let j = j0; j <= j1; j++) {
      const sv = -half + (j + 0.5) * res;
      for (let i = i0; i <= i1; i++) {
        const su = -half + (i + 0.5) * res;
        const w0 = ((pu[1] - su) * (pv[2] - sv) - (pu[2] - su) * (pv[1] - sv)) / area;
        const w1 = ((pu[2] - su) * (pv[0] - sv) - (pu[0] - su) * (pv[2] - sv)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-9 || w1 < -1e-9 || w2 < -1e-9) continue;
        const z = w0 * pz[0] + w1 * pz[1] + w2 * pz[2];
        const p = j * n + i;
        if (front && z < zFront[p]) { zFront[p] = z; triFront[p] = t; }
        if (z < zAny[p]) { zAny[p] = z; backAny[p] = front ? 0 : 1; }
      }
    }
  }
  return { zFront, triFront, zAny, backAny };
}

const pixelPoint = (view, p, z) => {
  const i = p % view.n, j = (p / view.n) | 0;
  const su = -view.half + (i + 0.5) * view.res, sv = -view.half + (j + 0.5) * view.res;
  return view.c.clone().addScaledVector(view.u, su).addScaledVector(view.v, sv).addScaledVector(view.d, z);
};

const r4 = (x) => Math.round(x * 1e4) / 1e4;

function readDents(root) {
  let burnU = null;
  root.traverse((o) => {
    if (burnU || !o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m?.userData?.__burnU) { burnU = m.userData.__burnU; break; }
  });
  if (!burnU || !burnU.uCrOn.value) return { burnU, list: [] };
  const list = [];
  for (let i = 0; i < burnU.uCrHull.value.length; i++) {
    const c = burnU.uCrHull.value[i], dd = burnU.uCrHullDir.value[i];
    if (c.w > 0) list.push({ cx: c.x, cy: c.y, cz: c.z, r2: c.w, dx: dd.x, dy: dd.y, dz: dd.z, depth: dd.w });
  }
  return { burnU, list };
}

// ------------------------------------------------------------------------------------------------ the live wreck
const SHARE_AGES = [0, 0.175, 1000];
// the live exterior's tolerance and its guard (see the header)
const LIVE_ZONE_M = 0.36;                                    // turretRingWell.ts LIVE_ZONE_M
const EXT_TOL_M = 0.05, EXT_TOL_R_M = LIVE_ZONE_M + 0.3;
const GUARD_HALF_M = 0.03, GATE_EXT_PX = 20;
// a see-through pixel this near (px) a pixel both rasters see past: the cut wreck's outline receded there
const SILHOUETTE_PX = 3;

/** A convex polygon's part (flat xyz) on one side of the vertical plane x (axis 0) or z (axis 2) = value, or null. */
function clipAxis(poly, axis, value, keepLess) {
  const out = [], n = poly.length / 3;
  for (let i = 0; i < n; i++) {
    const a = i * 3, b = ((i + 1) % n) * 3;
    const da = keepLess ? value - poly[a + axis] : poly[a + axis] - value;
    const db = keepLess ? value - poly[b + axis] : poly[b + axis] - value;
    if (da >= 0) out.push(poly[a], poly[a + 1], poly[a + 2]);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      for (let k = 0; k < 3; k++) out.push(poly[a + k] + t * (poly[b + k] - poly[a + k]));
    }
  }
  return out.length >= 9 ? out : null;
}

/** The guard's opening: the triangles with a square (hull frame x0..x1, z0..z1) cut out of every face wholly over yMin,
 *  that is through the deck, its fittings and whatever lies just under it. `removed`: the faces it opened. */
function carveOpening(tris, hullWorld, box) {
  const inv = hullWorld.clone().invert(), out = { pos: [], flags: [], names: [] }, v = new THREE.Vector3();
  let removed = 0;
  for (let t = 0; t < tris.flags.length; t++) {
    const o = t * 9, local = [];
    for (let k = 0; k < 3; k++) { v.set(tris.pos[o + 3 * k], tris.pos[o + 3 * k + 1], tris.pos[o + 3 * k + 2]).applyMatrix4(inv); local.push(v.x, v.y, v.z); }
    const xs = [local[0], local[3], local[6]], zs = [local[2], local[5], local[8]];
    if (Math.max(...xs) <= box.x0 || Math.min(...xs) >= box.x1 || Math.max(...zs) <= box.z0 || Math.min(...zs) >= box.z1
      || Math.min(local[1], local[4], local[7]) < box.yMin || tris.names[t] === 'PLATE') {
      for (let k = 0; k < 9; k++) out.pos.push(tris.pos[o + k]);
      out.flags.push(tris.flags[t]); out.names.push(tris.names[t]);
      continue;
    }
    removed++;
    const mid = clipAxis(local, 0, box.x0, false), core = mid && clipAxis(mid, 0, box.x1, true);
    const pieces = [clipAxis(local, 0, box.x0, true), clipAxis(local, 0, box.x1, false),
      core && clipAxis(core, 2, box.z0, true), core && clipAxis(core, 2, box.z1, false)];
    for (const poly of pieces) {
      if (!poly) continue;
      for (let i = 1; i + 1 < poly.length / 3; i++) {
        for (const j of [0, i, i + 1]) { v.set(poly[j * 3], poly[j * 3 + 1], poly[j * 3 + 2]).applyMatrix4(hullWorld); out.pos.push(v.x, v.y, v.z); }
        out.flags.push(tris.flags[t]); out.names.push(tris.names[t]);
      }
    }
  }
  return { tris: out, removed };
}

/** (243) How far the cut may reshape one dented face of the uncut wreck: its pieces' corners inside the live dent zone
 *  follow the field (its own, and those a neighbour's cut gives its edges), those past it lie on the face's own dented
 *  plane, and the pieces interpolate, so every point of them lies within the most the field departs from that plane
 *  over the face's part inside the zone (sampled: its inside and, finely, its edges). 0: a face the cut cannot reshape
 *  (undented, or clear of the zone). */
function reshapeBound(tris, t, seat) {
  const rest = tris.rest?.[t];
  if (!rest || !tris.dent) return 0;
  const bounds = (tris.bounds ??= new Map());
  if (bounds.has(t)) return bounds.get(t);
  const { list, share } = tris.dent, zone = seat.rimR + LIVE_ZONE_M + 0.01, N = 16;
  const field = (x, y, z, out) => {
    out[0] = out[1] = out[2] = 0;
    for (const d of list) {
      const ex = x - d.cx, ey = y - d.cy, ez = z - d.cz, r2 = ex * ex + ey * ey + ez * ez;
      if (r2 >= d.r2) continue;
      const q = 1 - r2 / d.r2, k = q * q * d.depth * share;
      out[0] += d.dx * k; out[1] += d.dy * k; out[2] += d.dz * k;
    }
    return out;
  };
  const fa = field(rest[0], rest[1], rest[2], [0, 0, 0]), fb = field(rest[3], rest[4], rest[5], [0, 0, 0]), fc = field(rest[6], rest[7], rest[8], [0, 0, 0]);
  const f = [0, 0, 0];
  let most = 0;
  // the face's inside (an N grid) and its edges, finely (a large face whose corner alone reaches the zone, and the
  // corners a neighbour's cut gives its edges)
  const samples = [];
  for (let i = 0; i <= N; i++) for (let j = 0; i + j <= N; j++) samples.push([i / N, j / N]);
  for (let k = 0; k <= 4 * N; k++) { const t = k / (4 * N); samples.push([t, 1 - t], [t, 0], [0, t]); }
  for (const [u, v] of samples) {
    const w = 1 - u - v;
    const x = u * rest[0] + v * rest[3] + w * rest[6], y = u * rest[1] + v * rest[4] + w * rest[7], z = u * rest[2] + v * rest[5] + w * rest[8];
    if (Math.hypot(x - seat.cx, z - seat.cz) > zone) continue;
    field(x, y, z, f);
    most = Math.max(most, Math.hypot(f[0] - (u * fa[0] + v * fb[0] + w * fc[0]), f[1] - (u * fa[1] + v * fb[1] + w * fc[1]), f[2] - (u * fa[2] + v * fb[2] + w * fc[2])));
  }
  bounds.set(t, most);
  return most;
}

/** The faces of a raster near a point (world frame, GRID_M cells), built once per raster. */
const GRID_M = 0.1;
const grids = new WeakMap();
function triangleGrid(tris) {
  let grid = grids.get(tris);
  if (grid) return grid;
  grid = new Map();
  const P = tris.pos;
  for (let t = 0; t < tris.flags.length; t++) {
    const o = t * 9;
    const lo = [0, 1, 2].map((c) => Math.floor(Math.min(P[o + c], P[o + 3 + c], P[o + 6 + c]) / GRID_M));
    const hi = [0, 1, 2].map((c) => Math.floor(Math.max(P[o + c], P[o + 3 + c], P[o + 6 + c]) / GRID_M));
    if ((hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1) > 4096) continue; // (a face metres across: never near a short segment's few cells alone)
    for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) {
      const key = `${i},${j},${k}`;
      let list = grid.get(key);
      if (!list) grid.set(key, list = []);
      list.push(t);
    }
  }
  grids.set(tris, grid);
  return grid;
}
const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _pv = new THREE.Vector3(), _tv = new THREE.Vector3(), _qv = new THREE.Vector3(), _nv = new THREE.Vector3();
/** Whether the segment a→b crosses a face of `tris` on mesh `name` facing along `n` (the reshaped surface the eye saw). */
function segmentMeetsSurface(tris, a, b, name, n) {
  const grid = triangleGrid(tris), P = tris.pos;
  const dir = b.clone().sub(a);
  const lo = [a.x, a.y, a.z].map((v, c) => Math.floor(Math.min(v, [b.x, b.y, b.z][c]) / GRID_M));
  const hi = [a.x, a.y, a.z].map((v, c) => Math.floor(Math.max(v, [b.x, b.y, b.z][c]) / GRID_M));
  const seen = new Set();
  for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) {
    for (const t of grid.get(`${i},${j},${k}`) ?? []) {
      if (seen.has(t) || tris.names[t] !== name) continue;
      seen.add(t);
      const o = t * 9;
      _e1.set(P[o + 3] - P[o], P[o + 4] - P[o + 1], P[o + 5] - P[o + 2]);
      _e2.set(P[o + 6] - P[o], P[o + 7] - P[o + 1], P[o + 8] - P[o + 2]);
      _nv.crossVectors(_e1, _e2);
      if (tris.flags[t] & 16) _nv.negate();
      if (!(tris.flags[t] & 1) && _nv.dot(n) <= 0) continue;
      // Möller–Trumbore on the segment
      _pv.crossVectors(dir, _e2);
      const det = _e1.dot(_pv);
      if (Math.abs(det) < 1e-14) continue;
      _tv.set(a.x - P[o], a.y - P[o + 1], a.z - P[o + 2]);
      const u = _tv.dot(_pv) / det;
      if (u < -1e-6 || u > 1 + 1e-6) continue;
      _qv.crossVectors(_tv, _e1);
      const v = dir.dot(_qv) / det;
      if (v < -1e-6 || u + v > 1 + 1e-6) continue;
      const s = _e2.dot(_qv) / det;
      if (s >= 0 && s <= 1) return true;
    }
  }
  return false;
}

/** The live exterior: per view (the elevations x 16 azimuths) the pixels where the cut wreck shows something deeper by
 *  2 cm than the uncut one, whose first hit is not the plate, nor the deck inside the race (the ring takes it by design:
 *  the verifier's rule), nor the dents' reshaping (EXT_TOL_M on the same mesh within EXT_TOL_R_M of the rim). */
function exteriorHoles(intactTris, destroyedTris, seat, hull, elevations, keepSamples = 10) {
  let holes = 0, holesFar = 0, changed = 0, tolerated = 0;
  // the holes by kind: see-through (no hit on the cut wreck) inside the outline, see-through at the outline (the cut
  // wreck's silhouette receded: a background pixel of both rasters within SILHOUETTE_PX), a deeper hit; and by radius
  let seeThrough = 0, silhouette = 0, deeperHit = 0, reshaped = 0;
  const byR = {};
  const samples = [];
  const toHull = hull.matrixWorld.clone().invert();
  const centre = new THREE.Vector3(seat.cx, seat.deckY - 0.3, seat.cz).applyMatrix4(hull.matrixWorld);
  for (const el of elevations) {
    for (let az = 0; az < 16; az++) {
      const a = (az / 16) * Math.PI * 2, e = (el * Math.PI) / 180;
      const dir = new THREE.Vector3(-Math.sin(a) * Math.cos(e), -Math.sin(e), -Math.cos(a) * Math.cos(e));
      const v = makeView(dir, centre.clone().addScaledVector(dir, -6), seat.rimR + 0.8, 0.02);
      const A = raster(v, intactTris), B = raster(v, destroyedTris);
      for (let p = 0; p < A.zFront.length; p++) {
        if (!(B.zFront[p] > A.zFront[p] + 0.02)) continue;
        changed++;
        const now = B.triFront[p] >= 0 ? destroyedTris.names[B.triFront[p]] : null;
        if (now === 'PLATE' || now === 'turretRingPlate') continue;
        const q0 = pixelPoint(v, p, A.zFront[p]).applyMatrix4(toHull), r = Math.hypot(q0.x - seat.cx, q0.z - seat.cz);
        if (r <= seat.rimR + 0.01 && q0.y >= seat.deckY - 0.03) continue;
        const deeper = B.zFront[p] - A.zFront[p];
        if (deeper < EXT_TOL_M && r <= seat.rimR + EXT_TOL_R_M && now === intactTris.names[A.triFront[p]]) { tolerated++; continue; }
        // (243) the reshaping, seen at any angle (a few cm of sag reads as many cm deeper along a grazing ray, and a long
        // face's pieces carry it out past the radius): the surface the eye saw counts as reshaped, not opened, when the
        // cut wreck still has a face of that mesh facing the same way along its normal within the most the cut may move
        // that face (reshapeBound, + 1 cm); a crack or an opening has none there (the plate's far face faces the other
        // way), and a face the cut cannot reshape has no allowance at all
        const bound = reshapeBound(intactTris, A.triFront[p], seat);
        if (bound > 0) {
          const t = A.triFront[p], o = t * 9, P = intactTris.pos;
          const n = new THREE.Vector3().crossVectors(new THREE.Vector3(P[o + 3] - P[o], P[o + 4] - P[o + 1], P[o + 5] - P[o + 2]),
            new THREE.Vector3(P[o + 6] - P[o], P[o + 7] - P[o + 1], P[o + 8] - P[o + 2])).normalize();
          if (intactTris.flags[t] & 16) n.negate();
          if (n.dot(v.d) > 0) n.negate();
          const at = pixelPoint(v, p, A.zFront[p]);
          const reach = bound + 0.01;
          if (segmentMeetsSurface(destroyedTris, at.clone().addScaledVector(n, reach), at.clone().addScaledVector(n, -reach),
            intactTris.names[t], n)) { tolerated++; reshaped++; continue; }
        }
        holes++;
        if (deeper > 0.2) holesFar++;
        if (now === null) {
          let rim = false;
          const pi = p % v.n, pj = (p / v.n) | 0;
          for (let dj = -SILHOUETTE_PX; dj <= SILHOUETTE_PX && !rim; dj++) {
            for (let di = -SILHOUETTE_PX; di <= SILHOUETTE_PX; di++) {
              const qi = pi + di, qj = pj + dj;
              if (qi < 0 || qj < 0 || qi >= v.n || qj >= v.n) continue;
              const q = qj * v.n + qi;
              if (!Number.isFinite(A.zFront[q]) && !Number.isFinite(B.zFront[q])) { rim = true; break; }
            }
          }
          if (rim) silhouette++;
          else {
            seeThrough++;
            if (FAR_SAMPLES && (samples.seeN = (samples.seeN || 0) + 1) % 5 === 1 && (samples.see ??= []).length < FAR_SAMPLES) {
              const q = pixelPoint(v, p, A.zFront[p]).applyMatrix4(toHull);
              samples.see.push({ el, az, world: pixelPoint(v, p, A.zFront[p]).toArray().map(r4), at: [r4(q.x), r4(q.y), r4(q.z)], r: r4(r),
                dy: r4(q.y - seat.deckY), was: intactTris.names[A.triFront[p]] });
            }
          }
        } else deeperHit++;
        const bin = (Math.floor(r * 10) / 10).toFixed(1);
        byR[bin] = (byR[bin] || 0) + 1;
        if (FAR_SAMPLES && deeper > 0.2 && (samples.farN = (samples.farN || 0) + 1) % 7 === 1 && (samples.far ??= []).length < FAR_SAMPLES) {
          const q = pixelPoint(v, p, A.zFront[p]).applyMatrix4(toHull), q1 = Number.isFinite(B.zFront[p]) ? pixelPoint(v, p, B.zFront[p]).applyMatrix4(toHull) : null;
          samples.far.push({ el, az, world: pixelPoint(v, p, A.zFront[p]).toArray().map(r4), at: [r4(q.x), r4(q.y), r4(q.z)], r: r4(r), was: intactTris.names[A.triFront[p]], now, nowAt: q1 ? [r4(q1.x), r4(q1.y), r4(q1.z)] : null, deeper: r4(deeper) });
        }
        if (samples.length < keepSamples) {
          const q = pixelPoint(v, p, A.zFront[p]), q1 = Number.isFinite(B.zFront[p]) ? pixelPoint(v, p, B.zFront[p]) : null;
          samples.push({ el, az, at: [r4(q.x), r4(q.y), r4(q.z)], was: intactTris.names[A.triFront[p]], now, nowAt: q1 ? [r4(q1.x), r4(q1.y), r4(q1.z)] : null, deeper: r4(deeper) });
        }
      }
    }
  }
  return { changedPx: changed, holePx: holes, holeFarPx: holesFar, toleratedPx: tolerated, reshapedPx: reshaped, seeThroughPx: seeThrough,
    silhouettePx: silhouette, deeperPx: deeperHit, byR, samples, ...(samples.far ? { far: samples.far } : {}),
    ...(samples.see ? { see: samples.see } : {}) };
}
function platesOf(root) { const l = []; root.traverse((o) => { if (o.userData?.turretRingPlate) l.push(o); }); return l; }
function discTris(plate, positions) {
  const pg = plate.geometry, partA = pg.getAttribute('cotRingA'), idx = pg.index.array;
  const disc = new THREE.BufferGeometry();
  const discIdx = [];
  for (let k = 0; k < idx.length; k += 3) if (partA.getW(idx[k]) < 0.5) discIdx.push(idx[k], idx[k + 1], idx[k + 2]);
  disc.setAttribute('position', new THREE.BufferAttribute(positions ?? pg.getAttribute('position').array, 3));
  disc.setIndex(discIdx);
  return geometryTris(disc, plate.matrixWorld);
}
function coverage(view, P, H, hull, seat, tol, T = null) {
  let open = 0, openCov = 0, race = 0, raceCov = 0, worst = 0;
  const who = {};
  const toHull = hull.matrixWorld.clone().invert();
  for (let p = 0; p < P.zFront.length; p++) {
    if (!Number.isFinite(P.zFront[p])) continue;
    const pt = pixelPoint(view, p, P.zFront[p]).applyMatrix4(toHull);
    const r = Math.hypot(pt.x - seat.cx, pt.z - seat.cz);
    const covered = H.zFront[p] < P.zFront[p] - tol;
    if (Number.isFinite(H.zFront[p])) worst = Math.max(worst, P.zFront[p] - H.zFront[p]);
    if (r < seat.openR) { open++; if (covered) openCov++; } else { race++; if (covered) raceCov++; }
    if (covered && T) {
      const name = T.names[H.triFront[p]] ?? '?';
      const q = pixelPoint(view, p, H.zFront[p]).applyMatrix4(toHull);
      const e = who[name] ??= { n: 0, rMin: 9, rMax: 0, over: 0, at: null };
      e.n++; e.rMin = Math.min(e.rMin, r4(r)); e.rMax = Math.max(e.rMax, r4(r));
      if (P.zFront[p] - H.zFront[p] > e.over) { e.over = r4(P.zFront[p] - H.zFront[p]); e.at = [r4(q.x), r4(q.y), r4(q.z)]; }
    }
  }
  return { open: r4(openCov / Math.max(1, open)), race: r4(raceCov / Math.max(1, race)), worst: r4(worst), px: open + race, ...(T ? { who } : {}) };
}
function liveProbe(id, buildName, camoSeed) {
  const visual = createTank(id, null, BUILDS[buildName](camoSeed));
  try {
    const root = visual.root;
    const hull = root.getObjectByName('rig_hull'), turret = root.getObjectByName('rig_turret');
    const row = { id, build: buildName, camoSeed };
    row.intactPlates = platesOf(root).length;
    const fp0 = geometryFingerprint(root);
    let meshes0 = 0; root.traverse((o) => { if (o.isMesh) meshes0++; });
    // every mesh's geometry before the kill: the exterior check's reference is the wreck with them back (the ring
    // undone, everything else of the wreck as it is: decals hidden, details detached)
    const heldBefore = new Map();
    root.traverse((o) => { if (o.isMesh) heldBefore.set(o, o.geometry); });
    row.shares = [];
    let plate = null, seat = null, view = null, dentsNear = null;
    for (const ageS of SHARE_AGES) {
      if (visual.isDestroyed()) visual.resetDestroyed();
      const k0 = performance.now();
      visual.setDestroyed({ pop: true, ageS });
      (row.killMs ??= []).push(r4(performance.now() - k0));
      const plates = platesOf(root);
      row.plates = Math.max(row.plates ?? 0, plates.length);
      plate = plates[0];
      if (!plate) { row.error = 'no plate'; return row; }
      seat = plate.userData.turretRingSeat;
      root.updateMatrixWorld(true);
      const { burnU, list } = readDents(root);
      const share = list.length ? turretRingDentShare(ageS) : 0;
      if (!dentsNear) dentsNear = list.length;
      const plateTopY = seat.deckY + 0.004;
      const turretVisible = turret.visible;
      turret.visible = false;
      const skip = new Set([turret, plate]);
      const hullTris = collect(root, skip, list.length ? { burnU, hullWorld: hull.matrixWorld, list, share } : null);
      turret.visible = turretVisible;
      const centre = new THREE.Vector3(seat.cx, plateTopY + 2, seat.cz).applyMatrix4(hull.matrixWorld);
      view = makeView(new THREE.Vector3(0, -1, 0).transformDirection(hull.matrixWorld), centre, seat.rimR + 0.03, 0.01);
      const P = raster(view, discTris(plate));
      const H = raster(view, hullTris);
      row.shares.push({ ageS, share: r4(share), strict: coverage(view, P, H, hull, seat, 0.0005, hullTris), cm: coverage(view, P, H, hull, seat, 0.01) });
      if (RENDER && ageS === 1000) {
        const w = view.n, h = view.n;
        const canvas = createCanvas(w, h), ctx = canvas.getContext('2d'), img = ctx.createImageData(w, h);
        for (let p = 0; p < P.zFront.length; p++) {
          const i = p % view.n, j = (p / view.n) | 0, o = ((view.n - 1 - j) * w + i) * 4;
          const plateHere = Number.isFinite(P.zFront[p]);
          const over = plateHere && H.zFront[p] < P.zFront[p] - 0.0005;
          const c = !plateHere ? (Number.isFinite(H.zFront[p]) ? [150, 150, 140] : [255, 0, 255]) : over ? [220, 40, 30] : [40, 90, 220];
          img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        writeFileSync(`${RENDER}/${id}-live-${buildName}-${camoSeed}.png`, canvas.toBuffer('image/png'));
      }
    }
    row.dents = dentsNear;
    {
      let before = 0, after = 0, cutMeshes = 0;
      root.traverse((o) => {
        if (!o.isMesh || o.userData.turretRingPlate) return;
        const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3;
        after += n;
        if (g.userData.turretRingCut) cutMeshes++;
      });
      visual.resetDestroyed();
      root.traverse((o) => { if (o.isMesh) before += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
      visual.setDestroyed({ pop: true, ageS: 1000 });
      row.tris = { intact: before, wreck: after, cutMeshes, plate: (plate.geometry.index.count / 3) };
    }
    row.seat = { source: seat.source, deckY: r4(seat.deckY), openR: r4(seat.openR), rimR: r4(seat.rimR), skirt: r4(seat.skirt), depth: r4(seat.depth), car: seat.carousel?.count ?? 0 };
    // the last state (share 1): synthetic dents the planner can pick, through the runtime's own plate law
    {
      const { burnU, list: planList } = readDents(root);
      visual.resetDestroyed();
      visual.setDestroyed({ pop: true, ageS: 0 });
      plate = platesOf(root)[0];
      root.updateMatrixWorld(true);
      const rest = plate.geometry.getAttribute('position').array.slice();
      let platesMesh = null, most = 0;
      for (const child of hull.children) {
        if (!child.isMesh || child.isInstancedMesh || !child.geometry?.attributes?.position) continue;
        if (!child.matrix.equals(new THREE.Matrix4())) continue;
        const count = child.geometry.attributes.position.count + (child.name === 'hull' ? 1e9 : 0);
        if (count > most) { most = count; platesMesh = child; }
      }
      const synthetic = [];
      if (platesMesh) {
        const pos = platesMesh.geometry.attributes.position, nor = platesMesh.geometry.attributes.normal;
        let best = null, bestD = Infinity, side = null, sideD = Infinity;
        for (let i = 0; i < pos.count; i++) {
          if (!nor) break;
          const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
          const r = Math.hypot(x - seat.cx, z - seat.cz);
          if (nor.getY(i) >= 0.85 && Math.abs(y - seat.deckY) <= 0.06) {
            const dd = Math.abs(r - seat.rimR * 0.8);
            if (dd < bestD) { bestD = dd; best = [x, y, z]; }
          }
          // a side plate's corner by the deck's edge (the t90m_proryv kill's kind: inward and up across the deck)
          if (Math.abs(nor.getY(i)) < 0.3 && Math.abs(y - seat.deckY) < 0.15) {
            const dd = Math.abs(r - (seat.rimR + 0.9));
            if (dd < sideD) { sideD = dd; side = [x, y, z, -Math.sign(nor.getX(i) || x)]; }
          }
        }
        if (best) synthetic.push({ name: 'roof', c: best, R: 0.9, dir: [0, -1, 0], depth: 0.2 });
        if (best) synthetic.push({ name: 'roofUp', c: best, R: 0.9, dir: [0, 1, 0], depth: 0.2 });
        if (side) synthetic.push({ name: 'sideUp', c: side.slice(0, 3), R: 1.1, dir: [side[3] * 0.7071, 0.7071, 0], depth: 0.19 });
      }
      // the stress battery: the deepest dents the planner makes (0.28 m), tight and wide, centred round the ring just
      // past it at the deck, pushing in toward the axis flat and climbing (a corner there sheared in over the race)
      if (STRESS) {
        for (let b = 0; b < 8; b++) {
          const a = (b / 8) * Math.PI * 2 + 0.2;
          for (const [R, out] of [[0.6, 0.45], [1.0, 0.75]]) {
            const cx = seat.cx + Math.sin(a) * (seat.rimR + out), cz = seat.cz + Math.cos(a) * (seat.rimR + out);
            for (const climb of [0, 0.7071]) {
              const h = climb ? 0.7071 : 1;
              synthetic.push({ name: `stress-b${b}-R${R}-${climb ? 'up' : 'flat'}`, c: [cx, seat.deckY, cz], R, dir: [-Math.sin(a) * h, climb, -Math.cos(a) * h], depth: 0.28 });
            }
          }
        }
      }
      row.synthetic = [];
      for (const syn of synthetic) {
        // (246) the planner caps every hull dent round the race before the kill's cut (tankFactoryCore planLiveCrumple);
        // the stress battery's deepest dent, uncapped, moved amx40_proto's rim 5.4 cm, past anything the game makes
        const planned = [{ cx: syn.c[0], cy: syn.c[1], cz: syn.c[2], r2: syn.R * syn.R, depth: syn.depth }];
        if (!UNCAPPED) capTurretRingDents(planned, seat);
        const asked = syn.depth;
        syn.depth = planned[0].depth;
        const synList = { cx: syn.c[0], cy: syn.c[1], cz: syn.c[2], r2: syn.R * syn.R, dx: syn.dir[0], dy: syn.dir[1], dz: syn.dir[2], depth: syn.depth };
        const measured = { name: syn.name, at: syn.c.map(r4), dir: syn.dir, depth: r4(syn.depth), ...(asked !== syn.depth ? { asked } : {}) };
        if (!RECUT) {
          const dents = { centres: [new THREE.Vector4(syn.c[0], syn.c[1], syn.c[2], syn.R * syn.R)], dirs: [new THREE.Vector4(...syn.dir, syn.depth)] };
          const off = turretRingPlateDents(plate.geometry, plate.position, dents);
          const positions = new Float32Array(rest.length);
          for (let i = 0; i < rest.length; i++) positions[i] = rest[i] + (off ? off[i] : 0);
          const P = raster(view, discTris(plate, positions));
          turret.visible = false;
          const TS = collect(root, new Set([turret, plate]), { burnU: readDents(root).burnU, hullWorld: hull.matrixWorld, list: [synList], share: 1 });
          const HS = raster(view, TS);
          turret.visible = true;
          row.synthetic.push({ ...measured, strict: coverage(view, P, HS, hull, seat, 0.0005, TS), cm: coverage(view, P, HS, hull, seat, 0.01) });
          continue;
        }
        // the kill's cut undone (its meshes on their geometry before the kill, its plate off) and this plan's on
        const plan = [...planList, synList];
        const planDents = { centres: plan.map((d) => new THREE.Vector4(d.cx, d.cy, d.cz, d.r2)), dirs: plan.map((d) => new THREE.Vector4(d.dx, d.dy, d.dz, d.depth)) };
        const swapped = [];
        root.traverse((o) => { if (o.isMesh && o.geometry.userData?.turretRingCut && heldBefore.has(o)) { swapped.push([o, o.geometry]); o.geometry = heldBefore.get(o); } });
        const plateParent = plate.parent;
        plate.removeFromParent();
        const ring = createTurretRingPresentation({ specId: id, root, hull, turret, armor: getSpec(id)?.armor, engineCtx: null,
          high: BUILDS[buildName](camoSeed).geometryQuality !== 'low', rendered: true, dents: () => planDents });
        try {
          ring.show();
          root.updateMatrixWorld(true);
          const planPlate = platesOf(root)[0];
          const planRest = planPlate.geometry.getAttribute('position').array.slice();
          const off = turretRingPlateDents(planPlate.geometry, planPlate.position, planDents);
          let worst = null;
          for (const share of [0, 0.5, 1]) {
            const positions = new Float32Array(planRest.length);
            for (let i = 0; i < planRest.length; i++) positions[i] = planRest[i] + (off ? off[i] * share : 0);
            const P = raster(view, discTris(planPlate, positions));
            turret.visible = false;
            const TS = collect(root, new Set([turret, planPlate]), { burnU: readDents(root).burnU, hullWorld: hull.matrixWorld, list: plan, share });
            const HS = raster(view, TS);
            turret.visible = true;
            const cm = coverage(view, P, HS, hull, seat, 0.01);
            if (!worst || cm.open + cm.race > worst.cm.open + worst.cm.race) worst = { share, strict: coverage(view, P, HS, hull, seat, 0.0005, TS), cm };
          }
          row.synthetic.push({ ...measured, recut: true, ...worst });
        } finally {
          ring.hide();
          ring.dispose();
          for (const [o, g] of swapped) o.geometry = g;
          plateParent.add(plate);
          root.updateMatrixWorld(true);
        }
      }
    }
    // the exterior: the cut hull with its plate (turret hidden) against the intact hull from 80 directions, both dented as
    // the settled wreck is (exteriorHoles: what counts as a hole); with the player's build, the guard's two openings.
    // (244) The wreck settled again first: the synthetic dents above leave it killed at age 0, its plate at no dent share,
    // and a settled hull against that plate let grazing rays through between them just inside the rim (m551_sheridan's
    // ~100 px, every one of them covered by the plate in the game)
    {
      visual.resetDestroyed();
      visual.setDestroyed({ pop: true, ageS: SHARE_AGES[SHARE_AGES.length - 1] });
      plate = platesOf(root)[0];
      root.updateMatrixWorld(true);
      turret.visible = false;
      const swapped = [];
      // (244) an interior fill's reference is the closed boxes the kill swapped in and the ring cut, not the surface it
      // drew intact (type74's and the XK2's fills read as thousands of holes against it)
      const references = [];
      root.traverse((o) => {
        if (!o.isMesh || !o.geometry?.userData?.turretRingCut || !heldBefore.has(o)) return;
        const closed = o.userData.interiorFill ? closedInteriorFillGeometry(o) : null;
        if (closed) references.push(closed);
        swapped.push([o, o.geometry]);
        o.geometry = closed ?? heldBefore.get(o);
      });
      const { burnU, list } = readDents(root);
      const dent = list.length ? { burnU, hullWorld: hull.matrixWorld, list, share: turretRingDentShare(SHARE_AGES[SHARE_AGES.length - 1]) } : null;
      const intactTris = collect(root, new Set([turret, plate]), dent);
      for (const [o, g] of swapped) o.geometry = g;
      for (const g of references) g.dispose();
      row.cutMeshes = swapped.map(([o]) => o.name);
      const destroyedTris = collect(root, new Set([turret]), dent);
      const plateTris = geometryTris(plate.geometry, plate.matrixWorld, plate.material.side === THREE.DoubleSide ? 1 : 0);
      destroyedTris.pos.push(...plateTris.pos); destroyedTris.flags.push(...plateTris.flags); for (let i = 0; i < plateTris.flags.length; i++) destroyedTris.names.push('PLATE');
      turret.visible = true;
      row.exterior = exteriorHoles(intactTris, destroyedTris, seat, hull, [-10, 5, 20, 40, 65]);
      if (buildName === 'player') {
        // a GUARD_HALF_M-square opening through the deck behind (or beside, or ahead of) the ring, inside the tolerance's
        // radius and outside it, seen from the upper views: each must count as a hole over the wreck without it
        const top = [40, 65], base = exteriorHoles(intactTris, destroyedTris, seat, hull, top, 0).holePx;
        row.exteriorGuard = [];
        for (const [name, r] of [['inside', seat.rimR + 0.2], ['outside', seat.rimR + EXT_TOL_R_M + 0.06]]) {
          const entry = { name, r: r4(r), bearingDeg: null, removed: 0, holePx: 0 };
          for (const bearing of [Math.PI, Math.PI / 2, -Math.PI / 2, 0]) {
            const x = seat.cx + Math.sin(bearing) * r, z = seat.cz + Math.cos(bearing) * r;
            const box = { x0: x - GUARD_HALF_M, x1: x + GUARD_HALF_M, z0: z - GUARD_HALF_M, z1: z + GUARD_HALF_M, yMin: seat.deckY - 0.15 };
            const carved = carveOpening(destroyedTris, hull.matrixWorld, box);
            if (!carved.removed) continue;
            entry.bearingDeg = Math.round((bearing * 180) / Math.PI);
            entry.removed = carved.removed;
            entry.holePx = exteriorHoles(intactTris, carved.tris, seat, hull, top, 0).holePx - base;
            break;
          }
          row.exteriorGuard.push(entry);
        }
      }
    }
    visual.resetDestroyed();
    row.platesAfterReset = platesOf(root).length;
    let meshes1 = 0; root.traverse((o) => { if (o.isMesh) meshes1++; });
    row.meshCountHolds = meshes0 === meshes1;
    row.fingerprintHolds = geometryFingerprint(root) === fp0;
    row.fp = fp0;
    return row;
  } finally { visual.dispose(); }
}

// ------------------------------------------------------------------------------------------------ the map hulk
function hulkProbe(id, seed) {
  const r1 = bakeTankWreck(null, id, { seed, pop: true });
  const r0 = bakeTankWreck(null, id, { seed, pop: true, ring: false });
  const row = { id, seed };
  if (!r1 || !r0) { row.error = 'bake failed'; return row; }
  row.tris = [r0.tris, r1.tris];
  row.budgetHolds = r0.budgetTris === r1.budgetTris && r0.hx === r1.hx && r0.hz === r1.hz && r0.h === r1.h;
  // the same posed visual the bake builds
  const visual = createTank(id, null, { camoSeed: 4000 + (seed % 997), quality: 'low', geometryQuality: 'low', materialMode: 'geometry-only', eraVisualBindingReceipt: false, proceduralOnly: true });
  try {
    visual.setDestroyed({ pop: true, ageS: 1000 });
    const root = visual.root;
    root.updateMatrixWorld(true);
    const seat = visual.turretRingSeat();
    if (!seat) { row.error = 'no seat'; return row; }
    row.seat = { deckY: r4(seat.deckY), openR: r4(seat.openR), rimR: r4(seat.rimR), depth: r4(seat.depth) };
    const solids = collectWreckSolids(root);
    const baseY = solids[0][1] - r1.solids[0][1];
    row.baseYConsistent = solids.every((s, i) => Math.abs((s[1] - r1.solids[i][1]) - baseY) < 1e-4 && Math.abs(s[0] - r1.solids[i][0]) < 1e-5);
    const hull = root.getObjectByName('rig_hull');
    const rootInv = root.matrixWorld.clone().invert();
    const hullToRoot = new THREE.Matrix4().multiplyMatrices(rootInv, hull.matrixWorld);
    // bake frame -> hull frame
    const bakeToHull = hullToRoot.clone().invert().multiply(new THREE.Matrix4().makeTranslation(0, baseY, 0));
    const T1 = geometryTris(r1.geo, bakeToHull), T0 = geometryTris(r0.geo, bakeToHull);
    // top-down over the opening (hull frame: y up)
    {
      const view = makeView(new THREE.Vector3(0, -1, 0), new THREE.Vector3(seat.cx, seat.deckY + 3, seat.cz), seat.openR, 0.01);
      const A = raster(view, T0), B = raster(view, T1);
      let px = 0, deckish0 = 0, wellSeen = 0, deckNotWell = 0, nearer = 0, backNew = 0;
      for (let p = 0; p < A.zFront.length; p++) {
        const pt = pixelPoint(view, p, 0);
        if (Math.hypot(pt.x - seat.cx, pt.z - seat.cz) >= seat.openR - 0.01) continue;
        px++;
        const y0 = seat.deckY + 3 - A.zFront[p], y1 = seat.deckY + 3 - B.zFront[p];
        const deck0 = Number.isFinite(y0) && y0 < seat.deckY + 0.06;
        if (deck0) deckish0++;
        if (B.zFront[p] > A.zFront[p] + 0.03) { if (deck0) wellSeen++; }
        else if (deck0) deckNotWell++;
        if (B.zFront[p] < A.zFront[p] - 0.03) nearer++;
        if (B.backAny[p] && B.zAny[p] < B.zFront[p] - 0.005 && !(A.backAny[p] && A.zAny[p] < A.zFront[p] - 0.005)) backNew++;
      }
      row.top = { px, uncovered0: r4(deckish0 / Math.max(1, px)), wellSeenOfUncovered: r4(wellSeen / Math.max(1, deckish0)),
        uncoveredButNoWell: r4(deckNotWell / Math.max(1, px)), newObstruction: r4(nearer / Math.max(1, px)), newBackfaceFirst: r4(backNew / Math.max(1, px)) };
    }
    if (RENDER) {
      const centre = new THREE.Vector3(seat.cx, seat.deckY - 0.3, seat.cz);
      for (const [el, az] of [[60, 2], [20, 0], [20, 4], [-10, 0], [5, 4], [5, 12], [90, 0]]) {
        const a = (az / 16) * Math.PI * 2, e = (el * Math.PI) / 180;
        const dir = el === 90 ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(-Math.sin(a) * Math.cos(e), -Math.sin(e), -Math.cos(a) * Math.cos(e));
        const view = makeView(dir, centre.clone().addScaledVector(dir, -8), 3.2, 0.012);
        const A = raster(view, T0), B = raster(view, T1);
        renderPair(`${RENDER}/${id}-hulk-el${el}-az${az}.png`, view, A, T0, B, T1);
      }
    }
    // the exterior from 16 azimuths x 5 elevations: pixels where the ring bake shows something deeper than its twin and the
    // view ray never entered through the opening (a hole the cut made in a surface seen from outside)
    {
      let changed = 0, holes = 0, holesFar = 0;
      const holeSamples = [];
      const centre = new THREE.Vector3(seat.cx, seat.deckY - 0.3, seat.cz);
      for (const el of [-10, 5, 20, 40, 65]) {
        for (let az = 0; az < 16; az++) {
          const a = (az / 16) * Math.PI * 2, e = (el * Math.PI) / 180;
          const dir = new THREE.Vector3(-Math.sin(a) * Math.cos(e), -Math.sin(e), -Math.cos(a) * Math.cos(e));
          const view = makeView(dir, centre.clone().addScaledVector(dir, -6), seat.rimR + 0.6, 0.02);
          const A = raster(view, T0), B = raster(view, T1);
          for (let p = 0; p < A.zFront.length; p++) {
            if (!(B.zFront[p] > A.zFront[p] + 0.03)) continue;
            changed++;
            // did the ray cross the opening's disc (y = deckY + 4 mm, r < rimR) before reaching its ring-bake hit?
            const start = pixelPoint(view, p, 0);
            let through = false;
            if (dir.y < -1e-3) {
              const t = (seat.deckY + 0.004 + 0.002 - start.y) / dir.y;
              if (t > 0 && t <= B.zFront[p] + 1e-3) {
                const x = start.clone().addScaledVector(dir, t);
                if (Math.hypot(x.x - seat.cx, x.z - seat.cz) < seat.rimR + 0.01) through = true;
              }
            }
            const q0 = pixelPoint(view, p, A.zFront[p]);
            const rq = Math.hypot(q0.x - seat.cx, q0.z - seat.cz);
            // the hulk's own deck and fittings inside the race (cut by design) seen from anywhere: not a hole
            if (rq <= seat.rimR + 0.01 && q0.y >= seat.deckY - 0.03) through = true;
            if (!through) {
              holes++;
              if (B.zFront[p] > A.zFront[p] + 0.2) holesFar++;
              if (holeSamples.length < 12) {
                const p0 = pixelPoint(view, p, A.zFront[p]);
                const p1 = pixelPoint(view, p, B.zFront[p]);
                const triOf = (T, t) => (t >= 0 ? [0, 1, 2].map((c) => [T.pos[t * 9 + c * 3], T.pos[t * 9 + c * 3 + 1], T.pos[t * 9 + c * 3 + 2]].map(r4)) : null);
                holeSamples.push({ el, az, at0: [r4(p0.x), r4(p0.y), r4(p0.z)], r0: r4(Math.hypot(p0.x - seat.cx, p0.z - seat.cz)), at1: Number.isFinite(B.zFront[p]) ? [r4(p1.x), r4(p1.y), r4(p1.z)] : null, deeperBy: r4(B.zFront[p] - A.zFront[p]), triA: triOf(T0, A.triFront[p]), triB: triOf(T1, B.triFront[p]) });
              }
            }
          }
        }
      }
      row.exterior = { changedPx: changed, holePx: holes, holeFarPx: holesFar, holeSamples };
    }
  } finally { visual.dispose(); r1.geo.dispose(); r0.geo.dispose(); r1.shadowGeo?.dispose(); r0.shadowGeo?.dispose(); }
  return row;
}

for (const id of ids) {
  if (!TANK_SPECS[id]) { appendFileSync(OUT, JSON.stringify({ id, error: 'no spec' }) + '\n'); continue; }
  await ensureInteriorFills([id]);
  await ensureTankBuilder(id);
  const t0 = performance.now();
  if (RECEIPTS && RECEIPTS[id]) {
    const calibration = combatAnatomyCalibration(id);
    if (calibration) registerCombatAnatomyCalibrations({ [id]: { ...calibration, turretRing: RECEIPTS[id] } });
  }
  if (!SKIP_LIVE) {
    for (const [build, seeds] of [['player', SEEDS.slice(0, 1)], ['bot', SEEDS], ['gallery', SEEDS.slice(0, 1)]]) {
      for (const seed of seeds) {
        let row;
        try { row = liveProbe(id, build, seed); } catch (error) { row = { id, build, seed, error: String(error?.stack || error).slice(0, 600) }; }
        row.kind = 'live';
        appendFileSync(OUT, JSON.stringify(row) + '\n');
      }
    }
  }
  if (!SKIP_HULK) {
    let row;
    try { row = hulkProbe(id, 4242); } catch (error) { row = { id, error: String(error?.stack || error).slice(0, 600) }; }
    row.kind = 'hulk';
    appendFileSync(OUT, JSON.stringify(row) + '\n');
  }
  console.log(`${id} ${((performance.now() - t0) / 1000).toFixed(1)}s`);
}

// ------------------------------------------------------------------------------------------------ the verdict
if (args.includes('--gate')) {
  const rows = readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((row) => ids.includes(row.id));
  const failures = [];
  for (const row of rows) {
    const tag = `${row.id} ${row.kind}${row.build ? ` ${row.build} ${row.camoSeed}` : ''}`;
    if (row.error) { failures.push(`${tag}: ${row.error.slice(0, 160)}`); continue; }
    if (row.kind === 'live') {
      if (row.intactPlates !== 0 || row.plates !== 1 || row.platesAfterReset !== 0) failures.push(`${tag}: plate lifecycle`);
      if (!row.fingerprintHolds || !row.meshCountHolds) failures.push(`${tag}: fingerprint after the rematch`);
      for (const state of [...row.shares.map((s) => ({ name: `share ${s.share}`, ...s })), ...row.synthetic]) {
        const cm = state.cm.open + state.cm.race, strict = state.strict.open + state.strict.race;
        const stress = state.name.startsWith('stress');
        if (cm > (stress ? 0.001 : 0) || strict > (stress ? 0.002 : 0.001)) failures.push(`${tag} ${state.name}: the hull over the plate (strict ${strict}, >1 cm ${cm})`);
      }
      if (row.exterior.holePx > GATE_EXT_PX) failures.push(`${tag}: ${row.exterior.holePx} exterior hole pixels`);
      for (const guard of row.exteriorGuard ?? []) {
        if (!guard.removed) failures.push(`${tag}: the exterior guard found no deck to open ${guard.name} the tolerance's radius`);
        else if (guard.holePx <= GATE_EXT_PX) failures.push(`${tag}: the exterior guard's opening ${guard.name} the tolerance's radius counted ${guard.holePx} px (the tolerance hid a real hole)`);
      }
    } else if (row.kind === 'hulk') {
      if (!row.budgetHolds || !row.baseYConsistent) failures.push(`${tag}: placement budget or base`);
      if (row.exterior.holeFarPx > 100) failures.push(`${tag}: ${row.exterior.holeFarPx} exterior hole pixels`);
    }
  }
  console.log(`[turret-ring-probe] ${rows.length} rows, ${failures.length} failure(s)`);
  for (const failure of failures) console.log(`  ${failure}`);
  if (failures.length) process.exit(1);
}

