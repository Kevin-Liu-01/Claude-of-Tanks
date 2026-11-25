/**
 * The air spin's thruster plumes (thrust-flips-277; owner 2026-11-24: "look like your literally swinging around an axis
 * instead of like a rocket strapped to your butt and sides being activated to change your motion"): the visible cause of
 * the burn the simulation runs (sim/hullThrusters.ts). Each firing nozzle draws a flame along its exhaust (the opposite of
 * the push it gives the hull) at its mount on the hull, parented to the hull's root so it turns with it, sized by its
 * thrust, and sheds fire and smoke there; you can see which end and which side fired. Each burn's ignition (the main burn,
 * the counter-burn, a ground dodge's lift) is reported once, for its sound.
 *
 * Where the hull's state carries the live burn (a solo battle, the authority's own hulls: TankState._thrust) the plumes
 * draw it; where it does not (a network peer's hull, a replay's track), the `tank:airSpin` event starts a ghost of the
 * burn: the same burn law (airSpinBurn) run from the press on the presentation clock. Presentation only: nothing here
 * feeds the simulation.
 *
 * Debug: thrust arrows (each nozzle's force on the hull, scaled by its thrust; the centre of mass marked) when
 * `setDebugArrows(true)` (main.ts: the `thrustArrows=1` query).
 */
import {
  AdditiveBlending, ArrowHelper, BufferAttribute, Color, ConeGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial,
  Quaternion, SphereGeometry, Vector3, type Object3D,
} from 'three';
import {
  AIR_SPIN_BURN, airSpinBurn, airSpinPitches, airSpinSense, airSpinThrusters, attitudeJets, createAirSpinThrusters,
  hullThrustFrame, type AirSpinBurnLevels, type HullNozzle, type HullThrustState,
} from '../sim/hullThrusters.ts';

/** What the plumes read of a hull's state. */
export interface ThrusterPlumeState {
  _thrust?: HullThrustState | null;
  _airSpinAxis?: number;
  grounded?: boolean;
  speed?: number;
  yaw?: number;
  verticalSpeed?: number;
  _spring?: { recoilVX?: number; recoilVZ?: number };
}

/** The fire and smoke a firing nozzle sheds (effects.ts thrusterJet). */
export interface ThrusterPlumeFx {
  thrusterJet?(pos: Vector3, exhaustDir: Vector3, intensity: number, hullVel: Vector3): void;
}

export type ThrusterBurnPhase = 'main' | 'counter' | 'lift';

export interface HullThrusterPlumes {
  /** Draw a hull's burn this frame; `visible` false parks its plumes. */
  sync(id: string, root: Object3D, spec: Parameters<typeof hullThrustFrame>[0], state: ThrusterPlumeState,
    dtFrame: number, visible: boolean, fx: ThrusterPlumeFx | null): void;
  /** A hull's air spin began (the `tank:airSpin` event): the ghost burn for a hull whose state has no live one. */
  noteAirSpin(id: string, axis: number): void;
  setDebugArrows(on: boolean): void;
  /** Forget a hull (its visual disposed). */
  forget(id: string): void;
  /** The burns drawn last frame, by hull (the capture tools' receipt). */
  debug(): Record<string, { axis: number; main: number; trim: number; counter: number; lift: number; ghost: boolean }>;
}

/** A nozzle's thrust (m/s^2 per unit hull mass) that draws a full-length flame. */
const FULL_ACCEL = 70;
/** Flame length at a full burn, in hull lengths, and its base radius in hull widths. */
const FLAME_LENGTH_HULLS = 0.42;
const FLAME_RADIUS_WIDTHS = 0.075;
/** The nominal shove a ghost burn sizes its nozzles with (m/s; Turbo Ball's front flip). */
const GHOST_SHOVE = 10;
/** A ghost burn this old has ended whatever it did. */
const GHOST_MAX_S = 1.5;
const SLOTS = 8;

interface Slot {
  group: Group;
  outer: Mesh;
  core: Mesh;
  arrow: ArrowHelper | null;
  /** Live this frame: the exhaust's world direction and intensity, for the particles. */
  intensity: number;
}

interface Rig {
  root: Object3D;
  group: Group;
  slots: Slot[];
  com: Mesh | null;
  last: { main: number; counter: number; lift: number };
  ghost: { axis: number; left: number; rate: number; ageS: number } | null;
  emitAcc: number;
  clockS: number;
  drawn: { axis: number; main: number; trim: number; counter: number; lift: number; ghost: boolean };
}

let outerGeometry: ConeGeometry | null = null;
let coreGeometry: ConeGeometry | null = null;
let outerMaterial: MeshBasicMaterial | null = null;
let coreMaterial: MeshBasicMaterial | null = null;

/** A cone from its base at the origin to its tip at +Y 1, its colour fading from `hot` at the base to black (additive:
 *  nothing) at the tip. */
function flameGeometry(hot: Color, fade: number): ConeGeometry {
  const geometry = new ConeGeometry(1, 1, 14, 4, true);
  geometry.translate(0, 0.5, 0); // three's cone stands its tip at +Y: base at the origin, tip at +1
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const along = Math.min(1, Math.max(0, position.getY(i)));
    const k = Math.pow(1 - along, fade);
    colors[i * 3] = hot.r * k; colors[i * 3 + 1] = hot.g * k; colors[i * 3 + 2] = hot.b * k;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

function ensureShared(): void {
  if (outerGeometry) return;
  outerGeometry = flameGeometry(new Color(1.0, 0.46, 0.14), 1.3);
  coreGeometry = flameGeometry(new Color(1.0, 0.93, 0.72), 2.2);
  const material = () => new MeshBasicMaterial({
    vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false,
    fog: false,
  });
  outerMaterial = material();
  coreMaterial = material();
}

const ARROW_COLOURS: Record<HullNozzle['role'] | 'lift', number> = {
  main: 0xff3b30, couple: 0xffd60a, counter: 0x30d5ff, lift: 0x34c759,
};

export function createHullThrusterPlumes(options: { onBurn?(id: string, phase: ThrusterBurnPhase, pos: Vector3): void } = {}): HullThrusterPlumes {
  const rigs = new Map<string, Rig>();
  /** Ghost burns noted before their hull's first plume frame (its rig is made on its next sync). */
  const pendingGhosts = new Map<string, NonNullable<Rig['ghost']>>();
  let arrows = false;
  const thrusters = createAirSpinThrusters();
  const jets: HullNozzle[] = [];
  const counterJets: HullNozzle[] = [];
  const liftJets: HullNozzle[] = [
    { role: 'main', x: 0, y: 0, z: 0, dx: 0, dy: 1, dz: 0, accel: 0 },
    { role: 'main', x: 0, y: 0, z: 0, dx: 0, dy: 1, dz: 0, accel: 0 },
  ];
  const levels: AirSpinBurnLevels = { main: 0, trim: 0, counter: 0 };
  const up = new Vector3(0, 1, 0);
  const exhaust = new Vector3();
  const quaternion = new Quaternion();
  const worldPos = new Vector3();
  const worldDir = new Vector3();
  const hullVel = new Vector3();
  const rootQuaternion = new Quaternion();

  const makeRig = (root: Object3D): Rig => {
    ensureShared();
    const group = new Group();
    group.name = 'hullThrusterPlumes';
    group.userData.presentationOnly = true;
    const slots: Slot[] = [];
    for (let i = 0; i < SLOTS; i++) {
      const slot = new Group();
      const outer = new Mesh(outerGeometry!, outerMaterial!);
      const core = new Mesh(coreGeometry!, coreMaterial!);
      outer.frustumCulled = false; core.frustumCulled = false;
      outer.renderOrder = 20; core.renderOrder = 21;
      slot.add(outer, core);
      slot.visible = false;
      group.add(slot);
      slots.push({ group: slot, outer, core, arrow: null, intensity: 0 });
    }
    root.add(group);
    return {
      root, group, slots, com: null, last: { main: 0, counter: 0, lift: 0 }, ghost: null, emitAcc: 0, clockS: 0,
      drawn: { axis: 0, main: 0, trim: 0, counter: 0, lift: 0, ghost: false },
    };
  };

  const placeSlot = (rig: Rig, index: number, nozzle: HullNozzle, level: number, hullLength: number, hullWidth: number,
    role: HullNozzle['role'] | 'lift', flicker: number): number => {
    const slot = rig.slots[index];
    if (!slot) return index;
    const thrust = nozzle.accel * level;
    if (!(thrust > 0.5)) return index;
    const k = Math.min(1.6, thrust / FULL_ACCEL);
    const length = hullLength * FLAME_LENGTH_HULLS * (0.25 + 0.75 * Math.pow(k, 0.75)) * flicker;
    const radius = hullWidth * FLAME_RADIUS_WIDTHS * (0.55 + 0.45 * Math.min(1, k));
    exhaust.set(-nozzle.dx, -nozzle.dy, -nozzle.dz).normalize();
    quaternion.setFromUnitVectors(up, exhaust);
    slot.group.position.set(nozzle.x, nozzle.y, nozzle.z);
    slot.group.quaternion.copy(quaternion);
    slot.outer.scale.set(radius, length, radius);
    slot.core.scale.set(radius * 0.5, length * 0.55, radius * 0.5);
    slot.group.visible = true;
    slot.intensity = Math.min(1, k);
    if (arrows) {
      if (!slot.arrow) {
        slot.arrow = new ArrowHelper(new Vector3(0, 1, 0), new Vector3(), 1, ARROW_COLOURS[role], 0.35, 0.22);
        slot.arrow.renderOrder = 30;
        rig.group.add(slot.arrow);
      }
      slot.arrow.visible = true;
      slot.arrow.position.set(nozzle.x, nozzle.y, nozzle.z);
      slot.arrow.setDirection(worldDir.set(nozzle.dx, nozzle.dy, nozzle.dz).normalize());
      slot.arrow.setLength(Math.max(0.5, thrust * 0.035), 0.35, 0.22);
      slot.arrow.setColor(ARROW_COLOURS[role]);
    }
    return index + 1;
  };

  const stepGhost = (ghost: NonNullable<Rig['ghost']>, dt: number): void => {
    let left = Math.max(0, dt);
    while (left > 1e-6 && ghost.axis) {
      const h = Math.min(1 / 60, left);
      left -= h;
      ghost.ageS += h;
      airSpinBurn(ghost.left, ghost.rate, levels);
      ghost.rate += (levels.main * AIR_SPIN_BURN.alphaMain + levels.trim * AIR_SPIN_BURN.alphaCounter
        - levels.counter * AIR_SPIN_BURN.alphaCounter) * h;
      ghost.left = Math.max(0, ghost.left - Math.max(0, ghost.rate) * h);
      if (ghost.left <= AIR_SPIN_BURN.finishRad || ghost.ageS > GHOST_MAX_S) ghost.axis = 0;
    }
  };

  return {
    sync(id, root, spec, state, dtFrame, visible, fx) {
      let rig = rigs.get(id) ?? null;
      const live = state._thrust && state._airSpinAxis ? state._thrust : null;
      const pending = pendingGhosts.get(id) ?? null;
      if (!live && !rig && !pending) return;
      if (!rig || rig.root !== root) {
        const ghost = rig?.ghost ?? null;
        if (rig) rig.group.removeFromParent();
        rig = makeRig(root);
        rig.ghost = ghost;
        rigs.set(id, rig);
      }
      if (pending) { rig.ghost = pending; pendingGhosts.delete(id); }
      rig.clockS += Math.max(0, dtFrame);
      const clockS = rig.clockS;
      // the burn: the live one, or the ghost's
      let axis = 0, main = 0, trim = 0, counter = 0, lift = 0, shove = GHOST_SHOVE, ghostDrawn = false;
      if (live) {
        rig.ghost = null;
        axis = live.axis; main = live.main; trim = live.trim; counter = live.counter; lift = live.lift;
        shove = live.shove > 0 ? live.shove : GHOST_SHOVE;
      } else if (rig.ghost?.axis) {
        const ghost = rig.ghost;
        airSpinBurn(ghost.left, ghost.rate, levels);
        axis = ghost.axis; main = levels.main; trim = levels.trim; counter = levels.counter; ghostDrawn = true;
        stepGhost(ghost, dtFrame);
      }
      rig.drawn.axis = axis; rig.drawn.main = main; rig.drawn.trim = trim; rig.drawn.counter = counter;
      rig.drawn.lift = lift; rig.drawn.ghost = ghostDrawn;
      for (const slot of rig.slots) { slot.group.visible = false; slot.intensity = 0; if (slot.arrow) slot.arrow.visible = false; }
      const firing = visible && axis !== 0 && (main > 0 || trim > 0 || counter > 0 || lift > 0);
      rig.group.visible = firing;
      if (rig.com) rig.com.visible = false;
      // ignitions, for their sound (heard even off screen)
      const ignite = (phase: ThrusterBurnPhase, now: number, before: number) => {
        if (now > 0 && !(before > 0) && options.onBurn) {
          worldPos.set(0, 0, 0);
          root.updateWorldMatrix(true, false);
          root.localToWorld(worldPos);
          options.onBurn(id, phase, worldPos);
        }
      };
      ignite('main', main, rig.last.main);
      ignite('counter', counter, rig.last.counter);
      ignite('lift', lift, rig.last.lift);
      rig.last.main = main; rig.last.counter = counter; rig.last.lift = lift;
      if (!firing) return;
      const frame = hullThrustFrame(spec);
      const hullLength = Math.max(2, frame.front - frame.rear);
      const hullWidth = Math.max(1.5, 2 * frame.halfWidth);
      const pitch = airSpinPitches(axis), sense = airSpinSense(axis);
      let index = 0;
      const flick = (i: number) => 1 + 0.09 * Math.sin(clockS * 61 + i * 1.7) + 0.05 * Math.sin(clockS * 149 + i * 2.9);
      if (main > 0) {
        airSpinThrusters(frame, axis, shove, thrusters);
        for (const nozzle of thrusters.nozzles) index = placeSlot(rig, index, nozzle, main, hullLength, hullWidth, 'main', flick(index));
        attitudeJets(frame, pitch, sense, Math.max(0, thrusters.alphaCouple), 'couple', jets);
        for (const nozzle of jets) index = placeSlot(rig, index, nozzle, main, hullLength, hullWidth, 'couple', flick(index));
      }
      if (trim > 0) {
        attitudeJets(frame, pitch, sense, AIR_SPIN_BURN.alphaCounter, 'couple', jets);
        for (const nozzle of jets) index = placeSlot(rig, index, nozzle, trim, hullLength, hullWidth, 'couple', flick(index));
      }
      if (counter > 0) {
        attitudeJets(frame, pitch, -sense, AIR_SPIN_BURN.alphaCounter, 'counter', counterJets);
        for (const nozzle of counterJets) index = placeSlot(rig, index, nozzle, counter, hullLength, hullWidth, 'counter', flick(index));
      }
      if (lift > 0) {
        for (let i = 0; i < 2; i++) {
          const jet = liftJets[i]!;
          jet.x = frame.comX + (i ? 1 : -1) * frame.halfWidth * 0.55; jet.y = frame.belly; jet.z = frame.comZ;
          jet.accel = FULL_ACCEL * 0.8;
          index = placeSlot(rig, index, jet, lift, hullLength, hullWidth, 'lift', flick(index));
        }
      }
      if (arrows) {
        if (!rig.com) {
          rig.com = new Mesh(new SphereGeometry(0.22, 12, 8), new MeshBasicMaterial({ color: 0xffffff, depthTest: false, toneMapped: false }));
          rig.com.renderOrder = 31;
          rig.group.add(rig.com);
        }
        rig.com.position.set(frame.comX, frame.comY, frame.comZ);
        rig.com.visible = true;
      }
      // fire and smoke at the firing nozzles, at the fixed 60 Hz cadence the vehicle FX keep
      if (!fx?.thrusterJet) return;
      rig.emitAcc = Math.min(2 / 60, rig.emitAcc + Math.max(0, dtFrame));
      if (rig.emitAcc < 1 / 60) return;
      rig.emitAcc -= 1 / 60;
      const yaw = state.yaw ?? 0;
      hullVel.set(Math.sin(yaw) * (state.speed ?? 0) + (state._spring?.recoilVX ?? 0), state.verticalSpeed ?? 0,
        Math.cos(yaw) * (state.speed ?? 0) + (state._spring?.recoilVZ ?? 0));
      rig.group.updateWorldMatrix(true, true);
      rig.group.getWorldQuaternion(rootQuaternion);
      for (const slot of rig.slots) {
        if (!slot.group.visible || !(slot.intensity > 0.05)) continue;
        slot.group.getWorldPosition(worldPos);
        worldDir.set(0, 1, 0).applyQuaternion(slot.group.quaternion).applyQuaternion(rootQuaternion);
        fx.thrusterJet(worldPos, worldDir, slot.intensity, hullVel);
      }
    },
    noteAirSpin(id, axis) {
      if (!axis) return;
      const rig = rigs.get(id);
      const ghost = { axis, left: 2 * Math.PI, rate: 0, ageS: 0 };
      if (rig) rig.ghost = ghost;
      else pendingGhosts.set(id, ghost);
    },
    setDebugArrows(on) {
      arrows = on;
      if (!on) for (const rig of rigs.values()) {
        for (const slot of rig.slots) if (slot.arrow) slot.arrow.visible = false;
        if (rig.com) rig.com.visible = false;
      }
    },
    forget(id) {
      const rig = rigs.get(id);
      if (rig) rig.group.removeFromParent();
      rigs.delete(id);
      pendingGhosts.delete(id);
    },
    debug() {
      const out: ReturnType<HullThrusterPlumes['debug']> = {};
      for (const [id, rig] of rigs) out[id] = { ...rig.drawn };
      return out;
    },
  };
}
