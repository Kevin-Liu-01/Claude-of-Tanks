/**
 * loosePropBodies.ts — the loose clutter a hull kicks (drums, churns, bins, gas bottles, buckets, jerrycans, loose
 * wheels) as bodies of the game's one physics engine (destruction stream, 2026-10-12; the owner: "make the physics for
 * stuff falling around and pieces of buildings and destruction use the same kind of physics engine. like how turrets
 * popping off is now using natural, grounded physics").
 *
 * loosePropPhysics.ts was a second, narrower engine for this clutter: a circle in plan on a spherical support, so a drum
 * rolled like a ball, never stood on its end or lay on its side and could not rest on another drum. Here a kicked prop
 * enters sim/rigidBody.ts — the engine the turret pops, the wreck bodies and the falling rubble run on — as its own
 * shape (a drum, churn, bin, bottle or bucket an upright cylinder; a jerrycan a box; a loose wheel a cylinder on its
 * side), at its pose with the kick's velocity and spin: it tumbles, rolls on its round side, stands up or lies down, meets
 * the ground as drawn, the walls and rocks, the other clutter, and sleeps where it lies; then it leaves the engine and its
 * pose stays the prop's. A prop at rest near one in motion enters the engine asleep, so the moving one strikes it (and
 * wakes it) as it would a wall. The traffic cone keeps the ground-constrained model it was authored for.
 *
 * Presentation only, as before (every peer runs it from the same kicks); fixed 1/60 s steps; nothing allocated per step.
 */
import {
  createRigidBox, createRigidCylinder, createRigidShape, createRigidWorld, RIGID_STEP_S,
  type RigidEnvironment, type RigidShape, type RigidWorld,
} from '../sim/rigidBody.ts';
import type { CollisionRecord } from './collision.ts';
import type { LoosePropBody } from './loosePropPhysics.ts';

/** Engine slots for loose clutter (a hull plowing a yard wakes a dozen; the rest wait asleep outside the engine). */
export const LOOSE_BODY_CAPACITY = 32;
/** Steps a body sleeps in the engine before it leaves it (its pose stays the prop's). */
const LEAVE_AFTER_SLEEP_STEPS = 45;

interface LoosePropBodies {
  readonly world: RigidWorld;
  /** Whether a body of this kind runs on the engine (the cone keeps its ground-constrained law). */
  handles(b: LoosePropBody): boolean;
  /** A kicked prop: into the engine at its pose with the velocity and spin the kick gave it (or, already in, set them). */
  wake(b: LoosePropBody, kind: string): boolean;
  /** A prop at rest beside one in motion: into the engine asleep at its pose, so it is struck as a wall would be. */
  admitResting(b: LoosePropBody, kind: string): boolean;
  /** Whether a prop is in the engine. */
  has(b: LoosePropBody): boolean;
  /** One fixed step (LOOSE_PROP_STEP_S). */
  step(): void;
  /** Its pose and velocity into the prop's body; false once it has slept a while and left the engine (b.active false). */
  sync(b: LoosePropBody): boolean;
  reset(): void;
  stats(): { bodies: number; awake: number };
}

export function createLoosePropBodies(o: {
  groundAt(x: number, z: number): number;
  queryStatic?(minX: number, minZ: number, maxX: number, maxZ: number, out: CollisionRecord[]): CollisionRecord[];
  capacity?: number;
}): LoosePropBodies {
  const capacity = Math.max(1, o.capacity ?? LOOSE_BODY_CAPACITY) | 0;
  const world = createRigidWorld({ capacity, kinematicCapacity: 0, velocityIterations: 8, positionIterations: 3, contactsPerBody: 20,
    spherePool: capacity * 48 });
  const env: RigidEnvironment = {
    groundAt: o.groundAt,
    ...(o.queryStatic ? { queryStatic: o.queryStatic } : {}),
    isSolid: (record) => !record.crushed && !record.dead,
  };
  world.bindEnvironment(env);
  const slots = new Map<LoosePropBody, number>();
  const bodyAt: (LoosePropBody | null)[] = new Array(capacity).fill(null);
  const sleptFor = new Uint16Array(capacity);
  const shapes = new Map<string, RigidShape>();
  const pose = new Float64Array(7);

  function shapeFor(b: LoosePropBody, kind: string): RigidShape {
    const r = b.radius, h = b.height, mass = 1 / b.invMass;
    const key = `${kind}:${Math.round(r * 100)}:${Math.round(h * 100)}:${Math.round(mass * 100)}`;
    let s = shapes.get(key);
    if (s) return s;
    const restitution = Math.min(0.6, b.restitution), opts = { restitution, friction: 0.62, rolling: 1.1, linearDrag: 0.05,
      angularDrag: 0.25, maxSpheres: 30, forceSleepS: 6 };
    // a body of the prop's own mass (its tuning's), whatever its size
    const density = (vol: number): number => Math.max(5, mass * 40 / Math.max(1e-3, vol));
    if (kind === 'jerrycan') {
      const hx = r * 0.55, hy = h * 0.5, hz = r * 0.95;
      s = createRigidBox(hx, hy, hz, density(8 * hx * hy * hz), opts);
    } else if (kind === 'loosewheel') {
      // a wheel on its side: its axis across, it rolls
      const half = Math.min(r * 0.45, h * 0.5), rr = Math.max(r, h * 0.5);
      s = createRigidShape([{ kind: 'cylinder', center: [0, 0, 0], halfHeight: half, radius: rr,
        rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2], mass: Math.max(1, mass * 40) }], { ...opts, rolls: true, rolling: 0.6 });
    } else {
      s = createRigidCylinder(r, h * 0.5, density(Math.PI * r * r * h), opts);
    }
    shapes.set(key, s);
    return s;
  }

  function admit(b: LoosePropBody, kind: string, asleep: boolean): boolean {
    if (slots.has(b)) return true;
    let slot = world.spawn(shapeFor(b, kind), { x: b.x, y: b.y, z: b.z, qx: b.qx, qy: b.qy, qz: b.qz, qw: b.qw,
      vx: asleep ? 0 : b.vx, vy: asleep ? 0 : b.vy, vz: asleep ? 0 : b.vz,
      wx: asleep ? 0 : b.wx, wy: asleep ? 0 : b.wy, wz: asleep ? 0 : b.wz, asleep });
    if (slot < 0) {
      // full: the longest sleeper gives way (its pose stays its prop's)
      let oldest = -1, age = -1;
      for (let i = 0; i < capacity; i++) if (world.active[i] && world.asleep[i] && world.age[i] > age) { age = world.age[i]; oldest = i; }
      if (oldest < 0) return false;
      leave(oldest);
      slot = world.spawn(shapeFor(b, kind), { x: b.x, y: b.y, z: b.z, qx: b.qx, qy: b.qy, qz: b.qz, qw: b.qw,
        vx: asleep ? 0 : b.vx, vy: asleep ? 0 : b.vy, vz: asleep ? 0 : b.vz,
        wx: asleep ? 0 : b.wx, wy: asleep ? 0 : b.wy, wz: asleep ? 0 : b.wz, asleep });
      if (slot < 0) return false;
    }
    slots.set(b, slot);
    bodyAt[slot] = b;
    sleptFor[slot] = 0;
    return true;
  }

  function leave(slot: number): void {
    const b = bodyAt[slot];
    if (b) {
      world.framePose(slot, pose);
      b.x = pose[0]; b.y = pose[1]; b.z = pose[2];
      b.qx = pose[3]; b.qy = pose[4]; b.qz = pose[5]; b.qw = pose[6];
      b.vx = b.vy = b.vz = 0; b.wx = b.wy = b.wz = 0;
      b.active = false;
      slots.delete(b);
    }
    bodyAt[slot] = null;
    world.remove(slot);
  }

  return {
    world,
    handles: (b) => !b.groundConstrained,
    wake(b, kind) {
      const slot = slots.get(b);
      if (slot !== undefined) {
        world.setVelocity(slot, b.vx, b.vy, b.vz, b.wx, b.wy, b.wz);
        sleptFor[slot] = 0;
        return true;
      }
      return admit(b, kind, false);
    },
    admitResting(b, kind) {
      return admit(b, kind, true);
    },
    has: (b) => slots.has(b),
    step() {
      world.step(RIGID_STEP_S);
    },
    sync(b) {
      const slot = slots.get(b);
      if (slot === undefined) return false;
      world.framePose(slot, pose);
      b.x = pose[0]; b.y = pose[1]; b.z = pose[2];
      b.qx = pose[3]; b.qy = pose[4]; b.qz = pose[5]; b.qw = pose[6];
      b.vx = world.vx[slot]!; b.vy = world.vy[slot]!; b.vz = world.vz[slot]!;
      b.wx = world.wx[slot]!; b.wy = world.wy[slot]!; b.wz = world.wz[slot]!;
      if (world.asleep[slot]) {
        if (++sleptFor[slot]! >= LEAVE_AFTER_SLEEP_STEPS) { leave(slot); return false; }
      } else sleptFor[slot] = 0;
      b.active = true;
      return true;
    },
    reset() {
      for (const b of slots.keys()) b.active = false;
      slots.clear();
      bodyAt.fill(null);
      sleptFor.fill(0);
      world.clear();
    },
    stats: () => ({ bodies: slots.size, awake: world.awakeCount }),
  };
}
