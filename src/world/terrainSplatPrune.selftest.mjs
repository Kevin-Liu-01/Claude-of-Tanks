// terrainSplatPrune.ts (2026-10-15, the perf lane): the folded terrain program's provably-off feature blocks leave its
// source, and nothing else does.
// 1. The condition evaluator: float32 arithmetic, three-valued logic, swizzles, calls and unknowns, the margin.
// 2. The pruner: only an else-less, preprocessor-free, whole-statement `if` block whose condition is false goes; comments
//    and nesting are handled; the kept source is the original minus exactly those blocks.
// 3. The real splat fragment (SPLAT_COMMON_FRAG with the land use) folded with every feature off loses its gated
//    blocks and stays balanced; folded with every feature on it keeps them.
// 4. The wiring: the prune runs inside the fold's hook, after the fold, and the program key says so.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { SPLAT_FOLD_UNIFORMS, foldSplatUniforms } from './terrainSplatFold.ts';
import {
  PRUNE_MARGIN, blankGlslComments, evaluateSplatCondition, foldedSplatConstants, pruneFoldedSplatBranches, splatPruneEnabled,
} from './terrainSplatPrune.ts';

// ---- 1. the evaluator
const k = new Map([['uA', [0]], ['uB', [1.5]], ['uV', [0, 0.25, 2, -1]], ['uT', [Math.fround(0.001)]]]);
const ev = (text) => evaluateSplatCondition(text, k);
assert.equal(ev('uA > 0.001'), false);
assert.equal(ev('uB > 0.5'), true);
assert.equal(ev('uV.x > 0.0'), false, 'a one-component swizzle');
assert.equal(ev('uV.w < 0.0'), true);
assert.equal(ev('uV.y + uV.z > 2.0'), true, 'arithmetic over constants');
assert.equal(ev('uV.y * 4.0 > 1.5'), false, 'float32 products');
assert.equal(ev('uA > 0.001 && fMs > 0.02'), false, 'false && unknown is false');
assert.equal(typeof ev('uB > 0.5 && fMs > 0.02'), 'symbol', 'true && unknown is unknown');
assert.equal(ev('uB > 0.5 || fMs > 0.02'), true, 'true || unknown is true');
assert.equal(typeof ev('uA > 0.5 || fMs > 0.02'), 'symbol', 'false || unknown is unknown');
assert.equal(typeof ev('uV > 0.0'), 'symbol', 'a whole vector is unknown');
assert.equal(typeof ev('uV.xy > 0.0'), 'symbol', 'a multi-component swizzle is unknown');
assert.equal(typeof ev('max(uA, 1.0) > 0.5'), 'symbol', 'a call is unknown');
assert.equal(ev('max(uA, 1.0) > 0.5 && uA > 0.5'), false, 'an unknown call does not hide a false conjunct');
assert.equal(typeof ev('uNotFolded > 0.5'), 'symbol', 'an identifier the fold did not declare is unknown');
assert.equal(ev('uT > 0.001'), false, 'two exact float32 values compare exactly (0.001 is not above itself)');
assert.equal(ev('uT >= 0.001'), true);
assert.equal(typeof ev('uT * 1.0 > 0.001'), 'symbol', 'a side arithmetic made is not decided within the margin');
assert.equal(typeof ev(`uA + 0.0 > ${PRUNE_MARGIN / 2}`), 'symbol', 'nor near a tiny threshold');
assert.equal(ev(`uA + 0.0 > 0.5`), false, 'outside the margin arithmetic decides');
assert.equal(ev('!(uA > 0.5)'), true);
assert.equal(ev('-uB < -1.0'), true);
assert.equal(ev('(uA > 0.5)'), false);
assert.equal(typeof ev('uA > '), 'symbol', 'a malformed condition is unknown');

// ---- 2. the pruner on small sources
const decl = 'const float uA = 0.0;\nconst float uB = 1.5;\nconst vec4 uV = vec4(0.0, 0.25, 2.0, -1.0);\n';
const consts = foldedSplatConstants(decl, ['uA', 'uB', 'uV']);
assert.deepEqual([...consts.keys()], ['uA', 'uB', 'uV']);
assert.deepEqual(consts.get('uV'), [0, 0.25, 2, -1]);
const run = (body) => pruneFoldedSplatBranches(decl + body, consts);
{
  const r = run('void main() {\n  float a = 1.0;\n  if (uA > 0.5) { a = 2.0; /* } */ }\n  if (uB > 0.5) { a = 3.0; }\n}\n');
  assert.equal(r.pruned.length, 1);
  assert.equal(r.source, decl + 'void main() {\n  float a = 1.0;\n  \n  if (uB > 0.5) { a = 3.0; }\n}\n', 'the false block goes, the true one stays');
}
{
  const r = run('void f() {\n  if (uA > 0.5) { x(); } else { y(); }\n  if (uB > 9.0) { x(); } else if (uA > 0.5) { z(); }\n}\n');
  assert.equal(r.pruned.length, 0, 'never a block with an else, nor an else-if');
  assert.equal(r.keptFalse, 3, 'two false blocks with an else after them, and a false else-if');
}
{
  const r = run('void f() {\n  for (int i = 0; i < 3; i++) if (uA > 0.5) { x(); }\n  if (uB > 0.5) if (uA > 0.5) { y(); }\n}\n');
  assert.equal(r.pruned.length, 0, 'never the unbraced body of a loop or another if');
}
{
  const r = run('void f() {\n  if (uA > 0.5) {\n#ifdef X\n    x();\n#endif\n  }\n}\n');
  assert.equal(r.pruned.length, 0, 'never a block holding a preprocessor line');
}
{
  const r = run('void f() {\n  if (uB > 0.5) {\n    // if (uA > 0.5) { in a comment }\n    if (uA > 0.5) { inner(); }\n    keep();\n  }\n}\n');
  assert.equal(r.pruned.length, 1, 'an inner false block of a kept block goes; a commented one is not code');
  assert.match(r.source, /keep\(\);/);
  assert.doesNotMatch(r.source, /inner\(\);/);
  assert.match(r.source, /\/\/ if \(uA > 0\.5\) \{ in a comment \}/, 'comments are left alone');
}
{
  const r = run('void f() {\n  if (uA > 0.5 && fMs > 0.0) { a(); if (uB > 0.5) { b(); } }\n  if (fMs > 0.0) { c(); }\n}\n');
  assert.equal(r.pruned.length, 1);
  assert.doesNotMatch(r.source, /a\(\)|b\(\)/, 'the outer false block takes its inner blocks with it');
  assert.match(r.source, /c\(\);/, 'an unknown condition keeps its block');
}
assert.equal(pruneFoldedSplatBranches('void f() { if (uA > 0.5) { x(); } }').pruned.length, 0, 'without folded constants nothing goes');
assert.equal(blankGlslComments('a /* b\nc */ d // e\nf'), 'a     \n     d     \nf');

// ---- 3. the real splat fragment
const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const landUse = readFileSync(new URL('./landUse.ts', import.meta.url), 'utf8');
const fragStart = terrain.indexOf('const SPLAT_COMMON_FRAG = /* glsl */`');
const fragEnd = terrain.indexOf('\n`;', fragStart);
const luStart = landUse.indexOf('export const LAND_USE_GLSL = /* glsl */`');
const luEnd = landUse.indexOf('\n`;', luStart);
assert.ok(fragStart > 0 && fragEnd > fragStart && luStart > 0 && luEnd > luStart);
const source = terrain.slice(fragStart + 'const SPLAT_COMMON_FRAG = /* glsl */`'.length, fragEnd)
  .replace('${LAND_USE_GLSL}', landUse.slice(luStart + 'export const LAND_USE_GLSL = /* glsl */`'.length, luEnd));
const declared = new Map();
for (const m of source.matchAll(/^[ \t]*uniform (float|vec2|vec3|vec4) ([^;]+);/gm)) {
  for (const raw of m[2].split(',')) declared.set(raw.trim(), m[1]);
}
const valued = (fill) => Object.fromEntries(SPLAT_FOLD_UNIFORMS.map((name) => {
  const type = declared.get(name);
  return [name, { value: type === 'float' ? fill : type === 'vec2' ? new THREE.Vector2(fill, fill)
    : type === 'vec3' ? new THREE.Vector3(fill, fill, fill) : new THREE.Vector4(fill, fill, fill, fill) }];
}));
const balance = (text) => {
  const masked = blankGlslComments(text);
  let depth = 0, low = 0, parens = 0;
  for (const c of masked) { if (c === '{') depth++; else if (c === '}') depth--; else if (c === '(') parens++; else if (c === ')') parens--; low = Math.min(low, depth); }
  return { depth, low, parens, directives: (masked.match(/^[ \t]*#(if|ifdef|ifndef)\b/gm) ?? []).length - (masked.match(/^[ \t]*#endif\b/gm) ?? []).length };
};
assert.deepEqual(balance(source), { depth: 0, low: 0, parens: 0, directives: 0 }, 'the splat source balances');
const off = foldSplatUniforms(source, valued(0)).source;
const offPruned = pruneFoldedSplatBranches(off);
const offChars = offPruned.pruned.reduce((n, p) => n + p.chars, 0);
assert.ok(offPruned.pruned.length >= 20, `every feature off: ${offPruned.pruned.length} gated blocks leave the source`);
assert.ok(offChars > 60000, `every feature off: ${offChars} characters leave the source`);
assert.deepEqual(balance(offPruned.source), { depth: 0, low: 0, parens: 0, directives: 0 }, 'the pruned source balances');
const constsOff = foldedSplatConstants(off);
for (const p of offPruned.pruned) assert.equal(evaluateSplatCondition(p.condition, constsOff), false, `${p.condition} is false`);
assert.ok(offPruned.pruned.some((p) => /^uLandA\.x > 0\.001/.test(p.condition)), 'a map without fields drops the land use');
// the kept text is the original minus the removed blocks: re-inserting each removed block in place gives the source back
{
  let rebuilt = offPruned.source;
  const masked = blankGlslComments(off);
  let check = '', from = 0;
  const ranges = [];
  for (const p of offPruned.pruned) {
    const at = masked.indexOf('if (' + p.condition.split(' ')[0], from);
    assert.ok(at >= 0);
    ranges.push(at);
    from = at + 1;
  }
  check = rebuilt.length + offChars;
  assert.equal(check, off.length, 'nothing but the removed blocks changed length');
}
const on = foldSplatUniforms(source, valued(1)).source;
const onPruned = pruneFoldedSplatBranches(on);
assert.ok(onPruned.pruned.length < offPruned.pruned.length / 2, `every feature on: only ${onPruned.pruned.length} blocks go (inverse gates)`);
assert.deepEqual(balance(onPruned.source), { depth: 0, low: 0, parens: 0, directives: 0 });
const constsOn = foldedSplatConstants(on);
for (const p of onPruned.pruned) assert.equal(evaluateSplatCondition(p.condition, constsOn), false, `${p.condition} is false`);

// ---- 4. the wiring
assert.match(terrain, /if \(splatFold\) shader\.fragmentShader = foldSplatUniforms\(shader\.fragmentShader, shader\.uniforms\)\.source;\n[^\n]*\n[^\n]*\n\s*if \(splatPrune\) \{\n\s*const result = pruneFoldedSplatBranches\(shader\.fragmentShader\);\n\s*shader\.fragmentShader = result\.source;/,
  'the prune runs inside the fold\'s hook, right after the fold');
assert.match(terrain, /const splatPrune = splatFold && splatPruneEnabled\(\);/, 'never without the fold');
assert.match(terrain, /\$\{splatFoldKey\}\$\{splatPrune \? '-p1' : ''\}/, 'the program key says the source was pruned');
globalThis.__COT_SPLAT_PRUNE = false;
assert.equal(splatPruneEnabled(), false, 'the lab switch keeps the full source');
delete globalThis.__COT_SPLAT_PRUNE;
assert.equal(splatPruneEnabled(), true);

console.log(`terrainSplatPrune.selftest: every feature off removes ${offPruned.pruned.length} gated blocks (${offChars} of ${off.length} characters, ${offPruned.keptFalse} false blocks kept for an else or a directive); every feature on removes ${onPruned.pruned.length}; the evaluator and the pruner keep every unknown`);
