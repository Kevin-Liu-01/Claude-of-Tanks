import assert from 'node:assert/strict';
import {
  AUTOLOADER_HUD_SHELLS,
  autoloaderHudShellPose,
  autoloaderHudState,
} from './hud.js';

assert.equal(AUTOLOADER_HUD_SHELLS, 4, 'the compact rack can draw four shell silhouettes');
const threeShellPoses = Array.from({ length: 3 }, (_, index) => autoloaderHudShellPose(index, 3));
assert.ok(
  threeShellPoses[1].y > threeShellPoses[0].y
    && threeShellPoses[1].y > threeShellPoses[2].y,
  'the center shell drops below the outer pair to form a shallow lower arc',
);
assert.ok(
  threeShellPoses[0].rotation > 0
    && threeShellPoses[2].rotation === -threeShellPoses[0].rotation,
  'outer shells tilt symmetrically inward toward the reticle',
);
assert.equal(autoloaderHudState(null, null), null, 'conventional guns have no indicator');

const ready = autoloaderHudState(
  { rounds: 3, capacity: 3 },
  { kind: 'ready', t: 0, totalS: 18 },
);
assert.deepEqual(
  {
    visible: ready.visibleShells,
    ready: ready.readyShells,
    overflow: ready.overflow,
    fullReload: ready.fullReload,
    reloading: ready.reloading,
  },
  { visible: 3, ready: 3, overflow: 0, fullReload: false, reloading: false },
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
assert.equal(fourRound.visibleShells, 4, 'a four-round magazine draws four shell silhouettes');
assert.equal(fourRound.readyShells, 4, 'all four ready rounds light their own silhouettes');
assert.equal(fourRound.overflow, 0, 'a four-round magazine no longer renders a +1 label');

const fiveRound = autoloaderHudState(
  { rounds: 5, capacity: 5 },
  { kind: 'ready', t: 0, totalS: 18 },
);
assert.equal(fiveRound.visibleShells, 4, 'the compact rack remains capped at four silhouettes');
assert.equal(fiveRound.overflow, 1, 'magazines above four retain an exact overflow read');

console.log('hudMagazine.selftest: capacity-aware four-shell autoloader indicator passed');
