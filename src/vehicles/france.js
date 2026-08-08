// FRANCE lane (§5.38 owner priority wave, 2026-08-08) — self-contained
// modern3-style module: specs registered at import, builders exported.
// First resident: amx40 (AMX-40 export prototype — the KojfDiscord AW print
// at public/models/community-candidates/amx-40_armored_warfare.glb is the
// LOCAL-ONLY measurement reference; the playable is procedural).
// NOTE: leclerc/amx30/amx30b2 stay in profiles/misc.js (family migration
// is a separate, owner-approvable move).
//
// Registration pattern (modern3.js): tankFactory.js imports FRANCE_BUILDERS
// and merges it into BUILDERS at the marked extension hook; builders draw on
// tankFactory's exported geometry KIT. tankFactory <-> france is the same
// deliberate module cycle — KIT is only dereferenced INSIDE builder bodies
// (build time), never during module evaluation, so the TDZ is never hit.

import { KIT } from './tankFactory.js';
import { FITTINGS } from './profiles/kit.js';
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';

export const FRANCE_IDS = ['amx40'];

// ---------------------------------------------------------------------------
// Spec helpers — local mirrors of the specs.js plate/shell conventions
// (specs.js keeps them module-private; duplicated here per pack ownership —
// the modern3.js precedent).
// ---------------------------------------------------------------------------

function par(name, physicalMm, v0, v1, v3, o = {}) {
  const v2 = [v1[0] + v3[0] - v0[0], v1[1] + v3[1] - v0[1], v1[2] + v3[2] - v0[2]];
  return {
    name,
    verts: [v0, v1, v2, v3],
    physicalMm,
    keMm: o.keMm !== undefined ? o.keMm : physicalMm,
    ceMm: o.ceMm !== undefined ? o.ceMm : physicalMm,
    kind: o.kind || 'main',
    era: o.era || null,
    moduleLink: o.moduleLink || null,
    gunFollow: !!o.gunFollow,
  };
}
const fr = (name, mm, w, yB, zB, yT, zT, o) =>
  par(name, mm, [-w, yB, zB], [w, yB, zB], [-w, yT, zT], o);
const rr = (name, mm, w, yB, zB, yT, zT, o) =>
  par(name, mm, [w, yB, zB], [-w, yB, zB], [w, yT, zT], o);
const sR = (name, mm, xB, yB, xT, yT, zR, zF, o) =>
  par(name, mm, [xB, yB, zF], [xB, yB, zR], [xT, yT, zF], o);
const sL = (name, mm, xB, yB, xT, yT, zR, zF, o) =>
  par(name, mm, [-xB, yB, zR], [-xB, yB, zF], [-xT, yT, zR], o);
const rf = (name, mm, w, y, zR, zF, o) =>
  par(name, mm, [-w, y, zF], [w, y, zF], [-w, y, zR], o);
const chR = (name, mm, xIn, zIn, xOut, zOut, y0, y1, tb = 0, xi = 0, o) =>
  par(name, mm, [xIn, y0, zIn], [xOut, y0, zOut], [xIn - xi, y1, zIn - tb], o);
const chL = (name, mm, xIn, zIn, xOut, zOut, y0, y1, tb = 0, xi = 0, o) =>
  par(name, mm, [-xOut, y0, zOut], [-xIn, y0, zIn], [-xOut + xi, y1, zOut - tb], o);

const mbox = (module, min, max, turretLocal = false) => ({ module, min, max, turretLocal });
const cbox = (crew, min, max, turretLocal = false) => ({ crew, min, max, turretLocal });

const shell = (name, type, caliberMm, pen100Mm, pen1000Mm, dmg, velocityMps, extra) => ({
  name, type, caliberMm, pen100Mm, pen1000Mm, dmg, velocityMps,
  moduleDmg: caliberMm, tracer: type, ...(extra || {}),
});
// APFSDS pen curve anchored at the roster-quoted 2 km value (specs.js conv.)
const apfsdsPens = (quoted2km) => {
  const pen1000 = quoted2km / 0.90;
  return [Math.round(pen1000 / 0.91), Math.round(pen1000), quoted2km];
};
const BLOOM_MODERN = { move: 0.06, hullRot: 0.08, turret: 0.06, afterShot: 2.2 };

/** Parametric modern armor layout — the modern3.js mirror (see its JSDoc). */
function modernArmor(o) {
  const { hl, hw, inW, floor, trkTop, roofY, tw, tFrontZ, tRearZ, tH } = o;
  const tp = o.turretPivot;
  const A = (v) => ({ keMm: v[1], ceMm: v[2] });
  return {
    boundingRadiusM: hl + o.barrelLenM * 0.5 + 0.4,
    turretPivot: [tp[0], tp[1], tp[2]],
    gunPivot: [o.gunPivot[0], o.gunPivot[1], o.gunPivot[2]],
    gunBarrel: { lengthM: o.barrelLenM, radiusM: o.barrelRadM },
    hullPlates: [
      fr('upper_glacis', o.glacis[0], hw * 0.92, floor + (roofY - floor) * 0.4, hl * 0.98, roofY, hl * 0.35, A(o.glacis)),
      fr('lower_front', o.lower[0], hw * 0.9, floor, hl * 0.82, floor + (roofY - floor) * 0.4, hl * 0.98, A(o.lower)),
      sR('hull_side_upper_R', o.side[0], hw, trkTop, hw, roofY, -hl, hl * 0.5, A(o.side)),
      sL('hull_side_upper_L', o.side[0], hw, trkTop, hw, roofY, -hl, hl * 0.5, A(o.side)),
      sR('hull_side_lower_R', o.side[0], inW, floor, inW, trkTop, -hl * 0.95, hl * 0.9, A(o.side)),
      sL('hull_side_lower_L', o.side[0], inW, floor, inW, trkTop, -hl * 0.95, hl * 0.9, A(o.side)),
      ...(o.skirt ? [
        sR('skirt_R', o.skirt[0], hw + 0.02, trkTop * 0.55, hw + 0.02, trkTop + 0.15, -hl * 0.9, hl * 0.9,
          { kind: 'spaced', ...A(o.skirt) }),
        sL('skirt_L', o.skirt[0], hw + 0.02, trkTop * 0.55, hw + 0.02, trkTop + 0.15, -hl * 0.9, hl * 0.9,
          { kind: 'spaced', ...A(o.skirt) }),
      ] : []),
      sR('track_R', 20, hw * 0.86, 0.12, hw * 0.86, trkTop, -hl, hl, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 20, hw * 0.86, 0.12, hw * 0.86, trkTop, -hl, hl, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', o.rear, hw * 0.95, floor, -hl, roofY, -hl),
      rf('hull_roof', o.roof, hw * 0.95, roofY, -hl, hl * 0.35),
    ],
    turretPlates: [
      chR('turret_cheek_R', o.cheek[0], tw * 0.16, tFrontZ, tw, tFrontZ - tw * 0.72, 0.0, tH, tH * 0.12, 0, A(o.cheek)),
      chL('turret_cheek_L', o.cheek[0], tw * 0.16, tFrontZ, tw, tFrontZ - tw * 0.72, 0.0, tH, tH * 0.12, 0, A(o.cheek)),
      par('mantlet', o.mantlet[0],
        [-o.barrelRadM * 3.6, o.gunPivot[1] - 0.24, tFrontZ + 0.06],
        [o.barrelRadM * 3.6, o.gunPivot[1] - 0.24, tFrontZ + 0.06],
        [-o.barrelRadM * 3.6, o.gunPivot[1] + 0.24, tFrontZ + 0.03],
        { ...A(o.mantlet), gunFollow: true }),
      sR('turret_side_R', o.tSide[0], tw, 0.0, tw, tH, tRearZ, tFrontZ - tw * 0.7, A(o.tSide)),
      sL('turret_side_L', o.tSide[0], tw, 0.0, tw, tH, tRearZ, tFrontZ - tw * 0.7, A(o.tSide)),
      rr('turret_rear', o.tRear, tw * 0.95, 0.0, tRearZ, tH, tRearZ),
      rf('turret_roof', o.tRoof, tw, tH + 0.01, tRearZ, tFrontZ - tw * 0.7),
    ],
    modules: [
      mbox('engine', [-inW * 0.95, floor, -hl * 0.95], [inW * 0.95, roofY * 0.9, -hl * 0.5]),
      mbox('fuelTank', [-inW * 0.95, floor, -hl * 0.48], [inW * 0.95, roofY * 0.65, -hl * 0.25]),
      o.bustleAmmo
        ? mbox('ammoRack', [-tw * 0.7, 0.0, tRearZ], [tw * 0.7, tH * 0.8, tRearZ * 0.45], true)
        : mbox('ammoRack', [-inW * 0.85, floor, -hl * 0.18], [inW * 0.85, roofY * 0.55, hl * 0.28]),
      mbox('turretRing', [-tw * 0.85, roofY - 0.18, tp[2] - tw * 0.8], [tw * 0.85, roofY + 0.02, tp[2] + tw * 0.8]),
      mbox('radio', [-tw * 0.6, 0.05, tRearZ * 0.85], [-tw * 0.1, tH * 0.55, tRearZ * 0.45], true),
      mbox('optics', [tw * 0.2, tH * 0.55, tFrontZ * 0.3], [tw * 0.7, tH * 0.95, tFrontZ * 0.85], true),
      mbox('gun', [-o.barrelRadM * 2.4, o.gunPivot[1] - 0.22, -tw * 0.5], [o.barrelRadM * 2.4, o.gunPivot[1] + 0.26, tFrontZ], true),
      mbox('trackL', [-hw, 0, -hl], [-inW, trkTop, hl]),
      mbox('trackR', [inW, 0, -hl], [hw, trkTop, hl]),
    ],
    crew: [
      cbox('driver', [-inW * 0.75, floor + 0.15, hl * 0.5], [-inW * 0.05, roofY * 0.9, hl * 0.9]),
      cbox('gunner', [tw * 0.12, 0.02, -tw * 0.35], [tw * 0.75, tH * 0.85, tw * 0.45], true),
      cbox('commander', [tw * 0.12, 0.02, tRearZ * 0.6], [tw * 0.8, tH * 0.9, -tw * 0.35], true),
      ...(o.loader
        ? [cbox('loader', [-tw * 0.75, 0.02, -tw * 0.3], [-tw * 0.12, tH * 0.8, tw * 0.45], true)]
        : []),
    ],
  };
}

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
    dims: { hullLengthM: 6.8, overallLengthM: 10.04, widthM: 3.36, heightM: 2.38 },
    // Armor rig re-derived from the print extract (docs/references/vertex/
    // amx40.json — x/z read published-true; see the builder header): tall
    // hull (fore deck 1.658 / engine plateau 1.763), LOW wide welded turret
    // (walls ±1.345, roof 2.385), ring at the print's own authored pivot
    // z -0.26, gun axis world 1.94 with the trunnion at world z 1.30.
    armor: modernArmor({
      hl: 3.4, hw: 1.66, inW: 1.00, floor: 0.44, trkTop: 1.28, roofY: 1.66,
      turretPivot: [0, 1.60, -0.26], gunPivot: [0, 0.34, 1.56],
      barrelLenM: 5.34, barrelRadM: 0.075,
      // Export-proto protection: composite nose, welded steel/spaced turret —
      // a class under leclerc everywhere (§5.38 brief "slightly lighter").
      glacis: [80, 380, 480], lower: [60, 120, 150], side: [40, 60, 70],
      skirt: [15, 40, 120], rear: 30, roof: 30,
      tw: 1.34, tFrontZ: 1.79, tRearZ: -2.05, tH: 0.785,
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
// call time only (the tankFactory module-cycle law at the top of this file).
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
  const { box, cylY, cylZ, frustum, buildGun, buildRunningGear,
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
  segZ('hull', 2.00, 0.62, 0, 0.75, -3.38, 3.24);                               // tub x ±1.00, y 0.44..1.06
  segZ('hull', 3.22, 0.60, 0, 1.36, -3.36, 0.96);                               // sponson body x ±1.61, y 1.06..1.66
  P.add('hull', frustum(1.61, 1.50, 0.94, 1.61, 1.48, 0.94, 1.06, 1.62));       // fore-body course to the glacis crest (closes the sub-deck flank;
  P.add('hull', frustum(1.61, 2.06, 1.46, 1.61, 2.04, 1.46, 1.06, 1.62));       //   split at z 1.48 for the i9/i10 station windows)
  segZ('hull', 3.20, 0.045, 0, 1.636, -1.02, 2.06);                             // FORE DECK 1.658 (receipt cols 0.82..2.05)
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
  P.add('hull', slab(                                                           // beak face: upper lip (1.225, 3.30) -> lower jaw lip (1.048, 3.42)
    [-1.00, 1.048, 3.36], [1.00, 1.048, 3.36], [1.00, 1.048, 3.42], [-1.00, 1.048, 3.42],
    [-1.00, 1.225, 3.24], [1.00, 1.225, 3.24], [1.00, 1.225, 3.30], [-1.00, 1.225, 3.30]));
  for (const s of [-1, 1]) {
    P.add('hull', slab(                                                         // outer bow noses over the track lanes: front faces 3.41, crest
      [s * 1.61, 1.20, 3.398], [s * 1.00, 1.20, 3.398], [s * 1.00, 1.30, 3.22], [s * 1.61, 1.30, 3.22],
      [s * 1.61, 1.225, 3.398], [s * 1.00, 1.225, 3.398], [s * 1.00, 1.49, 3.24], [s * 1.61, 1.49, 3.24])); //   edge falling 1.49 -> 1.225 like the center line (r2: the r1 1.30
    P.add('hull', box(0.03, 0.17, 0.22), s * 1.595, 1.215, 3.295);              //   front edge read 1.387 at z 3.34 vs the ref 1.245)
    // bow-lane sponson filler: closes the 1.33..1.44 side slit between the
    // skirt top and the glacis underside over z 2.04..2.50 (§B2 — the far
    // side read through it). Bottom 1.27 = 2.5cm over the shoe-stack
    // envelope 1.245 (§B4 shoe-stack law).
    P.add('hull', box(0.30, 0.19, 0.46), s * 1.46, 1.365, 2.27);
  }
  P.add('hull', slab(                                                           // lower bow reverse plate: jaw lip (1.048, 3.42) -> belly (0.44, 2.72)
    [-1.00, 0.44, 2.70], [1.00, 0.44, 2.70], [1.00, 1.044, 3.40], [-1.00, 1.044, 3.40],
    [-1.00, 0.46, 2.72], [1.00, 0.46, 2.72], [1.00, 1.048, 3.42], [-1.00, 1.048, 3.42]));
  // stern: rear plate face -3.395 (the rear body-column anchor; receipt
  // plan rear -3.380/-3.403) + undercut wedge (bellyCorners 0.44 -> 0.599
  // @ -3.31 -> 0.70 lip @ -3.43)
  P.add('hull', box(3.10, 0.95, 0.09), 0, 1.17, -3.335);                        // rear plate y 0.695..1.645, face -3.380 (kit stands proud to -3.395)
  P.add('hull', slab(
    [-1.00, 0.44, -2.95], [1.00, 0.44, -2.95], [1.00, 0.44, -3.30], [-1.00, 0.44, -3.30],
    [-1.00, 0.62, -2.95], [1.00, 0.62, -2.95], [1.00, 0.70, -3.382], [-1.00, 0.70, -3.382]));
  // ---- skirts (FULL-LENGTH, the §D WIDTH ANCHOR ±1.68 = published 3.36;
  // §B4: inner faces 1.646 vs shoe reach 1.542). Receipt: hem 0.651, top
  // band 1.33, straight run to rear -3.27, raked-hem front panel rising
  // toward the idler (Object_16 front bots 0.756 -> 1.285, z 2.4..3.2).
  for (const s of [-1, 1]) {
    // r2 stations fix: the flat ±1.68 run read +2.6..3.7% width at every
    // slice (ref slice faces vary 1.61..1.675). Main run now sits at the
    // ref's 1.648 line; the published 3.36 width anchor rides TWO ±1.68
    // carrier bands (front panel + the mid module) like the print's own
    // widest bands (its i5/i12 slices).
    segZ('hull', 0.034, 0.68, s * 1.631, 0.99, -3.27, 2.35);                    // main run faces 1.614..1.648, y 0.65..1.33
    P.add('hull', box(0.034, 0.68, 0.244), s * 1.663, 0.99, -0.868);            // mid WIDTH-CARRIER module, faces to ±1.68 (z -0.99..-0.51 — the ref's
    P.add('hull', box(0.034, 0.68, 0.244), s * 1.663, 0.99, -0.636);            //   own wide band; ends outside the i4/i6 station windows)
    P.add('hull', slab(                                                         // front panel (±1.68 carrier): hem rises 0.65 -> 1.14 over the idler
      [s * 1.646, 0.65, 2.35], [s * 1.680, 0.65, 2.35], [s * 1.680, 1.14, 3.18], [s * 1.646, 1.14, 3.18],
      [s * 1.646, 1.33, 2.35], [s * 1.680, 1.33, 2.35], [s * 1.680, 1.33, 3.18], [s * 1.646, 1.33, 3.18]));
    for (let k = 0; k < 5; k++) P.add('hullDark', box(0.020, 0.60, 0.016), s * 1.640, 0.97, 1.85 - k * 1.04); // panel seams (2mm proud of the 1.648 face)
    P.add('hullRubber', box(0.28, 0.20, 0.028), s * 0.51, 1.10, 3.382);         // bow mud flaps INBOARD under the beak jaw (faces 3.396; the ref's own
                                                                                //   3.433 lip is the thin jaw class)
    P.add('hullRubber', box(0.30, 0.20, 0.028), s * 1.28, 0.86, -3.380);        // stern flaps, faces -3.394 (band 0.76..0.96 under the 12% filter)
    // skirt-top shadow seam + sponson-wall relief (three-depth-planes read)
    P.add('hullShadow', box(0.040, 0.03, 5.60), s * 1.632, 1.345, -0.46);
    P.add('hullShadow', box(0.016, 0.09, 5.27), s * 1.606, 1.60, -0.615);       // (z ≤ +2.02 — UNDER the deck line everywhere: the merged shadow
                                                                                //   bucket mesh is unnamed, so the gate mask READS it — r6 find: the
                                                                                //   full-length strip owned the bow tops at 1.645)
    // narrow fender strip at the deck lip (ref front cols 1.59-1.66 at
    // |x| 1.62-1.66 — its own proud fender edge; ≤0.48 segments)
    segZ('hull', 0.045, 0.030, s * 1.6225, 1.652, -3.27, 2.30);                 // x 1.60..1.645, top 1.667
  }
  // ---- running gear: 6 wheels behind the skirts, RAISED idler front +
  // sprocket rear (§B6 trapezoid; receipt wraps: front rise 0.28@2.68 ->
  // 0.76@3.18, rear 0.55@-3.17), ground contact ±2.30 ---------------------
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.36, wheelW: 0.24, wheelY: 0.44, xc: 1.29,
    wheelZs: [2.15, 1.29, 0.43, -0.43, -1.29, -2.15],
    // r2 gate ladder: smaller/higher end drums — the r1 0.27-0.28 drums at
    // y 0.55 dipped the wrap bottoms 0.2-0.35 UNDER the ref's visible wrap
    // lines (side_hull worst clusters z ±2.66..3.23 / -2.89..-3.11)
    sprocket: { z: -2.70, y: 0.67, r: 0.24 }, idler: { z: 2.72, y: 0.70, r: 0.28 },  // sprocket crest+shoes 1.04 — 2cm under the 1.06 sponson floor (§B4)
    rollers: [1.72, 0.43, -0.86, -1.98].map((z) => ({ z, y: 0.98, r: 0.07 })),
    trackW: 0.52, topY: 1.05, contactZF: 2.36, contactZR: -2.30,
    paintedEnds: true, coveredTop: true,
  });
  // near-black AO bay wall behind the wheel line (skirted-hull contrast)
  for (const s of [-1, 1]) {
    P.add('hullShadow', box(0.02, 1.00, 5.80), s * 1.01, 0.55, -0.05);
  }
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
    const cable = FITTINGS.towCable({ mats: P.mats, r: 0.019, seed: 7,
      pts: [[1.32, 1.672, 0.75], [1.365, 1.672, -0.25], [1.32, 1.71, -1.45]] });  // crowns ≤1.73 — 6cm under the 1.79 bustle sweep plane
    P.hullG.add(cable);
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 3, width: 0.50, seed: 9 });
    links.position.set(-1.08, 1.675, 1.62);                                     // outside the turret-core swept annulus (r 2.17 > 2.04 corner sweep)
    P.hullG.add(links);
  }
  for (const s of [-1, 1]) {
    P.add('hullDetail', torus(0.075, 0.015, 10), s * 0.55, 1.14, 3.295, Math.PI / 2, 0, 0); // bow tow eyes under the beak lip
    P.add('hullDetail', box(0.11, 0.05, 0.05), s * 0.55, 1.11, 3.265);
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
  P.add('hullDark', box(1.30, 0.36, 0.028), -0.55, 1.30, -3.3805);              // cooling exhaust grille, face -3.3945
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(1.26, 0.035, 0.030), -0.55, 1.185 + k * 0.078, -3.378);
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.16, 0.09, 0.035), s * 1.30, 1.55, -3.376);          // taillight clusters, faces ≤ -3.394
    P.add('hullDetail', box(0.18, 0.02, 0.045), s * 1.30, 1.61, -3.372);        // light guards
    P.add('hullDetail', box(0.09, 0.10, 0.040), s * 0.62, 0.95, -3.374);        // tow hooks
    P.add('hullDark', box(0.05, 0.06, 0.028), s * 0.62, 0.95, -3.380);
  }
  P.add('hullWood', box(0.28, 0.125, 0.036), 0.30, 0.8625, -3.376);             // jack block
  P.add('hullTrack', box(0.30, 0.16, 0.030), 1.05, 1.30, -3.379);               // hung spare links
  P.decal('hull', 'soot', null, 0.5, [-0.55, 1.30, -3.392], Math.PI);
  // French registration + the Satory demonstrator skirt branding
  P.decal('hull', 'number', '675 0102', 0.16, [0, 1.142, 3.368], 0, -0.60);       // on the leaning beak face (flush — decals are mask geometry)
  P.decal('hull', 'number', '675 0102', 0.22, [0.82, 1.30, -3.396], Math.PI);
  P.decal('hull', 'number', 'AMX 40', 0.32, [1.6815, 0.95, -0.75], Math.PI / 2);  // on the width-carrier module face (§D: decals are mask geometry —
  P.decal('hull', 'number', 'AMX 40', 0.32, [-1.6815, 0.95, -0.75], -Math.PI / 2); //  the i7 skirt-face seat read +2% station width)
  // ---- turret: LOW WIDE welded wedge authored off the receipt shell
  // curves (plan_turret_96 / side_turret_96 / turretZProfile). Ring pivot
  // at the print's own authored node origin z -0.26 (receipt registration
  // turretPivot [-0.001, 0.945, -0.257]); LOCAL = WORLD - [0, 1.60, -0.26].
  // Wall band world 1.70..2.385 (ring-recess bots 1.56); walls ±1.345;
  // front: flat nose plate x -0.82..+0.73 @ z_w 1.545 (near-vertical
  // rake), LEFT plate sweeps to the wall in ONE plane (the identity
  // face), RIGHT cheek in TWO facets; bustle rear right-deep (-2.31w
  // right / -2.23w left); roof plateau 2.385 raking to 2.32 at the tail.
  P.add('turret', cylY(1.00, 1.04, 0.10, P.q ? 24 : 14), 0, -0.045, 0.26);      // ring riser under the shell centroid (seals the recess seam, §B2)
  P.add('turret', box(1.90, 0.10, 2.28), 0, 0.01, 0.46);                        // ring-zone floor to the throat (world 1.56..1.66 — the print's recess bots; front face closes the under-throat slit)
  // face wedges (fronts = the real plates, one plane each; rears buried in
  // the core box). Bottom ring y_l 0.10 (world 1.70), top y_l 0.785 (roof).
  P.add('turret', slab(                                                         // NOSE PLATE x -0.82..+0.73: bottom edge z_w 1.545, top z_w 1.495
    [-0.82, 0.10, 1.805], [0.73, 0.10, 1.805], [0.73, 0.10, 1.18], [-0.82, 0.10, 1.18],
    [-0.82, 0.785, 1.755], [0.73, 0.785, 1.755], [0.73, 0.785, 1.18], [-0.82, 0.785, 1.18]));
  P.add('turret', slab(                                                         // LEFT CHEEK — the strongly-sloped identity plate (planar: top ring =
    [-1.345, 0.10, 1.42], [-0.82, 0.10, 1.805], [-0.82, 0.10, 1.18], [-1.345, 0.10, 1.18],
    [-1.345, 0.785, 1.37], [-0.82, 0.785, 1.755], [-0.82, 0.785, 1.18], [-1.345, 0.785, 1.18])); //   bottom ring shifted dz -0.05)
  P.add('turret', slab(                                                         // RIGHT CHEEK facet A: (+0.73, 1.545w) -> (+1.00, 1.315w)
    [0.73, 0.10, 1.805], [1.00, 0.10, 1.575], [1.00, 0.10, 1.10], [0.73, 0.10, 1.10],
    [0.73, 0.785, 1.755], [1.00, 0.785, 1.525], [1.00, 0.785, 1.10], [0.73, 0.785, 1.10]));
  P.add('turret', slab(                                                         // RIGHT CHEEK facet B: (+1.00, 1.315w) -> wall shoulder (+1.345, 0.975w)
    [1.00, 0.10, 1.575], [1.345, 0.10, 1.235], [1.345, 0.10, 1.00], [1.00, 0.10, 1.00],
    [1.00, 0.785, 1.525], [1.345, 0.785, 1.185], [1.345, 0.785, 1.00], [1.00, 0.785, 1.00]));
  P.add('turret', box(2.69, 0.685, 2.73), 0, 0.4425, -0.165);                   // core mass x ±1.345, y_l 0.10..0.785, z_l -1.53..+1.20 (right wall
                                                                                //   rear = world -1.79 — the ref's own right-wall stop line)
  // BUSTLE (r2 re-lay to the ref's STEPPED right rear: plan_96 rear jumps
  // -1.79 -> -2.06..-2.09 (x 1.04..1.13 shelf) -> -2.31/-2.38 center):
  P.add('turret', slab(                                                         // center bustle x ±1.04, rear -2.05L (world -2.31), roof raking to 2.32
    [-1.04, 0.19, -1.50], [1.04, 0.19, -1.50], [1.04, 0.23, -2.05], [-1.04, 0.23, -2.05],
    [-1.04, 0.785, -1.50], [1.04, 0.785, -1.50], [1.04, 0.72, -2.05], [-1.04, 0.72, -2.05]));
  P.add('turret', slab(                                                         // LEFT bustle wing, rear flat at world -2.23 (ref left corner line;
    [-1.345, 0.19, -1.48], [-1.04, 0.19, -1.50], [-1.04, 0.23, -1.97], [-1.345, 0.23, -1.97],
    [-1.345, 0.785, -1.48], [-1.04, 0.785, -1.50], [-1.04, 0.72, -1.97], [-1.345, 0.72, -1.97])); //   the print's Object_7 corner bulk lives inside this volume)
  P.add('turret', box(0.11, 0.53, 0.27), 1.085, 0.45, -1.665);                  // RIGHT shelf step (x 1.03..1.14, rear world -2.06 — the ref's shelf)
  P.add('turretDark', box(0.56, 0.30, 0.10), 0, 0.45, -2.06);                   // rear center rack bin (print rear rack to -2.38w at ±0.27)
  P.add('turretDetail', box(0.60, 0.035, 0.035), 0, 0.62, -2.10);               // its top rail (face world -2.378)
  // ---- flank stowage boxes (identity; print Object_8: outer ±1.53,
  // y 1.71..2.20, z_w -1.67..+0.63) — two modules per side with lid seams
  // + latches (§B3 equipment grammar) -------------------------------------
  for (const s of [-1, 1]) {
    P.add('turret', box(0.185, 0.49, 0.622), s * 1.4375, 0.355, 0.581);         // fwd module (outer face ±1.53), z_w -0.61..+0.63 — split in two
    P.add('turret', box(0.185, 0.49, 0.622), s * 1.4375, 0.355, -0.041);        //   (station windows always hold an end face)
    P.add('turret', box(0.185, 0.49, 0.472), s * 1.4375, 0.355, -0.646);        // aft module, z_w -1.61..-0.67 — split in two
    P.add('turret', box(0.185, 0.49, 0.472), s * 1.4375, 0.355, -1.114);
    P.add('turretDark', box(0.19, 0.016, 2.18), s * 1.44, 0.50, -0.21);         // lid seam line
    P.add('turretDark', box(0.19, 0.45, 0.018), s * 1.44, 0.35, -0.645);        // module gap seam
    for (const dz of [0.62, -0.10, -1.05]) P.add('turretDark', box(0.028, 0.11, 0.05), s * 1.532, 0.29, dz); // latches
    // cheek-flank rail panels (print Object_6: x ±1.26-1.29, y 1.93..2.32,
    // z_w 1.07..1.38) — thin applique standing off the cheeks on brackets
    P.add('turret', box(0.032, 0.36, 0.30), s * 1.272, 0.53, 1.485);
    P.add('turret', box(0.20, 0.10, 0.10), s * 1.16, 0.53, 1.42);               // tie bracket into the cheek face
  }
  P.add('turretDark', box(0.60, 0.016, 0.40), -1.00, 0.727, -1.72);             // left-wing roof hatch seam (the Object_7 corner reads via the wing mass)
  // ---- optics band — CAPPED AT 2.40 world (post-warp frame; the print's
  // 2.77 cupola / 3.09 pano tower compress onto this line under the filed
  // knee-2.39 plan). Every top ≤ 0.800 local. -----------------------------
  P.add('turret', box(0.44, 0.115, 0.50), 0.72, 0.7275, 1.18);                  // gunner sight box RIGHT-FRONT (print z_w 0.94..1.41, tops 2.39-2.41)
  P.add('turretDetail', box(0.48, 0.024, 0.54), 0.72, 0.788, 1.18);             // sight brow lid (top 2.400w)
  P.add('turretDark', box(0.36, 0.09, 0.03), 0.72, 0.725, 1.44);                // aperture doors
  P.add('turretGlass', box(0.28, 0.045, 0.018), 0.72, 0.72, 1.452);
  P.add('turretDark', box(0.02, 0.10, 0.48), 0.475, 0.725, 1.18);               // door seam
  P.add('turret', cylY(0.27, 0.285, 0.055, 16), -0.80, 0.7275, -0.29);          // commander cupola LEFT (print front cols -0.65..-1.17; side 2.77 dome zone z_w -0.74..-0.37)
  P.add('turret', cylY(0.235, 0.26, 0.040, 16), -0.80, 0.775, -0.29);           // cupola dome band (top 2.395w)
  for (let k = 0; k < 7; k++) {                                                 // episcope ring
    const a = (k / 7) * Math.PI * 2 - 0.45;
    P.add('turretDark', box(0.078, 0.038, 0.05), -0.80 + Math.cos(a) * 0.215, 0.756, -0.29 + Math.sin(a) * 0.215, 0, -a, 0);
  }
  P.add('turret', box(0.26, 0.05, 0.26), -0.10, 0.725, 0.13);                   // pano sight plinth, CENTER (print peak cols z_w -0.28..+0.01)
  P.add('turret', box(0.24, 0.115, 0.13), -0.10, 0.7425, 0.13);                 // pano head housing (top 2.400w — the capped datum line)
  P.add('turretDark', box(0.25, 0.020, 0.132), -0.10, 0.788, 0.13);             // head cap seam
  P.add('turretGlass', box(0.18, 0.05, 0.014), -0.10, 0.745, 0.202);            // pano window
  P.add('turret', cylY(0.225, 0.24, 0.030, 16), 0.62, 0.7775, -0.72);           // loader hatch RIGHT-REAR (top 2.3925w, 7mm proud ring)
  P.add('turretDark', box(0.30, 0.012, 0.032), 0.62, 0.7985, -0.72);
  periscope(P, 'turretDetail', 0.30, 0.76, -0.30);
  periscope(P, 'turretDetail', -0.42, 0.76, -0.75);
  // smoke banks on the BUSTLE FLANKS below the roof line (real AMX-40
  // arrangement — 3-tube clusters angled up-out; tube tips ≤ 2.29 world
  // so the roof plateau keeps heightM p95)
  {
    const smL = FITTINGS.smokeBank({ mats: P.mats, count: 3, r: 0.042, len: 0.24, splay: -0.75, pitch: -0.35, seed: 5 });
    smL.position.set(-1.38, 0.58, -1.55);
    P.turretG.add(smL);
    const smR = FITTINGS.smokeBank({ mats: P.mats, count: 3, r: 0.042, len: 0.24, splay: 0.75, pitch: -0.35, seed: 6 });
    smR.position.set(1.38, 0.58, -1.55);
    P.turretG.add(smR);
    // roof 7.62 AANF1 beside the cupola — LOW mount, FORWARD rest
    // (CROWS-forward law; type10 precedent: receiver at the published
    // height line so heightM p95 stays on the roof plateau)
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.9, seed: 12, elev: -0.03, ammo: true });
    mg.position.set(-0.46, 0.60, 0.30);                                         // receiver top ≈ 2.40w (r2: the 0.66 seat read heightM 2.45)
    P.turretG.add(mg);
    P.add('turret', box(0.10, 0.062, 0.10), -0.46, 0.755, 0.30);                // its recessed pedestal (buried into the roof)
    // antenna whips CLIPPED LOW over the aft roof, both raked hard aft
    // (type10 rack-tail precedent; the print's 4.14/5.10 vertical rod
    // masts live in the filed normalize plan — seats documented in the
    // packet). base:false + hand pots so the whole stack stays ≤ 2.398
    // world and heightM p95 keeps the roof plateau.
    const w1 = FITTINGS.antennaWhip({ mats: P.mats, h: 0.45, r: 0.012, rake: 1.52, seed: 4, base: false, rotation: [0, -Math.PI / 2, 0] });
    w1.position.set(-1.00, 0.772, -1.30);
    P.turretG.add(w1);
    const w2 = FITTINGS.antennaWhip({ mats: P.mats, h: 0.40, r: 0.012, rake: 1.50, seed: 5, base: false, rotation: [0, -Math.PI / 2, 0] });
    w2.position.set(0.72, 0.772, -1.26);
    P.turretG.add(w2);
    P.add('turretDark', cylY(0.035, 0.045, 0.055, 10), -1.00, 0.762, -1.30);    // whip base pots (buried into the aft roof rake)
    P.add('turretDark', cylY(0.035, 0.045, 0.055, 10), 0.72, 0.762, -1.26);
  }
  // REAR RACK framing the center bin on the bustle face (the print's own
  // rear-rack band: world -2.32..-2.41 at |x| ≤ ~0.4 — its bustle ROOF is
  // bare, so the roof stays the height datum). Rails face world -2.376.
  P.add('turretDetail', box(0.84, 0.032, 0.032), 0, 0.62, -2.10);               // top rail
  P.add('turretDetail', box(0.84, 0.032, 0.032), 0, 0.30, -2.10);               // bottom rail
  for (const vx of [-0.40, 0, 0.40]) P.add('turretDetail', box(0.028, 0.36, 0.028), vx, 0.46, -2.10); // posts
  P.add('turretCloth', box(0.50, 0.14, 0.10), 0.02, 0.68, -2.02);               // rolled tarp strapped on the bin lid (top 2.35w)
  P.add('turretDark', box(0.024, 0.15, 0.11), -0.14, 0.68, -2.02);              // cinch straps
  P.add('turretDark', box(0.024, 0.15, 0.11), 0.16, 0.68, -2.02);
  P.add('turretDark', box(0.26, 0.14, 0.09), 0.42, 0.53, -2.075);               // strapped pouch in the right basket bay (top 2.20w)
  P.add('turretDetail', box(0.27, 0.02, 0.095), 0.42, 0.585, -2.075);           // its lid lip
  P.decal('turret', 'number', '02', 0.26, [1.35, 0.40, -0.35], Math.PI / 2, 0, 0.02);
  P.decal('turret', 'number', '02', 0.26, [-1.35, 0.40, -0.35], -Math.PI / 2, 0, -0.02);
  // ---- mantlet + gun (§B3.1; receipt Object_15/5/2/14 cluster +
  // gunContour). Axis world 1.94 (turret-local +0.34); trunnion world z
  // 1.30 (gun-local 0). The PROMINENT full-height mantlet block: face
  // z_w 2.40, top chamfering toward the roof line. ------------------------
  // r2 plan-true mantlet steps: the ref's OUTER mantlet front sits at
  // ~1.96-2.06 world (plan cols x ±0.38..0.50: 1.978) with only the
  // CENTER course reaching the 2.39 face — the r1 full-width 2.28/2.40
  // fronts read +0.42 on four plan columns.
  P.addGunExtra(box(1.30, 0.60, 0.64), -0.05, 0.03, 0.34);                      // mantlet housing x -0.70..+0.60, y_w 1.67..2.27, z_w 1.32..1.96
  P.addGunExtra(slab(                                                           // housing crown chamfer (top 2.36w; at +20° the rear corner rises
    [-0.70, 0.33, 0.48], [0.60, 0.33, 0.48], [0.60, 0.33, 0.66], [-0.70, 0.33, 0.66],
    [-0.66, 0.42, 0.50], [0.56, 0.42, 0.50], [0.56, 0.42, 0.62], [-0.66, 0.42, 0.62])); //   AHEAD of the 1.545 nose face — open air, mantlet-over-roof class)
  P.addGunExtra(box(0.60, 0.52, 0.58), -0.05, 0.07, 0.81);                      // CENTER course x -0.35..+0.25 to the 2.40 face, crest 2.27 (the
                                                                                //   print's own 2.39 center-mantlet line, i11 station read)
  P.addGunExtraDark(box(0.46, 0.34, 0.05), -0.05, -0.02, 1.095);                // recessed embrasure shadow frame
  P.addGunExtra(cylZ(0.16, 0.34, P.q ? 18 : 12, 0.20), 0, 0, 1.22);             // cast cradle collar tapering to the tube (print Object_14: ±0.16, z_w 2.15..2.93)
  P.addGunExtraDark(cylZ(0.165, 0.05, P.q ? 18 : 12), 0, 0, 1.10);              // boot seam ring
  // LLLTV/thermal camera box on the mantlet LEFT (print Object_5:
  // x -0.91..-0.27, y 1.82..2.05, z_w 1.89..2.14) — §B3: lens + hood tells
  P.addGunExtra(box(0.62, 0.23, 0.24), -0.59, 0.0, 0.71);
  P.addGunExtraDark(box(0.20, 0.16, 0.03), -0.44, 0.0, 0.845);                  // camera window
  P.addGunExtraDark(cylZ(0.05, 0.05, 10), -0.70, 0.04, 0.85);                   // lens hood
  P.addGunExtra(box(0.18, 0.16, 0.42), -0.97, 0.0, 0.59);                       // LEFT bracket wing to x -1.06 (ref plan cols -0.95/-1.06: front 2.06-2.23)
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
  buildGun(P, { len: 5.34, r: 0.070, sleeve: false, evac: null, collar: false, baseR: 0.17 });
  // ELLIPTICAL sleeves (§B3.1 inscribed-drum class): the ref sleeve reads
  // r 0.121-0.131 VERTICAL but exits the x ±0.104 plan column at z 3.73 —
  // an x-flattened section. Side mask keeps the 0.128 band; plan stays
  // inside the tube columns (the r1 round cylinders lit x ±0.156 to 4.6).
  P.add('gun', xform(cylZ(0.128, 1.69, P.q ? 20 : 12), 0, 0, 0, 0, 0, 0, [0.80, 1, 1]), 0, 0, 2.475); // sleeve A (gun-local 1.63..3.32), xr 0.102
  P.add('gunDark', xform(cylZ(0.130, 0.05, P.q ? 20 : 12), 0, 0, 0, 0, 0, 0, [0.80, 1, 1]), 0, 0, 1.66);  // sleeve A rear clamp
  P.add('gunDark', xform(cylZ(0.130, 0.05, P.q ? 20 : 12), 0, 0, 0, 0, 0, 0, [0.80, 1, 1]), 0, 0, 3.29);  // sleeve A front clamp
  P.add('gun', xform(cylZ(0.110, 0.86, P.q ? 20 : 12), 0, 0, 0, 0, 0, 0, [0.90, 1, 1]), 0, 0, 4.63);  // sleeve B (4.20..5.06), xr 0.099
  P.add('gunDark', xform(cylZ(0.112, 0.045, P.q ? 20 : 12), 0, 0, 0, 0, 0, 0, [0.90, 1, 1]), 0, 0, 4.225); // sleeve B rear clamp
  P.add('gunDark', xform(cylZ(0.112, 0.045, P.q ? 20 : 12), 0, 0, 0, 0, 0, 0, [0.90, 1, 1]), 0, 0, 5.035); // sleeve B front clamp
  P.add('gun', cylZ(0.076, 0.24, P.q ? 18 : 12), 0, 0, 5.20);                   // muzzle collar run
  muzzleBore(P, 5.34, 0.076, 0.052, 14);                                        // §B3.1 bore; face world 6.64 = overall 10.04
  P.muzzleZ = 5.34;
  P.topY = 1.05;
}

export const FRANCE_BUILDERS = { amx40: buildAMX40 };
