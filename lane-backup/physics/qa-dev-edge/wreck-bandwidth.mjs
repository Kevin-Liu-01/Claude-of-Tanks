// physics lane scratch (never staged): a 14v14 all-bot authority fighting to its verdict, every entity's row encoded
// for one all-seeing viewer at 20 Hz (deltas against the last row sent, a keyframe every 2 s), the WRECK_BODY group's
// bytes counted apart: what the turret bodies cost on the wire, an upper bound (every wreck visible, every row fresh).
//   node .qa-dev/wreck-bandwidth.mjs [--map=verdant] [--seconds=240] [--seed=5]
import '../src/vehicles/tankFactory.ts';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.ts';
import { createDedicatedWorldCollision } from '../server/dedicatedWorldCollision.ts';
import { captureEntityRow, createEraIndexer } from '../server/match/entityRows.ts';
import { ByteWriter, ROW_GROUP, diffEntityRow, writeEntityRowPatch } from '../src/mp/wire/index.ts';

const arg = (name, fallback) => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const map = arg('map', 'verdant');
const seconds = Number(arg('seconds', '240'));
const seed = Number(arg('seed', '5'));
const specs = ['m1a2', 't90m', 'kv2', 'm1a2', 't90m', 'strv103', 'm1a2'];
const players = [];
for (let i = 0; i < 28; i++) {
  players.push({ id: `b${i}`, specId: specs[i % specs.length], team: i < 14 ? 'alpha' : 'bravo', bot: true, difficulty: i % 3 === 0 ? 'hard' : 'normal' });
}
const world = createDedicatedWorldCollision(map, { retain: true });
const match = createAuthoritativeMatch({ players, mapId: map, seed, countdownS: 0, gameMode: 'standard', worldCollision: world });
match.onMatchReady();
const era = createEraIndexer();
const sent = new Map();
const writer = new ByteWriter(4096);
let rowBytes = 0, wreckBytes = 0, wreckGroups = 0, snapshots = 0, kills = 0, maxFlying = 0;
const perSecondWreck = new Map();
const started = performance.now();
const ticks = seconds * 60;
let endTick = ticks;
for (let tick = 1; tick <= ticks; tick++) {
  match.step({ dt: 1 / 60, inputs: new Map() });
  for (const event of match.eventsForViewer('__audit__')) if (event.type === 'tank_destroyed') kills++;
  match.afterEventBroadcast();
  if (tick % 3 !== 0) continue;
  snapshots++;
  const keyframe = tick % 120 === 0;
  let flying = 0;
  match.entities.forEach((entity, index) => {
    if (!entity.state) return;
    const row = captureEntityRow(entity, index + 1, era, tick);
    const base = keyframe ? null : sent.get(index) ?? null;
    const patch = diffEntityRow(row, base, tick);
    writer.reset();
    if (patch.mask !== 0 || !base) writeEntityRowPatch(writer, patch, base, tick);
    rowBytes += writer.length;
    if (patch.mask & ROW_GROUP.WRECK_BODY) {
      const bytes = row.wreckBody ? 21 : 1;
      wreckBytes += bytes; wreckGroups++;
      const second = Math.floor(tick / 60);
      perSecondWreck.set(second, (perSecondWreck.get(second) ?? 0) + bytes);
    }
    if (row.wreckBody && !row.wreckBody.asleep) flying++;
    sent.set(index, row);
  });
  maxFlying = Math.max(maxFlying, flying);
  if (match.snapshot({ tick, serverTimeMs: 0, viewerId: '__audit__', ackInputSeq: null }).meta.result) { endTick = tick; break; }
}
const durationS = endTick / 60;
const peak = Math.max(0, ...perSecondWreck.values());
console.log(JSON.stringify({
  map, seed, simulatedS: +durationS.toFixed(1), wallS: +((performance.now() - started) / 1000).toFixed(1), kills, snapshots,
  rowKBps: +(rowBytes / durationS / 1024).toFixed(2), wreckBps: +(wreckBytes / durationS).toFixed(1),
  wreckShare: +(100 * wreckBytes / Math.max(1, rowBytes)).toFixed(2), wreckGroups, maxFlyingAtOnce: maxFlying, peakWreckBytesInOneSecond: peak,
  turretBodies: match.wreckTurretDigest().split('\n').filter(Boolean).length,
}));
world.release?.();
