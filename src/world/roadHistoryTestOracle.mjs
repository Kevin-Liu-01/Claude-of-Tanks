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
export const historicalRoadHeightField = original.createHeightField;
export const historicalRoadLayout = original.createLayout;
