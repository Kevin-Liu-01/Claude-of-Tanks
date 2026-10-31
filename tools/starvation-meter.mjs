/**
 * Starvation meter: a harness that measures host time (tick rate, tick cost, stalls, round trips) on a shared machine
 * also measures the machine. Every `periodMs` the meter reads the wall clock and this thread's CPU clock; between two
 * samples the thread either ran (CPU), idled until the next timer (at most the period), or was runnable and did not run.
 * Wall time beyond CPU plus the period (and `slackMs` of timer noise) is that last part: the interval is starved by it.
 * A gate then takes out of each measurement the starvation inside its own span (`starvedIn`): a round trip, a second of
 * ticks, a frame in flight is judged on the time the thread had. A stall the code causes itself spends CPU, is never
 * starved and stays judged (mp-soak's planted stall).
 *
 * The limit: wall time without CPU is also what a synchronous block looks like (a sync syscall, Atomics.wait), so a
 * gate that must catch blocking calls cannot be excused this way. (macOS counts every timeslice as an involuntary
 * context switch, so the rusage switch counters cannot tell the two apart: a 200 ms Atomics.wait counted 0 voluntary.)
 * First-party tooling: Kevin B. Liu.
 */

/** This thread's CPU time in ms (user + system). */
export function threadCpuMs() {
  const { user, system } = process.threadCpuUsage();
  return (user + system) / 1000;
}

/**
 * `onInterval(interval)` runs after every sample with `{ startMs, endMs, wallMs, cpuMs, starvedMs }`; the timer seams
 * (`now`, `cpuNow`, `sample()` without `start()`) let a receipt drive it by hand.
 */
export function createStarvationMeter({ periodMs = 5, slackMs = 2, now = () => performance.now(), cpuNow = threadCpuMs, onInterval = null } = {}) {
  // starved intervals only, in time order (a quiet run keeps none)
  const starved = [];
  let last = null;
  let timer = null;
  let intervals = 0;
  let starvedMs = 0;
  let longestMs = 0;
  function sample() {
    const at = { wall: now(), cpu: cpuNow() };
    if (last) {
      const wallMs = at.wall - last.wall;
      const cpuMs = at.cpu - last.cpu;
      const interval = { startMs: last.wall, endMs: at.wall, wallMs, cpuMs, starvedMs: Math.max(0, wallMs - cpuMs - periodMs - slackMs) };
      intervals++;
      if (interval.starvedMs > 0) {
        starved.push(interval);
        starvedMs += interval.starvedMs;
        if (interval.starvedMs > longestMs) longestMs = interval.starvedMs;
      }
      if (onInterval) onInterval(interval);
    }
    last = at;
  }
  /** The first starved interval ending after `atMs` (binary search). */
  function firstEndingAfter(atMs) {
    let lo = 0, hi = starved.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (starved[mid].endMs > atMs) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }
  return {
    periodMs,
    slackMs,
    start() {
      if (timer) return;
      sample();
      timer = setInterval(sample, periodMs);
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      sample();
    },
    sample,
    /**
     * Starved ms inside [fromMs, toMs]: each overlapping interval's starvation in proportion to its overlap (where in an
     * interval the thread lost the CPU is unknown).
     */
    starvedIn(fromMs, toMs) {
      let sum = 0;
      for (let index = firstEndingAfter(fromMs); index < starved.length && starved[index].startMs < toMs; index++) {
        const interval = starved[index];
        const overlap = Math.min(toMs, interval.endMs) - Math.max(fromMs, interval.startMs);
        if (overlap > 0) sum += interval.starvedMs * overlap / interval.wallMs;
      }
      return sum;
    },
    summary() {
      return { intervals, starvedIntervals: starved.length, starvedMs, longestMs };
    },
  };
}
