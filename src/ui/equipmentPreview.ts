// src/ui/equipmentPreview.ts — pure equipment-picker stat projections.
// The Garage tooltip consumes the same equipment and spotting calculators as
// battle, so hovering a tile previews the exact loadout produced by clicking
// it instead of restating catalog marketing copy.

import {
  EQUIPMENT_BY_ID,
  computeEquipMults,
  sanitizeLoadout,
} from '../game/equipment.ts';
import {
  baseCamoOf,
  equipCamoBonus,
  equipViewMult,
  viewRangeOf,
} from '../sim/spotting.ts';

export interface EquipmentPreviewSpec {
  id: string;
  name: string;
  era?: string | null;
  role?: string;
  hullTraverseDegS: number;
  turretTraverseDegS: number;
  gun: {
    reloadS: number;
    aimTimeS: number;
    autoloader?: {
      magazineSize?: number;
      intraClipS?: number;
      fullReloadS?: number;
    };
  };
}

export type EquipmentPreviewOutcome = 'improved' | 'degraded' | 'unchanged';

export interface EquipmentPreviewMetric {
  id: string;
  label: string;
  stock: string;
  current: string;
  projected: string;
  changed: boolean;
  outcome: EquipmentPreviewOutcome;
}

export interface EquipmentHoverPreview {
  currentLoadout: string[];
  projectedLoadout: string[];
  summary: string;
  metrics: EquipmentPreviewMetric[];
}

interface EquipmentStatSnapshot {
  reloadS: number;
  aimTimeS: number;
  movingDispersionPct: number;
  hullTraverseDegS: number;
  turretTraverseDegS: number;
  viewMovingM: number;
  viewStillM: number;
  camoMovingPct: number;
  camoStillPct: number;
  repairPct: number;
  trackDurabilityPct: number;
  heSplashDamagePct: number;
  splashCrewHitPct: number;
  ammoRackDurabilityPct: number;
  fuelTankDurabilityPct: number;
  engineFireChancePct: number;
  fireDurationPct: number;
  selfExtinguishRatePct: number;
}

interface MetricDefinition {
  id: string;
  label: string;
  higherIsBetter: boolean;
  values: (snapshot: EquipmentStatSnapshot) => readonly number[];
  format: (snapshot: EquipmentStatSnapshot) => string;
}

const pct = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
};

const seconds = (value: number): string => `${value.toFixed(value < 10 ? 2 : 1)} s`;
const degreesPerSecond = (value: number): string => `${value.toFixed(1)}°/s`;

function pairedValue(
  first: number,
  second: number,
  formatter: (value: number) => string,
): string {
  const a = formatter(first);
  const b = formatter(second);
  return a === b ? a : `${a} / ${b}`;
}

const METRICS: readonly MetricDefinition[] = [
  {
    id: 'reload', label: 'Reload time', higherIsBetter: false,
    values: (snapshot) => [snapshot.reloadS],
    format: (snapshot) => seconds(snapshot.reloadS),
  },
  {
    id: 'aim', label: 'Aim time', higherIsBetter: false,
    values: (snapshot) => [snapshot.aimTimeS],
    format: (snapshot) => seconds(snapshot.aimTimeS),
  },
  {
    id: 'bloom', label: 'Moving dispersion modifier', higherIsBetter: false,
    values: (snapshot) => [snapshot.movingDispersionPct],
    format: (snapshot) => pct(snapshot.movingDispersionPct),
  },
  {
    id: 'hullTraverse', label: 'Hull traverse', higherIsBetter: true,
    values: (snapshot) => [snapshot.hullTraverseDegS],
    format: (snapshot) => degreesPerSecond(snapshot.hullTraverseDegS),
  },
  {
    id: 'turretTraverse', label: 'Turret traverse', higherIsBetter: true,
    values: (snapshot) => [snapshot.turretTraverseDegS],
    format: (snapshot) => degreesPerSecond(snapshot.turretTraverseDegS),
  },
  {
    id: 'view', label: 'View range · moving / still', higherIsBetter: true,
    values: (snapshot) => [snapshot.viewMovingM, snapshot.viewStillM],
    format: (snapshot) => pairedValue(
      snapshot.viewMovingM,
      snapshot.viewStillM,
      (value) => `${Math.round(value)} m`,
    ),
  },
  {
    id: 'camo', label: 'Concealment · moving / still', higherIsBetter: true,
    values: (snapshot) => [snapshot.camoMovingPct, snapshot.camoStillPct],
    format: (snapshot) => pairedValue(snapshot.camoMovingPct, snapshot.camoStillPct, pct),
  },
  {
    id: 'repair', label: 'Module repair-speed modifier', higherIsBetter: true,
    values: (snapshot) => [snapshot.repairPct],
    format: (snapshot) => pct(snapshot.repairPct),
  },
  {
    id: 'trackDurability', label: 'Track durability', higherIsBetter: true,
    values: (snapshot) => [snapshot.trackDurabilityPct],
    format: (snapshot) => pct(snapshot.trackDurabilityPct),
  },
  {
    id: 'heSplash', label: 'HE splash-damage modifier', higherIsBetter: false,
    values: (snapshot) => [snapshot.heSplashDamagePct],
    format: (snapshot) => pct(snapshot.heSplashDamagePct),
  },
  {
    id: 'crewHe', label: 'Splash crew-hit modifier', higherIsBetter: false,
    values: (snapshot) => [snapshot.splashCrewHitPct],
    format: (snapshot) => pct(snapshot.splashCrewHitPct),
  },
  {
    id: 'ammoRackDurability', label: 'Ammo-rack durability', higherIsBetter: true,
    values: (snapshot) => [snapshot.ammoRackDurabilityPct],
    format: (snapshot) => pct(snapshot.ammoRackDurabilityPct),
  },
  {
    id: 'fuelTankDurability', label: 'Fuel-tank durability', higherIsBetter: true,
    values: (snapshot) => [snapshot.fuelTankDurabilityPct],
    format: (snapshot) => pct(snapshot.fuelTankDurabilityPct),
  },
  {
    id: 'engineFire', label: 'Engine-fire chance modifier', higherIsBetter: false,
    values: (snapshot) => [snapshot.engineFireChancePct],
    format: (snapshot) => pct(snapshot.engineFireChancePct),
  },
  {
    id: 'fireDuration', label: 'Fire-duration modifier', higherIsBetter: false,
    values: (snapshot) => [snapshot.fireDurationPct],
    format: (snapshot) => pct(snapshot.fireDurationPct),
  },
  {
    id: 'extinguish', label: 'Self-extinguish rate modifier', higherIsBetter: true,
    values: (snapshot) => [snapshot.selfExtinguishRatePct],
    format: (snapshot) => pct(snapshot.selfExtinguishRatePct),
  },
];

const ITEM_METRICS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  rammer: ['reload'],
  vstab: ['bloom'],
  gld: ['aim'],
  vents: ['reload', 'aim', 'view', 'camo'],
  optics: ['view'],
  binoculars: ['view'],
  camo_net: ['camo'],
  rotation: ['hullTraverse', 'turretTraverse'],
  susp: ['trackDurability'],
  toolbox: ['repair'],
  spall_liner: ['heSplash', 'crewHe'],
  wet_rack: ['ammoRackDurability'],
  fuel_safety: ['fuelTankDurability', 'engineFire'],
  auto_ext: ['fireDuration', 'extinguish'],
});

function snapshotFor(spec: EquipmentPreviewSpec, loadout: readonly string[]): EquipmentStatSnapshot {
  const multipliers = computeEquipMults(loadout);
  const spottingSpec = { id: spec.id, role: spec.role };
  const viewRangeM = viewRangeOf(spottingSpec);
  const baseReloadS = spec.gun.autoloader?.fullReloadS || spec.gun.reloadS;
  return {
    reloadS: baseReloadS * multipliers.reload,
    aimTimeS: spec.gun.aimTimeS * multipliers.aimTime,
    movingDispersionPct: multipliers.bloom * 100,
    hullTraverseDegS: spec.hullTraverseDegS * multipliers.traverse,
    turretTraverseDegS: spec.turretTraverseDegS * multipliers.turret,
    viewMovingM: viewRangeM * equipViewMult(loadout, true),
    viewStillM: viewRangeM * equipViewMult(loadout, false),
    camoMovingPct: Math.min(0.95, baseCamoOf(spottingSpec, true) + equipCamoBonus(loadout, true)) * 100,
    camoStillPct: Math.min(0.95, baseCamoOf(spottingSpec, false) + equipCamoBonus(loadout, false)) * 100,
    repairPct: multipliers.repair * 100,
    trackDurabilityPct: ((multipliers.moduleHp.trackL || 1) + (multipliers.moduleHp.trackR || 1)) * 50,
    heSplashDamagePct: multipliers.heSplash * 100,
    splashCrewHitPct: multipliers.crewHe * 100,
    ammoRackDurabilityPct: (multipliers.moduleHp.ammoRack || 1) * 100,
    fuelTankDurabilityPct: (multipliers.moduleHp.fuelTank || 1) * 100,
    engineFireChancePct: multipliers.engineFire * 100,
    fireDurationPct: multipliers.fireTicks * 100,
    selfExtinguishRatePct: multipliers.extinguish * 100,
  };
}

function valuesChanged(a: readonly number[], b: readonly number[]): boolean {
  return a.some((value, index) => Math.abs(value - b[index]) > 1e-7);
}

function metricOutcome(
  definition: MetricDefinition,
  current: EquipmentStatSnapshot,
  projected: EquipmentStatSnapshot,
): EquipmentPreviewOutcome {
  const currentValues = definition.values(current);
  const projectedValues = definition.values(projected);
  if (!valuesChanged(currentValues, projectedValues)) return 'unchanged';
  const delta = projectedValues.reduce(
    (sum, value, index) => sum + value - currentValues[index],
    0,
  );
  const improved = definition.higherIsBetter ? delta > 0 : delta < 0;
  return improved ? 'improved' : 'degraded';
}

/** Return the exact compact loadout produced by activating a picker tile. */
export function projectEquipmentLoadout(
  currentLoadout: readonly string[],
  itemId: string | null,
  openSlot: number,
): string[] {
  const next = [...currentLoadout];
  const previousIndex = itemId ? next.indexOf(itemId) : -1;
  if (itemId && previousIndex === openSlot) {
    next.splice(openSlot, 1);
  } else if (itemId) {
    if (previousIndex >= 0) next.splice(previousIndex, 1);
    if (openSlot < next.length) next.splice(openSlot, 1, itemId);
    else next.push(itemId);
  } else if (openSlot < next.length) {
    next.splice(openSlot, 1);
  }
  return next;
}

function equipmentChangeSummary(
  currentLoadout: readonly string[],
  itemId: string | null,
  openSlot: number,
  canApply: boolean,
): string {
  const fittedId = currentLoadout[openSlot] || null;
  const fittedName = fittedId ? EQUIPMENT_BY_ID.get(fittedId)?.name || fittedId : '';
  const itemName = itemId ? EQUIPMENT_BY_ID.get(itemId)?.name || itemId : '';
  const previousIndex = itemId ? currentLoadout.indexOf(itemId) : -1;
  if (!canApply) return 'Unavailable for this vehicle; current combat values remain unchanged.';
  if (!itemId) {
    return fittedId
      ? `Removes ${fittedName} from Slot ${openSlot + 1}.`
      : `Slot ${openSlot + 1} is already empty.`;
  }
  if (previousIndex === openSlot) return `Removes ${itemName} from Slot ${openSlot + 1}.`;
  if (previousIndex >= 0) {
    return fittedId
      ? `Moves ${itemName} from Slot ${previousIndex + 1} and replaces ${fittedName}.`
      : `Moves ${itemName} from Slot ${previousIndex + 1} to Slot ${openSlot + 1}.`;
  }
  return fittedId
    ? `Replaces ${fittedName} in Slot ${openSlot + 1}.`
    : `Adds ${itemName} to Slot ${openSlot + 1}.`;
}

/** Build exact stock/current/projected values for one equipment hover. */
export function equipmentHoverPreview(
  spec: EquipmentPreviewSpec,
  currentIds: readonly string[],
  itemId: string | null,
  openSlot: number,
  canApply = true,
): EquipmentHoverPreview {
  const currentLoadout = sanitizeLoadout(currentIds, spec);
  const rawProjected = canApply
    ? projectEquipmentLoadout(currentLoadout, itemId, openSlot)
    : currentLoadout;
  const projectedLoadout = sanitizeLoadout(rawProjected, spec);
  const stock = snapshotFor(spec, []);
  const current = snapshotFor(spec, currentLoadout);
  const projected = snapshotFor(spec, projectedLoadout);
  const changedMetricIds = new Set(
    METRICS
      .filter((definition) => valuesChanged(definition.values(current), definition.values(projected)))
      .map((definition) => definition.id),
  );
  const contextItemId = itemId || currentLoadout[openSlot] || '';
  if (changedMetricIds.size === 0) {
    for (const metricId of ITEM_METRICS[contextItemId] || []) changedMetricIds.add(metricId);
  }
  const metrics = METRICS
    .filter((definition) => changedMetricIds.has(definition.id))
    .map((definition): EquipmentPreviewMetric => ({
      id: definition.id,
      label: definition.id === 'reload' && spec.gun.autoloader
        ? 'Magazine reload time'
        : definition.label,
      stock: definition.format(stock),
      current: definition.format(current),
      projected: definition.format(projected),
      changed: valuesChanged(definition.values(current), definition.values(projected)),
      outcome: metricOutcome(definition, current, projected),
    }));
  return {
    currentLoadout,
    projectedLoadout,
    summary: equipmentChangeSummary(currentLoadout, itemId, openSlot, canApply),
    metrics,
  };
}
