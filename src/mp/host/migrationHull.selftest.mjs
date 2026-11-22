// Every live hull rides a migration keyframe exact (276; MigrationEntityExtras.hull, migrationState.ts packHull and
// restoreHull). A row rounds a hull's pose to the millimetre and carries none of what the last step left for the next:
// the movement integrator (the movement prediction checkpoint holds it for the client's predictor, and the hull packing
// takes it whole), the gun's limit flag and the slope block a bot's brain reads, the contact the hull took, the fall the
// ledger owes, the roof guns' slew, the special action's toggle and the hull's held input. A fight from a keyframe alone
// parted by tens of metres on them (migrationTwins [5]).
// [1] the census: each number and flag of a hull's state (and its kit's and input's), set apart from the old host's own on
//     a bot of a two-station roof kit, rides the keyframe to the new host, or is named here with the reason it need not
//     (a mirror, a construction's constant, a step's own scratch). A field added to the state is in neither list and fails.
// [2] from a newer row (the 275 reading of a window), the drive alone (the turn rate, the slew, the bloom, the spool), the
//     held input, the roof guns' slew and the special action; the pose and the rest are the row's.
// [3] the packing: a hull at rest is a few numbers; one of another layout, or short or long, is refused whole and the hull
//     stands on its row.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { applyResumeState, captureEntityExtras, decodeMigrationKeyframe, encodeMigrationKeyframe, resumeClocksOf, resumeStateFromRetained } from './migrationState.ts';
import { quantizePosition } from '../wire/quantize.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };
// the M551A1 TTS: a roof kit of two stations (auxiliarySystems.ts VH.02)
const spec = 'm551a1_tts';
await ensureAuthorityFleet([spec]);
const world = { mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [] };
const make = (resume) => createMatchActor({ roomId: 'migration-hull', mapId: 'verdant', seed: 3, seats: [{ seat: 0, playerId: 'h0', name: 'H0', team: 'alpha', specId: spec }],
  bots: [{ playerId: 'a-0', name: 'A0', team: 'alpha', specId: spec }], world, countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });

/** What a resume leaves of a hull's state and need not carry, by path, with the reason. */
const NOT_CARRIED = new Map([
  ['grounded', 'a mirror of _ride.grounded: the checkpoint\'s flag writes both copies (hullGround.ts setHullGrounded)'],
  ['aimPoint.x', 'the construction\'s seed for the input\'s aim point (a revive builds it again); the input\'s own aim point rides'],
  ['aimPoint.y', 'the same'],
  ['aimPoint.z', 'the same'],
  ['suspensionAim', 'never set on the authority (a presentation\'s, battlePresentation.ts)'],
  ['roofGunYaw', 'a mirror of the roof kit\'s slew (combat.auxiliary.gunYaw, which rides): the restore and each step\'s roof gun write it'],
  ['roofGunPitch', 'the same (combat.auxiliary.gunPitch)'],
  ...['immobile', 'wreck', 'powerMult', 'accelMult', 'traverseMult', 'turretMult', 'aimTimeMult', 'gunYellow', 'bloomMult']
    .map((key) => [`_debuff.${key}`, 'read from the hull\'s modules and crew at each step\'s start (movement.ts readDebuffs; the extras carry those)']),
]);

const old = make(null), sim = old.authority;
sim.onMatchReady();
for (let k = 0; k < 150; k++) { sim.step({ dt: 1 / 60, inputs: new Map() }); sim.afterEventBroadcast(); }
const hull = sim.entityById.get('a-0');
const era = createEraIndexer();
let tick = 150;
/** The old host's keyframe now and a new host resumed from it alone (or from `latest`, the 275 reading of a window). */
function migrate(latest = null) {
  const snap = sim.snapshot({ tick, serverTimeMs: 0, viewerId: 'h0', ackInputSeq: null });
  const frame = { tick, serverTimeMs: 0, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127, meta: captureMeta({ ...snap.meta, battleTimeMs: Math.round(sim.battleS * 1000) }, false),
    destroyed: [], entities: sim.entities.map((e) => captureEntityRow(e, old.wireIdOf(e.id), era, tick)), shells: [], viewer: null, modeStateJson: null };
  const keyframe = decodeMigrationKeyframe(encodeMigrationKeyframe({ tick, battleTimeMs: Math.round(sim.battleS * 1000), timeS: sim.timeS, battleS: sim.battleS, phase: 'playing',
    modeCheckpoint: sim.captureModeCheckpoint(), entities: captureEntityExtras(old), frame }));
  return { keyframe, resume: (k = keyframe) => {
    const { state } = resumeStateFromRetained(k, 0, latest, latest ? 500 : null, []);
    delete state.replay;
    const fresh = make({ tick: state.tick, ...resumeClocksOf(state) });
    applyResumeState(fresh, state);
    return fresh;
  } };
}

console.log('[1] the census: every number and flag of a hull rides, or is named');
{
  // the paths: the state's numbers and flags, those of its objects one deep; the hp (its row's is whole: a brain read the
  // rounding as damage); the kit's slew; the special action; the input
  const paths = [];
  for (const [key, value] of Object.entries(hull.state)) {
    if (typeof value === 'number' || typeof value === 'boolean') paths.push(['state', key]);
    else if (value && typeof value === 'object') for (const [inner, v] of Object.entries(value)) if (typeof v === 'number' || typeof v === 'boolean') paths.push(['state', key, inner]);
  }
  paths.push(['combat', 'hp'], ['combat', 'auxiliary', 'gunYaw'], ['combat', 'auxiliary', 'gunPitch'], ['combat', 'auxiliary', 'stations', 0, 'gunYaw'], ['combat', 'auxiliary', 'stations', 0, 'gunPitch'],
    ['specialAction', 'active'], ['specialAction', 'previousShellSlot']);
  for (const [key, value] of Object.entries(hull.input)) {
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) paths.push(['input', key]);
    else if (value && typeof value === 'object') for (const inner of ['x', 'y', 'z']) paths.push(['input', key, inner]);
  }
  const at = (root, path) => path.reduce((o, k) => o?.[k], root);
  const put = (root, path, value) => { path.slice(0, -1).reduce((o, k) => o[k], root)[path.at(-1)] = value; };
  const INTEGERS = new Set(['bodyRest', 'bounces', 'impactSource', 'shellSlot', 'actionBits', 'auxiliaryBits', 'previousShellSlot', 'fireIntentSeq']);
  // (the hp moved by a fraction: its row rounds back to the old host's, so the hull's own reading stands)
  const carried = [], left = [], stale = [];
  for (const path of paths) {
    const before = at(hull, path);
    const name = path.slice(path[0] === 'state' ? 1 : 0).join('.');
    const value = typeof before === 'boolean' ? !before : INTEGERS.has(path.at(-1)) ? (Number(before) || 0) + 1 : (Number.isFinite(before) ? before : 0) + 0.123456789;
    put(hull, path, value);
    // a hull's pose stands on its row too: the row is captured after the change, as the old host would have sealed it
    const fresh = migrate().resume();
    const got = at(fresh.authority.entityById.get('a-0'), path);
    fresh.stop();
    put(hull, path, before);
    const rode = Object.is(got, value);
    if (rode && NOT_CARRIED.has(name)) stale.push(name);
    else if (rode) carried.push(name);
    else if (NOT_CARRIED.has(name)) left.push(name);
    else { failures++; console.error(`FAIL  ${name} does not ride the keyframe (${JSON.stringify(value)} on the old host, ${JSON.stringify(got)} on the new) and is named nowhere`); }
  }
  ok(carried.length > 100, `${carried.length} numbers and flags ride the keyframe exact (the pose, the checkpoint's, the step's, the kit's, the special action's, the input's)`);
  ok(left.length === NOT_CARRIED.size && !stale.length, `the ${left.length} named are left, each for its reason (${stale.length ? `but ride: ${stale.join(', ')}` : 'none rides'}):\n        `
    + [...NOT_CARRIED].map(([key, why]) => `${key}: ${why}`).join('\n        '));
}

console.log('[2] from a newer row: the drive alone');
{
  // the hull mid-everything, sealed; the old host on 0.5 s and the seat's frame then (the 275 reading of the window)
  const st = hull.state;
  st.bloomF = 2.5; st.turretYawRate = 0.27; st._spool = 0.83; st.yawRate = 0.19; st._prevSpeed = 3.1; st._spring.pitch = 0.01;
  hull.combat.auxiliary.gunYaw = 0.6; hull.combat.auxiliary.stations[0].gunYaw = -0.4; hull.input.throttle = 0.75;
  const { keyframe } = migrate();
  const sealed = { bloomF: st.bloomF, turretYawRate: st.turretYawRate, _spool: st._spool, yawRate: st.yawRate };
  for (let k = 0; k < 30; k++) { sim.step({ dt: 1 / 60, inputs: new Map() }); sim.afterEventBroadcast(); tick++; }
  const latest = { tick, serverTimeMs: 0, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127,
    meta: captureMeta({ ...sim.snapshot({ tick, serverTimeMs: 0, viewerId: 'h0', ackInputSeq: null }).meta, battleTimeMs: Math.round(sim.battleS * 1000) }, false),
    destroyed: [], entities: sim.entities.map((e) => captureEntityRow(e, old.wireIdOf(e.id), era, tick)), shells: [], viewer: null, modeStateJson: null };
  const { state } = resumeStateFromRetained(keyframe, 0, latest, 500, []);
  delete state.replay;
  const fresh = make({ tick: state.tick, ...resumeClocksOf(state) });
  applyResumeState(fresh, state);
  const taken = fresh.authority.entityById.get('a-0');
  const row = latest.entities.find((r) => r.entityId === old.wireIdOf('a-0'));
  ok(taken.state.roofGunYaw === 0.6 && taken.state.roofGunPitch === taken.combat.auxiliary.gunPitch, `the pose's copy of the roof gun's slew the armour reads `
    + `before the first step is the kit's (${taken.state.roofGunYaw})`);
  ok(Object.entries(sealed).every(([key, value]) => taken.state[key] === value) && taken.combat.auxiliary.gunYaw === 0.6
    && taken.combat.auxiliary.stations[0].gunYaw === -0.4 && taken.input.throttle === 0.75,
  `the keyframe's drive (${JSON.stringify(sealed)}), the roof guns' slew and the held input`);
  ok(quantizePosition(taken.state.pos.x) === row.x && taken.state._prevSpeed === taken.state.speed && taken.state._prevSpeed !== 3.1,
    `and the row's pose, the speed and the spring as the row seats them (_prevSpeed ${taken.state._prevSpeed.toFixed(3)} = its speed, not the keyframe's 3.1)`);
  fresh.stop();
}

console.log('[3] the packing');
{
  const atRest = make(null);
  const resting = captureEntityExtras(atRest).find((e) => e.entityId === atRest.wireIdOf('a-0'));
  ok(typeof resting.hull === 'string' && resting.hull.length <= 240, `a hull at rest packs to ${resting.hull.length} characters (its pose and the few numbers a hull standing still holds)`);
  atRest.stop();
  const { keyframe, resume } = migrate();
  const id = old.wireIdOf('a-0');
  const exact = resume().authority.entityById.get('a-0').state.pos.x;
  for (const [label, corrupt] of [['another layout', (h) => `B${h.slice(1)}`], ['a short body', (h) => h.slice(0, -8)], ['a long body', (h) => `${h}AAAAAAAAAAA`]]) {
    const bad = { ...keyframe, entities: keyframe.entities.map((e) => (e.entityId === id ? { ...e, hull: corrupt(e.hull) } : e)) };
    const fresh = resume(bad), pos = fresh.authority.entityById.get('a-0').state.pos.x;
    const row = keyframe.frame.entities.find((r) => r.entityId === id);
    ok(pos === row.x / 1000 && pos !== exact, `${label} is refused whole: the hull stands on its row (${pos} m, the exact ${exact})`);
    fresh.stop();
  }
}

old.stop();
if (failures) { console.error(`migrationHull.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('migrationHull.selftest: every number and flag of a live hull rides the keyframe exact or is named with its reason; from a newer row its drive alone; a packing not its own is refused');
