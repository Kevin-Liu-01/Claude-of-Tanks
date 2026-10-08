// Craters across the network (destruction core lane, 2026-10-08; crater-render-spec §E/§F): an authority with craters on
// (a ruleset override: the switch itself stays off until the gates pass) digs real HE ground bursts, and what each peer
// lays on its own ground is checked — every crater stamped exactly once, as the authority quantized it, whichever path
// carries it first:
//   - a live view: the frames' destruction log and the terrain_crater events interleaved as the queue delivers them, the
//     log sometimes ahead of an event still owed (the mirror holds that crater back for its event) and every later log
//     naming it again (never a second stamp); its terrain:crater events live, one per crater;
//   - a late joiner: the whole log at once, every crater stamped settled, one event each;
//   - a migrated host: a fresh destruction match restored from the sealed log stamps the same ground, raises no event and
//     continues the crater count where the old host stopped.
import assert from 'node:assert/strict';
import '../../vehicles/tankFactory.ts';
import { createAuthoritativeMatch } from '../../sim/authoritativeMatch.ts';
import { createDestructionMatch } from '../../sim/destructionMatch.ts';
import { createTerrainDeformation } from '../../sim/terrainDeformation.ts';
import { matchRulesetFor } from '../../sim/matchRuleset.ts';
import { isHeClass } from '../../sim/damage.ts';
import { getSpec } from '../../vehicles/specs.ts';
import { createDedicatedWorldCollision } from '../../../server/dedicatedWorldCollision.ts';
import { createDestructionMirror } from './destructionMirror.ts';

const MAP = 'verdant';
const standard = matchRulesetFor('standard');
const ruleset = { ...standard, destruction: { ...standard.destruction, craters: true } };
const heSlot = getSpec('t90m').gun.shells.findIndex((shell) => isHeClass(shell.type));
assert.ok(heSlot >= 0, 'the T-90M carries an HE round');

// ---- the authority: h2 fires its HE round into the ground in front of it, turning a little between shots
const world = createDedicatedWorldCollision(MAP);
const match = createAuthoritativeMatch({ players: [{ id: 'h1', specId: 'm1a2', team: 'alpha' }, { id: 'h2', specId: 't90m', team: 'bravo' }],
  mapId: MAP, seed: 11, countdownS: 0, gameMode: 'standard', worldCollision: world, ruleset });
match.onMatchReady();
const deliveries = []; // { tick, events: [...], log: entries | null } in arrival order
const inputs = new Map();
for (let tick = 1; tick <= 3000; tick++) {
  const fire = tick % 240 === 0;
  inputs.set('h2', { throttle: 0, steer: 0, brake: false, fire, fireIntentSeq: fire ? tick / 240 : null, aimLocked: false,
    shellSlot: heSlot, actionBits: 0, aimYaw: (tick / 240) * 0.25, aimPitch: -0.03, aimDistance: 60 });
  match.step({ dt: 1 / 60, inputs });
  const events = match.eventsForViewer('h1').filter((e) => e.type === 'terrain_crater');
  const log = tick % 20 === 0 ? match.snapshot({ tick, serverTimeMs: tick * 50 / 3, viewerId: 'h1', ackInputSeq: null }).meta.destructionLog : null;
  deliveries.push({ tick, events, log: log ? log.map((entry) => ({ ...entry })) : null });
  match.afterEventBroadcast();
}
const finalLog = match.snapshot({ tick: 3001, serverTimeMs: 0, viewerId: 'h1', ackInputSeq: null }).meta.destructionLog;
const dug = finalLog.filter((entry) => entry.kind === 'crater');
assert.ok(dug.length >= 5, `the authority dug craters to judge (${dug.length})`);
const sameStamps = (ground, label) => {
  const stamps = ground.stamps.filter((stamp) => stamp.kind === 'crater');
  assert.equal(stamps.length, dug.length, `${label}: one stamp per crater (${stamps.length} of ${dug.length})`);
  const key = (s) => `${s.x}|${s.z}|${s.radiusM}|${s.depthM}|${s.rimM}|${s.seed}`;
  assert.deepEqual(stamps.map(key).sort(), dug.map(key).sort(), `${label}: stamped as the authority quantized them`);
};
const recorder = () => { const seen = []; return { seen, emit: (type, payload) => { if (type === 'terrain:crater') seen.push(payload); } }; };
const clientWorld = () => createDedicatedWorldCollision(MAP);

// ---- a live view: the log a few ticks ahead of each crater's event (its event still owed), then the event, then later logs
{
  const bus = recorder();
  const mirror = createDestructionMirror(clientWorld(), bus);
  const owed = new Set();
  let held = 0;
  for (const { events, log } of deliveries) {
    for (const event of events) owed.add(event.craterId);
    // the frame's log arrives first: every crater whose event is still owed is held back for it
    if (log) {
      const before = mirror.ground.stamps.length;
      mirror.applyLog(log, null, (craterId) => owed.has(craterId));
      if (mirror.ground.stamps.length === before && log.some((entry) => entry.kind === 'crater' && owed.has(entry.craterId))) held++;
    }
    for (const event of events) { mirror.applyCraterEvent(event); owed.delete(event.craterId); }
  }
  mirror.applyLog(finalLog, null, () => false);
  sameStamps(mirror.ground, 'live view');
  assert.equal(bus.seen.length, dug.length, 'one terrain:crater per crater on the live view');
  assert.ok(bus.seen.every((event) => !event.settled), 'the live view animated every crater (none was laid down settled)');
  assert.ok(held > 0, `a log ahead of its event held the crater back for it (${held} times)`);
}

// ---- a late joiner: the whole log at once
{
  const bus = recorder();
  const mirror = createDestructionMirror(clientWorld(), bus);
  mirror.applyLog(finalLog, null, null);
  mirror.applyLog(finalLog, null, null); // a repeated frame stamps nothing again
  sameStamps(mirror.ground, 'late joiner');
  assert.equal(bus.seen.length, dug.length, 'one settled terrain:crater per crater for the late joiner');
  assert.ok(bus.seen.every((event) => event.settled === true), 'every crater laid down settled');
}

// ---- a migrated host: restored from the sealed log
{
  const ground = createTerrainDeformation();
  const hostWorld = createDedicatedWorldCollision(MAP);
  const resumed = createDestructionMatch({ rules: ruleset.destruction, obstacles: hostWorld.getObstacles(), colliders: hostWorld.getColliders(), ground,
    groundTypeAt: () => 'medium' });
  resumed.restore(finalLog.map((entry) => ({ ...entry })));
  sameStamps(ground, 'migrated host');
  const events = [];
  resumed.step();
  assert.equal(resumed.drainCraters(events), 0, 'a restored crater raises no event');
  assert.equal(resumed.craters, dug.length, 'the crater count continues where the old host stopped');
  const he = { type: 'HE', caliberMm: 125, name: '125 mm HE' };
  const next = resumed.shellWorldHit(he, null, 300.5, 0, -300.5, 0, 1, true);
  assert.equal(next, dug.length, `the next crater takes id ${dug.length}`);
}
console.log(`craterSync: ${dug.length} craters dug by the authority; the live view stamped each once (the log held back for an owed event), `
  + 'the late joiner laid each down settled once, and the migrated host restored them all with no event and the count continued PASS');
