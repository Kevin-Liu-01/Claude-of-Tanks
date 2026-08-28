import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';

const EPSILON = 1e-6;
const CASES = Object.freeze({
  t90: Object.freeze({ variant: 't90', expectedParts: 52 }),
  t90sm: Object.freeze({ variant: 't90sm', expectedParts: 52 }),
  t90a_vladimir: Object.freeze({ variant: 't90a_vladimir', expectedParts: 50 }),
});

for (const [id, expected] of Object.entries(CASES)) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });

  try {
    const hull = tank.root.getObjectByName('rig_hull');
    const cage = hull?.userData.t90RearQuarterCageReceipt;
    assert.ok(cage, `${id}: publishes its rear-quarter cage receipt`);
    assert.equal(cage.variant, expected.variant,
      `${id}: owns a variant-specific cage rather than Tagil geometry`);
    assert.ok(cage.replacedFraction >= 0.24 && cage.replacedFraction <= 0.26,
      `${id}: cage replaces the rear quarter of the original skirt course`);
    assert.ok(cage.cageZRange[0] < cage.solidSkirtRearZ,
      `${id}: cage extends through the removed rear skirt range`);
    assert.ok(cage.solidCageOverlapM >= 0.075,
      `${id}: cage overlaps the remaining solid skirt at its front frame`);
    assert.ok(cage.xOuter > cage.xInner && cage.standoffM >= 0.15,
      `${id}: cage stands away from the hull on physical brackets`);
    assert.equal(cage.sides, 2, `${id}: cage is mirrored on both sides`);
    assert.equal(cage.attached, true, `${id}: cage publishes an attached load path`);

    const finish = tank.root.userData.eraFinishReceipt;
    assert.ok(finish?.visualSectors.includes(cage.sector),
      `${id}: cage uses the external-armor finish path`);
    assert.equal(finish.partsBySector[cage.sector], expected.expectedParts,
      `${id}: cage retains its complete slat and bracket topology`);
    assert.ok(tank.root.getObjectByName('hullExternalArmor')?.isMesh,
      `${id}: cage remains outside the base hull hit shell`);

    if (id !== 't90') continue;
    const turret = tank.root.getObjectByName('rig_turret');
    const fit = turret?.userData.t90TurretProtectionFitReceipt;
    assert.ok(fit, 't90: publishes turret ERA and dazzler fit receipt');
    assert.equal(fit.supersededExternalEraCleared, true,
      't90: obsolete donor ERA is cleared before the final package is authored');
    assert.equal(fit.canonicalEraSector, 't90-k5-turret-era');
    assert.equal(fit.chevronEra.rowsPerCheek, 2,
      't90: two joined carrier rows form the K-5 side-view chevron');
    assert.equal(fit.chevronEra.carriersPerRow, 2,
      't90: every row retains inner and outer swept carriers');
    assert.equal(fit.chevronEra.tilesTotal, 24,
      't90: three exact-surface tiles occupy every carrier face');
    assert.equal(fit.chevronEra.exactSurfaceOffsets, true,
      't90: each cassette face is derived from its carrier plane');
    assert.equal(fit.shtoraClearsMantlet, true,
      't90: both enlarged Shtora heads clear the mantlet');
    assert.ok(fit.mantletClearanceM >= 0.05,
      't90: Shtora retains visible inner clearance from the mantlet');
    assert.ok(fit.shtoraEyeX >= 0.78,
      't90: Shtora pair is moved outward to the cheek shoulders');
  } finally {
    tank.dispose();
  }
}

console.log('t90RearCageEraFit.selftest: rear cages, RU-417 ERA and Shtora are physically seated');
