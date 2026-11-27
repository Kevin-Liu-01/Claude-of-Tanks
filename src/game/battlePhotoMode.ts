// A solo battle's photo mode (photo-mode-271; owner 2026-11-08: "let's also build an in game photo mode in
// singleplayer"). Copyright © 2026 Kevin B. Liu.
// The battle's half of the one photo mode (src/ui/photoMode.ts, which the Garage opens too): it freezes the battle
// through main.ts's pause port (the fixed step, the countdown and FX time stand still exactly as under the pause menu),
// hands the camera to the photo camera (src/engine/photoCamera.ts) over the player's tank, and lends the stage's drags,
// pinches, wheel and keys to it. The shared module draws the bar, takes the still and returns. Loaded at its first use:
// nothing of it is on the boot graph. It never touches a network session: main.ts offers it only in a solo battle
// (battlePhotoAvailability.ts).
import type { PerspectiveCamera } from 'three';
import { createPhotoCamera, PHOTO_LENSES_MM, PHOTO_OPEN_LENS_MM, PHOTO_TILTS_DEG, type PhotoSubject } from '../engine/photoCamera.ts';
import { A11Y } from '../ui/accessibilityPreferences.ts';
import type { PhotoKit, PhotoStill } from '../ui/photoMode.ts';
import { photoModeChunk } from '../ui/photoModeChunk.ts';

interface BattlePhotoInput {
  /** Gate the battle's controls (held state clears), as the pause menu does. */
  setEnabled(enabled: boolean): void;
  releaseLock(owner: 'photo-mode'): void;
  requestLock(request?: { fromUi?: boolean }): void;
  /** photo-from-pause-279: photo mode owns the free pointer while it is open, however it opened (from a locked battle
   *  its release frees it; from the paused Settings, Settings' release already had). */
  claimPointerUnlock(owner: 'photo-mode', holds: () => boolean): () => void;
}

export interface BattlePhotoDeps {
  readonly camera: PerspectiveCamera;
  /** The rendered stage (the renderer's canvas). */
  readonly stage: HTMLElement;
  readonly still: PhotoStill;
  readonly kit: PhotoKit;
  readonly input: BattlePhotoInput;
  /** The ground's height at (x, z), m. */
  groundAt(x: number, z: number): number;
  /** The tank the camera stays near: the player's, or the one the camera follows. */
  subject(): PhotoSubject | null;
  fileName(): string;
  click(): void;
  /** Photo mode opened (true) or closed: main.ts's pause port reads it. */
  onChange(open: boolean): void;
  /** On close: true when the paused Settings it was opened from takes the screen back (the battle stays paused and the
   *  pointer free), false when the battle resumes at once (the P key's way in). settings-unify-278. */
  backToMenu(): boolean;
  /** The view's height in CSS pixels. */
  viewHeightPx(): number;
}

export interface BattlePhotoMode {
  readonly isOpen: boolean;
  open(): Promise<boolean>;
  close(): void;
  /** This frame's camera (main frame runtime): true while photo mode owns it. */
  frame(dtSeconds: number): boolean;
}

/** Keys held down that steer the camera each frame: orbit, dolly and roll. */
const HELD_KEYS = ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyR', 'KeyF', 'KeyQ', 'KeyE'] as const;
type HeldKey = (typeof HELD_KEYS)[number];
const isHeldKey = (code: string): code is HeldKey => (HELD_KEYS as readonly string[]).includes(code);
/** Degrees a second a held roll key turns the horizon; pixels a second a held orbit key is worth. */
const ROLL_RATE_DEG = 20;
const ORBIT_RATE_PX = 260;
const DOLLY_RATE = 3;

export function createBattlePhotoMode(deps: BattlePhotoDeps): BattlePhotoMode {
  // the reader's motion choice as Settings keeps it live (Settings, else the OS; read each frame without a media query):
  // a framing lands at once under reduced motion
  const photoCamera = createPhotoCamera({ camera: deps.camera, groundAt: deps.groundAt, viewHeightPx: deps.viewHeightPx,
    reduceMotion: () => A11Y.reduceMotion });
  const held = new Set<HeldKey>();
  let close: (() => void) | null = null;
  let opening = false;
  deps.input.claimPointerUnlock('photo-mode', () => close !== null || opening);

  // the stage's gestures: one pointer orbits (with Shift or the right button it pans), two pinch and pan together
  const pointers = new Map<number, { x: number; y: number; button: number; shift: boolean }>();
  let pinchSpan = 0;
  const midpoint = { x: 0, y: 0 };
  const twoFinger = (): [{ x: number; y: number }, { x: number; y: number }] | null => {
    if (pointers.size < 2) return null;
    const [a, b] = [...pointers.values()];
    return [a, b];
  };
  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    deps.stage.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, button: event.button, shift: event.shiftKey });
    const pair = twoFinger();
    if (pair) {
      pinchSpan = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
      midpoint.x = (pair[0].x + pair[1].x) / 2; midpoint.y = (pair[0].y + pair[1].y) / 2;
    }
  };
  const onPointerMove = (event: PointerEvent): void => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    pointer.x = event.clientX; pointer.y = event.clientY;
    const pair = twoFinger();
    if (pair) {
      const span = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
      if (pinchSpan > 0 && span > 0) photoCamera.pinch(span / pinchSpan);
      pinchSpan = span;
      const mx = (pair[0].x + pair[1].x) / 2, my = (pair[0].y + pair[1].y) / 2;
      photoCamera.pan(mx - midpoint.x, my - midpoint.y);
      midpoint.x = mx; midpoint.y = my;
      return;
    }
    if (pointer.button === 2 || pointer.shift || event.shiftKey) photoCamera.pan(dx, dy);
    else photoCamera.orbit(dx, dy);
  };
  const onPointerUp = (event: PointerEvent): void => {
    pointers.delete(event.pointerId);
    pinchSpan = 0;
    const pair = twoFinger();
    if (pair) { midpoint.x = (pair[0].x + pair[1].x) / 2; midpoint.y = (pair[0].y + pair[1].y) / 2; }
  };
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    // a notch is about 100 px of travel; a trackpad's small steps dolly in proportion
    photoCamera.dolly(Math.max(-3, Math.min(3, event.deltaY / 100)));
  };
  const listen = (on: boolean): void => {
    const method = on ? 'addEventListener' : 'removeEventListener';
    deps.stage[method]('pointerdown', onPointerDown as EventListener);
    deps.stage[method]('pointermove', onPointerMove as EventListener);
    deps.stage[method]('pointerup', onPointerUp as EventListener);
    deps.stage[method]('pointercancel', onPointerUp as EventListener);
    deps.stage[method]('wheel', onWheel as EventListener, on ? { passive: false } : undefined);
  };

  const onKey = (event: KeyboardEvent): boolean => {
    if (!isHeldKey(event.code) || event.metaKey || event.ctrlKey || event.altKey) return false;
    if (event.type === 'keydown') held.add(event.code);
    else held.delete(event.code);
    return true;
  };

  const steer = (dtSeconds: number): void => {
    if (!held.size) return;
    const dt = Math.min(0.1, Math.max(0, dtSeconds));
    const axis = (plus: HeldKey, minus: HeldKey): number => (held.has(plus) ? 1 : 0) - (held.has(minus) ? 1 : 0);
    const orbitX = axis('KeyD', 'KeyA'), orbitY = axis('KeyW', 'KeyS');
    if (orbitX || orbitY) photoCamera.orbit(orbitX * ORBIT_RATE_PX * dt, orbitY * ORBIT_RATE_PX * dt);
    const dolly = axis('KeyF', 'KeyR');
    if (dolly) photoCamera.dolly(dolly * DOLLY_RATE * dt);
    const roll = axis('KeyE', 'KeyQ');
    if (roll) photoCamera.roll(roll * ROLL_RATE_DEG * (Math.PI / 180) * dt);
  };

  const finish = (): void => {
    close = null;
    held.clear();
    pointers.clear();
    listen(false);
    photoCamera.close();
    deps.input.setEnabled(true);
    deps.onChange(false);
    // back to the paused Settings it came from, or the battle takes the pointer back (a refused lock is retaken by the
    // next press on the stage, as after any unlock)
    if (!deps.backToMenu()) deps.input.requestLock({ fromUi: true });
  };

  return {
    get isOpen() { return close !== null || opening; },

    async open() {
      if (close || opening) return false;
      const subject = deps.subject();
      if (!subject) return false;
      opening = true;
      // the battle stands still from this frame: the pause port reads open before the sheet arrives
      deps.onChange(true);
      deps.input.setEnabled(false);
      deps.input.releaseLock('photo-mode');
      // the bar and its sheet: one load for the document, the Garage's too (ui/photoModeChunk.ts)
      let openPhotoMode: typeof import('../ui/photoMode.ts').openPhotoMode;
      try {
        ({ openPhotoMode } = await photoModeChunk.load());
      } catch (error) {
        opening = false;
        deps.input.setEnabled(true);
        deps.onChange(false);
        throw error;
      }
      opening = false;
      photoCamera.open(subject);
      listen(true);
      close = openPhotoMode({
        scope: 'battle',
        stage: deps.stage,
        view: photoCamera,
        lens: {
          lensesMm: PHOTO_LENSES_MM,
          tiltsDeg: PHOTO_TILTS_DEG,
          setLens: (mm) => photoCamera.setLens(mm),
          setRollDeg: (deg) => photoCamera.setRollDeg(deg),
          openMm: PHOTO_OPEN_LENS_MM,
        },
        // the camera eases from the player's view to the hero framing, the subject whole above the bar
        openOnHero: true,
        still: deps.still,
        kit: deps.kit,
        fileName: deps.fileName,
        click: deps.click,
        key: onKey,
        onClose: finish,
      });
      return true;
    },

    close() { close?.(); },

    frame(dtSeconds) {
      if (!photoCamera.active) return false;
      steer(dtSeconds);
      return photoCamera.update(dtSeconds);
    },
  };
}
