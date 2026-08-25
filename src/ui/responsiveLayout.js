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

export const VIEWPORT_HEIGHT_BANDS = Object.freeze({
  short: Object.freeze({ min: 0, max: 519 }),
  compact: Object.freeze({ min: 520, max: 719 }),
  standard: Object.freeze({ min: 720, max: 899 }),
  tall: Object.freeze({ min: 900, max: Infinity }),
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const RESPONSIVE_LAYOUT_HANDLE = Symbol.for('claude-of-tanks.responsive-layout');

export function viewportWidthBand(width) {
  const value = Number.isFinite(width) ? Math.max(0, width) : 0;
  if (value <= VIEWPORT_WIDTH_BANDS.phone.max) return 'phone';
  if (value <= VIEWPORT_WIDTH_BANDS.compact.max) return 'compact';
  if (value <= VIEWPORT_WIDTH_BANDS.tablet.max) return 'tablet';
  if (value <= VIEWPORT_WIDTH_BANDS.laptop.max) return 'laptop';
  return 'desktop';
}

export function viewportHeightBand(height) {
  const value = Number.isFinite(height) ? Math.max(0, height) : 0;
  if (value <= VIEWPORT_HEIGHT_BANDS.short.max) return 'short';
  if (value <= VIEWPORT_HEIGHT_BANDS.compact.max) return 'compact';
  if (value <= VIEWPORT_HEIGHT_BANDS.standard.max) return 'standard';
  return 'tall';
}

export function classifyViewport({ width, height, coarsePointer = false, hover = true } = {}) {
  const safeWidth = Number.isFinite(width) ? Math.max(1, width) : 1;
  const safeHeight = Number.isFinite(height) ? Math.max(1, height) : 1;
  const widthBand = viewportWidthBand(safeWidth);
  const heightBand = viewportHeightBand(safeHeight);
  const widthDensity = safeWidth <= 380 ? 'narrow' : 'roomy';
  const heightDensity = safeHeight <= 430 ? 'tight' : 'roomy';
  const orientation = safeWidth >= safeHeight ? 'landscape' : 'portrait';
  const input = coarsePointer || !hover ? 'coarse' : 'fine';
  const overlayPanels = heightBand === 'short'
    || widthBand === 'phone' || widthBand === 'compact' || widthBand === 'tablet'
    || (input === 'coarse' && widthBand === 'laptop');
  const compactHeader = overlayPanels || heightBand === 'short';
  const scale = clamp(Math.min(safeWidth / 1440, safeHeight / 900), 0.78, 1.08);

  return Object.freeze({
    width: safeWidth,
    height: safeHeight,
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

function measureViewport(win) {
  const viewport = win.visualViewport;
  return {
    width: Math.round(viewport?.width || win.innerWidth || 1),
    height: Math.round(viewport?.height || win.innerHeight || 1),
    coarsePointer: !!win.matchMedia?.('(pointer: coarse)').matches,
    hover: !!win.matchMedia?.('(hover: hover)').matches,
  };
}

/** Install the canonical responsive attributes and keep them synchronized. */
export function installResponsiveLayout(win = globalThis.window, doc = globalThis.document) {
  if (!win || !doc?.documentElement || !doc?.body) {
    return { snapshot: () => classifyViewport(), refresh() {}, destroy() {} };
  }
  if (win[RESPONSIVE_LAYOUT_HANDLE]) return win[RESPONSIVE_LAYOUT_HANDLE];

  const root = doc.documentElement;
  const body = doc.body;
  const pointerQuery = win.matchMedia?.('(pointer: coarse)');
  const hoverQuery = win.matchMedia?.('(hover: hover)');
  let current = null;
  let frame = 0;

  const apply = () => {
    frame = 0;
    const next = classifyViewport(measureViewport(win));
    const changed = !current || [
      'widthBand', 'heightBand', 'widthDensity', 'heightDensity', 'orientation', 'input', 'overlayPanels',
    ].some((key) => current[key] !== next[key]);
    current = next;

    body.dataset.cotWidth = next.widthBand;
    body.dataset.cotHeight = next.heightBand;
    body.dataset.cotWidthDensity = next.widthDensity;
    body.dataset.cotHeightDensity = next.heightDensity;
    body.dataset.cotOrientation = next.orientation;
    body.dataset.cotInput = next.input;
    body.dataset.cotPanels = next.overlayPanels ? 'overlay' : 'persistent';
    root.style.setProperty('--cot-viewport-width', `${next.width}px`);
    root.style.setProperty('--cot-viewport-height', `${next.height}px`);
    root.style.setProperty('--cot-ui-scale', next.scale.toFixed(4));

    if (changed) {
      win.dispatchEvent(new CustomEvent('cot:layoutchange', { detail: next }));
    }
  };

  const refresh = () => {
    if (frame) return;
    frame = win.requestAnimationFrame(apply);
  };

  win.addEventListener('resize', refresh, { passive: true });
  win.addEventListener('orientationchange', refresh, { passive: true });
  win.visualViewport?.addEventListener('resize', refresh, { passive: true });
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
      pointerQuery?.removeEventListener?.('change', refresh);
      hoverQuery?.removeEventListener?.('change', refresh);
      delete win[RESPONSIVE_LAYOUT_HANDLE];
    },
  };
  win[RESPONSIVE_LAYOUT_HANDLE] = handle;
  return handle;
}
