import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';
import { mulberry32 } from './particles.ts';

const source = readFileSync(new URL('./effects.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('effects.ts', source, ts.ScriptTarget.Latest, true);
function named(name) {
  let found;
  const visit = node => {
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name?.getText(tree) === name) {
      assert.equal(found, undefined, `unique ${name}`); found = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(tree); assert.ok(found, `actual production ${name}`);
  return found;
}
function body(name) { return named(name).body.getText(tree); }
function functions(names) { return names.map(name => named(name).getText(tree)).join('\n'); }
function compile(code, bindings) {
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), js)(...Object.values(bindings));
}

// Literal predecessor public dispatch only. Actual production recipe helpers
// run on BOTH sides; this protects earth admission, helper order and RNG tail
// without depending on an unpublished Git revision or freezing an entire file.
const oldDust = `{
  if (intensity <= 0.02) return;
  const waterMask = heightField?.getWaterMaskAt?.(pos.x, pos.z) ?? 0;
  if (waterMask > 0.02) { emitWetTrackDust(pos, dir, intensity, waterMask); return; }
  if (intensity > 0.08 && !frozen) stampTrackPrint(pos, dir);
  const groundType = heightField?.getGroundType?.(pos.x, pos.z) ?? 'medium';
  const surfaceMultiplier = drySurfaceMultiplier(groundType);
  if (rng() > intensity * 0.85 * surfaceMultiplier) return;
  const gy = groundY(pos.x, pos.z);
  updateDustCameraCaps(pos);
  updateDryDustColors(groundType);
  const sizeVariation = 0.6 + rng() * 0.8;
  const alphaVariation = 0.55 + rng() * 0.65;
  emitTrackKick(pos, dir, intensity, groundType, gy);
  emitDryTrackWake(pos, dir, intensity, groundType, gy, surfaceMultiplier, sizeVariation, alphaVariation);
  if (groundType !== 'hard' && intensity > 0.28) emitUpperTrackWake(pos, dir, intensity, gy);
}`;

const recipes = functions(['col3', 'drySurfaceMultiplier', 'updateDustCameraCaps', 'updateDryDustColors',
  'emitTrackKick', 'emitDryTrackWake', 'emitUpperTrackWake', 'emitTrackPowder']);
function recipeFixture(surface, ground, method = body('dust'), freeze = false, water = 0) {
  const emitted = [], marks = [], owners = new Set();
  const context = {
    THREE, rng: mulberry32(7919), frozen: freeze, groundY: () => -3.25,
    heightField: { getGroundType: () => ground, getWaterMaskAt: () => water, getTrackSurfaceAt: () => surface },
    engineCtx: { camera: null }, _camV: new THREE.Vector3(), _c0: new THREE.Color(),
    COLUMN_WIND_X: .82, COLUMN_WIND_Z: .28,
    _puffO: { pos: [0, 0, 0], vel: [0, 0, 0], col0: [0, 0, 0], col1: [0, 0, 0] },
    _debO: { pos: [0, 0, 0], vel: [0, 0, 0], axis: [0, 0, 0] },
    particles: { emit: (pool, options) => { owners.add(options); emitted.push({ pool, ...structuredClone(options) }); } },
    stampTrackPrint: (pos, dir, wet = false, type = 0) => marks.push({ wet, type }),
    emitWetTrackDust: () => marks.push('wet-route'),
  };
  const api = compile(`let dustSizeCap=1, dustAlphaCap=1, dustColor0=0, dustColor1=0;
    ${recipes}
    function dust(pos,dir,intensity) ${method}
    return {dust, tail:()=>rng()};`, context);
  return { ...api, emitted, marks, owners };
}
const pos = new THREE.Vector3(12, 4, -8), dir = new THREE.Vector3(.6, 0, .8);
for (const ground of ['hard', 'medium', 'soft']) for (const frozen of [false, true]) {
  const current = recipeFixture(0, ground, body('dust'), frozen);
  const old = recipeFixture(0, ground, oldDust, frozen);
  for (const intensity of [.01, .06, .2, .7, 1]) for (let i = 0; i < 24; i++) {
    current.dust(pos, dir, intensity); old.dust(pos, dir, intensity);
  }
  assert.deepEqual(current.emitted, old.emitted, 'ordinary recipe output and ordering');
  assert.deepEqual(current.marks, old.marks, 'ordinary marks');
  assert.equal(current.tail(), old.tail(), 'ordinary RNG tail');
}
function verifyPowder(method = body('dust')) {
  for (const surface of [2, 3]) {
    const fixture = recipeFixture(surface, 'medium', method);
    for (let i = 0; i < 96; i++) fixture.dust(pos, dir, 1);
    assert.equal(fixture.emitted.length, 96, 'one admitted puff, no extra pool emission');
    assert.equal(fixture.owners.size, 1, 'same shared scratch, no per-event options allocation');
    assert.ok(fixture.marks.every(mark => mark.type === surface && !mark.wet));
    for (const puff of fixture.emitted) {
      assert.equal(puff.pool, 'dust'); assert.equal(puff.pos[1], -3.13, 'ground, not hull-center height');
      assert.ok(puff.life <= .74 && puff.size1 <= 1.26 && puff.alpha <= .22, 'low restrained contact puff');
      assert.ok(puff.vel[1] <= 1.15 && puff.grav < 0);
      assert.deepEqual(puff.col0, new THREE.Color(surface === 3 ? 0xdde4e8 : 0xc7b38d).toArray(),
        'snow powder and sand grains retain distinct actual linear palettes');
    }
    const paused = recipeFixture(surface, 'medium', method, true); paused.dust(pos, dir, 1);
    assert.equal(paused.emitted.length + paused.marks.length, 0, 'paused contact cannot accumulate');
    const wet = recipeFixture(surface, 'medium', method, false, .3); wet.dust(pos, dir, 1);
    assert.deepEqual(wet.marks, ['wet-route'], 'liquid routing has priority');
    assert.equal(wet.emitted.length, 0);
  }
}
verifyPowder();
assert.throws(() => verifyPowder(oldDust), assert.AssertionError, 'old large earth wake is rejected');

// Actual ring writer uses the same four vertices/attribute and old water flag.
function verifyPrints() {
  const attr = size => new THREE.Float32BufferAttribute(new Float32Array(size), 1);
  let time = 7;
  const bindings = { MAX_PRINTS: 96, PRINT_DUR: 12, printCenters: new Float32Array(192).fill(1e9),
    printPos: attr(1152), printBirth: attr(384), printSurface: attr(384),
    groundY: (x, z) => x * .01 + z * .02, particles: { getTime: () => time },
    heightField: { getWaterDepthAt: () => .58 } };
  const stamp = compile(`let printCursor=0; ${functions(['stampTrackPrint'])} return stampTrackPrint;`, bindings);
  const arrays = [bindings.printPos.array, bindings.printBirth.array, bindings.printSurface.array];
  for (let i = 0; i < 120; i++) {
    const type = i % 4, origin = new THREE.Vector3(i * 3, 20, 4);
    stamp(origin, dir, type === 1, type === 1 ? 0 : type);
    const slot = i % 96;
    for (let k = 0; k < 4; k++) {
      assert.equal(bindings.printSurface.array[slot * 4 + k], type);
      assert.equal(bindings.printBirth.array[slot * 4 + k], 7);
      const at = slot * 12 + k * 3, x = arrays[0][at], z = arrays[0][at + 2];
      assert.ok(Math.abs(arrays[0][at + 1] - bindings.groundY(x, z) - (type === 1 ? .645 : .035)) < 1e-5);
    }
  }
  [bindings.printPos, bindings.printBirth, bindings.printSurface].forEach((attr, i) => {
    assert.equal(attr.array, arrays[i], 'ring never replaces its retained buffers');
  });
  const repeat = new THREE.Vector3(700, 0, 0);
  stamp(repeat, dir, false, 3);
  const dryVersion = bindings.printBirth.version;
  time = 12; stamp(repeat, dir, false, 3);
  assert.equal(bindings.printBirth.version, dryVersion, 'snow retains the full 12-second dry-print duration');
  time = 19.1; stamp(repeat, dir, false, 3);
  assert.equal(bindings.printBirth.version, dryVersion + 1, 'expired dry contact can be stamped again');
  repeat.x += 3; stamp(repeat, dir, true);
  const wetVersion = bindings.printBirth.version;
  time = 23.1; stamp(repeat, dir, true);
  assert.equal(bindings.printBirth.version, wetVersion);
  time = 24; stamp(repeat, dir, true);
  assert.equal(bindings.printBirth.version, wetVersion + 1, 'water alone expires at 4.6 seconds');
  bindings.heightField.getWaterSurfaceHeightAt = (x, z) => bindings.groundY(x, z) + .23;
  repeat.x = 710; stamp(repeat, dir, true);
  const visibleSlot = bindings.printCenters.findIndex((x, i) => i % 2 === 0 && x === 710) / 2;
  assert.ok(visibleSlot >= 0);
  for (let k = 0; k < 4; k++) {
    const at = visibleSlot * 12 + k * 3, x = arrays[0][at], z = arrays[0][at + 2];
    assert.ok(Math.abs(arrays[0][at + 1] - bindings.groundY(x, z) - .295) < 1e-5,
      'wet corners use the rendered surface even when authored depth differs');
  }
  const reset = body('resetAll');
  for (const statement of ['printBirth.array.fill(-1e9);', 'printSurface.array.fill(0);',
    'printCenters.fill(1e9);', 'printCursor = 0;']) assert.ok(reset.includes(statement));
}
verifyPrints();
const waterAssignment = source.match(/vWater = ([^;]+);/)[1];
const waterFlag = new Function('aSurface', `return ${waterAssignment};`);
assert.deepEqual([0, 1, 2, 3].map(waterFlag), [0, 1, 0, 0], 'powder never inherits water duration/strength');
assert.throws(() => assert.deepEqual([0, 1, 2, 3], [0, 1, 0, 0]), assert.AssertionError);
assert.match(source, /float duration = mix\(\$\{PRINT_DUR.toFixed\(1\)\}, 4\.6, vWater\)/);
assert.match(source, /if \(vSurface > 1\.5\) color = vSurface > 2\.5/);
assert.match(source, /const MAX_PRINTS = 96;/);
const particles = readFileSync(new URL('./particles.ts', import.meta.url), 'utf8');
assert.match(particles, /dust:\s*1024/);
const powderNode = named('emitTrackPowder');
const rejectAllocation = node => {
  assert.ok(!ts.isNewExpression(node) && !ts.isObjectLiteralExpression(node)
    && !ts.isArrayLiteralExpression(node), 'new contact recipe has no per-event heap allocation');
  ts.forEachChild(node, rejectAllocation);
};
rejectAllocation(powderNode);
console.log('trackContact.selftest: actual dry dispatch/recipes, ordinary RNG, low powder, ring cap and water isolation pass');
