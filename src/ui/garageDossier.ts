// Pure presentation helpers for the garage technical dossier. Keep canonical
// module, crew, and special-action policy out of garage.ts's DOM renderer.

import { CREW_LABEL, MODULE_LABEL } from './moduleRegistry.ts';
import { SPECIAL_ACTION_KINDS, specialActionDescriptor } from '../sim/specialActionPolicy.ts';
import { tankTier } from '../vehicles/tier.ts';
import { t } from './i18n.ts';

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

export type GarageTechnicalViewId = 'armor' | 'modules' | 'crew';

export interface GarageTechnicalView {
  readonly id: GarageTechnicalViewId;
  readonly label: string;
  readonly caption: string;
  readonly assetView: 'armor_side' | 'modules_side' | 'crew_side';
  readonly galleryLayer: 'armor' | 'modules' | 'crew';
}

// I18n keys — the renderer calls t() on the label/caption fields at draw time.
// The English strings remain as the canonical fallback when t() cannot find a
// catalog entry (and the i18n.selftest.mjs integrity check verifies parity).
const GARAGE_TECHNICAL_VIEWS: readonly GarageTechnicalView[] = Object.freeze([
  Object.freeze({
    id: 'armor', label: 'Armor', caption: 'Effective armor by protection zone',
    assetView: 'armor_side', galleryLayer: 'armor',
  }),
  Object.freeze({
    id: 'modules', label: 'Modules', caption: 'Damageable internal module layout',
    assetView: 'modules_side', galleryLayer: 'modules',
  }),
  Object.freeze({
    id: 'crew', label: 'Crew', caption: 'Canonical crew-station layout',
    assetView: 'crew_side', galleryLayer: 'crew',
  }),
]);

// I18n key map for the technical-view labels and captions. The garage
// renderer reads these in place of the literal `label`/`caption` strings when
// the catalog has an entry. The keys mirror the dossier section names so the
// fallback is obvious if translation is missing.
const TECHNICAL_VIEW_I18N: Readonly<Record<string, { label: string; caption: string }>> = Object.freeze({
  armor: Object.freeze({ label: 'garage.dossier.tab.armor', caption: 'garage.dossier.caption.armor' }),
  modules: Object.freeze({ label: 'garage.dossier.tab.modules', caption: 'garage.dossier.caption.modules' }),
  crew: Object.freeze({ label: 'garage.dossier.tab.crew', caption: 'garage.dossier.caption.crew' }),
});

/** Returns the translated label/caption pair for a technical view, falling
 *  back to the literal English strings when the catalog lookup misses. */
export function translateTechnicalView(view: GarageTechnicalView): { label: string; caption: string } {
  const i18n = TECHNICAL_VIEW_I18N[view.id];
  if (!i18n) return { label: view.label, caption: view.caption };
  return { label: t(i18n.label), caption: t(i18n.caption) };
}

const MODULE_LABEL_BY_ID: Readonly<Record<string, string>> = MODULE_LABEL;
const CREW_LABEL_BY_ID: Readonly<Record<string, string>> = CREW_LABEL;

// Translation key map. The renderer calls t() on the i18n key for each module
// or crew id; missing keys fall back to the catalog English label.
const MODULE_I18N: Readonly<Record<string, string>> = Object.freeze({
  gun: 'garage.module.gun',
  turretRing: 'garage.module.turretRing',
  gunMount: 'garage.module.gunMount',
  autoloader: 'garage.module.autoloader',
  feedSystem: 'garage.module.feedSystem',
  missileRack: 'garage.module.missileRack',
  engine: 'garage.module.engine',
  transmission: 'garage.module.transmission',
  fuelTank: 'garage.module.fuelTank',
  ammoRack: 'garage.module.ammoRack',
  radio: 'garage.module.radio',
  optics: 'garage.module.optics',
  trackL: 'garage.module.trackL',
  trackR: 'garage.module.trackR',
});
const CREW_I18N: Readonly<Record<string, string>> = Object.freeze({
  commander: 'garage.crew.commander',
  gunner: 'garage.crew.gunner',
  driver: 'garage.crew.driver',
  loader: 'garage.crew.loader',
  radioOperator: 'garage.crew.radioOperator',
  assistantDriver: 'garage.crew.assistantDriver',
  assistantLoader: 'garage.crew.assistantLoader',
  weaponOperatorLeft: 'garage.crew.weaponOperatorLeft',
  weaponOperatorRight: 'garage.crew.weaponOperatorRight',
});

/** Resolve a module id to its localized label, falling back to the
 *  catalog English label. */
export function moduleLabel(id: string): string {
  const key = MODULE_I18N[id];
  return key ? t(key) : (MODULE_LABEL_BY_ID[id] || id);
}

/** Resolve a crew id to its localized label. */
export function crewLabel(id: string): string {
  const key = CREW_I18N[id];
  return key ? t(key) : (CREW_LABEL_BY_ID[id] || id);
}

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

// Map the simulation descriptor's static English labels to localized
// variants. The descriptor itself stays a plain string in the simulation
// (Node-runnable, no DOM), and the UI presentation layer translates here.
const SPECIAL_ACTION_LABEL_I18N: Readonly<Record<string, string>> = Object.freeze({
  'Toggle ATGM': 'garage.special.toggleAtgm',
  'Suspension Aim': 'garage.special.suspensionAim',
  'Reload Magazine': 'garage.special.reloadMagazine',
});

// Ammunition type tags come from the vehicle spec data as canonical English
// codes (APFSDS, HEAT, HE, etc.). Translate the codes at the UI layer so the
// in-garage shell list shows a localized label while the simulation keeps the
// original enum value.
const SHELL_TYPE_I18N: Readonly<Record<string, string>> = Object.freeze({
  APFSDS: 'garage.shellType.APFSDS',
  'APFSDS-T': 'garage.shellType.APFSDS',
  APDS: 'garage.shellType.APDS',
  'APDS-T': 'garage.shellType.APDS',
  HEAT: 'garage.shellType.HEAT',
  'HEAT-MP': 'garage.shellType.HEAT',
  'HEAT-T': 'garage.shellType.HEAT',
  HESH: 'garage.shellType.HESH',
  HE: 'garage.shellType.HE',
  'HE-T': 'garage.shellType.HE',
  AP: 'garage.shellType.AP',
  APHE: 'garage.shellType.APHE',
  'APHE-T': 'garage.shellType.APHE',
  APCR: 'garage.shellType.APCR',
  'APCR-T': 'garage.shellType.APCR',
  GATGM: 'garage.shellType.GATGM',
  ATGM: 'garage.shellType.ATGM',
  STAFF: 'garage.shellType.STAFF',
  AMP: 'garage.shellType.AMP',
  HEP: 'garage.shellType.HEP',
});

/** Resolve a shell type code to its localized label, falling back to the
 *  canonical English code when no translation key is registered. */
export function shellTypeLabel(type: string): string {
  if (!type) return '';
  const key = SHELL_TYPE_I18N[type];
  return key ? t(key) : type;
}

/** Rich copy for the vehicle's one context-sensitive E-key system. */
export function garageSpecialSystem(
  spec: GarageDossierSpec,
  effectiveReloadS = spec.gun?.reloadS || 0,
): GarageSpecialSystem | null {
  const descriptor = specialActionDescriptor(spec);
  if (descriptor.kind === SPECIAL_ACTION_KINDS.NONE) return null;
  const labelKey = SPECIAL_ACTION_LABEL_I18N[descriptor.label];
  const label = labelKey ? t(labelKey) : descriptor.label;
  if (descriptor.kind === SPECIAL_ACTION_KINDS.GUIDED_MISSILE) {
    const missile = spec.gun?.shells.find((shell) => shell.guided === true);
    return {
      ...descriptor,
      label,
      icon: 'missileRack',
      detail: t('garage.dossier.special.press'),
      meta: missile
        ? t('garage.dossier.shellMeta', { name: missile.name, speed: Math.round(missile.velocityMps || 0) })
        : t('garage.dossier.guidedMissileFallback'),
    };
  }
  if (descriptor.kind === SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM) {
    const aim = spec.hydropneumaticAim || {};
    return {
      ...descriptor,
      label,
      icon: 'track',
      detail: t('garage.dossier.special.hydro'),
      meta: t('garage.dossier.hydroArc', {
        down: aim.noseDownDeg || spec.gunDepressionDeg || 0,
        up: aim.noseUpDeg || spec.gunElevationDeg || 0,
      }),
    };
  }
  const autoloader = spec.gun?.autoloader;
  if (!autoloader) return null;
  return {
    ...descriptor,
    label,
    icon: 'autoloader',
    detail: t('garage.dossier.special.autoreload'),
    meta: t('garage.dossier.magazine.spec', {
      size: autoloader.magazineSize,
      cycle: autoloader.intraClipS.toFixed(1),
      reload: effectiveReloadS.toFixed(1),
    }),
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

/** First-class generated schematics shown in every playable vehicle dossier. */
export function garageTechnicalViews(): readonly GarageTechnicalView[] {
  return GARAGE_TECHNICAL_VIEWS;
}
