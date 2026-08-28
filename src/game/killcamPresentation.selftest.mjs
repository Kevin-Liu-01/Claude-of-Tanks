import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./killcam.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const state = readFileSync(new URL('./state.ts', import.meta.url), 'utf8');
const effects = readFileSync(new URL('../fx/effects.js', import.meta.url), 'utf8');
const responsive = readFileSync(new URL('../ui/responsiveSurfaces.css', import.meta.url), 'utf8');
const cameraRig = readFileSync(new URL('../engine/cameraRig.js', import.meta.url), 'utf8');

assert.match(source, /import \{ uiIconSVG \} from '\.\.\/ui\/uiIcons\.ts';/,
  'killcam presentation uses the shared SVG icon registry');

for (const icon of ['autoAim', 'battleRecord', 'shell', 'skull', 'ammoRack',
  'scope', 'turretRing', 'shield', 'damage', 'penetration']) {
  assert.ok(source.includes(`'${icon}'`), `killcam presentation includes the ${icon} icon`);
}

for (const moduleIcon of ['track', 'engine', 'transmission', 'fuelTank', 'ammoRack',
  'gun', 'radio', 'optics', 'turretRing']) {
  assert.ok(source.includes(`'${moduleIcon}'`), `module callouts map ${moduleIcon}`);
}

for (const crewIcon of ['crewCommander', 'crewGunner', 'crewDriver', 'crewLoader']) {
  assert.ok(source.includes(`'${crewIcon}'`), `crew callouts map ${crewIcon}`);
}

assert.match(source, /--kc-panel:/, 'killcam owns the tactical panel token set');
assert.match(source, /setReplaySuppressed\(true\)/,
  'intact/x-ray killcam phases suppress the prior live destruction presentation');
assert.match(source, /setReplaySuppressed\(false\)/,
  'impact and teardown restore live destruction presentation');
assert.match(source, /\.cot-kc-labelhost\{position:absolute;z-index:8;inset:0;overflow:hidden;/,
  'projected callouts remain clipped to the replay frame');
assert.match(source, /pass 2c: keep projected callouts out of the fixed analysis\/killer/,
  'projected labels reserve space for fixed replay cards');
assert.doesNotMatch(source, /@media \([^)]*(?:width|height|orientation)/,
  'killcam presentation must not retain independent device breakpoint logic');
assert.match(responsive, /body\[data-cot-width='phone'\]\[data-cot-orientation='portrait'\] \.cot-kc-killer/,
  'portrait killcam has a dedicated safe-area layout');
assert.match(responsive, /body\[data-cot-height='short'\] \.cot-kc-(?:annot|killer)/,
  'short landscape killcam has a dedicated compact layout');
assert.match(responsive,
  /body\[data-cot-width='phone'\]\[data-cot-orientation='portrait'\] \.cot-kc-killer\{[\s\S]*?bottom:auto;/,
  'portrait killer card clears the desktop bottom constraint instead of stretching vertically');
assert.match(responsive,
  /body\[data-cot-height='short'\] \.cot-kc-micro,[\s\S]*?\.cot-kc-label\.nm\{display:none!important\}/,
  'short landscape hides secondary micro and near-miss tags');
assert.match(responsive,
  /body\[data-cot-width='phone'\] \.cot-spec\{[\s\S]*?transform:translateY\(14px\)[\s\S]*?\.cot-spec\.in\{transform:translateY\(0\)\}/,
  'phone spectator bar cancels the desktop horizontal centering transform');
assert.match(source, /const panelEls = \[dom\.title, dom\.skip, dom\.annot,/,
  'projected callouts reserve the fixed title, skip control, and analysis cards');
assert.match(source, /w - it\.lw - 8/,
  'projected callouts clamp within the horizontal viewport');
assert.match(source, /const moduleLabels = new Map\(\)/,
  'multiple physical hits on one module collapse into one final-state callout');
assert.match(source, /final bounded label-only[\s\S]*const placed = \[\][\s\S]*const fits/,
  'label separation is repeated after geometry and fixed-panel repulsion');
assert.match(source, /const poseHistory = new Map\(\)/,
  'killcam retains the preceding simulation frame instead of reconstructing it after death');
assert.match(source, /replayKind: 'collision'[\s\S]*trajPts: null/,
  'collision deaths use an explicit replay type with no projectile trajectory');
assert.match(source, /if \(pb\.replayKind === 'collision'\)[\s\S]*beginCollision\(\);[\s\S]*return;[\s\S]*const raw = snap\.trajPts/,
  'collision playback exits before any tracer geometry can be allocated');
assert.match(source, /function beginFiring\(\)[\s\S]*restageAttacker\(\)[\s\S]*recoilKick\([\s\S]*muzzleFlash\(/,
  'projectile playback visibly fires the restored attacker from its rendered muzzle');
assert.match(source, /function updateCollision\(dt\)[\s\S]*applyReplaySurfaceState\(tvis, pb\.snap\.moduleStates[\s\S]*vehicleCollision/,
  'collision contact applies resolved module failures and dedicated impact effects');
assert.match(main, /createKillCam\([\s\S]*getGame: \(\) => game/,
  'production composition injects canonical game state into the killcam');
assert.match(source, /const gameRef = \(\) => \{[\s\S]*getGame \? getGame\(\) : null/,
  'spectator target selection uses the injected game-state getter');
assert.match(source, /function beginCameraHandoff[\s\S]*function setReplayCamera/,
  'killcam owns a continuous phase-to-phase camera handoff');
assert.match(source, /beginCameraHandoff\(\);[\s\S]*pb\.phase = 'flight';[\s\S]*setReplayCamera\(_a, _b, 50 - 8 \* k, dt\)/,
  'attacker firing blends continuously into the projectile chase');
assert.match(source, /function beginXray\(\) \{[\s\S]*beginCameraHandoff\(\)[\s\S]*setReplayCamera\(pb\.xcam\.pos, pb\.xcam\.look, 42, 0\)/,
  'collision, direct-analysis, and skipped paths blend into the x-ray camera');
assert.doesNotMatch(source, /body\.cot-kc-live \.cot-hud\{display:none/,
  'replay HUD suppression keeps layout geometry mounted');
assert.doesNotMatch(source, /\.cot-kc\.out \.cot-kc-bart,[\s\S]{0,120}height:51vh/,
  'exit no longer fakes a viewport resize with expanding letterbox bars');
assert.doesNotMatch(source, /Math\.exp\(-pb\.itWall \/ 0\.16\)/,
  'impact no longer jumps to a peak lens punch on its first frame');
assert.match(cameraRig, /nextFov = spec\.fromFov \+ \(55 - spec\.fromFov\) \* k/,
  'spectator entry blends its lens instead of snapping out of the killcam FOV');
assert.match(cameraRig, /function spectateBlendDuration\(ent\)[\s\S]*Math\.hypot\(dx, dy, dz\)/,
  'long-distance spectator target changes receive a distance-aware blend');
assert.match(state, /applyLethalRamModuleDamage[\s\S]*game\.killcam\.onRam\(ramEvent, a, b\)/,
  'authoritative ram resolution records module failures before live wreck presentation');
assert.match(effects, /vehicleCollision\(pos, normal, closingMps = 0\)[\s\S]*sparkFan[\s\S]*debris/,
  'vehicle collision effects use metal contact sparks and debris rather than shell penetration FX');

console.log('killcam presentation selftest passed');
