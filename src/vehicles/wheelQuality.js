import { WHEEL_PATTERN_DEFINITIONS } from './wheelPatterns.js';

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
  const patternIds = new Set(receipts.map((receipt) => receipt?.id).filter(Boolean));
  let roadDiscs = 0;
  let endBodies = 0;
  let returnRollerParts = 0;

  if (!receipts.length) issues.push({ code: 'missing-wheel-pattern-receipt' });
  for (const receipt of receipts) {
    if (!WHEEL_PATTERN_DEFINITIONS[receipt?.id]) {
      issues.push({ code: 'unknown-wheel-pattern', pattern: receipt?.id || null });
    }
    if (!Number.isInteger(receipt?.stations) || receipt.stations < 2) {
      issues.push({ code: 'invalid-road-wheel-stations', pattern: receipt?.id || null });
    }
  }

  root?.traverse?.((object) => {
    if (!object?.isMesh && !object?.isInstancedMesh) return;
    const name = object.name || '';
    const isWheelPart = ROAD_WHEEL_NAMES.has(name)
      || name === 'gearEndWheelBody'
      || name === 'gearEndWheelHardware'
      || name.startsWith('gearReturnRoller')
      || name.startsWith('gearRoadWheelDetail');
    if (!isWheelPart) return;

    const pattern = object.userData?.wheelPattern;
    if (!WHEEL_PATTERN_DEFINITIONS[pattern]) {
      issues.push({ code: 'wheel-part-missing-pattern', object: name, pattern: pattern || null });
    } else if (!patternIds.has(pattern)) {
      issues.push({ code: 'wheel-part-pattern-without-receipt', object: name, pattern });
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
  });

  if (!roadDiscs) issues.push({ code: 'missing-road-wheel-discs' });
  if (endBodies < 4) issues.push({ code: 'missing-sprocket-or-idler-bodies', count: endBodies });
  if (returnRollerParts === 1) issues.push({ code: 'single-material-return-rollers' });

  return {
    version: 1,
    issues,
    patterns: [...patternIds],
    receipts: receipts.map((receipt) => ({ ...receipt })),
    parts: { roadDiscs, endBodies, returnRollerParts },
  };
}
