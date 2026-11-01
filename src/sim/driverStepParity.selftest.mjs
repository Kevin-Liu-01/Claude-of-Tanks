// One core, two drivers (the owner, 2026-10-29; docs/ARCHITECTURE.md "One core, two drivers"): the local driver steps a
// battle with game/state.ts simStep on the page, the online driver's authority with sim/authoritativeMatch.ts step in a
// room's host. Both are the shared core's step: from the same seed, world, hulls and inputs they must leave the same
// world, byte for byte, every tick. Here a 1v1 on Verdant, seated by the page's own setupBattle (its ground and map
// craters, destruction, the mode) and mirrored into the authority: both hulls player-driven, one driving, turning and
// crashing, both laying their guns and trading shots (hits, damage, modules, the shell's knock, bloom, reload). Every
// tick the two sides' hulls are compared as Float64 bytes. The page's driver applies each hull's controls through the
// authority's own input stage (sim/playerInputStage.ts applyPlayerInput, 268: the local seats' stage, the aim intent
// decoded where the authority decodes it), and the gun's muzzle and bore are posed as the authority poses them (its
// visual stands in for the drawn barrel). The own hull switches its ammunition, asks for a slot emptied on both sides
// and pulls the trigger on it: the same refusal, once, on the same tick, and no shot. Bots' controllers and the mode controllers still run
// in each loop on its own; folding the two loops into one core step is the named follow-up (TESTS-OWED, core-two-drivers-265).
// Negative controls: one input on one side moved by a billionth at tick 300, and the page's ammunition switch a tick late,
// are each found at their tick.
import assert from 'node:assert/strict';
import { Euler, Group, Matrix4, Quaternion, Vector3 } from 'three';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { encodeAimIntent } from './aimIntent.ts';
import { applyPlayerInput } from './playerInputStage.ts';
import * as detMath from './detMath.ts';
import { createBus, createCollider, createGameState, mulberry32, setupBattle, simStep } from '../game/state.ts';
import { spawnTanks } from '../game/rosterState.ts';
import { ensureFullFleet } from '../vehicles/fleetFactory.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

const MAP = 'verdant';
const SEED = 7;
await ensureFullFleet();

const _euler = new Euler(), _quat = new Quaternion(), _unit = new Vector3(), _hull = new Matrix4(), _local = new Matrix4();
const _turret = new Matrix4(), _bore = new Vector3();
/** The gun's muzzle and bore as the authority poses them (authoritativeMatch.ts gunWorldPose; a single-barrel gun). */
function authorityGunPose(entity, muzzleOut, dirOut) {
  const s = entity.state, armor = entity.spec.armor || {};
  const turretPivot = armor.turretPivot || [0, entity.spec.dims.heightM * 0.7, 0];
  const gunPivot = armor.gunPivot || [0, entity.spec.dims.heightM * 0.15, 0];
  const barrelM = Math.max(0.5, Number.isFinite(armor.gunBarrel?.lengthM) ? armor.gunBarrel.lengthM : 3);
  _euler.set(-s.visualPitch, s.yaw, s.visualRoll, 'YXZ');
  _quat.setFromEuler(_euler);
  _unit.setScalar(s.modeScale ?? 1);
  _hull.compose(s.pos, _quat, _unit);
  _local.makeRotationY(s.turretYaw);
  _local.setPosition(turretPivot[0], turretPivot[1], turretPivot[2]);
  _turret.multiplyMatrices(_hull, _local);
  _bore.set(0, detMath.sin(s.gunPitch), detMath.cos(s.gunPitch)).transformDirection(_turret).normalize();
  if (dirOut) dirOut.copy(_bore);
  if (muzzleOut) muzzleOut.set(gunPivot[0], gunPivot[1], gunPivot[2]).applyMatrix4(_turret).addScaledVector(_bore, barrelM * (s.modeScale ?? 1));
}

const STATE_FIELDS = ['yaw', 'speed', 'verticalSpeed', 'yawRate', 'turretYaw', 'turretYawRate', 'gunPitch', 'visualPitch', 'visualRoll', 'bloomF'];
const hex = (value) => Buffer.from(new Float64Array([Number(value)]).buffer).toString('hex');
/** A hull's simulated state as bytes, field by field. */
function hullBytes(entity) {
  const s = entity.state, c = entity.combat;
  const fields = [['pos.x', s.pos.x], ['pos.y', s.pos.y], ['pos.z', s.pos.z], ...STATE_FIELDS.map((key) => [key, s[key]]),
    ['hp', c.hp], ['destroyed', c.destroyed ? 1 : 0], ['reload', c.reload?.t ?? 0], ['shellSlot', c.shellSlot ?? 0],
    ...(c.ammo ?? []).map((count, slot) => [`ammo.${slot}`, count])];
  for (const [name, module] of Object.entries(c.modules ?? {}).sort(([a], [b]) => a.localeCompare(b))) fields.push([`module.${name}`, module.hp]);
  return fields.map(([key, value]) => [key, hex(value)]);
}

/**
 * The own hull's ammunition: its second slot from tick 200 (the first slot's load runs to 450), the emptied third from 460
 * with the trigger pulled at 480 on a ready gun, the second again from 520 (fired at 540), the first from 600.
 */
const EMPTY_SLOT = 2;
const DENIED_FIRE_TICK = 480;
const ownShellSlot = (tick) => (tick < 200 ? 0 : tick < 460 ? 1 : tick < 520 ? EMPTY_SLOT : tick < 600 ? 1 : 0);

/**
 * The battle on both steps for `ticks` ticks; `perturb(tick, side, id, input)` may change one side's input. Returns the
 * first tick and field where the two worlds differ (null when they never do) and what the scenario exercised.
 */
async function run(ticks, perturb = null) {
  const authorityWorld = createDedicatedWorldCollision(MAP), pageWorld = createDedicatedWorldCollision(MAP);
  const authored = pageWorld.heightField._layout.spawns;
  const spawnOf = (point) => ({ pos: [point.x, pageWorld.heightField.getHeightAt(point.x, point.z), point.z], yaw: point.yaw ?? 0 });
  pageWorld.spawnPoints = { player: spawnOf(authored.player), enemies: authored.enemies.map(spawnOf) };
  // the local driver's battle (setupBattle), kept to its player and one hostile, both driven by this receipt's inputs
  const game = createGameState({ rosterSeed: 3 });
  game.mapId = MAP;
  spawnTanks(game, { scene: { remove() {} } });
  for (const entity of game.allTanks) entity.visual = { root: new Group(), setVisible() {}, syncFromState() {}, dispose() {} };
  game.battleCount = 1;
  setupBattle(game, 'm1a1_abrams_hc', pageWorld, { gameMode: 'standard', random: true, brain: null, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: true });
  const own = game.tanks.find((entity) => entity.isPlayer), foe = game.tanks.find((entity) => entity.team === 'enemy');
  game.tanks = [own, foe];
  game.allTanks = [own, foe];
  game.tankById = new Map([[own.id, own], [foe.id, foe]]);
  foe.aiCtl = null;
  foe.ai = null;
  foe.state.pos.set(own.state.pos.x + 140 * Math.sin(own.state.yaw), 0, own.state.pos.z + 140 * Math.cos(own.state.yaw));
  // the online driver's authority on the same battlefield, the same hulls where the page put them (the player's equipment as
  // the page's: none stored; the hostile's the bots' default on both)
  const match = createAuthoritativeMatch({ mapId: MAP, seed: SEED, countdownS: 0, worldCollision: authorityWorld, players: [
    { id: own.id, specId: own.specId, team: 'alpha', equipment: [], spawn: { x: own.state.pos.x, z: own.state.pos.z, yaw: own.state.yaw } },
    { id: foe.id, specId: foe.specId, team: 'bravo', spawn: { x: foe.state.pos.x, z: foe.state.pos.z, yaw: foe.state.yaw + Math.PI } },
  ] });
  match.onMatchReady();
  const authorityOf = (entity) => match.entityById.get(entity.id);
  // t0: the page's hulls take the authority's settled state; the support samples are re-read on both sides
  for (const entity of game.tanks) {
    const authority = authorityOf(entity);
    entity.visual = { root: new Group(), gunMuzzleWorld: (out) => authorityGunPose(entity, out, null),
      gunDirWorld: (out) => authorityGunPose(entity, null, out), recoilKick() {}, setDestroyed() {}, syncFromState() {}, setVisible() {}, dispose() {} };
    const pos = entity.state.pos;
    Object.assign(entity.state, structuredClone({ ...authority.state, pos: undefined }), { pos });
    pos.copy(authority.state.pos);
    entity.input.aimPoint ??= new Vector3();
    for (const state of [entity.state, authority.state]) if (state._sup) state._sup.x = NaN;
  }
  // the own hull's third slot emptied on both sides: asking for it is refused
  own.combat.ammo[EMPTY_SLOT] = 0;
  authorityOf(own).combat.ammo[EMPTY_SLOT] = 0;
  game.combatRng = mulberry32(SEED);
  const bus = createBus(() => {});
  const pageEmit = (type, payload) => bus.emit(type, payload);
  const denied = { page: [], authority: [] };
  let currentTick = 0;
  bus.on('ammo_selection_denied', (payload) => denied.page.push({ tick: currentTick, ...payload }));
  const ammoAtStart = own.combat.ammo.slice();
  const shots = [];
  const collider = createCollider(game, pageWorld);
  const inputFor = (tick, self, other) => {
    const aim = encodeAimIntent(self.state.pos, { x: other.state.pos.x, y: other.state.pos.y + 1.5, z: other.state.pos.z });
    return self.id === own.id
      ? { throttle: 0.6, steer: tick < 240 ? 0 : 0.25, brake: false, fire: tick % 150 === 90 || tick === DENIED_FIRE_TICK,
        shellSlot: ownShellSlot(tick), actionBits: 0, aimLocked: false, ...aim }
      : { throttle: 0, steer: 0, brake: true, fire: tick % 150 === 40, shellSlot: 0, actionBits: 0, aimLocked: false, ...aim };
  };
  let divergence = null;
  for (let tick = 0; tick < ticks && !divergence; tick++) {
    currentTick = tick;
    const inputs = new Map();
    for (const entity of game.tanks) {
      const self = authorityOf(entity), other = authorityOf(entity === own ? foe : own);
      inputs.set(entity.id, perturb?.(tick, 'authority', entity.id, inputFor(tick, self, other)) ?? inputFor(tick, self, other));
    }
    match.step({ dt: 1 / 60, inputs });
    for (const event of match.eventsForViewer(own.id)) if (event.type === 'ammo_selection_denied') denied.authority.push({ tick, id: event.id, slot: event.slot, reason: event.reason, guided: event.guided });
    match.afterEventBroadcast();
    // the local driver's input stage: the authority's own (the local seats'), per tick
    for (const entity of game.tanks) {
      let input = inputFor(tick, entity, entity === own ? foe : own);
      input = perturb?.(tick, 'page', entity.id, input) ?? input;
      applyPlayerInput(entity, input, pageEmit);
    }
    simStep(game, bus, pageWorld, null, collider);
    for (let slot = 0; slot < own.combat.ammo.length; slot++) if (own.combat.ammo[slot] < (shots.at(-1)?.ammo ?? ammoAtStart)[slot]) shots.push({ tick, slot, ammo: own.combat.ammo.slice() });
    for (const entity of game.tanks) {
      const page = hullBytes(entity), authority = hullBytes(authorityOf(entity));
      assert.deepEqual(page.map(([key]) => key), authority.map(([key]) => key), 'both sides carry the same fields');
      const index = page.findIndex(([, bytes], i) => bytes !== authority[i][1]);
      if (index >= 0) divergence = { tick, hull: entity === own ? 'own' : 'foe', field: page[index][0] };
    }
  }
  const exercised = { ownHp: own.combat.hp / own.combat.maxHp, foeHp: foe.combat.hp / foe.combat.maxHp, denied,
    shots: shots.map(({ tick, slot }) => [tick, slot]) };
  authorityWorld.release?.();
  pageWorld.release?.();
  return { divergence, exercised, own: own.state, foe: foe.state };
}

// ---- the same seed, world, hulls and inputs: byte-identical every tick ------------------------------------------------
const TICKS = 900;
const same = await run(TICKS);
assert.equal(same.divergence, null, `the local step and the authority's step part at ${JSON.stringify(same.divergence)}`);
assert.ok(same.exercised.foeHp < 1, `the own shots hit the hostile on both sides (${(same.exercised.foeHp * 100).toFixed(1)} % hp)`);
assert.ok(same.exercised.ownHp < 1, `and the own hull took damage, the hostile's shots and a crash (${(same.exercised.ownHp * 100).toFixed(1)} % hp)`);
assert.ok(Math.abs(same.own.turretYaw) > 0.5, 'the turret laid its gun round onto the target');
const { denied, shots } = same.exercised;
assert.deepEqual(shots, [[90, 0], [540, 1]], `the own hull fired its first slot, then its second, and nothing on the refused slot (${JSON.stringify(shots)})`);
assert.deepEqual(denied.page, denied.authority, 'the same ammunition refusals on both sides, tick for tick');
assert.deepEqual(denied.page.map(({ tick, slot, reason }) => [tick, slot, reason]), [[460, EMPTY_SLOT, 'AMMO_EMPTY']],
  `the emptied slot is refused once, when first asked for (${JSON.stringify(denied.page)})`);

// ---- negative control: one input on one side moved by a billionth is a different world, found at its tick ------------
const SEEDED = 300;
const nudged = await run(SEEDED + 30, (tick, side, id, input) => (tick === SEEDED && side === 'page' && input.throttle > 0
  ? { ...input, throttle: input.throttle + 1e-9 } : null));
assert.ok(nudged.divergence, 'a throttle a billionth higher on the page at tick 300 is caught');
assert.equal(nudged.divergence.tick, SEEDED, `at the tick it was seeded (${JSON.stringify(nudged.divergence)})`);
const SWITCH = 200;
const late = await run(SWITCH + 30, (tick, side, id, input) => (tick === SWITCH && side === 'page' && input.shellSlot === 1
  ? { ...input, shellSlot: 0 } : null));
assert.ok(late.divergence, 'the page switching its ammunition a tick late is caught');
assert.equal(late.divergence.tick, SWITCH, `at the switch's tick (${JSON.stringify(late.divergence)})`);

console.log(`driverStepParity.selftest: ${MAP} 1v1, ${TICKS} ticks, both hulls byte-identical on the local step (game/state.ts simStep) and the `
  + `authority's (sim/authoritativeMatch.ts), the page's controls through the authority's input stage (sim/playerInputStage.ts): `
  + `drive, turn, gun lay, a crash, shots, hits, knock, bloom and reload (hostile at ${(same.exercised.foeHp * 100).toFixed(1)} % hp, `
  + `own at ${(same.exercised.ownHp * 100).toFixed(1)} %), an ammunition switch and the emptied slot refused once at tick `
  + `${denied.page[0].tick}, its trigger held off on a ready gun at ${DENIED_FIRE_TICK}; a throttle a billionth off seeded at tick ${SEEDED} caught at tick `
  + `${nudged.divergence.tick} (${nudged.divergence.field}), the page's switch a tick late caught at tick ${late.divergence.tick} (${late.divergence.field})`);
