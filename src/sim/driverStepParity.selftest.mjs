// One core, two drivers (the owner, 2026-10-29; docs/ARCHITECTURE.md "One core, two drivers"): the local driver steps a
// battle with game/state.ts simStep on the page, the online driver's authority with sim/authoritativeMatch.ts step in a
// room's host. Both are the shared core's step: from the same seed, world, hulls and inputs they must leave the same
// world, byte for byte, every tick. Here a 1v1 on Verdant, seated by the page's own setupBattle (its ground and map
// craters, destruction, the mode) and mirrored into the authority: the own hull player-driven, driving, turning and
// crashing, both hulls laying their guns and trading shots (hits, damage, modules, the shell's knock, bloom, reload).
// Every tick the two sides' hulls are compared as Float64 bytes. The page's driver applies the own hull's controls
// through the authority's own input stage (sim/playerInputStage.ts applyPlayerInput, 268: the local seats' stage, the
// aim intent decoded where the authority decodes it), and the gun's muzzle and bore are posed as the authority poses
// them (its visual stands in for the drawn barrel). The hostile is a bot on both drivers (268): one scripted controller
// sits in each driver's bot slot and each driver stages it through its bot path (applyBotInput); it lays on the own
// hull, fires, and switches its ammunition without firing, holding the same slot on both sides every tick. The own hull switches its ammunition, asks for a slot emptied on both sides
// and pulls the trigger on it: the same refusal, once, on the same tick, and no shot. Given a fourth shell (no playable
// hull carries one yet), its fourth slot fires as the fourth on both (268: the page's fire path capped a request at the
// third slot, a rule the authority never had). The drivers still build their AIs apart (seeds, opening routes, enemy
// lists), so the script stands in for the AI; one bot construction for both is the named follow-up (TESTS-OWED, 268).
// The real AI on both drivers (268, one bot construction: game/botConstruction.ts, sim/matchSpotting.ts): a forced 1v1,
// the own hull charging a VT4A1 bot each driver built from the same seed and roster index, through the opening, spotting,
// the engagement and its hits, the two hulls' contact (sim/tankPairContact.ts) and the bot's destruction. Negative controls: one input on one side moved by a billionth at tick 300, the page's
// ammunition switch a tick late, and the real-AI bot's heading a billionth off at tick 600, each found at its tick.
// Spotting (2026-11-02 audit M6; 268): both drivers build it through one construction (sim/matchSpotting.ts: the
// stagger stream from the battle's seed, each hull's paint bonus, its kit from combat.equip) and step it at the same point
// of the tick, so what each hull's team sees of the other is compared every tick too in the scripted battle; the page is
// set up on the receipt's seed, which the authority is seated with. Negative control: the authority's battle seed one off
// (its combat stream kept equal) is found at the first spotting check, the stagger the solo step once drew from a seed of
// its own.
// Every section runs, a red one included, and the receipt fails at the end with each failure listed, rethrowing the
// first one's own error (round 5 S1). The two Mars sections red on 268 run last (round 6 V8), so a new red elsewhere
// is the first failure and keys apart from the inherited one.
import assert from 'node:assert/strict';
import { Euler, Group, Matrix4, Quaternion, Vector3 } from 'three';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { botCamoRoll } from './camoPaint.ts';
import { encodeAimIntent } from './aimIntent.ts';
import { applyPlayerInput } from './playerInputStage.ts';
import * as detMath from './detMath.ts';
import { createBus, createCollider, createGameState, mulberry32, setupBattle, simStep } from '../game/state.ts';
import { spawnTanks } from '../game/rosterState.ts';
import { ensureFullFleet } from '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
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
  // (268) the hull's actions: its consumables' cooldowns and charges, its auxiliaries (lights, roof gun, smoke and its screen)
  const items = entity.consumables;
  if (items) for (let slot = 0; slot < items.readyAt.length; slot++) fields.push([`consumable.${slot}.readyAt`, items.readyAt[slot]], [`consumable.${slot}.charges`, items.charges[slot] ?? -1]);
  const aux = c.auxiliary ?? {};
  fields.push(['aux.lights', aux.lights ?? 0], ['aux.gunOn', aux.gunOn ? 1 : 0], ['aux.smokeCharges', aux.smokeCharges ?? -1], ['aux.smokeReadyAt', aux.smokeReadyAt ?? -1],
    ['aux.smoke.born', aux.smoke?.born ?? -1], ['aux.smoke.x', aux.smoke?.x ?? 0], ['aux.smoke.z', aux.smoke?.z ?? 0], ['aux.smoke.yaw', aux.smoke?.yaw ?? 0]);
  for (const [name, module] of Object.entries(c.modules ?? {}).sort(([a], [b]) => a.localeCompare(b))) fields.push([`module.${name}`, module.hp]);
  // (268, item 6) its paint (a bot's roster roll; none for a seat) and the spotting bonus it earns
  fields.push(['camo', { auto: 2, factory: 1 }[entity.camo] ?? 0], ['camoBonus', entity.camoBonus ?? 0]);
  return fields.map(([key, value]) => [key, hex(value)]);
}

/**
 * The own hull's ammunition: its `chosen` slot from tick 200 (the first slot's load runs to 450), the emptied third from
 * 460 with the trigger pulled at 480 on a ready gun, the chosen again from 520 (fired at 540), the first from 600.
 */
const EMPTY_SLOT = 2;
const DENIED_FIRE_TICK = 480;
const ownShellSlot = (tick, chosen) => (tick < 200 ? 0 : tick < 460 ? chosen : tick < 520 ? EMPTY_SLOT : tick < 600 ? chosen : 0);
const OWN_SPEC = 'm1a1_abrams_hc';
/** The hostile bot's ammunition: its second slot over ticks 100-139 and 250-279, between its shots (every 150 from 40). */
const foeShellSlot = (tick) => ((tick >= 100 && tick < 140) || (tick >= 250 && tick < 280) ? 1 : 0);
/** The hostile bot's presses (sim/playerActions.ts bits, a press on its tick alone): a repair kit, smoke, lights, a magazine reload, first aid. */
const FOE_PRESSES = new Map([[70, 1 << 0], [160, 1 << 6], [220, 1 << 7], [330, 1 << 3], [380, 1 << 1]]);

/**
 * The two drivers' collision worlds on MAP for one run, released when it ends, a throw inside it included (round 5 S1:
 * a failed section no longer ends the process, so its worlds are released before the next section builds its own).
 */
async function withWorlds(body) {
  const authorityWorld = createDedicatedWorldCollision(MAP), pageWorld = createDedicatedWorldCollision(MAP);
  try {
    return await body(authorityWorld, pageWorld);
  } finally {
    authorityWorld.release?.();
    pageWorld.release?.();
  }
}

/**
 * The battle on both steps for `ticks` ticks; `perturb(tick, side, id, input)` may change one side's input. Returns the
 * first tick and field where the two worlds differ (null when they never do) and what the scenario exercised.
 */
async function run(ticks, perturb = null, { fourthShell = false, authoritySeed = SEED } = {}) {
  // a fourth shell (the second's, stocked as it is) on the own hull's spec, which both sides read, before either seats it
  const ownShells = getSpec(OWN_SPEC).gun.shells;
  if (fourthShell) ownShells.push({ ...ownShells[1], name: `${ownShells[1].name} (fourth slot)` });
  const chosen = fourthShell ? 3 : 1;
  try {
    return await withWorlds((authorityWorld, pageWorld) => runBattle(authorityWorld, pageWorld, ticks, perturb, chosen, authoritySeed));
  } finally {
    if (fourthShell) ownShells.pop();
  }
}

async function runBattle(authorityWorld, pageWorld, ticks, perturb, chosen, authoritySeed) {
  const authored = pageWorld.heightField._layout.spawns;
  const spawnOf = (point) => ({ pos: [point.x, pageWorld.heightField.getHeightAt(point.x, point.z), point.z], yaw: point.yaw ?? 0 });
  pageWorld.spawnPoints = { player: spawnOf(authored.player), enemies: authored.enemies.map(spawnOf) };
  // the local driver's battle (setupBattle), kept to its player and one hostile, driven by this receipt's inputs and script
  const game = createGameState({ rosterSeed: 3 });
  game.mapId = MAP;
  spawnTanks(game, { scene: { remove() {} } });
  for (const entity of game.allTanks) entity.visual = { root: new Group(), setVisible() {}, syncFromState() {}, dispose() {} };
  game.battleCount = 1;
  setupBattle(game, OWN_SPEC, pageWorld, { gameMode: 'standard', random: true, brain: null, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: true, seed: SEED });
  const own = game.tanks.find((entity) => entity.isPlayer), foe = game.tanks.find((entity) => entity.team === 'enemy');
  game.tanks = [own, foe];
  game.allTanks = [own, foe];
  game.tankById = new Map([[own.id, own], [foe.id, foe]]);
  foe.ai = null;
  foe.state.pos.set(own.state.pos.x + 140 * Math.sin(own.state.yaw), 0, own.state.pos.z + 140 * Math.cos(own.state.yaw));
  // the online driver's authority on the same battlefield, the same hulls where the page put them (the player's equipment as
  // the page's: none stored; the hostile's the bots' default on both)
  // (the page rolled the hostile's paint at its slot in the full roster: it rides to the authority as a resumed roster's would)
  const match = createAuthoritativeMatch({ mapId: MAP, seed: authoritySeed, countdownS: 0, worldCollision: authorityWorld, players: [
    { id: own.id, specId: own.specId, team: 'alpha', equipment: [], camoBonus: own.camoBonus, spawn: { x: own.state.pos.x, z: own.state.pos.z, yaw: own.state.yaw } },
    { id: foe.id, specId: foe.specId, team: 'bravo', bot: true, camo: foe.camo, spawn: { x: foe.state.pos.x, z: foe.state.pos.z, yaw: foe.state.yaw + Math.PI } },
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
  // the page's combat stream is the authority's (a reseeded authority differs in its spotting stagger alone)
  game.combatRng = mulberry32(authoritySeed);
  const bus = createBus(() => {});
  const pageEmit = (type, payload) => bus.emit(type, payload);
  const denied = { page: [], authority: [] };
  let currentTick = 0;
  bus.on('ammo_selection_denied', (payload) => denied.page.push({ tick: currentTick, ...payload }));
  const ammoAtStart = own.combat.ammo.slice();
  const shots = [];
  const collider = createCollider(game, pageWorld);
  // the hostile's controller in each driver's bot slot: one script, read from its own tick count and the own hull it lays on
  // (byte-identical on both sides while the run holds)
  const foeSlots = [];
  const scriptedBot = (side, entity, target) => {
    let tick = -1;
    return {
      update() {
        tick++;
        const script = { throttle: 0, steer: 0, brake: true, fire: tick % 150 === 40, shellSlot: foeShellSlot(tick), actionBits: FOE_PRESSES.get(tick) ?? 0 };
        const input = perturb?.(tick, side, entity.id, script) ?? script;
        Object.assign(entity.input, input);
        entity.input.aimPoint.set(target.state.pos.x, target.state.pos.y + 1.5, target.state.pos.z);
      },
      setWaypoints() {}, notifyShellResult() {}, notifyUnderFire() {}, notifyEnemyFired() {}, notifyFriendlyBlocked() {},
    };
  };
  foe.aiCtl = scriptedBot('page', foe, own);
  authorityOf(foe).aiCtl = scriptedBot('authority', authorityOf(foe), authorityOf(own));
  const inputFor = (tick, self, other) => ({ throttle: 0.6, steer: tick < 240 ? 0 : 0.25, brake: false,
    fire: tick % 150 === 90 || tick === DENIED_FIRE_TICK, shellSlot: ownShellSlot(tick, chosen), actionBits: 0, aimLocked: false,
    ...encodeAimIntent(self.state.pos, { x: other.state.pos.x, y: other.state.pos.y + 1.5, z: other.state.pos.z }) });
  let divergence = null;
  let spottedTicks = 0;
  const seen = [], shells = [];
  for (let tick = 0; tick < ticks && !divergence; tick++) {
    currentTick = tick;
    const ownInput = inputFor(tick, authorityOf(own), authorityOf(foe));
    match.step({ dt: 1 / 60, inputs: new Map([[own.id, perturb?.(tick, 'authority', own.id, ownInput) ?? ownInput]]) });
    for (const event of match.eventsForViewer(own.id)) if (event.type === 'ammo_selection_denied') denied.authority.push({ tick, id: event.id, slot: event.slot, reason: event.reason, guided: event.guided });
    match.afterEventBroadcast();
    // the local driver's seat stage, the authority's own (the local seats'), per tick; the bot is staged inside simStep
    const pageInput = inputFor(tick, own, foe);
    applyPlayerInput(own, perturb?.(tick, 'page', own.id, pageInput) ?? pageInput, pageEmit);
    simStep(game, bus, pageWorld, null, collider);
    if (tick === 120 || tick === 200 || tick === 260) foeSlots.push([tick, foe.combat.shellSlot]);
    for (let slot = 0; slot < own.combat.ammo.length; slot++) if (own.combat.ammo[slot] < (shots.at(-1)?.ammo ?? ammoAtStart)[slot]) shots.push({ tick, slot, ammo: own.combat.ammo.slice() });
    for (const entity of game.tanks) {
      const page = hullBytes(entity), authority = hullBytes(authorityOf(entity));
      assert.deepEqual(page.map(([key]) => key), authority.map(([key]) => key), 'both sides carry the same fields');
      const index = page.findIndex(([, bytes], i) => bytes !== authority[i][1]);
      if (index >= 0) divergence = { tick, hull: entity === own ? 'own' : 'foe', field: page[index][0] };
    }
    // what each hull's team sees of the other: the authority's viewer filter and the page's spotting, the same rule
    for (const viewer of game.tanks) {
      if (divergence) break;
      const other = viewer === own ? foe : own;
      match.observeForViewer(viewer.id, seen, shells);
      const authoritySees = seen.some((entity) => entity.id === other.id);
      const pageSees = other.team === viewer.team || other.combat.destroyed || game.spotting.isSpotted(other.id, viewer.team, viewer);
      if (authoritySees !== pageSees) divergence = { tick, hull: viewer === own ? 'own' : 'foe', field: `sees ${other === own ? 'own' : 'foe'}` };
      if (pageSees) spottedTicks++;
    }
  }
  const exercised = { ownHp: own.combat.hp / own.combat.maxHp, foeHp: foe.combat.hp / foe.combat.maxHp, spottedTicks, denied,
    shots: shots.map(({ tick, slot }) => [tick, slot]), foeSlots, foeSmokeS: foe.combat.auxiliary?.smoke?.born ?? null };
  return { divergence, exercised, own: own.state, foe: foe.state };
}

/**
 * The real AI on both drivers: the page seats a forced 1v1 (the own hull and an AI_FOE_SPEC bot) on SEED, the authority
 * the same two hulls where the page put them, each driver building the bot through its own path from the same seed and
 * roster index. The own hull charges the bot, firing every 150 ticks; every tick both hulls (pose, motion, hit points,
 * modules, ammunition) and the bot's controls and target are compared as bytes. `perturb(tick, foe)` may change the
 * page's bot before its step.
 */
const AI_FOE_SPEC = 'vt4a1';
async function runRealAi(ticks, perturb = null, { foeRecord = {} } = {}) {
  return withWorlds((authorityWorld, pageWorld) => realAiBattle(authorityWorld, pageWorld, ticks, perturb, foeRecord));
}
async function realAiBattle(authorityWorld, pageWorld, ticks, perturb, foeRecord) {
  const authored = pageWorld.heightField._layout.spawns;
  const spawnOf = (point) => ({ pos: [point.x, pageWorld.heightField.getHeightAt(point.x, point.z), point.z], yaw: point.yaw ?? 0 });
  pageWorld.spawnPoints = { player: spawnOf(authored.player), enemies: authored.enemies.map(spawnOf) };
  const game = createGameState({ rosterSeed: 3 });
  game.mapId = MAP;
  spawnTanks(game, { scene: { remove() {} } });
  for (const entity of game.allTanks) entity.visual = { root: new Group(), setVisible() {}, syncFromState() {}, dispose() {} };
  game.battleCount = 1;
  // the page's roster pinned to the own hull and one bot (rosterState's debug flags), for its setup only
  const previousDebug = globalThis.__DEBUG;
  globalThis.__DEBUG = { flags: { forceRoster: [AI_FOE_SPEC], rosterExact: true } };
  try {
    setupBattle(game, OWN_SPEC, pageWorld, { gameMode: 'standard', random: true, brain: null, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: false, seed: SEED });
  } finally {
    globalThis.__DEBUG = previousDebug;
  }
  const [own, foe] = game.tanks;
  assert.equal(game.tanks.length, 2, 'the pinned roster seats the own hull and one bot');
  assert.ok(own.isPlayer && foe.aiCtl && foe.team === 'enemy', 'the second hull is a hostile bot');
  const match = createAuthoritativeMatch({ mapId: MAP, seed: SEED, countdownS: 0, worldCollision: authorityWorld, players: [
    { id: own.id, specId: own.specId, team: 'alpha', equipment: [], camoBonus: own.camoBonus, spawn: { x: own.state.pos.x, z: own.state.pos.z, yaw: own.state.yaw } },
    // (268, item 6) the bot's paint is the authority's own roll at its roster index, as the page's is: nothing carried
    { id: foe.id, specId: foe.specId, team: 'bravo', bot: true, spawn: { x: foe.state.pos.x, z: foe.state.pos.z, yaw: foe.state.yaw + Math.PI }, ...foeRecord },
  ] });
  const paint = { page: foe.camo, authority: match.entityById.get(foe.id).camo };
  match.onMatchReady();
  const authorityOf = (entity) => match.entityById.get(entity.id);
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
  game.combatRng = mulberry32(SEED);
  const bus = createBus(() => {});
  const pageEmit = (type, payload) => bus.emit(type, payload);
  const collider = createCollider(game, pageWorld);
  // the own hull charges the bot: full throttle, turned onto it, firing every 150 ticks
  const charge = (tick, self, other) => {
    let error = Math.atan2(other.state.pos.x - self.state.pos.x, other.state.pos.z - self.state.pos.z) - self.state.yaw;
    error = Math.atan2(Math.sin(error), Math.cos(error));
    return { throttle: 1, steer: Math.max(-1, Math.min(1, error * 2)), brake: false, fire: tick % 150 === 90, shellSlot: 0, actionBits: 0,
      aimLocked: false, ...encodeAimIntent(self.state.pos, { x: other.state.pos.x, y: other.state.pos.y + 1.5, z: other.state.pos.z }) };
  };
  const start = { x: foe.state.pos.x, z: foe.state.pos.z };
  const exercised = { pulls: 0, sightedAt: null, closestM: Infinity };
  let pulled = false;
  let divergence = null;
  for (let tick = 0; tick < ticks && !divergence; tick++) {
    match.step({ dt: 1 / 60, inputs: new Map([[own.id, charge(tick, authorityOf(own), authorityOf(foe))]]) });
    applyPlayerInput(own, charge(tick, own, foe), pageEmit);
    perturb?.(tick, foe);
    simStep(game, bus, pageWorld, null, collider);
    if (foe.input.fire && !pulled) exercised.pulls++;
    pulled = foe.input.fire;
    if (exercised.sightedAt === null && foe.aiCtl.targetId === own.id) exercised.sightedAt = tick;
    exercised.closestM = Math.min(exercised.closestM, Math.hypot(foe.state.pos.x - own.state.pos.x, foe.state.pos.z - own.state.pos.z));
    for (const entity of game.tanks) {
      const page = hullBytes(entity), authority = hullBytes(authorityOf(entity));
      const index = page.findIndex(([, bytes], i) => bytes !== authority[i][1]);
      if (index >= 0) { divergence = { tick, hull: entity === own ? 'own' : 'bot', field: page[index][0] }; break; }
    }
    const bot = authorityOf(foe);
    for (const key of ['throttle', 'steer', 'brake', 'fire', 'aimLocked', 'shellSlot', 'actionBits']) {
      if (!divergence && foe.input[key] !== bot.input[key]) divergence = { tick, hull: 'bot', field: `input.${key}` };
    }
    for (const axis of ['x', 'y', 'z']) if (!divergence && hex(foe.input.aimPoint[axis]) !== hex(bot.input.aimPoint[axis])) divergence = { tick, hull: 'bot', field: `input.aimPoint.${axis}` };
    if (!divergence && foe.aiCtl.targetId !== bot.aiCtl.targetId) divergence = { tick, hull: 'bot', field: 'targetId' };
  }
  Object.assign(exercised, { movedM: Math.hypot(foe.state.pos.x - start.x, foe.state.pos.z - start.z), botHp: foe.combat.hp / foe.combat.maxHp,
    ownHp: own.combat.hp / own.combat.maxHp, paint });
  return { divergence, exercised };
}

// ---- every section runs (round 5 S1, 2026-11-06): a section whose assertion fails is recorded and the next one still
// runs, and the receipt fails at the end with every failure listed on stderr, then rethrows the first failure's own
// error, so the receipt's failure identity (tools/gate.mjs failureSignature/failureKey: the uncaught error's header and
// its actual/expected/operator) is the one the old fail-fast run gave for the same first red. 268's Mars coverage (owed
// to its core-parity lane: TESTS-OWED 2026-11-06) stopped the receipt before its later controls (the Mars nudge, the
// reseeded spotting), so they never ran on a tree where Mars is red. Each section's assertions are the ones it had;
// only the runner is new.
// The order (round 6 V8, 2026-11-07): the lane's and the release gate's classifiers key a red receipt by its first
// failure alone, so a section that runs after an inherited red can turn red unseen (keyed inherited, never blocking).
// 268's two red Mars sections, the bot's death and its respawn, therefore run last: every control, and the zone, run
// before them. Only the respawn sits behind the death check, and it is red on 268 too.
const failures = [];
const passed = [];
async function section(name, body) {
  try {
    const note = await body();
    passed.push(name);
    console.log(`driverStepParity: PASS ${name}${note ? ` (${note})` : ''}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`driverStepParity: FAIL ${name}: ${error?.message ?? error}`);
  }
}

// ---- the same seed, world, hulls and inputs: byte-identical every tick ------------------------------------------------
const TICKS = 900;
let same = null;
await section('the scripted battle, byte-identical', async () => {
  same = await run(TICKS);
  assert.equal(same.divergence, null, `the local step and the authority's step part at ${JSON.stringify(same.divergence)}`);
  assert.ok(same.exercised.foeHp < 1, `the own shots hit the hostile on both sides (${(same.exercised.foeHp * 100).toFixed(1)} % hp)`);
  assert.ok(same.exercised.ownHp < 1, `and the own hull took damage, the hostile's shots and a crash (${(same.exercised.ownHp * 100).toFixed(1)} % hp)`);
  assert.ok(Math.abs(same.own.turretYaw) > 0.5, 'the turret laid its gun round onto the target');
  assert.ok(same.exercised.spottedTicks > TICKS, `both teams spot each other on both sides, tick for tick (${same.exercised.spottedTicks} hull-ticks)`);
  const { denied, shots, foeSlots, foeSmokeS } = same.exercised;
  assert.ok(Math.abs(foeSmokeS - 161 / 60) < 1e-9, `the bot's smoke fired the tick it was pressed, on both sides (${foeSmokeS})`);
  assert.deepEqual(foeSlots, [[120, 1], [200, 0], [260, 1]], `the bot switched its ammunition without firing, on both sides (${JSON.stringify(foeSlots)})`);
  assert.deepEqual(shots, [[90, 0], [540, 1]], `the own hull fired its first slot, then its second, and nothing on the refused slot (${JSON.stringify(shots)})`);
  assert.deepEqual(denied.page, denied.authority, 'the same ammunition refusals on both sides, tick for tick');
  assert.deepEqual(denied.page.map(({ tick, slot, reason }) => [tick, slot, reason]), [[460, EMPTY_SLOT, 'AMMO_EMPTY']],
    `the emptied slot is refused once, when first asked for (${JSON.stringify(denied.page)})`);
  return `${TICKS} ticks, ${same.exercised.spottedTicks} hull-ticks spotted`;
});

// ---- negative control: one input on one side moved by a billionth is a different world, found at its tick ------------
const SEEDED = 300;
let nudged = null;
await section('control: a throttle a billionth off', async () => {
  nudged = await run(SEEDED + 30, (tick, side, id, input) => (tick === SEEDED && side === 'page' && input.throttle > 0
    ? { ...input, throttle: input.throttle + 1e-9 } : null));
  assert.ok(nudged.divergence, 'a throttle a billionth higher on the page at tick 300 is caught');
  assert.equal(nudged.divergence.tick, SEEDED, `at the tick it was seeded (${JSON.stringify(nudged.divergence)})`);
  return `caught at tick ${nudged.divergence.tick} (${nudged.divergence.field})`;
});
// ---- a fourth slot fires as the fourth on both sides ------------------------------------------------------------------
let four = null;
await section('a fourth shell fires as the fourth', async () => {
  four = await run(TICKS, null, { fourthShell: true });
  assert.equal(four.divergence, null, `with a fourth shell the two steps part at ${JSON.stringify(four.divergence)}`);
  assert.deepEqual(four.exercised.shots, [[90, 0], [540, 3]], `the fourth slot fired as the fourth (${JSON.stringify(four.exercised.shots)})`);
});

// ---- the real AI on both drivers, through the engagement ---------------------------------------------------------------
// 3000 ticks: the opening, the sighting near 1780, the shots both ways, the hulls' contact and the bot's destruction
const REAL_AI_TICKS = 3000;
let real = null;
await section('the real AI, byte-identical', async () => {
  real = await runRealAi(REAL_AI_TICKS);
  assert.equal(real.divergence, null, `the real AI parts the two drivers at ${JSON.stringify(real.divergence)}`);
  assert.ok(real.exercised.movedM > 200, `the bot drove its opening route and the engagement (${real.exercised.movedM.toFixed(0)} m)`);
  assert.ok(real.exercised.sightedAt !== null, 'the bot sighted the own hull');
  assert.ok(real.exercised.pulls >= 1, `the bot fired (${real.exercised.pulls} trigger pulls)`);
  assert.ok(real.exercised.closestM < 10, `the two hulls met (${real.exercised.closestM.toFixed(1)} m apart at the closest)`);
  // (wrecks-270, 11-07) the engagement ends in a destruction, either way round: verdant's ten hulks (five before) turn the
  // meeting so the bot now kills the own hull at 20.9 % hp of its own, and 3000 to 4800 ticks end alike; the two drivers stay
  // byte-identical through it, which is what this run pins
  const destroyed = real.exercised.botHp === 0 ? 'the bot' : real.exercised.ownHp === 0 ? 'the own hull' : null;
  assert.ok(destroyed, `one hull destroyed the other (bot ${(real.exercised.botHp * 100).toFixed(1)} %, own ${(real.exercised.ownHp * 100).toFixed(1)} % hp)`);
  // (268, item 6) one bot paint rule: both drivers rolled the bot's paint from the match seed at its roster index (1), and an
  // index slip would show (the seed rolls another paint at 0); a paint the authority is handed instead parts them at tick 0
  assert.deepEqual(real.exercised.paint, { page: botCamoRoll(SEED, 1, MAP), authority: botCamoRoll(SEED, 1, MAP) },
    `both drivers painted the bot by the roll (${JSON.stringify(real.exercised.paint)})`);
  assert.notEqual(botCamoRoll(SEED, 0, MAP), botCamoRoll(SEED, 1, MAP), 'the seed rolls another paint one slot over');
  return `${REAL_AI_TICKS} ticks, paint '${real.exercised.paint.page}'`;
});
await section('control: a bot handed the other paint', async () => {
  const wrongPaint = await runRealAi(3, null, { foeRecord: { camo: real?.exercised.paint.page === 'auto' ? 'factory' : 'auto' } });
  assert.deepEqual(wrongPaint.divergence, { tick: 0, hull: 'bot', field: 'camo' }, `a bot handed the other paint is caught (${JSON.stringify(wrongPaint.divergence)})`);
});
const BOT_NUDGE = 600;
let botNudged = null;
await section('control: the bot\'s heading a billionth off', async () => {
  botNudged = await runRealAi(BOT_NUDGE + 20, (tick, foe) => { if (tick === BOT_NUDGE) foe.state.yaw += 1e-9; });
  assert.ok(botNudged.divergence, 'the bot\'s heading a billionth off on the page is caught');
  assert.equal(botNudged.divergence.tick, BOT_NUDGE, `at the tick it was seeded (${JSON.stringify(botNudged.divergence)})`);
  return `caught at tick ${botNudged.divergence.tick} (${botNudged.divergence.field})`;
});

const SWITCH = 200;
let late = null;
await section('control: the page\'s ammunition switch a tick late', async () => {
  late = await run(SWITCH + 30, (tick, side, id, input) => (tick === SWITCH && side === 'page' && input.shellSlot === 1
    ? { ...input, shellSlot: 0 } : null));
  assert.ok(late.divergence, 'the page switching its ammunition a tick late is caught');
  assert.equal(late.divergence.tick, SWITCH, `at the switch's tick (${JSON.stringify(late.divergence)})`);
  return `caught at tick ${late.divergence.tick} (${late.divergence.field})`;
});

// ---- negative control: a spotting stagger drawn from another seed is a different world (the solo step's old own seed)
let reseeded = null;
await section('control: an authority seeded one off', async () => {
  reseeded = await run(60, null, { authoritySeed: SEED + 1 });
  assert.ok(reseeded.divergence && reseeded.divergence.field.startsWith('sees'),
    `an authority seeded one off is caught on what a team sees, at the first check (${JSON.stringify(reseeded.divergence)})`);
  return `caught at tick ${reseeded.divergence.tick} (${reseeded.divergence.field})`;
});

// ---- (268, Main item 8) an objective mode on both drivers: Mars (zone control, the seeded boost caches, its low gravity
// and respawns), the own hull scripted through a cache's pickup, rams that bring two buildings down and a fight to the bot's
// death and its turret's flight; every tick the hulls, the mode's state, the destruction logs, the turret bodies and every
// live round are compared as bytes. Found and fixed on the way: the page felled a blast's props before the world could (the
// headless world then kept the tree's shell bands) and culled real hits on a steeply pitched hull (sim/shellHullReach.ts)
const MODE_FOE_SPEC = 'm41a3';
const bits = (value) => Buffer.from(new Float64Array([value]).buffer).toString('hex');
async function runModeBattle(ticks, perturb = null) {
  return withWorlds((authorityWorld, pageWorld) => modeBattle(authorityWorld, pageWorld, ticks, perturb));
}
async function modeBattle(authorityWorld, pageWorld, ticks, perturb) {
  const authored = pageWorld.heightField._layout.spawns;
  const spawnOf = (point) => ({ pos: [point.x, pageWorld.heightField.getHeightAt(point.x, point.z), point.z], yaw: point.yaw ?? 0 });
  pageWorld.spawnPoints = { player: spawnOf(authored.player), enemies: authored.enemies.map(spawnOf) };
  const game = createGameState({ rosterSeed: 3 });
  game.mapId = MAP;
  spawnTanks(game, { scene: { remove() {} } });
  for (const entity of game.allTanks) entity.visual = { root: new Group(), setVisible() {}, syncFromState() {}, dispose() {} };
  const previousDebug = globalThis.__DEBUG;
  globalThis.__DEBUG = { flags: { forceRoster: [MODE_FOE_SPEC], rosterExact: true } };
  try {
    setupBattle(game, OWN_SPEC, pageWorld, { gameMode: 'mars', random: true, brain: null, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: false, seed: SEED });
  } finally {
    globalThis.__DEBUG = previousDebug;
  }
  const [own, foe] = game.tanks;
  // the authority deploys both sides itself (sim/deployment.ts), as a real match does: no spawn handed in
  const match = createAuthoritativeMatch({ mapId: MAP, seed: SEED, countdownS: 0, gameMode: 'mars', worldCollision: authorityWorld, players: [
    { id: own.id, specId: own.specId, team: 'alpha', equipment: [], camoBonus: own.camoBonus },
    { id: foe.id, specId: foe.specId, team: 'bravo', bot: true },
  ] });
  match.onMatchReady();
  const authorityOf = (entity) => match.entityById.get(entity.id);
  for (const entity of game.tanks) {
    const a = authorityOf(entity).state;
    assert.deepEqual([bits(entity.state.pos.x), bits(entity.state.pos.z), bits(entity.state.yaw)], [bits(a.pos.x), bits(a.pos.z), bits(a.yaw)],
      `both drivers deploy ${entity.id} on the same slot`);
  }
  // the fight starts in the village where the first cache drops, on both drivers (the mode keeps the deployment slots as
  // the respawn points on both)
  for (const [entity, at] of [[own, { x: 6.7, z: 34, yaw: 3.14159 }], [foe, { x: 200, z: 150, yaw: -2.2 }]]) {
    const state = authorityOf(entity).state;
    state.pos.set(at.x, authorityWorld.heightField.getHeightAt(at.x, at.z) + 0.05, at.z);
    state.yaw = at.yaw;
  }
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
  game.combatRng = mulberry32(SEED);
  const bus = createBus(() => {});
  const pageEmit = (type, payload) => bus.emit(type, payload);
  const collider = createCollider(game, pageWorld);
  // the village's weakest building, to ram down once the cache is taken
  const shed = game._destruction.structures.structures.filter((entry) => entry.destructible && entry.collapsible && entry.role === 'building')
    .sort((a, b) => a.maxHp - b.maxHp || a.id - b.id)[0];
  const zone = { x: 64.4, z: -5.4 };
  const drive = (self, target, { fire = false, slot = 0, aimY = 1.5, stopAt = 0 } = {}) => {
    const dx = target.x - self.state.pos.x, dz = target.z - self.state.pos.z;
    let error = Math.atan2(dx, dz) - self.state.yaw;
    error = Math.atan2(Math.sin(error), Math.cos(error));
    const go = Math.hypot(dx, dz) > stopAt;
    return { throttle: go ? 1 : 0, steer: go ? Math.max(-1, Math.min(1, error * 2)) : 0, brake: !go, fire, shellSlot: slot, actionBits: 0,
      aimLocked: false, ...encodeAimIntent(self.state.pos, { x: target.x, y: (target.y ?? self.state.pos.y) + aimY, z: target.z }) };
  };
  let phase = 'cache';
  const script = (tick, self, other, pickups) => {
    if (phase === 'cache') return drive(self, pickups.find((pickup) => pickup.active) ?? zone);
    if (phase === 'shed') return drive(self, { x: shed.cx, z: shed.cz, y: shed.baseY }, { slot: 2, aimY: (shed.topY - shed.baseY) / 2 });
    return drive(self, other.state.pos, { stopAt: 50, slot: 0, fire: tick % 40 === 0 });
  };
  const exercised = { cachesDropped: 0, collectedAt: null, collapses: [], foeDeaths: 0, killedAt: null, turretIds: [], zoneOwners: new Set(), pulls: 0 };
  const seenCaches = new Set();
  let divergence = null, foeWasDestroyed = false;
  const authorityShells = [];
  const shellKey = (list) => list.filter((shell) => !shell.dead).map((shell) => `${shell.id ?? shell.shellId}:${bits(shell.pos.x)}${bits(shell.pos.y)}${bits(shell.pos.z)}`).join('|');
  for (let tick = 0; tick < ticks && !divergence; tick++) {
    const pickups = match.modeController.serialize(own.id).pickups ?? [];
    const authorityInput = script(tick, authorityOf(own), authorityOf(foe), pickups), pageInput = script(tick, own, foe, pickups);
    match.step({ dt: 1 / 60, inputs: new Map([[own.id, authorityInput]]) });
    perturb?.(tick, own);
    applyPlayerInput(own, pageInput, pageEmit);
    simStep(game, bus, pageWorld, null, collider);
    if (pageInput.fire) exercised.pulls++;
    for (const entity of game.tanks) {
      const page = hullBytes(entity), authority = hullBytes(authorityOf(entity));
      const index = page.findIndex(([, value], i) => value !== authority[i][1]);
      if (index >= 0) { divergence = { tick, hull: entity === own ? 'own' : 'bot', field: page[index][0] }; break; }
    }
    const authorityMode = JSON.stringify(match.modeController.serialize(own.id)), pageMode = JSON.stringify(game.matchModeController.serialize(own.id));
    if (!divergence && authorityMode !== pageMode) divergence = { tick, field: 'mode' };
    const log = game._destruction.log;
    if (!divergence && JSON.stringify(match.snapshotMeta(own.id).destructionLog) !== JSON.stringify(log)) divergence = { tick, field: 'destruction' };
    if (!divergence && match.wreckTurretDigest() !== game._wreckTurrets.digest()) divergence = { tick, field: 'wreck turrets' };
    // the authority's whole shell state, not a viewer's: spotting has its own receipts (Main's 268 ruling; the M1A1 HC on
    // the owner model loses sight of the M41 with its round in flight). No viewer passes every shooter but a hull parked
    // by the mode, so the parked hulls are lifted for this read alone (observeForViewer only collects references).
    const parked = match.entities.filter((entity) => entity.modeActive === false);
    for (const entity of parked) entity.modeActive = true;
    try { match.observeForViewer('', [], authorityShells); } finally { for (const entity of parked) entity.modeActive = false; }
    if (!divergence && shellKey(game.shells) !== shellKey(authorityShells)) divergence = { tick, field: 'shells' };
    const mode = JSON.parse(pageMode);
    for (const pickup of mode.pickups ?? []) if (!seenCaches.has(pickup.id)) { seenCaches.add(pickup.id); exercised.cachesDropped++; }
    for (const zoneState of mode.zones ?? []) if (zoneState.owner) exercised.zoneOwners.add(`${zoneState.id}:${zoneState.owner}`);
    if (phase === 'cache' && [...seenCaches].some((id) => !(mode.pickups ?? []).some((pickup) => pickup.id === id && pickup.active))) {
      exercised.collectedAt = tick;
      phase = 'shed';
    }
    exercised.collapses = log.filter((entry) => entry.kind === 'stage' && entry.stage === 'collapsed').map((entry) => entry.structureId);
    if (phase === 'shed' && exercised.collapses.includes(shed.id)) phase = 'foe';
    if (foe.combat.destroyed && !foeWasDestroyed) exercised.foeDeaths++;
    foeWasDestroyed = foe.combat.destroyed;
    if (phase === 'foe' && foe.combat.destroyed && exercised.killedAt === null) { exercised.killedAt = tick; exercised.turretIds = [...game._wreckTurrets.ids()]; }
    if (exercised.killedAt !== null && tick - exercised.killedAt >= 240) break;
  }
  exercised.zoneOwners = [...exercised.zoneOwners];
  return { divergence, exercised, shed: shed.id, foe: foe.id };
}
const MODE_NUDGE = 1200;
let marsNudged = null;
await section('control: Mars, the own heading a billionth off', async () => {
  marsNudged = await runModeBattle(MODE_NUDGE + 20, (tick, own) => { if (tick === MODE_NUDGE) own.state.yaw += 1e-9; });
  assert.deepEqual(marsNudged.divergence?.tick, MODE_NUDGE, `Mars: the own heading a billionth off on the page at ${MODE_NUDGE} is caught there (${JSON.stringify(marsNudged.divergence)})`);
  return `caught at tick ${marsNudged.divergence.tick} (${marsNudged.divergence.field ?? marsNudged.divergence.hull})`;
});

const MODE_TICKS = 6000;
// the run, then each of its coverage assertions on its own, so a red one lists every miss beside it; the two red on 268
// (the bot's death, its respawn: TESTS-OWED 2026-11-06) come last, so no other section runs behind them (round 6 V8)
let mars = null;
await section('Mars, byte-identical', async () => {
  mars = await runModeBattle(MODE_TICKS);
  assert.equal(mars.divergence, null, `Mars parts the two drivers at ${JSON.stringify(mars.divergence)}`);
  return `${MODE_TICKS} ticks`;
});
if (mars) {
  await section('Mars: the caches', () => {
    assert.ok(mars.exercised.cachesDropped >= 2 && mars.exercised.collectedAt !== null,
      `the seeded caches dropped alike (${mars.exercised.cachesDropped}) and the own hull took one at tick ${mars.exercised.collectedAt}`);
  });
  await section('Mars: the rammed buildings', () => {
    assert.ok(mars.exercised.collapses.length >= 2 && mars.exercised.collapses.includes(mars.shed), `two buildings came down alike (${mars.exercised.collapses})`);
  });
  await section('Mars: a zone', () => {
    assert.ok(mars.exercised.zoneOwners.length >= 1, `a zone was taken, alike (${mars.exercised.zoneOwners})`);
  });
  await section('Mars: the bot\'s death and its turret', () => {
    assert.ok(mars.exercised.killedAt !== null && mars.exercised.turretIds.includes(mars.foe),
      `the bot was destroyed (tick ${mars.exercised.killedAt}) and its turret flew as a body, alike`);
  });
  await section('Mars: the respawn', () => {
    assert.ok(mars.exercised.foeDeaths >= 2, `the bot respawned on its slot and fought again, alike (${mars.exercised.foeDeaths} deaths)`);
  });
}

if (failures.length) {
  console.error(`driverStepParity.selftest: ${failures.length} of ${failures.length + passed.length} sections failed (every section ran):`);
  for (const { name, error } of failures) console.error(`--- FAIL ${name}\n${error?.stack ?? error}`);
  throw failures[0].error;
}

const { denied } = same.exercised;
console.log(`driverStepParity.selftest: ${MAP} 1v1, ${TICKS} ticks, both hulls byte-identical on the local step (game/state.ts simStep) and the `
  + `authority's (sim/authoritativeMatch.ts), the page's controls through the authority's input stage (sim/playerInputStage.ts): `
  + `drive, turn, gun lay, a crash, shots, hits, knock, bloom and reload (hostile at ${(same.exercised.foeHp * 100).toFixed(1)} % hp, `
  + `own at ${(same.exercised.ownHp * 100).toFixed(1)} %), the hostile a bot on both drivers switching its ammunition without firing, `
  + `an ammunition switch and the emptied slot refused once at tick `
  + `${denied.page[0].tick}, its trigger held off on a ready gun at ${DENIED_FIRE_TICK}; given a fourth shell, its slot fired as the fourth at `
  + `${four.exercised.shots[1][0]} on both; a throttle a billionth off seeded at tick ${SEEDED} caught at tick `
  + `${nudged.divergence.tick} (${nudged.divergence.field}), the page's switch a tick late caught at tick ${late.divergence.tick} (${late.divergence.field}); `
  + `the real AI on both drivers ${REAL_AI_TICKS} ticks byte-identical (a ${AI_FOE_SPEC} bot drove ${real.exercised.movedM.toFixed(0)} m, sighted the own hull `
  + `at tick ${real.exercised.sightedAt}, fired ${real.exercised.pulls} times, met the own hull ${real.exercised.closestM.toFixed(1)} m apart, and ${destroyed} was destroyed; `
  + `its paint '${real.exercised.paint.page}' rolled alike, a handed paint caught at tick 0), `
  + `its heading a billionth off at tick ${BOT_NUDGE} caught at tick ${botNudged.divergence.tick} (${botNudged.divergence.field}); `
  + `Mars on both drivers byte-identical (hulls, mode state, destruction logs, turret bodies, every live round): ${mars.exercised.cachesDropped} caches `
  + `dropped and one taken at tick ${mars.exercised.collectedAt}, buildings ${mars.exercised.collapses.join(' and ')} rammed down, the ${MODE_FOE_SPEC} `
  + `killed ${mars.exercised.foeDeaths} times (respawned on its slot) and its turret flown from tick ${mars.exercised.killedAt}, zones ${mars.exercised.zoneOwners.join(', ')}; `
  + `the own heading a billionth off caught at tick ${marsNudged.divergence.tick} (${marsNudged.divergence.field ?? marsNudged.divergence.hull}); `
  + `spotting compared every tick of the scripted battle (${same.exercised.spottedTicks} hull-ticks spotted), a stagger seed one off caught at `
  + `tick ${reseeded.divergence.tick}`);
