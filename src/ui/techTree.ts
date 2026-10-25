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
import { esc, flag, scaleCells, silhouette, statRow } from './components/components.ts';
import { decorateHeroTile } from './heroCard.ts';
import { iconUrl } from './icons.ts';
import { icon } from './icons/icon.ts';
import type { IconId } from './icons/spriteIndex.ts';
import { containModalTab } from './modal.ts';
import { ensureFonts } from './fonts.ts';
import { formatNumber, t } from './i18n.ts';

const NUMERALS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'] as const;
const PAD_X = 28;
const GAP_X = 18;
const GAP_Y = 14;
const SPECIAL_GAP = 24;
const HEAD_H = 40;
const MIN_COL = 112;
/** A column also holds the tree's longest card name on one line at the floor (its shortest form), up to this. */
const NAME_COL_MAX = 136;
/** A card's two 1 px edges, which a name's column has to clear (the selected card's wider edge grows outward). */
const CARD_EDGES = 2;
/** Wide screens fill with wider columns (the grid shares the title's and the detail's left edge) up to this. */
const MAX_COL = 280;
const MIN_ROW = 64;
const ARROW = 6;
const WIRE_KINDS = ['base', 'sel'] as const;
/** Zoom bounds (1 fits the tree to the board's width), and one button or key press's step. */
const ZOOM_MIN = 0.55;
const ZOOM_MAX = 2.2;
const ZOOM_STEP = 1.25;
/** Below this column width a node shows its render alone; the hover tip names it. */
const COMPACT_COL = 96;
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
  /** The tree's first tier and how many tiers it spans (a tree that opens at II has no empty column I). */
  readonly first: number;
  readonly count: number;
  /** The tier row's height, which grows with the screen's type scale. */
  readonly head: number;
  readonly col: number;
  readonly row: number;
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

/**
 * A node's name follows its column: a share of the 13 px step, never under .85 of it (11 px). The 13 step is the same in
 * every locale (zh lifts only the 11 and 12 steps), so the Latin vehicle names keep one size in en and zh.
 */
const nameShare = (col: number): number => Math.min(1.4, Math.max(0.85, col / 145));
const nameSize = (share: number): string => `calc(var(--fs-13) * ${share.toFixed(3)})`;
/** A name's short last word (a year, a suffix) stays with the word before it, so a wrap never orphans it. */
const keepTail = (name: string): string => name.replace(/ (\S{1,5})$/, '\u00a0$1');
/** The screen's type scale beside the grid (title, detail, stats, rail): 1 to 1440 px, growing to 1.5 at 2400 px. */
const uiScale = (): number => Math.min(1.5, Math.max(1, (window.innerWidth || 1440) / 1600));
/** The tiers a tree spans, first to last. */
const tierSpan = (tree: NationTree): { readonly first: number; readonly count: number } => {
  const tiers = tree.nodes.map((node) => node.tier);
  const first = Math.min(...tiers);
  return { first, count: Math.max(...tiers) - first + 1 };
};

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
  let zoom = 1;

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
    `<div class="tt-nation"><span class="tt-flag"></span><h1 class="tt-title"></h1></div>` +
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
    `<svg class="tt-wires" aria-hidden="true"></svg><div class="tt-rule" aria-hidden="true"></div>` +
    // the special lane's label, on its rule
    `<span class="tt-rule-label" aria-hidden="true">${esc(t('techTree.special'))}</span></div></div></div>` +
    `<section class="tt-detail" aria-live="polite">` +
    `<div class="tt-detail-art"></div>` +
    `<div class="tt-detail-id"><h2 class="tt-detail-name"></h2>` +
    // the kit's tags (components.css .cot-c-tag): the tier, and Special for a vehicle outside the lines
    `<div class="tt-detail-meta"><span class="cot-c-tag cot-c-tag--neutral tt-detail-tier"></span>` +
    `<span class="cot-c-tag cot-c-tag--neutral tt-detail-special" hidden>${esc(t('techTree.special'))}</span></div>` +
    // a node's twin builds: the kit's segmented control (components.css .cot-c-seg, the slate plate marks the choice)
    `<div class="cot-c-seg tt-builds" role="radiogroup" aria-label="${t('techTree.builds')}"></div></div>` +
    `<div class="tt-stats"></div>` +
    `<div class="tt-act">${kitButton(t('techTree.select'), { variant: 'primary', size: 56, sound: 'confirm', className: 'tt-select' })}</div>` +
    `</section>`;
  const board = root.querySelector<HTMLElement>('.tt-board')!;
  const grid = root.querySelector<HTMLElement>('.tt-grid')!;
  const tiersEl = root.querySelector<HTMLElement>('.tt-tiers')!;
  const wires = root.querySelector<SVGSVGElement>('.tt-wires')!;
  const rule = root.querySelector<HTMLElement>('.tt-rule')!;
  const ruleLabel = root.querySelector<HTMLElement>('.tt-rule-label')!;
  const stage = root.querySelector<HTMLElement>('.tt-stage')!;
  const stats = root.querySelector<HTMLElement>('.tt-stats')!;
  const rail = root.querySelector<HTMLElement>('.tt-rail')!;
  const detail = root.querySelector<HTMLElement>('.tt-detail')!;
  const closeButton = root.querySelector<HTMLButtonElement>('.tt-close')!;
  const selectButton = root.querySelector<HTMLButtonElement>('.tt-select')!;
  const zoomButtons = root.querySelectorAll<HTMLButtonElement>('[data-zoom]');

  /** The open tree's tier numerals, first to last. */
  function buildTiers(): void {
    const { first, count } = tierSpan(tree);
    tiersEl.replaceChildren();
    for (let tier = first; tier < first + count; tier++) {
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
    const selectedTier = nodeById.get(selectedId)?.tier;
    for (const numeral of tiersEl.children) {
      (numeral as HTMLElement).classList.toggle('is-on', Number((numeral as HTMLElement).dataset.tier) === selectedTier);
    }
  }

  /**
   * Each card's names, longest first: the full name, the short name, then the short name without its qualifier when no
   * other card of the tree reads the same, so two vehicles never read alike.
   */
  function nameForms(): Map<string, string[]> {
    const forms = new Map(tree.nodes.map((node) => {
      const spec = vehicles.get(node.id);
      return [node.id, [...new Set([displayName(spec, node.id), shortName(spec, node.id)])]];
    }));
    const taken = new Set([...forms.values()].flat());
    for (const list of forms.values()) {
      const bare = bareName(list[list.length - 1]);
      if (taken.has(bare)) continue;
      list.push(bare);
      taken.add(bare);
    }
    return forms;
  }

  /** The column each card's shortest name fits on one line at the floor, per tree; a face that lands late resets it. */
  let nameCol: { readonly tree: string; readonly col: number } | null = null;
  function nameColumn(): number {
    if (nameCol?.tree === tree.id) return nameCol.col;
    const probes = [...nameForms().values()].map((list) => list.map((name) => {
      const probe = document.createElement('span');
      probe.className = 'tt-name is-tight is-probe';
      probe.textContent = keepTail(name);
      return probe;
    }));
    grid.append(...probes.flat());
    const widest = Math.max(0, ...probes.map((list) => Math.min(...list.map((probe) => probe.getBoundingClientRect().width))));
    for (const probe of probes.flat()) probe.remove();
    nameCol = { tree: tree.id, col: Math.min(NAME_COL_MAX, Math.max(MIN_COL, Math.ceil(widest) + CARD_EDGES)) };
    return nameCol.col;
  }

  function measure(): Geometry {
    const { first, count } = tierSpan(tree);
    const head = Math.round(HEAD_H * uiScale());
    const available = board.clientWidth - PAD_X * 2 - GAP_X * (count - 1);
    const fitCol = Math.max(nameColumn(), Math.min(MAX_COL, Math.floor(available / count)));
    const rows = layout.lineLanes + layout.specialLanes;
    const boardHeight = board.clientHeight - head - (layout.specialLanes ? SPECIAL_GAP : 0) - GAP_Y * (rows - 1) - 12;
    const fitRow = Math.max(MIN_ROW, Math.min(Math.round(fitCol * 0.72), Math.floor(boardHeight / Math.max(1, rows))));
    const col = Math.round(fitCol * zoom);
    const row = Math.round(fitRow * zoom);
    const width = PAD_X * 2 + count * col + (count - 1) * GAP_X;
    const height = head + rows * row + (rows - 1) * GAP_Y + (layout.specialLanes ? SPECIAL_GAP : 0);
    return { first, count, head, col, row, lanes: layout.lineLanes, specialLanes: layout.specialLanes, width, height };
  }

  /** Grid units (layout.ts) to pixels: a cell is one column or row, a gutter one gap. */
  const px = (g: Geometry, point: GridPoint): [number, number] => {
    // the grid starts at the tree's first tier: layout.ts counts columns from tier I
    const gx = point.x - 2 * (g.first - 1);
    const ix = Math.floor(gx / 2), rx = gx - 2 * ix;
    const iy = Math.floor(point.y / 2), ry = point.y - 2 * iy;
    const x = PAD_X + ix * (g.col + GAP_X) + (rx <= 1 ? rx * g.col : g.col + (rx - 1) * GAP_X);
    const y = g.head + iy * (g.row + GAP_Y) + (iy >= g.lanes ? SPECIAL_GAP : 0) + (ry <= 1 ? ry * g.row : g.row + (ry - 1) * GAP_Y);
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  };

  /** Pixels in the grid to grid units, the inverse of px, so a zoom keeps the point under the pointer exactly. */
  const units = (g: Geometry, x: number, y: number): GridPoint => {
    const axis = (value: number, cell: number, gap: number): number => {
      const i = Math.floor(value / (cell + gap)), rest = value - i * (cell + gap);
      return 2 * i + (rest <= cell ? rest / cell : 1 + (rest - cell) / gap);
    };
    let down = y - g.head;
    const lineEnd = g.lanes * (g.row + GAP_Y);
    if (g.specialLanes && down > lineEnd) down -= Math.min(SPECIAL_GAP, down - lineEnd);
    return { x: axis(x - PAD_X, g.col, GAP_X) + 2 * (g.first - 1), y: axis(down, g.row, GAP_Y) };
  };

  /** An SVG path through the route's points, each corner eased by a short quadratic turn. */
  function pathOf(g: Geometry, points: readonly GridPoint[]): string {
    const pts = points.map((point) => px(g, point));
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i];
      if (i < pts.length - 1) {
        const [px0, py0] = pts[i - 1], [nx, ny] = pts[i + 1];
        const r = Math.min(8, Math.hypot(x - px0, y - py0) / 2, Math.hypot(nx - x, ny - y) / 2);
        const ax = x - Math.sign(x - px0) * r, ay = y - Math.sign(y - py0) * r;
        const bx = x + Math.sign(nx - x) * r, by = y + Math.sign(ny - y) * r;
        d += `L${ax} ${ay}Q${x} ${y} ${bx} ${by}`;
      } else {
        d += `L${x} ${y}`;
      }
    }
    return d;
  }

  function layoutBoard(): void {
    // the type scale first: the header and the detail take their final size before the board measures what is left
    root.style.setProperty('--tt-ui', uiScale().toFixed(3));
    const g = measure();
    geometry = g;
    grid.style.width = `${g.width}px`;
    grid.style.height = `${g.height}px`;
    grid.style.setProperty('--tt-col', `${g.col}px`);
    grid.style.setProperty('--tt-row', `${g.row}px`);
    grid.style.setProperty('--tt-pitch', `${g.col + GAP_X}px`);
    grid.style.setProperty('--tt-pad', `${PAD_X}px`);
    grid.style.setProperty('--tt-head', `${g.head}px`);
    const share = nameShare(g.col);
    grid.style.setProperty('--tt-name-fs', nameSize(share));
    grid.style.setProperty('--tt-name-tight', nameSize(Math.max(0.85, share * 0.88)));
    grid.classList.toggle('is-compact', g.col < COMPACT_COL);
    for (const numeral of tiersEl.children) {
      const tier = Number((numeral as HTMLElement).dataset.tier);
      (numeral as HTMLElement).style.left = `${px(g, { x: 2 * (tier - 1), y: 0 })[0]}px`;
    }
    for (const node of tree.nodes) {
      const [x, y] = px(g, { x: 2 * (node.tier - 1), y: 2 * layout.rowOf.get(node.id)! });
      const item = buttons.get(node.id)!;
      item.style.left = `${x}px`;
      item.style.top = `${y}px`;
    }
    rule.hidden = !g.specialLanes;
    ruleLabel.hidden = !g.specialLanes;
    const ruleTop = px(g, { x: 0, y: 2 * g.lanes })[1] - SPECIAL_GAP / 2;
    rule.style.top = `${ruleTop}px`;
    ruleLabel.style.top = `${ruleTop}px`;
    fitNames();
    paintWires();
    markOverflow();
    markRail();
    fitStats();
  }

  /** The stats fill the detail's spare width: four in a row when they fit, else two, else one. */
  function fitStats(): void {
    const ui = uiScale();
    const min = 240 * ui, gap = 32 * ui, width = stats.clientWidth;
    stats.style.setProperty('--tt-stat-cols', String(width >= 4 * min + 3 * gap ? 4 : width >= 2 * min + gap ? 2 : 1));
  }

  /** A board larger than its space fades at the edges it scrolls toward (the stage's overlays: nothing reads as cut). */
  function markOverflow(): void {
    stage.classList.toggle('is-more-below', board.scrollTop + board.clientHeight < board.scrollHeight - 2);
    stage.classList.toggle('is-more-right', board.scrollLeft + board.clientWidth < board.scrollWidth - 2);
  }
  board.addEventListener('scroll', markOverflow, { passive: true });

  /**
   * A name keeps to one line, so every card keeps the same art: a name too long for its column first steps one size down
   * (never under the floor) on a narrower inset, then takes its shorter forms (nameForms), and only then wraps to two
   * balanced lines. The column is sized for the shortest forms (nameColumn), so a wrap is left to zooming out. A name is
   * never cut, so two vehicles never read the same. Each step writes every name, then reads them all: one layout a step.
   */
  function fitNames(): void {
    const forms = nameForms();
    const rows = tree.nodes.map((node) => ({
      forms: forms.get(node.id)!, el: buttons.get(node.id)!.querySelector<HTMLElement>('.tt-name')!,
    }));
    const overflows = (row: (typeof rows)[number]) => row.el.scrollWidth > row.el.clientWidth + 1;
    for (const row of rows) {
      row.el.className = 'tt-name';
      row.el.textContent = keepTail(row.forms[0]);
    }
    let over = rows.filter(overflows);
    for (const row of over) row.el.classList.add('is-tight');
    over = over.filter(overflows);
    for (let form = 1; form < 3 && over.length; form++) {
      for (const row of over) row.el.textContent = keepTail(row.forms[Math.min(form, row.forms.length - 1)]);
      over = over.filter(overflows);
    }
    for (const row of over) {
      row.el.classList.add('is-two-line');
      row.el.textContent = keepTail(row.forms[0]);
    }
  }

  function paintWires(): void {
    const g = geometry;
    if (!g) return;
    wires.setAttribute('viewBox', `0 0 ${g.width} ${g.height}`);
    wires.setAttribute('width', String(g.width));
    wires.setAttribute('height', String(g.height));
    const markers = WIRE_KINDS.map((kind) =>
      `<marker id="tt-arrow-${kind}" class="is-${kind}" viewBox="0 0 ${ARROW} ${ARROW}" markerWidth="${ARROW}" markerHeight="${ARROW}" ` +
      `refX="${ARROW}" refY="${ARROW / 2}" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0L${ARROW} ${ARROW / 2}L0 ${ARROW}Z"/></marker>`).join('');
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
      // fit stays live (it reads as stuck when disabled); in and out stop at their bounds
      if (kind === 'in' || kind === 'out') item.disabled = kind === 'in' ? zoom >= ZOOM_MAX - 1e-3 : zoom <= ZOOM_MIN + 1e-3;
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
    selectedId = rootOf(tree).id;
    zoom = 1;
    buildTiers();
    buildNodes();
    board.scrollTo({ left: 0, top: 0 });
    paint();
    buttons.get(selectedId)?.focus({ preventScroll: true });
  }

  function reveal(id: string): void {
    const g = geometry, node = nodeById.get(id);
    if (!g || !node) return;
    const [x, y] = px(g, { x: 2 * (node.tier - 1), y: 2 * layout.rowOf.get(id)! });
    const left = x + grid.offsetLeft, top = y + grid.offsetTop;
    if (left < board.scrollLeft + PAD_X || left + g.col > board.scrollLeft + board.clientWidth - PAD_X) {
      board.scrollTo({ left: Math.max(0, left - board.clientWidth / 2 + g.col / 2), behavior: 'auto' });
    }
    if (top < board.scrollTop || top + g.row > board.scrollTop + board.clientHeight) {
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
    if (event.key === 'Escape' || (event.code === 'KeyT' && !event.metaKey && !event.ctrlKey && !event.altKey)) {
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
    nameCol = null;
    scheduleLayout();
  };
  document.fonts.addEventListener('loadingdone', onFonts);

  function close({ restoreFocus = true } = {}): void {
    if (!open) return;
    open = false;
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
      root.hidden = false;
      open = true;
      paint();
      reveal(selectedId);
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
