// The Field Manual's game modes chapter. Copyright © 2026 Kevin B. Liu.
// Every fact comes from the game's own tables: the mode list and icons (src/sim/gameModeCatalog.ts), each mode's rules
// (src/sim/matchRuleset.ts: the same rulesetLines() the Deploy cards print, with the same rules.line.* copy), its
// description (the Deploy menu's playMenu.matchMode.* copy and modeCopyValues), its still (site50-r14/home/modes) and its
// opening objectives (public/minimaps/objectives.json, baked through the battle's own placement), drawn with the HUD's
// glyphs (src/ui/objectiveGlyphs.ts through the SVG recorder). DOM-free: tools/docs-prerender.mjs writes it into the page.
import { GAME_MODE_DEFINITIONS, type GameModeId } from '../../sim/gameModeCatalog.ts';
import {
  isWaveMode, matchRulesetFor, modeCopyValues, rulesetLines, rulesetSides, TEST_DRIVE, type MatchRuleset,
} from '../../sim/matchRuleset.ts';
import { objectiveMarkers, type ObjectiveMarker, type ObjectiveStateView } from '../../ui/minimapObjectives.ts';
import {
  badgeLetter, badgeLetterFont, drawBallGlyph, drawGoalGlyph, drawHexBadge, drawPennant, drawSpawnGlyph, OBJECTIVE_PALETTE,
  sideColor, sideFill, type GlyphLetter,
} from '../../ui/objectiveGlyphs.ts';
import { drawGlyphLetter } from '../../ui/objectiveGlyphLetters.ts';
import { projectWorldToMinimap } from '../../ui/minimapOrientation.ts';
import { icon, type IconId } from '../../ui/icons/icon.ts';
import { getMapName } from '../../world/maps/mapIds.ts';
import { pictureMarkup } from '../../presentation/responsivePicture.ts';
import { t } from '../../ui/i18n.ts';
import { SvgCanvas } from '../svgCanvas.ts';
import type { RichSection } from './types.ts';
import baked from '../../../public/minimaps/objectives.json' with { type: 'json' };

/** A zone's letter in the diagrams' SVG (the glyphs draw none: objectiveGlyphs.ts badgeLetter). */
const diagramLetter: GlyphLetter = { x: 0, y: 0, px: 0, color: '', halo: 0 };
function drawBadgeLetter(c: CanvasRenderingContext2D, label: string, x: number, y: number, r: number): void {
  const letter = badgeLetter(x, y, r, OBJECTIVE_PALETTE.chalk, diagramLetter);
  drawGlyphLetter(c, label, letter, badgeLetterFont(letter.px));
}

/** The chapter's groups: how a mode is won decides where it sits. */
const GROUPS: ReadonlyArray<{ readonly id: string; readonly modes: readonly GameModeId[] }> = [
  { id: 'team', modes: ['standard', 'capture_the_flag', 'zone_control', 'mars', 'gun_game', 'drone', 'realistic'] },
  { id: 'survive', modes: ['endless_horde', 'frontline_assault', 'ac130', 'juggernaut', 'infected'] },
  { id: 'arcade', modes: ['turbo_ball'] },
  { id: 'practice', modes: ['proving_ground'] },
];

/** The battlefield each mode's objectives are drawn on (the Gravity Mode on its Mars map). */
const DIAGRAM_MAP: Partial<Record<GameModeId, string>> = { mars: 'mars' };
const DEFAULT_DIAGRAM_MAP = 'verdant';

export const modeAnchor = (mode: string): string => mode.replace(/_/g, '-');

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

const modeName = (mode: GameModeId): string => t(`playMenu.matchMode.${mode}.label`);
const modeDescription = (mode: GameModeId): string => {
  const values = Object.fromEntries(Object.entries(modeCopyValues(mode)).map(([key, value]) => [key, String(value)]));
  return t(`playMenu.matchMode.${mode}.desc`, values);
};

/** How a mode is won, in one short phrase (the at-a-glance table). */
function winBy(mode: GameModeId, rules: MatchRuleset): string {
  // the Deploy card's own target (modeCopyValues), where the ruleset leaves the score to the mode's default
  const target = String(rules.scoreTarget ?? modeCopyValues(mode).target);
  const values: Record<string, string> = {
    target,
    hold: String(rules.assault?.holdS ?? 0),
    minutes: String(Math.round((rules.timeLimitS ?? 0) / 60)),
    weapons: String(modeCopyValues(mode).weapons ?? 5),
  };
  return t(`docs.modes.win.${mode}`, values);
}

const clockText = (rules: MatchRuleset): string => (rules.timeLimitS == null ? t('docs.modes.none')
  : t('docs.modes.minutes', { value: String(Math.round(rules.timeLimitS / 60)) }));
const respawnText = (rules: MatchRuleset): string => (rules.respawnS == null ? t('docs.modes.none')
  : t('docs.modes.seconds', { value: String(rules.respawnS) }));
function sidesText(rules: MatchRuleset): string {
  if (rules.provingGround) return t('docs.modes.lanes', { value: String(rules.provingGround.lanes.length) });
  if (isWaveMode(rules.mode)) return t('docs.modes.sides', { allies: String((rules.allies ?? 0) + 1), enemies: String(rules.enemies ?? 0) });
  const sides = rulesetSides(rules);
  return t('docs.modes.sides', { allies: String(sides.allies + 1), enemies: String(sides.enemies) });
}

/** The card's own facts (clock, sides, respawn, the win) stand above the chips: the chips are the Deploy card's other lines. */
const FACT_LINES = new Set(['respawn', 'noRespawn', 'clock', 'clockDefeat', 'noClock', 'sides', 'allies', 'noAllies', 'enemyPool', 'scoreTarget', 'provingLanes']);

/** The mode's rule chips: the Deploy card's lines (rulesetLines, rules.line.* copy) past its facts. */
const ruleChips = (rules: MatchRuleset): string[] => rulesetLines(rules).filter((line) => !FACT_LINES.has(line.key))
  .map((line) => t(`rules.line.${line.key}`, line.values));

interface BakedMap { readonly size: number; readonly modes: Readonly<Record<string, ObjectiveStateView>> }
const BAKED = baked as unknown as { readonly maps: Readonly<Record<string, BakedMap>> };

/** Standard places no objective: its map shows the two spawns (as the Deploy screen's). */
function markersOf(state: ObjectiveStateView): ObjectiveMarker[] {
  if (state.id !== 'standard') return objectiveMarkers(state);
  return (state.spawns ?? []).map((spawn): ObjectiveMarker => ({
    kind: 'spawn', x: spawn.x, z: spawn.z, side: spawn.team === 'alpha' ? 'own' : 'enemy', priority: 0,
  }));
}

const DIAGRAM_BOX = 220;
const _point = [0, 0];

/** The mode's opening objectives over the battlefield's tactical map, or '' when the bake leaves the mode out. */
export function objectiveDiagram(mode: string, mapId: string, box = DIAGRAM_BOX): string {
  const map = BAKED.maps[mapId];
  const state = map?.modes[mode];
  if (!map || !state) return '';
  const ctx = new SvgCanvas();
  const r = Math.max(7, box * 0.05);
  for (const marker of markersOf(state)) {
    projectWorldToMinimap(marker.x, marker.z, map.size, box, _point);
    const x = Math.max(r, Math.min(box - r, _point[0])), y = Math.max(r, Math.min(box - r, _point[1]));
    const color = sideColor(marker.side), fill = sideFill(marker.side);
    const c = ctx as unknown as CanvasRenderingContext2D;
    switch (marker.kind) {
      case 'spawn': drawSpawnGlyph(c, x, y, r * 0.8, color, fill); break;
      case 'zone':
      case 'sector':
        drawHexBadge(c, x, y, r, { fill, stroke: color, dashed: marker.status === 'locked' });
        drawBadgeLetter(c, marker.label ?? '', x, y, r);
        break;
      case 'flagBase': drawPennant(c, x, y, r * 1.6, color); break;
      case 'goal': drawGoalGlyph(c, x, y, r * 0.8, color, fill); break;
      case 'ball': drawBallGlyph(c, x, y, r * 0.5); break;
      default: break;
    }
  }
  const name = getMapName(mapId);
  return `<figure class="dm-objectives"><span class="dm-objectives__map">`
    + `<img src="/minimaps/${mapId}.webp" width="440" height="440" alt="" loading="lazy" decoding="async">`
    + `<svg viewBox="0 0 ${box} ${box}" role="img" aria-label="${esc(t('docs.modes.diagramAria', { mode: modeName(mode as GameModeId), map: name }))}">`
    + `${ctx.markup()}</svg></span><figcaption>${esc(t(`map.${mapId}`))}</figcaption></figure>`;
}

/** The glyph legend: what the diagrams draw. */
function legend(): string {
  const box = 28, r = 8;
  const glyph = (draw: (c: CanvasRenderingContext2D) => void): string => {
    const ctx = new SvgCanvas();
    draw(ctx as unknown as CanvasRenderingContext2D);
    return `<svg viewBox="0 0 ${box} ${box}" width="${box}" height="${box}" aria-hidden="true">${ctx.markup()}</svg>`;
  };
  const m = box / 2;
  const items: Array<[string, string]> = [
    [glyph((c) => drawSpawnGlyph(c, m, m, r * 0.9, sideColor('own'), sideFill('own'))), t('docs.modes.legend.ownSpawn')],
    [glyph((c) => drawSpawnGlyph(c, m, m, r * 0.9, sideColor('enemy'), sideFill('enemy'))), t('docs.modes.legend.enemySpawn')],
    [glyph((c) => {
      drawHexBadge(c, m, m, r * 1.1, { fill: sideFill('neutral'), stroke: sideColor('neutral') });
      drawBadgeLetter(c, 'A', m, m, r * 1.1);
    }), t('docs.modes.legend.zone')],
    [glyph((c) => drawPennant(c, m, m, r * 2, sideColor('enemy'))), t('docs.modes.legend.flag')],
    [glyph((c) => drawGoalGlyph(c, m, m, r * 0.9, sideColor('enemy'), sideFill('enemy'))), t('docs.modes.legend.goal')],
    [glyph((c) => drawBallGlyph(c, m, m, r * 0.6)), t('docs.modes.legend.ball')],
  ];
  return `<ul class="dm-legend">${items.map(([svg, label]) => `<li>${svg}<span>${esc(label)}</span></li>`).join('')}</ul>`;
}

function modeStill(mode: GameModeId): string {
  if (mode === 'proving_ground') {
    return pictureMarkup({ src: `/maps/cards/${TEST_DRIVE.mapId}.webp`, width: 1280, height: 720, alt: '', sizes: '(width < 900px) 100vw, 40vw',
      rungs: [{ src: `/maps/thumbs/${TEST_DRIVE.mapId}.webp`, width: 512 }, { src: `/maps/cards/${TEST_DRIVE.mapId}.webp`, width: 1280 }] }, false);
  }
  const src = `/media/site50-r14/home/modes/${mode}.webp`;
  return pictureMarkup({ src, width: 1280, height: 720, alt: '', sizes: '(width < 900px) 100vw, 40vw',
    rungs: [{ src: `/media/site50-r14/home/modes/${mode}-640.webp`, width: 640 }, { src, width: 1280 }] }, false);
}

function modeCard(mode: GameModeId): string {
  const rules = matchRulesetFor(mode);
  const definition = GAME_MODE_DEFINITIONS[mode];
  const chips = ruleChips(rules);
  const diagram = mode === 'proving_ground' ? '' : objectiveDiagram(mode, DIAGRAM_MAP[mode] ?? DEFAULT_DIAGRAM_MAP);
  const facts: Array<[IconId, string, string]> = [
    ['clock', t('docs.modes.col.clock'), clockText(rules)],
    ['team', t('docs.modes.col.sides'), sidesText(rules)],
    ['skull', t('docs.modes.col.respawn'), respawnText(rules)],
  ];
  return `<article class="dm-mode" id="${modeAnchor(mode)}"><div class="dm-mode__media${diagram ? ' has-map' : ''}">`
    + `<div class="dm-mode__still">${modeStill(mode)}</div>${diagram}</div>`
    + `<div class="dm-mode__body"><h3>${icon(definition.icon as IconId, { size: 20 })}<span>${esc(modeName(mode))}</span></h3>`
    + `<p>${esc(modeDescription(mode))}</p>`
    + `<dl class="dm-mode__facts">${facts.map(([glyph, label, value]) => `<div>${icon(glyph, { size: 16 })}<dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`
    + `${chips.length ? `<ul class="dm-chips">${chips.map((chip) => `<li>${esc(chip)}</li>`).join('')}</ul>` : ''}</div></article>`;
}

function glanceTable(): string {
  const rows = GROUPS.flatMap((group) => group.modes).map((mode) => {
    const rules = matchRulesetFor(mode);
    return `<tr><th scope="row"><a href="#${modeAnchor(mode)}">${icon(GAME_MODE_DEFINITIONS[mode].icon as IconId, { size: 16 })}`
      + `<span>${esc(modeName(mode))}</span></a></th><td>${esc(winBy(mode, rules))}</td><td>${esc(clockText(rules))}</td>`
      + `<td>${esc(respawnText(rules))}</td><td>${esc(sidesText(rules))}</td></tr>`;
  }).join('');
  const head = ['mode', 'win', 'clock', 'respawn', 'sides'].map((col) => `<th scope="col">${esc(t(`docs.modes.col.${col}`))}</th>`).join('');
  return `<div class="dm-table" tabindex="0" role="region" aria-label="${esc(t('docs.modes.glance'))}"><table>`
    + `<thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/** The chapter's sections: the table to pick from, then each group's mode cards. */
export function modesSections(): RichSection[] {
  const sections: RichSection[] = [];
  const glance = `${glanceTable()}${legend()}`;
  sections.push({ id: 'glance', title: t('docs.modes.glance'), html: glance, text: plain(glance) });
  for (const group of GROUPS) {
    const html = `<div class="dm-modes">${group.modes.map(modeCard).join('')}</div>`;
    sections.push({ id: group.id, title: t(`docs.modes.group.${group.id}`), html, text: plain(html) });
  }
  return sections;
}
