// Authored body boundaries for fill generation only. Visible fittings remain in
// the native tank and in every source/continuity/physical-stock check.
const PRIMARY_BODY_BUCKETS = Object.freeze({
  // Both primary meshes are closed authored shells. Lamp cages, deck brackets,
  // slat rails and roof optics sit outside them: combining those separate parts
  // into one vertical span would invent body volume across their real air gaps.
  bmp3m_dragun125_x: Object.freeze(['hull', 'turret']),
});

/** Select actual body-shell triangles without changing their positions or order. */
export function interiorFillBoundaryTriangles(id, triangles, meshes) {
  const primary = Object.hasOwn(PRIMARY_BODY_BUCKETS, id) ? PRIMARY_BODY_BUCKETS[id] : undefined;
  if (!primary) return triangles;
  const present = new Set(triangles.map(triangle => meshes[triangle.mesh]));
  for (const bucket of primary) {
    if (!present.has(bucket)) throw new Error(`${id}: missing authored fill boundary ${bucket}`);
  }
  return triangles.filter(triangle => {
    const name = meshes[triangle.mesh];
    // Keep the complete gun/mount/bore shell, including its dark interior and
    // physical backstop. Restrict only the opted-in hull and turret families.
    return !/^(hull|turret)/i.test(name) || primary.includes(name);
  });
}
