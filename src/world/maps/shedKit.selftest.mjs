// shedKit.selftest.mjs — the fracture-ready sheds (the destructible-kits lane, 2026-10-10).
//
// Laws: every map's field hut and lean-to build in their style with a fracture anatomy the destruction core can take
// apart (one contiguous run a piece covering the geometry exactly, every run inside its box, scores on the box, links
// in range, every piece reaching an anchor, the caps); the light family's record and receipts hold (footprint, roof
// orientation, night panes on the hut only); the broken heap lies under the hull-crossing cap with no lit pane; the
// build spends exactly the legacy builders' draws from the props stream (brokenDraws.ts); it is deterministic; the
// flat texel and the tile means the colours are divided by are the painter's; the edge art caps a snapped member.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  DESTRUCTIBLE_BUILDING_TYPES, LEGACY_SHED_TYPES, shedKitTypes,
} from './structureKit.ts';
import {
  SHED_BROKEN_CAP, SHED_FLAT_LUM, SHED_FLAT_UV, SHED_GRAIN_LUM, SHED_STYLES, buildShedFieldHut, buildShedLeanTo,
  shedFractureEdge, shedStyleFor,
} from './shedKit.ts';
import { paintTimberGrain } from '../timberGrain.ts';
import { FRACTURE_PIECE_CAP, checkKitFracture } from '../fractureAnatomy.ts';
import { NIGHT_EMISSION_ATTRIBUTE } from '../../engine/nightEmissionMaterial.ts';

function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function counting(seed) {
  const rng = mulberry32(seed);
  const wrapped = () => { wrapped.calls++; return rng(); };
  wrapped.calls = 0;
  return wrapped;
}
function rotate(q, v) {
  const [x, y, z, w] = q;
  const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
  return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The anatomy's laws against its geometry. */
function checkAnatomy(id, geometry, cap) {
  const anatomy = geometry.userData.fracture;
  assert.ok(anatomy && anatomy.kind === id.split('/').pop(), `${id}: the build carries its fracture anatomy`);
  assert.equal(geometry.index, null, `${id}: non-indexed (one run a piece)`);
  const pos = geometry.getAttribute('position');
  for (const name of ['normal', 'uv', 'color', NIGHT_EMISSION_ATTRIBUTE]) {
    assert.equal(geometry.getAttribute(name)?.count, pos.count, `${id}: ${name} per vertex`);
  }
  const { pieces, links } = anatomy;
  // the core's own contract check first (it refuses a kind that fails it)
  assert.deepEqual(checkKitFracture(anatomy, pos.array, cap), [], `${id}: the core's fracture contract holds`);
  assert.ok(pieces.length >= 20 && pieces.length <= cap, `${id}: ${pieces.length} pieces within the cap ${cap}`);
  let next = 0;
  pieces.forEach((p, i) => {
    assert.equal(p.tri0, next, `${id}/${i} ${p.role}: runs are contiguous`);
    assert.ok(p.triN > 0, `${id}/${i}: a piece has triangles`);
    next += p.triN;
    assert.ok(Math.abs(Math.hypot(...p.q) - 1) < 1e-6, `${id}/${i}: unit rotation`);
    assert.ok(p.h.every((v) => v > 0), `${id}/${i}: a box with volume`);
    assert.ok(p.massKg > 0, `${id}/${i}: a mass`);
    assert.equal(p.bucket, 'structureWood', `${id}/${i}: the kind's one material`);
    const axes = [rotate(p.q, [1, 0, 0]), rotate(p.q, [0, 1, 0]), rotate(p.q, [0, 0, 1])];
    let worst = 0;
    for (let v = p.tri0 * 3; v < (p.tri0 + p.triN) * 3; v++) {
      const d = [pos.getX(v) - p.c[0], pos.getY(v) - p.c[1], pos.getZ(v) - p.c[2]];
      for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(dot(d, axes[k])) - p.h[k]);
    }
    assert.ok(worst <= 0.02, `${id}/${i} ${p.role}: its box encloses its triangles (out by ${worst.toFixed(3)} m)`);
    if (p.scores) {
      assert.ok(p.scores.length <= 6, `${id}/${i}: at most six scores`);
      for (const s of p.scores) assert.ok(Math.abs(s) < p.h[p.scoreAxis], `${id}/${i}: a score inside its box`);
    }
    if (p.points) {
      assert.ok(p.points.length >= 3 && p.edgeRadiusM > 0, `${id}/${i}: contact points with a radius`);
      for (const pt of p.points) for (let k = 0; k < 3; k++) assert.ok(Math.abs(pt[k]) <= p.h[k] + 0.02, `${id}/${i}: contact points in its box frame`);
    }
  });
  assert.equal(next * 3, pos.count, `${id}: the runs cover the geometry exactly`);
  const adj = pieces.map(() => []);
  for (const l of links) {
    assert.ok(l.a >= 0 && l.b >= 0 && l.a < pieces.length && l.b < pieces.length && l.a !== l.b, `${id}: a link in range`);
    assert.ok(['rest', 'nail', 'bolt', 'cast', 'weld', 'lash', 'mortar'].includes(l.kind), `${id}: a known link kind`);
    adj[l.a].push(l.b); adj[l.b].push(l.a);
  }
  const seen = pieces.map((p) => !!p.anchor), queue = pieces.map((_, i) => i).filter((i) => seen[i]);
  assert.ok(queue.length >= 4, `${id}: anchored on its footings`);
  while (queue.length) for (const j of adj[queue.pop()]) if (!seen[j]) { seen[j] = true; queue.push(j); }
  assert.ok(seen.every(Boolean), `${id}: every piece reaches an anchor through its links`);
  return anatomy;
}

const geomDigest = (g) => createHash('sha256').update(Buffer.from(g.getAttribute('position').array.buffer))
  .update(Buffer.from(g.getAttribute('color').array.buffer)).digest('hex');

// --- every map's style, both kinds
const maps = [...Object.keys(SHED_STYLES), 'mars'];
let checked = 0;
for (const mapId of maps) {
  const types = shedKitTypes(mapId);
  for (const id of ['fieldhut', 'leanto']) {
    const meta = types[id];
    const intact = meta.build(mulberry32(0x5eed + checked));
    const anatomy = checkAnatomy(`${mapId}/${id}`, intact, FRACTURE_PIECE_CAP.light);
    // the light family's record: its footprint stays inside the build, its roof receipts survive the merge
    intact.computeBoundingBox();
    const b = intact.boundingBox;
    assert.ok(meta.hw <= (b.max.x - b.min.x) / 2 + 0.1 && meta.hl <= (b.max.z - b.min.z) / 2 + 0.1,
      `${mapId}/${id}: the movement footprint stays inside the build`);
    assert.ok(b.max.y <= meta.h + 0.45, `${mapId}/${id}: no taller than its family (stovepipe cap allowed)`);
    assert.ok((intact.userData.skillionRoofPitches ?? []).some((pitch) => pitch.drop > 0.01),
      `${mapId}/${id}: its porch or its roof drains away from its wall`);
    for (const pitch of intact.userData.roofPlanePitches) {
      assert.ok(Math.abs(pitch.measuredAngleRad - pitch.angleRad) < 0.004, `${mapId}/${id}: a roof plane keeps its pitch`);
    }
    // night: the hut's panes only, never the lean-to's
    const mask = new Set(intact.getAttribute(NIGHT_EMISSION_ATTRIBUTE).array);
    assert.deepEqual([...mask].sort(), id === 'fieldhut' ? [0, 1] : [0], `${mapId}/${id}: lit panes only where windows are`);
    // the heap
    const broken = meta.broken(mulberry32(0xb0 + checked));
    broken.computeBoundingBox();
    assert.ok(broken.boundingBox.max.y <= SHED_BROKEN_CAP + 1e-3, `${mapId}/${id}: the heap lies under the hull-crossing cap`);
    assert.ok(broken.getAttribute('position').count >= 684, `${mapId}/${id}: the heap is the shed's own pieces`);
    assert.deepEqual([...new Set(broken.getAttribute(NIGHT_EMISSION_ATTRIBUTE).array)], [0], `${mapId}/${id}: no lit pane in the heap`);
    // determinism
    const again = meta.build(mulberry32(0x5eed + checked));
    assert.equal(geomDigest(again), geomDigest(intact), `${mapId}/${id}: the same stream builds the same shed`);
    assert.deepEqual(again.userData.fracture, anatomy, `${mapId}/${id}: and the same anatomy`);
    intact.dispose(); broken.dispose(); again.dispose();
    checked++;
  }
}
assert.equal(shedStyleFor('verdant').id, 'kolkhoz');
assert.equal(shedStyleFor('nowhere').id, 'kolkhoz');
assert.equal(DESTRUCTIBLE_BUILDING_TYPES.fieldhut.hw, LEGACY_SHED_TYPES.fieldhut.hw, 'the field hut keeps its family record');
assert.equal(DESTRUCTIBLE_BUILDING_TYPES.leanto.crushMin, LEGACY_SHED_TYPES.leanto.crushMin, 'the lean-to keeps its family record');

// --- the draw law: the props stream advances exactly as under the legacy builders
for (const id of ['fieldhut', 'leanto']) {
  for (const seed of [3, 77, 2049]) {
    const legacyBuild = counting(seed), legacyBroken = counting(seed + 1);
    LEGACY_SHED_TYPES[id].build(legacyBuild).dispose();
    LEGACY_SHED_TYPES[id].broken(legacyBroken).dispose();
    const nowBuild = counting(seed), nowBroken = counting(seed + 1);
    DESTRUCTIBLE_BUILDING_TYPES[id].build(nowBuild).dispose();
    DESTRUCTIBLE_BUILDING_TYPES[id].broken(nowBroken).dispose();
    assert.equal(nowBuild.calls, legacyBuild.calls, `${id}/${seed}: the intact build spends the legacy draws, no more`);
    assert.equal(nowBroken.calls, legacyBroken.calls, `${id}/${seed}: the broken build spends the legacy draws, no more`);
    // and what follows on the stream is the same value
    assert.equal(nowBuild(), legacyBuild(), `${id}/${seed}: the next placement reads the same draw`);
  }
}

// --- the surface: the flat texel and the tile means the vertex colours are divided by (linear, as sampled)
{
  const s = 256, { lum } = paintTimberGrain(s, 0x0a4);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  // (a CanvasTexture flips its rows: v = 1 − row/size)
  const texel = (u, v) => lin(Math.min(1, Math.max(0.55, lum[Math.min(s - 1, Math.floor((1 - (((v % 1) + 1) % 1)) * s)) * s + Math.floor(((u % 1) + 1) % 1 * s)])));
  // the flat texel and its neighbourhood (a minified sample averages round it)
  let around = 0, n = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { around += texel(SHED_FLAT_UV[0] + dx / s, SHED_FLAT_UV[1] + dy / s); n++; }
  around /= n;
  assert.ok(Math.abs(texel(SHED_FLAT_UV[0], SHED_FLAT_UV[1]) - SHED_FLAT_LUM) < 0.04, `the flat texel reads ${texel(SHED_FLAT_UV[0], SHED_FLAT_UV[1]).toFixed(3)} (SHED_FLAT_LUM ${SHED_FLAT_LUM})`);
  assert.ok(Math.abs(around - SHED_FLAT_LUM) < 0.05, 'and so does its neighbourhood');
  let mean = 0, m = 0;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    if ((x % 56) < 5 || x >= 224) continue;
    mean += texel((x + 0.5) / s, (y + 0.5) / s); m++;
  }
  mean /= m;
  assert.ok(Math.abs(mean - SHED_GRAIN_LUM) < 0.03, `the plank lanes' mean reads ${mean.toFixed(3)} (SHED_GRAIN_LUM ${SHED_GRAIN_LUM})`);
}

// --- the edge art: a snapped post shows a splintered end on both halves
{
  const build = buildShedFieldHut(shedStyleFor('verdant'), mulberry32(9));
  const post = build.anatomy.pieces.find((p) => p.role === 'post' && p.scores?.length);
  assert.ok(post, 'the hut has a scored post');
  const runs = [];
  const writer = {
    vertices: 0, capacity: 1e6, run: null,
    begin(bucket, role) { this.run = { bucket, role, v: [], t: 0 }; return true; },
    vertex(px, py, pz) { this.run.v.push([px, py, pz]); return this.vertices++; },
    triangle() { this.run.t++; },
    end() { runs.push(this.run); },
  };
  shedFractureEdge('timber', post, post.scores[0], 0x1234, writer);
  assert.equal(runs.length, 2, 'two caps, one a half');
  const axis = rotate(post.q, post.scoreAxis === 0 ? [1, 0, 0] : post.scoreAxis === 1 ? [0, 1, 0] : [0, 0, 1]);
  for (const [k, run] of runs.entries()) {
    assert.ok(run.t >= 16 && run.role === 'rim', 'a splintered cap');
    for (const v of run.v) {
      const along = dot([v[0] - post.c[0], v[1] - post.c[1], v[2] - post.c[2]], axis) - post.scores[0];
      assert.ok((k === 0 ? along : -along) >= -1e-6 && Math.abs(along) <= 0.23, 'each cap stands out of its own half');
    }
  }
  const panel = build.anatomy.pieces.find((p) => p.role === 'wall');
  const before = runs.length;
  shedFractureEdge('plank', panel, panel.scores?.[0] ?? 0, 1, writer);
  assert.equal(runs.length, before, 'a panel splits at a board joint: nothing to cap');
  build.geometry.dispose();
  const lean = buildShedLeanTo(shedStyleFor('longleaf'), mulberry32(4));
  assert.ok(lean.anatomy.pieces.some((p) => p.material === 'metal'), 'a tin-roofed lean-to has metal roof pieces');
  lean.geometry.dispose();
}

console.log(`shedKit.selftest: ${checked} styled builds (field hut and lean-to) — anatomy, record, heap, draw law, surface, edge art passed`);
