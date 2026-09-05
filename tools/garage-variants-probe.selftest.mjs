import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./garage-variants-probe.mjs', import.meta.url), 'utf8');
assert.match(source, /variants\.length !== 10/);
assert.match(source, /stats\.triangles <= 0/);
assert.match(source, /architecture\.presented === true/,
  'visual gates must prove that the selected environment is actually mounted and visible');
assert.match(source, /stats\.exhibitCount !== 5/);
assert.match(source, /stats\.sharedMaintenanceBayCount !== 4/);
assert.match(source, /__GARAGE_DRESSING_PROBE/);
assert.match(source, /source !== 'authentic-garage-scene-pack'/);
assert.match(source, /architecture\.drawCalls > 25/);
assert.match(source, /architecture\.residentTextureSets > 9/);
assert.match(source, /for \(let pass = 0; pass < 4/);
assert.match(source, /intentRaceDecoy[\s\S]*architecture\.presented === true/,
  'Garage visual probe must cover concurrent selector prewarm and selection');
assert.match(source, /exerciseEnvironmentCycles\(variants\.length\)/);
assert.match(source, /exerciseEnvironmentCycles\(30\)/);
assert.match(source, /heapGrowth > 24 \* 1024 \* 1024/);
assert.match(source, /width: 1180, height: 820/);
assert.match(source, /width: 390, height: 844/);
assert.match(source, /panelMode !== 'overlay'/);
assert.match(source, /rightDisplay !== 'block'/,
  'responsive QA must preserve the intentionally visible compact stats sidebar');
assert.match(source, /frames\.maxGapMs > maxGapMs/);
assert.match(source, /workshopExhibitTextureCount !== 0/);
assert.match(source, /workshopPaletteCount !== 4/);
assert.match(source,
  /service_t90m\|service_usa_desert\|service_leo2a6m\|service_bmp3_rok/);

console.log('garage-variants-probe.selftest: authentic scene-pack transition matrix covered');
