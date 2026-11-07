// Round 5 S2 (2026-11-06; the 2026-11-02 audit's M6 ram rule after the 268 merge): a teammate ram deals nothing and
// shows no damage, on both drivers and on the page. The round-four merge kept round one's sim/impact.ts
// resolveRamPairDamage on both drivers, where 268 gated a teammate pair out before the ram (sim/ramModuleDamage.ts gone,
// merge decision 3): a teammate contact is reported again, with its jolt and zero damage. This receipt follows that
// report through the real paths and every listener on the page:
//   1. the solo step (game/state.ts simStep, a battle seated by setupBattle on Verdant): the player drives its M1A1 HC
//      into a parked allied bot through the authority's input stage (sim/playerInputStage.ts applyPlayerInput). Neither
//      hull loses hit points, a module's hit points or stage, a crew member, a fire or a reactive tile; the page's bus
//      carries the ram's report (tank:ram, zero damage) and the hull contact's thud (tank:impact, cause contact, zero
//      damage), and none of the events the page's damage presentation hangs off (DAMAGE_EVENTS: the hit marker and the
//      damage numbers on shell:hit, the kill feed, the kill notices and the records on tank:destroyed, the module and
//      crew calls on module:state, the fire on tank:fire);
//   2. the online driver as a room runs it: the match actor (server/match/matchActor.ts) on Verdant's terrain, the seat's
//      hull parked and a teammate bot driven into it by a scripted controller in the authority's bot slot (applyBotInput,
//      as driverStepParity scripts one); the seat's real MatchClient over a loopback pair, bound to the real battle
//      presentation as the page binds it (bindMatchPresentation): the authority's hulls untouched, the wire's tank_ram
//      priced at zero, and the page's bus carrying tank:ram (zero damage, on its own hull) and no damage event;
//   3. the listeners, followed on each page's recorded bus: tank:ram has one in src/ (audio/audioEngine.ts onTankRam)
//      and tank:impact two (audioEngine.ts onTankImpact, pad/padCues.ts). The real audio engine, bound to each page's bus
//      and fed its frames, plays the contact's crunch and the cab's knock and asks for the crew's friendly_ram line, never
//      'rammed' and no damage sound (the shell, module, crew, fire and destruction cues). The paired phone's cue rule
//      (padCueOf, run on every recorded PAD_CUE_EVENTS event for the page's own hull, as pad/padReceiver.ts runs it)
//      buzzes no 'hurt', 'glance', 'module', 'burning', 'dead' or 'kill' for it;
//   4. the negative control: the same contact against a hostile on each driver is priced (hit points lost) and the crew
//      calls 'rammed', so the receipt's checks see a ram's damage when there is one.
// Passes on f60d0aa200 too: no listener shows a teammate ram as damage there (the session's direction: gate a listener
// only if one does). The checks bite: pricing teammates (impact.ts resolveRamPairDamage's team gate dropped) fails case 1
// at 'the report prices nothing', and the crew calling a teammate's shove 'rammed' (audioEngine.ts onTankRam's team check
// dropped) fails it at the friendly_ram line.
// MANUAL tier (test:heavy -- sims; round 5 S2, 2026-11-06): the battle on Verdant and the room cost about 10 s of user
// CPU, past the default tier's few seconds. Its default-tier half, src/sim/teammateRamListeners.selftest.mjs, holds the
// listener census (a new listener of either event fails there) and the phone's cue for a contact; the sim halves are
// ramModuleLaw.selftest's. Run: node src/sim/teammateRam.selftest.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// the page's saved loadouts: none
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
// the audio engine's assets from disk, "decoded" as 1.5 s fake buffers (as audioEngine.selftest serves them)
const publicRoot = new URL('../../public/', import.meta.url);
globalThis.fetch = async (url) => {
  try {
    const bytes = await readFile(new URL(String(url).replace(/^\//, ''), publicRoot));
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  } catch {
    return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
  }
};
globalThis.window = {};

const { Group, Vector3 } = await import('three');
const { createFakeContext, fakeBuffer } = await import('../audio/fakeAudioContext.test-support.mjs');
const { createAudio } = await import('../audio/audioEngine.ts');
const { VOICE_LINES } = await import('../audio/voiceLines.ts');
const { PAD_CUE_EVENTS, padCueOf } = await import('../pad/padCues.ts');
const { ensureAuthorityFleet } = await import('../vehicles/authorityFleet.ts');
const { encodeAimIntent } = await import('./aimIntent.ts');
const { applyPlayerInput } = await import('./playerInputStage.ts');
const { resetTankVerticalState } = await import('./movement.ts');
const { createBus, createCollider, createGameState, setupBattle, simStep } = await import('../game/state.ts');
const { spawnTanks } = await import('../game/rosterState.ts');
const { createDedicatedWorldCollision } = await import('../../server/dedicatedWorldCollision.ts');
const { createMatchActor } = await import('../../server/match/matchActor.ts');
const { MESSAGE_TYPE, decodeMessage } = await import('../mp/wire/index.ts');
const { createBattlePresentation } = await import('../mp/presentation/index.ts');
const { bindMatchPresentation } = await import('../mp/presentation/adapter.ts');
const { MatchClient } = await import('../mp/match/matchClient.ts');
const { createLoopbackPair } = await import('../mp/transport/loopbackTransport.ts');

const MAP = 'verdant';
const HULL = 'm1a1_abrams_hc', ALLY = 'leo2a4', FOE = 't90am';
await ensureAuthorityFleet([HULL, ALLY, FOE]);

/** The bus events the page's damage presentation listens to (hud.ts, shotInfo.ts, serviceRecord.ts, profile.ts, killcam.ts,
 *  audioEngine.ts, padCues.ts, main.ts): a teammate ram must raise none of them. */
const DAMAGE_EVENTS = ['shell:hit', 'tank:destroyed', 'module:state', 'tank:fire'];
/** What a hull keeps through a contact that deals nothing. */
const combatOf = (entity) => {
  const c = entity.combat;
  return JSON.stringify({
    hp: c.hp, maxHp: c.maxHp, destroyed: c.destroyed, crew: c.crew, fire: c.fire ? { burning: c.fire.burning, ticksLeft: c.fire.ticksLeft } : null,
    era: [...(c.eraSpent ?? [])].sort(),
    modules: Object.fromEntries(Object.entries(c.modules ?? {}).sort(([a], [b]) => a.localeCompare(b))
      .map(([name, m]) => [name, [m.hp, m.maxHp, m.state, m.repairT ?? 0]])),
  });
};
const idsOf = (payload) => ['id', 'aId', 'bId', 'targetId', 'attackerId', 'killerId', 'shooterId']
  .map((key) => payload?.[key]).filter((value) => typeof value === 'string');

// ---- the page's audio: the real engine on a fake context, bound to a page's bus ---------------------------------------
async function pageAudio(bus, ownId, roster) {
  const ctx = createFakeContext({ decode: () => fakeBuffer(1.5) });
  const terrain = { getHeightAt: () => 0, getGroundType: () => 'medium', getTrackSurfaceAt: () => 0, getWaterDepthAt: () => 0 };
  const audio = createAudio({ context: ctx, getMapId: () => MAP, getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop' });
  audio.bindBus(bus);
  audio.resume();
  const probe = globalThis.window.__COT_AUDIO;
  bus.emit('phase:change', { phase: 'battle' });
  await audio.warmBattleEvents(roster);
  await probe.libraryIdle();
  const listener = { pos: { x: 0, y: 2, z: 0 }, forward: { x: 0, y: 0, z: 1 }, kind: 'player-tank', ownerId: ownId, scoped: false };
  return {
    probe,
    frame(tanks, dt = 1 / 60) {
      const own = tanks.find((tank) => tank.id === ownId);
      if (own?.state?.pos) { listener.pos.x = own.state.pos.x; listener.pos.y = own.state.pos.y + 2; listener.pos.z = own.state.pos.z; }
      ctx.advance(dt);
      audio.update(dt, listener, tanks, []);
    },
    mark: () => ({ sfx: probe.sfxLog.at(-1)?.seq ?? 0, t: +ctx.currentTime.toFixed(3), sound: probe.soundLog.at(-1)?.seq ?? 0 }),
    since(mark) {
      return {
        sfx: probe.sfxLog.filter((entry) => entry.seq > mark.sfx).map((entry) => entry.n),
        say: probe.sayLog.filter((entry) => entry.t >= mark.t).map((entry) => entry.id),
        sound: probe.soundLog.filter((entry) => entry.seq > mark.sound),
      };
    },
  };
}
/** What a battle says of a hull with or without a contact (the spotting, a bush under a track): no damage in any of them. */
const ROUTINE_EVENTS = new Set(['tank:spotted', 'player:spotted', 'prop:crushed']);
/** The crew's damage and under-attack calls (voiceLines.ts groups 'damage' and 'incoming', and the team's hit and loss
 *  calls): a teammate ram asks for none of them. */
const DAMAGE_LINES = new Set([...Object.entries(VOICE_LINES).filter(([, meta]) => meta.group === 'damage' || meta.group === 'incoming')
  .map(([id]) => id), 'friendly_fire', 'hit_by_friendly', 'ally_destroyed']);
/** The cues a hull contact may sound (onTankRam: the crunch or dead steel, the cab's knock; onTankImpact: the thud). */
const CONTACT_SFX = new Set(['ram_light', 'ram_heavy', 'hit_metal', 'nonpen_interior']);
/** The cues the engine plays for damage (a round's hit or penetration, a module or crew loss, a fire, a destruction). */
const DAMAGE_SFX = /hit|pen|ricochet|break|module|crew|fire|burn|explo|cookoff|kill|destroy|alarm|heartbeat/;
/** The paired phone's damage buzzes (pad/padCues.ts): a teammate ram makes none of them. */
const DAMAGE_PAD_CUES = new Set(['hurt', 'glance', 'module', 'burning', 'dead', 'kill', 'hit', 'deflect']);
/** What the paired phone of `ownId` feels from a recorded bus: padCueOf on every cue event, as padReceiver.ts runs it. */
const padCuesOf = (events, ownId) => events.filter((event) => PAD_CUE_EVENTS.includes(event.type))
  .map((event) => padCueOf(event.type, event.payload, { id: ownId, player: true })?.c).filter(Boolean);

// ---- 1. the solo step ----------------------------------------------------------------------------------------------
const world = createDedicatedWorldCollision(MAP);
{
  const authored = world.heightField._layout.spawns;
  const spawnOf = (point) => ({ pos: [point.x, world.heightField.getHeightAt(point.x, point.z), point.z], yaw: point.yaw ?? 0 });
  world.spawnPoints = { player: spawnOf(authored.player), enemies: authored.enemies.map(spawnOf) };
}
async function soloRam(struckTeam) {
  const game = createGameState({ rosterSeed: 3 });
  game.mapId = MAP;
  spawnTanks(game, { scene: { remove() {} } });
  for (const entity of game.allTanks) entity.visual = { root: new Group(), setVisible() {}, syncFromState() {}, dispose() {}, resetDestroyed() {},
    setDestroyed() {}, recoilKick() {}, gunMuzzleWorld: (out) => out.copy(entity.state.pos), gunDirWorld: (out) => out.set(0, 0, 1) };
  const previousDebug = globalThis.__DEBUG;
  globalThis.__DEBUG = { flags: { forceRoster: [ALLY, FOE], rosterExact: true, forceAllies: [ALLY] } };
  try {
    setupBattle(game, HULL, world, { gameMode: 'standard', random: true, brain: null, deferVisuals: true, deferCamoRepaint: true,
      deferOpeningRoutes: true, seed: 7 });
  } finally {
    globalThis.__DEBUG = previousDebug;
  }
  const own = game.tanks.find((entity) => entity.isPlayer);
  const struck = game.tanks.find((entity) => entity.specId === ALLY);
  const far = game.tanks.find((entity) => entity.specId === FOE);
  assert.ok(own && struck && far && struck.team === 'player' && far.team === 'enemy', `the seats: ${game.tanks.map((entity) => `${entity.specId}:${entity.team}`)}`);
  // the struck hull and the far foe hold still (no controller); the struck one sits 14 m ahead of the player, side-on
  for (const entity of [struck, far]) { entity.aiCtl = null; entity.ai = null; Object.assign(entity.input, { throttle: 0, steer: 0, brake: true, fire: false }); }
  if (struckTeam === 'enemy') struck.team = 'enemy';
  const fx = Math.sin(own.state.yaw), fz = Math.cos(own.state.yaw);
  const place = (entity, x, z, yaw) => {
    entity.state.pos.set(x, world.heightField.getHeightAt(x, z), z);
    entity.state.yaw = yaw;
    entity.state.speed = 0;
    resetTankVerticalState(entity.state, world.heightField.getHeightAt(x, z) + 0.05, 0, true);
    if (entity.state._sup) entity.state._sup.x = NaN;
  };
  place(struck, own.state.pos.x + fx * 14, own.state.pos.z + fz * 14, own.state.yaw + Math.PI / 2);
  place(far, own.state.pos.x - fx * 320, own.state.pos.z - fz * 320, own.state.yaw);
  const events = [];
  let tick = 0;
  const bus = createBus((type, payload) => events.push({ tick, type, payload }));
  const audio = await pageAudio(bus, own.id, [HULL, ALLY, FOE]);
  const before = { own: combatOf(own), struck: combatOf(struck) };
  const traumas = [];
  const rig = { addTrauma: (amount) => traumas.push(amount) };
  const collider = createCollider(game, world);
  for (let i = 0; i < 20; i++) { simStep(game, bus, world, rig, collider); audio.frame(game.tanks); }
  const mark = audio.mark();
  const from = events.length;
  let ramAt = null;
  for (tick = 0; tick < 600 && (ramAt === null || tick < ramAt + 90); tick++) {
    applyPlayerInput(own, { throttle: 1, steer: 0, brake: false, fire: false, shellSlot: 0, actionBits: 0, aimLocked: false,
      ...encodeAimIntent(own.state.pos, { x: own.state.pos.x + fx * 300, y: own.state.pos.y + 2, z: own.state.pos.z + fz * 300 }) },
    (type, payload) => bus.emit(type, payload));
    simStep(game, bus, world, rig, collider);
    audio.frame(game.tanks);
    if (ramAt === null && events.some((event) => event.type === 'tank:ram')) ramAt = tick;
  }
  return { own, struck, events: events.slice(from), ramAt, before, after: { own: combatOf(own), struck: combatOf(struck) }, heard: audio.since(mark), traumas };
}

{
  const mate = await soloRam('player');
  assert.ok(mate.ramAt !== null, 'the solo step: the player meets its parked teammate');
  const rams = mate.events.filter((event) => event.type === 'tank:ram').map((event) => event.payload);
  assert.ok(rams.every((ram) => ram.aId === mate.own.id && ram.bId === mate.struck.id && ram.aIsPlayer === true),
    `the solo step: every report is the player on its teammate (${JSON.stringify(rams.map((ram) => [ram.aId, ram.bId]))})`);
  assert.ok(rams.every((ram) => ram.dmgA === 0 && ram.dmgB === 0 && ram.aModulesHit.length === 0 && ram.bModulesHit.length === 0),
    `the solo step: the report prices nothing (${JSON.stringify(rams.map((ram) => [ram.dmgA, ram.dmgB, ram.closingMps]))})`);
  assert.ok(rams[0].closingMps > 2, `a real ram, not a brush (${rams[0].closingMps.toFixed(2)} m/s closing)`);
  assert.equal(mate.after.own, mate.before.own, 'the solo step: the rammer keeps its hit points, modules, crew, fire state and tiles');
  assert.equal(mate.after.struck, mate.before.struck, 'the solo step: the teammate keeps its hit points, modules, crew, fire state and tiles');
  const damage = mate.events.filter((event) => DAMAGE_EVENTS.includes(event.type));
  assert.deepEqual(damage.map((event) => event.type), [], 'the solo page\'s bus carries no damage event');
  const pair = new Set([mate.own.id, mate.struck.id]);
  const aboutPair = [...new Set(mate.events.filter((event) => idsOf(event.payload).some((id) => pair.has(id))).map((event) => event.type))].sort();
  assert.ok(aboutPair.every((type) => type === 'tank:ram' || type === 'tank:impact' || ROUTINE_EVENTS.has(type)),
    `the solo page hears the pair only as the ram's report, the contact's thud and the battle's routine (${aboutPair})`);
  for (const event of mate.events.filter((entry) => entry.type === 'tank:impact' && pair.has(entry.payload.id))) {
    assert.ok(event.payload.cause === 'contact' && event.payload.damage === 0, `a hull contact's thud deals nothing (${JSON.stringify(event.payload)})`);
  }
  console.log(`teammateRam: solo, the ram at tick ${mate.ramAt} (${rams.length} report(s), ${rams[0].closingMps.toFixed(2)} m/s), `
    + `sfx ${[...new Set(mate.heard.sfx)]}, crew ${mate.heard.say}, sounds ${[...new Set(mate.heard.sound.map((entry) => entry.type))]}`);
  assert.ok(mate.heard.sfx.some((id) => id === 'ram_light' || id === 'ram_heavy'), `the crunch plays (${mate.heard.sfx})`);
  assert.ok(mate.heard.sfx.every((id) => CONTACT_SFX.has(id) || !DAMAGE_SFX.test(id)), `the solo page sounds the contact, no damage cue (${mate.heard.sfx})`);
  assert.ok(mate.heard.say.includes('friendly_ram'), `the crew's friendly_ram line is asked for (${mate.heard.say})`);
  assert.deepEqual(mate.heard.say.filter((id) => DAMAGE_LINES.has(id)), [], 'the crew calls no damage, no ram by a foe, no friendly fire');
  assert.ok(mate.traumas.some((amount) => amount > 0), 'the cab still feels the shove (the camera jolt)');
  const soloPad = padCuesOf(mate.events, mate.own.id);
  assert.ok(soloPad.includes('impact'), `the solo page's phone feels the contact (${soloPad})`);
  assert.deepEqual(soloPad.filter((cue) => DAMAGE_PAD_CUES.has(cue)), [], `the solo page's phone buzzes no damage (${soloPad})`);
  console.log(`teammateRam: solo, the phone's cues ${[...new Set(soloPad)]} (${soloPad.length})`);

  // the negative control: the same contact against a hostile is priced and called
  const foe = await soloRam('enemy');
  const foeRams = foe.events.filter((event) => event.type === 'tank:ram').map((event) => event.payload);
  assert.ok(foeRams.some((ram) => ram.dmgA > 0 || ram.dmgB > 0), `control: a hostile ram is priced (${JSON.stringify(foeRams.map((ram) => [ram.dmgA, ram.dmgB]))})`);
  assert.notEqual(foe.after.struck, foe.before.struck, 'control: the struck hostile loses hit points');
  assert.ok(foe.heard.say.includes('rammed'), `control: the crew calls a hostile's ram (${foe.heard.say})`);
  console.log(`teammateRam: solo control, a hostile ram priced ${JSON.stringify(foeRams.map((ram) => [Math.round(ram.dmgA), Math.round(ram.dmgB)]))}, crew ${foe.heard.say}`);
}
world.release?.();

// ---- 2. the online driver as a room runs it, its events on the wire, the page's battle presentation -----------------
const newGame = () => ({ tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, allTanks: [], timeS: 0, preBattleS: 0, result: null, resultReason: null, mapId: MAP });
/** A bot slot's controller that drives straight at `target` (applyBotInput stages it, as driverStepParity scripts one). */
const driveAt = (entity, target) => ({
  update() {
    const dx = target.state.pos.x - entity.state.pos.x, dz = target.state.pos.z - entity.state.pos.z;
    let error = Math.atan2(dx, dz) - entity.state.yaw;
    error = Math.atan2(Math.sin(error), Math.cos(error));
    Object.assign(entity.input, { throttle: 1, steer: Math.max(-1, Math.min(1, error * 2)), brake: false, fire: false, shellSlot: 0, actionBits: 0 });
    entity.input.aimPoint?.set(target.state.pos.x, target.state.pos.y + 1.5, target.state.pos.z);
  },
  setWaypoints() {}, notifyShellResult() {}, notifyUnderFire() {}, notifyEnemyFired() {}, notifyFriendlyBlocked() {}, resume() {},
});
async function onlineRam(mateTeam) {
  let nowMs = 10_000;
  const now = () => nowMs;
  const roomId = `teammate-ram-${mateTeam}`;
  const actor = createMatchActor({
    roomId, mapId: MAP, seed: 7, countdownS: 0, world: 'terrain', now, schedule: () => () => {},
    seats: [{ seat: 0, playerId: 'me', name: 'Me', team: 'alpha', specId: HULL }],
    bots: [{ playerId: 'mate', name: 'Mate', team: mateTeam, specId: ALLY, difficulty: 'easy' },
      { playerId: 'foe', name: 'Foe', team: 'bravo', specId: FOE, difficulty: 'easy' }],
  });
  // the seat's MatchClient over the loopback pair, its server end the actor's link (the HELLO attaches the seat)
  const pair = createLoopbackPair({ clock: now, connectDelayMs: 0 });
  pair.server.open();
  let messageListener = null, closeListener = null, attached = false;
  const link = {
    label: 'me',
    get bufferedAmount() { return pair.server.bufferedBytes; },
    get closed() { return pair.server.state === 'closed'; },
    send(bytes) { if (!pair.server.send(bytes)) throw new Error('loopback refused'); pair.pump(now()); },
    close(_reason, detail = '') { pair.server.close('server', detail); },
    onMessage(listener) { messageListener = listener; },
    onClose(listener) { closeListener = listener; },
  };
  pair.server.onFrame((bytes) => {
    if (attached) { messageListener?.(bytes); return; }
    const decoded = decodeMessage(bytes);
    assert.ok(decoded.ok && decoded.message.type === MESSAGE_TYPE.HELLO, 'the seat says hello first');
    attached = actor.attach(link, decoded.message, { v: 1, roomId, seat: 0, playerId: 'me', name: 'Me', team: 'alpha', specId: HULL, iat: 0, exp: 1 });
  });
  pair.server.onState((change) => { if (change.state === 'closed') closeListener?.(); });
  const client = new MatchClient({ transport: pair.client, token: 'issued-elsewhere', clock: now, clientBuild: 'teammateRam.selftest', prediction: null,
    controls: () => ({ throttle: 0, steer: 0, brake: true, fire: false, aimLocked: true, aimYaw: 0, aimPitch: 0, aimDistance: 300, shellSlot: 0, actionPresses: 0 }) });
  // the page's battle presentation on its bus, bound as the page binds it (the stubs are its drawing; every rule it applies is its own)
  const events = [];
  let tick = 0;
  const bus = createBus((type, payload) => events.push({ tick, type, payload }));
  const pageGame = newGame();
  const presentation = createBattlePresentation({
    engineCtx: { scene: { add() {} }, anisotropy: 1 }, game: pageGame, bus,
    worldCollision: { heightField: { getHeightAt: () => 0, getHeightAtFast: () => 0, getContactHeightAt: () => 0, getNormalAt: () => null, getGroundType: () => 'hard', maxY: 1 },
      getObstacles: () => [], getColliders: () => [], crushObstacle() {}, resetDestructibles() {} },
    createTankVisual: () => ({ root: { position: new Vector3(), userData: {} }, setVisible() {}, syncFromState() {}, recoilKick() { return null; },
      gunMuzzleWorld(out) { return out.set(0, 2, 0); }, gunDirWorld(out) { return out.set(0, 0, 1); }, stripEra() {}, resetEra() {},
      setDestroyed() {}, resetDestroyed() {}, dispose() {} }),
    prepareVisualTextures: async () => {}, clearVehicleDecals: () => {}, camoFor: () => 'summer', clock: now,
  });
  // what reaches the presentation from the wire, recorded on the way through
  const wire = [];
  const unbind = bindMatchPresentation(client, {
    applyRoster: (roster, context) => presentation.applyRoster(roster, context),
    applyFrame: (frame) => presentation.applyFrame(frame),
    applyEvent: (event, context) => { wire.push(event); presentation.applyEvent(event, context); },
    applyVerdict: (verdict, reason) => presentation.applyVerdict(verdict, reason),
    setVisibility: (entityId, visible) => presentation.setVisibility(entityId, visible),
    dispose: () => presentation.dispose(),
  });
  client.connect();
  const frameMs = 1000 / 60;
  const step = async () => {
    nowMs += frameMs;
    actor.advance(nowMs);
    pair.pump(nowMs);
    client.update(nowMs, frameMs / 1000);
    pair.pump(nowMs);
    await new Promise((resolve) => setImmediate(resolve));
  };
  const match = actor.authority;
  const me = match.entityById.get('me'), mate = match.entityById.get('mate'), foe = match.entityById.get('foe');
  // (a teammate is drawn from the start, a hostile once it is spotted)
  const drawn = () => pageGame.tanks.some((tank) => tank.id === 'me') && (mateTeam !== 'alpha' || pageGame.tanks.some((tank) => tank.id === 'mate'));
  for (let guard = 0; guard < 900 && !(client.welcome && mate.aiCtl && foe.aiCtl && drawn()); guard++) await step();
  assert.ok(client.welcome && mate.aiCtl && drawn(), `the room started, welcomed the seat and drew its hulls (${pageGame.tanks.map((tank) => tank.id)})`);
  const audio = await pageAudio(bus, 'me', [HULL, ALLY, FOE]);
  // the seat parked where it deployed; its teammate 18 m behind it, driven into it; the foe far off and still
  mate.aiCtl = driveAt(mate, me);
  foe.aiCtl = null;
  Object.assign(foe.input, { throttle: 0, steer: 0, brake: true, fire: false });
  const fx = Math.sin(me.state.yaw), fz = Math.cos(me.state.yaw);
  const place = (entity, x, z, yaw) => {
    entity.state.pos.set(x, match.heightField.getHeightAt(x, z), z);
    entity.state.yaw = yaw;
    entity.state.speed = 0;
    resetTankVerticalState(entity.state, match.heightField.getHeightAt(x, z) + 0.05, 0, true);
    if (entity.state._sup) entity.state._sup.x = NaN;
  };
  place(mate, me.state.pos.x - fx * 18, me.state.pos.z - fz * 18, me.state.yaw);
  place(foe, me.state.pos.x + fx * 320, me.state.pos.z + fz * 320, me.state.yaw + Math.PI);
  for (let i = 0; i < 6; i++) { await step(); audio.frame(pageGame.tanks); }
  const before = { me: combatOf(me), mate: combatOf(mate) };
  const from = events.length;
  wire.length = 0;
  const mark = audio.mark();
  let ramAt = null;
  for (tick = 0; tick < 900 && (ramAt === null || tick < ramAt + 90); tick++) {
    await step();
    // the page's hulls, as main.ts hands them to the audio engine every frame (listenerPoseRuntime.ts)
    audio.frame(pageGame.tanks);
    if (ramAt === null && events.some((event, index) => index >= from && event.type === 'tank:ram')) ramAt = tick;
  }
  const teams = pageGame.tanks.map((tank) => `${tank.id}:${tank.team}`);
  unbind();
  client.dispose();
  actor.stop();
  return { events: events.slice(from), wire, ramAt, before, after: { me: combatOf(me), mate: combatOf(mate) }, heard: audio.since(mark), teams };
}

{
  const room = await onlineRam('alpha');
  assert.ok(room.ramAt !== null, `online: the teammate meets the parked seat (page tanks ${room.teams})`);
  const sent = room.wire.filter((event) => event.kind === 'tank_ram').map((event) => event.payload);
  assert.ok(sent.length > 0 && sent.every((ram) => ram.aId === 'mate' && ram.bId === 'me' && ram.damageA === 0 && ram.damageB === 0),
    `online: the wire carries the teammate ram with zero damage (${JSON.stringify(sent.map((ram) => [ram.aId, ram.bId, ram.damageA, ram.damageB]))})`);
  assert.deepEqual(room.wire.filter((event) => ['module_state', 'tank_destroyed', 'shell_hit', 'tank_fire'].includes(event.kind)
    && ['me', 'mate'].some((id) => idsOf(event.payload).includes(id))).map((event) => event.kind), [], 'online: no damage event names the pair on the wire');
  assert.equal(room.after.me, room.before.me, 'online: the seat keeps its hit points, modules, crew, fire state and tiles');
  assert.equal(room.after.mate, room.before.mate, 'online: the teammate keeps its hit points, modules, crew, fire state and tiles');
  const rams = room.events.filter((event) => event.type === 'tank:ram').map((event) => event.payload);
  assert.ok(rams.every((ram) => ram.aId === 'mate' && ram.bId === 'me' && ram.bIsPlayer === true && ram.dmgA === 0 && ram.dmgB === 0),
    `online: the page's bus reports the ram on its own hull with zero damage (${JSON.stringify(rams)})`);
  assert.deepEqual(room.events.filter((event) => DAMAGE_EVENTS.includes(event.type)).map((event) => event.type), [], 'the online page\'s bus carries no damage event');
  const aboutPair = [...new Set(room.events.filter((event) => idsOf(event.payload).some((id) => id === 'me' || id === 'mate')).map((event) => event.type))].sort();
  assert.ok(aboutPair.every((type) => type === 'tank:ram' || type === 'tank:impact' || ROUTINE_EVENTS.has(type)),
    `the online page hears the pair only as the ram's report and the battle's routine (${aboutPair})`);
  console.log(`teammateRam: online, the ram at frame ${room.ramAt} (${sent.length} on the wire, ${rams[0]?.closingMps?.toFixed(2)} m/s), page tanks ${room.teams}, `
    + `sfx ${[...new Set(room.heard.sfx)]}, crew ${room.heard.say}, sounds ${[...new Set(room.heard.sound.map((entry) => entry.type))]}`);
  assert.ok(room.heard.sfx.some((id) => id === 'ram_light' || id === 'ram_heavy'), `online: the crunch plays (${room.heard.sfx})`);
  assert.ok(room.heard.sfx.every((id) => CONTACT_SFX.has(id) || !DAMAGE_SFX.test(id)), `online: the page sounds the contact, no damage cue (${room.heard.sfx})`);
  assert.ok(room.heard.say.includes('friendly_ram'), `online: the crew's friendly_ram line is asked for (${room.heard.say})`);
  assert.deepEqual(room.heard.say.filter((id) => DAMAGE_LINES.has(id)), [], 'online: the crew calls no damage, no ram by a foe, no friendly fire');
  const onlinePad = padCuesOf(room.events, 'me');
  assert.deepEqual(onlinePad.filter((cue) => DAMAGE_PAD_CUES.has(cue)), [], `online: the page's phone buzzes no damage (${onlinePad})`);
  console.log(`teammateRam: online, the phone's cues ${[...new Set(onlinePad)]} (${onlinePad.length})`);

  const hostile = await onlineRam('bravo');
  const priced = hostile.wire.filter((event) => event.kind === 'tank_ram').map((event) => event.payload);
  assert.ok(priced.some((ram) => ram.damageA > 0 || ram.damageB > 0), `online control: a hostile's ram is priced (${JSON.stringify(priced.map((ram) => [ram.damageA, ram.damageB]))})`);
  assert.notEqual(hostile.after.me, hostile.before.me, 'online control: the seat loses hit points');
  assert.ok(hostile.heard.say.includes('rammed'), `online control: the crew calls a hostile's ram (${hostile.heard.say})`);
  console.log(`teammateRam: online control, a hostile ram priced ${JSON.stringify(priced.map((ram) => [Math.round(ram.damageA), Math.round(ram.damageB)]))}, crew ${hostile.heard.say}`);
}

console.log('teammateRam.selftest: a teammate ram deals nothing to either hull (hit points, modules, crew, fire, tiles) on the solo step and '
  + 'on the room\'s authority; its report (tank:ram, zero damage) reaches the page\'s bus on both, with no damage event; the audio '
  + 'plays the contact and the friendly_ram call, no damage cue, and the paired phone buzzes no damage on either page (the solo '
  + 'contact\'s impact only); a hostile\'s ram is priced and called on both');
