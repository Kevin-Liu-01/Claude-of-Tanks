// Authored body boundaries for fill generation only. Visible fittings remain in
// the native tank and in every source/continuity/physical-stock check.
const PRIMARY_BODY_BUCKETS = Object.freeze({
  // Namer's closed rear roof channel lies beneath a separate raised cover
  // and paired bodies. Those fittings do not make the intervening air part
  // of the turret shell; its closed access-door recess is exterior too.
  namer_ifv: Object.freeze(['hull', 'turret']),
  // Both primary meshes are closed authored shells. Lamp cages, deck brackets,
  // slat rails and roof optics sit outside them: combining those separate parts
  // into one vertical span would invent body volume across their real air gaps.
  bmp3m_dragun125_x: Object.freeze(['hull', 'turret']),
  // The supplied Trophy Mk.4 likewise uses its primary hull/turret shells as
  // the repair boundary; its bounded authored seams are handled by the fill
  // generator rather than by treating unrelated exterior fittings as shell.
  // Its lamps, belly fittings and outboard protection overlap the native shoe
  // lanes in projection but remain separately mounted exterior stock. Using
  // those hull* fittings as body boundaries filled the real wheel-bay air.
  merkava4_trophy: Object.freeze(['hull', 'turret']),
  // Barak's folded rear returns and bow towing straps also surround exterior
  // air. Fill only its authored body shells; retain every fitting in the
  // source, continuity and physical-stock audits.
  merkava4_barak: Object.freeze(['hull', 'turret']),
});

// Object's twelve closed canisters and their separate pitch frame are exterior
// equipment, not a single hollow gun casing. Combining their vertical spans
// invented boxes in the intended gaps beside/between the cylindrical cells.
// This selection affects generation only; every mesh remains in native audits.
const EXTERNAL_LAUNCHER_BUCKETS = Object.freeze({
  object695_x: Object.freeze(['gunMount', 'gunMountDark']),
});

/** Select actual body-shell triangles without changing their positions or order. */
export function interiorFillBoundaryTriangles(id, triangles, meshes) {
  const primary = Object.hasOwn(PRIMARY_BODY_BUCKETS, id) ? PRIMARY_BODY_BUCKETS[id] : undefined;
  const external = Object.hasOwn(EXTERNAL_LAUNCHER_BUCKETS, id) ? EXTERNAL_LAUNCHER_BUCKETS[id] : undefined;
  if (!primary && !external) return triangles;
  const present = new Set(triangles.map(triangle => meshes[triangle.mesh]));
  for (const bucket of [...(primary ?? []), ...(external ?? [])]) {
    if (!present.has(bucket)) throw new Error(`${id}: missing authored fill boundary ${bucket}`);
  }
  return triangles.filter(triangle => {
    const name = meshes[triangle.mesh];
    if (external?.includes(name)) return false;
    // Primary-body policies retain the complete gun/mount/bore input. The
    // separate launcher policy keeps the recoiling cannon and its backstop.
    return !primary || !/^(hull|turret)/i.test(name) || primary.includes(name);
  });
}
