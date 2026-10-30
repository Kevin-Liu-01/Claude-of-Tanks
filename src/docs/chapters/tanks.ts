// The Field Manual's tanks chapter: the fleet by class, role, tier and nation, the equipment and the kits. Copyright ©
// 2026 Kevin B. Liu.
// Every count is the game's own: the classes and roles from the Garage's facet tables (src/vehicles/vehicleFacets.ts),
// the tiers and nations from the fleet's asset table, the equipment from its catalog (src/game/equipment.ts, the
// Garage's equipment.* copy and icons), the kits from the consumable rules, smoke and the drone from the sim's constants.
// Each class shows its highest-tier tank's hero card. Node only (tools/docs-prerender.mjs).
import {
  VEHICLE_BATTLE_ROLE_META, VEHICLE_BATTLE_ROLE_ORDER, VEHICLE_CLASS_META, VEHICLE_CLASS_ORDER, vehicleFacetLabel, vehicleIdsForFacet,
} from '../../vehicles/vehicleFacets.ts';
import { EQUIP_CATEGORIES, EQUIP_SLOTS, EQUIPMENT_CATALOG, type EquipmentItem } from '../../game/equipment.ts';
import { CONSUMABLE_RULES } from '../../game/consumables.ts';
import { consumableEffectKey, consumableNameKey } from '../../game/consumableLoadout.ts';
import { AERIAL_RULES } from '../../sim/matchRuleset.ts';
import { SMOKE_COOLDOWN_S } from '../../sim/auxiliarySystems.ts';
import { SMOKE_DURATION_S } from '../../sim/smokeScreen.ts';
import { consumableIconSVG, equipIconSVG } from '../../ui/equipIcons.ts';
import { flagMarkup } from '../../presentation/publicShell.ts';
import { pictureMarkup } from '../../presentation/responsivePicture.ts';
import { icon, type IconId } from '../../ui/icons/icon.ts';
import { getLocale, t } from '../../ui/i18n.ts';
import { hrefForLocale } from '../../ui/localeRouting.ts';
import { fleetTanks, heroCardMarkup } from './fleet.ts';
import { nameHtml } from '../designations.ts';
import type { RichSection } from './types.ts';

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

const CLASS_ICONS: Readonly<Record<string, IconId>> = {
  mbt: 'classMbt', medium: 'classMedium', heavy: 'classHeavy', light: 'classLight', ifv: 'classIfv', apc: 'classApc', td: 'classTd', spaa: 'classSpaa',
  'fire-support': 'classFireSupport',
};
const ROLE_ICONS: Readonly<Record<string, IconId>> = {
  breakthrough: 'roleBreakthrough', frontline: 'roleFrontline', flanker: 'roleFlanker', sniper: 'roleSniper', scout: 'roleScout', support: 'roleSupport',
};
const HC_SIZES = '(width < 768px) 90vw, 22vw';

/** The class's flagship: its highest-tier tank, then by name (deterministic). */
function flagship(ids: readonly string[]): string {
  const fleet = fleetTanks();
  return [...ids].filter((id) => fleet.has(id)).sort((a, b) => (fleet.get(b)!.tier - fleet.get(a)!.tier) || fleet.get(a)!.name.localeCompare(fleet.get(b)!.name))[0];
}

function classesSection(): string {
  const fleet = fleetTanks();
  const shown = VEHICLE_CLASS_ORDER.filter((cls) => vehicleIdsForFacet('class', cls).some((id) => fleet.has(id)));
  const cards = shown.map((cls) => {
    const ids = vehicleIdsForFacet('class', cls).filter((id) => fleet.has(id));
    const lead = flagship(ids);
    const meta = VEHICLE_CLASS_META[cls];
    return `<article class="dm-class">${heroCardMarkup(lead, HC_SIZES)}<div class="dm-class__body">`
      + `<h3>${icon(CLASS_ICONS[cls] ?? 'vehicle', { size: 18 })}<span>${nameHtml(vehicleFacetLabel(meta, t))}</span><b>${ids.length}</b></h3>`
      + `<p>${flagMarkup(fleet.get(lead)!.countryCode, 'cot-c-flag cot-c-flag--sm')}<span>${nameHtml(fleet.get(lead)!.name)}</span></p></div></article>`;
  }).join('');
  return `<div class="dm-classes">${cards}</div>`;
}

function rolesSection(): string {
  const items = VEHICLE_BATTLE_ROLE_ORDER.map((role) => {
    const meta = VEHICLE_BATTLE_ROLE_META[role];
    const count = vehicleIdsForFacet('role', role).length;
    return `<li>${icon(ROLE_ICONS[role] ?? 'team', { size: 20 })}<div><b>${nameHtml(vehicleFacetLabel(meta, t))}</b><span>${count}</span>`
      + `${meta.hintKey ? `<p>${esc(t(meta.hintKey))}</p>` : ''}</div></li>`;
  }).join('');
  return `<p>${esc(t('docs.tanks.rolesLede'))}</p><ul class="dm-roles dm-roles--counts">${items}</ul>`;
}

/** Tiers as bars drawn to one scale (the count each bar names is the count it reaches). */
function tiersSection(): string {
  const fleet = [...fleetTanks().values()];
  const byTier = new Map<string, number>();
  for (const tank of fleet) byTier.set(tank.tierNumeral, (byTier.get(tank.tierNumeral) ?? 0) + 1);
  const tiers = [...byTier].sort((a, b) => fleet.find((x) => x.tierNumeral === b[0])!.tier - fleet.find((x) => x.tierNumeral === a[0])!.tier);
  const max = Math.max(...tiers.map(([, n]) => n));
  const bars = tiers.map(([numeral, n]) => `<li><b>${numeral}</b><span class="dm-bar" style="--dm-bar:${(n / max).toFixed(3)}"></span><span class="num">${n}</span></li>`).join('');
  const byNation = new Map<string, { code: string; nation: string; n: number }>();
  for (const tank of fleet) {
    const entry = byNation.get(tank.countryCode) ?? { code: tank.countryCode, nation: tank.nation, n: 0 };
    entry.n++;
    byNation.set(tank.countryCode, entry);
  }
  const nations = [...byNation.values()].sort((a, b) => b.n - a.n).map((entry) => `<li>${flagMarkup(entry.code, 'cot-c-flag cot-c-flag--md')}`
    + `<span>${esc(t(`nation.${entry.nation}`))}</span><b>${entry.n}</b></li>`).join('');
  return `<p>${esc(t('docs.tanks.tiersLede'))}</p><ul class="dm-bars" aria-label="${esc(t('docs.tanks.tiersAria'))}">${bars}</ul>`
    + `<h3>${esc(t('docs.tanks.nations', { nations: String(byNation.size) }))}</h3><ul class="dm-nations">${nations}</ul>`;
}

/** The hull an item needs, in the manual's words (the gates equipIneligibility applies in the Garage and at spawn). */
function equipmentGateNote(item: EquipmentItem): string {
  const notes = [item.era === 'modern' ? 'docs.tanks.modernOnly' : '', item.needs ? `docs.tanks.needs.${item.needs}` : '']
    .filter(Boolean).map((key) => esc(t(key)));
  return notes.length ? `<small>${notes.join(' · ')}</small>` : '';
}

function equipmentSection(): string {
  const groups = EQUIP_CATEGORIES.filter((cat) => cat.id !== 'all').map((cat) => {
    const items = EQUIPMENT_CATALOG.filter((item) => item.cat === cat.id).map((item) => `<li>${equipIconSVG(item.id, 26)}<div>`
      + `<b>${esc(t(`equipment.${item.id}.name`))}</b><span>${esc(t(`equipment.${item.id}.desc`))}</span>`
      + `${equipmentGateNote(item)}</div></li>`).join('');
    return `<div class="dm-equip"><h3>${esc(t(`garage.equipment.cat.${cat.id}`))}</h3><ul>${items}</ul></div>`;
  }).join('');
  // the Garage's equipment station, cut to 4:3 (public/media/docs-r1 tanks-equipment-crop)
  const station = pictureMarkup({ src: '/media/docs-r1/tanks-equipment-crop-1280.webp', width: 1280, height: 960, alt: t('docs.tanks.equipmentAlt'),
    sizes: '(width < 768px) 100vw, 480px', rungs: [{ src: '/media/docs-r1/tanks-equipment-crop-640.webp', width: 640 }, { src: '/media/docs-r1/tanks-equipment-crop-1280.webp', width: 1280 }] }, false);
  return `<p>${esc(t('docs.tanks.equipmentLede', { slots: String(EQUIP_SLOTS), items: String(EQUIPMENT_CATALOG.length) }))}</p>`
    + `<figure class="dm-figure dm-figure--crop">${station}</figure><div class="dm-equips">${groups}</div>`;
}


function kitsSection(): string {
  const drone = AERIAL_RULES.drone;
  // the catalog (2026-10-26): every consumable with its badge, name, effect and cooldown (ui/equipIcons.ts, as the
  // equipment list's)
  const kits = CONSUMABLE_RULES.map((rule) => `<li>${consumableIconSVG(rule.id, 26)}<div><b>${esc(t(consumableNameKey(rule.id)))}</b>`
    + `<span>${esc(t(consumableEffectKey(rule.id)))} · ${esc(t('docs.tanks.cooldown', { value: String(rule.cooldownS) }))}</span></div></li>`).join('');
  const systems: Array<[IconId, string, Record<string, string>]> = [
    ['smoke', 'docs.tanks.smoke', { screen: String(SMOKE_DURATION_S), cooldown: String(SMOKE_COOLDOWN_S) }],
    ['modeDrone', 'docs.tanks.drone', { battery: String(drone.batteryS), range: String(drone.rangeM), spot: String(drone.spotRangeM), cooldown: String(drone.cooldownS) }],
    ['roofGun', 'docs.tanks.roofGun', {}],
  ];
  const figure = pictureMarkup({ src: '/media/site50-r14/home/mechanics/consumables.webp', width: 1280, height: 720, alt: t('docs.tanks.kitsAlt'),
    sizes: '(width < 1100px) 100vw, 50vw', rungs: [{ src: '/media/site50-r14/home/mechanics/consumables-640.webp', width: 640 },
      { src: '/media/site50-r14/home/mechanics/consumables.webp', width: 1280 }] }, false);
  return `<p>${esc(t('docs.tanks.kitsLede'))}</p><figure class="dm-figure">${figure}</figure><ul class="dm-roles dm-roles--kits">${kits}</ul>`
    + `<ul class="dm-roles">${systems.map(([glyph, key, values]) => `<li>${icon(glyph, { size: 20 })}<div><b>${esc(t(`${key}.title`))}</b><p>${esc(t(`${key}.body`, values))}</p></div></li>`).join('')}</ul>`;
}

export function tanksSections(): RichSection[] {
  const gallery = hrefForLocale('/gallery', getLocale());
  const sections: Array<[string, string, string]> = [
    ['classes', t('docs.tanks.classes'), `${classesSection()}<p><a class="dm-link" href="${gallery}">${icon('gallery', { size: 16 })}<span>${esc(t('docs.tanks.gallery'))}</span></a></p>`],
    ['roles', t('docs.tanks.roles'), rolesSection()],
    ['tiers', t('docs.tanks.tiers'), tiersSection()],
    ['equipment', t('docs.tanks.equipment'), equipmentSection()],
    ['kits', t('docs.tanks.kits'), kitsSection()],
  ];
  return sections.map(([id, title, html]) => ({ id, title, html, text: plain(html) }));
}
