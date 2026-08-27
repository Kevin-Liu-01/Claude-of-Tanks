import assert from 'node:assert/strict';
import { writeStructureInstanceTint } from './structureInstanceAppearance.ts';

const target = {
  value: [0, 0, 0],
  setRGB(r, g, b) { this.value[0] = r; this.value[1] = g; this.value[2] = b; },
};

writeStructureInstanceTint(target, 'fieldhut', 7, 90210, 0.07);
const receipt = [...target.value];
writeStructureInstanceTint(target, 'fieldhut', 7, 90210, 0.07);
assert.deepEqual(target.value, receipt, 'the same authored instance keeps the same tint');

const variants = new Set();
for (let index = 0; index < 64; index++) {
  writeStructureInstanceTint(target, 'fieldhut', index, 90210, 0.07);
  assert.ok(target.value.every((channel) => channel >= 0.86 && channel <= 1.12),
    'structure tint remains inside the restrained diffuse multiplier envelope');
  variants.add(target.value.map((channel) => channel.toFixed(4)).join(':'));
}
assert.ok(variants.size >= 60, 'one instanced family does not repeat a visible tint sequence');

assert.throws(
  () => writeStructureInstanceTint(target, '', -1, Number.NaN),
  /requires a family, non-negative index, and finite seed/,
  'invalid authoring identity fails closed',
);

console.log('structureInstanceAppearance.selftest: deterministic zero-draw-call variety passed');
