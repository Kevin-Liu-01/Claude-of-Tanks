import {NATIONAL_MODERNIZATION_IDS} from '../src/vehicles/nationalModernizationConfig.ts';
import {NATIONAL_LEGACY_IDS} from '../src/vehicles/nationalLegacyConfig.ts';
// Authored body boundaries for fill generation only. Visible fittings remain in
// the native tank and in every source/continuity/physical-stock check.
// Rebuilt hulls keep external optics, cage rails and smoke launchers separate
// from the watertight shell. Their air spaces must never become solid voxels.
const RENEWED_BODY_IDS = [
  ...NATIONAL_MODERNIZATION_IDS,
  // The separate welded-turret descendants likewise have closed primary
  // shells; open external screens and stowage cannot bound interior volume.
  ...NATIONAL_LEGACY_IDS,
  't72b3m', 'bmpt_terminator2', 't80u', 't72bu', 't72bu_x',
  't64bv1', 'ua_t64bv', 't62mv1', 't62mv1_x', 't72m1_jaguar',
  't72_rys', 'type96_72_long', 'type96_80_feng', 'type96_72m_lei',
  'amx30', 'amx30b2', 'upior', 'type89_x',
  't84', 'pl01_105', 'vt4a1', 'ztz99a2', 'ztz99a2_prototype',
  // Open gun throats: external roof fittings cannot bound turret fill.
  'leo2a7v_x', 'leo2a6m_x', 'leo2a4m_x',
];
const PRIMARY_BODY_BUCKETS = Object.freeze({
  ...Object.fromEntries(RENEWED_BODY_IDS.map(id => [id, Object.freeze(['hull', 'turret'])])),
  // Linebacker's slat screens, strapped cargo and roof fittings surround exterior
  // air. Its closed Bradley hull and new turret shell bound the actual interior.
  m6_linebacker: Object.freeze(['hull', 'turret']),
  // The owner-requested AMX field kit adds strapped packs and open baskets
  // around closed hull/turret shells. Air behind cargo is outside the vehicle,
  // so never bridge it with generated interior solids. Native audits keep it.
  amx10p_25: Object.freeze(['hull', 'turret']),
  // AMX 56 now carries the same kind of open field racks and skirt screens.
  // Their standoff/cargo air is exterior, not a new hull or turret cavity.
  leclerc_classic_x: Object.freeze(['hull', 'turret']),
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
  // Type100's closed canisters and perforated cannon sleeve surround real
  // exterior air. Never bridge their slots into a solid gun casing; the
  // actual recoiling cannon and all native geometry remain audited.
  type100: Object.freeze(['gunMount', 'gunMountDark']),
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
