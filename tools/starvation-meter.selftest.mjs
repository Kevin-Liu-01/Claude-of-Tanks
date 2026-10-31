// The starvation meter (267, mp-soak's load class): on driven clocks, an interval the thread idled through or spent on
// its own work is not starved and one it lost is, by the wall time CPU and the period do not cover; `starvedIn` shares an
// interval's starvation by overlap. On the real clock, a blocked thread spends no CPU and a busy one does.
// First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { createStarvationMeter, threadCpuMs } from './starvation-meter.mjs';

let wall = 1000, cpu = 0;
const seen = [];
const meter = createStarvationMeter({ periodMs: 5, slackMs: 2, now: () => wall, cpuNow: () => cpu, onInterval: (interval) => seen.push(interval) });
meter.sample();
wall += 5; cpu += 1; meter.sample(); // idle until the next sample
wall += 400; cpu += 400; meter.sample(); // the code's own 400 ms stall: CPU, never the machine's
wall += 300; cpu += 20; meter.sample(); // descheduled: 300 ms of wall, 20 of CPU
wall += 6; cpu += 6; meter.sample();
assert.deepEqual(seen.map((interval) => interval.starvedMs), [0, 0, 273, 0], 'only the lost interval is starved, by wall - CPU - period - slack');
assert.deepEqual(meter.summary(), { intervals: 4, starvedIntervals: 1, starvedMs: 273, longestMs: 273 });
assert.equal(meter.starvedIn(1405, 1705), 273, 'a span covering the interval takes all of it');
assert.equal(meter.starvedIn(1405, 1555), 136.5, 'half the interval, half its starvation');
assert.equal(meter.starvedIn(1000, 1405), 0, 'the busy interval before it lends none');
assert.equal(meter.starvedIn(1705, 1711), 0);

// the real clock: Atomics.wait blocks without CPU, a spin spends it (a loaded machine may slow the spin, never stop it)
const blockFrom = threadCpuMs();
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60);
const blockedCpu = threadCpuMs() - blockFrom;
assert.ok(blockedCpu < 20, `a 60 ms block spent ${blockedCpu.toFixed(1)} ms of CPU`);
const spinFrom = threadCpuMs();
while (threadCpuMs() - spinFrom < 20) { /* spin until the thread has had 20 ms */ }
console.log(`starvation-meter.selftest: driven intervals (idle, own stall, lost 273 ms) and overlap shares hold; a 60 ms block spent ${blockedCpu.toFixed(1)} ms of CPU`);
