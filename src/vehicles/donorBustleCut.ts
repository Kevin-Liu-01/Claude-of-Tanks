// Release 227 (owner 2026-10-16: "also make the qilin turret 10% shorter"): a donor turret shortened by its bustle
// alone. Data only and Node-runnable: the turret builder, the combat spec and the receipts all map their turret-local z
// through this one function, so the drawn turret and its armour, modules and receipts agree.
//
// Everything at or ahead of `front` stays where it is (the face armour, the cupola, the sights, the mantlet and the
// gun); everything at or behind `rear` moves forward rigidly by `cutM`; the band between is compressed linearly onto
// [rear + cutM, front], so a part that spans it keeps its two ends attached.

/** The default band of the ZTZ-99A2 bustle (turret-local z, metres): ahead of it nothing moves. */
export const ZTZ99A2_BUSTLE_CUT_FRONT_Z = -1.27;
/** Behind this station the bustle's rear armour assembly translates as one piece. */
const ZTZ99A2_BUSTLE_CUT_REAR_Z = -1.83;

/** A turret-local z after cutting `cutM` metres out of the bustle band [rear, front]. The identity when cutM is 0. */
export function bustleCutZ(z: number, cutM: number, front = ZTZ99A2_BUSTLE_CUT_FRONT_Z, rear = ZTZ99A2_BUSTLE_CUT_REAR_Z): number {
  if (!(cutM > 0)) return z;
  if (!(front - rear > cutM)) throw new RangeError(`bustle cut ${cutM} m does not fit its ${front - rear} m band`);
  if (z >= front) return z;
  if (z <= rear) return z + cutM;
  return front + (z - front) * (front - (rear + cutM)) / (front - rear);
}
