// Receipt (the maps lane, 2026-10-14; MA.12, the jointed-face prototype the owner judges first): jebelSkin.ts draws a
// dome's wall as Wadi Rum's jointed face, and on Redrock's west lane dome it is a skin and nothing more.
//   - it covers the wall all the way round (the clefts' gentler rays bridged): at least 95 % of the rays walled;
//   - its faces turn out from the dome (every normal's horizontal part points away from the centre);
//   - it stands proud of the ground over most of its area (the joints stay 0.7 m out; only the run into the talus and the
//     shoulder's tuck may dip under);
//   - it stays inside its budget on a desktop (14k triangles) and a phone builds fewer;
//   - it carries the attributes the scenery rock mesh merges (position, normal, color, aRockGround, uv) and no mass:
//     the scenery pass's colliders are what they are without it.
import assert from 'node:assert/strict';
import { createHeightField, mulberry32 } from './terrain.ts';
import { getMapConfig } from './maps/index.ts';
import { buildJebelSkin } from './jebelSkin.ts';
import { SimplexNoise } from '../engine/simplexFast.ts';

const cfg = getMapConfig('badlands');
const field = createHeightField(1337, cfg);
const [skin] = cfg.scenery.jebelSkins;
assert.ok(skin && skin.x === -118 && skin.z === -128, "Redrock's prototype skin stands on the west lane dome");
const build = (mobile) => buildJebelSkin(skin, field, new SimplexNoise({ random: mulberry32(7) }), mulberry32(19301), { mobile });
const desk = build(false), phone = build(true);
assert.ok(desk.geometry, 'the dome has a wall to skin');
assert.ok(desk.rays.walled / desk.rays.total >= 0.95, `the skin runs round the wall (${desk.rays.walled}/${desk.rays.total} rays)`);
for (const name of ['position', 'normal', 'color', 'aRockGround', 'uv']) assert.ok(desk.geometry.getAttribute(name), `the skin carries ${name}`);
const p = desk.geometry.attributes.position.array, n = desk.geometry.attributes.normal.array;
let outward = 0, proud = 0;
for (let v = 0; v < p.length / 3; v++) {
  const dx = p[v * 3] - skin.x, dz = p[v * 3 + 2] - skin.z, l = Math.hypot(dx, dz) || 1;
  if (n[v * 3] * dx / l + n[v * 3 + 2] * dz / l > 0) outward++;
  if (p[v * 3 + 1] >= field.getHeightAt(p[v * 3], p[v * 3 + 2]) - 0.05) proud++;
}
const count = p.length / 3;
assert.equal(outward, count, 'every face turns out from the dome');
assert.ok(proud / count >= 0.8, `the skin stands proud of the ground over most of it (${(proud / count * 100).toFixed(1)} %)`);
// (the blind critics, 2026-10-15, second pass: "from 45 m up the near dome's face splits into thin vertical sliver fins",
// "a dark blotchy eye") the wall's top runs on round the dome — neighbouring rays' tops within 2.5 m, no column standing
// as a fin over the next — and the skin runs unbroken, no capped slot opening into the shade behind it
const { top } = desk.wall;
let worstStep = 0, slots = 0;
for (let j = 0; j < top.length; j++) {
  const a = top[j], b = top[(j + 1) % top.length];
  if (Number.isFinite(a) && Number.isFinite(b)) worstStep = Math.max(worstStep, Math.abs(a - b));
  if (Number.isFinite(a) !== Number.isFinite(b)) slots++;
}
assert.ok(worstStep <= 2.5, `neighbouring columns end together (worst step ${worstStep.toFixed(2)} m)`);
assert.equal(slots, 0, 'the skin runs unbroken round the wall');
// (MAPS 227, the critics' fins, second look) the skin closes over the height field's V-cuts (no slot more than 3 m deep
// against the wall four rays either side, up its body), its foot comes down every ray's wall to the ground (each ray's
// lowest point within a metre of it), and no vertex is thrown across a saddle (no triangle edge over 8 m)
const { foot } = desk.wall, rays = top.length;
const rayOf = (x, z) => ((Math.round(Math.atan2(z - skin.z, x - skin.x) / (Math.PI * 2) * rays) % rays) + rays) % rays;
const outer = new Map(), lowest = new Map();
for (let v = 0; v < count; v++) {
  const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2], j = rayOf(x, z), r = Math.hypot(x - skin.x, z - skin.z);
  if (y > foot[j] + 1 && y < top[j] - 1) { const k = j * 1000 + Math.floor(y); if (!(outer.get(k) >= r)) outer.set(k, r); }
  const lo = lowest.get(j); if (!lo || y < lo[1]) lowest.set(j, [x, y, z]);
}
let deepest = 0;
for (const [k, r] of outer) {
  const j = Math.floor(k / 1000), y = k - j * 1000, a = outer.get(((j - 4 + rays) % rays) * 1000 + y), b = outer.get(((j + 4) % rays) * 1000 + y);
  if (a !== undefined && b !== undefined) deepest = Math.max(deepest, (a + b) / 2 - r);
}
assert.ok(deepest <= 3, `the skin closes over the height field's cuts (deepest slot ${deepest.toFixed(2)} m)`);
let hung = 0;
for (const [, [x, y, z]] of lowest) if (y > field.getHeightAt(x, z) + 1) hung++;
assert.equal(hung, 0, 'every ray of the skin comes down into the ground');
let longest = 0;
for (let t = 0; t < count / 3; t++) for (let e = 0; e < 3; e++) {
  const a = t * 9 + e * 3, c = t * 9 + ((e + 1) % 3) * 3;
  longest = Math.max(longest, Math.hypot(p[a] - p[c], p[a + 1] - p[c + 1], p[a + 2] - p[c + 2]));
}
assert.ok(longest <= 8, `no sliver thrown across a saddle (longest edge ${longest.toFixed(2)} m)`);
assert.ok(desk.triangles <= 14000, `a desktop's skin within budget (${desk.triangles} triangles)`);
assert.ok(phone.triangles < desk.triangles * 0.7, `a phone builds fewer (${phone.triangles})`);
console.log(`jebelSkin.selftest: ${desk.triangles} triangles (phone ${phone.triangles}), ${desk.rays.walled}/${desk.rays.total} rays walled, ${(proud / count * 100).toFixed(1)} % proud, normals out; worst top step ${worstStep.toFixed(2)} m, no slot; deepest cut ${deepest.toFixed(2)} m, every foot in the ground, longest edge ${longest.toFixed(2)} m`);
