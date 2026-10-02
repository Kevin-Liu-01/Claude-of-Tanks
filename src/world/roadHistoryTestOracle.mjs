import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import ts from 'typescript-compiler-api';
import { beforeRoadCompletionConstructor } from '../../tools/road-constructor-history-fixture.mjs';
import { beforeRoadSettlementRedesign } from '../../tools/road-settlement-history-fixture.mjs';
import { loadShorelineHistory } from './shorelineContinuity.test-support.mjs';

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
const original = await loadShorelineHistory(new URL('./terrain.ts', import.meta.url), referenceSource);
// Round 47 follow-up (2026-09-23): the pre-completion constructor above is the authenticated HISTORICAL text — its rim
// line predates the water gate (round 47) and the coast rim fade (follow-up), which are relief laws, not road
// completion. The placement sampler (roadPlacementAdmission) reproduces the CURRENT pre-completion field, so it is
// compared against this second constructor: the same projection with only those two relief laws restored on the rim.
const historicalRim = '    const rim = smoothstep(430, HALF, Math.max(Math.abs(x), Math.abs(z)));\n    h += rim * rim * T.rimH;\n';
assert.equal(referenceSource.split(historicalRim).length, 2, 'one historical rim line in the pre-completion constructor');
// Round 61 (2026-09-24, Amberford's bridge): the road-plane blend under a bridge deck and over its approaches is a
// construction law of the same kind (the fixture reverts its slice to the pre-bridge text); the relief-law constructor
// restores the CURRENT blend so the placement sampler is compared against the field it actually reproduces.
const historicalRoadBlend = '    const rd = gridSample(gRoadDist, x, z);\n    if (rd < 14) h += (gridSample(gRoadElev, x, z) - h) * (1 - smoothstep(3.8, 14, rd));\n';
assert.equal(referenceSource.split(historicalRoadBlend).length, 2, 'one historical road-plane blend in the pre-completion constructor');
// Road smoothing is also a CURRENT construction law for placement admission.
// Restore it only here; historical source authentication above keeps old grades.
const historicalSmoothing = '  function smoothRoadElevations(nodeElev: number[][]): void {\n';
const historicalJunctionBlend = '  function blendRoadJunctions(nodeElev: number[][]): void {\n';
for (const declaration of [historicalSmoothing, historicalJunctionBlend]) {
  assert.equal(referenceSource.split(declaration).length, 2, 'one historical grading declaration');
}
const historicalLayoutReturn = '  return {\n    village,\n';
assert.equal(referenceSource.split(historicalLayoutReturn).length, 2, 'one historical layout return');
// 2026-09-29 (Cliffbridge's viaduct): authored dry bridge decks (terrain.bridges) and the abutment clamp that cuts
// shoulder noise flush with the deck are construction laws of the same kind. The constructor fixture strips both from
// the historical text (its first two deltas); the relief-law constructor restores the CURRENT deck block and applies the
// clamp at both exits of the historical road-detail tail, so the placement sampler is compared against the field it
// actually reproduces.
const historicalDeckResolve = '  if (liquidWater && liquidSurfaces) bridgeDecks = resolveBridgeDecks();\n';
assert.equal(referenceSource.split(historicalDeckResolve).length, 2, 'one historical bridge-deck resolution');
const deckBlockStart = '  if (T.bridges?.length) {\n    const authored = T.bridges.map(';
const deckBlockEnd = '    bridgeDecks = Object.freeze([...bridgeDecks, ...authored]);\n  }\n';
assert.equal(source.split(deckBlockStart).length, 2, 'one current authored-deck block');
const authoredDecks = source.slice(source.indexOf(deckBlockStart), source.indexOf(deckBlockEnd) + deckBlockEnd.length);
const historicalDetailExit = '      if (liquidDetail === 0 || marshWeight === 1) return h;\n';
const historicalDetailReturn = '      h += (berm + ditch) * (1 - settlementWeight) * (1 - marshWeight) * liquidDetail;\n    }\n    return h;\n  }\n';
for (const text of [historicalDetailExit, historicalDetailReturn]) {
  assert.equal(referenceSource.split(text).length, 2, 'one historical road-detail exit');
}
const dryDeckClamp = '(T.bridges?.length ? Math.min(h, bridgeDeckOver(x, z)?.deckY ?? Infinity) : h)';
// 2026-10-01: Sirocco Wadi's bank bake, mesa routing and crossing grades left with its old country roads
// (docs/MAP-LAYOUT-BRIEF.md), so the relief-law constructor no longer restores them.
const reliefLawSource = referenceSource
  .replace(historicalDeckResolve, historicalDeckResolve + authoredDecks)
  .replace(historicalDetailExit, historicalDetailExit.replace('return h;', `return ${dryDeckClamp};`))
  .replace(historicalDetailReturn, historicalDetailReturn.replace('    return h;\n', `    return ${dryDeckClamp};\n`))
  .replace(historicalSmoothing, historicalSmoothing +
    '    if (usesPhysicalRoadStations(cfg?.id)) { smoothRoadGradesByDistance(roads, nodeElev); return; }\n')
  .replace(historicalJunctionBlend, historicalJunctionBlend +
    '    if (usesPhysicalRoadStations(cfg?.id)) { blendRoadNetworkGrades(roads, nodeElev); return; }\n')
  .replace(historicalRim,
  '    const rim = smoothstep(430, HALF, Math.max(Math.abs(x), Math.abs(z)));\n    h += rim * rim * T.rimH * (1 - waterWeight) * (rim > 0 ? coastRimKeep(x, z) : 1);\n')
  .replace(historicalRoadBlend, `    const rd = gridSample(gRoadDist, x, z);
    if (rd < 14) {
      let roadElevation = gridSample(gRoadElev, x, z);
      if (bridgeDecks.length) {
        const bridge = bridgeTermsAt(x, z);
        roadElevation += (bridge.deckY - roadElevation) * bridge.approach;
        h += (roadElevation - h) * (1 - smoothstep(3.8, 14, rd)) * (1 - bridge.span);
      } else h += (roadElevation - h) * (1 - smoothstep(3.8, 14, rd));
    }
`);
const reliefLawUrl = new URL('./terrain.ts?original-road-placement-relief-laws', import.meta.url).href;
const reliefLawHooks = registerHooks({ load(request, context, next) {
  return request === reliefLawUrl ? {format:'module-typescript', source:reliefLawSource, shortCircuit:true} : next(request,context);
} });
let reliefLaws;
try { reliefLaws = await import(reliefLawUrl); } finally { reliefLawHooks.deregister(); }
// This oracle reproduces historical authored geometry as well as the old
// constructor. Current parity checks import terrain.ts directly and remain live.
export function historicalRoadHeightField(seed, config) {
  return original.createHeightField(seed, beforeRoadSettlementRedesign(config));
}
export const historicalRoadHeightFieldWithReliefLaws = reliefLaws.createHeightField;
export const historicalRoadLayout = original.createLayout;
export const currentRoadLayoutBeforeCompletion = reliefLaws.createLayout;
export const historicalRoadTerrainSource = referenceSource;
