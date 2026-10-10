// A wreck's turret across the network (physics lane, 2026-10-10): the authority owns the turret body (sim/wreckTurrets.ts);
// its pose rides the entity rows (wire 5, WRECK_BODY) through deltas against acknowledged baselines, the client's
// interpolator blends it between rows, and what the peer draws once the turret sleeps is the host's pose to the wire's
// own resolution. A migrated host restores the body from the newest row and keeps it where it lay.
import assert from 'node:assert/strict';
import '../../vehicles/tankFactory.ts';
import { createAuthoritativeMatch } from '../../sim/authoritativeMatch.ts';
import { createDedicatedWorldCollision } from '../../../server/dedicatedWorldCollision.ts';
import { captureEntityRow, createEraIndexer } from '../../../server/match/entityRows.ts';
import {
  ByteReader, ByteWriter, PHASE, applyEntityRowPatch, diffEntityRow, dequantizePosition, dequantizeUnitComponent,
  readEntityRowPatch, writeEntityRowPatch,
} from '../wire/index.ts';
import { RemoteInterpolator } from '../match/interpolation.ts';

const MAP = 'verdant';
const world = createDedicatedWorldCollision(MAP);
const players = [{ id: 'h1', specId: 'm1a2', team: 'alpha' }, { id: 'h2', specId: 't90m', team: 'bravo' }];
const match = createAuthoritativeMatch({ players, mapId: MAP, seed: 21, countdownS: 0, gameMode: 'standard', worldCollision: world });
match.onMatchReady();
const victim = match.entities.find((entity) => entity.id === 'h2');
const VICTIM_WIRE_ID = 2;
const era = createEraIndexer();
const inputs = new Map();

// the client's side of the link: rows decoded against its acknowledged baseline, frames into the interpolator
let baseline = null;
const interp = new RemoteInterpolator({ snapshotIntervalMs: 50 });
let groups = 0, bytes = 0, flying = 0;
function transmit(tick) {
  const row = captureEntityRow(victim, VICTIM_WIRE_ID, era, tick);
  const patch = diffEntityRow(row, baseline, tick);
  const writer = new ByteWriter();
  writeEntityRowPatch(writer, patch, baseline, tick);
  const encoded = writer.toBytes();
  const decoded = readEntityRowPatch(new ByteReader(encoded), () => baseline, tick);
  const received = applyEntityRowPatch(decoded, baseline);
  if (decoded.mask & (1 << 18)) { groups++; bytes += encoded.length; if (received.wreckBody && !received.wreckBody.asleep) flying++; }
  baseline = received;
  const serverTimeMs = Math.round(tick * 1000 / 60);
  interp.push({
    tick, serverTimeMs, ackedInputTick: tick, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 2,
    meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: serverTimeMs, verdict: 0, verdictReason: '', destructibleRevision: 0 },
    destroyed: [], entities: [{ ...received, tick }], shells: [], viewer: null, modeStateJson: null,
  }, serverTimeMs, serverTimeMs + 40);
  return received;
}

let launchedAt = -1, settledAt = -1, maxClientGap = 0;
const hostPose = new Float64Array(8);
for (let tick = 1; tick <= 900; tick++) {
  if (tick === 30) {
    // the hull burns out (a scripted human: no extinguisher), its turret comes off its ring
    victim.combat.hp = 1; victim.combat.fire.burning = true; victim.combat.fire.ticksLeft = 4;
  }
  match.step({ dt: 1 / 60, inputs });
  match.afterEventBroadcast();
  if (victim._wreckTurret && launchedAt < 0) launchedAt = tick;
  if (victim._wreckTurret?.[7] === 1 && settledAt < 0) settledAt = tick;
  if (tick % 3 === 0) {
    transmit(tick);
    // what the peer presents 2 intervals behind, against what the host held then (the path is smooth: no jumps)
    const sample = interp.sample(Math.round(tick * 1000 / 60) + 40);
    const entity = sample?.entities?.[0];
    if (entity?.wreckBody && victim._wreckTurret) {
      const gap = Math.hypot(entity.wbx - victim._wreckTurret[0], entity.wby - victim._wreckTurret[1], entity.wbz - victim._wreckTurret[2]);
      maxClientGap = Math.max(maxClientGap, gap);
    }
  }
}
assert.ok(launchedAt > 0, 'the burned-out hull launched its turret');
assert.ok(settledAt > launchedAt, `and it came to rest (${((settledAt - launchedAt) / 60).toFixed(2)} s)`);
assert.ok(flying >= 3, `the rows carried the turret while it moved (${flying} rows)`);
assert.ok(maxClientGap < 1.2, `the peer's interpolated turret trails the host's by at most a couple of intervals (${maxClientGap.toFixed(3)} m)`);

// settled: the peer draws the host's pose to the wire's resolution, and a sleeping body costs nothing more
for (let k = 0; k < 8; k++) hostPose[k] = victim._wreckTurret[k];
const before = groups;
for (let tick = 903; tick <= 960; tick += 3) { match.step({ dt: 1 / 60, inputs }); match.afterEventBroadcast(); transmit(tick); }
assert.equal(groups, before, 'a sleeping turret sends no more rows');
const final = interp.sample(Math.round(960 * 1000 / 60) + 400).entities[0];
assert.equal(final.wreckBody, true);
assert.equal(final.wreckBodyAsleep, true, 'asleep on the peer too');
const posError = Math.hypot(final.wbx - hostPose[0], final.wby - hostPose[1], final.wbz - hostPose[2]);
assert.ok(posError <= 0.0009, `the peer's turret stands where the host's lies (${(posError * 1000).toFixed(2)} mm)`);
const dot = Math.abs(final.wbqx * hostPose[3] + final.wbqy * hostPose[4] + final.wbqz * hostPose[5] + final.wbqw * hostPose[6]);
assert.ok(1 - dot < 2e-8, `and turns as the host's does (1 - |q·q| = ${(1 - dot).toExponential(2)})`);
assert.ok(bytes / groups < 32, `a turret row costs ${(bytes / groups).toFixed(1)} B on average`);

// a migrated host: a fresh authority restores the body from the newest row and keeps it where it lay
{
  const resumed = createAuthoritativeMatch({ players, mapId: MAP, seed: 22, countdownS: 0, gameMode: 'standard', worldCollision: createDedicatedWorldCollision(MAP) });
  resumed.onMatchReady();
  const hull = resumed.entities.find((entity) => entity.id === 'h2');
  // the hull as the row has it (applyResumeState restores the pose and the death first)
  hull.state.pos.set(victim.state.pos.x, victim.state.pos.y, victim.state.pos.z);
  hull.state.yaw = victim.state.yaw;
  hull.combat.destroyed = true; hull.combat.hp = 0;
  const body = baseline.wreckBody;
  assert.ok(body && body.asleep);
  assert.equal(resumed.restoreWreckTurret('h2', {
    x: dequantizePosition(body.x), y: dequantizePosition(body.y), z: dequantizePosition(body.z),
    qx: dequantizeUnitComponent(body.qx), qy: dequantizeUnitComponent(body.qy), qz: dequantizeUnitComponent(body.qz),
    qw: dequantizeUnitComponent(body.qw), asleep: true,
  }), true);
  for (let tick = 1; tick <= 120; tick++) { resumed.step({ dt: 1 / 60, inputs: new Map() }); resumed.afterEventBroadcast(); }
  const kept = hull._wreckTurret;
  assert.ok(kept && kept[7] === 1, 'still asleep on the new host');
  assert.ok(Math.hypot(kept[0] - hostPose[0], kept[1] - hostPose[1], kept[2] - hostPose[2]) < 0.002, 'where the old host left it');
  const row = captureEntityRow(hull, VICTIM_WIRE_ID, createEraIndexer(), 121);
  assert.deepEqual({ ...row.wreckBody }, { ...body }, 'and its row is the old host\'s, byte for byte');
}

console.log(`wreckTurretSync.selftest: the burned-out hull's turret flew ${((settledAt - launchedAt) / 60).toFixed(2)} s over ${flying} rows `
  + `(${(bytes / groups).toFixed(1)} B each), the peer's pose ${(posError * 1000).toFixed(2)} mm from the host's at rest, a migrated host keeps it`);
