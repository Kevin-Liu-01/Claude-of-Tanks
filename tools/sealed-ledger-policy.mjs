/** A row may grow by max(12 px, 10 %) over its baseline before the gate calls it a regression (open and see-through px
 * alike: the census is deterministic, the slack absorbs re-tessellation of an unchanged part). */
const allowance = (baseline) => baseline + Math.max(12, baseline * .1);
/** Netting px hold to a two-sided band of max(12 px, 2 %) around the row. An unchanged suit reproduces its count exactly
 * (all 220 rows on 16aeab482), so the band only absorbs float noise; a suit that grows, lifts off its hull, is doubled,
 * sinks into it or goes missing moves the count, and the row must be re-baselined on purpose. Two-sided, so the column
 * cannot go stale: a net that shrank and later drifts back out is still held to what was last measured. */
const nettingSlack = (baseline) => Math.max(12, baseline * .02);

/** New vehicles have no historical opening or see-through allowance. Existing baseline rows retain their original
 * sealed/regression policy for openings, and gate see-through (the world seen through glass, markings or undeclared
 * alpha-cut parts, never through declared alpha-cut netting: the census counts that apart as netting px) against the
 * row's seeThroughPx the same way. Netting px hold to the row's netSeeThroughPx within nettingSlack, both ways. The
 * measurements are required: a caller that forgets one cannot pass, and a row without a baseline fails.
 *
 * acceptSeeThrough is the explicit per-id re-baseline (--accept-see-through, honoured only while updating the ledger):
 * the row's see-through and netting baselines are taken at the measurement, and a vehicle without a row may bring a
 * see-through cluster. Openings are never accepted this way: a new vehicle must still be sealed, an existing row still
 * holds its opening baseline. */
export function sealedLedgerVerdict(row, { sealed, holeViews, holePx, throughPx, throughViews, netPx }, { acceptSeeThrough = false } = {}) {
  if (![throughPx, throughViews, netPx].every(Number.isFinite)) {
    throw new Error('sealedLedgerVerdict: the see-through census (throughPx, throughViews, netPx) is required');
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
 * `--accept-see-through=<id>[,<id>]:<reason>`: the ids whose see-through and netting baselines an update may set at
 * their measurement, and why (at least 12 characters, saying what moved and why). Returns Map(id -> reason); '' is none.
 * Bare ids are refused: an accept without a reason leaves no trail (guards 229 critic round 1).
 */
export function parseSeeThroughAccepts(spec) {
  const accepts = new Map();
  for (const part of String(spec ?? '').split(';').map((s) => s.trim()).filter(Boolean)) {
    const colon = part.indexOf(':');
    const ids = (colon < 0 ? '' : part.slice(0, colon)).split(',').map((id) => id.trim()).filter(Boolean);
    const reason = colon < 0 ? '' : part.slice(colon + 1).trim();
    if (!ids.length || reason.length < 12) {
      throw new Error(`--accept-see-through "${part}": write <id>[,<id>]:<reason>, the reason saying what moved and why `
        + '(at least 12 characters), e.g. ajax:designation decal stands 2 cm off the glacis edge');
    }
    for (const id of ids) accepts.set(id, reason);
  }
  return accepts;
}

/** Validate the whole update before returning a new ledger. A rejected new
 * opening must never become a historical allowance on the next invocation,
 * and an update never raises an allowance it was not asked to (guards 229
 * critic round 1: six passing plain updates walked marder1a3's see-through
 * 113 -> 199 px). For an existing row:
 * - openings only tighten: sealed stays sealed, an open row that measures
 *   sealed becomes sealed, and openPx/openViews take the measurement only
 *   when it is lower;
 * - see-through takes min(row, measurement) and netting keeps the row's
 *   value, unless the id is accepted (`acceptSeeThrough`: Map id -> reason,
 *   parseSeeThroughAccepts), when both take the measurement and the row
 *   records seeThroughAccepted {reason, by, date, from} (the old values);
 * - inside-out px and the triangle count are reports and take the measurement.
 * A new row (rows mode only) is the measurement; it must be sealed, and with a
 * see-through cluster it must be accepted (its note's from: 'no earlier row').
 * seeThroughOnly leaves every opening column as it was. Every id must pass the
 * verdict (an accepted id judged at its measured see-through and netting). */
export function updatedSealedLedger(ledger, reports, generatedAt, requestedIds,
  { acceptSeeThrough = new Map(), seeThroughOnly = false, by = 'unknown', date = localDate() } = {}) {
  if (Array.isArray(acceptSeeThrough)) throw new Error('See-through acceptance needs a reason per id (parseSeeThroughAccepts); ledger unchanged');
  const accepted = acceptSeeThrough instanceof Map ? acceptSeeThrough : new Map(Object.entries(acceptSeeThrough));
  // A build failure produces no measurement row. Never save the surviving
  // subset as though the requested batch had been measured completely.
  const expected = new Set(requestedIds);
  const measured = new Set();
  if (!expected.size) throw new Error('No requested vehicles; ledger unchanged');
  const stray = [...accepted.keys()].filter((id) => !expected.has(id));
  if (stray.length) throw new Error(`See-through acceptance for unrequested ids: ${stray.join(', ')}; ledger unchanged`);
  for (const [id, reason] of accepted) {
    if (String(reason ?? '').trim().length < 12) throw new Error(`${id}: a see-through acceptance needs a reason of at least 12 characters; ledger unchanged`);
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
    const reason = accepted.get(result.id);
    if (seeThroughOnly && !row) throw new Error(`${result.id}: a see-through re-baseline needs an existing row (record a new row with --update-ledger); ledger unchanged`);
    const verdict = sealedLedgerVerdict(row, result, { acceptSeeThrough: reason !== undefined });
    if (!verdict.pass) throw new Error(`${result.id}: ${verdict.message}; ledger unchanged`);
    const { sealed, holePx, holeViews, invertedPx, throughPx, netPx, tris } = result;
    if (!row) {
      tanks[result.id] = { sealed, openPx: holePx, openViews: holeViews, insideOutPx: invertedPx, seeThroughPx: throughPx,
        netSeeThroughPx: netPx, tris, ...(reason === undefined ? {} : { seeThroughAccepted: { reason, by, date, from: 'no earlier row' } }) };
      continue;
    }
    const raise = reason !== undefined && (row.seeThroughPx !== throughPx || row.netSeeThroughPx !== netPx);
    const seeThrough = raise
      ? { seeThroughPx: throughPx, netSeeThroughPx: netPx,
        seeThroughAccepted: { reason, by, date, from: { seeThroughPx: row.seeThroughPx ?? null, netSeeThroughPx: row.netSeeThroughPx ?? null } } }
      : { seeThroughPx: Math.min(row.seeThroughPx, throughPx), netSeeThroughPx: row.netSeeThroughPx,
        ...(row.seeThroughAccepted ? { seeThroughAccepted: row.seeThroughAccepted } : {}) };
    const tighter = holePx < row.openPx;
    const openings = seeThroughOnly
      ? { sealed: row.sealed, openPx: row.openPx, openViews: row.openViews, insideOutPx: row.insideOutPx }
      : { sealed: row.sealed || sealed, openPx: tighter ? holePx : row.openPx, openViews: tighter ? holeViews : row.openViews, insideOutPx: invertedPx };
    const { seeThroughAccepted: _note, ...rest } = row;
    tanks[result.id] = { ...rest, ...openings, seeThroughPx: seeThrough.seeThroughPx, netSeeThroughPx: seeThrough.netSeeThroughPx,
      tris: seeThroughOnly ? row.tris : tris, ...(seeThrough.seeThroughAccepted ? { seeThroughAccepted: seeThrough.seeThroughAccepted } : {}) };
    if (tanks[result.id].tris === undefined) delete tanks[result.id].tris;
    if (tanks[result.id].openViews === undefined) delete tanks[result.id].openViews;
    if (tanks[result.id].insideOutPx === undefined) delete tanks[result.id].insideOutPx;
  }
  return { ...ledger, generatedAt, tanks };
}
