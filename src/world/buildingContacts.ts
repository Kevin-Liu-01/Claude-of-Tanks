// Where the buildings meet the ground (buildings-271; the ground lane's next round, Main 2026-11-08): each regional
// building's plinth outline, its eave overhang, the paving its facade craft already lays at the plinth (the apron), and
// its ground-floor doors with their outward normals, in world metres. The ground lane lays the narrow bands (the
// trampled band, the drip strip, the contact shade) outside the apron from the live plans, and the doorstep dressing
// reads the doors. Renderer-free: a regional build's house plans (maps/regional/index.ts regionalKitPlanOf) and the
// pose props.ts placed it at, nothing else; deterministic for one map build.

import { regionalKitPlanOf } from './maps/regional/index.ts';
import type { HousePlan } from './maps/regional/house.ts';

/** A door's kind for the ground: a house door, a cart or barn gate, a shopfront. */
type ContactDoorKind = 'door' | 'cart' | 'shop';

interface ContactDoor {
  x: number;
  z: number;
  /** the outward unit normal of the door's face, in the ground plane */
  nx: number;
  nz: number;
  width: number;
  kind: ContactDoorKind;
}

export interface BuildingGroundContact {
  /** the builder that built it (its structure id: 'farmhouse', 'grange', 'rowhouse', ...) */
  kind: string;
  /** the plinth's outline, world metres, counter-clockwise seen from above (implicitly closed) */
  plinth: Array<[number, number]>;
  /** the roof's eave overhang past the wall (m), 0 for a flat roof */
  eave: number;
  /** the paving the facade craft lays round the plinth (m): 0 without a skirt */
  apron: number;
  doors: ContactDoor[];
}

/** The skirt a house lays round its plinth (house.ts facadeGroundCraft): 80 cm with the facade craft, else 45 cm. */
const APRON_CRAFT_M = 0.8, APRON_PLAIN_M = 0.45;

/**
 * A reader of one regional build's contacts (its parts as rebuildRegionalStructure returned them) at whatever pose its
 * building ends at, (x, z) turned `rot` about Y as props.ts places the building's group (props.ts moves a building out
 * of a carriageway after every settlement building stands): it keeps the build's house plans only, never its geometry.
 * `craft`: the build ran with the facade craft (desktop). Null for a build without a regional plan (a legacy or landmark
 * body).
 */
export function contactReader(parts: object, craft: boolean): ((x: number, z: number, rot: number) => BuildingGroundContact[]) | null {
  const plan = regionalKitPlanOf(parts);
  if (!plan) return null;
  return (x, z, rot) => contactsAt(plan, x, z, rot, craft);
}

function contactsAt(plan: NonNullable<ReturnType<typeof regionalKitPlanOf>>, x: number, z: number, rot: number, craft: boolean): BuildingGroundContact[] {
  const c = Math.cos(rot), s = Math.sin(rot);
  const world = (px: number, pz: number): [number, number] => [px * c + pz * s + x, -px * s + pz * c + z];
  const out: BuildingGroundContact[] = [];
  for (const house of plan.houses as HousePlan[]) {
    if (house.recorded || house.shaft) continue;
    const { spec, frame, place } = house;
    const pc = place ? Math.cos(place.yaw) : 1, ps = place ? Math.sin(place.yaw) : 0;
    const inBuilding = (px: number, pz: number): [number, number] => (place
      ? [px * pc + pz * ps + place.x, -px * ps + pz * pc + place.z] : [px, pz]);
    const toWorld = (px: number, pz: number) => { const [bx, bz] = inBuilding(px, pz); return world(bx, bz); };
    const body = frame.bodies[0];
    if (!body) continue;
    const o = spec.plinth ? spec.plinth.out : 0;
    // counter-clockwise from above (+y up, x right, z toward the viewer): the plinth's four corners
    const plinth = [toWorld(body.x0 - o, body.z1 + o), toWorld(body.x1 + o, body.z1 + o), toWorld(body.x1 + o, body.z0 - o), toWorld(body.x0 - o, body.z0 - o)];
    const skirt = spec.skirt === undefined ? (spec.plinth ? true : false) : spec.skirt !== null;
    const doors: ContactDoor[] = [];
    for (const op of spec.openings) {
      if (op.storey !== 0 || (op.kind !== 'door' && op.kind !== 'gate' && op.kind !== 'shopfront')) continue;
      const face = frame.faces[op.face];
      if (!face) continue;
      const fx = face.origin[0] + face.u[0] * op.u, fz = face.origin[2] + face.u[2] * op.u;
      const [wx, wz] = toWorld(fx, fz);
      // the normal turned as the point: through the house's placement and the building's
      const [nbx, nbz] = place ? [face.out[0] * pc + face.out[2] * ps, -face.out[0] * ps + face.out[2] * pc] : [face.out[0], face.out[2]];
      const nx = nbx * c + nbz * s, nz = -nbx * s + nbz * c, len = Math.hypot(nx, nz) || 1;
      doors.push({ x: wx, z: wz, nx: nx / len, nz: nz / len, width: op.w, kind: op.kind === 'gate' ? 'cart' : op.kind === 'shopfront' ? 'shop' : 'door' });
    }
    out.push({ kind: plan.builder, plinth, eave: spec.roof.kind === 'flat' ? 0 : spec.roof.eave, apron: skirt ? (craft ? APRON_CRAFT_M : APRON_PLAIN_M) : 0, doors });
  }
  return out;
}
