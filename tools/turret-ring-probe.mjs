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
//            pushing in flat and climbing — each through the runtime's own plate law (turretRingPlateDents); the exterior
//            from 80 directions against the same wreck with its hull's meshes back on their geometry (a pixel deeper by
//            2 cm whose first hit is not the plate is a hole the cut opened); the lifecycle and fingerprint;
//   hulk     the cook-off hulk against its ring:false twin: the placement budget, the top view over the opening, and the
//            exterior from 80 directions (a pixel deeper by 3 cm that never passed through the opening: a hole).
//
//   node tools/turret-ring-probe.mjs --ids=t90m_proryv,t72b3 [--seeds=77,4242,9001] [--stress] [--no-live] [--no-hulk]
//        [--receipts=<receipts.json>] [--render=<dir>] --out=<rows.jsonl> [--gate]
import * as THREE from 'three';
import { appendFileSync } from 'node:fs';

await import('./tank-surface-collect.mjs');
const { TANK_SPECS } = await import('../src/vehicles/specs.ts');
const { ensureInteriorFills } = await import('../src/vehicles/interiorFills.ts');
const { geometryFingerprint } = await import('../src/vehicles/tankAssets.ts');
const { bakeTankWreck } = await import('../src/world/wrecks.ts');
const { collectWreckSolids } = await import('../src/world/wreckCollision.ts');
const { createTank, ensureTankBuilder } = await import('../src/vehicles/fleetFactory.ts');
const { turretRingPlateDents, turretRingDentShare } = await import('../src/vehicles/turretRingWell.ts');
const { combatAnatomyCalibration, registerCombatAnatomyCalibrations } = await import('../src/vehicles/combatAnatomyCalibrationRegistry.ts');
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, fallback = '') => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const ids = opt('ids').split(',').filter(Boolean);
const OUT = opt('out');
const SEEDS = opt('seeds', '77,4242,9001').split(',').map(Number);
const SKIP_HULK = args.includes('--no-hulk');
const STRESS = args.includes('--stress');
const SKIP_LIVE = args.includes('--no-live');
const RENDER = opt('render');
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
          out.flags.push((two ? 1 : 0) | (o.userData.interiorFill ? 2 : 0) | (o.isInstancedMesh ? 4 : 0) | (dents ? 8 : 0) | (flip ? 16 : 0));
          out.names.push(o.name || '?');
        }
      }
    }
  }
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
      const { burnU } = readDents(root);
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
        const dents = { centres: [new THREE.Vector4(syn.c[0], syn.c[1], syn.c[2], syn.R * syn.R)], dirs: [new THREE.Vector4(...syn.dir, syn.depth)] };
        const off = turretRingPlateDents(plate.geometry, plate.position, dents);
        const positions = new Float32Array(rest.length);
        for (let i = 0; i < rest.length; i++) positions[i] = rest[i] + (off ? off[i] : 0);
        const P = raster(view, discTris(plate, positions));
        const list = [{ cx: syn.c[0], cy: syn.c[1], cz: syn.c[2], r2: syn.R * syn.R, dx: syn.dir[0], dy: syn.dir[1], dz: syn.dir[2], depth: syn.depth }];
        turret.visible = false;
        const TS = collect(root, new Set([turret, plate]), { burnU: readDents(root).burnU, hullWorld: hull.matrixWorld, list, share: 1 });
        const HS = raster(view, TS);
        turret.visible = true;
        row.synthetic.push({ name: syn.name, at: syn.c.map(r4), dir: syn.dir, strict: coverage(view, P, HS, hull, seat, 0.0005, TS), cm: coverage(view, P, HS, hull, seat, 0.01) });
      }
    }
    // the exterior: the cut hull with its plate (turret hidden) against the intact hull from 80 directions; a pixel
    // deeper than the intact hull's by 2 cm whose first hit is not the plate is a hole the cut opened
    {
      turret.visible = false;
      const swapped = [];
      root.traverse((o) => { if (o.isMesh && o.geometry?.userData?.turretRingCut && heldBefore.has(o)) { swapped.push([o, o.geometry]); o.geometry = heldBefore.get(o); } });
      const intactTris = collect(root, new Set([turret, plate]));
      for (const [o, g] of swapped) o.geometry = g;
      row.cutMeshes = swapped.map(([o]) => o.name);
      const destroyedTris = collect(root, new Set([turret]));
      const plateStart = destroyedTris.flags.length;
      const plateTris = geometryTris(plate.geometry, plate.matrixWorld, plate.material.side === THREE.DoubleSide ? 1 : 0);
      destroyedTris.pos.push(...plateTris.pos); destroyedTris.flags.push(...plateTris.flags); for (let i = 0; i < plateTris.flags.length; i++) destroyedTris.names.push('PLATE');
      turret.visible = true;
      let holes = 0, holesFar = 0, changed = 0;
      const samples = [];
      const centre = new THREE.Vector3(seat.cx, seat.deckY - 0.3, seat.cz).applyMatrix4(hull.matrixWorld);
      for (const el of [-10, 5, 20, 40, 65]) {
        for (let az = 0; az < 16; az++) {
          const a = (az / 16) * Math.PI * 2, e = (el * Math.PI) / 180;
          const dir = new THREE.Vector3(-Math.sin(a) * Math.cos(e), -Math.sin(e), -Math.cos(a) * Math.cos(e));
          const v = makeView(dir, centre.clone().addScaledVector(dir, -6), seat.rimR + 0.8, 0.02);
          const A = raster(v, intactTris), B = raster(v, destroyedTris);
          for (let p = 0; p < A.zFront.length; p++) {
            if (!(B.zFront[p] > A.zFront[p] + 0.02)) continue;
            changed++;
            if (B.triFront[p] >= plateStart || destroyedTris.names[B.triFront[p]] === 'turretRingPlate') continue;
            // the hull's own deck and fittings inside the race, over it (the ring takes them by design: the verifier's rule)
            {
              const q0 = pixelPoint(v, p, A.zFront[p]).applyMatrix4(hull.matrixWorld.clone().invert());
              if (Math.hypot(q0.x - seat.cx, q0.z - seat.cz) <= seat.rimR + 0.01 && q0.y >= seat.deckY - 0.03) continue;
            }
            holes++;
            if (B.zFront[p] > A.zFront[p] + 0.2) holesFar++;
            if (samples.length < 10) { const q = pixelPoint(v, p, A.zFront[p]); const q1 = Number.isFinite(B.zFront[p]) ? pixelPoint(v, p, B.zFront[p]) : null; samples.push({ el, az, at: [r4(q.x), r4(q.y), r4(q.z)], was: intactTris.names[A.triFront[p]], now: B.triFront[p] >= 0 ? destroyedTris.names[B.triFront[p]] : null, nowAt: q1 ? [r4(q1.x), r4(q1.y), r4(q1.z)] : null, deeper: r4(B.zFront[p] - A.zFront[p]) }); }
          }
        }
      }
      row.exterior = { changedPx: changed, holePx: holes, holeFarPx: holesFar, samples };
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
      if (row.exterior.holePx > 20) failures.push(`${tag}: ${row.exterior.holePx} exterior hole pixels`);
    } else if (row.kind === 'hulk') {
      if (!row.budgetHolds || !row.baseYConsistent) failures.push(`${tag}: placement budget or base`);
      if (row.exterior.holeFarPx > 100) failures.push(`${tag}: ${row.exterior.holeFarPx} exterior hole pixels`);
    }
  }
  console.log(`[turret-ring-probe] ${rows.length} rows, ${failures.length} failure(s)`);
  for (const failure of failures) console.log(`  ${failure}`);
  if (failures.length) process.exit(1);
}

