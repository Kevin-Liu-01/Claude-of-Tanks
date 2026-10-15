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
assert.ok(desk.triangles <= 14000, `a desktop's skin within budget (${desk.triangles} triangles)`);
assert.ok(phone.triangles < desk.triangles * 0.7, `a phone builds fewer (${phone.triangles})`);
console.log(`jebelSkin.selftest: ${desk.triangles} triangles (phone ${phone.triangles}), ${desk.rays.walled}/${desk.rays.total} rays walled, ${(proud / count * 100).toFixed(1)} % proud, normals out`);
