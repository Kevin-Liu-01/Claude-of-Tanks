// Receipt for src/world/maps/regional/littrow.ts's dish arms (the 229 follow-up to the Earthrise 228 rebuild): an arm run
// to its dish's vertex met the tilted bowl with its square end, and with the bowls closed round their vertices (228) the
// arm's corners stood 1.2-4.0 cm proud of the bowl's face, on the relay mast's three dishes and the habitat's. Checked:
//   - dishArmEnd seats each arm the kit draws (the habitat's 0.38 m dish on its upright, the mast's 2.4 m high-gain dish
//     on its arm off the head, the 1.3 m relay and the 0.8 m dish off the legs), with the Earth's direction under every
//     yaw a plot takes: no end corner in front of the bowl's face (the smooth bowl's, and so its facets', chords in front
//     of it), the most forward corner inside the shell (behind the face, in front of the back sheet, desktop's four rings
//     and a phone's two), so the arm meets its dish and pokes nowhere;
//   - run to the vertex (the 228 arms), the same ends stood proud of the face: the defect this receipt fixes;
//   - every dish the kit draws on an arm takes its arm's end from dishArmEnd.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dishArmEnd } from './littrow.ts';
import { EARTH_SKY } from '../earthriseStation.ts';

const SHELL = 0.04;
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function earth(yaw) {
  const az = EARTH_SKY.azimuthDeg * Math.PI / 180, el = EARTH_SKY.elevationDeg * Math.PI / 180, c = Math.cos(yaw), s = Math.sin(yaw);
  const wx = Math.sin(az) * Math.cos(el), wz = Math.cos(az) * Math.cos(el);
  return norm([wx * c - wz * s, Math.sin(el), wx * s + wz * c]);
}
// an arm's end corners (bar(): out = d x ref, across = d x out) against a dish's bowl at its vertex c, open along w:
// each corner's height over the axis-normal plane at the vertex and its distance from the axis
function corners(a, b, c, w, t) {
  const d = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  const ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const out = norm(cross(d, ref)), across = norm(cross(d, out));
  const list = [];
  for (const p of [-1, 1]) for (const q of [-1, 1]) {
    const x = [0, 1, 2].map((i) => b[i] + (out[i] * p + across[i] * q) * t / 2 - c[i]);
    const along = dot(x, w);
    list.push({ along, rho: Math.hypot(...x.map((v, i) => v - w[i] * along)) });
  }
  return list;
}
const smooth = (r, depth, rho) => depth * (rho / r) ** 2;
// the facets' face at rho: the chord between the two rings round it (dish(): rings at k r / rings)
const faceted = (r, depth, rings, rho) => {
  const k = Math.min(rings - 1, Math.floor(rho / (r / rings))), r0 = k * r / rings, r1 = (k + 1) * r / rings;
  const f = (rho - r0) / (r1 - r0);
  return smooth(r, depth, r0) * (1 - f) + smooth(r, depth, r1) * f;
};

let checked = 0;
const worstBefore = [];
for (const yawDeg of [0, 30, 45, 90, 135, 180, 225, 270, 315, 333]) {
  const e = earth(yawDeg * Math.PI / 180);
  const cases = [
    // the habitat's dish on its upright (radius 0.38, depth 0.1, a 6 cm upright 1.15 m tall), turned to the Earth
    { name: 'habitat', a: [0, 2.1, 0], c: [0, 3.25, 0], w: e, r: 0.38, depth: 0.1, t: 0.06 },
    // the relay mast's high-gain dish on its arm off the head (2.5 m out toward the Earth, 1.2 m up)
    { name: 'high-gain', a: [0, 41.2, 0], c: [e[0] * 2.5, 42.4, e[2] * 2.5], w: e, r: 2.4, depth: 0.62, t: 0.16 },
    { name: 'relay', a: [1.4, 31.2, 1.4], c: [2.3, 31.2, 1.4], w: norm([1, 0.05, 0.2]), r: 1.3, depth: 0.34, t: 0.1 },
    { name: 'small', a: [-1.6, 24.8, -1.6], c: [-2.3, 24.8, -1.6], w: norm([-1, 0.12, -0.4]), r: 0.8, depth: 0.22, t: 0.08 },
  ];
  for (const k of cases) {
    const end = dishArmEnd(k.a, k.c, k.w, k.r, k.depth, k.t);
    const at = corners(k.a, end, k.c, k.w, k.t);
    // no corner in front of the smooth bowl (the facets stand in front of it)
    for (const { along, rho } of at) {
      assert.ok(along - smooth(k.r, k.depth, rho) < -0.005, `${k.name} yaw ${yawDeg}: an arm corner pokes into the bowl`);
    }
    // the most forward corner inside the shell, under desktop's and a phone's rings: the arm meets its dish
    for (const rings of [4, 2]) {
      const seat = Math.max(...at.map(({ along, rho }) => along - (faceted(k.r, k.depth, rings, rho) - SHELL)));
      assert.ok(seat > 0.002, `${k.name} yaw ${yawDeg} rings ${rings}: the arm stops short of its dish's shell (${seat.toFixed(4)})`);
    }
    // the arm still reaches most of the way (it ends behind the dish, not down its post)
    assert.ok(Math.hypot(...k.c.map((v, i) => v - end[i])) < 0.45 * Math.hypot(...k.c.map((v, i) => v - k.a[i])), `${k.name}: the arm keeps its length`);
    // run to the vertex (228), its corners stood proud of the face
    worstBefore.push(Math.max(...corners(k.a, k.c, k.c, k.w, k.t).map(({ along, rho }) => along - smooth(k.r, k.depth, rho))));
    checked++;
  }
}
assert.ok(Math.max(...worstBefore) > 0.012, 'the 228 arms (run to the vertex) stood proud of their bowls');

// every dish the kit draws on an arm takes its arm's end from dishArmEnd
const source = readFileSync(new URL('./littrow.ts', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('\nconst DISH_ARM_SEAT'));
const dishes = [...body.matchAll(/\n\s*dish\(sink, /g)].length;
const arms = [...body.matchAll(/bar\(sink, [^\n]*dishArmEnd\(/g)].length;
assert.equal(dishes, 4, 'the kit draws four dishes on arms');
assert.equal(arms, dishes, 'each on an arm seated by dishArmEnd');

console.log(`littrow.selftest: ${checked} dish arms seated in their shells, none proud (the 228 arms stood ${(Math.max(...worstBefore) * 100).toFixed(1)} cm proud)`);
