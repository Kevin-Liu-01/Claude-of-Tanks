// The set-piece library (the landmarks lane, 2026-10-05): every kind builds sound, bounded, honest geometry, and the
// props pass places it as the contract says.
//
//   - the registry: every kind the plan lists has a builder, and no builder is unlisted;
//   - each kind (its defaults and its authored variants): deterministic (two builds byte-identical), finite, one
//     attribute set per bucket (vertex colours in the coloured buckets, the night mask on curtain panes), every part
//     grounded through a chain of contacts (structureAssemblyAudit), a triangle budget per kind and tier (the phones build
//     exactly the desktop's coarse parts and no fine dressing), a collision profile within the 64-part band cap that the
//     phones share, and a footprint (plan.ts) that holds the whole piece — the vegetation clearance and the reserved
//     ground cover what stands;
//   - gates: the passage stays open — no ground-contact part stands on the road between the piers — while the shell
//     bands meet the arch over it;
//   - bridges over a gully: the deck is a standable floor all along the span, its ends meet the banks within a hull's
//     step, a hull on it mounts every deck part, the parapets or trusses hold its edges, and a hull in the gully meets
//     the piers;
//   - the composer: a flat world places a church and a square (with its centre piece, benches and lamps), reserves their
//     ground, publishes their footprints, and refuses a piece on a spawn pad, on an objective disc, in a road core or
//     on a hard solid — and a map without set pieces runs nothing;
//   - the authoring maps: every authored piece resolves, its static admission passes, and the committed collision shard
//     carries its structure record (it stood when the shard was captured).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { LANDMARK_BUILDERS } from './index.ts';
import { LANDMARK_KINDS, landmarkClearances, landmarkFootprint, resolveLandmarkParams } from './plan.ts';
import { composeLandmarks, hasStructure, landmarkObjectiveDiscs } from './compose.ts';
import { REGIONAL_BUCKETS, streamFrom } from '../maps/regional/geometry.ts';
import { auditStructureAssembly } from '../maps/structureAssemblyAudit.ts';
import { deriveRuntimeStructureCollisionProfile, deriveRuntimeStructureShellBands } from '../structureCollision.ts';
import { HULL_STANDABLE_HEIGHT_M, HULL_STEP_UP_M, hullPassesObstacleTop, pointInsideCollisionRecord } from '../collision.ts';
import { NIGHT_EMISSION_ATTRIBUTE } from '../../engine/nightEmissionMaterial.ts';
import { MAP_IDS, getMapConfig } from '../maps/index.ts';
import { createHeightField } from '../terrain.ts';
import { decodeCollisionManifest } from '../../../server/collisionManifestCodec.ts';
import { RAIL_SPUR_BERTH_M } from '../railSpurs.ts';

/** The least distance from a packed shard record's parts to a polyline (0 when a part covers a path point). */
function recordGapToPath(record, path) {
  const shape = record.s;
  const parts = !shape ? [['v', record.b[0], record.b[2], record.b[3], record.b[2], record.b[3], record.b[5], record.b[0], record.b[5]]]
    : shape[0] === 'm' ? shape.slice(1) : [shape];
  let best = Infinity;
  for (const part of parts) {
    let poly;
    if (part[0] === 'c') {
      const [, cx, cz, r] = part;
      best = Math.min(best, Math.max(0, pathDistance(path, cx, cz) - r));
      continue;
    }
    if (part[0] === 'o') {
      const [, cx, cz, hw, hl, yaw] = part, c = Math.cos(yaw), s = Math.sin(yaw);
      poly = [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]].map(([lx, lz]) => [cx + lx * c + lz * s, cz - lx * s + lz * c]);
    } else {
      const numbers = part[0] === 'w' ? part.slice(3) : part.slice(1);
      poly = []; for (let i = 0; i < numbers.length; i += 2) poly.push([numbers[i], numbers[i + 1]]);
    }
    best = Math.min(best, polygonGapToPath(poly, path));
  }
  return best;
}
function segmentDistance(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}
function pathDistance(path, x, z) {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) best = Math.min(best, segmentDistance(x, z, path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]));
  return best;
}
function polygonGapToPath(poly, path) {
  const inside = (x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
  if (path.some(([x, z]) => inside(x, z))) return 0;
  let best = Infinity;
  for (const [x, z] of poly) best = Math.min(best, pathDistance(path, x, z));
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) for (const [x, z] of path) best = Math.min(best, segmentDistance(x, z, poly[j][0], poly[j][1], poly[i][0], poly[i][1]));
  return best;
}

const KINDS = Object.keys(LANDMARK_KINDS);
assert.deepEqual(Object.keys(LANDMARK_BUILDERS).sort(), [...KINDS].sort(), 'every planned kind has a builder, and every builder is planned');

/** Desktop triangle budgets by kind (the phones build the coarse share of the same). */
const BUDGET = {
  church: 16000, stationHall: 13000, townHall: 10000, marketHall: 8000, grainElevator: 9000, granary: 2500,
  waterTower: 6000, windmill: 8000, belfry: 4000, campanile: 3000, fireLookout: 5000, valveTower: 4000,
  obelisk: 4500, statue: 1500, columnMonument: 1500, memorialWall: 2000, equestrianStatue: 1500,
  fountain: 3000, bandstand: 5000, parkGate: 4000, parkSquare: 12000,
  townGate: 4000, triumphalArch: 7000, kolkhozArch: 2500, torii: 1000,
  stoneArchBridge: 4000, trussBridge: 4000, trestleBridge: 4000, baileyBridge: 4000, viaduct: 4000, liftBridge: 6000,
  aircraftWreck: 9000, colonialBungalow: 14000, tennisCourt: 5000, bengalTemple: 9000,
};
assert.deepEqual(Object.keys(BUDGET).sort(), [...KINDS].sort(), 'a budget for every kind');
/** The authored variants each kind is built in besides its defaults. */
const VARIANTS = {
  church: [{ domes: 5, crown: 'onion' }, { tradition: 'western', length: 32, width: 12, tower: 40 }, { tradition: 'western', crown: 'helm', walls: 'render' }],
  windmill: [{ style: 'post' }, { style: 'tower', height: 20 }],
  waterTower: [{ style: 'rozhnovsky', height: 22 }, { style: 'trestle' }],
  townHall: [{ frame: true, width: 20, depth: 12, storeys: 3, tower: 28 }],
  belfry: [{ crown: 'tent' }, { crown: 'needle' }, { crown: 'helm' }],
  obelisk: [{ finial: 'cross', railing: false }, { finial: 'ball', height: 14 }],
  statue: [{ metal: 'silver', pose: 'robe' }],
  parkSquare: [{ centre: 'obelisk', railing: 'picket' }, { paths: 'ring', centre: 'fountain' }, { paths: 'diagonal', railing: false }],
  triumphalArch: [{ arches: 3 }],
  granary: [{ walls: 'timber' }],
  trussBridge: [{ spans: 2, span: 60 }],
};
const COLOURED = new Set(['structureMetal', 'structureWood', 'regionalPlaster', 'regionalPlaster2', 'regionalPlaster3', 'regionalStone', 'regionalRoof']);

function build(kind, params, { seed = 11, tier = 'desktop', ground, groundFall = 0 } = {}) {
  const resolved = resolveLandmarkParams({ kind, x: 0, z: 0, params });
  return LANDMARK_BUILDERS[kind]({ kind, params: resolved, rng: streamFrom(seed), variant: streamFrom(seed * 7 + 3), tier, groundFall,
    brick: false, snowCap: false, mapId: 'selftest', ground });
}
/** A band's parts within the packed manifest's limits (server/collisionManifestFormat.ts): 64 parts, 64 corners each. */
function packedBandsOk(profile, label) {
  for (const band of [profile.contact, ...profile.shell]) {
    assert.ok(band.parts.length <= 64, `${label}: a band within the 64-part cap`);
    for (const part of band.parts) if (part.points) assert.ok(part.points.length <= 128, `${label}: a band part within 64 corners (${part.points.length / 2})`);
  }
}
const geometries = (parts) => REGIONAL_BUCKETS.flatMap((name) => parts[name] ?? []);
const triangles = (parts) => geometries(parts).reduce((n, g) => n + g.getAttribute('position').count / 3, 0);
const positions = (parts) => REGIONAL_BUCKETS.map((name) => (parts[name] ?? []).map((g) => Array.from(g.getAttribute('position').array)));
function dropFine(parts) {
  const out = {};
  for (const name of REGIONAL_BUCKETS) out[name] = (parts[name] ?? []).filter((g) => !g.userData.fine);
  return out;
}

let built = 0, total = 0;
/** Every failure, reported together (a kind's first broken law; the rest of its laws and every other kind still run). */
const failures = [];
const check = (label, fn) => { try { fn(); } catch (error) { failures.push(`${label}: ${error.message}`); } };
for (const kind of KINDS) {
  for (const params of [{}, ...(VARIANTS[kind] ?? [])]) check(`${kind} ${JSON.stringify(params)}`, () => {
    const label = `${kind} ${JSON.stringify(params)}`;
    const a = build(kind, params), b = build(kind, params);
    assert.deepEqual(positions(a.parts), positions(b.parts), `${label}: deterministic`);
    for (const name of REGIONAL_BUCKETS) {
      for (const g of a.parts[name] ?? []) {
        const pos = g.getAttribute('position');
        assert.ok(pos.count > 0 && pos.count % 3 === 0, `${label}/${name}: whole triangles`);
        assert.ok(Array.from(pos.array).every(Number.isFinite), `${label}/${name}: finite positions`);
        assert.equal(!!g.getAttribute('color'), COLOURED.has(name), `${label}/${name}: vertex colours exactly in the coloured buckets`);
        if (name === 'curtain') assert.ok(g.getAttribute(NIGHT_EMISSION_ATTRIBUTE), `${label}: curtain panes carry the night mask`);
        assert.equal(g.userData.regional, true, `${label}/${name}: regional tags (the props merge reads them)`);
        if (g.userData.fine) assert.equal(g.userData.noCollision, true, `${label}/${name}: fine parts are dressing`);
      }
    }
    const tris = triangles(a.parts);
    assert.ok(tris <= BUDGET[kind], `${label}: ${tris} triangles within ${BUDGET[kind]}`);
    const mobile = build(kind, params, { tier: 'mobile' });
    // the composer drops a phone's fine dressing (compose.ts): what remains is exactly the desktop's coarse share
    assert.equal(triangles(dropFine(mobile.parts)), triangles(dropFine(a.parts)), `${label}: a phone keeps every coarse part`);
    assert.ok(triangles(dropFine(a.parts)) <= tris, `${label}: the coarse share within the desktop's`);
    const audit = auditStructureAssembly(a.parts);
    assert.equal(audit.unsupportedParts, 0, `${label}: every part reaches the ground through contacts`);
    // the collision: derivable, within the band cap, the same on a phone
    if (hasStructure(a.parts)) {
      const profile = a.movement ? { contact: { parts: a.movement }, shell: deriveRuntimeStructureShellBands(a.parts) } : deriveRuntimeStructureCollisionProfile(a.parts);
      assert.ok(profile.contact.parts.length >= 1, `${label}: a movement footprint`);
      packedBandsOk(profile, label);
      // seated on falling ground the bands slice the piece at other heights (a water tower's turned tank once sliced into
      // a 272-corner loop at Verdant's station seat): the packed limits hold there too
      for (const groundFall of [0.7, 1.33, 2.6]) {
        const sloped = build(kind, params, { groundFall });
        if (!hasStructure(sloped.parts)) continue;
        packedBandsOk(sloped.movement ? { contact: { parts: sloped.movement }, shell: deriveRuntimeStructureShellBands(sloped.parts) }
          : deriveRuntimeStructureCollisionProfile(sloped.parts), `${label} on a ${groundFall} m fall`);
      }
      const mobileProfile = mobile.movement ? { contact: { parts: mobile.movement }, shell: deriveRuntimeStructureShellBands(dropFine(mobile.parts)) }
        : deriveRuntimeStructureCollisionProfile(dropFine(mobile.parts));
      assert.equal(JSON.stringify(mobileProfile), JSON.stringify(profile), `${label}: mobile collision equals desktop`);
    } else {
      assert.equal(kind, 'parkSquare', `${label}: only a square is all dressing`);
    }
    // the footprint holds the piece (its vegetation clearance and reserved ground cover what stands)
    const [hw, hl] = landmarkFootprint({ kind, x: 0, z: 0, params });
    let mx = 0, mz = 0;
    for (const g of geometries(a.parts)) {
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) { mx = Math.max(mx, Math.abs(p.getX(i))); mz = Math.max(mz, Math.abs(p.getZ(i))); }
    }
    assert.ok(mx <= hw + 0.6 && mz <= hl + 0.6, `${label}: the piece (±${mx.toFixed(2)}, ±${mz.toFixed(2)}) stands in its footprint (±${hw.toFixed(2)}, ±${hl.toFixed(2)})`);
    for (const g of [...geometries(a.parts), ...geometries(b.parts), ...geometries(mobile.parts)]) g.dispose();
    built++; total += tris;
  });
}

// ---------------------------------------------------------------------------------------------------------- gates
for (const kind of ['kolkhozArch', 'townGate', 'triumphalArch', 'torii', 'parkGate']) check(`${kind} passage`, () => {
  const { parts } = build(kind, {});
  const contact = deriveRuntimeStructureCollisionProfile(parts).contact;
  const record = { min: [-100, -10, -100], max: [100, 100, 100] };
  // the passage's centreline from the front to the back of the footprint (a road runs through it)
  const [, hl] = landmarkFootprint({ kind, x: 0, z: 0 });
  for (let z = -hl; z <= hl; z += 0.25) {
    for (const x of [-1.2, 0, 1.2]) {
      assert.ok(!contact.parts.some((part) => pointInsideCollisionRecord(record, part, x, z)), `${kind}: the passage at (${x}, ${z.toFixed(2)}) is clear of every ground-contact part`);
    }
  }
  const shell = deriveRuntimeStructureCollisionProfile(parts).shell;
  if (kind !== 'parkGate') assert.ok(shell.some((band) => band.minY > 3 && band.parts.some((part) => pointInsideCollisionRecord(record, part, 0, 0))), `${kind}: a shell meets the arch over the passage`);
  for (const g of geometries(parts)) g.dispose();
});

// ---------------------------------------------------------------------------------------------------------- bridges
for (const kind of ['stoneArchBridge', 'trussBridge', 'trestleBridge', 'baileyBridge', 'liftBridge']) {
  for (const gully of [4, 7]) check(`${kind} over a ${gully} m gully`, () => {
    const params = resolveLandmarkParams({ kind, x: 0, z: 0 });
    const span = kind === 'baileyBridge' ? Number(params.bays) * 3.048 : Number(params.span);
    // a gully `gully` deep with banks shelving into it (and a bank a metre higher on the far side)
    const ground = (lx, lz) => { const t = Math.min(1, Math.abs(lz) / (span / 2 + 1)); return gully * t * t * (3 - 2 * t) + (lz > 0 ? t * 1.0 : 0); };
    const { parts, movement } = build(kind, {}, { ground });
    assert.ok(movement?.length, `${kind}: a drivable bridge authors its movement record`);
    // the deck parts: a metre under the roadway's surface (bridges.ts DECK_PART_M), the full width (the piers and the
    // abutments below them reach down to the bed)
    const deck = movement.filter((part) => part.kind === 'obb' && Math.abs(part.y1 - part.y0 - 1.0) < 1e-6 && part.hw >= 1.5)
      .sort((p, q) => p.cz - q.cz);
    assert.ok(deck.every((part) => part.y1 - part.y0 >= HULL_STANDABLE_HEIGHT_M + 0.05), `${kind}: every deck part is a standable floor`);
    assert.ok(deck.length >= 2, `${kind}: deck parts`);
    // contiguous along the span, each a floor a hull on its neighbour steps onto
    for (let i = 0; i + 1 < deck.length; i++) {
      const gap = (deck[i + 1].cz - deck[i + 1].hl) - (deck[i].cz + deck[i].hl);
      if (Math.abs(deck[i + 1].cz - deck[i].cz) < 1e-6) continue;
      assert.ok(gap <= 0.05, `${kind}/${gully}: the deck runs on unbroken (gap ${gap.toFixed(3)} m)`);
      assert.ok(Math.abs(deck[i + 1].y1 - deck[i].y1) < HULL_STEP_UP_M, `${kind}/${gully}: a hull steps from one deck part to the next`);
      assert.ok(hullPassesObstacleTop(deck[i].y1, deck[i + 1].y1, deck[i + 1].y0), `${kind}/${gully}: a hull on the deck mounts the next part`);
    }
    // the ends meet the banks
    for (const [part, zs] of [[deck[0], -1], [deck[deck.length - 1], 1]]) {
      const bank = ground(0, zs * (span / 2 + 1.2));
      assert.ok(Math.abs(part.y1 - bank) < HULL_STEP_UP_M, `${kind}/${gully}: the deck's ${zs < 0 ? 'near' : 'far'} end (${part.y1.toFixed(2)}) meets its bank (${bank.toFixed(2)})`);
    }
    // its edges are held (parapets, trusses or guard rails) and a hull in the gully meets a pier or an abutment
    assert.ok(movement.some((part) => part.kind === 'obb' && part.hw < 0.6 && part.y0 >= deck[0].y1 - 0.5), `${kind}: the deck's edges are held`);
    for (const g of geometries(parts)) g.dispose();
  });
}

// the lift bridge's long form (bridges.ts liftBridge; Tidegate Polders' oxbow): over water level with its fields, the
// leaves on piers in the water, a fixed span on pile bents to each bank, the roadway `rise` over the banks on paved
// abutments, a ramp down from each to where it meets the ground — one deck a hull drives on from field to field
for (const [label, ground] of [
  ['banks rising unevenly', (lx, lz) => { const a = Math.abs(lz) - 14; return a <= 0 ? 0 : (lz > 0 ? 0.25 : 0.16) * a; }],
  ['banks level with the water', () => 0],
]) check(`liftBridge long form, ${label}`, () => {
  const params = resolveLandmarkParams({ kind: 'liftBridge', x: 0, z: 0, params: { span: 12, approach: 5.6, rise: 1.5 } });
  const { parts, movement } = build('liftBridge', { span: 12, approach: 5.6, rise: 1.5 }, { ground });
  assert.ok(triangles(parts) <= BUDGET.liftBridge, `liftBridge long form within its budget (${triangles(parts)})`);
  const deck = movement.filter((part) => part.kind === 'obb' && Math.abs(part.y1 - part.y0 - 1.0) < 1e-6 && part.hw >= 1.5).sort((p, q) => p.cz - q.cz);
  assert.ok(deck.length >= 5, 'the roadway in parts');
  for (let i = 0; i + 1 < deck.length; i++) {
    const gap = (deck[i + 1].cz - deck[i + 1].hl) - (deck[i].cz + deck[i].hl);
    assert.ok(Math.abs(gap) <= 0.05, `the roadway runs on unbroken (gap ${gap.toFixed(3)} m at ${deck[i].cz.toFixed(2)})`);
    assert.ok(Math.abs(deck[i + 1].y1 - deck[i].y1) < HULL_STEP_UP_M, `a hull steps from one roadway part to the next (${deck[i].y1.toFixed(2)} → ${deck[i + 1].y1.toFixed(2)})`);
    assert.ok(hullPassesObstacleTop(deck[i].y1, deck[i + 1].y1, deck[i + 1].y0), 'a hull on the roadway mounts the next part');
  }
  // the roadway stands `rise` over the higher bank, and each end comes down to its ground
  const top = Math.max(...deck.map((part) => part.y1));
  assert.ok(top >= 1.5, `the roadway stands its rise over the water (${top.toFixed(2)})`);
  for (const [part, zs] of [[deck[0], -1], [deck[deck.length - 1], 1]]) {
    const z = part.cz + zs * part.hl, g = ground(0, z);
    assert.ok(part.y1 - g < HULL_STEP_UP_M && part.y1 >= g - 0.05, `the ${zs < 0 ? 'near' : 'far'} ramp meets its ground (${part.y1.toFixed(2)} over ${g.toFixed(2)} at ${z.toFixed(1)})`);
  }
  // the whole bridge within its footprint, and its shells within the packed manifest's limits
  const [, hl] = LANDMARK_KINDS.liftBridge.footprint(params);
  assert.ok(movement.every((part) => Math.abs(part.cz) + (part.hl ?? part.r ?? 0) <= hl + 1e-6), 'the movement within the footprint');
  packedBandsOk({ contact: { parts: [] }, shell: deriveRuntimeStructureShellBands(parts) }, 'liftBridge long form');
  for (const g of geometries(parts)) g.dispose();
});

// the valve tower (towers.ts valveTower; Highland Reservoir): the tower stands in the water, its footbridge's floor
// meets the bank at its end, and the composer admits it over water as it admits a bridge
check('valveTower over a reservoir bank', () => {
  const params = resolveLandmarkParams({ kind: 'valveTower', x: 0, z: 0, params: { bridge: 50 } });
  const [, hl] = LANDMARK_KINDS.valveTower.footprint(params);
  // the water level with the bed to 30 m short of the bank end, then a bank rising 8 m over 25 m
  const ground = (lx, lz) => { const d = lz + hl; return d >= 30 ? 0 : d <= 5 ? 8 : 8 - 8 * (d - 5) / 25; };
  const { parts } = build('valveTower', { bridge: 50 }, { ground });
  assert.ok(triangles(parts) <= BUDGET.valveTower, `valveTower within its budget (${triangles(parts)})`);
  let top = -Infinity, bankEnd = Infinity, low = Infinity;
  for (const g of geometries(parts)) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) { top = Math.max(top, p.getY(i)); bankEnd = Math.min(bankEnd, p.getZ(i)); low = Math.min(low, p.getY(i)); }
  }
  assert.ok(bankEnd >= -hl - 1e-6, `the bridge ends within the footprint (${bankEnd.toFixed(2)} of ${hl.toFixed(2)})`);
  assert.ok(low < 0, 'the tower foots below the water');
  assert.ok(top > 8 + 5.4 + 4, `the tower stands its chamber and its roof over the bridge's floor (${top.toFixed(1)})`);
  const profile = deriveRuntimeStructureCollisionProfile(parts);
  packedBandsOk(profile, 'valveTower');
  assert.ok(profile.contact.parts.length > 0, 'the tower and its bridge meet the hulls');
  for (const g of geometries(parts)) g.dispose();
});

// ---------------------------------------------------------------------------------------------------------- composer
{
  const flat = { getHeightAt: () => 0, getWaterMaskAt: () => 0, _roadDist: (x, z) => Math.abs(z - 200) };
  const merged = [], obstacles = [], colliders = [], reserved = [], published = [], furniture = [];
  const ctx = (landmarks) => ({
    mapId: 'selftest', landmarks, heightField: flat, spawns: [{ x: -400, z: -400 }, { x: 400, z: 400 }], obstacles, colliders,
    architecture: null, snowCap: false, seed: 2002, tier: 'desktop',
    merge: (parts, matrix) => merged.push({ parts, matrix: matrix.clone() }),
    reserve: (x, z, r) => reserved.push({ x, z, r }), publish: (x, z, w, d, rot, kind) => published.push({ x, z, w, d, rot, kind }),
    addDestructible: (kind, x, y, z) => furniture.push({ kind, x, y, z }),
  });
  const run = (landmarks) => { const it = composeLandmarks(ctx(landmarks)); let s = it.next(); while (!s.done) s = it.next(); return s.value; };
  const receipt = run([
    { kind: 'church', x: 60, z: 40, yawDeg: -90, name: 'a church' },
    { kind: 'parkSquare', x: -60, z: -60, params: { centre: 'obelisk', benches: 4, lamps: 2 }, name: 'a square' },
    { kind: 'obelisk', x: -400, z: -390, name: 'on a pad' },
    { kind: 'statue', x: 0, z: 198, name: 'in a road' },
    { kind: 'obelisk', x: 60, z: 40, name: 'in the church' },
  ]);
  const by = (name) => receipt.pieces.find((p) => p.name === name);
  assert.equal(by('a church').status, 'placed');
  assert.ok(by('a church').records > 10, 'the church publishes its movement record and its shell bands');
  assert.equal(by('a square').status, 'placed');
  assert.equal(by('a square: its obelisk')?.status, 'placed', "the square's centre piece follows it");
  assert.equal(by('on a pad').reason, 'spawn pad');
  assert.equal(by('in a road').reason, 'road');
  assert.equal(by('in the church').reason, 'solid structure', 'a piece never stands in another');
  assert.equal(receipt.placed, 3); assert.equal(receipt.skipped, 3);
  assert.equal(furniture.filter((f) => f.kind === 'bench').length, 4); assert.equal(furniture.filter((f) => f.kind === 'lamp').length, 2);
  assert.ok(published.some((p) => p.kind === 'church' && p.rot === -Math.PI / 2), 'the minimap gets its footprint, under its kind');
  // the church's ground is reserved along its length (the passes after keep off it)
  for (const z of [-14, 0, 14]) {
    const x = 60 + z * Math.sin(-Math.PI / 2), wz = 40 + z * Math.cos(-Math.PI / 2);
    assert.ok(reserved.some((r) => Math.hypot(r.x - x, r.z - wz) < r.r), `the church's ground at ${z} m along it is reserved`);
  }
  // its contact record stands where it was placed, turned with it (the bell tower to the west)
  const church = obstacles.find((o) => o.kind === 'structure');
  assert.ok(church.min[0] < 60 - 12 && church.max[0] > 60 + 10 && church.max[2] - church.min[2] < 20, 'the church lies along x');
  for (const m of merged) for (const g of geometries(m.parts)) g.dispose();
  // a bridge whose roadway holds more parts than one compound may (64: server/collisionManifestCodec.ts) publishes it
  // in runs of 64, each its own movement record and each cloned into the shells' list
  const before = { obstacles: obstacles.length, colliders: colliders.length };
  const long = run([{ kind: 'liftBridge', x: 200, z: -100, yawDeg: 0, params: { span: 12, approach: 5.6, rise: 1.5 }, name: 'a long bridge' }]);
  assert.equal(long.placed, 1, 'the long bridge stands');
  const roadway = obstacles.slice(before.obstacles).filter((o) => o.shape2?.kind === 'compound');
  const built = build('liftBridge', { span: 12, approach: 5.6, rise: 1.5 }, { ground: () => 0 });
  assert.ok(built.movement.length > 64, `the flat test ground's roadway outgrows one compound (${built.movement.length} parts)`);
  assert.equal(roadway.length, Math.ceil(built.movement.length / 64), 'one movement record per 64 parts');
  assert.ok(roadway.every((o) => o.shape2.parts.length <= 64), 'each within the compound cap');
  assert.equal(roadway.reduce((n, o) => n + o.shape2.parts.length, 0), built.movement.length, 'every part published');
  const shellCopies = colliders.slice(before.colliders).filter((o) => o.shape2?.kind === 'compound' && o.shape2.parts.length > 1
    && roadway.some((r) => r.min[0] === o.min[0] && r.max[2] === o.max[2] && r.shape2.parts.length === o.shape2.parts.length));
  assert.equal(shellCopies.length, roadway.length, 'each run cloned into the shells');
  for (const g of geometries(built.parts)) g.dispose();
  // a map without set pieces composes nothing
  const empty = run([]);
  assert.deepEqual(empty, { pieces: [], placed: 0, skipped: 0, triangles: 0 });
  // the objective discs: a map's authored seats, the deployments' goals
  const discs = landmarkObjectiveDiscs('verdant', [{ x: -170, z: -365 }, { x: 130, z: 390 }]);
  assert.ok(discs.some(([x, z, r]) => x === -250 && z === -126 && r === 30), "Verdant's western zone seat");
}

// the trees keep off the set pieces: the vegetation hands their placements to its placed-structure keep-out (the
// function the tree harnesses inject), which adds their footprints
assert.match(readFileSync(new URL('../vegetation.ts', import.meta.url), 'utf8'),
  /placedStructureClearances\([^;]*cfg\?\.props\?\.landmarks, \(cfg as SceneryMapConfig \| null\)\?\.scenery\)/s, 'the trees keep off the set pieces');
assert.match(readFileSync(new URL('../vegetationClearance.ts', import.meta.url), 'utf8'), /\.\.\.landmarkClearances\(landmarks\)/,
  'the placed-structure keep-out carries the set pieces');

// ---------------------------------------------------------------------------------------------------------- authoring maps
let authored = 0, authoredBerths = 0;
for (const id of MAP_IDS) {
  const config = getMapConfig(id);
  const landmarks = config.props?.landmarks ?? [];
  if (!landmarks.length) continue;
  const field = createHeightField(1337, config);
  const L = field._layout, spawns = [L.spawns.player, ...L.spawns.enemies];
  const discs = landmarkObjectiveDiscs(id, spawns);
  const shard = decodeCollisionManifest(JSON.parse(readFileSync(new URL(`../../../server/world-collision-manifests/${id}.json`, import.meta.url), 'utf8')));
  const structures = shard.obstacles.filter((record) => record.k === 'structure');
  assert.equal(landmarkClearances(landmarks).length, landmarks.length, `${id}: one vegetation clearance per piece`);
  for (const placement of landmarks) check(`${id}/${placement.name ?? placement.kind}`, () => {
    const label = `${id}/${placement.name ?? placement.kind}`;
    assert.ok(LANDMARK_KINDS[placement.kind], `${label}: a known kind`);
    const [hw, hl] = landmarkFootprint(placement), yaw = (placement.yawDeg ?? 0) * Math.PI / 180;
    for (const s of spawns) assert.ok(Math.hypot(s.x - placement.x, s.z - placement.z) > 22 + Math.hypot(hw, hl) * 0.5, `${label}: off the spawn pads`);
    for (const [x, z, r] of discs) {
      const ox = x - placement.x, oz = z - placement.z, lx = ox * Math.cos(yaw) - oz * Math.sin(yaw), lz = ox * Math.sin(yaw) + oz * Math.cos(yaw);
      const ex = Math.max(0, Math.abs(lx) - hw), ez = Math.max(0, Math.abs(lz) - hl);
      assert.ok(ex * ex + ez * ez >= r * r, `${label}: clear of the objective disc at (${x}, ${z})`);
    }
    const margin = placement.roadMargin ?? LANDMARK_KINDS[placement.kind].roadMargin ?? 3.5;
    if (!LANDMARK_KINDS[placement.kind].spansRoad && margin > 0) assert.ok(field._roadDist(placement.x, placement.z) > margin, `${label}: out of the road core`);
    if (placement.kind !== 'parkSquare') {
      const stood = structures.some((record) => {
        const cx = (record.b[0] + record.b[3]) / 2, cz = (record.b[2] + record.b[5]) / 2;
        return Math.hypot(cx - placement.x, cz - placement.z) < Math.max(hw, hl);
      });
      assert.ok(stood, `${label}: the committed shard carries its structure record (it stood when the shard was captured)`);
    }
    authored++;
  });
  // a 'clearance' rail spur's berth (railSpurs.ts): props are not filtered off it, so the line keeps clear of every solid
  // the shard holds — the berth's half-width to each side of the centreline, shape by shape
  for (const spur of (config.terrain?.railSpurs ?? []).filter((candidate) => candidate.berth === 'clearance')) check(`${id}/rail berth`, () => {
    let nearest = Infinity, at = null;
    for (const record of [...shard.obstacles, ...shard.colliders]) {
      if (record.k === 'tree' || record.t != null) continue;
      if (record.b[3] < -480 || record.b[0] > 480) continue;
      const gap = recordGapToPath(record, spur.path);
      if (gap < nearest) { nearest = gap; at = `${record.k ?? 'solid'} at (${((record.b[0] + record.b[3]) / 2).toFixed(1)}, ${((record.b[2] + record.b[5]) / 2).toFixed(1)})`; }
    }
    assert.ok(nearest >= RAIL_SPUR_BERTH_M, `${id}: the clearance berth is clear of every solid (nearest ${at}, ${nearest.toFixed(2)} m from the line)`);
    authoredBerths++;
  });
}

assert.deepEqual(failures, [], `${failures.length} failures:\n${failures.join('\n')}`);
console.log(`landmarks selftest: ${KINDS.length} kinds, ${built} builds (${total} desktop triangles), gates, bridges, composer, ${authored} authored pieces, ${authoredBerths} clearance berths OK`);
