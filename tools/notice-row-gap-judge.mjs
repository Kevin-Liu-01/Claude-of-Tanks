// The notice row's gap judge (notices-polish-277; Kevin 2026-11-24, on live 276: "for gun travel limit, it looks like when it
// appears theres a space betwee icon and 'gun travel limit' and as it disappears it looks like that space disappears. fix
// that."). Copyright © 2026 Kevin B. Liu.
//
// A notice row's glyph and its words keep one distance for the notice's whole life: as it enters, while it holds and as it
// leaves. The cause Kevin saw was a class, not a chip: a surface that leaves on the motion vocabulary (components/
// surfaceMotion.css) stays on screen while [hidden], so any rule gated on :not([hidden]) that lays the row out (its gap, its
// seat) lets go of it the moment the exit starts. Two halves:
// - shownStateLayout(css): every rule in a notice sheet whose selector is gated on :not([hidden]) and that sets anything but
//   display (the gate may decide whether it shows, never how it is laid out);
// - gapProblems(samples): the browser probe's samples (tools/notice-row-gap.browser.mjs: every notice kind on both lanes and
//   the gun-limit chip, each measured at enter, mid and exit), failing a row missing a phase or whose gap moves.
// Pure (Node receipt: tools/notice-row-gap-judge.selftest.mjs).

/** The phases a row is sampled at: just raised (its entry under way), held, and just taken down (its exit under way). */
export const GAP_PHASES = Object.freeze(['enter', 'mid', 'exit']);
/** How far a row's gap may move across its phases (px): sub-pixel layout rounding, never a collapsing gap. */
export const GAP_TOLERANCE_PX = 0.5;

/** The rules of a sheet (plain CSS, or a module's CSS template): [selector, body] pairs, at-rule wrappers unwrapped. */
function rules(css) {
  const out = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(text))) out.push([match[1].trim(), match[2].trim()]);
  return out;
}

/** The declarations of a rule body other than display (and its own custom properties' names): what a shown-state gate must
 *  never set. */
function layoutDeclarations(body) {
  return body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => d.split(':')[0].trim().toLowerCase())
    .filter((name) => name !== 'display');
}

/** Every rule gated on :not([hidden]) that sets more than display: [{ selector, props }]. */
export function shownStateLayout(css) {
  const found = [];
  for (const [selector, body] of rules(css)) {
    if (!selector.includes(':not([hidden])')) continue;
    const props = layoutDeclarations(body);
    if (props.length) found.push({ selector: selector.replace(/\s+/g, ' '), props });
  }
  return found;
}

/**
 * The probe's samples, each { row, lane, phase, gap } (gap: the label's left edge less the glyph's right edge, px; null when
 * the row was not on screen at that phase): a problem for every row missing its entry or its hold and every row whose gap
 * moves more than GAP_TOLERANCE_PX across the phases it was seen in. A row already gone at its exit (a seat that leaves at
 * once) shows no gap to close and passes; one still on screen leaving keeps its gap.
 */
export function gapProblems(samples) {
  const byRow = new Map();
  for (const sample of samples) {
    const key = `${sample.lane}:${sample.row}`;
    if (!byRow.has(key)) byRow.set(key, new Map());
    byRow.get(key).set(sample.phase, sample.gap);
  }
  const problems = [];
  for (const [key, phases] of byRow) {
    const missing = ['enter', 'mid'].filter((phase) => typeof phases.get(phase) !== 'number');
    if (missing.length) { problems.push(`${key}: not on screen at ${missing.join(', ')}`); continue; }
    const seen = GAP_PHASES.filter((phase) => typeof phases.get(phase) === 'number');
    const gaps = seen.map((phase) => phases.get(phase));
    const spread = Math.max(...gaps) - Math.min(...gaps);
    if (spread > GAP_TOLERANCE_PX) {
      problems.push(`${key}: the glyph-to-label gap moves ${spread.toFixed(2)} px (${seen.map((p, i) => `${p} ${gaps[i].toFixed(2)}`).join(', ')})`);
    }
  }
  return problems;
}

/** The modules that raise the battle notices (their sources give every kind its lane: battle-hud-overlap-judge.mjs kindLanes). */
export const NOTICE_RAISERS = Object.freeze(['src/ui/hud.ts', 'src/ui/airSupportHud.ts', 'src/ui/firstUseHints.ts', 'src/ui/multiplayerStatus.ts',
  'src/game/pointerLockFeedbackRuntime.ts', 'src/ui/aerialHud.ts']);

/** In the page: starts tracing `lane`'s row every frame (sampleRowGap's gap with the row's shown opacity), until stopTrace. */
export function startTrace(lane) {
  const row = (lane) => {
    const host = lane === 'chip' ? document.querySelector('.cot-aim-warning')
      : lane === 'event' ? document.querySelector('.cot-alert') : document.querySelector('.cot-battle-notices .cot-c-notice');
    if (!host || !host.checkVisibility({ checkVisibilityCSS: true })) return null;
    let opacity = 1;
    for (let node = host; node && node.nodeType === 1; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    const glyph = host.querySelector(lane === 'chip' ? ':scope>.g' : '.cot-c-notice__glyph');
    const label = host.querySelector(lane === 'chip' ? ':scope>.tx' : '.cot-c-notice__body');
    if (!glyph || !label) return null;
    const a = glyph.getBoundingClientRect(), b = label.getBoundingClientRect();
    return a.width > 0 && b.width > 0 ? { gap: Math.round((b.left - a.right) * 100) / 100, opacity: Math.round(opacity * 1000) / 1000 } : null;
  };
  const trace = { frames: [], live: true, t0: performance.now() };
  window.__gapTrace = trace;
  const tick = () => {
    if (!trace.live) return;
    const at = row(lane);
    if (at) trace.frames.push({ t: Math.round(performance.now() - trace.t0), ...at });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** In the page: stops the trace and returns its frames. */
export function stopTrace() {
  const trace = window.__gapTrace;
  if (!trace) return [];
  trace.live = false;
  return trace.frames;
}

/** A trace's three phases as samples (gapProblems): its first frame on screen (the entry), its first frame at its fullest
 *  (the hold), its last frame on screen (the exit, which a seat leaving at once shares with the hold); plus `spread`, how far
 *  its gap moved over every frame it showed (at least 5 % opaque). */
export function tracePhases(row, lane, frames) {
  const seen = frames.filter((f) => f.opacity >= 0.05);
  if (!seen.length) return { samples: GAP_PHASES.map((phase) => ({ row, lane, phase, gap: null })), spread: 0, frames: 0 };
  const full = Math.max(...seen.map((f) => f.opacity));
  const hold = seen.find((f) => f.opacity >= full - 0.001);
  const gaps = seen.map((f) => f.gap);
  return {
    samples: [{ row, lane, phase: 'enter', gap: seen[0].gap }, { row, lane, phase: 'mid', gap: hold.gap }, { row, lane, phase: 'exit', gap: seen.at(-1).gap }],
    spread: Math.max(...gaps) - Math.min(...gaps),
    frames: seen.length,
  };
}
