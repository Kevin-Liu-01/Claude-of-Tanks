// The phone controller's layout (docs/PHONE-CONTROLLER.md "Modes"; owner 2026-11-20: "big buttons and surface areas for
// all capabilities ... so you can play all special modes from couch/mobile controller mode"). Every mode has a layout;
// every key sends a real input action, hold or command, wears a real glyph and has its words in both languages; every
// capability a keyboard player has is on the phone in some mode (or named as kept off it, with the reason); the AC-130
// and the binoculars never send the scope's toggle; and the desktop grants each mode's optional keys from the game's own
// facts (a tank's kit, a mode's grants, a couch seat's few, Watch's and death's keys).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACTION_DEFS } from '../game/input.ts';
import { PAD_ACTS, PAD_LAYOUTS, padActBit, padActGranted, padVisible } from './padLayout.ts';
import { PAD_COMMANDS, PAD_HOLD_ACTIONS, PAD_MODES, PAD_STRIKE_PICKS, PAD_TAP_ACTIONS, readPadCtl } from './padProtocol.ts';
import { padActsMask } from './padDesk.ts';
import { padGrants, padStatusOf } from './padReceiver.ts';

const en = JSON.parse(readFileSync(new URL('../ui/i18nCatalog.en-US.json', import.meta.url), 'utf8'));
const zh = JSON.parse(readFileSync(new URL('../ui/i18nCatalog.zh-CN.json', import.meta.url), 'utf8'));
const sprite = new Set([...readFileSync(new URL('../ui/icons/spriteIndex.ts', import.meta.url), 'utf8').matchAll(/\|\s*'([A-Za-z0-9]+)'/g)].map((m) => m[1]));
const said = (key, where) => { assert.ok(key in en, `${where}: ${key} has English words`); assert.ok(key in zh, `${where}: ${key} has Chinese words`); };

assert.deepEqual(Object.keys(PAD_LAYOUTS).sort(), [...PAD_MODES].sort(), 'every mode has a layout');
assert.ok(PAD_ACTS.length <= 31, 'the grant mask fits a status integer');
assert.equal(new Set(PAD_ACTS).size, PAD_ACTS.length);

const reached = new Set();
for (const mode of PAD_MODES) {
  const layout = PAD_LAYOUTS[mode];
  const controls = [...layout.left, ...layout.right, ...layout.stickKeys, ...layout.fireKeys, ...(Array.isArray(layout.deck) ? layout.deck : [])];
  const ids = controls.map((control) => control.id);
  assert.equal(new Set(ids).size, ids.length, `${mode}: every key is there once`);
  for (const control of controls) {
    const where = `${mode}/${control.id}`;
    const send = control.send;
    if ('tap' in send) { assert.ok(PAD_TAP_ACTIONS.includes(send.tap), `${where} taps a pad tap action`); reached.add(send.tap); }
    else if ('hold' in send) { assert.ok(PAD_HOLD_ACTIONS.includes(send.hold), `${where} holds a pad hold action`); reached.add(send.hold); }
    else {
      assert.ok(PAD_COMMANDS.includes(send.cmd), `${where} sends a command`);
      const message = readPadCtl(JSON.stringify(send.n === undefined ? { k: 'cmd', c: send.cmd } : { k: 'cmd', c: send.cmd, n: send.n }));
      assert.ok(message, `${where}'s command reads on the desktop`);
    }
    if (control.optional) assert.ok(PAD_ACTS.includes(control.id), `${where} is optional, so it has a grant bit`);
    assert.ok(sprite.has(control.glyph), `${where} wears a sprite glyph (${control.glyph})`);
    said(control.label, where);
    if (control.short) said(control.short, where);
  }
  for (const [name, key] of Object.entries({ stick: layout.thumbs.stick, aim: layout.thumbs.aim, fire: layout.thumbs.fire?.label })) {
    if (key) said(key, `${mode}/${name}`);
  }
  if (layout.thumbs.fire) { assert.ok(sprite.has(layout.thumbs.fire.glyph)); reached.add(layout.thumbs.fire.hold); }
  if (layout.thumbs.stick) for (const id of ['forward', 'back', 'left', 'right']) reached.add(id);
  if (layout.deck === 'shells') for (const id of ['shell1', 'shell2', 'shell3']) reached.add(id);
  if (layout.note) said(layout.note, `${mode}/note`);
}

// the AC-130 steps its zoom every frame the scope's toggle reads down (engine/aerialCamera.ts), and in the binoculars the
// toggle drops the view: neither mode may send it
for (const mode of ['gunship', 'strike', 'drone']) {
  const layout = PAD_LAYOUTS[mode];
  const all = [...layout.left, ...layout.right, ...layout.stickKeys, ...layout.fireKeys, ...(Array.isArray(layout.deck) ? layout.deck : [])];
  assert.ok(!all.some((control) => 'tap' in control.send && control.send.tap === 'sniperToggle'), `${mode} never sends sniperToggle`);
}
// Watch reads its climb, descend and boost with isDown: they are holds, never taps
const watchHolds = PAD_LAYOUTS.watch.left.map((control) => control.send.hold);
assert.deepEqual(watchHolds, ['handbrake', 'reloadMagazine', 'sniperToggle'], 'Watch\'s climb, descend and boost are holds');
// the binoculars' six call-ins, by number
assert.deepEqual(PAD_LAYOUTS.strike.deck.map((control) => control.send.n), [...Array(PAD_STRIKE_PICKS).keys()]);
// the drone has no gun: FIRE stands down
assert.equal(PAD_LAYOUTS.drone.thumbs.fire, null);

// Every capability a keyboard player has is on the phone in some mode; the game screen's own panels are on Options; the
// ones kept off it are named with the reason.
const OPTIONS_SCREEN = ['minimapZoom', 'shotLog', 'networkPanel'];
const KEPT_OFF = {
  leaveBattle: 'leaving a battle stays the computer\'s choice (phone-controller-266)',
  scuttle: 'destroying your own tank stays the computer\'s choice, as leaving does (death-flow-275)',
  settingsMenu: 'the top strip\'s pause sends the pause message, Escape\'s toggle',
  perfHud: 'a developer readout',
  photoMode: 'a picture is framed at the computer (its free camera drags and dollies on the stage); Settings\' Photo mode opens it (photo-mode-271b, settings-unify-278)',
  hideBattleUi: 'the minimal HUD is the desktop screen\'s own view (settings-unify-278 made its F10 a binding), not a battle action',
  freeCamera: 'its job (hold or toggle aim, free look) is the scope and Look keys',
};
const page = readFileSync(new URL('./padPage.ts', import.meta.url), 'utf8');
for (const id of OPTIONS_SCREEN) assert.ok(page.includes(`data-screen="${id}"`), `${id} is on Options`);
for (const { id } of ACTION_DEFS) {
  if (reached.has(id) || OPTIONS_SCREEN.includes(id) || id in KEPT_OFF) continue;
  assert.fail(`${id}: a keyboard player's action the phone cannot reach in any mode`);
}

// --- the grants (the desktop's side) -------------------------------------------------------------------------------
const granted = (mode, source) => padVisible([...PAD_LAYOUTS[mode].left, ...PAD_LAYOUTS[mode].right, ...PAD_LAYOUTS[mode].stickKeys,
  ...PAD_LAYOUTS[mode].fireKeys], padActsMask(padGrants(mode, source))).map((control) => control.id);
assert.equal(padActGranted(padActsMask(['smoke', 'drone']), 'drone'), true);
assert.equal(padActGranted(padActsMask(['smoke']), 'drone'), false);
assert.equal(padActBit('nothing'), 0);
const shell = (type, guided) => ({ type, ...(guided ? { guided } : {}) });
const tank = (id, shells = [shell('AP'), shell('HE')], gun = {}) => ({
  id: 'p1', combat: { destroyed: false, shellSlot: 0, ammo: [40, 20], reload: { t: 0, totalS: 6 } },
  spec: { id, gun: { shells, ...gun } }, state: { turretYaw: 0, speed: 0 },
});
const source = (player, extra = {}) => ({ battle: true, paused: false, sniper: false, player, shellCode: (type) => type, lockable: true, ...extra });

// an M1A1 (smoke, lights, one roof gun) in an Air Support battle: its kit, the lock, the binoculars, the armour view
{
  const keys = granted('tank', source(tank('m1a1'), { facts: { airSupport: true } }));
  for (const id of ['consumable1', 'consumable2', 'consumable3', 'smoke', 'lights', 'roofGun', 'autoAim', 'strikeView', 'hitboxOverlay',
    'sniperToggle', 'freeLook', 'handbrake']) assert.ok(keys.includes(id), `an M1A1 has ${id}`);
  for (const id of ['drone', 'atgm', 'reloadMagazine', 'specialAction', 'selfRight', 'zoomIn', 'rangeReset', 'watchSeat']) {
    assert.ok(!keys.includes(id), `an M1A1 here has no ${id}`);
  }
}
// a launcher with an autoloader, in the drone mode, scoped, on the Proving Ground: the ATGM, the reload, the drone, zoom
{
  const keys = granted('tank', source(tank('t90m', [shell('APFSDS'), shell('ATGM', true)], { autoloader: { rounds: 22 } }),
    { sniper: true, facts: { drone: true, range: true, jump: true } }));
  for (const id of ['atgm', 'reloadMagazine', 'drone', 'zoomIn', 'zoomOut', 'rangeReset', 'rangeMoving', 'selfRight']) {
    assert.ok(keys.includes(id), `this one has ${id}`);
  }
}
// a mode without consumables shows none
assert.ok(!granted('tank', source(tank('m1a1'), { facts: { consumables: false } })).includes('consumable1'));
// a couch seat: only what its seat controls honour (couchSeats.ts), never the lock, the drone or the binoculars
{
  const keys = granted('tank', source(tank('t90m', [shell('APFSDS'), shell('ATGM', true)], { autoloader: {} }),
    { lockable: false, facts: { couch: true, airSupport: true, drone: true } }));
  for (const id of ['autoAim', 'strikeView', 'drone', 'atgm', 'lights', 'roofGun', 'hitboxOverlay']) assert.ok(!keys.includes(id), `a couch seat has no ${id}`);
  for (const id of ['consumable1', 'smoke', 'reloadMagazine', 'zoomIn']) assert.ok(keys.includes(id), `a couch seat has ${id}`);
}
// the AC-130's drops; Watch's ride and seat keys; death's skip and steps
assert.deepEqual(granted('gunship', source(tank('m1a1'))).filter((id) => id.startsWith('supply')), ['supplyAmmo', 'supplyHeal']);
assert.ok(granted('watch', source(null, { facts: { watchRiding: true } })).includes('watchDrone'));
assert.ok(!granted('watch', source(null)).includes('watchDrone'), 'on the drone, no key flies off a tank');
assert.ok(granted('watch', source(null, { facts: { watchSeat: true } })).includes('watchSeat'));
assert.deepEqual(granted('dead', source(null, { facts: { killcam: true, spectating: true } })), ['killcamSkip', 'spectatePrev', 'spectateNext']);
assert.deepEqual(granted('dead', source(null, { facts: { killcam: true, couch: true } })), [], 'a couch seat skips nothing on the shared screen');
// the seat Watch hands over plays as a tank, with Leave
assert.ok(granted('tank', source(tank('m1a1'), { facts: { watchSeat: true } })).includes('watchSeat'));

// the status: the mode and the grants ride it; Watch and a destroyed player's killcam need no tank of their own
{
  const status = padStatusOf(source(tank('m1a1'), { mode: 'strike', facts: { airSupport: true } }));
  assert.equal(status.m, 'strike');
  assert.equal(readPadCtl(JSON.stringify({ k: 'status', s: status }))?.s.m, 'strike', 'the status reads on the phone');
  const watching = padStatusOf(source(null, { mode: 'watch', facts: { watchRiding: true } }));
  assert.equal(watching.m, 'watch');
  assert.ok(padActGranted(watching.a, 'watchDrone'));
  assert.equal(padStatusOf(source(null, { mode: 'tank' })), null, 'a tank mode with no tank is idle');
  const dead = padStatusOf(source(tank('m1a1'), {}));
  assert.equal(dead.m, 'tank', 'no mode given: a living tank');
  assert.equal(readPadCtl(JSON.stringify({ k: 'status', s: { ...status, m: 'tilt' } })), null, 'an unknown mode is refused');
  assert.ok(JSON.stringify({ k: 'status', s: status }).length < 480, 'a full status still fits one relay payload');
}

console.log(`padLayout: PASS — ${PAD_MODES.length} modes laid out, every key a real action, command, glyph and word; every keyboard action reachable; grants by kit, mode, couch, Watch and death`);
