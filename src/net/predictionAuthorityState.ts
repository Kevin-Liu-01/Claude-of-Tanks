import type { RuntimeValue } from '../runtimeTypes.ts';
import type { MovementCombatState } from '../sim/movement.ts';

// Only the viewer's movement dependencies cross this seam. Never serialize
// another tank's hidden damage/loadout or make prediction authoritative.
const MODULES = ['engine', 'transmission', 'trackL', 'trackR', 'turretRing', 'gunMount', 'gun'] as const;
const CREW = ['driver', 'gunner'] as const;
const EQUIPMENT = ['traverse', 'turret', 'aimTime', 'bloom'] as const;

interface PredictionAuthorityEntity {
  id: string;
  combat: MovementCombatState;
  modeSpeedMultiplier?: number;
}

function record(value: RuntimeValue): Record<string, RuntimeValue> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, RuntimeValue> : null;
}

function multiplier(value: RuntimeValue): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.max(0.01, Math.min(10, value)) : 1;
}

export function capturePredictionAuthorityState(
  entity: PredictionAuthorityEntity,
): Record<string, RuntimeValue> {
  const modules: Record<string, string> = {};
  const crew: Record<string, boolean> = {};
  const equipment: Record<string, number> = {};
  for (const key of MODULES) modules[key] = entity.combat.modules?.[key]?.state || 'ok';
  for (const key of CREW) crew[key] = entity.combat.crew?.[key] !== false;
  for (const key of EQUIPMENT) equipment[key] = multiplier(entity.combat.equipMults?.[key]);
  return { id: entity.id, modules, crew, equipment,
    modeSpeedMultiplier: multiplier(entity.modeSpeedMultiplier) };
}

export function applyPredictionAuthorityState(
  entity: PredictionAuthorityEntity,
  value: RuntimeValue,
): boolean {
  const state = record(value);
  if (!state || state.id !== entity.id) return false;
  const modules = record(state.modules);
  const crew = record(state.crew);
  const equipment = record(state.equipment);
  if (!modules || !crew || !equipment) return false;
  for (const key of MODULES) {
    const module = entity.combat.modules?.[key];
    const status = modules[key];
    // Preserve the authored module set: adding a turretRing to a casemate
    // would mask its gunMount fallback in the shared movement model.
    if (module && (status === 'ok' || status === 'yellow' || status === 'red')) {
      module.state = status;
    }
  }
  const targetCrew = entity.combat.crew || (entity.combat.crew = {});
  for (const key of CREW) if (typeof crew[key] === 'boolean') targetCrew[key] = crew[key];
  const targetEquipment = entity.combat.equipMults || (entity.combat.equipMults = {});
  for (const key of EQUIPMENT) targetEquipment[key] = multiplier(equipment[key]);
  entity.modeSpeedMultiplier = multiplier(state.modeSpeedMultiplier);
  return true;
}
