// Pure presentation helpers for the garage technical dossier. Keep canonical
// module, crew, and special-action policy out of garage.js's DOM renderer.

import { CREW_LABEL, MODULE_LABEL } from './moduleRegistry.js';
import { SPECIAL_ACTION_KINDS, specialActionDescriptor } from '../sim/specialActions.js';
import { tankTier } from '../vehicles/tier.js';

const MODULE_ICON = Object.freeze({ trackL: 'track', trackR: 'track' });
const CREW_ICON = Object.freeze({
  commander: 'crewCommander', gunner: 'crewGunner',
  driver: 'crewDriver', loader: 'crewLoader',
});

/** Matchmaking peer key used by every normalized garage stat bar. */
export function garageStatGroup(spec) {
  return `${tankTier(spec?.id)}/${spec?.class || 'medium'}`;
}

/** Canonically ordered, duplicate-free damageable modules for one vehicle. */
export function garageModuleRows(spec) {
  const seen = new Set();
  const rows = [];
  for (const box of spec?.armor?.modules || []) {
    const id = box?.module;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push({ id, label: MODULE_LABEL[id] || id, icon: MODULE_ICON[id] || id });
  }
  return rows;
}

/** Canonically authored crew stations for one vehicle. */
export function garageCrewRows(spec) {
  const seen = new Set();
  const rows = [];
  for (const box of spec?.armor?.crew || []) {
    const id = box?.crew;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push({ id, label: CREW_LABEL[id] || id, icon: CREW_ICON[id] || 'crew' });
  }
  return rows;
}

/** Rich copy for the vehicle's one context-sensitive E-key system. */
export function garageSpecialSystem(spec, effectiveReloadS = spec?.gun?.reloadS || 0) {
  const descriptor = specialActionDescriptor(spec);
  if (descriptor.kind === SPECIAL_ACTION_KINDS.NONE) return null;
  if (descriptor.kind === SPECIAL_ACTION_KINDS.GUIDED_MISSILE) {
    const missile = spec.gun.shells.find((shell) => shell.guided === true);
    return {
      ...descriptor,
      icon: 'missileRack',
      detail: 'Press E to engage, click to launch, then guide the missile with the cursor.',
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
  const autoloader = spec.gun.autoloader;
  return {
    ...descriptor,
    icon: 'autoloader',
    detail: 'Press E to start an early full-magazine reload when the ready rack is not full.',
    meta: `${autoloader.magazineSize} rounds · ${autoloader.intraClipS.toFixed(1)} s cycle · ${effectiveReloadS.toFixed(1)} s reload`,
  };
}

/** Stable selected-tank handoff into the public gallery. */
export function garageGalleryHref(specId, layer = 'appearance') {
  const params = new URLSearchParams();
  if (specId) params.set('id', specId);
  if (layer && layer !== 'appearance') params.set('layer', layer);
  const query = params.toString();
  return `/gallery${query ? `?${query}` : ''}`;
}
