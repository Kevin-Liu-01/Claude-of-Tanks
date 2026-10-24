// The destruction log stays inside its wire budget (security audit 2026-10-22, C3; src/sim/destructionMatch.ts
// DESTRUCTION_LOG_BUDGET_BYTES). The audit grew a real Ruinspires log past what one 64 KB keyframe carries (about
// 2,340 breach entries) and every viewer's snapshots stopped for the rest of the match, the migration keyframe with
// them. Here 125 mm HE rounds strike its walls well past that point: every stage and crater is still logged, breaches
// are logged while the budget lasts (holes first to stop, section falls after), every breach still reaches the live
// event stream, and the keyframe and the migration keyframe of the final log both encode.
import assert from 'node:assert/strict';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { createDestructionMatch, DESTRUCTION_LOG_BUDGET_BYTES } from './destructionMatch.ts';
import { matchRulesetFor } from './matchRuleset.ts';
import { createTerrainDeformation } from './terrainDeformation.ts';
import { buildSnapshotPacket, encodeMessage } from '../mp/wire/codec.ts';
import { quantizeDestructionEntry } from '../mp/wire/destructionLog.ts';
import { NO_TICK } from '../mp/wire/constants.ts';
import { encodeMigrationKeyframe } from '../mp/host/migrationState.ts';

let seed = 0x2545f491;
const random = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 0x100000000; };
const world = createDedicatedWorldCollision('ruinspires', { retain: false });
const rules = matchRulesetFor('standard').destruction;
const match = createDestructionMatch({ rules, obstacles: world.getObstacles(), colliders: world.getColliders(), ground: createTerrainDeformation() });
const structures = (match.structures?.structures ?? []).filter((structure) => structure.destructible);
assert.ok(structures.length > 300, `Ruinspires' destructible structures (${structures.length})`);

const he = { type: 'HE', caliberMm: 125, name: 'budget-125-HE' };
const live = { stage: [], breach: [] };
let hits = 0;
while (hits < 3000) {
  const standing = structures.filter((structure) => structure.stage < 3);
  if (!standing.length) break;
  const structure = standing[Math.floor(random() * standing.length)];
  const record = structure.colliders[0] ?? structure.obstacles[0];
  hits++;
  if (!record) continue;
  const sections = structure.sections;
  const fx = sections ? sections.fx : Math.sin(structure.yaw), fz = sections ? sections.fz : Math.cos(structure.yaw);
  const hd = sections ? sections.hd : structure.hd, hw = sections ? sections.hw : structure.hw;
  const storeyH = sections ? sections.storeyH : Math.max(2.5, (structure.topY - structure.baseY) * 0.6);
  const baseY = sections ? sections.baseY : structure.baseY;
  const face = Math.floor(random() * 4), t = random() * 1.6 - 0.8, storey = Math.floor(random() * (sections ? sections.storeys : 1));
  const along = face === 0 ? hd : face === 1 ? -hd : t * hd;
  const across = face === 2 ? hw : face === 3 ? -hw : t * hw;
  const x = structure.cx + along * fx + across * fz, z = structure.cz + along * fz - across * fx;
  const y = baseY + storeyH * (storey + 0.2 + random() * 0.6);
  match.shellWorldHit(he, record, x, y, z, -along * fx - across * fz, -along * fz + across * fx, false, 'p1');
  match.step();
  match.drainEvents(live.stage);
  match.drainBreaches(live.breach);
}
for (let tick = 0; tick < 600; tick++) { match.step(); match.drainEvents(live.stage); match.drainBreaches(live.breach); }

const kinds = { stage: 0, breach: 0, crater: 0 };
for (const entry of match.log) kinds[entry.kind]++;
const holes = match.log.filter((entry) => entry.kind === 'breach' && !entry.sectionDown).length;
assert.ok(live.breach.length > 2400, `the walls took more breaches than one keyframe used to carry (${live.breach.length})`);
assert.ok(match.unloggedBreaches > 0, 'the budget ran out within the run');
assert.equal(kinds.breach + match.unloggedBreaches, live.breach.length, 'every breach reached the live stream; the log holds those inside the budget');
assert.equal(kinds.stage, live.stage.length, 'every stage is logged');
assert.ok(kinds.breach > holes, 'section falls were still logged after the holes stopped');

// the final log encodes in a keyframe (an otherwise empty frame) and in the migration keyframe
const log = match.log.map(quantizeDestructionEntry);
const frame = { tick: 120, serverTimeMs: 1920, ackedInputTick: NO_TICK, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127,
  meta: { phase: 2, countdownMs: 0, battleTimeMs: 1920, verdict: 0, verdictReason: '', destructibleRevision: 1 },
  destroyed: [], destruction: log, entities: [], shells: [], viewer: null, modeStateJson: null };
const keyframeBytes = encodeMessage(buildSnapshotPacket(frame, null)).byteLength;
assert.ok(keyframeBytes <= DESTRUCTION_LOG_BUDGET_BYTES + 256, `the keyframe's log stays inside the budget (${keyframeBytes} bytes)`);
const migrationBytes = encodeMigrationKeyframe({ tick: 120, battleTimeMs: 1920, phase: 'playing', frame, entities: [] }).byteLength;
assert.ok(migrationBytes > 0, 'the migration keyframe encodes');

console.log(`destructionLogBudget: PASS (${hits} hits on ${structures.length} structures: ${live.breach.length} breaches live, ${kinds.breach} logged `
  + `(${holes} holes), ${match.unloggedBreaches} left out; ${kinds.stage} stages, ${kinds.crater} craters; keyframe ${keyframeBytes} B)`);
