// hud-chase-bands-drift.mjs — how far a fresh capture of the HUD's chase bands moved from the recorded fixture
// (guidance-pointers-276). First-party tooling: Kevin B. Liu.
//
// tools/fixtures/hud-chase-bands.json feeds the chase framing's receipts and the pointer sweep
// (src/engine/chaseFraming.selftest.mjs, src/ui/pointers/pointerFollowView.selftest.mjs). It went stale once without a
// word: the phone's right column moved 240 px up in the live HUD while the fixture kept the old place, and the sweep's
// phone frames modelled a layout the game no longer had. tools/hud-chase-bands.browser.mjs --check captures the bands
// afresh and fails on any drift past BANDS_DRIFT_PX through this comparison. Pure: no DOM, no browser.

/** [width, height, touch]: the windows tools/hud-chase-bands.browser.mjs records the bands at, from the live game
 *  (hud-bands-live-276): the receipts' windows and the UI gauntlet's (the phones both ways, the iPads held wide and upright,
 *  the desktops). A touch window's key is plain WxH, as the readers look them up. */
export const BAND_SIZES = Object.freeze([[1920, 1080, false], [1440, 900, false], [1280, 720, false], [1180, 820, true],
  [820, 1180, true], [390, 844, true], [844, 390, true], [1210, 702, true], [744, 1001, true]].map((size) => Object.freeze(size)));
/** The battle every size is recorded in: a main battle tank, a standard battle (the chrome's commonest set). */
export const BAND_BATTLE = Object.freeze({ specId: 'm1a1_abrams_hc', mapId: 'verdant', gameMode: 'standard' });

/** How far a recorded band may sit from the fresh one before the fixture counts as stale (CSS px). */
export const BANDS_DRIFT_PX = 4;

const EDGES = ['x0', 'y0', 'x1', 'y1'];
const near = (a, b, tol) => EDGES.every((edge) => Math.abs(a[edge] - b[edge]) <= tol);
const label = (box) => `[${EDGES.map((edge) => Math.round(box[edge])).join(',')}]`;

/** The boxes of `from` with no box of `to` within `tol` px on every edge (a multiset match: each box of `to` used once). */
function unmatched(from, to, tol) {
  const left = [...(to ?? [])];
  const out = [];
  for (const box of from ?? []) {
    const i = left.findIndex((other) => near(box, other, tol));
    if (i < 0) out.push(box);
    else left.splice(i, 1);
  }
  return out;
}

/**
 * The drift between the recorded fixture's `sizes` and a fresh capture's: a list of findings, each `{ size, state, what }`,
 * empty when every size and state is there in both, the window, the touch flag, the ceiling and the rise cap agree within
 * `tol` px, and every floor and transient box has its match within `tol` px on each edge.
 */
export function bandsDrift(recorded, fresh, tol = BANDS_DRIFT_PX) {
  const findings = [];
  const keys = new Set([...Object.keys(recorded ?? {}), ...Object.keys(fresh ?? {})]);
  for (const size of keys) {
    const states = new Set([...Object.keys(recorded?.[size] ?? {}), ...Object.keys(fresh?.[size] ?? {})]);
    for (const state of states) {
      const a = recorded?.[size]?.[state], b = fresh?.[size]?.[state];
      const add = (what) => findings.push({ size, state, what });
      if (!a || !b) { add(a ? 'missing from the fresh capture' : 'not in the recorded fixture'); continue; }
      if (a.width !== b.width || a.height !== b.height || a.touch !== b.touch) add(`window ${a.width}x${a.height}${a.touch ? ' touch' : ''} vs ${b.width}x${b.height}${b.touch ? ' touch' : ''}`);
      if (Math.abs(a.ceiling - b.ceiling) > tol) add(`ceiling ${a.ceiling} vs ${b.ceiling}`);
      if ((a.riseCap ?? null) === null ? (b.riseCap ?? null) !== null : (b.riseCap ?? null) === null || Math.abs(a.riseCap - b.riseCap) > tol) {
        add(`rise cap ${a.riseCap ?? 'none'} vs ${b.riseCap ?? 'none'}`);
      }
      for (const kind of ['floor', 'transient']) {
        for (const box of unmatched(a[kind], b[kind], tol)) add(`${kind} box ${label(box)} recorded, gone or moved`);
        for (const box of unmatched(b[kind], a[kind], tol)) add(`${kind} box ${label(box)} fresh, not recorded`);
      }
    }
  }
  return findings;
}
