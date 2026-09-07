import type { RuntimeValue } from '../runtimeTypes.ts';
import * as THREE from 'three';
import type { MovementShellSpec, MovementSpec } from '../sim/movement.ts';
import type { EventBus } from './stateCore.ts';
import { stripActivatedEra, type EraVisual } from './eraActivation.ts';

interface FeedbackShellSpec extends MovementShellSpec {
  name: string;
  type: string;
  caliberMm?: number;
}

interface FeedbackTankSpec extends MovementSpec {
  gun: MovementSpec['gun'] & {
    shells?: readonly FeedbackShellSpec[];
  };
}

interface FeedbackTankVisual extends EraVisual {
  hitFlinch?(normalX: number, normalZ: number, strength: number, yaw?: number): void;
}

interface FeedbackTank {
  id: string;
  spec: FeedbackTankSpec;
  state?: { yaw?: number } | null;
  visual?: FeedbackTankVisual | null;
}

interface FeedbackGame {
  player: FeedbackTank | null;
  tankById: Map<string, FeedbackTank>;
}

interface FeedbackRig {
  addTrauma(amount: number): void;
  recoilKick?(amount: number, fovScale: number): RuntimeValue;
}

interface FeedbackAudio {
  hitConfirm(kind: string, damage: number): void;
}

interface FeedbackFx {
  propCrush(position: THREE.Vector3, direction: THREE.Vector3, heightM: number): void;
}

interface ShellHitEvent {
  targetId?: string;
  attackerId?: string;
  normal?: readonly number[];
  kind: string;
  damage?: number;
  caliberMm?: number;
  eraPlate?: string | null;
}

interface ShellFiredEvent {
  isPlayer?: boolean;
  shooterId?: string;
  feedbackPredicted?: boolean;
  shellName?: string;
  shellType?: string;
  caliberMm?: number;
}

interface PropCrushedEvent {
  pos: readonly number[];
  dir: readonly number[];
  h: number;
}

interface DestroyedPropEvent {
  kind: string;
  pos: number[];
  cause: 'ram' | 'shell' | 'blast';
}

type DestroyedEventSink = (event: DestroyedPropEvent) => void;

export interface CombatFeedbackRuntimeOptions {
  bus: EventBus;
  game: FeedbackGame;
  rig: FeedbackRig;
  audio: FeedbackAudio;
  getFx(): FeedbackFx | null;
  hasNetworkMatch(): boolean;
  shotRecoilScale(spec: FeedbackTankSpec, shell: FeedbackShellSpec | null): number;
  setDestroyedEventSink(sink: DestroyedEventSink | null): void;
  trimGarageTanks(capacity: number): void;
  getDeviceTier(): string;
}

export interface CombatFeedbackRuntime {
  dispose(): void;
}

/** Own discrete combat-to-presentation reactions outside the simulation. */
export function createCombatFeedbackRuntime({
  bus,
  game,
  rig,
  audio,
  getFx,
  hasNetworkMatch,
  shotRecoilScale,
  setDestroyedEventSink,
  trimGarageTanks,
  getDeviceTier,
}: CombatFeedbackRuntimeOptions): CombatFeedbackRuntime {
  const effectPosition = new THREE.Vector3();
  const effectDirection = new THREE.Vector3();
  const unsubscribe: Array<() => void> = [];
  const listen = (event: string, listener: (payload: RuntimeValue) => void): void => {
    unsubscribe.push(bus.on(event, listener));
  };

  listen('shell:hit', (payload) => {
    const event = payload as ShellHitEvent;
    const target = event.targetId ? game.tankById.get(event.targetId) : null;
    if (target?.visual) stripActivatedEra(event, target.visual);
    if (target?.visual && event.normal) {
      const penetrated = event.kind === 'pen' || event.kind === 'he_pen';
      target.visual.hitFlinch?.(
        event.normal[0],
        event.normal[2],
        ((event.caliberMm || 90) / 100) * (penetrated ? 1 : 0.55),
        target.state?.yaw,
      );
    }
    const player = game.player;
    if (!player) return;
    if (event.attackerId === player.id && event.targetId && event.targetId !== player.id) {
      audio.hitConfirm(event.kind, event.damage || 0);
    }
    if (event.targetId === player.id && (event.damage || 0) > 0) {
      const shock = Math.min(
        0.62,
        0.24 + (event.damage || 0) / 2400 + (event.caliberMm || 90) / 1200,
      );
      rig.addTrauma(shock);
    }
  });

  const playShotRecoil = (event: ShellFiredEvent): void => {
    const player = game.player;
    if (!event.isPlayer || !hasNetworkMatch() || !player) return;
    const shells = player.spec.gun.shells || [];
    let shellSpec: FeedbackShellSpec | null = null;
    let typeFallback: FeedbackShellSpec | null = null;
    for (const shell of shells) {
      if (shell.name === event.shellName) {
        shellSpec = shell;
        break;
      }
      if (!typeFallback && shell.type === event.shellType) typeFallback = shell;
    }
    shellSpec ||= typeFallback;
    const recoilScale = shotRecoilScale(player.spec, shellSpec);
    const caliberMm = shellSpec?.caliberMm || event.caliberMm || player.spec.gun.caliberMm;
    const caliberK = Math.max(0, Math.min(1, (caliberMm - 30) / 122));
    rig.addTrauma((0.10 + caliberK * 0.20) * recoilScale);
    rig.recoilKick?.((0.006 + caliberK * 0.011) * recoilScale, recoilScale);
  };

  listen('shell:fired', (payload) => {
    const event = payload as ShellFiredEvent;
    if (!event.feedbackPredicted) playShotRecoil(event);
  });
  listen('weapon:predicted', (payload) => {
    const event = payload as ShellFiredEvent;
    if (event.shooterId === game.player?.id) playShotRecoil(event);
  });

  listen('prop:crushed', (payload) => {
    const event = payload as PropCrushedEvent;
    const fx = getFx();
    if (!fx) return;
    effectPosition.set(event.pos[0], event.pos[1], event.pos[2]);
    effectDirection.set(event.dir[0], 0, event.dir[2]);
    fx.propCrush(effectPosition, effectDirection, event.h);
  });

  listen('phase:change', (payload) => {
    const event = payload as { phase?: string };
    if (event.phase === 'battle') trimGarageTanks(getDeviceTier() === 'mobile' ? 1 : 3);
  });

  const destroyedSink: DestroyedEventSink = (event) => bus.emit('prop:destroyed', event);
  setDestroyedEventSink(destroyedSink);

  return {
    dispose() {
      for (const stop of unsubscribe.splice(0)) stop();
      setDestroyedEventSink(null);
    },
  };
}
