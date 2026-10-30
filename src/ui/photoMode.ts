// The Garage's photo mode (brand-ui 244; the Premiere direction's 05-garage Photo action). Copyright © 2026 Kevin B. Liu.
// Loaded at its first use, off the game entry. Every piece of the Garage's interface steps away and the stage is the
// picture: drag orbits and the wheel dollies (the showroom's own orbit, held so it never springs back), a few framings
// set the view (the hero pose first: the tank faces left, its turret a little toward the viewer), Save writes a PNG at
// twice the screen through the renderer and its post chain, and Esc returns. It imports only modules that stand in chunks
// of their own; the kit's keycap and the live stage come through the host (an entry module imported here would be split
// off the entry). Its sheet, photoMode.css, loads beside it at the boundary (garage.ts), like every lazy surface's.
import type { PerspectiveCamera, WebGLRenderer } from 'three';
import { t } from './i18n.ts';
import { uiIconSVG } from './uiIcons.ts';

/** The live stage a still is drawn from: main.ts's renderer, camera, post chain and lighting. */
export interface PhotoStill {
  readonly renderer: Pick<WebGLRenderer, 'capabilities' | 'domElement' | 'getPixelRatio' | 'setPixelRatio' | 'setSize'>;
  readonly camera: PerspectiveCamera;
  readonly post: { setSize(width: number, height: number): void; render(dt: number, time: number): void };
  readonly lighting: { updateFrustums?(): void; update(force: boolean): void };
  /** The renderer's size in CSS pixels. */
  size(): { readonly x: number; readonly y: number };
}

interface PhotoModeHost {
  /** The rendered stage (the renderer's canvas): a drag or a dolly on it leaves the chosen framing. */
  readonly stage: HTMLElement;
  /** The showroom orbit: the held framing, an aimed view, and the hero pose. */
  readonly showroom: { hold(on: boolean): void; aim(yawRad: number, pitchRad: number, zoomTo?: number): void; reset(): boolean };
  readonly still: PhotoStill;
  /** The saved file's name (the selected tank's). */
  fileName(): string;
  keycap(label: string): string;
  /** The kit's segmented control and its roving keys (components.ts), through the host as the keycap is. */
  segmented: typeof import('./components/components.ts').segmented;
  wireRoving: typeof import('./components/components.ts').wireRoving;
  click(): void;
  /** Called once photo mode has closed. */
  onClose(): void;
}

const DEG = Math.PI / 180;
/** The framings: the hero pose is the showroom's own (its reset); the rest are views round the turntable, the camera's
 *  yaw from the bow (forward +Z), its pitch over the deck, and the dolly. */
const VIEWS: ReadonlyArray<readonly [id: string, yaw: number, pitch: number, zoom: number] | readonly [id: 'hero']> = [
  ['hero'],
  ['front', 0, 8 * DEG, 1],
  ['side', 90 * DEG, 6 * DEG, 1],
  ['rear', 135 * DEG, 12 * DEG, 1],
  ['top', 45 * DEG, 35 * DEG, 1.2],
];

let openClose: (() => void) | null = null;

/** A PNG of the stage at `scale` times the screen, or null when the canvas cannot be read. It is taken as the Studio's
 *  still is (studio.ts capture): pixel ratio 1 at the target size, every shadow cascade fresh, one frame read back, then
 *  the live view restored. */
function captureStill({ renderer, camera, post, lighting, size }: PhotoStill, scale: number): Promise<Blob | null> {
  const { x, y } = size();
  const ratio = renderer.getPixelRatio();
  const most = renderer.capabilities?.maxTextureSize || 8192;
  const frame = (width: number, height: number): void => {
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    post.setSize(width, height);
    lighting.updateFrustums?.();
    camera.updateMatrixWorld(true);
    lighting.update(true);
    post.render(0, 0);
  };
  let still: Promise<Blob | null> = Promise.resolve(null);
  try {
    renderer.setPixelRatio(1);
    frame(Math.min(most, Math.round(x * scale)), Math.min(most, Math.round(y * scale)));
    // the canvas is read as this call returns (before the restore below redraws it)
    still = new Promise((resolve) => renderer.domElement.toBlob(resolve, 'image/png'));
  } finally {
    renderer.setPixelRatio(ratio);
    frame(x, y);
  }
  return still;
}

/** Open photo mode (a second open while it shows does nothing); returns its close. */
export function openPhotoMode(host: PhotoModeHost): () => void {
  if (openClose) return openClose;
  document.body.classList.add('cot-photo-on');
  host.showroom.hold(true);
  host.showroom.reset();

  const bar = document.createElement('div');
  bar.className = 'cot-photo-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', t('garage.photo.toolbar'));
  // the framings are the kit's segmented control: one is checked, the arrows move it (a drag or a dolly leaves them all)
  bar.innerHTML =
    host.segmented({ label: t('garage.photo.views'), className: 'cot-photo-views', value: 'hero',
      options: VIEWS.map(([id]) => ({ value: id, label: t(`garage.photo.view.${id}`) })) }) +
    `<button type="button" class="cot-c-btn cot-c-btn--36 cot-c-btn--primary" data-photo-save>${uiIconSVG('toolPhoto', 16)}` +
    `<span>${t('garage.photo.save')}</span></button>` +
    `<button type="button" class="cot-c-btn cot-c-btn--36" data-photo-exit><span>${t('garage.photo.exit')}</span>${host.keycap('Esc')}</button>`;
  document.body.append(bar);

  const views = [...bar.querySelectorAll<HTMLButtonElement>('.cot-photo-views [data-value]')];
  const choose = (id: string): void => {
    const view = VIEWS.find(([viewId]) => viewId === id);
    if (!view) return;
    if (view.length === 1) host.showroom.reset();
    else host.showroom.aim(view[1], view[2], view[3]);
  };
  const unwireViews = host.wireRoving(bar.querySelector<HTMLElement>('.cot-photo-views')!, (id) => { host.click(); choose(id); });
  // a drag or a dolly leaves every framing; the first keeps the group's tab stop
  const leaveViews = (): void => {
    for (const [index, button] of views.entries()) {
      button.setAttribute('aria-checked', 'false');
      button.tabIndex = index === 0 ? 0 : -1;
    }
  };
  host.stage.addEventListener('pointerdown', leaveViews);
  host.stage.addEventListener('wheel', leaveViews, { passive: true });

  const save = bar.querySelector<HTMLButtonElement>('[data-photo-save]');
  save?.addEventListener('click', () => {
    if (!save || save.disabled) return;
    host.click();
    save.disabled = true;
    // the bar steps away for the frame itself, so the picture is the stage alone
    bar.hidden = true;
    void captureStill(host.still, 2).then((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = host.fileName();
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }).finally(() => { bar.hidden = false; save.disabled = false; });
  });

  // Esc returns; while it shows, photo mode owns the keyboard (the Garage's keys stay with the Garage's interface)
  const onKey = (event: KeyboardEvent): void => {
    event.stopImmediatePropagation();
    if (event.code === 'Escape') { event.preventDefault(); close(); }
  };
  window.addEventListener('keydown', onKey, true);
  bar.querySelector('[data-photo-exit]')?.addEventListener('click', () => { host.click(); close(); });

  function close(): void {
    if (openClose !== close) return;
    openClose = null;
    window.removeEventListener('keydown', onKey, true);
    host.stage.removeEventListener('pointerdown', leaveViews);
    host.stage.removeEventListener('wheel', leaveViews);
    unwireViews();
    bar.remove();
    document.body.classList.remove('cot-photo-on');
    host.showroom.hold(false);
    host.showroom.reset();
    host.onClose();
  }
  openClose = close;
  // the keyboard lands on the framings (a pointer that opened photo mode sees no ring on them)
  views[0]?.focus({ focusVisible: false } as FocusOptions);
  return close;
}
