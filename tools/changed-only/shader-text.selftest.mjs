// The shader-text mask's regions (279, tools/changed-only/shader-text.mjs): a shader-only edit inside a marked region of
// src/vehicles/materials.ts keys only the GPU steps, and an edit just outside one keys every step as before.
//   277: t80-skirts-274 broke the rubber's tile up with a define switch (VEHICLE_SHADER_SWITCHES), a splice in the family
//   hook every vehicle program compiles (vehicleAmbientFloorHook) and a define on the rubber. None of it was maskable as a
//   constant, so the fix keyed every step on every id and every map (3.5-4 h) though no CPU output moved.
// First the checker on fixture modules (what a region may hold, and every refusal), then the real fleet replayed without
// writing the tree (graph.mjs overlay): a second rubber switch with its splice, its define and a GLSL edit, all inside the
// rubber-tiles regions, marks only the GPU steps; the same kinds of edit just outside a region, and the inside edit under
// 274's keys, mark every step; a table recorded under 274's keys on a marker-free copy re-keys (rekey.mjs --base) with
// only the GPU steps left due. Reads the rows once (about a minute of CPU); builds nothing. First-party tooling:
// Kevin B. Liu.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeState, emptyManifest, KEYS_274, readRows, recordStep, refreshComponents, rekeyManifest, resolveChanged } from './fingerprint.mjs';
import { createGraph, h16 } from './graph.mjs';
import { maskShaderText, perturbShaderText, sameTokens, shaderRegionSpans, switchSites } from './shader-text.mjs';
import { SHADER_TEXT, STEPS, WORLD_STEPS } from './steps.mjs';

// ---- the checker on fixture modules
const listUse = "for (const key of SWITCHES) { if (key in defines) copy[key] = defines[key]; }";
const FIXTURE = `import { tint } from './tint.ts';
// shader-text:begin tiles
/** the tile's text */
const TILE_GLSL = \`float tileNoise( vec2 p ) { return p.x; }\`;
const TILE_CHUNKS = ['#include <map_fragment>'] as const;
// shader-text:end tiles
const OTHER_GLSL = \`vec3 other;\`;
const SWITCHES = ['COT_BASE',
  // shader-text:begin tiles
  'COT_TILES'
  // shader-text:end tiles
] as const;
export function hook(shader: { fragmentShader: string; vertexShader: string; defines?: Record<string, unknown>; uniforms: Record<string, unknown> }): void {
  shader.uniforms.uTint = tint;
  // shader-text:begin tiles
  if (shader.defines?.COT_TILES !== undefined) {
    let fragment = \`\${TILE_GLSL}\\n\${shader.fragmentShader}\`;
    for (const chunk of TILE_CHUNKS) fragment = fragment.replace(chunk, \`#define T\\n\${chunk}\`);
    shader.fragmentShader = fragment;
  }
  // shader-text:end tiles
  shader.fragmentShader = \`\${OTHER_GLSL}\\n\${shader.fragmentShader}\`.replace('#include <x>', '#include <x>\\n');
}
export function copySwitches(defines: Record<string, unknown>, copy: Record<string, unknown>): void {
  ${listUse}
}
export function makeRubber(rubber: { defines: Record<string, unknown> }): void {
  rubber.defines.COT_BASE = 1;
  // shader-text:begin tiles
  rubber.defines.COT_TILES = 1;
  // shader-text:end tiles
}
`;
const PIN = h16(listUse);
const DECL = Object.freeze({ consts: ['OTHER_GLSL'], regions: ['tiles'], hooks: ['hook'], switchLists: { SWITCHES: { pin: PIN } } });
const mask = (text, declaration = DECL) => maskShaderText(text, 'fixture.ts', declaration);
const held = mask(FIXTURE);
assert.deepEqual(held.problems, [], 'the fixture holds');
assert.deepEqual(held.switches, ['COT_TILES'], 'its regions set and read one switch');
assert.equal(shaderRegionSpans(FIXTURE).spans.length, 4, 'four spans of one region');
for (const kept of ["'COT_BASE'", 'rubber.defines.COT_BASE = 1;', 'shader.uniforms.uTint = tint;', listUse]) {
  assert.ok(held.masked.includes(kept), `the mask keeps ${kept}`);
}
for (const gone of ['TILE_GLSL', 'COT_TILES', 'vec3 other', 'tileNoise']) assert.ok(!held.masked.includes(gone), `the mask drops ${gone}`);
const edited = (from, to) => { assert.ok(FIXTURE.includes(from), `fixture: ${from}`); return FIXTURE.replace(from, to); };
// inside: the mask does not move
for (const [from, to, what] of [
  ['return p.x;', 'return p.y;', 'a GLSL edit in a text region'],
  ["'#include <map_fragment>']", "'#include <map_fragment>', '#include <roughnessmap_fragment>']", 'a chunk added to a text region\'s list'],
  ['#define T', '#define TT', 'a splice\'s text'],
  ["'COT_TILES'\n", "'COT_TILES',\n  'COT_SHEEN'\n", 'a switch added to the switch list\'s region'],
  ['rubber.defines.COT_TILES = 1;', 'rubber.defines.COT_TILES = 2;\n  rubber.defines.COT_SHEEN = 1;', 'a define set in a define region'],
  ['    shader.fragmentShader = fragment;\n  }\n', '    shader.fragmentShader = fragment;\n  }\n  if (shader.defines?.COT_SHEEN !== undefined) shader.vertexShader = shader.vertexShader.replace(\'a\', \'b\');\n'],
  ['vec3 other;', 'vec3 other2;', 'a declared constant'],
]) {
  const after = mask(from === undefined ? FIXTURE : edited(from, to));
  assert.deepEqual(after.problems, [], `${what ?? 'a second splice'}: holds`);
  assert.equal(after.masked, held.masked, `${what ?? 'a second splice'}: the masked text does not move`);
}
// just outside: the mask moves (or the file is refused, so keyed whole)
for (const [from, to, what] of [
  ['shader.uniforms.uTint = tint;', 'shader.uniforms.uTint = tint; shader.uniforms.uMore = tint;', 'the hook\'s code before a region'],
  ["'#include <x>\\n'", "'#include <x>\\n\\n'", 'the hook\'s text after a region'],
  ['rubber.defines.COT_BASE = 1;', 'rubber.defines.COT_BASE = 2;', 'a define outside a region'],
  ["['COT_BASE',", "['COT_BASE', 'COT_MORE',", 'a switch outside the region'],
]) assert.notEqual(mask(edited(from, to)).masked ?? 'refused', held.masked, `${what}: the masked text moves`);
// refusals: each keeps the file whole
let refusals = 0;
const refused = (text, pattern, what, declaration = DECL) => {
  refusals++;
  const out = mask(text, declaration);
  assert.equal(out.masked, null, `${what}: refused`);
  assert.match(out.problems.join('\n'), pattern, `${what}: says why`);
};
const SPLICE_END = '    shader.fragmentShader = fragment;\n  }\n';
refused(edited(SPLICE_END, `${SPLICE_END}  tint.count = 1;\n`), /assignment to tint\.count/, 'a splice that writes outside its shader');
refused(edited(SPLICE_END, `${SPLICE_END}  record(shader.fragmentShader);\n`), /a call of record/, 'a splice that calls a function');
refused(edited(SPLICE_END, `${SPLICE_END}  const s = shader;\n`), /shader read whole/, 'a splice that takes the shader whole');
refused(edited(SPLICE_END, `${SPLICE_END}  const u = shader.uniforms;\n`), /property read shader\.uniforms/, 'a splice that reads the uniforms');
refused(edited(SPLICE_END, `${SPLICE_END}  if (shader.defines?.COT_TILES) return;\n`), /ReturnStatement/, 'a splice that returns');
refused(edited(SPLICE_END, `${SPLICE_END}  const n = tint;\n`), /tint, neither its own local nor masked text/, 'a splice that names outside code');
refused(edited(SPLICE_END, `${SPLICE_END}  if (shader.defines?.USE_MAP !== undefined) shader.fragmentShader += '';\n`), /USE_MAP is no COT_ switch/, 'a splice that reads a non-COT define');
refused(edited('  rubber.defines.COT_TILES = 1;\n', '  rubber.defines.COT_TILES = 1;\n  rubber.roughness = 0.5;\n'), /not `<material>\.defines\.COT_<SWITCH>/, 'a define region with another statement');
refused(edited("'COT_TILES'\n", "'COT_TILES', 'hull'\n"), /'hull' is no 'COT_' switch/, 'a switch region with a part name');
refused(edited(listUse, `${listUse} total = SWITCHES.length;`), /switch list SWITCHES: its uses changed/, 'a switch list used another way');
refused(FIXTURE, /elements of an array that is not a declared switch list/, 'a switch region in an undeclared list', { ...DECL, switchLists: {} });
refused(FIXTURE, /region tiles is not declared/, 'an undeclared region', { ...DECL, regions: [] });
refused(FIXTURE, /region gone is not marked/, 'a declared region not marked', { ...DECL, regions: ['tiles', 'gone'] });
refused(edited('  rubber.defines.COT_TILES = 1;\n  // shader-text:end tiles\n', '  rubber.defines.COT_TILES = 1;\n'), /region tiles never ends/, 'an unpaired marker');
refused(edited("const OTHER_GLSL = `vec3 other;`;", "// shader-text:begin tiles\nconst OTHER_GLSL = `vec3 other;`;\nconst SPLIT = ['COT_BASE',\n// shader-text:end tiles\n];"), /cuts through/, 'a region that cuts a statement');
refused(edited("  shader.fragmentShader = `${OTHER_GLSL}", "  globalThis.seen = shader.fragmentShader;\n  shader.fragmentShader = `${OTHER_GLSL}"),
  /hook hook reads shader\.fragmentShader into more than its shader text/, 'a hook that reads its text out past a region');
refused(edited("  shader.fragmentShader = `${OTHER_GLSL}", "  const size = OTHER_GLSL.length;\n  shader.fragmentShader = `${OTHER_GLSL}"),
  /OTHER_GLSL is named outside a compile hook/, 'masked text read into the hook\'s other code');
refused(`${FIXTURE}export const LEAK = TILE_CHUNKS.length;\n`, /TILE_CHUNKS is named outside a compile hook/, 'a region constant read outside');
// the switch rule's scanner: comments aside, code counted
assert.deepEqual(switchSites('// COT_TILES in a comment\n/* COT_TILES */ const a = 1;', 'a.ts', ['COT_TILES']), [], 'a comment is no site');
assert.deepEqual(switchSites("const flag = material.defines?.COT_TILES; const t = `#ifdef COT_TILES`;", 'a.ts', ['COT_TILES']), ['COT_TILES'], 'code is');
assert.deepEqual(switchSites('const COT_TILES_MORE = 1;', 'a.ts', ['COT_TILES']), [], 'a longer name is another');
// the perturbation: text moved, the other regions gone
const perturbed = perturbShaderText(FIXTURE, 'fixture.ts', DECL);
assert.ok(!perturbed.includes('rubber.defines.COT_TILES') && !perturbed.includes("'COT_TILES'") && !perturbed.includes('shader.defines?.COT_TILES'),
  'the perturbation removes the define, switch and splice regions');
assert.ok(perturbed.includes('cot shader perturb') && perturbed.includes('TILE_GLSL'), 'and moves the text regions\' text');
// the re-key's comparison: markers and comments are no code
const stripMarkers = (text) => text.replace(/^[ \t]*\/\/ shader-text:(?:begin|end) [\w-]+\n/gm, '');
assert.ok(sameTokens(stripMarkers(FIXTURE), FIXTURE, 'fixture.ts'), 'markers alone: the same code');
assert.ok(!sameTokens(FIXTURE, FIXTURE.replace('return p.x;', 'return p.x; '), 'fixture.ts'), 'a GLSL space: other code');

// ---- the real fleet
const root = resolve(import.meta.dirname, '../..');
const MATERIALS = 'src/vehicles/materials.ts';
const materials = readFileSync(resolve(root, MATERIALS), 'utf8');
assert.deepEqual(SHADER_TEXT[MATERIALS].regions, ['rubber-tiles'], 'materials.ts declares the rubber-tiles region');
const rows = readRows(root, process.env);
const stateOf = (config, overlay = {}) => computeState({ root, rows, config, graph: createGraph({ root, overlay }) });
const base = { now: stateOf(undefined), then: stateOf(KEYS_274) };
assert.deepEqual(base.now.partition.shaderText, { masked: [MATERIALS], problems: [] }, 'the declared shader text and regions hold on this tree');
const ALL = base.now.ids.length, MAPS = base.now.world.ids.length;
const TANK_STEPS = STEPS.map((step) => step.name), GPU = STEPS.filter((step) => step.device === 'gpu').map((step) => step.name);
const CPU = TANK_STEPS.filter((name) => !GPU.includes(name)), WORLD = WORLD_STEPS.map((step) => step.name), EVERY = [...TANK_STEPS, ...WORLD];
function dueAfter(text, formula = 'now') {
  const before = base[formula], after = stateOf(formula === 'now' ? undefined : KEYS_274, { [MATERIALS]: text });
  const out = { state: after };
  for (const name of TANK_STEPS) out[name] = before.ids.filter((id) => before.inKey(name, id) !== after.inKey(name, id)).length;
  for (const name of WORLD) out[name] = before.world.ids.filter((map) => before.world.inKey(name, map) !== after.world.inKey(name, map)).length;
  return out;
}
const counts = (due, names) => Object.fromEntries(names.map((name) => [name, due[name]]));
const every = (names, n) => Object.fromEntries(names.map((name) => [name, n]));
const replace = (text, from, to) => { assert.equal(text.split(from).length, 2, `${MATERIALS}: one ${from.slice(0, 60)}`); return text.replace(from, to); };

// a sample splice, all inside the rubber-tiles regions: a second switch on the list, its branch in the family hook, the
// rubber's define, and the tile's GLSL retuned
const HOOK_END = '    shader.fragmentShader = fragment;\n  }\n';
const SWITCH_AT = "  'COT_RUBBER_TILES'\n";
const DEFINE_AT = '  rubber.defines.COT_RUBBER_TILES = 1;\n';
const splice = (text) => {
  let out = replace(text, SWITCH_AT, "  'COT_RUBBER_TILES',\n  'COT_RUBBER_SHEEN'\n");
  out = replace(out, HOOK_END, `${HOOK_END}  if (shader.defines?.COT_RUBBER_SHEEN !== undefined) {\n`
    + '    shader.fragmentShader = shader.fragmentShader.replace(\'#include <roughnessmap_fragment>\', \'#include <roughnessmap_fragment>\\n\\troughnessFactor *= 0.92;\');\n  }\n');
  out = replace(out, DEFINE_AT, `${DEFINE_AT}  rubber.defines.COT_RUBBER_SHEEN = 1;\n`);
  return replace(out, 'smoothstep( 0.2, 0.8, cotRbNoise( uv * 0.43 + 7.3 ) )', 'smoothstep( 0.25, 0.75, cotRbNoise( uv * 0.41 + 7.3 ) )');
};
const inside = dueAfter(splice(materials));
assert.deepEqual(inside.state.partition.shaderText, { masked: [MATERIALS], problems: [] }, 'the sample splice holds');
assert.deepEqual(counts(inside, [...CPU, ...WORLD]), every([...CPU, ...WORLD], 0), 'a splice inside the regions marks no CPU or world step');
assert.deepEqual(counts(inside, GPU), every(GPU, ALL), 'and every id on the GPU steps, whose page compiles it');
const insideThen = dueAfter(splice(materials), 'then');
assert.deepEqual(counts(insideThen, EVERY), { ...every(TANK_STEPS, ALL), ...every(WORLD, MAPS) },
  'control: under 274\'s keys the same splice marks every step on every id and every map (the 277 cost)');

// just outside: the hook's next statement, the rubber's next define, a switch the region does not hold
const END = '  // shader-text:end rubber-tiles\n';
const afterHook = replace(materials, `${HOOK_END}${END}  shader.fragmentShader = \`uniform float uVehicleReadabilityScale;`,
  `${HOOK_END}${END}  shader.fragmentShader = \`uniform float uVehicleReadabilityScale;\\nuniform float uCotRubberSheen;`);
// the sample splice with its define moved just past the define region: its switch is set where the CPU keys see it
const SHEEN = '  rubber.defines.COT_RUBBER_SHEEN = 1;\n';
const afterDefine = replace(splice(materials), `${DEFINE_AT}${SHEEN}${END}`, `${DEFINE_AT}${END}${SHEEN}`);
const outsideList = replace(materials, "'COT_NO_FIELD_DUST',\n  // shader-text:begin", "'COT_NO_FIELD_DUST', 'COT_RUBBER_SHEEN',\n  // shader-text:begin");
for (const [text, what] of [[afterHook, 'the hook\'s shader text just after its region'], [afterDefine, 'a define just after its region'],
  [outsideList, 'a switch just before the list\'s region']]) {
  assert.deepEqual(counts(dueAfter(text), EVERY), { ...every(TANK_STEPS, ALL), ...every(WORLD, MAPS) }, `${what} marks every step as before`);
}
assert.match(dueAfter(afterDefine).state.partition.shaderText.problems.join('\n'),
  /its switch COT_RUBBER_SHEEN is named in src\/vehicles\/materials\.ts outside its regions/, 'a switch set outside a region refuses the mask');

// the re-key (rekey.mjs --from=274 --base): a table recorded under 274's keys on the tree without the markers carries over
const unmarked = materials.replace(/^[ \t]*\/\/ shader-text:(?:begin|end) [\w-]+\n/gm, '');
assert.ok(unmarked !== materials && sameTokens(unmarked, materials, MATERIALS), 'the markers alone: the same code');
const recorded = stateOf(KEYS_274, { [MATERIALS]: unmarked });
const table = emptyManifest();
for (const view of [recorded, recorded.world]) for (const name of Object.keys(view.steps)) {
  recordStep(table, name, null, Object.fromEntries(view.ids.map((id) => [id, view.inKey(name, id)])), view);
}
refreshComponents(table, recorded);
const report = rekeyManifest(table, recorded, base.now, { leave: new Set(GPU) });
assert.deepEqual(Object.fromEntries(Object.entries(report).map(([name, { carried }]) => [name, carried])),
  Object.fromEntries(EVERY.map((name) => [name, GPU.includes(name) ? 0 : (WORLD.includes(name) ? MAPS : ALL)])),
  're-keyed from the marker-free table: every CPU and world row carries; the GPU steps (their page compiles the markers\' bytes) stay due');
const left = { ...resolveChanged(base.now, table), ...resolveChanged(base.now.world, table) };
assert.deepEqual(Object.fromEntries(Object.entries(left).map(([name, entry]) => [name, entry.ids.length])),
  Object.fromEntries(EVERY.map((name) => [name, GPU.includes(name) ? ALL : 0])), 'after the re-key only the GPU steps are due');

console.log(`changed-only shader-text.selftest: PASS (the checker's fixture and ${refusals} refusals; a rubber-tiles splice marks `
  + `${GPU.join(', ')} on ${ALL} ids and nothing else; just outside, or under 274's keys, every step on ${ALL} ids and ${MAPS} maps; `
  + 're-keyed from the marker-free table, only the GPU steps stay due)');
