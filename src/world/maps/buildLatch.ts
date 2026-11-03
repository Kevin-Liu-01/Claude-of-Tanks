// (2026-11-02 audit R2) What a destructible type's `build` records for its pool: the wall and fence kits' frozen contact
// band, their terrain-fit module, the drawn collider band, the adobe wall's envelope. The props build reads them after
// it built the intact module (props.ts refitDestructibleColliders, the wall fit, the broken build), and each reader
// fell back silently when it read nothing: the band derived from the drawn module, the fit on the drawn geometry, a
// hard-coded mud envelope — a different collision record set (the collision manifests the authority plays) with no
// error. Read before the build, they throw now; a later build replaces them (the band and fit are the last build's).

/** The value `build` recorded for `field` of `kind`; throws when read before the pool built the type. */
export function builtValue<T>(value: T | undefined, kind: string, field: string): T {
  if (value === undefined) throw new Error(`world/props: ${kind}.${field} read before its pool built the type (build runs first)`);
  return value;
}
