// roadPave.selftest.mjs — (FX lane, 2026-10-15; the engine lane's s92 note: "orange glow puffs either side of the lead
// tank", a Leopard column on Steinburg's Hauptstrasse) a sett, concrete or stone street throws a low grit haze at a
// track, never the earth wake's climbing tan billows; an unpaved road and open ground keep their continuous trails (the
// owner's ruling, 2026-10-12). The paved share is the terrain's own (pavedRoads, roadTexMix, the paved town rect, a
// bridge deck), published by the height field and forwarded by the live proxy the FX reads.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ROAD_HARD_M, roadPaveSampler, streetGritShare } from './roadPave.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { createLiveHeightFieldProxy } from './liveHeightFieldProxy.ts';

// ---- 1. the sampler: the carriageway's paved share, off the road nothing ----------------------------------------------
{
  const town = { x0: -10, x1: 10, z0: -10, z1: 10 };
  const dirt = roadPaveSampler({ roadTexMix: 0.12 }, town);
  assert.equal(dirt(1, 50, 50, false), 0.12, 'a worn road keeps its texture mix');
  assert.equal(dirt(ROAD_HARD_M + 0.1, 50, 50, false), 0, 'off the carriageway: no paving');
  assert.equal(dirt(1, 0, 0, false), 0.12, 'no town paving without townPaving');
  assert.equal(dirt(30, 50, 50, true), 1, "a bridge deck's stone is paved");
  assert.equal(roadPaveSampler({ pavedRoads: true, roadTexMix: 0.12 }, null)(2, 0, 0, false), 1, 'paved roads');
  const paved = roadPaveSampler({ townPaving: true }, town);
  assert.equal(paved(2, 0, 0, false), 1, 'inside the paved town rect');
  assert.equal(paved(2, 40, 0, false), 0, "past the town rect a country road stays earth");
  assert.equal(roadPaveSampler(null, null)(0, 0, 0, false), 0, 'no splat config: no paving');
  assert.equal(dirt(Number.NaN, 0, 0, false), 0, 'an unknown road distance is off the road');
}
// (built-env-270) the catalogue's paving: its streets whole or in the town, and each road line by its own surface
{
  const town = { x0: -10, x1: 10, z0: -10, z1: 10 };
  const roads = [[[-100, 0], [100, 0]], [[0, -100], [0, -20], [60, -20]]];
  const lines = roadPaveSampler({ roadTexMix: 0.12 }, town, { streets: null, lines: [false, true], roads });
  assert.equal(lines(1, 50, 1, false), 0.12, 'an earth line keeps the map\'s mix');
  assert.equal(lines(1, 30, -21, false), 1, 'a line whose surface is paved is paved');
  assert.equal(lines(1, 0.5, -60, false), 1, 'along its first leg too');
  assert.equal(lines(ROAD_HARD_M + 0.2, 30, -24.5, false), 0, 'off its carriageway: no paving');
  assert.equal(roadPaveSampler({ roadTexMix: 0.12 }, town, { streets: 'all', lines: null, roads })(1, 50, 1, false), 1, 'streets paved whole');
  const townOnly = roadPaveSampler({ roadTexMix: 0.12 }, town, { streets: 'town', lines: null, roads });
  assert.equal(townOnly(1, 2, 1, false), 1, "the works town's setts");
  assert.equal(townOnly(1, 50, 1, false), 0.12, 'past the town the country road');
}

// ---- 2. grit or wake: none on a dirt road, all on a street --------------------------------------------------------------
{
  assert.equal(streetGritShare(0), 0);
  assert.equal(streetGritShare(0.12), 0, 'a worn-road texture mix keeps the whole wake');
  assert.equal(streetGritShare(0.35), 0);
  assert.equal(streetGritShare(0.85), 1, "Steinburg's setts: all grit");
  assert.equal(streetGritShare(1), 1);
  let prev = 0;
  for (let p = 0; p <= 1.0001; p += 0.05) { const g = streetGritShare(p); assert.ok(g >= prev - 1e-12 && g <= 1); prev = g; }
}

// ---- 3. the maps: which carriageways change (every other map keeps its dust exactly) ----------------------------------
{
  const changed = [];
  for (const id of MAP_IDS) {
    const cfg = getMapConfig(id);
    const s = cfg?.splat ?? null;
    const base = roadPaveSampler(s, cfg?.layout?.village ?? null)(1, 1e6, 1e6, false);
    if (streetGritShare(base) > 0 || s?.townPaving) changed.push(id);
  }
  assert.ok(changed.includes('urban'), `Steinburg's streets throw grit (${changed.join(', ')})`);
  for (const id of ['verdant', 'steppe', 'desert', 'frontier']) {
    if (MAP_IDS.includes(id)) assert.ok(!changed.includes(id), `${id}'s roads keep their continuous trails`);
  }
  assert.ok(changed.length <= 8, `only the paved maps change (${changed.join(', ')})`);
  console.log(`  paved carriageways: ${changed.join(', ')}`);
}

// ---- 4. the wiring: the height field publishes it, the live proxy forwards it, dust() consults it -----------------------
{
  const terrain = await readFile(new URL('./terrain.ts', import.meta.url), 'utf8');
  assert.match(terrain, /const roadPaveAt = roadPaveSampler\(cfg\?\.splat, layout\.village, \{/);
  assert.match(terrain, /lines: layout\.roadStyles\?\.map\(\(style\) => !!style\?\.surface && style\.surface !== 'dirt'\) \?\? null,/,
    "(built-env-270) each road line's own paved surface");
  assert.match(terrain, /getRoadPaveAt: \(x: number, z: number\): number => roadPaveAt\(gridSample\(gRoadDist, x, z\), x, z, bridgeDecks\.length > 0 && bridgeDeckOver\(x, z\) !== null\),/);
  assert.match(terrain, /if \(gridSample\(gRoadDist, x, z\) < 4\.3\) return 'hard';/, `getGroundType's carriageway is ROAD_HARD_M (${ROAD_HARD_M})`);
  let world = { heightField: { size: 1, minY: 0, maxY: 1, getHeightAt: () => 0, getNormalAt: () => null, getGroundType: () => 'hard',
    getWaterMaskAt: () => 0, getRoadPaveAt: () => 0.85 } };
  const proxy = createLiveHeightFieldProxy({ getWorld: () => world, useExactHeight: () => false, upNormal: null });
  assert.equal(proxy.getRoadPaveAt(0, 0), 0.85, 'the live proxy forwards the paved share');
  world = { heightField: { ...world.heightField, getRoadPaveAt: undefined } };
  assert.equal(proxy.getRoadPaveAt(0, 0), 0, 'an older or mock field reads unpaved');

  const fx = await readFile(new URL('../fx/effects.ts', import.meta.url), 'utf8');
  const dust = fx.slice(fx.indexOf('    dust(pos: THREE.Vector3, dir: THREE.Vector3, intensity: number): void {'));
  const at = (s) => dust.indexOf(s);
  assert.ok(at("const pave = groundType === 'hard' ? heightField?.getRoadPaveAt?.(pos.x, pos.z) ?? 0 : 0;") > 0, 'dust() reads the paved share on hard ground only');
  assert.ok(at('if (pave > 0 && rng() < streetGritShare(pave)) {') > at('const pave'), 'an unpaved road draws no extra random number');
  assert.ok(at('emitStreetGrit(pos, dir, intensity, gy);') < at('emitTrackKick(pos, dir, intensity, groundType, gy);'), 'the grit replaces the kick and the wake');
  // the grit itself: low, small, short, faint, settling
  const grit = fx.slice(fx.indexOf('  function emitStreetGrit('), fx.indexOf('  /** One low contact puff replaces the large earth wake'));
  const num = (re) => { const m = grit.match(re); assert.ok(m, String(re)); return m.slice(1).map(Number); };
  const [y0, yj] = num(/_puffO\.pos\[1\] = gy \+ ([\d.]+) \+ rng\(\) \* ([\d.]+);/);
  assert.ok(y0 + yj <= 0.3, 'born at the contact');
  const [l0, lj] = num(/_puffO\.life = ([\d.]+) \+ rng\(\) \* ([\d.]+);/);
  assert.ok(l0 + lj < 1, 'gone within a second (the earth wake lives 3-5.6 s)');
  const [s1, s1i, s1j] = num(/_puffO\.size1 = \(([\d.]+) \+ intensity \* ([\d.]+) \+ rng\(\) \* ([\d.]+)\)/);
  assert.ok(s1 + s1i + s1j <= 1.6, 'under a metre and a half across (the earth wake grows to 5.2 m)');
  const [a0, ai] = num(/_puffO\.alpha = \(([\d.]+) \+ intensity \* ([\d.]+)\)/);
  assert.ok(a0 + ai <= 0.17, 'a faint haze');
  const [g] = num(/_puffO\.grav = (-[\d.]+);/);
  assert.ok(g < -1, 'it settles (gravity is +up)');
  assert.match(grit, /particles\.emit\('dust', _puffO\);/);
}
console.log('roadPave: paved carriageways throw low settling grit (s92), unpaved roads keep the earth wake, the paved share forwarded from the height field');
