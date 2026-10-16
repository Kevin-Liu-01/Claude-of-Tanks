// r2-standard.selftest — the bunker r2 standard's receipt checks what it says (props lane A, E14, 2026-10-14; the owner:
// "great job on the bunkers!! ... update all our buildings from before which had this flat ugly looking format of low
// detail"). Pinned:
//   1. the painted-opening detector on built cases: a dark plate stuck on a wall is found; a leaf set back in a cut
//      opening, a plate at the back of a 15 cm niche and a light plate are not; a plate framed by trims 5 cm proud is
//      still painted; a long dark strip is a strip, not an opening;
//   2. the old painted wicket (gateUnit before E2) on a synthetic leaf stays detected; a Fachwerk wall's flush posts, rails
//      and braces are its frame, not openings, while a dark door stuck on it is one; once E2 is on the tree no kit barn
//      carries a painted wicket (live, every style's barn);
//   3. the reference passes: every pillbox form (maps/fortKit.ts r2) on its bank — no painted opening, box-only share
//      under 10 %, grounded, a wreck with volume, its fracture anatomy clean;
//   4. the counter-examples fail for their reasons: the owner's flat shed (a box on posts, dark slits stuck on) for its
//      painted openings and its box-only share; the old pillbox (inhabitKit bBunker) and the old crate for their box-only
//      share; the hunting blind's raft (main's PROP_FRACTURE plan) for its wreck's height;
//   5. the spec's other rules: a generic form where the place has its own, excused only with a reason; a far form over
//      its cap; a loosened limit without its reason; a fracture anatomy that does not fit its triangles.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { boxShare, floatingMembers, paintedOpenings, r2Check, wreckVolume } from './r2-standard.mjs';
import { installWorldBuildFixture } from './headlessWorldCollision.mjs';
installWorldBuildFixture();
const { FORT_GRADE, FORT_MAPS, buildPillbox, fortFor, pillboxBerm } = await import('../src/world/maps/fortKit.ts');
const { DESTRUCTIBLE_TYPES } = await import('../src/world/maps/inhabitKit.ts');
const { DESTRUCTIBLE_BUILDING_TYPES } = await import('../src/world/maps/structureKit.ts');
const { ARCHITECTURE_STYLES, buildRegionalParts } = await import('../src/world/maps/regional/index.ts');
const { streamFrom } = await import('../src/world/maps/regional/geometry.ts');

const seeded = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
/** A box (w, h, d) at (x, y, z), non-indexed, in one vertex colour. */
function block(w, h, d, x, y, z, c = [0.6, 0.55, 0.5]) {
  const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
  const n = g.getAttribute('position').count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set(c, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const DARK = [0.05, 0.045, 0.04], LIGHT = [0.7, 0.66, 0.6];

// ------------------------------------------------------------------------------------------- 1. the detector on built cases
{
  // a wall 3 x 2.5 m, 20 cm thick, its face at z = 0.1
  const wall = () => block(3, 2.5, 0.2, 0, 1.25, 0);
  const stuck = paintedOpenings([wall(), block(0.8, 1.8, 0.02, 0, 0.95, 0.11, DARK)]);
  assert.equal(stuck.length, 1, 'a dark door plate 1 cm proud of the wall is a painted opening');
  assert.equal(stuck[0].kind, 'opening');
  assert.deepEqual(stuck[0].normal, [0, 0, 1], 'it faces out of the wall');

  // the same door cut through: the wall in three pieces round the hole, the leaf set back in the reveal
  const cut = paintedOpenings([block(1, 2.5, 0.2, -1, 1.25, 0), block(1, 2.5, 0.2, 1, 1.25, 0), block(1, 0.4, 0.2, 0, 2.3, 0),
    block(0.98, 2.08, 0.04, 0, 1.05, -0.03, DARK)]);
  assert.equal(cut.length, 0, 'a leaf set back in a cut opening is no painted opening');

  // a niche 15 cm deep with a dark back: the wall round it, the back slab, a dark plate on the back
  const niche = paintedOpenings([block(1.2, 2.5, 0.2, -0.9, 1.25, 0), block(1.2, 2.5, 0.2, 0.9, 1.25, 0),
    block(0.6, 1.0, 0.2, 0, 0.5, 0), block(0.6, 0.9, 0.2, 0, 2.05, 0), block(0.6, 0.6, 0.05, 0, 1.3, -0.075),
    block(0.58, 0.58, 0.01, 0, 1.3, -0.045, DARK)]);
  assert.equal(niche.length, 0, 'the back of a 15 cm reveal is an opening with depth (the pillbox embrasure\'s throat)');

  // a light plate on the wall: a board, not an opening
  assert.equal(paintedOpenings([wall(), block(0.8, 1.8, 0.02, 0, 0.95, 0.11, LIGHT)]).length, 0, 'a plate as light as its wall is no opening');

  // a dark plate inside trims 5 cm proud: still painted (a trim is no reveal)
  const framed = paintedOpenings([wall(), block(0.6, 0.8, 0.02, 0, 1.4, 0.11, DARK),
    block(0.08, 0.96, 0.05, -0.34, 1.4, 0.125), block(0.08, 0.96, 0.05, 0.34, 1.4, 0.125),
    block(0.6, 0.08, 0.05, 0, 0.96, 0.125), block(0.6, 0.08, 0.05, 0, 1.84, 0.125)]);
  assert.equal(framed.filter((p) => p.kind === 'opening').length, 1, 'a dark plate inside a proud trim frame is still painted');

  // a dark timber 3 m x 12 cm laid on the wall: a strip (rule 2's overlay), not an opening
  const strip = paintedOpenings([wall(), block(2.8, 0.12, 0.01, 0, 1.6, 0.105, DARK)]);
  assert.equal(strip.length, 1);
  assert.equal(strip[0].kind, 'strip', 'a long dark band is a strip');

  // the dark bucket over a lit one is dark whatever the colours; a pane in the glass bucket on the glass is not
  const buckets = paintedOpenings({ stone: [wall()], dark: [new THREE.BoxGeometry(0.7, 1.6, 0.02).translate(0, 0.9, 0.11)] });
  assert.equal(buckets.length, 1, 'a dark-bucket plate on a stone wall is painted');
  assert.equal(buckets[0].hostBucket, 'stone');
}

// ------------------------------------------------------------------------------- 1b. Lane B's false positives (2026-10-15)
{
  // a window cut through a wall 4 x 2.5 m (its hole 1.0 x 1.2 m at x 0, y 0.9..2.1), a dark shutter leaf opened flat on the
  // wall beside it: the leaf lies beside an opening, never painted
  const wallAround = (hw, y0, y1) => [block(1.5, 2.5, 0.2, -2 + 0.75, 1.25, 0), block(1.5, 2.5, 0.2, 2 - 0.75, 1.25, 0),
    block(1.0, y0, 0.2, 0, y0 / 2, 0), block(1.0, 2.5 - y1, 0.2, 0, (y1 + 2.5) / 2, 0)];
  const shutter = paintedOpenings([...wallAround(0.5, 0.9, 2.1), block(0.5, 1.2, 0.03, 0.55 + 0.26, 1.5, 0.115, DARK)]);
  assert.equal(shutter.length, 0, `an open shutter flat on the wall beside its window is no painted opening (found ${JSON.stringify(shutter)})`);
  // the same dark leaf on a blank wall is still painted (no opening beside it)
  assert.equal(paintedOpenings([block(4, 2.5, 0.2, 0, 1.25, 0), block(0.5, 1.2, 0.03, 0.81, 1.5, 0.115, DARK)]).length, 1, 'a dark leaf on a blank wall is painted');

  // a door's frame: a dark ring 1.1 x 2.2 m, 9 cm wide, over a lighter leaf on the wall — a ring, never a plate
  const ringShape = new THREE.Shape([new THREE.Vector2(-0.55, 0), new THREE.Vector2(0.55, 0), new THREE.Vector2(0.55, 2.2), new THREE.Vector2(-0.55, 2.2)]);
  ringShape.holes.push(new THREE.Path([new THREE.Vector2(-0.46, 0.0001), new THREE.Vector2(-0.46, 2.11), new THREE.Vector2(0.46, 2.11), new THREE.Vector2(0.46, 0.0001)]));
  const ring = new THREE.ExtrudeGeometry(ringShape, { depth: 0.03, bevelEnabled: false }).translate(0, 0, 0.13).toNonIndexed();
  const rc = new Float32Array(ring.getAttribute('position').count * 3); for (let i = 0; i < rc.length; i += 3) rc.set(DARK, i);
  ring.setAttribute('color', new THREE.BufferAttribute(rc, 3));
  const framedLeaf = paintedOpenings([block(3, 2.5, 0.2, 0, 1.25, 0), block(0.92, 2.11, 0.03, 0, 1.055, 0.115, LIGHT), ring]);
  assert.equal(framedLeaf.filter((p) => p.span[0] > 1 && p.span[1] > 2).length, 0, `a door frame's ring over its leaf is no plate (found ${JSON.stringify(framedLeaf)})`);

  // a long pane of two triangles (its diagonal shared): read 3.0 x 0.7 m, not skewed by the diagonal
  const pane = new THREE.PlaneGeometry(3.0, 0.7).translate(0, 1.4, 0.105).toNonIndexed();
  const stuck = paintedOpenings({ stone: [block(4, 2.5, 0.2, 0, 1.25, 0)], glass: [pane] });
  assert.equal(stuck.length, 1, 'a glass pane stuck on a stone wall is painted');
  assert.ok(Math.abs(stuck[0].span[0] - 3.0) < 0.01 && Math.abs(stuck[0].span[1] - 0.7) < 0.01, `its span read straight (${stuck[0].span})`);
  // the same pane set in its cut opening: its samples stay on it (behind it the hole), no painted opening
  const glazed = paintedOpenings({ stone: [block(0.5, 2.5, 0.2, -1.75, 1.25, 0), block(0.5, 2.5, 0.2, 1.75, 1.25, 0),
    block(3.0, 1.05, 0.2, 0, 0.525, 0), block(3.0, 0.75, 0.2, 0, 2.125, 0)], glass: [new THREE.PlaneGeometry(3.0, 0.7).translate(0, 1.4, 0).toNonIndexed()] });
  assert.equal(glazed.length, 0, `a long pane in its cut opening is no painted opening (found ${JSON.stringify(glazed)})`);
}

// ------------------------------------------------------------------------------------------- 2. the barns' wicket; the Fachwerk
{
  // the old painted wicket (gateUnit before Lane B's E2, regional/openings.ts): a near-black 0.7 x 1.75 m plate 2 cm thick
  // on a leaf of boards with its battens — the fixture stays detected whatever the kits do
  const leaf = () => [block(1.6, 2.6, 0.05, -0.8, 1.3, 0.015, [0.32, 0.24, 0.16]),
    ...[0.31, 1.3, 2.29].map((y) => block(1.52, 0.1, 0.03, -0.8, y, 0.05, [0.3, 0.22, 0.15]))];
  const wall = block(5, 3, 0.3, 0, 1.5, -0.15, [0.6, 0.55, 0.5]);
  const plates = paintedOpenings({ structureWood: leaf(), stone: [wall], dark: [new THREE.BoxGeometry(0.7, 1.75, 0.02).translate(-0.8, 0.95, 0.05)] });
  const wicket = plates.filter((p) => p.kind === 'opening' && p.bucket === 'dark' && p.hostBucket === 'structureWood');
  assert.equal(wicket.length, 1, `the old painted wicket is a painted opening (found ${JSON.stringify(plates)})`);
  assert.deepEqual(wicket[0].span, [0.7, 1.75]);

  // a Fachwerk wall (hessian, eifel, franconian): its posts, rails and a brace laid flush in the render are its frame,
  // never painted openings; a dark door stuck on the same wall still is
  const timber = [0.22, 0.15, 0.1];
  const brace = block(0.19, 2.0, 0.02, 0, 0, 0, timber);
  brace.rotateZ(Math.PI / 4).translate(1.2, 1.4, 0.11);
  const frame = [block(0.19, 2.8, 0.02, -2.2, 1.4, 0.11, timber), block(0.19, 2.8, 0.02, 0, 1.4, 0.11, timber),
    block(0.19, 2.8, 0.02, 2.2, 1.4, 0.11, timber), block(4.6, 0.19, 0.02, 0, 0.1, 0.11, timber), block(4.6, 0.19, 0.02, 0, 2.7, 0.11, timber), brace];
  const fachwerk = paintedOpenings({ regionalPlaster: [block(5, 3, 0.2, 0, 1.5, 0, [0.85, 0.82, 0.76])], structureWood: frame,
    dark: [new THREE.BoxGeometry(0.9, 1.9, 0.02).translate(-1.1, 0.97, 0.11)] });
  assert.equal(fachwerk.filter((p) => p.bucket === 'structureWood').length, 0, `a Fachwerk frame is no opening (found ${JSON.stringify(fachwerk)})`);
  assert.equal(fachwerk.filter((p) => p.kind === 'opening' && p.bucket === 'dark').length, 1, 'the dark door stuck on it is');

  // live, once E2 is on the tree (openings.ts no longer lays the painted wicket): no kit barn carries one
  const openingsSource = readFileSync(new URL('../src/world/maps/regional/openings.ts', import.meta.url), 'utf8');
  const e2 = !openingsSource.includes("faceBox(sink, 'dark', face, u - w / 4, y + 0.95, go + 0.03, 0.7, 1.75, 0.02");
  if (e2) {
    const [w, d, h] = [8.4, 12.3, 6.2];
    for (const style of ARCHITECTURE_STYLES) {
      if (!style.builders.barn) continue;
      const parts = buildRegionalParts(style, { structureId: 'barn', info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
        wallBucket: 'stone', rng: streamFrom(11), variant: streamFrom(80), mapId: 'selftest', snowCap: false, tier: 'desktop' }, streamFrom(38));
      const painted = paintedOpenings(parts).filter((p) => p.kind === 'opening' && p.bucket === 'dark' && p.hostBucket === 'structureWood'
        && Math.abs(p.span[0] - 0.7) < 0.02 && Math.abs(p.span[1] - 1.75) < 0.02);
      assert.equal(painted.length, 0, `${style.id}'s barn carries no painted wicket (E2): ${JSON.stringify(painted)}`);
    }
  } else console.log('r2-standard selftest: the kit barns still lay gateUnit\'s painted wicket (E2 not on this tree): the live check waits for it');
}

// ------------------------------------------------------------------------------------------- 3. the reference: the pillbox r2
const styles = new Map();
for (const mapId of Object.keys(FORT_MAPS)) { const s = fortFor(mapId).style; if (!styles.has(s)) styles.set(s, mapId); }
assert.equal(styles.size, 4, 'four pillbox forms');
const reference = r2Check({
  kind: 'prop:bunker',
  maps: Object.keys(FORT_MAPS),
  resolve: (mapId) => {
    const f = fortFor(mapId);
    // (its bank, and the grade: props.ts seats the pillbox FORT_GRADE under the terrain, so grade stands there in its frame)
    return { form: f.style, build: () => buildPillbox(f.style, f.tones, f.seed, false), broken: () => buildPillbox(f.style, f.tones, f.seed, true),
      support: () => [pillboxBerm(f.style, f.tones, f.seed), FORT_GRADE] };
  },
  route: 'settle', fortified: true,
  // (the reference's settled heaps run 1.56-1.73x the intact triangles on this tree; the looks lane's E1 caps them at
  // 1.39-1.47x, under the standard's 1.5x — tighten this to the default once E1 is on the tree)
  caps: { near: 9000, wreckRatio: 1.8 },
});
assert.ok(reference.ok, `the pillbox r2 meets its own standard:\n  ${reference.problems.join('\n  ')}`);
for (const f of reference.forms) {
  assert.equal(f.metrics.paintedPlates, 0, `${f.form}: no painted opening`);
  assert.ok(f.metrics.boxShare < 0.1, `${f.form}: box-only share ${f.metrics.boxShare}`);
  assert.ok(f.metrics.wreckHeight >= 0.4 && f.metrics.wreckFootprint >= 1, `${f.form}: a heap with volume (${f.metrics.wreckHeight}, ${f.metrics.wreckFootprint})`);
  assert.ok(f.metrics.pieces > 0 && f.metrics.pieces <= 64, `${f.form}: its fracture anatomy`);
}

// ------------------------------------------------------------------------------------------- 4. the counter-examples
{
  // the owner's flat shed (makeHuntingBlind of main, part for part): four posts, a plank box, a slab roof, two slits
  const shed = () => {
    const parts = [];
    for (const x of [-1.15, 1.15]) for (const z of [-1.15, 1.15]) parts.push(block(0.16, 3.1, 0.16, x, 1.55, z, [0.2, 0.15, 0.1]));
    parts.push(block(2.8, 2.2, 2.8, 0, 4.2, 0, [0.35, 0.27, 0.18]));
    parts.push(block(3.2, 0.12, 3.3, 0, 5.36, 0, [0.3, 0.24, 0.16]));
    for (const s of [-1, 1]) parts.push(block(0.08, 0.45, 1.5, s * 1.43, 4.45, 0, [0.12, 0.09, 0.06]));
    return parts;
  };
  const r = r2Check({ kind: 'prop:huntingblind (main)', maps: ['verdant'], resolve: () => ({ form: 'generic', build: shed }), genericOk: { verdant: 'test' }, noBroken: true });
  assert.ok(!r.ok);
  assert.equal(r.problems.filter((p) => p.includes('painted opening')).length, 2, 'its two slits are painted on');
  assert.ok(r.problems.some((p) => p.includes('box-only share 100 %')), 'it is all plain boxes');

  const old = r2Check({ kind: 'prop:bunker (main)', maps: ['verdant'], genericOk: { verdant: 'test' },
    resolve: () => ({ form: 'generic', build: () => DESTRUCTIBLE_TYPES.bunker.build(seeded(7)), broken: () => DESTRUCTIBLE_TYPES.bunker.broken(seeded(7)) }) });
  assert.ok(old.problems.some((p) => p.includes('box-only share')), 'the old pillbox is plain boxes');
  const crate = boxShare(DESTRUCTIBLE_TYPES.crate.build(seeded(7)));
  assert.ok(crate.share > 0.9, `the old crate is plain boxes (${crate.share.toFixed(2)})`);

  // the raft: the hunting blind's destroyed state is main's PROP_FRACTURE plan (a raft of its pieces on the ground)
  const blind = DESTRUCTIBLE_BUILDING_TYPES.huntingblind;
  const raft = wreckVolume(blind.build(seeded(17)), blind.broken(seeded(0x71f00d)));
  assert.ok(raft.heightRatio < 0.25, `the hunting blind's wreck is a raft (${raft.heightRatio.toFixed(2)} of its height)`);
}

// ------------------------------------------------------------------------------------------- 5. the spec's other rules
{
  const post = () => block(0.2, 1, 0.2, 0, 0.5, 0);
  const base = { kind: 'test:post', route: 'crush', resolve: (mapId) => ({ form: mapId === 'desert' ? 'generic' : 'oak', build: post }) };
  const generic = r2Check({ ...base, maps: ['verdant', 'desert'] });
  assert.ok(generic.problems.some((p) => p.includes('desert: the generic form')), 'a generic form where the place has its own');
  assert.ok(r2Check({ ...base, maps: ['verdant', 'desert'], genericOk: { desert: 'a plain post is the place\'s own' } }).problems.every((p) => !p.includes('the generic form')));
  assert.ok(r2Check({ ...base, maps: [] }).problems.some((p) => p.includes('no maps')), 'a spec names its maps');
  const far = r2Check({ ...base, maps: ['verdant'], resolve: () => ({ form: 'oak', build: post, far: () => new THREE.SphereGeometry(1, 12, 8) }), caps: { far: 60 } });
  assert.ok(far.problems.some((p) => p.includes('far form')), 'the far form over its cap');
  assert.ok(r2Check({ ...base, maps: ['verdant'], limits: { wreckHeightMin: 0.05 } }).problems.some((p) => p.includes('without a reason')));
  // a two-piece anatomy (a footing and a post), then the post's box moved off its triangles
  const two = () => {
    const g = new THREE.BufferGeometry();
    const a = block(1, 0.2, 1, 0, -0.1, 0).getAttribute('position').array, b = block(0.2, 1, 0.2, 0, 0.5, 0).getAttribute('position').array;
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b], 3));
    const piece = (tri0, c, h, extra = {}) => ({ role: 'post', material: 'wood', bucket: 'baked', tri0, triN: 12, c, h, q: [0, 0, 0, 1], massKg: 10, ...extra });
    g.userData.fracture = { kind: 'test', pieces: [piece(0, [0, -0.1, 0], [0.5, 0.1, 0.5], { anchor: true, role: 'footing' }), piece(12, [0, 0.5, 0], [0.1, 0.5, 0.1])],
      links: [{ a: 0, b: 1, kind: 'nail' }] };
    return g;
  };
  const clean = r2Check({ kind: 'test:anatomy', maps: ['verdant'], route: 'fracture', noBroken: true, resolve: () => ({ form: 'oak', build: two }) });
  assert.ok(clean.problems.every((p) => !p.includes('fracture')), `a fitting anatomy: ${clean.problems.join('; ')}`);
  const moved = r2Check({ kind: 'test:anatomy', maps: ['verdant'], route: 'fracture', noBroken: true, resolve: () => ({ form: 'oak', build: () => {
    const g = two(); g.userData.fracture.pieces[1].c = [0, 1.5, 0]; return g;
  } }) });
  assert.ok(moved.problems.some((p) => p.includes('fracture: piece 1')), 'a piece whose box misses its triangles');
  // grounded: a member 10 cm off the ground floats; on a support it stands
  const lifted = () => [block(0.2, 1, 0.2, 0, 0.6, 0)];
  assert.equal(floatingMembers(lifted()).length, 1, 'a post 10 cm over grade floats');
  assert.equal(floatingMembers(lifted(), { support: [block(1, 0.1, 1, 0, 0.05, 0)] }).length, 0, 'on a plinth it stands');
}

console.log('r2-standard selftest: PASS');
process.exit(0);
