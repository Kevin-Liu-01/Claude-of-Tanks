// The mode aggression harness's stand measure and its planted control, one owner each (round 8 Y10 s6-07; the receipt is
// tools/mode-aggression-stand.selftest.mjs). First-party tooling: Kevin B. Liu.
//
// A stand (268, item 10; Main): a hull is standing once |state.speed| has stayed under MOVE_EPS_MPS for longer than T_REV
// (tools/mode-aggression-harness.mjs STAND_MIN_TICKS, calibrated in state.speed by its receipt). One owner per hull
// decides it from that one speed, tick by tick, and every engaged sample reads its verdict from the stand:
//   moving   -> young     |speed| under MOVE_EPS_MPS (the stand starts)
//   young    -> standing  past T_REV: the samples it held are committed
//   young    -> moving    |speed| back over it inside T_REV (a reversal, a jolt): the samples it held are dropped
//   standing -> moving    the stand ends
// A sample is the stand's when the stand is in progress at the sample's tick (its state there, as every other quantity
// a sample reads): 'still' (standing: counted now), 'pend' (young: held until T_REV) or 'none' (moving). So the sample
// that ends a stand's approach counts with it however far the hull rolled in its window, and the sample at a pull-away
// (|speed| past MOVE_EPS_MPS at its tick, however little it moved) is a moving sample. Before, sample() re-decided
// slowness from the sample's 0.5 s displacement while the stand ran on state.speed: an approach sample that moved over
// 0.375 m was never the stand's, a pull-away sample that moved under it was neither still nor pending (though
// --standMinS=0 counted it), and a hull shoved with still tracks (a stand by this definition) had its pushed samples
// dropped. A sample at its tick is a point reading of the stand, so the count is the stand's time, no sample gained or
// lost at either edge (round 8 Y10: a rule that also gave a stand the sample whose window held its end counted one more
// sample a stand, and moved the sweep's still shares about twice as far). --standMinS=0 keeps the old per-sample
// measure: no stand, a sample counts when it moved under MOVE_EPS_MPS.
//
// The planted control (--plantStand): one phase per run, moved only by this owner, which refuses every other move:
//   waiting  -> holding   a hull is picked (the harness's choice: the engaged bravo bot farthest from alpha)
//   holding  -> leaving   it has stood the planted time (braked at zero throttle)
//   leaving  -> closing   its stand ended (driven at full throttle)
//   closing  -> done      the first sample after the stand's end was taken (a moving sample the measure must not
//                         credit): the PLANT line, the stand's samples against what the measure counted
//   holding|leaving -> waiting   destroyed, tries left: the next hull is planted
//   any open phase -> unproven   destroyed on the last try, its stand never began or never ended inside its deadline
//                                (a hull driven into an obstacle at full throttle keeps |speed| under 0.75 m/s), its
//                                stand broke before the planted time, or the run ended first: a PLANT line naming why,
//                                which the harness receipt counts as a miss
// Before, the plant was a flag cluster with no deadline: a blocked hull was driven to the run's clock cap and no PLANT
// line was printed, and the run broke at the stand's end before the next sample, so the control never saw how the
// measure read the pull-away; and its own count was the displacement's, the other definition.

export const STAND_STATES = Object.freeze(['moving', 'young', 'standing']);
export const STAND_EDGES = Object.freeze({
  moving: Object.freeze(['moving', 'young']),
  young: Object.freeze(['young', 'standing', 'moving']),
  standing: Object.freeze(['standing', 'moving']),
});
/** A sample tick's float slack. */
const TICK_EPS_S = 1e-6;

/**
 * One hull's stand. `minS`: T_REV (0: the stand measure is off, the old per-sample measure counts). `step(slow, t)` once per tick (`slow`: alive and |state.speed| under MOVE_EPS_MPS) returns
 * the samples a stand commits ({ still, settledStill }) or null; `sample(t, { settled, slowSample })` judges an engaged
 * sample ('still' | 'pend' | 'none'; `slowSample`, the sample's own displacement, is read only with the measure off).
 */
export function createStand({ minS }) {
  if (!(minS >= 0)) throw new RangeError(`a stand needs minS >= 0 (got ${minS})`);
  let state = 'moving', fromT = null, lastT = -Infinity, pendingStill = 0, pendingSettledStill = 0;
  const move = (to) => {
    if (!STAND_EDGES[state].includes(to)) throw new Error(`stand: no move ${state} -> ${to}`);
    state = to;
  };
  return {
    get state() { return state; },
    /** When the stand in progress began (null while moving). */
    get fromT() { return fromT; },
    step(slow, t) {
      if (!(t >= lastT)) throw new RangeError(`stand: a tick at ${t} s is earlier than the last (${lastT} s); its clock runs forward`);
      lastT = t;
      if (minS === 0) return null;
      if (state === 'moving') {
        if (slow) { move('young'); fromT = t; }
        return null;
      }
      if (!slow) {
        move('moving'); fromT = null; pendingStill = 0; pendingSettledStill = 0;
        return null;
      }
      if (state === 'young' && t - fromT > minS) {
        move('standing');
        if (!pendingStill && !pendingSettledStill) return null;
        const commit = { still: pendingStill, settledStill: pendingSettledStill };
        pendingStill = 0; pendingSettledStill = 0;
        return commit;
      }
      return null;
    },
    sample(t, { settled, slowSample }) {
      if (!(t >= lastT)) throw new RangeError(`stand: a sample at ${t} s is earlier than its last tick (${lastT} s)`);
      if (minS === 0) return slowSample ? 'still' : 'none';
      if (state === 'standing') return 'still';
      if (state === 'young') { pendingStill++; if (settled) pendingSettledStill++; return 'pend'; }
      return 'none';
    },
  };
}

/** Why a run's stand options cannot run together, or null: the planted control measures the stand measure. */
export function plantOptionsError({ plantStandS, standMinS }) {
  if (plantStandS > 0 && standMinS === 0) {
    return `--plantStand=${plantStandS} controls the stand measure, which --standMinS=0 turns off: the planted hull would never start `
      + 'its stand (drop --standMinS=0, or --plantStand)';
  }
  return null;
}

export const PLANT_PHASES = Object.freeze(['waiting', 'holding', 'leaving', 'closing', 'done', 'unproven']);
export const PLANT_EDGES = Object.freeze({
  waiting: Object.freeze(['holding', 'unproven']),
  holding: Object.freeze(['leaving', 'waiting', 'unproven']),
  leaving: Object.freeze(['closing', 'waiting', 'unproven']),
  closing: Object.freeze(['done', 'unproven']),
  done: Object.freeze([]),
  unproven: Object.freeze([]),
});
/** A braked hull from over 2 m/s is at rest within a few seconds (the brake's static hold reaches 7.5 m/s^2). */
export const PLANT_START_DEADLINE_S = 10;
/** A hull at rest under full throttle passes MOVE_EPS_MPS in under a second (T_REV's slowest reversal: 59 ticks). */
export const PLANT_END_DEADLINE_S = 10;

/**
 * The planted stand (--plantStand=standS from --plantFromS=fromS). The harness picks the hull (`wants(t)`, then
 * `pick(id, t)`), applies `drive` to its controller ('hold': zero throttle, brakes on; 'go': full throttle; null: its
 * own), and each tick calls `tick({ t, alive, standFromT, still })` with the picked hull's life, its stand's start
 * (createStand fromT) and its engaged-still count; every engaged sample of the picked hull calls `noteSample({ t })`, and
 * every sample tick `afterSample({ t, alive, still })`. A call returns null or { line, end } (the PLANT line to print;
 * `end`: the control is over, so the run ends). `finish(reason)` closes a control still open when the run ends.
 * `noteSample` counts the stand's samples by the stand's own times (the samples whose tick lies between its start and
 * its end), apart from the stand owner's verdicts, so a sample the measure dropped or credited wrongly shows.
 */
export function createPlant({ standS, fromS, minS, maxTries = 3, startDeadlineS = PLANT_START_DEADLINE_S,
  endDeadlineS = PLANT_END_DEADLINE_S }) {
  let phase = 'waiting', id = null, tries = 0, heldAt = null, from = null, leftAt = null, endedAt = null, still0 = 0, samples = 0;
  const move = (to) => {
    if (!PLANT_EDGES[phase].includes(to)) throw new Error(`plant: no move ${phase} -> ${to}`);
    phase = to;
  };
  const end = (to, line) => { move(to); return { line, end: true }; };
  const unproven = (cause) => end('unproven', `PLANT ${id ?? 'none'} unproven: ${cause}`);
  const stood = (t) => (from == null ? 0 : t - from);
  return {
    get id() { return id; },
    get phase() { return phase; },
    /** The control is over (done or unproven): the run ends. */
    get ended() { return phase === 'done' || phase === 'unproven'; },
    get drive() { return phase === 'holding' ? 'hold' : phase === 'leaving' || phase === 'closing' ? 'go' : null; },
    wants(t) { return phase === 'waiting' && t >= fromS && tries < maxTries; },
    pick(hullId, t) {
      if (phase !== 'waiting') throw new Error(`plant: a hull is picked only while waiting (${phase})`);
      move('holding');
      id = hullId; heldAt = t; tries++; from = null; leftAt = null; endedAt = null; still0 = 0; samples = 0;
    },
    tick({ t, alive, standFromT, still }) {
      if (phase === 'waiting' || this.ended) throw new Error(`plant: no tick while ${phase}`);
      if (phase === 'closing') return null;
      if (!alive) {
        const where = from == null ? 'before its stand' : `${stood(t).toFixed(3)} s into its stand`;
        if (tries < maxTries) {
          const line = `PLANT ${id} destroyed ${where}; planting the next hull`;
          move('waiting'); id = null;
          return { line, end: false };
        }
        return unproven(`destroyed ${where} on the last of ${maxTries} tries`);
      }
      if (phase === 'holding') {
        if (from == null) {
          if (standFromT != null) { from = standFromT; still0 = still; }
          else if (t - heldAt > startDeadlineS) return unproven(`its stand never began: |speed| stayed at or over the stand's threshold for ${startDeadlineS} s under the brake`);
          return null;
        }
        if (standFromT !== from) return unproven(`its stand broke after ${stood(t).toFixed(3)} s of the held ${standS} s (|speed| rose under the brake)`);
        if (t - from >= standS) { move('leaving'); leftAt = t; }
        return null;
      }
      // leaving: driven at full throttle until the stand ends
      if (standFromT !== from) { move('closing'); endedAt = t; return null; }
      if (t - leftAt > endDeadlineS) {
        return unproven(`its stand never ended: |speed| stayed under the stand's threshold ${endDeadlineS} s after full throttle `
          + `(blocked?), standing ${stood(t).toFixed(3)} s`);
      }
      return null;
    },
    noteSample({ t }) {
      if (from == null || this.ended || t < from - TICK_EPS_S) return;
      if (endedAt != null && t >= endedAt - TICK_EPS_S) return;
      samples++;
    },
    afterSample({ t, alive, still }) {
      if (phase !== 'closing') return null;
      return end('done', `PLANT ${id} stood ${(endedAt - from).toFixed(3)} s (held ${standS} s, T_REV ${minS} s), `
        + `${alive ? 'under way' : 'destroyed'}: engaged samples in the stand ${samples}, counted ${still - still0}`
        + ` (reported at ${t.toFixed(3)} s, the first sample after its end)`);
    },
    finish(reason) {
      if (this.ended) return null;
      return unproven(`the run ended (${reason}) while ${phase}`);
    },
  };
}
