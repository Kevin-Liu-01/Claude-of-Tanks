// detMath (the authority's deterministic math) is the Rust port's jsmath, bit for bit: 9,671 golden rows from the
// Rust oracle (the conformance ranges and every special branch: signed zeros, NaN, infinities, subnormals, near
// multiples of pi/2, the huge-argument reduction, pow's ECMAScript cases), and the authority's import graph calls no
// native transcendental (tools/det-math-lint.mjs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as det from './detMath.ts';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { detMathFindings, authorityModules, localStepModules, presentationFindings, simulationModules, sourceFindings } from '../../tools/det-math-lint.mjs';

const golden = JSON.parse(readFileSync(new URL('./detMath.golden.json', import.meta.url), 'utf8'));
const view = new DataView(new ArrayBuffer(8));
const fromHex = (hex) => { view.setBigUint64(0, BigInt(`0x${hex}`)); return view.getFloat64(0); };
const toHex = (value) => { view.setFloat64(0, value); return view.getBigUint64(0).toString(16).padStart(16, '0'); };
const call = {
  sin: (a) => det.sin(a), cos: (a) => det.cos(a), tan: (a) => det.tan(a), asin: (a) => det.asin(a), acos: (a) => det.acos(a),
  atan: (a) => det.atan(a), atan2: (a, b) => det.atan2(a, b), exp: (a) => det.exp(a), log: (a) => det.log(a),
  pow: (a, b) => det.pow(a, b), cbrt: (a) => det.cbrt(a), tanh: (a) => det.tanh(a), cosh: (a) => det.cosh(a),
  expm1: (a) => det.expm1(a), hypot2: (a, b) => det.hypot(a, b), hypot3: (a, b, c) => det.hypot(a, b, c),
};
let checked = 0;
for (const [name, rows] of Object.entries(golden.cases)) {
  const fn = call[name];
  assert.ok(fn, `golden case ${name} has a detMath function`);
  for (const row of rows) {
    const args = row.slice(0, -1).map(fromHex);
    const got = toHex(fn(...args));
    const want = row[row.length - 1];
    // every NaN is one value to JavaScript; its payload is not part of the contract
    if (got !== want) assert.ok(Number.isNaN(fromHex(want)) && Number.isNaN(fromHex(got)),
      `${name}(${args.join(', ')}): ${got} where the Rust oracle gives ${want}`);
    checked++;
  }
}
assert.equal(checked, golden.total);

// the lint's negative controls: it catches a call, a reference, a destructure and a non-square exponent, and passes
// comments, squares and detMath itself
const planted = sourceFindings([
  'const a = Math.sin(x);', 'const f = Math.atan2;', 'const { cos } = Math;', 'const w = m ** 3;', 'const v = base ** k;',
  '// Math.sin in a comment', '/** a doc comment with ** and Math.pow( */', 'const d = dx ** 2 + dz ** 2;', 'const s = detMath.sin(x);',
  'const r = Math.sqrt(x) + Math.abs(y) + Math.floor(z);',
].join('\n'));
assert.deepEqual(planted.map((f) => f.line), [1, 2, 3, 4, 5], 'the lint flags exactly the planted violations');
// (276) three.js's trig, called by method name: Euler, axis-angle, the makeRotation family, lookAt, slerp and the
// spherical conversions call Math.sin inside three; a function whose name starts like one, a property and detRotation do not
const plantedTrig = sourceFindings([
  'q.setFromEuler(e);', 'v.copy(p).applyAxisAngle(UP, yaw).add(o);', 'm.makeRotationY(t);', 'm.makeRotationFromEuler(e);',
  'o.lookAt(target);', 'a.slerp(b, t);', 'v.setFromSphericalCoords(1, phi, theta);', 'q.setFromAxisAngle(axis, angle);',
  'lookAtTargetAgain(nowS);', 'const lookAt = pose.lookAt;', 'quaternionFromEuler(q, e);', 'applyAxisAngle(v, UP, yaw);',
  '// q.setFromEuler(e) in a comment', 'v.applyQuaternion(q);',
].join('\n'));
assert.deepEqual(plantedTrig.map((f) => f.line), [1, 2, 3, 4, 5, 6, 7, 8], 'the lint flags exactly the planted three.js trig calls');
// the local step's cut: state.ts's graph in src/sim and src/game, and the world collision the authority runs too; its
// effects, rendering and a world module only the page reaches are outside it
{
  const root = mkdtempSync(join(tmpdir(), 'cot-det-math-local-step-'));
  try {
    const write = (file, source) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), source); };
    write('src/game/state.ts', [
      "import { step } from '../sim/step.ts';", "import { burst } from '../fx/burst.ts';", "import { collide } from '../world/collision.ts';",
      "import { atlas } from '../world/treeAtlas.ts';", "import type { Pose } from '../engine/pose.ts';",
    ].join('\n'));
    write('src/sim/step.ts', "import { brain } from '../game/brain.ts';\nexport const step = () => brain();\n");
    write('src/game/brain.ts', 'export const brain = () => 0;\n');
    write('src/fx/burst.ts', "import { step } from '../sim/step.ts';\nexport const burst = () => Math.sin(step());\n");
    write('src/world/collision.ts', 'export const collide = () => 0;\n');
    write('src/world/treeAtlas.ts', 'export const atlas = () => Math.cos(1);\n');
    write('src/engine/pose.ts', 'export type Pose = number;\n');
    write('src/sim/authoritativeMatch.ts', "import { collide } from '../world/collision.ts';\n");
    const rel = (files) => files.map((file) => file.slice(root.length + 1).split('\\').join('/'));
    assert.deepEqual(rel(localStepModules(root)), ['src/game/brain.ts', 'src/game/state.ts', 'src/sim/step.ts', 'src/world/collision.ts'],
      'the local step is state.ts\'s graph in src/sim and src/game plus the world collision the authority shares');
    assert.deepEqual(rel(simulationModules(root)), ['src/game/brain.ts', 'src/game/state.ts', 'src/sim/authoritativeMatch.ts', 'src/sim/step.ts', 'src/world/collision.ts'],
      'the simulation is both drivers\' modules once each');
  } finally { rmSync(root, { recursive: true, force: true }); }
}

// the math both drivers are held to: no native transcendental or three.js trig in the authority's graph or the local step's
const findings = detMathFindings();
assert.deepEqual(findings, [], `native transcendentals or three.js trig in the simulation:\n${findings.map((f) => `${f.file}:${f.line}: ${f.text}`).join('\n')}`);
const modules = simulationModules();
assert.ok(authorityModules().length > 200, `the authority graph resolves (${authorityModules().length} modules)`);
assert.ok(localStepModules().some((file) => file.endsWith('src/sim/provingGround.ts')), 'the local step resolves through state.ts to the Proving Ground');

// (267) no presentation in the graph: the marking modules left it with the spec registry's marking record
const presentation = presentationFindings();
assert.deepEqual(presentation, [], `presentation in the authority graph:\n${presentation.map((f) => `${f.file}: ${f.reason}`).join('\n')}`);
// the negative control: a fixture authority that imports the registry, the registry the marking module, and a vehicle
// canvas painter beside it; both are named
{
  const root = mkdtempSync(join(tmpdir(), 'cot-det-math-presentation-'));
  try {
    const write = (file, source) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), source); };
    write('src/sim/authority.ts', "import { spec } from '../vehicles/specs.ts';\nimport { paint } from '../vehicles/insigniaPainter.ts';\n");
    write('src/vehicles/specs.ts', "import { vehicleMarkingRecord } from './vehicleMarkings.ts';\nexport const spec = vehicleMarkingRecord;\n");
    write('src/vehicles/vehicleMarkings.ts', 'export const vehicleMarkingRecord = () => null;\n');
    write('src/vehicles/insigniaPainter.ts', 'export const paint = (ctx: CanvasRenderingContext2D) => ctx.fill();\n');
    assert.deepEqual(presentationFindings(root, ['src/sim/authority.ts']), [
      { file: 'src/vehicles/insigniaPainter.ts', reason: 'a vehicle canvas painter' },
      { file: 'src/vehicles/vehicleMarkings.ts', reason: 'a vehicle presentation module' },
    ], 'the lint names a marking module and a canvas painter brought into the graph');
  } finally { rmSync(root, { recursive: true, force: true }); }
}

console.log(`detMath.selftest: ${checked} golden rows bit-identical to the Rust jsmath; ${modules.length} simulation modules (authority + local step) on detMath with no three.js trig, no presentation among them (planted calls, a marking module and a painter are named)`);
