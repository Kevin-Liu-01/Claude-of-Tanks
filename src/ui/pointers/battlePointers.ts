/**
 * battlePointers.ts — the HUD's pointer sources: one battle frame in, the frame's pointers drawn (guidance-pointers-275).
 * Copyright © 2026 Kevin B. Liu.
 *
 * hud.ts hands this its frame every rendered battle frame. It gathers what the client already draws (it reads nothing the
 * HUD does not, so a pointer reveals nothing hidden: AGENTS.md, spotting filters snapshots before a client sees them):
 * - follow: the tutorial's place (pointerBoard.ts), and the mode's objective that matters now from the one marker
 *   derivation the minimap and the world read (minimapObjectives.ts objectiveMarkersFor; Kevin: "the ball in turbo ball");
 * - warn: the spotted enemies with their gun on the player's tank or close (Kevin: "tanks to your flank or in your rear"),
 *   the enemy air runs the tank stands in from the same markers ("incoming air assaults and weaponry"), and the enemy
 *   guided rounds in flight coming at it from the frame's shells ("incoming missile");
 * and draws them through pointerLayer.ts. It runs only for the local player's own tank (a watched seat has no warnings
 * of its own), and the HUD clears it whenever it stops drawing a battle frame.
 */
import { Vector3, type PerspectiveCamera } from 'three';
import { t } from '../i18n.ts';
import { objectiveMarkersFor, type ObjectiveStateView } from '../minimapObjectives.ts';
import { guideFollow } from './pointerBoard.ts';
import { createPointerLayer, type PointerLayer, type PointerSnapshot } from './pointerLayer.ts';
import {
  missileWarnings, objectiveFollow, pickFollow, strikeWarnings, tankWarnings, type FollowPointer, type ScreenBox, type ScreenPoint,
  type WarnMissile, type WarnPointer, type WarnStrike, type WarnTank, type WorldPoint,
} from './pointerPlan.ts';
import { GUIDANCE_CARD, GUIDANCE_CONTROLS, GUIDANCE_HARD } from '../battleHudLayout.ts';

/** A hull as the HUD's frame carries it (hud.ts HudTank): the fields the sources read. */
interface PointerTank {
  readonly id: string;
  readonly team?: string;
  readonly isPlayer?: boolean;
  readonly state?: { readonly pos: { readonly x: number; readonly y: number; readonly z: number }; readonly yaw: number;
    readonly turretYaw?: number } | null;
  readonly combat?: { readonly destroyed?: boolean } | null;
  readonly spec?: { readonly dims?: { readonly hullLengthM: number; readonly widthM: number; readonly heightM: number } } | null;
}

/** A round in flight as the frame carries it (sim/ballistics.ts ShellEntity). */
interface PointerShell {
  readonly id?: number;
  readonly shooterId?: string;
  readonly dead?: boolean;
  readonly pos?: { readonly x: number; readonly y: number; readonly z: number };
  readonly vel?: { readonly x: number; readonly z: number };
  readonly spec?: { readonly guided?: boolean } | null;
}

interface BattlePointerFrame {
  readonly timeS: number;
  readonly mode?: string;
  readonly camera?: PerspectiveCamera | null;
  readonly player?: PointerTank | null;
  readonly tanks?: readonly PointerTank[];
  readonly spotting?: { isSpotted(id: string): boolean } | null;
  readonly matchModeState?: ObjectiveStateView | null;
  readonly shells?: readonly unknown[];
}

interface BattlePointers {
  update(frame: BattlePointerFrame): void;
  clear(): void;
  snapshot(): PointerSnapshot;
  destroy(): void;
}

/** What a bubble never covers: the guidance's instruments and controls (battleHudLayout.ts, the classes the tutorial's card
 *  and the toasts keep off), the map, the tutorial's card and the battle's notices. Measured again at most every
 *  NO_COVER_MS, or at once on the HUD's relayout. */
const NO_COVER = `${GUIDANCE_HARD},${GUIDANCE_CONTROLS},${GUIDANCE_CARD},.cot-minimap,.cot-battle-notices`;
const NO_COVER_MS = 500;
/** The hull box when a spec gives no measures (m): about a main battle tank's. */
const HULL_FALLBACK = Object.freeze({ hullLengthM: 7, widthM: 3.6, heightM: 2.6 });

export function createBattlePointers(groundAt: () => ((x: number, z: number) => number) | null): BattlePointers {
  let layer: PointerLayer | null = null;
  const scratch = new Vector3();
  const look = new Vector3();
  let camera: PerspectiveCamera | null = null;
  let noCover: ScreenBox[] = [];
  let measuredAt = -Infinity;
  const remeasure = (): void => { measuredAt = -Infinity; };
  window.addEventListener('cot-hud-relayout', remeasure);
  window.addEventListener('resize', remeasure);

  const project = (point: WorldPoint): ScreenPoint | null => {
    if (!camera) return null;
    const v = scratch.set(point.x, point.y, point.z).project(camera);
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight, behind: v.z > 1 };
  };
  const flatGround = (): number => 0;

  function measure(): ScreenBox[] {
    const now = performance.now();
    if (now - measuredAt < NO_COVER_MS) return noCover;
    measuredAt = now;
    noCover = [];
    for (const node of document.querySelectorAll(NO_COVER)) {
      const r = node.getBoundingClientRect();
      if (r.width >= 2 && r.height >= 2) noCover.push({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
    }
    return noCover;
  }

  /** The player's hull box on the screen (its eight corners projected), or null when a corner is behind the camera. */
  function hullBox(me: PointerTank): ScreenBox | null {
    const state = me.state!;
    const dims = me.spec?.dims ?? HULL_FALLBACK;
    const halfL = dims.hullLengthM / 2, halfW = dims.widthM / 2;
    const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const along of [-halfL, halfL]) {
      for (const across of [-halfW, halfW]) {
        for (const up of [0, dims.heightM]) {
          const at = project({ x: state.pos.x + fx * along + fz * across, y: state.pos.y + up, z: state.pos.z + fz * along - fx * across });
          if (!at || at.behind) return null;
          x0 = Math.min(x0, at.x); y0 = Math.min(y0, at.y); x1 = Math.max(x1, at.x); y1 = Math.max(y1, at.y);
        }
      }
    }
    return { x0, y0, x1, y1 };
  }

  function clear(): void {
    layer?.draw(null);
  }

  return {
    update(frame): void {
      const me = frame.player;
      const pos = me?.state?.pos;
      if (!me?.isPlayer || !pos || me.combat?.destroyed || !frame.camera || frame.mode === 'hidden') { clear(); return; }
      camera = frame.camera;
      const player: WorldPoint = { x: pos.x, y: pos.y, z: pos.z };

      // follow: the tutorial's, then the mode's objective
      const markers = frame.matchModeState ? objectiveMarkersFor(frame.matchModeState, frame.timeS) : [];
      const guide = guideFollow();
      const mode = markers.length ? objectiveFollow(markers, player) : null;
      const follows: FollowPointer[] = [];
      if (guide) follows.push(guide);
      if (mode) follows.push(mode);
      const follow = pickFollow(follows, player);

      // warn: tanks, air runs, missiles
      const warns: WarnPointer[] = [];
      const tanks = frame.tanks ?? [];
      const hulls: WarnTank[] = [];
      for (const tank of tanks) {
        const state = tank.state;
        if (!state || tank === me) continue;
        hulls.push({
          id: tank.id, x: state.pos.x, y: state.pos.y, z: state.pos.z, gunYaw: state.yaw + (state.turretYaw ?? 0),
          enemy: !!tank.team && tank.team !== me.team, alive: !tank.combat?.destroyed, spotted: frame.spotting?.isSpotted(tank.id) ?? true,
        });
      }
      warns.push(...tankWarnings(player, hulls));
      const strikes = markers.filter((marker) => marker.kind === 'strike') as readonly WarnStrike[];
      if (strikes.length) warns.push(...strikeWarnings(player, strikes));
      const missiles: WarnMissile[] = [];
      for (const value of frame.shells ?? []) {
        const shell = value as PointerShell;
        if (shell.dead || !shell.spec?.guided || !shell.pos || !shell.vel) continue;
        const shooter = tanks.find((tank) => tank.id === shell.shooterId);
        missiles.push({ id: String(shell.id ?? missiles.length), x: shell.pos.x, y: shell.pos.y, z: shell.pos.z, vx: shell.vel.x, vz: shell.vel.z,
          enemy: !!shooter && !!shooter.team && shooter.team !== me.team });
      }
      if (missiles.length) warns.push(...missileWarnings(player, missiles));

      if (!follow && !warns.length) { clear(); return; }
      frame.camera.getWorldDirection(look);
      layer ??= createPointerLayer();
      layer.draw({
        follow, warns, player, viewYaw: Math.atan2(look.x, look.z), scoped: frame.mode === 'sniper',
        project, groundY: groundAt() ?? flatGround, noCover: measure(), hull: follow ? hullBox(me) : null,
        metres: (m) => t('battle.pointer.distance', { m }), seconds: (s) => t('battle.pointer.seconds', { s }),
      });
    },
    clear,
    snapshot: () => layer?.snapshot() ?? { follow: null, chevrons: 0, turn: null, bubbles: [] },
    destroy(): void {
      window.removeEventListener('cot-hud-relayout', remeasure);
      window.removeEventListener('resize', remeasure);
      layer?.destroy();
      layer = null;
    },
  };
}
