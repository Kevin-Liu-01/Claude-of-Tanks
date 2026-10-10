// The trees lane (2026-10-06, the coordinator's ruling on the gauntlet's wave 178 — Verdant's light version: "a loose
// grove of tall, spindly, birch-like trees ... standing apart in the black-earth plough"): a place's closed stands
// (treeBiomes.ts denseStands; vegetation.ts fillStands fills each stand's holes from a stream of its own after every
// other placement, and no sapling stands out in a field's interior).
// The treescn lane (2026-10-09): withdrawn from Verdant. Wave 307 read round 8's light version a point down on Verdant,
// and the owner keeps Verdant light-touch: its stands stay as they stand. The law stays for a place that asks for it;
// no place does, so no producer fills a stand and no seat any map had moves. A construction receipt.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAP_IDS } from './maps/index.ts';
import { treeBiomeDenseStands } from './treeBiomes.ts';

assert.equal(treeBiomeDenseStands('verdant'), false, 'Verdant keeps its stands as they stand');
assert.deepEqual(MAP_IDS.filter((id) => treeBiomeDenseStands(id)), [], 'no place closes its stands');
const source = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
assert.match(source, /function fillStands\(\): void \{\n\s*if \(!denseStands\) return;/, 'the fill runs only where a place asks for it');
assert.match(source, /if \(denseStands && denseFieldInterior\(sx, sz\)\) continue;/, 'and the saplings\' rule with it');
console.log('denseStands.selftest: no place closes its stands (withdrawn from Verdant, 2026-10-09); the law only where asked PASS');
