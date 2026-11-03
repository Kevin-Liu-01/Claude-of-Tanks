// 2026-11-02 audit M6, bot events between ticks: a bot's controller hears shots, hits and blocked shots between its
// updates (game/ai.ts notifyEnemyFired, notifyShellResult, notifyUnderFire, notifyFriendlyBlocked), and those draw from its
// seeded stream, so which hull hears what, in which order, is simulation. Both drivers now deliver them through
// sim/botEvents.ts (one set of filters, the hulls' order, the shooter's result before the struck side's under-fire), and
// the solo step keeps the authority's fire-time gate: a brain's shot a teammate drove into after its update holds and tells
// the controller — the solo step fired it into the teammate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Group, Vector3 } from 'three';
import '../vehicles/tankFactory.ts'; // register the full authored fleet
import { botShotClear, deliverShellHit, deliverShotFired } from './botEvents.ts';
import { createCombatState } from './damage.ts';
import { createTankState } from './movement.ts';
import { createSpecialActionState } from './specialActions.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createBus, createGameState, simStep } from '../game/state.ts';

const solo = readFileSync(new URL('../game/state.ts', import.meta.url), 'utf8');
const authority = readFileSync(new URL('./authoritativeMatch.ts', import.meta.url), 'utf8');

// ---- the delivery: filters and order ----------------------------------------------------------------------------
{
  const heard = [];
  const brain = (id) => ({
    notifyEnemyFired: (shooter) => heard.push(['fired', id, shooter.id]),
    notifyShellResult: (hit) => heard.push(['result', id, hit.targetId, hit.kind]),
    notifyUnderFire: (shooter, info) => heard.push(['under', id, shooter.id, info.selfHit, info.damaging, info.kind]),
    notifyFriendlyBlocked: (risk) => heard.push(['blocked', id, risk.allyId]),
  });
  const hull = (id, team, x, z, { ai = true, destroyed = false, aerial = null } = {}) => ({
    id, team, state: { pos: { x, y: 0, z } }, combat: { destroyed }, aerial, aiCtl: ai ? brain(id) : null });
  const a = hull('a', 'alpha', 0, 0), mate = hull('mate', 'alpha', 50, 0);
  const near = hull('near', 'bravo', 0, 300), wing = hull('wing', 'bravo', 120, 300), far = hull('far', 'bravo', 0, 700);
  const human = hull('human', 'bravo', 0, 320, { ai: false }), wreck = hull('wreck', 'bravo', 10, 300, { destroyed: true });
  const hulls = [a, mate, wing, near, human, wreck, far];
  deliverShotFired(hulls, a);
  assert.deepEqual(heard.splice(0), [['fired', 'wing', 'a'], ['fired', 'near', 'a']],
    'a shot is heard by the other side\'s live brains within 500 m, in the hulls\' order (no player, no wreck, not the far one)');
  deliverShotFired(hulls, hull('gunship', 'alpha', 0, 290, { aerial: { kind: 'gunship' } }));
  assert.deepEqual(heard.splice(0), [], 'the AC-130\'s guns are not heard');
  deliverShellHit(hulls, a, near, { targetId: 'near', kind: 'pen', damage: 40 });
  assert.deepEqual(heard.splice(0), [['result', 'a', 'near', 'pen'], ['under', 'wing', 'a', false, true, 'pen'], ['under', 'near', 'a', true, true, 'pen']],
    'the shooter hears its result first, then the struck hull and its live brain teammates within 200 m, in the hulls\' order');
  deliverShellHit(hulls, a, mate, { targetId: 'mate', kind: 'nonpen', damage: 0 });
  assert.deepEqual(heard.splice(0), [['result', 'a', 'mate', 'nonpen']], 'a friendly hit reaches no one\'s under-fire');
  deliverShellHit(hulls, a, null, { targetId: null, kind: 'miss' });
  assert.deepEqual(heard.splice(0), [['result', 'a', null, 'miss']], 'a miss: the shooter\'s result alone');
}

// ---- both drivers deliver through it, and keep no loop of their own ------------------------------------------------
for (const [name, text] of [['the solo step', solo], ['the authority', authority]]) {
  assert.match(text, /deliverShotFired\(/, `${name} delivers a shot through sim/botEvents.ts`);
  assert.match(text, /deliverShellHit\(/, `${name} delivers a hit through sim/botEvents.ts`);
  assert.match(text, /botShotClear\(entity, entity\.input\.aimPoint, shellSpec, /, `${name} gates a brain's shot through it`);
  assert.doesNotMatch(text, /aiCtl\??\.(notifyShellResult|notifyUnderFire|notifyEnemyFired|notifyFriendlyBlocked)\??\.?\(/,
    `${name} calls no controller callback itself`);
}

// ---- the solo step: a teammate in the lane after the update holds the shot --------------------------------------
function soloShot(withMate) {
  const up = new Vector3(0, 1, 0);
  const world = { heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => up }, raycast: () => null };
  const game = createGameState();
  const blocked = [];
  const make = (id, team, x, z) => {
    const spec = getSpec('m1a1_abrams_hc'), combat = createCombatState(spec);
    combat.equipMults = {};
    const state = createTankState(spec, new Vector3(x, 0, z), 0);
    return { id, specId: spec.id, spec, isPlayer: false, bot: true, team, combat, state, specialAction: createSpecialActionState(spec),
      input: { throttle: 0, steer: 0, brake: true, fire: false, shellSlot: 0, aimLocked: false, actionBits: 0, aimPoint: new Vector3(0, 1.5, 200) },
      visual: { root: new Group(), gunMuzzleWorld: (out) => out.set(x, 2.4, z + 5), gunDirWorld: (out) => out.set(0, 0, 1), recoilKick() {}, setDestroyed() {} } };
  };
  const shooter = make('shooter', 'enemy', 0, 0);
  const target = make('target', 'player', 0, 200);
  const mate = make('mate', 'enemy', 0, 60);
  // the controller's update ran clear (the stub's), the teammate stands in the lane when the gun goes
  shooter.aiCtl = { update() { shooter.input.fire = true; shooter.input.aimPoint.set(0, 1.5, 200); },
    notifyFriendlyBlocked: (risk) => blocked.push(risk.allyId), notifyShellResult() {}, notifyUnderFire() {}, notifyEnemyFired() {} };
  const tanks = withMate ? [shooter, target, mate] : [shooter, target];
  game.tanks = tanks; game.allTanks = tanks.slice();
  for (const entity of tanks) game.tankById.set(entity.id, entity);
  const bus = createBus(() => {});
  const collider = { setSelf() {}, collide: () => false, pendingCrush: [], pendingRams: [], ramBestByPair: new Map(), queueRam() {} };
  simStep(game, bus, world, null, collider);
  return { fired: game.shells.length, blocked };
}
{
  const clear = soloShot(false);
  assert.equal(clear.fired, 1, 'the solo step: a clear lane, the brain\'s shot goes');
  const held = soloShot(true);
  assert.equal(held.fired, 0, 'the solo step: a teammate in the lane holds the brain\'s shot, as the authority does');
  assert.deepEqual(held.blocked, ['mate'], 'and the controller hears which teammate blocked it');
}

console.log('botEvents.selftest: shots, hits and blocked shots reach the controllers through one delivery on both drivers (the other '
  + 'side\'s brains within 500 m; the shooter\'s result, then the struck hull and its brain teammates within 200 m), and the solo '
  + 'step holds a brain\'s shot a teammate drove into, as the authority does');
