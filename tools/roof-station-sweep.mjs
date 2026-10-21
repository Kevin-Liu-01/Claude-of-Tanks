#!/usr/bin/env node
// Roof-station moving-mass sweep (2026-10-20, the fleet ZTZ-99A2's QJC-88 swinging through the commander's stabilised
// sight): tools/roof-station-arcs.mjs follows the barrel's axis lines only, so a station whose receiver, shield or
// feed passes through a roof item beside it can still read clear. This sweep poses the whole moving stock instead, as
// the CN track's clearance receipt does (src/vehicles/cnClearance.selftest.mjs check 4): the pitch group (at recoil 0,
// half and full stroke as the presentation applies it, fx/auxiliaryPresentation.ts) and the yaw stage above its foot,
// against every other mesh of its rig, both ways (the moving surface's samples against the fixed stock and the fixed
// stock's samples against the moving surface).
//
//   node tools/roof-station-sweep.mjs --ids=ztz99a2 [--block=0.025] [--keep=0.028] [--json]
//
// Per whole degree of yaw it reports the clearance from level to full elevation (a yaw under `block`, the receipt's
// 25 mm, there is blocked: a depression table cannot lift the barrel) and the deepest depression that keeps `keep`
// (the CN lane's 28 mm: the receipt's 25 mm and a margin for the yaws between the whole degrees). The arc is the clear run
// round the rest bearing, stopped a degree short of each blocked degree, and inside the station's drone-stand arc
// (tools/roof-station-arcs.mjs --dock, from the stand's seat; a stand-limited end then comes in until the stand's own
// whole-arc check clears, a degree short; the stand reads the generated inventory's pivot and collision parts, so
// after the station's geometry moves run tools/vehicle-controls-inventory.mjs --ids=<id> first); the depression table
// covers the yaws where the roof under the barrel stops the weapon's full depression, each degree the smallest of it
// and its neighbours (the authority holds the smaller of two samples between them, src/sim/auxiliarySystems.ts).
import * as THREE from 'three';
import { pathToFileURL } from 'node:url';
import './tank-surface-collect.mjs'; // node canvas shim for the builders' canvas textures
import { uniqueIds } from './id-list.mjs';
import { SurfaceGrid, densePoints } from '../src/vehicles/cnTurretGeometry.test-support.mjs';

const DEG = Math.PI / 180;
const COARSE_M = .03, FINE_M = .015;

/** The rig a station turns with: the turret, or the hull for a hull station. */
function ownerRig(root, station) {
  for (let p = station; p; p = p.parent) if (p.name === 'rig_turret') return p;
  return root.getObjectByName('rig_hull') ?? root;
}

/** The drawn meshes under `obj` outside the `skip` subtrees: no shadow proxies, markings or invisible materials. */
function drawnMeshes(obj, skip = []) {
  const out = [];
  obj.traverseVisible((mesh) => {
    if (!mesh.isMesh || mesh.userData.shadowOnly || /Shadow/.test(mesh.name) || /^vehicleMarking/.test(mesh.name)) return;
    if (!mesh.geometry?.getAttribute('position')) return;
    for (let p = mesh; p; p = p.parent) if (skip.includes(p)) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!materials.some((m) => m && m.visible !== false && m.colorWrite !== false && !(m.transparent && m.opacity < .05))) return;
    out.push(mesh);
  });
  return out;
}

/** The meshes' triangles in the frame whose inverse world matrix is `frameInv` (instances expanded). */
function trianglesIn(meshes, frameInv) {
  const out = [], a = new THREE.Vector3(), m = new THREE.Matrix4(), inst = new THREE.Matrix4();
  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute('position'), index = mesh.geometry.index, n = index ? index.count : pos.count;
    for (let k = 0; k < (mesh.isInstancedMesh ? mesh.count : 1); k++) {
      m.copy(frameInv).multiply(mesh.matrixWorld);
      if (mesh.isInstancedMesh) { mesh.getMatrixAt(k, inst); m.multiply(inst); }
      for (let i = 0; i < n; i++) { a.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(m); out.push(a.x, a.y, a.z); }
    }
  }
  return new Float64Array(out);
}

/** The triangles of a soup reaching the sphere of `radius` round c (vertex or bounding box). */
function trianglesNear(tris, c, radius) {
  const out = [];
  for (let t = 0; t < tris.length; t += 9) {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < 9; k += 3) {
      x0 = Math.min(x0, tris[t + k]); x1 = Math.max(x1, tris[t + k]); y0 = Math.min(y0, tris[t + k + 1]);
      y1 = Math.max(y1, tris[t + k + 1]); z0 = Math.min(z0, tris[t + k + 2]); z1 = Math.max(z1, tris[t + k + 2]);
    }
    const dx = Math.max(x0 - c.x, 0, c.x - x1), dy = Math.max(y0 - c.y, 0, c.y - y1), dz = Math.max(z0 - c.z, 0, c.z - z1);
    if (Math.hypot(dx, dy, dz) <= radius) for (let k = 0; k < 9; k++) out.push(tris[t + k]);
  }
  return new Float64Array(out);
}

const v = new THREE.Vector3();
/** Smallest distance from the points (by M, each moved by `shift` first) to the grid's surface, stopping under `stop`. */
function minDistance(points, M, grid, stop, shift = null) {
  let best = Infinity;
  for (let i = 0; i < points.length; i += 3) {
    v.set(points[i], points[i + 1], points[i + 2]);
    if (shift) v.add(shift);
    v.applyMatrix4(M);
    const d = grid.distance(v.x, v.y, v.z);
    if (d < best) { best = d; if (best < stop) return best; }
  }
  return best;
}

/**
 * One station's moving stock posed against its rig. pose(yaw, el, rc, fine, stop) is the clearance (m) of the pitch
 * group at station yaw `yaw`, elevation `el` (negative: depression) and recoil `rc`; yawStage(yaw, fine, stop) that of
 * the yaw stage above its foot. Coarse poses test the moving surface's 30 mm samples one way; fine poses test 15 mm
 * samples both ways. Distances beyond 65 mm read as 65 mm.
 */
export function stationSweepModel(root, station) {
  root.updateMatrixWorld(true);
  const rig = ownerRig(root, station), rigInv = new THREE.Matrix4().copy(rig.matrixWorld).invert();
  const pitch = station.getObjectByName('auxiliaryWeaponPitch');
  if (!pitch) throw new Error(`${station.name}: no auxiliaryWeaponPitch group`);
  // A riding cradle's gun (auxiliaryWeaponRecoil) recoils alone along its parent's z; any other station recoils its
  // whole pitch group along the station's z (fx/auxiliaryPresentation.ts).
  const riding = pitch.getObjectByName('auxiliaryWeaponRecoil') ?? null, stroke = Number(station.userData.auxiliaryRecoilM);
  const travel = Number.isFinite(stroke) && stroke >= 0 ? stroke : .025;
  const ridingSet = new Set(); riding?.traverse((o) => ridingSet.add(o));
  const pitchSet = new Set(); pitch.traverse((o) => pitchSet.add(o));
  const sInv = new THREE.Matrix4().copy(station.matrixWorld).invert(), pInv = new THREE.Matrix4().copy(pitch.matrixWorld).invert();
  const own = drawnMeshes(station);
  const carriedTris = trianglesIn(own.filter((m) => pitchSet.has(m) && !ridingSet.has(m)), pInv);
  const ridingTris = trianglesIn(own.filter((m) => ridingSet.has(m)), pInv);
  const yawTris = trianglesIn(own.filter((m) => !pitchSet.has(m)), sInv);
  // the recoil direction in the pitch frame: the recoiling object's parent's -z
  const back = riding ? new THREE.Vector3(0, 0, -1).transformDirection(new THREE.Matrix4().copy(pInv).multiply(riding.parent.matrixWorld)) : null;
  // the pitch group's parent in the station frame, and its rest position there (rotation.x is the presentation's)
  const pitchParent = new THREE.Matrix4().copy(sInv).multiply(pitch.parent.matrixWorld), restP = pitch.position.clone();
  const stationRest = new THREE.Matrix4().copy(rigInv).multiply(station.matrixWorld);
  // the yaw stage's foot (the bottom 6 cm, seated on the roof) is not a moving part
  const above = (pts) => { const out = []; for (let i = 0; i < pts.length; i += 3) if (pts[i + 1] > .06) out.push(pts[i], pts[i + 1], pts[i + 2]); return Float64Array.from(out); };
  const samples = (h) => ({ carried: densePoints(carriedTris, h), riding: densePoints(ridingTris, h), yaw: above(densePoints(yawTris, h)) });
  const coarse = samples(COARSE_M), fine = samples(FINE_M);
  const cell = { cell: .04, rq: .065 };
  const carriedGrid = new SurfaceGrid(carriedTris, cell), ridingGrid = ridingTris.length ? new SurfaceGrid(ridingTris, cell) : null;
  const yawGrid = new SurfaceGrid(yawTris, cell);
  // The fixed stock within the moving stock's reach of the pivot (plus recoil and the grid's reach).
  const pivot = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(rigInv).multiply(pitch.matrixWorld));
  const toRig = (M) => new THREE.Matrix4().copy(rigInv).multiply(M);
  let reach = 0;
  for (const [tris, M] of [[carriedTris, toRig(pitch.matrixWorld)], [ridingTris, toRig(pitch.matrixWorld)], [yawTris, toRig(station.matrixWorld)]]) {
    for (let i = 0; i < tris.length; i += 3) reach = Math.max(reach, v.set(tris[i], tris[i + 1], tris[i + 2]).applyMatrix4(M).distanceTo(pivot));
  }
  reach += travel + .07;
  const fixedTris = trianglesNear(trianglesIn(drawnMeshes(rig, [station]), rigInv), pivot, reach);
  const fixedGrid = new SurfaceGrid(fixedTris, cell);
  const near = (() => { const d = densePoints(fixedTris, FINE_M), out = []; for (let i = 0; i < d.length; i += 3) if (Math.hypot(d[i] - pivot.x, d[i + 1] - pivot.y, d[i + 2] - pivot.z) < reach) out.push(d[i], d[i + 1], d[i + 2]); return Float64Array.from(out); })();

  const yawM = (yaw) => new THREE.Matrix4().copy(stationRest).multiply(new THREE.Matrix4().makeRotationY(yaw));
  const q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), at = new THREE.Vector3();
  const pitchM = (yaw, el, rc) => {
    at.copy(restP); if (!riding) at.z -= rc;
    return yawM(yaw).multiply(pitchParent).multiply(new THREE.Matrix4().compose(at, q.setFromEuler(e.set(-el, 0, 0)), one));
  };
  const shift = new THREE.Vector3(), unshift = new THREE.Vector3();
  const pose = (yaw, el, rc, isFine, stop = 0) => {
    const M = pitchM(yaw, el, rc), set = isFine ? fine : coarse;
    let d = minDistance(set.carried, M, fixedGrid, stop);
    if (d < stop) return d;
    if (set.riding.length) { shift.copy(back).multiplyScalar(rc); d = Math.min(d, minDistance(set.riding, M, fixedGrid, stop, shift)); if (d < stop) return d; }
    if (!isFine) return d;
    const Mi = M.clone().invert();
    if (riding) unshift.copy(back).multiplyScalar(-rc);
    for (let i = 0; i < near.length; i += 3) {
      v.set(near[i], near[i + 1], near[i + 2]).applyMatrix4(Mi);
      d = Math.min(d, carriedGrid.distance(v.x, v.y, v.z));
      if (ridingGrid) d = Math.min(d, ridingGrid.distance(v.x + unshift.x, v.y + unshift.y, v.z + unshift.z));
      if (d < stop) return d;
    }
    return d;
  };
  const yawStage = (yaw, isFine, stop = 0) => {
    const S = yawM(yaw);
    let d = minDistance((isFine ? fine : coarse).yaw, S, fixedGrid, stop);
    if (!isFine || d < stop) return d;
    const Si = S.clone().invert();
    for (let i = 0; i < near.length; i += 3) { v.set(near[i], near[i + 1], near[i + 2]).applyMatrix4(Si); if (v.y > .06) d = Math.min(d, yawGrid.distance(v.x, v.y, v.z)); if (d < stop) return d; }
    return d;
  };
  return { pose, yawStage, travel, recoils: travel > 0 ? [0, travel / 2, travel] : [0], ridingCradle: Boolean(riding), reach };
}

/** The pitches from `lo` to `hi` every `step`, both ends included. */
export function pitchSteps(lo, hi, step) { const out = []; for (let p = lo; p < hi - 1e-9; p += step) out.push(p); out.push(hi); return out; }

/**
 * The station's moving mass over an arc and its depression table, as the CN clearance receipt sweeps it (cnClearance
 * check 4): 2-degree yaw steps by 0.05 rad pitch over [-depression(yaw), elevation] one way with 30 mm samples, then
 * at 0.5 degree by 0.0125 rad round every local minimum under 75 mm, at every recoil, each of those poses both ways
 * with 15 mm samples unless its own coarse pose is `keep` + 30 mm clear (a station's race ring rides 75 mm over its
 * cupola at every yaw, so every coarse row is such a minimum). Returns the worst pose {d, yaw, el}; it stops early
 * once a pose is under `stop`.
 */
export function sweepArc(model, arc, depressionAt, elevationRad, { keep = .025, stop = 0 } = {}) {
  const { pose, yawStage, recoils } = model, rows = [];
  let worst = { d: Infinity };
  for (let yaw = arc[0]; yaw <= arc[1] + 1e-9; yaw += 2 * DEG) {
    let best = { d: yawStage(yaw, false, stop), el: null };
    for (const el of pitchSteps(-depressionAt(yaw), elevationRad, .05)) for (const rc of [0, recoils.at(-1)]) {
      const d = pose(yaw, el, rc, false, stop); if (d < best.d) best = { d, el };
    }
    if (best.d < worst.d) worst = { d: best.d, yaw, el: best.el ?? 'yaw stage' };
    if (worst.d < stop) return worst;
    rows.push({ yaw, ...best });
  }
  const minima = rows.filter((r, i) => r.d < .075 && (i === 0 || rows[i - 1].d >= r.d) && (i === rows.length - 1 || rows[i + 1].d >= r.d));
  const screened = (yaw, el, rc) => { const c = pose(yaw, el, rc, false); return c - COARSE_M >= keep ? c : pose(yaw, el, rc, true, stop); };
  const seen = new Set();
  worst = { d: Infinity };
  for (const { yaw: y0, el: e0 } of minima) for (let k = -4; k <= 4; k++) {
    const yaw = Math.min(arc[1], Math.max(arc[0], y0 + k * .5 * DEG)), dp = depressionAt(yaw);
    if (!seen.has(`${yaw}`)) {
      seen.add(`${yaw}`);
      const c = yawStage(yaw, false), dy = c - COARSE_M >= keep ? c : yawStage(yaw, true, stop);
      if (dy < worst.d) worst = { d: dy, yaw, el: 'yaw stage' };
    }
    if (e0 === null) continue;
    for (let j = -4; j <= 4; j++) {
      const el = Math.min(elevationRad, Math.max(-dp, e0 + j * .0125)), key = `${yaw} ${el}`;
      if (seen.has(key)) continue;
      seen.add(key);
      for (const rc of recoils) { const d = screened(yaw, el, rc); if (d < worst.d) worst = { d, yaw, el }; if (worst.d < stop) return worst; }
    }
  }
  // with no pose under 75 mm the coarse sweep's own minimum stands (less its sampling slack)
  if (!minima.length) { const c = rows.reduce((a, b) => (b.d < a.d ? b : a)); worst = { d: c.d - .015, yaw: c.yaw, el: c.el ?? 'yaw stage' }; }
  return worst;
}

/** The runtime's depression at a yaw from a table (src/sim/auxiliarySystems.ts depressionAt). */
export function tableDepression(table, weapon) {
  return (yaw) => {
    if (!table?.length || yaw < table[0][0] || yaw > table.at(-1)[0]) return weapon;
    for (let i = 1; i < table.length; i++) if (yaw <= table[i][0]) return Math.min(weapon, table[i - 1][1], table[i][1]);
    return Math.min(weapon, table.at(-1)[1]);
  };
}

/**
 * Per whole degree from `fromDeg` to `toDeg` (default the full circle): `up`, the clearance from level to full
 * elevation (0.0125 rad steps, every recoil; measured exactly down to `block`, the receipt's 25 mm), and `dep`, the
 * deepest depression (0.0025 rad) keeping `keep` (the CN lane's 28 mm) from level down. Each pose is screened by its
 * coarse pose first: every point of the moving surface lies within 30 mm of a coarse sample, so a coarse pose 30 mm
 * over the threshold is clear, and only the closer ones are measured fine (both ways). Blocked degrees (up < block)
 * end the arc, which stops a degree short of each; degrees outside the measured span count as blocked.
 */
function measureStation(model, profile, { keep = .028, block = .025, fromDeg = -180, toDeg = 179, log = () => {} } = {}) {
  const { pose, yawStage, recoils } = model, rows = [];
  const screened = (yaw, el, rc, need) => { const c = pose(yaw, el, rc, false); return c - COARSE_M >= need ? c : pose(yaw, el, rc, true, need); };
  const upPitches = pitchSteps(0, profile.elevationRad, .0125);
  for (let deg = fromDeg; deg <= toDeg; deg++) {
    const yaw = deg * DEG;
    const stage = yawStage(yaw, false), row = { deg, up: stage - COARSE_M >= block ? stage : yawStage(yaw, true, block), dep: 0 };
    for (const el of upPitches) for (const rc of recoils) if (row.up >= block) row.up = Math.min(row.up, screened(yaw, el, rc, block));
    if (row.up >= block) {
      // from level down: the first 0.0125 rad step under `keep`, then 0.0025 rad steps back up to it
      const ok = (el) => recoils.every((rc) => screened(yaw, el, rc, keep) >= keep);
      let clear = 0;
      for (const el of pitchSteps(0, profile.depressionRad, .0125)) { if (!ok(-el)) break; clear = el; }
      if (clear < profile.depressionRad) for (let el = clear + .0025; el < Math.min(clear + .0125, profile.depressionRad); el += .0025) { if (!ok(-el)) break; clear = el; }
      row.dep = Math.min(profile.depressionRad, Math.floor(clear * 1000 + 1e-6) / 1000);
    }
    rows.push(row);
    log(row);
  }
  const wrap = (d) => ((d + 540) % 360) - 180, measured = new Set(rows.map((r) => r.deg));
  const isBlocked = (d) => !measured.has(wrap(d)) || rows.find((r) => r.deg === wrap(d)).up < block;
  const blocked = rows.filter((r) => r.up < block).map((r) => r.deg);
  if (isBlocked(0)) return { rows, blocked, arcDeg: null };
  let lo = 0, hi = 0;
  while (lo > -359 && !isBlocked(lo - 1)) lo--;
  while (hi < 359 && !isBlocked(hi + 1)) hi++;
  return { rows, blocked, arcDeg: hi - lo >= 359 ? null : [lo + 1, hi - 1] };
}

/** The depression table over an arc (degrees): each degree the smallest of it and its neighbours, from one degree with
 * the weapon's full depression before the first limited degree to one after the last, constant runs closed up. */
function depressionTable(rows, arcDeg, weapon) {
  const depAt = new Map(rows.map((r) => [r.deg, r.dep]));
  const at = (deg) => depAt.get(((deg + 540) % 360) - 180) ?? weapon;
  const degs = []; for (let d = arcDeg[0]; d <= arcDeg[1]; d++) degs.push(d);
  const smooth = degs.map((d) => [d, Math.min(at(d - 1), at(d), at(d + 1))]);
  const limited = smooth.filter(([, dep]) => dep < weapon);
  if (!limited.length) return null;
  const first = smooth.findIndex(([, dep]) => dep < weapon), last = smooth.findLastIndex(([, dep]) => dep < weapon);
  const span = smooth.slice(Math.max(0, first - 1), last + 2);
  const kept = span.filter(([, dep], i) => i === 0 || i === span.length - 1 || dep !== span[i - 1][1] || dep !== span[i + 1][1]);
  return kept.map(([d, dep]) => [Math.round(d * DEG * 1e4) / 1e4, dep]);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const arg = (n, f) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : f; };
  const { createTank } = await import('../src/vehicles/tankFactory.ts');
  const { auxiliaryWeaponProfile } = await import('../src/vehicles/auxiliaryWeapons.ts');
  const { dockClearArcs } = await import('./roof-station-arcs.mjs');
  const { MISSION_ATTACHMENT_SEATS } = await import('../src/sim/missionAttachmentSeats.generated.ts');
  const { missionAttachmentMotionClear } = await import('../src/sim/missionAttachment.ts');
  const { AUXILIARY_INVENTORY } = await import('../src/vehicles/auxiliaryInventory.generated.ts');
  const { TANK_SPECS } = await import('../src/vehicles/specs.ts');
  const keep = Number(arg('keep', '.028')), block = Number(arg('block', '.025')), out = [];
  for (const id of uniqueIds(arg('ids', 'ztz99a2').split(',').filter(Boolean), 'roof-station-sweep --ids')) {
    const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242, decor: true });
    tank.root.updateMatrixWorld(true);
    const stations = [];
    tank.root.traverse((o) => { if (!o.userData.primaryWeapon && o.userData.remoteControlled && o.userData.firingAxis === '+Z' && o.userData.hasWeapon !== false && o.userData.auxiliaryPivot) stations.push(o); });
    for (const station of stations) {
      const profile = auxiliaryWeaponProfile(station.userData.caliberMm || 12.7, id), model = stationSweepModel(tank.root, station);
      // the drone stand's arc (tools/roof-station-arcs.mjs --dock, measured here) still holds: only the yaws inside it
      // (and two degrees past each end, to show what lies there) are measured
      const dock = (MISSION_ATTACHMENT_SEATS[id] ? (await dockClearArcs(id, MISSION_ATTACHMENT_SEATS[id]))[station.name] : null)?.map((r) => Math.round(r / DEG)) ?? null;
      const span = dock ? { fromDeg: dock[0] - 2, toDeg: dock[1] + 2 } : {};
      const m = measureStation(model, profile, { keep, block, ...span, log: (r) => { if (r.up < .085 || r.dep < profile.depressionRad) process.stderr.write(`${r.deg}:${(r.up * 1000).toFixed(0)}/${r.dep.toFixed(3)} `); } });
      process.stderr.write('\n');
      const arcDeg = m.arcDeg && dock ? [Math.max(m.arcDeg[0], dock[0]), Math.min(m.arcDeg[1], dock[1])] : m.arcDeg ?? dock ?? null;
      // The stand's own check sweeps the arc in chunks with conservative boxes (src/sim/missionAttachment.ts
      // missionAttachmentMotionClear, the seat generator's and droneRecon's), so an end at the per-yaw limit can still
      // meet it: each stand-limited end comes in a degree at a time until the whole arc clears, then a degree more.
      if (arcDeg && dock) {
        const gun = AUXILIARY_INVENTORY[id]?.guns.find((g) => g.name === station.name), saved = gun?.yawArc;
        const clear = (a) => { gun.yawArc = a.map((d) => Math.round(d * DEG * 1e4) / 1e4); return missionAttachmentMotionClear({ ...TANK_SPECS[id] }, MISSION_ATTACHMENT_SEATS[id]); };
        try {
          const ends = [0, 1].filter((k) => arcDeg[k] === dock[k]);
          if (gun && ends.length && !clear(arcDeg)) {
            while (!clear(arcDeg) && arcDeg[1] - arcDeg[0] > 2) for (const k of ends) arcDeg[k] += k ? -1 : 1;
            for (const k of ends) arcDeg[k] += k ? -1 : 1;
          }
        } finally { if (gun) { if (saved) gun.yawArc = saved; else delete gun.yawArc; } }
      }
      const runs = [];
      for (const d of m.blocked) { const last = runs.at(-1); if (last && d - last[1] <= 1) last[1] = d; else runs.push([d, d]); }
      const table = arcDeg ? depressionTable(m.rows, arcDeg, profile.depressionRad) : null;
      const yawArc = arcDeg ? arcDeg.map((d) => Math.round(d * DEG * 1e4) / 1e4) : null;
      console.log(`${id} ${station.name} (blocked under ${block * 1000} mm, depression keeping ${keep * 1000} mm, ${model.ridingCradle ? 'riding cradle' : 'whole pitch group'} recoil ${model.travel} m): `
        + `blocked ${runs.map(([a, b]) => `${a}..${b}°`).join(', ') || 'none'}; clear ${m.arcDeg ? `${m.arcDeg[0]}..${m.arcDeg[1]}°` : 'full circle'}`
        + `${dock ? `; drone stand ${dock[0]}..${dock[1]}°` : ''}; arc ${arcDeg ? `${arcDeg[0]}..${arcDeg[1]}° ${JSON.stringify(yawArc)}` : 'full circle'}`
        + `; depression table ${JSON.stringify(table)}`);
      out.push({ id, name: station.name, keep, block, blocked: m.blocked, clearArcDeg: m.arcDeg, dockArcDeg: dock ?? null, arcDeg, yawArc, depressionByYaw: table,
        rows: m.rows.map((r) => ({ deg: r.deg, upMm: Math.round(r.up * 10000) / 10, dep: r.dep })) });
    }
    tank.dispose?.();
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(out));
}
