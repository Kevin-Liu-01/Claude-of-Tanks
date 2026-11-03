// kitBuildLatch.selftest.mjs — the wall and fence kits' build-time values are read after the build or not at all
// (2026-11-02 audit R2, buildLatch.ts).
//
// The mud wall, the coursed and dry-stone walls, the timber fences and the iron railing record their legacy module's
// contact band (and the walls their terrain-fit module, the fences their drawn collider band, the mud wall its envelope)
// while their pool builds them. props.ts reads them as `pool.meta?.contactBand ?? derive(...)`, `pool.meta.fitGeometry ??
// geoI` and `env ?? {stand-in}`: read before the build they answered undefined and every reader quietly took its
// fallback, a different collision record set (the manifests the authority plays) with no error. Now:
//   - each getter, and the mud wall's broken build, throws when the pool has not built the type;
//   - after the build each answers what the build recorded (the existing kit selftests pin the values);
//   - props.ts still builds each pool's intact module before its refit, its wall fit and its broken build.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COURSED_WALLSTONE, DESTRUCTIBLE_TYPES } from './inhabitKit.ts';
import { adobeWallType } from './adobeWallKit.ts';
import { coursedWallType, dryStoneWallType } from './coursedWallKit.ts';
import { FENCE_KINDS, fenceTypes, ironRailingType } from './fenceKit.ts';

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const footprint = () => mulberry32(0x0f0f7);
const BEFORE = /read before its pool built the type/;

const fences = fenceTypes('kolkhoz', 'verdant', DESTRUCTIBLE_TYPES, footprint);
const entries = [
  ['walladobe', adobeWallType('ksar', { ...DESTRUCTIBLE_TYPES.walladobe, mat: 'fieldMud' }, footprint), ['contactBand', 'fitGeometry']],
  ['wallstone (coursed)', coursedWallType('ruhr', COURSED_WALLSTONE, footprint), ['contactBand', 'fitGeometry']],
  ['wallstone (dry stone)', dryStoneWallType({ ...DESTRUCTIBLE_TYPES.wallstone, mat: 'fieldStone' }, null, footprint), ['contactBand', 'fitGeometry']],
  ...FENCE_KINDS.map((kind) => [kind, fences[kind], ['contactBand', 'colliderBand']]),
  ['fenceiron', ironRailingType(DESTRUCTIBLE_TYPES.fenceiron, footprint), ['contactBand']],
];
for (const [name, entry, fields] of entries) {
  for (const field of fields) assert.throws(() => entry[field], BEFORE, `${name}: ${field} read before the build throws (no silent fallback)`);
}
// the mud wall's broken build sizes its bite on the intact build's envelope: before it, a throw (was a hard-coded stand-in)
const adobe = entries[0][1];
assert.throws(() => adobe.broken(mulberry32(5)), BEFORE, 'walladobe: a broken build before the intact one throws');

for (const [name, entry, fields] of entries) {
  entry.build(mulberry32(11)).dispose();
  for (const field of fields) assert.ok(entry[field] !== undefined, `${name}: ${field} answers after the build`);
}
adobe.broken(mulberry32(5)).dispose();

// ---- props.ts: each pool's intact build precedes the readers (the refit's bands, the wall fit, the broken build)
const props = readFileSync(new URL('../props.ts', import.meta.url), 'utf8');
const prepare = props.slice(props.indexOf('function* prepareDestructiblePoolGeometry('), props.indexOf('function* finalizeDestructiblePool('));
const at = (needle) => { const i = prepare.indexOf(needle); assert.ok(i >= 0, `props.ts prepareDestructiblePoolGeometry: ${needle}`); return i; };
assert.ok(at('pool.meta.build(drng)') < at('refitDestructibleColliders(geoI, pool, kind)'), 'the intact build, then the refit (contact and collider bands)');
assert.ok(at('refitDestructibleColliders(geoI, pool, kind)') < at('pool.meta.fitGeometry ?? geoI'), 'the refit, then the wall fit');
const finalize = props.slice(props.indexOf('function* finalizeDestructiblePool('), props.indexOf('function* finalizeDestructiblePools('));
assert.ok(finalize.indexOf('yield* prepareDestructiblePoolGeometry(kind, pool)') >= 0
  && finalize.indexOf('yield* prepareDestructiblePoolGeometry(kind, pool)') < finalize.indexOf('meta.broken(drng)'),
'a pool\'s broken build follows its intact build');

console.log(`kitBuildLatch.selftest: ${entries.length} wall and fence kinds throw on a read before their build and answer after it`);
