// game-readiness.mjs — how the harnesses ask the game for its path and wait on its state (2026-11-02 audit S3).
//
// Automation path. The game reads its automation path in one place (src/app/automationPath.ts). With no request, a
// page under navigator.webdriver takes the harness path: the entry gate auto-skips, transitions run with no veil, and
// the scene watchdogs and device-diag rescue stay off. A receipt that must certify the player's path asks for it with
// `requestAutomationPath(page, 'player')` before navigating (never by hiding navigator.webdriver, which also lied to
// analytics and telemetry). docs/AUTOMATION-PATHS.md lists which tools take which path and how they enter a battle;
// tools/game-readiness.selftest.mjs keeps that page true.

/** The paths the game understands (src/app/automationPath.ts AutomationPath). */
export const AUTOMATION_PATHS = Object.freeze(['player', 'harness']);

function assertPath(path) {
  if (!AUTOMATION_PATHS.includes(path)) throw new TypeError(`unknown automation path ${String(path)} (player | harness)`);
}

/** The init-script source that makes the request, for a tool whose probe is one script string. */
export function automationPathScript(path) {
  assertPath(path);
  return `window.__COT_AUTOMATION = ${JSON.stringify(path)};`;
}

/** Ask the game for its automation path before the page's scripts run (puppeteer's evaluateOnNewDocument). */
export async function requestAutomationPath(page, path) {
  assertPath(path);
  await page.evaluateOnNewDocument((value) => { window.__COT_AUTOMATION = value; }, path);
}

// Readiness. The game publishes its lifecycle read-only as `window.__APP_LIFECYCLE` (src/game/appLifecycle.ts, a
// snapshot { state, phase, screenPhase, transitions, lastReason }). Wait on it here, never on a hand-built predicate:
// the audit counted eight definitions of "the battle is playable" (phase, preBattleS, the loader's classes read four
// ways, the HUD's display, __BATTLE_REVEAL, result, timeS) and three of "the Garage is ready", which disagreed at the
// edges (a cover still fading, a return still under its veil, a Garage prepared behind the battle report).

/** The lifecycle's states (src/game/appLifecycle.ts AppLifecycleState; the selftest pins the list to the union). */
export const APP_LIFECYCLE_STATES = Object.freeze([
  'boot', 'garage', 'returning', 'loading', 'countdown', 'live', 'verdict', 'report', 'studio', 'shot',
]);

/** Each named readiness and the lifecycle states that satisfy it. */
export const READY = Object.freeze({
  /** A settled Garage screen: the boot splash gone, no return under its veil, not prepared behind the battle report. */
  garage: Object.freeze(['garage']),
  /** The battle is on screen: its entry cover is gone (the countdown may still hold the controls). */
  battleRevealed: Object.freeze(['countdown', 'live', 'verdict', 'report']),
  /** The countdown is over: the controls were released in this battle (its verdict may have landed since). */
  controlsReleased: Object.freeze(['live', 'verdict', 'report']),
  /** Controls released and no verdict yet. */
  battleLive: Object.freeze(['live']),
  /** The verdict landed (its hold, or the report). */
  battleEnded: Object.freeze(['verdict', 'report']),
  studio: Object.freeze(['studio']),
});

/**
 * In-page (self-contained: waitForFunction and evaluate serialize it): the page's readiness facts. `booted` is the boot
 * latch's harness mirror (the entry gate may still wait on the player); `state` is the published lifecycle's, null on
 * a build that publishes none; `automation` the path the page resolved (docs/AUTOMATION-PATHS.md).
 */
export function readinessInPage() {
  let lifecycle = null;
  let automation = null;
  try { lifecycle = window.__APP_LIFECYCLE ?? null; } catch { lifecycle = null; }
  try { automation = window.__AUTOMATION_PATH?.path ?? null; } catch { automation = null; }
  const published = !!lifecycle && typeof lifecycle.state === 'string';
  return {
    booted: window.__GAME_READY === true,
    state: published ? lifecycle.state : null,
    phase: published ? lifecycle.phase : null,
    screenPhase: published ? lifecycle.screenPhase : null,
    transitions: published && Number.isFinite(lifecycle.transitions) ? lifecycle.transitions : null,
    automation,
  };
}

function wantedStates(name) {
  const wanted = READY[name];
  if (!wanted) throw new TypeError(`game-readiness: unknown readiness ${String(name)} (${Object.keys(READY).join(', ')})`);
  return wanted;
}

/**
 * The in-page expression that turns true once the page is `name` (a READY key). `since`: a lifecycle `transitions`
 * count the page must have moved past (the next battle, not the one already on screen). A booted page that publishes
 * no lifecycle also turns it true, so a wait on an older build fails by name (waitForReady) instead of timing out.
 */
export function readinessExpression(name, { since = null } = {}) {
  const wanted = wantedStates(name);
  if (since !== null && !Number.isFinite(since)) throw new TypeError('game-readiness: since is a transitions count');
  return `((read, wanted, since) => { const r = read(); if (!r.booted) return false; if (r.state === null) return true;`
    + ` if (since !== null && !(r.transitions > since)) return false; return wanted.includes(r.state); })`
    + `(${readinessInPage.toString()}, ${JSON.stringify(wanted)}, ${JSON.stringify(since)})`;
}

/** The page's readiness facts now (readinessInPage), for a receipt or a `since`. */
export function readGameReadiness(page) {
  return page.evaluate(readinessInPage);
}

/**
 * Wait until the page is `name` (a READY key). `options` are waitForFunction's (timeout, polling) plus `since`.
 * Returns the facts it saw; throws by name on a build that publishes no lifecycle.
 */
export async function waitForReady(page, name, { since = null, ...options } = {}) {
  await page.waitForFunction(readinessExpression(name, { since }), options);
  const facts = await readGameReadiness(page);
  if (facts.state === null) {
    throw new Error(`game-readiness: this page publishes no window.__APP_LIFECYCLE (a build before 2026-11-03?), so it cannot wait for ${name}`);
  }
  return facts;
}

/** The boot finished loading: the latch's harness mirror. The entry gate may still wait on the player. */
export const BOOT_LOADED_EXPRESSION = 'window.__GAME_READY === true';

/** Wait for the boot to finish loading (the harness mirror, src/app/bootReadiness.ts). `options`: waitForFunction's. */
export function waitForBootLoaded(page, options = {}) {
  return page.waitForFunction(BOOT_LOADED_EXPRESSION, options);
}
