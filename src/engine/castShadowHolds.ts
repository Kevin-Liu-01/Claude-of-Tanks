/**
 * castShadowHolds.ts — (2026-11-02 audit R4) owners that switch a caster's `castShadow` off for longer than one call.
 *
 * The covered deployment shadow warm switches every caster off across its awaits (it renders them a batch at a time) and
 * used to force `castShadow = true` back on every caster it had snapshotted; an articulated shadow batch switches its
 * source meshes off for its whole life and switched them back on in its dispose, whoever else held them off. A value
 * compare cannot tell the two apart (both write false). Here each owner holds the caster off by name; the caster is
 * off while any hold stands, and when the last hold goes the flag returns to its value from before the first hold, only
 * if it still holds the false the holds wrote (a write by anyone else in between stands).
 *
 * A synchronous toggle needs no hold: one that reads the flag when it starts and restores that value before the call
 * returns (the static cache's mutes, the near vehicle detail's cascade flips, each of shadowPrime's warm batches, which
 * read their casters' flags at the batch's start, never from the collection made before the warm's awaits).
 * No DOM; Node-runnable.
 */
interface CastShadowTarget { castShadow: boolean }

interface HoldRecord { base: boolean; owners: Set<object> }

const holds = new WeakMap<CastShadowTarget, HoldRecord>();

/** Hold `object` off for `owner` (idempotent per owner). */
export function holdCastShadowOff(object: CastShadowTarget, owner: object): void {
  let record = holds.get(object);
  if (!record) {
    record = { base: object.castShadow, owners: new Set() };
    holds.set(object, record);
  }
  record.owners.add(owner);
  object.castShadow = false;
}

/** Release `owner`'s hold; the last release restores the pre-hold value if the flag still holds the holds' false. */
export function releaseCastShadowHold(object: CastShadowTarget, owner: object): void {
  const record = holds.get(object);
  if (!record || !record.owners.delete(owner)) return;
  if (record.owners.size > 0) return;
  holds.delete(object);
  if (object.castShadow === false) object.castShadow = record.base;
}

/** Whether any owner holds `object` off. */
export function castShadowHeld(object: CastShadowTarget): boolean {
  return (holds.get(object)?.owners.size ?? 0) > 0;
}

/** Whether an owner other than `owner` holds `object` off. */
export function castShadowHeldByOthers(object: CastShadowTarget, owner: object): boolean {
  const record = holds.get(object);
  if (!record) return false;
  return record.owners.size > (record.owners.has(owner) ? 1 : 0);
}
