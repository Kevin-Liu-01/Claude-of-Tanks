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

/** New vehicles have no historical opening or see-through allowance. Existing baseline rows retain their original
 * sealed/regression policy for openings, and gate see-through (the world seen through glass, markings or undeclared
 * alpha-cut parts, never through declared alpha-cut netting: the census counts that apart as netting px) against the
 * row's seeThroughPx the same way. Netting px hold to the row's netSeeThroughPx within nettingSlack, both ways. The
 * measurements are required: a caller that forgets one cannot pass, and a row without a baseline fails.
 *
 * acceptSeeThrough is the explicit per-id re-baseline (--accept-see-through, honoured only while updating the ledger):
 * the row's see-through and netting baselines are taken at the measurement, and a vehicle without a row may bring a
 * see-through cluster. No flag accepts an opening: a new vehicle must still be sealed, an existing row still holds its
 * opening baseline and hole views (the one open row, leo2a4, came from the 229 framed re-base, history kind
 * 'rebaseline'). reframe judges the build in the row's old frame by this same gate (see below). */
export function sealedLedgerVerdict(row, { sealed, holeViews, holePx, throughPx, throughViews, netPx, frameExceeded = false, oldFrame = null }, { acceptSeeThrough = false, reframe = false } = {}) {
  if (![throughPx, throughViews, netPx].every(Number.isFinite)) {
    throw new Error('sealedLedgerVerdict: the see-through census (throughPx, throughViews, netPx) is required');
  }
  // the row's frame no longer holds the build (an extremity grew past its margin): its pixels are not comparable
  if (row && frameExceeded && !reframe) return { pass: false,
    message: 'REFRAME: the build reaches past the row\'s census frame; re-record it with --update-ledger --reframe=<id>:<reason> (every column is re-measured in the new frame)' };
  // A re-frame (critic round 3) is the remedy for an outgrown frame only, and it accepts nothing new: the build must
  // reach past the row's frame, and its census in that old frame (where the outgrown geometry is merely clipped, so
  // every unchanged column reproduces exactly) must pass the row's normal gate, openings, see-through and netting band
  // alike. Only then is every column re-measured in the new frame, where a sealed row must still be sealed.
  if (row && reframe) {
    if (!Array.isArray(row.frame)) return { pass: false, message: 'REFRAME refused: the row records no census frame' };
    if (!frameExceeded) return { pass: false, message: 'REFRAME refused: the build stays inside the row\'s census frame; there is nothing to re-frame' };
    if (!oldFrame) return { pass: false, message: 'REFRAME refused: a re-frame needs the census in the row\'s old frame' };
    const inOld = sealedLedgerVerdict(row, { ...oldFrame, frameExceeded: false });
    if (!inOld.pass) return { pass: false, message: `REFRAME refused: in its old frame the build fails its row (${inOld.message})` };
    if (row.sealed && !sealed) return { pass: false, message: `REGRESSION: ledger sealed, now ${holeViews} open views in the new frame` };
    return { pass: true, message: `ledger: re-framed; in the old frame ${inOld.message}` };
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
  // an open row still holds its hole views: a new hole cluster in another view fails (critic round 3, leo2a4)
  if (!row.sealed && Number.isFinite(row.openViews) && holeViews > row.openViews) return { pass: false,
    message: `REGRESSION: open in ${holeViews} views > ledger ${row.openViews} (a new hole cluster)` };
  const judged = acceptSeeThrough ? { seeThroughPx: Math.max(throughPx, row.seeThroughPx ?? 0), netSeeThroughPx: netPx } : row;
  const seeThrough = seeThroughVerdict(judged.seeThroughPx, throughPx);
  if (!seeThrough.pass) return seeThrough;
  const netting = nettingVerdict(judged.netSeeThroughPx, netPx);
  if (!netting.pass) return netting;
  return { pass: true, message: `${row.sealed ? 'ledger: sealed, holds' : `ledger: ${row.openPx} px allowed, holds`}; ${seeThrough.message}; ${netting.message}` };
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
 * rounded up to 10 cm. An extremity that later reaches past the radius asks for an explicit --reframe.
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
const columnsOf = (row) => ({ sealed: row.sealed, openPx: row.openPx, seeThroughPx: row.seeThroughPx ?? null,
  netSeeThroughPx: row.netSeeThroughPx ?? null, ...(row.frame ? { frame: row.frame } : {}) });

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
 * - `reframe` (Map id -> reason): only for a build that outgrew the row's
 *   frame and whose census in that old frame passes the row's normal gate;
 *   then a new census frame and every column re-measured in it (a sealed row
 *   must stay sealed): a re-frame changes units, never accepts anything new.
 * An accept or a re-frame appends {kind, reason, by, date, from} to the row's
 * `accepts` history (the old values), never replacing an earlier note. A new
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
      history.push({ kind: 'reframe', reason: reframeReason, by, date, from: columnsOf(row),
        oldFrameCensus: { sealed: result.oldFrame.sealed, openPx: result.oldFrame.holePx, seeThroughPx: result.oldFrame.throughPx, netSeeThroughPx: result.oldFrame.netPx } });
      next = { ...next, sealed: row.sealed || sealed, openPx: holePx, openViews: holeViews, insideOutPx: invertedPx,
        seeThroughPx: throughPx, netSeeThroughPx: netPx, tris, frame };
    } else {
      if (reason !== undefined && (row.seeThroughPx !== throughPx || row.netSeeThroughPx !== netPx)) {
        history.push({ kind: 'see-through', reason, by, date,
          from: { seeThroughPx: row.seeThroughPx ?? null, netSeeThroughPx: row.netSeeThroughPx ?? null } });
        next = { ...next, seeThroughPx: throughPx, netSeeThroughPx: netPx };
      }
      if (tightened.has(result.id) && !seeThroughOnly) {
        const lower = holePx < row.openPx;
        next = { ...next, sealed: row.sealed || sealed, openPx: lower ? holePx : row.openPx, openViews: lower ? holeViews : row.openViews,
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
