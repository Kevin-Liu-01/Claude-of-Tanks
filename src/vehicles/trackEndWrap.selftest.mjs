import assert from 'node:assert/strict';
import { createTank } from './tankFactory.ts';
import { ALL_TANK_IDS } from './specs.ts';
import { endWrapRows, endWrapFlags, measureEndWrap, bandCentrelineCells, runningGearBands,
  END_WRAP_CUT_LIMIT_MM, END_WRAP_DEVIATION_LIMIT_MM } from '../../tools/track-end-wrap.mjs';

// Fleet end-wrap receipt (owner 2026-09-21: the TOS-1A "tracks have the improper wrapping issue around the front road
// wheel and back road wheel. research why this happens then have a check for this for all tanks").
// Every side of every running-gear unit must leave its OUTER road wheels tangentially: the rendered rest band hugs the
// tire's seat circle down from the foot and departs along the common external tangent to the idler / sprocket wrap.
// The band is read per side against that side's actual outer wheel (wheelZsLeftM / wheelZsRightM when a measured rig
// staggers its axles), which is what the older midpoint-station review could not see: the T-90MS X course wrapped a
// station 38 mm from either side's wheel, cut 16–23 mm into one end tire of each side and floated ~20 mm off the other.
// Dead-track ends whose drive / idler wrap crosses the ground run ('ground-level') carry no wheel wrap and are exempt.
const STAGGERED = ['tos1a_tagil', 't90ms_x', 'cv90105_tml_x', 'cv90_mkiv_x', 'ztz100_x'];
const EXEMPT_STATUSES = new Set(['ok', 'ground-level']);
const started = Date.now();
const statuses = {};
const failures = [];
let measured = 0, worstCut = 0, worstDeviation = 0, staggeredEnds = 0;
for (const id of ALL_TANK_IDS) {
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, batchStatic: false });
  try {
    const rows = endWrapRows(tank.root);
    assert.ok(rows.length >= 4, `${id}: both sides of a running-gear unit were measured (${rows.length} rows)`);
    for (const row of rows) {
      statuses[row.status] = (statuses[row.status] || 0) + 1;
      const label = `${id} u${row.unit} ${row.side < 0 ? 'L' : 'R'} ${row.end}`;
      if (!EXEMPT_STATUSES.has(row.status)) { failures.push(`${label}: no measurable end wrap (${row.status})`); continue; }
      if (row.status !== 'ok') continue;
      measured++;
      worstCut = Math.min(worstCut, row.cutMm);
      worstDeviation = Math.max(worstDeviation, row.deviationMm);
      const flags = endWrapFlags(row);
      if (flags.length) failures.push(`${label}: ${flags.join(',')} — band centreline ${row.cutMm} mm from its seat, ${row.deviationMm} mm off the tangent wrap at ${JSON.stringify(row.worstAt)} (station offset ${row.offsetMm} mm)`);
      if (Math.abs(row.offsetMm) >= 30) staggeredEnds++;
    }
    if (STAGGERED.includes(id)) {
      // the staggered rigs are the reason this receipt exists: their bands must be wrapped about their OWN wheels, and
      // the same band read against the shared course station (what the fleet rendered before the side-station bake)
      // must be caught — the metric is proven on the defect, not only on the fix
      for (const { receipt, bands } of runningGearBands(tank.root)) {
        for (const side of [-1, 1]) {
          if (!bands[side]) continue;
          const cells = bandCentrelineCells(bands[side]);
          const midpoint = { ...receipt, wheelZsLeftM: receipt.wheelZs, wheelZsRightM: receipt.wheelZs };
          for (const end of ['front', 'rear']) {
            const own = measureEndWrap(receipt, cells, side, end);
            if (own.status !== 'ok' || Math.abs(own.offsetMm) < 30) continue;
            const wrong = measureEndWrap(midpoint, cells, side, end);
            if (!(wrong.status === 'ok' && endWrapFlags(wrong).length)) {
              failures.push(`${id} ${side < 0 ? 'L' : 'R'} ${end}: negative control — the check must flag a band wrapped about the shared station ${own.offsetMm} mm from the wheel (${JSON.stringify(wrong)})`);
            }
          }
        }
      }
    }
  } finally { tank.dispose?.(); }
}
assert.ok(measured >= 700, `the fleet exposes its end wraps (${measured} measured ends)`);
assert.ok(staggeredEnds >= 12, `the staggered-station rigs took part with their own stations (${staggeredEnds} ends offset ≥ 30 mm)`);
assert.deepEqual(failures, [], `end-wrap failures:\n  ${failures.join('\n  ')}`);
console.log(`trackEndWrap.selftest: ${ALL_TANK_IDS.length} tanks, ${measured} tangent end wraps within ${END_WRAP_CUT_LIMIT_MM} mm cut / ${END_WRAP_DEVIATION_LIMIT_MM} mm deviation (worst cut ${worstCut} mm, worst deviation ${worstDeviation} mm, ${staggeredEnds} staggered-station ends), statuses ${JSON.stringify(statuses)}, ${((Date.now() - started) / 1000).toFixed(0)} s`);
