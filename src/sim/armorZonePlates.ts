/**
 * armorZonePlates.ts — zone plates (262 phase 2, behind a flag, default off): a shell that strikes a frame's collision
 * cells takes the armour zone the scoped paint shows at that point (sim/armorZones.ts zoneAt: the authored plate —
 * glacis, lower plate, cheek, mantlet, side, roof, rear — the point lies nearest, inside whose outline and facing its
 * way), instead of the plate nearest the one hull triangle it meets; and the slices' seams are sealed.
 *
 * Owner, 2026-10-27: "make the hitboxes/highlighting a lot better on tanks ... simpler and generalized". The cells stay
 * the volume a shell enters (where and when it hits is unchanged, but for the cracks sealed); what it meets there:
 *   - the plate (thickness, ERA link, kind) is the zone's: straight borders, the same as the paint, never a zigzag;
 *   - the impact angle is the cell face's (`angles: 'face'`, the default when on) or the zone plate's own (`'plate'`:
 *     the authored plate's angle, a believable plate's, at the cost of the geometry's detail).
 * The flashlight samples the authority, so with the flag on, the paint's colour of a zone is what a shot there gets.
 *
 * Pure numbers, deterministic (Math.sqrt only), Node-runnable, no DOM or WebGL. The zones are built once per plate
 * list; resolving a point allocates nothing. Lazy: sim/armor.ts carries only the hook.
 */
import { setPanelPlateResolver, type ArmorCollisionCell, type ArmorPlate, type PanelPlateHit } from './armor.ts';
import { zoneAt, zonePlates, type ZonePlate } from './armorZones.ts';

let enabled = false;
let plateAngles = false;

/**
 * Zone plates on or off for every trace in this realm (default off; the owner decides the flip): installs the resolver
 * and the seam sealer in sim/armor.ts. Returns the previous setting. Every authority (the match server, a browser host,
 * a solo page) must agree: it is one constant until the flip, never a player setting.
 */
export function setArmorZonePlates(on: boolean, { angles = 'face' }: { angles?: 'face' | 'plate' } = {}): boolean {
  const previous = enabled;
  enabled = !!on;
  plateAngles = angles === 'plate';
  setPanelPlateResolver(enabled ? resolveZonePlate : null, sealSliceSeams);
  return previous;
}

/** Points resolved to a zone and points on none (the caller kept the cell face's plate): read by the gate report. */
export const zonePlateCounters = { resolved: 0, missed: 0 };

const zoneLists = new WeakMap<object, ZonePlate[]>();
const NO_PLATES: readonly ArmorPlate[] = [];

/** The zone at a cell's entry point (the face's outward normal there): its plate, and with plate angles its normal. */
function resolveZonePlate(
  _cells: readonly ArmorCollisionCell[],
  plates: readonly ArmorPlate[] | undefined,
  x: number, y: number, z: number,
  nx: number, ny: number, nz: number,
  out: PanelPlateHit,
): boolean {
  const list = plates || NO_PLATES;
  let zones = zoneLists.get(list);
  if (!zones) { zones = zonePlates(list); zoneLists.set(list, zones); }
  const index = zoneAt(zones, x, y, z, nx, ny, nz);
  if (index < 0) { zonePlateCounters.missed++; return false; }
  zonePlateCounters.resolved++;
  const zone = zones[index];
  out.plate = zone.plate;
  if (plateAngles) { out.nx = zone.normal[0]; out.ny = zone.normal[1]; out.nz = zone.normal[2]; }
  else { out.nx = NaN; out.ny = NaN; out.nz = NaN; }
  return true;
}

/** A cap this near (m) a boundary its cell shares with the next slice is that boundary's cap. */
const SEAM_REACH_M = 0.25;
/** A face within 45° of the hull's axis (|n·z|), every corner near a shared boundary, is a slice's end cap there. */
const CAP_Z = 0.7071067811865476;

const sealed = new WeakMap<object, readonly ArmorCollisionCell[]>();

/**
 * A frame's slices with their seams sealed (262): the generator hulls each longitudinal slice on its own, and where
 * the vehicle's surface does not reach a slice boundary across the whole section, the hull's end cap there tilts
 * back from it — the next slice's cap tilts the other way, and a wedge up to ~9 cm wide runs through the armour
 * between them (a shell along it meets no plate; tools/armor-panel-plates-report.mjs counts them). Every end-cap face
 * of a slice (within 45° of the axis, every corner within SEAM_REACH_M of a boundary it shares with another slice)
 * becomes the boundary's plane: the cell grows into the wedge (never past its own bound), and the two caps then
 * coincide, the inside of the armour.
 * Hull ends, structure cells, lateral bands and cast stock (Chieftain Mk10's cells) are left as they are. Cached per cell list; the cells are copies.
 */
export function sealSliceSeams(cells: readonly ArmorCollisionCell[]): readonly ArmorCollisionCell[] {
  const hit = sealed.get(cells);
  if (hit) return hit;
  const key = (z: number): number => Math.round(z * 1e4);
  const starts = new Set<number>(), ends = new Set<number>();
  const slices = (cell: ArmorCollisionCell): boolean => {
    const extra = cell as ArmorCollisionCell & { structureKind?: unknown; lateralBand?: unknown; sourceStock?: unknown };
    return !extra.structureKind && !extra.lateralBand && extra.sourceStock === undefined;
  };
  for (const cell of cells) if (slices(cell)) { starts.add(key(cell.min[2])); ends.add(key(cell.max[2])); }
  let changed = false;
  const out = cells.map((cell) => {
    if (!slices(cell)) return cell;
    // a boundary is shared when another slice starts where this one ends (or ends where it starts)
    const front = starts.has(key(cell.max[2])) ? cell.max[2] : null;
    const back = ends.has(key(cell.min[2])) ? cell.min[2] : null;
    if (front === null && back === null) return cell;
    let touched = false;
    const faces = cell.faces.map((face) => {
      const n = face.normal;
      const bound = n[2] >= CAP_Z ? front : n[2] <= -CAP_Z ? back : null;
      if (bound === null) return face;
      // every corner of the face stands within reach of the boundary
      for (const index of face.indices) if (Math.abs(cell.vertices[index][2] - bound) > SEAM_REACH_M) return face;
      touched = true;
      const sign = n[2] > 0 ? 1 : -1;
      return { ...face, normal: [0, 0, sign] as const, constant: -sign * bound, internal: true };
    });
    if (!touched) return cell;
    changed = true;
    return { ...cell, faces };
  });
  const result = changed ? out : cells;
  sealed.set(cells, result);
  return result;
}
