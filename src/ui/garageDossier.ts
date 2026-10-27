// Pure presentation helpers for the garage technical dossier. Keep canonical
// module, crew, and special-action policy out of garage.ts's DOM renderer.

import { CREW_LABEL, MODULE_LABEL } from './moduleRegistry.ts';
import { SPECIAL_ACTION_KINDS, specialActionDescriptor } from '../sim/specialActionPolicy.ts';
import { displayTier } from '../techTree/tiers.ts';
import { minimumMechanicalGunPitch, type GunPitchByYawCurve } from '../sim/gunPitchLimits.ts';
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

interface GarageDossierSpec {
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
  readonly gunPitchByYawDeg?: GunPitchByYawCurve;
}

interface GarageDossierRow {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
}

interface GarageSpecialSystem {
  readonly kind: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly icon: string;
  readonly detail: string;
  readonly meta: string;
}

export type GarageTechnicalViewId = 'armor' | 'modules' | 'crew';

interface GarageTechnicalView {
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
  roofGun: 'garage.module.roofGun',
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
function moduleLabel(id: string): string {
  const key = MODULE_I18N[id];
  return key ? t(key) : (MODULE_LABEL_BY_ID[id] || id);
}

/** Resolve a crew id to its localized label. */
function crewLabel(id: string): string {
  const key = CREW_I18N[id];
  return key ? t(key) : (CREW_LABEL_BY_ID[id] || id);
}

/** The peer key every normalized garage stat bar compares within: the tier the Garage shows, and the era. */
export function garageStatGroup(spec: GarageDossierSpec | null | undefined): string {
  return `${displayTier(spec?.id || '')}/${spec?.era || 'unclassified'}`;
}

/**
 * A stat's share of its Garage bar: its place between the least and the most of its stat group (garageStatGroup: the shown
 * tier and the era), from a 0.14 stub to full, inverted where less is better (a reload: the fastest fills). A group with no
 * spread parks at 0.72, so a column never reads all stubs; an unknown range or value reads 0.6.
 */
export function garageStatShare(range: readonly [number, number] | undefined, value: number | null | undefined, invert = false): number {
  if (!range || value == null || !isFinite(value)) return 0.6;
  const [lo, hi] = range;
  const span = hi - lo;
  if (!(span > Math.max(1e-6, Math.abs(hi) * 0.02))) return 0.72;
  const f = (value - lo) / span;
  return 0.14 + Math.max(0, Math.min(1, invert ? 1 - f : f)) * 0.86;
}

/** Canonically ordered, duplicate-free damageable modules for one vehicle. */
export function garageModuleRows(spec: GarageDossierSpec | null | undefined): GarageDossierRow[] {
  const seen = new Set<string>();
  const rows: GarageDossierRow[] = [];
  for (const box of spec?.armor?.modules || []) {
    const id = box?.module;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push({ id, label: moduleLabel(id), icon: MODULE_ICON[id] || id });
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
    rows.push({ id, label: crewLabel(id), icon: CREW_ICON[id] || 'crew' });
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
/** The dossier's gun arc: depression and elevation, and, where the gun cannot come down to level over the rear (a
 * bustle, an engine deck, the rear fuel drums: its measured curve's stop above zero anywhere from 150 deg aft), the
 * highest of those rear stops. */
export function garageGunArc(spec: GarageDossierSpec): string {
  const arc = `\u2212${spec.gunDepressionDeg ?? 0}\u00b0 / +${spec.gunElevationDeg ?? 0}\u00b0`;
  if (!spec.gunPitchByYawDeg) return arc;
  let rear = -Infinity;
  for (let yaw = 150; yaw <= 180; yaw++) rear = Math.max(rear, minimumMechanicalGunPitch(spec, yaw * Math.PI / 180) * 180 / Math.PI);
  return rear > 0.05 ? `${arc} \u00b7 ${t('garage.dossier.armament.rearStop', { deg: rear.toFixed(1) })}` : arc;
}

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
