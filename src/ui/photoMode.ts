// Photo mode: one implementation for the Garage and for a solo battle (brand-ui 244; photo-mode-271).
// Copyright © 2026 Kevin B. Liu.
// Loaded at its first use, off the game entry. Every piece of the interface steps away and the stage is the picture: a
// drag orbits and the wheel dollies (the host's camera: the Garage's showroom orbit, held so it never springs back, or
// the battle's free photo camera over a frozen battle), a few framings set the view (the hero pose first: the tank's bow
// three-quarters toward the viewer), a battle adds the lens and the roll, Save writes a PNG at twice the screen through
// the renderer and its post chain, and Esc (or P) returns. It imports only modules that stand in chunks of their own; the
// kit's controls and the live stage come through the host (an entry module imported here would be split off the entry).
// Its sheet, photoMode.css, loads beside it at the boundary (garage.ts, battlePhotoMode.ts), like every lazy surface's.
import type { PerspectiveCamera, WebGLRenderer } from 'three';
import type { TransientSurface } from './components/surfaceStack.ts';
import { leaveThen } from './components/surfaceMotion.ts';
import { t } from './i18n.ts';
import { uiIconSVG } from './uiIcons.ts';

/** The live stage a still is drawn from: main.ts's renderer, camera, post chain and lighting. */
export interface PhotoStill {
  readonly renderer: Pick<WebGLRenderer, 'capabilities' | 'domElement' | 'getPixelRatio' | 'setPixelRatio' | 'setSize'>;
  readonly camera: PerspectiveCamera;
  readonly post: { setSize(width: number, height: number): void; render(dt: number, time: number): void; pinDynScale?(value: number | null): void };
  readonly lighting: { updateFrustums?(): void; update(force: boolean): void };
  /** The renderer's size in CSS pixels. */
  size(): { readonly x: number; readonly y: number };
}

/** The camera a photo is framed with. The Garage's showroom orbit and the battle's photo camera both serve it. */
export interface PhotoView {
  /** Hold the framing: nothing springs back to a resting pose while held. */
  hold(on: boolean): void;
  /** Steer toward a view: yaw from the bow and pitch over the deck (rad), and the dolly (1 = the hero fit). */
  aim(yawRad: number, pitchRad: number, zoomTo?: number): void;
  /** The hero pose. */
  reset(): boolean;
  /** The bar covers this much of the stage's bottom (CSS px): framings fit and centre above it (0 for a still). */
  inset?(bottomPx: number): void;
}

/** The lens and the roll (the battle's photo camera; the Garage's showroom fits its own lens to the hero). */
export interface PhotoLens {
  readonly lensesMm: readonly number[];
  readonly tiltsDeg: readonly number[];
  setLens(mm: number): void;
  setRollDeg(deg: number): void;
  /** The lens photo mode opens on (checked, and set). */
  readonly openMm: number;
}

/** The kit's controls (components.ts) and its surface stack (components/surfaceStack.ts), through the host. */
export interface PhotoKit {
  keycap(label: string): string;
  segmented: typeof import('./components/components.ts').segmented;
  wireRoving: typeof import('./components/components.ts').wireRoving;
  openSurface: typeof import('./components/surfaceStack.ts').openSurface;
  closeSurface: typeof import('./components/surfaceStack.ts').closeSurface;
}

export type PhotoScope = 'garage' | 'battle';

interface PhotoModeHost {
  /** Where photo mode opened: its sheet steps that surface's interface away (body[data-cot-photo]). */
  readonly scope: PhotoScope;
  /** The rendered stage (the renderer's canvas): a drag or a dolly on it leaves the chosen framing. */
  readonly stage: HTMLElement;
  readonly view: PhotoView;
  readonly lens?: PhotoLens;
  /** Open on the hero framing (the Garage), or on the camera as it stands (a battle: the view the player had). */
  readonly openOnHero: boolean;
  readonly still: PhotoStill;
  readonly kit: PhotoKit;
  /** The saved file's name. */
  fileName(): string;
  click(): void;
  /** A key photo mode does not take itself (the host's camera keys); true when the host used it. */
  key?(event: KeyboardEvent): boolean;
  /** Called once photo mode has closed. */
  onClose(): void;
}

const DEG = Math.PI / 180;
/** The framings: the hero pose is the camera's own (its reset); the rest are views round the subject, the camera's yaw
 *  from the bow (forward +Z) and its pitch over the deck; the camera fits the whole subject from there. */
export const PHOTO_FRAMINGS: ReadonlyArray<readonly [id: string, yaw: number, pitch: number] | readonly [id: 'hero']> = [
  ['hero'],
  ['front', 0, 8 * DEG],
  ['side', 90 * DEG, 6 * DEG],
  ['rear', 135 * DEG, 12 * DEG],
  ['top', 45 * DEG, 35 * DEG],
];

/** The keys a focused kit control keeps (its roving arrows, the tab order, a press). */
const CONTROL_KEYS = /^(Arrow|Home$|End$|Tab$|Enter$|NumpadEnter$|Space$)/;

let openClose: (() => void) | null = null;

/** Photo mode shows (in either surface). */
export const isPhotoModeOpen = (): boolean => openClose !== null;

/** A PNG of the stage at `scale` times the screen, or null when the canvas cannot be read. It is taken as the Studio's
 *  still is (studio.ts capture): pixel ratio 1 at the target size, the resolution governor held at full scale, every
 *  shadow cascade fresh, one frame read back, then the live view restored. */
export function captureStill({ renderer, camera, post, lighting, size }: PhotoStill, scale: number): Promise<Blob | null> {
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
    post.pinDynScale?.(1);
    renderer.setPixelRatio(1);
    frame(Math.min(most, Math.round(x * scale)), Math.min(most, Math.round(y * scale)));
    // the canvas is read as this call returns (before the restore below redraws it)
    still = new Promise((resolve) => renderer.domElement.toBlob(resolve, 'image/png'));
  } finally {
    renderer.setPixelRatio(ratio);
    post.pinDynScale?.(null);
    frame(x, y);
  }
  return still;
}

const signedDeg = (deg: number): string => `${deg < 0 ? '−' : deg > 0 ? '+' : ''}${Math.abs(deg)}°`;

/** Open photo mode (a second open while it shows does nothing); returns its close. */
export function openPhotoMode(host: PhotoModeHost): () => void {
  if (openClose) return openClose;
  const { kit, view, lens } = host;
  document.body.classList.add('cot-photo-on');
  document.body.dataset.cotPhoto = host.scope;
  view.hold(true);
  // a battle opens on its normal lens, which the framing below fits to
  if (lens) lens.setLens(lens.openMm);
  if (host.openOnHero) view.reset();

  const bar = document.createElement('div');
  // (ui-motion-275) the bar rises in and leaves the same way (components/surfaceMotion.css); closing hands the Garage back
  // at once, only the bar's removal waits for its exit
  bar.className = 'cot-photo-bar cot-m-rise';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', t('photo.toolbar'));
  // the framings, the lens and the roll are the kit's segmented control: one is checked, the arrows move it (a drag, a
  // dolly or a roll key leaves them)
  bar.innerHTML =
    kit.segmented({ label: t('photo.views'), className: 'cot-photo-views', value: host.openOnHero ? 'hero' : '',
      options: PHOTO_FRAMINGS.map(([id]) => ({ value: id, label: t(`photo.view.${id}`) })) }) +
    (lens
      ? kit.segmented({ label: t('photo.lens'), className: 'cot-photo-lens', value: String(lens.openMm),
        options: lens.lensesMm.map((mm) => ({ value: String(mm), label: t('photo.lensMm', { mm }) })) }) +
        kit.segmented({ label: t('photo.tilt'), className: 'cot-photo-tilt', value: '0',
          options: lens.tiltsDeg.map((deg) => ({ value: String(deg), label: signedDeg(deg) })) })
      : '') +
    // Save and Exit wrap as one pair, never Exit alone on a row
    `<div class="cot-photo-actions">` +
    `<button type="button" class="cot-c-btn cot-c-btn--36 cot-c-btn--primary" data-photo-save>${uiIconSVG('toolPhoto', 16)}` +
    `<span>${t('photo.save')}</span></button>` +
    `<button type="button" class="cot-c-btn cot-c-btn--36" data-photo-exit><span>${t('photo.exit')}</span>${kit.keycap('ESC')}</button>` +
    `</div>`;
  // a segmented group keeps no tab stop while none of its options is checked: its first takes it
  for (const group of bar.querySelectorAll<HTMLElement>('.cot-c-seg')) {
    if (!group.querySelector('[aria-checked=true]')) group.querySelector<HTMLElement>('[data-value]')!.tabIndex = 0;
  }
  document.body.append(bar);
  // the bar's shape: one row where it fits, two even columns where it does not, one stretched column on a narrow
  // screen; the framings fit and centre in the stage above it
  /** The bar's cover of the stage as fit last measured it (a resize): Save reuses it, so its press reads no layout. */
  let barInsetPx = 0;
  const fit = (): void => {
    if (bar.hidden) return;
    const room = window.innerWidth - 32;
    for (const layout of ['row', 'grid', 'stack'] as const) {
      bar.dataset.layout = layout;
      if (layout === 'stack' || bar.getBoundingClientRect().width <= room + 0.5) break;
    }
    // the layout box, not the painted one: the bar rises into place (cot-m-rise's translate), and a framing fitted
    // mid-rise would sit a motion step too low until the next resize
    barInsetPx = Math.max(0, window.innerHeight - bar.offsetTop);
    view.inset?.(barInsetPx);
  };
  fit();
  window.addEventListener('resize', fit);

  const groupOf = (className: string): HTMLElement | null => bar.querySelector<HTMLElement>(`.${className}`);
  /** Leave every option of a group (a drag, a dolly or a key moved the camera off it); its first keeps the tab stop. */
  const leave = (group: HTMLElement | null): void => {
    for (const [index, button] of [...(group?.querySelectorAll<HTMLButtonElement>('[data-value]') ?? [])].entries()) {
      button.setAttribute('aria-checked', 'false');
      button.tabIndex = index === 0 ? 0 : -1;
    }
  };
  const choose = (id: string): void => {
    const framing = PHOTO_FRAMINGS.find(([framingId]) => framingId === id);
    if (!framing) return;
    if (framing.length === 1) view.reset();
    else view.aim(framing[1], framing[2]);
  };
  const unwire: Array<() => void> = [kit.wireRoving(groupOf('cot-photo-views')!, (id) => { host.click(); choose(id); })];
  if (lens) {
    unwire.push(kit.wireRoving(groupOf('cot-photo-lens')!, (mm) => { host.click(); lens.setLens(Number(mm)); }));
    unwire.push(kit.wireRoving(groupOf('cot-photo-tilt')!, (deg) => { host.click(); lens.setRollDeg(Number(deg)); }));
  }
  const leaveViews = (): void => leave(groupOf('cot-photo-views'));
  host.stage.addEventListener('pointerdown', leaveViews);
  host.stage.addEventListener('wheel', leaveViews, { passive: true });

  const save = bar.querySelector<HTMLButtonElement>('[data-photo-save]');
  /** Save's failure notice (the kit's toast), put away when photo mode closes. */
  let failure: { dismiss(): void } | null = null;
  /** Draw the still and download it; rejects when the canvas could not be read or the frame could not be drawn. */
  const saveStill = (): Promise<void> => {
    // the framings fill the whole frame for the still (no bar over it), then fit above the bar again
    view.inset?.(0);
    let still: Promise<Blob | null>;
    try { still = captureStill(host.still, 2); } catch (error) { still = Promise.reject(error); }
    view.inset?.(barInsetPx);
    return still.then((blob) => {
      if (!blob) throw new Error('the stage could not be read');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = host.fileName();
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
  };
  // busy while the PNG encodes (the frame itself is read at once): Save is disabled and says so; a failure is the
  // kit's error toast, and Save, enabled again, is the way to try once more (no notice offers a Retry: the kit's rule,
  // components/loadFailure.selftest.mjs)
  const setBusy = (on: boolean): void => {
    if (!save) return;
    save.disabled = on;
    save.setAttribute('aria-busy', String(on));
  };
  const saveFailed = (): void => {
    void import('./components/notice.ts').then(({ notify, noticeRegion }) => {
      if (openClose !== close) return;
      // its own region at the top, clear of the bar, which photo mode's sheet leaves showing (.cot-photo-notices)
      noticeRegion('photo', { className: 'cot-photo-notices', placement: 'top' });
      failure = notify({ id: 'cot-photo-save', region: 'photo', severity: 'error', text: t('photo.saveFailed') });
    }, () => {});
  };
  save?.addEventListener('click', () => {
    if (!save || save.disabled) return;
    host.click();
    setBusy(true);
    failure?.dismiss();
    failure = null;
    void saveStill().catch(saveFailed).finally(() => setBusy(false));
  });

  // photo mode is a modal transient surface: opening it closes whatever stood open (a picker, the ammunition rack), and
  // Escape is the stack's, ahead of every page key that wants it (the perf panel's, a battle's Settings)
  const surface: TransientSurface = {
    id: host.scope === 'battle' ? 'photo-battle' : 'photo-garage',
    element: () => bar,
    close: () => close(),
    modal: true,
  };
  // P returns too; while it shows, photo mode owns the keyboard (the surface's own keys stay with it), lending the
  // host's camera keys to the host
  const onKey = (event: KeyboardEvent): void => {
    if (event.code === 'Escape' || (event.code === 'KeyP' && !event.metaKey && !event.ctrlKey && !event.altKey)) {
      event.stopImmediatePropagation();
      event.preventDefault();
      if (!event.repeat) close();
      return;
    }
    // a focused control's own keys reach it (the bar stops them there, short of the surface behind)
    if (event.target instanceof Node && bar.contains(event.target) && CONTROL_KEYS.test(event.code)) return;
    event.stopImmediatePropagation();
    if (host.key?.(event)) {
      event.preventDefault();
      // a roll key leaves the tilt steps
      if (event.code === 'KeyQ' || event.code === 'KeyE') leave(groupOf('cot-photo-tilt'));
      else leaveViews();
    }
  };
  const onKeyUp = (event: KeyboardEvent): void => { event.stopImmediatePropagation(); host.key?.(event); };
  bar.addEventListener('keydown', (event) => event.stopPropagation());
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);
  bar.querySelector('[data-photo-exit]')?.addEventListener('click', () => { host.click(); close(); });

  function close(): void {
    if (openClose !== close) return;
    openClose = null;
    kit.closeSurface(surface);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('resize', fit);
    host.stage.removeEventListener('pointerdown', leaveViews);
    host.stage.removeEventListener('wheel', leaveViews);
    for (const off of unwire) off();
    failure?.dismiss();
    failure = null;
    leaveThen(bar, () => bar.remove());
    document.body.classList.remove('cot-photo-on');
    delete document.body.dataset.cotPhoto;
    view.hold(false);
    if (host.openOnHero) view.reset();
    host.onClose();
  }
  openClose = close;
  kit.openSurface(surface, null);
  // the keyboard lands on the framings (a pointer that opened photo mode sees no ring on them)
  bar.querySelector<HTMLElement>('.cot-photo-views [tabindex="0"]')?.focus({ focusVisible: false } as FocusOptions);
  return close;
}
