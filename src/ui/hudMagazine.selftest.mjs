import assert from 'node:assert/strict';
import {
  AUTOLOADER_HUD_SHELLS,
  HIT_CONFIRM_LIFETIME_S,
  autoloaderHudShellPose,
  autoloaderHudState,
  aimWarningState,
  directionalHitAmount,
  directionalHitValueVisible,
  hitConfirmVisualState,
  reloadHudFraction,
  resolveReticleAnchor,
} from './hud.ts';

assert.equal(
  directionalHitAmount({ damage: 417, dmgRoll: 522 }),
  417,
  'red incoming arcs show exact applied damage',
);
assert.equal(
  directionalHitAmount({ damage: 0, dmgRoll: 522 }, true),
  522,
  'steel incoming arcs show authoritative blocked damage',
);
assert.equal(
  directionalHitAmount({ damage: 417.6, dmgRoll: 522.4 }),
  418,
  'fractional simulation damage is rounded for the compact readout',
);
assert.equal(
  directionalHitAmount({ damage: Number.NaN, dmgRoll: -1 }, true),
  0,
  'invalid or negative values never leak into the HUD',
);
assert.equal(
  directionalHitValueVisible(false, 522, 'bounce'),
  false,
  'blocked pre-mitigation values remain an optional detail beside the outcome word',
);
assert.equal(
  directionalHitValueVisible(false, 417, 'pen'),
  true,
  'applied damage numbers are always part of the incoming-hit read',
);
assert.equal(
  directionalHitValueVisible(true, 0, 'bounce'),
  false,
  'zero-value indicators never reserve a label',
);
assert.equal(
  directionalHitValueVisible(false, 180, 'he'),
  true,
  'amber splash damage numbers are always part of the incoming-hit read',
);
assert.equal(
  directionalHitValueVisible(true, 522, 'bounce'),
  true,
  'the Interface option appends the authoritative value to a blocked outcome',
);

assert.deepEqual(
  aimWarningState({ blockedDistM: 18.4, blockedLabel: false }),
  { visible: false, kind: 'blocked', text: 'MUZZLE BLOCKED · 18 M' },
  'a new bore obstruction tints the sight without flashing unstable copy',
);
assert.deepEqual(
  aimWarningState({ blockedDistM: 18.4, blockedLabel: true }),
  { visible: true, kind: 'blocked', text: 'MUZZLE BLOCKED · 18 M' },
  'a continuous bore obstruction gains exact distance copy after its dwell',
);
assert.deepEqual(
  aimWarningState({ blockedDistM: null, gunLimitSpec: true }),
  { visible: true, kind: 'limit', text: 'GUN TRAVEL LIMIT' },
  'physical articulation limits remain distinct from blocked muzzle paths',
);

assert.deepEqual(
  resolveReticleAnchor({ cx: 640, cy: 360, gunX: 612, gunY: 348, singleReticle: true }),
  { x: 612, y: 348, single: true },
  'hydraulic fixed guns collapse the camera and physical-gun marks onto one gun-true reticle',
);
assert.deepEqual(
  resolveReticleAnchor({ cx: 640, cy: 360, gunX: 612, gunY: 348, singleReticle: false }),
  { x: 640, y: 360, single: false },
  'conventional tanks retain their independent camera and physical-gun markers',
);
assert.deepEqual(
  resolveReticleAnchor({ cx: 640, cy: 360, singleReticle: true }),
  { x: 640, y: 360, single: false },
  'the sight safely falls back to the camera anchor until a gun projection exists',
);

assert.equal(reloadHudFraction(null), 0, 'missing reload state has no dot sweep');
assert.equal(
  reloadHudFraction({ t: 6, totalS: 8 }),
  0.75,
  'reticle dots expose the exact remaining reload fraction',
);
assert.equal(
  reloadHudFraction({ t: -1, totalS: 8 }),
  0,
  'completed reload clears the dot sweep',
);

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

const hitEntry = hitConfirmVisualState(0);
const hitSettled = hitConfirmVisualState(0.14);
const hitFading = hitConfirmVisualState(1.1);
assert.equal(hitConfirmVisualState(-0.01).visible, false, 'hit confirmation is hidden before impact');
assert.equal(
  hitConfirmVisualState(HIT_CONFIRM_LIFETIME_S + 0.01).visible,
  false,
  'hit confirmation expires after its readable lifetime',
);
assert.ok(
  hitEntry.radius > hitSettled.radius,
  'hit-confirm shards snap inward toward the reticle during entry',
);
assert.ok(
  hitEntry.length < hitSettled.length,
  'hit-confirm shards resolve from compact tips into full tapered marks',
);
assert.ok(
  hitFading.opacity < hitSettled.opacity,
  'hit confirmation fades after its full-strength hold',
);
const reducedEntry = hitConfirmVisualState(0, true);
const reducedSettled = hitConfirmVisualState(0.14, true);
assert.equal(
  reducedEntry.radius,
  reducedSettled.radius,
  'reduced-motion hit confirmation never travels across the sight',
);
assert.equal(reducedEntry.flash, 0, 'reduced-motion hit confirmation suppresses the center spark');

console.log('hudMagazine.selftest: magazine, hit-confirm, and directional-value HUD states passed');
