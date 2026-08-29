import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./garage-variants-probe.mjs', import.meta.url), 'utf8');
assert.match(source, /window\.__GARAGE_WORKSHOP\.variants/);
assert.match(source, /results\.length !== 10/);
assert.match(source, /stats\.triangles > 450_000/);
assert.match(source, /stats\.modelMode !== 'actual-fleet'/);
assert.match(source, /stats\.forwardCorrectionRad - Math\.PI/);
assert.match(source, /stats\.roofMode !== 'enclosed-original'/);
assert.match(source, /gapMaxMs > maxGapMs/);
assert.match(source, /width: 390, height: 844/);
assert.match(source, /previewReady/);

console.log('garage-variants-probe.selftest: ok');
