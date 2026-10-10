// The kit seam's world side (docs/DESTRUCTION.md §16): the default kit describes a building from its parts and builds
// every stage deterministically within the caps (rim at the hole, rubble on the sim's mound, the room behind a breach);
// the chain prefers a kit's own builders for its own anatomy; and a real map's build describes every structure, records
// where its parts landed in the merged buckets, tags those vertices with aDamage and hands its materials to a patch.
import assert from 'node:assert/strict';
import { BoxGeometry, BufferAttribute, Float32BufferAttribute } from 'three';
import {
  bodyMoundHeightAt, damageSeed, holeOutlineK, registerStructureDamageKit, structureDamageKitChain,
} from './destructionKit.ts';
import { DEFAULT_STRUCTURE_DAMAGE_KIT, describeDefault } from './destructionDefaultKit.ts';
import { createStructureDamageSeam, describeStructure, tagStructureVertices } from './structureDamageSeam.ts';
import { rubbleMoundHeightAt } from '../sim/terrainDeformation.ts';

// ---- writers: plain arrays, capped as the presentation's are
function makeWriters(meshCap, pieceCap) {
  const mesh = { runs: [], vertices: 0, capacity: meshCap, current: null,
    begin(bucket, role) { if (this.vertices >= this.capacity) return false; this.current = { bucket, role, v: [], t: [] }; return true; },
    vertex(...args) { assert.equal(args.length, 11); assert.ok(this.vertices < this.capacity, 'vertex past the cap'); this.current.v.push(args); this.vertices++; return this.current.v.length - 1; },
    triangle(a, b, c) { const n = this.current.v.length; assert.ok(a < n && b < n && c < n, 'a triangle names its own run\'s vertices'); this.current.t.push([a, b, c]); },
    end() { this.runs.push(this.current); this.current = null; },
  };
  const pieces = { list: [], get count() { return this.list.length; }, capacity: pieceCap,
    push(...args) { assert.equal(args.length, 19); if (this.list.length >= this.capacity) return false; this.list.push(args); return true; } };
  return { mesh, pieces };
}
const digest = (writers) => JSON.stringify([writers.mesh.runs.map((r) => [r.bucket, r.role, r.v, r.t]), writers.pieces.list]);
/** The core unit size of a face's material (destructionDefaultKit unitOf: brick 0.24, stone 0.4, plate 0.45 …). */
const UNIT = { brick: 0.24, stone: 0.4, rubble: 0.3, concrete: 0.45, adobe: 0.3, plaster: 0.25, timber: 0.6, plank: 0.5, metal: 0.6 };
const unitSize = (face) => UNIT[face.layers[face.layers.length - 1].material] ?? 0.3;

// ---- a two-storey plastered house with a tiled gable roof and four windows, built as a kit would (body frame)
function part(bucket, w, h, d, x, y, z, color) {
  const g = new BoxGeometry(w, h, d).translate(x, y + h / 2, z);
  if (color) g.setAttribute('color', new Float32BufferAttribute(new Array(g.getAttribute('position').count * 3).fill(0).map((_, i) => color[i % 3]), 3));
  g.userData.bucket = bucket;
  return g;
}
const parts = {
  regionalPlaster: [part('regionalPlaster', 10, 6, 8, 0, 0, 0, [0.8, 0.75, 0.6])],
  regionalRoof: [part('regionalRoof', 10.6, 2.4, 8.6, 0, 6, 0, [0.6, 0.3, 0.2])],
  glass: [part('glass', 1, 1.2, 0.05, -2, 1, 4), part('glass', 1, 1.2, 0.05, 2, 1, 4), part('glass', 1, 1.2, 0.05, -2, 4, 4),
    part('glass', 0.05, 1.2, 1, 5, 1, 0)],
  wood: [part('wood', 1, 2, 0.1, 0, 0, 4.02)],
};
const input = { structureIdx: 7, mapId: 'verdant', builder: 'cottage', style: null, parts, w: 10, d: 8, h: 8.4,
  placement: { x: 40, y: 2, z: -30, yaw: 0.6 }, massClass: 'house', seed: damageSeed(1, 4000, -3000) };
const anatomy = describeDefault(input);
assert.equal(anatomy.kit, 'default');
assert.equal(anatomy.storeys.length, 2, 'two storeys under a 6 m eave');
assert.equal(anatomy.storeys[0].faces.length, 4);
assert.ok(anatomy.storeys[0].faces.every((face) => face.layers[0].material === 'plaster' && face.layers.length === 2), 'render over its core');
assert.equal(anatomy.roof.kind, 'gable');
assert.equal(anatomy.roof.covering.material, 'tile');
assert.ok(Math.abs(anatomy.roof.eaveY - 6) < 1e-5 && Math.abs(anatomy.roof.ridgeY - 8.4) < 1e-5, 'eave and ridge from the roof bucket (float32 parts)');
const front = anatomy.storeys[0].faces.find((face) => face.name === 'front');
assert.equal(front.openings.length, 2, 'the ground storey\'s two front windows');
assert.equal(anatomy.storeys[1].faces.find((face) => face.name === 'front').openings.length, 1);
assert.equal(anatomy.storeys[0].faces.find((face) => face.name === 'right').openings.length, 1, 'the side window');
assert.ok(Math.abs(anatomy.storeys[0].faces[0].layers[0].tint[0] - 0.8) < 1e-6, 'the wall keeps its own tint');
assert.ok(anatomy.rubble.length >= 3, 'the pile: the walls\' layers, the roof, the timber');
assert.equal(anatomy.storeys[1].floor.structure.material, 'timber');
// the world fills the mound after describe; until then the body-frame heap reads 0
assert.equal(bodyMoundHeightAt(anatomy, 0, 0), 0);
anatomy.mound = { cx: 40, cz: -30, hw: 4, hd: 5, yaw: 0.6, heightM: 1.5 };
const fx = (x, z) => [40 + x * Math.cos(0.6) + z * Math.sin(0.6), -30 - x * Math.sin(0.6) + z * Math.cos(0.6)];
for (const [x, z] of [[0, 0], [3, 2], [-6, 1], [12, 9]]) {
  const [wx, wz] = fx(x, z);
  assert.equal(bodyMoundHeightAt(anatomy, x, z), rubbleMoundHeightAt(anatomy.mound, wx, wz), 'the body-frame heap is the sim\'s');
}

// ---- every stage: deterministic, within its caps, where it belongs
const caps = { damaged: [1500, 48], breach: [3000, 96], sectionDown: [6000, 160], collapse: [16000, 240] };
const seam = createStructureDamageSeam(7, 'cottage', null, anatomy, []);
const hole = { section: 0, storey: 0, face: 'front', hole: 0, u: 1, y: 2, radiusM: 0.9, dirX: 0, dirZ: -1,
  munition: 'he', cause: 'blast', seed: damageSeed(anatomy.seed, 0, 0) };
// the world point of that hole (just proud of the front wall, body (1, 2, 4.05)) and a blow into the wall map back to it
{
  const [wx, wz] = fx(1, 4.05), [ix, iz] = fx(0, -1);
  const found = seam.holeAt(wx, 2 + 2, wz, 0.9, ix - 40, iz + 30, 'he', 'blast');
  for (const key of ['section', 'storey', 'face', 'hole', 'radiusM', 'munition', 'cause', 'seed']) assert.equal(found[key], hole[key], `holeAt ${key}`);
  for (const key of ['u', 'y', 'dirX', 'dirZ']) assert.ok(Math.abs(found[key] - hole[key]) < 1e-9, `holeAt ${key} (${found[key]})`);
  const side = seam.holeAt(...(() => { const [x, z] = fx(5.3, -1); return [x, 2 + 4.5, z]; })(), 1.2, 0, 0, 'kinetic', 'kinetic', 2);
  assert.deepEqual([side.face, side.storey, side.section, side.hole], ['right', 1, 5, 2], 'the right wall of the upper storey');
  assert.ok(Math.abs(side.u - 1) < 1e-9 && Math.abs(side.y - 1.5) < 1e-9 && Math.abs(side.dirX + 1) < 1e-9 && Math.abs(side.dirZ) < 1e-9,
    'no blow given: into the wall');
}
const runs = {
  damaged: (w) => seam.damaged(damageSeed(anatomy.seed, 1), w),
  breach: (w) => seam.breach(hole, w),
  sectionDown: (w) => seam.sectionDown(anatomy.roof.section, damageSeed(anatomy.seed, 2), w),
  collapse: (w) => seam.collapse(damageSeed(anatomy.seed, 3), w),
};
const results = {};
for (const [stage, run] of Object.entries(runs)) {
  const a = makeWriters(...caps[stage]), b = makeWriters(...caps[stage]);
  const ra = run(a), rb = run(b);
  assert.equal(digest(a), digest(b), `${stage}: same seed, same pieces`);
  assert.deepEqual(ra, rb, `${stage}: same cuts and hides`);
  assert.ok(a.mesh.vertices <= caps[stage][0] && a.pieces.count <= caps[stage][1], `${stage} within its caps`);
  results[stage] = { writers: a, result: ra };
}
// damaged: chips and glass, the glass hidden
assert.ok(results.damaged.writers.pieces.count > 0);
assert.ok(results.damaged.writers.pieces.list.some((p) => p[0] === 'glass'), 'the glass breaks out');
assert.deepEqual(results.damaged.result.hides, [{ section: null, partClass: 'glass' }]);
// damaged leaves two spalled patches on the ground storey's widest faces (front, back: 10 m), each a shallow cut that
// spares what stands proud of the wall, the core's units and a backing in it, the render's lip round it, clear of windows
{
  const spalls = results.damaged.result.cuts;
  assert.equal(spalls.length, 2, 'two spalled patches');
  for (const cut of spalls) {
    assert.equal(cut.outsideM, 0.01);
    assert.ok(cut.radiusM >= 0.3 && cut.radiusM <= 0.5 && cut.depthM > 0.03 && cut.depthM < 0.1, 'a shallow disc');
    assert.ok(Math.abs(Math.abs(cut.z) - 4) < 1e-9 && cut.nz === Math.sign(cut.z), 'on the front or back face, facing out');
    assert.ok(cut.y - cut.radiusM > 0.4 && cut.y + cut.radiusM < 3, 'within the ground storey');
    const windows = anatomy.storeys[0].faces.find((f) => f.out[2] === cut.nz).openings;
    for (const o of windows) {
      const u = cut.nz > 0 ? cut.x : -cut.x;
      assert.ok(Math.abs(u - o.u) > o.w / 2 + cut.radiusM || cut.y + cut.radiusM < o.y0 || cut.y - cut.radiusM > o.y0 + o.h, 'clear of the windows');
    }
  }
  const runs = results.damaged.writers.mesh.runs;
  assert.deepEqual(runs.map((r) => `${r.bucket}:${r.role}`), ['stone:rim', 'regionalPlaster:rim', 'stone:rim', 'regionalPlaster:rim'],
    'the core\'s units and the render\'s lip, per patch');
  for (const [run, cut] of [[runs[0], spalls[0]], [runs[2], spalls[1]]]) {
    for (const v of run.v) {
      assert.ok(Math.hypot(v[0] - cut.x, v[1] - cut.y) < cut.radiusM * 1.6, 'the units fill the patch');
      assert.ok((v[2] - cut.z) * cut.nz <= 0.001, 'behind the face plane');
    }
  }
}
// breach: the rim's units round the hole's ragged outline on the front wall (wave 277: no porthole), inside the wall's
// thickness, the render lip just past it in broken arcs; the room is dark; one cut
const breachRuns = results.breach.writers.mesh.runs;
const rimRuns = breachRuns.filter((r) => r.role === 'rim');
assert.deepEqual(rimRuns.map((r) => r.bucket), ['stone', 'stone'], 'the core\'s units round the hole, then in the render\'s broken-back ring');
const holeX = 1, holeY = 2, depth = front.layers.reduce((s, l) => s + l.thicknessM, 0);
for (const v of rimRuns.flatMap((r) => r.v)) {
  assert.ok(v[2] <= 4 + 1e-9 && v[2] >= 4 - depth - 0.35, `inside the wall, nothing proud of it (z ${v[2].toFixed(3)})`);
}
// the outline at angle θ (atan2(up, along u); the front's u is +x): holeOutlineK of the edge's distance, the lobes the
// FX lane's cut follows
const edgeAt = (theta) => 0.9 * holeOutlineK(theta, hole.seed) / 0.8;
const boxesOf = (run) => {
  const out = [];
  for (let i = 0; i < run.v.length; i += 24) {
    const box = run.v.slice(i, i + 24);
    const b = [Math.min(...box.map((v) => v[0])), Math.max(...box.map((v) => v[0])), Math.min(...box.map((v) => v[1])), Math.max(...box.map((v) => v[1]))];
    const dx = (b[0] + b[1]) / 2 - holeX, dy = (b[2] + b[3]) / 2 - holeY;
    out.push({ b, dist: Math.hypot(dx, dy), theta: Math.atan2(dy, dx) });
  }
  return out;
};
const boxes = boxesOf(rimRuns[0]);
for (const box of boxes) {
  const ratio = box.dist / edgeAt(box.theta);
  assert.ok(ratio > 0.62 && ratio < 1.38, `a rim unit stands round the ragged edge (${ratio.toFixed(2)} of its distance at ${box.theta.toFixed(2)})`);
}
// the rim is not a ring: its units stand out in the lobes and in in the hollows
const lobes = boxes.filter((box) => edgeAt(box.theta) > 0.9 * 1.1), hollows = boxes.filter((box) => edgeAt(box.theta) < 0.9 * 0.9);
const meanDist = (list) => list.reduce((sum, box) => sum + box.dist, 0) / Math.max(1, list.length);
assert.ok(lobes.length && hollows.length && meanDist(lobes) > meanDist(hollows) * 1.2,
  `the rim follows the lobes (${meanDist(lobes).toFixed(2)} m out in them, ${meanDist(hollows).toFixed(2)} m in the hollows)`);
let covered = 0, probes = 0;
for (let k = 0; k < 72; k++) for (const ring of [0.85, 1, 1.15]) {
  const theta = k * Math.PI / 36;
  const px = holeX + Math.cos(theta) * edgeAt(theta) * ring, py = holeY + Math.sin(theta) * edgeAt(theta) * ring;
  probes++;
  if (boxes.some(({ b }) => px >= b[0] && px <= b[1] && py >= b[2] && py <= b[3])) covered++;
}
assert.ok(covered / probes > 0.4 && covered / probes < 0.92, `the rim covers the ragged edge band, broken where its chords dropped (${covered}/${probes})`);
// the render's broken-back ring: two or three arcs, not a full ring
{
  const arcBoxes = boxesOf(rimRuns[1]);
  const bins = new Set(arcBoxes.map((box) => Math.floor(((box.theta + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 18))));
  assert.ok(arcBoxes.length > 0 && bins.size < 32, `the render ring in broken arcs (${bins.size} of 36 ten-degree sectors)`);
}
assert.ok(breachRuns.some((r) => r.role === 'room' && r.bucket === 'dark'), 'the room behind it');
{
  const [ring, cut] = results.breach.result.cuts;
  assert.equal(results.breach.result.cuts.length, 2, 'the render\'s ring, then the hole (the newest last)');
  assert.ok(Math.abs(ring.radiusM - 0.9 * 1.45) < 1e-9 && ring.outsideM === 0.01 && ring.depthM < 0.1, 'a shallow ring through the render');
  assert.ok(cut.radiusM === 0.9 && cut.outsideM === 0.3 && cut.depthM > depth, 'the hole through the wall');
  // the ring's units lie over its edge band round the ragged outline (1.2–1.7 of the edge's distance), in broken arcs:
  // some of it, never all of it
  const ringBoxes = boxesOf(rimRuns[1]).map(({ b }) => b);
  let inRing = 0, probes = 0;
  for (let k = 0; k < 72; k++) for (const reach of [1.2, 1.45, 1.7]) {
    const theta = k * Math.PI / 36;
    const px = holeX + Math.cos(theta) * edgeAt(theta) * reach, py = holeY + Math.sin(theta) * edgeAt(theta) * reach;
    probes++;
    if (ringBoxes.some((b) => px >= b[0] && px <= b[1] && py >= b[2] && py <= b[3])) inRing++;
  }
  assert.ok(inRing / probes > 0.15 && inRing / probes < 0.8, `the ring's arcs over part of its edge band (${inRing}/${probes})`);
}
assert.ok(results.breach.writers.pieces.list.every((p) => p[18] <= 0.5), 'debris thrown along the blow (−Z, into the room)');
// sectionDown: the tiles fall, the roof hidden
assert.ok(results.sectionDown.writers.pieces.list.every((p) => p[1] === 'tile'));
assert.deepEqual(results.sectionDown.result.hides, [{ section: null, partClass: 'roof' }]);
// P2: a wall panel falls — the ground storey's front panel above its metre-high stub, the upper storey's to its floor line
{
  const frontDepth = front.layers.reduce((sum, l) => sum + l.thicknessM, 0);
  for (const [storeyIndex, stubTop] of [[0, 1], [1, 3]]) {
    const face = anatomy.storeys[storeyIndex].faces.find((f) => f.name === 'front');
    const run = (w) => seam.sectionDown(face.section, damageSeed(anatomy.seed, face.section, 255), w);
    const a = makeWriters(...caps.sectionDown), b = makeWriters(...caps.sectionDown);
    const ra = run(a);
    run(b);
    assert.equal(digest(a), digest(b), `storey ${storeyIndex}'s panel: same seed, same pieces`);
    assert.ok(a.mesh.vertices <= caps.sectionDown[0] && a.pieces.count <= caps.sectionDown[1], 'within the caps');
    assert.deepEqual(ra, { cuts: [], hides: [{ section: face.section, partClass: null }] }, 'the panel\'s own section hidden');
    const stub = a.mesh.runs.filter((r) => r.role === 'remnant');
    assert.deepEqual(stub.map((r) => r.bucket), ['stone'], 'the stub\'s top in the wall\'s core units');
    for (const v of stub[0].v) {
      assert.ok(v[1] > stubTop - 0.2 && v[1] < stubTop + 0.6, `a ragged course at the stub's top (y ${v[1].toFixed(2)})`);
      assert.ok(v[2] <= 4 + 1e-9 && v[2] >= 4 - frontDepth - 0.05, 'set in the wall\'s thickness');
    }
    const xs = stub[0].v.map((v) => v[0]);
    assert.ok(Math.min(...xs) < -4.5 && Math.max(...xs) > 4.5, 'along the whole face');
    assert.ok(a.mesh.runs.some((r) => r.role === 'room' && r.bucket === 'dark'), 'the room it opens, dark');
    const own = new Set([...face.layers.map((l) => l.bucket), 'glass']);
    assert.ok(a.pieces.list.length >= 40 && a.pieces.list.every((p) => own.has(p[0])), 'the panel\'s pieces in its own layers');
    assert.ok(a.pieces.list.every((p) => p[18] > 0), 'thrown out of the front face');
    assert.ok(a.pieces.list.every((p) => p[0] === 'glass' || p[4] >= stubTop - 1e-9), 'from above the stub'); // [4] py
    assert.ok(a.pieces.list.filter((p) => p[0] !== 'glass').slice(0, 6).every((p) => p[10] > unitSize(face) * 1.4), // [10] sx
      'big slabs of it first');
  }
  // the upper storey drops: its floor's timber and what stood on it, falling; its faces hidden
  const storeyRun = (w) => seam.storeyDown(1, damageSeed(anatomy.seed, 1, 255), w);
  const a = makeWriters(...caps.sectionDown), b = makeWriters(...caps.sectionDown);
  const ra = storeyRun(a);
  storeyRun(b);
  assert.equal(digest(a), digest(b), 'the storey drop: same seed, same pieces');
  assert.ok(a.pieces.list.some((p) => p[0] === anatomy.storeys[1].floor.structure.bucket), 'its floor\'s structure breaks up');
  assert.ok(a.pieces.list.every((p) => p[17] < 0), 'falling'); // [17] vy
  assert.deepEqual(ra.hides.map((h) => h.section).sort((x, y) => x - y), anatomy.storeys[1].faces.map((f) => f.section).sort((x, y) => x - y),
    'its faces hidden');
}
// collapse: stubs, a pile on the heap, debris; everything hidden
const collapseRuns = results.collapse.writers.mesh.runs;
assert.ok(collapseRuns.some((r) => r.role === 'remnant'), 'stubs stand');
const rubble = collapseRuns.filter((r) => r.role === 'rubble');
assert.ok(rubble.length >= 2 && rubble.some((r) => r.bucket === 'regionalRoof'), 'the pile in the building\'s own buckets');
let seated = 0, total = 0;
for (const run of rubble) {
  for (let i = 0; i < run.v.length; i += 24) {
    const box = run.v.slice(i, i + 24);
    const cx = box.reduce((s, v) => s + v[0], 0) / 24, cz = box.reduce((s, v) => s + v[2], 0) / 24;
    const top = Math.max(...box.map((v) => v[1]));
    const mound = bodyMoundHeightAt(anatomy, cx, cz);
    total++;
    if (top >= mound - 0.05) seated++;
  }
}
assert.ok(total > 50 && seated / total > 0.95, `the pile sits on the heap (${seated}/${total})`);
assert.deepEqual(results.collapse.result.hides, [{ section: null, partClass: null }], 'a collapse hides everything');

// ---- the chain: a kit's builders build its own anatomy; the default builds the default's
{
  const calls = [];
  registerStructureDamageKit({ id: 'selftest-kit', describe: () => null, collapse: () => { calls.push('kit'); return { cuts: [], hides: [] }; } });
  assert.deepEqual(structureDamageKitChain('cottage', 'selftest-kit').map((k) => k.id), ['selftest-kit', 'default']);
  const fromKit = createStructureDamageSeam(1, 'cottage', 'selftest-kit', { ...anatomy, kit: 'selftest-kit' }, []);
  fromKit.collapse(1, makeWriters(16000, 240));
  assert.deepEqual(calls, ['kit'], 'a kit\'s own anatomy goes to its own collapse');
  const fromDefault = createStructureDamageSeam(1, 'cottage', 'selftest-kit', anatomy, []);
  fromDefault.collapse(1, makeWriters(16000, 240));
  assert.deepEqual(calls, ['kit'], 'the default\'s anatomy goes to the default\'s builders');
  assert.equal(describeStructure({ ...input }).kit, 'default', 'a kit that describes nothing leaves the default');
  assert.equal(DEFAULT_STRUCTURE_DAMAGE_KIT.id, 'default');
}

// ---- tags: aDamage = structureIdx + 1 on a structure's vertices of a merge, 0 elsewhere
{
  const a = new BoxGeometry(1, 1, 1); a.userData.structureIdx = 4;
  const b = new BoxGeometry(1, 1, 1);
  const c = new BoxGeometry(1, 1, 1); c.userData.structureIdx = 0;
  const counts = [a, b, c].map((g) => g.index.count);
  const merged = { getAttribute: (name) => (name === 'position' ? { count: counts[0] + counts[1] + counts[2] } : undefined),
    setAttribute(name, value) { this[name] = value; } };
  assert.equal(tagStructureVertices([a, b, c], merged), true);
  const values = merged.aDamage.array;
  assert.ok(merged.aDamage instanceof BufferAttribute && values instanceof Uint16Array);
  assert.ok(values.slice(0, counts[0]).every((v) => v === 5) && values.slice(counts[0], counts[0] + counts[1]).every((v) => v === 0)
    && values.slice(counts[0] + counts[1]).every((v) => v === 1));
  const plain = { getAttribute: (name) => (name === 'position' ? { count: counts[1] } : undefined), setAttribute() { throw new Error('tagged'); } };
  assert.equal(tagStructureVertices([b], plain), false, 'no structure among the sources: no attribute');
}

// ---- a real map's build (Verdant: plain buckets and fine-detail batches): every structure described, its spans found
// where it stands and tagged, every bucket in world space, its shadow cast through a patchable depth material
{
  const { installWorldBuildFixture } = await import('../../tools/headlessWorldCollision.mjs');
  installWorldBuildFixture();
  const [maps, terrain, vegetation, props, models, fleet, THREE] = await Promise.all([
    import('./maps/index.ts'), import('./terrain.ts'), import('./vegetation.ts'), import('./props.ts'), import('./propsModelStore.ts'),
    import('../vehicles/fleetFactory.ts'), import('three'),
  ]);
  await models.preloadPropModels();
  const config = maps.getMapConfig('verdant');
  if (config.props?.tankWrecks?.ids?.length) await fleet.ensureTankBuilders(config.props.tankWrecks.ids);
  const field = terrain.createHeightField(1337, config);
  const engine = { anisotropy: 4, setupShadowMaterial() {} };
  const flora = vegetation.createVegetation(field, engine, 2001, config);
  const built = props.createProps(field, engine, 2002, config, flora);
  const records = [...built.obstacles, ...built.colliders].filter((r) => r.structureIdx !== undefined);
  const groups = new Set(records.map((r) => r.structureIdx));
  assert.ok(groups.size >= 5, `Verdant's structures (${groups.size})`);
  const identity = new THREE.Matrix4();
  let spansSeen = 0, batchedSeen = 0, inside = 0, sampled = 0;
  for (const id of groups) {
    const described = built.structureDamage.get(id);
    assert.ok(described && described.anatomy.structureIdx === id, `structure ${id} described`);
    const own = records.filter((r) => r.structureIdx === id);
    const box = own.reduce((b, r) => [Math.min(b[0], r.min[0]), Math.min(b[1], r.min[1]), Math.min(b[2], r.min[2]),
      Math.max(b[3], r.max[0]), Math.max(b[4], r.max[1]), Math.max(b[5], r.max[2])], [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
    const contact = built.obstacles.find((r) => r.structureIdx === id);
    assert.ok(Math.abs(described.anatomy.placement.y - contact.min[1]) < 3, 'its placement stands at its records');
    const spans = built.structureSpans.get(id) ?? [];
    assert.ok(spans.length > 0, `structure ${id}'s parts were found in the merged buckets`);
    for (const span of spans) {
      spansSeen++;
      if (span.geometryId !== null) batchedSeen++;
      assert.equal(span.instanceId === null, span.geometryId === null, 'a batched span names its instance, a mesh span none');
      assert.equal(span.position, span.mesh.geometry.getAttribute('position'), 'a span names its mesh\'s own positions');
      const tag = span.mesh.geometry.getAttribute('aDamage');
      assert.ok(tag, `the ${span.bucket} ${span.geometryId === null ? 'bucket' : 'batch'} is tagged`);
      assert.ok(span.first + span.count <= span.position.count && span.count % 3 === 0, 'whole triangles within the attribute');
      for (let v = span.first; v < span.first + span.count; v += Math.max(1, Math.floor(span.count / 9))) {
        assert.equal(tag.getX(v), id + 1, `structure ${id}'s vertices carry its tag (${span.bucket})`);
        const x = span.position.getX(v), y = span.position.getY(v), z = span.position.getZ(v);
        sampled++;
        if (x > box[0] - 4 && x < box[3] + 4 && z > box[2] - 4 && z < box[5] + 4 && y > box[1] - 3 && y < box[4] + 12) inside++;
      }
    }
  }
  assert.ok(batchedSeen > 0 && batchedSeen < spansSeen, `plain and batched spans (${spansSeen - batchedSeen} + ${batchedSeen})`);
  assert.ok(inside / sampled > 0.99, `a span's vertices stand at its structure (${inside}/${sampled})`);
  // world space: no bucket mesh, batch or their group carries a transform
  for (const entry of built.structureMaterials) {
    assert.ok(entry.mesh.matrix.equals(identity) && entry.mesh.parent === built.group && built.group.matrix.equals(identity),
      `${entry.mesh.name} is in world space`);
    if (entry.batched) for (let i = 0; i < entry.mesh.instanceCount; i++) {
      assert.ok(entry.mesh.getMatrixAt(i, new THREE.Matrix4()).equals(identity), 'every batch instance at identity');
    }
  }
  // the shadow: every casting bucket that holds a structure casts through its own RGBA-packed depth material
  const casting = new Set(built.structureMaterials.filter((e) => !e.batched && e.mesh.castShadow && e.mesh.geometry.getAttribute('aDamage'))
    .map((e) => e.mesh));
  assert.ok(casting.size > 0);
  for (const mesh of casting) {
    assert.ok(mesh.customDepthMaterial instanceof THREE.MeshDepthMaterial && mesh.customDepthMaterial.depthPacking === THREE.RGBADepthPacking,
      `${mesh.name} casts through a structure depth material`);
    assert.ok(built.structureMaterials.some((e) => e.role === 'depth' && e.material === mesh.customDepthMaterial && e.mesh === mesh));
  }
  for (const entry of built.structureMaterials) {
    if (!entry.mesh.geometry.getAttribute('aDamage')) assert.equal(entry.mesh.customDepthMaterial, undefined, 'a bucket without a structure is untouched');
  }
  // the patch: every distinct material once, the depth materials among them
  const { patchStructureMaterialEntries } = await import('./structureDamageSeam.ts');
  const roles = new Map();
  const count = patchStructureMaterialEntries(built.structureMaterials, (material, info) => {
    assert.ok(!roles.has(material), 'once each');
    roles.set(material, info.role);
    assert.ok(info.meshes.includes(info.mesh) && info.meshes.every((m) => built.structureMaterials.some((e) => e.mesh === m && e.material === material)));
  });
  assert.equal(count, new Set(built.structureMaterials.map((e) => e.material)).size);
  assert.ok([...roles.values()].filter((role) => role === 'depth').length === new Set([...casting].map((m) => m.customDepthMaterial)).size);
  // touchShadows: the meshes casting a structure's shadow change their shadow epoch, nothing else does
  const id = [...groups][0];
  const seam = createStructureDamageSeam(id, built.structureDamage.get(id).builder, null, built.structureDamage.get(id).anatomy,
    built.structureSpans.get(id));
  const before = new Map([...casting].map((m) => [m, m.userData.cotShadowEpoch]));
  seam.touchShadows();
  const touched = [...casting].filter((m) => m.userData.cotShadowEpoch !== before.get(m));
  assert.ok(touched.length > 0 && touched.every((m) => built.structureSpans.get(id).some((span) => span.mesh === m)),
    'the structure\'s casting buckets, and only they');
  seam.touchShadows();
  assert.ok(touched.every((m) => m.userData.cotShadowEpoch === (before.get(m) ?? 0) + 2), 'once a call');
  console.log(`destructionKit: Verdant built with ${groups.size} structures described, ${spansSeen} spans `
    + `(${batchedSeen} in batches) tagged where they stand (${inside}/${sampled}), ${casting.size} casting buckets through `
    + `depth materials, ${count} materials patchable`);
}

console.log('destructionKit: the default kit describes a house from its parts (storeys, faces, layers, openings, roof, '
  + 'floors, rubble) and builds every stage deterministically within its caps (rim at the hole, the room behind it, the '
  + 'pile on the sim\'s heap); the chain keeps a kit\'s anatomy with its own builders; aDamage tags; a real map\'s build PASS');
