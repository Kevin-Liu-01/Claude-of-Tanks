// lifeReset.selftest — a respawn and a new battle start clean (life-reset-279; Kevin 2026-11-24, live 276, a tray with
// HEAT 16 drawn in the red "out" state after a respawn: "theres a bug where if youve expended an ammo it doesnt clear the
// state once you die and respawn or even join another game. fix any kind of bugs like this with game state").
//
// A real solo Air Support battle on the page's own step (setupBattle + simStep, three hulls), drawn by the real HUD,
// damage panel, frame runtime (battleHudFrameRuntime: the life scope's frame edge) and player actions (keys pressed
// through the input port) over the recording DOM. One life is made as dirty as a player makes it: HEAT fired out and its
// key pressed, every consumable popped, enemy rounds into the hull until it burns, the binoculars raised; then the hull
// dies and the mode revives it. The comparison is structural, so state added later is caught with no new line here:
// every element the HUD and the panel hold (its classes, attributes, data, hidden and text, the page's html and body
// flags too) and the seat's per-life fields (the hull's own fields outside its pose, the strike view, the life scope),
// read the same number of frames into each life. The respawned life must equal the fresh spawn's but for the
// battle-wide data listed below (the score, the clock, the kill feed: kept across lives on purpose); then the battle is
// left for the Garage and a new one started, which must equal the first battle's fresh spawn with no exception.
import { created } from '../ui/hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { createBus, createCollider, createGameState, setupBattle, simStep } from './state.ts';
import { spawnTanks } from './rosterState.ts';
import { createShell } from '../sim/ballistics.ts';
import { AIR_STRIKE_KINDS, AIR_SUPPORT_RULES } from '../sim/matchRuleset.ts';
import { AIR_STRIKE_BITS } from '../sim/playerActions.ts';
import { strikeCallBlocker } from '../sim/strikeCall.ts';
import * as battleClient from './battleClientRuntime.ts';
import { rulesetUnlimitedFor } from '../sim/matchRuleset.ts';
import { createPlayerBattleActions } from './playerBattleActions.ts';
import { createBattleHudFrameRuntime } from './battleHudFrameRuntime.ts';
import { strikeView } from './strikeViewState.ts';
import { endBattleScope, openBattleScope } from './battleScope.ts';
import { attachLifeScopeEdges, lifeScope, lifeScopeSnapshot } from './lifeScope.ts';
import { initHud } from '../ui/hud.ts';
import { createDamagePanel } from '../ui/damagePanel.ts';

const MAP = 'steppe';
const PLAYER_SPEC = 'm1a1_abrams_hc';
const AGE = 90; // frames into each life the snapshot is read
const field = createDedicatedWorldCollision(MAP);
const authored = field.heightField._layout.spawns;
const spawnAt = (p) => ({ pos: [p.x, field.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
field.spawnPoints = { player: spawnAt(authored.player), enemies: authored.enemies.map(spawnAt) };

// ---- the page's owners, made once as the page makes them, over one game state that every battle reuses ----
const bus = createBus(() => {});
attachLifeScopeEdges(bus);
const game = createGameState({ rosterSeed: 11 });
const actionListeners = new Map();
const input = {
  onAction(action, listener) {
    (actionListeners.get(action) ?? actionListeners.set(action, new Set()).get(action)).add(listener);
    return () => actionListeners.get(action)?.delete(listener);
  },
  isDown: () => false,
  getSettings: () => ({ armorAimOverlay: false }), setSetting() {},
  getBinding: () => 'KeyX', labelFor: () => 'X', getPadBinding: () => null, padLabelFor: () => '', padActive: () => false,
  bindingsRevision: () => 1,
};
const press = (action) => { for (const listener of [...(actionListeners.get(action) ?? [])]) listener('Key'); };
const actions = createPlayerBattleActions({
  game, bus, input, isSettingsOpen: () => false,
  network: { isActive: () => false, queueConsumable() {}, queueAction() {} },
  strikes: { kinds: AIR_STRIKE_KINDS, bit: (kind) => AIR_STRIKE_BITS[kind],
    blocker: (air, kind, rangeM) => strikeCallBlocker(AIR_SUPPORT_RULES, air, kind, rangeM) },
  // the page's ports (battleClientAccess.ts over the battle client chunk)
  rules: { ...battleClient, rulesetUnlimitedFor,
    hasConsumableRule: (slot) => Number.isInteger(slot) && slot >= 0 && slot < battleClient.CONSUMABLE_SLOTS },
});
const hud = initHud(bus);
const panel = createDamagePanel({ telemetry: null });
hud.setDamagePanel?.(panel);
const camera = new THREE.PerspectiveCamera();
const rig = { mode: 'CHASE', aimPoint: new THREE.Vector3(), aimDist: 200, zoom: 1 };
const aimController = battleClient.createAimController({
  getGame: () => game, getRig: () => rig, worldRaycast: () => null, targetVisible: () => true,
  getShellCards: () => actions.shellCards, computeDispersion: () => 2, now: () => 0,
});
const frames = createBattleHudFrameRuntime({
  game, camera, rig, input, aimController,
  armorAimOverlay: { update() {}, hide() {} },
  killcam: { isActive: () => false, spectate: { active: false, targetId: null } },
  getHud: () => hud, getDamagePanel: () => panel, now: () => 0,
});

// ---- a battle: three hulls (the player, one ally, one enemy), the page's lifecycle edges ----
let collider = null;
function startBattle(seed) {
  game.mapId = MAP;
  spawnTanks(game, { scene: { remove() {} } });
  for (const entity of game.allTanks) entity.visual = visualOf(entity);
  setupBattle(game, PLAYER_SPEC, field, { gameMode: 'air_support', watch: false, random: false, seed,
    arrangement: { allies: 1, enemies: 1 }, brain: null, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: false });
  for (const entity of game.allTanks) entity.visual ??= visualOf(entity);
  collider = createCollider(game, field);
  game.phase = 'battle';
  openBattleScope('battle'); // appLifecycle.ts battleScopeEdge
  actions.setTank(game.player.spec);
  hud.setMode('battle');
  frames.reset();
}
function leaveBattle() {
  game.phase = 'garage';
  endBattleScope('garage');
  hud.setMode('hidden');
}
function visualOf(entity) {
  return { root: { visible: true }, setVisible() {}, syncFromState() {}, dispose() {}, resetDestroyed() {}, setDestroyed() {},
    recoilKick() {}, gunMuzzleWorld: (out) => out.set(entity.state.pos.x, entity.state.pos.y + 2.4, entity.state.pos.z),
    gunDirWorld: (out) => out.set(Math.sin(entity.state.yaw), 0, Math.cos(entity.state.yaw)) };
}
function frame() {
  simStep(game, bus, field, null, collider);
  frames.update(true, false);
}
const run = (n) => { for (let i = 0; i < n; i++) frame(); };

// ---- the snapshot: everything the HUD and the panel hold, and the seat's per-life fields ----
/** Battle-wide data a respawn keeps on purpose, by datum (surfaceRegistry.ts) or class: their subtrees' text, attributes
 *  and data are not compared (their classes and hidden still are). The battle clock, the score, the kill feed and counts,
 *  the team strip and Air Support's points (earned by the crew over the battle, spent on call-ins). */
const BATTLE_WIDE = new Set(['clock', 'score', 'tm', 'sc', 'killfeed', 'kills', 'team-pips', 'support-points']);
function domSnapshot() {
  const rows = new Map();
  const seen = new Set();
  const walk = (element, path) => {
    if (!element || seen.has(element)) return;
    seen.add(element);
    const datum = element.dataset?.datum ?? element.attrs?.get('data-datum');
    const wide = BATTLE_WIDE.has(datum) || [...element.classes].some((name) => BATTLE_WIDE.has(name)) || path.includes('#wide');
    const here = wide ? `${path}#wide` : path;
    rows.set(here, [
      [...element.classes].sort().join(' '),
      wide ? '' : [...element.attrs].filter(([key]) => key !== 'style').sort().map(([k, v]) => `${k}=${v}`).join(' '),
      wide ? '' : Object.entries(element.dataset).sort().map(([k, v]) => `${k}=${v}`).join(' '),
      element.hidden ? 'hidden' : '',
      wide ? '' : element.text,
    ].join(' | '));
    // a canvas's text layer (canvasText.ts) is the canvas's paint in spans, pooled: only the runs it shows are drawn
    const canvasText = element.classes.has('cot-ctext');
    const kids = [...element.children, ...element.queried.values()]
      .filter((child) => !canvasText || child.style.display !== 'none');
    kids.forEach((child, i) => walk(child, `${here}/${child.tagName.toLowerCase()}${child.classes.size ? `.${[...child.classes][0]}` : ''}[${i}]`));
  };
  // the page's tree (the HUD, its panel and every layer it mounts hang from the body); a detached element is gone
  walk(document.documentElement, 'html');
  walk(document.body, 'body');
  return rows;
}
/** The seat's fields that are not per-life state: its pose (where the spawn put it), its drawing and brain, and the lives
 *  the mode counted (matchModes.ts modeLives: the battle's own tally). */
const POSE = new Set(['state', 'visual', 'aimPoint', 'pos', 'aiCtl', '_soloRenderPose', 'modeLives']);
function seatSnapshot() {
  const player = game.player;
  const rows = new Map();
  const walk = (value, path, depth) => {
    if (value === undefined) return; // (a key written undefined is a key not written)
    if (value === null || typeof value !== 'object') { rows.set(path, typeof value === 'number' ? +value.toFixed(3) : value); return; }
    if (depth > 5 || value instanceof THREE.Vector3 || value instanceof THREE.Quaternion) return;
    if (value instanceof Map || value instanceof Set) { rows.set(`${path}.size`, value.size); return; }
    for (const key of Object.keys(value)) {
      if (POSE.has(key) || typeof value[key] === 'function') continue;
      walk(value[key], `${path}.${key}`, depth + 1);
    }
  };
  walk(player, 'player', 0);
  walk({ open: strikeView.open, blend: strikeView.blend, kind: strikeView.kind, order: strikeView.order.state?.() ?? null }, 'strikeView', 0);
  return rows;
}
const diff = (fresh, now, label) => {
  const out = [];
  for (const [key, value] of fresh) if (!now.has(key)) out.push(`${label} ${key}: was "${value}", now missing`);
  for (const [key, value] of now) {
    if (!fresh.has(key)) out.push(`${label} ${key}: new "${value}"`);
    else if (!Object.is(fresh.get(key), value) && JSON.stringify(fresh.get(key)) !== JSON.stringify(value)) {
      out.push(`${label} ${key}: fresh "${fresh.get(key)}", now "${value}"`);
    }
  }
  return out;
};

// ---- battle 1: the fresh spawn ----
await ensureAuthorityFleet([PLAYER_SPEC]);
startBattle(41);
await ensureAuthorityFleet(game.tanks.map((entity) => entity.specId));
run(AGE);
const freshDom = domSnapshot();
const freshSeat = seatSnapshot();
const firstLife = lifeScope(game.player.id);
assert.ok(firstLife?.live, 'the spawn opened the seat\'s life');

// ---- the dirty life ----
const player = game.player;
const enemy = game.tanks.find((entity) => entity.team !== player.team);
player.combat.ammo[1] = 0; // HEAT fired out
run(2);
press('shell2'); // the key on the empty rack: refused, the slot pulses
run(2);
// enemy rounds into the hull's flank until it burns (the sim's own shell flight, hit and fire)
const shellSpec = enemy.spec.gun.shells.find((shell) => shell.type === 'HE' || shell.type === 'HEAT') ?? enemy.spec.gun.shells[0];
for (let i = 0; i < 12 && !player.combat.fire.burning && player.combat.hp > player.combat.maxHp * 0.6; i++) {
  const at = player.state.pos;
  const from = new THREE.Vector3(at.x + 40, at.y + 1.6, at.z + (i % 3) - 1);
  const dir = new THREE.Vector3(at.x, at.y + 1.2, at.z).sub(from).normalize();
  game.shells.push(createShell(shellSpec, enemy.id, false, from, dir, 900000 + i));
  run(12);
}
const shotAlight = player.combat.fire.burning;
if (!shotAlight) { player.combat.fire.burning = true; player.combat.fire.ticksLeft = 8; bus.emit('tank:fire', { id: player.id, burning: true }); }
run(10);
assert.equal(seatSnapshot().get('player.combat.fire.burning'), true, 'the hull burns');
assert.match(diff(freshDom, domSnapshot(), 'hud').join('\n'), /status=fire/, 'the fire chip is up');
console.log(`  the hull burns (${shotAlight ? 'set alight by a round' : 'lit by hand: no round started it'}), `
  + `${player.combat.hp.toFixed(0)} of ${player.combat.maxHp} hp`);
assert.ok(!player.combat.destroyed, `the hull lives through its wounds (${player.combat.hp.toFixed(0)} hp)`);
for (const key of ['consumable1', 'consumable2', 'consumable3']) { press(key); run(3); }
bus.emit('ui:strikeViewToggle', {}); // the binoculars up (keys 1-3 pick call-ins while they are)
run(4);
press('consumable3'); // the last call-in picked
run(6);
assert.ok(strikeView.open, 'the binoculars are up in the dirty life');
// the dirty life is dirty where the comparison reads (else an equal snapshot proves nothing)
const dirty = [...diff(freshDom, domSnapshot(), 'hud'), ...diff(freshSeat, seatSnapshot(), 'seat')].join('\n');
for (const [mark, what] of [[/cot-shell deny/, "the empty HEAT slot's refusal pulse"], [/status=tracks/, 'a module chip'],
  [/cot-alert\[\d+\]: fresh/, "a notice of the tank's up"], [/strikeView\.open: fresh "false", now "true"/, 'the binoculars up'],
  [/consumables\.readyAt/, 'the kits spent'],
  [/combat\.hp:/, 'the hull wounded']]) {
  assert.match(dirty, mark, `the dirty life shows ${what} in the snapshot`);
}
console.log(`  the dirty life differs from a fresh spawn in ${dirty.split('\n').length} rows of ${freshDom.size + freshSeat.size}`);
// the hull dies
player.combat.hp = 0;
player.combat.destroyed = true;
run(3);
assert.equal(lifeScope(player.id), null, 'the death ended the life');
// the mode revives it (Air Support: 8 s)
let ticks = 0;
while (ticks++ < 1200 && game.player.combat.destroyed) frame();
assert.ok(!game.player.combat.destroyed, `the mode revived the player (${ticks} frames)`);
const revivedLife = lifeScope(game.player.id);
assert.ok(revivedLife?.live && revivedLife !== firstLife, 'the revive opened a new life');
run(AGE - 1);
const leaks = [...diff(freshDom, domSnapshot(), 'hud'), ...diff(freshSeat, seatSnapshot(), 'seat')];
console.log(leaks.join('\n'));
assert.deepEqual(leaks, [], `the respawned life equals a fresh spawn's but for battle-wide data:\n${leaks.join('\n')}`);

// ---- a new battle after the Garage: a clean start, no exception ----
leaveBattle();
assert.equal(lifeScopeSnapshot().live.length, 0, 'leaving the battle ended the life');
startBattle(41);
run(AGE);
const nextLeaks = [...diff(freshDom, domSnapshot(), 'hud'), ...diff(freshSeat, seatSnapshot(), 'seat')];
assert.deepEqual(nextLeaks, [], `the next battle starts as the first did:\n${nextLeaks.join('\n')}`);
leaveBattle();

console.log('lifeReset.selftest: a respawn after a dirty life and a new battle after the Garage both draw a fresh spawn\'s HUD, '
  + 'panel and seat state');
process.exit(0);
