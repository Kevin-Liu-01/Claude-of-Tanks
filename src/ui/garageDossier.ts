// Pure presentation helpers for the garage technical dossier. Keep canonical
// module, crew, and special-action policy out of garage.ts's DOM renderer.

import { CREW_LABEL, MODULE_LABEL } from './moduleRegistry.ts';
import { SPECIAL_ACTION_KINDS, specialActionDescriptor } from '../sim/specialActionPolicy.ts';
import { tankTier } from '../vehicles/tier.ts';

const MODULE_ICON: Readonly<Record<string, string>> = Object.freeze({ trackL: 'track', trackR: 'track' });
const CREW_ICON: Readonly<Record<string, string>> = Object.freeze({
  commander: 'crewCommander', gunner: 'crewGunner',
  driver: 'crewDriver', loader: 'crewLoader',
});

interface DossierShell {
  readonly name: string;
  readonly guided?: boolean;
  readonly velocityMps?: number;
}

interface DossierAutoloader {
  readonly magazineSize: number;
  readonly intraClipS: number;
}

export interface GarageDossierSpec {
  readonly id?: string;
  readonly era?: string;
  readonly armor?: {
    readonly modules?: readonly { readonly module?: string }[];
    readonly crew?: readonly { readonly crew?: string }[];
  };
  readonly gun?: {
    readonly primaryGuided?: boolean;
    readonly reloadS?: number;
    readonly shells: readonly DossierShell[];
    readonly autoloader?: DossierAutoloader;
  };
  readonly hydropneumaticAim?: {
    readonly noseDownDeg?: number;
    readonly noseUpDeg?: number;
  };
  readonly gunDepressionDeg?: number;
  readonly gunElevationDeg?: number;
}

export interface GarageDossierRow {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
}

export interface GarageSpecialSystem {
  readonly kind: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly icon: string;
  readonly detail: string;
  readonly meta: string;
}

const MODULE_LABEL_BY_ID: Readonly<Record<string, string>> = MODULE_LABEL;
const CREW_LABEL_BY_ID: Readonly<Record<string, string>> = CREW_LABEL;

/** Matchmaking peer key used by every normalized garage stat bar. */
export function garageStatGroup(spec: GarageDossierSpec | null | undefined): string {
  return `${tankTier(spec?.id || '')}/${spec?.era || 'unclassified'}`;
}

/** Canonically ordered, duplicate-free damageable modules for one vehicle. */
export function garageModuleRows(spec: GarageDossierSpec | null | undefined): GarageDossierRow[] {
  const seen = new Set<string>();
  const rows: GarageDossierRow[] = [];
  for (const box of spec?.armor?.modules || []) {
    const id = box?.module;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push({ id, label: MODULE_LABEL_BY_ID[id] || id, icon: MODULE_ICON[id] || id });
  }
  return rows;
}

/** Canonically authored crew stations for one vehicle. */
export function garageCrewRows(spec: GarageDossierSpec | null | undefined): GarageDossierRow[] {
  const seen = new Set<string>();
  const rows: GarageDossierRow[] = [];
  for (const box of spec?.armor?.crew || []) {
    const id = box?.crew;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push({ id, label: CREW_LABEL_BY_ID[id] || id, icon: CREW_ICON[id] || 'crew' });
  }
  return rows;
}

/** Rich copy for the vehicle's one context-sensitive E-key system. */
export function garageSpecialSystem(
  spec: GarageDossierSpec,
  effectiveReloadS = spec.gun?.reloadS || 0,
): GarageSpecialSystem | null {
  const descriptor = specialActionDescriptor(spec);
  if (descriptor.kind === SPECIAL_ACTION_KINDS.NONE) return null;
  if (descriptor.kind === SPECIAL_ACTION_KINDS.GUIDED_MISSILE) {
    const missile = spec.gun?.shells.find((shell) => shell.guided === true);
    return {
      ...descriptor,
      icon: 'missileRack',
      detail: 'Press E or its numbered ammo slot to select, click to launch, then guide with the cursor.',
      meta: missile ? `${missile.name} · ${Math.round(missile.velocityMps || 0)} m/s` : 'Cursor-guided missile',
    };
  }
  if (descriptor.kind === SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM) {
    const aim = spec.hydropneumaticAim || {};
    return {
      ...descriptor,
      icon: 'track',
      detail: 'Press E to toggle precision suspension aiming and control the hull attitude.',
      meta: `−${aim.noseDownDeg || spec.gunDepressionDeg || 0}° / +${aim.noseUpDeg || spec.gunElevationDeg || 0}° hull aim`,
    };
  }
  const autoloader = spec.gun?.autoloader;
  if (!autoloader) return null;
  return {
    ...descriptor,
    icon: 'autoloader',
    detail: 'Press E to start an early full-magazine reload when the ready rack is not full.',
    meta: `${autoloader.magazineSize} rounds · ${autoloader.intraClipS.toFixed(1)} s cycle · ${effectiveReloadS.toFixed(1)} s reload`,
  };
}

/** Stable selected-tank handoff into the public gallery. */
export function garageGalleryHref(specId: string, layer = 'appearance'): string {
  const params = new URLSearchParams();
  if (specId) params.set('id', specId);
  if (layer && layer !== 'appearance') params.set('layer', layer);
  const query = params.toString();
  return `/gallery${query ? `?${query}` : ''}`;
}
