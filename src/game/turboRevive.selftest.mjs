// turboRevive.selftest — Turbo starts READY on revive (life-reset-279; Kevin 2026-11-26, relayed by Main: "Turbo starts
// READY on revive: reset its cooldown and charge with the rest of the per-life state"). Before, the hull's cooldown
// (sim/modeMoves.ts turboReadyS) and the seat's tile and phone key (game/turboCooldown.ts) spanned a revive on both
// drivers: a hull that died mid-cooldown came back with its Turbo still cooling. The pass rule was written before the fix
// and the measurement (lane evidence turbo-revive-pass-rule.md):
//  A. The solo driver: the page's own step (setupBattle + simStep) in Turbo Ball at its quickest offered respawn (2 s,
//     under Turbo's 3 s cooldown), drawn by the real HUD, frame runtime (the life scope's frame edge) and player actions,
//     with the phone's cooldowns built as main.ts builds them. Turbo and the air spin are pressed as the tiles press them,
//     the hull dies on the same tick, and on the new life's first frame (the old cooldown still 0.5 s or more from done)
//     the sim, the tile (enabled, not cooling, a full charge, its plain label), the phone's keys and ui:modeMoves all read
//     ready, and a press fires.
//  B. The authority driver: the same ruleset in createAuthoritativeMatch; Turbo's bit, a death on that tick, and the hull
//     ready on its first live tick.
//  C. One rule: both drivers' revive and the solo battle seat call sim/modeMoves.ts resetHullModeMoves.
// The reverted control (the resets taken out) fails A and B with their preconditions holding.
import { created } from '../ui/hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { createBus, createCollider, createGameState, setupBattle, simStep } from './state.ts';
import { spawnTanks } from './rosterState.ts';
import { AIR_STRIKE_KINDS, AIR_SUPPORT_RULES, matchRulesetFor, rulesetUnlimitedFor } from '../sim/matchRuleset.ts';
import { AIR_STRIKE_BITS, PLAYER_ACTION_BITS } from '../sim/playerActions.ts';
import { strikeCallBlocker } from '../sim/strikeCall.ts';
import { airSpinReadyIn, turboReadyIn } from '../sim/modeMoves.ts';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.ts';
import * as battleClient from './battleClientRuntime.ts';
import { createPlayerBattleActions } from './playerBattleActions.ts';
import { createBattleHudFrameRuntime } from './battleHudFrameRuntime.ts';
import { createTurboCooldown, modeMovesUnavailable } from './turboCooldown.ts';
import { openBattleScope, endBattleScope } from './battleScope.ts';
import { attachLifeScopeEdges, lifeScope } from './lifeScope.ts';
import { initHud } from '../ui/hud.ts';
import { createDamagePanel } from '../ui/damagePanel.ts';

const MODE = 'turbo_ball';
const RESPAWN_S = 2; // the quickest offered (matchRuleset.ts OFFERED_RESPAWN_S); Turbo cools 3 s
const MAP = 'steppe';
const MIN_LEFT_S = 0.5; // the old life's cooldown still this far from done at the revive: the death came mid-cooldown
const ruleset = matchRulesetFor(MODE, null, { respawnS: RESPAWN_S });
/** The outcomes (A3, A4, B3), gathered so a control reports each driver's; the preconditions stay hard asserts. */
const failures = [];
assert.equal(ruleset.respawnS, RESPAWN_S, 'the arrangement takes the 2 s respawn');
assert.ok(ruleset.turbo && ruleset.turbo.cooldownS - RESPAWN_S >= MIN_LEFT_S + 0.25,
  `Turbo's cooldown (${ruleset.turbo?.cooldownS} s) outlasts the respawn: a death on the press revives mid-cooldown`);

// ---- A. the solo driver ----------------------------------------------------------------------------------------------
{
  const field = createDedicatedWorldCollision(MAP);
  const authored = field.heightField._layout.spawns;
  const spawnAt = (p) => ({ pos: [p.x, field.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
  field.spawnPoints = { player: spawnAt(authored.player), enemies: authored.enemies.map(spawnAt) };
  const bus = createBus(() => {});
  attachLifeScopeEdges(bus);
  const game = createGameState({ rosterSeed: 5 });
  const input = {
    onAction: () => () => {}, isDown: () => false,
    getSettings: () => ({ armorAimOverlay: false }), setSetting() {},
    getBinding: () => 'KeyX', labelFor: () => 'X', getPadBinding: () => null, padLabelFor: () => '', padActive: () => false,
    bindingsRevision: () => 1,
  };
  const actions = createPlayerBattleActions({
    game, bus, input, isSettingsOpen: () => false,
    network: { isActive: () => false, queueConsumable() {}, queueAction() {} },
    strikes: { kinds: AIR_STRIKE_KINDS, bit: (kind) => AIR_STRIKE_BITS[kind],
      blocker: (air, kind, rangeM) => strikeCallBlocker(AIR_SUPPORT_RULES, air, kind, rangeM) },
    rules: { ...battleClient, rulesetUnlimitedFor,
      hasConsumableRule: (slot) => Number.isInteger(slot) && slot >= 0 && slot < battleClient.CONSUMABLE_SLOTS },
  });
  const hud = initHud(bus);
  const panel = createDamagePanel({ telemetry: null });
  hud.setDamagePanel?.(panel);
  const rig = { mode: 'CHASE', aimPoint: new THREE.Vector3(), aimDist: 200, zoom: 1 };
  const aimController = battleClient.createAimController({
    getGame: () => game, getRig: () => rig, worldRaycast: () => null, targetVisible: () => true,
    getShellCards: () => actions.shellCards, computeDispersion: () => 2, now: () => 0,
  });
  const frames = createBattleHudFrameRuntime({
    game, camera: new THREE.PerspectiveCamera(), rig, input, aimController,
    armorAimOverlay: { update() {}, hide() {} },
    killcam: { isActive: () => false, spectate: { active: false, targetId: null } },
    getHud: () => hud, getDamagePanel: () => panel, now: () => 0,
  });
  // the phone's keys, as main.ts builds them
  const phoneTurbo = createTurboCooldown(bus, () => game.player?.id, () => game.timeS);
  const phoneAirSpin = createTurboCooldown(bus, () => game.player?.id, () => game.timeS, 'tank:airSpin');
  const heard = { turbo: 0, airSpin: 0, modeMoves: null };
  bus.on('tank:turbo', () => { heard.turbo++; });
  bus.on('tank:airSpin', () => { heard.airSpin++; });
  bus.on('ui:modeMoves', (payload) => { heard.modeMoves = payload; });
  const visualOf = (entity) => ({ root: { visible: true }, setVisible() {}, syncFromState() {}, dispose() {}, resetDestroyed() {},
    setDestroyed() {}, recoilKick() {},
    gunMuzzleWorld: (out) => out.set(entity.state.pos.x, entity.state.pos.y + 2.4, entity.state.pos.z),
    gunDirWorld: (out) => out.set(Math.sin(entity.state.yaw), 0, Math.cos(entity.state.yaw)) });

  game.mapId = MAP;
  spawnTanks(game, { scene: { remove() {} } });
  for (const entity of game.allTanks) entity.visual = visualOf(entity);
  setupBattle(game, 'm1a1_abrams_hc', field, { gameMode: MODE, watch: false, random: false, seed: 23,
    arrangement: { allies: 1, enemies: 1, respawnS: RESPAWN_S }, brain: null, deferVisuals: true, deferCamoRepaint: true,
    deferOpeningRoutes: false });
  for (const entity of game.allTanks) entity.visual ??= visualOf(entity);
  assert.equal(game.ruleset.respawnS, RESPAWN_S, "the solo battle's ruleset revives in 2 s");
  const collider = createCollider(game, field);
  game.phase = 'battle';
  openBattleScope('battle');
  actions.setTank(game.player.spec);
  hud.setPreBattleRules(game.ruleset);
  hud.setMode('battle');
  frames.reset();
  const frame = () => { simStep(game, bus, field, null, collider); frames.update(true, false); };
  const run = (n) => { for (let i = 0; i < n; i++) frame(); };

  const tile = created.find((el) => String(el.className).includes('cot-turbo'));
  assert.ok(tile, 'the HUD draws the Turbo tile');
  const tileLabel = tile.querySelector('.sl');
  const tileRead = () => ({ disabled: !!tile.disabled, cooling: tile.hasAttribute('data-cooling'), refill: tile.dataset.refill,
    label: tileLabel.textContent });

  run(90); // the hull settles on its spawn
  const player = game.player;
  assert.ok(player.modeTurbo && player.modeAirSpin, 'the Turbo Ball hull carries Turbo and the air spin');
  const freshTile = tileRead();
  assert.deepEqual({ disabled: freshTile.disabled, cooling: freshTile.cooling, refill: freshTile.refill },
    { disabled: false, cooling: false, refill: '1' }, 'a fresh spawn draws Turbo ready');
  const firstLife = lifeScope(player.id);
  assert.ok(firstLife?.live, 'the spawn opened a life');

  // A1: the air spin and Turbo pressed as the tiles press them, the hull killed on that tick
  bus.emit('ui:airSpin', {});
  bus.emit('ui:turbo', {});
  assert.equal(heard.airSpin, 1, 'A1: the air spin fired');
  assert.equal(heard.turbo, 1, 'A1: Turbo fired');
  const oldTurboReadyS = player.turboReadyS;
  assert.ok(turboReadyIn(player, game.timeS) > 0 && phoneTurbo.readyIn(game.timeS) > 0, 'A1: Turbo cools');
  player.combat.hp = 0;
  player.combat.destroyed = true;
  frame();
  assert.equal(lifeScope(player.id), null, 'the death ended the life');
  // the mode revives it; the first frame of the new life
  let ticks = 0;
  while (ticks++ < 600 && game.player.combat.destroyed) frame();
  assert.ok(!game.player.combat.destroyed, `the mode revived the hull (${ticks} frames)`);
  const revived = game.player;
  const life = lifeScope(revived.id);
  assert.ok(life?.live && life !== firstLife, 'the revive opened a new life before the HUD drew');
  // A2: the old life's cooldown would still run
  const leftS = oldTurboReadyS - game.timeS;
  assert.ok(leftS >= MIN_LEFT_S, `A2: the death came mid-cooldown (${leftS.toFixed(2)} s of the old cooldown left)`);
  console.log(`  revived after ${ticks} frames; the old life's Turbo had ${leftS.toFixed(2)} s left`);
  // A3: every reader reads ready on that frame
  const read = {
    simTurbo: turboReadyIn(revived, game.timeS), simAirSpin: airSpinReadyIn(revived, game.timeS),
    tile: tileRead(), phoneTurbo: phoneTurbo.readyIn(game.timeS), phoneAirSpin: phoneAirSpin.readyIn(game.timeS),
    unavailable: modeMovesUnavailable(null, phoneTurbo.readyIn(game.timeS)).includes('turbo'),
    modeMoves: heard.modeMoves?.turboReady,
  };
  console.log(`  first frame: ${JSON.stringify(read)}`);
  if (read.simTurbo !== 0) failures.push(`A3 solo: the sim's Turbo cools ${read.simTurbo.toFixed(2)} s`);
  if (read.simAirSpin !== 0) failures.push(`A3 solo: the sim's air spin cools ${read.simAirSpin.toFixed(2)} s`);
  if (read.tile.disabled) failures.push('A3 solo: the Turbo tile is disabled');
  if (read.tile.cooling) failures.push('A3 solo: the Turbo tile is cooling');
  if (read.tile.refill !== '1') failures.push(`A3 solo: the Turbo tile's charge is ${read.tile.refill}`);
  if (read.tile.label !== freshTile.label) failures.push(`A3 solo: the Turbo tile reads "${read.tile.label}" (fresh: "${freshTile.label}")`);
  if (read.phoneTurbo !== 0) failures.push(`A3 solo: the phone's Turbo key cools ${read.phoneTurbo.toFixed(2)} s`);
  if (read.phoneAirSpin !== 0) failures.push(`A3 solo: the phone's air-spin key cools ${read.phoneAirSpin.toFixed(2)} s`);
  if (read.unavailable) failures.push("A3 solo: the phone's keys grey Turbo");
  if (read.modeMoves !== true) failures.push('A3 solo: ui:modeMoves reports Turbo not ready');
  // A4: a press on that frame fires, and cools again
  bus.emit('ui:turbo', {});
  if (heard.turbo !== 2) failures.push("A4 solo: a Turbo press on the new life's first frame is refused");
  else if (!(turboReadyIn(revived, game.timeS) > 0)) failures.push('A4 solo: the press fired but Turbo does not cool');
  game.phase = 'garage';
  endBattleScope('garage');
  hud.setMode('hidden');
  phoneTurbo.dispose();
  phoneAirSpin.dispose();
}

// ---- B. the authority driver -----------------------------------------------------------------------------------------
{
  const match = createAuthoritativeMatch({ mapId: 'verdant', seed: 9, countdownS: 0, gameMode: MODE, ruleset, players: [
    { id: 'turbo-a', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: -200, z: -300, yaw: 0 } },
    { id: 'turbo-b', specId: 'm1a1_abrams_hc', team: 'bravo', spawn: { x: 200, z: 300, yaw: Math.PI } },
  ] });
  match.onMatchReady();
  const idle = { throttle: 0, steer: 0, fire: false, brake: true, aimYaw: 0, aimPitch: 0, aimDistance: 100, shellSlot: 0, actionBits: 0 };
  const mine = { ...idle };
  const inputs = new Map([['turbo-a', mine], ['turbo-b', { ...idle }]]);
  const step = () => { match.step({ dt: 1 / 60, inputs }); mine.actionBits = 0; match.afterEventBroadcast?.(); };
  for (let i = 0; i < 90; i++) step();
  const hull = match.entityById.get('turbo-a');
  assert.ok(hull.modeTurbo, 'the authority stamps Turbo on the hull');
  // B1: Turbo's bit; the hull killed on that tick
  mine.actionBits = PLAYER_ACTION_BITS.TURBO;
  step();
  assert.ok(turboReadyIn(hull, match.timeS) > 0, 'B1: the authority took the Turbo and cools it');
  const oldTurboReadyS = hull.turboReadyS;
  hull.combat.hp = 0;
  hull.combat.destroyed = true;
  let ticks = 0;
  while (ticks++ < 600 && hull.combat.destroyed) step();
  assert.equal(hull.combat.destroyed, false, `the authority revived the hull (${ticks} ticks)`);
  const leftS = oldTurboReadyS - match.timeS;
  assert.ok(leftS >= MIN_LEFT_S, `B2: the death came mid-cooldown (${leftS.toFixed(2)} s of the old cooldown left)`);
  console.log(`  authority: revived after ${ticks} ticks; the old life's Turbo had ${leftS.toFixed(2)} s left`);
  const turboLeft = turboReadyIn(hull, match.timeS), spinLeft = airSpinReadyIn(hull, match.timeS);
  console.log(`  authority first tick: ${JSON.stringify({ turbo: turboLeft, airSpin: spinLeft })}`);
  if (turboLeft !== 0) failures.push(`B3 authority: the revived hull's Turbo cools ${turboLeft.toFixed(2)} s`);
  if (spinLeft !== 0) failures.push(`B3 authority: the revived hull's air spin cools ${spinLeft.toFixed(2)} s`);
}

assert.deepEqual(failures, [], `the new life's first frame reads Turbo ready on both drivers:\n  ${failures.join('\n  ')}`);

// ---- C. one rule for both drivers -----------------------------------------------------------------------------------
{
  const solo = readFileSync(new URL('./state.ts', import.meta.url), 'utf8');
  const authority = readFileSync(new URL('../sim/authoritativeMatch.ts', import.meta.url), 'utf8');
  const reviveBody = solo.slice(solo.search(/revive\(ent: SoloEntity, \w+: MatchModeSpawn/), solo.indexOf('ent.visual?.syncFromState?.(ent.state);'));
  assert.ok(reviveBody.includes('resetHullModeMoves(ent);'), "C: the solo step's revive readies Turbo through the one rule");
  assert.match(solo, /function initializeBattleEntity[\s\S]*?resetHullModeMoves\(entity\);/, 'C: and its battle seat');
  assert.match(authority, /function reviveForMode[\s\S]*?resetHullModeMoves\(tank\);/, "C: and the authority's revive");
}

console.log(`turboRevive.selftest: a hull that dies mid-cooldown comes back with Turbo ready on its first frame on both `
  + 'drivers: the sim, the HUD tile (full charge), the phone\'s keys and a press');
process.exit(0);
