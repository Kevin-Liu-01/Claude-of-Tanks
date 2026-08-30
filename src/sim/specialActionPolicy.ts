export const SPECIAL_ACTION_KINDS = Object.freeze({
  NONE: 'none',
  GUIDED_MISSILE: 'guided_missile',
  HYDROPNEUMATIC_AIM: 'hydropneumatic_aim',
  MAGAZINE_RELOAD: 'magazine_reload',
} as const);

export type SpecialActionKind = typeof SPECIAL_ACTION_KINDS[keyof typeof SPECIAL_ACTION_KINDS];

export interface SpecialActionDescriptor {
  kind: SpecialActionKind;
  label: string;
  shortLabel: string;
}

export interface SpecialActionState {
  kind: SpecialActionKind;
  missileSlot: number;
  active: boolean;
}

const DESCRIPTOR_NONE = Object.freeze({
  kind: SPECIAL_ACTION_KINDS.NONE, label: '', shortLabel: '',
});
const DESCRIPTOR_MISSILE = Object.freeze({
  kind: SPECIAL_ACTION_KINDS.GUIDED_MISSILE,
  label: 'Select ATGM',
  shortLabel: 'ATGM',
});
const DESCRIPTOR_SUSPENSION = Object.freeze({
  kind: SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM,
  label: 'Suspension Aim',
  shortLabel: 'Suspension',
});
const DESCRIPTOR_RELOAD = Object.freeze({
  kind: SPECIAL_ACTION_KINDS.MAGAZINE_RELOAD,
  label: 'Reload Magazine',
  shortLabel: 'Reload',
});

export interface SpecialActionSpec {
  hydropneumaticAim?: unknown;
  gun?: {
    primaryGuided?: boolean;
    autoloader?: unknown;
    shells?: readonly { guided?: boolean }[];
  };
}

/** Return the guided shell slot, or -1 when this vehicle has no ATGM. */
export function guidedMissileSlot(spec: SpecialActionSpec | null | undefined): number {
  const shells = spec?.gun?.shells;
  if (!Array.isArray(shells)) return -1;
  for (let index = 0; index < shells.length; index += 1) {
    if (shells[index]?.guided === true) return index;
  }
  return -1;
}

/** Resolve the single primary action presented by garage and battle UI. */
export function specialActionKind(spec: SpecialActionSpec | null | undefined): SpecialActionKind {
  if (!spec) return SPECIAL_ACTION_KINDS.NONE;
  if (guidedMissileSlot(spec) >= 0) return SPECIAL_ACTION_KINDS.GUIDED_MISSILE;
  if (spec.hydropneumaticAim) return SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM;
  if (spec.gun?.autoloader) return SPECIAL_ACTION_KINDS.MAGAZINE_RELOAD;
  return SPECIAL_ACTION_KINDS.NONE;
}

/** Immutable presentation copy for a spec; safe to cache for a whole round. */
export function specialActionDescriptor(
  spec: SpecialActionSpec | null | undefined,
): Readonly<SpecialActionDescriptor> {
  const kind = specialActionKind(spec);
  if (kind === SPECIAL_ACTION_KINDS.GUIDED_MISSILE) return DESCRIPTOR_MISSILE;
  if (kind === SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM) return DESCRIPTOR_SUSPENSION;
  if (kind === SPECIAL_ACTION_KINDS.MAGAZINE_RELOAD) return DESCRIPTOR_RELOAD;
  return DESCRIPTOR_NONE;
}

/** Small deterministic state record shared by local and network entities. */
export function createSpecialActionState(
  spec: SpecialActionSpec | null | undefined,
): SpecialActionState {
  return {
    kind: specialActionKind(spec),
    missileSlot: guidedMissileSlot(spec),
    active: false,
  };
}
