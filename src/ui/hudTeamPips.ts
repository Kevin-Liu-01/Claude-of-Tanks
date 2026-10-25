// The team strip (brand-ui H3, the direction's 06-battle-hud.html .pips and .sectors). Copyright © 2026 Kevin B. Liu.
//
// One silhouette pip per tank, own on the left facing in, enemy on the right facing in, the player's own pip ringed in
// the accent; a destroyed tank's pip goes hollow and is struck through. The pips ride the score plate's lower edge
// (owner 2026-10-25: the top block "less so big and wide", one small unit) where a host is given, and show on the mouse
// layouts wide and tall enough for them (laptop and desktop, 720 px and up). Under the plate, a chip for every capture
// zone or sector, drawn by the shared glyph set (objectiveGlyphs.ts drawObjectiveChip) from the shared marker derivation
// (minimapObjectives.ts), so a zone reads the same on the strip, the map and the field; the chips' row is measured by
// battleHudLayout.ts.
// Nothing here runs per frame: a pip changes only when its tank dies or returns, a chip only when its zone moves.

import { createElement as el } from './dom.ts';
import { ensureStyle } from './styleLayers.ts';
import { iconUrl } from './icons.ts';
import { FONT_COND } from './fonts.ts';
import { drawObjectiveChip } from './objectiveGlyphs.ts';
import { tokenEpoch } from './tokens/tokenSelection.ts';
import type { ObjectiveMarker } from './minimapObjectives.ts';

/** Teams larger than this read on the rosters' silhouette grid instead: the pips keep to the score plate's width. */
const MAX_TEAM_PIPS = 16;
/** A chip's box (CSS px) and its hexagon's radius: the direction's 38 x 42 sector glyph. */
const CHIP_W = 38, CHIP_H = 42, CHIP_R = 15;
/** A chip's scale where the top is not wide (a smaller window, a short one, touch). */
const NARROW_CHIP = 0.72;
const CHIP_FONT = `700 14px ${FONT_COND}`;

const CSS = `
.cot-pips{position:absolute;z-index:var(--hud-layer-score);left:50%;top:var(--hud-pips-top,82px);transform:translateX(-50%);
  display:none;flex-direction:column;align-items:center;gap:10px;pointer-events:none}
/* (the strip holds the zone chips alone, the pips riding the score plate: it shows at every size, its chips smaller where
   the top is not wide, hung under the objective there (battleHudLayout.ts): gauntlet r3 found zone state on the map's
   markers alone at 1024x600, 900x700 and the phones) */
.cot-pips.show{display:flex}
/* the proving ground has no sides and a flight hides the tank's chrome */
:is(.range-mode,.aerial-active) .cot-pips.show{display:none}
.cot-pips-row{display:flex;gap:22px;align-items:center}
.cot-pips-row[hidden],.cot-pips-row .side:empty,.cot-pips-sectors:empty{display:none}
.cot-pips-row .side{display:flex;gap:4px;align-items:center}
.cot-pips-row .pip{position:relative;display:block;flex:0 1 30px;min-width:12px;height:12px;color:var(--team-own);filter:var(--sil-shadow)}
.cot-pips-row .enemy .pip{color:var(--team-enemy)}
.cot-pips-row .pip::before,.cot-pips-row .pip i{content:'';position:absolute;inset:0;background:currentColor;
  -webkit-mask:var(--sil) center/contain no-repeat;mask:var(--sil) center/contain no-repeat}
.cot-pips-row .enemy .pip::before,.cot-pips-row .enemy .pip i{transform:scaleX(-1)}
.cot-pips-row .pip i{display:none;inset:2px 3px;background:var(--glyph-plate)}
.cot-pips-row .pip.me{outline:1px solid var(--accent);outline-offset:2px}
.cot-pips-row .pip.dead{opacity:.55}
.cot-pips-row .pip.dead i{display:block}
.cot-pips-row .pip.dead::after{content:'';position:absolute;left:3px;right:3px;top:calc(50% - .75px);height:1.5px;
  background:currentColor;transform:rotate(-18deg)}
/* in the score plate (hud.ts .cot-top): the lower row, each side's pips running out from the centre line. A silhouette
   reads as a dash at the plate's size, so a pip there is a segment slanted with the plate's edges: the player's own in
   the accent, a destroyed tank's hollow. Seven a side keep the plate to its scores' width, sixteen inside its 400 px. */
.cot-top .cot-pips-row{grid-column:1/-1;grid-row:2;display:none;justify-content:center;gap:var(--s3);min-width:0}
body:not(.cot-touch-layout):is([data-cot-width='laptop'],[data-cot-width='desktop']):is([data-cot-height='standard'],[data-cot-height='tall']) .cot-top .cot-pips-row:not([hidden]){display:flex}
body:not(.cot-touch-layout):is([data-cot-width='laptop'],[data-cot-width='desktop']):is([data-cot-height='standard'],[data-cot-height='tall']) :is(.range-mode,.aerial-active) .cot-top .cot-pips-row:not([hidden]){display:none}
.cot-top .cot-pips-row .side{flex:0 1 auto;min-width:0;gap:3px}
.cot-top .cot-pips-row .pip{flex:0 1 10px;min-width:5px;height:5px;filter:none}
.cot-top .cot-pips-row .pip::before{-webkit-mask:none;mask:none;transform:skewX(-24deg)}
.cot-top .cot-pips-row .enemy .pip::before{transform:skewX(24deg)}
.cot-top .cot-pips-row .pip i{-webkit-mask:none;mask:none;inset:1px;transform:skewX(-24deg)}
.cot-top .cot-pips-row .enemy .pip i{transform:skewX(24deg)}
.cot-top .cot-pips-row .pip.me{outline:0;color:var(--accent)}
.cot-top .cot-pips-row .pip.dead::after{display:none}
.cot-pips-sectors{display:flex;gap:10px}
.cot-pips-sectors canvas{display:block;width:${Math.round(CHIP_W * NARROW_CHIP)}px;height:${Math.round(CHIP_H * NARROW_CHIP)}px}
body:not(.cot-touch-layout):is([data-cot-width='laptop'],[data-cot-width='desktop']):is([data-cot-height='standard'],[data-cot-height='tall']) .cot-pips-sectors{gap:16px}
body:not(.cot-touch-layout):is([data-cot-width='laptop'],[data-cot-width='desktop']):is([data-cot-height='standard'],[data-cot-height='tall']) .cot-pips-sectors canvas{width:${CHIP_W}px;height:${CHIP_H}px}
`;

/** What the strip reads of a roster entry (the HUD's tanks satisfy it). */
interface PipTank {
  id: string;
  isPlayer?: boolean;
  team?: string;
  spec?: { id: string } | null;
  combat?: { destroyed?: boolean } | null;
}

interface Pip { node: HTMLElement; own: boolean; dead: boolean | null; me: boolean; seen: number }
interface Chip { canvas: HTMLCanvasElement; key: string }

interface TeamPipsRuntime {
  root: HTMLElement;
  /**
   * The rosters as the HUD tallies them; `ownTeam` is the player's side. `ringId` rings one more tank than the player's
   * (a watched battle's ridden tank, on whichever side it fights). Writes only what changed.
   */
  updateTeams(tanks: readonly PipTank[], ownTeam: string | undefined, playerId: string | null, ringId?: string | null): void;
  /** The mode's zone and sector markers (the rest are ignored). */
  updateSectors(markers: readonly ObjectiveMarker[]): void;
}

/** The strip under `parent`; the pips' row goes into `rowHost` where one is given (the score plate), leaving the strip
 *  the zone chips alone. */
export function createTeamPips(parent: HTMLElement, rowHost?: HTMLElement): TeamPipsRuntime {
  ensureStyle('cot-hud-pips-style', CSS, 'surfaces');
  const root = el('div', 'cot-pips', parent);
  root.setAttribute('aria-hidden', 'true');
  const row = el('div', 'cot-pips-row', rowHost ?? root);
  if (rowHost) row.setAttribute('aria-hidden', 'true');
  const ownSide = el('span', 'side own', row);
  const enemySide = el('span', 'side enemy', row);
  const sectors = el('div', 'cot-pips-sectors', root);
  const pips = new Map<string, Pip>();
  const chips: Chip[] = [];
  let pass = 0, rowShown = false, chipEpoch = -1;
  const dpr = Math.min(2, Math.max(1, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));

  function refreshShown(): void {
    const shown = (rowShown && !rowHost) || chips.length > 0;
    if (root.classList.contains('show') !== shown) root.classList.toggle('show', shown);
  }

  function createPip(tank: PipTank, own: boolean, me: boolean): Pip {
    const node = el('span', 'pip');
    node.style.setProperty('--sil', `url(${JSON.stringify(iconUrl(tank.spec!.id, 'side_silhouette'))})`);
    el('i', '', node);
    if (me) {
      node.classList.add('me');
      (own ? ownSide : enemySide).prepend(node);
    } else (own ? ownSide : enemySide).append(node);
    const pip = { node, own, dead: null, me, seen: pass };
    pips.set(tank.id, pip);
    return pip;
  }

  function updateTeams(tanks: readonly PipTank[], ownTeam: string | undefined, playerId: string | null, ringId: string | null = null): void {
    pass++;
    let own = 0, enemy = 0;
    for (const tank of tanks) {
      if (!tank?.spec) continue;
      const ally = tank.team === ownTeam || tank.id === playerId || !!tank.isPlayer;
      if (ally) own++; else enemy++;
      let pip = pips.get(tank.id);
      // a tank that changed sides (a lobby reshuffle) takes a new pip on its new side
      if (pip && pip.own !== ally) { pip.node.remove(); pips.delete(tank.id); pip = undefined; }
      const me = !!tank.isPlayer || (ringId != null && tank.id === ringId);
      pip ??= createPip(tank, ally, me);
      if (pip.me !== me) { pip.node.classList.toggle('me', me); pip.me = me; }
      pip.seen = pass;
      const dead = !!tank.combat?.destroyed;
      if (pip.dead !== dead) { pip.node.classList.toggle('dead', dead); pip.dead = dead; }
    }
    for (const [id, pip] of pips) if (pip.seen !== pass) { pip.node.remove(); pips.delete(id); }
    const fits = own + enemy > 0 && own <= MAX_TEAM_PIPS && enemy <= MAX_TEAM_PIPS;
    if (fits !== rowShown) { rowShown = fits; row.hidden = !fits; refreshShown(); }
  }

  function paintChip(chip: Chip, marker: ObjectiveMarker): void {
    const ctx = chip.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, CHIP_W, CHIP_H);
    drawObjectiveChip(ctx, CHIP_W / 2, CHIP_H / 2, CHIP_R, {
      side: marker.side, label: marker.label || '', progress: marker.progress ?? 0, progressSide: marker.progressSide,
      font: CHIP_FONT,
    });
  }

  function updateSectors(markers: readonly ObjectiveMarker[]): void {
    const before = chips.length;
    let count = 0;
    const epoch = tokenEpoch();
    const repaintAll = epoch !== chipEpoch;
    chipEpoch = epoch;
    for (const marker of markers) {
      if (marker.kind !== 'zone' && marker.kind !== 'sector') continue;
      let chip = chips[count];
      if (!chip) {
        const canvas = el('canvas', '', sectors);
        canvas.width = Math.round(CHIP_W * dpr);
        canvas.height = Math.round(CHIP_H * dpr);
        chip = { canvas, key: '' };
        chips.push(chip);
      }
      // (the progress in 2 % steps: a capture repaints its chip about 50 times, never per frame)
      const key = `${marker.side}|${marker.label}|${Math.round((marker.progress ?? 0) * 50)}|${marker.progressSide}`;
      if (key !== chip.key || repaintAll) { chip.key = key; paintChip(chip, marker); }
      count++;
    }
    while (chips.length > count) chips.pop()!.canvas.remove();
    if (chips.length !== before) refreshShown();
  }

  return { root, updateTeams, updateSectors };
}
