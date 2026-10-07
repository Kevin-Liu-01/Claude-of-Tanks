// The map-revival lane (2026-10-07, Chimney Valley round 3; gauntlet wave 206: "smooth, symmetrical truncated cones"
// with "a regular sawtooth crown", openings that are "flat pure-black planes with zero interior depth", a dovecote that
// is "an obviously flat dot-grid decal"): the castle rocks' skins (castleRock.ts, the scenery `castles` family).
//
//   1. the castles are the map's own pinnacles: each stands on a knoll landform of the same centre and radii, the
//      castle rocks each other's rotation, each gate rock's passage on the valley's axis (a mouth on both faces), and
//      the knolls' cores carry no flutes or bosses of their own (the regular crown they printed);
//   2. built on the real ground, every room is cut back into the rock and stands in front of the knoll's wall: each
//      room a metre deep at the least (a gate's passage 2.2 m), its interior dark but never black, and no
//      interior vertex inside the terrain; the dovecotes' pigeon holes are recessed; each rock carries rooms on every
//      tier and its dovecotes, each gate rock its two passages and their buttresses as masses;
//   3. the geometry is the scenery rock family's (position, normal, colour, aRockGround, uv), finite, deterministic,
//      within its triangle budget on desktop and phones; only Chimney Valley declares castles.
import assert from 'node:assert/strict';

const { installWorldBuildFixture } = await import('../../tools/headlessWorldCollision.mjs');
installWorldBuildFixture();
const { getMapConfig, MAP_IDS } = await import('./maps/index.ts');
const { createHeightField, mulberry32 } = await import('./terrain.ts');
const { SimplexNoise } = await import('../engine/simplexFast.ts');
const { buildCastleRock } = await import('./castleRock.ts');

const cfg = getMapConfig('goreme');
const castles = cfg.scenery.castles;
const knolls = cfg.terrain.landforms.filter((l) => l.kind === 'knoll');
assert.equal(castles.length, 4, 'two castle rocks and two gate rocks');
for (const rock of castles) {
  const knoll = knolls.find((k) => k.x === rock.x && k.z === rock.z);
  assert.ok(knoll, `the castle at (${rock.x}, ${rock.z}) is one of the map's pinnacles`);
  assert.deepEqual([knoll.rx, knoll.rz], [rock.rx, rock.rz], 'with its radii');
  assert.ok(!knoll.geology.flutes && !knoll.geology.bosses, 'its core prints no regular flutes or bosses of its own');
}
const [castleA, castleB, gateA, gateB] = castles;
assert.ok(castleA.x === -castleB.x && castleA.z === -castleB.z && !castleA.gates && !castleB.gates,
  'the castle rocks are each other\'s rotation and carry no passage');
for (const gate of [gateA, gateB]) {
  assert.equal(gate.gates.length, 2, 'a gate rock\'s passage has two mouths');
  const toCentre = Math.atan2(-gate.z, -gate.x);
  assert.ok(gate.gates.some((b) => Math.abs(Math.atan2(Math.sin(b - toCentre), Math.cos(b - toCentre))) < 1e-9),
    'one mouth faces the valley\'s middle and the other away, on its axis');
}
for (const id of MAP_IDS) if (id !== 'goreme') assert.ok(!getMapConfig(id).scenery?.castles?.length, `${id} declares no castle rocks`);

const ground = createHeightField(1337, cfg);
const noise = () => new SimplexNoise({ random: mulberry32(1337 + 9299) });
const build = (rock, i, mobile = false) => buildCastleRock(rock, ground, noise(), mulberry32(1337 + 17301 + 131 * i), { mobile });
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const report = [];
for (const [i, rock] of castles.entries()) {
  const built = build(rock, i);
  assert.ok(built.geometry, `castle ${i} builds`);
  const g = built.geometry;
  assert.deepEqual(Object.keys(g.attributes).sort(), ['aRockGround', 'color', 'normal', 'position', 'uv'], 'the scenery rock family\'s attributes');
  const p = g.attributes.position.array, c = g.attributes.color.array;
  for (const v of p) assert.ok(Number.isFinite(v), 'finite positions');
  const again = build(rock, i);
  assert.deepEqual(Array.from(again.geometry.attributes.position.array), Array.from(p), 'deterministic');
  // 2. the rooms
  const gates = built.rooms.filter((r) => r.kind === 'gate');
  const cut = built.rooms.filter((r) => r.kind !== 'gate');
  assert.equal(gates.length, rock.gates?.length ?? 0, 'every passage mouth is cut');
  for (const r of gates) assert.ok(r.depth >= 2.2 && r.w >= 3.5 && r.h >= 4, `a passage mouth is deep and wide (${JSON.stringify(r)})`);
  for (const r of cut) assert.ok(r.depth >= 1.0, `a room is a metre deep at the least (${JSON.stringify(r)})`);
  // (a castle rock is half again a gate rock's girth)
  const big = !rock.gates;
  assert.ok(cut.filter((r) => r.kind === 'door').length >= (big ? 6 : 4), 'doors on the rock\'s first tier');
  assert.ok(cut.filter((r) => r.kind === 'window').length >= (big ? 30 : 12), 'windows up its faces');
  assert.equal(built.masses.length, rock.gates?.length ?? 0, 'a gate\'s buttress is a mass; the skin elsewhere is none');
  let dark = 0, buried = 0, black = 0, darkest = Infinity;
  for (let v = 0; v < p.length / 3; v++) {
    const l = lum(c[v * 3], c[v * 3 + 1], c[v * 3 + 2]);
    darkest = Math.min(darkest, l);
    if (l < 0.012) black++;
    if (l > 0.1) continue;
    dark++;
    const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
    // (both the exact ground and the metre grid the terrain's mesh is drawn from)
    if (y < Math.max(ground.getHeightAt(x, z), ground.getHeightAtFast(x, z)) - 0.05) buried++;
  }
  assert.equal(black, 0, `no interior is black (darkest linear luminance ${darkest.toFixed(3)})`);
  assert.ok(dark > 300, 'the rooms\' interiors are there');
  assert.equal(buried, 0, `the rooms stand in front of the knoll's wall (${buried} of ${dark} interior vertices inside the terrain)`);
  report.push(`${rock.name}: ${built.triangles} triangles, ${built.openings} openings (${cut.length} rooms, ${gates.length} passages), darkest ${darkest.toFixed(3)}`);
  // 3. budgets
  assert.ok(built.triangles <= 14000, `desktop budget (${built.triangles})`);
  const phone = build(rock, i, true);
  assert.ok(phone.geometry && phone.triangles <= 6000, `phone budget (${phone.triangles})`);
  assert.equal(phone.masses.length, built.masses.length, 'a phone meets the same masses');
}
// the dovecotes: lime bands with their holes recessed (a hole's dark end stands behind the band's face)
{
  const built = build(castleA, 0);
  const p = built.geometry.attributes.position.array, c = built.geometry.attributes.color.array;
  let lime = 0;
  for (let v = 0; v < p.length / 3; v++) if (lum(c[v * 3], c[v * 3 + 1], c[v * 3 + 2]) > 0.55) lime++;
  assert.ok(lime >= 60, `the dovecotes' whitewashed bands (${lime} lime vertices)`);
  assert.ok(built.openings - built.rooms.length >= 18, `pigeon holes cut into them (${built.openings - built.rooms.length})`);
}
console.log(report.join('\n'));
console.log('castleRock selftest ok');
