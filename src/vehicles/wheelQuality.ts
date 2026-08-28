import type { BufferGeometry, Material, Object3D } from 'three';
import {
  WHEEL_PATTERN_DEFINITIONS,
  type WheelPatternId,
} from './wheelPatterns.ts';
import {
  SUSPENSION_PATTERN_DEFINITIONS,
  type SuspensionPatternId,
} from './suspensionPatterns.ts';

type RunningGearUnitId = string | number | undefined;
type Side = 'left' | 'right';

interface WheelPatternReceipt {
  id?: string;
  stations?: number;
  [key: string]: unknown;
}

interface RunningGearReceipt {
  unitId?: RunningGearUnitId;
  wheelZs?: readonly number[];
  suspensionLinkCount?: number;
  suspensionJointCount?: number;
  suspensionArmProfile?: string;
  suspensionPlacement?: string;
  [key: string]: unknown;
}

interface HullReceiptData {
  wheelPatternReceipts?: WheelPatternReceipt[];
  runningGearReceipts?: RunningGearReceipt[];
}

interface RunningGearObjectData {
  assemblyOutboardAbsX?: Partial<Record<Side, number>>;
  appearanceRole?: string;
  runningGearUnitId?: RunningGearUnitId;
  suspensionGeometryProfile?: string;
  suspensionPattern?: string;
  suspensionPlacement?: string;
  wheelClearanceM?: number;
  wheelInnerAbsX?: Partial<Record<Side, number>>;
  wheelPattern?: string;
}

type RenderObject = Object3D & {
  count?: number;
  geometry?: BufferGeometry;
  isInstancedMesh?: boolean;
  isMesh?: boolean;
  material?: Material | Material[];
};

export interface WheelQualityIssue {
  code: string;
  [key: string]: unknown;
}

export interface WheelQualityAudit {
  version: 1;
  issues: WheelQualityIssue[];
  patterns: WheelPatternId[];
  receipts: WheelPatternReceipt[];
  parts: {
    roadDiscs: number;
    endBodies: number;
    returnRollerParts: number;
    suspensionArms: number;
    suspensionJoints: number;
  };
}

const ROAD_WHEEL_NAMES = new Set([
  'gearRoadWheelTires',
  'gearRoadWheelDiscs',
  'gearRoadWheelDiscsRecessed',
  'gearRoadWheelInsets',
]);

function materialsOf(object: Object3D): Material[] {
  const material = (object as RenderObject).material;
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

function isWheelPatternId(value: unknown): value is WheelPatternId {
  return typeof value === 'string' && value in WHEEL_PATTERN_DEFINITIONS;
}

function isSuspensionPatternId(value: unknown): value is SuspensionPatternId {
  return typeof value === 'string' && value in SUSPENSION_PATTERN_DEFINITIONS;
}

function materialAppearanceRole(material: Material): unknown {
  return (material.userData as Readonly<Record<string, unknown>> | undefined)?.appearanceRole;
}

/** Release-facing audit of the shared wheel-family contract. */
export function auditTankWheelQuality(root: Object3D | null | undefined): WheelQualityAudit {
  const issues: WheelQualityIssue[] = [];
  const hull = root?.getObjectByName('rig_hull');
  const hullData = (hull?.userData || {}) as HullReceiptData;
  const receipts = Array.isArray(hullData.wheelPatternReceipts)
    ? hullData.wheelPatternReceipts
    : [];
  const runningGearReceipts = Array.isArray(hullData.runningGearReceipts)
    ? hullData.runningGearReceipts
    : [];
  const patternIds = new Set<WheelPatternId>();
  for (const receipt of receipts) {
    if (isWheelPatternId(receipt.id)) patternIds.add(receipt.id);
  }
  let roadDiscs = 0;
  let endBodies = 0;
  let returnRollerParts = 0;
  let suspensionArms = 0;
  let suspensionJoints = 0;
  const activeRunningGearUnits = new Set<RunningGearUnitId>();
  const suspensionArmsByUnit = new Map<RunningGearUnitId, number>();
  const suspensionJointsByUnit = new Map<RunningGearUnitId, number>();
  const receiptByUnit = new Map<RunningGearUnitId, RunningGearReceipt>(
    runningGearReceipts.map((receipt) => [receipt.unitId, receipt]),
  );

  if (!receipts.length) issues.push({ code: 'missing-wheel-pattern-receipt' });
  for (const receipt of receipts) {
    if (!isWheelPatternId(receipt.id)) {
      issues.push({ code: 'unknown-wheel-pattern', pattern: receipt.id || null });
    }
    if (!Number.isInteger(receipt.stations) || (receipt.stations ?? 0) < 2) {
      issues.push({ code: 'invalid-road-wheel-stations', pattern: receipt.id || null });
    }
  }
  for (const receipt of runningGearReceipts) {
    const expectedLinks = (receipt.wheelZs?.length || 0) * 2;
    if (receipt.suspensionLinkCount !== expectedLinks) {
      issues.push({
        code: 'missing-suspension-arms',
        unitId: receipt.unitId ?? null,
        expected: expectedLinks,
        actual: receipt.suspensionLinkCount ?? null,
      });
    }
    if (receipt.suspensionJointCount !== expectedLinks * 2) {
      issues.push({
        code: 'missing-suspension-joints',
        unitId: receipt.unitId ?? null,
        expected: expectedLinks * 2,
        actual: receipt.suspensionJointCount ?? null,
      });
    }
    if (receipt.suspensionArmProfile !== 'tapered-forged-arm-v1') {
      issues.push({ code: 'unshaped-suspension-arm', unitId: receipt.unitId ?? null });
    }
    if (receipt.suspensionPlacement !== 'inboard-behind-road-wheel') {
      issues.push({ code: 'suspension-not-behind-wheel', unitId: receipt.unitId ?? null });
    }
  }

  root?.traverse((object) => {
    const renderObject = object as RenderObject;
    if (!renderObject.isMesh && !renderObject.isInstancedMesh) return;
    const objectData = object.userData as RunningGearObjectData;
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
      activeRunningGearUnits.add(objectData.runningGearUnitId);
    }
    if (!isSuspensionPart) {
      const pattern = objectData.wheelPattern;
      if (!isWheelPatternId(pattern)) {
        issues.push({ code: 'wheel-part-missing-pattern', object: name, pattern: pattern || null });
      } else if (!patternIds.has(pattern)) {
        issues.push({ code: 'wheel-part-pattern-without-receipt', object: name, pattern });
      }
    }

    if (name === 'gearRoadWheelDiscs' || name === 'gearRoadWheelDiscsRecessed') {
      roadDiscs++;
      const roles = materialsOf(object).map(materialAppearanceRole);
      if (!roles.every((role) => role === 'wheelPaint')) {
        issues.push({ code: 'road-wheel-not-camouflage-aware', object: name, roles });
      }
    }
    if (name === 'gearEndWheelBody') endBodies++;
    if (name.startsWith('gearReturnRoller')) returnRollerParts++;

    if (name === 'gearSuspensionLinks' || name === 'gearSuspensionJointBosses') {
      const pattern = objectData.suspensionPattern;
      if (!isSuspensionPatternId(pattern)) {
        issues.push({
          code: 'suspension-part-missing-pattern',
          object: name,
          pattern: pattern || null,
        });
      }
      if (objectData.suspensionPlacement !== 'inboard-behind-road-wheel') {
        issues.push({ code: 'suspension-part-not-behind-wheel', object: name });
      }
    }
    if (name === 'gearSuspensionLinks') {
      const count = renderObject.count || 0;
      suspensionArms += count;
      suspensionArmsByUnit.set(
        objectData.runningGearUnitId,
        (suspensionArmsByUnit.get(objectData.runningGearUnitId) || 0) + count,
      );
      if (renderObject.geometry?.type === 'BoxGeometry'
        || objectData.suspensionGeometryProfile !== 'tapered-forged-arm-v1') {
        issues.push({ code: 'prismatic-suspension-arm', object: name });
      }
      const inner = objectData.wheelInnerAbsX;
      const outboard = objectData.assemblyOutboardAbsX;
      const clearance = objectData.wheelClearanceM;
      for (const side of ['left', 'right'] as const) {
        const innerSide = inner?.[side];
        const outboardSide = outboard?.[side];
        if (typeof innerSide !== 'number' || !Number.isFinite(innerSide)
          || typeof outboardSide !== 'number' || !Number.isFinite(outboardSide)
          || typeof clearance !== 'number' || !Number.isFinite(clearance)
          || outboardSide > innerSide - clearance + 1e-6) {
          issues.push({
            code: 'suspension-outboard-of-wheel-back',
            object: name,
            side,
            inner: innerSide ?? null,
            outboard: outboardSide ?? null,
            clearance: clearance ?? null,
          });
        }
      }
    }
    if (name === 'gearSuspensionJointBosses') {
      const count = renderObject.count || 0;
      suspensionJoints += count;
      suspensionJointsByUnit.set(
        objectData.runningGearUnitId,
        (suspensionJointsByUnit.get(objectData.runningGearUnitId) || 0) + count,
      );
      if (objectData.suspensionGeometryProfile !== 'stepped-forged-boss-v1') {
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
