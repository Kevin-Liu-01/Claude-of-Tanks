// felledPoles.selftest.mjs — the shelled road's felled telegraph poles (props lane A, #21, 2026-10-15): a felled pole's
// debris (stump, length, crossarm, downed wire) is one geometry on the baked family's attributes, seated as props.ts seats
// its proxies (the stump's foot under the verge, the rest lying on the ground, nothing sunk into it or standing off it),
// its insulators and its timber by map (green glass and copper on the old rural lines, white porcelain on the arid
// maps' silvered poles), its wire on the ground, deterministic at its site; and props.ts draws it in place of the proxies,
// which stay its collision records and keep the stream's draws.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { felledPoleDebris } from './felledPoles.ts';
import { planGroundedSegment, sampleDiscGround } from '../propPlacement.ts';

const ground = (x, z) => 3 + 0.04 * x - 0.025 * z + 0.05 * Math.sin(x * 0.7) * Math.cos(z * 0.5);
const field = { getHeightAt: ground };

function site(mapId, ox, oz, yaw, stumpH, lean, len) {
  const oy = sampleDiscGround(field, ox, oz, 0.17, 0.03).y;
  const dirX = Math.sin(yaw), dirZ = Math.cos(yaw);
  const pose = planGroundedSegment(field, ox + dirX * (len * 0.5 + 0.4), oz + dirZ * (len * 0.5 + 0.4), dirX, dirZ, len, 0.13, 0.02);
  return {
    mapId, ground,
    stump: { x: ox, y: oy + 0.45, z: oz, h: stumpH, lean },
    arm: { x: pose.end.x, y: pose.end.support.min + 0.05, z: pose.end.z, yaw: yaw + 0.9 },
    fall: { x: pose.x, y: pose.y, z: pose.z, axis: [pose.axisX, pose.axisY, pose.axisZ], len },
  };
}

const looks = {};
for (const [mapId, ox, oz, yaw, h, lean, len] of [
  ['verdant', 12, -30, 0.4, 0.9, 0.1, 5.6], ['desert', -40, 18, 2.2, 1.5, -0.12, 6.8], ['urban', 3, 7, 4.1, 1.2, 0, 6.1],
  ['winter', -8, -8, 5.5, 1.05, 0.05, 6.4],
]) {
  const s = site(mapId, ox, oz, yaw, h, lean, len);
  const g = felledPoleDebris(s);
  assert.deepEqual(Object.keys(g.attributes).sort(), ['color', 'normal', 'position', 'uv'], `${mapId}: the baked family's attributes`);
  assert.equal(g.index, null, `${mapId}: unindexed like the baked family's other parts`);
  const p = g.attributes.position, c = g.attributes.color, n = g.attributes.normal, tris = p.count / 3;
  assert.ok(tris >= 600 && tris <= 2400, `${mapId}: ${tris} triangles`);
  let wire = 0, green = 0, white = 0, low = Infinity;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = c.getX(i), gg = c.getY(i), b = c.getZ(i);
    assert.ok([x, y, z, r, gg, b, n.getX(i), n.getY(i), n.getZ(i)].every(Number.isFinite), `${mapId}: finite`);
    const clear = y - ground(x, z), fromStump = Math.hypot(x - ox, z - oz);
    if (fromStump > 0.45) {
      // the length, the arm and the wire lie on the ground: none sunk into it, none standing off it
      assert.ok(clear > -0.07, `${mapId}: sunk ${clear.toFixed(3)} m at ${fromStump.toFixed(2)} m from the stump`);
      assert.ok(clear < 0.42, `${mapId}: stands ${clear.toFixed(3)} m off the ground at ${fromStump.toFixed(2)} m`);
      low = Math.min(low, clear);
    } else {
      // the stump: its foot under the verge, its splinters no higher than the snapped pole could reach
      assert.ok(clear > -0.75 && clear < h + 0.35, `${mapId}: the stump's ${clear.toFixed(3)} m`);
    }
    if (clear > 0.012 && clear < 0.05 && fromStump > 1) wire++;
    if (gg > r + 0.04 && gg > b) green++;
    if (r > 0.55 && gg > 0.55 && b > 0.5) white++;
  }
  assert.ok(low < 0.03, `${mapId}: the debris rests on the ground (lowest ${low.toFixed(3)} m)`);
  assert.ok(wire >= 90, `${mapId}: the downed wire lies on the ground (${wire} vertices)`);
  looks[mapId] = { green, white };
  const again = felledPoleDebris(s);
  assert.deepEqual(again.attributes.position.array, p.array, `${mapId}: deterministic`);
  assert.deepEqual(again.attributes.color.array, c.array, `${mapId}: deterministic colour`);
  g.dispose(); again.dispose();
}
assert.ok(looks.verdant.green > 40, `the old rural line's green glass (${looks.verdant.green})`);
assert.ok(looks.desert.white > 40 && looks.desert.green < 10, `the arid line's white porcelain (${looks.desert.white})`);
// two poles at two sites differ (each pole's looks from its own seed)
const a = felledPoleDebris(site('steppe', 1, 1, 1, 1.2, 0, 6)), b = felledPoleDebris(site('steppe', 41, -17, 1, 1.2, 0, 6));
assert.notDeepEqual(Array.from(a.attributes.color.array.slice(0, 60)), Array.from(b.attributes.color.array.slice(0, 60)), 'each pole its own');
a.dispose(); b.dispose();

// props.ts draws the debris where the proxies stood: the proxies only make the collision records (and keep the draws)
const props = readFileSync(new URL('../props.ts', import.meta.url), 'utf8');
const owner = props.slice(props.indexOf('function placeFelledUtilityPoles('), props.indexOf('placeFelledUtilityPoles();'));
assert.ok(owner.includes('buckets.baked.push(felledPoleDebris('), 'props.ts draws the felled pole');
assert.ok(!/buckets\.wood\.push\((stump|fall|arm)\)/.test(owner), 'the proxies are not drawn');
assert.ok(owner.includes('drawnPlanRecord([part], base, -1)') && owner.includes('part.dispose()'), 'the proxies stay the records');
console.log('felledPoles.selftest: 4 maps + 2 sites, stump/length/arm/wire seated on the ground, glass vs porcelain, deterministic, wired');
