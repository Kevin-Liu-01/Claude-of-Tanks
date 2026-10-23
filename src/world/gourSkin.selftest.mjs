// The map-revival lane (2026-10-07, Sirocco Wadi round 1; gauntlet wave 235 on the PR head: "soft, low, banded mesas",
// "a stretched, vertically streaked texture on the steep slope"): the mesa outliers' walls (terrain.ts mesas capCliff,
// gourSkin.ts, the scenery `gours`).
//
//   1. the outliers' walls stand as the Dahar's: wherever the wall rises to the cap at full height, a caprock cliff at the
//      cap's edge (over 60° for a few metres) above a slope gentler than it, where the PR head's smooth wall never passed
//      54° (where the mesa noise's flank stops short of the cap, a marl spur without its caprock, or the takyr flattens
//      it, there is no caprock to stand); those full walls most of the outline; the footprint is the authored one (the
//      mesa weight's outline is untouched);
//   2. each outlier is skinned along its traced outline: a long outline, most of it skinned, the caprock several metres
//      thick on average, its blocks and the fallen blocks on the talus, every row above the two tucked into the talus
//      standing clear of the rock on both the exact ground and the metre grid;
//   3. the geometry is the scenery rock family's, finite, deterministic, within budget on desktop and phones; only
//      Sirocco Wadi declares gours.
import assert from 'node:assert/strict';

const { installWorldBuildFixture } = await import('../../tools/headlessWorldCollision.mjs');
installWorldBuildFixture();
const { getMapConfig, MAP_IDS } = await import('./maps/index.ts');
const { createHeightField, mulberry32 } = await import('./terrain.ts');
const { SimplexNoise } = await import('../engine/simplexFast.ts');
const { buildGourSkin, traceOutline } = await import('./gourSkin.ts');

const cfg = getMapConfig('desert');
assert.ok(cfg.terrain.mesas?.capCliff, 'the mesas carry the caprock cliff');
const gours = cfg.scenery.gours;
assert.equal(gours.length, 2, 'the North Mesa and the Gara');
for (const id of MAP_IDS) if (id !== 'desert') assert.ok(!getMapConfig(id).scenery?.gours?.length, `${id} declares no gours`);

const f = createHeightField(1337, cfg);
const smoothCfg = { ...cfg, terrain: { ...cfg.terrain, mesas: { ...cfg.terrain.mesas, capCliff: undefined } } };
const fSmooth = createHeightField(1337, smoothCfg);
const deg = (s) => Math.atan(s) * 180 / Math.PI;
const report = [];
for (const [i, g] of gours.entries()) {
  // 1. the wall's section on rays out of the outline's stations, the cliff now against the smooth wall before
  const chains = traceOutline(f._mesaW, g, 2);
  const smoothChains = traceOutline(fSmooth._mesaW, g, 2);
  const len = (cs) => cs.reduce((n, c) => n + c.slice(1).reduce((m, p, k) => m + Math.hypot(p[0] - c[k][0], p[1] - c[k][1]), 0), 0);
  assert.ok(Math.abs(len(chains) - len(smoothChains)) < 1, `${g.name}: the footprint is the authored one (${len(chains).toFixed(0)} m of outline)`);
  let cliffRays = 0, rays = 0, fullRays = 0, smoothMax = 0;
  for (const c of chains) for (let k = 2; k + 2 < c.length; k += 25) {
    const [px, pz] = c[k], tx = c[k + 2][0] - c[k - 2][0], tz = c[k + 2][1] - c[k - 2][1], tl = Math.hypot(tx, tz) || 1;
    // (where the outline runs along the square's rim ring it is the trace's own cut, not a wall)
    if (Math.max(Math.abs(px), Math.abs(pz)) > 436) continue;
    let nx = tz / tl, nz = -tx / tl;
    if (f._mesaW(px + nx * 3, pz + nz * 3) > f._mesaW(px - nx * 3, pz - nz * 3)) { nx = -nx; nz = -nz; }
    let best = 0, bestSmooth = 0, wTop = 0, hi = -Infinity, lo = Infinity;
    for (let r = -40; r < 30; r += 1) {
      const s = (f.getHeightAt(px + nx * r, pz + nz * r) - f.getHeightAt(px + nx * (r + 2), pz + nz * (r + 2))) / 2;
      const s0 = (fSmooth.getHeightAt(px + nx * r, pz + nz * r) - fSmooth.getHeightAt(px + nx * (r + 2), pz + nz * (r + 2))) / 2;
      best = Math.max(best, deg(s)); bestSmooth = Math.max(bestSmooth, deg(s0));
      wTop = Math.max(wTop, f._mesaW(px + nx * r, pz + nz * r));
      const h = f.getHeightAt(px + nx * r, pz + nz * r); hi = Math.max(hi, h); lo = Math.min(lo, h);
    }
    rays++;
    // a full wall: the mesa weight reaches the cap and the ground drops seven tenths of the mesas' amplitude across it
    if (wTop < 0.99 || hi - lo < 0.7 * cfg.terrain.mesas.amp) continue;
    fullRays++;
    if (best > 60) cliffRays++;
    smoothMax = Math.max(smoothMax, bestSmooth);
  }
  assert.ok(fullRays >= rays * 0.5, `${g.name}: the walls at full height most of the outline (${fullRays} of ${rays} rays)`);
  assert.ok(cliffRays >= fullRays * 0.9, `${g.name}: a caprock cliff over 60° on the full walls (${cliffRays} of ${fullRays} rays; the smooth wall's steepest ${smoothMax.toFixed(0)}°)`);
  // 2. the skin
  const build = (mobile) => buildGourSkin(g, f, new SimplexNoise({ random: mulberry32(1337 + 9299) }), mulberry32(1337 + 18101 + 131 * i), { mobile });
  const b = build(false);
  assert.ok(b.geometry, `${g.name} builds`);
  assert.deepEqual(Object.keys(b.geometry.attributes).sort(), ['aRockGround', 'color', 'normal', 'position', 'uv'], 'the scenery rock family\'s attributes');
  const p = b.geometry.attributes.position.array;
  for (const v of p) assert.ok(Number.isFinite(v), 'finite positions');
  assert.deepEqual(Array.from(build(false).geometry.attributes.position.array), Array.from(p), 'deterministic');
  assert.ok(b.outlineM > 400, `${g.name}: its outline traced (${b.outlineM.toFixed(0)} m)`);
  assert.ok(b.stations * 1.6 > b.outlineM * 0.45, `${g.name}: most of the outline skinned (${b.stations} stations of ${(b.outlineM / 1.6).toFixed(0)})`);
  assert.ok(b.capM > 4, `${g.name}: the caprock several metres thick (${b.capM.toFixed(1)} m on average)`);
  assert.ok(b.blocks >= 40 && b.rubble >= 40, `${g.name}: the caprock's blocks (${b.blocks}) and the fallen ones (${b.rubble})`);
  assert.ok(b.clearance.rows > 2000 && b.clearance.inside / b.clearance.rows < 0.01,
    `${g.name}: the skin stands clear of the rock (${b.clearance.inside} of ${b.clearance.rows} wall vertices inside)`);
  // 3. budgets
  assert.ok(b.triangles <= 16000, `desktop budget (${b.triangles})`);
  const phone = build(true);
  assert.ok(phone.geometry && phone.triangles <= 5000, `phone budget (${phone.triangles})`);
  report.push(`${g.name}: ${b.outlineM.toFixed(0)} m outline, ${b.stations} stations, caprock ${b.capM.toFixed(1)} m, ${b.triangles} triangles (${phone.triangles} on phones), ${b.blocks} blocks, ${b.rubble} fallen; cliff on ${cliffRays}/${fullRays} full walls of ${rays} rays (smooth wall ${smoothMax.toFixed(0)}°)`);
}
console.log(report.join('\n'));
console.log('gourSkin selftest ok');
