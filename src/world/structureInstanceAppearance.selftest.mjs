import assert from 'node:assert/strict';
import {
  RUINSPIRES_WINDOW_STYLE, STRUCTURE_WINDOW_STYLE, resolveRowhouseTrimBucket,
  resolveStructureWindowStyle, writeStructureInstanceTint,
} from './structureInstanceAppearance.ts';

const luminance = (hex) => {
  const red = ((hex >> 16) & 0xff) / 255;
  const green = ((hex >> 8) & 0xff) / 255;
  const blue = (hex & 0xff) / 255;
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
};

assert.ok(luminance(STRUCTURE_WINDOW_STYLE.glassColor) < 0.24,
  'window glass remains a dark sky-catching surface rather than a white card');
assert.ok(luminance(STRUCTURE_WINDOW_STYLE.curtainColor) < 0.48,
  'curtained windows stay below the facade highlight shoulder');
assert.ok(STRUCTURE_WINDOW_STYLE.curtainEmissiveIntensity <= 0.10,
  'daytime window fill cannot turn into a map-wide emissive grid');
assert.equal(resolveStructureWindowStyle('urban'), STRUCTURE_WINDOW_STYLE,
  'Steinburg retains the reference window palette');
assert.equal(resolveStructureWindowStyle('ruinspires'), RUINSPIRES_WINDOW_STYLE,
  'Ruinspires uses its restrained ruined-city window palette');
assert.ok(luminance(RUINSPIRES_WINDOW_STYLE.glassColor) < 0.12,
  'Ruinspires glazing cannot become pale facade cards');
assert.ok(luminance(RUINSPIRES_WINDOW_STYLE.curtainColor) < 0.22,
  'Ruinspires curtain fill remains dark under its exposed skyline lighting');
assert.ok(RUINSPIRES_WINDOW_STYLE.curtainEmissiveIntensity <= 0.02,
  'Ruinspires window fill cannot form white emissive bands');
assert.ok(RUINSPIRES_WINDOW_STYLE.glassRoughness >= 0.75
  && RUINSPIRES_WINDOW_STYLE.glassEnvMapIntensity <= 0.25
  && RUINSPIRES_WINDOW_STYLE.glassClearcoat <= 0.05,
  'Ruinspires glazing cannot mirror the exposed sky into pale window cards');
assert.equal(resolveRowhouseTrimBucket('stone', false, true), 'stone',
  'low-contrast ruined-city facades cannot place pale plaster lines on dark masonry');
assert.equal(resolveRowhouseTrimBucket('plaster3', false, true), 'stone',
  'all Ruinspires wall families share low-contrast stone reveals');
assert.equal(resolveRowhouseTrimBucket('stone', false, false), 'plaster',
  'ordinary town palettes retain their authored material contrast');

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
