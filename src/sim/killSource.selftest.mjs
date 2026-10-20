// killSource.selftest.mjs — a kill carries what it was made with, decided by the authority (lane ac130-fx-228,
// 2026-10-19; the owner: "in kills it still says the tank u chose instead of ac 130 having done the kill").
// The pure rule (direct hit, HE splash, drone, tank, ram), then the multiplayer authority end to end: the AC-130's real
// howitzer round kills a hostile and its shell_hit and tank_destroyed name 'ac130' while the pilot keeps the kill.
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { initializeAerial, killSourceOf, supportKillSource } from './aerialCombat.ts';
import { DRONE_WARHEAD, GUNSHIP_WEAPONS, matchRulesetFor } from './matchRuleset.ts';
import { encodeAimIntent } from './aimIntent.ts';
import '../vehicles/tankFactory.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState } from './damage.ts';
import { createTankState } from './movement.ts';
import { setModeWeapon } from './modeLoadout.ts';
import { createSpecialActionState } from './specialActions.ts';
import { createBus, createGameState, simStep } from '../game/state.ts';

// ---- the rule ----
const gunship = { aerial: { kind: 'gunship' } }, droneCarrier = { aerial: { kind: 'drone' } }, tank = {};
const apfsds = { name: 'M829A4', type: 'APFSDS', tracer: 'APFSDS', caliberMm: 120 };
for (const round of GUNSHIP_WEAPONS) assert.equal(killSourceOf(gunship, round), 'ac130', `a direct hit of the ${round.name}`);
assert.equal(killSourceOf(gunship, { ...GUNSHIP_WEAPONS[1], reloadGroup: undefined }), 'ac130',
  "an HE splash of the gunship's howitzer (the splash carries the same shell): the aircraft decides");
assert.equal(killSourceOf(null, GUNSHIP_WEAPONS[0]), 'ac130', 'a gunship round names its gun even with no shooter record');
assert.equal(killSourceOf(droneCarrier, DRONE_WARHEAD), 'drone', "the Drone mode's FPV");
assert.equal(killSourceOf(tank, DRONE_WARHEAD), 'drone', "any carrier's launched drone");
assert.equal(killSourceOf(tank, { name: DRONE_WARHEAD.name }), 'drone', 'a hit event names the warhead');
assert.equal(killSourceOf(droneCarrier, apfsds), 'vehicle', "the drone carrier's own main gun is the tank's");
assert.equal(killSourceOf(tank, apfsds), 'vehicle', "a tank's round");
assert.equal(killSourceOf(tank), 'vehicle', 'a ram');
assert.equal(killSourceOf(undefined, undefined), 'vehicle');
assert.equal(supportKillSource('ac130'), 'ac130');
assert.equal(supportKillSource('drone'), 'drone');
assert.equal(supportKillSource('vehicle'), null, 'the vehicle itself is the absence of a source');
assert.equal(supportKillSource('__proto__'), null, 'a wire value is never trusted');
// deterministic: the same inputs, the same answer, no clock
assert.equal(killSourceOf(gunship, GUNSHIP_WEAPONS[2]), killSourceOf(gunship, GUNSHIP_WEAPONS[2]));

// ---- the multiplayer authority: the AC-130's howitzer kills, the source rides the events ----
{
  const flat = { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) };
  const match = createAuthoritativeMatch({ gameMode: 'ac130', countdownS: 0, mapId: 'verdant', seed: 29,
    worldCollision: { mapId: 'verdant', heightField: flat, getObstacles: () => [] },
    players: [{ id: 'pilot', specId: 't90am', team: 'alpha', spawn: { x: 0, z: -40, yaw: 0 } },
      { id: 'hostile', specId: 'm1a1_abrams_hc', team: 'bravo', spawn: { x: 0, z: 0, yaw: 0 } }] });
  match.onMatchReady();
  const pilot = match.entityById.get('pilot'), hostile = match.entityById.get('hostile');
  assert.equal(pilot.aerial?.kind, 'gunship', 'the human on alpha flies the gunship');
  hostile.combat.hp = 1;
  const input = { throttle: 0, steer: 0, brake: false, fire: false, aimYaw: 0, aimPitch: -0.7, shellSlot: 1, actionBits: 0 };
  const inputs = new Map([['pilot', input]]);
  const events = [];
  for (let tick = 0; tick < 600 && !hostile.combat.destroyed; tick++) {
    Object.assign(input, encodeAimIntent(pilot.aerial, { x: hostile.state.pos.x, y: hostile.state.pos.y + 1, z: hostile.state.pos.z }));
    input.shellSlot = 1;
    input.fire = tick % 30 === 5;
    match.step({ dt: 1 / 60, inputs });
    events.push(...match.eventsForViewer('pilot'));
  }
  assert.ok(hostile.combat.destroyed, "the gunship's howitzer kills the hostile");
  const kill = events.find((e) => e.type === 'tank_destroyed' && e.id === 'hostile');
  assert.ok(kill, 'the authority announces the kill');
  assert.equal(kill.killerId, 'pilot', 'the pilot keeps the kill credit');
  assert.equal(kill.source, 'ac130', 'the kill names the AC-130, not the pilot\'s garage T-90');
  assert.equal(pilot.kills, 1, 'and the kill counts');
  const lethal = events.find((e) => e.type === 'shell_hit' && e.targetId === 'hostile' && e.destroyed);
  assert.equal(lethal?.attackerSource, 'ac130', 'the lethal hit names it too');
  const fired = events.find((e) => e.type === 'shell_fired' && e.shooterId === 'pilot');
  assert.equal(fired?.weaponSound, 'gunship-howitzer');
}

// ---- a tank's kill carries no source (an older peer reads the same payload) ----
{
  const flat = { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) };
  const match = createAuthoritativeMatch({ gameMode: 'standard', countdownS: 0, mapId: 'verdant', seed: 31,
    worldCollision: { mapId: 'verdant', heightField: flat, getObstacles: () => [] },
    players: [{ id: 'gunner', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: 0, z: 0, yaw: 0 } },
      { id: 'hostile', specId: 'm1a1_abrams_hc', team: 'bravo', spawn: { x: 0, z: 60, yaw: Math.PI } }] });
  match.onMatchReady();
  const hostile = match.entityById.get('hostile');
  hostile.combat.hp = 1;
  const input = { throttle: 0, steer: 0, brake: false, fire: false, aimYaw: 0, aimPitch: 0, shellSlot: 0, actionBits: 0 };
  const inputs = new Map([['gunner', input]]);
  const events = [];
  for (let tick = 0; tick < 900 && !hostile.combat.destroyed; tick++) {
    input.fire = tick > 60 && tick % 60 === 0;
    match.step({ dt: 1 / 60, inputs });
    events.push(...match.eventsForViewer('gunner'));
  }
  const kill = events.find((e) => e.type === 'tank_destroyed' && e.id === 'hostile');
  assert.ok(kill, "the tank's round kills the hostile");
  assert.equal(kill.killerId, 'gunner');
  assert.equal('source' in kill, false, "a tank's own kill stays the payload it was");
  assert.equal('attackerSource' in (events.find((e) => e.type === 'shell_hit' && e.targetId === 'hostile') ?? {}), false);
}
// ---- the solo battle's authority (game/state.ts enrichHitEvent and announceDestroyed): the owner's report was a solo
// battle. Each AC-130 gun kills a 1 hp hostile through the real solo step; the lethal shell:hit and the tank:destroyed
// name 'ac130', the pilot keeps the kill. A tank's own kill in the same harness carries no source.
{
  const flat = { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) };
  const world = { heightField: flat, raycast: () => null, getObstacles: () => [] };
  const collider = { setSelf() {}, collide: () => false, pendingCrush: [], pendingRams: [], queueRam() {} };
  const soloEntity = (id, specId, team, x, z, yaw, isPlayer) => {
    const spec = getSpec(specId), combat = createCombatState(spec);
    combat.equipMults = {};
    return { id, specId, spec, isPlayer, bot: !isPlayer, team, combat, specialAction: createSpecialActionState(spec),
      input: { throttle: 0, steer: 0, brake: true, fire: false, shellSlot: 0, aimYaw: 0, aimPitch: 0, aimDistance: 300, actionBits: 0,
        aimPoint: new Vector3() },
      state: createTankState(spec, new Vector3(x, 0, z), yaw),
      visual: { root: new Group(), gunMuzzleWorld: (out) => out.set(x, 1.6, z + 4), gunDirWorld: (out) => out.set(0, -0.004, 1).normalize(), recoilKick() {}, setDestroyed() {} } };
  };
  const soloKill = (mode, pilotSpec, slot, aimAtHostile) => {
    const game = createGameState();
    game.ruleset = matchRulesetFor(mode);
    const pilot = soloEntity('pilot', pilotSpec, 'player', 0, -40, 0, true);
    const hostile = soloEntity('hostile', 'm1a1_abrams_hc', 'enemy', 0, 60, Math.PI, false);
    for (const entity of [pilot, hostile]) { game.tanks.push(entity); game.allTanks.push(entity); game.tankById.set(entity.id, entity); }
    game.player = pilot;
    initializeAerial(pilot, game.ruleset);
    initializeAerial(hostile, game.ruleset);
    if (pilot.aerial?.kind === 'gunship') setModeWeapon(pilot, 'gunship');
    hostile.combat.hp = 1;
    const events = [];
    const bus = createBus((name, payload) => { if (name === 'shell:hit' || name === 'tank:destroyed') events.push({ name, ...payload }); });
    for (let tick = 0; tick < 900 && !hostile.combat.destroyed; tick++) {
      pilot.input.shellSlot = slot;
      if (aimAtHostile) pilot.input.aimPoint.set(hostile.state.pos.x, hostile.state.pos.y + 1.2, hostile.state.pos.z);
      pilot.input.fire = tick % 20 === 3;
      simStep(game, bus, world, null, collider);
    }
    return { game, pilot, hostile, events };
  };
  for (const [slot, gun] of [[0, 'autocannon'], [1, 'howitzer'], [2, 'missile']]) {
    const { pilot, hostile, events } = soloKill('ac130', 't90am', slot, true);
    assert.equal(pilot.aerial?.kind, 'gunship', 'solo: the player flies the gunship');
    assert.ok(hostile.combat.destroyed, `solo: the gunship's ${gun} kills the hostile`);
    const kill = events.find((e) => e.name === 'tank:destroyed' && e.id === 'hostile');
    assert.ok(kill, `solo ${gun}: the solo battle announces the kill`);
    assert.equal(kill.killerId, 'pilot', `solo ${gun}: the pilot keeps the kill credit`);
    assert.equal(kill.source, 'ac130', `solo ${gun}: the kill names the AC-130, not the pilot's garage T-90`);
    const lethal = events.find((e) => e.name === 'shell:hit' && e.targetId === 'hostile' && e.destroyed);
    assert.equal(lethal?.attackerSource, 'ac130', `solo ${gun}: the lethal hit names the AC-130`);
    assert.equal(lethal?.attackerId, 'pilot', `solo ${gun}: and its attacker is the pilot`);
    assert.equal(pilot.kills ?? 1, 1);
  }
  {
    // a tank's own kill in the solo battle: no source on either event
    const { hostile, events } = soloKill('standard', 'm1a1_abrams_hc', 0, false);
    assert.ok(hostile.combat.destroyed, "solo: the tank's own round kills the hostile");
    const kill = events.find((e) => e.name === 'tank:destroyed' && e.id === 'hostile');
    assert.equal(kill?.killerId, 'pilot');
    assert.equal('source' in (kill ?? {}), false, "solo: a tank's own kill carries no source");
    assert.equal('attackerSource' in (events.find((e) => e.name === 'shell:hit' && e.targetId === 'hostile') ?? {}), false);
  }
}
console.log('killSource: direct hit, HE splash, drone, tank and ram; both authorities (the multiplayer match and the solo battle) stamp the AC-130 kill, the pilot keeps it');
