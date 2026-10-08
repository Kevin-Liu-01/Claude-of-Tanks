const STANDARD_RISES = [.045, .085, .125];

// A custom bracket height belongs only to its authored position and hardware.
// It must not leak into the broad grid search when that exact position fails.
export function* missionSeatTrials(candidates, authored) {
  if (authored) {
    const {candidate, riseM} = authored;
    if (!candidate || !Number.isFinite(riseM) || riseM < .025 || riseM > .35
      || (riseM > .2 && candidate.braced !== true)) {
      throw new Error('Invalid authored dock rise or missing tall-stand braces');
    }
    yield {candidate, rise: riseM};
  }
  for (const rise of STANDARD_RISES) {
    for (const candidate of candidates) yield {candidate, rise};
  }
}
