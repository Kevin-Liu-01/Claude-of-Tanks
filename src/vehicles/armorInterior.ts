// The interior the anatomy's volumes fill (266). Hull-frame volumes keep inside the hull's armour envelope; turret-local
// ones inside the turret's, or under the deck inside the turret basket: the cylinder of the ring's radius about the axis
// the turret yaws on (calibration turretRing: rimR, deckY in the hull frame), within the hull. One definition for the
// checks that hold the anatomy inside its armour: src/vehicles/internalPlacement.selftest.mjs (ring crossings, volumes)
// and tools/module-visual-align-probe.mjs (volume-out). tools/crew-seat-fit.mjs seats the crew on the same cylinder.

type Point = readonly number[];
interface Envelope { readonly min: Point; readonly max: Point }
interface BasketRing { readonly rimR: number; readonly deckY: number }
interface Plate { readonly kind?: string; readonly name?: string; readonly verts?: readonly Point[] }
interface Volume extends Envelope {
  readonly module?: string;
  readonly crew?: string;
  readonly turretLocal?: boolean;
  readonly external?: boolean;
  readonly parts?: readonly Envelope[];
}
interface Armor {
  readonly hullPlates?: readonly Plate[];
  readonly turretPlates?: readonly Plate[];
  readonly turretPivot: Point;
  readonly modules?: readonly Volume[];
  readonly crew?: readonly Volume[];
}

/** Volumes measured from the model or outside the armour by construction. */
const UNMEASURED = new Set(['trackL', 'trackR', 'optics', 'turretRing', 'gunMount']);
const SAMPLE_STEP_M = 0.05;
const MAX_SAMPLES_PER_AXIS = 12;

/** How far a hull-frame point lies outside the basket (≤ 0 inside): past the ring's radius about the yaw axis, or above the deck. */
export function basketExcess(point: Point, pivot: Point, ring: BasketRing): number {
  return Math.max(Math.hypot(point[0] - pivot[0], point[2] - pivot[2]) - ring.rimR, point[1] - ring.deckY);
}

/** The bounding box of a frame's main armour plates (hatches and cupolas excluded). */
export function armorEnvelope(plates: readonly Plate[] | undefined): Envelope | null {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const plate of plates || []) {
    if ((plate.kind || 'main') !== 'main') continue;
    if (/^(?:hull|turret)_(?:hatch|cupola)_\d+_/.test(plate.name || '')) continue;
    for (const point of plate.verts || []) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : null;
}

function pointExcess(point: Point, envelope: Envelope): number {
  let excess = -Infinity;
  for (let axis = 0; axis < 3; axis++) {
    excess = Math.max(excess, envelope.min[axis] - point[axis], point[axis] - envelope.max[axis]);
  }
  return excess;
}

function boxExcess(box: Envelope, envelope: Envelope): number {
  let excess = -Infinity;
  for (let axis = 0; axis < 3; axis++) {
    excess = Math.max(excess, envelope.min[axis] - box.min[axis], box.max[axis] - envelope.max[axis]);
  }
  return excess;
}

/** A turret-local box against the turret's envelope and the basket, sampled every 5 cm or less (≤ 0 inside). */
function turretBoxExcess(
  box: Envelope, turret: Envelope | null, hull: Envelope | null, pivot: Point, ring: BasketRing | null,
): number {
  const steps = [0, 1, 2].map((axis) =>
    Math.min(MAX_SAMPLES_PER_AXIS, Math.max(1, Math.ceil((box.max[axis] - box.min[axis]) / SAMPLE_STEP_M))));
  const local = [0, 0, 0];
  const inHull = [0, 0, 0];
  let excess = -Infinity;
  for (let i = 0; i <= steps[0]; i++) for (let j = 0; j <= steps[1]; j++) for (let k = 0; k <= steps[2]; k++) {
    const index = [i, j, k];
    for (let axis = 0; axis < 3; axis++) {
      local[axis] = box.min[axis] + (box.max[axis] - box.min[axis]) * index[axis] / steps[axis];
      inHull[axis] = local[axis] + pivot[axis];
    }
    const outsideTurret = turret ? pointExcess(local, turret) : Infinity;
    const outsideBasket = ring && hull ? Math.max(basketExcess(inHull, pivot, ring), pointExcess(inHull, hull)) : Infinity;
    excess = Math.max(excess, Math.min(outsideTurret, outsideBasket));
  }
  return excess;
}

/** How far each armour-interior volume part leaves its frame's interior, in metres (≤ 0 inside). */
export function armorVolumeOverflows(
  armor: Armor, ring: BasketRing | null | undefined,
): { name: string; turretLocal: boolean; part: number; overflow: number }[] {
  const hull = armorEnvelope(armor.hullPlates);
  const turret = armorEnvelope(armor.turretPlates);
  const out = [];
  for (const volume of [...(armor.modules || []), ...(armor.crew || [])]) {
    if (volume.external === true || UNMEASURED.has(volume.module || '')) continue;
    const parts = Array.isArray(volume.parts) && volume.parts.length ? volume.parts : [volume];
    for (let part = 0; part < parts.length; part++) {
      const overflow = volume.turretLocal
        ? (turret || (ring && hull) ? turretBoxExcess(parts[part], turret, hull, armor.turretPivot, ring || null) : -Infinity)
        : (hull ? boxExcess(parts[part], hull) : -Infinity);
      out.push({ name: volume.module || volume.crew || '?', turretLocal: !!volume.turretLocal, part, overflow });
    }
  }
  return out;
}
