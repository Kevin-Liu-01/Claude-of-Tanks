import type { RuntimeValue } from '../runtimeTypes.ts';
/**
 * One viewport contract for every game surface.
 *
 * Components consume semantic body attributes instead of independently
 * inventing phone/tablet breakpoints. Width and height bands describe layout
 * pressure; input mode describes interaction affordances. None of those
 * signals is used as a device-name guess.
 */

export const VIEWPORT_WIDTH_BANDS = Object.freeze({
  phone: Object.freeze({ min: 0, max: 519 }),
  compact: Object.freeze({ min: 520, max: 767 }),
  tablet: Object.freeze({ min: 768, max: 1099 }),
  laptop: Object.freeze({ min: 1100, max: 1439 }),
  desktop: Object.freeze({ min: 1440, max: Infinity }),
});

/** Fine-pointer windows at least this wide keep the persistent Garage sidebars. */
const PERSISTENT_PANELS_MIN_WIDTH = 900;

export const VIEWPORT_HEIGHT_BANDS = Object.freeze({
  short: Object.freeze({ min: 0, max: 519 }),
  compact: Object.freeze({ min: 520, max: 719 }),
  standard: Object.freeze({ min: 720, max: 899 }),
  tall: Object.freeze({ min: 900, max: Infinity }),
});

type ViewportWidthBand = keyof typeof VIEWPORT_WIDTH_BANDS;
type ViewportHeightBand = keyof typeof VIEWPORT_HEIGHT_BANDS;
type ViewportOrientation = 'landscape' | 'portrait';
type ViewportInputMode = 'coarse' | 'fine';

interface ViewportMeasurements {
  width?: number;
  height?: number;
  offsetLeft?: number;
  offsetTop?: number;
  visualScale?: number;
  coarsePointer?: boolean;
  hover?: boolean;
}

interface ViewportSnapshot {
  readonly width: number;
  readonly height: number;
  readonly offsetLeft: number;
  readonly offsetTop: number;
  readonly visualScale: number;
  readonly widthBand: ViewportWidthBand;
  readonly heightBand: ViewportHeightBand;
  readonly widthDensity: 'narrow' | 'roomy';
  readonly heightDensity: 'tight' | 'roomy';
  readonly orientation: ViewportOrientation;
  readonly input: ViewportInputMode;
  readonly overlayPanels: boolean;
  readonly compactHeader: boolean;
  readonly scale: number;
}

interface ResponsiveLayoutHandle {
  snapshot(): ViewportSnapshot | null;
  refresh(): void;
  destroy(): void;
}

type ResponsiveWindow = Window & { [key: symbol]: RuntimeValue };

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
const RESPONSIVE_LAYOUT_HANDLE = Symbol.for('claude-of-tanks.responsive-layout');

export function viewportWidthBand(width: number): ViewportWidthBand {
  const value = Number.isFinite(width) ? Math.max(0, width) : 0;
  if (value <= VIEWPORT_WIDTH_BANDS.phone.max) return 'phone';
  if (value <= VIEWPORT_WIDTH_BANDS.compact.max) return 'compact';
  if (value <= VIEWPORT_WIDTH_BANDS.tablet.max) return 'tablet';
  if (value <= VIEWPORT_WIDTH_BANDS.laptop.max) return 'laptop';
  return 'desktop';
}

export function viewportHeightBand(height: number): ViewportHeightBand {
  const value = Number.isFinite(height) ? Math.max(0, height) : 0;
  if (value <= VIEWPORT_HEIGHT_BANDS.short.max) return 'short';
  if (value <= VIEWPORT_HEIGHT_BANDS.compact.max) return 'compact';
  if (value <= VIEWPORT_HEIGHT_BANDS.standard.max) return 'standard';
  return 'tall';
}

export function classifyViewport({
  width,
  height,
  offsetLeft = 0,
  offsetTop = 0,
  visualScale = 1,
  coarsePointer = false,
  hover = true,
}: ViewportMeasurements = {}): Readonly<ViewportSnapshot> {
  const safeWidth = typeof width === 'number' && Number.isFinite(width) ? Math.max(1, width) : 1;
  const safeHeight = typeof height === 'number' && Number.isFinite(height) ? Math.max(1, height) : 1;
  const safeOffsetLeft = typeof offsetLeft === 'number' && Number.isFinite(offsetLeft)
    ? Math.max(0, offsetLeft) : 0;
  const safeOffsetTop = typeof offsetTop === 'number' && Number.isFinite(offsetTop)
    ? Math.max(0, offsetTop) : 0;
  const safeVisualScale = typeof visualScale === 'number' && Number.isFinite(visualScale)
    ? Math.max(.01, visualScale) : 1;
  const widthBand = viewportWidthBand(safeWidth);
  const heightBand = viewportHeightBand(safeHeight);
  const widthDensity = safeWidth <= 380 ? 'narrow' : 'roomy';
  const heightDensity = safeHeight <= 430 ? 'tight' : 'roomy';
  const orientation = safeWidth >= safeHeight ? 'landscape' : 'portrait';
  const input = coarsePointer || !hover ? 'coarse' : 'fine';
  // Panel policy (2026-09-19, owner: "the boundary for showing a lot of content is a lil off, we're cutting it
  // all off a lil too early, it's not mobile yet but we already lost all the side panel details"): a fine-pointer
  // window keeps its two persistent sidebars from 900 px of width up — the sidebars narrow and the UI scale
  // falls to 0.78 before anything is hidden — and only phones, compact widths, short heights and coarse-pointer
  // tablets/laptops (an iPad without a trackpad) fold the panels into overlays. The former laptop pressure rule
  // (< 1240 px or a tall viewport) folded ordinary desktop windows.
  const pressuredTablet = widthBand === 'tablet' && (safeWidth < PERSISTENT_PANELS_MIN_WIDTH || input === 'coarse');
  const pressuredLaptop = widthBand === 'laptop' && input === 'coarse';
  const overlayPanels = heightBand === 'short'
    || widthBand === 'phone' || widthBand === 'compact'
    || pressuredTablet || pressuredLaptop;
  const compactHeader = overlayPanels;
  const scale = clamp(Math.min(safeWidth / 1440, safeHeight / 900), 0.78, 1.08);

  return Object.freeze({
    width: safeWidth,
    height: safeHeight,
    offsetLeft: safeOffsetLeft,
    offsetTop: safeOffsetTop,
    visualScale: safeVisualScale,
    widthBand,
    heightBand,
    widthDensity,
    heightDensity,
    orientation,
    input,
    overlayPanels,
    compactHeader,
    scale,
  });
}

/**
 * A pinch (a trackpad spread, a two-finger zoom on a phone) zooms the VISUAL viewport: its scale rises above 1,
 * its width and height shrink to the layout size divided by that scale, its offsets follow the pan, and window
 * 'resize' never fires. It is a magnifier, never a different screen (2026-10-15, owner: "using both my fingers on
 * track pad to like expand the screen in landing causes a bunch of weirdness and layout shifts"). A scale this far
 * from 1 counts as zoomed.
 */
const PINCH_SCALE_EPSILON = 0.01;

interface VisualViewportLike {
  readonly width?: number;
  readonly height?: number;
  readonly offsetLeft?: number;
  readonly offsetTop?: number;
  readonly scale?: number;
}

interface LayoutViewportWindow {
  readonly innerWidth?: number;
  readonly innerHeight?: number;
  readonly visualViewport?: VisualViewportLike | null;
}

interface LayoutViewportSize {
  /** CSS px the page lays out across: the visible width as it is at pinch scale 1. */
  readonly width: number;
  readonly height: number;
  /** Visual-viewport offsets at pinch scale 1 (on-screen keyboard, iOS toolbars); 0 while pinch-zoomed. */
  readonly offsetLeft: number;
  readonly offsetTop: number;
  /** The live pinch scale, informational only: no layout reads it. */
  readonly visualScale: number;
}

const finitePositive = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

/** The visual viewport's pinch scale (1 when the browser has none or reports nonsense). */
function pinchScale(viewport: VisualViewportLike | null | undefined): number {
  return finitePositive(viewport?.scale) || 1;
}

/** True while a pinch has zoomed the page in or out (the visual viewport is a magnified part of the layout). */
export function isPinchZoomed(viewport: VisualViewportLike | null | undefined): boolean {
  return Math.abs(pinchScale(viewport) - 1) > PINCH_SCALE_EPSILON;
}

/**
 * The one viewport measurement every layout reader shares.
 *
 * At pinch scale 1 it is the visual viewport, exactly as before: iOS third-party browsers can report a layout
 * viewport taller or shorter than the visible page, and the on-screen keyboard shrinks the visible height.
 * Under a pinch it is that same visible area unzoomed (visual size × scale), which keeps the keyboard-shrunk
 * height and equals the unchanged layout viewport on desktop, so a pinch never moves a band, a size variable or
 * the renderer. innerWidth is not used while zoomed: WebKit on iOS reports a zoom-dependent innerWidth.
 */
export function layoutViewportSize(
  win: LayoutViewportWindow | undefined = globalThis.window,
): LayoutViewportSize {
  const viewport = win?.visualViewport;
  const scale = pinchScale(viewport);
  const zoomed = isPinchZoomed(viewport);
  const visualWidth = finitePositive(viewport?.width);
  const visualHeight = finitePositive(viewport?.height);
  return {
    width: Math.max(1, Math.round(visualWidth ? visualWidth * scale : finitePositive(win?.innerWidth) || 1)),
    height: Math.max(1, Math.round(visualHeight ? visualHeight * scale : finitePositive(win?.innerHeight) || 1)),
    offsetLeft: zoomed ? 0 : Math.round(viewport?.offsetLeft || 0),
    offsetTop: zoomed ? 0 : Math.round(viewport?.offsetTop || 0),
    visualScale: scale,
  };
}

function measureViewport(
  win: Window,
  pointerQuery: MediaQueryList | undefined,
  hoverQuery: MediaQueryList | undefined,
): Required<ViewportMeasurements> {
  return {
    ...layoutViewportSize(win),
    coarsePointer: !!pointerQuery?.matches,
    hover: !!hoverQuery?.matches,
  };
}

/** Install the canonical responsive attributes and keep them synchronized. */
export function installResponsiveLayout(
  win: Window | undefined = globalThis.window,
  doc: Document | undefined = globalThis.document,
): ResponsiveLayoutHandle {
  if (!win || !doc?.documentElement || !doc?.body) {
    return { snapshot: () => classifyViewport(), refresh() {}, destroy() {} };
  }
  const responsiveWindow = win as ResponsiveWindow;
  const existing = responsiveWindow[RESPONSIVE_LAYOUT_HANDLE];
  if (existing) return existing as ResponsiveLayoutHandle;

  const root = doc.documentElement;
  const body = doc.body;
  const pointerQuery = win.matchMedia?.('(pointer: coarse)');
  const hoverQuery = win.matchMedia?.('(hover: hover)');
  let current: ViewportSnapshot | null = null;
  let frame = 0;
  // Only what a layout reads emits cot:layoutchange. Offsets and the pinch scale have no layout consumer, and a
  // zoomed pan changes nothing else, so neither may restyle the document or wake the renderer.
  const layoutKeys = [
    'width', 'height',
    'widthBand', 'heightBand', 'widthDensity', 'heightDensity', 'orientation', 'input', 'overlayPanels',
  ] as const satisfies readonly (keyof ViewportSnapshot)[];
  const written = new Map<string, string>();
  const setVar = (name: string, value: string): void => {
    if (written.get(name) === value) return;
    written.set(name, value);
    root.style.setProperty(name, value);
  };
  const setData = (key: string, value: string): void => {
    if (body.dataset[key] !== value) body.dataset[key] = value;
  };

  const apply = () => {
    frame = 0;
    const measured = measureViewport(win, pointerQuery, hoverQuery);
    // visual size × scale is exact to a float's rounding; a pinch must not wobble the layout by a pixel
    if (current && measured.visualScale !== 1 && Math.abs(measured.width - current.width) <= 1
      && Math.abs(measured.height - current.height) <= 1) {
      measured.width = current.width;
      measured.height = current.height;
    }
    const next = classifyViewport(measured);
    const changed = !current || layoutKeys.some((key) => current?.[key] !== next[key]);
    current = next;

    setData('cotWidth', next.widthBand);
    setData('cotHeight', next.heightBand);
    setData('cotWidthDensity', next.widthDensity);
    setData('cotHeightDensity', next.heightDensity);
    setData('cotOrientation', next.orientation);
    setData('cotInput', next.input);
    setData('cotPanels', next.overlayPanels ? 'overlay' : 'persistent');
    setData('cotViewport', 'visual');
    setVar('--cot-viewport-width', `${next.width}px`);
    setVar('--cot-viewport-height', `${next.height}px`);
    setVar('--cot-ui-scale', next.scale.toFixed(4));

    if (changed) {
      win.dispatchEvent(new CustomEvent('cot:layoutchange', { detail: next }));
    }
  };

  const refresh = () => {
    if (frame) return;
    frame = win.requestAnimationFrame(apply);
  };
  // A pan inside a pinch-zoomed page moves only the offsets; at scale 1 a scroll can carry an iOS keyboard or
  // toolbar height change, so it still measures.
  const onVisualScroll = () => {
    if (!isPinchZoomed(win.visualViewport)) refresh();
  };

  win.addEventListener('resize', refresh, { passive: true });
  win.addEventListener('orientationchange', refresh, { passive: true });
  win.visualViewport?.addEventListener('resize', refresh, { passive: true });
  win.visualViewport?.addEventListener('scroll', onVisualScroll, { passive: true });
  pointerQuery?.addEventListener?.('change', refresh);
  hoverQuery?.addEventListener?.('change', refresh);
  apply();

  const handle = {
    snapshot: () => current,
    refresh,
    destroy() {
      if (frame) win.cancelAnimationFrame(frame);
      win.removeEventListener('resize', refresh);
      win.removeEventListener('orientationchange', refresh);
      win.visualViewport?.removeEventListener('resize', refresh);
      win.visualViewport?.removeEventListener('scroll', onVisualScroll);
      pointerQuery?.removeEventListener?.('change', refresh);
      hoverQuery?.removeEventListener?.('change', refresh);
      delete responsiveWindow[RESPONSIVE_LAYOUT_HANDLE];
    },
  };
  responsiveWindow[RESPONSIVE_LAYOUT_HANDLE] = handle;
  return handle;
}
