// tools/audio/voicePlan.mjs — which takes of a crew line build-voices.mjs keeps and builds, and the build of one line's
// pack. Factored out of build-voices.mjs unchanged (round 8 Y9 s1-12), so a selftest can drive it without the API.

/**
 * --append's keep rule: a line keeps its shipped takes (their files and durations) when the script still has at least
 * as many and every one's file exists; `exists(i)` says whether `<line>_<i>.webm` is on disk.
 */
export function planLine({ previous = [], takes, append, exists }) {
  const kept = append && previous.length <= takes.length && previous.every((_, i) => exists(i)) ? previous.length : 0;
  return { kept, build: takes.map((_, i) => i).slice(kept) };
}

/**
 * Build one line's takes in script order: `take(i)` picks the best attempt of script take i (null when none), and
 * `ship(index, best)` masters it as file `<line>_<index>` and returns its duration. Returns the line's durations.
 */
export async function buildLine({ previous = [], plan, take, ship, stopped = () => false, onError = () => {} }) {
  const shipped = previous.slice(0, plan.kept);
  for (const i of plan.build) {
    if (stopped()) break;
    try {
      const best = await take(i);
      if (!best) continue;
      shipped.push(await ship(shipped.length, best));
    } catch (error) {
      onError(i, error);
    }
  }
  return shipped;
}
