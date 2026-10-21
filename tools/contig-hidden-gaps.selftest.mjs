// Receipt for tools/contig-hidden-gaps.mjs, the committed fleet hidden-gap audit behind tank-standard-check's §B2
// (guards 229). The hull-anchored lattice finds old 6-10 cm plan gaps the pre-227 AABB raster missed; the ledger lists
// exactly those, per id, so turning the lattice on fails nothing nobody touched, while a new gap (or a listed one that
// grew) still fails. Pure plan rectangles and the committed JSON: no tank build, no browser, well under a second.
//   1. Boxes are exact vehicle-frame pixel boxes and do not move with an AABB-only add-on (the 226 class).
//   2. The verdict: an unlisted phase-only gap fails; listed, it passes; a second gap, or the listed gap widened past
//      its box, fails again; a closed gap passes and is reported for pruning. A gap the old raster saw is never listed.
//   3. The committed ledger: canonical, fleet ids only, sane boxes; tank-standard-check applies it before the verdict.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLEET_GROUP_BY_ID } from '../src/vehicles/fleetManifest.ts';
import { anchoredContigFrame, contigScan, contiguityPassed, planRectBounds, rasterizePlanRects } from './contig-grid.mjs';
import {
  CONTIG_HIDDEN_LEDGER, applyHiddenGaps, cellPixelBox, gapPixelBox, hiddenGapEntry, hiddenRowsFromAudit, readHiddenLedger,
  serializeHiddenLedger,
} from './contig-hidden-gaps.mjs';
import { sourceOpeningsVerdict } from './source-openings-policy.mjs';

// A 3 x 6 m hull plan with enclosed through-slots across x (z = at .. at + width), 1.6 m long, plus an optional add-on.
function hull(slots, addonReach = 0) {
  const rects = [{ x0: -1.5, x1: -0.8, z0: -3, z1: 3 }, { x0: 0.8, x1: 1.5, z0: -3, z1: 3 }];
  const edges = [-3, ...[...slots].sort((a, b) => a.at - b.at).flatMap(({ at, width }) => [at, at + width]), 3];
  for (let i = 0; i < edges.length; i += 2) rects.push({ x0: -0.8, x1: 0.8, z0: edges[i], z1: edges[i + 1] });
  if (addonReach) rects.push({ x0: -0.05, x1: 0.05, z0: 2.9, z1: 3 + addonReach });
  return rects;
}
const scanOf = (rects) => { const frame = anchoredContigFrame(planRectBounds(rects)); return contigScan(rasterizePlanRects(frame, rects), frame); };
// the gate's §B2 verdict for an ordinary (non-opening) id, as tank-standard-check reaches it
const verdict = (scan, row) => {
  const judged = applyHiddenGaps(scan, row);
  return { ...judged, passed: contiguityPassed(judged.scan, sourceOpeningsVerdict({ id: 'selftest_tank', scan: judged.scan })) };
};
const auditRow = (id, scan, seenOnMain = false) => ({ id, gaps: scan.gaps.map((g) => ({ ...g, seenOnMain })) });

// A 6.6 cm slot two sub-cell phases off the primary raster: the old gate's luck-of-alignment gap.
const SLOT = { at: 0.034, width: 0.066 };
const base = scanOf(hull([SLOT]));
assert.ok(base.phaseOnlyCells > 0 && base.gaps.length === 1, `the fixture slot is a phase-only gap (${base.holeCells} primary, ${base.phaseOnlyCells} phase-only)`);

// 1. Exact boxes, the 226 class.
{
  const [gap] = base.gaps, box = gapPixelBox(gap);
  assert.ok(box.every(Number.isInteger) && box[0] <= box[2] && box[1] <= box[3], 'an integer pixel box');
  assert.ok(Math.abs((box[0] + box[2] + 1) * 0.01 - gap.x) < 1e-9 && Math.abs((box[2] - box[0] + 1) * 0.02 - gap.w) < 1e-9, 'the box is the gap\'s x extent');
  assert.ok(Math.abs((box[1] + box[3] + 1) * 0.01 - gap.z) < 1e-9 && Math.abs((box[3] - box[1] + 1) * 0.02 - gap.d) < 1e-9, 'and its z extent');
  assert.ok(box[1] * 0.02 >= SLOT.at - 0.02 - 1e-9 && (box[3] + 1) * 0.02 <= SLOT.at + SLOT.width + 0.02 + 1e-9
    && box[0] * 0.02 >= -0.8 - 1e-9 && (box[2] + 1) * 0.02 <= 0.8 + 1e-9, 'it lies in the slot (whole uncovered cells)');
  assert.deepEqual(cellPixelBox({ x: 0.03, z: -0.09 }), [0, -6, 2, -4], 'a lattice cell is a 3 x 3 pixel box');
  const row = hiddenRowsFromAudit([auditRow('t', base)]).t;
  for (let reach = 0.10; reach <= 0.172 + 1e-9; reach += 0.004) {
    const swept = scanOf(hull([SLOT], reach));
    assert.deepEqual(swept.gaps.map(gapPixelBox), [box], `an add-on ${reach.toFixed(3)} m past the bow moves no box`);
    assert.ok(verdict(swept, row).passed, `and the listed gap stays known at every reach (${reach.toFixed(3)} m)`);
  }
}

// 2. The verdict.
{
  const row = hiddenRowsFromAudit([auditRow('t', base)]).t;
  assert.equal(row.length, 1);
  assert.deepEqual(Object.keys(row[0]), ['box', 'at', 'size', 'through', 'phases', 'walls']);
  const bare = verdict(base, undefined);
  assert.equal(bare.passed, false, 'unlisted, the lattice\'s phase-only gap fails §B2 (the guard\'s teeth)');
  const known = verdict(base, row);
  assert.ok(known.passed && known.listed.length === 1 && !known.closed.length && known.scan.phaseOnlyCells === 0,
    'listed, the same gap passes as a known work order');
  assert.equal(known.scan.ledger.rawPhaseOnlyCells, base.phaseOnlyCells, 'the report keeps what the lattice read');
  const second = scanOf(hull([SLOT, { at: -1.204, width: 0.07 }]));
  assert.ok(second.gaps.length === 2 && !verdict(second, row).passed, 'a second, new gap fails beside a listed one');
  const wider = scanOf(hull([{ at: SLOT.at, width: 0.11 }]));
  const grown = verdict(wider, row);
  assert.ok(!grown.passed, `the listed gap widened past its box fails (${wider.holeCells} primary, ${wider.phaseOnlyCells} phase-only)`);
  const shut = verdict(scanOf(hull([])), row);
  assert.ok(shut.passed && shut.closed.length === 1 && !shut.listed.length, 'a closed gap passes and is reported for pruning');
  // a gap the old raster also saw was red before the lattice and is never listed: it stays red
  const big = scanOf(hull([{ at: 0.3, width: 0.3 }]));
  assert.ok(big.holeCells > 0, 'a 30 cm slot is a primary hole');
  assert.deepEqual(hiddenRowsFromAudit([auditRow('t', big, true)]), {}, 'a gap seenOnMain is not a hidden gap');
  assert.equal(verdict(big, undefined).passed, false, 'and fails as it always did');
  assert.throws(() => hiddenRowsFromAudit([{ id: 'x', error: 'page crashed' }]), /audit row is an error/, 'no row from a failed scan');
  assert.throws(() => gapPixelBox({ x: 0, z: 0, w: 0, d: 0.06 }), /finite/, 'an empty gap has no box');
  const entry = hiddenGapEntry({ x: 1.39, z: -0.09, w: 0.06, d: 0.06, gap: 0.06, phases: 1,
    walls: [{ mesh: 'hull', y: 1.031 }, { mesh: null }, { mesh: 'hull', y: 1.46 }, { mesh: 'hullDark', y: 1.4 }] });
  assert.deepEqual(entry, { box: [68, -6, 70, -4], at: [1.39, -0.09], size: [0.06, 0.06], through: 0.06, phases: 1,
    walls: 'hull@1.03 / sky / hull@1.46 / hullDark@1.40' });
}

// 3. The committed ledger and the gate's wiring.
{
  const ledger = readHiddenLedger();
  assert.ok(ledger, `${CONTIG_HIDDEN_LEDGER} is committed`);
  assert.equal(serializeHiddenLedger(ledger), readFileSync(CONTIG_HIDDEN_LEDGER, 'utf8'),
    `${CONTIG_HIDDEN_LEDGER} is in its canonical one-row-per-id form (write it only through tools/contig-hidden-gaps.mjs)`);
  const stray = Object.keys(ledger.rows).filter((id) => !FLEET_GROUP_BY_ID[id]);
  assert.deepEqual(stray, [], 'every row is a fleet id');
  for (const [id, gaps] of Object.entries(ledger.rows)) {
    assert.ok(gaps.length > 0, `${id}: no empty row`);
    for (const g of gaps) {
      const [x0, z0, x1, z1] = g.box;
      assert.ok(g.box.every(Number.isInteger) && x0 <= x1 && z0 <= z1, `${id}: an integer box`);
      assert.deepEqual(gapPixelBox({ x: g.at[0], z: g.at[1], w: g.size[0], d: g.size[1] }), g.box, `${id}: box and extent agree`);
      assert.ok(g.phases >= 1 && g.phases <= 9, `${id}: phases of 9`);
    }
  }
  const gate = readFileSync(new URL('./tank-standard-check.mjs', import.meta.url), 'utf8');
  for (const needle of ['applyHiddenGaps(result.holes, hiddenLedger?.rows?.[id])', 'result.holes = hidden.scan;',
    'contigOk = contiguityPassed(st.holes, opening);']) assert.ok(gate.includes(needle), `tank-standard-check: ${needle}`);
  assert.ok(gate.indexOf('result.holes = hidden.scan;') < gate.indexOf('openingReports.set(id, await measureSourceOpenings(id, result.holes'),
    'the ledger applies before the openings policy reads the scan');
  console.log(`contig-hidden-gaps.selftest: exact boxes hold across the 226 add-on sweep; an unlisted, second or grown gap fails, a listed `
    + `one passes and a closed one is reported; ${Object.values(ledger.rows).flat().length} listed gaps on `
    + `${Object.keys(ledger.rows).length} ids, canonical; the gate applies the ledger before its verdict`);
}
