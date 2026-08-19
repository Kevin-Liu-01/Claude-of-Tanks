// Swedish armored family.
//
// The owner-supplied Strv 103B, Strv 81 and Strv 122 GLBs are fixed
// visual/metric oracles only. Runtime geometry remains first-party procedural.
// Each build preserves its donor hull and single suspension-driven native
// course, then adds supported Swedish armor, equipment and gun-station cues.

import { KIT, FITTINGS, orientedSlab, muzzleBore } from './kit.js';
import { buildStrv103 } from './casemate.js';
import { centurionBuild } from './uk.js';
import { buildLeo2A5 } from './leopard.js';
import { addVehicleGhillieSuit } from '../ghillieSuit.js';

function mount(P, owner, fitting, x, y, z, rotation = null) {
  fitting.position.set(x, y, z);
  if (rotation) fitting.rotation.set(rotation[0], rotation[1], rotation[2]);
  (owner === 'hull' ? P.hullG : P.turretG).add(fitting);
}

function plate(P, owner, x, y, z, w, h, d, rotation = null, darkCap = true) {
  const r = rotation || [0, 0, 0];
  const bucket = owner === 'hull' ? 'hull' : 'turret';
  const detail = owner === 'hull' ? 'hullDark' : 'turretDark';
  P.add(bucket, KIT.box(w, h, d), x, y, z, r[0], r[1], r[2]);
  if (darkCap) P.add(detail, KIT.box(w * 0.72, 0.016, Math.max(0.025, d * 0.08)),
    x, y + h * 0.5 + 0.009, z + d * 0.24, r[0], r[1], r[2]);
}

function addSwedishRadioPair(P, owner, y, z, seed) {
  for (const side of [-1, 1]) {
    const x = side * 0.96;
    P.add(owner === 'hull' ? 'hullDetail' : 'turretDetail',
      KIT.cylY(0.036, 0.046, 0.06, 10), x, y, z);
    mount(P, owner, FITTINGS.antennaWhip({
      mats: P.mats, h: side < 0 ? 0.82 : 0.68, r: 0.012,
      rake: -side * 0.045, seed: seed + (side > 0 ? 1 : 0),
    }), x, y + 0.02, z);
  }
}

function addStrv103BOraclePackage(P) {
  const { box, cylY } = KIT;

  // Source-defining nose protection screen. Two horizontal carriers are
  // planted into the folded dozer/glacis shoulders; the short verticals join
  // them, so the array reads as one supported cage rather than loose rods.
  for (const y of [1.42, 1.78]) {
    P.add('hullDetail', box(2.68, 0.035, 0.035), 0, y, 2.58);
  }
  for (let i = 0; i < 11; i++) {
    const x = -1.25 + i * 0.25;
    P.add('hullDetail', box(0.030, 0.39, 0.030), x, 1.60, 2.58,
      0, 0, (i - 5) * 0.018);
  }
  for (const side of [-1, 1]) {
    P.add('hullDark', box(0.10, 0.34, 0.12), side * 1.30, 1.60, 2.54);
    // Additional flank service/armor boxes overlap the intact upper hull and
    // stop well above the four-wheel smart course.
    plate(P, 'hull', side * 1.70, 1.48, -0.62, 0.12, 0.42, 0.72,
      [0, 0, side * 0.035], false);
    plate(P, 'hull', side * 1.70, 1.48, -1.40, 0.12, 0.42, 0.66,
      [0, 0, side * 0.035], false);
  }

  // Compact commander station, shielded Ksp 58 and optical crown echo the
  // supplied 103B roof without creating a fake articulating turret.
  P.add('hull', cylY(0.24, 0.26, 0.075, 16), 0.38, 1.96, -0.26);
  P.add('hullDark', KIT.torus(0.235, 0.014, 16), 0.38, 2.01, -0.26);
  mount(P, 'hull', FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.78,
    elev: 0.07, shield: true, ammo: true, seed: 10320,
  }), 0.38, 1.98, -0.26, [0, 0.04, 0]);
  P.add('hull', box(0.32, 0.25, 0.28), -0.45, 1.96, -0.22);
  P.add('hullGlass', box(0.18, 0.095, 0.022), -0.45, 1.98, -0.06);
  addSwedishRadioPair(P, 'hull', 1.86, -1.82, 10330);

  mount(P, 'hull', FITTINGS.stowageRack({
    mats: P.mats, w: 1.55, d: 0.44, h: 0.25, fill: 0.42, rails: 3, seed: 10340,
  }), 0, 1.83, -2.42);
  P.decal('hull', 'number', '103B', 0.28, [-1.76, 1.52, -1.22], -Math.PI / 2);
}

function buildStrv103B(P) {
  buildStrv103(P);
  addStrv103BOraclePackage(P);
  addVehicleGhillieSuit(P);
}

function addStrv81Package(P) {
  const { box, cylX, cylY, cylZ } = KIT;
  const slab = orientedSlab;

  // Re-form the inherited vertical Centurion box into the oracle's low cast
  // shell. This closed loft overlaps the ring, cheek field and rear body;
  // its narrowed crown produces real sloping armor instead of a flat lid.
  P.add('turret', slab(
    [-1.10, 0.24, 1.20], [1.10, 0.24, 1.20],
    [1.23, 0.26, -1.55], [-1.23, 0.26, -1.55],
    [-0.78, 0.81, 0.95], [0.78, 0.81, 0.95],
    [0.98, 0.78, -1.40], [-0.98, 0.78, -1.40]));
  // Unequal crown plates follow the cast slopes and create the broken roof
  // cadence visible on the supplied Strv 81 rather than one broad rectangle.
  P.add('turret', box(0.74, 0.055, 0.58), -0.39, 0.825, -0.52, 0, -0.08, 0);
  P.add('turret', box(0.58, 0.050, 0.50), 0.39, 0.817, -0.45, 0, 0.10, 0);
  P.add('turretDark', box(0.46, 0.016, 0.08), 0.39, 0.850, -0.18, 0, 0.10, 0);

  // Swedish cheek continuations broaden the inherited Centurion casting but
  // bury into its nose/crown on every edge. They are low, rounded armor
  // shoulders rather than a second turret shell.
  for (const side of [-1, 1]) {
    P.add('turret', slab(
      [side * 0.42, -0.20, 1.36], [side * 1.02, -0.20, 1.03],
      [side * 1.18, -0.18, 0.46], [side * 0.66, -0.18, 0.66],
      [side * 0.40, 0.42, 1.30], [side * 0.94, 0.51, 0.98],
      [side * 1.08, 0.56, 0.44], [side * 0.62, 0.50, 0.62]));
    for (let i = 0; i < 3; i++) {
      plate(P, 'turret', side * 1.10, 0.30 + i * 0.025, 0.28 - i * 0.47,
        0.14, 0.34, 0.38, [0, 0, side * 0.08], false);
    }

    // Hull-side applique stays above the wheel tops and is visibly seated on
    // the original full-length skirt/fender architecture.
    for (let i = 0; i < 5; i++) {
      plate(P, 'hull', side * 1.675, 1.11, 1.62 - i * 1.02,
        0.045, 0.42, 0.84, [0, 0, side * 0.018], false);
    }
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 5, r: 0.041, len: 0.27,
      splay: side * 1.00, pitch: -0.42, arc: 0.52,
      slot: 'detail', seed: 8100 + (side > 0 ? 1 : 0),
    }), side * 1.03, 0.55, 0.10);
  }

  // Low Swedish commander cupola, Ksp 58 and twin radio cadence.
  P.add('turret', cylY(0.27, 0.29, 0.08, 18), -0.47, 0.93, -0.52);
  P.add('turretDark', KIT.torus(0.26, 0.014, 18), -0.47, 0.98, -0.52);
  mount(P, 'turret', FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.80,
    elev: 0.08, shield: true, ammo: true, seed: 8120,
  }), -0.47, 0.94, -0.52, [0, -0.05, 0]);
  P.add('turret', box(0.34, 0.09, 0.32), 0.47, 0.91, -0.36);
  P.add('turretDetail', cylY(0.12, 0.14, 0.25, 14), 0.47, 1.06, -0.36);
  P.add('turretGlass', box(0.16, 0.085, 0.022), 0.47, 1.07, -0.20);
  // The source's large side ventilator/search housing is a strong profile
  // landmark. Both concentric drums are buried into the cast side wall.
  P.add('turret', cylX(0.21, 0.18, 18, 0.15), 1.13, 0.48, -0.64);
  P.add('turretDark', cylX(0.155, 0.035, 18, 0.12), 1.225, 0.48, -0.64);
  for (let i = 0; i < 6; i++) {
    P.add('turretDetail', box(0.030, 0.22, 0.035), 1.247,
      0.48, -0.64, 0, 0, i * Math.PI / 3);
  }
  addSwedishRadioPair(P, 'turret', 0.78, -1.66, 8130);

  // Periscope cadence and hull lighting keep the early Swedish vehicle
  // mechanically legible at garage distance without inflating its roof.
  for (const [x, z, ry] of [
    [-0.72, -0.40, 0.18], [-0.66, -0.16, 0.08], [-0.43, -0.10, -0.08],
    [0.28, -0.16, 0.10], [0.54, -0.20, -0.16],
  ]) {
    P.add('turretDetail', box(0.13, 0.045, 0.075), x, 0.93, z, 0, ry, 0);
    P.add('turretGlass', box(0.092, 0.022, 0.014), x, 0.956, z + 0.035, 0, ry, 0);
  }
  for (const side of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({
      mats: P.mats, pods: 2, spacing: 0.14, r: 0.050,
      shield: true, seed: 8135 + (side > 0 ? 1 : 0),
    }), side * 0.78, 1.47, 3.06);
    P.add('hullDetail', cylZ(0.035, 0.92, 10), side * 1.26, 1.52, -1.28);
    P.add('hullDark', box(0.10, 0.07, 0.08), side * 1.26, 1.52, -0.84);
    P.add('hullDark', box(0.10, 0.07, 0.08), side * 1.26, 1.52, -1.72);
  }

  // Backed bustle rack and characteristic side tool cages.
  P.add('turretDark', box(2.18, 0.30, 0.06), 0, 0.34, -2.03);
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 2.10, d: 0.48, h: 0.34, fill: 0.38, rails: 3, seed: 8140,
  }), 0, 0.54, -1.90);
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.035, 0.035, 0.64), side * 1.12, 0.56, -1.66);
    P.add('turretDetail', box(0.035, 0.34, 0.035), side * 1.12, 0.40, -1.98);
  }

  // Closed, layered 20-pdr gun plant around the inherited bore.
  P.addGunExtra(box(0.72, 0.55, 0.25), 0, -0.015, 0.35);
  P.addGunExtra(cylZ(0.19, 0.38, 18, 0.145), 0, 0, 0.62);
  P.addGunExtraDark(cylZ(0.035, 0.09, 10), 0.27, 0.07, 0.55);
  P.decal('turret', 'number', '81', 0.25, [1.18, 0.40, -0.66], Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.26);
}

function buildStrv81(P) {
  centurionBuild(P, 3);
  addStrv81Package(P);
  // The oracle has a squat cast fighting compartment. Scale the complete
  // turret-owned assembly about its ring, then cancel that scale on the gun
  // group so the 20-pdr tube and mantlet remain circular.
  P.turretG.scale.y *= 0.82;
  P.gunG.scale.y *= 1 / 0.82;
  P.topY = 1.13;
}

function addStrv122Package(P) {
  const { box, cylY, cylZ } = KIT;
  const slab = orientedSlab;

  // Swedish hull-front package: thick upper-glacis wedges and lower shoulder
  // returns overlap the A5 shell while remaining clear of both idler lanes.
  for (const side of [-1, 1]) {
    P.add('hull', slab(
      [side * 0.12, 1.47, 2.36], [side * 1.18, 1.44, 2.48],
      [side * 0.96, 1.28, 3.52], [side * 0.12, 1.30, 3.62],
      [side * 0.12, 1.61, 2.36], [side * 1.18, 1.58, 2.48],
      [side * 0.96, 1.42, 3.52], [side * 0.12, 1.44, 3.62]));
    P.add('hullDark', box(0.025, 0.28, 0.76), side * 0.94, 1.43, 2.74,
      0, 0, side * 0.08);

    // Distinct 122 side armor: eight shallow ceramic cassettes over the
    // donor skirt, stopping above and outside the single native shoe course.
    for (let i = 0; i < 8; i++) {
      plate(P, 'hull', side * 1.84, 1.23, 2.52 - i * 0.73,
        0.055, 0.52, 0.58, [0, 0, side * 0.018], false);
    }

    // Flush turret-side protection and supported rear-corner returns.
    for (let i = 0; i < 5; i++) {
      plate(P, 'turret', side * 1.50, 0.42 + (i & 1) * 0.025,
        0.08 - i * 0.43, 0.13, 0.40, 0.36, [0, 0, side * 0.08], true);
    }
    P.add('turret', slab(
      [side * 1.16, 0.10, -1.52], [side * 1.48, 0.10, -1.62],
      [side * 1.48, 0.12, -2.54], [side * 1.12, 0.12, -2.34],
      [side * 1.12, 0.62, -1.52], [side * 1.42, 0.60, -1.62],
      [side * 1.42, 0.56, -2.50], [side * 1.08, 0.58, -2.30]));
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 6, r: 0.043, len: 0.30,
      splay: side * 1.04, pitch: -0.44, arc: 0.62,
      slot: 'detail', seed: 12200 + (side > 0 ? 1 : 0),
    }), side * 1.34, 0.58, 0.26);
  }

  // Reinforced roof armor is a defining Strv 122 cue. These closed plates
  // overlap the wedge crown and leave the crew stations visibly seated.
  P.add('turret', box(1.96, 0.10, 1.42), 0, 0.82, -0.74);
  P.add('turretDark', box(1.82, 0.018, 1.28), 0, 0.88, -0.74);
  for (const side of [-1, 1]) {
    P.add('turret', box(0.58, 0.10, 0.66), side * 0.72, 0.88, -0.55);
    P.add('turretDark', box(0.48, 0.018, 0.55), side * 0.72, 0.94, -0.55);
  }

  // Two low crew hatches, surrounding periscopes and roof service boxes sit
  // on the new armor plate. Their feet overlap the crown instead of hovering
  // above it, restoring the dense roof grammar visible on the 122 oracle.
  for (const [x, z, r] of [[0.42, -0.78, 0.26], [-0.28, -0.82, 0.23]]) {
    P.add('turret', cylY(r, r + 0.015, 0.065, 18), x, 0.92, z);
    P.add('turretDark', KIT.torus(r * 0.92, 0.014, 18), x, 0.96, z);
  }
  for (const [x, z, ry] of [
    [0.17, -0.50, -0.12], [0.40, -0.43, -0.04], [0.65, -0.52, 0.10],
    [-0.52, -0.48, 0.14], [-0.73, -0.62, 0.22], [-0.08, -0.45, -0.12],
  ]) {
    P.add('turretDetail', box(0.14, 0.048, 0.078), x, 0.94, z, 0, ry, 0);
    P.add('turretGlass', box(0.098, 0.022, 0.014), x, 0.968, z + 0.036, 0, ry, 0);
  }
  P.add('turret', box(0.34, 0.12, 0.42), 0.78, 0.95, -1.22);
  P.add('turretDark', box(0.28, 0.018, 0.34), 0.78, 1.02, -1.22);
  P.add('turret', box(0.30, 0.10, 0.34), -0.78, 0.94, -1.34);
  P.add('turretDark', box(0.24, 0.018, 0.27), -0.78, 1.00, -1.34);
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.12, 0.10, 0.12), side * 1.02, 0.86, -0.12);
    P.add('turretGlass', box(0.075, 0.055, 0.018), side * 1.02, 0.87, -0.05);
    P.add('turretDark', box(0.025, 0.025, 0.22), side * 1.02, 0.81, -0.24);
  }

  // Commander panorama and forward shielded Ksp 58 on broad roof shoes.
  P.add('turret', box(0.38, 0.08, 0.38), -0.58, 0.96, -0.62);
  P.add('turretDetail', cylY(0.14, 0.17, 0.32, 16), -0.58, 1.15, -0.62);
  P.add('turretGlass', box(0.21, 0.10, 0.024), -0.58, 1.16, -0.43);
  mount(P, 'turret', FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.84,
    elev: 0.10, shield: true, ammo: true,
    ring: { r: 0.17, stubs: 3 }, seed: 12220,
  }), 0.52, 0.96, -0.50, [0, 0.06, 0]);
  addSwedishRadioPair(P, 'turret', 0.73, -2.18, 12230);

  // Connected rear basket/slat complex. Every rail meets a post, and the
  // posts return into the backed bustle armor.
  P.add('turretDark', box(2.50, 0.34, 0.06), 0, 0.36, -2.78);
  for (const y of [0.26, 0.38, 0.50, 0.62]) {
    P.add('turretDetail', box(2.66, 0.028, 0.032), 0, y, -2.82);
  }
  for (let i = 0; i < 9; i++) {
    P.add('turretDetail', box(0.030, 0.42, 0.032), -1.25 + i * 0.3125, 0.44, -2.82);
  }
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.032, 0.36, 0.62), side * 1.33, 0.44, -2.53);
    P.add('turretDetail', box(0.24, 0.035, 0.035), side * 1.22, 0.26, -2.50);
    P.add('turretDetail', box(0.24, 0.035, 0.035), side * 1.22, 0.62, -2.50);
  }

  // Swedish L/44 gun root: broad buried mask, stepped collar and two visible
  // trunnion fasteners around the inherited barrel/elevation rig.
  P.addGunExtra(box(0.82, 0.58, 0.24), 0, -0.01, 0.38);
  P.addGunExtra(cylZ(0.22, 0.40, 18, 0.17), 0, 0, 0.68);
  for (const side of [-1, 1]) P.addGunExtraDark(cylZ(0.037, 0.095, 10),
    side * 0.30, 0.08, 0.58);

  P.decal('turret', 'number', '122', 0.25, [-1.56, 0.43, -0.82], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.54);
}

function buildStrv122(P) {
  buildLeo2A5(P);
  addStrv122Package(P);
  addVehicleGhillieSuit(P);
}

// ---------------------------------------------------------------------------
// Strv 103A (§5.317 lane J) — docs/references/tanks/strv103a.md
// NEW measured-loft build vs the owner drop strv_103b.glb (Sketchfab
// "Strv 103B" by BFJFFK, CC-BY-4.0, LOCAL-ONLY; sha256 e0b09973…). All lines
// below derive from docs/references/vertex/strv103a.json + raw vertex scans:
// raw≈meters, nose +Z; build frame = print body (gate −4.335..+3.057, len
// 7.392) lofted onto the published 7.04 m span (z ×0.9524 about the body
// mid), y carried at the width-normalized read (×0.9774 of raw), muzzle
// extended to the published overall (print gun overhang is 0.6 m short).
// Published (A): hull 7.04, overall 8.99, width 3.60, height 2.14.
// A-MODEL DIVERGENCES FROM THE B PRINT (ordered, documented gate caps):
//   * NO flotation-screen rim strips around the deck edge (B-era fit);
//   * NO folded dozer blade under the nose (the A carried it only as an
//     attachment — the cleaner bare-beak A-read is built);
//   * NO nose protection fence (later retrofit on the B print: its ribbed
//     cage tops the print beak at ~1.9 over 0.3 m of nose);
//   * SIMPLER rear deck: plain twin grilles, no B stowage-box rows — the
//     A's first-generation K60+Boeing 502 engine fit;
//   * A-era fittings: plain twin headlamp pods, simple tail with low
//     exhaust outlets, pre-splinter solid olive.
// Shared S-Tank DNA kept at the measured print lines: turretless wedge,
// fixed L74 low over the long louvred glacis, commander cupola cluster
// (print reads 2.33-2.38 — published heightM 2.14 is p95-sovereign, crown
// pinned at 2.16), four-wheel course with front drive + raised rear idler.
// ---------------------------------------------------------------------------

// Closed measured loft (§C.1 winding-guarded slabs between stations).
// Row: { z, b, t, w, wt? } — bottom/top y, lower/upper half-widths.
function loftRows(P, rows, bucket = 'hull') {
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], c = rows[i + 1];
    const awt = a.wt ?? a.w, cwt = c.wt ?? c.w;
    P.add(bucket, orientedSlab(
      [-a.w, a.b, a.z], [a.w, a.b, a.z], [c.w, c.b, c.z], [-c.w, c.b, c.z],
      [-awt, a.t, a.z], [awt, a.t, a.z], [cwt, c.t, c.z], [-cwt, c.t, c.z]));
  }
}

// Fixed hull-bucket gun run, sections muzzle->rear ({ z0, z1, r, r2?, dark? }).
function fixedGunRun(P, axisY, secs) {
  for (const s of secs) {
    const len = s.z0 - s.z1;
    P.add(s.dark ? 'hullDark' : 'hull', KIT.cylZ(s.r, len, P.q ? 18 : 12, s.r2),
      0, axisY + (s.dy || 0), s.z1 + len / 2);
  }
}

function buildStrv103A(P) {
  const { box, cylX, cylY, cylZ, frustum, torus, sph, liftEye, periscope } = KIT;
  P.fixedMount = true;

  // ---- primary silhouette loft (print z-profile mapped to the published
  // frame; glacis plane 1.845@z0.62 -> 1.47@z2.98, beak lip 1.50@3.52).
  const primary = [
    { z: 3.52, b: 1.26, t: 1.50, w: 1.30, wt: 1.46 },        // bare beak lip (no dozer/fence)
    { z: 2.98, b: 0.88, t: 1.47, w: 1.44, wt: 1.60 },        // beak root over the sprockets
    { z: 2.36, b: 0.64, t: 1.57, w: 1.48, wt: 1.65 },        // nose run (print yMin 0.61-0.74)
    { z: 1.55, b: 0.40, t: 1.70, w: 1.52, wt: 1.67 },        // glacis mid under the tube
    { z: 0.62, b: 0.40, t: 1.85, w: 1.54, wt: 1.68 },        // glacis break (print 1.845)
    { z: -0.60, b: 0.40, t: 1.88, w: 1.54, wt: 1.68 },       // mid deck (print 1.877-1.88)
    { z: -2.02, b: 0.42, t: 1.88, w: 1.54, wt: 1.68 },       // deck run to the engine bay
    { z: -2.62, b: 0.78, t: 1.90, w: 1.50, wt: 1.64 },       // rear deck rise (print 1.9-2.0 band)
    { z: -3.18, b: 1.10, t: 1.84, w: 1.30, wt: 1.52 },       // tail fall (print top 1.868)
    { z: -3.52, b: 1.22, t: 1.77, w: 1.18, wt: 1.44 },       // tail plate (print 1.19..1.757)
  ];
  // Two closed lofts split at the 1.38 shoe-clearance seam (resident-family
  // §B4 pattern): a narrow inter-track tub below, the full-width upper body
  // flaring above the shoe envelope — no corridor subtraction anywhere.
  // The beak lip row rides ABOVE the seam (b 1.40): the tub stops at the
  // beak root and a dedicated inboard core wedge closes the beak underside
  // (an inverted b>t clamp row would emit degenerate slabs).
  loftRows(P, primary.filter((r) => r.b < 1.38)
    .map((r) => ({ z: r.z, b: r.b, t: Math.min(r.t, 1.38), w: Math.min(r.w, 0.94) })));
  loftRows(P, [
    { z: 2.98, b: 0.88, t: 1.38, w: 0.94 },
    { z: 3.52, b: 1.26, t: 1.50, w: 0.94 },
  ]);
  // Real A-nose lower structure (no dozer): the stiffened under-lip crossbeam
  // and twin under-beak tow brackets — the honest low mass at the tip (the
  // side 12%-band anchor columns stay real, not decorative).
  P.add('hull', box(2.40, 0.16, 0.14), 0, 1.06, 3.44);
  for (const s of [-1, 1]) {
    P.add('hull', box(0.14, 0.34, 0.30), s * 0.84, 1.06, 3.30);
    P.add('hullDark', torus(0.06, 0.018, 10), s * 0.84, 0.92, 3.42);
  }
  loftRows(P, primary.map((r) => ({
    z: r.z, b: Math.max(Math.min(r.t, 1.38), r.b), t: r.t, w: Math.min(r.w, 0.94), wt: r.wt,
  })));

  // ---- fixed 105 mm L74 low in the glacis (§B3.1; print bore axis y 1.59,
  // muzzle r 0.090). Published overall: tail -3.52 -> muzzle +5.47 (the
  // print's own overhang is 0.6 m short — packet cap).
  muzzleBore(P, { z: 5.47, r: 0.082, y: 1.59, parent: 'hullG' });
  fixedGunRun(P, 1.59, [
    { z0: 5.47, z1: 5.32, r: 0.105 },                        // muzzle collar
    { z0: 5.32, z1: 3.55, r: 0.090 },                        // fore tube (print r .090)
    { z0: 3.55, z1: 2.30, r: 0.098 },                        // mid step
    { z0: 2.30, z1: 1.10, r: 0.106, r2: 0.125 },             // rear taper to the glacis
  ]);
  P.add('hull', KIT.xform(cylZ(0.115, 0.46, 12, 0.135), 0, 0, 0, -0.34), 0, 1.55, 1.18); // glacis exit sleeve
  // travel clamp on the beak: two planted cheek posts + top yoke band
  for (const s of [-1, 1]) P.add('hullDetail', box(0.05, 0.24, 0.06), s * 0.13, 1.50, 2.96);
  P.add('hullDetail', box(0.34, 0.05, 0.08), 0, 1.65, 2.96);
  // virtual articulation anchors (fixedMount: fx/aim only, re-seated to hullG)
  P.turretG.position.set(0, 1.59, 0.40);
  P.gunG.position.set(0, 0, 0);
  P.muzzleZ = 5.05;

  // ---- glacis louvre banks (radiators ON the glacis — family identity).
  // Glacis plane y(z) = 1.845 - (z - 0.62) * 0.1585 over the tube flanks.
  const glY = (z) => 1.845 - (z - 0.62) * 0.1585;
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.86, 0.025, 1.24), s * 0.48, glY(1.62) + 0.005, 1.62, -0.335, 0, 0);
    for (let i = 0; i < 6; i++) {
      const z = 1.06 + i * 0.23;
      P.add('hullDetail', box(0.84, 0.034, 0.065), s * 0.48, glY(z) + 0.032, z + 0.05, -0.335, 0, 0);
    }
  }
  P.add('hullDetail', box(1.86, 0.05, 0.05), 0, glY(2.52) + 0.02, 2.52, -0.335, 0, 0); // splash rail
  // spare links planted on the right glacis shoulder (A-era field fit)
  mount(P, 'hull', FITTINGS.spareTrackLinks({
    mats: P.mats, links: 3, width: 0.60, pitch: 0.17, seed: 10420,
  }), 0.98, glY(2.30) + 0.03, 2.30, [-0.335, 0, 0]);

  // ---- commander cluster (print z +0.02..-1.42, tops 2.33-2.38 CAPPED at
  // 2.16 by published heightM 2.14 p95 sovereignty; packet cap).
  P.add('hull', box(0.84, 0.10, 1.10), 0.46, 1.90, -0.62);                    // planted plinth (right)
  P.addEquipment('hull', box(0.36, 0.26, 0.40), 0.62, 2.02, -0.94);           // asymmetric sight head
  P.add('hullDark', box(0.32, 0.02, 0.36), 0.62, 2.15, -0.94);
  P.add('hullGlass', box(0.20, 0.075, 0.022), 0.62, 2.06, -0.73);
  P.add('hull', cylY(0.26, 0.28, 0.11, 16), 0.28, 1.93, -0.40);               // commander cupola (right)
  P.add('hullDark', torus(0.26, 0.015, 16), 0.28, 2.00, -0.40);
  P.add('hull', cylY(0.145, 0.145, 0.045, 14), 0.28, 2.045, -0.40);           // cupola crown at the 2.16 cap
  P.add('hullDark', torus(0.15, 0.013, 14), 0.28, 2.065, -0.40);
  mount(P, 'hull', FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.70,
    elev: 0.04, shield: true, ammo: true, seed: 10430,
  }), 0.52, 1.94, -0.18, [0, 0.05, 0]);                                       // commander Ksp 58 (crown <= 2.16 cap)
  P.add('hull', sph(0.155, 14, Math.PI / 2), -0.52, 1.87, -0.30);             // fixed observation dome (left)
  P.add('hullDark', torus(0.14, 0.012, 12), -0.52, 1.925, -0.30);
  P.addEquipment('hull', box(0.34, 0.14, 0.36), -0.66, 1.92, -0.98);          // driver/gunner sight box (left)
  P.add('hullGlass', box(0.16, 0.08, 0.022), -0.66, 1.96, -0.79);
  periscope(P, 'hullDetail', 0.24, 1.80, 0.30);
  periscope(P, 'hullDetail', -0.34, 1.80, 0.44);

  // ---- deck grammar per the A-read: the central louvre field behind the
  // glacis break (print identity) + plain twin engine grilles behind the
  // cluster; NO flotation rim, NO stowage-box rows (simpler first engine fit).
  P.add('hullDark', box(2.40, 0.022, 0.72), 0, 1.868, 0.30);                  // central louvre well (seated on the deck line)
  for (let i = 0; i < 6; i++) {
    P.add('hullDetail', box(2.32, 0.030, 0.055), 0, 1.888, 0.58 - i * 0.12);  // transverse louvre ribs
  }
  for (const s of [-1, 1]) {
    P.add('hullDark', box(1.00, 0.025, 0.88), s * 0.60, 1.895, -2.30);        // twin radiator wells
    for (let i = 0; i < 5; i++) {
      P.add('hullDetail', box(0.92, 0.026, 0.04), s * 0.60, 1.915, -2.62 + i * 0.16);
    }
    P.add('hullDetail', cylY(0.09, 0.09, 0.03, 10), s * 1.12, 1.885, -1.48);  // fuel fillers
  }
  P.add('hull', box(0.38, 0.10, 0.40), 0.10, 1.90, -1.66);                    // central vent crown
  // fenders: thin over-track plates (print fender band x 1.48-1.72 runs
  // z ~+3.3..-1.6 and STOPS before the stern — plan-row receipt)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.24, 0.03, 4.90), s * 1.60, 1.50, 0.85);
    // stern mudguard flares carry the published 3.60 width (print: short
    // ±1.777 tips at the rear corners, not long boxes)
    P.add('hull', box(0.30, 0.26, 0.44), s * 1.65, 1.56, -3.06);
    P.add('hullDark', box(0.26, 0.02, 0.36), s * 1.65, 1.70, -3.06);
    P.add('hullDetail', box(0.02, 0.16, 0.30), s * 1.79, 1.54, -3.06);        // width-defining guard lips
  }
  // twin raked whip masts (print: pair tips ~2.9 leaning rearward)
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylY(0.045, 0.055, 0.10, 10), s * 0.92, 1.91, -1.86);
    mount(P, 'hull', FITTINGS.antennaWhip({
      mats: P.mats, h: 1.02, r: 0.012, rake: -0.42,
      seed: 10440 + (s > 0 ? 1 : 0),
    }), s * 0.92, 1.94, -1.88);
  }

  // ---- A-era lamps + fixed Ksp 58 fender box (left) — family MG identity.
  for (const s of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({
      mats: P.mats, pods: 2, spacing: 0.13, r: 0.048,
      shield: false, seed: 10450 + (s > 0 ? 1 : 0),
    }), s * 1.22, 1.56, 3.24);                                                // plain A-era pods
  }
  P.add('hull', box(0.24, 0.16, 0.62), -1.46, 1.44, 1.90);                    // fixed MG box
  P.add('hullDark', cylZ(0.020, 0.26, 6), -1.52, 1.47, 2.26);
  P.add('hullDark', cylZ(0.020, 0.26, 6), -1.42, 1.47, 2.26);
  liftEye(P, 'hullDetail', -1.50, 1.92, 0.55, 0.4); liftEye(P, 'hullDetail', 1.50, 1.92, 0.55, -0.4);
  for (const s of [-1, 1]) {                                                  // bow tow shackles
    P.add('hullDetail', box(0.10, 0.08, 0.10), s * 0.84, 1.06, 2.92);
    P.add('hullDark', torus(0.055, 0.016, 10), s * 0.84, 1.02, 2.98);
  }

  // ---- tail (A-read: plain plate, LOW twin exhaust outlets recessed INTO
  // the plate face, simple rail; nothing extends past the -3.52 tail plane —
  // overallLengthM = muzzle-to-tail-end, so the plate is the rear terminus).
  P.add('hullDark', box(2.60, 0.07, 0.05), 0, 1.44, -3.495);                  // rear rail
  for (const s of [-1, 1]) {
    P.add('hullDark', cylZ(0.075, 0.10, 10), s * 0.98, 1.34, -3.475);         // recessed exhaust outlets
    P.add('hullDetail', box(0.30, 0.22, 0.035), s * 0.98, 1.34, -3.50);
    P.add('hullDetail', box(0.10, 0.09, 0.10), s * 1.30, 1.30, -3.46);        // rear shackle blocks
  }
  P.add('hullDetail', box(0.16, 0.07, 0.05), 0, 1.70, -3.49);                 // convoy light
  mount(P, 'hull', FITTINGS.stowageRack({
    mats: P.mats, w: 1.86, d: 0.42, h: 0.24, fill: 0.35, rails: 3, seed: 10460,
  }), 0, 1.86, -3.28);                                                        // narrow tail rack (print top 1.86-1.90)

  // ---- running gear (§B9 single native course; print measured): four 0.40 m
  // road wheels at the print stations, FRONT drive sprocket (+2.16, r 0.32),
  // raised rear idler (-2.01, r 0.26), two return rollers, track outer 1.62.
  for (const s of [-1, 1]) {
    P.add('hull', box(0.06, 0.20, 4.70), s * 1.71, 1.34, 0.10);               // shallow upper backing
    for (let k = 0; k < 7; k++) {
      const z = 1.95 - k * 0.66;
      // shallow skirt band — the print exposes near-full wheel discs
      // (bottom line 0.92; deep panels buried the course, pair receipt)
      P.add('hull', box(0.07, 0.32, 0.60), s * 1.70, 1.13, z);
      P.add('hullDark', box(0.016, 0.24, 0.52), s * 1.745, 1.13, z);
    }
    P.add('hullRunningGearDark', box(0.02, 0.72, 4.5), s * 1.00, 0.56, 0.05); // bay shadow wall
  }
  KIT.buildRunningGear(P, {
    style: 'rubber', dishR: 0.74, wheelR: 0.40, wheelW: 0.24, wheelY: 0.45, xc: 1.29,
    wheelZs: [1.40, 0.47, -0.30, -1.28],
    sprocket: { z: 2.16, y: 0.89, r: 0.32 }, idler: { z: -2.01, y: 0.83, r: 0.26 },
    rollers: [{ z: 0.77, y: 1.06, r: 0.10 }, { z: -0.63, y: 1.06, r: 0.10 }],
    trackW: 0.65, trackTh: 0.075, topY: 1.20, botY: 0.04,
    arms: true, coveredTop: false, deadSag: 0.028,
  });
  // (no recess drums: at xc 1.29 they sit inside the instanced shoe sweep —
  // strict-audit receipt; the ±1.00 bay shadow wall owns the recess read)
  // tail underside wedge from the raised idler to the high stern
  P.add('hull', frustum(1.16, -2.55, -3.50, 1.18, -2.53, -3.52, 1.10, 1.24));

  P.decal('hull', 'number', P.spec.visual.number || '103A', 0.28, [1.685, 1.62, -1.35], Math.PI / 2, 0, 0);
  P.decal('hull', 'number', P.spec.visual.number || '103A', 0.28, [-1.685, 1.62, -1.35], -Math.PI / 2, 0, 0);
  addVehicleGhillieSuit(P);
  P.topY = 1.35;
}

export const SWEDEN_PROFILES = {
  strv103: { build: buildStrv103B },
  strv103a: { build: buildStrv103A },
  strv81: { build: buildStrv81 },
  strv122: { build: buildStrv122 },
};
