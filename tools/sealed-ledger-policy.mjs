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
      message: `new vehicle: see-through in ${throughViews} views without an approved baseline (fix it, or record the row with --update-ledger --accept-see-through=<id>)` };
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
    message: `REGRESSION: netting px ${measured} ${measured > baseline ? '>' : '<'} ledger ${baseline} (the declared netting moved, grew or shrank; re-baseline on purpose with --update-ledger=see-through --accept-see-through=<id>)` };
  return { pass: true, message: `netting ${measured} px (ledger ${baseline}), holds` };
}

/** Validate the whole update before returning a new ledger. A rejected new
 * opening must never become a historical allowance on the next invocation.
 * acceptSeeThrough names the ids whose see-through and netting baselines this
 * update may set at their measurement (an explicit, per-id decision: a row the
 * gate never held, such as the 35 ghillie ids whose rows predate the netting,
 * or a vehicle without a row whose see-through cluster is accepted, such as
 * ajax's and griffin_viper's marking specks); their openings are still held,
 * to the row or to the new-vehicle rule. Every other id must pass the full
 * verdict. seeThroughOnly rewrites just the see-through columns (seeThroughPx
 * and netSeeThroughPx) of existing rows, leaving the opening baselines as they
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
    if (seeThroughOnly && !row) throw new Error(`${result.id}: a see-through re-baseline needs an existing row (record a new row with --update-ledger); ledger unchanged`);
    const verdict = sealedLedgerVerdict(row, result, { acceptSeeThrough: accepted.has(result.id) });
    if (!verdict.pass) throw new Error(`${result.id}: ${verdict.message}; ledger unchanged`);
    const { sealed, holePx, holeViews, invertedPx, throughPx, netPx, tris } = result;
    if (seeThroughOnly) {
      const { seeThroughPx: _seeThrough, netSeeThroughPx: _net, tris: rowTris, ...openings } = row;
      tanks[result.id] = { ...openings, seeThroughPx: throughPx, netSeeThroughPx: netPx, ...(rowTris === undefined ? {} : { tris: rowTris }) };
      continue;
    }
    tanks[result.id] = { sealed, openPx: holePx, openViews: holeViews,
      insideOutPx: invertedPx, seeThroughPx: throughPx, netSeeThroughPx: netPx, tris };
  }
  return { ...ledger, generatedAt, tanks };
}
