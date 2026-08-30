import type { ActionId, InputSettings } from './input.ts';

interface Point2 {
  x: number;
  y: number;
}

interface Point3 {
  x: number;
  y: number;
  z: number;
}

interface DigitalInputState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
  fire: boolean;
}

interface FrameInputPort {
  onAction(actionId: ActionId, listener: () => void): () => void;
  getState(): DigitalInputState;
  getVirtualMove(out: Point2): boolean;
  isLocked(): boolean;
  padActive(): boolean;
  isCursorAim(): boolean;
  virtualActive(): boolean;
  consumeMouseDelta(out: Point2, dtSeconds: number, sniper: boolean): Point2;
  getCursorNdc(out: Point2): Point2;
  getSettings(): Pick<InputSettings, 'rmbMode'>;
  isDown(actionId: ActionId): boolean;
}

interface TankInput {
  throttle: number;
  steer: number;
  brake: boolean;
  fire: boolean;
  shellSlot: number;
  aimLocked?: boolean;
}

interface PlayerEntity {
  input: TankInput;
  combat: { destroyed?: boolean };
}

export interface CameraFrameInput {
  mouseDX: number;
  mouseDY: number;
  wheel: number;
  rmb: boolean;
  shiftPressed: boolean;
  aimHold: boolean;
  cursorAim: boolean;
  cursorX: number;
  cursorY: number;
  autoAimPoint: Point3 | null;
}

export interface PlayerFrameSample {
  dtSeconds: number;
  inBattle: boolean;
  paused: boolean;
  killcamActive: boolean;
  cameraLocked: boolean;
  rigMode: string;
  player: PlayerEntity | null;
}

export interface PlayerFrameInputOptions {
  input: FrameInputPort;
  hasAmmo(slot: number): boolean;
  forceFire(): boolean;
}

export interface PlayerFrameInput {
  readonly camera: CameraFrameInput;
  poll(sample: PlayerFrameSample): CameraFrameInput;
  dispose(): void;
}

/** Allocation-free ownership for one rendered frame of player controls. */
export function createPlayerFrameInput({
  input,
  hasAmmo,
  forceFire,
}: PlayerFrameInputOptions): PlayerFrameInput {
  if (!input || typeof hasAmmo !== 'function' || typeof forceFire !== 'function') {
    throw new TypeError('player frame input requires input, ammunition, and debug-fire ports');
  }

  const mouse = { x: 0, y: 0 };
  const virtualMove = { x: 0, y: 0 };
  const cursorNdc = { x: 0, y: 0 };
  const camera: CameraFrameInput = {
    mouseDX: 0,
    mouseDY: 0,
    wheel: 0,
    rmb: false,
    shiftPressed: false,
    aimHold: false,
    cursorAim: false,
    cursorX: 0,
    cursorY: 0,
    autoAimPoint: null,
  };
  let wheelStep = 0;
  const disposeZoomIn = input.onAction('zoomIn', () => {
    wheelStep = Math.min(wheelStep + 1, 3);
  });
  const disposeZoomOut = input.onAction('zoomOut', () => {
    wheelStep = Math.max(wheelStep - 1, -3);
  });

  return {
    camera,
    poll({
      dtSeconds,
      inBattle,
      paused,
      killcamActive,
      cameraLocked,
      rigMode,
      player,
    }) {
      if (inBattle && !paused && !killcamActive && player && !player.combat.destroyed) {
        const state = input.getState();
        const tankInput = player.input;
        const touchDriving = input.getVirtualMove(virtualMove);
        tankInput.throttle = touchDriving
          ? virtualMove.y
          : (state.forward ? 1 : 0) - (state.back ? 1 : 0);
        // TankInput steer is positive hull yaw. In this world that turns the
        // nose toward screen-left, so the D/right action must be negative.
        tankInput.steer = touchDriving
          ? -virtualMove.x
          : (state.left ? 1 : 0) - (state.right ? 1 : 0);
        tankInput.brake = state.handbrake;
        const fireLane = input.isLocked() || input.padActive()
          || input.isCursorAim() || input.virtualActive();
        tankInput.fire = ((state.fire && fireLane) || forceFire())
          && hasAmmo(tankInput.shellSlot | 0);
      } else if (player) {
        const tankInput = player.input;
        tankInput.throttle = 0;
        tankInput.steer = 0;
        tankInput.brake = false;
        tankInput.fire = false;
      }

      input.consumeMouseDelta(mouse, dtSeconds, rigMode === 'SNIPER');
      camera.mouseDX = paused || cameraLocked ? 0 : mouse.x;
      camera.mouseDY = paused || cameraLocked ? 0 : mouse.y;
      camera.wheel = paused || cameraLocked ? 0 : wheelStep;

      const cursorAim = input.isCursorAim();
      camera.cursorAim = inBattle && !paused && !cameraLocked && cursorAim;
      if (camera.cursorAim) {
        input.getCursorNdc(cursorNdc);
        camera.cursorX = cursorNdc.x;
        camera.cursorY = cursorNdc.y;
      }

      const rmbMode = input.getSettings().rmbMode || 'hold';
      const rmbHeld = input.isDown('freeCamera');
      const freeLookHeld = input.isDown('freeLook');
      const sniperToggleHeld = input.isDown('sniperToggle');
      const liveBattleAimAvailable = inBattle && !paused && !killcamActive &&
        !cameraLocked && !!player && !player.combat.destroyed;
      camera.rmb = liveBattleAimAvailable && !cursorAim
        && (freeLookHeld || (rmbMode === 'freelook' && rmbHeld));
      if (player?.input) player.input.aimLocked = camera.rmb;
      camera.aimHold = liveBattleAimAvailable
        && rmbMode === 'hold' && rmbHeld;
      camera.shiftPressed = !cameraLocked && (
        sniperToggleHeld
        || (rmbMode === 'toggle' && rmbHeld)
        || (rmbMode === 'freelook' && cursorAim && rmbHeld)
      );
      wheelStep = 0;
      return camera;
    },
    dispose() {
      disposeZoomIn();
      disposeZoomOut();
    },
  };
}
