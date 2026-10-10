// Wheel-paint floor (owner 2026-09-14: "road wheels are gray by default and all just blend in").
// The floor is the one mechanism that keeps a painted dish readable against its tire: the fleet
// paint, every profile clone of it and every authored wheelHex pass through it in the appearance
// normaliser. These receipts pin the maths and the normaliser hook.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  WHEEL_PAINT_FLOOR_LUMINANCE, WHEEL_DUST_LINEAR, linearLuminance, liftLinearRgbToWheelFloor,
  liftSrgbToWheelFloor, liftWheelPaintFloor, srgbChannelToLinear,
} from './wheelPaintFloor.ts';
import { normalizeTankAppearance, tagVehicleMaterial } from './appearanceAudit.ts';

const tire = [0.0222, 0.0232, 0.0212]; // #292a28 in linear
assert.ok(linearLuminance(tire) < WHEEL_PAINT_FLOOR_LUMINANCE / 1.9,
  'the floor sits about twice above the tire rubber');

// launch night 2026-10-08 (wave 289: "road wheels read as bare cream or beige plastic"): dark paint is lifted exactly
// onto the floor in its own hue (a uniform scale), not toward road dust
const darkGreen = [0.0200, 0.0280, 0.0170];
const lifted = liftLinearRgbToWheelFloor(darkGreen);
assert.ok(Math.abs(linearLuminance(lifted) - WHEEL_PAINT_FLOOR_LUMINANCE) < 1e-9, 'a dark dish lands on the floor');
for (let i = 0; i < 3; i++) {
  assert.ok(Math.abs(lifted[i] / lifted[1] - darkGreen[i] / darkGreen[1]) < 1e-9, `the lift keeps the paint's hue (channel ${i})`);
}
assert.ok(lifted[1] > lifted[0] && lifted[1] > lifted[2], 'a green dish stays green');
// two dark schemes no longer converge on one tone (the old dust-ward floor landed both on #504e3c)
const darkGrey = liftLinearRgbToWheelFloor([0.0300, 0.0300, 0.0330]);
assert.ok(Math.abs(darkGrey[2] / darkGrey[1] - lifted[2] / lifted[1]) > 0.3, 'a grey and a green dish keep different hues');
// a colour with no luminance to scale still reaches the floor, toward road dust
const black = liftLinearRgbToWheelFloor([0, 0, 0]);
assert.ok(Math.abs(linearLuminance(black) - WHEEL_PAINT_FLOOR_LUMINANCE) < 1e-9, 'black lands on the floor');
assert.ok(black[0] > black[2], 'black is lifted in the warm dust direction (red above blue)');
// the tire itself would be lifted in its own neutral hue
const tireLifted = liftLinearRgbToWheelFloor(tire);
assert.ok(Math.abs(tireLifted[0] / tireLifted[1] - tire[0] / tire[1]) < 1e-9, 'a neutral dark tone stays neutral');
// bright paint is untouched
const sand = [0.22, 0.16, 0.07];
assert.deepEqual(liftLinearRgbToWheelFloor(sand), sand, 'paint above the floor is returned as is');
// dust itself is above the floor, so the lift can always reach it
assert.ok(linearLuminance(WHEEL_DUST_LINEAR) > WHEEL_PAINT_FLOOR_LUMINANCE, 'dust is brighter than the floor');

// sRGB palette maths (materials.ts) round-trips through linear space
const srgbDark = liftSrgbToWheelFloor([41, 42, 40]);
const srgbLum = linearLuminance(srgbDark.map(srgbChannelToLinear));
assert.ok(Math.abs(srgbLum - WHEEL_PAINT_FLOOR_LUMINANCE) < 0.004, `sRGB lift lands on the floor within 8-bit rounding (${srgbLum.toFixed(4)})`);
assert.deepEqual(liftSrgbToWheelFloor([160, 140, 90]), [160, 140, 90], 'bright sRGB paint is unchanged');

// three.js colour, in place
const color = new THREE.Color(0x2e2c22);
const before = [color.r, color.g, color.b];
assert.strictEqual(liftWheelPaintFloor(color), color, 'returns the same Color for chaining');
assert.ok(Math.abs(linearLuminance([color.r, color.g, color.b]) - WHEEL_PAINT_FLOOR_LUMINANCE) < 1e-9, 'KF51 dish tone lifted to the floor');
assert.ok(Math.abs(color.r / color.g - before[0] / before[1]) < 1e-9, 'KF51 dish tone keeps its hue');

// the normaliser applies the floor to wheelPaint materials only, and never to mapped paint
const root = new THREE.Group();
const paint = tagVehicleMaterial(new THREE.MeshStandardMaterial({ color: 0x33382c }), 'wheelPaint', 'wheel-paint');
const fitting = tagVehicleMaterial(new THREE.MeshStandardMaterial({ color: 0x33382c }), 'fittingPaint', 'fitting-paint');
const mapped = tagVehicleMaterial(new THREE.MeshStandardMaterial({ color: 0x33382c, map: new THREE.Texture() }), 'wheelPaint', 'wheel-paint-camo');
const rubber = tagVehicleMaterial(new THREE.MeshStandardMaterial({ color: 0x777777 }), 'tireRubber', 'tire-rubber');
for (const [material, role] of [[paint, 'wheelDish'], [fitting, 'wheelDish'], [mapped, 'wheelDish'], [rubber, 'wheelInset']]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.userData.appearanceRole = role;
  root.add(mesh);
}
normalizeTankAppearance(root);
assert.ok(linearLuminance([paint.color.r, paint.color.g, paint.color.b]) >= WHEEL_PAINT_FLOOR_LUMINANCE - 1e-9, 'wheelPaint is floored by the normaliser');
assert.equal(fitting.color.getHexString(), '33382c', 'fitting paint is not wheel paint and keeps its tone');
assert.equal(mapped.color.getHexString(), '33382c', 'camouflage-mapped wheel paint keeps its multiplier');
assert.equal(rubber.color.getHexString(), '292a28', 'fixed roles still snap to the neutral gear palette');

console.log('wheelPaintFloor: floor maths (linear, sRGB, Color), the in-hue lift, the dust fallback, and the normaliser hook verified');
