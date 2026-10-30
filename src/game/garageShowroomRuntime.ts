import type { RuntimeValue } from '../runtimeTypes.ts';
import { wheelNotchUnits } from './wheelNotches.ts';
import { pinchRestoresPage } from '../ui/pinchZoomGuard.ts';
import type * as THREE from 'three';
import { createShowroomOrbit } from '../engine/cameraRig.ts';

interface GarageStageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface GarageShowroomFrame {
  x: number;
  y: number;
  z: number;
  hw: number;
  hh: number;
  hd: number;
}

interface ShowroomOrbitControl {
  readonly active: boolean;
  readonly moving: boolean;
  start(): boolean;
  stop(): void;
  reset(): boolean;
  update(dt: number): boolean;
  beginDrag(): void;
  drag(dx: number, dy: number): void;
  endDrag(): void;
  cancelDrag(): void;
  wheel(notches: number): void;
  pinch(scale: number): void;
  hold(on: boolean): void;
  aim(yawRad: number, pitchRad: number, zoomTo?: number): void;
  debugState(): Record<string, RuntimeValue>;
}

interface GarageShowroomRuntimeOptions {
  camera: THREE.PerspectiveCamera;
  rig: Parameters<typeof createShowroomOrbit>[1];
  element: HTMLElement;
  getSubject: () => THREE.Object3D | null;
  getStageRect: () => GarageStageRect | null;
  heroYawRad: number;
  heroPitchRad: number;
  /** A canonical frame in place of the hero's own box (the receipts); the Garage frames the hero itself. */
  fixedFrame?: () => GarageShowroomFrame;
  /** Headroom (m) over the hero's own box: a mode preview's flag or drone above the tank. */
  frameTopPadM?: () => number;
  /** The turntable (world centre, radius and deck height, m), kept whole on the screen. */
  keepRing?: () => { x: number; y: number; z: number; r: number; h: number } | null;
  /** The whole free stage (CSS px) the turntable keeps inside. */
  getKeepRect?: () => GarageStageRect | null;
  /** The hero's foot on the stage rect's foot (the tracks on the name line), not its middle on the rect's middle. */
  anchorFoot?: () => boolean;
  floorY: () => number;
}

export interface GarageShowroomRuntime {
  start(): void;
  stop(): void;
  reset(): boolean;
  update(dt: number): boolean;
  /** Hold the framing (no spring back to the hero pose) and steer to a view: the Garage's photo mode. */
  hold(on: boolean): void;
  aim(yawRad: number, pitchRad: number, zoomTo?: number): void;
  dispose(): void;
  readonly active: boolean;
  readonly moving: boolean;
  debugState(): Record<string, RuntimeValue>;
}

/**
 * Own the Garage camera's input bindings and phase latch.
 *
 * The engine orbit remains the sole camera-pose solver. This adapter decides
 * when it owns input, keeps pointer capture coherent across cancel/phase
 * changes, and presents one small lifecycle to the composition root.
 */
export function createGarageShowroomRuntime({
  camera,
  rig,
  element,
  getSubject,
  getStageRect,
  heroYawRad,
  heroPitchRad,
  fixedFrame,
  frameTopPadM,
  keepRing,
  getKeepRect,
  anchorFoot,
  floorY,
}: GarageShowroomRuntimeOptions): GarageShowroomRuntime {
  if (!element || typeof element.addEventListener !== 'function') {
    throw new TypeError('garage showroom runtime requires an input element');
  }
  const orbitOptions = {
    getSubject,
    getStageRect,
    heroYawRad,
    heroPitchRad,
    fixedFrame,
    frameTopPadM,
    keepRing,
    getKeepRect,
    anchorFoot,
    floorY,
  };
  const control = createShowroomOrbit(camera, rig, orbitOptions) as ShowroomOrbitControl;
  let enabled = false;
  let dragPointer = -1;
  // 2026-10-27 (the iPad review: "fix zoom amounts"): one finger turns the tank, two pinch it. Every pointer down on the
  // stage is tracked by its client position: a second finger ends the turn without a flick and pinches from there, and the
  // finger left after a pinch turns the tank again from where it rests. A drag's step is its client position's (iOS
  // Safari's touch pointers carry no reliable movementX); a pointer without one (a test's synthetic move) keeps movementX.
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchSpread = 0;
  const spread = (): number => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const startDrag = (pointerId: number) => {
    dragPointer = pointerId;
    control.beginDrag();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!enabled || event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { element.setPointerCapture?.(event.pointerId); } catch (_) { /* embedded panes */ }
    if (pointers.size === 1) {
      startDrag(event.pointerId);
    } else if (pointers.size === 2) {
      dragPointer = -1;
      control.cancelDrag();
      pinchSpread = spread();
    }
  };
  const onPointerMove = (event: PointerEvent) => {
    const last = pointers.get(event.pointerId);
    if (!enabled || !last) return;
    const { clientX: x, clientY: y } = event;
    const placed = typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y);
    const dx = placed ? x - last.x : event.movementX || 0;
    const dy = placed ? y - last.y : event.movementY || 0;
    if (placed) { last.x = x; last.y = y; }
    if (pointers.size >= 2) {
      const now = spread();
      if (pinchSpread > 0 && now > 0) control.pinch(now / pinchSpread);
      pinchSpread = now;
    } else if (event.pointerId === dragPointer) {
      control.drag(dx, dy);
    }
  };
  const endDrag = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId)) return;
    if (event.pointerId === dragPointer) {
      dragPointer = -1;
      control.endDrag();
    }
    pinchSpread = pointers.size >= 2 ? spread() : 0;
    const [rest] = pointers.keys();
    if (pointers.size === 1 && rest !== undefined && dragPointer === -1 && enabled) startDrag(rest);
  };
  // 2026-09-19: the dolly follows the DISTANCE scrolled (wheelNotches.ts) — a mouse click is one notch, a trackpad
  // scroll or pinch (ctrl+wheel) glides proportionally instead of stepping once per event; Safari reports the
  // pinch through gesture events, whose cumulative scale maps onto the same notch scale.
  // 2026-10-16: on a page that is already pinch-zoomed in, the zoom-out half of a pinch is the page's to un-zoom
  // (pinchZoomGuard.ts pinchRestoresPage): no preventDefault and no dolly for it.
  const onWheel = (event: WheelEvent) => {
    if (!enabled || pinchRestoresPage(event)) return;
    event.preventDefault();
    const units = wheelNotchUnits(event);
    if (units) control.wheel(-units);
  };
  let gestureScale = 1;
  const onGestureStart = (event: Event) => {
    if (!enabled) return;
    gestureScale = 1;
    if (!pinchRestoresPage(event)) event.preventDefault();
  };
  const onGestureChange = (event: Event) => {
    if (!enabled) return;
    const scale = (event as Event & { scale?: number }).scale;
    const restores = pinchRestoresPage(event);
    if (!restores) event.preventDefault();
    if (!(typeof scale === 'number' && scale > 0)) return;
    const ratio = scale / gestureScale;
    gestureScale = scale;
    // a touch pinch is the two pointers' (onPointerMove): Safari's gesture events for it only keep the page from zooming;
    // a trackpad pinch (no pointers down) dollies by its own spread
    if (restores || pointers.size >= 2) return;
    control.pinch(ratio);
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', endDrag);
  element.addEventListener('pointercancel', endDrag);
  element.addEventListener('wheel', onWheel, { passive: false });
  element.addEventListener('gesturestart', onGestureStart, { passive: false });
  element.addEventListener('gesturechange', onGestureChange, { passive: false });

  return {
    start() {
      enabled = true;
      control.start();
    },
    stop() {
      enabled = false;
      dragPointer = -1;
      pointers.clear();
      pinchSpread = 0;
      control.stop();
    },
    reset: () => control.reset(),
    update: (dt) => enabled ? control.update(dt) : false,
    hold: (on) => control.hold(on),
    aim: (yawRad, pitchRad, zoomTo) => control.aim(yawRad, pitchRad, zoomTo),
    dispose() {
      enabled = false;
      dragPointer = -1;
      pointers.clear();
      control.stop();
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', endDrag);
      element.removeEventListener('pointercancel', endDrag);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('gesturestart', onGestureStart);
      element.removeEventListener('gesturechange', onGestureChange);
    },
    get active() { return enabled && control.active; },
    get moving() { return enabled && control.moving; },
    debugState: () => control.debugState(),
  };
}
