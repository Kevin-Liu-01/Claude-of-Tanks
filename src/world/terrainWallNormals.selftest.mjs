import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
// Execute the shader's scalar expressions, not a second implementation of
// its projection formula. Native WebGL compilation remains a separate gate.
const body = source.match(/vec3 wallNormalDelta\(vec2 xNormal, vec2 zNormal\) \{([\s\S]*?)\n\}/)?.[1];
assert.ok(body, 'Shared wall normal projection exists');
const expressions = body.match(/return vec3\(([\s\S]*?)\);/)?.[1];
assert.ok(expressions);
const evaluate = new Function('nx', 'nz', 'gWallSigns', 'gWallW', 'mix',
  `return [${expressions}];`);
const mix = (a, b, w) => a * (1 - w) + b * w;
const delta = (signX, signZ, weight, u, v) => evaluate(
  { x: u, y: v }, { x: u, y: v }, { x: signX, y: signZ }, weight, mix);
const close = (actual, expected) => actual.forEach((v, i) =>
  assert.ok(Math.abs(v - expected[i]) < 1e-12, `${actual} != ${expected}`));
// Packed order is world X,Z,Y. U changes sign on opposite faces; V=-Y.
close(delta(1, 1, 0, 1, 0), [0, 1, 0]);
close(delta(-1, 1, 0, 1, 0), [0, -1, 0]);
close(delta(1, 1, 1, 1, 0), [-1, 0, 0]);
close(delta(1, -1, 1, 1, 0), [1, 0, 0]);
for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  close(delta(sx, sz, 0.5, 0, 1), [0, 0, -1]);
  close(delta(sx, sz, 0.5, 1, 0), [-sz * 0.5, sx * 0.5, 0]);
  close(delta(sx, sz, 0.5, 0, 0), [0, 0, 0]);
}
assert.match(source, /sA\.z = 0\.5; sB\.z = 0\.5/);
assert.match(source, /pnn\.z = 0\.5/);
assert.match(source, /nG\.z = 0\.5/);
assert.match(source, /max\(gN\.y, 0\.02\) \+ dN\.z \* dk/);
assert.doesNotMatch(source, /wall(?:Samp|Tex)\(uNrm/,
  'Wall normal samples must convert basis before blending');
assert.match(source, /n\.xyz \+= rn \* farRock/);
assert.match(source, /n\.xyz \+= wgn \*/);
console.log('terrain wall normal basis: cardinal, diagonal and neutral projections pass');
