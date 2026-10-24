import assert from 'node:assert/strict';

import { installBattleEndGarageWarm } from './battleEndGarageWarm.ts';
import { reportBackdrop, setReportBackdropOwner } from '../ui/reportBackdrop.ts';

const STILL = '/maps/verdant.webp';

function createFixture({ eligible = true, enabled = true, prepared = true, frameWidth = 1920, frameHeight = 1080 } = {}) {
  const handlers = new Map();
  const bus = {
    on(type, handler) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(handler);
    },
    emit(type, payload) { for (const handler of handlers.get(type) ?? []) handler(payload); },
  };
  const timers = [];
  const errors = [];
  const canvases = [];
  let prepares = 0;
  let renders = 0;
  let now = 1000;
  let isEligible = eligible;
  let prepareResult = prepared;
  let frameError = null;
  const frame = { width: frameWidth, height: frameHeight };
  const warm = installBattleEndGarageWarm({
    bus,
    prepare: async () => {
      prepares += 1;
      now += 4200;
      if (prepareResult instanceof Error) throw prepareResult;
      return prepareResult;
    },
    isEligible: () => isEligible,
    renderFrame: () => {
      renders += 1;
      if (frameError) throw frameError;
      return frame;
    },
    createCanvas: (width, height) => {
      const draws = [];
      const canvas = {
        width, height, draws,
        getContext: (kind) => (kind === '2d' ? { drawImage: (...args) => draws.push(args) } : null),
        toDataURL: (type, quality) => `data:${type};q=${quality};${width}x${height}`,
      };
      canvases.push(canvas);
      return canvas;
    },
    enabled,
    setTimer: (callback, milliseconds) => {
      const timer = { callback, milliseconds, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => { timer.cleared = true; },
    now: () => now,
    reportError: (message, error) => errors.push([message, error]),
  });
  const fire = async () => {
    const timer = timers.findLast((entry) => !entry.cleared && !entry.fired);
    assert.ok(timer, 'a warm start is scheduled');
    timer.fired = true;
    timer.callback();
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  };
  return {
    bus, warm, timers, errors, canvases, frame, fire,
    get prepares() { return prepares; },
    get renders() { return renders; },
    setEligible(value) { isEligible = value; },
    setPrepareResult(value) { prepareResult = value; },
    setFrameError(value) { frameError = value; },
  };
}

// The report's backdrop: the still, untouched, when no battle stands behind the report (a capture harness).
{
  const fixture = createFixture();
  assert.equal(reportBackdrop(STILL), STILL, 'the installed owner answers the end screen');
  assert.equal(reportBackdrop(null), null);
  assert.equal(fixture.timers.length, 0, 'no battle, nothing to warm');
  assert.equal(fixture.renders, 0, 'no battle, no frame to freeze');
}

// A battle's report with the map's end still: no frozen frame; the warm starts once the entrance has played.
{
  const fixture = createFixture();
  fixture.bus.emit('battle:ended', { result: 'victory' });
  assert.equal(reportBackdrop(STILL), STILL);
  assert.equal(fixture.renders, 0, 'a map with a still never renders a frozen frame');
  assert.equal(fixture.timers.length, 1);
  assert.equal(fixture.timers[0].milliseconds, 700, 'the report entrance plays before any link');
  assert.equal(fixture.prepares, 0);
  await fixture.fire();
  assert.equal(fixture.prepares, 1);
  assert.deepEqual(
    { ...fixture.warm.stats },
    { reports: 1, frozenFrames: 0, started: 1, prepared: 1, refused: 0, failed: 0, lastPrepareMs: 4200 },
  );
  assert.equal(reportBackdrop(STILL), STILL, 'a report shown again neither re-warms nor re-freezes');
  assert.equal(fixture.timers.length, 1);
}

// No still: the battle's last frame, rendered now and copied at most 960 px wide.
{
  const fixture = createFixture();
  fixture.bus.emit('battle:ended', {});
  const frozen = reportBackdrop(null);
  assert.equal(frozen, 'data:image/jpeg;q=0.82;960x540');
  assert.equal(fixture.renders, 1, 'the frame is rendered in the copying task (a valid drawing buffer)');
  assert.deepEqual(fixture.canvases[0].draws, [[fixture.frame, 0, 0, 960, 540]]);
  assert.equal(fixture.warm.stats.frozenFrames, 1);
  assert.equal(reportBackdrop(null), frozen, 'the report shown again keeps its battle\'s frozen frame');
  assert.equal(fixture.renders, 1);
  fixture.bus.emit('battle:ended', {});
  assert.equal(reportBackdrop(STILL), STILL, 'the next battle\'s still replaces it');
}

// A phone's narrow canvas is copied at its own size.
{
  const fixture = createFixture({ frameWidth: 780, frameHeight: 360 });
  fixture.bus.emit('battle:ended', {});
  assert.equal(reportBackdrop(null), 'data:image/jpeg;q=0.82;780x360');
}

// The report may be shown with no frame to copy: a lost device, a failed render. It stays opaque (no backdrop image).
{
  const fixture = createFixture({ frameWidth: 0 });
  fixture.bus.emit('battle:ended', {});
  assert.equal(reportBackdrop(null), null);
  assert.equal(fixture.canvases.length, 0);
  const throwing = createFixture();
  throwing.setFrameError(new Error('context lost'));
  throwing.bus.emit('battle:ended', {});
  assert.equal(reportBackdrop(null), null);
  assert.equal(throwing.errors[0][0], 'battle report frozen frame');
  assert.equal(throwing.timers.length, 1, 'a missing frozen frame does not cancel the warm');
}

// Eligibility is read when the warm would start: a room, a transition, an entry or Studio by then refuses it.
{
  const fixture = createFixture();
  fixture.bus.emit('battle:ended', {});
  reportBackdrop(STILL);
  fixture.setEligible(false);
  await fixture.fire();
  assert.equal(fixture.prepares, 0);
  assert.equal(fixture.warm.stats.refused, 1);
}

// Battle Again, the campaign's next operation, any battle start or phase change retires a pending start.
for (const type of ['ui:battleAgain', 'ui:campaignNext', 'ui:battleStart', 'phase:change']) {
  const fixture = createFixture();
  fixture.bus.emit('battle:ended', {});
  reportBackdrop(STILL);
  fixture.bus.emit(type, { phase: 'garage' });
  assert.equal(fixture.timers[0].cleared, true, `${type}: the pending warm start is cancelled`);
  const before = createFixture();
  before.bus.emit('battle:ended', {});
  before.bus.emit(type, { phase: 'battle' });
  assert.equal(reportBackdrop(STILL), STILL);
  assert.equal(before.timers.length, 0, `${type} before the report: no warm`);
}

// A refused or failed preparation is counted, never thrown.
{
  const refused = createFixture({ prepared: false });
  refused.bus.emit('battle:ended', {});
  reportBackdrop(STILL);
  await refused.fire();
  assert.equal(refused.warm.stats.refused, 1);
  assert.equal(refused.warm.stats.prepared, 0);
  const failed = createFixture({ prepared: new Error('chunk failed') });
  failed.bus.emit('battle:ended', {});
  reportBackdrop(STILL);
  await failed.fire();
  assert.equal(failed.warm.stats.failed, 1);
  assert.equal(failed.errors[0][0], 'battle-end Garage warm');
}

// `?garagePrewarm=0` (the owed A/B's control): the opaque backdrop stays, the warm never starts.
{
  const fixture = createFixture({ enabled: false });
  fixture.bus.emit('battle:ended', {});
  assert.equal(reportBackdrop(null), 'data:image/jpeg;q=0.82;960x540');
  assert.equal(fixture.timers.length, 0);
}

assert.throws(() => installBattleEndGarageWarm({}), /requires its bus, prepare, eligibility and frame ports/);
setReportBackdropOwner(null);
assert.equal(reportBackdrop(STILL), STILL, 'without an owner the end screen shows the still alone');

console.log('battleEndGarageWarm.selftest: report backdrop, frozen frame, delayed warm, eligibility and retirement pass');
