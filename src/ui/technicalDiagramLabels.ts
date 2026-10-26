// The armour, module and crew diagrams' labels as DOM text (253, the UI gauntlet: the 512 x 256 rasters baked their
// labels at about 5 px, under the 11 px floor in every surface). tools/icons-page.html renders each diagram at 1024 x 512
// with no text and writes <id>_technical.json (schema 1) beside it: each kind's heaviest callouts a rail, their
// projected centres as fractions of the raster, their colours and the values the text is composed from. Here the text
// is composed in the active locale, the two rails are packed at the displayed size, and an overlay of DOM chips, an SVG
// of leader lines, the header and the legend stands over the image. Data and layout are pure (Node-runnable); only
// mountTechnicalDiagramLabels touches the DOM.
// First-party: Kevin B. Liu (NOTICE.md).
import { formatNumber, onLocaleChange, t } from './i18n.ts';
import { TECHNICAL_LEGENDS, type TechnicalKind } from './technicalDiagramLegend.ts';

export { TECHNICAL_LEGENDS, type TechnicalKind };

export interface TechnicalCallout {
  /** The inspection id: H01/T03 (armour plates), M02 (modules), C01 (crew), W1 (external weapons). */
  readonly key: string;
  /** The callout's projected centre, fractions of the raster (x right, y down). */
  readonly anchor: readonly [number, number];
  /** Its projected area, a fraction of the raster's: the heaviest six a rail show at the 1x size. */
  readonly weight: number;
  readonly color: string;
  readonly keMm?: number;
  readonly ceMm?: number;
  readonly plate?: string;
  readonly module?: string;
  readonly crew?: string;
  readonly title?: string;
}

export interface TechnicalLabelData {
  readonly schema: 1;
  readonly id: string;
  readonly size: readonly [number, number];
  readonly armor: readonly TechnicalCallout[];
  readonly modules: readonly TechnicalCallout[];
  readonly crew: readonly TechnicalCallout[];
}

/** The diagram's title key a kind (the dossier's own captions). */
export const TECHNICAL_TITLES: Readonly<Record<TechnicalKind, string>> = Object.freeze({
  armor: 'garage.dossier.image.armorSide',
  modules: 'garage.dossier.image.modulesSide',
  crew: 'garage.dossier.image.crewSide',
});

const VIEW_KINDS: Readonly<Record<string, TechnicalKind>> = Object.freeze({
  armor_side: 'armor', modules_side: 'modules', crew_side: 'crew',
});

/** URL of a tank's technical-diagram label sidecar (tools/genIcons.mjs writes it beside the diagrams). */
export const technicalLabelsUrl = (id: string): string => `/icons/${id}_technical.json`;

/** The kind an icon view shows ('armor_side' -> 'armor'), or null for any other view. */
export function technicalKindOfView(view: string): TechnicalKind | null {
  return VIEW_KINDS[view] ?? null;
}

/** Throws unless `value` is a schema-1 sidecar for `id`. */
export function parseTechnicalLabels(value: unknown, id: string): TechnicalLabelData {
  const data = value as TechnicalLabelData;
  if (!data || data.schema !== 1 || data.id !== id || !Array.isArray(data.size)
    || !(['armor', 'modules', 'crew'] as const).every((kind) => Array.isArray(data[kind]))) {
    throw new Error(`technical labels for ${id}: not a schema-1 sidecar`);
  }
  return data;
}

function translated(key: string, fallback: string): string {
  const text = t(key);
  return text === key ? fallback : text;
}

function humanized(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
}

/** A callout's text in the active locale: "T03 · 694 mm", "M02 · Ammo rack", "C01 · Driver". */
export function technicalLabelText(callout: TechnicalCallout, kind: TechnicalKind): string {
  if (kind === 'armor') {
    return `${callout.key} · ${formatNumber(Math.round(callout.keMm ?? 0))} ${t('gallery.unit.mm')}`;
  }
  const name = kind === 'modules' ? callout.module : callout.crew;
  const fallback = humanized(callout.title || name || '');
  // (two templates, so the page-catalog scan keeps garage.module.* and garage.crew.*, not every garage.* key)
  const key = kind === 'modules' ? `garage.module.${name}` : `garage.crew.${name}`;
  const text = name ? translated(key, fallback) : fallback;
  return `${callout.key} · ${text}`;
}

export interface TechnicalLayoutRow {
  readonly callout: TechnicalCallout;
  readonly text: string;
  readonly side: 'left' | 'right';
  /** The label row's centre line and its chip's outer edge (px); the chip grows inward from that edge. */
  readonly y: number;
  readonly edgeX: number;
  /** The leader from the callout's centre through the rail's elbow to the chip (px). */
  readonly leader: readonly (readonly [number, number])[];
}

export interface TechnicalLayoutOptions {
  /** Row pitch (px): the chip's height and its gap. Default 18. */
  readonly rowPx?: number;
  /** Labels a rail at most. Default: 6 at the 1x width (512 px) and under, up to 10 as the box grows. */
  readonly perRail?: number;
  /** The band the rows' centres stay inside (px). Default: the 1x composition's, under the header and over the legend;
   * a mounted overlay narrows it to clear its measured header and legend (a wrapped legend). */
  readonly top?: number;
  readonly bottom?: number;
}

// The 1x composition's geometry as fractions of the box (the raster's framing keeps it): the rails' outer edges, the
// elbows where the leaders turn, and the band the rows stay inside (between the header and the legend).
const RAIL = Object.freeze({ leftEdge: 5 / 512, leftElbow: 90 / 512, rightEdge: 507 / 512, rightElbow: 422 / 512 });
const ROWS = Object.freeze({ top: 56 / 256, bottom: 210 / 256 });

/** Minimum-displacement isotonic packing: each label as near its anchor's height as the row pitch allows, a collision
 * shared across its group rather than cascading down the rail, the whole rail kept inside [minY, maxY]. */
function packRows(desired: readonly number[], minY: number, maxY: number, gap: number): number[] {
  if (!desired.length) return [];
  const shifted = desired.map((y, index) => Math.min(maxY, Math.max(minY, y)) - index * gap);
  const blocks: { start: number; end: number; total: number; count: number }[] = [];
  shifted.forEach((value, index) => {
    blocks.push({ start: index, end: index, total: value, count: 1 });
    while (blocks.length > 1) {
      const right = blocks[blocks.length - 1]!, left = blocks[blocks.length - 2]!;
      if (left.total / left.count <= right.total / right.count) break;
      left.end = right.end; left.total += right.total; left.count += right.count;
      blocks.pop();
    }
  });
  const fitted = new Array<number>(shifted.length);
  for (const block of blocks) for (let index = block.start; index <= block.end; index++) fitted[index] = block.total / block.count;
  const packed = fitted.map((value, index) => value + index * gap);
  const shift = packed[0]! < minY ? minY - packed[0]! : packed[packed.length - 1]! > maxY ? maxY - packed[packed.length - 1]! : 0;
  return packed.map((value) => value + shift);
}

/** The two rails' labels at a displayed box size: the heaviest a rail (perRail), packed between the header and the
 * legend, each with its leader. Pure. */
export function layoutTechnicalCallouts(
  callouts: readonly TechnicalCallout[], kind: TechnicalKind, box: { readonly width: number; readonly height: number },
  options: TechnicalLayoutOptions = {},
): TechnicalLayoutRow[] {
  const { width, height } = box, rowPx = options.rowPx ?? 18;
  const minY = Math.max(ROWS.top * height, options.top ?? -Infinity), maxY = Math.max(minY, Math.min(ROWS.bottom * height, options.bottom ?? Infinity));
  const fit = Math.max(1, Math.floor((maxY - minY) / rowPx) + 1);
  const perRail = Math.min(fit, options.perRail ?? Math.round(Math.min(10, Math.max(6, 6 * width / 512))));
  const rows: TechnicalLayoutRow[] = [];
  for (const side of ['left', 'right'] as const) {
    const picked = callouts.filter((c) => (c.anchor[0] < .5) === (side === 'left'))
      .slice().sort((a, b) => b.weight - a.weight).slice(0, perRail)
      .sort((a, b) => a.anchor[1] - b.anchor[1]);
    const ys = packRows(picked.map((c) => c.anchor[1] * height), minY, maxY, rowPx);
    const edgeX = (side === 'left' ? RAIL.leftEdge : RAIL.rightEdge) * width;
    const elbowX = (side === 'left' ? RAIL.leftElbow : RAIL.rightElbow) * width;
    picked.forEach((callout, index) => {
      const y = ys[index]!, ax = callout.anchor[0] * width, ay = callout.anchor[1] * height;
      rows.push({ callout, text: technicalLabelText(callout, kind), side, y, edgeX,
        leader: [[ax, ay], [elbowX, y], [edgeX + (side === 'left' ? 1 : -1) * (elbowX - edgeX) * .9, y]] });
    });
  }
  return rows;
}

/** What the header shows: the vehicle's name, its designation, and the tier as the caller shows it elsewhere (a plain
 * string, e.g. the Garage's tier numeral; the tech tree's displayTier once it lands). */
export interface TechnicalHeader {
  readonly name: string;
  readonly designation?: string;
  readonly tier?: string;
}

export interface TechnicalMountOptions {
  /** The header row (default true); a surface that shows the name and tier above the figure passes false. */
  readonly header?: boolean;
  /** The legend row (default true). */
  readonly legend?: boolean;
  /** The diagram image (default: the host's first <img>): the overlay covers its rendered content box. */
  readonly image?: HTMLImageElement | null;
}

const SVG = 'http://www.w3.org/2000/svg';
let sheet: Promise<unknown> | null = null;

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The same overlay as static HTML, for a page prerendered in Node (the Field Manual), where the image's box is fluid: the
 * rows are packed at a `reference` box (the smallest the page shows it at, so they fit there and only spread as the box
 * grows) and every place is a percentage of the box; the leaders scale with it. The markup goes inside a positioned box
 * holding the image, its stylesheet is technicalDiagramLabels.css, and the text is the active locale's. Pure.
 */
export function technicalLabelsMarkup(
  data: TechnicalLabelData, kind: TechnicalKind, reference: { readonly width: number; readonly height: number },
  { rowPx = 20, legend = true }: { readonly rowPx?: number; readonly legend?: boolean } = {},
): string {
  // (a static page cannot measure its legend: the rows keep a two-row legend's height clear)
  const { width, height } = reference;
  const rows = layoutTechnicalCallouts(data[kind], kind, reference, { rowPx, ...(legend ? { bottom: height - 2.5 * rowPx } : {}) });
  const pct = (value: number, of: number): string => `${(100 * value / of).toFixed(2)}%`;
  const tone = (color: string): string => `--tdl-tone:${escapeHtml(color)}`;
  const lines = rows.map((row) => `<polyline class="cot-tdl-leader" style="${tone(row.callout.color)}" vector-effect="non-scaling-stroke" points="${
    row.leader.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}"/>`).join('');
  const dots = rows.map((row) => `<span class="cot-tdl-pin" style="${tone(row.callout.color)};--tdl-x:${pct(row.leader[0]![0], width)};--tdl-y:${
    pct(row.leader[0]![1], height)}"></span>`).join('');
  const chips = rows.map((row) => `<span class="cot-tdl-chip${row.side === 'right' ? ' cot-tdl-chip--end' : ''}" style="${tone(row.callout.color)};--tdl-x:${
    pct(row.edgeX, width)};--tdl-y:${pct(row.y, height)}">${escapeHtml(row.text)}</span>`).join('');
  const legendRow = legend ? `<div class="cot-tdl-legend">${TECHNICAL_LEGENDS[kind].map(([key, color]) =>
    `<span><i class="cot-tdl-swatch" style="${tone(color)}"></i>${escapeHtml(t(key))}</span>`).join('')}</div>` : '';
  return `<div class="cot-tdl" aria-hidden="true"><svg class="cot-tdl-leaders" xmlns="${SVG}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${
    lines}</svg>${dots}${chips}${legendRow}</div>`;
}

/** The image's rendered content box inside the host (object-fit: contain of the raster's aspect), host-relative px. */
function contentBox(host: HTMLElement, image: HTMLImageElement | null, aspect: number): { x: number; y: number; width: number; height: number } {
  const hostRect = host.getBoundingClientRect();
  const rect = image ? image.getBoundingClientRect() : hostRect;
  let width = rect.width, height = rect.height;
  if (width / Math.max(height, 1e-6) > aspect) width = height * aspect; else height = width / aspect;
  return { x: rect.left - hostRect.left + (rect.width - width) / 2, y: rect.top - hostRect.top + (rect.height - height) / 2, width, height };
}

/**
 * Stand the labels over a diagram image. `host` is a positioned box (position: relative or fixed) holding the image; the
 * overlay covers the image's rendered content box and follows it: it re-lays itself out when the host or the image
 * resizes (the Gallery's zoomed figure included), when the image loads, and when the locale changes. Chips take no
 * pointer events; the image keeps its alt. Returns { refresh, dispose }: dispose removes the overlay, the observer and
 * every listener it added.
 */
export function mountTechnicalDiagramLabels(
  host: HTMLElement, data: TechnicalLabelData, kind: TechnicalKind, header: TechnicalHeader | null = null,
  options: TechnicalMountOptions = {},
): { refresh(): void; dispose(): void } {
  sheet ??= import('./technicalDiagramLabels.css');
  const doc = host.ownerDocument, image = options.image ?? host.querySelector('img');
  const showHeader = options.header !== false && header !== null, showLegend = options.legend !== false;
  const root = doc.createElement('div');
  root.className = 'cot-tdl';
  root.setAttribute('aria-hidden', 'true');
  host.append(root);
  const place = (element: HTMLElement | SVGElement, x: number, y: number): void => {
    element.style.setProperty('--tdl-x', `${x.toFixed(1)}px`);
    element.style.setProperty('--tdl-y', `${y.toFixed(1)}px`);
  };
  const render = (): void => {
    root.replaceChildren();
    const box = contentBox(host, image, data.size[0] / data.size[1]);
    if (box.width < 1 || box.height < 1) return;
    root.style.setProperty('--tdl-box-x', `${box.x.toFixed(1)}px`);
    root.style.setProperty('--tdl-box-y', `${box.y.toFixed(1)}px`);
    root.style.setProperty('--tdl-box-w', `${box.width.toFixed(1)}px`);
    root.style.setProperty('--tdl-box-h', `${box.height.toFixed(1)}px`);
    const fontPx = parseFloat(getComputedStyle(root).fontSize) || 12, rowPx = Math.ceil(fontPx * 1.65);
    // the header and the legend first: the rows stay between their measured heights (a wrapped legend included)
    let headBottom = 0, legendTop = box.height;
    if (showHeader && header) {
      const head = doc.createElement('div');
      head.className = 'cot-tdl-head';
      const lead = doc.createElement('div');
      const name = doc.createElement('div');
      name.className = 'cot-tdl-name';
      name.textContent = header.name;
      const sub = doc.createElement('div');
      sub.className = 'cot-tdl-sub';
      const title = t(TECHNICAL_TITLES[kind]);
      sub.textContent = header.tier ? `${t('garage.card.tier', { tier: header.tier })} · ${title}` : title;
      lead.append(name, sub);
      head.append(lead);
      if (header.designation) {
        const designation = doc.createElement('div');
        designation.className = 'cot-tdl-designation';
        designation.textContent = header.designation;
        head.append(designation);
      }
      root.append(head);
      headBottom = head.offsetHeight;
    }
    if (showLegend) {
      const legend = doc.createElement('div');
      legend.className = 'cot-tdl-legend';
      for (const [key, color] of TECHNICAL_LEGENDS[kind]) {
        const item = doc.createElement('span');
        const swatch = doc.createElement('i');
        swatch.className = 'cot-tdl-swatch';
        swatch.style.setProperty('--tdl-tone', color);
        item.append(swatch, doc.createTextNode(t(key)));
        legend.append(item);
      }
      root.append(legend);
      legendTop = box.height - legend.offsetHeight;
    }
    const rows = layoutTechnicalCallouts(data[kind], kind, box, { rowPx, top: headBottom + rowPx / 2, bottom: legendTop - rowPx / 2 });
    const svg = doc.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'cot-tdl-leaders');
    svg.setAttribute('viewBox', `0 0 ${box.width.toFixed(1)} ${box.height.toFixed(1)}`);
    for (const row of rows) {
      const line = doc.createElementNS(SVG, 'polyline');
      line.setAttribute('class', 'cot-tdl-leader');
      line.setAttribute('points', row.leader.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '));
      line.style.setProperty('--tdl-tone', row.callout.color);
      const dot = doc.createElementNS(SVG, 'circle');
      dot.setAttribute('class', 'cot-tdl-dot');
      dot.setAttribute('cx', row.leader[0]![0].toFixed(1));
      dot.setAttribute('cy', row.leader[0]![1].toFixed(1));
      dot.setAttribute('r', '2');
      dot.style.setProperty('--tdl-tone', row.callout.color);
      svg.append(line, dot);
    }
    root.prepend(svg);
    for (const row of rows) {
      const chip = doc.createElement('span');
      chip.className = `cot-tdl-chip${row.side === 'right' ? ' cot-tdl-chip--end' : ''}`;
      place(chip, row.edgeX, row.y);
      chip.style.setProperty('--tdl-tone', row.callout.color);
      chip.textContent = row.text;
      root.append(chip);
    }
  };
  render();
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => render()) : null;
  observer?.observe(host);
  if (image) observer?.observe(image);
  image?.addEventListener('load', render);
  const offLocale = onLocaleChange(() => render());
  return {
    refresh: render,
    dispose(): void {
      observer?.disconnect();
      image?.removeEventListener('load', render);
      offLocale();
      root.remove();
    },
  };
}
