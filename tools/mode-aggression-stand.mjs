// The mode aggression harness's stand measure and its planted control, extracted from tools/mode-aggression-harness.mjs
// unchanged (round 8 Y10 s6-07, step 1 of 2: the receipt tools/mode-aggression-stand.selftest.mjs runs against this
// extraction first). First-party tooling: Kevin B. Liu.

/** A hull's slow stretch (trackStands) and the engaged samples it holds (sample()). `minS`: T_REV (0: no stand). */
export function createStand({ minS }) {
  let fromT = null, lastT = null, pendingStill = 0, pendingSettledStill = 0;
  return {
    get fromT() { return fromT; },
    get state() { return fromT == null ? 'moving' : lastT - fromT > minS ? 'standing' : 'young'; },
    /** One tick: `slow` = alive and |state.speed| under MOVE_EPS_MPS. Returns the samples a stand commits, or null. */
    step(slow, t) {
      if (minS === 0) return null;
      lastT = t;
      if (slow && fromT == null) fromT = t;
      else if (!slow && fromT != null) { fromT = null; pendingStill = 0; pendingSettledStill = 0; }
      if (fromT != null && t - fromT > minS && (pendingStill || pendingSettledStill)) {
        const commit = { still: pendingStill, settledStill: pendingSettledStill };
        pendingStill = 0; pendingSettledStill = 0;
        return commit;
      }
      return null;
    },
    /** An engaged sample: 'still' (counted now), 'pend' (held by a young stand) or 'none'. */
    sample(t, { settled, slowSample }) {
      if (!slowSample) return 'none';
      if (minS === 0 || (fromT != null && t - fromT > minS)) return 'still';
      if (fromT != null) { pendingStill++; if (settled) pendingSettledStill++; return 'pend'; }
      return 'none';
    },
  };
}

/** The refusal of a run's options, or null. */
export const plantOptionsError = () => null;

/** The planted stand (--plantStand): hold the picked hull until it has stood `standS`, then drive it off; report. */
export function createPlant({ standS, fromS, minS, maxTries = 3 }) {
  let id = null, holding = false, leaving = false, from = null, still0 = 0, slow = 0, done = false, tries = 0;
  return {
    get id() { return id; },
    get phase() { return done ? 'done' : id == null ? 'waiting' : holding ? 'holding' : 'leaving'; },
    get ended() { return done; },
    get drive() { return holding ? 'hold' : leaving ? 'go' : null; },
    wants(t) { return !done && id == null && t >= fromS && tries < maxTries; },
    pick(hullId) { id = hullId; holding = true; tries++; },
    /** One tick of the picked hull: its life, its stand's start (null when none) and its engaged-still count. */
    tick({ t, alive, standFromT, still }) {
      if (done || id == null) return null;
      const ended = from == null ? !alive : standFromT == null;
      if (from == null && standFromT != null) { from = standFromT; still0 = still; }
      if (from != null && holding && t - from >= standS) { holding = false; leaving = true; }
      if (!ended) return null;
      if (!alive && tries < maxTries) {
        const line = `PLANT ${id} destroyed ${from == null ? 'before its stand' : `${(t - from).toFixed(3)} s into its stand`}; planting the next hull`;
        id = null; holding = false; leaving = false; from = null; still0 = 0; slow = 0;
        return { line, end: false };
      }
      done = true; leaving = false;
      return { line: `PLANT ${id} stood ${from == null ? '0.000' : (t - from).toFixed(3)} s (held ${standS} s, T_REV ${minS} s), `
        + `${alive ? 'under way' : 'destroyed'}: slow engaged samples ${slow}, counted ${still - still0}`, end: true };
    },
    /** An engaged sample of the picked hull. */
    noteSample({ slowSample }) { if (from != null && !done && slowSample) slow++; },
    /** After a sample tick: the report once the control is complete, or null. */
    afterSample() { return null; },
    /** The run ended: the report of a control still open, or null. */
    finish() { return null; },
  };
}
