// The technical drawing viewer (258): one component for the Gallery dossier, the Garage's drawing dialog, the info
// guides and the Field Manual. A tank's plate for the chosen view (a text-free raster, 1x or 2x) under its vector
// overlay for the chosen kind (armour thickness zones, module and crew outlines from <id>_drawing.json, traced from the
// anatomy), numbered badges on the largest elements, and a key under the drawing: their labels (composed in the active
// locale, technicalDiagramLabels.ts technicalLabelText), the legend and a scale bar in metres. Hovering an element or
// focusing its key row lights both; any other element names itself in a readout while hovered. On a fine pointer the
// drawing zooms (wheel, toward the pointer) and pans (drag); a double click or Fit returns it. The overlay's tones are the
// diagrams' tokens (surface-diagram), mapped from data-tone by technicalDiagramLabels.css. First-party: Kevin B. Liu
// (NOTICE.md).
import { onLocaleChange, t } from './i18n.ts';
import { segmented, wireRoving } from './components/components.ts';
import { TECHNICAL_LEGENDS, type TechnicalKind } from './technicalDiagramLegend.ts';
import { spreadBadges, technicalLabelText } from './technicalDiagramLabels.ts';
import {
  numberedElements, parseTechnicalDrawing, technicalDrawingUrl, technicalPlateUrl, TECHNICAL_KINDS, TECHNICAL_VIEWS,
  type TechnicalDrawingData, type TechnicalDrawingElement, type TechnicalView,
} from './technicalDrawingData.ts';

export interface TechnicalDrawingOptions {
  /** The views offered (default: every view the drawing has) and the one shown first. */
  readonly views?: readonly TechnicalView[];
  readonly view?: TechnicalView;
  /** The kinds offered (default all three) and the one shown first. */
  readonly kinds?: readonly TechnicalKind[];
  readonly kind?: TechnicalKind;
  /** The view and kind tabs (default true); a surface with its own controls calls setView and setKind. */
  readonly controls?: boolean;
  /** Wheel zoom and drag pan on a fine pointer (default true). */
  readonly zoom?: boolean;
  /** The image's alternative text (default: the kind's title). */
  readonly alt?: string;
  /** Where the drawing's files are served (default '/icons/'). */
  readonly base?: string;
  readonly onChange?: (state: { view: TechnicalView; kind: TechnicalKind }) => void;
}

export interface TechnicalDrawingHandle {
  setView(view: TechnicalView): void;
  setKind(kind: TechnicalKind): void;
  /** Resolves once the drawing's data has loaded and its first state is drawn (rejects on a missing or bad file). */
  readonly ready: Promise<void>;
  dispose(): void;
}

/** A badge's spacing in CSS px (its 16 px disc and a hair). */
const BADGE_GAP_CSS_PX = 17;
const ZOOM_MAX = 4;
const KIND_LABEL: Readonly<Record<TechnicalKind, string>> = {
  armor: 'gallery.view.mode.armor', modules: 'gallery.view.mode.modules', crew: 'gallery.view.mode.crew',
};
const VIEW_LABEL: Readonly<Record<TechnicalView, string>> = {
  side: 'gallery.view.view.side', top: 'gallery.view.view.top', front: 'gallery.view.view.front',
};
const SVG = 'http://www.w3.org/2000/svg';

const drawings = new Map<string, Promise<TechnicalDrawingData>>();
/** A tank's drawing data, fetched once a page. */
export function loadTechnicalDrawing(id: string, base = '/icons/'): Promise<TechnicalDrawingData> {
  const cacheKey = `${base}${id}`;
  let pending = drawings.get(cacheKey);
  if (!pending) {
    pending = fetch(technicalDrawingUrl(id, base)).then((response) => {
      if (!response.ok) throw new Error(`technical drawing ${id}: HTTP ${response.status}`);
      return response.json();
    }).then((value) => parseTechnicalDrawing(value, id));
    pending.catch(() => drawings.delete(cacheKey));
    drawings.set(cacheKey, pending);
  }
  return pending;
}

let sheet: Promise<unknown> | null = null;

/** Mount the viewer for `id` into `host` (it fills the host's width; its height follows the drawing and the key). */
export function mountTechnicalDrawing(host: HTMLElement, id: string, options: TechnicalDrawingOptions = {}): TechnicalDrawingHandle {
  sheet ??= import('./technicalDrawing.css');
  const doc = host.ownerDocument, base = options.base ?? '/icons/';
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const root = el('div', 'cot-td');
  const bar = el('div', 'cot-td__bar');
  const viewTabs = el('div', 'cot-td__tabs');
  viewTabs.setAttribute('role', 'group');
  const kindTabs = el('div', 'cot-td__tabs');
  kindTabs.setAttribute('role', 'group');
  bar.append(viewTabs, kindTabs);
  const stage = el('div', 'cot-td__stage');
  const zoomBox = el('div', 'cot-td__zoom');
  const plate = el('img', 'cot-td__plate');
  plate.decoding = 'async';
  plate.draggable = false;
  const overlay = doc.createElementNS(SVG, 'svg');
  overlay.setAttribute('class', 'cot-td__overlay');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('preserveAspectRatio', 'none');
  const badges = el('div', 'cot-td__badges');
  badges.setAttribute('aria-hidden', 'true');
  const tip = el('div', 'cot-td__tip');
  tip.setAttribute('aria-hidden', 'true');
  zoomBox.append(plate, overlay, badges);
  const fit = el('button', 'cot-td__fit');
  fit.type = 'button';
  stage.append(zoomBox, tip, fit);
  const key = el('div', 'cot-td__key');
  const list = el('ol', 'cot-td__list');
  const legend = el('div', 'cot-td__legend');
  const scale = el('div', 'cot-td__scale');
  const scaleBar = el('i');
  const scaleText = el('span');
  scale.append(scaleBar, scaleText);
  key.append(list, legend, scale);
  if (options.controls !== false) root.append(bar);
  root.append(stage, key);
  host.append(root);

  let data: TechnicalDrawingData | null = null;
  let view: TechnicalView = options.view ?? 'side';
  let kind: TechnicalKind = options.kind ?? 'armor';
  let zoom = 1, panX = 0, panY = 0;
  let paths = new Map<string, SVGPathElement>(), rows = new Map<string, HTMLElement>(), marks = new Map<string, HTMLElement>();
  let elements: readonly TechnicalDrawingElement[] = [];
  let numbered: TechnicalDrawingElement[] = [];
  let hot: string | null = null;
  let disposed = false;

  const views = (): TechnicalView[] => (options.views ?? TECHNICAL_VIEWS).filter((v) => data?.views[v]);
  const kinds = (): TechnicalKind[] => [...(options.kinds ?? TECHNICAL_KINDS)];
  const frame = () => data!.views[view]!;
  const labelOf = (element: TechnicalDrawingElement): string => technicalLabelText({ ...element, anchor: [0, 0], weight: 0, color: '' }, kind);

  // the drawing's views and kinds are the kit's segmented controls (261 census), drawn again as the drawing's data names
  // them; their roving keys and presses are wired once on the groups that hold them
  wireRoving(viewTabs, (name) => api.setView(name as TechnicalView));
  wireRoving(kindTabs, (name) => api.setKind(name as TechnicalKind));
  const light = (keyName: string | null): void => {
    if (hot === keyName) return;
    for (const map of [paths, rows, marks]) {
      if (hot) map.get(hot)?.classList.remove('is-hot');
      if (keyName) map.get(keyName)?.classList.add('is-hot');
    }
    hot = keyName;
    root.classList.toggle('is-hot', keyName !== null);
  };

  const place = (): void => {
    if (!data) return;
    const { size: [w, h], pxPerM } = frame();
    const shown = stage.getBoundingClientRect().width || w / 2;
    // badges spread for their on-screen size: a frame pixel is shown at shown / w CSS px (times the zoom)
    const gap = BADGE_GAP_CSS_PX * w / shown / zoom;
    const spots = spreadBadges(numbered.map((element) => element.at!), gap, { width: w, height: h });
    numbered.forEach((element, index) => {
      const mark = marks.get(element.key);
      if (!mark) return;
      mark.style.setProperty('--td-x', `${(100 * spots[index]![0] / w).toFixed(3)}%`);
      mark.style.setProperty('--td-y', `${(100 * spots[index]![1] / h).toFixed(3)}%`);
    });
    // the scale bar: the round length nearest a fifth of the shown width
    const cssPerM = pxPerM * shown / w;
    const metres = [0.5, 1, 2, 5].reduce((best, m) => (Math.abs(m * cssPerM - shown / 5) < Math.abs(best * cssPerM - shown / 5) ? m : best), 1);
    scaleBar.style.setProperty('--td-scale', `${(metres * cssPerM).toFixed(1)}px`);
    scaleText.textContent = `${metres} ${t('gallery.unit.m')}`;
  };

  const applyZoom = (): void => {
    const box = stage.getBoundingClientRect();
    const maxX = (zoom - 1) * box.width, maxY = (zoom - 1) * box.height;
    panX = Math.min(0, Math.max(-maxX, panX));
    panY = Math.min(0, Math.max(-maxY, panY));
    zoomBox.style.setProperty('--td-zoom', String(zoom));
    zoomBox.style.setProperty('--td-pan-x', `${panX.toFixed(1)}px`);
    zoomBox.style.setProperty('--td-pan-y', `${panY.toFixed(1)}px`);
    root.classList.toggle('is-zoomed', zoom > 1.001);
    // zoomed in, the 2x plate whatever the display's density
    plate.srcset = zoom > 1.25 ? `${technicalPlateUrl(id, view, 2, base)} 2x`
      : `${technicalPlateUrl(id, view, 1, base)} 1x, ${technicalPlateUrl(id, view, 2, base)} 2x`;
    place();
  };

  const draw = (): void => {
    if (!data || disposed) return;
    if (!data.views[view]) view = views()[0] ?? view;
    const v = frame(), [w, h] = v.size;
    viewTabs.innerHTML = segmented({ label: t('gallery.viewer.viewControlsAria'), className: 'cot-td__views', value: view,
      options: views().map((name) => ({ value: name, label: t(VIEW_LABEL[name]) })) });
    kindTabs.innerHTML = segmented({ label: t('gallery.view.modeDockAria'), className: 'cot-td__kinds', value: kind,
      options: kinds().map((name) => ({ value: name, label: t(KIND_LABEL[name]) })) });
    viewTabs.setAttribute('aria-label', t('gallery.drawing.viewsAria'));
    kindTabs.setAttribute('aria-label', t('gallery.view.modeDockAria'));
    fit.textContent = t('gallery.drawing.fit');
    root.dataset.kind = kind;
    stage.style.setProperty('--td-aspect', `${w} / ${h}`);
    plate.src = technicalPlateUrl(id, view, 1, base);
    plate.alt = options.alt ?? t(kind === 'armor' ? 'garage.dossier.image.armorSide' : kind === 'modules' ? 'garage.dossier.image.modulesSide' : 'garage.dossier.image.crewSide');
    overlay.setAttribute('viewBox', `0 0 ${w} ${h}`);
    elements = v.layers[kind];
    numbered = numberedElements(v, kind);
    paths = new Map(); rows = new Map(); marks = new Map(); hot = null;
    root.classList.remove('is-hot');
    overlay.replaceChildren(...[...elements].reverse().map((element) => {
      const path = doc.createElementNS(SVG, 'path');
      path.setAttribute('class', 'cot-td__el');
      path.setAttribute('d', element.d);
      path.setAttribute('fill-rule', 'evenodd');
      if (element.tone) path.setAttribute('data-tone', element.tone);
      path.dataset.key = element.key;
      paths.set(element.key, path);
      return path;
    }));
    badges.replaceChildren(...numbered.map((element, index) => {
      const mark = el('b', 'cot-td__badge', String(index + 1));
      if (element.tone) mark.setAttribute('data-tone', element.tone);
      marks.set(element.key, mark);
      return mark;
    }));
    list.replaceChildren(...numbered.map((element, index) => {
      const row = el('li');
      const button = el('button', 'cot-td__row');
      button.type = 'button';
      const n = el('b', 'cot-td__n', String(index + 1));
      if (element.tone) n.setAttribute('data-tone', element.tone);
      button.append(n, doc.createTextNode(labelOf(element)));
      for (const on of ['pointerenter', 'focus'] as const) button.addEventListener(on, () => light(element.key));
      for (const off of ['pointerleave', 'blur'] as const) button.addEventListener(off, () => light(null));
      row.append(button);
      rows.set(element.key, button);
      return row;
    }));
    legend.replaceChildren(...TECHNICAL_LEGENDS[kind].map(([name, tone]) => {
      const item = el('span');
      const swatch = el('i', 'cot-td__swatch');
      swatch.setAttribute('data-tone', tone);
      item.append(swatch, doc.createTextNode(t(name)));
      return item;
    }));
    zoom = 1; panX = 0; panY = 0;
    applyZoom();
    options.onChange?.({ view, kind });
  };

  // hover: an element lights, and names itself in the readout when it has no badge
  const elementAt = (target: EventTarget | null): TechnicalDrawingElement | null => {
    const keyName = (target as SVGElement | null)?.dataset?.key;
    return keyName ? elements.find((element) => element.key === keyName) ?? null : null;
  };
  overlay.addEventListener('pointermove', (event) => {
    const element = elementAt(event.target);
    light(element?.key ?? null);
    if (element && !marks.has(element.key)) {
      const box = stage.getBoundingClientRect();
      tip.textContent = labelOf(element);
      tip.style.setProperty('--td-x', `${(event.clientX - box.left).toFixed(0)}px`);
      tip.style.setProperty('--td-y', `${(event.clientY - box.top).toFixed(0)}px`);
      tip.classList.add('is-on');
    } else tip.classList.remove('is-on');
  });
  overlay.addEventListener('pointerleave', () => { light(null); tip.classList.remove('is-on'); });

  // zoom and pan on a fine pointer
  const fine = options.zoom !== false && typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
  const zoomAt = (factor: number, x: number, y: number): void => {
    const next = Math.min(ZOOM_MAX, Math.max(1, zoom * factor));
    panX = x - (x - panX) * next / zoom;
    panY = y - (y - panY) * next / zoom;
    zoom = next;
    applyZoom();
  };
  if (fine) {
    root.classList.add('can-zoom');
    stage.addEventListener('wheel', (event) => {
      if (!event.ctrlKey && !event.metaKey && zoom === 1 && event.deltaY > 0) return; // let the page scroll past
      event.preventDefault();
      const box = stage.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - box.left, event.clientY - box.top);
    }, { passive: false });
    let drag: { x: number; y: number; panX: number; panY: number } | null = null;
    stage.addEventListener('pointerdown', (event) => {
      if (zoom <= 1 || event.button !== 0) return;
      drag = { x: event.clientX, y: event.clientY, panX, panY };
      stage.setPointerCapture(event.pointerId);
    });
    stage.addEventListener('pointermove', (event) => {
      if (!drag) return;
      panX = drag.panX + event.clientX - drag.x;
      panY = drag.panY + event.clientY - drag.y;
      applyZoom();
    });
    stage.addEventListener('pointerup', () => { drag = null; });
    stage.addEventListener('dblclick', () => { zoom = 1; panX = 0; panY = 0; applyZoom(); });
  }
  fit.addEventListener('click', () => { zoom = 1; panX = 0; panY = 0; applyZoom(); });

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => place()) : null;
  observer?.observe(stage);
  const offLocale = onLocaleChange(() => draw());

  const api: TechnicalDrawingHandle = {
    setView(next) { if (next !== view) { view = next; draw(); } },
    setKind(next) { if (next !== kind) { kind = next; draw(); } },
    ready: loadTechnicalDrawing(id, base).then((loaded) => { data = loaded; draw(); }),
    dispose() {
      disposed = true;
      observer?.disconnect();
      offLocale();
      root.remove();
    },
  };
  return api;
}
