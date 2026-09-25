// Round 71 (2026-09-25): every map config gained a `clouds` block (the volumetric layer's cloudscape, engine/cloudscapes.ts)
// as two lines before its `sky:` block — a dated comment and the block itself. The cloudscape never feeds relief, the
// splat, the horizon or the sky block, so the byte receipts that hold a map's authoring against its historical source
// (badlandsRelief, playableRelief) project the two lines back out before comparing, the way round 66's ocean block and
// round 47's presentation blocks are projected. Mars carries its cloudscape on the shared preset (no block).
import assert from 'node:assert/strict';

const ROUND71_CLOUDS_BLOCK = /^  \/\/ round 71 \(2026-09-25\): the volumetric layer's cloudscape \(engine\/cloudscapes\.ts; opt-in, \?clouds=volumetric\)\n  clouds: \{[^\n]*\},\n/m;

export function historicalRound71CloudsSource(source, file) {
  if (file === 'mars.ts') { assert.doesNotMatch(source, ROUND71_CLOUDS_BLOCK, 'mars.ts carries no clouds block (the shared preset does)'); return source; }
  assert.equal(source.split(ROUND71_CLOUDS_BLOCK).length, 2, `${file}: one exact round-71 clouds block`);
  return source.replace(ROUND71_CLOUDS_BLOCK, '');
}
