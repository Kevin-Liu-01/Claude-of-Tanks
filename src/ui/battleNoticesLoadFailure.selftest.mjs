// battleNoticesLoadFailure.selftest.mjs — the battle's notices survive one failed chunk (2026-11-02 audit R6, review
// round 1). Copyright © 2026 Kevin B. Liu.
//
// The battle's notice region (battleNotices.ts) loads the kit's notices (components/notice.ts, a chunk of its own) with
// its first notice, and the pointer lock's runtime loads the region (battleNotices.ts, a chunk of its own too) with its
// first. Each kept its import with `??=`: one failed chunk, an offline blip, and every later battle notice (the HUD's
// parked aim warnings, the pointer lock's prompt, the network's banner) was dropped for the document, silently. Both are
// app/lazyChunk.ts now: the next notice asks again, and a dismiss never fetches. A chunk "fails" here the way a browser's
// import does when the network drops: its resolve throws once.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const notified = [];
const dismissed = [];
const regions = [];
globalThis.__noticeKitStub = { notified, dismissed, regions };
const KIT = `data:text/javascript,${encodeURIComponent(`
  const stub = globalThis.__noticeKitStub;
  export function noticeRegion(name, options) { stub.regions.push(name); }
  export function notify(options) { stub.notified.push(options); return { dismiss() {} }; }
  export function dismissNotice(id) { stub.dismissed.push(id); }
`)}`;
const failing = new Set();
const asked = [];
const hook = registerHooks({
  resolve(specifier, context, next) {
    const parent = context.parentURL ?? '';
    const watched = (parent.endsWith('/src/ui/battleNotices.ts') && specifier === './components/notice.ts')
      || (parent.endsWith('/src/game/pointerLockFeedbackRuntime.ts') && specifier === '../ui/battleNotices.ts');
    if (!watched) return next(specifier, context);
    asked.push(specifier);
    if (failing.delete(specifier)) throw new TypeError(`Failed to fetch dynamically imported module: ${specifier}`);
    return specifier === './components/notice.ts' ? { url: KIT, shortCircuit: true } : next(specifier, context);
  },
});
globalThis.document = { querySelector: () => null };
globalThis.window = { dispatchEvent() { return true; } };
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve)); };

// ---- the region's kit: one failed chunk, then the next notice reaches notify()
const { battleNotices } = await import('./battleNotices.ts');
{
  failing.add('./components/notice.ts');
  battleNotices.show({ id: 'cot-aim-warning', text: 'parked' });
  await settle();
  assert.deepEqual(notified, [], 'the kit did not arrive: that notice is lost');
  battleNotices.dismiss('cot-aim-warning');
  await settle();
  assert.equal(asked.filter((specifier) => specifier === './components/notice.ts').length, 1, 'a dismiss never fetches');
  battleNotices.show({ id: 'cot-aim-warning', text: 'parked again' });
  await settle();
  assert.deepEqual(notified.map((options) => [options.id, options.text, options.region]), [['cot-aim-warning', 'parked again', 'battle']],
    'the next notice asks the kit again and shows (it was dropped for the document)');
  assert.deepEqual(regions, ['battle']);
  battleNotices.dismiss('cot-aim-warning');
  await settle();
  assert.deepEqual(dismissed, ['cot-aim-warning']);
}

// ---- the pointer lock's region port: one failed chunk, then its next notice shows
{
  const { createBus } = await import('../game/stateCore.ts');
  const { createPointerLockFeedbackRuntime } = await import('../game/pointerLockFeedbackRuntime.ts');
  let denied = null;
  let restored = null;
  const runtime = createPointerLockFeedbackRuntime({
    input: {
      isTouchLayout: () => false, isLocked: () => false, requestLock: () => {},
      onLockDenied: (listener) => { denied = listener; return () => {}; },
      onLockRestored: (listener) => { restored = listener; return () => {}; },
    },
    bus: createBus(),
    canvas: { addEventListener() {}, removeEventListener() {} },
    audioResume: () => {},
    isBattleStageVisible: () => true,
    canRecapturePointer: () => true,
    ensureTouchControls: async () => null,
  });
  notified.length = 0;
  failing.add('../ui/battleNotices.ts');
  denied();
  await settle();
  assert.deepEqual(notified, [], 'the region did not arrive: that prompt is lost');
  restored(); // a dismiss while the region is failed fetches nothing
  await settle();
  assert.equal(asked.filter((specifier) => specifier === '../ui/battleNotices.ts').length, 1);
  denied();
  await settle();
  assert.deepEqual(notified.map((options) => options.id), ['cot-pointer-lock'], "the pointer lock's next prompt asks the region again and shows");
  runtime.dispose();
}

hook.deregister();
delete globalThis.__noticeKitStub;
console.log('battleNoticesLoadFailure.selftest: a failed notice kit or region chunk is asked again by the next notice; a dismiss never fetches');
