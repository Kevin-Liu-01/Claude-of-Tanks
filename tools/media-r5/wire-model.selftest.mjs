import assert from 'node:assert/strict';
import { powerLinesOf, powerWires, telephoneWires } from './wire-model.mjs';

// The overhead wires as the engine strings them (wire-model.mjs; the coordinator, 2026-10-14: wires are occluders, so
// the lens checks fail a take a wire crosses the hero or the frame's top in, fleet takes included).

// the telephone line: consecutive poles 6-52 m apart strung with two conductors 0.6 m either side, 6.5 m up, hanging
// 0.45 m + 0.8 % of the span at its middle; a span past 52 m is left unstrung, and nothing but a pole holds a wire
const pole = (x, z) => [x, 2, z, 0.45, 7.4, 'pole', 0];
const wires = telephoneWires({ crushables: [pole(0, 0), pole(30, 0), pole(90, 0), [95, 2, 3, 0.3, 0.9, 'barrel', 0]] });
assert.equal(wires.length, 2, 'one span strung (30 m), the 60 m gap left bare: two conductors');
const [w] = wires, mid = w.pts[(w.pts.length - 1) / 2];
assert.ok(Math.abs(w.pts[0][1] - 8.5) < 1e-9 && Math.abs(Math.abs(w.pts[0][2]) - 0.6) < 1e-9, 'a conductor leaves 6.5 m over the pole\'s foot, 0.6 m off the line');
assert.ok(Math.abs(8.5 - mid[1] - (0.45 + 30 * 0.008)) < 1e-9, 'it hangs 0.69 m at the middle of a 30 m span');

// the high-voltage lines: Verdant's 110 kV line as its map authors it, its towers raised until the lowest conductor
// clears the ground by 12 m at the middle of the longest span
const [line] = powerLinesOf('verdant');
assert.deepEqual([line.towers.length, line.heightM], [4, 30], 'Verdant\'s 110 kV line: four towers, 30 m');
const hv = powerWires('verdant', () => 0);
assert.equal(hv.length, 3 * 5, 'three spans of four phases and the earth wire');
const lowest = Math.min(...hv.flatMap((x) => x.pts.map((p) => p[1])));
assert.ok(Math.abs(lowest - 12 + 0.15) < 0.05, `the lowest conductor clears flat ground by 12 m (${lowest.toFixed(2)} m)`);
// with the scenery receipt's towers (a dump's pylons) the line runs between the standing ones at their built height:
// the second tower refused, the 50 m line strung first to third, third to fourth
const pylons = line.towers.map(([x, z], i) => [x, z, i === 1 ? 0 : 1, 50, 30, 'the 110 kV line']);
const built = powerWires('verdant', () => 0, 18, pylons);
assert.equal(built.length, 2 * 5, 'two spans past the refused tower');
const lowArm = built.find((x) => x.kind === 'power line').pts[0][1];
assert.ok(Math.abs(lowArm - (0.62 * 50 + 0.4 - 2.6 - 0.15)) < 1e-9, `the lower arms hang their strings at the built height (${lowArm.toFixed(2)} m)`);
// a map without power lines strings none
assert.equal(powerWires('moon', () => 0).length, 0, 'the moon has no power lines');
console.log('wire-model selftest: the telephone line strung pole to pole, the high-voltage lines tower to tower, as built');
