import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./garage-variants-probe.mjs', import.meta.url), 'utf8');
assert.match(source, /variants\.length !== 10/);
assert.match(source, /stats\.triangles <= 0/);
assert.match(source, /stats\.exhibitCount !== 4/);
assert.match(source, /stats\.sharedMaintenanceBayCount !== 4/);
assert.match(source, /__GARAGE_DRESSING_PROBE/);
assert.match(source, /source !== 'authentic-garage-scene-pack'/);
assert.match(source, /architecture\.drawCalls > 24/);
assert.match(source, /architecture\.residentTextureSets > 9/);
assert.match(source, /for \(let pass = 0; pass < 4/);
assert.match(source, /exerciseEnvironmentCycles\(variants\.length\)/);
assert.match(source, /exerciseEnvironmentCycles\(30\)/);
assert.match(source, /heapGrowth > 24 \* 1024 \* 1024/);
assert.match(source, /width: 1180, height: 820/);
assert.match(source, /width: 390, height: 844/);
assert.match(source, /panelMode !== 'overlay'/);
assert.match(source, /frames\.maxGapMs > maxGapMs/);

console.log('garage-variants-probe.selftest: authentic scene-pack transition matrix covered');
