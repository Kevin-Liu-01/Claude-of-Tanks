// The tech-tree screen: every national tree over the Garage, read-only (owner 2026-10-25: "also show the tech tree on
// our current version, which is purely aesthetic for now"). A lazy chunk with techTree.css and its catalog slice
// (techTreeStrings.ts); the Garage opens it from the game bar, the T key and the phone menu. Every vehicle is available:
// a node selects, and Select takes the node's chosen build into the Garage.
// Columns are the tree's tiers (from its first to its last); rows are its lanes, the special lane under a rule. Nodes
// show the hero render on the nation's flag and the name (two lines when it needs them). Nodes and connectors are placed
// from src/techTree/layout.ts (the receipt checks the same routes): a connector runs along its parent's row and enters
// its child from the left, or, for a second parent, from above or below; every connector ends in an arrowhead.
// Zoom re-lays the grid at a scaled cell, so the type stays crisp (the buttons, ctrl/⌘ + wheel or a trackpad pinch,
// a two-finger pinch, + − 0); a drag pans, and a node too small for its name gives it to the kit's hover tip.
// No WebGL and no canvas: nodes reuse the offline hero renders (heroCard.ts). First-party: Kevin B. Liu (NOTICE.md).

import type { FleetTankSpec } from '../vehicles/specContracts.ts';
import type { NationTree, TreeNode } from '../techTree/model.ts';
import { layoutTree, type GridPoint, type TreeLayout } from '../techTree/layout.ts';
import { TECH_TREES, rootOf, vehiclesOf } from '../techTree/trees.ts';
import { esc, scaleCells, statRow } from './components/components.ts';
import { flag, silhouette } from './components/identity.ts';
import { closeSurface, openSurface, type TransientSurface } from './components/surfaceStack.ts';
import { decorateHeroTile } from './heroCard.ts';
import { datumAttr } from './dom.ts';
import { iconUrl } from './icons.ts';
import { icon } from './icons/icon.ts';
import type { IconId } from './icons/spriteIndex.ts';
import { containModalTab } from './modal.ts';
import { ensureFonts } from './fonts.ts';
import { formatNumber, t } from './i18n.ts';

const NUMERALS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'] as const;
/** The tier bands reach this far past their first and last cards, so no card sits on a band's end; they stop this far
 * above the board's foot, so every tree's bands end on one line (the board's left and right pads are the page gutter,
 * --tt-gutter in techTree.css). */
const PAD_Y = 12;
const END_Y = 12;
const GAP_X = 18;
/** A fitted tree's gutters may narrow to this rather than overrun the right gutter by a few pixels. */
const MIN_GAP_X = 14;
const GAP_Y = 14;
const SPECIAL_GAP = 24;
const HEAD_H = 40;
const MIN_COL = 112;
/** A stat's narrowest column (at the screen's scale): the glyph, the longest label and the widest number beside it, so
 * the column count follows the screen, not the selected vehicle. */
const MIN_STAT = 216;
/** A card is at most this many rows wide: a tree short of height narrows its columns to keep its cards' shape, and one
 * still too tall for the board scrolls. */
const CARD_ASPECT = 2.4;
/** A tree a little too tall for the board flattens its cards, to at most this many rows wide, to fit it rather than
 * scroll a sliver past the board's foot. */
const FLAT_ASPECT = 2.8;
/** A card's two 1 px edges, which a name's column has to clear (the selected card's wider edge grows outward). */
const CARD_EDGES = 2;
/** Wide screens fill with wider columns (the grid shares the title's and the detail's left edge) up to this; past it the
 * gutters take the spare width, so every tree ends on the right gutter. */
const MAX_COL = 360;
/** A gutter is at most this share of a column: a tree with spare width grows its columns before its gutters. */
const GAP_SHARE = 1;
const MIN_ROW = 60;
/** A fitted tree's rows may run this far under MIN_ROW (with FLAT_ASPECT) rather than scroll a sliver. */
const MIN_FIT_ROW = 54;
/** A connector's arrowhead, at the screen's scale. */
const ARROW = 8;
const arrowSize = (): number => Math.round(ARROW * uiScale() * 10) / 10;
const WIRE_KINDS = ['base', 'sel'] as const;
/** Zoom bounds (1 fits the tree to the board's width), and one button or key press's step. */
const ZOOM_MIN = 0.55;
const ZOOM_MAX = 2.2;
const ZOOM_STEP = 1.25;
/** A press that travels this far pans instead of selecting. */
const DRAG_SLOP = 6;

interface TechTreeVehicle extends FleetTankSpec {
  readonly label?: { readonly displayName?: string; readonly shortName?: string };
}

interface TechTreeOptions {
  /** The trees to draw (every national tree by default). */
  readonly trees?: readonly NationTree[];
  readonly vehicles: ReadonlyMap<string, TechTreeVehicle>;
  /** The vehicle to open on (the Garage's selection); its tree opens, else the first tree's root. */
  readonly selectedId?: string | null;
  /** Take a vehicle (a node's chosen build) into the Garage. */
  readonly onPick: (specId: string) => void;
  readonly onClose: () => void;
}

interface TechTreeScreen {
  readonly root: HTMLElement;
  open(trigger?: HTMLElement | null): void;
  close(options?: { readonly restoreFocus?: boolean }): void;
  isOpen(): boolean;
  dispose(): void;
}

interface Geometry {
  /** The tiers the tree holds, in order, one column each (a tier no vehicle of the tree holds takes no column), and each
   * tier's column. */
  readonly tiers: readonly number[];
  readonly column: ReadonlyMap<number, number>;
  readonly count: number;
  /** The tier row's height, which grows with the screen's type scale. */
  readonly head: number;
  /** The page gutter the grid keeps on its left and right. */
  readonly pad: number;
  readonly col: number;
  readonly row: number;
  /** The gutter between two columns. */
  readonly gapX: number;
  /** The tree's one card-name size (px), and whether the names show at all (a board zoomed out past them does not). */
  readonly label: number;
  readonly compact: boolean;
  readonly lanes: number;
  readonly specialLanes: number;
  readonly width: number;
  readonly height: number;
}

const displayName = (spec: TechTreeVehicle | undefined, id: string): string => spec?.label?.displayName || spec?.name || id;
const shortName = (spec: TechTreeVehicle | undefined, id: string): string => spec?.label?.shortName || displayName(spec, id);
/** A name without its trailing qualifier: "Type 96-72 Lóng (Concept)" reads "Type 96-72 Lóng". */
const bareName = (name: string): string => name.replace(/ \([^()]*\)$/, '');
const bestPen = (spec: TechTreeVehicle): number => Math.max(0, ...spec.gun.shells.map((shell) => shell.pen100Mm || 0));
/**
 * The kit's buttons (components.css), written from its classes rather than its factory: the factory would join the
 * kit's shared boot chunk only for this lazy screen. An icon-only button names itself for the hover tip and readers.
 */
function kitButton(label: string, options: { readonly glyph?: IconId; readonly variant: 'primary' | 'secondary' | 'ghost';
  readonly size: 36 | 48 | 56; readonly sound: string; readonly className?: string; readonly zoom?: string }): string {
  const iconOnly = !!options.glyph;
  const cls = ['cot-c-btn', `cot-c-btn--${options.variant}`, `cot-c-btn--${options.size}`, iconOnly ? 'cot-c-btn--icon' : '',
    options.className ?? ''].filter(Boolean).join(' ');
  const name = iconOnly ? ` aria-label="${esc(label)}"` : '';
  const zoom = options.zoom ? ` data-zoom="${options.zoom}"` : '';
  const body = iconOnly ? icon(options.glyph!, { size: 18 }) : `<span class="cot-c-btn__label">${esc(label)}</span>`;
  return `<button type="button" class="${cls}" data-ui-sound="${options.sound}"${name}${zoom}>${body}</button>`;
}

/** The type scale's steps above the 11 px floor, as multiples of it: a card name's size is one of them. */
const NAME_STEPS = [11, 12, 13, 14, 15, 16, 18].map((px) => px / 11);
/**
 * The card names' size follows the column, as a multiple of the floor (--tt-name-floor, 11 px in every locale, so the
 * Latin names keep one size in en and zh): 1 to a 123 px column, growing to 1.65 at 203 px.
 */
const nameScale = (col: number): number => Math.min(1.65, Math.max(1, col / 123));
/** The screen's type scale beside the grid (title, detail, stats, rail): 1 to 1440 px, growing to 1.5 at 2400 px. */
const uiScale = (): number => Math.min(1.5, Math.max(1, (window.innerWidth || 1440) / 1600));
/** The tiers a tree holds, lowest first: the columns it draws. */
const tierColumns = (tree: NationTree): number[] => [...new Set(tree.nodes.map((node) => node.tier))].sort((a, b) => a - b);

export function createTechTreeScreen(options: TechTreeOptions): TechTreeScreen {
  ensureFonts();
  const { trees = TECH_TREES, vehicles } = options;
  const startTree = trees.find((tree) => tree.nodes.some((node) => vehiclesOf(node).includes(options.selectedId ?? ''))) ?? trees[0];
  let tree: NationTree = startTree;
  let layout: TreeLayout = layoutTree(tree);
  let nodeById = new Map(tree.nodes.map((node) => [node.id, node]));
  const startNode = startTree.nodes.find((node) => vehiclesOf(node).includes(options.selectedId ?? ''));
  let selectedId = startNode?.id ?? rootOf(startTree).id;
  /** The build picked on each node's card (a twin's own id); the node's id until the player picks another. */
  const chosenBuild = new Map<string, string>();
  if (startNode && options.selectedId) chosenBuild.set(startNode.id, options.selectedId);
  let open = false;
  let trigger: HTMLElement | null = null;
  let geometry: Geometry | null = null;
  /** The cards' far edges on the grid: the board fades only where a card runs past its own edge. */
  const extent = { right: 0, bottom: 0 };
  let zoom = 1;
  const coarsePointer = matchMedia('(pointer:coarse)');
  coarsePointer.addEventListener('change', () => paintZoom());

  // Each stat's fleet range, for the kit's 20-cell scale (reload reads lower as better).
  const range = (pick: (spec: TechTreeVehicle) => number): readonly [number, number] => {
    let lo = Infinity, hi = -Infinity;
    for (const spec of vehicles.values()) {
      const value = pick(spec);
      if (Number.isFinite(value) && value > 0) { lo = Math.min(lo, value); hi = Math.max(hi, value); }
    }
    return [lo, hi];
  };
  const RANGES = {
    pen: range(bestPen), hp: range((spec) => spec.hp), speed: range((spec) => spec.topSpeedKmh), reload: range((spec) => spec.gun.reloadS),
  };

  const root = document.createElement('div');
  root.className = 'cot-tt';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML =
    `<header class="tt-head">` +
    `<div class="tt-nation"><span class="tt-flag"></span><h1 class="tt-title"${datumAttr('nation')}></h1></div>` +
    `<nav class="tt-rail" aria-label="${t('techTree.nations')}"></nav>` +
    // zoom sits on its own opaque plate in the header, clear of every card
    `<div class="tt-plate tt-zoom" role="group" aria-label="${t('techTree.zoom')}">` +
    kitButton(t('techTree.zoomOut'), { glyph: 'zoomOut', variant: 'ghost', size: 36, sound: 'press', zoom: 'out' }) +
    kitButton(t('techTree.zoomFit'), { glyph: 'zoomFit', variant: 'ghost', size: 36, sound: 'press', zoom: 'fit' }) +
    kitButton(t('techTree.zoomIn'), { glyph: 'zoomIn', variant: 'ghost', size: 36, sound: 'press', zoom: 'in' }) +
    `</div>` +
    `<div class="tt-plate tt-close-plate">` +
    kitButton(t('techTree.close'), { glyph: 'close', variant: 'ghost', size: 36, sound: 'back', className: 'tt-close' }) +
    `</div></header>` +
    `<div class="tt-stage">` +
    `<div class="tt-board">` +
    `<div class="tt-grid"><div class="tt-tiers" aria-hidden="true"></div>` +
    // the special lane's rule opens with its label
    `<svg class="tt-wires" aria-hidden="true"></svg><div class="tt-rule" aria-hidden="true">` +
    `<span class="tt-rule-label">${esc(t('techTree.special'))}</span></div></div></div>` +
    // the fades at the edges the board has scrolled past (the stage's own overlays fade the edges it scrolls toward)
    `<div class="tt-edges" aria-hidden="true"></div></div>` +
    `<section class="tt-detail" aria-live="polite">` +
    `<div class="tt-detail-art"></div>` +
    `<div class="tt-detail-info"><div class="tt-detail-id"><h2 class="tt-detail-name"${datumAttr('tank-name')}></h2>` +
    // the kit's tags (components.css .cot-c-tag): the tier, and Special for a vehicle outside the lines
    `<div class="tt-detail-meta"><span class="cot-c-tag cot-c-tag--neutral tt-detail-tier"${datumAttr('tier')}></span>` +
    `<span class="cot-c-tag cot-c-tag--neutral tt-detail-special" hidden>${esc(t('techTree.special'))}</span></div>` +
    // a node's twin builds: the kit's segmented control (components.css .cot-c-seg, the slate plate marks the choice)
    `<div class="cot-c-seg tt-builds" role="radiogroup" aria-label="${t('techTree.builds')}"></div></div>` +
    `<div class="tt-stats"></div></div>` +
    `<div class="tt-act">${kitButton(t('techTree.select'), { variant: 'primary', size: 56, sound: 'confirm', className: 'tt-select' })}</div>` +
    `</section>`;
  const board = root.querySelector<HTMLElement>('.tt-board')!;
  const grid = root.querySelector<HTMLElement>('.tt-grid')!;
  const tiersEl = root.querySelector<HTMLElement>('.tt-tiers')!;
  const wires = root.querySelector<SVGSVGElement>('.tt-wires')!;
  const rule = root.querySelector<HTMLElement>('.tt-rule')!;
  const stage = root.querySelector<HTMLElement>('.tt-stage')!;
  const stats = root.querySelector<HTMLElement>('.tt-stats')!;
  const rail = root.querySelector<HTMLElement>('.tt-rail')!;
  const detail = root.querySelector<HTMLElement>('.tt-detail')!;
  const closeButton = root.querySelector<HTMLButtonElement>('.tt-close')!;
  const selectButton = root.querySelector<HTMLButtonElement>('.tt-select')!;
  const zoomButtons = root.querySelectorAll<HTMLButtonElement>('[data-zoom]');

  /** The open tree's tier numerals, one per column. */
  function buildTiers(): void {
    tiersEl.replaceChildren();
    for (const tier of tierColumns(tree)) {
      const numeral = document.createElement('span');
      numeral.className = 'tt-numeral';
      numeral.dataset.tier = String(tier);
      numeral.textContent = NUMERALS[tier];
      tiersEl.append(numeral);
    }
  }

  // The nation rail: one flag per tree, the open tree's marked; the hover tip names each.
  for (const entry of trees) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'tt-rail-flag';
    item.dataset.tree = entry.id;
    item.dataset.uiSound = 'tab';
    item.setAttribute('aria-label', t(`nation.${entry.flagNation}`));
    item.innerHTML = flag(entry.flagNation, 'md');
    item.addEventListener('click', () => showTree(entry.id));
    rail.append(item);
  }
  /** A rail narrower than its flags fills its room, its flags spread so the room ends half way across one: the flag it
   *  cuts, fading, says the rail scrolls. */
  function fitRail(): void {
    rail.style.removeProperty('--tt-rail-gap');
    if (rail.scrollWidth <= rail.clientWidth + 2) return;
    const style = getComputedStyle(rail);
    const room = rail.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const [first, second] = [...rail.children].map((item) => item.getBoundingClientRect());
    const lead = first.left + rail.scrollLeft - rail.getBoundingClientRect().left - rail.clientLeft - parseFloat(style.paddingLeft);
    const reach = room - lead - first.width / 2;
    const whole = Math.max(1, Math.floor(reach / (second.left - first.left)));
    rail.style.setProperty('--tt-rail-gap', `${reach / whole - first.width}px`);
  }
  /** The rail scrolls on narrow screens: it fades at the edges it scrolls toward. */
  function markRail(): void {
    rail.classList.toggle('is-more-left', rail.scrollLeft > 2);
    rail.classList.toggle('is-more-right', rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 2);
  }
  rail.addEventListener('scroll', markRail, { passive: true });

  const buttons = new Map<string, HTMLButtonElement>();

  function nodeAria(node: TreeNode): string {
    const parts = [displayName(vehicles.get(node.id), node.id), t('techTree.tierAria', { tier: NUMERALS[node.tier] })];
    if (node.slot === 'special') parts.push(t('techTree.special'));
    if (node.builds?.length) parts.push(t('techTree.buildsAria', { count: node.builds.length + 1 }));
    return parts.join(', ');
  }

  /** Build the open tree's nodes (a tree switch rebuilds them). */
  function buildNodes(): void {
    for (const item of buttons.values()) item.remove();
    buttons.clear();
    for (const node of tree.nodes) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'tt-node';
      item.dataset.id = node.id;
      item.dataset.slot = node.slot;
      item.dataset.uiSound = 'select';
      // the kit's hover tip reads the node's name and tier from its label on a dwell
      item.dataset.tip = '';
      item.tabIndex = -1;
      item.setAttribute('aria-label', nodeAria(node));
      // the hero card's own flag layer carries the nation (owner rule: every vehicle shows its flag and its render)
      item.innerHTML = `<span class="tt-art"></span><span class="tt-name" aria-hidden="true"></span>`;
      item.querySelector<HTMLElement>('.tt-name')!.textContent = cardNames.get(node.id)!;
      item.addEventListener('click', () => select(node.id));
      item.addEventListener('dblclick', () => pick(node.id));
      grid.append(item);
      buttons.set(node.id, item);
      const art = item.querySelector<HTMLElement>('.tt-art')!;
      void decorateHeroTile(art, node.id, { tankSizes: '200px', flagSizes: '120px' }).then((decorated) => {
        if (decorated) return;
        const img = document.createElement('img');
        img.className = 'tt-portrait';
        img.src = iconUrl(node.id, 'angle');
        img.alt = '';
        img.loading = 'lazy';
        img.draggable = false;
        art.append(img);
      });
    }
  }

  function paintNodes(): void {
    for (const node of tree.nodes) {
      const item = buttons.get(node.id)!;
      const on = node.id === selectedId;
      item.classList.toggle('is-sel', on);
      item.setAttribute('aria-pressed', String(on));
      item.tabIndex = on ? 0 : -1;
    }
  }

  /**
   * One name per card, the same at every width: the vehicle's short name, or its full name when the short one starts
   * another card's name ("Puma" beside "Puma S1"), without a trailing qualifier ("(Concept)") when that reads as no
   * other card. Two cards never read alike.
   */
  function cardNamesOf(of: NationTree): Map<string, string> {
    const full = new Map(of.nodes.map((node) => [node.id, displayName(vehicles.get(node.id), node.id)]));
    const short = new Map(of.nodes.map((node) => [node.id, shortName(vehicles.get(node.id), node.id)]));
    const clashes = (name: string, id: string): boolean => of.nodes.some((other) => other.id !== id
      && [full.get(other.id)!, short.get(other.id)!].some((taken) => taken === name || taken.startsWith(`${name} `)));
    return new Map(of.nodes.map((node) => {
      let name = short.get(node.id)!;
      if (clashes(name, node.id)) name = full.get(node.id)!;
      const bare = bareName(name);
      return [node.id, bare !== name && !clashes(bare, node.id) ? bare : name];
    }));
  }
  let cardNames = cardNamesOf(tree);

  /**
   * The open tree's card names measured once at the floor (a face that lands late measures again): the widest name's
   * text, the name's inset, and the floor itself. Widths scale with the size, so this sizes every column and name.
   */
  let names: { readonly tree: string; readonly text: number; readonly inset: number; readonly floor: number } | null = null;
  function nameMetrics(): NonNullable<typeof names> {
    if (names?.tree === tree.id) return names;
    const probes = tree.nodes.map((node) => {
      const probe = document.createElement('span');
      probe.className = 'tt-name is-probe';
      probe.textContent = cardNames.get(node.id)!;
      return probe;
    });
    grid.append(...probes);
    const style = getComputedStyle(probes[0]);
    const inset = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const text = Math.max(...probes.map((probe) => probe.getBoundingClientRect().width)) - inset;
    names = { tree: tree.id, text, inset, floor: parseFloat(style.fontSize) };
    for (const probe of probes) probe.remove();
    return names;
  }

  /**
   * The board's cells: the width gives a column (up to MAX_COL) and the height a row. A row short of height narrows the
   * column to keep the card's shape (CARD_ASPECT), but no further than gutters of GAP_SHARE of a column; past that the
   * rows flatten to fit (to FLAT_ASPECT and MIN_FIT_ROW), and a tree taller still scrolls. The spare width goes to the
   * gutters, so every tree ends on the right gutter. The tree takes one name size, the column's (nameScale) or less so
   * its longest name fits, never under the floor; a name longer than that widens the columns. Zoom scales the cells and
   * the names.
   */
  function measure(): Geometry {
    const tiers = tierColumns(tree), count = tiers.length;
    const column = new Map(tiers.map((tier, index) => [tier, index]));
    const head = Math.round(HEAD_H * uiScale());
    const rows = layout.lineLanes + layout.specialLanes;
    const pad = parseFloat(getComputedStyle(root).getPropertyValue('--tt-gutter'));
    const span = board.clientWidth - pad * 2;
    const widthCol = Math.max(MIN_COL, Math.min(MAX_COL, Math.floor((span - GAP_X * (count - 1)) / count)));
    const boardHeight = board.clientHeight - head - PAD_Y * 2 - END_Y - (layout.specialLanes ? SPECIAL_GAP : 0) - GAP_Y * (rows - 1);
    const heightRow = Math.floor(boardHeight / Math.max(1, rows));
    const shapeCol = Math.min(widthCol, Math.max(MIN_COL, heightRow * CARD_ASPECT,
      Math.floor(span / (count + GAP_SHARE * Math.max(0, count - 1)))));
    const tall = Math.max(MIN_ROW, Math.round(shapeCol / CARD_ASPECT));
    const fitRow = heightRow >= tall ? Math.min(Math.round(shapeCol * 0.72), heightRow)
      : heightRow >= Math.max(MIN_FIT_ROW, shapeCol / FLAT_ASPECT) ? heightRow : tall;
    const m = nameMetrics();
    const room = shapeCol - CARD_EDGES - m.inset;
    const fits = Math.min(nameScale(shapeCol), room / m.text);
    const label = m.floor * (NAME_STEPS.filter((step) => step <= fits).pop() ?? 1);
    // (whole pixels: a fraction rounded away in every column would leave the tree short of the right gutter)
    const fitCol = Math.round(Math.max(shapeCol, Math.ceil(m.text * label / m.floor + m.inset + CARD_EDGES)));
    // the gutters take the width the columns leave (down to MIN_GAP_X), so a fitted tree spans the page gutter to gutter
    const share = (span - count * fitCol) / Math.max(1, count - 1);
    const spread = share >= MIN_GAP_X ? share : GAP_X;
    const col = Math.round(fitCol * zoom);
    const row = Math.round(fitRow * zoom);
    const gapX = Math.max(Math.min(GAP_X, spread), spread * zoom);
    const named = Math.max(m.floor, label * zoom);
    const compact = m.text * named / m.floor + m.inset + CARD_EDGES > col + 0.5;
    const width = Math.floor(pad * 2 + count * col + (count - 1) * gapX);
    const height = head + PAD_Y * 2 + END_Y + rows * row + (rows - 1) * GAP_Y + (layout.specialLanes ? SPECIAL_GAP : 0);
    return { tiers, column, count, head, pad, col, row, gapX, label: named, compact, lanes: layout.lineLanes, specialLanes: layout.specialLanes,
      width, height };
  }

  /**
   * Grid units (layout.ts) to pixels: a cell is one column or row, a gutter one gap. layout.ts counts columns from tier I;
   * here only the tiers the tree holds take a column, and a tier it skips folds into the gutter before the next one.
   */
  const px = (g: Geometry, point: GridPoint): [number, number] => {
    const c = Math.floor(point.x / 2), rx = point.x - 2 * c;
    const at = g.column.get(c + 1);
    const pitch = g.col + g.gapX;
    let x: number;
    if (at !== undefined) {
      x = g.pad + at * pitch + (rx <= 1 ? rx * g.col : g.col + (rx - 1) * g.gapX);
    } else {
      const next = g.column.get(g.tiers.find((tier) => tier > c + 1) ?? 0) ?? g.count;
      x = g.pad + next * pitch - g.gapX + (rx <= 1 ? 0 : (rx - 1) * g.gapX);
    }
    const iy = Math.floor(point.y / 2), ry = point.y - 2 * iy;
    const y = g.head + PAD_Y + iy * (g.row + GAP_Y) + (iy >= g.lanes ? SPECIAL_GAP : 0) + (ry <= 1 ? ry * g.row : g.row + (ry - 1) * GAP_Y);
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  };

  /** Pixels in the grid to grid units, the inverse of px, so a zoom keeps the point under the pointer exactly. */
  const units = (g: Geometry, x: number, y: number): GridPoint => {
    const axis = (value: number, cell: number, gap: number): number => {
      const i = Math.floor(value / (cell + gap)), rest = value - i * (cell + gap);
      return 2 * i + (rest <= cell ? rest / cell : 1 + (rest - cell) / gap);
    };
    let down = y - g.head - PAD_Y;
    const lineEnd = g.lanes * (g.row + GAP_Y);
    if (g.specialLanes && down > lineEnd) down -= Math.min(SPECIAL_GAP, down - lineEnd);
    const across = axis(x - g.pad, g.col, g.gapX);
    const index = Math.min(g.count - 1, Math.max(0, Math.floor(across / 2)));
    return { x: 2 * (g.tiers[index] - 1) + across - 2 * index, y: axis(down, g.row, GAP_Y) };
  };

  /** An SVG path through the route's points, each corner eased by a short quadratic turn. */
  function pathOf(g: Geometry, points: readonly GridPoint[]): string {
    const pts = points.map((point) => px(g, point));
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i];
      if (i < pts.length - 1) {
        const [px0, py0] = pts[i - 1], [nx, ny] = pts[i + 1];
        // the last bend ends before the arrowhead, so a connector never turns under it
        const tail = i === pts.length - 2 ? Math.max(0, Math.hypot(nx - x, ny - y) - arrowSize() - 2) : Infinity;
        const r = Math.min(8, tail, Math.hypot(x - px0, y - py0) / 2, Math.hypot(nx - x, ny - y) / 2);
        const ax = x - Math.sign(x - px0) * r, ay = y - Math.sign(y - py0) * r;
        const bx = x + Math.sign(nx - x) * r, by = y + Math.sign(ny - y) * r;
        d += `L${ax} ${ay}Q${x} ${y} ${bx} ${by}`;
      } else {
        d += `L${x} ${y}`;
      }
    }
    return d;
  }

  /**
   * The nation block keeps the widest nation's width at this screen size, so the rail beside it stays put when the
   * nation changes (measured again when the window or a late face changes it).
   */
  let nationFit = '';
  function fitNation(): void {
    const key = `${window.innerWidth}x${window.innerHeight}:${document.fonts.status}`;
    if (nationFit === key) return;
    nationFit = key;
    const nation = root.querySelector<HTMLElement>('.tt-nation')!, title = nation.querySelector<HTMLElement>('.tt-title')!;
    const current = title.textContent;
    root.style.removeProperty('--tt-nation-w');
    let widest = 0;
    for (const entry of trees) {
      title.textContent = t(`nation.${entry.flagNation}`);
      widest = Math.max(widest, title.getBoundingClientRect().right - nation.getBoundingClientRect().left);
    }
    title.textContent = current;
    root.style.setProperty('--tt-nation-w', `${Math.ceil(widest)}px`);
  }

  function layoutBoard(): void {
    // the type scale first: the header and the detail take their final size before the board measures what is left
    root.style.setProperty('--tt-ui', uiScale().toFixed(3));
    fitNation();
    const g = measure();
    geometry = g;
    grid.style.width = `${g.width}px`;
    // a tree shorter than the board still runs its bands down to END_Y above the board's foot
    grid.style.height = `${Math.max(g.height, board.clientHeight)}px`;
    grid.style.setProperty('--tt-col', `${g.col}px`);
    grid.style.setProperty('--tt-row', `${g.row}px`);
    grid.style.setProperty('--tt-pitch', `${g.col + g.gapX}px`);
    grid.style.setProperty('--tt-pad', `${g.pad}px`);
    grid.style.setProperty('--tt-end', `${END_Y}px`);
    // the stage's top fade sits under the pinned tier row
    stage.style.setProperty('--tt-head', `${g.head}px`);
    grid.style.setProperty('--tt-name-fs', `${g.label.toFixed(2)}px`);
    grid.classList.toggle('is-compact', g.compact);
    for (const numeral of tiersEl.children) {
      const tier = Number((numeral as HTMLElement).dataset.tier);
      (numeral as HTMLElement).style.left = `${px(g, { x: 2 * (tier - 1), y: 0 })[0]}px`;
    }
    extent.right = extent.bottom = 0;
    for (const node of tree.nodes) {
      const [x, y] = px(g, { x: 2 * (node.tier - 1), y: 2 * layout.rowOf.get(node.id)! });
      const item = buttons.get(node.id)!;
      item.style.left = `${x}px`;
      item.style.top = `${y}px`;
      extent.right = Math.max(extent.right, x + g.col);
      extent.bottom = Math.max(extent.bottom, y + g.row);
    }
    rule.hidden = !g.specialLanes;
    rule.style.top = `${px(g, { x: 0, y: 2 * g.lanes })[1] - SPECIAL_GAP / 2}px`;
    paintWires();
    markOverflow();
    fitRail();
    markRail();
    fitDetailName();
    fitStats();
    markDetail();
  }

  /**
   * The stats fill the detail's spare width: four in a row when the width allows and every label then keeps to its one
   * line beside its number, else two, else one.
   */
  function fitStats(): void {
    const ui = uiScale();
    const gap = 32 * ui, width = stats.clientWidth;
    const labels = [...stats.querySelectorAll<HTMLElement>('.cot-c-stat__label')];
    for (const cols of [4, 2, 1]) {
      if (cols > 1 && width < cols * MIN_STAT * ui + (cols - 1) * gap) continue;
      stats.style.setProperty('--tt-stat-cols', String(cols));
      if (!labels.some((label) => label.scrollWidth > label.clientWidth + 1)) return;
    }
  }

  /** A board larger than its space fades at every edge a card runs past, so nothing reads as cut (and a card wholly
   *  in view never sits under a fade: the bands' foot and the gutter past the last card are not more board). */
  function markOverflow(): void {
    // (a few pixels of rounding past an edge is not more board)
    stage.classList.toggle('is-more-below', board.scrollTop + board.clientHeight < grid.offsetTop + extent.bottom - 2);
    stage.classList.toggle('is-more-right', board.scrollLeft + board.clientWidth < grid.offsetLeft + extent.right - 2);
    stage.classList.toggle('is-more-above', board.scrollTop > 4);
    stage.classList.toggle('is-more-left', board.scrollLeft > 4);
  }
  board.addEventListener('scroll', markOverflow, { passive: true });

  /** The detail scrolls as a side panel on short screens: the stats it hides fade out over Select. */
  function markDetail(): void {
    detail.classList.toggle('is-more-below', detail.scrollTop + detail.clientHeight < detail.scrollHeight - 2);
  }
  detail.addEventListener('scroll', markDetail, { passive: true });

  /** The vehicle's name keeps to one line where it can: a step down at a time, to .8 of its layout's size. */
  function fitDetailName(): void {
    const name = detail.querySelector<HTMLElement>('.tt-detail-name')!;
    for (let step = 1; step >= 0.8 - 1e-6; step -= 0.05) {
      name.style.setProperty('--tt-name-step', step.toFixed(2));
      if (name.getBoundingClientRect().height < parseFloat(getComputedStyle(name).lineHeight) * 1.5) return;
    }
  }

  function paintWires(): void {
    const g = geometry;
    if (!g) return;
    wires.setAttribute('viewBox', `0 0 ${g.width} ${g.height}`);
    wires.setAttribute('width', String(g.width));
    wires.setAttribute('height', String(g.height));
    const arrow = arrowSize();
    const markers = WIRE_KINDS.map((kind) =>
      `<marker id="tt-arrow-${kind}" class="is-${kind}" viewBox="0 0 ${arrow} ${arrow}" markerWidth="${arrow}" markerHeight="${arrow}" ` +
      `refX="${arrow}" refY="${arrow / 2}" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0L${arrow} ${arrow / 2}L0 ${arrow}Z"/></marker>`).join('');
    // The selected node's connectors go last so they draw over the others.
    const rows: string[] = [];
    const selected: string[] = [];
    for (const edge of layout.edges) {
      const kind = edge.child === selectedId ? 'sel' : 'base';
      const path = `<path class="is-${kind}" d="${pathOf(g, edge.points)}" marker-end="url(#tt-arrow-${kind})"/>`;
      (kind === 'sel' ? selected : rows).push(path);
    }
    wires.innerHTML = `<defs>${markers}</defs>${rows.join('')}${selected.join('')}`;
  }

  const buildOf = (node: TreeNode): string => chosenBuild.get(node.id) ?? node.id;

  function paintDetail(): void {
    const node = nodeById.get(selectedId)!;
    const buildId = buildOf(node);
    const spec = vehicles.get(buildId);
    detail.dataset.slot = node.slot;
    detail.querySelector<HTMLElement>('.tt-detail-name')!.textContent = displayName(spec, buildId);
    detail.querySelector<HTMLElement>('.tt-detail-tier')!.textContent = t('garage.card.tier', { tier: NUMERALS[node.tier] });
    detail.querySelector<HTMLElement>('.tt-detail-special')!.hidden = node.slot !== 'special';
    paintBuilds(node);
    detail.querySelector<HTMLElement>('.tt-stats')!.innerHTML = spec ? [
      statRow({ label: t('techTree.stat.penetration'), icon: 'penetration', value: formatNumber(bestPen(spec)),
        unit: t('techTree.unit.mm'), cells: scaleCells(bestPen(spec), RANGES.pen[0], RANGES.pen[1]) }),
      statRow({ label: t('techTree.stat.hp'), icon: 'shield', value: formatNumber(spec.hp),
        unit: t('techTree.unit.hp'), cells: scaleCells(spec.hp, RANGES.hp[0], RANGES.hp[1]) }),
      statRow({ label: t('techTree.stat.speed'), icon: 'speed', value: formatNumber(spec.topSpeedKmh),
        unit: t('techTree.unit.kmh'), cells: scaleCells(spec.topSpeedKmh, RANGES.speed[0], RANGES.speed[1]) }),
      statRow({ label: t('techTree.stat.reload'), icon: 'reload', value: formatNumber(spec.gun.reloadS, { maximumFractionDigits: 1 }),
        unit: t('techTree.unit.s'), cells: scaleCells(spec.gun.reloadS, RANGES.reload[1], RANGES.reload[0]) }),
    ].join('') : '';
    const art = detail.querySelector<HTMLElement>('.tt-detail-art')!;
    if (art.dataset.id !== buildId) {
      art.dataset.id = buildId;
      art.replaceChildren();
      void decorateHeroTile(art, buildId, { tankSizes: '420px', flagSizes: '420px', priority: true }).then((decorated) => {
        if (decorated || art.dataset.id !== buildId) return;
        const img = document.createElement('img');
        img.className = 'tt-portrait';
        img.src = iconUrl(buildId, 'angle');
        img.alt = '';
        art.append(img);
      });
    }
    fitDetailName();
    fitStats();
    markDetail();
  }

  /**
   * A node with twin builds offers each in the kit's segmented control (a radio group: arrows move the choice); the
   * chosen build is what Select takes to the Garage.
   */
  const buildsHost = detail.querySelector<HTMLElement>('.tt-builds')!;
  function chooseBuild(id: string, focus = false): void {
    const node = nodeById.get(selectedId);
    if (!node || !vehiclesOf(node).includes(id)) return;
    chosenBuild.set(node.id, id);
    paintDetail();
    if (focus) buildsHost.querySelector<HTMLElement>(`[data-value="${CSS.escape(id)}"]`)?.focus();
  }
  function paintBuilds(node: TreeNode): void {
    buildsHost.replaceChildren();
    buildsHost.hidden = !node.builds?.length;
    if (!node.builds?.length) return;
    const chosen = buildOf(node);
    for (const id of vehiclesOf(node)) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'cot-c-seg__opt';
      option.dataset.value = id;
      option.dataset.uiSound = 'select';
      option.setAttribute('role', 'radio');
      option.setAttribute('aria-checked', String(id === chosen));
      option.tabIndex = id === chosen ? 0 : -1;
      option.setAttribute('aria-label', displayName(vehicles.get(id), id));
      option.innerHTML = `${silhouette(id)}<span aria-hidden="true"></span>`;
      option.querySelector('span:last-child')!.textContent = shortName(vehicles.get(id), id);
      buildsHost.append(option);
    }
  }
  buildsHost.addEventListener('click', (event) => {
    const option = (event.target as Element | null)?.closest<HTMLElement>('[data-value]');
    if (option) chooseBuild(option.dataset.value!);
  });
  buildsHost.addEventListener('keydown', (event) => {
    const node = nodeById.get(selectedId);
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!node || !step) return;
    event.preventDefault();
    const ids = vehiclesOf(node);
    chooseBuild(ids[(ids.indexOf(buildOf(node)) + step + ids.length) % ids.length], true);
  });

  function paintHeader(): void {
    const name = t(`nation.${tree.flagNation}`);
    root.setAttribute('aria-label', t('techTree.dialogAria', { nation: name }));
    root.querySelector<HTMLElement>('.tt-flag')!.innerHTML = flag(tree.flagNation, 'lg');
    root.querySelector<HTMLElement>('.tt-title')!.textContent = name;
    for (const item of rail.children) {
      const current = (item as HTMLElement).dataset.tree === tree.id;
      item.classList.toggle('is-on', current);
      item.setAttribute('aria-current', current ? 'true' : 'false');
    }
  }

  function paintZoom(): void {
    for (const item of zoomButtons) {
      const kind = item.dataset.zoom;
      // fit stays live and shows when the board sits at fit; in and out stop at their bounds. A touch screen pinches
      // to zoom and keeps fit alone: a plain button there, since one option always on reads as a stuck toggle.
      if (kind === 'fit' && coarsePointer.matches) item.removeAttribute('aria-pressed');
      else if (kind === 'fit') item.setAttribute('aria-pressed', String(Math.abs(zoom - 1) < 1e-3));
      else item.disabled = kind === 'in' ? zoom >= ZOOM_MAX - 1e-3 : zoom <= ZOOM_MIN + 1e-3;
    }
  }

  /** The detail paints first, so the board measures the space the filled panel leaves it. */
  function paint(): void {
    root.style.setProperty('--tt-ui', uiScale().toFixed(3));
    paintHeader();
    paintDetail();
    layoutBoard();
    paintNodes();
    paintWires();
    paintZoom();
  }

  function showTree(id: string): void {
    const next = trees.find((entry) => entry.id === id);
    if (!next || next === tree) return;
    tree = next;
    layout = layoutTree(tree);
    nodeById = new Map(tree.nodes.map((node) => [node.id, node]));
    cardNames = cardNamesOf(tree);
    selectedId = rootOf(tree).id;
    zoom = 1;
    buildTiers();
    buildNodes();
    board.scrollTo({ left: 0, top: 0 });
    paint();
    reveal(selectedId, true);
    markOverflow();
    buttons.get(selectedId)?.focus({ preventScroll: true });
  }

  /**
   * Scroll a node into view. A tree opens with its selection centred across, snapped to a column's edge, and down on the
   * first row holding a card in view, so the first column and row open whole, as they do unscrolled.
   */
  function reveal(id: string, centre = false): void {
    const g = geometry, node = nodeById.get(id);
    if (!g || !node) return;
    const [x, y] = px(g, { x: 2 * (node.tier - 1), y: 2 * layout.rowOf.get(id)! });
    const left = x + grid.offsetLeft, top = y + grid.offsetTop;
    const snap = (value: number, pitch: number): number => Math.max(0, centre ? Math.round(value / pitch) * pitch : value);
    if (centre || left < board.scrollLeft + g.pad || left + g.col > board.scrollLeft + board.clientWidth - g.pad) {
      board.scrollTo({ left: snap(left - board.clientWidth / 2 + g.col / 2, g.col + g.gapX), behavior: 'auto' });
    }
    if (centre) {
      // the tree opens on the first row that holds a card in view (never on empty bands), with the selection in view
      const pitch = g.row + GAP_Y;
      const inView = tree.nodes.filter((other) => {
        const cardLeft = px(g, { x: 2 * (other.tier - 1), y: 0 })[0] + grid.offsetLeft;
        return cardLeft + g.col > board.scrollLeft && cardLeft < board.scrollLeft + board.clientWidth;
      });
      const firstRow = Math.min(...inView.map((other) => layout.rowOf.get(other.id)!));
      const selectedRow = layout.rowOf.get(id)!;
      const rowsInView = Math.max(1, Math.floor((board.clientHeight - g.head - PAD_Y) / pitch));
      const openRow = selectedRow - firstRow < rowsInView ? firstRow : selectedRow - Math.floor(rowsInView / 2);
      board.scrollTo({ top: Math.max(0, openRow * pitch), behavior: 'auto' });
    } else if (top < board.scrollTop || top + g.row > board.scrollTop + board.clientHeight) {
      board.scrollTo({ top: Math.max(0, top - board.clientHeight / 2 + g.row / 2), behavior: 'auto' });
    }
  }

  function select(id: string, focus = false): void {
    if (!nodeById.has(id)) return;
    selectedId = id;
    paintNodes();
    paintWires();
    paintDetail();
    reveal(id);
    if (focus) buttons.get(id)?.focus({ preventScroll: true });
  }

  /** Take the node's chosen build into the Garage. */
  function pick(id: string): void {
    const node = nodeById.get(id);
    if (!node) return;
    options.onPick(buildOf(node));
    close();
  }
  selectButton.addEventListener('click', () => pick(selectedId));

  /**
   * Zoom about a point of the board (its centre by default): the content under it stays under it. The grid re-lays at
   * the scaled cell rather than scaling a picture, so names and wires stay crisp.
   */
  function zoomTo(next: number, clientX?: number, clientY?: number): void {
    const value = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
    const before = geometry;
    if (!before || Math.abs(value - zoom) < 1e-3) return;
    const box = board.getBoundingClientRect();
    const ax = (clientX ?? box.left + board.clientWidth / 2) - box.left;
    const ay = (clientY ?? box.top + board.clientHeight / 2) - box.top;
    const anchor = units(before, board.scrollLeft + ax - grid.offsetLeft, board.scrollTop + ay - grid.offsetTop);
    zoom = value;
    layoutBoard();
    const [x, y] = px(geometry!, anchor);
    board.scrollLeft = x + grid.offsetLeft - ax;
    board.scrollTop = y + grid.offsetTop - ay;
    markOverflow();
    paintZoom();
  }
  for (const item of zoomButtons) {
    item.addEventListener('click', () => {
      const kind = item.dataset.zoom;
      zoomTo(kind === 'in' ? zoom * ZOOM_STEP : kind === 'out' ? zoom / ZOOM_STEP : 1);
    });
  }
  // ctrl/⌘ + wheel, and a trackpad pinch (which the browser reports as one), zoom at the pointer; a plain wheel scrolls.
  board.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoomTo(zoom * Math.exp(-event.deltaY * 0.002), event.clientX, event.clientY);
  }, { passive: false });

  // A press that travels pans the board (any pointer, from a node too); two touches pinch-zoom about their midpoint.
  // The press that ended a pan or a pinch never also selects.
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { id: number; x: number; y: number; left: number; top: number; moved: boolean } | null = null;
  let pinch: { distance: number; zoom: number } | null = null;
  let swallowClick = false;
  const spread = (): { distance: number; x: number; y: number } => {
    const [a, b] = [...pointers.values()];
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  board.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (!pointers.size) swallowClick = false;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      pinch = { distance: spread().distance, zoom };
      drag = null;
      board.classList.remove('is-panning');
      return;
    }
    if (pointers.size === 1) drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: board.scrollLeft, top: board.scrollTop, moved: false };
  });
  board.addEventListener('pointermove', (event) => {
    const point = pointers.get(event.pointerId);
    if (!point) return;
    point.x = event.clientX;
    point.y = event.clientY;
    if (pinch && pointers.size >= 2) {
      const now = spread();
      if (pinch.distance > 0) zoomTo(pinch.zoom * now.distance / pinch.distance, now.x, now.y);
      swallowClick = true;
      return;
    }
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    if (!drag.moved) {
      drag.moved = true;
      try { board.setPointerCapture(event.pointerId); } catch { /* the pointer already ended: pan without capture */ }
      board.classList.add('is-panning');
    }
    board.scrollLeft = drag.left - dx;
    board.scrollTop = drag.top - dy;
  });
  const endPointer = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag?.id === event.pointerId) {
      if (drag.moved) swallowClick = true;
      drag = null;
      board.classList.remove('is-panning');
    }
  };
  board.addEventListener('pointerup', endPointer);
  board.addEventListener('pointercancel', endPointer);
  board.addEventListener('click', (event) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.stopPropagation();
    event.preventDefault();
  }, true);

  /** Arrow keys walk the grid: the nearest node in that direction, preferring the same row or column. */
  function neighbour(id: string, dx: number, dy: number): string | null {
    const from = nodeById.get(id)!;
    const fromRow = layout.rowOf.get(id)!;
    let best: string | null = null, bestScore = Infinity;
    for (const node of tree.nodes) {
      if (node.id === id) continue;
      const ddx = node.tier - from.tier, ddy = layout.rowOf.get(node.id)! - fromRow;
      const along = dx ? ddx * dx : ddy * dy;
      if (along <= 0) continue;
      const across = Math.abs(dx ? ddy : ddx);
      const score = along + across * 2.5;
      if (score < bestScore) { bestScore = score; best = node.id; }
    }
    return best;
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (!open) return;
    // The Garage's own shortcuts stay off while the tree is open.
    event.stopPropagation();
    // (Escape is the surface stack's, ahead of this; T toggles the tree as it opened it)
    if (event.code === 'KeyT' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      close();
      return;
    }
    containModalTab(event, root, closeButton);
    const inGrid = (event.target as Element | null)?.closest?.('.tt-node');
    const step = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[event.key];
    if (step && inGrid) {
      event.preventDefault();
      const next = neighbour(selectedId, step[0], step[1]);
      if (next) select(next, true);
    } else if (event.key === 'Enter' && inGrid) {
      event.preventDefault();
      pick(selectedId);
    } else if (event.key === '[' || event.key === ']') {
      const index = trees.indexOf(tree) + (event.key === ']' ? 1 : -1);
      showTree(trees[(index + trees.length) % trees.length].id);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomTo(zoom * ZOOM_STEP);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomTo(zoom / ZOOM_STEP);
    } else if (event.key === '0') {
      event.preventDefault();
      zoomTo(1);
    }
  };
  root.addEventListener('keydown', onKeyDown);
  closeButton.addEventListener('click', () => close());
  // Any change to the board's size (the window, the detail growing a builds row) lays the board out again, in the next
  // task, so the tree always fits what the panel leaves it (a timeout, not a frame: a page in the background still lays
  // out). So does a face that lands after the names were fitted: it changes their widths without resizing the board.
  let relayout = 0;
  const scheduleLayout = (): void => {
    if (!open || relayout) return;
    relayout = window.setTimeout(() => { relayout = 0; if (open) { layoutBoard(); paintZoom(); } }, 0);
  };
  const resizer = new ResizeObserver(scheduleLayout);
  resizer.observe(board);
  const onFonts = (): void => {
    names = null;
    nationFit = '';
    scheduleLayout();
  };
  document.fonts.addEventListener('loadingdone', onFonts);

  // a modal transient surface (components/surfaceStack.ts): opening it closes what the Garage has open, and Escape is the
  // stack's, which closes the top surface
  const surface: TransientSurface = {
    id: 'tech-tree',
    element: () => root,
    close: (reason) => close({ restoreFocus: reason === 'escape' }),
    modal: true,
  };
  function close({ restoreFocus = true } = {}): void {
    if (!open) return;
    open = false;
    closeSurface(surface);
    root.hidden = true;
    options.onClose();
    if (restoreFocus) trigger?.focus({ preventScroll: true });
  }

  buildTiers();
  buildNodes();
  return {
    root,
    open(from = null) {
      trigger = from;
      if (!root.isConnected) document.body.append(root);
      openSurface(surface, from);
      root.hidden = false;
      open = true;
      paint();
      reveal(selectedId, true);
      markOverflow();
      buttons.get(selectedId)?.focus({ preventScroll: true });
    },
    close,
    isOpen: () => open,
    dispose() {
      close({ restoreFocus: false });
      resizer.disconnect();
      document.fonts.removeEventListener('loadingdone', onFonts);
      root.removeEventListener('keydown', onKeyDown);
      root.remove();
    },
  };
}
