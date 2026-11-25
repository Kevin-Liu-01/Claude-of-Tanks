// A replay film is fixed-step (replay-fixes-277, Kevin 11-24 "export it as a mp4"): the film session ticks the page
// exactly 1/fps apart, from the range's start at 1x, at the film's size, and always gives the page back (its size, its
// live loop) at the end. Its frames match the range and rate. Ports are stubs: no page, no encoder (exportFilm drives the
// same begin / renderNext / end on the page; tools/replay-ui-flow.browser.selftest.mjs films a real replay).
import assert from 'node:assert/strict';
import { createReplayFilmSession, REPLAY_FILM_RATES, REPLAY_FILM_SIZES, replayFilmBitrate, replayFilmFrames } from './replayFilm.ts';

assert.equal(replayFilmFrames(0, 30, 30), 900);
assert.equal(replayFilmFrames(10, 12.5, 60), 150);
assert.equal(replayFilmFrames(5, 5, 30), 1, 'an empty range is one frame');
assert.equal(replayFilmFrames(12, 10, 30), 60, 'a range given backwards is the same range');
assert.deepEqual(REPLAY_FILM_SIZES.map((size) => `${size.width}x${size.height}`), ['1280x720', '1920x1080']);
assert.deepEqual([...REPLAY_FILM_RATES], [30, 60]);
assert.deepEqual([[1280, 720, 30], [1280, 720, 60], [1920, 1080, 30], [1920, 1080, 60]].map(([w, h, f]) => replayFilmBitrate(w, h, f)),
  [5_000_000, 7_500_000, 8_000_000, 12_000_000], 'the upload rates for game footage');

function stubPage(durationS = 40) {
  const log = [];
  let timeS = 0, playing = false, speed = 4, size = { width: 1600, height: 900, pixelRatio: 2 }, held = false;
  const ports = {
    canvas: { id: 'renderer' },
    readSize: () => ({ ...size }),
    applySize: (width, height, pixelRatio) => { size = { width, height, pixelRatio }; log.push(['size', width, height, pixelRatio]); },
    hold: (on) => { held = on; log.push(['hold', on]); },
    tick: (nowMs) => { log.push(['tick', nowMs, timeS]); if (playing) timeS = Math.min(durationS, timeS + (1 / 30) * speed); },
    clock: {
      seek: (t) => { timeS = t; log.push(['seek', t]); },
      play: () => { playing = true; log.push(['play']); },
      pause: () => { playing = false; log.push(['pause']); },
      setSpeed: (value) => { speed = value; log.push(['speed', value]); },
      get timeS() { return timeS; },
      durationS,
    },
    now: () => 1000,
  };
  return { ports, log, state: () => ({ timeS, playing, speed, size, held }) };
}

// a 2 s range at 30 fps from 10 s: 60 frames, each tick 1000/30 ms after the last, played at 1x from 10 s
{
  const { ports, log, state } = stubPage();
  const session = createReplayFilmSession(ports, { width: 1920, height: 1080, fps: 30, fromS: 10, toS: 12 });
  assert.equal(session.frames, 60);
  assert.equal(session.canvas, ports.canvas, 'a clean film encodes the renderer\'s own canvas');
  const info = session.begin();
  assert.deepEqual([info.width, info.height, info.fps, info.frames], [1920, 1080, 30, 60]);
  assert.equal(state().held, true, 'the live loop waits while the film renders');
  assert.deepEqual(state().size, { width: 1920, height: 1080, pixelRatio: 1 }, 'the film renders at its own size, ratio 1');
  assert.equal(state().speed, 1, 'at 1x');
  assert.equal(state().timeS, 10, 'from the range\'s start (after the settle frame)');
  assert.equal(state().playing, true);
  const ticksBefore = log.filter((entry) => entry[0] === 'tick').length;
  for (let k = 0; k < session.frames; k++) session.renderNext();
  const ticks = log.filter((entry) => entry[0] === 'tick').slice(ticksBefore);
  assert.equal(ticks.length, 60, 'one main frame per film frame');
  for (let k = 1; k < ticks.length; k++) assert.ok(Math.abs(ticks[k][1] - ticks[k - 1][1] - 1000 / 30) < 1e-9, 'ticks exactly 1/fps apart');
  assert.ok(Math.abs(state().timeS - 12) < 1e-9, 'the battle moved exactly the range');
  session.end();
  assert.equal(state().held, false, 'the live loop is given back');
  assert.deepEqual(state().size, { width: 1600, height: 900, pixelRatio: 2 }, 'the page\'s own size is restored');
  assert.equal(state().playing, false);
  session.end(); // a second end (exportFilm's finally after a failure) changes nothing
  assert.equal(log.filter((entry) => entry[0] === 'hold' && entry[1] === false).length, 1);
}

// the range is clamped to the replay; with an overlay the composite canvas is encoded and drawn every frame
{
  const { ports } = stubPage(8);
  let drawn = 0;
  const canvas = { getContext: () => ({ id: '2d' }) };
  const session = createReplayFilmSession({ ...ports, makeCanvas: (w, h) => { assert.deepEqual([w, h], [1280, 720]); return canvas; },
    overlay: (context, source, w, h) => { assert.equal(source, ports.canvas); assert.deepEqual([w, h], [1280, 720]); drawn++; } },
  { width: 1280, height: 720, fps: 60, fromS: 0, toS: 99 });
  assert.equal(session.frames, 480, 'the range ends with the replay');
  assert.equal(session.canvas, canvas);
  session.begin();
  for (let k = 0; k < 5; k++) session.renderNext();
  session.end();
  assert.equal(drawn, 5);
}

console.log('replayFilm: PASS (fixed-step 1/fps ticks at 1x over the range; the page\'s size and loop restored; overlay composited)');
