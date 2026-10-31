// A building the own ram brings down yields to the drawn hull as it yields to the authority's (item/ram-yield-prediction-264,
// 2026-10-29). The authority lets a hull that rams a house down drive on through it while it falls (structureDamage.ts
// yieldTo: collapsePending for its 2-3 s cascade), but the client's prediction held every structure until its records were
// crushed at the final 'collapsed' event, so each
// reconciliation shoved the drawn hull out of the house's box and hard-snapped it back (the owner on the 263+264 preview:
// "it would just slingshot me away", a solo battle then played through the match client; 262 alike: up to 9.4 m, 7 hard
// snaps). A solo battle is a local battle again (one core, two drivers): the prediction is the online driver's, and a room
// keeps this coverage. Here:
//   1. StructureDamage.wouldYield answers as yieldTo decides, pricing nothing;
//   2. the destruction mirror prices a ram on the map's house walls, as the authority builds them, and marks a structure
//      the authority took to nothing (a live stage event at integrity 0) as going down;
//   3. the prediction world lets the hull through a structure that yields, on the authority's closing speed, and holds
//      at one that does not; the battle presentation wires it to the mirror;
//   4. in process, a room's match actor and a seat's match client over the loopback pair (the real wire, client, mirror
//      and prediction world) on Verdant's house #2: the T-84U Oplot rams it down, and the drawn hull follows the
//      authority's through the fall.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';
import { getSpec } from '../../vehicles/specs.ts';
import { createDedicatedWorldCollision } from '../../../server/dedicatedWorldCollision.ts';
import { createStructureDamage } from '../../sim/structureDamage.ts';
import { architectureStyleOf, wallMaterialForStyle } from '../../sim/structureMaterial.ts';
import { createTankState, resetTankVerticalState } from '../../sim/movement.ts';
import { matchRulesetFor } from '../../sim/matchRuleset.ts';
import { tankContactRect } from '../../sim/tankContactShape.ts';
import { getMapConfig } from '../../world/maps/index.ts';
import { createDestructionMirror } from './destructionMirror.ts';
import { createPredictionWorld } from './predictionWorld.ts';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { hostRulesetFor } from '../host/hostRuleset.ts';
import { MatchClient } from '../match/matchClient.ts';
import { createLoopbackPair } from '../transport/loopbackTransport.ts';
import { MESSAGE_TYPE, decodeMessage } from '../wire/index.ts';
import { bindMatchPresentation } from './adapter.ts';

const watchdog = setTimeout(() => { console.error('predictionStructureYield.selftest: stuck'); process.exit(1); }, 240_000);
watchdog.unref();
await ensureAuthorityFleet();
const MAP = 'verdant';
const HOUSE = 2;                                    // Verdant's house #2, 11.4 × 15.8 m at (3.4, 1.1)
const spec = getSpec('t84bm_oplot_m');
const mass = spec.weightTons;
const config = getMapConfig(MAP);
const wallMaterial = wallMaterialForStyle(architectureStyleOf(config));
/** A battlefield's records as the page builds them: its own copy, its config with it. */
function pageWorld() {
  const world = createDedicatedWorldCollision(MAP);
  world.config = config;
  return world;
}

// ---- 1. wouldYield is yieldTo's decision, with nothing priced -------------------------------------------------------
{
  const world = createDedicatedWorldCollision(MAP);
  const damage = createStructureDamage(world.getObstacles(), world.getColliders(), { wallMaterial });
  const house = damage.byId(HOUSE);
  assert.ok(house?.collapsible, 'house #2 can come down');
  const hp = house.hp;
  assert.equal(damage.wouldYield(house, mass, 1), false, 'a 1 m/s nudge does not bring it down');
  assert.equal(damage.wouldYield(house, mass, 12), true, 'a 12 m/s ram does');
  assert.ok(house.hp === hp && house.stage === 0 && !house.collapsePending, 'asking prices nothing');
  assert.equal(damage.yieldTo(house, mass, 1, 1, { cause: 'ram', munition: null, x: 0, y: 0, z: 0, dirX: 0, dirZ: 1 }), null,
    'yieldTo holds where wouldYield said it holds');
  assert.notEqual(damage.yieldTo(house, mass, 12, 12, { cause: 'ram', munition: null, x: 0, y: 0, z: 0, dirX: 0, dirZ: 1 }), null,
    'and yields where it said it yields');
  assert.ok(house.collapsePending, 'the ram took it to nothing: its collapse is on its way');
  assert.equal(damage.wouldYield(house, mass, 0), true, 'a structure going down yields at any speed');
}

// ---- 2. the mirror: the map's walls, and a structure the authority took to nothing ----------------------------------
{
  const world = pageWorld();
  const mirror = createDestructionMirror(world, null);
  const house = mirror.structures.byId(HOUSE);
  const authority = createStructureDamage(createDedicatedWorldCollision(MAP).getObstacles(), [], { wallMaterial });
  // object3d-assert-ok: a structure's wall material is a StructureMaterial string ('masonry', 'adobe', 'concrete')
  assert.equal(house.material, authority.byId(HOUSE).material, `the page prices the house as the authority does (${house.material})`);
  const adobe = { ...config, props: { ...config.props, architecture: 'wadirum' } };
  const earthWorld = createDedicatedWorldCollision(MAP);
  earthWorld.config = adobe;
  // object3d-assert-ok: a structure's wall material is a StructureMaterial string ('masonry', 'adobe', 'concrete')
  assert.equal(createDestructionMirror(earthWorld, null).structures.byId(HOUSE).material, wallMaterialForStyle('wadirum'),
    'an earth-walled map\'s houses are adobe on the page too');
  const record = world.getObstacles().find((r) => r.structureIdx === HOUSE);
  assert.equal(mirror.yieldsToRam(record, mass, 1), false, 'a nudge: it holds');
  assert.equal(mirror.yieldsToRam(record, mass, 12), true, 'a ram at speed: it yields, as the authority will');
  const identity = { structureId: HOUSE, massClass: house.massClass, cx: house.cx, cz: house.cz, cause: 'ram' };
  mirror.applyStageEvent({ ...identity, stage: 'damaged', previous: 'intact', integrity: 0.4 });
  assert.ok(!house.collapsePending && mirror.yieldsToRam(record, mass, 1) === false, 'damaged, still standing: a nudge is held');
  mirror.applyStageEvent({ ...identity, stage: 'breached', previous: 'damaged', integrity: 0 });
  assert.ok(house.collapsePending, 'a stage at integrity 0: the authority\'s collapse is on its way');
  assert.equal(mirror.yieldsToRam(record, mass, 0), true, 'and the hull drives through it as the authority\'s does');
  assert.ok(!record.crushed, 'its records stand until the collapse lands');
  mirror.applyStageEvent({ ...identity, stage: 'collapsed', previous: 'breached', integrity: 0 });
  assert.ok(record.crushed && !house.collapsePending && house.stage === 3, 'the collapse lands: the records are down');
}

// ---- 3. the prediction world asks the mirror on the authority's closing speed ---------------------------------------
{
  const world = pageWorld();
  const records = world.getObstacles().filter((r) => r.structureIdx === HOUSE);
  const minX = Math.min(...records.map((r) => r.min[0]));
  const cz = (Math.min(...records.map((r) => r.min[2])) + Math.max(...records.map((r) => r.max[2]))) / 2;
  const rect = tankContactRect(spec);
  const state = createTankState(spec, new Vector3(0, 0, cz), Math.PI / 2);
  const seat = (x) => {
    state.pos.x = x;
    resetTankVerticalState(state, world.heightField.getHeightAt(x, cz), 0, true);
    state.speed = 12;
  };
  const asked = [];
  const predict = (answer) => createPredictionWorld({ worldCollision: world, ownSpec: spec, ownState: () => state, others: () => [], mode: 'standard',
    ...(answer === undefined ? {} : { structureYields: (record, massTons, closingMps) => { asked.push({ record, massTons, closingMps }); return answer; } }) });
  const push = new Vector3();
  // driving east, its nose stepped from the house's box edge to where its turned west wall first meets it, then 0.2 m in
  const held = predict(undefined);
  let x = minX - rect.halfLength - rect.centerZ;
  for (seat(x), held.collide(state.pos, 3, push); push.lengthSq() === 0 && x < minX + 3; seat(x += 0.05), held.collide(state.pos, 3, push));
  seat(x + 0.2);
  held.collide(state.pos, 3, push);
  assert.ok(push.x < -0.1, `without the rule the wall pushes the hull back (${push.x.toFixed(3)} m)`);
  predict(false).collide(state.pos, 3, push);
  assert.ok(push.x < -0.1, 'a structure that holds pushes');
  assert.ok(asked.length > 0 && asked.every((a) => a.record.structureIdx === HOUSE && a.massTons === mass), 'asked of the house, on the hull\'s mass');
  // (the house stands a few degrees off the axis: the closing speed is the hull's along the wall's normal)
  assert.ok(asked.some((a) => a.closingMps > 0.9 * 12 && a.closingMps <= 12 + 1e-9), `on the closing speed along the contact (${asked.map((a) => a.closingMps.toFixed(2))})`);
  predict(true).collide(state.pos, 3, push);
  assert.ok(Math.abs(push.x) < 1e-9 && Math.abs(push.z) < 1e-9, 'a structure that yields lets the hull through');
  const presentation = readFileSync(new URL('./battlePresentation.ts', import.meta.url), 'utf8');
  assert.match(presentation, /structureYields: \(record, massTons, closingMps\) => game\.ruleset\?\.destruction\?\.structures === true\s*&& destruction\.yieldsToRam\(record, massTons, closingMps\),/,
    'the battle presentation wires the prediction to its mirror where the match plays structures');
}

// ---- 4. the Worker and the page, in process: the drawn hull rides through the fall ----------------------------------
{
  let now = 0, seq = 0;
  const timers = [];
  const schedule = (callback, delayMs) => {
    const timer = { at: now + Math.max(0, delayMs || 0), seq: seq++, callback, dead: false };
    timers.push(timer);
    return () => { timer.dead = true; };
  };
  const advance = (target) => {
    for (;;) {
      let best = -1;
      for (let i = 0; i < timers.length; i++) {
        const t = timers[i];
        if (t.dead || t.at > target) continue;
        if (best < 0 || t.at < timers[best].at || (t.at === timers[best].at && t.seq < timers[best].seq)) best = i;
      }
      if (best < 0) break;
      const [t] = timers.splice(best, 1);
      now = Math.max(now, t.at);
      t.callback();
    }
    for (let i = timers.length - 1; i >= 0; i--) if (timers[i].dead) timers.splice(i, 1);
    now = target;
  };
  const authorityWorld = createDedicatedWorldCollision(MAP);
  const world = pageWorld();
  const mirror = createDestructionMirror(world, null);
  const ruleset = matchRulesetFor('standard');
  mirror.setSections(ruleset.destruction?.sections === true);
  let viewerState = null, driving = false;
  const adapter = {
    applyRoster() {},
    applyFrame(frame) {
      if (frame.viewer?.state) viewerState = frame.viewer.state;
      mirror.ground.setTime(now / 1000);
      mirror.applyLog(frame.destruction ?? [], typeof frame.destructionPending === 'function' ? frame.destructionPending : null,
        typeof frame.craterPending === 'function' ? frame.craterPending : null);
    },
    applyEvent({ kind, payload }) {
      if (kind === 'structure_stage') mirror.applyStageEvent(payload);
      else if (kind === 'structure_breach') mirror.applyBreachEvent(payload);
      else if (kind === 'terrain_crater') mirror.applyCraterEvent(payload);
    },
    applyVerdict() {}, setVisibility() {}, dispose() {},
  };
  const prediction = {
    // (as battlePresentation.predictionWorld builds it)
    world: createPredictionWorld({
      worldCollision: Object.create(world, { heightField: { value: mirror.groundField } }),
      ownSpec: spec, ownState: () => viewerState, others: () => [], mode: 'standard',
      structureYields: (record, massTons, closingMps) => ruleset.destruction?.structures === true && mirror.yieldsToRam(record, massTons, closingMps),
    }),
    specFor: (id) => getSpec(id),
  };
  const controls = () => ({ throttle: driving ? 1 : 0, steer: 0, brake: !driving, fire: false, aimLocked: true, aimYaw: 0, aimPitch: 0,
    aimDistance: 200, shellSlot: 0, actionPresses: 0 });
  // the room's host: the match actor on the battlefield's collision, one human seat and a far bot, as the browser host's
  // core boots it (matchHostCore.ts: hostRulesetFor)
  const actor = createMatchActor({
    roomId: 'ram-yield', mapId: MAP, mode: 'standard', seed: 31, countdownS: 0.2, world: authorityWorld, now: () => now, schedule,
    ruleset: hostRulesetFor('standard', null, null),
    seats: [{ seat: 0, playerId: 'player', name: 'Probe', team: 'alpha', specId: 't84bm_oplot_m' }],
    bots: [{ playerId: 'enemy', name: 'Far', team: 'bravo', specId: 't90am', difficulty: 'easy' }],
  });
  // the seat's client over the loopback pair, its server end the actor's link (the HELLO attaches the seat)
  const pair = createLoopbackPair({ clock: () => now, connectDelayMs: 0 });
  pair.server.open();
  let messageListener = null, closeListener = null, attached = false;
  const link = {
    label: 'player',
    get bufferedAmount() { return pair.server.bufferedBytes; },
    get closed() { return pair.server.state === 'closed'; },
    send(bytes) { if (!pair.server.send(bytes)) throw new Error('loopback refused'); pair.pump(now); },
    close(_reason, detail = '') { pair.server.close('server', detail); },
    onMessage(listener) { messageListener = listener; },
    onClose(listener) { closeListener = listener; },
  };
  pair.server.onFrame((bytes) => {
    if (attached) { messageListener?.(bytes); return; }
    const decoded = decodeMessage(bytes);
    assert.ok(decoded.ok && decoded.message.type === MESSAGE_TYPE.HELLO, 'the seat says hello first');
    attached = actor.attach(link, decoded.message, { v: 1, roomId: actor.roomId, seat: 0, playerId: 'player', name: 'Probe', team: 'alpha',
      specId: 't84bm_oplot_m', iat: 0, exp: 1 });
  });
  pair.server.onState((change) => { if (change.state === 'closed') closeListener?.(); });
  const client = new MatchClient({ transport: pair.client, token: 'issued-elsewhere', clock: () => now,
    clientBuild: 'predictionStructureYield.selftest', controls, prediction });
  const unbind = bindMatchPresentation(client, adapter);
  client.onWelcome(() => client.enablePrediction(prediction));
  client.connect();
  const frameMs = 1000 / 60;
  const frame = async () => {
    advance(now + frameMs);
    pair.pump(now);
    client.update(now, frameMs / 1000);
    // (the frame's inputs cross at once, ahead of the actor's next tick, as a link with no latency carries them)
    pair.pump(now);
    await new Promise((r) => setImmediate(r));
  };
  for (let guard = 0; !client.welcome && guard < 2000; guard++) await frame();
  assert.ok(attached && client.welcome, 'the seat is welcomed');
  for (let i = 0; i < 90; i++) await frame();
  const match = actor.authority;
  const player = match.entityById.get('player'), enemy = match.entityById.get('enemy');
  const park = () => {
    enemy.state.pos.x = 440; enemy.state.pos.z = 440; enemy.state.speed = 0;
    for (const e of match.entities) e.combat.hp = e.combat.maxHp = 1e7;
  };
  // 22 m west of house #2's west wall, facing it (the probe's approach, tools/wr264-ram-probe.mjs)
  const start = { x: -24.3, z: 1.1 };
  const s = player.state;
  s.pos.x = start.x; s.pos.z = start.z; s.yaw = Math.PI / 2; s.speed = 0; s.turretYaw = 0;
  resetTankVerticalState(s, authorityWorld.heightField.getHeightAt(start.x, start.z) + 0.05, 0, true);
  if (s._sup) s._sup.x = NaN;
  for (let i = 0; i < 90; i++) { park(); await frame(); }
  const before = client.stats().prediction;
  driving = true;
  let maxGap = 0, maxBack = 0, peak = -Infinity;
  for (let i = 0; i < 8 * 60; i++) {
    park();
    await frame();
    if (!viewerState || i < 150) continue;          // from 2.5 s: the run-up done, through the ram and the fall
    maxGap = Math.max(maxGap, Math.hypot(viewerState.pos.x - s.pos.x, viewerState.pos.z - s.pos.z));
    peak = Math.max(peak, viewerState.pos.x);
    maxBack = Math.max(maxBack, peak - viewerState.pos.x);
  }
  const after = client.stats().prediction;
  unbind();
  client.dispose();
  actor.stop();
  const houseMaxX = Math.max(...authorityWorld.getObstacles().filter((r) => r.structureIdx === HOUSE).map((r) => r.max[0]));
  assert.ok(s.pos.x > houseMaxX, `the authority's hull rammed through the house (x ${s.pos.x.toFixed(1)} past ${houseMaxX.toFixed(1)})`);
  assert.equal(after.hardSnaps - before.hardSnaps, 0, 'no hard snap through the ram and the fall (262: 7)');
  assert.ok(maxGap < 1.5, `the drawn hull keeps to the authority's (largest gap ${maxGap.toFixed(2)} m; 262: 9.4 m)`);
  assert.ok(maxBack < 0.5, `and is never thrown back (${maxBack.toFixed(2)} m; 262: 7.3 m)`);
}
clearTimeout(watchdog);
console.log('predictionStructureYield.selftest: PASS');
process.exit(0);
