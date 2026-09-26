// Round 77 (2026-09-26): the tree climate — the wind every battlefield's trees sway in and the moss their shaded
// bark grows, resolved from the map's own weather and ground profile (treeClimate.ts). Pins the sources, the bands
// and the per-map table; the vertex law itself is pinned by vegetationProgramKey.selftest on the expanded GLSL.
import assert from 'node:assert/strict';
import { CLOUDSCAPE_REGIMES } from '../engine/cloudscapes.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { resolveGroundReduxProfile } from './groundRedux.ts';
import {
  resolveTreeWind, resolveTrunkMoss, TREE_WIND_DEFAULT_DIR, TREE_WIND_FLUTTER_M, TREE_WIND_LEAN_M,
  TREE_WIND_MOBILE_SCALE, TREE_WIND_NOMINAL_HEIGHT_M,
} from './treeClimate.ts';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const rows = [];
for (const id of MAP_IDS) {
  const cfg = getMapConfig(id), wind = resolveTreeWind(cfg), moss = resolveTrunkMoss(cfg);
  assert.ok(close(Math.hypot(wind.dirX, wind.dirZ), 1, 1e-6), `${id}: unit direction`);
  assert.ok(wind.strength >= 0.55 && wind.strength <= 1.6, `${id}: strength inside the 0.55–1.6 band`);
  assert.ok(moss >= 0 && moss <= 1, `${id}: moss 0..1`);
  const clouds = cfg.clouds ?? null;
  if (clouds && Number.isFinite(clouds.windDirDeg)) {
    const rad = clouds.windDirDeg * Math.PI / 180;
    assert.equal(wind.source, 'clouds', `${id}: an authored cloud wind sets the direction`);
    assert.ok(close(wind.dirX, Math.cos(rad), 1e-9) && close(wind.dirZ, Math.sin(rad), 1e-9), `${id}: degrees from +X toward +Z`);
  } else {
    const grass = resolveGroundReduxProfile(id).grass;
    if (grass) {
      const l = Math.hypot(grass.windDir[0], grass.windDir[1]);
      assert.equal(wind.source, 'ground', `${id}: the sward's prevailing wind`);
      assert.ok(close(wind.dirX, grass.windDir[0] / l, 1e-9) && close(wind.dirZ, grass.windDir[1] / l, 1e-9));
    } else {
      assert.equal(wind.source, 'default');
      const l = Math.hypot(...TREE_WIND_DEFAULT_DIR);
      assert.ok(close(wind.dirX, TREE_WIND_DEFAULT_DIR[0] / l, 1e-9) && close(wind.dirZ, TREE_WIND_DEFAULT_DIR[1] / l, 1e-9));
    }
  }
  const speed = clouds && Number.isFinite(clouds.windSpeed) ? clouds.windSpeed
    : clouds?.regime && CLOUDSCAPE_REGIMES[clouds.regime] ? CLOUDSCAPE_REGIMES[clouds.regime].windSpeed : null;
  const expected = speed === null ? 1 : Math.min(1.6, Math.max(0.55, speed / 7));
  assert.ok(close(wind.strength, expected, 1e-9), `${id}: the regime's wind speed against 7 m/s (${speed})`);
  rows.push({ id, source: wind.source, dir: [+wind.dirX.toFixed(3), +wind.dirZ.toFixed(3)], strength: +wind.strength.toFixed(3), moss: +moss.toFixed(3) });
}
const byId = Object.fromEntries(rows.map(r => [r.id, r]));
assert.equal(byId.coastal.source, 'clouds'); // sea streets from 190°
assert.equal(byId.verdant.source, 'ground'); // the meadow's [0.8, 0.6]
assert.ok(byId.monsoon.strength > 1.5, 'the cumulonimbus front leans the stands');
assert.ok(byId.verdant.strength < 0.9, 'fair-weather cumulus at 6 m/s stirs them less than the temperate 7');
assert.ok(byId.monsoon.moss > 0.95 && byId.delta.moss > 0.95 && byId.mangrove.moss > 0.95, 'the wet maps grow a full collar');
assert.ok(byId.verdant.moss > 0.05 && byId.verdant.moss < 0.35, 'the temperate maps a lichen dusting');
assert.equal(byId.desert.moss, 0, 'the arid maps none');
assert.equal(byId.mars.moss, 0);
assert.ok(rows.filter(r => r.source === 'clouds').length >= 5 && rows.filter(r => r.source === 'ground').length >= 5, 'both direction sources are exercised by the catalog');
// a config with no id and no clouds: the temperate default, strength 1, no moss profile beyond the default
const bare = resolveTreeWind({ vegetation: {} });
assert.equal(bare.source, 'default'); assert.equal(bare.strength, 1);
assert.equal(resolveTreeWind(null).source, 'default'); assert.equal(resolveTreeWind(undefined).strength, 1);
assert.ok(close(resolveTreeWind({ clouds: { windDirDeg: 90 } }).dirZ, 1, 1e-12), 'a 90° wind blows toward +Z');
assert.ok(close(resolveTreeWind({ clouds: { windSpeed: 40 } }).strength, 1.6), 'the band caps a gale');
assert.ok(close(resolveTreeWind({ clouds: { windSpeed: 0 } }).strength, 0.55), 'and floors a calm');
assert.ok(close(resolveTreeWind({ clouds: { regime: 'no-such-regime' } }).strength, 1), 'an unknown regime reads as temperate');
assert.ok(resolveTrunkMoss({ id: 'no-such-map' }) >= 0);
// the amplitudes the uniforms carry
assert.ok(TREE_WIND_LEAN_M > 0.1 && TREE_WIND_LEAN_M <= 0.5, 'a crown top leans decimetres, not metres');
assert.ok(TREE_WIND_FLUTTER_M > 0.03 && TREE_WIND_FLUTTER_M <= 0.2);
assert.equal(TREE_WIND_NOMINAL_HEIGHT_M, 8);
assert.ok(TREE_WIND_MOBILE_SCALE.lean < 0.5 && TREE_WIND_MOBILE_SCALE.flutter <= 0.5, 'the phones keep a fraction of the sway');
console.log(JSON.stringify({ maps: rows.length, rows }));
console.log('treeClimate.selftest: 31 maps resolved (cloud wind, ground wind, default), the strength band, the moss by climate PASS');
