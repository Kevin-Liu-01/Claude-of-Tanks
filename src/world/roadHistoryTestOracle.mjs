import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import ts from 'typescript-compiler-api';
import { beforeRoadCompletionConstructor } from '../../tools/road-constructor-history-fixture.mjs';

// Preserve the authenticated pre-completion constructor and layout only.
// Current terrain imports retain the shipping road approaches and support.
const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const fixture = JSON.parse(readFileSync(new URL('../../tools/road-placement-origin-fixture.json', import.meta.url)));
const ast = ts.createSourceFile('terrain.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const declarations = new Map(ast.statements.filter(ts.isFunctionDeclaration).map(n => [n.name.text, n.getText(ast)]));
let referenceSource = source.replace(declarations.get('heightFieldBuildSteps'),
  beforeRoadCompletionConstructor(declarations.get('heightFieldBuildSteps')));
for (const [name, entry] of Object.entries(fixture.functions)) {
  assert.equal(createHash('sha256').update(entry.source).digest('hex'), entry.sha256);
  referenceSource = referenceSource.replace(declarations.get(name), entry.source);
}
const url = new URL('./terrain.ts?original-road-placement', import.meta.url).href;
const hooks = registerHooks({ load(request, context, next) {
  return request === url ? {format:'module-typescript', source:referenceSource, shortCircuit:true} : next(request,context);
} });
let original;
try { original = await import(url); } finally { hooks.deregister(); }
// Round 47 follow-up (2026-09-23): the pre-completion constructor above is the authenticated HISTORICAL text — its rim
// line predates the water gate (round 47) and the coast rim fade (follow-up), which are relief laws, not road
// completion. The placement sampler (roadPlacementAdmission) reproduces the CURRENT pre-completion field, so it is
// compared against this second constructor: the same projection with only those two relief laws restored on the rim.
const historicalRim = '    const rim = smoothstep(430, HALF, Math.max(Math.abs(x), Math.abs(z)));\n    h += rim * rim * T.rimH;\n';
assert.equal(referenceSource.split(historicalRim).length, 2, 'one historical rim line in the pre-completion constructor');
const reliefLawSource = referenceSource.replace(historicalRim,
  '    const rim = smoothstep(430, HALF, Math.max(Math.abs(x), Math.abs(z)));\n    h += rim * rim * T.rimH * (1 - waterWeight) * (rim > 0 ? coastRimKeep(x, z) : 1);\n');
const reliefLawUrl = new URL('./terrain.ts?original-road-placement-relief-laws', import.meta.url).href;
const reliefLawHooks = registerHooks({ load(request, context, next) {
  return request === reliefLawUrl ? {format:'module-typescript', source:reliefLawSource, shortCircuit:true} : next(request,context);
} });
let reliefLaws;
try { reliefLaws = await import(reliefLawUrl); } finally { reliefLawHooks.deregister(); }
export const historicalRoadHeightField = original.createHeightField;
export const historicalRoadHeightFieldWithReliefLaws = reliefLaws.createHeightField;
export const historicalRoadLayout = original.createLayout;
export const historicalRoadTerrainSource = referenceSource;
