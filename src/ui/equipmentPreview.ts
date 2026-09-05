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
import { t } from './i18n.ts';

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
  /** i18n key for `label`; use t(metric.labelKey) at render time. */
  labelKey: string;
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
  /** Canonical i18n key for the label; callers resolve via t() at render time. */
  labelKey: string;
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
    id: 'reload', label: 'Reload time', labelKey: 'garage.equipment.metric.reload',
    higherIsBetter: false,
    values: (snapshot) => [snapshot.reloadS],
    format: (snapshot) => seconds(snapshot.reloadS),
  },
  {
    id: 'aim', label: 'Aim time', labelKey: 'garage.equipment.metric.aim',
    higherIsBetter: false,
    values: (snapshot) => [snapshot.aimTimeS],
    format: (snapshot) => seconds(snapshot.aimTimeS),
  },
  {
    id: 'bloom', label: 'Moving dispersion modifier', labelKey: 'garage.equipment.metric.bloom',
    higherIsBetter: false,
    values: (snapshot) => [snapshot.movingDispersionPct],
    format: (snapshot) => pct(snapshot.movingDispersionPct),
  },
  {
    id: 'hullTraverse', label: 'Hull traverse', labelKey: 'garage.equipment.metric.hullTraverse',
    higherIsBetter: true,
    values: (snapshot) => [snapshot.hullTraverseDegS],
    format: (snapshot) => degreesPerSecond(snapshot.hullTraverseDegS),
  },
  {
    id: 'turretTraverse', label: 'Turret traverse', labelKey: 'garage.equipment.metric.turretTraverse',
    higherIsBetter: true,
    values: (snapshot) => [snapshot.turretTraverseDegS],
    format: (snapshot) => degreesPerSecond(snapshot.turretTraverseDegS),
  },
  {
    id: 'view', label: 'View range · moving / still', labelKey: 'garage.equipment.metric.view',
    higherIsBetter: true,
    values: (snapshot) => [snapshot.viewMovingM, snapshot.viewStillM],
    format: (snapshot) => pairedValue(
      snapshot.viewMovingM,
      snapshot.viewStillM,
      (value) => `${Math.round(value)} m`,
    ),
  },
  {
    id: 'camo', label: 'Concealment · moving / still', labelKey: 'garage.equipment.metric.camo',
    higherIsBetter: true,
    values: (snapshot) => [snapshot.camoMovingPct, snapshot.camoStillPct],
    format: (snapshot) => pairedValue(snapshot.camoMovingPct, snapshot.camoStillPct, pct),
  },
  {
    id: 'repair', label: 'Module repair-speed modifier', labelKey: 'garage.equipment.metric.repair',
    higherIsBetter: true,
    values: (snapshot) => [snapshot.repairPct],
    format: (snapshot) => pct(snapshot.repairPct),
  },
  {
    id: 'trackDurability', label: 'Track durability', labelKey: 'garage.equipment.metric.trackDurability',
    higherIsBetter: true,
    values: (snapshot) => [snapshot.trackDurabilityPct],
    format: (snapshot) => pct(snapshot.trackDurabilityPct),
  },
  {
    id: 'heSplash', label: 'HE splash-damage modifier', labelKey: 'garage.equipment.metric.heSplash',
    higherIsBetter: false,
    values: (snapshot) => [snapshot.heSplashDamagePct],
    format: (snapshot) => pct(snapshot.heSplashDamagePct),
  },
  {
    id: 'crewHe', label: 'Splash crew-hit modifier', labelKey: 'garage.equipment.metric.crewHe',
    higherIsBetter: false,
    values: (snapshot) => [snapshot.splashCrewHitPct],
    format: (snapshot) => pct(snapshot.splashCrewHitPct),
  },
  {
    id: 'ammoRackDurability', label: 'Ammo-rack durability', labelKey: 'garage.equipment.metric.ammoRackDurability',
    higherIsBetter: true,
    values: (snapshot) => [snapshot.ammoRackDurabilityPct],
    format: (snapshot) => pct(snapshot.ammoRackDurabilityPct),
  },
  {
    id: 'fuelTankDurability', label: 'Fuel-tank durability', labelKey: 'garage.equipment.metric.fuelTankDurability',
    higherIsBetter: true,
    values: (snapshot) => [snapshot.fuelTankDurabilityPct],
    format: (snapshot) => pct(snapshot.fuelTankDurabilityPct),
  },
  {
    id: 'engineFire', label: 'Engine-fire chance modifier', labelKey: 'garage.equipment.metric.engineFire',
    higherIsBetter: false,
    values: (snapshot) => [snapshot.engineFireChancePct],
    format: (snapshot) => pct(snapshot.engineFireChancePct),
  },
  {
    id: 'fireDuration', label: 'Fire-duration modifier', labelKey: 'garage.equipment.metric.fireDuration',
    higherIsBetter: false,
    values: (snapshot) => [snapshot.fireDurationPct],
    format: (snapshot) => pct(snapshot.fireDurationPct),
  },
  {
    id: 'extinguish', label: 'Self-extinguish rate modifier', labelKey: 'garage.equipment.metric.extinguish',
    higherIsBetter: true,
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
  const slotNo = openSlot + 1;
  if (!canApply) return t('garage.equipment.summary.unavailable');
  if (!itemId) {
    return fittedId
      ? t('garage.equipment.summary.removes', { name: fittedName, slot: slotNo })
      : t('garage.equipment.summary.emptyAlready', { slot: slotNo });
  }
  if (previousIndex === openSlot) {
    return t('garage.equipment.summary.removes', { name: itemName, slot: slotNo });
  }
  if (previousIndex >= 0) {
    return fittedId
      ? t('garage.equipment.summary.movesAndReplaces', {
          name: itemName, from: previousIndex + 1, old: fittedName,
        })
      : t('garage.equipment.summary.moves', {
          name: itemName, from: previousIndex + 1, to: slotNo,
        });
  }
  return fittedId
    ? t('garage.equipment.summary.replaces', { old: fittedName, new: itemName, slot: slotNo })
    : t('garage.equipment.summary.adds', { name: itemName, slot: slotNo });
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
    .map((definition): EquipmentPreviewMetric => {
      const isMagazine = definition.id === 'reload' && spec.gun.autoloader;
      return {
        id: definition.id,
        label: isMagazine ? 'Magazine reload time' : definition.label,
        labelKey: isMagazine
          ? 'garage.equipment.metric.magazineReload'
          : definition.labelKey,
        stock: definition.format(stock),
        current: definition.format(current),
        projected: definition.format(projected),
        changed: valuesChanged(definition.values(current), definition.values(projected)),
        outcome: metricOutcome(definition, current, projected),
      };
    });
  return {
    currentLoadout,
    projectedLoadout,
    summary: equipmentChangeSummary(currentLoadout, itemId, openSlot, canApply),
    metrics,
  };
}
