import type { BufferGeometry, Material, Object3D } from 'three';
import type { RuntimeValue } from '../runtimeTypes.ts';
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
  [key: string]: RuntimeValue;
}

interface RunningGearReceipt {
  unitId?: RunningGearUnitId;
  wheelZs?: readonly number[];
  suspensionLinkCount?: number;
  suspensionJointCount?: number;
  suspensionArmProfile?: string;
  suspensionPlacement?: string;
  [key: string]: RuntimeValue;
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
  [key: string]: RuntimeValue;
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

function isWheelPatternId(value: RuntimeValue): value is WheelPatternId {
  return typeof value === 'string' && value in WHEEL_PATTERN_DEFINITIONS;
}

function isSuspensionPatternId(value: RuntimeValue): value is SuspensionPatternId {
  return typeof value === 'string' && value in SUSPENSION_PATTERN_DEFINITIONS;
}

function materialAppearanceRole(material: Material): RuntimeValue {
  return (material.userData as Readonly<Record<string, RuntimeValue>> | undefined)?.appearanceRole;
}

interface WheelAuditCounters {
  roadDiscs: number;
  endBodies: number;
  returnRollerParts: number;
  suspensionArms: number;
  suspensionJoints: number;
  readonly activeRunningGearUnits: Set<RunningGearUnitId>;
  readonly suspensionArmsByUnit: Map<RunningGearUnitId, number>;
  readonly suspensionJointsByUnit: Map<RunningGearUnitId, number>;
  readonly receiptByUnit: Map<RunningGearUnitId, RunningGearReceipt>;
}

function collectWheelPatternIds(receipts: readonly WheelPatternReceipt[]): Set<WheelPatternId> {
  const patternIds = new Set<WheelPatternId>();
  for (const receipt of receipts) {
    if (isWheelPatternId(receipt.id)) patternIds.add(receipt.id);
  }
  return patternIds;
}

function auditWheelPatternReceipts(
  receipts: readonly WheelPatternReceipt[],
  issues: WheelQualityIssue[],
): void {
  if (!receipts.length) issues.push({ code: 'missing-wheel-pattern-receipt' });
  for (const receipt of receipts) {
    if (!isWheelPatternId(receipt.id)) {
      issues.push({ code: 'unknown-wheel-pattern', pattern: receipt.id || null });
    }
    if (!Number.isInteger(receipt.stations) || (receipt.stations ?? 0) < 2) {
      issues.push({ code: 'invalid-road-wheel-stations', pattern: receipt.id || null });
    }
  }
}

function auditRunningGearReceipts(
  receipts: readonly RunningGearReceipt[],
  issues: WheelQualityIssue[],
): void {
  for (const receipt of receipts) {
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
}

function createWheelAuditCounters(
  runningGearReceipts: readonly RunningGearReceipt[],
): WheelAuditCounters {
  return {
    roadDiscs: 0,
    endBodies: 0,
    returnRollerParts: 0,
    suspensionArms: 0,
    suspensionJoints: 0,
    activeRunningGearUnits: new Set<RunningGearUnitId>(),
    suspensionArmsByUnit: new Map<RunningGearUnitId, number>(),
    suspensionJointsByUnit: new Map<RunningGearUnitId, number>(),
    receiptByUnit: new Map<RunningGearUnitId, RunningGearReceipt>(
      runningGearReceipts.map((receipt) => [receipt.unitId, receipt]),
    ),
  };
}

function isWheelPartName(name: string): boolean {
  return ROAD_WHEEL_NAMES.has(name)
    || name === 'gearEndWheelBody'
    || name === 'gearEndWheelHardware'
    || name === 'gearSuspensionLinks'
    || name === 'gearSuspensionJointBosses'
    || name.startsWith('gearReturnRoller')
    || name.startsWith('gearRoadWheelDetail');
}

function auditWheelPartPattern(
  name: string,
  objectData: RunningGearObjectData,
  patternIds: ReadonlySet<WheelPatternId>,
  issues: WheelQualityIssue[],
): void {
  if (name === 'gearSuspensionLinks' || name === 'gearSuspensionJointBosses') return;
  const pattern = objectData.wheelPattern;
  if (!isWheelPatternId(pattern)) {
    issues.push({ code: 'wheel-part-missing-pattern', object: name, pattern: pattern || null });
  } else if (!patternIds.has(pattern)) {
    issues.push({ code: 'wheel-part-pattern-without-receipt', object: name, pattern });
  }
}

function auditRoadWheelDiscs(
  object: Object3D,
  name: string,
  counters: WheelAuditCounters,
  issues: WheelQualityIssue[],
): void {
  if (name !== 'gearRoadWheelDiscs' && name !== 'gearRoadWheelDiscsRecessed') return;
  counters.roadDiscs++;
  const roles = materialsOf(object).map(materialAppearanceRole);
  if (!roles.every((role) => role === 'wheelPaint')) {
    issues.push({ code: 'road-wheel-not-camouflage-aware', object: name, roles });
  }
}

function auditSuspensionPattern(
  name: string,
  objectData: RunningGearObjectData,
  issues: WheelQualityIssue[],
): void {
  if (name !== 'gearSuspensionLinks' && name !== 'gearSuspensionJointBosses') return;
  const pattern = objectData.suspensionPattern;
  if (!isSuspensionPatternId(pattern)) {
    issues.push({ code: 'suspension-part-missing-pattern', object: name, pattern: pattern || null });
  }
  if (objectData.suspensionPlacement !== 'inboard-behind-road-wheel') {
    issues.push({ code: 'suspension-part-not-behind-wheel', object: name });
  }
}

function auditSuspensionClearance(
  name: string,
  objectData: RunningGearObjectData,
  issues: WheelQualityIssue[],
): void {
  const inner = objectData.wheelInnerAbsX;
  const outboard = objectData.assemblyOutboardAbsX;
  const clearance = objectData.wheelClearanceM;
  for (const side of ['left', 'right'] as const) {
    const innerSide = inner?.[side];
    const outboardSide = outboard?.[side];
    if (typeof innerSide === 'number' && Number.isFinite(innerSide)
      && typeof outboardSide === 'number' && Number.isFinite(outboardSide)
      && typeof clearance === 'number' && Number.isFinite(clearance)
      && outboardSide <= innerSide - clearance + 1e-6) continue;
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

function auditSuspensionLinks(
  renderObject: RenderObject,
  name: string,
  objectData: RunningGearObjectData,
  counters: WheelAuditCounters,
  issues: WheelQualityIssue[],
): void {
  if (name !== 'gearSuspensionLinks') return;
  const count = renderObject.count || 0;
  counters.suspensionArms += count;
  counters.suspensionArmsByUnit.set(
    objectData.runningGearUnitId,
    (counters.suspensionArmsByUnit.get(objectData.runningGearUnitId) || 0) + count,
  );
  if (renderObject.geometry?.type === 'BoxGeometry'
      || objectData.suspensionGeometryProfile !== 'tapered-forged-arm-v1') {
    issues.push({ code: 'prismatic-suspension-arm', object: name });
  }
  auditSuspensionClearance(name, objectData, issues);
}

function auditSuspensionJoints(
  renderObject: RenderObject,
  name: string,
  objectData: RunningGearObjectData,
  counters: WheelAuditCounters,
  issues: WheelQualityIssue[],
): void {
  if (name !== 'gearSuspensionJointBosses') return;
  const count = renderObject.count || 0;
  counters.suspensionJoints += count;
  counters.suspensionJointsByUnit.set(
    objectData.runningGearUnitId,
    (counters.suspensionJointsByUnit.get(objectData.runningGearUnitId) || 0) + count,
  );
  if (objectData.suspensionGeometryProfile !== 'stepped-forged-boss-v1') {
    issues.push({ code: 'unshaped-suspension-joint', object: name });
  }
}

function auditWheelObject(
  object: Object3D,
  patternIds: ReadonlySet<WheelPatternId>,
  counters: WheelAuditCounters,
  issues: WheelQualityIssue[],
): void {
  const renderObject = object as RenderObject;
  if (!renderObject.isMesh && !renderObject.isInstancedMesh) return;
  const objectData = object.userData as RunningGearObjectData;
  const name = object.name || '';
  if (!isWheelPartName(name)) return;
  if (ROAD_WHEEL_NAMES.has(name)) counters.activeRunningGearUnits.add(objectData.runningGearUnitId);
  auditWheelPartPattern(name, objectData, patternIds, issues);
  auditRoadWheelDiscs(object, name, counters, issues);
  if (name === 'gearEndWheelBody') counters.endBodies++;
  if (name.startsWith('gearReturnRoller')) counters.returnRollerParts++;
  auditSuspensionPattern(name, objectData, issues);
  auditSuspensionLinks(renderObject, name, objectData, counters, issues);
  auditSuspensionJoints(renderObject, name, objectData, counters, issues);
}

function auditRunningGearUnitTotals(
  counters: WheelAuditCounters,
  issues: WheelQualityIssue[],
): { expectedSuspensionArms: number; expectedSuspensionJoints: number } {
  let expectedSuspensionArms = 0;
  let expectedSuspensionJoints = 0;
  for (const unitId of counters.activeRunningGearUnits) {
    const receipt = counters.receiptByUnit.get(unitId);
    if (!receipt) {
      issues.push({ code: 'active-running-gear-missing-receipt', unitId: unitId ?? null });
      continue;
    }
    expectedSuspensionArms += receipt.suspensionLinkCount || 0;
    expectedSuspensionJoints += receipt.suspensionJointCount || 0;
    if ((counters.suspensionArmsByUnit.get(unitId) || 0) !== receipt.suspensionLinkCount) {
      issues.push({
        code: 'running-gear-unit-arm-mismatch',
        unitId,
        expected: receipt.suspensionLinkCount,
        actual: counters.suspensionArmsByUnit.get(unitId) || 0,
      });
    }
    if ((counters.suspensionJointsByUnit.get(unitId) || 0) !== receipt.suspensionJointCount) {
      issues.push({
        code: 'running-gear-unit-joint-mismatch',
        unitId,
        expected: receipt.suspensionJointCount,
        actual: counters.suspensionJointsByUnit.get(unitId) || 0,
      });
    }
  }
  return { expectedSuspensionArms, expectedSuspensionJoints };
}

function auditWheelPartTotals(counters: WheelAuditCounters, issues: WheelQualityIssue[]): void {
  if (!counters.roadDiscs) issues.push({ code: 'missing-road-wheel-discs' });
  if (counters.endBodies < 4) {
    issues.push({ code: 'missing-sprocket-or-idler-bodies', count: counters.endBodies });
  }
  if (counters.returnRollerParts === 1) issues.push({ code: 'single-material-return-rollers' });
  const expected = auditRunningGearUnitTotals(counters, issues);
  if (counters.suspensionArms !== expected.expectedSuspensionArms) {
    issues.push({
      code: 'suspension-arm-instance-mismatch',
      expected: expected.expectedSuspensionArms,
      actual: counters.suspensionArms,
    });
  }
  if (counters.suspensionJoints !== expected.expectedSuspensionJoints) {
    issues.push({
      code: 'suspension-joint-instance-mismatch',
      expected: expected.expectedSuspensionJoints,
      actual: counters.suspensionJoints,
    });
  }
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
  const patternIds = collectWheelPatternIds(receipts);
  const counters = createWheelAuditCounters(runningGearReceipts);
  auditWheelPatternReceipts(receipts, issues);
  auditRunningGearReceipts(runningGearReceipts, issues);

  root?.traverse((object) => auditWheelObject(object, patternIds, counters, issues));
  auditWheelPartTotals(counters, issues);

  return {
    version: 1,
    issues,
    patterns: [...patternIds],
    receipts: receipts.map((receipt) => ({ ...receipt })),
    parts: {
      roadDiscs: counters.roadDiscs,
      endBodies: counters.endBodies,
      returnRollerParts: counters.returnRollerParts,
      suspensionArms: counters.suspensionArms,
      suspensionJoints: counters.suspensionJoints,
    },
  };
}
