// The fused sources' roof-gun boxes (tools/fused-roof-gun-boxes.mjs; Main 2026-10-31) and the gate records they make:
// every boxed id is a certified fused source, every box is a finite volume over the hull, and the committed record of
// each boxed id took the source's roof gun out of the body (its oracle comparison dropped roof weapons, naming the
// boxed mesh), so a re-pin that counts a fused source's roof gun as body again fails here. The cut itself is
// body-height-parts.selftest.mjs's (a fused block and gun: the box takes the gun, unboxed the gun is the top).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FUSED_ROOF_GUN_BOXES } from './fused-roof-gun-boxes.mjs';
import { SECOND_WAVE_X_REFERENCE_OVERRIDES } from './second-wave-x-reference-overrides.ts';
import { SOURCE_WORLD_FRAMES } from './source-world-registration.mjs';

/** Why a boxed id's gate record still counts its fused source's roof gun as body, or null. */
function gunCountedAsBody(record) {
  if (record.oracleComparison?.roofWeaponsDropped !== true) return 'its oracle comparison kept the roof weapons (whole against whole)';
  if (!record.roofFittingsExcluded?.reference?.some((tag) => tag.startsWith('roofGunBoxes:'))) return 'no boxed source mesh left the body';
  return null;
}

const ids = Object.keys(FUSED_ROOF_GUN_BOXES).sort();
assert.deepEqual(ids, ['t72b_1987', 't72bu', 't80u'], 'the three fused sources whose roof gun the 10-28 true-scale guns replaced');
for (const id of ids) {
  const registration = SECOND_WAVE_X_REFERENCE_OVERRIDES[id]?.glb;
  assert.ok(SOURCE_WORLD_FRAMES[id] && registration?.path?.startsWith('/models/community-candidates/'), `${id}: a certified source`);
  assert.equal(registration.componentMasks, false, `${id}: a fused source (one mesh), which cannot name its roof gun by node`);
  for (const box of FUSED_ROOF_GUN_BOXES[id].boxes) {
    assert.ok(box.length === 6 && box.every(Number.isFinite), `${id}: [x0, y0, z0, x1, y1, z1]`);
    assert.ok(box[0] < box[3] && box[1] < box[4] && box[2] < box[5], `${id}: each box has volume`);
    assert.ok(box[1] > 2.0 && box[4] < 3.0, `${id}: a box stands over the hull, under the whips (y ${box[1]}..${box[4]})`);
  }
  const record = JSON.parse(fs.readFileSync(new URL(`../docs/geometry-gate/${id}.json`, import.meta.url), 'utf8'));
  assert.equal(gunCountedAsBody(record), null, `${id}: the record counts the source's roof gun as body; re-pin it (npm run gate:repin)`);
}
// negative controls: the pre-box record (whole against whole) and a drop that named no boxed mesh are refused
assert.match(gunCountedAsBody({ oracleComparison: { roofWeaponsDropped: false }, roofFittingsExcluded: { reference: [] } }), /whole against whole/);
assert.match(gunCountedAsBody({ oracleComparison: { roofWeaponsDropped: true }, roofFittingsExcluded: { reference: ['node:weapon2'] } }), /no boxed/);
assert.equal(gunCountedAsBody({ oracleComparison: { roofWeaponsDropped: true }, roofFittingsExcluded: { reference: ['roofGunBoxes:Object_2'] } }), null);
console.log(`fused-roof-gun-boxes.selftest: ${ids.length} fused sources name their roof gun by box; their records compare body against body`);
