// One barrel per real gun on a wreck: the measure shared by src/vehicles/wreckGunSingleBarrel.selftest.mjs (a sample of
// gun constructions in npm test) and tools/wreck-barrel-census.mjs (the whole fleet, --gate).
//
// The wreck bends its gun past a stress point (wreckDents.ts planBend) by moving the corners of the gun's meshes: the
// live kill in tankFactoryCore.ts planLiveCrumple, the map hulk in wreckCrumple.ts. A piece is drawn through its
// triangles, so the measure follows the RENDERED surface, not the corners: every drawn piece (a connected component of
// a mesh) is cut at stations along each bore and its cross-section there interpolated through the triangles crossing
// the station, intact and in the wreck, in the gun rig's frame at the wreck's pose (the bend alone; the droop and a
// thrown turret move the whole gun rigidly).
//   strays: a tube concentric with a bore in the barrel's outer half, owned by a rig other than the one carrying that
//           bore's muzzle — it stays behind whenever the gun moves (elevation, the wreck's droop, a thrown turret);
//   poke:   the largest separation the wreck added between two pieces concentric intact, past the room the outer
//           one's wall gives the inner. Above POKE_M one tube leaves the other: two barrels on screen;
//   kink:   the largest distance between a drawn cross-section of the gun's stock and where the kink puts that metal
//           (wreckDents.ts kinkPoint on its intact centre: the plan's own bend, recorded by the live kill on the gun
//           rig as userData.wreckBend, the hulk's from its crumple plan). Above KINK_M the barrel is not bent at its
//           bend point: a chord, a stray piece, or a straight tube under a bent sleeve.
// Every wreck pose: the battle builds (rosterState.ts: the player's high geometry, a desktop bot's low geometry and
// detail LOD, a mobile bot's low geometry), the map hulk (wrecks.ts), each plain and popped (the bend down, or any way
// on a thrown turret), on any seed (the live kill's bend rides the visual's camo seed, the hulk's its wreck seed); a
// battle kill also inside the tank's own shot (strokeS: its cannon out of battery at the kill, the stroke's return and
// the wreck's settle run through syncFromState as in play; WRECK verify 2026-10-16).
import * as THREE from 'three';
import { kinkPoint } from './wreckDents.ts';
import { createTankState } from '../sim/movement.ts';
import { crumpleWreckGeometry, planWreckCrumple, refineForCrumple } from '../world/wreckCrumple.ts';

export const POKE_M = 0.02;
export const KINK_M = 0.01;
const STEP_M = 0.05;

export function triangleList(geometry) {
  const index = geometry.index, n = index ? index.count : geometry.attributes.position.count;
  const out = new Uint32Array(n - (n % 3));
  for (let i = 0; i < out.length; i++) out[i] = index ? index.getX(i) : i;
  return out;
}

function pieceLabels(I, tris) {
  const n = I.length / 3, parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  const weld = new Map();
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(I[i * 3] * 1e4)},${Math.round(I[i * 3 + 1] * 1e4)},${Math.round(I[i * 3 + 2] * 1e4)}`;
    const j = weld.get(key); if (j === undefined) weld.set(key, i); else unite(i, j);
  }
  for (let t = 0; t < tris.length; t += 3) { unite(tris[t], tris[t + 1]); unite(tris[t + 1], tris[t + 2]); }
  return Int32Array.from({ length: n }, (_, i) => find(i));
}

/**
 * The rings of the drawn pieces concentric with a bore (axis x, y; tube-sized for barrel radius r) at stations z0..z1.
 * entries: { I: intact corners, W: rendered corners (both in one frame), tris, name, owner }.
 */
export function boreRings(entries, axis, r, z0, z1) {
  const stations = [];
  for (let z = z0; z < z1; z += STEP_M) stations.push(z);
  const rings = stations.map(() => []);
  for (const e of entries) {
    const label = pieceLabels(e.I, e.tris);
    const sums = stations.map(() => new Map());
    for (let t = 0; t < e.tris.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const a = e.tris[t + k], b = e.tris[t + (k + 1) % 3];
        const za = e.I[a * 3 + 2], zb = e.I[b * 3 + 2], lo = Math.min(za, zb), hi = Math.max(za, zb);
        if (hi - lo < 1e-6) continue;
        for (let s = Math.max(0, Math.ceil((lo - z0) / STEP_M)); s < stations.length && stations[s] < hi; s++) {
          const z = stations[s];
          if (z <= lo) continue;
          const u = (z - za) / (zb - za);
          let acc = sums[s].get(label[a]);
          if (!acc) sums[s].set(label[a], acc = { p: [], w: [0, 0, 0] });
          acc.p.push(e.I[a * 3] + u * (e.I[b * 3] - e.I[a * 3]), e.I[a * 3 + 1] + u * (e.I[b * 3 + 1] - e.I[a * 3 + 1]));
          for (let c = 0; c < 3; c++) acc.w[c] += e.W[a * 3 + c] + u * (e.W[b * 3 + c] - e.W[a * 3 + c]);
        }
      }
    }
    sums.forEach((map, s) => {
      for (const [piece, acc] of map) {
        const n = acc.p.length / 2;
        if (n < 6) continue;
        let cx = 0, cy = 0;
        for (let i = 0; i < acc.p.length; i += 2) { cx += acc.p[i]; cy += acc.p[i + 1]; }
        cx /= n; cy /= n;
        let rr = 0;
        for (let i = 0; i < acc.p.length; i += 2) rr += Math.hypot(acc.p[i] - cx, acc.p[i + 1] - cy);
        rr /= n;
        // within a bore radius of the anchor's line: a muzzle anchor seated off its tube's axis (the T-80 family's, 54 mm
        // above it) still finds its barrel
        if (Math.hypot(cx - axis[0], cy - axis[1]) > Math.max(0.03, r) || rr < 0.5 * r || rr > 3.2 * r) continue;
        rings[s].push({ name: `${e.name}#${piece}`, owner: e.owner, r: rr, c: [cx, cy], w: acc.w.map((v) => v / n), z: stations[s] });
      }
    });
  }
  return rings;
}

/** The worst separation the wreck added between rings concentric intact (m past the outer wall's room). */
export function worstPoke(rings) {
  let worst = { poke: -Infinity, z: null, a: null, b: null };
  let splitM = 0;
  for (const list of rings) {
    let station = -Infinity;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const d = Math.hypot(a.w[0] - b.w[0], a.w[1] - b.w[1], a.w[2] - b.w[2]);
      const poke = d - Math.max(Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]), Math.abs(a.r - b.r));
      station = Math.max(station, poke);
      if (poke > worst.poke) worst = { poke, z: a.z, a: a.name, b: b.name };
    }
    if (station > POKE_M) splitM += STEP_M;
  }
  return { ...worst, splitM };
}

/**
 * The worst distance between a drawn cross-section and its intact centre taken through the kink (`bend` null: kept
 * where it was), and how many cross-sections lie past the kink (the check is not vacuous).
 */
export function worstKink(rings, bend) {
  let worst = { kink: -Infinity, z: null, a: null };
  let past = 0, count = 0;
  const p = new THREE.Vector3();
  for (const list of rings) for (const ring of list) {
    p.set(ring.c[0], ring.c[1], ring.z);
    if (bend) kinkPoint(bend, p);
    const d = Math.hypot(ring.w[0] - p.x, ring.w[1] - p.y, ring.w[2] - p.z);
    count++;
    if (bend && ring.z > bend.z0 + bend.ramp) past++;
    if (d > worst.kink) worst = { kink: d, z: ring.z, a: ring.name };
  }
  return { ...worst, past, count };
}

// the muzzle anchors ride whatever carries them (the recoil group, or the hull on a casemate): ownership is their parents'
const isGunRig = (name) => /^rig_(gun|recoil|barrel_\d+)$/.test(name);
function ownerOf(object, root) {
  for (let n = object; n && n !== root; n = n.parent) {
    if (isGunRig(n.name)) return 'gun';
    if (n.name === 'rig_turret') return 'turret';
    if (n.name === 'rig_hull') return 'hull';
  }
  return 'hull';
}
function chainVisible(object, root) {
  for (let n = object; n; n = n.parent) { if (n.visible === false) return false; if (n === root) return true; }
  return true;
}
/** Drawn plain meshes (instanced and batched stock carries no barrel; shadow proxies are never drawn). */
function drawnMeshes(root) {
  const list = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isBatchedMesh || !o.geometry?.attributes?.position) return;
    if (o.userData.authoredShadowProxy || o.userData.shadowOnly || !chainVisible(o, root)) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m?.colorWrite === false) return;
    list.push(o);
  });
  return list;
}
/** Every seated muzzle (a multi-barrel mount's rig_muzzle_tip_<i>, else rig_muzzle) in the gun frame, with its owner. */
function muzzlesOf(root, gunInv) {
  const out = [];
  let tips = false;
  root.traverse((o) => { if (/^rig_muzzle_tip_\d+$/.test(o.name)) tips = true; });
  root.traverse((o) => {
    if (!(tips ? /^rig_muzzle_tip_\d+$/ : /^rig_muzzle$/).test(o.name)) return;
    const p = o.getWorldPosition(new THREE.Vector3()).applyMatrix4(gunInv);
    if (!out.some((m) => m.p.distanceTo(p) < 0.05)) out.push({ p, owner: ownerOf(o, root) });
  });
  return out;
}
/** How far the cannon stands out of battery: the recoil group's, or a multi-barrel mount's firing tube's, stroke. */
function strokeOf(root) {
  let m = 0;
  root.traverse((o) => { if (/^rig_(recoil|barrel_\d+)$/.test(o.name)) m = Math.max(m, Math.abs(o.position.z)); });
  return m;
}
function toFrame(positions, matrix) {
  const out = new Float32Array(positions.length), v = new THREE.Vector3();
  for (let i = 0; i < positions.length; i += 3) { v.fromArray(positions, i).applyMatrix4(matrix); v.toArray(out, i); }
  return out;
}

/**
 * The battle builds (rosterState.ts battleGeometryQuality and the detail LOD policy), the camo seed the caller's; with
 * geometry-receipt materials, no decoration and no textures (none of them carries gun stock or moves a corner).
 */
export const LIVE_BUILDS = Object.freeze({
  player: Object.freeze({ geometryQuality: 'high', battleDetailLod: false }),
  bot: Object.freeze({ geometryQuality: 'low', battleDetailLod: true }),
  mobile: Object.freeze({ geometryQuality: 'low', battleDetailLod: false }),
});
const liveBuild = (build, seed) => ({ ...LIVE_BUILDS[build], camoSeed: seed, quality: 'low', batchStatic: true,
  eraVisualBindingReceipt: false, proceduralOnly: true, geometryReceipt: true });
/** The map hulk's donor build for a wreck seed (wrecks.ts buildTankWreckSteps). */
export const bakeBuild = (seed) => ({ camoSeed: 4000 + (seed % 997), quality: 'low', geometryQuality: 'low',
  materialMode: 'geometry-only', eraVisualBindingReceipt: false, proceduralOnly: true });
export const WRECK_MODES = Object.freeze([...Object.keys(LIVE_BUILDS), 'bake']);

/** A battle kill inside the tank's own shot: the kill this long after its recoilKick, in the out-of-battery hold. */
export const MID_STROKE_S = 0.12;
/** The frames the wreck runs after a mid-stroke kill (the stroke's return, 0.79 s, and the settle). */
const SETTLE_FRAMES = 150;

/**
 * Build `id`, take its muzzles and the intact stray census, kill it (a battle build: setDestroyed at age 3; 'bake': the
 * hulk's posed, planned, refined and crumpled sequence) and measure each bore. `seed`: the battle visual's camo seed, or
 * the hulk's wreck seed. `strokeS` (a battle build): the kill that long into the tank's own shot (recoilKick, then
 * syncFromState), its cannon out of battery, and SETTLE_FRAMES of syncFromState after it; null kills it in battery. The
 * caller has loaded the builder, the interior fills and the wreck turret driver.
 */
export function measureWreckBarrels(createTank, spec, { mode = 'bot', pop = false, seed = 1, strokeS = null } = {}) {
  if (!WRECK_MODES.includes(mode)) throw new Error(`wreck mode ${mode}: one of ${WRECK_MODES.join(', ')}`);
  if (strokeS !== null && mode === 'bake') throw new Error('a map hulk is baked in battery: strokeS is a battle kill');
  const r = spec.armor.gunBarrel?.radiusM ?? 0.06;
  const tank = createTank(spec.id, null, mode === 'bake' ? bakeBuild(seed) : liveBuild(mode, seed));
  try {
    const root = tank.root;
    // the stroke pose runs the battle visual as play does: settled on its state first
    const state = strokeS === null ? null : createTankState(spec, new THREE.Vector3(), 0);
    if (state) tank.syncFromState(state, 0);
    root.updateMatrixWorld(true);
    const gunG = root.getObjectByName('rig_gun');
    const muzzles = muzzlesOf(root, gunG.matrixWorld.clone().invert());
    const meshes = drawnMeshes(root);
    // strays: intact, every drawn mesh, each bore's outer half
    const gunInv0 = gunG.matrixWorld.clone().invert();
    const intact = meshes.map((mesh) => {
      const I = toFrame(mesh.geometry.attributes.position.array, new THREE.Matrix4().multiplyMatrices(gunInv0, mesh.matrixWorld));
      return { I, W: I, tris: triangleList(mesh.geometry), name: mesh.name || mesh.type, owner: ownerOf(mesh, root) };
    });
    const strays = [];
    for (const m of muzzles) {
      for (const ring of boreRings(intact, [m.p.x, m.p.y], r, 0.5 * m.p.z, m.p.z - 0.02).flat()) {
        if (ring.owner !== m.owner && !strays.some((s) => s.name === ring.name)) strays.push({ name: ring.name, owner: ring.owner, z: +ring.z.toFixed(2) });
      }
    }
    // the kill, measured on the carrier's own stock
    const ownerRigs = new Set(muzzles.map((m) => m.owner));
    const carried = meshes.filter((mesh) => ownerRigs.has(ownerOf(mesh, root)));
    let entries, bend, outOfBatteryM = 0;
    if (mode === 'bake') {
      tank.setDestroyed({ pop, ageS: 1000 });
      root.updateMatrixWorld(true);
      const plan = planWreckCrumple(root, seed, pop);
      bend = plan?.parts.gun?.bend ?? null;
      const rootInv = root.matrixWorld.clone().invert();
      const toGun = new THREE.Matrix4().multiplyMatrices(gunG.matrixWorld.clone().invert(), root.matrixWorld);
      entries = carried.map((mesh) => {
        const clone = mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld));
        const refined = refineForCrumple(plan, clone, mesh);
        const I = Float32Array.from(refined.attributes.position.array);
        crumpleWreckGeometry(plan, refined, mesh);
        return { I: toFrame(I, toGun), W: toFrame(refined.attributes.position.array, toGun), tris: triangleList(refined),
          name: mesh.name || mesh.type, owner: ownerOf(mesh, root) };
      });
    } else {
      if (state) {
        // the tank's own shot, the kill inside its stroke
        tank.recoilKick(0, 1);
        tank.syncFromState(state, strokeS);
        outOfBatteryM = strokeOf(root);
      }
      // the bend writes corners through setXYZ: each corner's value before its first write gives the intact position of
      // every corner of the bent geometry, even of a re-topologized copy
      const before = new WeakMap(), setXYZ = THREE.BufferAttribute.prototype.setXYZ;
      THREE.BufferAttribute.prototype.setXYZ = function (i, x, y, z) {
        let m = before.get(this); if (!m) before.set(this, m = new Map());
        if (!m.has(i)) m.set(i, [this.getX(i), this.getY(i), this.getZ(i)]);
        return setXYZ.call(this, i, x, y, z);
      };
      try { tank.setDestroyed({ pop, ageS: 3 }); } finally { THREE.BufferAttribute.prototype.setXYZ = setXYZ; }
      if (state) for (let i = 0; i < SETTLE_FRAMES; i++) tank.syncFromState(state, 1 / 60);
      bend = gunG.userData.wreckBend ?? null;
      root.updateMatrixWorld(true);
      const gunInv1 = gunG.matrixWorld.clone().invert();
      entries = carried.map((mesh) => {
        const position = mesh.geometry.attributes.position;
        const I = Float32Array.from(position.array);
        for (const [i, v] of before.get(position) ?? []) I.set(v, i * 3);
        const matrix = new THREE.Matrix4().multiplyMatrices(gunInv1, mesh.matrixWorld);
        return { I: toFrame(I, matrix), W: toFrame(position.array, matrix), tris: triangleList(mesh.geometry),
          name: mesh.name || mesh.type, owner: ownerOf(mesh, root) };
      });
    }
    let bendM = 0;
    for (const e of entries) for (let i = 0; i < e.I.length; i += 3) {
      bendM = Math.max(bendM, Math.hypot(e.W[i] - e.I[i], e.W[i + 1] - e.I[i + 1], e.W[i + 2] - e.I[i + 2]));
    }
    const bores = muzzles.map((m) => {
      const rings = boreRings(entries.filter((e) => e.owner === m.owner), [m.p.x, m.p.y], r, 0.35, m.p.z - 0.02);
      const w = worstPoke(rings);
      // the kink acts on the gun rig's stock alone (a casemate's hull-fixed gun takes the hull's dents, not a bend)
      const k = m.owner === 'gun' ? worstKink(rings, bend) : null;
      // where the anchor sits off its tube: the nearest drawn ring's centre at the outermost station that has one
      const last = [...rings].reverse().find((list) => list.length);
      const anchorOffM = last ? Math.min(...last.map((ring) => Math.hypot(ring.c[0] - m.p.x, ring.c[1] - m.p.y))) : null;
      return { muzzleZ: +m.p.z.toFixed(3), owner: m.owner, poke: Number.isFinite(w.poke) ? +w.poke.toFixed(3) : null,
        z: w.z === null ? null : +w.z.toFixed(2), a: w.a, b: w.b, splitM: +w.splitM.toFixed(2),
        kink: k && Number.isFinite(k.kink) ? +k.kink.toFixed(3) : null, kinkZ: k?.z == null ? null : +k.z.toFixed(2),
        kinkPiece: k?.a ?? null, rings: rings.reduce((n, list) => n + list.length, 0), pastKink: k?.past ?? 0,
        anchorOffM: anchorOffM === null ? null : +anchorOffM.toFixed(3) };
    });
    const realGuns = Math.max(1, spec.gun?.muzzles?.length ?? 1);
    const twoBarrels = bores.filter((b) => b.poke !== null && b.poke > POKE_M);
    const offKink = bores.filter((b) => b.kink !== null && b.kink > KINK_M);
    // a gun-rig tube the plan bends must have cross-sections past the kink: its stock really turns there (a launcher's
    // cells, no tube on their one fire anchor, have none anywhere)
    const unbent = bend ? bores.filter((b) => b.owner === 'gun' && b.rings > 0 && b.muzzleZ > bend.z0 + bend.ramp
      && b.pastKink === 0) : [];
    return {
      id: spec.id, mode, pop, seed, strokeS, outOfBatteryM: +outOfBatteryM.toFixed(3), wreckStrokeM: +strokeOf(root).toFixed(3),
      realGuns, muzzles: muzzles.length, bendM: +bendM.toFixed(3),
      bend: bend ? { z0: +bend.z0.toFixed(3), theta: +bend.theta.toFixed(3) } : null, strays, bores,
      // more seated muzzles than real guns is an extra barrel; fewer (a launcher's cells sharing one fire anchor) is not
      pass: muzzles.length <= realGuns && strays.length === 0 && twoBarrels.length === 0 && offKink.length === 0
        && unbent.length === 0,
    };
  } finally {
    tank.dispose();
  }
}
