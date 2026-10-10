// wadiRumPosts.selftest — the Desert Patrol's barrack and fuel post on the map's plaster, and the Bedouin's goat-hair
// tents, in place of the light families' timber-printed builds and the camps' flat-coloured ridge tent (the Redrock lane,
// round 10; gauntlet wave 270: "a vertical-stripe texture with tiny black windows", "a plain panelled box", "the tent in
// front is a plain box"). Pinned:
//   1. each build: position, normal, uv and colour; inside its family's footprint and height (its key, ground fit,
//      collider and beats are kept); within its budget; deterministic, from its own seed whatever the stream;
//   2. the barrack and the post: a stone core under a render skin proud of it, broken (stone shows in holes of the
//      render), the openings dark, steel doors and barred windows under timber lintels, a parapet round the roof;
//   3. the tents: black goat hair over most of them, a roof over the poles that sags between them, the front open on its
//      rugs, the qata's pale bands inside;
//   4. the broken states low and inside the footprints;
//   5. the wiring: each family's class, contact, collider, extents, resistance and crush threshold kept, its draws taken
//      from the stream (no more, no fewer), the variant table naming them, Redrock adopting them by name.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DESTRUCTIBLE_BUILDING_TYPES } from '../structureKit.ts';
import { DESTRUCTIBLE_TYPES } from '../inhabitKit.ts';
import { BEDOUIN_CAMP_TENT, BEDOUIN_TENT, RUM_BARRACK, RUM_POST, RUM_SHED } from './wadiRumPosts.ts';
import { STRUCTURE_VARIANTS } from './ksarGate.ts';

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const lum = (c, i) => 0.2126 * c.getX(i) + 0.7152 * c.getY(i) + 0.0722 * c.getZ(i);
const CASES = [
  ['rumbarrack', RUM_BARRACK, DESTRUCTIBLE_BUILDING_TYPES.quonsethut, 2200],
  ['rumpost', RUM_POST, DESTRUCTIBLE_BUILDING_TYPES.checkpointhut, 1700],
  // (round 11: the motor pool's vehicle shade, "a blue-roofed shelter" no more)
  ['rumshed', RUM_SHED, DESTRUCTIBLE_BUILDING_TYPES.motorpool, 2000],
  ['bedouintent', BEDOUIN_TENT, DESTRUCTIBLE_BUILDING_TYPES.deserttent, 1100],
  ['bedouincamp', BEDOUIN_CAMP_TENT, DESTRUCTIBLE_TYPES.tent, 800],
];

for (const [name, variant, base, budget] of CASES) {
  // ------------------------------------------------------------------------------------------- 1. the build
  for (const seed of [1, 7, 2024]) {
    const g = variant.build(mulberry32(seed));
    const p = g.attributes.position, c = g.attributes.color;
    assert.ok(g.attributes.normal && g.attributes.uv && c && c.itemSize === 3, `${name}: position, normal, uv and a colour per vertex`);
    const tris = (g.index ? g.index.count : p.count) / 3;
    assert.ok(tris <= budget, `${name}: within its budget (${tris} of ${budget} triangles)`);
    g.computeBoundingBox();
    const b = g.boundingBox;
    assert.ok(Math.max(-b.min.x, b.max.x) <= base.hw + 1e-6 && Math.max(-b.min.z, b.max.z) <= base.hl + 1e-6 && b.max.y <= base.h + 1e-6 && b.min.y >= -0.31,
      `${name}: inside its family's footprint (${Math.max(-b.min.x, b.max.x).toFixed(2)} x ${Math.max(-b.min.z, b.max.z).toFixed(2)} x ${b.max.y.toFixed(2)} of ${base.hw} x ${base.hl} x ${base.h})`);
  }
  const a = variant.build(mulberry32(9)), again = variant.build(mulberry32(31337));
  assert.deepEqual(Array.from(a.attributes.position.array), Array.from(again.attributes.position.array), `${name}: from its own seed, whatever the stream`);
  // ------------------------------------------------------------------------------------------- 4. the broken state
  const broken = variant.broken(mulberry32(5));
  broken.computeBoundingBox();
  const bb = broken.boundingBox;
  assert.ok(bb.max.y < base.h * 0.62 && Math.max(-bb.min.x, bb.max.x) <= base.hw + 1e-6 && Math.max(-bb.min.z, bb.max.z) <= base.hl + 1e-6,
    `${name}: its broken state low and inside the footprint (${bb.max.y.toFixed(2)} m)`);
  // ------------------------------------------------------------------------------------------- 5. the family kept
  for (const field of ['cls', 'contact', 'collider', 'hw', 'hl', 'r', 'h', 'keep', 'crushMin']) {
    assert.equal(variant[field], base[field], `${name}: its family's ${field}`);
  }
  const count = (fn) => { let n = 0; const s = mulberry32(77); fn(() => { n++; return s(); }); return n; };
  assert.equal(count((rng) => variant.build(rng)), count((rng) => base.build(rng)), `${name}: the build takes its family's draws, no more, no fewer`);
  assert.equal(count((rng) => variant.broken(rng)), count((rng) => base.broken(rng)), `${name}: and so does the broken build`);
  assert.equal(STRUCTURE_VARIANTS[name], variant, `${name}: in the variant table`);
}

// ------------------------------------------------------------------------------- 2. the barrack's and the post's walls
for (const [name, variant, w, d] of [['rumbarrack', RUM_BARRACK, 4.6, 11.0], ['rumpost', RUM_POST, 3.4, 4.4]]) {
  assert.equal(variant.mat, 'regionalPlaster', `${name}: on the map's regional plaster, not the light families' timber print`);
  const g = variant.build(mulberry32(3)), p = g.attributes.position, c = g.attributes.color;
  // the render: bright vertices 2-6 cm proud of the core's long faces; the stone showing: the share of those faces (over
  // the footing, under the roof's lip, the openings and their reveals aside) the render's outer face does not cover
  let render = 0, dark = 0, steel = 0, lintel = 0, parapet = 0, skin = 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), l = lum(c, i), r = c.getX(i), gg = c.getY(i), bl = c.getZ(i);
    const out = Math.abs(x) - w / 2;
    if (l > 0.75 && out > 0.02 && out < 0.06 && y > 0.6) render++;
    if (l < 0.1) dark++;
    if ((gg > r * 1.25 || bl > r * 1.3) && l > 0.25 && l < 0.5 && y < 2.1) steel++;
    if (r > gg * 1.15 && l < 0.4 && l > 0.15 && y > 1.9 && y < 2.4) lintel++;
    if (l > 0.75 && y > (name === 'rumbarrack' ? 3.15 : 2.65)) parapet++;
  }
  for (let t = 0; t < p.count; t += 3) {
    const ax = p.getX(t), ay = p.getY(t), az = p.getZ(t), bx = p.getX(t + 1), by = p.getY(t + 1), bz = p.getZ(t + 1), cx = p.getX(t + 2), cy = p.getY(t + 2), cz = p.getZ(t + 2);
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const area = Math.hypot(nx, ny, nz) / 2;
    if (Math.abs(nx) / (2 * area) > 0.99 && Math.abs(Math.abs(ax) - (w / 2 + 0.05)) < 1e-3 && Math.sign(nx) === Math.sign(ax)) skin += area;
  }
  const rise = name === 'rumbarrack' ? [0.55, 3.1 - 0.18] : [0.5, 2.6 - 0.16];
  const face = 2 * (d + 0.1) * (rise[1] - rise[0]);
  assert.ok(skin < face * 0.9 && skin > face * 0.55, `${name}: the render broken to the stone in places (${(100 * skin / face).toFixed(0)} % of the long faces rendered)`);
  assert.ok(render > 200, `${name}: a render skin proud of the core (${render} vertices)`);
  assert.ok(dark > 24, `${name}: dark openings (${dark} vertices)`);
  assert.ok(lintel >= 24, `${name}: timber lintels proud over the openings (${lintel} vertices)`);
  assert.ok(parapet > 16, `${name}: a parapet round the roof (${parapet} vertices)`);
  if (name === 'rumbarrack') assert.ok(steel >= 24, `${name}: painted steel doors (${steel} vertices)`);
}

// ------------------------------------------------------------------------------- 3. the tents
for (const [name, variant] of [['bedouintent', BEDOUIN_TENT], ['bedouincamp', BEDOUIN_CAMP_TENT]]) {
  assert.equal(variant.mat, 'burlap', `${name}: on the hessian's weave (round 11: goat hair, not canvas)`);
  const g = variant.build(mulberry32(3)), p = g.attributes.position, c = g.attributes.color;
  g.computeBoundingBox();
  const top = g.boundingBox.max.y, hw = g.boundingBox.max.x;
  let black = 0, pale = 0, rug = 0, frontLow = 0, n = 0;
  // the roof's height over the ridge line (x ~ 0) at each z: highest at the poles, lower between them
  const ridge = new Map();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), l = lum(c, i);
    n++;
    if (l < 0.16) black++;
    if (l > 0.6) pale++;
    if (y < 0.05 && c.getX(i) > c.getY(i) * 1.6) rug++;
    if (x > hw * 0.6 && y > 0.2 && y < top * 0.5 && l < 0.16) frontLow++;
    if (Math.abs(x) < 1e-3 && y > top * 0.75 && l < 0.16) ridge.set(z.toFixed(2), Math.max(ridge.get(z.toFixed(2)) ?? 0, y));
  }
  assert.ok(black > n * 0.45, `${name}: black goat hair over most of it (${(100 * black / n).toFixed(0)} %)`);
  assert.ok(pale > 0, `${name}: the qata's pale bands inside`);
  assert.ok(rug > 12, `${name}: rugs on the sand (${rug} vertices)`);
  assert.equal(frontLow, 0, `${name}: the front open (no goat-hair wall low on the front)`);
  const heights = [...ridge.values()];
  assert.ok(heights.length >= 5 && Math.max(...heights) - Math.min(...heights) > 0.08, `${name}: the roof sagging between its poles (${heights.length} stations)`);
}

// ------------------------------------------------------------------------------- 5. Redrock adopts them by name
{
  const badlands = readFileSync(new URL('../badlands.ts', import.meta.url), 'utf8');
  assert.match(badlands, /structureVariants: \{ bunker: 'sangar', quonsethut: 'rumbarrack', checkpointhut: 'rumpost', motorpool: 'rumshed',\n\s*deserttent: 'bedouintent', tent: 'bedouincamp' \},/,
    'Redrock: its barrack, posts, vehicle shades, desert tents and camp tents the Wadi Rum ones');
  assert.match(badlands, /destructibleBuildings: \['deserttent', 'motorpool', 'quonsethut', 'checkpointhut'\],/, 'the families keep their keys (and every later seat)');
}
console.log('wadiRumPosts.selftest: the barrack and the post rendered over stone on the map\'s plaster (holes to the stone, dark openings, steel doors, lintels, parapets), the goat-hair tents (black, sagging, open-fronted on their rugs, the qata inside), inside their families\' footprints and draws, Redrock\'s by name');
