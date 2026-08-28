import { WHEEL_PATTERN_DEFINITIONS } from './wheelPatterns.ts';
import { SUSPENSION_PATTERN_DEFINITIONS } from './suspensionPatterns.ts';

const ROAD_WHEEL_NAMES = new Set([
  'gearRoadWheelTires',
  'gearRoadWheelDiscs',
  'gearRoadWheelDiscsRecessed',
  'gearRoadWheelInsets',
]);

function materialsOf(object) {
  if (!object?.material) return [];
  return Array.isArray(object.material) ? object.material.filter(Boolean) : [object.material];
}

/** Release-facing audit of the shared wheel-family contract. */
export function auditTankWheelQuality(root) {
  const issues = [];
  const hull = root?.getObjectByName?.('rig_hull');
  const receipts = hull?.userData?.wheelPatternReceipts || [];
  const runningGearReceipts = hull?.userData?.runningGearReceipts || [];
  const patternIds = new Set(receipts.map((receipt) => receipt?.id).filter(Boolean));
  let roadDiscs = 0;
  let endBodies = 0;
  let returnRollerParts = 0;
  let suspensionArms = 0;
  let suspensionJoints = 0;
  const activeRunningGearUnits = new Set();
  const suspensionArmsByUnit = new Map();
  const suspensionJointsByUnit = new Map();
  const receiptByUnit = new Map(runningGearReceipts.map((receipt) => [receipt.unitId, receipt]));

  if (!receipts.length) issues.push({ code: 'missing-wheel-pattern-receipt' });
  for (const receipt of receipts) {
    if (!WHEEL_PATTERN_DEFINITIONS[receipt?.id]) {
      issues.push({ code: 'unknown-wheel-pattern', pattern: receipt?.id || null });
    }
    if (!Number.isInteger(receipt?.stations) || receipt.stations < 2) {
      issues.push({ code: 'invalid-road-wheel-stations', pattern: receipt?.id || null });
    }
  }
  for (const receipt of runningGearReceipts) {
    const expectedLinks = (receipt?.wheelZs?.length || 0) * 2;
    if (receipt?.suspensionLinkCount !== expectedLinks) {
      issues.push({
        code: 'missing-suspension-arms',
        unitId: receipt?.unitId ?? null,
        expected: expectedLinks,
        actual: receipt?.suspensionLinkCount ?? null,
      });
    }
    if (receipt?.suspensionJointCount !== expectedLinks * 2) {
      issues.push({
        code: 'missing-suspension-joints',
        unitId: receipt?.unitId ?? null,
        expected: expectedLinks * 2,
        actual: receipt?.suspensionJointCount ?? null,
      });
    }
    if (receipt?.suspensionArmProfile !== 'tapered-forged-arm-v1') {
      issues.push({ code: 'unshaped-suspension-arm', unitId: receipt?.unitId ?? null });
    }
    if (receipt?.suspensionPlacement !== 'inboard-behind-road-wheel') {
      issues.push({ code: 'suspension-not-behind-wheel', unitId: receipt?.unitId ?? null });
    }
  }

  root?.traverse?.((object) => {
    if (!object?.isMesh && !object?.isInstancedMesh) return;
    const name = object.name || '';
    const isWheelPart = ROAD_WHEEL_NAMES.has(name)
      || name === 'gearEndWheelBody'
      || name === 'gearEndWheelHardware'
      || name === 'gearSuspensionLinks'
      || name === 'gearSuspensionJointBosses'
      || name.startsWith('gearReturnRoller')
      || name.startsWith('gearRoadWheelDetail');
    if (!isWheelPart) return;

    const isSuspensionPart = name === 'gearSuspensionLinks'
      || name === 'gearSuspensionJointBosses';
    if (ROAD_WHEEL_NAMES.has(name)) {
      activeRunningGearUnits.add(object.userData?.runningGearUnitId);
    }
    if (!isSuspensionPart) {
      const pattern = object.userData?.wheelPattern;
      if (!WHEEL_PATTERN_DEFINITIONS[pattern]) {
        issues.push({ code: 'wheel-part-missing-pattern', object: name, pattern: pattern || null });
      } else if (!patternIds.has(pattern)) {
        issues.push({ code: 'wheel-part-pattern-without-receipt', object: name, pattern });
      }
    }

    if (name === 'gearRoadWheelDiscs' || name === 'gearRoadWheelDiscsRecessed') {
      roadDiscs++;
      const roles = materialsOf(object).map((material) => material.userData?.appearanceRole);
      if (!roles.every((role) => role === 'wheelPaint')) {
        issues.push({ code: 'road-wheel-not-camouflage-aware', object: name, roles });
      }
    }
    if (name === 'gearEndWheelBody') endBodies++;
    if (name.startsWith('gearReturnRoller')) returnRollerParts++;

    if (name === 'gearSuspensionLinks' || name === 'gearSuspensionJointBosses') {
      const pattern = object.userData?.suspensionPattern;
      if (!SUSPENSION_PATTERN_DEFINITIONS[pattern]) {
        issues.push({
          code: 'suspension-part-missing-pattern',
          object: name,
          pattern: pattern || null,
        });
      }
      if (object.userData?.suspensionPlacement !== 'inboard-behind-road-wheel') {
        issues.push({ code: 'suspension-part-not-behind-wheel', object: name });
      }
    }
    if (name === 'gearSuspensionLinks') {
      suspensionArms += object.count || 0;
      suspensionArmsByUnit.set(
        object.userData?.runningGearUnitId,
        (suspensionArmsByUnit.get(object.userData?.runningGearUnitId) || 0)
          + (object.count || 0),
      );
      if (object.geometry?.type === 'BoxGeometry'
        || object.userData?.suspensionGeometryProfile !== 'tapered-forged-arm-v1') {
        issues.push({ code: 'prismatic-suspension-arm', object: name });
      }
      const inner = object.userData?.wheelInnerAbsX;
      const outboard = object.userData?.assemblyOutboardAbsX;
      const clearance = object.userData?.wheelClearanceM;
      for (const side of ['left', 'right']) {
        if (!Number.isFinite(inner?.[side]) || !Number.isFinite(outboard?.[side])
          || !Number.isFinite(clearance)
          || outboard[side] > inner[side] - clearance + 1e-6) {
          issues.push({
            code: 'suspension-outboard-of-wheel-back',
            object: name,
            side,
            inner: inner?.[side] ?? null,
            outboard: outboard?.[side] ?? null,
            clearance: clearance ?? null,
          });
        }
      }
    }
    if (name === 'gearSuspensionJointBosses') {
      suspensionJoints += object.count || 0;
      suspensionJointsByUnit.set(
        object.userData?.runningGearUnitId,
        (suspensionJointsByUnit.get(object.userData?.runningGearUnitId) || 0)
          + (object.count || 0),
      );
      if (object.userData?.suspensionGeometryProfile !== 'stepped-forged-boss-v1') {
        issues.push({ code: 'unshaped-suspension-joint', object: name });
      }
    }
  });

  if (!roadDiscs) issues.push({ code: 'missing-road-wheel-discs' });
  if (endBodies < 4) issues.push({ code: 'missing-sprocket-or-idler-bodies', count: endBodies });
  if (returnRollerParts === 1) issues.push({ code: 'single-material-return-rollers' });
  let expectedSuspensionArms = 0;
  let expectedSuspensionJoints = 0;
  for (const unitId of activeRunningGearUnits) {
    const receipt = receiptByUnit.get(unitId);
    if (!receipt) {
      issues.push({ code: 'active-running-gear-missing-receipt', unitId: unitId ?? null });
      continue;
    }
    expectedSuspensionArms += receipt.suspensionLinkCount || 0;
    expectedSuspensionJoints += receipt.suspensionJointCount || 0;
    if ((suspensionArmsByUnit.get(unitId) || 0) !== receipt.suspensionLinkCount) {
      issues.push({
        code: 'running-gear-unit-arm-mismatch',
        unitId,
        expected: receipt.suspensionLinkCount,
        actual: suspensionArmsByUnit.get(unitId) || 0,
      });
    }
    if ((suspensionJointsByUnit.get(unitId) || 0) !== receipt.suspensionJointCount) {
      issues.push({
        code: 'running-gear-unit-joint-mismatch',
        unitId,
        expected: receipt.suspensionJointCount,
        actual: suspensionJointsByUnit.get(unitId) || 0,
      });
    }
  }
  if (suspensionArms !== expectedSuspensionArms) {
    issues.push({
      code: 'suspension-arm-instance-mismatch',
      expected: expectedSuspensionArms,
      actual: suspensionArms,
    });
  }
  if (suspensionJoints !== expectedSuspensionJoints) {
    issues.push({
      code: 'suspension-joint-instance-mismatch',
      expected: expectedSuspensionJoints,
      actual: suspensionJoints,
    });
  }

  return {
    version: 1,
    issues,
    patterns: [...patternIds],
    receipts: receipts.map((receipt) => ({ ...receipt })),
    parts: {
      roadDiscs, endBodies, returnRollerParts,
      suspensionArms, suspensionJoints,
    },
  };
}
