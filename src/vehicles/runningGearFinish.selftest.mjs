// Running-gear finish (owner 2026-09-22: "look through all wheel colors many of which are arbitrary or super
// bright or just dont look good and make a better wheel system"). Pins the one finish table
// (runningGearFinish.ts), the normaliser that re-seats every painted running-gear face onto the hull's one
// scheme wheel paint (appearanceAudit.ts) and the release audit that enforces the table (wheelQuality.ts) on a
// sample of hulls at HIGH and LOW — the fleet-wide run is wheelQuality.selftest.mjs.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  RUNNING_GEAR_FINISH_RULES, RUNNING_GEAR_PALETTE, WHEEL_PAINT_SHADE_RATIO, hexToLinearRgb, hslSaturation,
  runningGearFinishRuleFor, withinRunningGearFinish,
} from './runningGearFinish.ts';
import { WHEEL_PAINT_FLOOR_LUMINANCE, linearLuminance } from './wheelPaintFloor.ts';
import { normalizeTankAppearance, tagVehicleMaterial } from './appearanceAudit.ts';
import { auditTankWheelQuality } from './wheelQuality.ts';
import { createTank } from './tankFactory.ts';

// ---- the table: disjoint roles, every fixed palette hex inside its own window, the paint floor inside the paint window
{
  const seen = new Set();
  for (const rule of RUNNING_GEAR_FINISH_RULES) {
    for (const role of rule.roles) { assert.ok(!seen.has(role), `${role} owned by two finish rules`); seen.add(role); }
    assert.ok(rule.materialRoles.length >= 1 && rule.note.length > 20, `${rule.finish}: documented`);
    if (rule.hex !== undefined) assert.ok(withinRunningGearFinish(hexToLinearRgb(rule.hex), rule), `${rule.finish}: palette hex sits inside its own window`);
  }
  for (const role of ['wheelTire', 'wheelInset', 'wheelDish', 'suspensionLink', 'trackHardware', 'gearShadow']) {
    assert.ok(runningGearFinishRuleFor(role), `${role} has a finish rule`);
  }
  assert.equal(runningGearFinishRuleFor('armorPaint'), null, 'armor paint is outside the running-gear table');
  const paint = runningGearFinishRuleFor('wheelDish');
  assert.ok(paint.minLuminance <= WHEEL_PAINT_FLOOR_LUMINANCE && paint.minLuminance >= WHEEL_PAINT_FLOOR_LUMINANCE - 0.005,
    'the dish window starts at the wheel-paint floor, less its 8-bit sRGB rounding');
  const tire = hexToLinearRgb(RUNNING_GEAR_PALETTE.tireRubber);
  assert.ok(linearLuminance(tire) < 0.03 && hslSaturation(tire) < 0.05, 'tire rubber is dark and neutral');
  // The arbitrary per-hull hexes the owner saw: the T-62 / Type 59 dish 0x697250 and the T-90MS dish 0x68684d are
  // more saturated than the fleet paint window admits; the fleet's own floored paint tones pass.
  for (const hex of [0x697250, 0x68684d]) assert.ok(!withinRunningGearFinish(hexToLinearRgb(hex), paint), `${hex.toString(16)} is outside the dish window`);
  for (const hex of [0x545b48, 0x4d4f3a, 0x4b523f]) assert.ok(withinRunningGearFinish(hexToLinearRgb(hex), paint), `${hex.toString(16)} (fleet paint) is inside the dish window`);
  assert.ok(WHEEL_PAINT_SHADE_RATIO > 0.5 && WHEEL_PAINT_SHADE_RATIO < 1, 'the shade is darker than the paint');
}

// ---- the normaliser: clones and fitting paint re-seat onto the hull paint, retints return to the scheme tone,
// mapped paint and the shade stay, tires snap to rubber
{
  const paint = tagVehicleMaterial(new THREE.MeshStandardMaterial({ color: 0x545b48 }), 'wheelPaint', 'wheel-paint');
  paint.userData.schemeFinishHex = 0x545b48;
  const shade = tagVehicleMaterial(new THREE.MeshStandardMaterial({ color: 0x373c30 }), 'wheelPaint', 'wheel-paint-recessed');
  shade.userData.schemeFinishHex = 0x373c30;
  const clone = paint.clone(); clone.color.setHex(0x697250); // a per-hull wheelHex clone (copies the stamp)
  const fitting = tagVehicleMaterial(new THREE.MeshStandardMaterial({ color: 0x4a5040 }), 'fittingPaint', 'fitting-paint');
  const armClone = paint.clone(); armClone.color.setHex(0x3e4437);
  const mapped = tagVehicleMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, map: new THREE.Texture() }), 'wheelPaint', 'wheel-paint-camo');
  const tire = tagVehicleMaterial(new THREE.MeshStandardMaterial({ color: 0x3b3a34 }), 'tireRubber', 'tire-rubber');
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = (material, role, instanced = false) => {
    const m = instanced ? new THREE.InstancedMesh(geometry, material, 2) : new THREE.Mesh(geometry, material);
    m.userData.appearanceRole = role; m.userData.runningGear = true; return m;
  };
  const discs = mesh(clone, 'wheelDish', true), ring = mesh(fitting, 'wheelDish', true), arm = mesh(armClone, 'suspensionLink', true);
  const drum = mesh(clone, 'wheelDish'), camo = mesh(mapped, 'wheelDish', true), tires = mesh(tire, 'wheelTire', true);
  const roller = new THREE.InstancedMesh(geometry, [tire, clone], 2); roller.userData.runningGear = true;
  const root = new THREE.Group(); root.add(discs, ring, arm, drum, camo, tires, roller);
  paint.color.setHex(0x33382c); // a family retinted the shared paint in place after the bake
  const touched = normalizeTankAppearance(root, { wheelPaint: paint, wheelPaintShade: shade });
  assert.ok(touched >= 6, `re-seated and normalised (${touched})`);
  assert.equal(discs.material, paint, 'the wheelHex clone on the discs re-seats onto the hull paint');
  assert.equal(drum.material, paint, 'the clone on an end-wheel body re-seats onto the hull paint');
  assert.equal(ring.material, paint, 'fitting paint under a dish role re-seats onto the hull paint');
  assert.equal(arm.material, shade, 'a paint clone on the suspension arms re-seats onto the shade');
  assert.equal(camo.material, mapped, 'camouflage-mapped wheel paint is its own material and stays');
  assert.equal(roller.material[1], paint, 'a material-array slot re-seats too');
  assert.equal(roller.material[0], tire, 'the rubber slot is untouched');
  assert.equal(paint.color.getHex(), 0x545b48, 'the in-place retint returns to the stamped scheme tone');
  assert.equal(tire.color.getHex(), RUNNING_GEAR_PALETTE.tireRubber, 'tires snap to the fleet rubber');
  // the release audit reads the same tree clean
  const issues = auditTankWheelQuality(root).issues.filter((issue) => String(issue.code).startsWith('running-gear-'));
  assert.deepEqual(issues, [], `no finish issues after normalisation: ${JSON.stringify(issues)}`);
  // and flags what the normaliser is not given: an off-scheme paint, an untagged dish, a pale tire
  const stray = new THREE.Group();
  const offScheme = paint.clone(); offScheme.color.setHex(0x697250);
  stray.add(mesh(offScheme, 'wheelDish', true), mesh(new THREE.MeshStandardMaterial({ color: 0x4a5040 }), 'wheelDish'),
    mesh(tagVehicleMaterial(new THREE.MeshStandardMaterial({ color: 0x777777 }), 'tireRubber'), 'wheelTire', true));
  const codes = auditTankWheelQuality(stray).issues.map((issue) => issue.code).sort();
  assert.deepEqual(codes.filter((c) => c.startsWith('running-gear-')),
    ['running-gear-finish-off-palette', 'running-gear-finish-role', 'running-gear-paint-off-scheme', 'running-gear-paint-outside-window'],
    `the audit names each finish fault: ${codes}`);
}

// ---- built hulls, both tiers: every family that used to retone its wheels now audits clean
const SAMPLE = [
  't62mv1', 't90ms', 't90', 'type59',          // per-hull wheelHex dishes (the saturated pale olive the owner saw)
  'challenger2', 'chieftain5', 'centurion3',   // UK/Challenger wheelTone/drumTone/ringMat kits
  'merkava4b', 'merkava3d', 'merkava4_x',      // Merkava darkDish/darkDrum and the fitting-paint dish rings
  'leo2a6', 'leo2a5', 'm1a2_x', 'abramsx',     // Leopard wornDish/wornDrum + cover discs, Abrams wornDrum
  'strv103', 'jpz_e100', 'bmpt_terminator2', 't72b3m', 't90m_proryv', // casemate / in-place retints
  'kv2', 'tiger1', 'type74', 'fv510', 'leclerc_x', 'namer_ifv', 'k21_x', 'm47_patton', // period, donors, mapped paint
];
let audited = 0;
for (const id of SAMPLE) {
  for (const quality of ['high', 'low']) {
    const tank = createTank(id, null, { proceduralOnly: true, quality, geometryReceipt: true, batchStatic: false });
    try {
      const issues = auditTankWheelQuality(tank.root).issues.filter((issue) => String(issue.code).startsWith('running-gear-'));
      assert.deepEqual(issues, [], `${id} ${quality}: ${JSON.stringify(issues.slice(0, 4))}`);
      // one scheme wheel paint per hull: every wheelPaint-tagged running-gear material shares two colours at most
      const paints = new Set();
      tank.root.traverse((object) => {
        if (object.userData?.runningGear !== true && object.userData?.dynamicWheelFace !== true) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) if (material?.userData?.appearanceRole === 'wheelPaint' && !material.map) paints.add(material.color.getHex());
      });
      assert.ok(paints.size <= 2, `${id} ${quality}: one paint and its shade at most (${[...paints].map((h) => h.toString(16))})`);
      audited++;
    } finally { tank.dispose?.(); }
  }
}
console.log(`runningGearFinish.selftest: ${RUNNING_GEAR_FINISH_RULES.length} finish rules, normaliser re-seat verified, ${audited} hull builds (${SAMPLE.length} hulls x HIGH/LOW) audit clean`);
