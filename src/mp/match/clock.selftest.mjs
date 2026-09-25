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
  const clock = new ServerClock();
  clock.seed(10_000, 1_000);
  assert.equal(clock.offset, 9_000, 'WELCOME seeds the offset directly');
  assert.equal(clock.isSeeded, true);
  // Pongs put the target 300 ms later than the seed; the active offset moves at 50 ms/s.
  for (let n = 0; n < 8; n++) clock.observePong(1_000 + n * 200, 1_100 + n * 200, 10_400 + n * 200);
  assert.equal(clock.sampleCount, 8);
  assert.equal(clock.rttMs, 100);
  assert.equal(clock.rttJitterMs, 0);
  assert.equal(clock.target, 9_350, 'target = serverTime − midpoint of the round trip');
  clock.advance(1_000);
  assert.equal(clock.offset, 9_000, 'the first advance establishes the reference time');
  for (let n = 1; n <= 60; n++) clock.advance(1_000 + n * 1000 / 60);
  assert.ok(Math.abs(clock.offset - 9_050) < 1e-9, `1 s of 60 Hz frames slews 50 ms: ${clock.offset}`);
  clock.advance(2_016);
  assert.ok(Math.abs(clock.offset - 9_050.8) < 1e-9, 'a 16 ms frame moves 0.8 ms');
  clock.advance(12_016);
  assert.ok(Math.abs(clock.offset - 9_063.3) < 1e-9, 'a 10 s suspended tab earns only the 250 ms window (12.5 ms)');
  for (let n = 0; n < 400; n++) clock.advance(12_016 + (n + 1) * 100);
  assert.ok(Math.abs(clock.offset - clock.target) < 1e-9, 'the offset converges on the target');
  assert.equal(clock.serverNow(52_016), 52_016 + 9_350);
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

console.log('mp clock: median-of-16 with outlier rejection, 50 ms/s slew with a 250 ms window, hard resync, tick mapping, u32 unwrap pass');
