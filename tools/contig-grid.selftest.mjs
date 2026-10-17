// Receipt for tools/contig-grid.mjs, the §B2 hull-anchored contiguity lattice (item/guards-contig-grid-227).
// The 226 defect class: an add-on that only moves the AABB (VH.04's guns 1.2-2 cm longer) re-phased the AABB-framed
// grid over pre-existing 6-7 cm hull gaps, so gaps appeared and vanished with unrelated edits. Each property below is
// checked twice: on the gate's scan, and on a negative control (the pre-227 framing, or the primary phase alone)
// that must FAIL it, so the property has teeth. Pure plan rectangles, no tank build: milliseconds.
import assert from 'node:assert/strict';
import {
  CONTIG_CELL_M, CONTIG_FRAMING, CONTIG_PHASES, PRIMARY_CONTIG_PHASE, anchoredContigFrame, contigCellCenter,
  contigLatticeCell, contigScan, contiguityPassed, legacyContigFrame, onContigLattice, planRectBounds, rasterizePlanRects,
} from './contig-grid.mjs';

const C = CONTIG_CELL_M;
// A 3 x 6 m hull plan with one enclosed through-slot; `along` is the slot's long axis.
function slottedHull({along, at, width, length = 1.6}) {
  const half = length / 2;
  if (along === 'x') return [
    {x0: -1.5, x1: 1.5, z0: at + width, z1: 3}, {x0: -1.5, x1: 1.5, z0: -3, z1: at},
    {x0: -1.5, x1: -half, z0: at, z1: at + width}, {x0: half, x1: 1.5, z0: at, z1: at + width},
  ];
  return [
    {x0: at + width, x1: 1.5, z0: -3, z1: 3}, {x0: -1.5, x1: at, z0: -3, z1: 3},
    {x0: at, x1: at + width, z0: -3, z1: -half}, {x0: at, x1: at + width, z0: half, z1: 3},
  ];
}
// The unrelated add-on: a 10 cm gun tube past the bow (z) or a proud stowage run past the side (x).
const addon = (axis, reach) => axis === 'z'
  ? {x0: -0.05, x1: 0.05, z0: 2.9, z1: 3 + reach} : {x0: 1.4, x1: 1.5 + reach, z0: -0.5, z1: 0.5};

const scanWith = (rects, frameOf, options) => {
  const bounds = planRectBounds(rects), frame = frameOf(bounds);
  return contigScan(rasterizePlanRects(frame, rects), frame, options);
};
const gate = (rects) => scanWith(rects, anchoredContigFrame);
const legacy = (rects) => scanWith(rects, legacyContigFrame);
const primaryOnly = (rects) => scanWith(rects, anchoredContigFrame, {phases: [PRIMARY_CONTIG_PHASE]});
const found = (scan) => scan.gaps.length > 0;
const signature = (scan) => JSON.stringify([scan.holeCells, scan.phaseOnlyCells, scan.phases, scan.gaps]);

// 1. The anchored frame is the lattice: exact cells, edges on multiples of CONTIG_CELL_M, margin >= 2 cells.
for (const bounds of [{minX: -1.731, maxX: 1.702, minZ: -4.4391, maxZ: 6.3146}, {minX: 0.013, maxX: 0.019, minZ: 0, maxZ: 0.002}]) {
  const f = anchoredContigFrame(bounds);
  assert.equal(f.framing, CONTIG_FRAMING);
  for (const v of [f.x0, f.x1, f.z0, f.z1]) assert.ok(Math.abs(v / C - Math.round(v / C)) < 1e-9, `${v} sits on the lattice`);
  assert.ok(Math.abs((f.x1 - f.x0) / f.gridW - C) < 1e-12 && Math.abs((f.z1 - f.z0) / f.gridH - C) < 1e-12, 'cells are exactly 6 cm');
  assert.ok(bounds.minX - f.x0 >= 2 * C - 1e-9 && f.x1 - bounds.maxX >= 2 * C - 1e-9, 'two exterior cells in x');
  assert.ok(bounds.minZ - f.z0 >= 2 * C - 1e-9 && f.z1 - bounds.maxZ >= 2 * C - 1e-9, 'two exterior cells in z');
  assert.equal(f.pw, f.gridW * 3); assert.equal(f.ph, f.gridH * 3);
}
const shiftedOrigin = anchoredContigFrame({minX: -1, maxX: 1, minZ: -2, maxZ: 2}, {originX: 0.013, originZ: -0.021});
assert.ok(Math.abs((shiftedOrigin.x0 - 0.013) / C - Math.round((shiftedOrigin.x0 - 0.013) / C)) < 1e-9, 'the lattice follows the vehicle origin');
assert.ok(!onContigLattice({...legacy(slottedHull({along: 'x', at: 0.032, width: 0.065})), framing: CONTIG_FRAMING}),
  'a stretched AABB raster is never mistaken for the lattice');

// 2. Primary samples are lattice cell centres and keep the historical raster-centre formula exactly.
{
  const scan = gate([{x0: -1, x1: 1, z0: 0.2, z1: 1}, {x0: -1, x1: 1, z0: -1, z1: -0.2},
    {x0: -1, x1: -0.2, z0: -0.2, z1: 0.2}, {x0: 0.2, x1: 1, z0: -0.2, z1: 0.2}]);
  assert.ok(scan.holeCells > 0 && onContigLattice(scan), 'a 40 cm opening reads on the lattice');
  for (const s of scan.samples) {
    const {x0, x1, z0, z1} = scan.bounds;
    assert.equal(s.x, x0 + (s.gx + .5) * (x1 - x0) / scan.gridW, 'raster centre x, term for term');
    assert.equal(s.z, z1 - (s.gy + .5) * (z1 - z0) / scan.gridH, 'raster centre z, term for term');
    const k = contigLatticeCell(s.x, s.z);
    assert.ok(k, 'every primary sample is a lattice cell centre');
    assert.ok(Math.abs(s.x - (k[0] + .5) * C) < 1e-9 && Math.abs(s.z - (k[1] + .5) * C) < 1e-9);
  }
  assert.equal(contigLatticeCell(0.04, 0.03), null, 'a point off the cell centres has no lattice cell');
  const c = contigCellCenter({...scan.bounds, gridW: scan.gridW, gridH: scan.gridH}, 0, 0, [1, 2]);
  assert.ok(Math.abs(c.x - (scan.bounds.x0 + C / 2 + C / 3)) < 1e-12 && Math.abs(c.z - (scan.bounds.z1 - C / 2 - 2 * C / 3)) < 1e-12, 'phase centres shift by whole pixels');
}

// 3. PHASE INVARIANCE (the 226 class). Sweep the add-on reach over more than a cell in 2 mm steps around one
// pre-existing 6.5 cm slot: the gate's answer never moves. The pre-227 framing flips on the same sweep.
for (const [axis, slot] of [['z', {along: 'x', at: 0.032, width: 0.065}], ['x', {along: 'z', at: 0.391, width: 0.067}],
  ['z', {along: 'x', at: -1.207, width: 0.07}]]) {
  const sigs = new Set(), legacyCounts = new Set();
  for (let reach = 0.10; reach <= 0.172 + 1e-9; reach += 0.002) {
    const rects = [...slottedHull(slot), addon(axis, reach)];
    const scan = gate(rects);
    assert.ok(found(scan), `${axis} reach ${reach.toFixed(3)}: the ${slot.width * 100} cm slot is a hole`);
    assert.ok(!contiguityPassed(scan, {passed: scan.holeCells === 0}), 'and the gate fails it');
    sigs.add(signature(scan));
    legacyCounts.add(legacy(rects).holeCells);
  }
  assert.equal(sigs.size, 1, `an AABB-only add-on along ${axis} must not change the hole scan`);
  assert.ok(legacyCounts.size > 1 && legacyCounts.has(0),
    `negative control: the AABB-framed grid hides the same slot for some add-on reaches (${[...legacyCounts]})`);
}

// 4. COMPLETENESS. Every enclosed gap at least 6 cm wide is found wherever it sits against the lattice; the
// primary phase alone misses most of those positions (the luck that 226 exposed). Slits below the 4 cm sample
// span are never holes.
for (const along of ['x', 'z']) {
  for (const width of [0.061, 0.065, 0.07]) {
    let primaryMisses = 0;
    for (let step = 0; step < 24; step++) {
      const at = 0.2003 + step * 0.0025;
      const rects = slottedHull({along, at, width});
      const scan = gate(rects);
      assert.ok(found(scan), `${width * 100} cm slot along ${along} at ${at.toFixed(4)} is found`);
      assert.equal(scan.gaps.length, 1, 'one slot reads as one gap across all phases');
      const g = scan.gaps[0];
      assert.ok(g.gap >= 0.04 && g.gap <= 0.081, `through-width estimate ${g.gap} brackets the slot`);
      assert.ok((along === 'x' ? g.w : g.d) > 1.4, 'the gap spans the slot length');
      if (!found(primaryOnly(rects))) primaryMisses++;
      if (scan.holeCells === 0) assert.ok(scan.phaseOnlyCells > 0 && !contiguityPassed(scan, {passed: true}),
        'a slot the primary phase misses still fails as phase-only even beside a passing opening verdict');
    }
    if (width < 0.07) assert.ok(primaryMisses > 0, `negative control: the primary phase alone misses a ${width * 100} cm slot`);
  }
  for (let step = 0; step < 24; step++) {
    const scan = gate(slottedHull({along, at: 0.2003 + step * 0.0025, width: 0.035}));
    assert.equal(scan.gaps.length, 0, 'a 3.5 cm slit is below the sample span at every phase');
  }
}
assert.equal(gate([{x0: -1.5, x1: 1.5, z0: -3, z1: 3}, addon('z', 0.13)]).gaps.length, 0, 'a closed hull has no holes');

// 5. Approved openings: the same opening seen at other phases is explained by the primary raster; a separate
// hidden gap is not.
{
  const opening = [{x0: -1.5, x1: 1.5, z0: 1.2, z1: 3}, {x0: -1.5, x1: 1.5, z0: -3, z1: 1}, {x0: -1.5, x1: -0.1, z0: 1, z1: 1.2}, {x0: 0.1, x1: 1.5, z0: 1, z1: 1.2}];
  const clean = gate(opening);
  assert.ok(clean.holeCells > 0 && clean.phases.every(p => p.holeCells > 0), 'every phase sees the 20 cm opening');
  assert.equal(clean.phaseOnlyCells, 0, 'the opening at other phases shares pixels with its primary cells');
  assert.ok(contiguityPassed(clean, {passed: true}), 'an approved primary opening passes');
  // a 6.5 cm slot at z -0.988..-0.923: lattice samples k*6 + 1/3/5 cm never all fall inside at the primary phase
  const withSlot = gate([...opening.slice(0, 1), {x0: -1.5, x1: 1.5, z0: -3, z1: -0.988}, {x0: -1.5, x1: 1.5, z0: -0.923, z1: 1},
    {x0: -1.5, x1: -0.8, z0: -0.988, z1: -0.923}, {x0: 0.8, x1: 1.5, z0: -0.988, z1: -0.923}, ...opening.slice(2)]);
  assert.equal(withSlot.holeCells, clean.holeCells, 'the primary phase sees only the opening');
  assert.ok(withSlot.phaseOnlyCells > 0 && withSlot.phaseOnlyGaps.length === 1, 'the hidden slot is one phase-only gap');
  assert.ok(Math.abs(withSlot.phaseOnlyGaps[0].z - (-0.9555)) < 0.03, 'reported where it is');
  assert.ok(!contiguityPassed(withSlot, {passed: true}), 'and fails even when the approved opening verdict passes');
}

// 6. The gate verdict fails closed on anything but a complete anchored scan.
{
  const scan = gate([{x0: -1.5, x1: 1.5, z0: -3, z1: 3}]);
  assert.ok(contiguityPassed(scan, {passed: true}));
  assert.ok(!contiguityPassed(scan, {passed: false}), 'the opening verdict still decides primary holes');
  assert.ok(!contiguityPassed(scan, undefined));
  assert.ok(!contiguityPassed({...scan, framing: 'aabb-legacy'}, {passed: true}), 'a legacy-framed scan cannot pass');
  assert.ok(!contiguityPassed({...scan, phases: scan.phases.slice(0, 1)}, {passed: true}), 'a scan missing phases cannot pass');
  assert.ok(!contiguityPassed({...scan, phaseOnlyCells: undefined}, {passed: true}));
  assert.ok(!contiguityPassed({...scan, bounds: {...scan.bounds, z0: scan.bounds.z0 + .001}}, {passed: true}), 'off-lattice bounds cannot pass');
  assert.equal(CONTIG_PHASES.length, 9);
}
console.log('contig-grid.selftest: hull-anchored lattice; AABB-only add-ons never move a hole; every >=6 cm gap found at some phase; legacy and primary-only controls fail');
