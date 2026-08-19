import assert from 'node:assert/strict';
import {
  AUTOLOADER_HUD_ARC_RAD,
  AUTOLOADER_HUD_ARC_Y,
  AUTOLOADER_HUD_SHELLS,
  autoloaderHudState,
} from './hud.js';

assert.equal(AUTOLOADER_HUD_SHELLS, 3, 'autoloaders use three center-shell silhouettes');
assert.ok(
  AUTOLOADER_HUD_ARC_Y[1] > AUTOLOADER_HUD_ARC_Y[0]
    && AUTOLOADER_HUD_ARC_Y[1] > AUTOLOADER_HUD_ARC_Y[2],
  'the center shell drops below the outer pair to form a shallow lower arc',
);
assert.ok(
  AUTOLOADER_HUD_ARC_RAD[0] > 0
    && AUTOLOADER_HUD_ARC_RAD[2] === -AUTOLOADER_HUD_ARC_RAD[0],
  'outer shells tilt symmetrically inward toward the reticle',
);
assert.equal(autoloaderHudState(null, null), null, 'conventional guns have no indicator');

const ready = autoloaderHudState(
  { rounds: 3, capacity: 3 },
  { kind: 'ready', t: 0, totalS: 18 },
);
assert.deepEqual(
  {
    ready: ready.readyShells,
    overflow: ready.overflow,
    fullReload: ready.fullReload,
    reloading: ready.reloading,
  },
  { ready: 3, overflow: 0, fullReload: false, reloading: false },
  'three-round magazine lights all three shells',
);

const cycling = autoloaderHudState(
  { rounds: 2, capacity: 3 },
  { kind: 'intraClip', t: 1.2, totalS: 2.4 },
);
assert.equal(cycling.readyShells, 2, 'intra-clip state preserves the remaining rounds');
assert.equal(cycling.intraClip, true, 'intra-clip state receives the reload keyline');
assert.equal(cycling.reloading, true, 'intra-clip cycling uses the gray reload state');

const loading = autoloaderHudState(
  { rounds: 0, capacity: 3 },
  { kind: 'magazine', t: 13.5, totalS: 18 },
);
assert.equal(loading.readyShells, 0, 'full reload exposes no ready shells');
assert.equal(loading.fullReload, true, 'full reload uses the progressive shell fill');
assert.equal(loading.loadProgress, 0.25, 'full reload progress is normalized');
assert.equal(loading.reloading, true, 'full reload uses the gray reload state');

const fourRound = autoloaderHudState(
  { rounds: 4, capacity: 4 },
  { kind: 'ready', t: 0, totalS: 18 },
);
assert.equal(fourRound.readyShells, 3, 'the visual window stays at three shells');
assert.equal(fourRound.overflow, 1, 'larger magazines retain an exact overflow read');

console.log('hudMagazine.selftest: three-shell autoloader indicator passed');
