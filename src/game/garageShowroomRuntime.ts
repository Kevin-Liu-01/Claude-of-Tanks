import type * as THREE from 'three';
import { createShowroomOrbit } from '../engine/cameraRig.js';

export interface GarageStageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GarageShowroomFrame {
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
  wheel(notches: number): void;
  debugState(): Record<string, unknown>;
}

interface GarageShowroomRuntimeOptions {
  camera: THREE.PerspectiveCamera;
  rig: Parameters<typeof createShowroomOrbit>[1];
  element: HTMLElement;
  getSubject: () => THREE.Object3D | null;
  getStageRect: () => GarageStageRect | null;
  heroYawRad: number;
  heroPitchRad: number;
  fixedFrame: () => GarageShowroomFrame;
  floorY: () => number;
}

export interface GarageShowroomRuntime {
  start(): void;
  stop(): void;
  reset(): boolean;
  update(dt: number): boolean;
  dispose(): void;
  readonly active: boolean;
  readonly moving: boolean;
  debugState(): Record<string, unknown>;
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
    floorY,
  };
  const control = createShowroomOrbit(camera, rig, orbitOptions) as ShowroomOrbitControl;
  let enabled = false;
  let dragPointer = -1;

  const onPointerDown = (event: PointerEvent) => {
    if (!enabled || event.button !== 0) return;
    dragPointer = event.pointerId;
    try { element.setPointerCapture?.(event.pointerId); } catch (_) { /* embedded panes */ }
    control.beginDrag();
  };
  const onPointerMove = (event: PointerEvent) => {
    if (enabled && event.pointerId === dragPointer) {
      control.drag(event.movementX || 0, event.movementY || 0);
    }
  };
  const endDrag = (event: PointerEvent) => {
    if (event.pointerId !== dragPointer) return;
    dragPointer = -1;
    control.endDrag();
  };
  const onWheel = (event: WheelEvent) => {
    if (!enabled) return;
    control.wheel(event.deltaY < 0 ? 1 : -1);
    event.preventDefault();
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', endDrag);
  element.addEventListener('pointercancel', endDrag);
  element.addEventListener('wheel', onWheel, { passive: false });

  return {
    start() {
      enabled = true;
      control.start();
    },
    stop() {
      enabled = false;
      dragPointer = -1;
      control.stop();
    },
    reset: () => control.reset(),
    update: (dt) => enabled ? control.update(dt) : false,
    dispose() {
      enabled = false;
      dragPointer = -1;
      control.stop();
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', endDrag);
      element.removeEventListener('pointercancel', endDrag);
      element.removeEventListener('wheel', onWheel);
    },
    get active() { return enabled && control.active; },
    get moving() { return enabled && control.moving; },
    debugState: () => control.debugState(),
  };
}
