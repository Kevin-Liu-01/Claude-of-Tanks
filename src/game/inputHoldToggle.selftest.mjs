// inputHoldToggle.selftest.mjs — hold or toggle for every hold action, and the perf meter off by default (brand-ui SPEC
// 12.1.6 and 14; PLAN BUI-F9). Copyright © 2026 Kevin B. Liu.
//
//  1. Every hold action can toggle: the input layer's (fire, handbrake, gun hold, the RMB action) latch on one press and
//     release on the next, from a key, a mouse button or a touch control; the physical release is ignored; a menu, a
//     blur and a player who can no longer drive release every latch; RMB's own Toggle mode is never toggled twice;
//     a toggled burst fires until the next press, which fires nothing. The HUD's roster key toggles too.
//  2. Every hold in the shell is accounted for: each key or pointer release handler outside the input layer is a hold
//     action with a toggle path, or a gesture that is not a hold (drag, rebind capture), named below.
//  3. The FPS/ping meter is off for new profiles and for profiles saved before the default changed; an explicit choice
//     saved since is kept; the touch HUD no longer forces it on.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createInput } from './input.ts';
import { createPlayerFrameInput } from './playerFrameInput.ts';
import { A11Y } from '../ui/accessibilityPreferences.ts';
import { HOLD_ACTIONS } from '../ui/accessibilitySettings.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(`${ROOT}${path}`, 'utf8');
const prior = { window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage };
let clock = 1000;
const realNow = performance.now.bind(performance);
performance.now = () => clock;
const key = (type, code, extra = {}) => Object.assign(new Event(type, { cancelable: true }), { code, repeat: false, ...extra });
const mouse = (type, button) => Object.assign(new Event(type, { cancelable: true }), { button });
const fresh = (stored = new Map()) => {
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), { hidden: false, pointerLockElement: null });
  globalThis.localStorage = { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, v) };
  return createInput();
};
const toggles = (...actions) => { A11Y.toggles = new Set(actions); };

try {
  /* 1. hold or toggle ------------------------------------------------------------------------------------------ */
  assert.deepEqual([...HOLD_ACTIONS], ['fire', 'handbrake', 'freeLook', 'freeCamera', 'rosters'], 'the hold actions');
  {
    const input = fresh();
    toggles();
    window.dispatchEvent(key('keydown', 'Space'));
    assert.equal(input.getState().handbrake, true, 'Hold: the handbrake holds while Space is down');
    window.dispatchEvent(key('keyup', 'Space'));
    assert.equal(input.getState().handbrake, false, 'and releases with it');

    toggles('handbrake', 'freeLook');
    for (const [code, action, read] of [['Space', 'handbrake', () => input.getState().handbrake], ['CapsLock', 'freeLook', () => input.isDown('freeLook')]]) {
      window.dispatchEvent(key('keydown', code));
      window.dispatchEvent(key('keydown', code, { repeat: true }));
      assert.equal(read(), true, `Toggle: one press latches ${action} (key repeat never flips it)`);
      window.dispatchEvent(key('keyup', code));
      clock += 5000;
      assert.equal(read(), true, `${action} stays latched with the key up`);
      window.dispatchEvent(key('keydown', code));
      assert.equal(read(), false, `the next press releases ${action}`);
      window.dispatchEvent(key('keyup', code));
      assert.equal(read(), false, `and no queued tap reports ${action} for one more frame`);
    }
    // a touch control (the aircraft's climb button presses the handbrake action)
    input.pressVirtual('handbrake');
    input.releaseVirtual('handbrake');
    assert.equal(input.getState().handbrake, true, 'a touch press latches too');
    clock += 6000;
    assert.equal(input.virtualActive(), true, 'a touch latch keeps the touch lane live past its idle window');
    input.tapVirtual('handbrake');
    assert.equal(input.getState().handbrake, false, 'and the next tap releases it');
    // releases
    window.dispatchEvent(key('keydown', 'Space'));
    window.dispatchEvent(new Event('blur'));
    assert.equal(input.getState().handbrake, false, 'blur releases every latch');
    window.dispatchEvent(key('keydown', 'Space'));
    input.setEnabled(false);
    input.setEnabled(true);
    assert.equal(input.getState().handbrake, false, 'a menu open releases every latch');
    window.dispatchEvent(key('keydown', 'Space'));
    const frame = createPlayerFrameInput({ input, hasAmmo: () => true, forceFire: () => false });
    const player = { input: { throttle: 0, steer: 0, brake: false, fire: false, shellSlot: 0 }, combat: { destroyed: true } };
    frame.poll({ dtSeconds: 1 / 60, inBattle: true, paused: false, killcamActive: false, cameraLocked: false, rigMode: 'ARCADE', player });
    assert.equal(input.getState().handbrake, false, 'a player who can no longer drive (a wreck) loses every latch');
    frame.dispose();
  }
  {
    // Fire: a toggled burst is the full-auto hold, latched; the press that ends it fires nothing.
    const input = fresh();
    toggles('fire');
    window.dispatchEvent(mouse('mousedown', 0));
    window.dispatchEvent(mouse('mouseup', 0));
    assert.equal(input.getState().fire, true, 'the first press fires');
    clock += 3000;
    assert.equal(input.getState().fire, true, 'and keeps firing, as a held trigger does, with the button up');
    window.dispatchEvent(mouse('mousedown', 0));
    assert.equal(input.getState().fire, false, 'the next press stops the burst');
    clock += 10;
    assert.equal(input.getState().fire, false, 'without buffering one more shot');
    window.dispatchEvent(mouse('mouseup', 0));
    toggles();
    window.dispatchEvent(mouse('mousedown', 0));
    window.dispatchEvent(mouse('mouseup', 0));
    clock += 300;
    assert.equal(input.getState().fire, false, 'Hold again: a click is one buffered shot, then nothing');
  }
  {
    // RMB: its own Toggle mode already toggles, so hold-or-toggle never doubles it; in Hold mode it latches the aim.
    const input = fresh();
    toggles('freeCamera');
    input.setSetting('rmbMode', 'hold');
    window.dispatchEvent(mouse('mousedown', 2));
    window.dispatchEvent(mouse('mouseup', 2));
    assert.equal(input.isDown('freeCamera'), true, 'Hold mode + toggle: one press keeps the aim');
    window.dispatchEvent(mouse('mousedown', 2));
    assert.equal(input.isDown('freeCamera'), false, 'the next press lets it go');
    window.dispatchEvent(mouse('mouseup', 2));
    input.setSetting('rmbMode', 'toggle');
    window.dispatchEvent(mouse('mousedown', 2));
    assert.equal(input.isDown('freeCamera'), true, 'Toggle mode reads the button level (its own toggle runs on the edge)');
    window.dispatchEvent(mouse('mouseup', 2));
    assert.equal(input.isDown('freeCamera'), false, 'so the generic latch never doubles it');
    toggles();
  }
  // The HUD's roster key (Tab) and its blur release.
  const hud = read('src/ui/hud.ts');
  assert.match(hud, /if \(!A11Y\.toggles\.has\('rosters'\)\) root\.classList\.add\('rosters-expanded'\);\s*else if \(!event\.repeat\) root\.classList\.toggle\('rosters-expanded'\);/,
    'Tab toggles the rosters when the player chose toggle (key repeat never flips them)');
  assert.match(hud, /event\.code === 'Tab' && !A11Y\.toggles\.has\('rosters'\)\) collapseRosters\(\)/, 'and Tab up leaves them open then');
  // The settings panel offers the choice for every one of them.
  assert.match(read('src/ui/settings.ts'), /for \(const action of HOLD_ACTIONS\) \{\s*a11ySeg\(holds,/, 'the Accessibility settings offer Hold / Toggle for each');

  /* 2. every hold is accounted for ------------------------------------------------------------------------------- */
  // A release handler (keyup, pointerup / mouseup / touchend) is how a hold is built. Each one in the game shell is a
  // hold action with a toggle path above, or one of these, which are not holds a player keeps down to act.
  const NOT_HOLDS = {
    'src/ui/hud.ts': 'Tab rosters (a HOLD_ACTIONS member) and the roster lists keeping keys from the game while focused',
    'src/ui/touchControls.ts': 'drive stick and aim pad (analog drags), the fire button (drag-to-aim, then the input layer\'s fire), the climb button (the handbrake action), tap buttons',
    'src/ui/settings.ts': 'rebind capture: a tap cancels and holding Esc binds Escape itself (a capture gesture, not an action)',
    'src/ui/hudEditor.ts': 'dragging a HUD element',
    'src/ui/garage.ts': 'dragging the roster strip',
    'src/ui/customCamoStudio.ts': 'painting a stroke',
    'src/game/garageShowroomRuntime.ts': 'orbiting the showroom camera',
    'src/game/input.ts': 'the input layer itself (hold or toggle lives here)',
    'src/game/studio.ts': 'the Studio editor (BUI-ST1 owns its controls)',
    'src/ui/studioPanel.ts': 'dragging a Studio dial (BUI-ST1)',
  };
  const files = ['src/ui/hud.ts', 'src/ui/touchControls.ts', 'src/ui/settings.ts', 'src/ui/hudEditor.ts', 'src/ui/garage.ts',
    'src/ui/customCamoStudio.ts', 'src/game/garageShowroomRuntime.ts', 'src/game/input.ts', 'src/game/studio.ts', 'src/ui/studioPanel.ts'];
  const { execFileSync } = await import('node:child_process');
  const found = execFileSync('git', ['grep', '-l', '-I', '-E', "addEventListener\\('(keyup|pointerup|mouseup|touchend)'|onpointerup=", '--', 'src/ui', 'src/game', 'src/app', 'src/main.ts'],
    { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter((f) => f && !/\.selftest\.|\.test\./.test(f)).sort();
  assert.deepEqual(found, [...files].sort(), 'every release handler in the shell is a hold action or a named non-hold');
  for (const file of files) assert.ok(NOT_HOLDS[file], `${file} is accounted for`);

  /* 3. the perf meter -------------------------------------------------------------------------------------------- */
  {
    const stored = new Map();
    assert.equal(fresh(stored).getSettings().showPerfMeter, false, 'a new profile starts with the FPS/ping meter off');
    stored.set('cot.settings.v1', JSON.stringify({ showPerfMeter: true, volMaster: 0.5 }));
    const legacy = fresh(stored);
    assert.equal(legacy.getSettings().showPerfMeter, false, 'a profile saved under the old default (on, saved wholesale) gets the new default');
    assert.equal(legacy.getSettings().volMaster, 0.5, 'and keeps every other setting');
    legacy.setSetting('showPerfMeter', true);
    assert.equal(JSON.parse(stored.get('cot.settings.v1')).revision, 2, 'saves carry the settings revision');
    assert.equal(fresh(stored).getSettings().showPerfMeter, true, 'an explicit choice saved since is kept');
    legacy.setSetting('showPerfMeter', false);
    assert.equal(fresh(stored).getSettings().showPerfMeter, false);
  }
  assert.doesNotMatch(hud, /mobileRequired|cot-touch-layout'\);\s*if \(!netOptIn/, 'the touch HUD no longer forces the FPS strip on');
  assert.match(hud, /function updateNetReadout\(frame: HudFrame\): void \{\s*if \(!netOptIn\) return;/, 'the readout follows the player\'s choice on every device');
} finally {
  performance.now = realNow;
  A11Y.toggles = new Set();
  for (const [k, v] of Object.entries(prior)) {
    if (v === undefined) delete globalThis[k];
    else globalThis[k] = v;
  }
}

console.log(`hold or toggle: ${HOLD_ACTIONS.length} hold actions latch from keys, mice and touch, release on menus, blur and wrecks; `
  + 'RMB never toggled twice; every shell release handler accounted for; perf meter off by default, legacy profiles migrated');
