// smokeWind.selftest.mjs — (FX lane, 2026-10-17; the owner's backlog: "smoke-screen sim on the map wind") a smoke screen
// drifts along its map's surface wind (world/sceneWind.ts: the one wind the trees, the grass and the clouds share) at a
// gentle share of its speed, so it leans and creeps the way every other smoke on the map goes while staying a screen.
// The authority stamps the drift on the screen at launch and it crosses the wire with it, so a client's screen and its
// sight block drift exactly as the authority's; a screen with no drift (a receipt's, an older record) keeps the legacy
// breeze to the bit.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AUXILIARY_INVENTORY } from '../vehicles/auxiliaryInventory.generated.ts';
import { requestAuxiliary } from './auxiliarySystems.ts';
import {
  smokeBlocks, smokeClip, smokeClipReach, smokeScreenWind, smokeVolume, smokeWindForMap, SMOKE_DRIFT_SHARE, SMOKE_DURATION_S,
  SMOKE_WIND_X, SMOKE_WIND_Z,
} from './smokeScreen.ts';
import { packSmokeScreen, restoreSmokeScreen } from './smokeReceipt.ts';
import { SCENE_WIND, sceneWindFor } from '../world/sceneWind.ts';

// ---- 1. the map's drift: its surface wind's direction at the share of its speed, rounded to the wire's 1e-4 -----------
for (const id of Object.keys(SCENE_WIND)) {
  const [x, z] = smokeWindForMap(id);
  const w = sceneWindFor(id);
  assert.ok(Math.abs(x - w.dirX * w.speed * SMOKE_DRIFT_SHARE) <= 5e-5 && Math.abs(z - w.dirZ * w.speed * SMOKE_DRIFT_SHARE) <= 5e-5, `${id}: its wind`);
  assert.equal(Math.round(x * 10000) / 10000, x, `${id}: rounded to the wire`);
  const bearing = Math.atan2(z, x) * 180 / Math.PI;
  const off = Math.abs(((bearing - SCENE_WIND[id].dirDeg) % 360 + 540) % 360 - 180);
  assert.ok(off < 0.05, `${id}: along the surface wind (${bearing.toFixed(1)}° vs ${SCENE_WIND[id].dirDeg}°)`);
  const speed = Math.hypot(x, z);
  assert.ok(speed > 0.25 && speed < 0.9, `${id}: a creep, not a gale (${speed.toFixed(2)} m/s, ${(speed * SMOKE_DURATION_S).toFixed(1)} m over its life)`);
}
assert.deepEqual(smokeWindForMap('nonesuch'), smokeWindForMap('verdant'), 'an unknown map takes Verdant\'s');
assert.deepEqual(smokeWindForMap('verdant'), smokeWindForMap('verdant'), 'a pure function of the map');

// ---- 2. a screen drifts on its own drift; one without keeps the legacy breeze to the bit -----------------------------
const flat = () => 0;
const id = Object.entries(AUXILIARY_INVENTORY).find(([, kit]) => kit.smoke.length >= 4)[0];
const kit = AUXILIARY_INVENTORY[id];
const launch = (wind) => {
  const actor = { id, team: 'player', spec: { id, dims: { heightM: (kit.turretPivot?.[1] ?? 1.8) + 0.4 } },
    state: { pos: { x: 0, y: 0, z: 0 }, yaw: 0, turretYaw: 0 }, combat: {} };
  assert.ok(requestAuxiliary(actor, 'smoke', 0, flat, null, wind), `${id}: launches`);
  return actor.combat.auxiliary.smoke;
};
const legacy = launch(undefined);
assert.equal(legacy.wind, undefined, 'no map wind: no drift stamped');
const steppe = smokeWindForMap('steppe');
const blown = launch(steppe);
assert.deepEqual(blown.wind, steppe, 'the authority stamps its map\'s drift on the screen');
assert.deepEqual(blown.canisters, legacy.canisters, 'the drift moves the cloud, never the salvo');
const v = { x: 0, y: 0, z: 0, radius: 0, height: 0, density: 0 };
const at = (screen, t, bank) => { smokeVolume(screen, t, bank, v); return { x: v.x, z: v.z }; };
const tLand = Math.max(...legacy.canisters.map((c) => c[6]));
for (const [screen, wx, wz, name] of [[legacy, SMOKE_WIND_X, SMOKE_WIND_Z, 'the legacy breeze'], [blown, steppe[0], steppe[1], 'Tarkhan Steppe\'s wind']]) {
  const a = at(screen, tLand + 2, 0), b = at(screen, tLand + 12, 0);
  assert.ok(Math.abs(b.x - a.x - wx * 10) < 1e-9 && Math.abs(b.z - a.z - wz * 10) < 1e-9, `${name}: the open bank drifts on it`);
}
assert.deepEqual(smokeScreenWind(legacy, { x: 0, z: 0 }), { x: SMOKE_WIND_X, z: SMOKE_WIND_Z }, 'the presentation reads the legacy breeze');
assert.deepEqual(smokeScreenWind(blown, { x: 0, z: 0 }), { x: steppe[0], z: steppe[1] }, 'and the screen\'s own');
assert.deepEqual(smokeScreenWind(null, { x: 0, z: 0 }), { x: SMOKE_WIND_X, z: SMOKE_WIND_Z });

// ---- 3. the walls are read as far as the drift carries the cloud ------------------------------------------------------
assert.equal(smokeClipReach(undefined), 14.2, 'the legacy reach');
const reach = smokeClipReach(steppe);
assert.ok(Math.abs(reach - (10.5 + Math.hypot(...steppe) * SMOKE_DURATION_S)) <= 0.05 && reach > 14.2, `Tarkhan Steppe's reach ${reach} m`);
assert.ok(smokeClipReach([0.01, 0]) === 14.2, 'never shorter than the legacy reach');
{
  // a wall 20 m east: out of the legacy reach, inside the steppe's
  const world = { raycast: (from, dir, max) => (dir.x > 0.9 ? (20 < max ? { dist: 20, kind: 'structure' } : null) : null) };
  assert.equal(smokeClip({ x: 0, y: 0, z: 0 }, world), 0, 'the legacy reach sees no wall at 20 m');
  const clip = smokeClip({ x: 0, y: 0, z: 0 }, world, reach);
  assert.ok(clip && clip[0] === 200, 'the steppe\'s reach reads it');
}

// ---- 4. the wire: the drift crosses with the screen; the client's screen blocks exactly as the authority's ------------
{
  const packed = JSON.parse(JSON.stringify(packSmokeScreen(blown)));
  assert.deepEqual(packed.wind, steppe, 'the drift crosses the wire');
  const client = restoreSmokeScreen(packed);
  assert.deepEqual(client.wind, steppe, 'and the client keeps it');
  let lines = 0, agree = 0;
  for (let t = tLand + 1; t < SMOKE_DURATION_S; t += 1.5) {
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2;
      const from = { x: Math.cos(a) * 40, y: 2, z: Math.sin(a) * 40 }, to = { x: -Math.cos(a) * 40 + 6, y: 2, z: -Math.sin(a) * 40 + 4 };
      lines++;
      if (smokeBlocks([blown], from, to, t, flat) === smokeBlocks([client], from, to, t, flat)) agree++;
    }
  }
  assert.equal(agree, lines, `the client's sight block is the authority's (${agree}/${lines} lines)`);
  const legacyPacked = JSON.parse(JSON.stringify(packSmokeScreen(legacy)));
  assert.equal(legacyPacked.wind, undefined, 'a screen with no drift sends none');
}

// ---- 5. the wiring: every authority launches on its map's wind; the presentation draws the screen's own ---------------
{
  const read = async (p) => readFile(new URL(p, import.meta.url), 'utf8');
  assert.match(await read('../game/state.ts'), /requestAuxiliary\(entity,'smoke',game\.timeS,groundFor\(world\)\.field\.getHeightAt,world,smokeWindForMap\(game\.mapId\)\)/, 'the solo battle');
  const match = await read('./authoritativeMatch.ts');
  assert.match(match, /const smokeWind = smokeWindForMap\(mapId\);/);
  assert.match(match, /requestAuxiliary\(entity, 'smoke', timeS, heightField\.getHeightAt, worldCollision, smokeWind\)/, 'the match authority');
  const studio = await read('../game/studio.ts');
  assert.equal((studio.match(/smokeWindForMap\(getWorld\(\)\?\.mapId\)/g) ?? []).length, 3, 'the Studio\'s salvos (battle, cinematic, its walls)');
  const pres = await read('../fx/auxiliaryPresentation.ts');
  assert.doesNotMatch(pres, /SMOKE_WIND_X|SMOKE_WIND_Z/, 'the screen presentation reads each screen\'s drift');
  assert.doesNotMatch(await read('../fx/effects.ts'), /SMOKE_WIND_X|SMOKE_WIND_Z/);
}
console.log(`smokeWind: ${Object.keys(SCENE_WIND).length} maps' drifts along their surface winds (x${SMOKE_DRIFT_SHARE}), stamped at launch, carried on the wire, blocking alike; the legacy breeze unchanged`);
