#!/usr/bin/env node
// Wheel dressing audit (owner 2026-11-04: "be careful of decorating wheels, they have to be part of and move with the
// actual wheels themselves. check all tanks for anything like this").
//
//   node tools/wheel-dressing-audit.mjs [--ids=a,b | --all] [--shard=i/n] [--json=path] [--lines=path] [--motion] [--gate]
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
import { uniqueIds } from './id-list.mjs';
const { createTank } = await import('../src/vehicles/tankFactory.ts');
const { ALL_TANK_IDS } = await import('../src/vehicles/specs.ts');
const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
let ids = args.includes('--all') ? [...ALL_TANK_IDS] : uniqueIds(opt('ids', 'challenger2,m48a5_patton,m1a1').split(',').filter(Boolean));
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

// --motion (Main 2026-11-04: "prove the class in motion, not only at rest"): every dressing must hold its place in its
// own wheel's frame while the gear turns through several track angles and every road wheel goes to full bump and full
// droop: alternate wheels on +/-0.5 m ground (the taut track holds a dropped wheel between raised ones), then one whole
// side up and the other down, and swapped (a side lowered as one droops to the gear's limit). On a built fix the
// dressing is the seated pieces; on a tree without it, the static parts the rule calls a wheel's (the negative control:
// they stay put while the wheel turns).
const MOTION_POSES = [[0, 'flat'], [0.13, 'flat'], [0.47, 'alternate'], [0.9, 'alternateSwapped'], [1.1, 'leftUp'],
  [2.9, 'rightUp'], [4.3, 'flat']];
const MOTION_HOLD_M = 0.002;
const corners = (box, matrix) => {
  const out = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    out.push(new THREE.Vector3(x, y, z).applyMatrix4(matrix));
  }
  return out;
};
function motionCheck(tank, root, hull, items) {
  // each road wheel's and roller's tyre instance and each sprocket and idler body, in the hull frame, as posed now
  const frames = () => {
    const toHull = new THREE.Matrix4().copy(hull.matrixWorld).invert(), out = [], m = new THREE.Matrix4();
    root.traverse((o) => {
      if (o.isInstancedMesh && /^gear(RoadWheel|ReturnRoller)Tires$/.test(o.name)) {
        const base = new THREE.Matrix4().multiplyMatrices(toHull, o.matrixWorld);
        for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); out.push({ key: `${o.name}#${i}`, matrix: new THREE.Matrix4().multiplyMatrices(base, m) }); }
      } else if (o.isMesh && !o.isInstancedMesh && o.name === 'gearEndWheelBody' && o.userData.runningGearEndKind) {
        out.push({ key: `${o.userData.runningGearEndKind}#${o.position.x < 0 ? 'L' : 'R'}`, matrix: new THREE.Matrix4().multiplyMatrices(toHull, o.matrixWorld) });
      }
    });
    return out;
  };
  const drive = (scroll, ground, hubZs) => {
    tank.setGroundSampler(ground === 'flat' ? () => 0 : (x, z) => {
      if (ground === 'leftUp' || ground === 'rightUp') return (x < 0) === (ground === 'leftUp') ? 0.5 : -0.5;
      let best = 0, d = Infinity;
      hubZs.forEach((hz, i) => { if (Math.abs(hz - z) < d) { d = Math.abs(hz - z); best = i; } });
      return (best % 2 === 0) === (ground === 'alternate') ? 0.5 : -0.5;
    });
    for (let frame = 0; frame < 90; frame++) tank.syncFromState(pose(scroll, scroll), 1 / 60, 10);
    root.updateMatrixWorld(true);
  };
  drive(0, 'flat', []);
  const rest = frames(), hubZs = [...new Set(rest.filter((f) => /Road/.test(f.key))
    .map((f) => Math.round(new THREE.Vector3().setFromMatrixPosition(f.matrix).z * 1e3) / 1e3))].sort((a, b) => a - b);
  // each item's own wheel: the nearest hub on its side at rest
  const own = items.map((item) => {
    const points = item.points(), c = points.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(points.length);
    let best = null, d = Infinity;
    for (const f of rest) {
      const hub = new THREE.Vector3().setFromMatrixPosition(f.matrix);
      if (Math.sign(hub.x) !== Math.sign(c.x)) continue;
      const dd = hub.distanceTo(c);
      if (dd < d) { d = dd; best = f.key; }
    }
    return best;
  });
  const local = [];
  let failed = 0, maxDevM = 0;
  const results = items.map(() => ({ devM: 0 }));
  // the travel the poses reach: each road wheel's hub height against its rest height
  const restY = new Map(rest.filter((f) => /Road/.test(f.key)).map((f) => [f.key, f.matrix.elements[13]]));
  let bumpM = 0, droopM = 0;
  for (const [scroll, ground] of MOTION_POSES) {
    drive(scroll, ground, hubZs);
    const posed = frames();
    for (const f of posed) {
      if (!restY.has(f.key)) continue;
      const dy = f.matrix.elements[13] - restY.get(f.key);
      bumpM = Math.max(bumpM, dy); droopM = Math.max(droopM, -dy);
    }
    const byKey = new Map(posed.map((f) => [f.key, f.matrix]));
    items.forEach((item, i) => {
      const frame = byKey.get(own[i]);
      if (!frame) { results[i].devM = Infinity; return; }
      const inverse = new THREE.Matrix4().copy(frame).invert();
      const pts = item.points().map((p) => p.applyMatrix4(inverse));
      if (!local[i]) { local[i] = pts; return; }
      // an arm does not turn with its wheel: its axle end keeps its distance from the axle
      const off = (p) => Math.hypot(p.y, p.z);
      pts.forEach((p, k) => {
        results[i].devM = Math.max(results[i].devM, item.arm ? Math.abs(off(p) - off(local[i][k])) : p.distanceTo(local[i][k]));
      });
    });
  }
  drive(0, 'flat', []);
  items.forEach((item, i) => {
    maxDevM = Math.max(maxDevM, results[i].devM);
    if (results[i].devM > MOTION_HOLD_M) { failed++; item.devM = +results[i].devM.toFixed(4); item.wheel = own[i]; }
  });
  return { items: items.length, failed, maxDevM: +maxDevM.toFixed(5), bumpM: +bumpM.toFixed(3), droopM: +droopM.toFixed(3),
    worst: items.filter((item) => item.devM !== undefined).sort((a, b) => b.devM - a.devM).slice(0, 5)
      .map(({ label, devM, wheel }) => ({ label, devM, wheel })) };
}

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
      if (!o.isMesh || moved.has(o) || buckets.has(o.name) || o.userData.wheelArm || !shown(o, root)) return;
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
    // --arms: static hull parts that reach from a road wheel's hub out to a pivot (a suspension arm drawn by a profile)
    let arms = null;
    if (args.includes('--arms')) {
      arms = [];
      for (const part of parts) {
        if (!part.box || part.kept || candidates.has(part)) continue;          // dressing is the wheel's, not an arm
        for (const wheel of wheels) {
          if (wheel.kind !== 'road') continue;
          const lo = wheel.side > 0 ? part.box.min.x : -part.box.max.x, hi = wheel.side > 0 ? part.box.max.x : -part.box.min.x;
          if (hi > wheel.axOut + 0.02 || hi < wheel.axIn - 0.10 || hi - lo > 0.15) continue;   // a bar reaching the wheel
          let near = Infinity, far = 0, nearPoint = null;
          for (let j = 0; j < part.T.length; j += 3) {
            const r = Math.hypot(part.T[j + 1] - wheel.cy, part.T[j + 2] - wheel.cz);
            if (r < near) { near = r; nearPoint = new THREE.Vector3(part.T[j], part.T[j + 1], part.T[j + 2]); }
            far = Math.max(far, r);
          }
          if (near > Math.max(0.06, 0.25 * wheel.r) || far < 0.6 * wheel.r || far > 1.2) continue;
          arms.push({ where: part.where, label: part.label, nearPoint, wheel: `${wheel.side < 0 ? 'L' : 'R'} z${wheel.cz.toFixed(2)}`,
            nearM: +near.toFixed(3), farM: +far.toFixed(3), lo: +(lo - wheel.axOut).toFixed(3), hi: +(hi - wheel.axOut).toFixed(3) });
        }
      }
    }
    let motion = null;
    if (args.includes('--motion')) {
      // the seated pieces (each instance of a layer) and the static parts the rule calls a wheel's
      const items = [], m = new THREE.Matrix4();
      root.traverse((o) => {
        if (!(o.userData.wheelDressing || o.userData.wheelDressingOf)) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        for (let i = 0; i < (o.isInstancedMesh ? o.count : 1); i++) {
          items.push({ label: `seated:${o.name}${o.isInstancedMesh ? `#${i}` : ''}`, points: () => {
            const base = new THREE.Matrix4().copy(hull.matrixWorld).invert().multiply(o.matrixWorld);
            if (o.isInstancedMesh) { o.getMatrixAt(i, m); base.multiply(m); }
            return corners(o.geometry.boundingBox, base);
          } });
        }
      });
      for (const [part, { wheel }] of candidates) {
        const box = part.box;
        items.push({ label: `static:${part.where} ${part.label} (${wheel.kind})`, points: () => corners(box, new THREE.Matrix4()) });
      }
      root.traverse((o) => {
        if (!o.userData.wheelArm) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const x = (o.geometry.boundingBox.min.x + o.geometry.boundingBox.max.x) / 2;
        items.push({ arm: true, label: `arm:${o.name}`, points: () => [new THREE.Vector3(x, 0, o.userData.wheelArmLengthM)
          .applyMatrix4(new THREE.Matrix4().copy(hull.matrixWorld).invert().multiply(o.matrixWorld))] });
      });
      for (const arm of arms ?? []) {
        // a static arm-like part (the negative control): its point nearest the axle
        items.push({ arm: true, label: `static arm:${arm.where} ${arm.label}`, points: () => [arm.nearPoint.clone()] });
      }
      motion = motionCheck(tank, root, hull, items);
    }
    const found = list.filter((h) => h.defect).length + stuck + (motion?.failed ?? 0) + (arms?.length ?? 0);
    defects += found;
    rows.push({ id, wheels: wheels.length, defects: found, seated, hits: list, ...(motion ? { motion } : {}), ...(arms ? { arms } : {}) });
    if (arms) console.log(`${id}: ${arms.length} arm-like static part(s) at road-wheel hubs${arms.length ? ` — ${[...new Set(arms.map((a) => `${a.where} ${a.label}`))].slice(0, 4).join('; ')}` : ''}`);
    if (lines) appendFileSync(lines, `${JSON.stringify(rows.at(-1))}\n`);
    console.log(`${id}: ${wheels.length} wheels, ${seated.length} seated dressing object(s)${stuck ? ` (${stuck} NOT MOVING)` : ''}, `
      + `${found} static dressing defect(s)${found ? ` — ${list.filter((h) => h.defect).slice(0, 3).map((h) => `${h.kind}: ${h.where} ${h.label}`).join('; ')}` : ''}`
      + (motion ? `; in motion ${motion.items - motion.failed}/${motion.items} held on their wheel (worst drift `
        + `${(motion.maxDevM * 1000).toFixed(1)} mm; wheels to ${(motion.bumpM * 100).toFixed(1)} cm bump, ${(motion.droopM * 100).toFixed(1)} cm droop)` : ''));
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
