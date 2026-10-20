/** A row may grow by max(12 px, 10 %) over its baseline before the gate calls it a regression (open and see-through px
 * alike: the census is deterministic, the slack absorbs re-tessellation of an unchanged part). */
const allowance = (baseline) => baseline + Math.max(12, baseline * .1);

/** New vehicles have no historical opening or see-through allowance. Existing baseline rows retain their original
 * sealed/regression policy for openings, and gate see-through (the world seen through glass, markings or undeclared
 * alpha-cut parts, never through declared alpha-cut netting: the census counts that apart as netting px) against the
 * row's seeThroughPx the same way. The see-through measurement is required: a caller that forgets it cannot pass. */
export function sealedLedgerVerdict(row, { sealed, holeViews, holePx, throughPx, throughViews }) {
  if (!Number.isFinite(throughPx) || !Number.isFinite(throughViews)) {
    throw new Error('sealedLedgerVerdict: the see-through census (throughPx, throughViews) is required');
  }
  if (!row) {
    if (!sealed) return { pass: false, message: `new vehicle: ${holeViews} open views without an approved baseline` };
    if (throughViews) return { pass: false, message: `new vehicle: see-through in ${throughViews} views without an approved baseline` };
    return { pass: true, message: 'new vehicle: sealed' };
  }
  if (row.sealed && !sealed) return { pass: false,
    message: `REGRESSION: ledger sealed, now ${holeViews} open views` };
  if (holePx > allowance(row.openPx)) return { pass: false,
    message: `REGRESSION: open px ${holePx} > ledger ${row.openPx}` };
  const seeThrough = seeThroughVerdict(row, throughPx);
  if (!seeThrough.pass) return seeThrough;
  return { pass: true, message: `${row.sealed ? 'ledger: sealed, holds' : `ledger: ${row.openPx} px allowed, holds`}; ${seeThrough.message}` };
}

function seeThroughVerdict(row, throughPx) {
  const baseline = row.seeThroughPx;
  if (!Number.isFinite(baseline)) return { pass: false, message: 'REGRESSION: the ledger row has no see-through baseline' };
  if (throughPx > allowance(baseline)) return { pass: false, message: `REGRESSION: see-through px ${throughPx} > ledger ${baseline}` };
  return { pass: true, message: `see-through ${throughPx} px (ledger ${baseline}), holds` };
}

/** Validate the whole update before returning a new ledger. A rejected new
 * opening must never become a historical allowance on the next invocation.
 * acceptSeeThrough names the ids whose see-through baseline this update may
 * raise (an explicit, per-id re-baseline of a row the gate never held, such
 * as the 35 ghillie ids whose rows predate the netting); their openings are
 * still held to the ledger. Every other id must pass the full verdict.
 * seeThroughOnly rewrites just the see-through columns (seeThroughPx and
 * netSeeThroughPx) of existing rows, leaving the opening baselines as they
 * were: a see-through re-baseline never moves an opening allowance. */
export function updatedSealedLedger(ledger, reports, generatedAt, requestedIds, { acceptSeeThrough = [], seeThroughOnly = false } = {}) {
  // A build failure produces no measurement row. Never save the surviving
  // subset as though the requested batch had been measured completely.
  const expected = new Set(requestedIds);
  const measured = new Set();
  if (!expected.size) throw new Error('No requested vehicles; ledger unchanged');
  const accepted = new Set(acceptSeeThrough);
  const stray = [...accepted].filter((id) => !expected.has(id));
  if (stray.length) throw new Error(`See-through acceptance for unrequested ids: ${stray.join(', ')}; ledger unchanged`);
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
    // an accepted id is judged with its see-through baseline at the measurement: only its openings can fail
    const judged = row && accepted.has(result.id) ? { ...row, seeThroughPx: Math.max(result.throughPx, row.seeThroughPx ?? 0) } : row;
    if (!row && accepted.has(result.id)) throw new Error(`${result.id}: see-through acceptance needs an existing row; ledger unchanged`);
    const verdict = sealedLedgerVerdict(judged, result);
    if (!verdict.pass) throw new Error(`${result.id}: ${verdict.message}; ledger unchanged`);
    const { sealed, holePx, holeViews, invertedPx, throughPx, netPx, tris } = result;
    if (!Number.isFinite(netPx)) throw new Error(`${result.id}: the netting census (netPx) is missing; ledger unchanged`);
    if (seeThroughOnly) {
      if (!row) throw new Error(`${result.id}: a see-through re-baseline needs an existing row; ledger unchanged`);
      const { seeThroughPx: _seeThrough, netSeeThroughPx: _net, tris: rowTris, ...openings } = row;
      tanks[result.id] = { ...openings, seeThroughPx: throughPx, netSeeThroughPx: netPx, ...(rowTris === undefined ? {} : { tris: rowTris }) };
      continue;
    }
    tanks[result.id] = { sealed, openPx: holePx, openViews: holeViews,
      insideOutPx: invertedPx, seeThroughPx: throughPx, netSeeThroughPx: netPx, tris };
  }
  return { ...ledger, generatedAt, tanks };
}
