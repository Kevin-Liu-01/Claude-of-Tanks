import assert from 'node:assert/strict';
import { installDebugSurface } from './debugSurface.ts';
import { visitOwnedObject3DGeometries } from '../engine/resourceLifetime.ts';

let selected = 'm1a2';
let shotMode = false;
let networkState = 'connected';
let nightLighting = null;
const target = {};
const calls = [];
const action = (...args) => { calls.push(args); return args[0] ?? null; };
const surface = installDebugSurface({
  scene: { name: 'scene' }, camera: {}, renderer: {}, post: {}, lighting: {},
  game: { spotting: { active: true } }, rig: {}, bus: {}, input: {}, settings: {},
  pauseInfo: {}, garage: {}, quality: { resolvePresetName: action },
  getFx: () => ({ ready: true }),
  getNightLighting: () => nightLighting,
  getPedestalVisual: () => ({ specId: selected }),
  isPedestalOnStage: () => true,
  getSelectedSpecId: () => selected,
  getPedestalCacheIds: () => [selected],
  getWorldCacheIds: () => ['verdant'],
  getResidentLimits: () => ({ worldScenes: 2 }),
  getBattleVisualPoolStats: () => ({ size: 0 }),
  getGarageFramePacerStats: () => ({ sleeping: true }),
  getFrameLoopSchedulerStats: () => ({ scheduled: false }),
  getPhaseSceneResidency: () => ({ phase: 'garage' }),
  getGarageGpuResidency: () => ({ suspended: false }),
  getLastWorldRelease: () => null,
  isGraphicsContextLost: () => false,
  selectGarageTank: (id) => { selected = id; },
  stagePedestalTank: action,
  getWorld: () => ({ mapId: 'verdant' }),
  switchMap: action,
  flags: {}, frameInfo: {}, aimAtNearest: action, gunAimError: action,
  playerShellLog: [], botPressure: {}, aimState: action, fastForward: action,
  slayEnemies: action, startBattle: action,
  bakeMinimapForMap: async () => 'data:image/webp;base64,test',
  beginBattleEntry: action, beginSoloBattle: action, beginNetworkBattle: action,
  enterGarage: action, leaveBattleToGarage: action, killcam: {}, showroom: {},
  garageDressing: {}, spawnKillShell: action,
  getShotMode: () => shotMode,
  setShotMode: (value) => { shotMode = value; },
  forceHitMark: async () => {},
  getDamagePanel: () => ({ visible: true }),
  devTrace: null,
  getNetworkDiagnostics: () => ({ state: networkState }),
  getNetworkPresentationStats: () => ({ queued: 0 }),
  collectTelemetry: () => ({ fps: 120 }),
  sampleShadowContribution: async () => ({ changed: false }),
  injectNetworkEvents: () => true,
}, target);

assert.equal(target.__DEBUG, surface);
assert.equal(surface.nightLighting, null, 'diagnostics do not acquire lighting merely by installation');
nightLighting = { prepare: action, reset: action };
assert.equal(surface.nightLighting, nightLighting,
  'native probes get the actual lifecycle owner through the live diagnostic getter');
assert.equal(surface.visitOwnedGeometries, visitOwnedObject3DGeometries,
  'explicit diagnostics expose the maintained read-only owner without a boot/frame scan');
assert.equal(surface.selectedSpecId, 'm1a2');
surface.selectGarageTank('t90m');
assert.equal(surface.selectedSpecId, 't90m', 'selection getter remains live');
assert.deepEqual(surface.pedestalCacheIds, ['t90m']);
surface.shotMode = true;
assert.equal(surface.shotMode, true, 'shot-mode accessor preserves coercion owner');
assert.equal(surface.network.state, 'connected');
networkState = 'recovering';
assert.equal(surface.network.state, 'recovering', 'network diagnostics remain live');
assert.equal(surface.spotting.active, true);
assert.deepEqual(surface.telemetry(), { fps: 120 });

console.log('debugSurface.selftest: live lazy diagnostic surface passed');
