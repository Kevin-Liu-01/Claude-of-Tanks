// photo-mode-271: a solo battle's photo mode.
// - Opening it freezes the battle: the fixed step, the countdown and FX time stand still (the real battle frame owner
//   and main frame runtime, composed as main.ts composes them), and its camera owns the frame instead of the rig.
// - It is unavailable in a room (and in every other state the availability table keeps it out of).
// - One photo mode: the Garage and the battle open the same module, which alone draws the bar and takes the still;
//   both load lazily, off the boot graph, and neither touches the network code.
// - Its sheet steps the whole interface away (the HUD, its touch controls), leaving the stage and the bar.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PerspectiveCamera, Scene } from 'three';

import { battlePhotoAvailable } from './battlePhotoAvailability.ts';
import { createBattleFrameRuntime } from './battleFrameRuntime.ts';
import { createMainFrameRuntime } from '../app/mainFrameRuntime.ts';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

// 1. availability: a solo battle with a tank to frame, and nothing else
{
  const solo = { phase: 'battle', online: false, couch: false, hasResult: false, killcam: false, covered: false,
    studio: false, shotMode: false, hasSubject: true };
  assert.equal(battlePhotoAvailable(solo), true, 'a solo battle offers photo mode');
  assert.equal(battlePhotoAvailable({ ...solo, online: true }), false, 'a room never offers photo mode');
  for (const [key, value] of [['phase', 'garage'], ['phase', 'studio'], ['couch', true], ['hasResult', true],
    ['killcam', true], ['covered', true], ['studio', true], ['shotMode', true], ['hasSubject', false]]) {
    assert.equal(battlePhotoAvailable({ ...solo, [key]: value }), false, `${key}=${value} keeps photo mode out`);
  }
}

// 2. pause: the battle frame owner and the main frame runtime, wired as main.ts wires them
{
  let photoOpen = false;
  let menuOpen = false;
  let steps = 0;
  const pauseEdges = [];
  const fxFrames = [];
  const cameraFrames = [];
  const presentationFrames = [];
  const game = { phase: 'battle', preBattleS: 0, result: null, player: { input: {}, combat: {} }, shells: [],
    matchModeState: null, timeS: 0 };
  const battleFrame = createBattleFrameRuntime({
    game,
    settings: { isOpen: () => menuOpen || photoOpen },
    killcam: { isActive: () => false },
    input: { camera: {}, poll: () => {}, dispose: () => {} },
    network: { isActive: () => false, pump: () => {} },
    countdown: { isWarmPending: () => false, advance: (seconds, wallDt) => Math.max(0, seconds - wallDt), show: () => {},
      rollout: () => {} },
    presentation: { captureSoloPose: () => {}, update: (dt) => presentationFrames.push(dt), updateResult: () => {} },
    getRigMode: () => 'ARCADE',
    stepSimulation: () => { steps += 1; game.timeS += 1 / 60; },
    emitPause: (paused) => pauseEdges.push(paused),
  });
  const camera = new PerspectiveCamera(60, 1, 0.1, 1000);
  const main = createMainFrameRuntime({
    scene: new Scene(), camera, game,
    scheduleFrame: () => {}, isGraphicsContextLost: () => false, syncViewportPixelRatio: () => false,
    battleEntryLifecycle: { renderingCovered: false, noteBattleFrame: () => {} },
    getFx: () => ({ update: (dt) => fxFrames.push(dt) }),
    getWorld: () => ({ update: () => {} }), getBaseFogDensity: () => 0,
    getStudio: () => ({ active: false, tick: () => {} }), getShotMode: () => false, getShotHudFrame: () => false,
    sniperFill: { update: () => {} }, resolveFxSubject: () => null,
    battleHudFrame: { redrawFrozen: () => {}, update: () => {} },
    lighting: { updateFov: () => {}, setStaticPresentationDormant: () => {}, setVehicleShadowMerge: () => {}, update: () => {} },
    post: { render: () => {} },
    showroom: { moving: false, update: () => {} }, pedestal: { switchPending: false },
    networkSession: { pump: () => {} },
    garageFramePacer: { noteActivity: () => {}, shouldRender: () => true },
    battleFrame,
    isBattleLoadCovering: () => false, isPresentationRestoreCovering: () => false,
    isTransitionHoldingSceneForFadeIn: () => false,
    cameraInput: { autoAimPoint: null }, getMobileAutoAim: () => null,
    rig: { cinematicActive: false, mode: 'ARCADE', update: () => cameraFrames.push('rig'),
      suspendFraming: () => cameraFrames.push('suspend'), previewFraming: () => cameraFrames.push('preview') },
    photoFrame: () => { if (!photoOpen) return false; cameraFrames.push('photo'); return true; },
    killcam: { fxTimeScale: 1, isActive: () => false, update: () => {} },
    veilHud: () => {},
    worldFramePresentation: { update: () => {} }, matchModeWorld: { update: () => {} }, audioListener: { update: () => {} },
    isGaragePresentationDirty: () => false, clearGaragePresentationDirty: () => {},
    perfHud: { update: () => {} },
  });
  let now = 1000;
  const run = (frames) => { for (let i = 0; i < frames; i += 1) { now += 1000 / 60; main.tick(now); } };
  run(30);
  assert.ok(steps >= 28, `a live battle steps (${steps})`);
  assert.ok(fxFrames.at(-1) > 0, 'a live battle runs FX time');
  assert.equal(cameraFrames.at(-1), 'rig', 'a live battle frames with the rig');

  photoOpen = true;
  const heldSteps = steps, heldTime = game.timeS, heldPresentations = presentationFrames.length;
  fxFrames.length = 0; cameraFrames.length = 0;
  run(120);
  assert.equal(steps, heldSteps, 'photo mode freezes the fixed step');
  assert.equal(game.timeS, heldTime, 'photo mode freezes battle time');
  assert.equal(presentationFrames.length, heldPresentations, 'no interpolated presentation moves under photo mode');
  assert.ok(fxFrames.length === 120 && fxFrames.every((dt) => dt === 0), 'photo mode freezes FX time');
  assert.equal(pauseEdges.at(-1), true, 'photo mode is a pause edge (the audio and the HUD hear ui:pause)');
  assert.ok(!cameraFrames.includes('rig') && !cameraFrames.includes('preview'), 'the rig stays out of a photo frame');
  assert.equal(cameraFrames.filter((frame) => frame === 'photo').length, 120, 'the photo camera solves every frame');

  // the countdown stands still too
  photoOpen = false; run(2);
  game.preBattleS = 3;
  photoOpen = true; run(60);
  assert.equal(game.preBattleS, 3, 'photo mode holds the countdown');

  photoOpen = false;
  game.preBattleS = 0;
  fxFrames.length = 0; cameraFrames.length = 0;
  run(30);
  assert.ok(steps > heldSteps, 'closing photo mode resumes the battle');
  assert.ok(fxFrames.at(-1) > 0, 'closing photo mode resumes FX time');
  assert.equal(pauseEdges.at(-1), false);
  assert.equal(cameraFrames.at(-1), 'rig', 'the rig takes the camera back');
}

// 3. main.ts: the pause port and the camera port are photo mode's, it is offered only when available, and the room
//    path never sees it
{
  const main = await read('src/main.ts');
  assert.match(main, /settings: \{ isOpen: \(\) => settings\.isOpen\(\) \|\| tutorialHolds\(\) \|\| battlePhotoOpen \}/, 'the battle frame pauses for photo mode');
  assert.match(main, /photoFrame: \(dt\) => battlePhoto\.current\?\.frame\(dt\) \?\? false/, 'the frame hands photo mode the camera');
  assert.match(main, /online: onlineMatchActive\(\)/, 'availability reads the room state');
  // (settings-unify-278) a watched replay is a solo page's battle: photo mode is its fourth camera, and it holds the
  // viewer's own keys while it is open (docs/REPLAY.md §5)
  assert.doesNotMatch(main, /replay: replayViewerOwner/, 'a watched replay may open photo mode');
  assert.match(main, /isInputHeld: \(\) => settings\.isOpen\(\) \|\| battlePhotoOpen,/, 'photo mode holds the replay viewer\'s keys');
  assert.match(main, /function openBattlePhoto\(\): void \{\n  if \(battlePhotoOpen \|\| !canOpenBattlePhoto\(\)\) return;/,
    'every way in passes the availability check');
  assert.match(main, /battlePhotoOpen = true;\n  battlePhotoFromMenu = settings\.isOpen\(\);\n  if \(battlePhotoFromMenu\) settings\.close\(\{ noRelock: true \}\);/,
    'the battle pauses at the press, before the chunk loads (no running frames between the menu and photo mode)');
  assert.match(main, /input\.onAction\('photoMode', openBattlePhoto\)/, 'the photo key opens it');
  assert.match(main, /const back = battlePhotoFromMenu && canOpenBattlePhoto\(\);\n      battlePhotoFromMenu = false;\n      if \(back\) settings\.open\(\);/,
    'Exit returns to the paused Settings photo mode was opened from (settings-unify-278)');
  assert.match(main, /photo: \{ available: \(\) => canOpenBattlePhoto\(\), open: \(\) => openBattlePhoto\(\) \}/,
    'the pause menu (the phone\'s way in) offers it under the same check');
  assert.doesNotMatch(main, /^import[^\n]*(photoMode|battlePhotoMode)\.ts/m, 'main.ts loads photo mode lazily');
  assert.match(main, /import\('\.\/game\/battlePhotoMode\.ts'\)/);
  for (const path of ['src/game/battlePhotoMode.ts', 'src/ui/photoMode.ts', 'src/engine/photoCamera.ts']) {
    const source = await read(path);
    assert.doesNotMatch(source, /from '[^']*\/(mp|server|net)\//, `${path} imports no network code`);
    assert.doesNotMatch(source, /^import [^\n]*'\.\/[^']*\.css'/m, `${path} imports no sheet statically`);
  }
}

// 4. one photo mode: the Garage and the battle open the same module, which alone draws the bar and takes the still
{
  const shared = await read('src/ui/photoMode.ts');
  const garage = await read('src/ui/garage.ts');
  const battle = await read('src/game/battlePhotoMode.ts');
  assert.match(shared, /export function openPhotoMode\(/);
  assert.match(shared, /export function captureStill\(/);
  // (settings-unify-278) one load of the module and its sheet for the document, both hosts' (ui/photoModeChunk.ts)
  const chunk = await read('src/ui/photoModeChunk.ts');
  assert.match(chunk, /importAll\(\[import\('\.\/photoMode\.ts'\), import\('\.\/photoMode\.css'\)\]\)/, 'one chunk holds the bar and its sheet');
  assert.match(garage, /photoModeChunk\.load\(\)\.then\(\(\{ openPhotoMode \}\)/, 'the Garage opens the shared module');
  assert.match(garage, /scope: 'garage'/);
  assert.match(battle, /\(\{ openPhotoMode \} = await photoModeChunk\.load\(\)\);/, 'the battle opens the shared module');
  assert.doesNotMatch(battle, /^import \{[^\n]*\} from '\.\.\/ui\/photoMode\.ts'/m, 'the battle holds the bar lazily');
  assert.match(battle, /scope: 'battle'/);
  // it stands on the page's surface stack, whose Escape runs ahead of every page key that wants one (the perf panel's)
  assert.match(shared, /const surface: TransientSurface = \{\n\s*id: host\.scope === 'battle' \? 'photo-battle' : 'photo-garage',/);
  assert.match(shared, /modal: true,/);
  assert.match(shared, /kit\.openSurface\(surface, null\)/);
  assert.match(shared, /kit\.closeSurface\(surface\)/);
  // Exit's key cap reads Escape as every other cap does (input.ts labelForCode: ESC, TAB, SPACE; critic r6 line 3)
  assert.match(await read('src/game/input.ts'), /Escape: 'ESC'/);
  assert.match(shared, /kit\.keycap\('ESC'\)/, 'Exit\'s cap is ESC, as the HUD and the Controls list spell it');
  assert.doesNotMatch(garage, /keycap\('Esc'\)/, 'no mixed-case Escape cap in the Garage either');
  // photo mode takes the keyboard while it shows, so the Garage closes it when it hides (a battle began) and opens it
  // only if the Garage still stands once the chunk arrives (P then Deploy on a cold chunk; improve-271 plan 025)
  assert.match(garage, /closePhoto = openPhotoMode\(/, 'the Garage keeps the close photo mode returns');
  assert.match(garage, /\n    hide\(\) \{\n(?:(?!\n    \},)[\s\S])*\n\s*closePhoto\?\.\(\);/, 'hide() closes photo mode');
  assert.match(garage, /openPhotoMode \}\) => \{\n\s*\/\/[^\n]*\n\s*if \(!ticket\.current\(\) \|\| battleMenu\.classList\.contains\('open'\)\) return;/,
    'the Garage is checked again once the chunk has loaded (its screen ticket)');
  // a focused control in the bar keeps its own keys (the framings' arrows), stopped at the bar short of the page
  assert.match(shared, /bar\.contains\(event\.target\) && CONTROL_KEYS\.test\(event\.code\)\) return;/);
  assert.match(shared, /bar\.addEventListener\('keydown', \(event\) => event\.stopPropagation\(\)\)/);
  // Save: busy (disabled, aria-busy) while the PNG encodes; a failure (an unreadable canvas, a frame that threw) is the
  // kit's error toast (Save tries again), in a top region the sheet leaves showing (critic r12 line 8)
  assert.match(shared, /save\.disabled = on;\n\s*save\.setAttribute\('aria-busy', String\(on\)\);/);
  assert.match(shared, /try \{ still = captureStill\(host\.still, 2\); \} catch \(error\) \{ still = Promise\.reject\(error\); \}/,
    'a frame that throws still ends the busy state');
  assert.match(shared, /if \(!blob\) throw new Error/, 'an unreadable canvas is a failure, not silence');
  // the press reads no layout: Save puts the inset fit last measured back, never fit() itself (critic r13 line 9)
  const saveBody = shared.slice(shared.indexOf('const saveStill = '), shared.indexOf('const setBusy = '));
  assert.match(saveBody, /view\.inset\?\.\(barInsetPx\);/);
  assert.doesNotMatch(saveBody, /fit\(\)|getBoundingClientRect/, 'Save measures nothing');
  assert.match(shared, /severity: 'error', text: t\('photo\.saveFailed'\) \}\);/);
  assert.doesNotMatch(shared, /retry:/, 'no Retry on the toast: Save, enabled again, tries once more (the kit\'s rule, settings-unify-278)');
  assert.match(await read('src/ui/photoMode.css'), /body\.cot-photo-on > :not\(#app,\.cot-photo-bar,\.cot-photo-notices,/);
  for (const locale of ['en-US', 'zh-CN']) {
    assert.ok(JSON.parse(await read(`src/ui/i18nCatalog.${locale}.json`))['photo.saveFailed'], `${locale} names a failed save`);
  }
  // reduced motion (the reader's choice, ui/accessibilityPreferences.ts): the battle's photo camera and the Garage's
  // showroom orbit take a framing at once (critic r12 line 9)
  assert.match(battle, /reduceMotion: \(\) => A11Y\.reduceMotion/);
  const rig = await read('src/engine/cameraRig.ts');
  assert.match(rig, /const reducedMotion = \(\): boolean => A11Y\.reduceMotion;/);
  assert.match(rig, /const follow = reducedMotion\(\) \? 1 : 1 - Math\.exp\(-dt \/ SHOW_FOLLOW_TAU_S\);/);
  for (const [path, source] of [['src/ui/garage.ts', garage], ['src/game/battlePhotoMode.ts', battle], ['src/main.ts', await read('src/main.ts')]]) {
    assert.doesNotMatch(source, /cot-photo-bar|toBlob\(/, `${path} draws no photo bar and takes no still of its own`);
  }
}

// 5. the sheet: every page child but the stage and the bar steps away (the HUD, the touch controls, notices, the gear)
{
  const sheet = await read('src/ui/photoMode.css');
  assert.match(sheet, /body\.cot-photo-on > :not\(#app,\.cot-photo-bar,\.cot-photo-notices,script,style,link\)\{visibility:hidden;\}/);
  assert.match(sheet, /body\.cot-photo-on #app > :not\(canvas\)\{visibility:hidden;\}/);
}

console.log('battlePhotoMode selftest: PASS');
