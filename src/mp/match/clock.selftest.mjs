import assert from 'node:assert/strict';
import { ServerClock, TickClock, TimeUnwrapper, filteredOffsetMs } from './clock.ts';

// ------------------------------------------------------------ offset filter
{
  const samples = [];
  for (let n = 0; n < 16; n++) samples.push({ rttMs: 100 + (n % 4) * 5, offsetMs: 500 + (n % 3) - 1, atMs: n });
  assert.equal(filteredOffsetMs(samples), 500, 'a quiet link yields the median offset');
  // Two samples on a slow asymmetric path carry a 40 ms offset error: the RTT half-filter drops them.
  samples[3] = { rttMs: 400, offsetMs: 540, atMs: 3 };
  samples[9] = { rttMs: 380, offsetMs: 545, atMs: 9 };
  assert.equal(filteredOffsetMs(samples), 500, 'slow-RTT samples are rejected before the median');
  // An offset outlier inside the fast half is more than three MADs away: rejected.
  samples[1] = { rttMs: 100, offsetMs: 900, atMs: 1 };
  assert.equal(filteredOffsetMs(samples), 500, 'a MAD outlier is rejected');
  assert.equal(filteredOffsetMs([{ rttMs: 80, offsetMs: 12, atMs: 0 }]), 12, 'one sample is its own target');
  assert.equal(filteredOffsetMs([]), 0);
}

// ------------------------------------------------------------ slew
{
  // (a WELCOME seed adds no sample: its burst of 8 is this clock's calibration)
  const clock = new ServerClock({ calibrationSamples: 8 });
  clock.seed(10_000, 1_000);
  assert.equal(clock.offset, 9_000, 'WELCOME seeds the offset directly');
  assert.equal(clock.isSeeded, true);
  // (mp-fixes-277) the WELCOME's burst calibrates: its pongs put the target 350 ms later than the seed, and the active
  // offset is the target at once (a clock without an estimate has nothing to hide a correction from)
  for (let n = 0; n < 8; n++) clock.observePong(1_000 + n * 200, 1_100 + n * 200, 10_400 + n * 200);
  assert.equal(clock.sampleCount, 8);
  assert.equal(clock.rttMs, 100);
  assert.equal(clock.rttJitterMs, 0);
  assert.equal(clock.target, 9_350, 'target = serverTime − midpoint of the round trip');
  assert.equal(clock.offset, 9_350, 'calibrating: the offset adopts the target');
  // a converged clock: the next 16 pongs move the target 300 ms, and the active offset moves at 50 ms/s
  for (let n = 0; n < 16; n++) clock.observePong(3_000 + n * 50, 3_100 + n * 50, 12_700 + n * 50);
  assert.equal(clock.target, 9_650);
  assert.equal(clock.offset, 9_350, 'past calibration a pong moves only the target');
  clock.advance(4_000);
  assert.ok(Math.abs(clock.offset - 9_362.5) < 1e-9, 'the first advance since the seed earns only the 250 ms window (12.5 ms)');
  for (let n = 1; n <= 60; n++) clock.advance(4_000 + n * 1000 / 60);
  assert.ok(Math.abs(clock.offset - 9_412.5) < 1e-9, `1 s of 60 Hz frames slews 50 ms: ${clock.offset}`);
  clock.advance(5_016);
  assert.ok(Math.abs(clock.offset - 9_413.3) < 1e-9, 'a 16 ms frame moves 0.8 ms');
  clock.advance(15_016);
  assert.ok(Math.abs(clock.offset - 9_425.8) < 1e-9, 'a 10 s suspended tab earns only the 250 ms window (12.5 ms)');
  for (let n = 0; n < 400; n++) clock.advance(15_016 + (n + 1) * 100);
  assert.ok(Math.abs(clock.offset - clock.target) < 1e-9, 'the offset converges on the target');
  assert.equal(clock.serverNow(55_016), 55_016 + 9_650);
  assert.equal(clock.observePong(100, 50, 0), null, 'a pong before its ping is rejected');
  // A 5 s error (the tab slept) snaps instead of slewing for a hundred seconds.
  for (let n = 0; n < 16; n++) clock.observePong(60_000 + n * 100, 60_100 + n * 100, 60_050 + n * 100 + 14_350);
  assert.equal(clock.target, 14_350);
  clock.advance(62_000);
  assert.equal(clock.offset, 14_350, 'an error above the hard-resync ceiling snaps');
  assert.equal(clock.hardResyncs, 1);
  clock.reset();
  assert.equal(clock.isSeeded, false);
}

// ---- (mp-fixes-277; Kevin, 276: "doesnt work super well p2p") the host's first sample is its own boot ----
// The host's HELLO waits in its Worker while the authority boots (world, collision, kernels); the WELCOME comes back the
// moment it is done. That round trip of seconds is the clock's first sample, and its midpoint puts the clock half of it
// ahead of the authority. The burst that follows measures the link (a few ms), so the target is right within ~1.6 s, but a
// clock that slewed from the seed kept the error for error / 50 ms per s: the browser run (tools/mp-two-peer-e2e.mjs) read
// 442 ms at the reveal, draining 50 ms/s, the host's own input acknowledged 30 ticks late and its controls with it.
{
  const TRUE_OFFSET = 7_000; // serverTime = localTime + 7 s
  const BOOT_MS = 1_600;
  const run = (calibrationSamples) => {
    const clock = new ServerClock(calibrationSamples === undefined ? {} : { calibrationSamples });
    // HELLO at local 1 000; the authority answers at local 2 600 (its boot), stamped then; the WELCOME is back 2 ms later
    clock.observePong(1_000, 1_000 + BOOT_MS + 2, 1_000 + BOOT_MS + 1 + TRUE_OFFSET);
    const seededError = clock.offset - TRUE_OFFSET;
    // the WELCOME's burst: 8 pings 200 ms apart over a 2 ms link
    let at = 2_700;
    for (let n = 0; n < 8; n++, at += 200) { clock.advance(at); clock.observePong(at, at + 2, at + 1 + TRUE_OFFSET); }
    clock.advance(at);
    return { clock, seededError, errorAfterBurst: clock.offset - TRUE_OFFSET };
  };
  const control = run(0); // no calibration: the clock as it was in 276
  assert.ok(control.seededError > 750, `the boot-delayed HELLO seeds the clock ~800 ms ahead (${control.seededError})`);
  assert.ok(control.errorAfterBurst > 600, `the control: slewed from that seed, ${Math.round(control.errorAfterBurst)} ms remain after the burst`);
  const fixed = run();
  assert.ok(Math.abs(fixed.errorAfterBurst) < 1000 / 60, `calibrated, the offset is within a tick of the authority after the burst (${fixed.errorAfterBurst} ms)`);
  // and a converged clock still hides a later correction behind the slew
  const clock = fixed.clock;
  const before = clock.offset;
  let at = 5_000;
  for (let n = 0; n < 16; n++, at += 100) clock.observePong(at, at + 2, at + 1 + TRUE_OFFSET + 200);
  clock.advance(at);
  const start = clock.offset;
  for (let n = 1; n <= 60; n++) clock.advance(at + n * 1000 / 60);
  assert.equal(clock.target - before, 200, 'the link moved 200 ms');
  assert.ok(Math.abs(clock.offset - start - 50) < 1e-6, `past calibration the shift slews 50 ms a second (${clock.offset - start})`);
}

// ------------------------------------------------------------ rtt smoothing
{
  const clock = new ServerClock();
  clock.observePong(0, 100, 5_000);
  assert.equal(clock.rttMs, 100);
  assert.equal(clock.isSeeded, true, 'the first pong seeds an unseeded clock');
  clock.observePong(1_000, 1_200, 6_000);
  assert.ok(Math.abs(clock.rttMs - 120) < 1e-9, 'RTT is a 0.2 low-pass');
  assert.ok(Math.abs(clock.rttJitterMs - 20) < 1e-9, 'jitter tracks the RTT variation');
}

// ------------------------------------------------------------ tick clock
{
  const ticks = new TickClock(60);
  assert.equal(ticks.isAnchored, false);
  ticks.observe(600, 10_000);
  assert.ok(Math.abs(ticks.tickAt(10_000 + 1000 / 60 * 3) - 603) < 1e-9);
  assert.ok(Math.abs(ticks.serverTimeAtTick(660) - 11_000) < 1e-9);
  ticks.observe(500, 8_000);
  assert.ok(Math.abs(ticks.tickAt(10_000) - 600) < 1e-9, 'an older pair does not move the anchor');
  ticks.observe(720, 12_010);
  assert.ok(Math.abs(ticks.tickAt(12_010) - 720) < 1e-9, 'a newer pair re-anchors (server drift correction)');
  assert.throws(() => new TickClock(0));
}

// ------------------------------------------------------------ u32 unwrap
{
  const unwrap = new TimeUnwrapper();
  assert.equal(unwrap.unwrap(0xfffffff0), 0xfffffff0);
  assert.equal(unwrap.unwrap(0x00000010), 0x100000010, 'a wrap past 2^32 continues the timeline');
  assert.equal(unwrap.unwrap(0x00000005), 0x100000005, 'a small step back is not a wrap');
  unwrap.reset();
  assert.equal(unwrap.unwrap(7), 7);
}

// ---- stall-immune reads: the window minimum, median and spread survive a pong the busy main thread delayed
{
  const clock = new ServerClock();
  let sent = 1000;
  for (const rtt of [100, 120, 110, 900, 105, 115, 108]) { clock.observePong(sent, sent + rtt, sent + rtt / 2 + 5000); sent += 1000; }
  assert.equal(clock.minRttMs, 100);
  assert.equal(clock.medianRttMs, 110);
  assert.equal(clock.rttSpreadMs, 5, 'the median absolute deviation ignores the 900 ms stall sample');
  assert.ok(clock.rttMs > 150, `the smoothed RTT is still inflated by the stall three samples later (${clock.rttMs})`);
  assert.ok(clock.rttJitterMs > 100, `the jitter EMA is inflated by the stall (${clock.rttJitterMs})`);
  const before = clock.medianRttMs;
  assert.equal(clock.medianRttMs, before, 'reads are stable and allocation-free (a reused scratch)');
  const empty = new ServerClock();
  assert.equal(empty.minRttMs, null);
  assert.equal(empty.medianRttMs, null);
  assert.equal(empty.rttSpreadMs, 0);
}

console.log('mp clock: median-of-16 with outlier rejection, the calibration burst adopts its estimate (a boot-delayed HELLO seeds no lag), 50 ms/s slew with a 250 ms window after it, hard resync, tick mapping, u32 unwrap pass');
