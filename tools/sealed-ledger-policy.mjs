/** A row may grow by max(12 px, 10 %) over its baseline before the gate calls it a regression (open and see-through px
 * alike: the census is deterministic, the slack absorbs re-tessellation of an unchanged part). */
const allowance = (baseline) => baseline + Math.max(12, baseline * .1);
/** Netting px hold to a two-sided band of max(12 px, 2 %) around the row. The census frames every view on the row's
 * recorded frame (guards 229 critic round 2: framed on each build's AABB, an unrelated extremity edit, a 5 cm longer gun
 * or a 1 mm speck past the bow, moved the pixel grid under an unchanged net and re-aliased its count by 2-10 %). In the
 * fixed frame an unchanged suit reproduces its count exactly whatever an extremity does, so the band only absorbs float
 * noise; a suit that grows, lifts off its hull, is doubled, sinks into it or goes missing moves the count, and the row
 * must be re-baselined on purpose. Two-sided, so the column cannot go stale. */
const nettingSlack = (baseline) => Math.max(12, baseline * .02);

/** A row's census frame is fixed (guards 229 critic round 4): the build's own frame (recordedSealedFrame of its bounding
 * sphere) may drift from it by up to min(1 m, 25 % of the row's radius), in radius either way or in centre, and the
 * census still judges the build in the row's frame: an extremity edit (a 1.5 m longer gun moves the frame it needs from
 * 5.6 to 6.3 m) never needs a re-frame, and a frame never ratchets. Past the bound the build no longer fits its row. */
export const frameBound = (radius) => Math.min(1, radius * 0.25);

/** The frame a build needs against its row's: 'fits' when its radius and centre are within frameBound of the row's;
 * 'stale' when it lies inside the row's frame and needs one smaller by more than the bound (the row's census is coarser
 * than the build allows); otherwise 'out' (a part metres out, or the build moved in its root). */
export function frameFit(rowFrame, needFrame) {
  const bound = frameBound(rowFrame[3]);
  const grow = +(needFrame[3] - rowFrame[3]).toFixed(3);
  const shift = +Math.hypot(needFrame[0] - rowFrame[0], needFrame[1] - rowFrame[1], needFrame[2] - rowFrame[2]).toFixed(3);
  const fit = Math.abs(grow) <= bound && shift <= bound ? 'fits'
    : grow < -bound && shift + needFrame[3] <= rowFrame[3] + bound ? 'stale' : 'out';
  return { fit, bound, grow, shift };
}
/** The most a re-frame may grow a frame: half again the row's radius, its centre moved by at most half of it. A build
 * that needs more is not an outgrown extremity (critic round 4: a 1 mm speck 20 m out asked for a 15.5 m frame). */
const reframeLimit = (rowFrame, needFrame, shift) => needFrame[3] <= rowFrame[3] * 1.5 && shift <= rowFrame[3] * 0.5;

/** An open row's hole views: a hole in a view the row does not list (openViewNames, recorded on the open rows) fails,
 * so a hole that moves to another view is a new hole; a row without the names holds its view count. Within a listed view
 * the ledger keeps a pixel count only, so a cluster that moves inside that view is judged by its px alone. */
function newHoleViews(row, { holeViews, holeViewNames }) {
  if (row.sealed) return '';
  if (Array.isArray(row.openViewNames)) {
    if (!Array.isArray(holeViewNames)) return 'the census gives no hole view names';
    const added = holeViewNames.filter((name) => !row.openViewNames.includes(name));
    return added.length ? `holes in ${added.join(', ')}, outside the row's views (${row.openViewNames.join(', ')}): a new hole cluster` : '';
  }
  return Number.isFinite(row.openViews) && holeViews > row.openViews ? `open in ${holeViews} views > ledger ${row.openViews} (a new hole cluster)` : '';
}

/** New vehicles have no historical opening or see-through allowance. Existing baseline rows retain their original
 * sealed/regression policy for openings, and gate see-through (the world seen through glass, markings or undeclared
 * alpha-cut parts, never through declared alpha-cut netting: the census counts that apart as netting px) against the
 * row's seeThroughPx the same way. Netting px hold to the row's netSeeThroughPx within nettingSlack, both ways. The
 * measurements are required: a caller that forgets one cannot pass, and a row without a baseline fails. A framed row
 * also needs the build's own frame (needFrame): OUT OF FRAME and FRAME STALE fail before any column (frameFit).
 *
 * acceptSeeThrough is the explicit per-id re-baseline (--accept-see-through, honoured only while updating the ledger):
 * the row's see-through and netting baselines are taken at the measurement, and a vehicle without a row may bring a
 * see-through cluster. No flag accepts an opening: a new vehicle must still be sealed, an existing row still holds its
 * opening baseline and hole views (the six open rows predate the gate; the 229 framed re-base recorded leo2a4's turret
 * slit, history kind 'rebaseline'). reframe is judged by reframeVerdict. */
export function sealedLedgerVerdict(row, census, { acceptSeeThrough = false, reframe = false } = {}) {
  const { sealed, holeViews, holePx, throughPx, throughViews, netPx, needFrame = null } = census;
  if (![throughPx, throughViews, netPx].every(Number.isFinite)) {
    throw new Error('sealedLedgerVerdict: the see-through census (throughPx, throughViews, netPx) is required');
  }
  if (row && Array.isArray(row.frame) && !Array.isArray(needFrame)) {
    throw new Error('sealedLedgerVerdict: a framed row needs the build\'s own frame (needFrame)');
  }
  if (row && reframe) return reframeVerdict(row, census, acceptSeeThrough);
  if (row && Array.isArray(row.frame)) {
    const { fit, bound, grow, shift } = frameFit(row.frame, needFrame);
    if (fit === 'out') return { pass: false, message: `OUT OF FRAME: the build needs a census frame [${needFrame.join(', ')}] against `
      + `its row's [${row.frame.join(', ')}] (radius ${grow >= 0 ? '+' : ''}${grow} m, centre ${shift} m off; the row's frame holds `
      + `up to ${bound} m). A part this far out is usually a build defect: fix the build. A real growth this large (up to half again the radius) is re-framed by `
      + 'name with --update-ledger --reframe=<id>:<reason>, adding --accept-see-through=<id>:<reason> when its see-through or netting moved with it' };
    if (fit === 'stale') return { pass: false, message: `FRAME STALE: the build needs a census frame of radius ${needFrame[3]} m, `
      + `its row's is ${row.frame[3]} m (${-grow} m larger than it needs, past ${bound} m): its census is coarser than the build allows. `
      + 'Tighten the frame by name with --update-ledger --reframe=<id>:<reason>' };
  }
  if (!row) {
    if (!sealed) return { pass: false, message: `new vehicle: ${holeViews} open views without an approved baseline` };
    if (throughViews && !acceptSeeThrough) return { pass: false,
      message: `new vehicle: see-through in ${throughViews} views without an approved baseline (fix it, or record the row with --update-ledger --accept-see-through=<id>:<reason>)` };
    return { pass: true, message: throughViews ? `new vehicle: sealed; see-through ${throughPx} px in ${throughViews} views accepted` : 'new vehicle: sealed' };
  }
  if (row.sealed && !sealed) return { pass: false,
    message: `REGRESSION: ledger sealed, now ${holeViews} open views` };
  if (holePx > allowance(row.openPx)) return { pass: false,
    message: `REGRESSION: open px ${holePx} > ledger ${row.openPx}` };
  const moved = newHoleViews(row, census);
  if (moved) return { pass: false, message: `REGRESSION: ${moved}` };
  const judged = acceptSeeThrough ? { seeThroughPx: Math.max(throughPx, row.seeThroughPx ?? 0), netSeeThroughPx: netPx } : row;
  const seeThrough = seeThroughVerdict(judged.seeThroughPx, throughPx);
  if (!seeThrough.pass) return seeThrough;
  const netting = nettingVerdict(judged.netSeeThroughPx, netPx);
  if (!netting.pass) return netting;
  return { pass: true, message: `${row.sealed ? 'ledger: sealed, holds' : `ledger: ${row.openPx} px allowed, holds`}; ${seeThrough.message}; ${netting.message}` };
}

/** --reframe=<id>:<reason> (critic rounds 3 and 4): only for a build that no longer fits its row's frame (OUT OF FRAME
 * or FRAME STALE); a build that fits is judged in its row's frame and has nothing to re-frame, and a growth past half
 * again the row's radius (reframeLimit) is refused as a build defect. The build's census in the
 * row's frame (geometry past it is clipped laterally and drawn wherever it projects into the window) may not exceed the
 * row in any column, without the normal gate's slack: a re-measured row would otherwise take that slack in as its new
 * baseline. With --accept-see-through for the same id the see-through and netting are free there; openings never are.
 * Then every column is re-measured in the build's own frame, where a sealed row must stay sealed. */
function reframeVerdict(row, { sealed, holeViews, needFrame, oldFrame = null }, acceptSeeThrough) {
  const refuse = (why) => ({ pass: false, message: `REFRAME refused: ${why}` });
  if (!Array.isArray(row.frame)) return refuse('the row records no census frame');
  if (!oldFrame) return refuse('a re-frame needs the build\'s census in the row\'s frame');
  const { fit, bound, grow, shift } = frameFit(row.frame, needFrame);
  if (fit === 'fits') return refuse(`the build fits its row's frame (radius ${grow >= 0 ? '+' : ''}${grow} m, centre ${shift} m off, `
    + `within ${bound} m): the census already judges it there; nothing to re-frame`);
  if (fit === 'out' && !reframeLimit(row.frame, needFrame, shift)) return refuse(`the build needs a frame [${needFrame.join(', ')}], `
    + `past half again its row's [${row.frame.join(', ')}]: that is a build defect (a part thrown metres out), not an outgrown extremity; fix the build`);
  const exact = withinRow(row, oldFrame, acceptSeeThrough);
  if (!exact.pass) return refuse(`in its row's frame the build exceeds the row (${exact.message}); a re-frame records no change: `
    + (acceptSeeThrough ? 'fix the build' : 'fix the build, or, when its see-through or netting moved with the growth, give '
      + '--reframe=<id>:<reason> and --accept-see-through=<id>:<reason> together'));
  if (row.sealed && !sealed) return { pass: false, message: `REGRESSION: ledger sealed, now ${holeViews} open views in the new frame` };
  return { pass: true, message: `ledger: re-framed (${fit === 'out' ? 'grown' : 'tightened'}); in its row's frame ${exact.message}` };
}

/** The census in the row's frame against the row with no slack (reframeVerdict). */
function withinRow(row, census, acceptSeeThrough) {
  const { sealed, holeViews, holePx, throughPx, netPx } = census;
  if (row.sealed && !sealed) return { pass: false, message: `open in ${holeViews} views, ledger sealed` };
  if (holePx > row.openPx) return { pass: false, message: `open px ${holePx} > ledger ${row.openPx}` };
  const moved = newHoleViews(row, census);
  if (moved) return { pass: false, message: moved };
  if (acceptSeeThrough) return { pass: true, message: `open px ${holePx} <= ${row.openPx}; see-through ${throughPx} and netting ${netPx} px accepted` };
  if (![row.seeThroughPx, row.netSeeThroughPx].every(Number.isFinite)) return { pass: false, message: 'the row has no see-through or netting baseline' };
  if (throughPx > row.seeThroughPx) return { pass: false, message: `see-through px ${throughPx} > ledger ${row.seeThroughPx}` };
  const floor = row.netSeeThroughPx - nettingSlack(row.netSeeThroughPx);
  if (netPx > row.netSeeThroughPx || netPx < floor) return { pass: false,
    message: `netting px ${netPx} outside ledger ${row.netSeeThroughPx} (${+floor.toFixed(1)}..${row.netSeeThroughPx}: an extremity only hides net)` };
  return { pass: true, message: `within the row: open px ${holePx} <= ${row.openPx}, see-through ${throughPx} <= ${row.seeThroughPx}, netting ${netPx} (ledger ${row.netSeeThroughPx})` };
}

function seeThroughVerdict(baseline, measured) {
  if (!Number.isFinite(baseline)) return { pass: false, message: 'REGRESSION: the ledger row has no see-through baseline' };
  if (measured > allowance(baseline)) return { pass: false, message: `REGRESSION: see-through px ${measured} > ledger ${baseline}` };
  return { pass: true, message: `see-through ${measured} px (ledger ${baseline}), holds` };
}

function nettingVerdict(baseline, measured) {
  if (!Number.isFinite(baseline)) return { pass: false, message: 'REGRESSION: the ledger row has no netting baseline' };
  if (Math.abs(measured - baseline) > nettingSlack(baseline)) return { pass: false,
    message: `REGRESSION: netting px ${measured} ${measured > baseline ? '>' : '<'} ledger ${baseline} (the declared netting moved, grew or shrank; re-baseline on purpose with --update-ledger=see-through --accept-see-through=<id>:<reason>)` };
  return { pass: true, message: `netting ${measured} px (ledger ${baseline}), holds` };
}

/** The local calendar date (the lanes' notes use local dates), YYYY-MM-DD. */
const localDate = () => new Date().toLocaleDateString('en-CA');

/**
 * A census frame from a build's bounding sphere, recorded on the row so later censuses frame every view the same way
 * whatever an unrelated edit does to the extremities: the centre snapped to 5 cm, the radius grown by at least 10 cm and
 * rounded up to 10 cm. It is also the frame a later build needs (needFrame), which frameFit holds to the row's.
 */
export function recordedSealedFrame({ center, radius }) {
  const snap = (v) => Math.round(v / 0.05) * 0.05;
  return [snap(center.x), snap(center.y), snap(center.z), Math.ceil((radius + 0.1) / 0.1) * 0.1].map((v) => Number(v.toFixed(3)));
}

/**
 * `<id>[,<id>]:<reason>` specs (--accept-see-through, --reframe), ';'-separated: Map(id -> reason). A reason is at least
 * 12 characters saying what moved and why; an id named twice is refused (the second reason would silently replace the
 * first); bare ids are refused. '' is none.
 */
export function parseReasonedIds(spec, flag = '--accept-see-through') {
  const out = new Map();
  for (const part of String(spec ?? '').split(';').map((s) => s.trim()).filter(Boolean)) {
    const colon = part.indexOf(':');
    const ids = (colon < 0 ? '' : part.slice(0, colon)).split(',').map((id) => id.trim()).filter(Boolean);
    const reason = colon < 0 ? '' : part.slice(colon + 1).trim();
    if (!ids.length || reason.length < 12) {
      throw new Error(`${flag} "${part}": write <id>[,<id>]:<reason>, the reason saying what moved and why `
        + '(at least 12 characters, quoted as one argument), e.g. ajax:designation decal stands 2 cm off the glacis edge');
    }
    for (const id of ids) {
      if (out.has(id)) throw new Error(`${flag}: ${id} is named twice; give each id one reason`);
      out.set(id, reason);
    }
  }
  return out;
}
/** --accept-see-through specs (parseReasonedIds). */
export const parseSeeThroughAccepts = (spec) => parseReasonedIds(spec, '--accept-see-through');

const asMap = (value, what) => {
  if (Array.isArray(value)) throw new Error(`${what} needs a reason per id (parseReasonedIds); ledger unchanged`);
  return value instanceof Map ? value : new Map(Object.entries(value ?? {}));
};
const columnsOf = (row) => ({ sealed: row.sealed, openPx: row.openPx, openViews: row.openViews ?? null,
  ...(row.openViewNames ? { openViewNames: row.openViewNames } : {}), seeThroughPx: row.seeThroughPx ?? null,
  netSeeThroughPx: row.netSeeThroughPx ?? null, ...(row.frame ? { frame: row.frame } : {}) });
/** The hole columns of a measurement: an open one names its hole views. */
const openingsOf = ({ sealed, holePx, holeViews, holeViewNames }) => ({ openPx: holePx, openViews: holeViews,
  ...(sealed ? {} : { openViewNames: [...(holeViewNames ?? [])] }) });
const withoutViewNames = ({ openViewNames, ...rest }) => rest;

/** Validate the whole update before returning a new ledger. A rejected new
 * opening must never become a historical allowance on the next invocation.
 * A plain update never changes an existing row (guards 229 critic rounds 1
 * and 2: raising walked baselines up, and tightening to one sample walked
 * them into the census's low tail); it gates every id and records new rows.
 * Existing rows change only by name:
 * - `tighten` (Set of ids, --tighten-ledger): openings and see-through to
 *   min(row, measured), sealed once it measures sealed; netting kept;
 * - `acceptSeeThrough` (Map id -> reason): see-through and netting at the
 *   measurement, openings still held;
 * - `reframe` (Map id -> reason, rows mode only): only for a build that no
 *   longer fits the row's frame (OUT OF FRAME or FRAME STALE) and whose census
 *   in the row's frame does not exceed the row in any column (no slack; see-
 *   through and netting free with an accept for the same id); then the build's
 *   own frame and every column re-measured in it (a sealed row must stay
 *   sealed). Without an accept it changes units only, never a column's state.
 * An accept or a re-frame appends {kind, reason, by, date, from} to the row's
 * `accepts` history (the old values), never replacing an earlier note; a
 * re-frame with an accept appends both. A new
 * row (rows mode only) is the measurement and its frame; it must be sealed,
 * and with a see-through cluster it must be accepted (from: 'no earlier row').
 * seeThroughOnly refuses new rows. */
export function updatedSealedLedger(ledger, reports, generatedAt, requestedIds,
  { acceptSeeThrough = new Map(), reframe = new Map(), tighten = new Set(), seeThroughOnly = false, by = 'unknown', date = localDate() } = {}) {
  const accepted = asMap(acceptSeeThrough, 'See-through acceptance');
  const reframed = asMap(reframe, 'A re-frame');
  const tightened = new Set(tighten);
  // A build failure produces no measurement row. Never save the surviving
  // subset as though the requested batch had been measured completely.
  const expected = new Set(requestedIds);
  const measured = new Set();
  if (!expected.size) throw new Error('No requested vehicles; ledger unchanged');
  const stray = [...accepted.keys(), ...reframed.keys(), ...tightened].filter((id) => !expected.has(id));
  if (stray.length) throw new Error(`See-through acceptance, re-frame or tighten for unrequested ids: ${stray.join(', ')}; ledger unchanged`);
  if (seeThroughOnly && reframed.size) throw new Error('a re-frame re-measures every column: use --update-ledger, not --update-ledger=see-through; ledger unchanged');
  for (const [id, reason] of [...accepted, ...reframed]) {
    if (String(reason ?? '').trim().length < 12) throw new Error(`${id}: an accept or re-frame needs a reason of at least 12 characters; ledger unchanged`);
  }
  for (const { id } of reports) {
    if (!expected.has(id) || measured.has(id)) {
      throw new Error(`${id}: unexpected or duplicate measurement; ledger unchanged`);
    }
    measured.add(id);
  }
  const missing = [...expected].filter((id) => !measured.has(id));
  if (missing.length) throw new Error(`Missing measurements: ${missing.join(', ')}; ledger unchanged`);
  const tanks = { ...ledger.tanks };
  for (const result of reports) {
    const row = ledger.tanks?.[result.id];
    const reason = accepted.get(result.id), reframeReason = reframed.get(result.id);
    if (seeThroughOnly && !row) throw new Error(`${result.id}: a see-through re-baseline needs an existing row (record a new row with --update-ledger); ledger unchanged`);
    if (reframeReason !== undefined && !row) throw new Error(`${result.id}: no row to re-frame (a new vehicle's row is recorded in its own frame); ledger unchanged`);
    const verdict = sealedLedgerVerdict(row, result, { acceptSeeThrough: reason !== undefined, reframe: reframeReason !== undefined });
    if (!verdict.pass) throw new Error(`${result.id}: ${verdict.message}; ledger unchanged`);
    const { sealed, holePx, holeViews, invertedPx, throughPx, netPx, tris, frame } = result;
    if (!row) {
      if (!Array.isArray(frame)) throw new Error(`${result.id}: a new row needs the census frame; ledger unchanged`);
      tanks[result.id] = { sealed, openPx: holePx, openViews: holeViews, insideOutPx: invertedPx, seeThroughPx: throughPx,
        netSeeThroughPx: netPx, tris, frame,
        ...(reason === undefined ? {} : { accepts: [{ kind: 'see-through', reason, by, date, from: 'no earlier row' }] }) };
      continue;
    }
    const history = [...(row.accepts ?? [])];
    let next = { ...row };
    if (reframeReason !== undefined) {
      if (!Array.isArray(frame)) throw new Error(`${result.id}: a re-frame needs the census frame; ledger unchanged`);
      const old = result.oldFrame;
      history.push({ kind: 'reframe', reason: reframeReason, by, date, from: columnsOf(row),
        oldFrameCensus: { sealed: old.sealed, openPx: old.holePx, openViews: old.holeViews, ...(old.holeViewNames ? { openViewNames: old.holeViewNames } : {}),
          seeThroughPx: old.throughPx, seeThroughViews: old.throughViews, netSeeThroughPx: old.netPx } });
      if (reason !== undefined) history.push({ kind: 'see-through', reason, by, date,
        from: { seeThroughPx: row.seeThroughPx ?? null, netSeeThroughPx: row.netSeeThroughPx ?? null, frame: row.frame } });
      next = { ...withoutViewNames(next), sealed: row.sealed || sealed, ...openingsOf(result), insideOutPx: invertedPx,
        seeThroughPx: throughPx, netSeeThroughPx: netPx, tris, frame };
    } else {
      if (reason !== undefined && (row.seeThroughPx !== throughPx || row.netSeeThroughPx !== netPx)) {
        history.push({ kind: 'see-through', reason, by, date,
          from: { seeThroughPx: row.seeThroughPx ?? null, netSeeThroughPx: row.netSeeThroughPx ?? null } });
        next = { ...next, seeThroughPx: throughPx, netSeeThroughPx: netPx };
      }
      if (tightened.has(result.id) && !seeThroughOnly) {
        const lower = holePx < row.openPx;
        next = { ...(lower ? { ...withoutViewNames(next), ...openingsOf(result) } : next), sealed: row.sealed || sealed,
          seeThroughPx: Math.min(next.seeThroughPx, throughPx) };
      } else if (tightened.has(result.id)) {
        next = { ...next, seeThroughPx: Math.min(next.seeThroughPx, throughPx) };
      }
    }
    if (history.length) next.accepts = history;
    tanks[result.id] = next;
  }
  return { ...ledger, generatedAt, tanks };
}
