// hallClerestory.selftest.mjs (inherited-reds-276, 2026-11-23; Main: "every bay between two columns gets a whole light,
// evenly spaced"). A sheet hall's clerestory (hall.ts clerestoryLights) hangs one whole light centred in every bay of each
// long side, clear of the portal columns, so the band reads evenly; a bay is blank only where the side has a door or gate in
// it or another opening crosses the band. The lights' own 4.4 m grid crossed columns (wadirum/depot invertedM2 0.169 since
// 1ae1deb5f4), and dropping the ones that crossed left uneven blank bays (kyushu/warehouse, wadirum/factory).
// 1. the planner over a grid of halls and openings; 2. the drawn glass of real halls built by sheetHall, light by bay;
// 3. negative controls: a planner that drops a bay, and one that lays a light across a column, are both caught.
import assert from 'node:assert/strict';
import { PartSink, rgb } from './geometry.ts';
import { clerestoryLights, hallFrameLines, sheetHall } from './hall.ts';

const COLUMN_CLEAR = 0.11 + 0.02 + 0.03 - 1e-9, GABLE_CLEAR = 0.6 - 1e-9;

/** What is wrong with a set of lights for a hall of depth d (and the openings that may blank a bay), as strings. */
function faults(lights, d, blankBays = { left: new Set(), right: new Set() }) {
  const { bays, iz, frameLines } = hallFrameLines(d);
  const edges = [-iz, ...frameLines, iz], out = [];
  for (const face of ['left', 'right']) {
    const own = lights.filter((l) => l.face === face);
    for (let k = 0; k < bays; k++) {
      const inBay = own.filter((l) => l.u - l.w / 2 >= edges[k] - 1e-6 && l.u + l.w / 2 <= edges[k + 1] + 1e-6);
      const want = blankBays[face].has(k) ? 0 : 1;
      if (inBay.length !== want) out.push(`${face} bay ${k}: ${inBay.length} whole lights, want ${want}`);
      for (const l of inBay) if (Math.abs(l.u - (Math.max(edges[k], -d / 2 + 0.6) + Math.min(edges[k + 1], d / 2 - 0.6)) / 2) > 0.2) {
        out.push(`${face} bay ${k}: light off the bay's centre (u ${l.u.toFixed(2)})`);
      }
    }
    for (const l of own) {
      for (const z of frameLines) if (Math.abs(l.u - z) < l.w / 2 + COLUMN_CLEAR) out.push(`${face}: light at u ${l.u.toFixed(2)} crosses the column at ${z.toFixed(2)}`);
      if (Math.abs(l.u) + l.w / 2 > d / 2 - GABLE_CLEAR) out.push(`${face}: light at u ${l.u.toFixed(2)} into the gable`);
    }
    // evenly spaced: the bays are equal, so whole interior lights are equal width and one bay apart
    const widths = new Set(own.filter((l) => l.bay > 0 && l.bay < bays - 1).map((l) => l.w.toFixed(3)));
    if (widths.size > 1) out.push(`${face}: interior lights of unequal width ${[...widths]}`);
  }
  return out;
}

// 1. the planner: every depth from 8 to 48 m, with a side door, a tear across the band and one under it
const hall = (d) => ({ w: 14, d, eave: 5.2, kerb: 1.2 });
let halls = 0;
for (let d = 8; d <= 48; d += 0.25) {
  const { bays, frameLines, iz } = hallFrameLines(d), edges = [-iz, ...frameLines, iz];
  const bayOf = (u) => edges.findIndex((e, k) => k < bays && u >= e && u < edges[k + 1]);
  assert.deepEqual(faults(clerestoryLights(hall(d), []), d), [], `d ${d}: a whole light in every bay`);
  const door = d * 0.25, doorOpening = { face: 'right', storey: 0, kind: 'door', u: door, w: 1.0, y0: 0, h: 2.2 };
  const withDoor = clerestoryLights(hall(d), [doorOpening]);
  const doorBays = new Set(edges.slice(0, bays).map((_, k) => k).filter((k) => {
    const l = clerestoryLights(hall(d), []).find((x) => x.face === 'right' && x.bay === k);
    return l && Math.abs(l.u - door) < (l.w + 1.0) / 2;
  }));
  // the blank bays are the door's own (a door under a column, between two lights, blanks none)
  assert.ok([...doorBays].every((k) => Math.abs(k - bayOf(door)) <= 1), `d ${d}: the side door blanks only a bay it stands by`);
  assert.deepEqual(faults(withDoor, d, { left: new Set(), right: doorBays }), [], `d ${d}: blank only over the side door`);
  const wall = 5.2 - 1.2;
  // a tear in the middle of one bay's light span (a tear on a column line would cross two bays' lights)
  const mid = clerestoryLights(hall(d), []).find((l) => l.face === 'left' && l.bay === bays >> 1).u;
  const across = { face: 'left', storey: 0, kind: 'loft', u: mid, w: 1.2, y0: wall - 1.0, h: 0.6 };
  const under = { face: 'left', storey: 0, kind: 'loft', u: mid, w: 1.2, y0: 0.4, h: 1.0 };
  assert.equal(clerestoryLights(hall(d), [under]).filter((l) => l.face === 'left').length, bays, `d ${d}: a tear under the band blanks nothing`);
  assert.equal(clerestoryLights(hall(d), [across]).filter((l) => l.face === 'left').length, bays - 1, `d ${d}: a tear across the band blanks its bay`);
  halls++;
}

// 2. real halls: the glass sheetHall draws on each long side, one pane group a bay (the kits' shapes: wadirum, kyushu,
//    hostomel, queenstown, glencanyon, navajo)
const BASE = { pitchDeg: 12, livery: rgb(0x8a8a80), doorLivery: rgb(0x6a6e70), trim: rgb(0x5a5e60), doors: 'sliding', doorH: 4,
  open: 0.3, backDoor: null, clerestory: true, roofLights: false, ridgeVent: false, gutters: true, mobile: false };
const SHAPES = [
  { w: 16, d: 24, eave: 5.2, kerb: 1.2, doorW: 4.2, sideDoor: 6 },
  { w: 14, d: 31, eave: 6.0, kerb: 0.9, doorW: 4.0 },
  { w: 22, d: 38, eave: 8.0, kerb: 1.0, doorW: 6.0 },
  { w: 12, d: 18, eave: 5.0, kerb: 0.3, doorW: 3.6, sideDoor: -5.4 },
  { w: 18, d: 27, eave: 6.6, kerb: 1.1, doorW: 4.4, doorAt: [-4.3, 4.3] },
  { w: 10, d: 13, eave: 4.4, kerb: 0.5, doorW: 3.0 },
];
let panes = 0;
for (const shape of SHAPES) {
  const spec = { ...BASE, ...shape }, sink = new PartSink();
  let seed = 7; const variant = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  sheetHall(sink, spec, variant);
  const parts = sink.finish();
  const planned = clerestoryLights(spec, spec.sideDoor !== undefined
    ? [{ face: 'right', storey: 0, kind: 'door', u: spec.sideDoor, w: 1.0, y0: 0, h: 2.2 }] : []);
  for (const [face, sign] of [['left', -1], ['right', 1]]) {
    // the side's glass, facing out of it, grouped by its spans along z
    const spans = [];
    for (const [bucket, geos] of Object.entries(parts)) {
      if (!/glass/i.test(bucket) || !Array.isArray(geos)) continue;
      for (const g of geos) {
        const p = g.getAttribute('position'), idx = g.index ? g.index.array : null, n = idx ? idx.length : p.count;
        for (let i = 0; i + 2 < n; i += 3) {
          const v = [0, 1, 2].map((k) => { const j = idx ? idx[i + k] : i + k; return [p.getX(j), p.getY(j), p.getZ(j)]; });
          const cx = (v[0][0] + v[1][0] + v[2][0]) / 3;
          if (Math.sign(cx) !== sign || Math.abs(cx) < spec.w / 2 - 0.6) continue;
          spans.push([Math.min(...v.map((q) => q[2])), Math.max(...v.map((q) => q[2]))]);
        }
      }
    }
    spans.sort((a, b) => a[0] - b[0]);
    const groups = [];
    for (const [lo, hi] of spans) {
      if (groups.length && lo <= groups.at(-1)[1] + 0.3) groups.at(-1)[1] = Math.max(groups.at(-1)[1], hi);
      else groups.push([lo, hi]);
    }
    const mine = planned.filter((l) => l.face === face);
    assert.equal(groups.length, mine.length, `${spec.w}x${spec.d} ${face}: the drawn lights are the planned ones (${groups.length} vs ${mine.length})`);
    const { frameLines } = hallFrameLines(spec.d);
    // the drawn side's u runs along z (its sign by face); every pane group sits inside one bay
    for (const [lo, hi] of groups) for (const z of frameLines) {
      assert.ok(!(lo < z && hi > z) && !(lo < -z && hi > -z), `${spec.w}x${spec.d} ${face}: glass ${lo.toFixed(2)}..${hi.toFixed(2)} crosses no column`);
    }
    panes += groups.length;
  }
}

// 3. negative controls
{
  const d = 24, good = clerestoryLights(hall(d), []);
  const dropped = good.filter((l) => !(l.face === 'left' && l.bay === 2));
  assert.ok(faults(dropped, d).some((f) => f.startsWith('left bay 2: 0 whole lights')), 'a dropped bay is caught');
  const { frameLines } = hallFrameLines(d);
  const crossing = good.map((l) => (l.face === 'right' && l.bay === 1 ? { ...l, u: frameLines[0] } : l));
  assert.ok(faults(crossing, d).some((f) => f.includes('crosses the column')), 'a light across a column is caught');
}

console.log(`hallClerestory.selftest: ${halls} hall depths with doors and tears, ${SHAPES.length} drawn halls (${panes} lights) one whole light a bay; dropped-bay and column-crossing controls caught PASS`);
