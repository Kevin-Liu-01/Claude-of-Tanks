import type { BufferGeometry, Material, Object3D } from 'three';
import type { RuntimeValue } from '../runtimeTypes.ts';
import { measureSpatialArmClearance } from './suspensionClearance.ts';
import {
  WHEEL_PATTERN_DEFINITIONS,
  type WheelPatternId,
} from './wheelPatterns.ts';
import {
  SUSPENSION_PATTERN_DEFINITIONS,
  type SuspensionPatternId,
} from './suspensionPatterns.ts';
import { runningGearFinishRuleFor, withinRunningGearFinish } from './runningGearFinish.ts';
import { NATION_WHEEL_AXIAL_FIT } from './nationWheelConstructions.ts';

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

interface WheelQualityIssue {
  code: string;
  [key: string]: RuntimeValue;
}

interface WheelQualityAudit {
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

/** NATION WHEEL AXIAL FIT (round 40, owner 2026-09-22): a nation construction is drawn between 0.85 and 1.15 of its
 * donor's axial proportion, and the hull's own width bounds must ask for a fit inside that window — a clamped fit
 * means the hull's tire width, track width or donor choice is wrong, never the dish. */
function auditNationWheelAxialFit(receipt: WheelPatternReceipt, issues: WheelQualityIssue[]): void {
  const standard = receipt.nationStandard as { axialScale?: unknown; axialFitRequested?: unknown; donor?: unknown } | undefined;
  if (!standard || typeof standard !== 'object') return;
  const { axialScale, axialFitRequested } = standard;
  if (typeof axialScale !== 'number' || axialScale < NATION_WHEEL_AXIAL_FIT.min - 1e-6 || axialScale > NATION_WHEEL_AXIAL_FIT.max + 1e-6) {
    issues.push({ code: 'nation-wheel-axial-fit-outside-window', donor: (standard.donor as RuntimeValue) ?? null, axialScale: (axialScale as RuntimeValue) ?? null });
  }
  if (typeof axialFitRequested !== 'number' || Math.abs(axialFitRequested - (axialScale as number)) > 1e-3) {
    issues.push({ code: 'nation-wheel-axial-fit-clamped', donor: (standard.donor as RuntimeValue) ?? null,
      axialScale: (axialScale as RuntimeValue) ?? null, axialFitRequested: (axialFitRequested as RuntimeValue) ?? null });
  }
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
    auditNationWheelAxialFit(receipt, issues);
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
  object: Object3D,
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
    const valid = typeof innerSide === 'number' && Number.isFinite(innerSide)
      && typeof outboardSide === 'number' && Number.isFinite(outboardSide)
      && typeof clearance === 'number' && Number.isFinite(clearance) && clearance > 0;
    if (valid && outboardSide! <= innerSide! - clearance! + 1e-6) continue;
    // An overlapping AABB is inconclusive for a dished wheel and sheared
    // forging. The narrow phase still enforces the very same minimum gap
    // against every native arm, including its corners and face interiors.
    const spatial = valid
      ? measureSpatialArmClearance(object, side) : null;
    if (spatial && spatial.minimumM >= clearance! - 1e-6) continue;
    issues.push({
      code: 'suspension-outboard-of-wheel-back',
      object: name,
      side,
      inner: innerSide ?? null,
      outboard: outboardSide ?? null,
      clearance: clearance ?? null,
      spatialMinimumM: spatial?.minimumM ?? null,
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
  auditSuspensionClearance(renderObject, name, objectData, issues);
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

/** Per-channel sRGB distance between two hexes (0..255). */
function hexChannelDistance(a: number, b: number): number {
  return Math.max(Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)), Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)),
    Math.abs((a & 255) - (b & 255)));
}

/** RUNNING-GEAR FINISH (owner 2026-09-22, runningGearFinish.ts): every material on a running-gear mesh — road
 * wheels and their face layers, return rollers, sprocket and idler bodies and hardware, suspension arms — must
 * be the finish its role prescribes: fleet rubber on tires and insets, the hull's one scheme wheel paint (the
 * colour it was tinted to, within 8-bit rounding) or worn steel on painted faces, dark steel on hardware, and
 * nothing brighter or more saturated than the table's window. Camouflage-mapped paint carries only a
 * multiplier, so its window is not read. */
function auditRunningGearFinish(object: Object3D, issues: WheelQualityIssue[]): void {
  const renderObject = object as RenderObject;
  const objectData = object.userData as RunningGearObjectData & { runningGear?: boolean; dynamicWheelFace?: boolean };
  if (objectData.runningGear !== true && objectData.dynamicWheelFace !== true) return;
  const name = object.name || object.type;
  for (const material of materialsOf(object)) {
    const materialRole = materialAppearanceRole(material);
    const role = objectData.appearanceRole ?? (typeof materialRole === 'string' ? materialRole : undefined);
    const rule = runningGearFinishRuleFor(role);
    if (!rule) continue;
    if (typeof materialRole !== 'string' || !rule.materialRoles.includes(materialRole)) {
      issues.push({ code: 'running-gear-finish-role', object: name, role: role ?? null, materialRole: materialRole ?? null, finish: rule.finish });
      continue;
    }
    const color = (material as Material & { color?: { r: number; g: number; b: number; getHex(): number } }).color;
    if (!color) continue;
    const hex = color.getHex();
    if (rule.hex !== undefined) {
      if (hex !== rule.hex) issues.push({ code: 'running-gear-finish-off-palette', object: name, role: role ?? null, hex, expected: rule.hex });
      continue;
    }
    const mapped = Boolean((material as Material & { map?: unknown }).map);
    if (mapped) continue; // camouflage-mapped paint: the colour is only a multiplier over the scheme map
    if (materialRole === 'wheelPaint') {
      const stamp = (material.userData as { schemeFinishHex?: unknown } | undefined)?.schemeFinishHex;
      if (typeof stamp !== 'number' || hexChannelDistance(stamp, hex) > 2) {
        issues.push({ code: 'running-gear-paint-off-scheme', object: name, role: role ?? null, hex, scheme: typeof stamp === 'number' ? stamp : null });
      }
      if (!withinRunningGearFinish([color.r, color.g, color.b], rule)) {
        issues.push({ code: 'running-gear-paint-outside-window', object: name, role: role ?? null, hex, finish: rule.finish });
      }
    } else {
      // worn steel or gunmetal on a painted-face role: dark steel, never a pale or tinted disc
      const steel = runningGearFinishRuleFor('trackHardware');
      if (steel && !withinRunningGearFinish([color.r, color.g, color.b], steel)) {
        issues.push({ code: 'running-gear-steel-outside-window', object: name, role: role ?? null, hex, materialRole });
      }
    }
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
  auditRunningGearFinish(object, issues);
  const objectData = object.userData as RunningGearObjectData;
  const name = object.name || '';
  if (!isWheelPartName(name)) return;
  if (ROAD_WHEEL_NAMES.has(name)) counters.activeRunningGearUnits.add(objectData.runningGearUnitId);
  auditWheelPartPattern(name, objectData, patternIds, issues);
  auditRoadWheelDiscs(object, name, counters, issues);
  if (name === 'gearEndWheelBody') counters.endBodies++;
  if (name.startsWith('gearReturnRoller')) {
    if(name==='gearReturnRollerRotors'){
      // A single closed rotor legitimately has two rendered finish regions.
      // Count real, complete groups, never a spare object or metadata tag.
      const g=renderObject.geometry,m=materialsOf(object);
      const total=g?.index?.count??g?.getAttribute('position')?.count??0;
      const groups=g?[...g.groups].sort((a,b)=>a.start-b.start):[];
      const valid=Array.isArray(renderObject.material)&&m.length===2&&m[0]!==m[1]
        &&['tireRubber','wheelTire'].includes(String(materialAppearanceRole(m[0]!)))
        &&materialAppearanceRole(m[1]!)==='wheelPaint'
        &&objectData.appearanceRole===undefined
        &&m.every(material=>material.visible&&material.colorWrite&&material.opacity>0)
        &&total>0&&total%3===0&&(renderObject.count??1)>0
        &&g?.drawRange.start===0&&g.drawRange.count>=total
        &&groups.length===2&&groups[0]!.start===0
        &&groups.every(group=>Number.isInteger(group.count)&&group.count>0&&group.count%3===0)
        &&groups[1]!.start===groups[0]!.count
        &&groups[1]!.start+groups[1]!.count===total
        &&groups.some(group=>group.materialIndex===0)&&groups.some(group=>group.materialIndex===1);
      if(!valid)issues.push({code:'invalid-composite-return-roller-materials',object:name});
      counters.returnRollerParts+=valid?2:1;
    }else counters.returnRollerParts++;
  }
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
