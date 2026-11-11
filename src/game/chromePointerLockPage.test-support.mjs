// Test support: a page whose pointer lock behaves as Chrome's (MouseLockController), with the real input layer
// (input.ts) built over it. One model for every selftest that drives the lock (inputPointerLockFocus.selftest.mjs, item
// 243; garageReturnState.selftest.mjs, round 5 U15 and Q2), so the copies cannot drift apart (round 5 flow review r1).
// - A request is answered a task later: its lock lands (pointerlockchange), or it is refused (its promise rejects and
//   pointerlockerror fires), as Chrome does.
// - After the player's own unlock (Esc while locked: userEscape) a request with no transient user activation is
//   refused; after the page's own exitPointerLock it is not (Chrome's last_unlocked_by_target).
// - Given a clock (`now`), every request in the 1250 ms after the player's Esc is refused (Chrome's post-Esc window)
//   and the clock is the page's performance.now. Without one, that window is not modelled and Node's own performance
//   stays.
// `lock`: 'chrome' (the default), 'sandboxed' (requestPointerLock throws a SecurityError in the call), 'refuse-all',
// or 'none' (a touch phone: no requestPointerLock). `input`: the body's cotInput, 'fine' or 'coarse'.
import { createInput } from './input.ts';

export const CHROME_ESCAPE_REFUSAL_MS = 1250;

class FakeMouseEvent extends Event {
  constructor(type, { target, clientX = 0, clientY = 0, button = 0 } = {}) {
    super(type, { cancelable: true });
    this.fakeTarget = target;
    this.clientX = clientX;
    this.clientY = clientY;
    this.button = button;
    this.movementX = 0;
    this.movementY = 0;
  }
  get target() { return this.fakeTarget; }
}

export function createChromePointerLockPage({ lock = 'chrome', input: inputMode = 'fine', now = null } = {}) {
  const activation = { isActive: true };
  const page = new EventTarget();
  let lastUserEscape = -Infinity;
  let unlockedByTarget = true;
  const stats = { attempts: 0, refused: 0 };
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    pointerLockElement: null,
    body: { dataset: { cotInput: inputMode } },
    exitPointerLock() {
      if (!document.pointerLockElement) return;
      unlockedByTarget = true;
      document.pointerLockElement = null;
      queueMicrotask(() => document.dispatchEvent(new Event('pointerlockchange')));
    },
  });
  const canvas = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }),
  });
  const refuse = () => {
    stats.refused += 1;
    setImmediate(() => document.dispatchEvent(new Event('pointerlockerror')));
    return Promise.reject(new Error('pointer lock refused'));
  };
  const land = () => {
    document.pointerLockElement = canvas;
    document.dispatchEvent(new Event('pointerlockchange'));
  };
  if (lock === 'chrome') {
    canvas.requestPointerLock = () => {
      stats.attempts += 1;
      if (!unlockedByTarget && !activation.isActive) return refuse();
      if (now && now() < lastUserEscape + CHROME_ESCAPE_REFUSAL_MS) return refuse();
      setImmediate(land);
      return Promise.resolve();
    };
  } else if (lock === 'sandboxed') {
    canvas.requestPointerLock = () => {
      stats.attempts += 1;
      throw new DOMException('The root document of this element is not valid for pointer lock.', 'SecurityError');
    };
  } else if (lock === 'refuse-all') {
    canvas.requestPointerLock = () => { stats.attempts += 1; return refuse(); };
  }
  // touch phones: 'none' leaves requestPointerLock undefined (a call would throw a TypeError)

  const globals = {
    window: page,
    document,
    localStorage: { getItem: () => null, setItem() {} },
    navigator: { userActivation: activation },
    ...(now ? { performance: { now } } : {}),
    matchMedia: (query) => ({ matches: inputMode === 'coarse' ? query === '(pointer: coarse)' : query === '(pointer: fine)' }),
  };
  const prior = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const input = createInput({ lockElement: canvas });
  return {
    input, document, canvas, activation, stats,
    locked: () => document.pointerLockElement === canvas,
    /** The page's own unlock: main's binding of the Garage return's ui.exitPointerLock. */
    exitPointerLock: () => { if (document.exitPointerLock) document.exitPointerLock(); },
    mouse: (type, target, clientX, clientY) => page.dispatchEvent(new FakeMouseEvent(type, { target, clientX, clientY })),
    /** The player's Esc while locked: Chrome consumes it and drops the lock (a user unlock). */
    userEscape() {
      if (now) lastUserEscape = now();
      unlockedByTarget = false;
      document.pointerLockElement = null;
      document.dispatchEvent(new Event('pointerlockchange'));
    },
    /**
     * A lock that lands with no request of the input layer's since its last answered one. input.ts is the page's only
     * requester and Chrome answers each request once, so the product never sees this: it reaches the input layer's
     * guards against a mark left on an answered attempt.
     */
    landWithoutRequest: land,
    restore() {
      for (const [key, descriptor] of Object.entries(prior)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}
