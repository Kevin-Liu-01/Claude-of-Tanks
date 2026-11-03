// terrainBuildModes.selftest.mjs — the height field's transient modes are held for one read and restored on the way out
// (2026-11-02 audit M9, terrain.ts).
//
// heightAt branches on closure flags the build toggles round a call: the rail cuttings suspended (uncutHeightAt, also
// read at runtime by the vegetation admission and the cut faces' seeding), the outland clearance being built, the
// road authoring on the landform's rim, and the landform's phase. Each was set and cleared by hand with no try/finally
// (the phase saved and restored by hand at two sites). A throw inside the read left the flag set: on a rail-cut map the
// live field — collision included — lost its cuttings for every later caller and parted from the authority's surface.
//   - reproduced on Tarkhan Steppe: a read through uncutHeightAt that throws inside heightAt leaves the cutting in place;
//   - every write of those four modes goes through its scoped helper (or the phase's one-way entry).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHeightField } from './terrain.ts';
import { getMapConfig } from './maps/index.ts';

// ---- the live field keeps its cutting after a read on the uncut ground throws (Tarkhan Steppe's cut at the edge)
const field = createHeightField(1337, getMapConfig('steppe'));
const cutY = field.getHeightAt(511.9, -181);
const faceSeed = field._batterSeedAt;
assert.equal(typeof faceSeed, 'function', 'the cut faces\' seeding hook reads the uncut ground');
Error.stackTraceLimit = 64;
// a coordinate that throws only when heightAt reads it (the cutting's own terms read it first, outside heightAt)
let armed = false, reached = 0;
const coordinate = (value) => ({
  valueOf() {
    if (armed && /\bheightAt\b/.test(new Error().stack ?? '')) { reached++; throw new Error('injected heightAt failure'); }
    return value;
  },
});
armed = true;
assert.throws(() => faceSeed(coordinate(500), coordinate(-187.4)), /injected heightAt failure/, 'the read on the uncut ground throws');
armed = false;
assert.ok(reached > 0, 'the throw came from inside heightAt (through uncutHeightAt)');
assert.equal(field.getHeightAt(511.9, -181), cutY, 'the live field still carries its cutting (the suspension was restored)');
assert.equal(faceSeed(500, -187.4) >= 0, true, 'and the hook still answers');

// ---- every write of the four modes is scoped
const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const writes = (name) => [...source.matchAll(new RegExp(`\\b${name} = [^=]`, 'g'))].map((m) => source.slice(m.index, source.indexOf('\n', m.index)).trim());
assert.deepEqual(writes('railCuttingsSuspended'), ['railCuttingsSuspended = false;', 'railCuttingsSuspended = true;',
  'railCuttingsSuspended = was; }'], 'the cuttings\' suspension: declared, set for one read, restored in its finally');
assert.match(source, /railCuttingsSuspended = true;\n\s*try \{ return heightAt\(x, z, true, true\); \} finally \{ railCuttingsSuspended = was; \}/,
  'uncutHeightAt holds the suspension in a try/finally');
assert.deepEqual(writes('authoringOnLandform'), ['authoringOnLandform = false;', 'authoringOnLandform = true;', 'authoringOnLandform = was; }'],
  'the rim authoring: only onLandformRim sets and restores it');
assert.deepEqual(writes('landformPhase'), ["landformPhase = 'authored-relief'; };", "landformPhase = 'authored-relief';",
  'landformPhase = phase; }'], 'the landform\'s phase: its one-way entry and withAuthoredRelief\'s scoped read');
assert.match(source, /clearanceBuilding = true;\n\s*try \{[\s\S]*?\} finally \{\n\s*clearanceBuilding = false;\n\s*\}/, 'the clearance ring read in a try/finally');

console.log('terrainBuildModes.selftest: a throwing read leaves the live field\'s cuttings in place; every build mode is scoped');
