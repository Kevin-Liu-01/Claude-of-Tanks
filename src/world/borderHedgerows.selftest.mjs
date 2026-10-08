// The border hedgerows (borderHedgerows.ts): a bush line is a closed string of crowns wound outward — its stations every
// 4 m, its crest rising and dipping from bush to bush, lit at the crest and dark at the foot, its normals out and up —
// and a karst field's wall stays the low grey prism it was.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildBorderHedgerows } from './borderHedgerows.ts';

const ground = (x, z) => 0.02 * x + 0.01 * z;
// a curved boundary, 40 traced points 8 m apart, the hedge broken by a gate at point 20
const xs = [], zs = [], w = [];
for (let i = 0; i < 40; i++) {
  const a = i * 0.02;
  xs.push(600 + 400 * Math.sin(a)); zs.push(100 + 400 * (1 - Math.cos(a))); w.push(i === 20 ? 0.1 : 0.9);
}
const palette = { hue: 0.24, sat: 0.37, l0: 0.205, l1: 0.31 };
const mesh = buildBorderHedgerows({ seed: 7, lines: [{ xs, zs, w }], groundAt: ground, palette });
assert.ok(mesh, 'a hedged stretch builds a mesh');
assert.equal(mesh.name, 'border-hedgerows');
assert.equal(mesh.material.side, THREE.DoubleSide, "double-sided: the farmsteads' program (borderFarmsteads.ts), no variant of its own");
const g = mesh.geometry, P = g.attributes.position.array, N = g.attributes.normal.array, C = g.attributes.color.array;
const I = g.index.array;
assert.equal(mesh.userData.borderHedgerows.triangles, I.length / 3);

// closed above the ground: every edge is shared by exactly two triangles (two runs, each capped at both ends) but the
// feet's own, buried 0.7 m (the section is open underneath)
const edges = new Map();
for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
  const a = I[t + e], b = I[t + (e + 1) % 3], key = a < b ? `${a}_${b}` : `${b}_${a}`;
  edges.set(key, (edges.get(key) ?? 0) + 1);
}
const buried = (k) => P[k * 3 + 1] < ground(P[k * 3], P[k * 3 + 2]) - 0.5;
const open = [...edges.entries()].filter(([key, n]) => n !== 2 && !key.split('_').every((k) => buried(Number(k)))).length;
assert.equal(open, 0, `a bush line is closed above the ground (${open} edges not shared by two faces)`);

// wound outward: the face normal points away from the line (horizontally) or up, and every vertex normal agrees
const nearest = (x, z) => { let b = Infinity, bi = 0; for (let i = 0; i < xs.length; i++) { const d = (xs[i] - x) ** 2 + (zs[i] - z) ** 2; if (d < b) { b = d; bi = i; } } return bi; };
let outward = 0, agree = 0;
const faces = I.length / 3;
for (let t = 0; t < I.length; t += 3) {
  const v = [I[t], I[t + 1], I[t + 2]].map((k) => [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]]);
  const u1 = v[1].map((c, q) => c - v[0][q]), u2 = v[2].map((c, q) => c - v[0][q]);
  const n = [u1[1] * u2[2] - u1[2] * u2[1], u1[2] * u2[0] - u1[0] * u2[2], u1[0] * u2[1] - u1[1] * u2[0]];
  const cx = (v[0][0] + v[1][0] + v[2][0]) / 3, cy = (v[0][1] + v[1][1] + v[2][1]) / 3, cz = (v[0][2] + v[1][2] + v[2][2]) / 3;
  const k = nearest(cx, cz);
  const d = [cx - xs[k], cy - (ground(xs[k], zs[k]) + 0.5), cz - zs[k]];
  if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] >= 0 || n[1] > 0.5 * Math.hypot(...n)) outward++;
  // (a cap's closing face under the run's tip lies below the ground: no light reaches it)
  const vn = [N[I[t] * 3], N[I[t] * 3 + 1], N[I[t] * 3 + 2]];
  if (cy < ground(cx, cz) || vn[0] * n[0] + vn[1] * n[1] + vn[2] * n[2] > 0) agree++;
}
assert.ok(outward >= faces * 0.99, `faces wound outward (${outward} of ${faces})`);
assert.equal(agree, faces, 'every vertex normal above the ground on the side its face shows');

// the stations every 4 m: ~5 vertices a station over ~(39 traced points x 2) stations, ~8 faces a segment
assert.ok(P.length / 3 >= 5 * 70 && P.length / 3 <= 5 * 80 + 8, `stations every 4 m (${P.length / 3} vertices)`);
assert.ok(faces <= 8 * 80 + 16, `the bush line's cost stays a few faces a metre (${faces})`);

// the crest: 1-5.3 m over the ground, rising and dipping from bush to bush (not one smooth swell)
const crests = [];
for (let i = 0; i < P.length / 3; i++) {
  const y = P[i * 3 + 1] - ground(P[i * 3], P[i * 3 + 2]);
  if (N[i * 3 + 1] > 0.9) crests.push(y);
}
assert.ok(crests.length > 60, 'every station carries a crest vertex');
const interior = crests.slice(4, -4);
assert.ok(Math.max(...interior) <= 4.6 * 1.13 + 0.01 && Math.min(...interior) >= 0.9, `crest heights ${Math.min(...interior).toFixed(2)}-${Math.max(...interior).toFixed(2)} m`);
let turns = 0;
for (let i = 1; i + 1 < interior.length; i++) if ((interior[i] - interior[i - 1]) * (interior[i + 1] - interior[i]) < 0) turns++;
assert.ok(turns >= interior.length * 0.25, `the crest rises and dips from bush to bush (${turns} turns over ${interior.length} stations)`);

// the tone: the crest lighter than the foot (luminance of the vertex colours), the shaded side not black
let crestL = 0, footL = 0, nc = 0, nf = 0;
for (let i = 0; i < P.length / 3; i++) {
  const l = 0.2126 * C[i * 3] + 0.7152 * C[i * 3 + 1] + 0.0722 * C[i * 3 + 2];
  if (N[i * 3 + 1] > 0.9) { crestL += l; nc++; } else if (P[i * 3 + 1] < ground(P[i * 3], P[i * 3 + 2])) { footL += l; nf++; }
}
crestL /= nc; footL /= nf;
assert.ok(crestL > footL * 1.6, `the crest lit over the foot (${crestL.toFixed(3)} vs ${footL.toFixed(3)} linear)`);
assert.ok(footL > 0.02, `the foot keeps the foliage's dark green, not black (${footL.toFixed(3)} linear)`);
// the normals turn out and up as a crown's do: no side of the hedge faces below 30 degrees up
let minUp = 1;
for (let i = 0; i < N.length; i += 3) minUp = Math.min(minUp, N[i + 1]);
assert.ok(minUp > 0.45, `a shaded side keeps the sky's light (lowest normal y ${minUp.toFixed(2)})`);

// deterministic
const again = buildBorderHedgerows({ seed: 7, lines: [{ xs, zs, w }], groundAt: ground, palette });
assert.deepEqual(Array.from(again.geometry.attributes.position.array), Array.from(P), 'the same seed builds the same hedge');

// a karst field's wall: the low prism (four faces a traced segment, no index), 0.9-1.3 m
const wall = buildBorderHedgerows({ seed: 7, lines: [{ xs, zs, w }], groundAt: ground, palette: { hue: 0.1, sat: 0.05, l0: 0.5, l1: 0.6 }, kind: 'wall' });
assert.ok(wall && !wall.geometry.index, 'a wall stays the unindexed prism');
assert.equal(wall.geometry.attributes.position.count / 3, (19 + 18) * 4, 'a wall: four faces a traced segment (runs of 20 and 19 points)');
let wallTop = 0;
const WP = wall.geometry.attributes.position.array;
for (let i = 0; i < WP.length; i += 3) wallTop = Math.max(wallTop, WP[i + 1] - ground(WP[i], WP[i + 2]));
assert.ok(wallTop <= 1.31 && wallTop > 0.8, `a wall's crest ${wallTop.toFixed(2)} m`);

// nothing hedged, no mesh
assert.equal(buildBorderHedgerows({ seed: 1, lines: [{ xs: [0, 8], zs: [0, 0], w: [0.1, 0.2] }], groundAt: ground, palette }), null);

console.log(`borderHedgerows.selftest: ok (${faces} faces, ${P.length / 3} vertices, crest ${crestL.toFixed(3)} / foot ${footL.toFixed(3)} linear, ${turns} crest turns)`);
