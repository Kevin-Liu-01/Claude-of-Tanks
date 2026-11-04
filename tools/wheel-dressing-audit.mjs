#!/usr/bin/env node
// Wheel dressing audit (owner 2026-11-04: "be careful of decorating wheels, they have to be part of and move with the
// actual wheels themselves. check all tanks for anything like this").
//
//   node tools/wheel-dressing-audit.mjs [--ids=a,b | --all] [--shard=i/n] [--json=path] [--lines=path] [--gate]
//
// Builds each tank (procedural, high tier), turns its tracks through the tank's own per-frame sync and splits what it
// draws into what moved (the running gear) and what did not. The wheels are the moved wheel layers: road wheels and
// return rollers (instanced) and sprockets and idlers (spinners), each with its hub, outer radius and axial span in the
// hull frame. A static part (one P.add call, named by its authoring line, or a standalone static mesh) is reported when
// any of it lies in a wheel's disc, with how much of it does (frac), how far its innermost point stands off the wheel's
// outer face (gapM) and its middle's distance off the axle (hubM). It is the wheel's — and a defect while it stands still
// — on the rule tankFactoryCore's seatWheelDressing applies: wholly within 3 cm of the rim, from the wheel's inner face
// to 10 cm past its outer face, reaching to within 3.5 cm of that face, and on a road wheel or a roller also on its hub
// (2.5 cm) or its outer face plane, and not touching (5 mm) another static part (a skirt's strip, a swing arm: fixed to
// the hull). --gate exits 1 when any part is (a fixed return-roller shaft is the hull's), or when a
// seated piece did not move.
// --lines appends one JSON row per tank as it finishes and skips the ids already in every all-*.jsonl beside it.
import { appendFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as THREE from 'three';
import './tank-surface-collect.mjs'; // node canvas shim
const { createTank } = await import('../src/vehicles/tankFactory.ts');
const { ALL_TANK_IDS } = await import('../src/vehicles/specs.ts');
const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
let ids = args.includes('--all') ? [...ALL_TANK_IDS] : opt('ids', 'challenger2,m48a5_patton,m1a1').split(',').filter(Boolean);
const shard = opt('shard', null);
if (shard) { const [i, n] = shard.split('/').map(Number); ids = ids.filter((_, k) => k % n === i); }
const lines = opt('lines', null);
if (lines) {
  const done = new Set();
  for (const file of readdirSync(dirname(lines))) {
    if (!/^all-.*\.jsonl$/.test(file)) continue;
    for (const line of readFileSync(join(dirname(lines), file), 'utf8').split('\n')) if (line) done.add(JSON.parse(line).id);
  }
  ids = ids.filter((id) => !done.has(id));
}
// the factory's rule (tankFactoryCore WHEEL_DRESSING_*)
const RIM_M = 0.03, OUTBOARD_M = 0.10, INBOARD_M = 0.005, FACE_GAP_M = 0.035, HUB_M = 0.025, FACE_DEPTH_M = 0.005,
  CONTACT_M = 0.005;

function site() {
  const frames = [];
  for (const line of new Error().stack.split('\n')) {
    const match = /src\/vehicles\/(.+?\.ts):(\d+):\d+/.exec(line);
    if (!match || /^(tankFactoryCore|tankFactory|factoryGeometry)\.ts$/.test(match[1])) continue;
    frames.push(`${match[1]}:${match[2]}`);
    if (frames.length === 2) break;
  }
  return frames.join(' < ') || 'factory';
}
function soup(geometry, matrix) {
  const position = geometry.attributes.position, index = geometry.index;
  if (!position) return new Float64Array(0);
  const count = index ? index.count : position.count, out = new Float64Array(count * 3), v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(position, index ? index.getX(i) : i);
    if (matrix) v.applyMatrix4(matrix);
    out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
  }
  return out;
}
/** A triangle soup's connected pieces (triangles sharing a vertex position, 0.1 mm). */
function pieces(T) {
  const triangles = T.length / 9, parent = Array.from({ length: triangles }, (_, t) => t), first = new Map();
  const find = (t) => { while (parent[t] !== t) t = parent[t] = parent[parent[t]]; return t; };
  for (let v = 0; v < triangles * 3; v++) {
    const key = `${Math.round(T[v * 3] * 1e4)},${Math.round(T[v * 3 + 1] * 1e4)},${Math.round(T[v * 3 + 2] * 1e4)}`;
    const t = (v / 3) | 0, seen = first.get(key);
    if (seen === undefined) first.set(key, t); else parent[find(t)] = find(seen);
  }
  const groups = new Map();
  for (let t = 0; t < triangles; t++) { const root = find(t); (groups.get(root) ?? groups.set(root, []).get(root)).push(t); }
  return [...groups.values()].map((list) => {
    const out = new Float64Array(list.length * 9);
    list.forEach((t, k) => out.set(T.subarray(t * 9, t * 9 + 9), k * 9));
    return out;
  });
}
function shown(object, root) {
  for (let p = object; p && p !== root; p = p.parent) {
    if (!p.visible) return false;
    if (p.parent?.isLOD && p.parent.levels?.[0]?.object !== p) return false;
  }
  return true;
}
function snapshot(root) {
  const out = new Map();
  root.traverse((o) => { if (o.isMesh) out.set(o, Float32Array.from(o.isInstancedMesh ? o.instanceMatrix.array : o.matrixWorld.elements)); });
  return out;
}
const differs = (a, b) => !a || !b || a.length !== b.length || a.some((value, i) => Math.abs(value - b[i]) > 1e-6);
const pose = (l, r) => ({ pos: { x: 0, y: 0, z: 0 }, yaw: 0, visualPitch: 0, visualRoll: 0, yawRate: 0, speed: 4,
  turretYaw: 0, gunPitch: 0, trackScroll: { l, r } });
const kindOf = (o) => o.userData.runningGearEndKind ?? (/ReturnRoller/i.test(o.name) ? 'roller'
  : /RoadWheel/.test(o.name) || o.userData.dynamicWheelFace ? 'road' : null);

const rows = [];
let defects = 0;
for (const id of ids) {
  const parts = [], added = new Map(), buckets = new Set();
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 40;
  let tank;
  try {
    tank = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242,
      partCensus(_bucket, geometry, source) { added.set(geometry, { where: site(), source }); },
      finalPartCensus(bucket, geometry) {
        buckets.add(bucket);
        if (!bucket.startsWith('hull')) return;
        // as the factory: mudguards, module visuals and parts with a job of their own stay the hull's
        const origin = added.get(geometry);
        parts.push({ label: bucket, where: origin?.where ?? 'factory', T: soup(geometry),
          kept: (origin?.source ?? 'add') !== 'add' || Object.keys(geometry.userData).length > 0 });
      } });
  } catch (error) {
    rows.push({ id, error: String(error?.message ?? error) });
    defects++;
    continue;
  } finally { Error.stackTraceLimit = limit; }
  try {
    const root = tank.root, hull = root.getObjectByName('rig_hull');
    tank.syncFromState(pose(0, 0), 1 / 60, 10); root.updateMatrixWorld(true);
    const before = snapshot(root);
    tank.syncFromState(pose(0.37, 0.53), 1 / 60, 10); root.updateMatrixWorld(true);
    const after = snapshot(root);
    tank.syncFromState(pose(0, 0), 1 / 60, 10); root.updateMatrixWorld(true);
    const moved = new Set([...before.keys()].filter((o) => differs(before.get(o), after.get(o))));
    const toHull = new THREE.Matrix4().copy(hull.matrixWorld).invert();
    const wheels = [], box = new THREE.Box3(), instance = new THREE.Matrix4(), matrix = new THREE.Matrix4();
    for (const o of moved) {
      const kind = kindOf(o);
      if (!kind || o.userData.wheelDressing || o.userData.wheelDressingOf || /Spindle/.test(o.name) || !shown(o, root)) continue;
      const base = new THREE.Matrix4().multiplyMatrices(toHull, o.matrixWorld);
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      for (let i = 0; i < (o.isInstancedMesh ? o.count : 1); i++) {
        if (o.isInstancedMesh) { o.getMatrixAt(i, instance); matrix.multiplyMatrices(base, instance); } else matrix.copy(base);
        box.copy(o.geometry.boundingBox).applyMatrix4(matrix);
        if (box.isEmpty()) continue;
        const cy = (box.min.y + box.max.y) / 2, cz = (box.min.z + box.max.z) / 2, side = box.min.x + box.max.x < 0 ? -1 : 1;
        const r = Math.max(box.max.y - box.min.y, box.max.z - box.min.z) / 2;
        let wheel = wheels.find((w) => w.side === side && Math.hypot(w.cy - cy, w.cz - cz) < 0.08);
        if (!wheel) wheels.push(wheel = { side, cy, cz, r: 0, kind, axIn: Infinity, axOut: -Infinity });
        if (r > wheel.r) { wheel.r = r; wheel.cy = cy; wheel.cz = cz; }
        if (kind !== 'road' && wheel.kind === 'road') wheel.kind = kind;
        wheel.axIn = Math.min(wheel.axIn, side > 0 ? box.min.x : -box.max.x);
        wheel.axOut = Math.max(wheel.axOut, side > 0 ? box.max.x : -box.min.x);
      }
    }
    root.traverse((o) => {
      if (!o.isMesh || moved.has(o) || buckets.has(o.name) || !shown(o, root)) return;
      let inHull = false;
      for (let p = o; p; p = p.parent) if (p === hull) { inHull = true; break; }
      if (!inHull || /^vehicleMarking|decal|procShadow|^gearSuspension|^gearTrack|TrackLinks/i.test(o.name)) return;
      const base = new THREE.Matrix4().multiplyMatrices(toHull, o.matrixWorld);
      const label = `mesh:${o.name || o.type}`;
      if (o.isInstancedMesh) {
        for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, instance); parts.push({ label, where: 'instanced', T: soup(o.geometry, matrix.multiplyMatrices(base, instance)) }); }
      } else if (o.userData.runningGear) {
        // a profile's own static running-gear mesh, piece by connected piece (one such mesh spans every end wheel)
        for (const T of pieces(soup(o.geometry, base))) parts.push({ label, where: 'running-gear mesh', T });
      } else parts.push({ label, where: 'mesh', T: soup(o.geometry, base) });
    });
    // each part against each wheel; a part is a wheel's (a defect while static) on the factory's rule, unless it touches
    // a static part reaching outside the wheels (fixed to the hull; a part whose box takes in the hub is too big to say)
    const records = [];
    for (const part of parts) {
      const T = part.T, vertices = T.length / 3;
      if (!vertices) continue;
      const pb = new THREE.Box3();
      for (let j = 0; j < T.length; j += 3) pb.expandByPoint(new THREE.Vector3(T[j], T[j + 1], T[j + 2]));
      part.box = pb;
      for (const wheel of wheels) {
        const reach = wheel.r + RIM_M, lo = wheel.side > 0 ? pb.min.x : -pb.max.x, hi = wheel.side > 0 ? pb.max.x : -pb.min.x;
        if (hi < wheel.axIn - INBOARD_M || lo > wheel.axOut + OUTBOARD_M) continue;
        let inDisc = 0;
        for (let j = 0; j < T.length; j += 3) {
          const ax = T[j] * wheel.side, dy = T[j + 1] - wheel.cy, dz = T[j + 2] - wheel.cz;
          if (ax >= wheel.axIn - INBOARD_M && ax <= wheel.axOut + OUTBOARD_M && dy * dy + dz * dz <= reach * reach) inDisc++;
        }
        if (!inDisc) continue;
        const frac = inDisc / vertices, gapM = lo - wheel.axOut;
        const hubM = Math.hypot((pb.min.y + pb.max.y) / 2 - wheel.cy, (pb.min.z + pb.max.z) / 2 - wheel.cz);
        const sy = pb.max.y - pb.min.y, sz = pb.max.z - pb.min.z;
        const ring = Math.abs(sy - sz) <= 0.1 * Math.max(sy, sz) && wheel.cy > pb.min.y && wheel.cy < pb.max.y
          && wheel.cz > pb.min.z && wheel.cz < pb.max.z;
        const belongs = frac === 1 && gapM <= FACE_GAP_M && !part.kept && !/Spindle/.test(part.label)
          && (wheel.kind === 'sprocket' || wheel.kind === 'idler' || hubM <= HUB_M || ring || hi >= wheel.axOut - FACE_DEPTH_M);
        records.push({ part, wheel, frac, gapM, hubM, belongs });
      }
    }
    const candidates = new Map();
    for (const record of records) {
      if (!record.belongs) continue;
      const held = candidates.get(record.part);
      if (!held || record.hubM < held.hubM) candidates.set(record.part, record);
    }
    const grown = new THREE.Box3(), triangle = new THREE.Triangle(), tb = new THREE.Box3(), p = new THREE.Vector3(), q = new THREE.Vector3();
    // some vertex of a part within CONTACT_M of a triangle of another (both soups in the hull frame)
    const touches = (a, b) => {
      for (let t = 0; t < b.T.length; t += 9) {
        triangle.a.fromArray(b.T, t); triangle.b.fromArray(b.T, t + 3); triangle.c.fromArray(b.T, t + 6);
        tb.setFromPoints([triangle.a, triangle.b, triangle.c]).expandByScalar(CONTACT_M);
        if (!tb.intersectsBox(grown)) continue;
        for (let j = 0; j < a.T.length; j += 3) {
          p.fromArray(a.T, j);
          if (tb.containsPoint(p) && triangle.closestPointToPoint(p, q).distanceToSquared(p) <= CONTACT_M * CONTACT_M) return true;
        }
      }
      return false;
    };
    for (let changed = true; changed;) {
      changed = false;
      for (const [part] of candidates) {
        grown.copy(part.box).expandByScalar(CONTACT_M);
        const fixed = parts.some((other) => other !== part && other.box && !candidates.has(other)
          && other.box.intersectsBox(grown) && touches(part, other));
        if (fixed) { candidates.delete(part); changed = true; }
      }
    }
    const hits = new Map();
    for (const { part, wheel, frac, gapM, hubM } of records) {
      const defect = candidates.get(part)?.wheel === wheel;
      const key = `${part.label}|${part.where}|${wheel.kind}|${defect}`;
      const hit = hits.get(key) ?? { label: part.label, where: part.where, kind: wheel.kind, defect, parts: 0,
        maxFrac: 0, minGapM: Infinity, minHubM: Infinity };
      hit.parts++;
      hit.maxFrac = Math.max(hit.maxFrac, +frac.toFixed(3));
      hit.minGapM = Math.min(hit.minGapM, +gapM.toFixed(4));
      hit.minHubM = Math.min(hit.minHubM, +hubM.toFixed(4));
      hits.set(key, hit);
    }
    const list = [...hits.values()].sort((a, b) => Number(b.defect) - Number(a.defect) || b.parts - a.parts);
    const seated = [];
    root.traverse((o) => { if (o.userData.wheelDressing || o.userData.wheelDressingOf) seated.push({ name: o.name, of: o.userData.wheelDressingOf, moved: moved.has(o) }); });
    const stuck = seated.filter((s) => !s.moved).length;
    const found = list.filter((h) => h.defect).length + stuck;
    defects += found;
    rows.push({ id, wheels: wheels.length, defects: found, seated, hits: list });
    if (lines) appendFileSync(lines, `${JSON.stringify(rows.at(-1))}\n`);
    console.log(`${id}: ${wheels.length} wheels, ${seated.length} seated dressing object(s)${stuck ? ` (${stuck} NOT MOVING)` : ''}, `
      + `${found} static dressing defect(s)${found ? ` — ${list.filter((h) => h.defect).slice(0, 3).map((h) => `${h.kind}: ${h.where} ${h.label}`).join('; ')}` : ''}`);
  } catch (error) {
    rows.push({ id, error: String(error?.stack ?? error) });
    defects++;
    console.log(`${id}: ERROR ${error?.message ?? error}`);
  } finally { tank.dispose?.(); }
}
const json = opt('json', null);
if (json) writeFileSync(json, JSON.stringify(rows, null, 1));
console.log(`wheel-dressing-audit: ${rows.length} tank(s), ${defects} defect(s)`);
if (args.includes('--gate') && defects) process.exit(1);
