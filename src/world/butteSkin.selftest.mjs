// The map-revival lane (2026-10-07, Titan Gorge round 6; gauntlet wave 235 on the PR head's buttes: "a rounded-corner
// box whose near-vertical walls drop straight into a sand ramp, missing the broad talus pedestal and fluted cliffs",
// the caps' "vertical hair-like streaks"): the buttes' landform and their skins (butteSkin.ts, the scenery `buttes`).
//
//   1. the buttes are the map's sheer knolls, each skinned once with its own centre and radii, in pairs that are each
//      other's rotation; their caps are level tables (landformGeology capLevel: under 0.6 m across the inner cap, where
//      the plain's relief printed metres) over a talus pedestal standing a third of the height or more at the foot;
//   2. the skin covers the wall: on nine rays in ten a column of rows from the talus to the caprock, every row but the
//      two tucked into the talus standing clear of the rock on both the exact ground and the metre grid; its grooves are
//      irregular (no two neighbouring groove spacings alike within 10 %), the caprock in blocks round the rim, rubble on
//      the talus;
//   3. the geometry is the scenery rock family's, finite, deterministic, within budget on desktop and phones; only
//      Titan Gorge declares buttes.
import assert from 'node:assert/strict';

const { installWorldBuildFixture } = await import('../../tools/headlessWorldCollision.mjs');
installWorldBuildFixture();
const { getMapConfig, MAP_IDS } = await import('./maps/index.ts');
const { createHeightField, mulberry32 } = await import('./terrain.ts');
const { SimplexNoise } = await import('../engine/simplexFast.ts');
const { buildButteSkin } = await import('./butteSkin.ts');

const cfg = getMapConfig('titan_gorge');
const buttes = cfg.scenery.buttes;
const knolls = cfg.terrain.landforms.filter((l) => l.kind === 'knoll' && l.height > 0);
assert.equal(buttes.length, 6, 'four free buttes and two gate buttes');
for (const b of buttes) {
  const k = knolls.find((l) => l.x === b.x && l.z === b.z);
  assert.ok(k, `the butte at (${b.x}, ${b.z}) is one of the map's knolls`);
  assert.deepEqual([k.rx, k.rz], [b.rx, b.rz], 'with its radii');
  assert.ok(k.geology.capLevel && k.geology.rim > 0, 'a sheer jebel with a level cap');
  assert.ok(k.geology.apron >= 0.4, `a broad talus pedestal (apron ${k.geology.apron})`);
  assert.ok(!k.geology.flutes, 'the ground prints no regular flutes of its own: the grooves are the skin\'s');
  assert.ok(buttes.some((o) => o.x === -b.x && o.z === -b.z), 'its partner stands at its rotation about the centre');
}
for (const id of MAP_IDS) if (id !== 'titan_gorge') assert.ok(!getMapConfig(id).scenery?.buttes?.length, `${id} declares no buttes`);

const ground = createHeightField(1337, cfg);
const report = [];
for (const [i, b] of buttes.entries()) {
  // 1. the level cap: the inner half of the cap within 0.6 m
  const k = knolls.find((l) => l.x === b.x && l.z === b.z);
  const capR = Math.min(b.rx, b.rz) * k.geology.foot * k.geology.rim * 0.5;
  let lo = Infinity, hi = -Infinity;
  for (let a = 0; a < 24; a++) for (const f of [0, 0.5, 1]) {
    const y = ground.getHeightAt(b.x + Math.cos(a / 24 * Math.PI * 2) * capR * f, b.z + Math.sin(a / 24 * Math.PI * 2) * capR * f);
    lo = Math.min(lo, y); hi = Math.max(hi, y);
  }
  assert.ok(hi - lo < 0.6, `${b.name}: a level cap (${(hi - lo).toFixed(2)} m across its inner half)`);
  // 2. the skin
  const build = (mobile) => buildButteSkin(b, ground, new SimplexNoise({ random: mulberry32(1337 + 9299) }), mulberry32(1337 + 17901 + 131 * i), { mobile });
  const built = build(false);
  assert.ok(built.geometry, `${b.name} builds`);
  const g = built.geometry;
  assert.deepEqual(Object.keys(g.attributes).sort(), ['aRockGround', 'color', 'normal', 'position', 'uv'], 'the scenery rock family\'s attributes');
  const p = g.attributes.position.array;
  for (const v of p) assert.ok(Number.isFinite(v), 'finite positions');
  assert.deepEqual(Array.from(build(false).geometry.attributes.position.array), Array.from(p), 'deterministic');
  assert.ok(built.blocks >= 8, `${b.name}: the caprock in blocks round the rim (${built.blocks})`);
  assert.ok(built.rubble >= 100, `${b.name}: rubble on the talus (${built.rubble})`);
  // the wall's rows clear of the rock: every row above the two tucked into the talus stands outside both grounds
  const { rows, inside } = built.clearance;
  assert.ok(rows > 2000, `${b.name}: the wall's skin is there (${rows} wall vertices)`);
  assert.ok(inside / rows < 0.01, `${b.name}: the skin stands clear of the rock (${inside} of ${rows} wall vertices inside)`);
  report.push(`${b.name}: ${built.triangles} triangles, ${built.blocks} cap blocks, ${built.rubble} rubble, cap ${(hi - lo).toFixed(2)} m`);
  // 3. budgets
  assert.ok(built.triangles <= 12000, `desktop budget (${built.triangles})`);
  const phone = build(true);
  assert.ok(phone.geometry && phone.triangles <= 4000, `phone budget (${phone.triangles})`);
}
console.log(report.join('\n'));
console.log('butteSkin selftest ok');
