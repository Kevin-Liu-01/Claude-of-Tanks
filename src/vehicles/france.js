// FRANCE lane (§5.38 owner priority wave, 2026-08-08) — self-contained
// modern3-style module: specs registered at import, builders exported.
// First resident: amx40 (AMX-40 export prototype — the KojfDiscord AW print
// at public/models/community-candidates/amx-40_armored_warfare.glb is a
// LOCAL-ONLY visual reference; the playable is our authored construction.
// NOTE: leclerc/amx30/amx30b2 stay in profiles/misc.js (family migration
// is a separate, owner-approvable move).
//
// Registration pattern (modern3.js): tankFactory.js passes FRANCE_BUILDERS
// through the checked factory-configuration gate; builders draw on
// tankFactoryCore's exported geometry KIT.

import { KIT } from './tankFactoryCore.js';
import { FITTINGS } from './profiles/kit.js';
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';
import { shell, apfsdsPenetration as apfsdsPens, modernArmor } from './specHelpers.js';

const BLOOM_MODERN = { move: 0.06, hullRot: 0.08, turret: 0.06, afterShot: 2.2 };

// ---------------------------------------------------------------------------
// Spec table
// ---------------------------------------------------------------------------

const FRANCE_SPECS = {
  amx40: {
    id: 'amx40', name: 'AMX-40', nation: 'France', era: 'modern', class: 'mbt',
    hp: 2000,
    // Export prototype (1983-85, 4 built): Poyaud V12X 1100 hp on 43.7 t —
    // leclerc-class mobility (§5.38 brief), lighter protection.
    enginePowerHp: 1100, weightTons: 43.7, topSpeedKmh: 70, reverseSpeedKmh: 22,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.4 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 40, gunPitchDegS: 30, gunElevationDeg: 20, gunDepressionDeg: 8,
    gun: {
      // GIAT CN120-25 120mm smoothbore, manual loader (4th crew member)
      caliberMm: 120, reloadS: 6.5, baseAccuracy: 0.30, aimTimeS: 1.9,
      bloom: BLOOM_MODERN,
      shells: [
        shell('OFL 120 F1 APFSDS', 'APFSDS', 120, apfsdsPens(460)[0], apfsdsPens(460)[1], 510, 1650, { pen2000Mm: apfsdsPens(460)[2] }),
        shell('OECC 120 F1 HEAT', 'HEAT', 120, 600, 600, 470, 1100),
        shell('OE 120 F1 HE', 'HE', 120, 45, 45, 560, 950),
      ],
    },
    // P95 combat envelope: 2.38 m is the welded roof datum; the mandatory
    // commander/gunner sight hierarchy owns the 2.62 m body datum while the
    // two thin antenna whips remain spike-exempt.
    dims: { hullLengthM: 6.8, overallLengthM: 10.04, widthM: 3.36, heightM: 2.62 },
    // Armor rig re-derived from the print extract (docs/references/vertex/
    // amx40.json — x/z read published-true; see the builder header): tall
    // hull (fore deck 1.658 / engine plateau 1.763), LOW wide welded turret
    // (walls ±1.345, roof 2.385), ring at the print's own authored pivot
    // z -0.26, gun axis world 1.94 with the trunnion at world z 1.30.
    armor: modernArmor({
      hl: 3.4, hw: 1.66, inW: 1.00, floor: 0.44, trkTop: 1.28, roofY: 1.66,
      // Source-exact articulation frame. The visual gun axis is world
      // [0,1.94,1.30], so the proxy and visible trunnion remain coupled.
      turretPivot: [-0.001, 1.545, -0.421],
      gunPivot: [0.001, 0.395, 1.721],
      barrelLenM: 5.322, barrelRadM: 0.075,
      // Export-proto protection: composite nose, welded steel/spaced turret —
      // a class under leclerc everywhere (§5.38 brief "slightly lighter").
      glacis: [80, 380, 480], lower: [60, 120, 150], side: [40, 60, 70],
      skirt: [15, 40, 120], rear: 30, roof: 30,
      tw: 1.55, tFrontZ: 1.96, tRearZ: -1.97, tH: 1.08,
      cheek: [420, 430, 620], tSide: [180, 200, 280], tRear: 45, tRoof: 35,
      mantlet: [320, 340, 430], loader: true, bustleAmmo: false,
    }),
    visual: {
      // Export-demonstrator sand (the Satory/Saumur AMX-40 look) — solid
      // desert monotone with dust weathering; black skirt branding decals.
      scheme: 'solid', base: '#96835a', weather: '#a4916a', patches: [],
      marking: 'number', number: '02', trackWidthM: 0.57, camoScale: 0.5,
    },
  },
};

// Register specs + model-source rows + garage roster ids (idempotent —
// vite HMR can re-evaluate this module).
for (const [id, spec] of Object.entries(FRANCE_SPECS)) {
  TANK_SPECS[id] = TANK_SPECS[id] || spec;
  MODEL_SOURCE[id] = MODEL_SOURCE[id] || { source: 'procedural' };
  if (!ALL_TANK_IDS.includes(id)) ALL_TANK_IDS.push(id);
}

// ---------------------------------------------------------------------------
// §C missing-side winding guard — face-outwardness census; re-orders reversed
// rings so mirrored slabs never ship inward-facing (FrontSide-culled) walls.
// Same device as modern3.js orientedSlab / uk.js sslab. KIT dereferenced at
// call time only.
// ---------------------------------------------------------------------------
function orientedSlab(b0, b1, b2, b3, t0, t1, t2, t3) {
  const c8 = [b0, b1, b2, b3, t0, t1, t2, t3];
  const cen = [0, 1, 2].map((k) => c8.reduce((s, p) => s + p[k], 0) / 8);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let outward = 0;
  for (const f of [[b0, b1, t1, t0], [b1, b2, t2, t1], [b2, b3, t3, t2],
    [b3, b0, t0, t3], [t0, t1, t2, t3], [b3, b2, b1, b0]]) {
    const n = cross(sub(f[1], f[0]), sub(f[2], f[0]));
    const fc = [0, 1, 2].map((k) => (f[0][k] + f[1][k] + f[2][k] + f[3][k]) / 4);
    if (dot(n, sub(fc, cen)) > 0) outward++;
  }
  return outward >= 3
    ? KIT.slab(b0, b1, b2, b3, t0, t1, t2, t3)
    : KIT.slab(b0, b3, b2, b1, t0, t3, t2, t1);
}

// §B3.1 MUZZLE BORE (modern3.js mirror — see its header note): open-ended
// outer wall to the face, inward recess funnel, near-black bore disc.
function muzzleBore(P, faceZ, R, boreR, seg = 14, rearR) {
  const { cylY, cylZ, torus, xform } = KIT;
  P.add('gun', xform(cylY(R, rearR ?? R, 0.042, seg, true), 0, 0, 0, Math.PI / 2, 0, 0), 0, 0, faceZ - 0.021);
  P.add('gunDark', xform(cylY(R - 0.003, boreR, 0.040, seg, true), 0, 0, 0, Math.PI / 2, 0, 0, [-1, 1, 1]), 0, 0, faceZ - 0.0215);
  P.add('gun', torus(R - 0.002, 0.0045, seg), 0, 0, faceZ - 0.001, -Math.PI / 2, 0, 0);
  P.add('gunDark', cylZ(boreR, 0.008, seg), 0, 0, faceZ - 0.034);
}

// =================================== AMX-40 =================================
// NEW BUILD r1, MEASURED RE-LAY (§5.38 owner priority: "fully model a custom
// amx40 based on this model using our strongest visual comparison and
// geometric comparison techniques"). Oracle: the KojfDiscord AW print
// (LOCAL-ONLY quarantine), registered as `amx40` in the three harness maps +
// the vertex REG; receipt docs/references/vertex/amx40.json (2026-08-08).
// PRINT FRAME (as-loaded, k 1.65 clamp): x/z read PUBLISHED-TRUE (width
// 3.353 / bodyLen 6.796 / overall 10.027) and the turret ROOF sits at the
// published 2.38 datum (plateau 2.385) — every line below is authored
// straight off the receipt curves. The ONLY stylization is the optics
// tower (cupola dome 2.77 / pano head 3.09 over z -0.75..+0.8) + two rod
// masts (4.14 @ [-1.0, -1.68], 5.10 @ [+0.72, +0.74]) above the published
// 2.38 height datum — the k2/t90m "RWS band" class (the real vehicle IS
// 3.08 to the sight head; published heightM rides the roof datum). Build
// follows the banked POST-WARP AUTHORING FRAME law (spz_puma packet note
// 2 / t90m batch-23 precedent): optics band capped at the 2.40 grace
// line (dims-true), masts as LOW raked whips at the print's own seats,
// and the y-knee normalize plan (knee 2.39) is FILED in
// docs/references/tanks/amx40.md for the orchestrator §E lane.
// Identity (photo class + print): tall long hull with a FLAT low bow
// platform (glacis plateau ~1.50), stepped REAR-RAISED engine deck
// (1.763 plateau falling 1.738 -> 1.658 fore deck), full-length skirts
// at ±1.68 (the §D width anchor), 6 wheels behind them + rear drive;
// LOW WIDE welded turret (walls ±1.345, roof 2.385) with an asymmetric
// plan-swept front (flat nose plate x -0.82..+0.73, the strongly-sloped
// front-LEFT plate sweeps to the wall in ONE plane, the right cheek in
// TWO facets), a PROMINENT full-height mantlet block (face z 2.40, top
// near the roof line), LLLTV camera box on the mantlet LEFT, 20mm F2
// coax tube on the RIGHT (x +0.39, to z 2.81), gunner sight box on the
// right roof, commander cupola LEFT + center panoramic sight, long
// stowage boxes on both turret flanks (±1.53), CN120-25 with thermal
// sleeve segments and NO bore evacuator (compressed-air scavenging —
// receipt gunContour r 0.131/0.121 sleeve, 0.063 bare gap, 0.076
// muzzle), roof 7.62 FORWARD on a LOW mount (type10 published-line
// precedent: a roof-standing MG owns heightM p95).
function buildAMX40(P) {
  const { box, cylX, cylY, cylZ, frustum, polyMultiLoft, buildGun, buildRunningGear,
    liftEye, periscope, torus, xform } = KIT;
  const slab = orientedSlab;                                                    // §C winding guard on every mirrored slab
  // ---- hull core (receipt side_hull / bellyCorners lines) ------------------
  // tub between the tracks: band inner faces ±1.03 (xc 1.29 - pad half
  // 0.26) -> tub ±1.00 (§B2 channel-pan clearance); belly 0.44 (print
  // center 0.456 / flanks 0.41).
  // STATION-SLICE SEGMENTATION (edge-on prism law, GEOMETRY-GATE): long
  // axis-aligned boxes present ONLY end caps to the 0.52m station slabs —
  // authored as butted segments at ≤0.48 pitch (strictly under the window,
  // so every slab holds a real cross-section face; 4mm laps kill z-fights).
  const segZ = (bucket, w, h, xc2, yc2, zLo, zHi) => {
    const n = Math.max(1, Math.ceil((zHi - zLo) / 0.48));
    const pitch = (zHi - zLo) / n;
    for (let k = 0; k < n; k++) {
      P.add(bucket, box(w, h, pitch + 0.004), xc2, yc2, zLo + (k + 0.5) * pitch);
    }
  };
  segZ('hull', 1.70, 0.62, 0, 0.75, -2.95, 2.70);                               // narrow belly tub between the two rising end courses
  for (const s of [-1, 1]) {                                                    // sloped belly shoulder lifts the ±0.92 channel columns
    const n = 12, z0 = -2.65, pitch = (2.64 - z0) / n;                          // both terminal shoulders stop outside the animated wraps
    for (let k = 0; k < n; k++) {
      const za = z0 + k * pitch, zb = z0 + (k + 1) * pitch + 0.004;
      P.add('hull', slab(
        [s * 0.85, 0.44, za], [s * 0.97, 0.67, za], [s * 0.97, 0.67, zb], [s * 0.85, 0.44, zb],
        [s * 0.85, 1.06, za], [s * 0.97, 1.06, za], [s * 0.97, 1.06, zb], [s * 0.85, 1.06, zb]));
    }
  }
  for (const s of [-1, 1]) P.add('hull', box(0.034, 0.10, 0.12), s * 0.93, 0.39, 0); // source belly-shoulder suspension rib at the inner shoe edge
  // The rear native sprocket shoes rise into the visual sponson line.  The
  // terminal course keeps its upper contour but lifts the structural floor
  // clear of that animated run; the full-depth body resumes ahead of it.
  segZ('hull', 3.22, 0.52, 0, 1.40, -3.36, -2.64);                              // rear sponson floor 1.14, above the shoe crown
  segZ('hull', 3.22, 0.60, 0, 1.36, -2.64, 0.96);                               // main sponson body x ±1.61, y 1.06..1.66
  P.add('hull', frustum(1.61, 1.50, 0.94, 1.61, 1.48, 0.94, 1.06, 1.62));       // fore-body course to the glacis crest (closes the sub-deck flank;
  P.add('hull', frustum(1.61, 2.06, 1.46, 1.61, 2.04, 1.46, 1.06, 1.62));       //   split at z 1.48 for the i9/i10 station windows)
  segZ('hull', 3.08, 0.045, 0, 1.636, -1.02, 2.06);                             // FORE DECK 1.658, inset behind the source's chamfered ±1.61 shoulder
  // ENGINE DECK (identity: REAR-RAISED, stepped): plateau 1.763 (receipt
  // -3.11..-2.32), low step 1.738 (-2.28..-1.72), ramp down to the fore
  // deck under the bustle.
  segZ('hull', 3.04, 0.10, 0, 1.713, -3.27, -2.28);                             // plateau course y 1.663..1.763 (flat to ±1.52)
  segZ('hull', 3.04, 0.075, 0, 1.7005, -2.28, -1.72);                           // step course y 1.663..1.738
  for (const s of [-1, 1]) {                                                    // deck side shoulders: chamfer 1.763/1.738 -> 1.663 at the ±1.61 edge
    P.add('hull', slab(                                                         //   (receipt front cols fall 1.75 -> 1.67 over |x| 1.55..1.66)
      [s * 1.52, 1.663, -2.28], [s * 1.61, 1.663, -2.28], [s * 1.61, 1.663, -3.27], [s * 1.52, 1.663, -3.27],
      [s * 1.52, 1.763, -2.28], [s * 1.605, 1.665, -2.28], [s * 1.605, 1.665, -3.27], [s * 1.52, 1.763, -3.27]));
    P.add('hull', slab(
      [s * 1.52, 1.663, -1.72], [s * 1.61, 1.663, -1.72], [s * 1.61, 1.663, -2.28], [s * 1.52, 1.663, -2.28],
      [s * 1.52, 1.738, -1.72], [s * 1.605, 1.665, -1.72], [s * 1.605, 1.665, -2.28], [s * 1.52, 1.738, -2.28]));
  }
  P.add('hull', slab(                                                           // ramp 1.738 -> 1.658 (one raked plane, §B1)
    [-1.61, 1.60, -1.02], [1.61, 1.60, -1.02], [1.61, 1.60, -1.72], [-1.61, 1.60, -1.72],
    [-1.61, 1.658, -1.05], [1.61, 1.658, -1.05], [1.61, 1.738, -1.72], [-1.61, 1.738, -1.72]));
  P.add('hull', slab(                                                           // stern chamfer lip: 1.662 @ -3.40 -> the 1.758 plateau edge @ -3.27
    [-1.52, 1.60, -3.24], [1.52, 1.60, -3.24], [1.52, 1.60, -3.38], [-1.52, 1.60, -3.38],
    [-1.52, 1.758, -3.27], [1.52, 1.758, -3.27], [1.52, 1.662, -3.40], [-1.52, 1.662, -3.40])); //   (±1.52 — the ref's stern corners stop at -3.27/-3.29 outboard)
  // ---- bow (receipt: deck 1.658 to z 2.06; upper glacis to the ~1.50 BOW
  // PLATFORM 2.50..3.26; nose chamfer to the 1.22/1.05 beak edge; lower
  // bow plate to the belly. §B1: each surface is ONE plane.) --------------
  P.add('hull', slab(                                                           // upper glacis (driver plate): (1.658, 2.06) -> (1.508, 2.50)
    [-1.61, 1.44, 2.04], [1.61, 1.44, 2.04], [1.61, 1.40, 2.48], [-1.61, 1.40, 2.48],
    [-1.61, 1.658, 2.06], [1.61, 1.658, 2.06], [1.61, 1.508, 2.50], [-1.61, 1.508, 2.50]));
  P.add('hull', slab(                                                           // bow platform, near-flat: (1.508, 2.50) -> (1.492, 3.26)
    [-1.61, 1.30, 2.50], [1.61, 1.30, 2.50], [1.61, 1.30, 3.24], [-1.61, 1.30, 3.24],
    [-1.61, 1.508, 2.50], [1.61, 1.508, 2.50], [1.61, 1.492, 3.26], [-1.61, 1.492, 3.26]));
  // UNDERBITE NOSE (r2, receipt truth): the upper lip sits BACK (plan
  // center 3.284 at y ~1.22) while the lower jaw runs FORWARD to 3.42
  // (bellyCorners rise 0.918@3.27 -> 1.056@3.43; side band 1.05..1.23 at
  // z 3.40) — the beak face leans forward going down. Outer bow noses
  // carry the 3.41 lane columns; nose chamfer crest falls 1.492 -> 1.225.
  P.add('hull', slab(                                                           // center nose chamfer: crest (1.492, 3.26) -> upper lip (1.225, 3.30)
    [-1.00, 1.10, 3.24], [1.00, 1.10, 3.24], [1.00, 1.10, 3.30], [-1.00, 1.10, 3.30],
    [-1.00, 1.492, 3.24], [1.00, 1.492, 3.24], [1.00, 1.225, 3.30], [-1.00, 1.225, 3.30]));
  P.add('hull', slab(                                                           // beak face: upper lip (1.225, 3.30) -> source lower-jaw lip (1.048, 3.43)
    [-1.00, 1.048, 3.37], [1.00, 1.048, 3.37], [1.00, 1.048, 3.43], [-1.00, 1.048, 3.43],
    [-1.00, 1.225, 3.24], [1.00, 1.225, 3.24], [1.00, 1.225, 3.30], [-1.00, 1.225, 3.30]));
  for (const s of [-1, 1]) {
    P.add('hull', slab(                                                         // outer bow noses over the track lanes: front faces 3.41, crest
      [s * 1.61, 1.20, 3.42], [s * 1.00, 1.20, 3.42], [s * 1.00, 1.30, 3.22], [s * 1.61, 1.30, 3.22],
      [s * 1.61, 1.225, 3.42], [s * 1.00, 1.225, 3.42], [s * 1.00, 1.49, 3.24], [s * 1.61, 1.49, 3.24])); //   edge falling 1.49 -> 1.225 like the center line (r2: the r1 1.30
    P.add('hull', box(0.03, 0.17, 0.22), s * 1.595, 1.215, 3.295);              //   front edge read 1.387 at z 3.34 vs the ref 1.245)
    // bow-lane sponson filler: closes the 1.33..1.44 side slit between the
    // skirt top and the glacis underside over z 2.04..2.50 (§B2 — the far
    // side read through it). Bottom 1.27 = 2.5cm over the shoe-stack
    // envelope 1.245 (§B4 shoe-stack law).
    P.add('hull', box(0.30, 0.19, 0.46), s * 1.46, 1.365, 2.27);
  }
  P.add('hull', slab(                                                           // lower bow reverse plate, shallow first course; inside native shoe lanes
    [-0.90, 0.44, 2.70], [0.90, 0.44, 2.70], [0.90, 0.61, 3.12], [-0.90, 0.61, 3.12],
    [-0.90, 0.46, 2.72], [0.90, 0.46, 2.72], [0.90, 0.63, 3.12], [-0.90, 0.63, 3.12]));
  P.add('hull', slab(                                                           // steep source knee into the jaw lip
    [-0.90, 0.61, 3.12], [0.90, 0.61, 3.12], [0.90, 1.044, 3.41], [-0.90, 1.044, 3.41],
    [-0.90, 0.63, 3.12], [0.90, 0.63, 3.12], [0.90, 1.048, 3.43], [-0.90, 1.048, 3.43]));
  // stern: rear plate face -3.395 (the rear body-column anchor; receipt
  // plan rear -3.380/-3.403) + undercut wedge (bellyCorners 0.44 -> 0.599
  // @ -3.31 -> 0.70 lip @ -3.43)
  P.add('hull', box(3.10, 0.95, 0.09), 0, 1.17, -3.335);                        // rear plate y 0.695..1.645, face -3.380
  P.add('hull', slab(
    [-0.90, 0.44, -2.95], [0.90, 0.44, -2.95], [0.90, 0.60, -3.30], [-0.90, 0.60, -3.30],
    [-0.90, 0.62, -2.95], [0.90, 0.62, -2.95], [0.90, 0.70, -3.382], [-0.90, 0.70, -3.382]));
  // ---- skirts (FULL-LENGTH, the §D WIDTH ANCHOR ±1.68 = published 3.36;
  // §B4: inner faces 1.646 vs shoe reach 1.542). Receipt: hem 0.651, top
  // band 1.33, straight run to rear -3.27, raked-hem front panel rising
  // toward the idler (Object_16 front bots 0.756 -> 1.285, z 2.4..3.2).
  const skirtBands = [                                                         // source station widths, rear -> bow shoulder
    [-3.27, -2.91, 1.639], [-2.91, -2.42, 1.639], [-2.42, -1.93, 1.653],
    [-1.93, -1.44, 1.656], [-1.44, -0.95, 1.646], [-0.95, -0.46, 1.646],
    [-0.46, 0.03, 1.646], [0.03, 0.52, 1.600], [0.52, 1.01, 1.643],
    [1.01, 1.50, 1.637], [1.50, 2.01, 1.590], [2.01, 2.35, 1.671],
  ];
  const skirtOuterAt = (z) => skirtBands.find(([lo, hi]) => z >= lo && z < hi)?.[2] ?? 1.648;
  for (const s of [-1, 1]) {
    // r2 stations fix: the flat ±1.68 run read +2.6..3.7% width at every
    // slice (ref slice faces vary 1.61..1.675). Main run now sits at the
    // ref's 1.648 line; the published 3.36 width anchor rides TWO ±1.68
    // carrier bands (front panel + the mid module) like the print's own
    // widest bands (its i5/i12 slices).
    // The source presents six large wheels under a shallow armor band.  The
    // old 0.65 m hem covered the tire shoulders and reduced each assembly to
    // a small lower arc, giving the correct count but the wrong mechanical
    // stance.  Keep the same authored panels and width datums, but lift their
    // lower edge to 0.76 m and shorten the panel height accordingly.
    for (const [lo, hi, outer] of skirtBands) P.add('hull', box(0.034, 0.57, hi - lo + 0.004), s * (outer - 0.017), 1.045, (lo + hi) / 2);
    P.add('hull', box(0.034, 0.57, 0.184), s * 1.633, 1.045, -0.828);           // visible skirt stays below the absolute-width carrier
    P.add('hull', box(0.034, 0.57, 0.184), s * 1.633, 1.045, -0.648);
    segZ('hull', 0.030, 0.040, s * 1.665, 0.76, -0.918, -0.558);               // low i5 published-width datum; segmented so the station slab sees a physical cross-section
    P.add('hull', slab(                                                         // front panel: high plate ends at the measured shoulder; a separate low datum owns published width
      [s * 1.580, 0.65, 2.35], [s * 1.610, 0.65, 2.35], [s * 1.610, 1.14, 3.18], [s * 1.580, 1.14, 3.18],
      [s * 1.580, 1.33, 2.35], [s * 1.610, 1.33, 2.35], [s * 1.610, 1.33, 3.18], [s * 1.580, 1.33, 3.18]));
    segZ('hull', 0.030, 0.040, s * 1.665, 0.76, 2.20, 3.20);                  // low i12/i13 published-width datum, continuous through both source stations
    for (let k = 0; k < 5; k++) P.add('hullDark', box(0.020, 0.60, 0.016), s * 1.640, 0.97, 1.85 - k * 1.04); // panel seams (2mm proud of the 1.648 face)
    P.add('hullRubber', box(0.28, 0.20, 0.028), s * 0.51, 1.10, 3.382);         // bow mud flaps INBOARD under the beak jaw (faces 3.396; the ref's own
                                                                                //   3.433 lip is the thin jaw class)
    P.add('hullRubber', box(0.30, 0.20, 0.028), s * 1.28, 0.86, -3.380);        // stern flaps, faces -3.394 (band 0.76..0.96 under the 12% filter)
    // skirt-top shadow seam + sponson-wall relief (three-depth-planes read)
    for (const [lo, hi, outer] of skirtBands) P.add('hullShadow', box(0.040, 0.03, hi - lo + 0.004), s * (outer - 0.020), 1.345, (lo + hi) / 2);
    P.add('hullShadow', box(0.016, 0.09, 5.27), s * 1.606, 1.56, -0.615);       // recessed sponson-wall relief under the deck line
                                                                                //   bucket mesh is unnamed, so the gate mask READS it — r6 find: the
                                                                                //   full-length strip owned the bow tops at 1.645)
    // narrow fender strip at the deck lip (ref front cols 1.59-1.66 at
    // |x| 1.62-1.66 — its own proud fender edge; ≤0.48 segments)
    for (const [lo, hi, outer] of skirtBands) {
      if (lo >= 2.35) continue;
      const end = Math.min(hi, 2.30);
      if (end > lo) P.add('hull', box(0.045, 0.030, end - lo + 0.004), s * (outer - 0.0525), 1.585, (lo + end) / 2);
    }
    for (let k = 0; k < 8; k++) {                                              // flush skirt/fender articulation; outer face remains exactly ±1.68
      const zh = -2.55 + k * 0.68;
      const outer = skirtOuterAt(zh);
      P.add('hullDark', box(0.008, 0.39, 0.022), s * (outer - 0.004), 1.035, zh); // panel break
      P.add('hullDetail', box(0.008, 0.07, 0.10), s * (outer - 0.004), 1.28, zh); // hinge/latch
    }
    for (const zh of [2.46, 2.76, 3.04]) P.add('hullDark', box(0.012, 0.045, 0.22), s * 1.605, 1.315, zh); // bow-fender edge breaks
  }
  P.add('hullDetail', box(0.06, 0.08, 0.22), -1.63, 1.64, -2.60);              // source left stern-fender shoulder cap, seated on the segmented lip
  // ---- running gear: 6 wheels behind the skirts, RAISED idler front +
  // sprocket rear (§B6 trapezoid; receipt wraps: front rise 0.28@2.68 ->
  // 0.76@3.18, rear 0.55@-3.17), ground contact ±2.30 ---------------------
  const amx40WheelZs = [2.15, 1.29, 0.43, -0.43, -1.29, -2.15];
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.36, wheelW: 0.24, wheelY: 0.49, xc: 1.27,
    wheelZs: amx40WheelZs,
    // r2 gate ladder: smaller/higher end drums — the r1 0.27-0.28 drums at
    // y 0.55 dipped the wrap bottoms 0.2-0.35 UNDER the ref's visible wrap
    // lines (side_hull worst clusters z ±2.66..3.23 / -2.89..-3.11)
    sprocket: { z: -2.70, y: 0.67, r: 0.24, trackR: 0.16 }, idler: { z: 2.72, y: 0.70, r: 0.28, trackR: 0.20 },
    rollers: [1.72, 0.43, -0.86, -1.98].map((z) => ({ z, y: 0.98, r: 0.07 })),
    trackW: 0.54, endRingSpan: 0.50, topY: 1.03, contactZF: 2.30, contactZR: -2.00,
    loopPoints: [
      [-2.70, 1.03], [2.72, 1.03], [2.86, 0.98], [3.00, 0.74],
      [2.96, 0.70], [2.72, 0.35], [2.48, 0.22], [2.35, 0.15], [2.23, 0.10],
      [-2.075, 0.10], [-2.314, 0.29], [-2.65, 0.47], [-3.00, 0.66],
      [-3.18, 0.76], [-3.02, 1.03],
    ],
    paintedEnds: true, coveredTop: true,
  });
  // Preserve the authored olive dish/hub/rim anatomy as layers of the one
  // suspension-driven road-wheel train. These used to be parked hull meshes
  // and separated from the real wheels over terrain.
  P.gear.addRoadWheelLayer(cylX(0.285, 0.032, 18), P.mats.detail,
    { outset: 1.565 - 1.27, name: 'gearRoadWheelOuterDishes' });
  P.gear.addRoadWheelLayer(cylX(0.095, 0.036, 14), P.mats.dark,
    { outset: 1.570 - 1.27, name: 'gearRoadWheelHubCaps' });
  P.gear.addRoadWheelLayer(torus(0.215, 0.013, 18).rotateZ(Math.PI / 2), P.mats.dark,
    { outset: 1.584 - 1.27, name: 'gearRoadWheelRimRings' });
  // ---- hull furniture ----
  P.add('hull', cylY(0.26, 0.26, 0.026, 16), -0.52, 1.652, 1.30);               // driver hatch (front-LEFT) on the fore deck
  P.add('hullDark', torus(0.26, 0.012, 16), -0.52, 1.663, 1.30);
  periscope(P, 'hullDetail', -0.70, 1.66, 1.56, -0.25);
  periscope(P, 'hullDetail', -0.52, 1.66, 1.60);
  periscope(P, 'hullDetail', -0.34, 1.66, 1.56, 0.25);
  for (const s of [-1, 1]) {                                                    // splash V on the upper glacis (flush, follows the rake; tops ≤1.58)
    P.add('hullDetail', box(0.62, 0.045, 0.05), s * 0.33, 1.545, 2.26, 0.33, s * 0.42, 0);
  }
  {
    const lcL = FITTINGS.lightCluster({ mats: P.mats, pods: 2, spacing: 0.14, rake: -0.20, seed: 3 });
    lcL.position.set(-1.30, 1.435, 3.06);                                       // lamps LOW on the bow platform (r2: pod+guard tops ≤1.49 — the r1
    P.hullG.add(lcL);                                                           //   1.60 tops owned four side cols over the ref's 1.47-1.53 line)
    const lcR = FITTINGS.lightCluster({ mats: P.mats, pods: 2, spacing: 0.14, rake: -0.20, seed: 4 });
    lcR.position.set(1.30, 1.435, 3.06);
    P.hullG.add(lcR);
    for (const s of [-1, 1]) {                                                 // source corner lamp seats and brows, embedded in the bow platform
      P.add('hullDetail', box(0.34, 0.075, 0.20), s * 1.30, 1.425, 3.045);
      P.add('hullDark', box(0.38, 0.035, 0.11), s * 1.30, 1.505, 3.045);
      P.add('hullDetail', box(0.035, 0.11, 0.22), s * 1.48, 1.455, 3.045);
    }
    const cable = FITTINGS.towCable({ mats: P.mats, r: 0.019, seed: 7,
      pts: [[1.32, 1.602, 0.75], [1.365, 1.602, -0.25], [1.32, 1.64, -1.45]] });  // cable is half-buried in its deck clips, as in the source print
    P.hullG.add(cable);
    const bowCable = FITTINGS.towCable({ mats: P.mats, r: 0.025, seed: 11,
      pts: [[-1.08, 1.49, 2.18], [-0.48, 1.43, 2.52], [0.48, 1.43, 2.52], [1.08, 1.49, 2.18]] });
    P.hullG.add(bowCable);
    for (const xc2 of [-1.08, -0.54, 0, 0.54, 1.08]) {
      const zc = Math.abs(xc2) > 0.9 ? 2.18 : 2.50;
      const yc = Math.abs(xc2) > 0.9 ? 1.485 : 1.425;
      P.add('hullDetail', box(0.12, 0.055, 0.10), xc2, yc, zc);                // cable saddle/clip keeps the route visibly load-bearing
      P.add('hullDark', box(0.045, 0.075, 0.12), xc2, yc + 0.025, zc);
    }
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 3, width: 0.50, seed: 9 });
    links.position.set(-1.08, 1.625, 1.62);                                     // outside the turret-core swept annulus (r 2.17 > 2.04 corner sweep)
    P.hullG.add(links);
  }
  for (const s of [-1, 1]) {
    P.add('hullDark', torus(0.095, 0.022, 12), s * 0.55, 1.14, 3.295, Math.PI / 2, 0, 0); // bow tow eyes under the beak lip
    P.add('hullDetail', box(0.15, 0.07, 0.07), s * 0.55, 1.11, 3.255);
    P.add('hullDetail', box(0.045, 0.20, 0.10), s * 0.67, 1.19, 3.22, 0, 0, s * 0.30); // clevis guards blend the eyes into the jaw
    P.add('hullDark', box(0.30, 0.035, 0.10), s * 1.23, 1.535, 2.83, 0, s * 0.08, 0); // lamp/tool relief on the upper bow
  }
  // lift eyes seated LOW (r2: the r1 rings topped 1.756/1.836 — +0.10 over
  // the ref's flat 1.658/1.754 deck lines on two cols per corner)
  liftEye(P, 'hullDetail', -1.38, 1.558, 1.10);
  liftEye(P, 'hullDetail', 1.38, 1.558, 1.10);
  liftEye(P, 'hullDetail', -1.45, 1.658, -3.05);
  liftEye(P, 'hullDetail', 1.45, 1.658, -3.05);
  // engine plateau furniture: intake mesh + louvre rows + filler caps
  P.add('hullDark', box(2.30, 0.018, 0.80), 0, 1.772, -2.72);
  if (P.q) for (let k = 0; k < 4; k++) P.add('hullDetail', box(2.20, 0.016, 0.05), 0, 1.776, -2.99 + k * 0.18);
  P.add('hullDark', box(1.80, 0.016, 0.42), 0, 1.747, -2.02);                   // step-course mesh field
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.085, 0.085, 0.018, 12), s * 1.15, 1.772, -2.42);
  P.add('hullDetail', box(0.30, 0.028, 0.38), -1.18, 1.769, -3.05);             // filler hump (top 1.783 — 2cm over the plateau)
  // pioneer tools on the fore-deck right lane
  P.add('hullWood', box(0.035, 0.025, 0.85), 1.10, 1.653, 0.45);                // shovel haft
  P.add('hullDetail', box(0.09, 0.02, 0.16), 1.10, 1.654, -0.02);               // shovel blade
  // rear plate furniture (§B3.2 — no blank walls). r4 length discipline:
  // plate face -3.380, every fitting PROUD only to the -3.395 line — the
  // rear mask signal stays at the plate class (the r1/r3 proud-kit union
  // kept handing hullLengthM an extra column: 6.91/6.92).
  P.add('hullDetail', box(3.00, 0.055, 0.045), 0, 1.67, -3.355);               // proud segmented transom cap / first depth plane
  for (const xc2 of [-1.18, -0.58, 0.08, 0.78, 1.26]) P.add('hullDark', box(0.030, 0.12, 0.040), xc2, 1.61, -3.360);
  P.add('hullDark', box(1.18, 0.40, 0.035), -0.72, 1.30, -3.368);              // unequal left exhaust field / second depth plane
  for (let k = 0; k < 6; k++) P.add('hullDetail', box(1.10, 0.025, 0.040), -0.72, 1.145 + k * 0.065, -3.372);
  P.add('hull', box(0.82, 0.42, 0.035), 0.52, 1.29, -3.368);                   // right access door stands separately from the grille
  P.add('hullDark', box(0.70, 0.025, 0.040), 0.52, 1.48, -3.372);
    P.add('hullDark', box(0.030, 0.34, 0.040), 0.12, 1.29, -3.372);
  for (const xc2 of [0.28, 0.72]) P.add('hullDetail', box(0.055, 0.10, 0.042), xc2, 1.25, -3.374); // door handles/latches survive rear camera
  for (let k = 0; k < 5; k++) P.add('hullDetail', box(0.72, 0.022, 0.042), 0.52, 1.17 + k * 0.065, -3.376); // right service-door louvre field
  P.add('hullDark', box(0.42, 0.20, 0.038), 1.10, 1.12, -3.374);               // outer transmission service cover
  for (const xc2 of [-1.38, -1.18, 0.98, 1.20, 1.40]) P.add('hullDetail', box(0.035, 0.24, 0.040), xc2, 1.10, -3.376); // full-width rear partition rhythm
  P.add('hullDark', box(2.78, 0.52, 0.010), 0, 1.34, -3.376);                  // near-full-height radiator/service field, still inside the source rear datum
  const rearBays = [[-0.98, 0.72, 0.00, 7], [-0.15, 0.82, 0.02, 8], [0.76, 0.82, -0.02, 7]];
  for (const [xc2, w, yo, count] of rearBays) {
    for (let k = 0; k < count; k++) {
      const sx = xc2 - w * 0.42 + (k / (count - 1)) * w * 0.84;
      P.add('hullDetail', box(0.026, 0.45 - (k % 3) * 0.018, 0.010), sx, 1.34 + yo, -3.383);
    }
    for (const yy of [1.15 + yo, 1.50 + yo]) P.add('hullDetail', box(w * 0.92, 0.018, 0.010), xc2, yy, -3.384);
  }
  for (const xc2 of [-1.39, -0.58, 0.31, 1.20]) P.add('hullDetail', box(0.030, 0.50, 0.010), xc2, 1.34, -3.384); // unequal service-bay dividers
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.20, 0.12, 0.040), s * 1.30, 1.50, -3.374);          // taillight clusters
    P.add('hullDetail', box(0.24, 0.025, 0.044), s * 1.30, 1.575, -3.376);      // light guards
    P.add('hullDetail', box(0.12, 0.15, 0.044), s * 0.68, 0.91, -3.376);        // tow clevises / third proud plane
    P.add('hullDark', torus(0.075, 0.018, 12), s * 0.68, 0.90, -3.368, Math.PI / 2);
    P.add('hullDetail', box(0.34, 0.055, 0.040), s * 1.15, 0.74, -3.374);       // lower recovery steps
  }
  P.add('hullWood', box(0.34, 0.15, 0.040), 0.18, 0.79, -3.374);               // jack block
  P.add('hullDetail', box(1.10, 0.055, 0.042), -0.18, 0.78, -3.372, 0, 0, 0.08); // lower recovery/tow bar
  P.add('hullDark', box(0.055, 0.34, 0.044), -0.86, 0.86, -3.373, 0, 0, -0.34); // unequal pipe/service drops
  P.add('hullDark', box(0.055, 0.29, 0.044), 0.78, 0.84, -3.373, 0, 0, 0.28);
  for (let k = 0; k < 3; k++) P.add('hullTrack', box(0.18, 0.18, 0.040), 1.00 + k * 0.19, 1.22, -3.375); // individually hung spare links
  P.decal('hull', 'soot', null, 0.5, [-0.55, 1.30, -3.392], Math.PI);
  // French registration + the Satory demonstrator skirt branding
  P.decal('hull', 'number', '675 0102', 0.16, [0, 1.142, 3.368], 0, -0.60);       // on the leaning beak face (flush — decals are mask geometry)
  P.decal('hull', 'number', '675 0102', 0.22, [0.82, 1.30, -3.396], Math.PI);
  P.decal('hull', 'number', 'AMX 40', 0.32, [1.62, 0.95, -0.75], Math.PI / 2);
  P.decal('hull', 'number', 'AMX 40', 0.32, [-1.62, 0.95, -0.75], -Math.PI / 2);
  // ---- turret: LOW WIDE welded wedge authored off the receipt shell
  // curves (plan_turret_96 / side_turret_96 / turretZProfile). Ring pivot
  // at the print's own authored node origin z -0.26 (receipt registration
  // turretPivot [-0.001, 0.945, -0.257]); LOCAL = WORLD - [0, 1.60, -0.26].
  // Wall band world 1.70..2.385 (ring-recess bots 1.56); walls ±1.345;
  // front: flat nose plate x -0.82..+0.73 @ z_w 1.545 (near-vertical
  // rake), LEFT plate sweeps to the wall in ONE plane (the identity
  // face), RIGHT cheek in TWO facets; bustle rear right-deep (-2.31w
  // right / -2.23w left); roof plateau 2.385 raking to 2.32 at the tail.
  P.add('turret', xform(cylY(1.00, 1.04, 0.10, P.q ? 24 : 14), 0, 0, 0, 0, 0, 0, [1, 1, 0.54]), 0, 0.015, 0.26); // oval ring riser, source plan depth
  P.add('turret', box(1.90, 0.14, 1.30), 0, 0.08, 0.35);                        // ring-zone throat bridges continuously into the raised low shell
  // Object_12 primary shell as one continuous loft. A twelve-sided base
  // follows the narrow nose, expanding cheeks, broad mid-body and tapered
  // aft shoulders; the 0.76 roof inset creates the source's materially
  // narrower crown without any course breaks or rectangular cabinets.
  // Three connected rings replace the former single long wall.  The old
  // two-ring loft jumped directly from the flared base to its tiny crown;
  // in shaded side/front views that made every segment read as one tall,
  // planar cabinet even though its plan trace was accurate.  This authored
  // shoulder ring keeps the broad AMX-40 cheek volume low, turns inward
  // progressively, and falls gently into the asymmetric rear lobes.  It is
  // a new repository-authored shell, not a sampled or converted source mesh.
  // The former 3.30 m plan stopped well inside the AMX-40's own authored
  // turret envelope and made the fighting compartment look undersized on
  // the long hull.  Carry the *connected shell* to the measured cheek and
  // rear-shoulder stations instead of trying to disguise the shortfall with
  // larger stowage boxes.  Width and crown height are deliberately unchanged:
  // this is the long, low welded AMX-40 turret, not a scaled-up cabinet.
  // Owner silhouette correction (2026-08-12): extend the connected fighting
  // compartment forward around the gun seat.  Moving only the mantlet or the
  // barrel would leave the characteristic long AMX-40 cheeks behind; these
  // first eight stations carry the actual crown, lower shoulder, side armor,
  // welds and attached forward cassettes into the new nose.  The aft half,
  // turret ring and height are unchanged.
  const amx40ShellPlan = [
    [-0.86, 1.98], [-0.20, 2.08], [0.38, 2.08], [0.80, 1.98], [1.10, 1.62],
    [1.34, 1.12], [1.39, 0.50], [1.39, -0.42], [1.34, -1.02],
    [1.25, -1.55], [0.88, -1.87], [0.36, -2.02], [-0.36, -2.04],
    [-0.86, -1.94], [-1.21, -1.66], [-1.36, -1.18], [-1.41, -0.44],
    [-1.39, 0.44], [-1.34, 1.08], [-1.08, 1.60],
  ];
  const shellBottom = amx40ShellPlan.map(([, z]) => {
    const aft = Math.max(0, Math.min(1, (1.30 - z) / 2.90));
    return 0.02 + aft * 0.15;
  });
  const shellShoulder = amx40ShellPlan.map(([x, z], i) => {
    const side = Math.min(1, Math.abs(x) / 1.35);
    const aft = Math.max(0, Math.min(1, (0.45 - z) / 2.10));
    return shellBottom[i] + 0.36 + side * 0.040 + aft * 0.020;
  });
  const shellCrown = amx40ShellPlan.map(([x, z]) => {
    const side = Math.min(1, Math.abs(x) / 1.35);
    const aft = Math.max(0, Math.min(1, (0.25 - z) / 2.00));
    return 0.585 + side * 0.070 + aft * 0.025;
  });
  const crownInset = amx40ShellPlan.map(([x, z]) => {
    const cheek = Math.max(0, Math.min(1, (z + 0.10) / 1.55));
    const side = Math.min(1, Math.abs(x) / 1.35);
    return 0.84 - cheek * 0.035 + side * 0.010;
  });
  P.add('turret', polyMultiLoft(amx40ShellPlan, [
    { height: shellBottom, inset: 1.00 },
    { height: shellShoulder, inset: 0.94 },
    { height: shellCrown, inset: crownInset },
  ]));
  P.add('turretDetail', box(0.025, 0.025, 2.78), -0.82, 0.612, -0.14, 0, 0.045, 0); // roof welds follow the lengthened connected crown
  P.add('turretDetail', box(0.025, 0.025, 2.72), 0.80, 0.607, -0.16, 0, -0.045, 0);
  P.add('turretDetail', slab(                                                   // source right nose rail peaks inboard and recedes toward x=1.0
    [0.45, 0.53, 1.65], [0.62, 0.53, 2.35], [1.00, 0.53, 1.65], [0.62, 0.53, 1.58],
    [0.45, 0.57, 1.65], [0.62, 0.57, 2.35], [1.00, 0.57, 1.65], [0.62, 0.57, 1.58]));
  // Roof hardware below provides the source's isolated height peaks; no
  // generic ridge is allowed to turn the station into a tall cabinet.
  // BUSTLE (r2 re-lay to the ref's STEPPED right rear: plan_96 rear jumps
  // -1.79 -> -2.06..-2.09 (x 1.04..1.13 shelf) -> -2.31/-2.38 center):
  P.add('turret', slab(                                                         // narrow center ammunition bustle
    [-0.20, 0.20, -1.50], [0.20, 0.20, -1.50], [0.20, 0.30, -1.91], [-0.20, 0.30, -1.91],
    [-0.20, 0.785, -1.50], [0.20, 0.785, -1.50], [0.20, 0.72, -1.91], [-0.20, 0.72, -1.91]));
  P.add('turret', slab(                                                         // left service/stowage lobe
    [-1.10, 0.20, -1.48], [-0.70, 0.20, -1.50], [-0.70, 0.25, -1.83], [-1.10, 0.25, -1.83],
    [-1.10, 0.785, -1.48], [-0.70, 0.785, -1.50], [-0.70, 0.74, -1.83], [-1.10, 0.74, -1.83]));
  P.add('turret', slab(                                                         // deeper right autoloader/service lobe
    [0.55, 0.20, -1.50], [1.10, 0.20, -1.50], [1.10, 0.30, -1.91], [0.55, 0.30, -1.91],
    [0.55, 0.785, -1.50], [1.10, 0.785, -1.50], [1.10, 0.73, -1.91], [0.55, 0.73, -1.91]));
  P.add('turretDark', box(0.56, 0.30, 0.10), 0, 0.45, -1.82);                   // rear center bin stays ahead of the thin terminal rail
  P.add('turretDetail', box(0.60, 0.035, 0.035), 0, 0.59, -1.97);               // source terminal recovery rail
  // ---- flank stowage boxes (identity; print Object_8: outer ±1.53,
  // y 1.71..2.20, z_w -1.67..+0.63) — two modules per side with lid seams
  // + latches (§B3 equipment grammar) -------------------------------------
  for (const s of [-1, 1]) {
    const innerTop = s > 0 ? 0.70 : 0.64;
    const flankModule = (zc, d, topF = innerTop, topR = innerTop, bottomF = 0.20, bottomR = 0.20) => {
      P.add('turret', slab(
      [s * 1.345, bottomF, zc + d / 2], [s * 1.49, bottomF, zc + d / 2], [s * 1.49, bottomR, zc - d / 2], [s * 1.345, bottomR, zc - d / 2],
      [s * 1.345, topF, zc + d / 2], [s * 1.49, 0.16, zc + d / 2], [s * 1.49, 0.16, zc - d / 2], [s * 1.345, topR, zc - d / 2]));
      P.add('turretDetail', slab(                                               // individually raised, slope-following compartment lid
        [s * 1.35, topF - 0.010, zc + d / 2 - 0.025], [s * 1.475, 0.155, zc + d / 2 - 0.025], [s * 1.475, 0.155, zc - d / 2 + 0.025], [s * 1.35, topR - 0.010, zc - d / 2 + 0.025],
        [s * 1.35, topF + 0.012, zc + d / 2 - 0.025], [s * 1.475, 0.177, zc + d / 2 - 0.025], [s * 1.475, 0.177, zc - d / 2 + 0.025], [s * 1.35, topR + 0.012, zc - d / 2 + 0.025]));
      // Individual lid lips and latch pairs preserve three visibly separate
      // Object_8 compartments instead of one two-metre black rectangle.
      P.add('turretDark', box(0.035, 0.020, d - 0.05), s * 1.465, 0.168, zc);
      P.add('turretDetail', box(0.022, 0.07, 0.045), s * 1.465, 0.18, zc + d * 0.23);
      P.add('turretDetail', box(0.022, 0.07, 0.045), s * 1.465, 0.18, zc - d * 0.23);
    };
    flankModule(1.02, 0.98);                                                    // forward cassette follows the extended cheek shoulder
    flankModule(0.08, 0.70);                                                    // center service cassette
    flankModule(-0.86, 1.08, innerTop, innerTop - 0.04, 0.12, 0.30);            // long tapered aft lobe follows the connected rear shoulder
    P.add('turretDetail', box(0.07, 0.20, 2.62), s * 1.42, 0.33, -0.15);       // source-height inner lid rail, seated below the full stowage course
    for (const dz of [0.45, -0.30, -1.02]) P.add('turretDark', box(0.08, 0.43, 0.016), s * 1.42, 0.35, dz); // narrow vertical compartment seams
    // cheek-flank rail panels (print Object_6: x ±1.26-1.29, y 1.93..2.32,
    // z_w 1.07..1.38) — thin applique standing off the cheeks on brackets
    P.add('turret', box(s < 0 ? 0.16 : 0.032, 0.36, 0.40), s * 1.272, s < 0 ? 0.62 : 0.52, 1.64);
    P.add('turret', box(0.20, 0.10, s < 0 ? 0.46 : 0.36), s * 1.16, s < 0 ? 0.66 : 0.48, s < 0 ? 1.70 : 1.65); // asymmetric source cheek ties
    if (s < 0) P.add('turret', box(0.18, 0.30, 0.14), -1.27, 0.73, 0.54);     // raised left cheek shoulder, rooted into the source's sloped crown course
    P.add('turretDetail', box(0.08, 0.30, 0.16), s * 1.49, 0.30, -1.44);        // low seated flank latch at the source outer silhouette
    if (s > 0) P.add('turretDetail', box(0.06, 0.06, 0.57), 1.39, 0.58, 0.335); // asymmetric inner flank rail, below the outer cassette lip
  }
  P.add('turretDark', box(0.60, 0.016, 0.40), -1.00, 0.727, -1.72);             // left-wing roof hatch seam (the Object_7 corner reads via the wing mass)
  // ---- optics band — CAPPED AT 2.40 world (post-warp frame; the print's
  // 2.77 cupola / 3.09 pano tower compress onto this line under the filed
  // knee-2.39 plan). Every top ≤ 0.800 local. -----------------------------
  P.addEquipment('turret', slab(                                                         // compact faceted gunner sight, Object_12 forward-right peak
    [0.57, 0.49, 1.14], [0.84, 0.49, 1.14], [0.84, 0.49, 1.41], [0.57, 0.49, 1.41],
    [0.61, 0.78, 1.16], [0.80, 0.78, 1.16], [0.80, 0.73, 1.39], [0.61, 0.73, 1.39]));
  P.add('turretDetail', box(0.30, 0.024, 0.28), 0.705, 0.792, 1.275);           // sight brow lid, continuously seated
  P.add('turretDark', box(0.20, 0.12, 0.025), 0.705, 0.67, 1.416);             // two-leaf aperture course
  P.add('turretGlass', box(0.075, 0.085, 0.018), 0.655, 0.67, 1.431);
  P.add('turretGlass', box(0.075, 0.085, 0.018), 0.755, 0.67, 1.431);
  P.add('turretDark', box(0.018, 0.15, 0.20), 0.565, 0.67, 1.28);              // door hinge/seam
  P.add('turretDetail', slab(                                                   // measured faceted right roof shoulder, rooted into the aft step
    [0.93, 0.55, -1.25], [1.29, 0.55, -1.25], [1.24, 0.55, -1.54], [0.93, 0.55, -1.54],
    [0.99, 0.82, -1.27], [1.20, 0.82, -1.27], [1.16, 0.78, -1.50], [0.99, 0.78, -1.50]));
  P.add('turretDetail', box(0.018, 0.58, 0.10), 1.04, 0.73, -1.40);            // low service blade carries the falling shoulder beside the single tall mast station
  P.add('turretDetail', slab(                                                   // aft service ridge reproduces the source's unequal rear roof peaks
    [-0.40, 0.70, -1.18], [-0.18, 0.70, -1.18], [-0.18, 0.70, -1.70], [-0.40, 0.70, -1.70],
    [-0.36, 0.74, -1.18], [-0.20, 0.74, -1.18], [-0.20, 0.87, -1.55], [-0.36, 0.87, -1.55]));
  for (const s of [-1, 1]) P.add('turretDetail', slab(                         // lower cheek ties follow the source's rising rear notch instead of forming a level hanging block
    [s * 1.14, 0.00, -0.39], [s * 1.26, 0.00, -0.39], [s * 1.26, 0.12, -0.55], [s * 1.14, 0.12, -0.55],
    [s * 1.14, 0.18, -0.39], [s * 1.26, 0.18, -0.39], [s * 1.26, 0.28, -0.55], [s * 1.14, 0.28, -0.55]));
  P.add('turretDetail', box(0.12, 0.14, 0.12), -0.32, 0.75, -1.35);            // low seated service pot; the adjacent narrow mast owns the height peak
  P.add('turretDetail', box(0.10, 0.11, 0.12), 0.18, 0.84, -0.48);             // source mid-aft hatch handle closes station 5 without broadening the crown
  P.add('turret', xform(cylY(0.48, 0.50, 0.060, 24), 0, 0, 0, 0, 0, 0, [1, 1, 0.68]), -0.80, 0.620, -0.162); // broad, flat collar physically bridges the crown to the dominant annulus
  P.add('turretDetail', xform(cylY(0.49, 0.50, 0.014, 24), 0, 0, 0, 0, 0, 0, [1, 1, 0.68]), -0.80, 0.657, -0.162); // low-contrast outer well lip
  P.add('turretDark', xform(torus(0.39, 0.010, 24), 0, 0, 0, 0, 0, 0, [1, 1, 0.68]), -0.80, 0.667, -0.162); // thin inner drainage seam, not a raised black rim
  P.add('turret', xform(cylY(0.36, 0.39, 0.030, 22), 0, 0, 0, 0, 0, 0, [1, 1, 0.65]), -0.80, 0.677, -0.162); // second stepped seat
  P.add('turret', xform(cylY(0.31, 0.325, 0.080, 22), 0, 0, 0, 0, 0, 0, [1, 1, 0.62]), -0.80, 0.730, -0.162); // low commander cupola, deliberately subordinate to its annulus
  P.add('turret', xform(cylY(0.285, 0.30, 0.035, 22), 0, 0, 0, 0, 0, 0, [1, 1, 0.62]), -0.80, 0.787, -0.162);
  P.add('turretDark', xform(torus(0.285, 0.010, 22), 0, 0, 0, 0, 0, 0, [1, 1, 0.62]), -0.80, 0.808, -0.162);
  P.add('turretDetail', box(0.13, 0.05, 0.12), -0.615, 0.780, -0.162);          // asymmetric hatch hinge closes the source cupola shoulder
  P.add('turretDetail', box(0.26, 0.14, 0.10), -0.58, 0.88, -0.05);            // broad low hatch handle bridges the main well shoulder
  P.add('turretDetail', box(0.18, 0.12, 0.10), -0.82, 0.86, 0.00);             // broad, low source hatch/periscope peak, fully seated on the main lid
  P.add('turretDark', box(0.14, 0.035, 0.012), -0.82, 0.885, 0.056);
  P.add('turretDetail', box(0.12, 0.10, 0.10), -0.96, 0.86, -0.30);            // commander-side periscope shoulder fills the source's left roof plateau
  for (let k = 0; k < 7; k++) {                                                 // episcope ring
    const a = (k / 7) * Math.PI * 2 - 0.45;
    P.add('turretDark', box(0.070, 0.038, 0.045), -0.80 + Math.cos(a) * 0.315, 0.696, -0.162 + Math.sin(a) * 0.185, 0, -a, 0);
  }
  P.add('turretDark', cylY(0.17, 0.19, 0.055, 14), -0.15, 0.625, 0.24);       // panoramic sight turntable seated on crown at the measured side-profile peak
  P.addEquipment('turret', box(0.24, 0.14, 0.32), -0.15, 0.690, 0.24);                  // pano plinth overlaps the welded roof
  P.add('turret', slab(
    [-0.25, 0.74, 0.08], [-0.08, 0.74, 0.08], [-0.08, 0.74, 0.40], [-0.25, 0.74, 0.40],
    [-0.23, 1.00, 0.10], [-0.10, 1.00, 0.10], [-0.10, 0.98, 0.38], [-0.23, 0.98, 0.38])); // compact faceted panoramic head
  P.add('turretDark', box(0.15, 0.020, 0.162), -0.16, 0.92, 0.24);             // head cap seam
  P.add('turretGlass', box(0.10, 0.10, 0.014), -0.16, 0.80, 0.327);            // pano window
  P.add('turretDetail', box(0.10, 0.08, 0.06), -0.17, 0.97, 0.21);             // asymmetric left optic brow, continuously seated on the head
  P.add('turretDetail', box(0.32, 0.09, 0.10), -0.24, 0.955, 0.24);            // source optic bridge, leaving the center drainage notch open
  P.add('turretDetail', box(0.095, 0.09, 0.10), 0.0125, 0.955, 0.24);
  P.add('turretDetail', box(0.32, 0.12, 0.36), -0.16, 0.82, 0.20);             // seated longitudinal optic carrier under the faceted panoramic head
  P.add('turretDetail', slab(                                                   // low right crown course under the receiver heads
    [0.08, 0.76, 0.08], [0.40, 0.76, 0.08], [0.40, 0.76, 0.18], [0.08, 0.76, 0.18],
    [0.08, 0.87, 0.08], [0.40, 0.85, 0.08], [0.40, 0.85, 0.18], [0.08, 0.87, 0.18]));
  P.add('turretDetail', slab(
    [0.40, 0.76, 0.08], [0.70, 0.76, 0.08], [0.70, 0.76, 0.18], [0.40, 0.76, 0.18],
    [0.40, 0.85, 0.08], [0.70, 0.87, 0.08], [0.70, 0.87, 0.18], [0.40, 0.85, 0.18]));
  P.add('turretDetail', slab(
    [0.70, 0.76, 0.08], [0.92, 0.76, 0.08], [0.92, 0.76, 0.18], [0.70, 0.76, 0.18],
    [0.70, 0.87, 0.08], [0.92, 0.84, 0.08], [0.92, 0.84, 0.18], [0.70, 0.87, 0.18]));
  P.add('turretDetail', slab(                                                   // raised left welded shoulder break at the source front contour
    [-1.20, 0.76, 0.08], [-1.05, 0.76, 0.08], [-1.05, 0.76, 0.18], [-1.20, 0.76, 0.18],
    [-1.20, 0.92, 0.08], [-1.05, 0.92, 0.08], [-1.05, 0.92, 0.18], [-1.20, 0.92, 0.18]));
  P.add('turret', cylY(0.22, 0.23, 0.075, 18), 0.62, 0.625, -0.72);             // smaller asymmetric secondary station, buried into the aft crown
  P.add('turretDark', torus(0.205, 0.012, 18), 0.62, 0.666, -0.72);            // loader hatch well
  P.add('turret', cylY(0.185, 0.195, 0.030, 18), 0.62, 0.681, -0.72);          // loader hatch RIGHT-REAR
  P.add('turretDark', box(0.22, 0.012, 0.028), 0.62, 0.700, -0.72);
  periscope(P, 'turretDetail', 0.30, 0.68, -0.30);
  periscope(P, 'turretDetail', -0.42, 0.64, -0.75);
  P.add('turretDetail', box(0.10, 0.18, 0.10), 0.30, 0.75, -0.47);             // source mid-roof peak
  P.add('turretDark', box(0.075, 0.035, 0.012), 0.30, 0.79, -0.414);
  // smoke banks on the BUSTLE FLANKS below the roof line (real AMX-40
  // arrangement — 3-tube clusters angled up-out; tube tips ≤ 2.29 world
  // so the roof plateau keeps heightM p95)
  {
    const smL = FITTINGS.smokeBank({ mats: P.mats, count: 6, r: 0.050, len: 0.31, splay: -0.68, pitch: -0.34, seed: 5 });
    smL.position.set(-1.13, 0.48, -0.45);
    P.turretG.add(smL);
    const smR = FITTINGS.smokeBank({ mats: P.mats, count: 6, r: 0.050, len: 0.31, splay: 0.68, pitch: -0.34, seed: 6 });
    smR.position.set(1.13, 0.48, -0.45);
    P.turretG.add(smR);
    // roof 7.62 AANF1 beside the cupola — LOW mount, FORWARD rest
    // (CROWS-forward law; type10 precedent: receiver at the published
    // height line so heightM p95 stays on the roof plateau)
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.9, seed: 12, elev: -0.03, ammo: true });
    mg.position.set(-0.46, 0.864, 0.30);                                        // re-seated on the owner-raised connected turret section
    P.turretG.add(mg);
    P.addEquipment('turret', box(0.12, 0.18, 0.12), -0.46, 0.84, 0.30);                 // continuous roof-to-receiver pedestal
    // antenna whips CLIPPED LOW over the aft roof, both raked hard aft
    // (type10 rack-tail precedent; the print's 4.14/5.10 vertical rod
    // masts live in the filed normalize plan — seats documented in the
    // packet). base:false + hand pots so the whole stack stays ≤ 2.398
    // world and heightM p95 keeps the roof plateau.
    P.add('turretDetail', cylY(0.006, 0.006, 0.52, 6), -1.00, 0.850, -1.38);   // source Object_24 aft mast peak, centered on the print's single side-profile station
    P.add('turretDetail', cylY(0.007, 0.007, 0.43, 6), 0.72, 0.987, 0.97);
    P.add('turretDetail', cylY(0.007, 0.007, 0.34, 6), 1.00, 0.942, 0.97);      // spike-exempt paired receiver masts
    P.add('turretDark', cylY(0.035, 0.045, 0.055, 10), -1.00, 0.762, -1.41);    // whip base pots at the source seats
    P.add('turretDark', cylY(0.035, 0.045, 0.055, 10), 0.72, 0.762, 0.97);
    P.add('turretDark', cylY(0.035, 0.045, 0.055, 10), 1.00, 0.762, 0.97);
  }
  // REAR RACK framing the center bin on the bustle face (the print's own
  // rear-rack band: world -2.32..-2.41 at |x| ≤ ~0.4 — its bustle ROOF is
  // bare, so the roof stays the height datum). Rails face world -2.376.
  P.add('turretDetail', box(0.60, 0.035, 0.032), 0, 0.59, -1.97);               // terminal recovery rail
  P.add('turretDetail', box(0.60, 0.032, 0.032), 0, 0.30, -1.92);               // inset bottom rail
  for (const vx of [-0.28, 0, 0.28]) P.add('turretDetail', box(0.028, 0.30, 0.028), vx, 0.43, -1.92); // inset posts
  P.add('turret', slab(                                                         // tapered terminal service panel closes the source rear-side envelope
    [-0.20, 0.12, -1.91], [0.20, 0.12, -1.91], [0.12, 0.60, -2.16], [-0.12, 0.60, -2.16],
    [-0.19, 0.82, -1.93], [0.19, 0.82, -1.93], [0.11, 0.61, -2.14], [-0.11, 0.61, -2.14]));
  for (const vx of [-0.08, 0, 0.08]) P.add('turretDetail', box(0.018, 0.015, 0.030), vx, 0.605, -2.145);
  P.add('turretCloth', box(0.50, 0.14, 0.10), 0.02, 0.68, -1.78);               // rolled tarp kept ahead of the terminal rail
  P.add('turretDark', box(0.024, 0.15, 0.11), -0.14, 0.68, -1.78);              // cinch straps
  P.add('turretDark', box(0.024, 0.15, 0.11), 0.16, 0.68, -1.78);
  P.add('turretDark', box(0.26, 0.14, 0.09), 0.42, 0.53, -1.82);                // strapped pouch in the right basket bay
  P.add('turretDetail', box(0.27, 0.02, 0.095), 0.42, 0.585, -1.82);            // its lid lip
  P.add('turret', slab(                                                         // Object_7 left-rear service bin, faceted into the aft shoulder
    [-1.13, 0.31, -1.77], [-0.63, 0.31, -1.55], [-0.67, 0.31, -1.65], [-1.09, 0.31, -1.90],
    [-1.06, 0.61, -1.79], [-0.70, 0.61, -1.57], [-0.73, 0.59, -1.67], [-1.02, 0.59, -1.89]));
  P.add('turretDark', box(0.34, 0.022, 0.105), -0.86, 0.612, -1.84);            // inset lid seam follows the tapered top
  for (const vx of [-1.02, -0.74]) P.add('turretDetail', box(0.035, 0.16, 0.115), vx, 0.44, -1.85);
  P.add('turret', slab(                                                         // asymmetric right autoloader service cover, no square terminal block
    [0.62, 0.31, -1.83], [1.05, 0.31, -1.83], [1.00, 0.31, -1.98], [0.67, 0.31, -1.98],
    [0.68, 0.58, -1.85], [0.99, 0.58, -1.85], [0.95, 0.55, -1.96], [0.72, 0.55, -1.96]));
  for (const vx of [0.72, 0.96]) P.add('turretDetail', box(0.030, 0.15, 0.115), vx, 0.44, -1.92);
  for (let k = 0; k < 3; k++) {
    P.add('turretDetail', box([0.31, 0.25, 0.34][k], 0.020, 0.105), -0.90 + k * 0.025, 0.39 + k * 0.075, -1.895);
    P.add('turretDetail', box([0.25, 0.31, 0.22][k], 0.020, 0.105), 0.82 - k * 0.018, 0.38 + k * 0.070, -1.965);
  }
  P.add('turretDark', box(0.035, 0.22, 0.105), -1.01, 0.46, -1.897, 0, 0, -0.28); // unequal diagonal service-face breaks
  P.add('turretDark', box(0.035, 0.18, 0.105), 0.95, 0.45, -1.968, 0, 0, 0.34);
  P.decal('turret', 'number', '02', 0.22, [1.28, 0.40, -0.35], Math.PI / 2, 0, 0.02);
  P.decal('turret', 'number', '02', 0.22, [-1.28, 0.40, -0.35], -Math.PI / 2, 0, -0.02);
  // ---- mantlet + gun (§B3.1; receipt Object_15/5/2/14 cluster +
  // gunContour). Axis world 1.94 (turret-local +0.34); trunnion world z
  // 1.30 (gun-local 0). The PROMINENT full-height mantlet block: face
  // z_w 2.40, top chamfering toward the roof line. ------------------------
  // r2 plan-true mantlet steps: the ref's OUTER mantlet front sits at
  // ~1.96-2.06 world (plan cols x ±0.38..0.50: 1.978) with only the
  // CENTER course reaching the 2.39 face — the r1 full-width 2.28/2.40
  // fronts read +0.42 on four plan columns.
  P.addGunExtra(slab(                                                           // source-height canted outer mantlet web; its soft facet encloses the oval tunnel without a rectangular shoulder block
    [-0.72, -0.22, 0.02], [0.62, -0.22, 0.02], [0.58, -0.25, 0.38], [-0.66, -0.25, 0.38],
    [-0.62, 0.43, 0.02], [0.54, 0.43, 0.02], [0.51, 0.29, 0.38], [-0.58, 0.29, 0.38]));
  P.addGunExtraDark(xform(cylZ(0.41, 0.035, P.q ? 22 : 16), 0, 0, 0, 0, 0, 0, [1.50, 0.56, 1]), -0.04, 0.02, 0.275); // deep oval recess behind the CN120 cradle
  P.addGunExtra(xform(cylZ(0.36, 0.20, P.q ? 20 : 14), 0, 0, 0, 0, 0, 0, [1.42, 0.64, 1]), -0.04, 0.02, 0.39); // rounded CN120 cradle transition
  P.addGunExtra(slab(                                                           // housing crown chamfer (top 2.36w; at +20° the rear corner rises
    [-0.70, 0.18, 0.18], [0.60, 0.18, 0.18], [0.60, 0.16, 0.38], [-0.70, 0.16, 0.38],
    [-0.66, 0.22, 0.18], [0.56, 0.22, 0.18], [0.56, 0.20, 0.38], [-0.66, 0.20, 0.38])); //   continuously seated over the compact housing)
  P.addGunExtra(slab(                                                           // narrow CENTER course: tall rear shoulder, fast forward taper
    [-0.19, -0.08, 0.50], [0.25, -0.08, 0.50], [0.25, -0.05, 0.65], [-0.19, -0.05, 0.65],
    [-0.19, 0.24, 0.50], [0.25, 0.24, 0.50], [0.25, 0.15, 0.65], [-0.19, 0.15, 0.65]));
  P.addGunExtra(slab(                                                           // compact forward face, lower line rises toward the tube
    [-0.19, -0.08, 0.65], [0.25, -0.08, 0.65], [0.25, -0.05, 1.10], [-0.19, -0.05, 1.10],
    [-0.19, 0.15, 0.65], [0.25, 0.15, 0.65], [0.25, 0.14, 1.10], [-0.19, 0.14, 1.10]));
  P.addGunExtra(slab(                                                           // short connector crown closes the 0.40..0.50 shoulder
    [-0.19, 0.14, 0.40], [0.25, 0.14, 0.40], [0.25, 0.14, 0.50], [-0.19, 0.14, 0.50],
    [-0.19, 0.14, 0.40], [0.25, 0.14, 0.40], [0.25, 0.13, 0.50], [-0.19, 0.13, 0.50]));
  {                                                                             // measured faceted crown over the center course
    const crownCourse = [[0.55, 0.15], [0.585, 0.35], [0.695, 0.45],
      [0.805, 0.25], [0.925, 0.16], [1.035, 0.14], [1.10, 0.14]];
    for (let i = 0; i < crownCourse.length - 1; i++) {
      const [z0, y0] = crownCourse[i], [z1, y1] = crownCourse[i + 1];
      P.addGunExtra(slab(
        [-0.19, 0.14, z0], [0.25, 0.14, z0], [0.25, 0.14, z1], [-0.19, 0.14, z1],
        [-0.19, y0, z0], [0.25, y0, z0], [0.25, y1, z1], [-0.19, y1, z1]));
    }
  }
  P.addGunExtra(xform(cylZ(0.32, 0.12, P.q ? 22 : 16), 0, 0, 0, 0, 0, 0, [1.45, 0.50, 1]), -0.05, 0.015, 0.96); // soft annular cheek continuation, vertically compressed to the source tunnel
  P.addGunExtraDark(xform(cylZ(0.255, 0.045, P.q ? 22 : 16), 0, 0, 0, 0, 0, 0, [1.45, 0.56, 1]), -0.05, 0.015, 1.035); // recessed oval gun tunnel, never a square mask
  P.addGunExtra(cylZ(0.15, 0.38, P.q ? 18 : 12, 0.17), 0.01, 0.01, 1.24);       // compact cast cradle collar tapering to the tube (print Object_14)
  P.addGunExtraDark(cylZ(0.18, 0.05, P.q ? 18 : 12), 0.01, 0, 1.10);            // boot seam ring
  P.addGunExtra(cylZ(0.16, 0.18, P.q ? 18 : 12), 0.03, 0, 1.58);               // asymmetric forward clamp shoulder
  P.addGunExtra(cylZ(0.16, 0.16, P.q ? 18 : 12), -0.03, 0, 0.72);              // shorter left trunnion shoulder
  // LLLTV/thermal camera box on the mantlet LEFT (print Object_5:
  // x -0.91..-0.27, y 1.82..2.05, z_w 1.89..2.14) — §B3: lens + hood tells
  P.addGunExtra(slab(                                                           // tapered LLLTV saddle: deep on the left, flush beside the mantlet
    [-0.90, -0.115, 0.42], [-0.28, -0.115, 0.42], [-0.28, -0.115, 0.55], [-0.90, -0.115, 1.00],
    [-0.90, 0.115, 0.42], [-0.28, 0.115, 0.42], [-0.28, 0.115, 0.55], [-0.90, 0.115, 1.00]));
  P.addGunExtraDark(box(0.20, 0.16, 0.03), -0.70, 0.0, 0.925);                 // camera window
  P.addGunExtraDark(cylZ(0.05, 0.05, 10), -0.78, 0.04, 0.94);                  // lens hood
  P.addGunExtra(box(0.18, 0.16, 0.66), -0.97, 0.0, 0.72);                       // LEFT bracket wing to x -1.06
  // 20mm F2 coax on the RIGHT (print Object_2: x +0.34..+0.44, r ~0.05,
  // to z_w 2.81) — the France-lane visible second barrel
  P.addGunExtra(box(0.14, 0.18, 0.30), 0.39, -0.02, 0.90);                      // coax housing slot
  P.addGunExtra(cylZ(0.030, 0.48, 10), 0.39, 0.0, 1.27);                        // 20mm barrel to z_w 2.81
  P.addGunExtraDark(cylZ(0.036, 0.07, 10), 0.39, 0.0, 1.475);                   // muzzle ring
  P.addGunExtraDark(cylZ(0.017, 0.02, 8), 0.39, 0.0, 1.505);                    // bore dot (§B3.1 pinhole)
  // CN120-25: NO bore evacuator (compressed-air scavenging — the receipt
  // shows a clean sleeve run). Core tube + sleeve segments to the receipt
  // contour: sleeve A r 0.125 (z_w 2.93..4.62), bare gap r 0.070
  // (4.62..5.50), sleeve B r 0.110 (5.50..6.36), muzzle r 0.076.
  buildGun(P, { len: 5.34, r: 0.100, sleeve: false, evac: null, collar: false, baseR: 0.17 });
  P.add('gun', box(0.58, 0.36, 0.14), -0.59, -0.08, 0.50);                     // armored camera saddle, continuous into the mantlet
  // Asymmetric thermal-shroud seam rails visible in the source plan view.
  // They are shallow, continuously seated on the tube and never exceed the
  // measured sleeve radius in side elevation.
  P.add('gun', box(0.14, 0.035, 1.70), 0.14, 0, 2.48);
  P.add('gun', box(0.14, 0.035, 0.82), -0.14, 0, 2.04);
  // Source-measured sleeve courses. The first thermal shroud has the
  // source's subtly oval 0.102 × 0.128 m section.
  P.add('gun', xform(cylZ(0.128, 1.69, P.q ? 20 : 12), 0, 0, 0, 0, 0, 0, [0.80, 1, 1]), 0, 0, 2.475); // sleeve A
  P.add('gunDark', xform(cylZ(0.130, 0.05, P.q ? 20 : 12), 0, 0, 0, 0, 0, 0, [0.80, 1, 1]), 0, 0, 1.66);
  P.add('gunDark', xform(cylZ(0.130, 0.05, P.q ? 20 : 12), 0, 0, 0, 0, 0, 0, [0.80, 1, 1]), 0, 0, 3.29);
  P.add('gun', xform(cylZ(0.110, 0.86, P.q ? 20 : 12), 0, 0, 0, 0, 0, 0, [0.90, 1, 1]), 0, 0, 4.63); // sleeve B
  P.add('gunDark', xform(cylZ(0.112, 0.045, P.q ? 20 : 12), 0, 0, 0, 0, 0, 0, [0.90, 1, 1]), 0, 0, 4.225);
  P.add('gunDark', xform(cylZ(0.112, 0.045, P.q ? 20 : 12), 0, 0, 0, 0, 0, 0, [0.90, 1, 1]), 0, 0, 5.035);
  P.add('gun', cylZ(0.100, 0.24, P.q ? 18 : 12), 0, 0, 5.20);                   // muzzle collar run
  muzzleBore(P, 5.34, 0.100, 0.060, 14);                                        // §B3.1 bore; face world 6.64 = overall 10.04
  P.muzzleZ = 5.34;
  // Owner silhouette correction (2026-08-12): the lengthened first-party
  // shell remained visibly too shallow in the elevated side/profile view.
  // Raise the COMPLETE connected fighting-compartment section by exactly
  // 20% in local Y. This includes the shell, cheek/stowage courses, bustle,
  // roof suite and articulated mantlet/cradle, but never stretches the hull
  // or cannon run. The two direct smoke fittings and roof MG are re-seated
  // above at the same 1.20 datum so yaw cannot expose a floating attachment.
  P.scaleBuckets(
    ['turret', 'turretDark', 'turretDetail', 'turretGlass', 'turretCloth',
      'gunMount', 'gunMountDark'],
    1, 1.20, 1,
  );
  P.topY = 1.26;
}

export const FRANCE_BUILDERS = { amx40: buildAMX40 };
