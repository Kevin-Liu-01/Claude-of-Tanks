// Aircraft as solids (aircraft-solid-277; Kevin 2026-11-25: "we need to make attacking them better esp with drones because
// we can pass through them. and yes be able to shoot down our own planes even by accident. and when theyre crashed on the
// ground ... that at least need a hitbox so u hit them and cant drive through them"). On the real authority (a room's
// step, Combined Arms: every crew's drone and Air Support's call-ins), a recon jet flown level over a flat field with two
// mesas beside its track (a tank on each, its gun at the jet's height):
//   1. a tank round fired across the jet's track strikes the airframe where it meets it (mode_aircraft_hit at a point on
//      its skin), for the round's damage, credited to the enemy gunner;
//   2. the same round from a crew of the jet's own side strikes it too: friendly, no support points, and a downing by it
//      is a team kill (mode_aircraft_down friendly);
//   3. a drone of the jet's own side hovering in its path is struck by it: the drone is spent, the jet takes the drone's
//      strike (counterAir.droneHit) — before this lane both passed through each other;
//   4. a round passing 3 m over the canopy misses (the old 8 m sphere took it) and a round through the wing 8 m out from
//      the centre line strikes (the old sphere missed it): the hit volume is the airframe's;
//   5. downed, its crash round bursts and its wreck lies there (air.wrecks, the view's), a solid: a tank driven at it
//      stops against it, and a control run with the wreck lifted drives on through;
//   6. a round fired at the wreck stops on it (shell_impact on the aircraft_wreck), and with the wreck lifted it flies on;
//   7. the solo step (game/state.ts, the page's battle) holds the same: its rounds strike the jet of either side, the
//      downed jet's crash round lays its wreck, and a round at the wreck stops on it.
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { createShell } from './ballistics.ts';
import { createCombatState } from './damage.ts';
import { createTankState } from './movement.ts';
import { createMatchModeController } from './matchModes.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createBus, createCollider, createGameState, simStep } from '../game/state.ts';
import { createMatchActor } from '../../server/match/matchActor.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { AIR_SUPPORT_RULES, matchRulesetFor } from './matchRuleset.ts';
import { AIR_STRIKE_BITS, PLAYER_ACTION_BITS } from './playerActions.ts';
import { encodeAimIntent } from './aimIntent.ts';
import { runPose } from './strikeRuns.ts';
import { pointInsideCollisionRecord } from '../world/collision.ts';

const R = AIR_SUPPORT_RULES;
const DT = 1 / 60;
const SPEC = 'm1a1_abrams_hc';
await ensureAuthorityFleet([SPEC]);

// the jet's track: the recon pass flies level 250 m over the mark (0, 0) along +z; a mesa each side of it
const ALT = R.recon.altitudeM;
const MESA = { east: { x: 70, z: 0 }, west: { x: -70, z: 0 } };
const MESA_TOP = ALT - 2.6;
const onMesa = (x, z) => Object.values(MESA).some((m) => Math.abs(x - m.x) < 14 && Math.abs(z - m.z) < 14);
const field = { getHeightAt: (x, z) => (onMesa(x, z) ? MESA_TOP : 0), getGroundType: () => 'firm', getNormalAt: () => new Vector3(0, 1, 0) };

const SEATS = [
  { seat: 0, playerId: 'caller', name: 'Caller', team: 'alpha', specId: SPEC },
  { seat: 1, playerId: 'ally', name: 'Ally', team: 'alpha', specId: SPEC },
  { seat: 2, playerId: 'gunner', name: 'Gunner', team: 'bravo', specId: SPEC },
  { seat: 3, playerId: 'driver', name: 'Driver', team: 'bravo', specId: SPEC },
];
const IDLE = { throttle: 0, steer: 0, fire: false, brake: true, aimLocked: false, aimYaw: 0, aimPitch: 0, aimDistance: 100, shellSlot: 0,
  actionBits: 0 };

function battle(seed = 31, viewer = 'caller') {
  const actor = createMatchActor({ roomId: 'aircraft-solid', mapId: 'verdant', mode: 'combined_arms', seed, seats: SEATS, bots: [],
    ruleset: matchRulesetFor('combined_arms'), world: { mapId: 'verdant', heightField: field, getObstacles: () => [] },
    countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume: null });
  const sim = actor.authority;
  sim.onMatchReady();
  const air = sim.modeController.airSupport;
  const pin = { caller: [0, -220, 0], ally: [MESA.west.x, MESA.west.z, Math.PI / 2], gunner: [MESA.east.x, MESA.east.z, -Math.PI / 2],
    driver: [200, 200, 0] };
  const inputs = new Map(Object.keys(pin).map((id) => [id, { ...IDLE }]));
  const log = [];
  const free = new Set();
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      sim.step({ dt: DT, inputs });
      for (const input of inputs.values()) { input.actionBits = 0; input.fire = false; }
      for (const event of sim.eventsForViewer(viewer)) log.push(event);
      sim.afterEventBroadcast();
      for (const [id, [x, z, yaw]] of Object.entries(pin)) {
        if (free.has(id)) continue;
        const e = sim.entityById.get(id);
        if (e.combat.destroyed) continue;
        e.state.pos.set(x, field.getHeightAt(x, z), z); e.state.speed = 0; e.state.yaw = yaw;
      }
    }
  };
  tick(30);
  const saved = air.capture();
  saved.points = saved.points.map(([id, value]) => [id, id === 'caller' ? R.points.cap : value]);
  air.restore(saved);
  const nowS = () => air.view(null).nowS;
  return { actor, sim, air, inputs, log, tick, pin, free, nowS };
}

/** Calls the recon pass at the mark (0, 0) from the caller's hull (0, -220): the jet flies +z over x = 0 at ALT. */
function callRecon(b) {
  const caller = b.inputs.get('caller');
  Object.assign(caller, encodeAimIntent(b.sim.entityById.get('caller').state.pos, new Vector3(0, 0, 0)));
  caller.actionBits = AIR_STRIKE_BITS.recon;
  b.tick(1);
  const strike = b.air.strikes.find((s) => s.kind === 'recon');
  assert.ok(strike, 'the recon pass was called');
  return strike;
}

/** The muzzle a crew fires from, laid on `aim` (the gun's own lay settles over these ticks). */
function lay(b, id, aim, ticks = 150) {
  const input = b.inputs.get(id);
  for (let i = 0; i < ticks; i++) {
    Object.assign(input, encodeAimIntent(b.sim.entityById.get(id).state.pos, aim), { aimLocked: false });
    b.tick(1);
  }
}

/**
 * Fires `id`'s gun across the jet's track so the round crosses x = 0 at height `y` (over the track's line) when the jet's
 * centre is `aheadM` past that point: the jet's nose meets the round. Returns the events of the shot's flight.
 */
function shootAcross(b, strike, id, { y = ALT, offsetX = 0, crossZ = 0 } = {}) {
  const shooter = b.sim.entityById.get(id);
  const aim = new Vector3(offsetX, y, crossZ);
  lay(b, id, aim);
  // the round's flight to the track (its muzzle velocity, near enough at 70 m) and the jet's arrival at crossZ
  const dist = Math.hypot(shooter.state.pos.x - offsetX, shooter.state.pos.z - crossZ);
  const flightS = dist / 1575;
  const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 };
  // wait for the tick whose next step fires the round so it reaches the track as the jet's centre does
  for (let i = 0; i < 600; i++) {
    runPose(R, strike, b.nowS() + DT + flightS, pose);
    if (pose.z >= crossZ - 1) break;
    Object.assign(b.inputs.get(id), encodeAimIntent(shooter.state.pos, aim), { aimLocked: false });
    b.tick(1);
  }
  const from = b.log.length;
  Object.assign(b.inputs.get(id), encodeAimIntent(shooter.state.pos, aim), { aimLocked: false, fire: true });
  b.tick(30);
  return b.log.slice(from);
}

// ---- 1, 2, 4: rounds across the jet's track ----------------------------------------------------------------------------
function roundRun(id, opts) {
  const b = battle();
  const strike = callRecon(b);
  const pointsBefore = b.air.pointsOf(id);
  const hpBefore = strike.hp;
  const events = shootAcross(b, strike, id, opts);
  const fired = events.find((e) => e.type === 'shell_fired' && e.shooterId === id);
  const hit = events.find((e) => e.type === 'mode_aircraft_hit' && e.strikeId === strike.id);
  b.actor.stop();
  return { b, strike, fired, hit, hpBefore, hp: strike.hp, pointsBefore, points: b.air.pointsOf(id) };
}
const enemy = roundRun('gunner');
assert.ok(enemy.fired, 'the gunner fired');
assert.ok(enemy.hit, `1: the enemy gunner's round strikes the jet (${JSON.stringify(enemy.hit ?? null)})`);
assert.equal(enemy.hit.by, 'gunner'); assert.equal(enemy.hit.friendly, false, '1: not friendly');
assert.ok(enemy.hp < enemy.hpBefore, `1: the jet loses hit points (${enemy.hpBefore} -> ${enemy.hp})`);
assert.ok(Number.isFinite(enemy.hit.x) && Math.abs(enemy.hit.y - ALT) < 2.5, `1: at a point on the airframe (${enemy.hit.x}, ${enemy.hit.y}, ${enemy.hit.z})`);
assert.ok(enemy.points > enemy.pointsBefore, '1: the enemy gunner earns for it');

const friendly = roundRun('ally');
assert.ok(friendly.fired, 'the ally fired');
assert.ok(friendly.hit, '2: the round of the jet\'s own side strikes it (friendly fire)');
assert.equal(friendly.hit.friendly, true, '2: the hit is friendly');
assert.ok(friendly.hp < friendly.hpBefore, `2: the jet loses hit points to its own side (${friendly.hpBefore} -> ${friendly.hp})`);
assert.ok(friendly.points <= friendly.pointsBefore + 1, `2: no points for it (${friendly.pointsBefore} -> ${friendly.points}: the trickle aside)`);

// 4. the volume is the airframe's: 3 m over the canopy misses, 8 m out along the wing strikes
const over = roundRun('gunner', { y: ALT + 3.5 });
assert.ok(over.fired && !over.hit, `4: a round 3.5 m over the jet's spine misses (the old 8 m sphere took it): ${JSON.stringify(over.hit ?? null)}`);
const wingtip = roundRun('gunner', { offsetX: 8.2, y: ALT - 0.4, crossZ: 0.5 });
assert.ok(wingtip.hit, '4: a round through the wing 8.2 m out strikes (the old 8 m sphere missed it)');

// ---- 2 (downed by its own side), 3: a friendly drone in the jet's path --------------------------------------------------
const db = battle(37);
// the gunner's roof gun stays out of reach of the jet here (its counter-air share is not this check's)
db.pin.gunner = [900, 900, 0];
db.tick(1);
db.free.add('ally');
const pilot = db.sim.entityById.get('ally');
assert.ok(pilot.aerial?.kind === 'drone', 'the ally carries a drone (Combined Arms)');
const hover = new Vector3(0, ALT, 0);
const pilotInput = db.inputs.get('ally');
// launch, then fly to a hover on the jet's track over the mark
pilotInput.actionBits = PLAYER_ACTION_BITS.DRONE;
db.tick(1);
let strikeD = null, droneHit = null, droneDown = null;
for (let i = 0; i < 60 * 30 && !droneHit; i++) {
  const v = pilot.aerial;
  if (v?.active) {
    const d = Math.hypot(v.x - hover.x, v.y - hover.y, v.z - hover.z);
    Object.assign(pilotInput, encodeAimIntent(v, hover), { throttle: Math.min(1, d / 12), brake: v.y < hover.y - 2, aimLocked: false });
    if (!strikeD && d < 3) strikeD = callRecon(db);
  }
  const from = db.log.length;
  db.tick(1);
  for (const e of db.log.slice(from)) {
    if (e.type === 'mode_aircraft_hit' && strikeD && e.strikeId === strikeD.id && e.drone) droneHit = e;
  }
}
db.tick(4);
assert.ok(strikeD, '3: the drone reached its hover on the track and the jet was called');
assert.ok(droneHit, '3: the jet flies into the drone hovering in its path and is struck (no pass-through)');
assert.equal(droneHit.by, 'ally'); assert.equal(droneHit.drone, true, '3: by the drone');
assert.equal(droneHit.friendly, true, '3: a friendly drone');
assert.equal(R.recon.hp - strikeD.hp >= Math.min(R.recon.hp, R.counterAir.droneHit), true, `3: the jet takes the drone's strike (${strikeD.hp} left)`);
assert.ok(!pilot.aerial.active, '3: the drone is spent');
droneDown = db.log.find((e) => e.type === 'mode_aircraft_down' && e.strikeId === strikeD.id);
assert.ok(droneDown, '2: the drone downed the recon jet (400 hp to 700)');
assert.equal(droneDown.friendly, true, '2: downed by its own side: a team kill');

// ---- 5, 6: the wreck ------------------------------------------------------------------------------------------------------
// it falls; its crash round bursts and its wreck lies there
for (let i = 0; i < 60 * 14 && !db.air.wrecks.length; i++) db.tick(1);
assert.equal(db.air.wrecks.length, 1, '5: the downed jet lies on the ground as a wreck');
const wreck = { ...db.air.wrecks[0] };
assert.ok(db.air.view(null).wrecks.some((w) => w.id === wreck.id), '5: the view carries it (the presentation draws it there)');
const record = db.air.wreckRecords()[0];
const centre = { x: (record.min[0] + record.max[0]) / 2, z: (record.min[2] + record.max[2]) / 2 };
// the wreck's own nose-down lean: its lowest part at ground level near its anchor (its parts' mean height a few metres)
assert.ok(record.min[1] < 0.5 && record.max[1] > 2, `5: the wreck stands on the ground (${record.min[1].toFixed(2)}..${record.max[1].toFixed(2)} m)`);
db.actor.stop();

/** A tank set 30 m off the wreck's centre, facing it, driven at it at full throttle for 8 s; with `lift` the wreck is gone. */
function driveAt(lift) {
  const b = battle(37);
  b.air.restore({ ...b.air.capture(), wrecks: lift ? [] : [wreck] });
  b.free.add('driver');
  const driver = b.sim.entityById.get('driver');
  const yaw = 0.35;
  const start = { x: centre.x - Math.sin(yaw) * 30, z: centre.z - Math.cos(yaw) * 30 };
  driver.state.pos.set(start.x, 0, start.z); driver.state.yaw = yaw; driver.state.speed = 0;
  Object.assign(b.inputs.get('driver'), { throttle: 1, brake: false, steer: 0 });
  let inside = false, closest = Infinity;
  for (let i = 0; i < 60 * 8; i++) {
    b.inputs.get('driver').throttle = 1; b.inputs.get('driver').brake = false;
    b.tick(1);
    const p = driver.state.pos;
    // inside a part of the wreck low enough to meet a hull (a hull may pass under the raised tail of a wreck nosed in)
    if (record.shape2.parts.some((part) => part.y0 < 2.4 && pointInsideCollisionRecord(record, part, p.x, p.z))) inside = true;
    closest = Math.min(closest, Math.hypot(p.x - centre.x, p.z - centre.z));
  }
  const p = driver.state.pos;
  const along = (p.x - start.x) * Math.sin(yaw) + (p.z - start.z) * Math.cos(yaw);
  b.actor.stop();
  return { inside, along, speed: driver.state.speed, closest };
}
const blocked = driveAt(false), clear = driveAt(true);
assert.ok(!blocked.inside, '5: the tank never stands inside the wreck');
assert.ok(blocked.along < 30, `5: driven at the wreck it stops against it (${blocked.along.toFixed(1)} m on from its start, the wreck's centre 30 m)`);
assert.ok(Math.abs(blocked.speed) < 1.5, `5: and stands (${blocked.speed.toFixed(2)} m/s)`);
assert.ok(clear.along > 45, `5: control: with the wreck lifted it drives on through (${clear.along.toFixed(1)} m)`);

/** A round from a tank 60 m off at the wreck's middle: the impact it makes. */
function shootWreck(lift) {
  // (the shooter's own view: the caller's spotting withholds a far enemy's shot)
  const b = battle(37, 'driver');
  b.air.restore({ ...b.air.capture(), wrecks: lift ? [] : [wreck] });
  const at = { x: centre.x + 60, z: centre.z };
  b.pin.driver = [at.x, at.z, -Math.PI / 2];
  b.tick(2);
  const aim = new Vector3(centre.x, 2.2, centre.z);
  lay(b, 'driver', aim);
  const from = b.log.length;
  Object.assign(b.inputs.get('driver'), encodeAimIntent(b.sim.entityById.get('driver').state.pos, aim), { aimLocked: false, fire: true });
  b.tick(90);
  const events = b.log.slice(from);
  const fired = events.find((e) => e.type === 'shell_fired' && e.shooterId === 'driver');
  const impact = fired && events.find((e) => e.type === 'shell_impact' && e.shellId === fired.shellId);
  b.actor.stop();
  return { fired, impact };
}
const onWreck = shootWreck(false), past = shootWreck(true);
assert.ok(onWreck.fired && onWreck.impact, `6: the round at the wreck meets something (${JSON.stringify(onWreck.impact ?? null)})`);
assert.equal(onWreck.impact.surfaceKind, 'aircraft_wreck', '6: it stops on the wreck');
assert.ok(Math.abs(onWreck.impact.x - centre.x) < 12, `6: there (x ${onWreck.impact.x.toFixed(1)} against the wreck's ${centre.x.toFixed(1)})`);
assert.ok(past.fired && (!past.impact || past.impact.surfaceKind !== 'aircraft_wreck'), '6: control: with the wreck lifted the round flies on past');

// ---- 7: the solo step -------------------------------------------------------------------------------------------------------
function soloBattle() {
  const game = createGameState();
  game.ruleset = matchRulesetFor('air_support');
  const make = (id, team, x, z, isPlayer) => {
    const spec = getSpec(SPEC), combat = createCombatState(spec);
    combat.equipMults = {};
    return { id, specId: spec.id, spec, isPlayer, bot: false, team, combat, state: createTankState(spec, new Vector3(x, 0, z), 0),
      input: { throttle: 0, steer: 0, brake: true, fire: false, shellSlot: 0, aimYaw: 0, aimPitch: 0, aimDistance: 100, actionBits: 0,
        aimPoint: new Vector3(0, 0, 0), auxiliaryBits: 0 },
      visual: { root: new Group(), gunMuzzleWorld: (out) => out.set(x, 3, z), gunDirWorld: (out) => out.set(0, 0, 1), recoilKick() {} } };
  };
  const caller = make('caller', 'player', 0, -220, true), ally = make('ally', 'player', -70, 0, false), gunner = make('gunner', 'enemy', 70, 0, false);
  game.tanks = [caller, ally, gunner]; game.allTanks = game.tanks; game.player = caller;
  for (const t of game.tanks) game.tankById.set(t.id, t);
  game.matchModeController = createMatchModeController({ mode: 'air_support', entities: game.tanks, seed: 3, ruleset: game.ruleset,
    revive() {}, terrainHeight: () => 0, emit: (type, payload) => game.modeEvents.push({ type, payload }) });
  game.matchModeState = game.matchModeController.serialize('caller');
  const air = game.matchModeController.airSupport;
  const saved = air.capture(); saved.points = saved.points.map(([id, v]) => [id, id === 'caller' ? R.points.cap : v]); air.restore(saved);
  const log = [];
  const bus = createBus((name, payload) => { if (name.startsWith('mode:') || name === 'shell:expired') log.push([name, payload]); });
  const ground = (o, d, maxDist) => {
    if (d.y >= -1e-9) return null;
    const t = -o.y / d.y;
    return t >= 0 && t <= maxDist ? { dist: t, point: new Vector3(o.x + d.x * t, 0, o.z + d.z * t), normal: new Vector3(0, 1, 0), kind: 'terrain', record: null } : null;
  };
  // the page's own collider (game/state.ts createCollider: the hulls' obstacles, the wrecks among them)
  const world = { heightField: field, raycast: ground, getObstacles: () => [], queryObstacles: (_a, _b, _c, _d, out) => { out.length = 0; return out; } };
  const collider = createCollider(game, world);
  const pins = game.tanks.map((t) => [t, t.state.pos.clone()]);
  const free = new Set();
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) { simStep(game, bus, world, null, collider); for (const [t, p] of pins) if (!free.has(t.id)) t.state.pos.copy(p); }
  };
  /** A round of `id`'s gun from `from` toward `to`, into the solo shells. */
  const fire = (id, from, to) => {
    const t = game.tankById.get(id);
    const dir = to.clone().sub(from).normalize();
    const shell = createShell(t.spec.gun.shells[0], id, false, from.clone(), dir, game.nextShellId++);
    shell.gravityMps2 = 0;
    game.shells.push(shell);
    return shell;
  };
  return { game, air, log, step, fire, free };
}
const solo = soloBattle();
solo.step(10);
solo.game.player.input.aimPoint.set(0, 0, 0);
solo.game.player.input.auxiliaryBits = AIR_STRIKE_BITS.recon;
solo.step(1);
const soloStrike = solo.air.strikes.find((x) => x.kind === 'recon');
assert.ok(soloStrike, '7: the solo step takes the recon call');
// a round from the ally's mesa across the track 20 m ahead of the jet, timed to meet it there (no drop: gravity off)
const meet = (id, side) => {
  const p = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 };
  for (let i = 0; i < 900; i++) { runPose(R, soloStrike, solo.game.timeS + DT + 70 / 1575, p); if (p.z >= 0) break; solo.step(1); }
  const from = solo.log.length;
  solo.fire(id, new Vector3(side * 70, ALT, 0), new Vector3(0, ALT, 0));
  solo.step(10);
  return solo.log.slice(from).find(([name, e]) => name === 'mode:aircraft_hit' && e.strikeId === soloStrike.id)?.[1];
};
const soloFriendly = meet('ally', -1);
assert.ok(soloFriendly && soloFriendly.friendly === true && soloFriendly.by === 'ally', `7: solo: the jet's own side's round strikes it, friendly (${JSON.stringify(soloFriendly ?? null)})`);
assert.ok(soloStrike.downedS != null || soloStrike.hp < R.recon.hp, '7: solo: and it loses hit points');
for (let i = 0; i < 60 * 14 && !solo.air.wrecks.length; i++) solo.step(1);
assert.equal(solo.air.wrecks.length, 1, '7: solo: the downed jet\'s crash round lays its wreck');
const soloRecord = solo.air.wreckRecords()[0];
// at the middle of its lowest part (the wreck nosed in at 40 degrees: its box's middle is air over its tail)
const lowPart = soloRecord.shape2.parts.reduce((a, b) => (b.y0 < a.y0 ? b : a));
const soloCentre = new Vector3(lowPart.cx, (lowPart.y0 + lowPart.y1) / 2, lowPart.cz);
const fromShot = solo.log.length;
const atWreck = solo.fire('gunner', soloCentre.clone().add(new Vector3(60, 0, 0)), soloCentre);
solo.step(10);
const soloImpact = solo.log.slice(fromShot).find(([name, e]) => name === 'shell:expired' && e.shellId === atWreck.id)?.[1];
assert.ok(soloImpact && soloImpact.hitKind === 'prop' && Math.abs(soloImpact.pos[0] - soloCentre.x) < 12,
  `7: solo: a round at the wreck stops on it (${JSON.stringify(soloImpact ?? null)})`);

// the page's collider: the gunner driven at the wreck's lowest part from 26 m off its flank stops against it
solo.free.add('gunner');
const gunner = solo.game.tankById.get('gunner');
const across = solo.air.wrecks[0].yaw + Math.PI / 2;
const sx = lowPart.cx - Math.sin(across) * 26, sz = lowPart.cz - Math.cos(across) * 26;
gunner.state.pos.set(sx, 0, sz); gunner.state.yaw = across; gunner.state.speed = 0;
for (let i = 0; i < 60 * 6; i++) { Object.assign(gunner.input, { throttle: 1, brake: false, steer: 0 }); solo.step(1); }
const soloAlong = (gunner.state.pos.x - sx) * Math.sin(across) + (gunner.state.pos.z - sz) * Math.cos(across);
assert.ok(soloAlong < 24 && Math.abs(gunner.state.speed) < 1.5, `7: solo: a hull driven at the wreck stops against it (${soloAlong.toFixed(1)} m of 26, ${gunner.state.speed.toFixed(2)} m/s)`);

console.log(`aircraftSolid: an enemy round strikes the recon jet (${enemy.hpBefore} -> ${enemy.hp} hp), its own side's too `
  + `(friendly, ${friendly.hpBefore} -> ${friendly.hp}, no points); 3.5 m over its spine misses, 8.2 m out on the wing strikes; a `
  + `friendly drone in its path is struck and spent and downs it (a team kill); its wreck stops a tank ${blocked.along.toFixed(1)} m `
  + `into a 30 m run (lifted: ${clear.along.toFixed(1)} m) and a round on it at ${onWreck.impact.x.toFixed(1)}; the solo step `
  + `the same (a friendly round on the jet, its wreck laid, a round stopped on it at ${soloImpact.pos[0].toFixed(1)}, a hull stopped `
  + `${soloAlong.toFixed(1)} m into a 26 m run) PASS`);
