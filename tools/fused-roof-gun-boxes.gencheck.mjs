// The fused sources' roof-gun boxes (tools/fused-roof-gun-boxes.mjs; Main 2026-10-31) and the gate records they make:
// every boxed id is a certified fused source, every box is a finite volume over the hull, and the committed record of
// each boxed id took the source's roof gun out of the body (its oracle comparison dropped roof weapons, naming the
// boxed mesh), so a re-pin that counts a fused source's roof gun as body again fails here. The cut itself is
// body-height-parts.selftest.mjs's (a fused block and gun: the box takes the gun, unboxed the gun is the top).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FUSED_ANTENNA_BOXES, FUSED_ROOF_GUN_BOXES } from './fused-roof-gun-boxes.mjs';
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
  assert.equal(gunCountedAsBody(record), null, `${id}: the record counts the source's roof gun as body; re-pin it (npm run gen:repin)`);
}
// negative controls: the pre-box record (whole against whole) and a drop that named no boxed mesh are refused
assert.match(gunCountedAsBody({ oracleComparison: { roofWeaponsDropped: false }, roofFittingsExcluded: { reference: [] } }), /whole against whole/);
assert.match(gunCountedAsBody({ oracleComparison: { roofWeaponsDropped: true }, roofFittingsExcluded: { reference: ['node:weapon2'] } }), /no boxed/);
assert.equal(gunCountedAsBody({ oracleComparison: { roofWeaponsDropped: true }, roofFittingsExcluded: { reference: ['roofGunBoxes:Object_2'] } }), null);
// The whips a source fuses into its turret (FUSED_ANTENNA_BOXES, 267): the Centurion family's certified Strv 81 print and
// the T-90MS print's rear whip. The committed record of each id set them aside in every comparison (the page's
// whipsAside), its boxes took exactly the census' triangles, and where the whips stand over everything no station's source
// top reaches one, so a re-pin that counts the whips in the shapes or the heights, or boxes a mount with them, fails here.
/** Why a whip-boxed id's gate record still counts its source's whips, or null. */
function whipsCounted(record, { triangles, boxes, tallest }) {
  if (!record.whipsAside) return 'the record kept the source\'s whips in its shapes';
  const tags = (record.roofFittingsExcluded?.reference ?? []).filter((tag) => tag.startsWith('antennaBoxes:'));
  const taken = tags.reduce((sum, tag) => sum + Number(tag.split(':').at(-1)), 0);
  if (taken !== triangles) return `the boxes took ${taken} triangles, not the census' ${triangles}`;
  if (!tallest) return null;
  const tip = Math.min(...boxes.map((box) => box[4])) - 0.1, top = Math.max(...(record.stationErr ?? []).map((row) => row.refTop ?? 0));
  return top < tip ? null : `a station's source top (${top} m) reaches a whip (over ${tip.toFixed(2)} m)`;
}
const whipIds = Object.keys(FUSED_ANTENNA_BOXES).sort();
assert.deepEqual(whipIds, ['centurion3', 'centurion5_2', 'chieftain3', 'strv81', 't90ms_tagil'],
  'the Centurions rebuilt to the Strv 81 print; the Mk 3 on the Chieftain Mk 5 X source (271); the T-90MS');
const WHIP_SPANS = { strv81: [2.8, 4.3, 136], chieftain5: [2.1, 3.9, 150], t90ms_tagil: [2.2, 3.0, 60] };
for (const id of whipIds) {
  const family = id.startsWith('centurion') ? 'strv81' : id === 'chieftain3' ? 'chieftain5' : id;
  assert.ok(SOURCE_WORLD_FRAMES[id], `${id}: boxes need a certified frame`);
  if (family === 'strv81') {
    assert.equal(SECOND_WAVE_X_REFERENCE_OVERRIDES[id]?.glb?.path, '/models/community-candidates/strv81_x_source.glb', `${id}: the certified Strv 81 print`);
    assert.equal(SOURCE_WORLD_FRAMES[id], SOURCE_WORLD_FRAMES.strv81, `${id}: one family frame`);
    assert.equal(FUSED_ANTENNA_BOXES[id], FUSED_ANTENNA_BOXES.strv81, `${id}: the print's boxes`);
  }
  if (family === 'chieftain5') {
    assert.equal(SECOND_WAVE_X_REFERENCE_OVERRIDES[id]?.glb?.path, '/models/community-candidates/chieftain5_x_source.glb', `${id}: the certified Mk 5 X source`);
    assert.equal(SOURCE_WORLD_FRAMES[id], SOURCE_WORLD_FRAMES.chieftain5, `${id}: one source frame`);
  }
  const { boxes, triangles } = FUSED_ANTENNA_BOXES[id], [low, high, census] = WHIP_SPANS[family];
  assert.equal(triangles, census, `${id}: the census' ${census} whip triangles`);
  for (const box of boxes) {
    assert.ok(box.length === 6 && box.every(Number.isFinite) && box[0] < box[3] && box[1] < box[4] && box[2] < box[5], `${id}: a box`);
    assert.ok(box[1] > low && box[4] < high, `${id}: a box over the turret roof and the whips' mounts, to their tips (y ${box[1]}..${box[4]})`);
  }
  const record = JSON.parse(fs.readFileSync(new URL(`../docs/geometry-gate/${id}.json`, import.meta.url), 'utf8'));
  assert.equal(whipsCounted(record, FUSED_ANTENNA_BOXES[id]), null, `${id}: the record counts the source's whips; re-pin it (npm run gen:repin)`);
}
// negative controls: a record that kept the whips in its shapes, boxes that took the mounts' caps too, a whip's station
const entry = FUSED_ANTENNA_BOXES.strv81, row = (refTop) => ({ refTop });
const record = (tag, tops, aside = 'every comparison') => ({ whipsAside: aside, stationErr: tops.map(row),
  roofFittingsExcluded: { reference: [tag] } });
assert.match(whipsCounted(record('antennaBoxes:turret_0_turret_0_0:136', [3.165], null), entry), /kept the source's whips/);
assert.match(whipsCounted(record('antennaBoxes:turret_0_turret_0_0:148', [3.165]), entry), /took 148/);
assert.match(whipsCounted(record('antennaBoxes:turret_0_turret_0_0:136', [3.165, 4.194]), entry), /reaches a whip/);
assert.equal(whipsCounted(record('antennaBoxes:turret_0_turret_0_0:136', [1.943, 3.165]), entry), null);
console.log(`fused-roof-gun-boxes.selftest: ${ids.length} fused sources name their roof gun by box, the Strv 81 and T-90MS prints their fused whips for `
  + `${whipIds.length} ids; their records compare body against body`);
