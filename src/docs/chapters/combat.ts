// The Field Manual's armour, angling and spotting chapter. Copyright © 2026 Kevin B. Liu.
// The charts plot the game's own functions: effective thickness against impact angle (src/sim/damage.ts
// effectiveThickness, SHELL_BEHAVIOR), penetration against range (src/sim/ballistics.ts penAtDistanceMm, for the Leclerc
// XLR's shells from the fleet's asset table) and spot range against camo (src/sim/spotting.ts spotRangeM). The rules
// and numbers beside them are the sim's constants; the module table is src/sim/moduleCatalog.ts; the pictures are the
// Leclerc XLR's own armour and module drawings (258: public/icons/<id>_drawing*, its side plate and the overlay traced
// from its combat anatomy, as static markup: src/ui/technicalDrawingMarkup.ts), the mechanics stills and the
// battle shots in public/media/docs-r1 (the armour overlay, the kill cam, the spotting lamp); the overlay's key is
// src/game/input.ts's default. Node only (tools/docs-prerender.mjs).
import {
  AMMORACK_RELOAD_MULT, CREW_HIT_CHANCE, CREW_HIT_CHANCE_HE, ENGINE_FIRE_CHANCE, FIRE_BASE_TICKS, FIRE_EXTINGUISH_CHANCE,
  FIRE_TICK_HP_FRAC, HEAT_GAP_LOSS_PER_M, OVERMATCH_NO_RICOCHET, REPAIR_S, RICOCHET_MAX_BOUNCES, ROLL_LOW, ROLL_SPAN,
  SHELL_BEHAVIOR, effectiveThickness,
} from '../../sim/damage.ts';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { penAtDistanceMm } from '../../sim/ballistics.ts';
import { MODULE_DEFS, MODULE_IDS } from '../../sim/moduleCatalog.ts';
import {
  CAMO_PAINT_BONUS, MAX_BUSH_BONUS, MAX_SPOT_RANGE_M, MIN_SPOT_RANGE_M, OPTICS_VIEW_FACTOR, RADIO_DAMAGED_FACTOR, SIGNAL_RANGE_M,
  SIXTH_SENSE_DELAY_S, SIXTH_SENSE_SHOW_S, SPOT_LINGER_S, spotRangeM,
} from '../../sim/spotting.ts';
import { DEFAULT_BINDINGS, labelForCode } from '../../game/input.ts';
import { pictureMarkup } from '../../presentation/responsivePicture.ts';
import { icon, type IconId } from '../../ui/icons/icon.ts';
import { t } from '../../ui/i18n.ts';
import { parseTechnicalDrawing, type TechnicalDrawingData } from '../../ui/technicalDrawingData.ts';
import { technicalDrawingMarkup } from '../../ui/technicalDrawingMarkup.ts';
import { lineChart, type ChartSeries } from './charts.ts';
import { fleetTanks, type FleetTank } from './fleet.ts';
import type { RichSection } from './types.ts';
import { designationHtml } from '../designations.ts';

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const pct = (share: number): string => String(Math.round(share * 100));
/** A share as a percentage to one decimal (0.035 → 3.5). */
const pct1 = (share: number): string => String(Math.round(share * 1000) / 10);
const p = (key: string, values: Readonly<Record<string, string>> = {}): string => `<p>${esc(t(key, values))}</p>`;
const list = (keys: ReadonlyArray<readonly [string, Readonly<Record<string, string>>]>): string =>
  `<ul class="dm-facts">${keys.map(([key, values]) => `<li>${esc(t(key, values))}</li>`).join('')}</ul>`;

/** The reference tank whose shells the range chart draws (the fleet's quality exemplar). */
const REFERENCE_TANK = 'leclerc_xlr';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
let referenceDrawing: TechnicalDrawingData | null = null;
/** Its technical drawing's data (tools/genDrawings.mjs writes it beside its plates). */
const drawing = (): TechnicalDrawingData => (referenceDrawing ??= parseTechnicalDrawing(
  JSON.parse(readFileSync(join(ROOT, `public/icons/${REFERENCE_TANK}_drawing.json`), 'utf8')), REFERENCE_TANK));

/** A docs-r1 still (public/media/docs-r1, the media lane's Field Manual shots) as a full-width figure. */
const docsStill = (slot: string, alt: string): string => `<figure class="dm-figure">${pictureMarkup({ src: `/media/docs-r1/${slot}-1920.webp`, width: 1920, height: 1080,
  alt, sizes: '(width < 1100px) 100vw, 50vw', rungs: [{ src: `/media/docs-r1/${slot}-640.webp`, width: 640 }, { src: `/media/docs-r1/${slot}-1920.webp`, width: 1920 }] }, false)}</figure>`;

const still = (name: string, alt: string): string => pictureMarkup({ src: `/media/site50-r14/home/mechanics/${name}.webp`, width: 1280, height: 720, alt,
  sizes: '(width < 1100px) 100vw, 50vw', rungs: [{ src: `/media/site50-r14/home/mechanics/${name}-640.webp`, width: 640 },
    { src: `/media/site50-r14/home/mechanics/${name}.webp`, width: 1280 }] }, false);

/** Effective thickness of a 100 mm plate against impact angle, per shell kind, up to each kind's ricochet angle. */
function angleChart(): string {
  const plate = { physicalMm: 100, keMm: 100, ceMm: 100 };
  const kinds: Array<[keyof typeof SHELL_BEHAVIOR, number, ChartSeries['tone']]> = [['AP', 75, 'a'], ['APCR', 75, 'b'], ['APFSDS', 120, 'c'], ['HEAT', 120, 'd']];
  const series = kinds.map(([type, caliberMm, tone]): ChartSeries => {
    const limit = Math.min(SHELL_BEHAVIOR[type].ricochetDeg, 80);
    const points: Array<[number, number]> = [];
    for (let angle = 0; angle <= limit; angle += 2) {
      const shell = { type, caliberMm } as unknown as Parameters<typeof effectiveThickness>[0];
      points.push([angle, effectiveThickness(shell, plate as unknown as Parameters<typeof effectiveThickness>[1], angle).effMm]);
    }
    const ricochet = SHELL_BEHAVIOR[type].ricochetDeg;
    return { label: t('docs.combat.chart.shell', { type, caliber: String(caliberMm) }), points, tone,
      end: ricochet <= 80 ? t('docs.combat.chart.ricochet', { angle: String(ricochet) }) : undefined };
  });
  return lineChart({ title: t('docs.combat.chart.angleTitle'), series,
    x: { min: 0, max: 80, ticks: [0, 15, 30, 45, 60, 75], unit: '°', label: t('docs.combat.chart.angle') },
    y: { min: 0, max: 500, ticks: [100, 200, 300, 400, 500], unit: 'mm', label: t('docs.combat.chart.effective') } });
}

type ShellRow = FleetTank['shells'][number];
function rangeChart(shells: readonly ShellRow[], tank: string): string {
  const tones: ChartSeries['tone'][] = ['c', 'd', 'a', 'b'];
  const series = shells.filter((shell) => shell.pen100Mm > 100).map((shell, i): ChartSeries => {
    const points: Array<[number, number]> = [];
    for (let m = 100; m <= 2000; m += 100) points.push([m, penAtDistanceMm({ ...shell, pen2000Mm: shell.pen2000Mm ?? 0 }, m)]);
    return { label: `${shell.name}`, points, tone: tones[i % tones.length] };
  });
  return lineChart({ title: t('docs.combat.chart.rangeTitle', { tank }), series,
    x: { min: 0, max: 2000, ticks: [100, 500, 1000, 1500, 2000], unit: 'm', label: t('docs.combat.chart.range') },
    y: { min: 0, max: 1000, ticks: [200, 400, 600, 800, 1000], unit: 'mm', label: t('docs.combat.chart.pen') } });
}

/** Spot range against the target's camo, for three of the fleet's view ranges. */
function spotChart(): string {
  const views: Array<[number, ChartSeries['tone']]> = [[MAX_SPOT_RANGE_M, 'c'], [380, 'a'], [300, 'b']];
  const series = views.map(([view, tone]): ChartSeries => {
    const points: Array<[number, number]> = [];
    for (let c = 0; c <= 60; c += 2) points.push([c, spotRangeM(view, c / 100)]);
    return { label: t('docs.combat.chart.view', { value: String(view) }), points, tone };
  });
  return lineChart({ title: t('docs.combat.chart.spotTitle'), series,
    x: { min: 0, max: 60, ticks: [0, 10, 20, 30, 40, 50, 60], unit: '%', label: t('docs.combat.chart.camo') },
    y: { min: 0, max: 500, ticks: [100, 200, 300, 400, 500], unit: 'm', label: t('docs.combat.chart.spot') } });
}

/** Each module's glyph in the sprite (the Gallery's damage workbench draws the same). */
const MODULE_ICONS: Readonly<Record<string, IconId>> = {
  gun: 'gun', turretRing: 'turretRing', gunMount: 'gunMount', autoloader: 'autoloader', feedSystem: 'feedSystem', roofGun: 'roofGun',
  missileRack: 'missileRack', engine: 'engine', transmission: 'transmission', fuelTank: 'fuelTank', ammoRack: 'ammoRack', radio: 'radio',
  optics: 'optics', trackL: 'track', trackR: 'track',
};

function moduleTable(): string {
  const rows = MODULE_IDS.map((id) => `<tr><th scope="row"><span class="dm-cell">${icon(MODULE_ICONS[id] ?? 'damage', { size: 18 })}<span>${esc(t(`garage.module.${id}`))}</span></span></th><td class="num">${MODULE_DEFS[id].hp}</td>`
    + `<td class="num">${pct(MODULE_DEFS[id].damageChance)} %</td></tr>`).join('');
  return `<div class="dm-table" tabindex="0" role="region" aria-label="${esc(t('docs.combat.modulesAria'))}"><table><thead><tr>`
    + `<th scope="col">${esc(t('docs.combat.col.module'))}</th><th scope="col">${esc(t('docs.combat.col.hp'))}</th>`
    + `<th scope="col">${esc(t('docs.combat.col.chance'))}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function combatSections(): RichSection[] {
  const reference = fleetTanks().get(REFERENCE_TANK);
  if (!reference) throw new Error(`docs: the reference tank ${REFERENCE_TANK} left the fleet`);
  const tank = reference.name;
  const roll = `${pct(ROLL_LOW)}–${pct(ROLL_LOW + ROLL_SPAN)}`;
  const behavior = (type: keyof typeof SHELL_BEHAVIOR): Record<string, string> => ({
    norm: String(SHELL_BEHAVIOR[type].normDeg), ricochet: String(SHELL_BEHAVIOR[type].ricochetDeg),
  });
  // the diagrams' labels are the picture's (aria-hidden), not the section's text: search leaves them out
  const overlays: string[] = [];
  const diagram = (view: 'armor' | 'modules', alt: string): string => {
    // the drawing and its key are the picture's (the key aria-hidden): search leaves them out
    const overlay = technicalDrawingMarkup(drawing(), 'side', view, { alt });
    overlays.push(overlay);
    return `<figure class="dm-diagram">${overlay}<figcaption>${designationHtml(alt)}</figcaption></figure>`;
  };
  const overlayKey = DEFAULT_BINDINGS.hitboxOverlay;
  if (!overlayKey) throw new Error('docs: the armour overlay has no default key');
  // the armour overlay's key cap goes in after escaping: the copy names it as {key}
  const overlay = `<p>${esc(t('docs.combat.overlay', { key: '\u0000' })).replace('\u0000', `<kbd class="cot-c-kbd">${esc(labelForCode(overlayKey))}</kbd>`)}</p>`;
  const sections: Array<[string, string, string]> = [
    ['penetration', t('docs.combat.penetration'),
      p('docs.combat.penetrationLede', { roll }) + rangeChart(reference.shells, tank)
      + list([['docs.combat.fact.range', {}], ['docs.combat.fact.roll', { roll }], ['docs.combat.fact.heat', {}]])
      + `<h3>${esc(t('docs.combat.overlayTitle'))}</h3>${overlay}${docsStill('combat-armor', t('docs.combat.overlayAlt'))}`],
    ['angling', t('docs.combat.angling'),
      p('docs.combat.anglingLede') + angleChart()
      + list([['docs.combat.fact.slope', {}], ['docs.combat.fact.apfsds', behavior('APFSDS')], ['docs.combat.fact.ap', behavior('AP')],
        ['docs.combat.fact.overmatch', { times: String(OVERMATCH_NO_RICOCHET) }], ['docs.combat.fact.bounces', { bounces: String(RICOCHET_MAX_BOUNCES) }]])
      + `<div class="dm-pair">${still('ricochet', t('docs.combat.ricochetAlt'))}${diagram('armor', t('docs.combat.armorAlt', { tank }))}</div>`],
    ['special', t('docs.combat.special'),
      p('docs.combat.specialLede')
      + list([['docs.combat.fact.spaced', { loss: String(Math.round(HEAT_GAP_LOSS_PER_M * 10)) }], ['docs.combat.fact.era', {}], ['docs.combat.fact.he', {}]])
      + `<figure class="dm-figure">${still('era', t('docs.combat.eraAlt'))}</figure>`],
    ['modules', t('docs.combat.modules'),
      p('docs.combat.modulesLede', { repair: String(REPAIR_S) }) + `<div class="dm-pair">${diagram('modules', t('docs.combat.modulesAlt', { tank }))}${moduleTable()}</div>`
      + list([['docs.combat.fact.ammoRack', { reload: String(AMMORACK_RELOAD_MULT) }],
        ['docs.combat.fact.fire', { chance: pct(ENGINE_FIRE_CHANCE), ticks: String(FIRE_BASE_TICKS), tick: pct1(FIRE_TICK_HP_FRAC), out: pct(FIRE_EXTINGUISH_CHANCE) }],
        ['docs.combat.fact.crew', { hit: pct(CREW_HIT_CHANCE), he: pct(CREW_HIT_CHANCE_HE) }],
        ['docs.combat.fact.optics', { view: pct(1 - OPTICS_VIEW_FACTOR) }],
        ['docs.combat.fact.radio', { range: String(SIGNAL_RANGE_M), damaged: String(SIGNAL_RANGE_M * RADIO_DAMAGED_FACTOR) }]])
      + `<h3>${esc(t('docs.combat.killcamTitle'))}</h3>${p('docs.combat.killcam')}${docsStill('combat-killcam', t('docs.combat.killcamAlt'))}`],
    ['spotting', t('docs.combat.spotting'),
      p('docs.combat.spottingLede', { min: String(MIN_SPOT_RANGE_M), max: String(MAX_SPOT_RANGE_M) }) + spotChart()
      + list([['docs.combat.fact.close', { min: String(MIN_SPOT_RANGE_M) }], ['docs.combat.fact.linger', { linger: String(SPOT_LINGER_S) }],
        ['docs.combat.fact.sixth', { delay: String(SIXTH_SENSE_DELAY_S), show: String(SIXTH_SENSE_SHOW_S) }],
        ['docs.combat.fact.firing', {}], ['docs.combat.fact.bushes', { bush: pct(MAX_BUSH_BONUS), paint: pct1(CAMO_PAINT_BONUS) }]])
      + docsStill('combat-spotting', t('docs.combat.spottingAlt'))],
  ];
  return sections.map(([id, title, html]) => ({ id, title, html, text: plain(overlays.reduce((rest, overlay) => rest.replace(overlay, ''), html)) }));
}
