import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Mission brief (campaign slice 5 / batch 21, 2026-09-14): the card's `isShowing()` must flip the moment
// the fade starts, so a reopen request that lands during the 450 ms fade re-opens the brief instead of
// cancelling it, and the pure view resolves the ladder operation before the free-sortie framing.
const source = readFileSync(new URL('./missionBrief.ts', import.meta.url), 'utf8');
assert.match(source, /fadeTimer = setTimeout\(\(\) => \{ root\.classList\.remove\('show'\); showing = false; \}/,
  'the fade flips the showing state at once');
assert.match(source, /hideTimer = setTimeout\(\(\) => \{ if \(!showing\) hide\(\); \}/,
  'the hide timer only finishes a fade that was not re-opened');
assert.match(source, /campaignOperationById\(request\.operationId\) \?\? campaignOperationForMap\(request\.mapId\)/,
  'the view resolves the ladder operation, then the map');

// The mission brief remains available to the campaign flow.
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(main, /bus\.on\('ui:missionBrief', \(\) => \{\n\s*if \(game\.phase !== 'battle' \|\| game\.gameMode !== 'frontline_assault'\) return;\n\s*if \(missionBrief\.isShowing\(\)\) \{ missionBrief\.hide\(\); return; \}/,
  'main toggles the brief for a campaign battle only');
console.log('missionBrief.selftest: fade state, operation selection and campaign toggle PASS');
