/**
 * fieldWrites.ts — (2026-11-02 audit R4) a write counter per (object, field), for an owner that holds a shared field
 * across awaits and must give it back only if nobody wrote it since.
 *
 * The device rescue's watchdog ladder sets scene.environment, scene.fog and renderer.shadowMap.enabled off for up to
 * 30 s of awaits and used to revert by value (restore when the field still reads null / false). A value compare cannot
 * tell its own null from a newer owner's: a sky re-bake that validated invalid (enforceEnvValidity) also leaves null,
 * and the revert wrote back the pre-ladder texture, which that re-bake may have released. Each writer notes its write
 * here; a holder restores only while the field's counter is still the one its own write returned, and never restores
 * a texture its owner retired. No DOM; Node-runnable.
 */
const counters = new WeakMap<object, Map<string, number>>();
const retired = new WeakSet<object>();

/** Count a write of `target[field]`; returns the write's number (a holder keeps it). */
export function noteFieldWrite(target: object, field: string): number {
  let fields = counters.get(target);
  if (!fields) { fields = new Map(); counters.set(target, fields); }
  const next = (fields.get(field) ?? 0) + 1;
  fields.set(field, next);
  return next;
}

/** The number of the last counted write of `target[field]` (0: none). */
export function fieldWriteNumber(target: object, field: string): number {
  return counters.get(target)?.get(field) ?? 0;
}

/** An owner released `texture` (its GPU storage is gone): no holder may install it again. */
export function noteTextureRetired(texture: object): void {
  retired.add(texture);
}

export function textureRetired(texture: object | null | undefined): boolean {
  return !!texture && retired.has(texture);
}
