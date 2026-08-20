import assert from 'node:assert/strict';
import './tankFactory.js';
import { ALL_TANK_IDS, getSpec } from './specs.js';
import { CAMO_PATTERN_IDS, factoryThemePatternId, isPlainGreenFactoryVisual } from './camoPolicy.js';
import { resolveCamoVisual } from './materials.js';

const themed = [];
for (const id of ALL_TANK_IDS) {
  const spec = getSpec(id);
  const theme = factoryThemePatternId(spec);
  const resolved = resolveCamoVisual(spec, 'factory');
  assert.equal(isPlainGreenFactoryVisual(resolved), false,
    `${id} factory paint must not resolve to a plain green coat`);
  if (theme) {
    themed.push(id);
    assert.ok(CAMO_PATTERN_IDS.includes(theme), `${id} factory theme must use a built-in pattern`);
    assert.notEqual(resolved.scheme, 'solid', `${id} factory theme must be visibly patterned`);
  }
}

assert.ok(themed.length >= 24, 'the remaining plain-green playable fleet must receive factory themes');
assert.equal(resolveCamoVisual(getSpec('pt91m'), 'factory').scheme, 'stripes',
  'PT-91M factory paint should retain its authored Polish stripe pattern');
assert.equal(resolveCamoVisual(getSpec('m1a1'), 'factory').scheme, 'nato',
  'Abrams factory paint should retain its authored NATO pattern');
assert.equal(factoryThemePatternId(getSpec('udes03')), 'm90',
  'plain-green Swedish vehicles should use the authored Nordic visual language');

console.log(`factoryCamo.selftest: ${themed.length} plain-green factory coats replaced across ${ALL_TANK_IDS.length} playables`);
