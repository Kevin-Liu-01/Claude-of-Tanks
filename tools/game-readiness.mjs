// game-readiness.mjs — how the harnesses ask the game for its path and wait on its state (2026-11-02 audit S3).
//
// Automation path. The game reads its automation path in one place (src/app/automationPath.ts), from an explicit
// request only: a page that asks for nothing is a player's page, whoever drives it. Every page a launched browser hands
// out (tools/browser-launch.mjs launchGuardedBrowser -> prepareToolBrowser) asks for the harness path before its first
// navigation: the entry gate auto-skips, transitions run with no veil, and the scene watchdogs and device-diag rescue
// stay off. A receipt that must certify the player's path asks for it with `requestAutomationPath(page, 'player')`
// before navigating (its request runs after the launcher's and wins), and checks after the boot that the page took it
// (`assertAutomationPath`). docs/AUTOMATION-PATHS.md lists which tools take which path and how they enter a battle;
// src/app/automationPath.selftest.mjs and tools/game-readiness.selftest.mjs keep that page true.

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

/**
 * The launcher's request, registered on every page before the tool's own scripts: the harness path, unless the tool
 * asks for a path itself (its init script runs later and assigns the flag; a `?automation=` in its URL is left alone,
 * because the page flag would outrank it).
 */
export const HARNESS_DEFAULT_SCRIPT = 'if (window.__COT_AUTOMATION === undefined && !/[?&]automation=/.test(location.search)) '
  + "window.__COT_AUTOMATION = 'harness';";

/** In-page: the path the page took ('player' | 'harness'; null on a build before src/app/automationPath.ts). */
export const AUTOMATION_PATH_EXPRESSION = '(window.__AUTOMATION_PATH?.path ?? null)';

/** An agent-browser session tool's check: the session was opened on `path` (`&automation=<path>` in its URL). */
export function sessionPathProblem(took, path) {
  assertPath(path);
  return took === path ? null : `the session's page took the ${took ?? 'unknown'} automation path; open it with `
    + `&automation=${path} in its URL (docs/AUTOMATION-PATHS.md: a page that asks for no path is a player's page)`;
}

/**
 * After the boot: the path the page actually took, or a named failure. A build before src/app/automationPath.ts
 * ignores the request and decides by navigator.webdriver alone (true: harness), so a player-path tool that may load
 * such a build hides the driver at launch (`--disable-blink-features=AutomationControlled`), and this check accepts
 * that build's path by the same rule. Returns { path, source, webdriver, legacy }.
 */
export async function assertAutomationPath(page, path, { label = 'page' } = {}) {
  assertPath(path);
  const seen = await page.evaluate(() => {
    let owner = null;
    try { owner = window.__AUTOMATION_PATH ?? null; } catch { owner = null; }
    return { path: owner?.path ?? null, source: owner?.source ?? null, webdriver: navigator.webdriver === true };
  });
  if (seen.path !== null) {
    if (seen.path === path) return { ...seen, legacy: false };
    throw new Error(`automation path: ${label} asked for the ${path} path and took the ${seen.path} path (source ${seen.source})`);
  }
  const legacy = seen.webdriver ? 'harness' : 'player';
  if (legacy === path) return { ...seen, path: legacy, source: 'webdriver', legacy: true };
  throw new Error(`automation path: ${label} asked for the ${path} path, but this build publishes no window.__AUTOMATION_PATH `
    + `(a build before 2026-11-03 ignores the request) and navigator.webdriver is ${seen.webdriver}, so it took the ${legacy} path`
    + (path === 'player' ? '; launch with --disable-blink-features=AutomationControlled to give such a build the player\'s path' : ''));
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
 * a build that publishes none; `automation` the path the page resolved (docs/AUTOMATION-PATHS.md). On a build that
 * publishes no lifecycle (`lifecycle` false), `legacy` holds each readiness as that build's own harnesses defined it:
 * from `__DEBUG.game` (`source` 'debug'), or, on a page with no `__DEBUG`, from what the page shows (`source` 'dom';
 * null for a readiness the page cannot tell).
 */
export function readinessInPage() {
  let lifecycle = null;
  let automation = null;
  try { lifecycle = window.__APP_LIFECYCLE ?? null; } catch { lifecycle = null; }
  try { automation = window.__AUTOMATION_PATH?.path ?? null; } catch { automation = null; }
  const published = !!lifecycle && typeof lifecycle.state === 'string';
  const booted = window.__GAME_READY === true;
  let legacy = null;
  if (!published) {
    // a build before the lifecycle (2026-11-03): the predicates its harnesses waited on, in one place
    let game = null;
    try { game = window.__DEBUG?.game ?? null; } catch { game = null; }
    const covered = !!document.querySelector('.cot-bl.on, .cot-bl.leaving');
    if (game) {
      const battle = game.phase === 'battle';
      const countdownOver = battle && Number.isFinite(game.preBattleS) && game.preBattleS <= 0;
      legacy = {
        source: 'debug',
        garage: booted && game.phase === 'garage',
        battleRevealed: battle && !covered,
        controlsReleased: countdownOver,
        battleLive: countdownOver && !game.result,
        battleEnded: battle && !!game.result,
        studio: game.phase === 'studio',
      };
    } else {
      // no `__DEBUG` either (a production build on the player's path without ?debug: black-world-repro --plain, its
      // stress page): what the page shows, as the tools waited on it before the probe. The countdown is not on the
      // page in a form a wait can trust, so the two readinesses that need it are null here (never pass; the facts say
      // why): open such a build with ?debug=1 for them.
      const shown = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return false;
        let style = null;
        try { style = window.getComputedStyle(node); } catch { style = null; }
        return !!style && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const veiled = !!document.querySelector('.cot-trans.on');
      const splash = !!document.querySelector('#cot-boot:not(.cot-boot-out)');
      const report = !!document.querySelector('.cot-es.show');
      legacy = {
        source: 'dom',
        // (round 2 Q21) the screen has one of the elements this fallback reads: a build whose DOM differs (an old A/B
        // baseline) has none, and its waits fail by that name instead of a bare timeout
        landmarks: !!document.querySelector('.cot-garage, .cot-hud, #cot-boot, .cot-studio'),
        garage: booted && !splash && !veiled && !covered && !report && shown('.cot-garage'),
        battleRevealed: !covered && shown('.cot-hud'),
        controlsReleased: null,
        battleLive: null,
        battleEnded: report,
        studio: !veiled && shown('.cot-studio'),
      };
    }
  }
  return {
    booted,
    lifecycle: published,
    state: published ? lifecycle.state : null,
    phase: published ? lifecycle.phase : null,
    screenPhase: published ? lifecycle.screenPhase : null,
    transitions: published && Number.isFinite(lifecycle.transitions) ? lifecycle.transitions : null,
    automation,
    legacy,
  };
}

function wantedStates(name) {
  const wanted = READY[name];
  if (!wanted) throw new TypeError(`game-readiness: unknown readiness ${String(name)} (${Object.keys(READY).join(', ')})`);
  return wanted;
}

/**
 * The in-page expression that turns true once the page is `name` (a READY key). `since`: a lifecycle `transitions`
 * count the page must have moved past (the next battle, not the one already on screen). A build that publishes no
 * lifecycle (before 2026-11-03: a deployment, an A/B baseline) never passes on the boot alone: each readiness falls
 * back to the predicate that build's own harnesses waited on (readinessInPage `legacy`; docs/AUTOMATION-PATHS.md), and
 * `since` has no count to read there.
 */
export function readinessExpression(name, { since = null } = {}) {
  const wanted = wantedStates(name);
  if (since !== null && !Number.isFinite(since)) throw new TypeError('game-readiness: since is a transitions count');
  return `((read, note, wanted, since, name) => { const r = read(); if (!r.booted) return false;`
    + ' if (!r.lifecycle) { note(r.legacy, name); return r.legacy?.[name] === true; }'
    + ' if (since !== null && !(r.transitions > since)) return false; return wanted.includes(r.state); })'
    + `(${readinessInPage.toString()}, ${legacyReadinessNote.toString()}, ${JSON.stringify(wanted)}, ${JSON.stringify(since)}, `
    + `${JSON.stringify(name)})`;
}

/** The prefix of the page's own note (legacyReadinessNote), which a launched browser's pages forward to the tool. */
export const READINESS_NOTE_PREFIX = '[cot-readiness]';

/**
 * In-page (self-contained), round 2 Q21: a readiness wait on a build that publishes no lifecycle says, once a document
 * for each definition, which legacy definition decided it. Forty-odd tools call readinessExpression and only mobilelap
 * recorded the facts, so an A/B receipt against a pre-lifecycle baseline used the old predicate silently. The page logs
 * it; prepareToolPage forwards the line to the tool's stderr, so every tool's log names it.
 */
export function legacyReadinessNote(legacy, name) {
  const source = legacy?.source ?? 'none';
  const blind = source === 'dom' && legacy?.landmarks === false;
  const key = `${source}${blind ? ':blind' : ''}`;
  try {
    if (window.__COT_READINESS_LEGACY === key) return;
    window.__COT_READINESS_LEGACY = key;
    window.console?.info?.(`[cot-readiness] this build publishes no lifecycle (window.__APP_LIFECYCLE): '${name}' and every `
      + `readiness on this page is its legacy ${source} predicate`
      + (blind ? '; and its screen has none of the elements the DOM fallback reads (.cot-garage, .cot-hud, #cot-boot, '
        + '.cot-studio): no wait here can pass; open it with ?debug=1' : ''));
  } catch { /* a page that will not take the note still answers the wait */ }
}

/** The page's readiness facts now (readinessInPage), for a receipt or a `since`. */
export function readGameReadiness(page) {
  return page.evaluate(readinessInPage);
}

/**
 * Wait until the page is `name` (a READY key). `options` are waitForFunction's (timeout, polling) plus `since`.
 * Returns the facts it saw (`lifecycle` false: the build's legacy predicate decided). A wait the page cannot answer
 * (a build with no lifecycle and no `__DEBUG`, for a readiness its screen cannot tell) fails naming that, not as a
 * bare timeout.
 */
export async function waitForReady(page, name, { since = null, ...options } = {}) {
  try {
    await page.waitForFunction(readinessExpression(name, { since }), options);
  } catch (cause) {
    const facts = await readGameReadiness(page).catch(() => null);
    const first = String(cause?.message ?? cause).split('\n')[0];
    if (facts && !facts.lifecycle && facts.legacy?.[name] === null) {
      throw new Error(`game-readiness: ${name} cannot be read on this page: the build publishes no lifecycle and no `
        + `window.__DEBUG (open it with ?debug=1) (${first})`, { cause });
    }
    // (round 2 Q21) a build whose screen the DOM fallback cannot read (an A/B baseline old enough to differ) times out
    // by name, not as a bare timeout
    if (facts && !facts.lifecycle && facts.legacy?.source === 'dom' && facts.legacy.landmarks === false) {
      throw new Error(`game-readiness: ${name} cannot be read on this page: the build publishes no lifecycle and no `
        + 'window.__DEBUG, and its screen has none of the elements the DOM fallback reads (.cot-garage, .cot-hud, '
        + `#cot-boot, .cot-studio); open it with ?debug=1 (${first})`, { cause });
    }
    throw cause;
  }
  return readGameReadiness(page);
}

/**
 * (round 2 Q21) The in-page expression that turns true once `phase` owns the scene (the lifecycle's `phase`, written
 * when a hand-over begins: a Garage return writes the Garage's scene under its veil, before its screen settles). For a
 * timing edge (how soon a Leave answered), never readiness: wait on a READY name before reading the screen. A build
 * with no lifecycle answers from `__DEBUG.game.phase`.
 */
export function scenePhaseExpression(phase) {
  if (!['garage', 'battle', 'shot', 'studio'].includes(phase)) throw new TypeError(`game-readiness: unknown app phase ${String(phase)}`);
  return `((phase) => { let owner = null; try { owner = window.__APP_LIFECYCLE ?? null; } catch { owner = null; }`
    + ' if (owner && typeof owner.phase === "string") return owner.phase === phase;'
    + ' let game = null; try { game = window.__DEBUG?.game ?? null; } catch { game = null; } return !!game && game.phase === phase; })'
    + `(${JSON.stringify(phase)})`;
}

/** The boot finished loading: the latch's harness mirror. The entry gate may still wait on the player. */
export const BOOT_LOADED_EXPRESSION = 'window.__GAME_READY === true';

/** Wait for the boot to finish loading (the harness mirror, src/app/bootReadiness.ts). `options`: waitForFunction's. */
export function waitForBootLoaded(page, options = {}) {
  return page.waitForFunction(BOOT_LOADED_EXPRESSION, options);
}

// Pages a launched browser hands out. tools/browser-launch.mjs calls prepareToolBrowser on every browser it launches,
// before the tool sees it, so no page of a tool's browser reaches its first navigation without the launcher's request:
// puppeteer's open pages, Browser.newPage, BrowserContext.newPage (createBrowserContext, defaultBrowserContext), and
// playwright's Browser.newPage, newContext and a persistent context (addInitScript covers every page of a context).
// Wrapping the factories cannot race the page: the script is registered before the factory returns the page.

const preparedObjects = new WeakSet();

function afterEach(owner, name, prepare) {
  const original = owner?.[name];
  if (typeof original !== 'function') return;
  owner[name] = async function preparedFactory(...args) { return prepare(await original.apply(owner, args)); };
}

/** (round 2 Q21) The page's readiness note (legacyReadinessNote), forwarded to the tool's own log. */
function forwardReadinessNotes(target) {
  if (typeof target?.on !== 'function') return;
  target.on('console', (message) => {
    let text = '';
    try { text = typeof message?.text === 'function' ? message.text() : ''; } catch { text = ''; }
    if (text.startsWith(READINESS_NOTE_PREFIX)) process.stderr.write(`${text}\n`);
  });
}

/** One page: the launcher's request, registered before anything else on it. */
export async function prepareToolPage(page) {
  if (!page || typeof page !== 'object' || preparedObjects.has(page)) return page;
  preparedObjects.add(page);
  forwardReadinessNotes(page);
  if (typeof page.addInitScript === 'function') await page.addInitScript(HARNESS_DEFAULT_SCRIPT); // playwright
  else if (typeof page.evaluateOnNewDocument === 'function') await page.evaluateOnNewDocument(HARNESS_DEFAULT_SCRIPT);
  return page;
}

/** One browser context: playwright's takes one init script for all its pages; puppeteer's hands out prepared pages. */
export async function prepareToolContext(context) {
  if (!context || typeof context !== 'object' || preparedObjects.has(context)) return context;
  preparedObjects.add(context);
  if (typeof context.addInitScript === 'function') {
    await context.addInitScript(HARNESS_DEFAULT_SCRIPT);
    forwardReadinessNotes(context); // (playwright: a context's console event carries every page's)
    return context;
  }
  afterEach(context, 'newPage', prepareToolPage);
  if (typeof context.pages === 'function') {
    try { for (const page of await context.pages()) await prepareToolPage(page); } catch { /* a context with no pages() list */ }
  }
  return context;
}

/** A launched browser (or a playwright persistent context): every page it hands out asks for the harness path. */
export async function prepareToolBrowser(target) {
  if (!target || typeof target !== 'object' || preparedObjects.has(target)) return target;
  if (typeof target.addInitScript === 'function') return prepareToolContext(target);
  preparedObjects.add(target);
  afterEach(target, 'newPage', prepareToolPage);
  afterEach(target, 'newContext', prepareToolContext);
  afterEach(target, 'createBrowserContext', prepareToolContext);
  afterEach(target, 'createIncognitoBrowserContext', prepareToolContext);
  if (typeof target.defaultBrowserContext === 'function') {
    try { await prepareToolContext(target.defaultBrowserContext()); } catch { /* a double with no default context */ }
  }
  return target;
}
