/** New vehicles have no historical opening allowance. Existing baseline
 * rows retain their original sealed/regression policy. */
export function sealedLedgerVerdict(row, { sealed, holeViews, holePx }) {
  if (!row) return { pass: sealed,
    message: sealed ? 'new vehicle: sealed' : `new vehicle: ${holeViews} open views without an approved baseline` };
  if (row.sealed && !sealed) return { pass: false,
    message: `REGRESSION: ledger sealed, now ${holeViews} open views` };
  if (holePx > row.openPx + Math.max(12, row.openPx * .1)) return { pass: false,
    message: `REGRESSION: open px ${holePx} > ledger ${row.openPx}` };
  return { pass: true, message: row.sealed ? 'ledger: sealed, holds' : `ledger: ${row.openPx} px allowed, holds` };
}

/** Validate the whole update before returning a new ledger. A rejected new
 * opening must never become a historical allowance on the next invocation. */
export function updatedSealedLedger(ledger, reports, generatedAt, requestedIds) {
  // A build failure produces no measurement row. Never save the surviving
  // subset as though the requested batch had been measured completely.
  const expected = new Set(requestedIds);
  const measured = new Set();
  if (!expected.size) throw new Error('No requested vehicles; ledger unchanged');
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
    const verdict = sealedLedgerVerdict(ledger.tanks?.[result.id], result);
    if (!verdict.pass) throw new Error(`${result.id}: ${verdict.message}; ledger unchanged`);
    const { sealed, holePx, holeViews, invertedPx, throughPx, tris } = result;
    tanks[result.id] = { sealed, openPx: holePx, openViews: holeViews,
      insideOutPx: invertedPx, seeThroughPx: throughPx, tris };
  }
  return { ...ledger, generatedAt, tanks };
}
