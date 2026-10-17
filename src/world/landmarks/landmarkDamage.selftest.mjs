// landmarkDamage.selftest — the set pieces' fracture path (props lane A, E12, 2026-10-14; WORKLIST E12). Pinned:
//   1. named pieces (pieces.ts): a piece's geometries come out tagged with its name in their buckets, their collision as
//      emitted (dressing stays dressing, a structural member keeps its bands; `dressing` makes all of it dressing), the
//      pieces recorded against the parts; a second piece of one name throws; a railing on the ground or its dwarf wall
//      is laid as iron fence modules, a gallery's stays geometry;
//   2. every wired builder names its pieces (figures, finials, merlons, sails, the cap, the frame and cab, the bands and
//      the dishes, the face and the feed, the tanks, the radome, the sheaves);
//   3. the kit (damage.ts) claims a set piece with pieces or a frame and nothing else: a set piece without either, and a
//      regional building sharing a set piece's name, keep the reading they had;
//   4. the stages: `damaged` takes the damaged pieces off (hidden by name, their own triangles laid on the ground beyond
//      what they stood on, chips thrown); the breach stage's hole (slot 0) takes the breached ones, a strike's hole (slot
//      1 on) none; the same anatomy and seed write the same bytes; a tank ruptures toward the blow (a cut in its shell,
//      the torn petals, its dark inside, the spill on the ground); an open frame takes no spall and no cut; a light
//      frame's collapse lays its frame along the line it toppled, low on the ground, past its foot.
import { toppleHingeM } from '../toppleHinge.ts';
import assert from 'node:assert/strict';
import { installWorldBuildFixture } from '../../../tools/headlessWorldCollision.mjs';
installWorldBuildFixture();
const { PartSink } = await import('../maps/regional/geometry.ts');
const { streamFrom } = await import('../maps/regional/geometry.ts');
const { finishLandmark, landmarkModulesOf, landmarkPiecesOf, markLandmarkParts, piece, samplePieceGround } = await import('./pieces.ts');
const { railing } = await import('./kit.ts');
const { LANDMARK_BUILDERS } = await import('./index.ts');
const { resolveLandmarkParams } = await import('./plan.ts');
const { LATTICE_LANDMARKS, landmarkPlanOf } = await import('./damage.ts');
const { describeStructure } = await import('../structureDamageSeam.ts');
const { damageSeed } = await import('../destructionKit.ts');
const { structureDamageKitChain } = await import('../destructionKit.ts');
await import('../maps/regional/index.ts');

// ---------------------------------------------------------------------------------------------------------- 1. pieces
{
  const sink = new PartSink();
  sink.span('stone', -1, 0, -1, 1, 2, 1);
  piece(sink, { name: 'figure', kind: 'detach', at: 'breached' }, (s) => {
    s.span('structureMetal', -0.2, 2, -0.2, 0.2, 3.8, 0.2, { colour: [0.3, 0.35, 0.3] });
    s.span('structureMetal', -0.05, 3.8, -0.05, 0.05, 4.0, 0.05, { colour: [0.3, 0.35, 0.3], decor: true });
  });
  piece(sink, { name: 'plaque', kind: 'detach', at: 'damaged', dressing: true }, (s) => s.span('stone', -0.3, 0.8, 1, 0.3, 1.2, 1.05));
  assert.throws(() => piece(sink, { name: 'figure', kind: 'detach', at: 'damaged' }, () => {}), /a second piece/);
  railing(sink, [-3, -3], [3, -3], 0.9, [0.1, 0.1, 0.1]);
  railing(sink, [-3, 3], [3, 3], 0.9, [0.1, 0.1, 0.1], { base: 2.0 });
  const parts = finishLandmark(sink);
  const tagged = Object.values(parts).flat().filter((g) => g.userData.damagePiece === 'figure');
  assert.equal(tagged.length, 2, 'the figure: its structural and its dressing geometry');
  assert.equal(tagged.filter((g) => g.userData.noCollision).length, 1, 'its collision as emitted');
  assert.ok(Object.values(parts).flat().filter((g) => g.userData.damagePiece === 'plaque').every((g) => g.userData.noCollision), 'a dressing piece');
  const pieces = landmarkPiecesOf(parts);
  assert.deepEqual(pieces.map((p) => p.name), ['figure', 'plaque']);
  assert.ok(Math.abs(pieces[0].min[1] - 2) < 1e-6 && Math.abs(pieces[0].max[1] - 4) < 1e-6, 'its bounds');
  const modules = landmarkModulesOf(parts);
  assert.equal(modules.length, 2, 'the ground railing as two fence modules');
  assert.ok(modules.every((m) => m.kind === 'fenceiron' && m.lift === 0));
  assert.ok(Object.values(parts).flat().some((g) => { g.computeBoundingBox(); return g.boundingBox.max.y > 2.8; }), 'the gallery railing stays geometry');
  samplePieceGround(pieces, (x, z) => 0.1 * x);
  assert.equal(pieces[0].ground.n, 9);
}

// ---------------------------------------------------------------------------------------------------------- 2. the builders
const build = (kind, params = {}) => {
  const resolved = resolveLandmarkParams({ kind, x: 0, z: 0, params });
  const built = LANDMARK_BUILDERS[kind]({ kind, params: resolved, rng: streamFrom(101), variant: streamFrom(202), age: streamFrom(303), tier: 'desktop',
    groundFall: 0, brick: false, snowCap: false, mapId: 'selftest' });
  return built.parts;
};
const names = (kind, params) => (landmarkPiecesOf(build(kind, params)) ?? []).map((p) => p.name);
const expect = {
  statue: ['figure'], columnMonument: ['figure'], equestrianStatue: ['rider'], obelisk: ['finial'], fountain: ['bowl', 'finial'],
  campanile: ['pinnacle-0', 'pinnacle-1', 'pinnacle-2', 'pinnacle-3', 'cross'], valveTower: ['finial'],
  fireLookout: ['frame', 'cab', 'cab-roof'], radomeTower: ['radome-shell', 'radome', 'whip-0', 'whip-1'], troposcatter: ['face', 'truss', 'feed'],
  headframe: ['winding-house', 'deck-rail', 'sheave-l', 'sheave-r', 'ropes', 'frame', 'bin-legs', 'ore-bin'],
};
for (const [kind, want] of Object.entries(expect)) assert.deepEqual(names(kind), want, `${kind}'s pieces`);
assert.deepEqual(names('fountain', { style: 'markt' }), ['figure'], 'the Marktbrunnen\'s saint');
assert.ok(names('townGate').filter((n) => n.startsWith('merlon-')).length >= 4 && names('townGate').includes('finial'), 'the gate\'s merlons and finial');
assert.deepEqual(names('kolkhozArch'), ['flag-l', 'flag-r', 'banner', 'crest']);
for (const style of ['post', 'smock', 'tower']) {
  const n = names('windmill', { style });
  assert.deepEqual(n.filter((x) => x.startsWith('sail-')), ['sail-0', 'sail-1', 'sail-2', 'sail-3'], `the ${style} mill's sails`);
  assert.equal(n.includes('cap'), style !== 'post', `the ${style} mill's cap`);
}
assert.deepEqual(names('guyedMast'), ['mast', 'mast-head', 'guys-0', 'guys-1', 'guys-2', 'dish-0', 'dish-2', 'crown']);
assert.ok(names('fuelTankFarm', { tanks: 3 }).every((n) => n.startsWith('tank-')) && names('fuelTankFarm', { tanks: 3 }).length === 3);

// ---------------------------------------------------------------------------------------------------------- 3. the kit's claim
function describe(kind, params = {}, style = null, massClass = 'landmark', sized = false) {
  const parts = build(kind, params);
  markLandmarkParts(parts);
  const pieces = landmarkPiecesOf(parts);
  if (pieces) samplePieceGround(pieces, () => 0);
  // (227, lane B: `sized`, the set piece's own plan and height, as a map's placement measures it — a headframe's works run
  // 28 m from its winding house to its ore bin, and on the 8 m square its house and collar read as anchored far out)
  let w = 8, d = 8, h = 10;
  if (sized) {
    let x = 0, z = 0; h = 0;
    for (const g of Object.values(parts).flat()) {
      const arr = g.getAttribute('position').array;
      for (let i = 0; i < arr.length; i += 3) { x = Math.max(x, Math.abs(arr[i])); h = Math.max(h, arr[i + 1]); z = Math.max(z, Math.abs(arr[i + 2])); }
    }
    w = 2 * x; d = 2 * z;
  }
  return describeStructure({ structureIdx: 7, mapId: 'selftest', builder: kind, style, parts, w, d, h,
    placement: { x: 0, y: 0, z: 0, yaw: 0 }, massClass });
}
assert.equal(describe('statue').kit, 'statue', 'a set piece with pieces is the kit\'s');
assert.equal(describe('guyedMast', {}, null, 'shed').kit, 'guyedMast');
assert.ok(LATTICE_LANDMARKS.has('guyedMast') && landmarkPlanOf(describe('guyedMast', {}, null, 'shed')).lattice);
assert.ok(describe('guyedMast', {}, null, 'shed').kitPlan.damage.shaft, 'a light frame goes over whole (the shaft topple)');
assert.ok(!describe('guyedMast').kitPlan.damage?.shaft, 'a landmark frame never falls');
assert.notEqual(describe('stationHall').kit, 'stationHall', 'a set piece without pieces keeps its reading');
assert.ok(structureDamageKitChain('statue', null)[0].id === 'statue');

// ---------------------------------------------------------------------------------------------------------- 4. the stages
function writers(capacity = 24000, pieceCap = 96) {
  const runs = [];
  let current = null, vertices = 0;
  const pushed = [];
  return {
    runs, pushed,
    mesh: {
      begin(bucket, role) { current = { bucket, role, v: [], t: [] }; runs.push(current); return true; },
      vertex(px, py, pz, nx, ny, nz, u, v, r, g, b) { current.v.push(px, py, pz, nx, ny, nz, u, v, r, g, b); vertices++; return current.v.length / 11 - 1; },
      triangle(a, b, c) { current.t.push(a, b, c); },
      end() { current = null; },
      get vertices() { return vertices; },
      capacity,
    },
    pieces: {
      push(...args) { if (pushed.length >= pieceCap) return false; pushed.push(args); return true; },
      get count() { return pushed.length; },
      capacity: pieceCap,
    },
  };
}
const seam = (anatomy) => structureDamageKitChain(anatomy.kit, null).find((k) => k.id === anatomy.kit);
const runsOf = (out, role) => out.runs.filter((r) => r.role === role && r.t.length);
const minY = (runs) => Math.min(...runs.flatMap((r) => r.v.filter((_, i) => i % 11 === 1)));
const maxY = (runs) => Math.max(...runs.flatMap((r) => r.v.filter((_, i) => i % 11 === 1)));
const holeSpec = (anatomy, hole) => ({ section: 0, storey: 0, face: 'front', hole, u: 0, y: 1, radiusM: 0.6, dirX: 0, dirZ: -1, munition: 'he', cause: 'blast',
  seed: damageSeed(anatomy.seed, 0, hole) });
{
  const a = describe('statue');
  const kit = seam(a);
  const strike = writers();
  const s1 = kit.breach(a, holeSpec(a, 1), strike);
  assert.ok(!s1.hides.some((h) => h.piece), 'a strike\'s hole takes no piece off');
  const out = writers();
  const res = kit.breach(a, holeSpec(a, 0), out);
  assert.deepEqual(res.hides.filter((h) => h.piece).map((h) => h.piece), ['figure'], 'the breach stage takes the figure off');
  const laid = runsOf(out, 'rubble');
  const figure = landmarkPiecesOf(build('statue')).find((p) => p.name === 'figure');
  assert.equal(laid.reduce((n, r) => n + r.t.length / 3, 0), figure.triangles, 'its own triangles, every one');
  assert.ok(Math.abs(minY(laid) + 0.03) < 1e-3, `laid on the ground (${minY(laid).toFixed(3)})`);
  assert.ok(maxY(laid) < figure.max[1] - figure.min[1], 'lying, not standing');
  const plan = landmarkPlanOf(a);
  const reach = Math.max(...laid.flatMap((r) => r.v.filter((_, i) => i % 11 === 0 || i % 11 === 2).map(Math.abs)));
  assert.ok(reach > plan.body.w / 2, 'beyond the plinth it stood on');
  assert.ok(out.pushed.length > 0, 'chips of it thrown');
  const again = writers();
  kit.breach(a, holeSpec(a, 0), again);
  assert.deepEqual(again.runs.map((r) => [r.bucket, r.role, r.v, r.t]), out.runs.map((r) => [r.bucket, r.role, r.v, r.t]), 'the same bytes for the same anatomy and seed');
  const damaged = writers();
  assert.ok(!kit.damaged(a, damageSeed(a.seed, 1), damaged).hides.some((h) => h.piece), 'nothing of the statue goes at the first damage');
  const ob = describe('obelisk');
  assert.deepEqual(seam(ob).damaged(ob, damageSeed(ob.seed, 1), writers()).hides.filter((h) => h.piece).map((h) => h.piece), ['finial']);
}
{
  // a tank ruptures toward the blow: the cut in its shell on that side, the petals, the dark inside, the spill
  const a = describe('fuelTankFarm', { tanks: 2, radius: 3, height: 6 });
  const out = writers();
  const res = seam(a).breach(a, holeSpec(a, 0), out);
  const tank = landmarkPiecesOf(build('fuelTankFarm', { tanks: 2, radius: 3, height: 6 })).find((p) => p.name === 'tank-1');
  const cut = res.cuts.find((c) => Math.hypot(c.x - tank.vessel.x, c.z - tank.vessel.z) > tank.vessel.r - 0.01 && Math.hypot(c.x - tank.vessel.x, c.z - tank.vessel.z) < tank.vessel.r + 0.01);
  assert.ok(cut && cut.nz > 0.99, `the hole on the side toward the shooter (blow along -z): ${JSON.stringify(res.cuts)}`);
  assert.ok(runsOf(out, 'rim').some((r) => r.bucket === 'dark'), 'its dark inside');
  assert.ok(runsOf(out, 'rim').some((r) => r.bucket === 'structureMetal'), 'the torn petals');
  assert.ok(runsOf(out, 'rubble').some((r) => r.bucket === 'dark' && maxY([r]) < 0.1), 'the fuel\'s burn on the ground');
  assert.ok(!res.hides.some((h) => h.piece === 'tank-1'), 'a ruptured tank stands');
}
{
  // an open frame: no spall, no round hole; its dishes at the first damage, its head when breached, the whole over
  // along its line when the light mast falls
  const a = describe('guyedMast', { height: 24 }, null, 'shed');
  const kit = seam(a);
  const d = kit.damaged(a, damageSeed(a.seed, 1), writers());
  assert.equal(d.cuts.length, 0, 'no spall on a lattice');
  assert.deepEqual(d.hides.filter((h) => h.piece).map((h) => h.piece), ['dish-0', 'dish-2']);
  const b = kit.breach(a, holeSpec(a, 0), writers());
  assert.equal(b.cuts.length, 0, 'no round hole through a lattice');
  assert.deepEqual(b.hides.filter((h) => h.piece).map((h) => h.piece), ['crown']);
  a.mound = undefined;
  const out = writers();
  out.fallAxis = [1, 0];
  const c = kit.collapse(a, damageSeed(a.seed, 3), out);
  assert.ok(['mast', 'mast-head', 'guys-0', 'guys-1', 'guys-2'].every((n) => c.hides.some((h) => h.piece === n)), 'the frame laid down');
  const lying = out.runs.filter((r) => r.role === 'rubble');
  const xs = lying.flatMap((r) => r.v.filter((_, i) => i % 11 === 0));
  // (227, lane B: an open frame reads its members, so its height is the mast's own, and what lies is what stood over the
  // hinge, world/toppleHinge.ts)
  const over = a.h - toppleHingeM(a.h, true);
  assert.ok(Math.max(...xs) > Math.max(4, 0.8 * over), `it lies along its line, out past its foot (${Math.max(...xs).toFixed(1)} m of ${over.toFixed(1)} over the hinge)`);
  // (227, lane B: a frame buckles over its standing bays, world/toppleHinge.ts) no higher than its buckle, the rest lies low
  assert.ok(maxY(lying) < toppleHingeM(24, true) + 1, `no higher than its buckle (${maxY(lying).toFixed(2)} m)`);
}

{
  // the settled fall of every light frame (the coordinator's E12 review: "nothing floating"): its laid frame, its foot left
  // at the hinge and its body's heap all on the ground or on one another (the bunker standard's member contact, to 7 cm:
  // a stair's stub stands in the heap where its concrete foot was), and every chip it throws thrown (none left still in
  // the air: fx/structureDebris drops a still one to the ground)
  const THREE = await import('three');
  const r2 = await import('../../../tools/r2-standard.mjs');
  for (const [kind, params] of [['guyedMast', { height: 24 }], ['fireLookout', {}], ['troposcatter', {}], ['headframe', {}]]) {
    const a = describe(kind, params, null, 'shed', kind === 'headframe');
    const out = writers(60000, 1024);
    out.fallAxis = [0.8, 0.6];
    seam(a).collapse(a, damageSeed(a.seed, 3), out);
    const pos = [];
    for (const r of out.runs) for (const i of r.t) pos.push(r.v[i * 11], r.v[i * 11 + 1], r.v[i * 11 + 2]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    { let top = -Infinity, at = null; for (let i = 0; i < pos.length; i += 3) if (pos[i + 1] > top) { top = pos[i + 1]; at = [pos[i], pos[i + 2]]; }
      console.log('[probe]', kind, 'w', a.w, 'd', a.d, 'h', a.h, 'laid top', top.toFixed(2), 'at', at.map((v) => v.toFixed(1)).join(',')); }
    // and it lies down (the E12 film: a mast's guys swung up into the air, a billboard stood on its edge, a lookout's
    // frame lay as tall as its foot is wide): nothing of its fall stands over its standing bays (227, lane B: the frame
    // buckles over them, world/toppleHinge.ts) and four metres
    let top = -Infinity;
    for (let i = 1; i < pos.length; i += 3) top = Math.max(top, pos[i]);
    assert.ok(top <= Math.max(4, toppleHingeM(a.h, true) + 1), `${kind}: its fall lies down past its standing bays (up to ${top.toFixed(2)} m)`);
    // (227, lane B: a frame's footings, collar and sheds stand while it falls — landmarks/damage.ts — so what it lays may
    // rest on them: they join the check as they stand)
    const standing = [...pos];
    for (const sg of Object.values(build(kind, params)).flat()) {
      if (sg.userData.damagePiece) continue;
      const q = sg.index ? sg.toNonIndexed() : sg, arr = q.getAttribute('position').array;
      for (let i = 0; i < arr.length; i++) standing.push(arr[i]);
    }
    const gs = new THREE.BufferGeometry();
    gs.setAttribute('position', new THREE.Float32BufferAttribute(standing, 3));
    const floating = r2.floatingMembers(r2.toParts(gs), { groundM: 0.05, contactM: 0.07 });
    assert.deepEqual(floating.map((f) => f.min), [], `${kind}: nothing of its fall left in the air`);
    assert.ok(out.pushed.every((p) => p[4] < 0.3 || Math.hypot(p[16], p[17], p[18]) > 1e-3), `${kind}: every chip above the ground is thrown`);
  }
}

console.log('landmarkDamage selftest: PASS');
process.exit(0);
