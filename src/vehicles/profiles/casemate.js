// Casemate / turretless procedural profiles (fidelity oracles: recovered
// ISU-152/122S, community Jagdtiger, JPz E100, Sturmtiger, T95, Strv 103).
// Owned by the casemate family agent.
//
// Wave-2 rebuild (2026-07-30): every id converted from the parametric
// CASEMATE template (a bare box on hidden tracks — see shaded-parity-r1's
// systemic failures) to a fully bespoke build sized against the
// width-normalized oracle renders + the packets in
// docs/references/tanks/<id>.md. Original primitive reconstructions only —
// no source mesh data.
//
// Family rules baked in from the six wave-1 postmortems:
//  - materials from day one: dark grilles/slits/vision blocks, glass
//    periscopes, gunmetal MGs, worn-steel spare tracks, wood tools;
//  - the GUN MOUNT is the identity anchor: every mantlet is built from
//    surfaces of revolution about the trunnion (rolls/balls/sleeves) so the
//    silhouette stays sealed through the whole gun-pitch range;
//  - fused-gun vehicles keep the casemate in HULL buckets (the sim's virtual
//    turret must never yaw the superstructure);
//  - zero floaters: every fitting sits on a plate; tow cables run along the
//    sponsons (the old template arced one over the bow like a hoop);
//  - WIDTH GUARD: nothing exceeds spec dims.widthM (the lab
//    width-normalizes) and nothing extends past the oracle hull z-extent.
import { KIT } from './kit.js';

// NOTE: KIT arrives through the tankFactory module cycle — it must only be
// dereferenced inside functions (module-scope destructuring hits the TDZ).
const box = (...a) => KIT.box(...a);
const stations = (count, span, zc = 0) => Array.from({ length: count }, (_, i) =>
  zc + span / 2 - i * (span / (count - 1)));

// ---------------------------------------------------------------------------
// Shared fittings
// ---------------------------------------------------------------------------

// Round crew hatch: low drum + lid + dark seam ring.
function hatchDome(P, x, y, z, r = 0.22) {
  const { cylY } = KIT;
  P.add('hull', cylY(r, r * 1.06, 0.055, 14), x, y + 0.028, z);
  P.add('hull', cylY(r * 0.9, r * 0.9, 0.03, 14), x, y + 0.07, z);
  P.add('hullDark', cylY(r * 0.94, r * 0.94, 0.012, 14), x, y + 0.062, z);
  P.add('hullDark', box(0.06, 0.02, r * 1.1), x + r * 0.7, y + 0.075, z);   // hinge
}

// German Bosch blackout light: hooded drum, dark slit, stalk.
function boschLight(P, x, y, z) {
  const { cylY } = KIT;
  P.add('hullDetail', cylY(0.05, 0.06, 0.085, 10), x, y, z);
  P.add('hullDetail', box(0.12, 0.03, 0.095), x, y + 0.05, z);
  P.add('hullDark', box(0.09, 0.016, 0.02), x, y + 0.03, z + 0.048);
  P.add('hullDark', cylY(0.018, 0.018, 0.06, 8), x, y - 0.06, z);
}

// Hull MG ball (Kugelblende): painted collar, dark steel ball + barrel stub.
// `n` = plate normal pitch (rx) so the mount sits ON the sloped plate.
function mgBall(P, x, y, z, rx = 0, r = 0.13) {
  const { sph, cylZ } = KIT;
  P.add('hull', xform2(cylZ(r * 1.5, 0.07, 14), 0, 0, -0.01, rx), x, y, z);
  P.add('hullDark', sph(r, 12), x, y, z);
  P.add('hullDark', xform2(cylZ(r * 0.36, 0.14, 8), 0, 0, r * 0.8, rx), x, y, z);
  P.add('hullDark', xform2(cylZ(0.022, 0.30, 6), 0, 0, r * 1.5, rx), x, y, z);
}
// Small helper: bake a pitch into a geo before P.add (keeps call sites flat).
function xform2(geo, x, y, z, rx) {
  return KIT.xform(geo, x, y, z, rx, 0, 0);
}

// Bow tow hook / shackle bracket.
function towHook(P, x, y, z) {
  const { cylX } = KIT;
  P.add('hullDetail', box(0.09, 0.13, 0.09), x, y, z);
  P.add('hullDark', cylX(0.02, 0.12, 6), x, y + 0.015, z + 0.03);
}

// External fuel drum on brackets (ISU rear sponsons).
function fuelDrum(P, x, y, z, len, r = 0.15) {
  const { cylZ } = KIT;
  P.add('hull', cylZ(r, len, 12), x, y, z);
  for (const e of [-1, 1]) P.add('hullDark', cylZ(r + 0.004, 0.022, 12), x, y, z + e * (len / 2 - 0.013));
  for (const f of [-0.30, 0.30]) {
    P.add('hullDark', box(0.032, r + 0.09, 0.05), x - Math.sign(x) * 0.02, y - r * 0.5, z + f * len);
  }
}

// Roof AA .50cal in gunmetal on a cupola-ring pintle (T95).
function roofMG(P, x, y, z) {
  const { cylY, cylZ } = KIT;
  P.add('hullDark', cylY(0.02, 0.02, 0.18, 8), x, y + 0.09, z);
  P.add('hullDark', box(0.085, 0.10, 0.46), x, y + 0.22, z + 0.04);
  P.add('hullDark', cylZ(0.021, 0.55, 8), x, y + 0.245, z + 0.52, -0.05, 0, 0);
  P.add('hullDark', cylZ(0.030, 0.08, 8), x, y + 0.258, z + 0.78, -0.05, 0, 0);
  P.add('hullDark', box(0.05, 0.09, 0.14), x + 0.09, y + 0.20, z - 0.02, 0, 0, 0.9); // ammo can
  P.add('hullDark', box(0.03, 0.11, 0.08), x, y + 0.16, z - 0.22);                   // grips
}

// Whip antenna on a base cone.
function antenna(P, x, y, z, h = 0.85) {
  P.add('hullDetail', KIT.cylY(0.028, 0.045, 0.07, 8), x, y + 0.035, z);
  P.add('hullDetail', box(0.016, h, 0.016), x, y + h / 2 + 0.07, z, 0, 0, 0.03);
}

// Deep steel-wheel run in the soviet-heavy style: painted steel wheels with a
// dark recess drum behind each so hubs/rims read out of the bay shadow.
function steelGear(P, g) {
  const { buildRunningGear, cylX } = KIT;
  const zs = stations(g.wheels, g.span, g.zc ?? 0);
  const wheelW = g.wheelW ?? Math.min(0.24, g.trackW * 0.42);
  buildRunningGear(P, {
    style: 'steel', wheelR: g.wheelR, wheelW, wheelY: g.wheelY, xc: g.xc, wheelZs: zs,
    sprocket: g.sprocket, idler: g.idler, rollers: g.rollers || [],
    trackW: g.trackW, topY: g.topY, botY: g.botY ?? 0.08, arms: g.arms ?? true,
    coveredTop: g.coveredTop ?? false, deadSag: g.deadSag,
  });
  for (const z of zs) for (const s of [-1, 1]) {
    P.add('hullDark', cylX(g.wheelR * 0.72, wheelW * 1.06, 12), s * g.xc, g.wheelY, z);
  }
}

// ---------------------------------------------------------------------------
// ISU-152 / ISU-122S — docs/references/tanks/isu152.md / isu122s.md
// IS-2 chassis, full-width casemate, mount offset RIGHT of centerline.
// Frame: hull z ±3.385 (6.77 m), width 3.07, casemate roof 2.29.
// ---------------------------------------------------------------------------
function isuHull(P) {
  const { box, cylY, cylZ, frustum, fenders, headlight, towCable, liftEye, shovelTool, slab, torus } = KIT;
  P.add('hull', box(1.86, 0.56, 6.55), 0, 0.62, -0.05);                        // belly (clearance notch)
  P.add('hull', frustum(1.46, 2.42, -3.385, 1.46, 2.44, -3.385, 0.84, 1.01));  // sponson band to the fender line
  // casemate: ~30° front plate, ~20° side lean, reaching well AFT (the real
  // fighting compartment covers ~60% of the hull; r3 left view showed the
  // oracle's roof running past my rear wall)
  P.add('hull', slab(
    [-1.42, 1.00, 2.44], [1.42, 1.00, 2.44], [1.42, 1.00, -1.38], [-1.42, 1.00, -1.38],
    [-1.10, 2.28, 1.72], [1.10, 2.28, 1.72], [1.12, 2.28, -1.26], [-1.12, 2.28, -1.26]));
  P.add('hull', box(2.20, 0.045, 2.90), 0, 2.29, 0.25);                        // roof cap
  // rear engine deck + louvres + sloped tail
  P.add('hull', box(2.90, 0.06, 1.95), 0, 1.40, -2.35);
  for (let i = 0; i < 3; i++) P.add('hullDark', box(2.20, 0.018, 0.11), 0, 1.437, -1.75 - i * 0.42);
  for (let i = 0; i < 2; i++) P.add('hullDetail', box(2.30, 0.022, 0.045), 0, 1.44, -1.96 - i * 0.42);
  P.add('hull', frustum(1.46, -3.30, -3.385, 1.46, -3.02, -3.385, 0.50, 1.38)); // rear lower slope
  P.add('hull', box(2.86, 0.30, 0.10), 0, 1.24, -3.36);                        // tail plate
  P.add('hullDark', box(1.30, 0.24, 0.03), 0, 1.10, -3.415);                   // transmission access shadow
  // pointed two-plate bow
  P.add('hull', frustum(1.42, 3.385, 3.26, 1.50, 2.58, 2.44, 0.60, 1.00));     // upper glacis
  P.add('hull', frustum(1.40, 3.06, 2.56, 1.42, 3.385, 3.26, 0.26, 0.60));     // lower nose
  fenders(P, 1.02, 1.535, 1.01, -3.36, 3.30, 0.03);
  for (const s of [-1, 1]) {
    P.add('hull', box(0.26, 0.36, 0.035), s * 1.26, 0.86, 3.32, -0.5, 0, 0);   // front mud flaps over the idlers
    P.add('hull', box(0.26, 0.38, 0.035), s * 1.26, 0.82, -3.37);              // rear mud flaps
    // twin external fuel tanks on the rear sponson brackets (packet cue)
    fuelDrum(P, s * 1.315, 1.58, -1.10, 0.92);
    fuelDrum(P, s * 1.315, 1.58, -2.18, 0.92);
    // front fender stowage row with dark latch straps (the oracle carries a
    // continuous raised box line from the casemate front to the bow)
    P.add('hull', box(0.30, 0.20, 1.55), s * 1.29, 1.12, 1.90);
    for (const bz of [1.35, 1.80, 2.30]) {
      P.add('hullDark', box(0.31, 0.15, 0.024), s * 1.29, 1.14, bz);
    }
    towHook(P, s * 0.62, 0.72, 3.18);
    towHook(P, s * 0.62, 0.74, -3.30);
  }
  // driver's vision port on the casemate front-left + plate periscopes
  P.add('hullDetail', box(0.30, 0.16, 0.05), -0.78, 1.78, 2.02, -0.52, 0, 0);
  P.add('hullDark', box(0.22, 0.045, 0.03), -0.78, 1.79, 2.04, -0.52, 0, 0);
  KIT.periscope(P, 'hullDetail', -0.60, 2.315, 1.30);
  KIT.periscope(P, 'hullDetail', 0.15, 2.315, 1.42);
  // roof: two dome hatches (low domed lids), panorama double-lid, vent dome
  hatchDome(P, 0.68, 2.30, 0.85, 0.23);
  P.add('hull', KIT.xform(KIT.sph(0.20, 12, Math.PI / 2), 0, 0, 0, 0, 0, 0, [1, 0.5, 1]), 0.68, 2.35, 0.85);
  hatchDome(P, -0.68, 2.30, -0.35, 0.23);
  P.add('hull', KIT.xform(KIT.sph(0.20, 12, Math.PI / 2), 0, 0, 0, 0, 0, 0, [1, 0.5, 1]), -0.68, 2.35, -0.35);
  P.add('hull', box(0.56, 0.06, 0.46), 0.10, 2.32, -0.75);
  P.add('hullDark', box(0.50, 0.016, 0.024), 0.10, 2.355, -0.75);
  P.add('hull', KIT.sph(0.13, 12, Math.PI / 2), -0.15, 2.30, 0.45);            // vent dome
  liftEye(P, 'hullDetail', -0.98, 2.30, 1.45, 0.4); liftEye(P, 'hullDetail', 0.98, 2.30, 1.45, -0.4);
  liftEye(P, 'hullDetail', -1.02, 2.30, -1.05, 2.7); liftEye(P, 'hullDetail', 1.02, 2.30, -1.05, -2.7);
  // fender furniture + bow kit
  shovelTool(P, -1.28, 1.045, 0.9);
  P.add('hullTrack', box(0.46, 0.05, 0.24), -0.55, 0.90, 2.88, -0.47, 0, 0);   // spare links on the glacis
  P.add('hullTrack', box(0.46, 0.05, 0.24), -0.55, 1.06, 2.55, -0.47, 0, 0);
  headlight(P, 0.55, 1.14, 2.95, -0.35);
  P.add('hullDetail', torus(0.075, 0.011, 12), 0.55, 1.14, 3.02);              // brush-guard hoop
  towCable(P, [[1.30, 1.07, -2.3], [1.40, 1.11, 0.1], [1.30, 1.07, 2.1]]);
  steelGear(P, {
    xc: 1.215, trackW: 0.62, wheels: 6, wheelR: 0.30, wheelY: 0.36, span: 4.40, zc: 0,
    sprocket: { z: -2.88, y: 0.42, r: 0.24 }, idler: { z: 2.85, y: 0.42, r: 0.21 },
    rollers: [-1.5, 0.05, 1.6].map((z) => ({ z, y: 0.985, r: 0.08 })), topY: 1.00, botY: 0.14,
  });
  for (const s of [-1, 1]) {
    P.add('hull', box(0.28, 0.16, 0.60), s * 1.29, 1.11, -2.90);               // rear fender boxes
    P.add('hullDark', box(0.29, 0.12, 0.024), s * 1.29, 1.13, -2.90);
  }
  P.decal('hull', 'number', P.spec.visual.number || '152', 0.30, [1.29, 1.56, 0.65], Math.PI / 2, 0, 0.245);
  P.decal('hull', 'number', P.spec.visual.number || '152', 0.30, [-1.29, 1.56, 0.65], -Math.PI / 2, 0, -0.245);
}

// Sealed two-part cast mount, offset right: fixed bolted ring on the plate
// (hull bucket) + moving ball/sleeve pieces revolved about the trunnion.
function isuMount(P, o) {
  const { cylX, cylZ, sph } = KIT;
  P.turretG.position.set(0.20, 1.76, 1.90);
  P.gunG.position.set(0, 0, 0);
  // fixed ring on the 30° plate (plate surface at gun height sits at z≈2.00)
  P.add('hull', KIT.xform(cylZ(o.ringR, 0.24, 18), 0, 0, 0.0, -0.50, 0, 0), 0.20, 1.80, 2.02);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + 0.12;
    P.add('hullDark', KIT.xform(cylZ(0.016, 0.03, 6),
      Math.cos(a) * (o.ringR - 0.035), Math.sin(a) * (o.ringR - 0.035), 0.115, -0.50, 0, 0), 0.20, 1.80, 2.02);
  }
  P.addGunExtra(cylX(o.rollR, o.rollW, 14), 0, 0, 0);                          // trunnion roll (seal)
  P.addGunExtra(sph(o.ballR, 16), 0, 0, o.ballZ);                              // cast ball shield straddling the ring
  P.addGunExtra(cylZ(o.ballR * 0.82, 0.34, 14, o.ballR * 0.96), 0, 0, o.ballZ + 0.28); // sleeve cone off the ball
  P.addGunExtra(box(o.ballR * 2.2, o.ballR * 2.0, 0.78), 0, -o.ballR * 0.75, 0.34); // deep lower shield mass
  P.addGunExtra(box(0.52, 0.30, 0.42), 0, -0.26, 0.10);                        // chin casting
}

function buildISU152(P) {
  const { cylZ, buildGun } = KIT;
  isuHull(P);
  isuMount(P, { ringR: 0.40, rollR: 0.28, rollW: 0.78, ballR: 0.34, ballZ: 0.14 });
  // this print carries a big crate/tarp pile across the engine deck (the r3
  // left view's red block behind the casemate) — strapped stowage, not armor
  P.add('hullCloth', box(2.20, 0.55, 0.85), 0, 1.70, -2.85);
  P.add('hullCloth', box(2.24, 0.12, 0.89), 0, 1.99, -2.85);
  for (const sx of [-0.70, 0.05, 0.80]) P.add('hullDark', box(0.028, 0.60, 0.87), sx, 1.72, -2.855);
  // ML-20S: huge recoil sleeve UNDER-tube + recuperator drum ABOVE the tube
  // (the "pig snout"), then the bare 152 mm tube. Muzzle at frame +4.92
  // (oracle overall 8.39 at width 3.07).
  P.addGunExtra(cylZ(0.135, 1.15, 12, 0.160), 0, -0.06, 0.85);                 // buffer sleeve under the tube
  P.addGunExtra(cylZ(0.092, 1.00, 10, 0.105), 0, 0.215, 0.75);                 // recuperator above
  P.addGunExtra(KIT.box(0.20, 0.16, 0.80), 0, 0.13, 0.75);                     // saddle web between them
  buildGun(P, { len: 3.20, r: 0.086, brake: null, baseR: 0.135, sleeve: false, evac: null });
  P.add('gun', cylZ(0.096, 0.10, 12), 0, 0, 3.13);                             // muzzle collar
  P.topY = 1.20;
}

function buildISU122S(P) {
  const { cylZ, buildGun } = KIT;
  isuHull(P);
  isuMount(P, { ringR: 0.36, rollR: 0.25, rollW: 0.72, ballR: 0.29, ballZ: 0.12 });
  // D-25S L/48.6: slim tube, recoil sleeve step, German-pattern double-baffle
  // brake. Muzzle at frame +6.47 (oracle overall 9.88).
  P.addGunExtra(cylZ(0.088, 0.85, 10, 0.105), 0, 0, 0.70);                     // recoil sleeve step
  buildGun(P, { len: 4.73, r: 0.058, brake: null, baseR: 0.11, sleeve: false, evac: null });
  P.add('gunDark', cylZ(0.030, 0.42, 8), 0, 0, 4.36);                          // dark core through the slot
  P.add('gun', cylZ(0.105, 0.10, 12), 0, 0, 4.26);                             // rear baffle drum
  P.add('gunDark', cylZ(0.101, 0.012, 12), 0, 0, 4.316);
  P.add('gun', cylZ(0.100, 0.10, 12), 0, 0, 4.48);                             // front baffle drum
  P.add('gunDark', cylZ(0.096, 0.012, 12), 0, 0, 4.422);
  P.add('gun', cylZ(0.068, 0.07, 10), 0, 0, 4.58);                             // exit collar
  P.topY = 1.20;
}

// ---------------------------------------------------------------------------
// Jagdtiger — docs/references/tanks/jagdtiger.md
// Tiger II chassis, 15° casemate front, pot mantlet, 12.8 cm PaK 44.
// Frame: hull z ±3.69 (7.38 m), width 3.63 (fenders 3.70), roof 2.85.
// ---------------------------------------------------------------------------
function buildJagdtiger(P) {
  const { box, cylX, cylY, cylZ, frustum, slab, fenders, towCable, liftEye, shovelTool, buildRunningGear, buildGun, periscope } = KIT;
  P.add('hull', box(2.00, 0.62, 7.28), 0, 0.65, 0);                            // belly (tall clearance notch)
  P.add('hull', box(3.63, 0.68, 6.05), 0, 1.38, -0.66);                        // full-width sponson box
  P.add('hull', box(3.60, 0.10, 0.08), 0, 1.08, -3.64);                        // rear lower lip
  // Tiger II bow: 50° glacis full width + lower nose plate
  P.add('hull', frustum(1.56, 3.67, 3.30, 1.815, 2.48, 2.36, 0.86, 1.73));
  P.add('hull', frustum(1.56, 3.30, 3.67, 1.56, 3.67, 3.67, 0.44, 0.86));
  // casemate: integral sides leaning ~21°, 15° front plate, leaned rear —
  // the whole prism is NARROWER than the sponson box (r3 front/rear masks:
  // the oracle shoulder line starts well inside the fender edge)
  P.add('hull', slab(
    [-1.54, 1.72, 2.04], [1.54, 1.72, 2.04], [1.54, 1.72, -2.04], [-1.54, 1.72, -2.04],
    [-1.10, 2.84, 1.74], [1.10, 2.84, 1.74], [1.10, 2.84, -1.88], [-1.10, 2.84, -1.88]));
  P.add('hull', box(2.18, 0.045, 3.58), 0, 2.85, -0.07);                       // roof plate
  // rear deck + Tiger II grille fields
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.72, 0.02, 1.10), s * 1.02, 1.742, -2.78);
    for (let i = 0; i < 4; i++) P.add('hullDetail', box(0.66, 0.026, 0.06), s * 1.02, 1.755, -2.42 - i * 0.24);
  }
  P.add('hull', cylY(0.27, 0.27, 0.035, 16), 0, 1.745, -2.60);                 // engine hatch
  P.add('hullDark', KIT.torus(0.27, 0.013, 14), 0, 1.755, -2.60);
  P.add('hull', box(3.0, 0.55, 0.12), 0, 1.30, -3.66);                         // rear plate
  P.add('hull', frustum(1.50, -3.60, -3.69, 1.50, -3.26, -3.69, 0.44, 1.02));  // rear lower slope
  fenders(P, 1.12, 1.85, 1.10, -3.66, 3.42, 0.04);
  for (const z of [3.36, -3.60]) {
    P.add('hull', box(0.72, 0.04, 0.14), 1.56, 1.13, z, z > 0 ? -0.45 : 0.45, 0, 0);
    P.add('hull', box(0.72, 0.04, 0.14), -1.56, 1.13, z, z > 0 ? -0.45 : 0.45, 0, 0);
  }
  // pot mantlet on the 15° plate: fixed collar + bolted ring (hull), moving
  // cast pot + trunnion roll (gun mount) — sealed through −7.5/+15°.
  P.turretG.position.set(0, 2.10, 1.86);
  P.gunG.position.set(0, 0, 0);
  P.add('hull', KIT.xform(cylZ(0.40, 0.26, 18), 0, 0, 0.02, -0.26, 0, 0), 0, 2.10, 1.94);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + 0.1;
    P.add('hullDark', KIT.xform(cylZ(0.015, 0.03, 6),
      Math.cos(a) * 0.355, Math.sin(a) * 0.355, 0.155, -0.26, 0, 0), 0, 2.10, 1.94);
  }
  P.addGunExtra(cylX(0.29, 0.70, 14), 0, 0, 0);                                // trunnion roll
  P.addGunExtra(cylZ(0.275, 0.55, 18, 0.315), 0, 0, 0.30);                     // cast pot
  P.addGunExtra(cylZ(0.20, 0.22, 14, 0.25), 0, 0, 0.66);                       // pot nose step
  // 12.8 cm PaK 44 L/55: two-section tube with a joint sleeve, no brake.
  // Muzzle at frame +6.26 (oracle overall 9.95 at width 3.7).
  buildGun(P, { len: 4.40, r: 0.072, brake: null, baseR: 0.13, sleeve: false, evac: null });
  P.add('gun', cylZ(0.088, 1.55, 12, 0.098), 0, 0, 1.42);                      // rear tube section
  P.add('gun', cylZ(0.092, 0.14, 12), 0, 0, 2.28);                             // joint collar
  P.add('gun', cylZ(0.078, 0.09, 12), 0, 0, 4.32);                             // muzzle collar
  // glacis furniture: MG ball right, Bosch light left, travel lock center
  mgBall(P, 0.62, 1.34, 3.02, -0.70, 0.12);
  boschLight(P, -0.62, 1.62, 2.74);
  P.add('hullDetail', box(0.07, 0.34, 0.07), 0, 1.24, 3.28, -0.85, 0, 0);      // travel-lock legs
  P.add('hullDetail', box(0.07, 0.34, 0.07), 0.30, 1.24, 3.28, -0.85, 0, -0.5);
  P.add('hullDetail', box(0.42, 0.07, 0.12), 0.14, 1.40, 3.16);                // lock cradle
  periscope(P, 'hullDetail', -0.55, 1.76, 2.30);                               // driver periscopes on the fore roof
  periscope(P, 'hullDetail', 0.55, 1.76, 2.30);
  // roof furniture: periscope humps, hatches, close-defense, vents, pilze
  P.add('hull', box(0.30, 0.09, 0.36), -0.52, 2.88, 1.10);
  P.add('hull', box(0.30, 0.09, 0.36), 0.52, 2.88, 1.10);
  KIT.periscope(P, 'hullDetail', -0.52, 2.955, 1.10);
  KIT.periscope(P, 'hullDetail', 0.52, 2.955, 1.10);
  hatchDome(P, 0.60, 2.86, -0.35, 0.24);                                       // commander hatch
  hatchDome(P, -0.60, 2.86, -1.25, 0.22);                                      // loader hatch
  P.add('hull', cylY(0.085, 0.095, 0.12, 10), 0.18, 2.90, -0.85);              // close-defense mount
  P.add('hull', KIT.sph(0.12, 12, Math.PI / 2), -0.10, 2.86, 0.28);            // vent dome
  for (const [px, pz] of [[-0.92, 0.9], [0.92, 0.9], [0, -1.6]]) {
    P.add('hullDetail', cylY(0.055, 0.06, 0.07, 8), px, 2.885, pz);            // Pilze sockets
  }
  // spare track links racked on BOTH casemate sides (signature)
  for (const s of [-1, 1]) {
    const wallX = 1.32, tilt = s * -0.374;                                     // matches the 21° side lean
    P.add('hull', box(0.03, 0.50, 1.60), s * (wallX + 0.015), 2.26, 0.30, 0, 0, tilt);
    for (let k = 0; k < 5; k++) {
      P.add('hullTrack', box(0.055, 0.44, 0.17), s * (wallX + 0.045), 2.26, -0.28 + k * 0.30, 0, 0, tilt);
      P.add('hullTrack', box(0.07, 0.15, 0.06), s * (wallX + 0.06), 2.26, -0.28 + k * 0.30, 0, 0, tilt);
    }
  }
  // rear plate: twin shrouded exhausts + jack; fender tools; side tow cable
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylY(0.115, 0.12, 0.72, 12), s * 0.62, 1.62, -3.70);
    P.add('hull', box(0.32, 0.62, 0.16), s * 0.62, 1.60, -3.66);
    P.add('hullDark', cylY(0.075, 0.085, 0.16, 10), s * 0.62, 2.02, -3.70);    // sooted tip
  }
  P.add('hullDark', box(0.46, 0.13, 0.18), -1.30, 1.80, -3.60);                // jack
  P.add('hullWood', box(0.26, 0.11, 0.28), 1.25, 1.80, -3.58);                 // jack block
  shovelTool(P, 1.30, 1.135, 1.6);
  P.add('hullWood', box(0.03, 0.03, 1.05), -1.42, 1.135, 1.2);                 // pry bar
  P.add('hullDark', box(0.09, 0.05, 0.24), -1.42, 1.14, 1.85);
  towCable(P, [[1.72, 1.55, -2.6], [1.83, 1.60, -0.2], [1.72, 1.55, 2.2]]);
  towHook(P, -0.85, 0.66, 3.55); towHook(P, 0.85, 0.66, 3.55);
  liftEye(P, 'hullDetail', -1.02, 2.86, 1.45, 0.4); liftEye(P, 'hullDetail', 1.02, 2.86, 1.45, -0.4);
  // 9 interleaved Tiger II stations, front drive — dished steel-rim wheels
  buildRunningGear(P, {
    style: 'dished', wheelR: 0.40, wheelW: 0.24, wheelY: 0.44, xc: 1.415,
    wheelZs: stations(9, 4.90, -0.10), layers: [[0.105], [-0.105]],
    sprocket: { z: 3.26, y: 0.48, r: 0.36 }, idler: { z: -3.36, y: 0.46, r: 0.33 },
    rollers: [], trackW: 0.80, topY: 1.00, botY: 0.06,
    bayShadowTop: 1.08, deadSag: 0.075,
  });
  P.decal('hull', 'cross', null, 0.42, [1.33, 2.28, 0.55], Math.PI / 2, 0, 0.374);
  P.decal('hull', 'cross', null, 0.42, [-1.33, 2.28, 0.55], -Math.PI / 2, 0, -0.374);
  P.decal('hull', 'number', P.spec.visual.number || '314', 0.34, [1.30, 2.26, -0.75], Math.PI / 2, 0, 0.374);
  P.decal('hull', 'number', P.spec.visual.number || '314', 0.34, [-1.30, 2.26, -0.75], -Math.PI / 2, 0, -0.374);
  P.topY = 1.60;
}

// ---------------------------------------------------------------------------
// Jagdpanzer E 100 — docs/references/tanks/jpz_e100.md
// WoT-style Krupp 17 cm StuK on the E 100 chassis: Maus-like skirted hull,
// huge central casemate. Frame: hull z ±4.30 (8.6 m), width 4.30, roof 3.27.
// ---------------------------------------------------------------------------
function buildJPzE100(P) {
  const { box, cylX, cylY, cylZ, frustum, slab, liftEye, towCable, buildRunningGear, buildGun } = KIT;
  P.add('hull', box(2.60, 0.80, 8.30), 0, 0.58, 0);                            // belly
  P.add('hull', box(4.04, 0.86, 7.10), 0, 1.42, -0.42);                        // full-width sponson band
  // Maus-like 46° glacis + LONG fore deck (front powerpack, Ferdinand-style)
  P.add('hull', frustum(1.75, 4.28, 3.92, 2.02, 3.12, 2.82, 0.80, 1.85));
  P.add('hull', frustum(1.75, 3.90, 4.28, 1.75, 4.28, 4.28, 0.42, 0.80));
  P.add('hull', box(3.90, 0.05, 2.10), 0, 1.86, 1.90);                         // fore deck plate
  // REAR-set casemate (the oracle's roof mass sits over the rear half —
  // the r2 forward move read the left-view mirror backwards)
  P.add('hull', slab(
    [-1.88, 1.85, 0.65], [1.88, 1.85, 0.65], [1.88, 1.85, -3.55], [-1.88, 1.85, -3.55],
    [-1.55, 3.28, -0.15], [1.55, 3.28, -0.15], [1.55, 3.28, -3.38], [-1.55, 3.28, -3.38]));
  P.add('hull', box(3.08, 0.045, 3.23), 0, 3.29, -1.76);                       // roof plate
  // fore-deck grilles (powerpack forward of the fighting compartment)
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.92, 0.02, 1.30), s * 1.10, 1.882, 1.95);
    for (let i = 0; i < 5; i++) P.add('hullDetail', box(0.84, 0.026, 0.06), s * 1.10, 1.895, 2.40 - i * 0.24);
  }
  P.add('hull', cylY(0.30, 0.30, 0.04, 16), 0, 1.888, 1.25);                   // access hatch
  P.add('hull', box(3.30, 0.60, 0.14), 0, 1.35, -4.26);                        // rear plate
  P.add('hull', frustum(1.62, -4.16, -4.30, 1.62, -3.82, -4.30, 0.42, 1.05));  // rear lower slope
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.50, 0.34, 0.06), s * 0.85, 1.42, -4.325);          // armored exhaust covers
    P.add('hullDetail', box(0.56, 0.05, 0.08), s * 0.85, 1.62, -4.31);
  }
  // heavy slab side skirts covering the top run (E 100/Maus signature)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.10, 0.78, 8.20), s * 2.095, 1.03, 0);
    P.add('hull', box(0.16, 0.10, 8.20), s * 2.06, 1.46, 0);                   // top lip
    P.add('hullDark', box(0.02, 0.68, 8.15), s * 2.135, 1.00, 0);              // panel shadow face
    for (let k = 0; k < 7; k++) {
      P.add('hullDark', box(0.115, 0.74, 0.02), s * 2.095, 1.02, -3.5 + k * 1.17); // panel joints
    }
    P.add('hullDark', box(0.03, 0.10, 8.0), s * 2.05, 0.68, 0);                // lower edge shadow
  }
  // saukopf-ish cast collar low on the casemate front + 17 cm tube with its
  // enormous overhang over the fore deck. Muzzle at frame +6.72 (oracle
  // overall 11.09 at width 4.3).
  P.turretG.position.set(0, 2.26, 0.42);
  P.gunG.position.set(0, 0, 0);
  P.add('hull', KIT.xform(cylZ(0.46, 0.30, 18), 0, 0, 0.0, -0.56, 0, 0), 0, 2.28, 0.62);
  P.addGunExtra(cylX(0.34, 0.86, 14), 0, 0, 0);                                // trunnion roll
  P.addGunExtra(cylZ(0.33, 0.72, 18, 0.42), 0, 0, 0.38);                       // broad cast pot
  P.addGunExtra(cylZ(0.24, 0.30, 14, 0.29), 0, 0, 0.86);                       // nose step
  buildGun(P, { len: 6.40, r: 0.105, brake: null, baseR: 0.17, sleeve: false, evac: null });
  P.add('gun', cylZ(0.128, 2.00, 12, 0.142), 0, 0, 1.85);                      // thick rear tube section
  P.add('gun', cylZ(0.118, 0.20, 12), 0, 0, 6.22);                             // muzzle collar step
  // roof/deck furniture
  hatchDome(P, 0.70, 3.30, -1.05, 0.26);
  hatchDome(P, -0.70, 3.30, -1.90, 0.24);
  P.add('hull', KIT.sph(0.13, 12, Math.PI / 2), 0.05, 3.30, -0.72);            // vent dome
  P.add('hull', KIT.sph(0.11, 12, Math.PI / 2), -0.62, 3.30, -0.88);
  KIT.periscope(P, 'hullDetail', 0.30, 3.32, -0.50);
  KIT.periscope(P, 'hullDetail', -0.30, 3.32, -0.50);
  liftEye(P, 'hullDetail', -1.38, 3.29, -0.50, 0.4); liftEye(P, 'hullDetail', 1.38, 3.29, -0.50, -0.4);
  liftEye(P, 'hullDetail', -1.38, 3.29, -3.00, 2.7); liftEye(P, 'hullDetail', 1.38, 3.29, -3.00, -2.7);
  // fore-deck kit: spare links, tow eyes; rear-deck jack + blocks
  P.add('hullTrack', box(0.52, 0.06, 0.26), -0.85, 1.90, 3.00);
  P.add('hullTrack', box(0.52, 0.06, 0.26), 0.20, 1.90, 3.06);
  towHook(P, -1.05, 0.68, 4.16); towHook(P, 1.05, 0.68, 4.16);
  P.add('hullDark', box(0.50, 0.14, 0.20), 1.35, 1.90, -3.90);                 // jack
  P.add('hullWood', box(0.30, 0.12, 0.30), -1.35, 1.89, -3.90);                // jack block
  towCable(P, [[1.95, 1.52, -2.8], [2.04, 1.56, -0.3], [1.95, 1.52, 2.0]]);
  boschLight(P, -0.70, 1.92, 3.30);
  buildRunningGear(P, {
    style: 'dished', wheelR: 0.30, wheelW: 0.22, wheelY: 0.34, xc: 1.60,
    wheelZs: stations(8, 5.60, -0.05), layers: [[0.10], [-0.10]],
    sprocket: { z: -3.96, y: 0.40, r: 0.32 }, idler: { z: 3.96, y: 0.38, r: 0.30 },
    rollers: [], trackW: 0.92, topY: 0.90, botY: 0.06, coveredTop: 1.20, deadSag: 0.05,
  });
  P.decal('hull', 'cross', null, 0.46, [1.71, 2.55, -0.85], Math.PI / 2, 0, 0.23);
  P.decal('hull', 'cross', null, 0.46, [-1.71, 2.55, -0.85], -Math.PI / 2, 0, -0.23);
  P.decal('hull', 'number', P.spec.visual.number || '100', 0.36, [1.68, 2.50, -2.15], Math.PI / 2, 0, 0.23);
  P.decal('hull', 'number', P.spec.visual.number || '100', 0.36, [-1.68, 2.50, -2.15], -Math.PI / 2, 0, -0.23);
  P.topY = 1.90;
}

// ---------------------------------------------------------------------------
// Sturmtiger — docs/references/tanks/sturmtiger.md
// Tiger I chassis, 47° casemate front, 38 cm RW61 in a ball mount, erected
// loading crane (the oracle carries it). Frame: hull z ±3.14, width 3.57.
// ---------------------------------------------------------------------------
function buildSturmtiger(P) {
  const { box, cylX, cylY, cylZ, frustum, slab, fenders, towCable, liftEye, shovelTool, buildRunningGear, buildGun, periscope } = KIT;
  P.add('hull', box(2.24, 0.60, 6.04), 0, 0.66, -0.02);                        // belly (clearance notch)
  P.add('hull', box(3.42, 0.60, 5.80), 0, 1.36, -0.10);                        // full-width sponson box
  // Tiger I three-plate bow (whole frame held to the oracle's ±3.08)
  P.add('hull', frustum(1.52, 2.80, 3.02, 1.52, 3.04, 3.02, 0.46, 0.92));      // 24° nose
  P.add('hull', frustum(1.71, 3.04, 2.48, 1.71, 2.66, 2.46, 0.92, 1.14));      // glacis shelf
  P.add('hull', frustum(1.71, 2.66, 2.46, 1.71, 2.60, 2.44, 1.14, 1.32));      // short driver plate
  P.add('hull', box(3.40, 0.10, 0.08), 0, 1.10, 2.50);                         // front lower lip
  // casemate: 47° front, ~17° side lean
  P.add('hull', slab(
    [-1.62, 1.30, 2.56], [1.62, 1.30, 2.56], [1.62, 1.30, -1.22], [-1.62, 1.30, -1.22],
    [-1.24, 2.82, 1.26], [1.24, 2.82, 1.26], [1.24, 2.82, -1.14], [-1.24, 2.82, -1.14]));
  P.add('hull', box(2.46, 0.045, 2.36), 0, 2.83, 0.06);                        // roof plate
  // engine deck (Tiger I grilles + fans) + rear plate w/ shrouded exhausts
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.66, 0.02, 1.05), s * 0.98, 1.672, -2.30);
    for (let i = 0; i < 4; i++) P.add('hullDetail', box(0.60, 0.026, 0.06), s * 0.98, 1.685, -1.95 - i * 0.24);
    P.add('hullDark', cylY(0.20, 0.20, 0.016, 14), s * 0.88, 1.678, -1.45);    // fan wells
    P.add('hullDetail', KIT.torus(0.20, 0.018, 14), s * 0.88, 1.685, -1.45);
  }
  P.add('hull', cylY(0.24, 0.24, 0.035, 14), 0, 1.678, -1.85);                 // engine hatch
  P.add('hull', box(3.30, 0.58, 0.12), 0, 1.30, -3.02);                        // rear plate
  P.add('hull', frustum(1.50, -2.96, -3.06, 1.50, -2.70, -3.06, 0.44, 1.02));  // rear lower slope
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylY(0.12, 0.13, 0.78, 12), s * 0.55, 1.66, -3.00);    // muffler drums
    P.add('hull', box(0.36, 0.66, 0.14), s * 0.55, 1.68, -2.99);               // armored shrouds
    P.add('hullDark', cylY(0.075, 0.085, 0.16, 10), s * 0.55, 2.08, -3.00);    // sooted tips
  }
  fenders(P, 1.08, 1.785, 1.10, -2.98, 2.98, 0.04);
  for (const z of [2.92, -2.92]) {
    P.add('hull', box(0.55, 0.04, 0.12), 1.48, 1.12, z, z > 0 ? -0.45 : 0.45, 0, 0);
    P.add('hull', box(0.55, 0.04, 0.12), -1.48, 1.12, z, z > 0 ? -0.45 : 0.45, 0, 0);
  }
  // 38 cm RW61 ball mount on the 47° plate: fixed aperture ring (hull) +
  // moving ball; the stubby tube's muzzle face carries the signature ring of
  // gas-vent holes. Muzzle ≈ frame +3.06 (oracle overall 6.16).
  P.turretG.position.set(0.10, 2.06, 1.94);
  P.gunG.position.set(0, 0, 0);
  P.add('hull', KIT.xform(cylZ(0.50, 0.26, 18), 0, 0, 0.04, -0.75, 0, 0), 0.10, 2.10, 2.02);
  P.addGunExtra(KIT.sph(0.40, 18), 0, 0, 0.10);                                // cast ball
  P.addGunExtra(cylX(0.30, 0.62, 14), 0, 0, 0);                                // trunnion seal roll
  buildGun(P, { len: 1.12, r: 0.205, brake: null, baseR: 0.26, sleeve: false, evac: null });
  P.add('gun', cylZ(0.225, 0.10, 16), 0, 0, 1.04);                             // muzzle rim collar
  P.add('gunDark', cylZ(0.135, 0.05, 14), 0, 0, 1.115);                        // bore face
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    P.add('gunDark', cylZ(0.021, 0.06, 6), Math.cos(a) * 0.170, Math.sin(a) * 0.170, 1.10); // vent-hole ring
  }
  // casemate front: MG ball right, driver visor left low
  mgBall(P, 0.80, 1.86, 2.10, -0.82, 0.115);
  P.add('hullDetail', box(0.34, 0.15, 0.05), -0.85, 1.68, 2.30, -0.82, 0, 0);
  P.add('hullDark', box(0.26, 0.045, 0.03), -0.85, 1.69, 2.32, -0.82, 0, 0);
  // roof: loading hatch (two leaves), periscope hump, vent, pilze, CRANE
  P.add('hull', box(0.96, 0.05, 0.86), -0.12, 2.85, -0.44);
  P.add('hullDark', box(0.90, 0.016, 0.024), -0.12, 2.88, -0.44);
  P.add('hullDark', box(0.024, 0.016, 0.80), -0.12, 2.88, -0.44);
  P.add('hull', box(0.30, 0.09, 0.34), -0.55, 2.86, 0.80);                     // periscope hump
  periscope(P, 'hullDetail', -0.55, 2.935, 0.80);
  P.add('hull', KIT.sph(0.115, 12, Math.PI / 2), 0.55, 2.84, 0.70);            // vent dome
  for (const [px, pz] of [[-1.0, 0.95], [1.0, 0.95], [-1.0, -0.90], [1.0, -0.90]]) {
    P.add('hullDetail', cylY(0.05, 0.055, 0.06, 8), px, 2.86, pz);             // Pilze sockets
  }
  // loading crane, erected at the casemate rear-left in the oracle pose:
  // post + jib angled up over the loading hatch + brace + hook tackle
  P.add('hullDetail', cylY(0.038, 0.045, 0.78, 10), -0.92, 3.21, -0.80);       // post
  P.add('hullDetail', box(0.10, 0.07, 0.16), -0.92, 2.86, -0.80);              // post foot
  P.add('hullDetail', box(0.055, 0.055, 1.40), -0.66, 3.82, -0.58, -0.60, 0.35, 0); // jib
  P.add('hullDetail', box(0.04, 0.04, 0.82), -0.81, 3.38, -0.68, -1.12, 0.35, 0);   // brace
  P.add('hullDark', box(0.018, 0.52, 0.018), -0.35, 3.88, -0.25);              // fall cable
  P.add('hullDark', box(0.07, 0.12, 0.05), -0.35, 3.58, -0.25);                // hook block
  // fender kit + spare links on the nose shelf
  shovelTool(P, -1.25, 1.135, 0.9);
  P.add('hullWood', box(0.03, 0.03, 1.0), 1.36, 1.135, 0.6);
  P.add('hullDark', box(0.09, 0.05, 0.22), 1.36, 1.14, 1.25);
  P.add('hullTrack', box(0.48, 0.05, 0.24), -0.60, 1.02, 2.84, -0.28, 0, 0);
  P.add('hullTrack', box(0.48, 0.05, 0.24), 0.60, 1.02, 2.84, -0.28, 0, 0);
  boschLight(P, 0, 1.20, 2.90);
  towHook(P, -0.90, 0.68, 2.98); towHook(P, 0.90, 0.68, 2.98);
  towCable(P, [[-1.68, 1.52, -2.2], [-1.79, 1.57, 0.2], [-1.68, 1.52, 2.3]]);
  liftEye(P, 'hullDetail', -1.14, 2.83, 1.05, 0.4); liftEye(P, 'hullDetail', 1.14, 2.83, 1.05, -0.4);
  buildRunningGear(P, {
    style: 'dished', wheelR: 0.40, wheelW: 0.24, wheelY: 0.44, xc: 1.4125,
    wheelZs: stations(8, 4.20, -0.10), layers: [[0.105], [-0.105]],
    sprocket: { z: 2.62, y: 0.48, r: 0.34 }, idler: { z: -2.66, y: 0.44, r: 0.30 },
    rollers: [], trackW: 0.725, topY: 1.00, botY: 0.10,
    bayShadowTop: 1.06, deadSag: 0.075,
  });
  P.decal('hull', 'cross', null, 0.40, [1.41, 2.02, 0.65], Math.PI / 2, 0, 0.245);
  P.decal('hull', 'cross', null, 0.40, [-1.41, 2.02, 0.65], -Math.PI / 2, 0, -0.245);
  P.decal('hull', 'number', P.spec.visual.number || '1001', 0.30, [1.38, 2.00, -0.55], Math.PI / 2, 0, 0.245);
  P.decal('hull', 'number', P.spec.visual.number || '1001', 0.30, [-1.38, 2.00, -0.55], -Math.PI / 2, 0, -0.245);
  P.topY = 1.62;
}

// ---------------------------------------------------------------------------
// T95 / T28 Super Heavy — docs/references/tanks/t95.md
// One-piece cast low superstructure, FOUR tracks (two units per side behind
// deep side plates), 105 mm T5E1 low in a cast rotor.
// Frame: hull z ±3.80 (7.6 m), width 3.80, roof 2.60.
// ---------------------------------------------------------------------------
function buildT95(P) {
  const { box, cylX, cylY, cylZ, frustum, slab, liftEye, towCable, buildRunningGear, buildGun } = KIT;
  P.add('hull', box(1.80, 0.65, 7.10), 0, 0.55, -0.10);                        // belly between the inner units
  // full-width fender/sponson shelf — the oracle's WIDEST band sits at
  // mid-height above the tracks, not at the ground line
  P.add('hull', box(3.79, 0.16, 6.30), 0, 1.38, -0.20);
  P.add('hull', box(3.50, 0.12, 6.00), 0, 1.26, -0.24);                        // shelf underlip
  // turtle-back cast superstructure: LOW long rounded hump (crown ~2.1 —
  // the r3 dome still capped 0.2 proud of the oracle in every side view)
  P.add('hull', KIT.lathe([
    [1.34, 0], [1.32, 0.18], [1.24, 0.42], [1.06, 0.62],
    [0.78, 0.78], [0.40, 0.86], [0.02, 0.88],
  ], P.q ? 32 : 16, 2.05), 0, 1.22, -0.35);
  // cast bow: glacis wedge sweeping up to the dome shoulder + rounded nose
  P.add('hull', frustum(1.30, 3.72, 2.42, 1.02, 2.35, 1.70, 0.90, 1.58));
  P.add('hull', frustum(1.30, 3.74, 2.52, 1.30, 3.72, 2.42, 0.55, 0.90));      // mid bow band
  P.add('hull', frustum(1.14, 3.30, 2.60, 1.26, 3.74, 2.55, 0.28, 0.55));      // lower nose slope
  P.add('hull', cylX(0.30, 2.30, 14), 0, 0.66, 3.44);                          // rounded nose casting
  // tail: short deck + grilles + plate below the dome tail
  P.add('hull', box(2.60, 0.05, 1.05), 0, 1.44, -3.14);
  for (let i = 0; i < 3; i++) P.add('hullDark', box(2.25, 0.018, 0.12), 0, 1.47, -2.90 - i * 0.26);
  P.add('hull', box(2.50, 0.72, 0.12), 0, 0.90, -3.70);                        // tail plate
  for (const s of [-1, 1]) P.add('hullDark', box(0.13, 0.07, 0.05), s * 1.05, 1.18, -3.73); // taillights
  // FOUR-track running gear: two units per side, small wheels, rear drive,
  // each unit wearing a deep armored side plate over the top run.
  for (const xc of [1.52, 1.10]) {
    buildRunningGear(P, {
      style: 'steel', wheelR: 0.19, wheelW: 0.15, wheelY: 0.28, xc,
      wheelZs: stations(9, 5.30, -0.15),
      sprocket: { z: -3.26, y: 0.28, r: 0.235 }, idler: { z: 3.02, y: 0.27, r: 0.225 },
      rollers: [], trackW: 0.40, topY: 0.70, botY: 0.13, arms: false,
      coveredTop: 0.55, deadSag: 0.03,
    });
  }
  for (const s of [-1, 1]) {
    // outer unit side plate + unit top decks under the shelf
    P.add('hull', box(0.055, 0.72, 6.30), s * 1.71, 0.86, -0.20);
    P.add('hull', box(0.40, 0.05, 6.30), s * 1.52, 1.24, -0.20);               // outer unit top
    P.add('hull', box(0.36, 0.05, 6.30), s * 1.10, 1.20, -0.20);               // inner unit top
    P.add('hullDark', box(0.02, 0.60, 6.8), s * 1.30, 0.74, -0.15);            // between-unit shadow wall
    P.add('hullDark', box(0.02, 0.60, 6.8), s * 0.88, 0.76, -0.18);            // unit/hull shadow wall
    // towing lugs on the unit noses (transport fittings)
    P.add('hullDetail', box(0.16, 0.12, 0.10), s * 1.52, 0.95, 2.90);
    P.add('hullDetail', box(0.16, 0.12, 0.10), s * 1.52, 0.95, -3.30);
  }
  // 105 mm T5E1 in the cast rotor on the dome's front slope: fixed bolted
  // ring (hull) + moving collar/roll. Muzzle at frame +5.72 (oracle 9.5),
  // axis 1.70 with the pilot's muzzle counterweight ring (oracle shows it).
  P.turretG.position.set(0, 1.58, 1.80);
  P.gunG.position.set(0, 0, 0);
  P.add('hull', KIT.xform(cylZ(0.40, 0.30, 18), 0, 0, 0.0, -0.45, 0, 0), 0, 1.62, 2.05);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + 0.14;
    P.add('hullDark', KIT.xform(cylZ(0.016, 0.03, 6),
      Math.cos(a) * 0.35, Math.sin(a) * 0.35, 0.145, -0.45, 0, 0), 0, 1.65, 2.05);
  }
  P.addGunExtra(cylX(0.28, 0.76, 14), 0, 0, 0);                                // trunnion roll
  P.addGunExtra(cylZ(0.25, 0.64, 16, 0.31), 0, 0, 0.36);                       // cast rotor collar
  P.addGunExtra(cylZ(0.185, 0.24, 12, 0.225), 0, 0, 0.74);
  buildGun(P, { len: 3.92, r: 0.098, brake: null, baseR: 0.16, sleeve: false, evac: null });
  P.add('gun', cylZ(0.112, 1.55, 12, 0.12), 0, 0, 1.60);                      // thicker rear tube half
  P.add('gun', cylZ(0.126, 0.18, 12), 0, 0, 3.80);                             // muzzle counterweight ring
  // travel lock on the bow
  P.add('hullDetail', box(0.06, 0.46, 0.06), -0.16, 1.28, 3.30, -0.4, 0, 0.35);
  P.add('hullDetail', box(0.06, 0.46, 0.06), 0.16, 1.28, 3.30, -0.4, 0, -0.35);
  P.add('hullDetail', box(0.30, 0.06, 0.12), 0, 1.50, 3.26);
  // roof cluster ON the hump crown: cupola + M2 right, hatch left,
  // periscopes, whip antennas (the oracle's reach ~3.2)
  P.add('hull', cylY(0.21, 0.23, 0.09, 14), 0.45, 2.00, -0.65);
  P.add('hull', cylY(0.19, 0.19, 0.032, 14), 0.45, 2.09, -0.65);
  P.add('hullDark', KIT.torus(0.215, 0.014, 14), 0.45, 2.10, -0.65);           // vision ring
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    P.add('hullDark', box(0.055, 0.04, 0.04), 0.45 + Math.sin(a) * 0.17, 2.08, -0.65 + Math.cos(a) * 0.17, 0, a, 0);
  }
  roofMG(P, 0.45, 2.10, -0.65);
  hatchDome(P, -0.48, 2.01, -0.50, 0.19);
  KIT.periscope(P, 'hullDetail', -0.30, 2.08, 0.15);
  KIT.periscope(P, 'hullDetail', 0.30, 2.08, 0.15);
  antenna(P, -0.78, 1.92, -1.50, 0.84); antenna(P, 0.78, 1.92, -1.50, 0.80);
  antenna(P, 0.70, 1.98, 0.15, 0.62);
  liftEye(P, 'hullDetail', -1.20, 1.47, 1.60, 0.4); liftEye(P, 'hullDetail', 1.20, 1.47, 1.60, -0.4);
  liftEye(P, 'hullDetail', -1.20, 1.47, -2.25, 2.7); liftEye(P, 'hullDetail', 1.20, 1.47, -2.25, -2.7);
  // sponson stowage + cable
  towCable(P, [[-1.50, 1.34, -1.8], [-1.60, 1.38, 0.4], [-1.50, 1.34, 2.2]]);
  P.add('hullDark', box(0.42, 0.12, 0.18), 1.45, 1.36, -1.6);                  // pioneer tool box
  P.add('hullWood', box(0.03, 0.03, 0.95), 1.52, 1.34, 0.2);
  P.decal('hull', 'star', null, 0.40, [1.825, 0.92, 1.3], Math.PI / 2, 0, 0);
  P.decal('hull', 'star', null, 0.40, [-1.825, 0.92, 1.3], -Math.PI / 2, 0, 0);
  P.decal('hull', 'number', P.spec.visual.number || '95', 0.28, [1.825, 0.90, -1.5], Math.PI / 2, 0, 0);
  P.decal('hull', 'number', P.spec.visual.number || '95', 0.28, [-1.825, 0.90, -1.5], -Math.PI / 2, 0, 0);
  P.topY = 1.55;
}

// ---------------------------------------------------------------------------
// Strv 103B — docs/references/tanks/strv103.md
// One low wedge: hard-raked louvred glacis, fixed 105 mm L74, dozer blade,
// 4 road wheels + raised rear idler. Frame: hull z ±3.52 (7.04), width 3.63.
// ---------------------------------------------------------------------------
function buildStrv103(P) {
  const { box, cylY, cylZ, frustum, liftEye, buildRunningGear, buildGun, periscope } = KIT;
  P.add('hull', box(2.40, 0.55, 6.55), 0, 0.42, 0);                            // belly
  P.add('hull', box(3.50, 0.56, 5.55), 0, 1.07, -0.48);                        // mid band
  // the long raked glacis (the S-tank's whole identity) + lower nose
  P.add('hull', frustum(1.74, 3.50, 2.28, 1.755, 1.00, 0.84, 0.80, 1.88));
  P.add('hull', frustum(1.58, 3.28, 2.78, 1.74, 3.52, 3.28, 0.42, 0.80));
  P.add('hull', box(3.51, 0.06, 3.92), 0, 1.90, -1.08);                        // deck
  P.add('hull', box(3.44, 1.06, 0.12), 0, 1.38, -3.44);                        // tall rear plate
  P.add('hull', frustum(1.70, -3.20, -3.50, 1.72, -3.04, -3.52, 0.42, 0.85));  // rear lower slope
  // flotation-screen rim strip around the deck edge (103B cue)
  for (const s of [-1, 1]) P.add('hull', box(0.07, 0.10, 4.30), s * 1.70, 1.94, -0.92);
  P.add('hull', box(3.44, 0.10, 0.07), 0, 1.93, -3.06);
  P.add('hull', box(3.46, 0.09, 0.07), 0, 1.93, 0.88);                         // deck-break header
  // glacis louvre banks (radiators live ON the glacis) — dark wells with
  // proud transverse ribs, stepped down the rake
  const glY = (z) => 1.88 - (0.94 / 2.36) * (z - 0.92);                        // glacis surface line
  for (let i = 0; i < 6; i++) {
    const z = 1.22 + i * 0.20;
    P.add('hullDark', box(2.45, 0.02, 0.145), 0, glY(z) + 0.012, z, -0.38, 0, 0);
    P.add('hullDetail', box(2.52, 0.028, 0.045), 0, glY(z) + 0.035, z + 0.05, -0.38, 0, 0);
  }
  P.add('hullDetail', box(2.6, 0.05, 0.05), 0, glY(2.48) + 0.03, 2.48, -0.38, 0, 0); // splash rail
  // fixed 105 mm L74: tube emerges mid-glacis; the exit sleeve pitches with
  // the tube (nothing fixed near the pivot can be pierced). Muzzle at frame
  // +5.63 (oracle overall 9.17).
  P.turretG.position.set(0, 1.55, 0.40);
  P.gunG.position.set(0, 0, 0);
  buildGun(P, { len: 5.23, r: 0.058, brake: null, baseR: 0.085, sleeve: false, evac: null });
  P.addGunExtra(cylZ(0.085, 0.55, 12, 0.10), 0, 0, 1.45);                      // glacis exit sleeve
  P.add('gun', cylZ(0.070, 0.65, 10, 0.078), 0, 0, 2.1);                       // rear tube taper
  P.add('gun', cylZ(0.064, 0.07, 10), 0, 0, 5.16);                             // muzzle collar
  // travel clamp on the nose (open yoke under the tube line)
  P.add('hullDetail', box(0.06, 0.26, 0.06), 0, 1.06, 3.10);
  P.add('hullDetail', box(0.20, 0.05, 0.09), 0, 1.21, 3.10);
  P.add('hullDetail', box(0.045, 0.09, 0.045), -0.09, 1.27, 3.10);
  P.add('hullDetail', box(0.045, 0.09, 0.045), 0.09, 1.27, 3.10);
  // dozer blade folded under the nose + arms
  P.add('hull', box(3.00, 0.30, 0.06), 0, 0.44, 3.50, -0.42, 0, 0);
  P.add('hullDark', box(3.02, 0.05, 0.05), 0, 0.30, 3.55, -0.42, 0, 0);        // cutting edge
  P.add('hullDetail', box(0.06, 0.07, 0.72), -1.05, 0.52, 3.12);
  P.add('hullDetail', box(0.06, 0.07, 0.72), 1.05, 0.52, 3.12);
  // roof: commander cupola right w/ vision ring, observation dome left,
  // periscopes, twin whip antennas at the rear corners
  P.add('hull', cylY(0.235, 0.255, 0.13, 14), 0.72, 1.995, -0.12);
  P.add('hull', cylY(0.21, 0.21, 0.04, 14), 0.72, 2.075, -0.12);
  P.add('hullDark', KIT.torus(0.235, 0.016, 14), 0.72, 2.085, -0.12);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    P.add('hullDark', box(0.06, 0.045, 0.04), 0.72 + Math.sin(a) * 0.19, 2.04, -0.12 + Math.cos(a) * 0.19, 0, a, 0);
    P.add('hullGlass', box(0.045, 0.022, 0.042), 0.72 + Math.sin(a) * 0.19, 2.062, -0.12 + Math.cos(a) * 0.19, 0, a, 0);
  }
  P.add('hull', KIT.sph(0.16, 14, Math.PI / 2), -0.70, 1.93, 0.05);            // fixed observation dome
  P.add('hullDark', KIT.torus(0.145, 0.013, 12), -0.70, 1.985, 0.05);
  periscope(P, 'hullDetail', -0.35, 1.95, 0.55);
  periscope(P, 'hullDetail', 0.30, 1.95, 0.60);
  antenna(P, -1.25, 1.99, -3.15, 0.88); antenna(P, 1.25, 1.99, -3.15, 0.82);
  // engine-deck intake ribs behind the glacis break + fillers + stowage
  for (let i = 0; i < 5; i++) P.add('hullDark', box(2.70, 0.016, 0.09), 0, 1.935, 0.55 - i * 0.24);
  P.add('hullDetail', cylY(0.09, 0.09, 0.03, 10), -1.15, 1.945, -1.55);        // fuel fillers
  P.add('hullDetail', cylY(0.09, 0.09, 0.03, 10), 1.15, 1.945, -1.55);
  P.add('hull', box(0.52, 0.16, 0.95), -1.30, 2.00, -2.45);                    // deck stowage boxes
  P.add('hull', box(0.52, 0.16, 0.95), 1.30, 2.00, -2.45);
  P.add('hullDark', box(0.53, 0.12, 0.024), -1.30, 2.02, -2.45);
  P.add('hullDark', box(0.53, 0.12, 0.024), 1.30, 2.02, -2.45);
  P.add('hullDark', box(3.0, 0.08, 0.05), 0, 1.30, -3.51);                     // rear rail
  // fixed MG box on the left front fender (KsP 58 pair)
  P.add('hull', box(0.24, 0.15, 0.60), -1.56, 1.44, 2.05);
  P.add('hullDark', cylZ(0.020, 0.24, 6), -1.62, 1.47, 2.40, 0, 0, 0);
  P.add('hullDark', cylZ(0.020, 0.24, 6), -1.52, 1.47, 2.40, 0, 0, 0);
  // headlights on glacis-side brackets
  KIT.headlight(P, -1.30, 1.15, 2.85, -0.30);
  KIT.headlight(P, 1.30, 1.15, 2.85, -0.30);
  liftEye(P, 'hullDetail', -1.55, 1.92, 0.75, 0.4); liftEye(P, 'hullDetail', 1.55, 1.92, 0.75, -0.4);
  // thin ribbed skirt band over the top run; wheels exposed below
  for (const s of [-1, 1]) {
    P.add('hull', box(0.05, 0.34, 5.85), s * 1.775, 1.10, 0.05);
    P.add('hullDark', box(0.02, 0.28, 5.8), s * 1.803, 1.08, 0.05);
    for (let k = 0; k < 8; k++) P.add('hullDetail', KIT.cylZ(0.02, 0.016, 8), s * 1.806, 0.99, -2.5 + k * 0.72, 0, s * Math.PI / 2, 0);
  }
  // dark bay walls close the see-through between skirt bottom and wheel tops
  // (r1 left/right views showed daylight through the wheel gaps). hullDark,
  // not hullShadow: the lab's mask pass skips /shadow/i-named meshes.
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.02, 0.72, 5.7), s * 1.27, 0.44, 0.1);
  }
  buildRunningGear(P, {
    style: 'rubber', dishR: 0.84, wheelR: 0.33, wheelW: 0.20, wheelY: 0.36, xc: 1.54,
    wheelZs: [2.00, 1.22, 0.44, -0.34],
    sprocket: { z: 2.92, y: 0.44, r: 0.30 }, idler: { z: -2.86, y: 0.44, r: 0.30 },
    rollers: [], trackW: 0.55, topY: 0.90, botY: 0.08, arms: true,
    coveredTop: true, deadSag: 0.035,
  });
  P.decal('hull', 'number', P.spec.visual.number || '103', 0.30, [1.76, 1.55, -1.6], Math.PI / 2, 0, 0);
  P.decal('hull', 'number', P.spec.visual.number || '103', 0.30, [-1.76, 1.55, -1.6], -Math.PI / 2, 0, 0);
  P.topY = 1.35;
}

export const CASEMATE_PROFILES = {
  strv103: { build: buildStrv103 },
  jagdtiger: { build: buildJagdtiger },
  jpz_e100: { build: buildJPzE100 },
  sturmtiger: { build: buildSturmtiger },
  t95: { build: buildT95 },
  isu152: { build: buildISU152 },
  isu122s: { build: buildISU122S },
};
