// tools/audio/voicePlan.mjs — which takes of a crew line build-voices.mjs keeps and builds, and the build of one line's
// pack (round 8 Y9 s1-12, 2026-11-08).
//
// The runtime plays file `<line>_<n>.webm` as take n and captions it with the script's take n (assetLibrary.ts,
// captions.ts), so a pack is always an aligned prefix of the script: file n is script take n. build-voices.mjs used to
// skip a take whose request threw and master the next one at the shipped count, one index low ([A, C] for [A, B, C]),
// which a later --append froze as [A, C, C]. Each take of a build moves through declared states, owned by buildLine:
//
//   kept                          --append keeps its file and duration (planLine)
//   due ──→ mastering ──→ built   its best attempt mastered at its own index, only after every take before it stood
//    │          │
//    └──────────┴──→ missing      it threw, came back empty, its master failed, or a stop came first: the line ends
//                                 here and every take after it is missing too, so --append's count rule resumes at it
//
// --append keeps by count (planLine): a take whose words change is rebuilt without --append (docs/AUDIO.md).

/** A take's states in one build of its line, and the moves between them; takeMove refuses any other. */
export const TAKE_MOVES = Object.freeze({
  kept: Object.freeze([]),
  due: Object.freeze(['mastering', 'missing']),
  mastering: Object.freeze(['built', 'missing']),
  built: Object.freeze([]),
  missing: Object.freeze([]),
});

/** Move take i of `states` to `to`, or throw: a due take is mastered only when every take before it is kept or built. */
export function takeMove(states, i, to) {
  const from = states[i];
  if (!TAKE_MOVES[from]?.includes(to)) throw new Error(`voice take ${i}: no move ${from} -> ${to}`);
  const gap = to === 'mastering' ? states.slice(0, i).find((s) => s !== 'kept' && s !== 'built') : undefined;
  if (gap) throw new Error(`voice take ${i}: no move ${from} -> ${to} while an earlier take is ${gap}`);
  states[i] = to;
  return to;
}

/**
 * --append's keep rule, for the build and --dry alike: a line keeps its shipped takes (their files and durations) when
 * the script still has at least as many and every one's file exists; `exists(i)` says whether `<line>_<i>.webm` is on
 * disk. Returns the kept count and the script indices to build.
 */
export function planLine({ previous = [], takes, append, exists }) {
  const kept = append && previous.length <= takes.length && previous.every((_, i) => exists(i)) ? previous.length : 0;
  return { kept, build: takes.map((_, i) => i).slice(kept) };
}

/**
 * One take's pick (build-voices.mjs bestTake): attempt n (`attempt(n)`, scored { sim, repeated, durS, ... }) in order
 * until one passes the bar under 6 s, `attempts` have run, or `stopped()`; `better(a, b)` says a beats b. With none
 * passed and `verify`, each attempt's cut (`trim(candidate)`: a cut that reads as the script, or null) until one is
 * found. Returns the take to build, or null.
 */
export async function pickTake({ attempts, bar, verify, attempt, better, trim, stopped = () => false }) {
  let best = null;
  const tried = [];
  for (let n = 0; n < attempts && !stopped(); n++) {
    const candidate = await attempt(n);
    tried.push(candidate);
    if (!best || better(candidate, best)) best = candidate;
    if (candidate.sim >= bar && candidate.durS < 6) break;
  }
  if (verify && best && best.sim < bar && !stopped()) {
    for (const candidate of tried) {
      const cut = await trim(candidate);
      if (cut) return cut;
    }
  }
  // The budget or a quota stop cut this take's attempts (or its cuts) short before one passed: it is not built, so
  // its line ends here and --append tries it again in full, never freezing an under-the-bar take by count.
  if (best && best.sim < bar && stopped()) return null;
  return best;
}

/**
 * Build one line's due takes in script order: `take(i)` picks the best attempt of script take i (null when none was
 * built), and `ship(i, best)` masters it as file `<line>_<i>` and returns its duration. A take that throws, comes back
 * empty, or meets a stop (`stopped()`) ends the line there (`onError(i, error | null)` reports the first two). Returns
 * the line's durations and each take's state.
 */
export async function buildLine({ previous = [], plan, take, ship, stopped = () => false, onError = () => {} }) {
  const total = plan.kept + plan.build.length;
  const takes = Array.from({ length: total }, (_, i) => (i < plan.kept ? 'kept' : 'due'));
  const shipped = previous.slice(0, plan.kept);
  for (const i of plan.build) {
    const end = () => { for (let j = i; j < total; j++) takeMove(takes, j, 'missing'); };
    if (stopped()) { end(); break; }
    try {
      const best = await take(i);
      if (!best) { onError(i, null); end(); break; }
      takeMove(takes, i, 'mastering');
      shipped.push(await ship(i, best));
      takeMove(takes, i, 'built');
    } catch (error) {
      onError(i, error);
      end();
      break;
    }
  }
  return { shipped, takes };
}
