import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const EPSILON = 1e-6;
// 2026-10-30 (lane t90-family-266): the obr. 1992 and the T-90A carry no cage (their photographs show a full-length
// skirt with K-5 panels); every mark on the family chassis's Relikt fit carries the shared cage over the final drive,
// the T-90M (AM II) over the rear half of the hull side.
const CASES = Object.freeze({
  t90sm_2013: Object.freeze({ variant: 't90sm_2013', expectedParts: 52, fraction: [0.27, 0.30] }),
  t90ms_2011: Object.freeze({ variant: 't90ms_2011', expectedParts: 52, fraction: [0.27, 0.30] }),
  t90am: Object.freeze({ variant: 't90am', expectedParts: 52, fraction: [0.27, 0.30] }),
  t90m_proryv: Object.freeze({ variant: 't90m_proryv', expectedParts: 52, fraction: [0.49, 0.52] }),
  bmpt_t90: Object.freeze({ variant: 'bmpt_t90', expectedParts: 52, fraction: [0.27, 0.30] }),
});

for (const id of ['t90_1992', 't90a_2004', 't90a_2006']) {
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
  try {
    assert.equal(tank.root.getObjectByName('rig_hull')?.userData.t90RearQuarterCageReceipt, undefined,
      `${id}: carries no rear-quarter cage (full-length K-5 skirt)`);
  } finally {
    tank.dispose();
  }
}

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
    assert.ok(cage.replacedFraction >= expected.fraction[0] && cage.replacedFraction <= expected.fraction[1],
      `${id}: cage replaces its share of the original skirt course (${cage.replacedFraction.toFixed(3)})`);
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

  } finally {
    tank.dispose();
  }
}

{
  const tank = createTank('t90_1992', null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
  try {
    const fit = tank.root.getObjectByName('rig_turret')?.userData.t90TurretProtectionFitReceipt;
    assert.ok(fit, 't90_1992: publishes the cast turret ERA and dazzler fit receipt');
    assert.equal(fit.canonicalEraSector, 't90-k5-turret-era');
    assert.equal(fit.chevronEra.rowsPerCheek, 2, 't90_1992: two joined carrier rows form the K-5 side-view chevron');
    assert.equal(fit.chevronEra.carriersPerRow, 2, 't90_1992: every row retains inner and outer swept carriers');
    assert.equal(fit.chevronEra.tilesTotal, 24, 't90_1992: three exact-surface tiles occupy every carrier face');
    assert.equal(fit.chevronEra.exactSurfaceOffsets, true, 't90_1992: each cassette face is derived from its carrier plane');
    assert.equal(fit.shtoraClearsMantlet, true, 't90_1992: both Shtora heads clear the mantlet');
    assert.ok(fit.mantletClearanceM >= 0.05, 't90_1992: Shtora retains visible inner clearance from the mantlet');
    assert.ok(fit.shtoraChevronDepthClearanceM >= 0.04,
      `t90_1992: both Shtora lenses stand at least 40 mm ahead of the K-5 tile faces (${fit.shtoraChevronDepthClearanceM.toFixed(3)})`);
  } finally {
    tank.dispose();
  }
}

console.log('t90RearCageEraFit.selftest: rear cages, the cast turret K-5 and the Shtora are physically seated');
