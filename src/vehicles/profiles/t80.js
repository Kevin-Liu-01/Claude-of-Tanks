// Pure family extraction from russia.js (§5.75). Geometry bytes are unchanged.
import * as THREE from 'three';
import { KIT, FITTINGS, evenStations, muzzleBore, muzzleTipDot, orientedSlab } from './kit.js';
import { vehicleAmbientFloorHook } from '../materials.js';
import {
  loftHull,
  meshDome,
  ringSkin,
  tubeGun,
  ruSaddle,
  nsvt,
  ruGlacisKit,
  ruDeck,
  ruSkirtBand,
  widthAnchor,
  eraRuCheeks,
} from './russia.js';

// Explicit cast-turret loft shared by the three first-party T-80 marks.
// Longitudinal stations carry independent lower shoulder, upper cheek and
// crown widths, so the shell can form a low asymmetric pear instead of a
// rotational half-sphere.  The sections are authored here from visual
// reference; no source geometry is imported or converted into the build.
function t80CastSectionLoft(stations) {
  const positions = [];
  const tri = (a, b, c, expect) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    if (n[0] * expect[0] + n[1] * expect[1] + n[2] * expect[2] < 0) positions.push(...a, ...c, ...b);
    else positions.push(...a, ...b, ...c);
  };
  const quad = (a, b, c, d, expect) => { tri(a, b, c, expect); tri(a, c, d, expect); };
  const rings = stations.map(([z, levels]) => levels.map(([y, xl, xr]) => [[xl, y, z], [xr, y, z]]));
  const levelCount = rings[0].length;
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1];
    for (let k = 0; k < levelCount - 1; k++) {
      quad(a[k][0], b[k][0], b[k + 1][0], a[k + 1][0], [-1, 0, 0]);
      quad(a[k][1], a[k + 1][1], b[k + 1][1], b[k][1], [1, 0, 0]);
    }
    quad(a[levelCount - 1][0], a[levelCount - 1][1], b[levelCount - 1][1], b[levelCount - 1][0], [0, 1, 0]);
    quad(a[0][0], b[0][0], b[0][1], a[0][1], [0, -1, 0]);
  }
  const zDirection = Math.sign(stations[stations.length - 1][0] - stations[0][0]) || 1;
  const cap = (r, expect) => {
    for (let k = 0; k < levelCount - 1; k++) quad(r[k][0], r[k][1], r[k + 1][1], r[k + 1][0], expect);
  };
  cap(rings[0], [0, 0, -zDirection]);
  cap(rings[rings.length - 1], [0, 0, zDirection]);

  // Weld coincident section vertices so each foundry break shades as one
  // continuous casting while the deliberately authored planes remain.
  const unique = [], indices = [], byPosition = new Map();
  for (let i = 0; i < positions.length; i += 3) {
    const key = `${positions[i].toFixed(6)},${positions[i + 1].toFixed(6)},${positions[i + 2].toFixed(6)}`;
    let index = byPosition.get(key);
    if (index === undefined) {
      index = unique.length / 3;
      byPosition.set(key, index);
      unique.push(positions[i], positions[i + 1], positions[i + 2]);
    }
    indices.push(index);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(unique, 3));
  geometry.setIndex(indices);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((unique.length / 3) * 2).fill(0), 2));
  geometry.computeVertexNormals();
  return geometry;
}

function rebuildT80FamilyTurret2026(P, v) {
  const { box, cylX, cylY, cylZ } = KIT;

  // Atomic family reset.  The superseded meshDome and its gate-era patch
  // boxes were already authored into buckets above; clear them before merge
  // and retain only the independently pitchable gun rig.
  P.turretG.clear();
  P.turretG.add(P.gunG);
  P.clear(
    'turret', 'turretDetail', 'turretDark', 'turretCloth', 'turretGlass', 'turretTrack',
    'gun', 'gunDark', 'gunMount', 'gunMountDark',
  );
  P.clearDecals('turret');
  P.turretG.position.set(0, 1.45, 0.0);

  // Common low cast shell.  The forward throat is pinched around the gun,
  // the shoulders swell ahead of the ring, the rear remains asymmetric and
  // the roof is a shallow crown rather than the old hemisphere.
  P.add('turret', t80CastSectionLoft([
    [1.42, [[-0.03, -0.48, 0.52], [0.10, -0.70, 0.75], [0.30, -0.63, 0.69], [0.48, -0.43, 0.49], [0.61, -0.19, 0.24]]],
    [1.13, [[-0.04, -0.98, 1.05], [0.10, -1.27, 1.35], [0.32, -1.18, 1.28], [0.51, -0.84, 0.95], [0.66, -0.39, 0.49]]],
    [0.76, [[-0.05, -1.28, 1.36], [0.09, -1.51, 1.59], [0.32, -1.42, 1.52], [0.53, -1.02, 1.13], [0.69, -0.51, 0.61]]],
    [0.30, [[-0.05, -1.41, 1.48], [0.08, -1.60, 1.66], [0.31, -1.51, 1.59], [0.54, -1.08, 1.19], [0.71, -0.55, 0.65]]],
    [-0.18, [[-0.05, -1.43, 1.50], [0.08, -1.61, 1.66], [0.30, -1.51, 1.58], [0.53, -1.07, 1.17], [0.70, -0.54, 0.64]]],
    [-0.62, [[-0.04, -1.37, 1.44], [0.08, -1.54, 1.60], [0.29, -1.44, 1.52], [0.51, -1.01, 1.11], [0.67, -0.48, 0.58]]],
    [-1.00, [[-0.03, -1.23, 1.32], [0.08, -1.42, 1.49], [0.27, -1.31, 1.40], [0.48, -0.90, 1.00], [0.63, -0.41, 0.51]]],
    [-1.30, [[-0.01, -0.98, 1.09], [0.07, -1.23, 1.31], [0.24, -1.12, 1.21], [0.43, -0.74, 0.84], [0.57, -0.30, 0.40]]],
  ]));
  P.add('turret', cylY(1.10, 1.24, 0.11, 20), 0, -0.055, -0.03);
  P.add('turretDark', cylY(1.16, 1.16, 0.022, 20), 0, -0.105, -0.03);

  // Integrated cast mantlet shoulders.  Their rear thirds penetrate the
  // pear shell, so the gun emerges from one armored volume instead of a
  // circular collar stuck to a dome.
  for (const s of [-1, 1]) {
    P.add('turret', orientedSlab(
      [s * 0.14, 0.02, 1.42], [s * 1.23, 0.02, 0.89], [s * 1.36, 0.02, 0.54], [s * 0.22, 0.02, 0.70],
      [s * 0.15, 0.43, 1.18], [s * 1.08, 0.44, 0.77], [s * 1.21, 0.38, 0.48], [s * 0.23, 0.51, 0.65],
    ));
    P.add('turretDark', box(0.026, 0.30, 0.39), s * 1.23, 0.24, 0.58, 0, -s * 0.20, 0);
  }

  // Three low roof plates bridge the crown to the two hatch stations.
  P.add('turret', box(0.72, 0.045, 0.76), -0.67, 0.665, -0.03, 0, 0, -0.075);
  P.add('turret', box(0.72, 0.045, 0.82), 0.05, 0.695, -0.15);
  P.add('turret', box(0.60, 0.045, 0.66), 0.70, 0.655, -0.05, 0, 0, 0.075);
  for (const x of [-0.35, 0.38]) P.add('turretDark', box(0.020, 0.020, 0.60), x, 0.705, -0.08);

  // Variant protection.  T-80 keeps the lightest planted cheek pads, T-80B
  // gains the heavier brow applique, and T-80BV receives two irregular
  // Kontakt-1 rows plus a real flank return.  Every face has a shorter dark
  // buried shoe against the cast carrier.
  const cheekCourse = v === 2
    ? [[0.36, 1.27, 0.13, 0.28], [0.62, 1.16, 0.24, 0.30], [0.88, 1.01, 0.39, 0.32], [1.13, 0.81, 0.54, 0.31], [1.34, 0.56, 0.67, 0.28], [1.48, 0.27, 0.76, 0.25]]
    : [[0.42, 1.27, 0.16, 0.34], [0.72, 1.12, 0.31, 0.38], [1.02, 0.90, 0.48, 0.40], [1.28, 0.62, 0.65, 0.37], [1.45, 0.30, 0.76, 0.31]];
  for (const s of [-1, 1]) {
    for (let i = 0; i < cheekCourse.length; i++) {
      const [x, z, yaw, width] = cheekCourse[i];
      const height = v === 0 ? 0.22 + (i % 2) * 0.025 : v === 1 ? 0.27 + (i % 2) * 0.03 : 0.205 + (i % 3) * 0.018;
      const depth = v === 2 ? 0.22 + (i % 2) * 0.025 : 0.30;
      // Keep the roots buried but let the replaceable faces own the visible
      // cheek silhouette.  The first reset sat these 9-12 cm too low, so the
      // casting swallowed most of the protection at normal garage scale.
      const y = v === 0 ? 0.37 : v === 1 ? 0.40 : 0.34 + (i % 2) * 0.025;
      P.add('turretDark', box(width * 0.78, height * 0.58, depth * 0.62), s * x * 0.97, y - 0.035, z * 0.97, -0.24, -s * yaw, 0);
      P.add('turret', box(width, height, depth), s * x, y, z, -0.24 - (i % 2) * 0.035, -s * yaw, 0);
      P.add('turretDark', box(width * 0.76, 0.016, depth * 0.58), s * x, y + height * 0.52, z + 0.025, -0.24, -s * yaw, 0);
    }
    if (v === 2) {
      // Upper stagger and side return transform the sparse old BV blocks
      // into a dense conformal field while keeping the cast envelope low.
      for (let i = 0; i < 5; i++) {
        const x = 0.50 + i * 0.245;
        const z = 1.08 - i * 0.20;
        const yaw = 0.26 + i * 0.13;
        P.add('turretDark', box(0.205, 0.13, 0.14), s * x * 0.98, 0.54, z * 0.98, -0.33, -s * yaw, 0);
        P.add('turret', box(0.25 + (i % 2) * 0.02, 0.19, 0.20), s * x, 0.585 + (i % 2) * 0.02, z, -0.33, -s * yaw, 0);
      }
      for (let i = 0; i < 4; i++) {
        P.add('turretDark', box(0.15, 0.16, 0.25), s * 1.48, 0.34, 0.03 - i * 0.27, -0.18, -s * 0.08, 0);
        P.add('turret', box(0.19, 0.21 + (i % 2) * 0.02, 0.29), s * 1.53, 0.37, 0.03 - i * 0.27, -0.18, -s * 0.08, 0);
      }
    }
    // A shorter inner/lower course closes the mantlet-to-flank valleys.  It
    // is intentionally uneven and partly covered by the primary faces, like
    // the crowded applique/Kontakt carrier visible on the family references.
    for (let i = 0; i < (v === 2 ? 6 : 4); i++) {
      const x = 0.34 + i * (v === 2 ? 0.205 : 0.27);
      const z = 1.14 - i * (v === 2 ? 0.17 : 0.22);
      const yaw = 0.16 + i * 0.12;
      const w = (v === 2 ? 0.21 : 0.25) + (i % 2) * 0.025;
      P.add('turretDark', box(w * 0.78, 0.12, 0.13), s * x * 0.985, 0.25 + (i % 2) * 0.012, z * 0.985, -0.24, -s * yaw, 0);
      P.add('turret', box(w, v === 2 ? 0.17 : 0.20, v === 2 ? 0.18 : 0.22), s * x, 0.29 + (i % 2) * 0.015, z, -0.24 - (i % 2) * 0.025, -s * yaw, 0);
    }
  }

  // Gunner's primary sight and Luna/searchlight mass are seated in the
  // forward roof/cheek transition rather than on isolated poles.
  P.add('turret', box(0.40, 0.24, 0.34), -0.52, 0.57, 0.48, -0.10, 0.04, 0);
  P.add('turretDark', box(0.34, 0.06, 0.10), -0.52, 0.61, 0.665, -0.10, 0.04, 0);
  P.add('turretGlass', box(0.23, 0.10, 0.025), -0.52, 0.62, 0.722, -0.10, 0.04, 0);
  P.add('turretDetail', cylZ(0.16, 0.28, 16), 0.73, 0.39, 1.18, 0, 0, 0);
  P.add('turretDark', cylZ(0.155, 0.026, 16), 0.73, 0.39, 1.334);
  P.add('turretGlass', cylZ(0.115, 0.030, 16), 0.73, 0.39, 1.35);
  P.add('turret', box(0.35, 0.17, 0.24), 0.73, 0.31, 1.10, -0.18, 0, 0);

  // Two unequal hatch/cupola groups, visible periscope cadence and a real
  // commander's NSVT foundation.
  P.add('turret', cylY(0.27, 0.30, 0.095, 18), 0.49, 0.715, -0.36);
  P.add('turretDark', cylY(0.235, 0.235, 0.025, 18), 0.49, 0.772, -0.36);
  P.add('turret', cylY(0.235, 0.25, 0.075, 18), -0.48, 0.705, -0.31);
  P.add('turretDark', cylY(0.205, 0.205, 0.020, 18), -0.48, 0.752, -0.31);
  for (let i = 0; i < 5; i++) {
    const a = -0.72 + i * 0.36;
    P.add('turretGlass', box(0.10, 0.055, 0.045), 0.49 + Math.sin(a) * 0.27, 0.79, -0.36 + Math.cos(a) * 0.25, 0, a, 0);
  }
  for (let i = 0; i < 3; i++) P.add('turretGlass', box(0.10, 0.050, 0.042), -0.66 + i * 0.16, 0.77, -0.06, 0, -0.12 + i * 0.10, 0);

  // Armored commander's cradle and open rear hatch make the station read as
  // a working mechanism rather than a hairline barrel on a roof disc.
  for (const s of [-1, 1]) {
    P.add('turret', box(0.055, 0.22, 0.30), 0.49 + s * 0.25, 0.86, -0.37, -0.10, 0, s * 0.12);
    P.add('turretDark', box(0.075, 0.08, 0.18), 0.49 + s * 0.22, 0.91, -0.18, -0.18, 0, s * 0.12);
  }
  P.add('turret', box(0.49, 0.055, 0.32), 0.49, 0.965, -0.37, 0, 0, 0.02);
  P.add('turret', box(0.48, 0.055, 0.48), 0.49, 0.91, -0.68, -0.62, 0, 0);
  P.add('turretDark', box(0.34, 0.24, 0.25), 0.86, 0.88, -0.39, 0, 0, 0);
  P.add('turretDetail', box(0.32, 0.20, 0.23), 0.86, 0.89, -0.39, 0, 0, 0);
  const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'nsvt', scale: v === 2 ? 0.84 : 0.88, tone: 'dark', ammo: true, elev: -0.05, seed: 81 + v });
  mg.position.set(0.49, 0.94, -0.30);
  P.turretG.add(mg);

  // Loader hatch shield, low sight heads and uneven roof service boxes close
  // the broad empty crown without inventing stand-off architecture.
  P.add('turret', box(0.40, 0.050, 0.43), -0.48, 0.84, -0.55, -0.48, 0, 0);
  P.add('turret', box(0.25, 0.24, 0.23), -0.88, 0.72, 0.02, -0.12, 0, 0);
  P.add('turretGlass', box(0.15, 0.09, 0.025), -0.88, 0.75, 0.145, -0.12, 0, 0);
  P.add('turretDetail', box(0.22, 0.16, 0.28), 0.05, 0.76, 0.18, -0.08, 0, 0);
  P.add('turretDark', box(0.16, 0.055, 0.08), 0.05, 0.79, 0.35, -0.08, 0, 0);

  // Angled 902B smoke banks.  Broad cheek pads remain visible beneath the
  // launchers at both yaw states.
  for (const s of [-1, 1]) {
    P.add('turret', box(0.46, 0.12, 0.28), s * 1.02, 0.42, 0.58, -0.20, -s * 0.52, 0);
    const smoke = FITTINGS.smokeBank({ mats: P.mats, count: v === 0 ? 4 : 5, r: 0.042, len: 0.28, pitch: -0.48, splay: s * 0.92, arc: 0.66, spacing: 0.10, rotation: [0, 0, -s * 0.12], slot: 'dark', seed: 90 + v * 7 + s });
    smoke.position.set(s * 1.00, 0.46, 0.62);
    P.turretG.add(smoke);
  }

  // Supported bustle bins and open rear rail.  These replace the former
  // blank rear box while preserving intended negative space.
  for (const [x, z, w, d, h] of [[-0.84, -0.92, 0.44, 0.45, 0.25], [-0.31, -1.12, 0.48, 0.36, 0.24], [0.30, -1.14, 0.54, 0.34, 0.26], [0.86, -0.93, 0.42, 0.43, 0.22]]) {
    P.add('turretDetail', box(w, h, d), x, 0.32, z, 0, x * 0.06, 0);
    P.add('turretDark', box(w * 0.84, 0.022, d * 0.76), x, 0.32 + h * 0.52, z, 0, x * 0.06, 0);
  }
  for (const y of [0.16, 0.43]) P.add('turretDetail', box(2.18, 0.032, 0.032), 0, y, -1.51);
  for (let i = 0; i < 7; i++) P.add('turretDetail', box(0.030, 0.30, 0.030), -1.05 + i * 0.35, 0.295, -1.51);
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.032, 0.032, 0.54), s * 1.08, 0.43, -1.25, 0, -s * 0.24, 0);
    P.add('turretDetail', box(0.032, 0.30, 0.032), s * 1.08, 0.29, -1.45);
  }
  // Mixed-depth rear service cadence: straps, latch plates and two unequal
  // snorkel/stowage forms remain inside the casting/basket envelope.
  for (const [x, z, w] of [[-0.93, -0.73, 0.22], [-0.59, -1.02, 0.18], [-0.12, -1.24, 0.24], [0.46, -1.18, 0.20], [0.91, -0.76, 0.17]]) {
    P.add('turretDark', box(w, 0.045, 0.07), x, 0.48, z, 0, x * 0.05, 0);
    P.add('turretDetail', box(0.035, 0.20, 0.055), x, 0.37, z, 0, x * 0.05, 0);
  }
  P.add('turretDetail', cylZ(0.105, 0.58, 14), -1.08, 0.44, -0.92, 0, -0.18, 0);
  P.add('turretDark', cylZ(0.112, 0.035, 14), -1.08, 0.44, -1.225, 0, -0.18, 0);
  P.add('turretDetail', box(0.28, 0.22, 0.34), 1.04, 0.36, -0.84, 0, 0.12, 0);

  // Antennas terminate in broad collars on the rear crown.
  for (const [x, z, h] of [[-0.85, -0.62, 1.04], [0.91, -0.54, 0.78]]) {
    P.add('turretDark', cylY(0.075, 0.085, 0.075, 12), x, 0.68, z);
    P.add('turretDark', cylY(0.020, 0.013, h, 8), x, 0.72 + h * 0.50, z, x < 0 ? 0.035 : -0.028, 0, 0);
  }

  // Re-authored 2A46M family gun, fully seated in the common mantlet.
  P.gunG.position.set(0, 0.315, 0.60);
  ruSaddle(P, { rollR: 0.15, rollW: 0.40, tubeR: 0.128, rootR: 0.30, rootL: 0.66 });
  const gunEnd = v === 1 ? 5.73 : 5.67;
  tubeGun(P, [
    [0.55, 1.98, 0.142, 0.128, 0, -0.040],
    [1.98, 2.75, 0.132, 0.130, 0, -0.048],
    [2.75, gunEnd, 0.128, 0.128, 0, -0.054],
  ], { rings: [[3.58, 0.134, 0, -0.054], [4.36, 0.134, 0, -0.054], [Math.min(5.08, gunEnd - 0.18), 0.134, 0, -0.054]], muzzle: gunEnd });
  muzzleBore(P, { r: 0.128, y: -0.054 });
  P.add('gunDark', box(0.030, 0.030, 2.35), 0, 0.10, 1.84); // bore-sight/cable conduit
}

// First-party T-84 welded fighting compartment.  This deliberately shares
// only the standardized T-80 turbine chassis and native running gear; the
// angular shell, protection and combat stations are authored here as a
// distinct rotating assembly rather than inheriting the cast T-80 dome or
// the retired gate-era reconstruction below.
function rebuildT84FirstParty2026(P) {
  const { box, cylY, cylZ } = KIT;

  P.turretG.clear();
  P.turretG.add(P.gunG);
  P.clear(
    'turret', 'turretDetail', 'turretDark', 'turretCloth', 'turretGlass', 'turretTrack',
    'gun', 'gunDark', 'gunMount', 'gunMountDark',
  );
  P.clearDecals('turret');
  P.turretG.position.set(0, 1.45, -0.04);

  // Broad welded shell: a pinched gun throat opens into clipped shoulders,
  // stays low over the ring and falls into a compact asymmetric rear.  The
  // five section levels form separate undercut, cheek, roof-slope and crown
  // planes, avoiding both a half-sphere and a rectangular tower.
  const weldedShell = t80CastSectionLoft([
    [1.48, [[-0.04, -0.46, 0.50], [0.08, -0.70, 0.76], [0.31, -0.62, 0.70], [0.53, -0.40, 0.47], [0.66, -0.17, 0.22]]],
    [1.16, [[-0.05, -1.10, 1.18], [0.08, -1.39, 1.48], [0.32, -1.28, 1.38], [0.56, -0.88, 0.98], [0.71, -0.40, 0.49]]],
    [0.72, [[-0.06, -1.42, 1.51], [0.07, -1.64, 1.72], [0.31, -1.53, 1.62], [0.56, -1.06, 1.17], [0.73, -0.49, 0.59]]],
    [0.18, [[-0.06, -1.50, 1.59], [0.06, -1.70, 1.77], [0.29, -1.58, 1.67], [0.55, -1.08, 1.18], [0.73, -0.50, 0.60]]],
    [-0.42, [[-0.05, -1.47, 1.56], [0.06, -1.66, 1.73], [0.28, -1.53, 1.61], [0.53, -1.03, 1.13], [0.70, -0.46, 0.56]]],
    [-0.96, [[-0.04, -1.34, 1.44], [0.06, -1.54, 1.61], [0.27, -1.40, 1.49], [0.49, -0.91, 1.01], [0.65, -0.39, 0.49]]],
    [-1.38, [[-0.02, -1.11, 1.22], [0.06, -1.35, 1.43], [0.24, -1.20, 1.29], [0.44, -0.76, 0.86], [0.58, -0.29, 0.39]]],
  ]);
  // Non-indexing deliberately preserves the authored welded planes instead
  // of smoothing their normals into the cast pear used by T-80/B/BV.
  const facetedShell = weldedShell.toNonIndexed();
  facetedShell.computeVertexNormals();
  P.add('turret', facetedShell);
  P.add('turret', cylY(1.12, 1.25, 0.12, 20), 0, -0.06, -0.05);
  P.add('turretDark', cylY(1.17, 1.17, 0.024, 20), 0, -0.115, -0.05);

  // Integrated mantlet shoulders and diagonal weld seams.  The shoulder
  // roots penetrate the shell by more than a third of their depth.
  for (const s of [-1, 1]) {
    P.add('turret', orientedSlab(
      [s * 0.13, 0.02, 1.48], [s * 1.25, 0.02, 0.94], [s * 1.49, 0.02, 0.55], [s * 0.20, 0.02, 0.71],
      [s * 0.14, 0.45, 1.24], [s * 1.10, 0.48, 0.80], [s * 1.30, 0.39, 0.49], [s * 0.21, 0.53, 0.66],
    ));
    P.add('turretDark', box(0.030, 0.33, 0.45), s * 1.30, 0.25, 0.58, 0, -s * 0.28, 0);
    P.add('turretDark', box(0.026, 0.025, 0.80), s * 1.06, 0.50, 0.30, 0, -s * 0.24, -0.12);
  }
  P.add('gunMount', box(0.56, 0.40, 0.44), 0, 0.25, 1.19);
  P.add('gunMountDark', box(0.42, 0.28, 0.035), 0, 0.25, 1.428);

  // Three overlapping roof plates provide real seats for the two hatch
  // groups and the sight suite while retaining the low welded crown.
  P.add('turret', box(0.84, 0.050, 0.92), -0.66, 0.675, -0.08, 0, 0, -0.065);
  P.add('turret', box(0.78, 0.050, 1.02), 0.05, 0.704, -0.17);
  P.add('turret', box(0.68, 0.050, 0.86), 0.77, 0.668, -0.10, 0, 0, 0.070);
  for (const x of [-0.34, 0.42]) P.add('turretDark', box(0.022, 0.022, 0.72), x, 0.715, -0.12);

  // Irregular planted frontal protection.  Each visible cassette has a
  // shorter buried shoe and the upper row crosses the lower-row gaps.  A
  // separate flank return follows the shell falloff instead of forming a
  // straight wall.
  const lower = [
    [0.35, 1.26, 0.16, 0.30, 0.24], [0.62, 1.15, 0.27, 0.33, 0.27],
    [0.90, 0.99, 0.42, 0.35, 0.25], [1.17, 0.78, 0.58, 0.33, 0.28],
    [1.40, 0.51, 0.72, 0.29, 0.25], [1.53, 0.19, 0.80, 0.25, 0.27],
  ];
  const upper = [
    [0.47, 1.14, 0.25, 0.27], [0.72, 1.02, 0.37, 0.25], [0.98, 0.85, 0.52, 0.29],
    [1.22, 0.63, 0.67, 0.26], [1.41, 0.37, 0.78, 0.24],
  ];
  for (const s of [-1, 1]) {
    for (let i = 0; i < lower.length; i++) {
      const [x, z, yaw, w, d] = lower[i];
      const h = 0.215 + (i % 3) * 0.020;
      P.add('turretDark', box(w * 0.77, h * 0.58, d * 0.62), s * x * 0.975, 0.355, z * 0.975, -0.27, -s * yaw, 0);
      P.add('turret', box(w, h, d), s * x, 0.42 + (i % 2) * 0.018, z, -0.28 - (i % 2) * 0.035, -s * yaw, 0);
    }
    for (let i = 0; i < upper.length; i++) {
      const [x, z, yaw, w] = upper[i];
      P.add('turretDark', box(w * 0.76, 0.12, 0.14), s * x * 0.98, 0.545, z * 0.98, -0.34, -s * yaw, 0);
      P.add('turret', box(w, 0.18 + (i % 2) * 0.018, 0.20 + (i % 3) * 0.018), s * x, 0.60 + (i % 2) * 0.015, z, -0.34, -s * yaw, 0);
    }
    for (let i = 0; i < 4; i++) {
      const z = 0.02 - i * 0.29;
      P.add('turretDark', box(0.16, 0.14, 0.25), s * 1.50, 0.31, z, -0.18, -s * 0.08, 0);
      P.add('turret', box(0.21, 0.205 + (i % 2) * 0.018, 0.29), s * 1.56, 0.35, z, -0.18, -s * 0.08, 0);
    }
  }

  // Main sight and compact auxiliary head are broad-seated and asymmetric.
  P.add('turret', box(0.38, 0.23, 0.33), -0.58, 0.58, 0.45, -0.12, 0.05, 0);
  P.add('turretDark', box(0.30, 0.07, 0.09), -0.58, 0.61, 0.628, -0.12, 0.05, 0);
  P.add('turretGlass', box(0.21, 0.09, 0.028), -0.58, 0.62, 0.679, -0.12, 0.05, 0);
  P.add('turret', box(0.27, 0.18, 0.24), 0.82, 0.58, 0.29, -0.08, 0, 0);
  P.add('turretGlass', box(0.15, 0.072, 0.028), 0.82, 0.61, 0.423, -0.08, 0, 0);

  // Loader and commander groups, low periscope cadence and an unmistakable
  // NSVT mechanism on a wide yoke rather than a hairline roof barrel.
  P.add('turret', cylY(0.27, 0.30, 0.095, 18), 0.50, 0.735, -0.38);
  P.add('turretDark', cylY(0.235, 0.235, 0.025, 18), 0.50, 0.792, -0.38);
  P.add('turret', cylY(0.235, 0.25, 0.075, 18), -0.50, 0.722, -0.34);
  P.add('turretDark', cylY(0.205, 0.205, 0.020, 18), -0.50, 0.769, -0.34);
  for (let i = 0; i < 5; i++) {
    const a = -0.72 + i * 0.36;
    P.add('turretGlass', box(0.10, 0.055, 0.045), 0.50 + Math.sin(a) * 0.27, 0.81, -0.38 + Math.cos(a) * 0.25, 0, a, 0);
  }
  for (let i = 0; i < 3; i++) P.add('turretGlass', box(0.10, 0.052, 0.042), -0.68 + i * 0.17, 0.79, -0.08, 0, -0.12 + i * 0.10, 0);
  for (const s of [-1, 1]) {
    P.add('turret', box(0.060, 0.23, 0.32), 0.50 + s * 0.25, 0.88, -0.39, -0.10, 0, s * 0.12);
    P.add('turretDark', box(0.080, 0.09, 0.19), 0.50 + s * 0.22, 0.93, -0.19, -0.18, 0, s * 0.12);
  }
  P.add('turret', box(0.50, 0.060, 0.34), 0.50, 0.99, -0.39, 0, 0, 0.02);
  P.add('turretDark', box(0.34, 0.24, 0.25), 0.88, 0.91, -0.41);
  P.add('turretDetail', box(0.32, 0.20, 0.23), 0.88, 0.92, -0.41);
  const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'nsvt', scale: 0.88, tone: 'dark', ammo: true, elev: -0.04, seed: 184 });
  mg.position.set(0.50, 0.965, -0.31);
  P.turretG.add(mg);

  // Unequal Tucha banks sit on broad cheek blocks and fan up/outward.
  for (const s of [-1, 1]) {
    P.add('turret', box(0.47, 0.13, 0.29), s * 1.04, 0.43, 0.58, -0.21, -s * 0.54, 0);
    const smoke = FITTINGS.smokeBank({ mats: P.mats, count: s < 0 ? 5 : 6, r: 0.043, len: 0.29, pitch: -0.50, splay: s * 0.94, arc: 0.70, spacing: 0.10, rotation: [0, 0, -s * 0.12], slot: 'dark', seed: 188 + s });
    smoke.position.set(s * 1.02, 0.48, 0.62);
    P.turretG.add(smoke);
  }

  // Supported rear bins and basket turn the compact welded tail into a
  // mechanical service field.  Side returns and diagonal braces make the
  // open negative space load-bearing in both yaw states.
  for (const [x, z, w, d, h] of [[-0.91, -0.91, 0.42, 0.43, 0.25], [-0.37, -1.13, 0.50, 0.35, 0.24], [0.25, -1.16, 0.54, 0.34, 0.27], [0.88, -0.94, 0.44, 0.41, 0.23]]) {
    P.add('turretDetail', box(w, h, d), x, 0.32, z, 0, x * 0.06, 0);
    P.add('turretDark', box(w * 0.82, 0.024, d * 0.74), x, 0.32 + h * 0.52, z, 0, x * 0.06, 0);
  }
  for (const y of [0.16, 0.44]) P.add('turretDetail', box(2.24, 0.034, 0.034), 0, y, -1.52);
  for (let i = 0; i < 7; i++) P.add('turretDetail', box(0.032, 0.31, 0.032), -1.05 + i * 0.35, 0.30, -1.52);
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.034, 0.034, 0.58), s * 1.11, 0.44, -1.27, 0, -s * 0.24, 0);
    P.add('turretDetail', box(0.034, 0.31, 0.034), s * 1.11, 0.30, -1.47);
    P.add('turretDetail', box(0.034, 0.34, 0.48), s * 1.05, 0.30, -1.29, 0, -s * 0.32, s * 0.18);
  }
  P.add('turretDetail', cylZ(0.11, 0.60, 14), -1.10, 0.45, -0.93, 0, -0.18, 0);
  P.add('turretDark', cylZ(0.118, 0.038, 14), -1.10, 0.45, -1.245, 0, -0.18, 0);
  P.add('turretDetail', box(0.30, 0.23, 0.36), 1.06, 0.37, -0.85, 0, 0.12, 0);

  // Two unequal antennas end in broad collars on the rear roof.
  for (const [x, z, h, lean] of [[-0.87, -0.64, 1.14, 0.035], [0.94, -0.56, 0.84, -0.030]]) {
    P.add('turretDark', cylY(0.078, 0.088, 0.078, 12), x, 0.69, z);
    P.add('turretDark', cylY(0.020, 0.013, h, 8), x, 0.73 + h * 0.50, z, lean, 0, 0);
  }

  // KBA-3/2A46M-class gun, embedded in the welded shoulder seat.
  P.gunG.position.set(0, 0.315, 0.62);
  ruSaddle(P, { rollR: 0.15, rollW: 0.42, tubeR: 0.128, rootR: 0.30, rootL: 0.68 });
  tubeGun(P, [
    [0.56, 1.98, 0.142, 0.128, 0, -0.040],
    [1.98, 2.76, 0.132, 0.130, 0, -0.048],
    [2.76, 5.74, 0.128, 0.128, 0, -0.054],
  ], { rings: [[3.60, 0.134, 0, -0.054], [4.38, 0.134, 0, -0.054], [5.14, 0.134, 0, -0.054]], muzzle: 5.74 });
  muzzleBore(P, { r: 0.128, y: -0.054 });
  P.add('gunDark', box(0.030, 0.030, 2.35), 0, 0.10, 1.84);
}

function addT80WheelFaces(P) {
  const { box, cylX } = KIT;
  const wheelZs = [-1.60, -0.88, -0.16, 0.56, 1.28, 2.00];
  for (const side of [-1, 1]) {
    const trim = side < 0 ? 'hullTrackTrimL' : 'hullTrackTrimR';
    const detail = side < 0 ? 'hullTrackDetailL' : 'hullTrackDetailR';
    for (const z of wheelZs) {
      const x0 = side * 1.466;
      P.add(trim, cylX(0.315, 0.315, 0.030, 20), x0, 0.44, z);
      P.add(detail, cylX(0.245, 0.225, 0.036, 18), x0 + side * 0.026, 0.44, z);
      P.add(trim, cylX(0.084, 0.084, 0.046, 16), x0 + side * 0.052, 0.44, z);
      P.add(detail, cylX(0.040, 0.040, 0.052, 14), x0 + side * 0.070, 0.44, z);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        P.add(trim, cylX(0.012, 0.012, 0.050, 8), x0 + side * 0.073, 0.44 + Math.sin(a) * 0.145, z + Math.cos(a) * 0.145);
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.20;
        P.add(trim, box(0.018, 0.055, 0.020), x0 + side * 0.074, 0.44 + Math.sin(a) * 0.205, z + Math.cos(a) * 0.205, a, 0, 0);
      }
    }
    // Distinct idler and final-drive faces preserve the required mechanical
    // order: front idler, six road wheels, support rollers, rear sprocket.
    P.add(trim, cylX(0.180, 0.180, 0.032, 18), side * 1.466, 0.86, 2.72);
    P.add(detail, cylX(0.105, 0.105, 0.040, 16), side * 1.492, 0.86, 2.72);
    P.add(trim, cylX(0.225, 0.225, 0.032, 18), side * 1.466, 0.95, -2.55);
    P.add(detail, cylX(0.118, 0.118, 0.040, 16), side * 1.492, 0.95, -2.55);
  }
}

function addT80HullServiceDetail(P, v) {
  const { box, cylX, cylZ } = KIT;
  // Backed turbine transom: unequal louvre bays, exhaust/service plate,
  // recovery eyes and light clusters.  All parts stay between the track
  // lanes and above the raised shoe transitions.
  P.add('hullDark', box(1.64, 0.46, 0.035), -0.05, 1.18, -3.365);
  for (let i = 0; i < 5; i++) {
    P.add('hullDetail', box(i < 3 ? 0.76 : 0.62, 0.028, 0.045), i < 3 ? -0.39 : 0.47, 1.03 + (i % 3) * 0.11, -3.39);
  }
  P.add('hull', box(0.58, 0.32, 0.055), -0.54, 1.27, -3.39);
  P.add('hull', box(0.48, 0.25, 0.055), 0.58, 1.30, -3.39);
  P.add('hullDark', box(0.44, 0.17, 0.025), 0.58, 1.30, -3.423);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.19, 0.15, 0.06), s * 1.02, 1.20 + (s > 0 ? 0.06 : 0), -3.36);
    P.add('hullDark', box(0.12, 0.07, 0.025), s * 1.02, 1.23 + (s > 0 ? 0.06 : 0), -3.397);
    P.add('hullDetail', cylZ(0.060, 0.050, 12), s * 0.83, 0.92, -3.39, Math.PI / 2, 0, 0);
    P.add('hullDark', cylZ(0.082, 0.040, 12), s * 0.83, 0.92, -3.417, Math.PI / 2, 0, 0);
  }
  P.add('hullDetail', box(0.90, 0.055, 0.055), -0.16, 0.86, -3.40);

  // Engine-deck and bow service cadence visible from the elevated profile.
  P.add('hullDark', box(1.70, 0.022, 0.68), 0, 1.495, -2.08);
  for (let i = 0; i < 7; i++) P.add('hullDetail', box(1.58, 0.018, 0.035), 0, 1.512, -1.80 - i * 0.09);
  for (const s of [-1, 1]) {
    // Shoulder cassettes sit above the idler wrap; the first pass reused the
    // old low light datum and entered the raised terminal shoes by 3 cm.
    P.add('hull', box(0.30, 0.17, 0.24), s * 1.18, 1.47, 2.76, -0.20, -s * 0.24, 0);
    P.add('hullDark', box(0.20, 0.08, 0.030), s * 1.18, 1.48, 2.89, -0.20, -s * 0.24, 0);
    P.add('hullGlass', box(0.12, 0.06, 0.025), s * 1.18, 1.49, 2.91, -0.20, -s * 0.24, 0);
  }
  // Variant-specific rear identity without changing the hull outline.
  if (v === 2) {
    for (let i = 0; i < 3; i++) P.add('hullDetail', box(0.26, 0.14, 0.05), -0.70 + i * 0.32, 1.43 + (i % 2) * 0.04, -3.35);
  } else {
    P.add('hullDetail', cylX(0.11, 0.92, 12), 0.48, 1.49, -3.24, 0, 0, 0.04);
    P.add('hullDark', cylX(0.118, 0.035, 12), 0.04, 1.49, -3.24, 0, 0, 0.04);
  }
}

function buildT80Line(P, v) {
  // v: 0 = T-80 (no ERA), 1 = T-80B (brow applique + 902 smokes),
  //    2 = T-80BV (Kontakt-1 field: cheeks via the k1 arc + glacis raft)
  const { box, cylX, cylY, cylZ, buildRunningGear } = KIT;
  loftHull(P, {
    // r26: nose pulled to 3.17 — the ref bow plan is an ARROW (center
    // 3.13-3.16; the wedge/corner kit below carries the diagonals to 3.44).
    // r27 re-phase to the batch-33 compressed ends (fresh gate-faithful
    // probe, proc-frame): the ref bow center now reads 3.02@|x|<0.35 ->
    // 3.09@0.55 -> 3.27@0.80 (nose 3.17 -> 3.05; the corner stacks keep
    // hullLengthM body at 3.41 so dims hold); the ref STERN is an
    // overhanging deck — bottoms rake 0.71@-2.96 -> 1.23@-3.23 -> lip
    // 1.43@-3.36 (the old 0.52@-2.86 belly rake printed 0.25-0.39 err on
    // the three worst side columns of both t80 and t80b).
    deck: [[-3.26, 1.43], [-2.90, 1.41], [-2.55, 1.44], [-1.95, 1.465], [-1.66, 1.503], [-1.36, 1.503], [-1.10, 1.458], [1.25, 1.44], [1.55, 1.452], [1.80, 1.44], [2.00, 1.415], [2.12, 1.345], [2.30, 1.32], [2.44, 1.283], [2.58, 1.232], [2.96, 1.235], [3.05, 1.19]],
    belly: [[-3.26, 1.35], [-3.16, 1.12], [-3.06, 0.90], [-2.96, 0.725], [-2.86, 0.73], [-2.60, 0.44], [2.60, 0.44], [2.88, 0.55], [3.05, 0.72]],
    wUp: [[-3.26, 1.28], [3.05, 1.28]],
    wLo: [[-3.26, 1.05], [3.05, 1.02]],
    // First-party terminal corridor: the turbine hull keeps its low 0.82 m
    // centre sponson datum, but the underside rises above the native
    // sprocket/idler wraps before reaching either end.  The earlier scalar
    // floor ran the full 2.56 m hull width straight through the visible shoe
    // course; decorative strips below then disguised the penetration.  A
    // real T-80 has open wheel wells beneath the overhanging stern and
    // fender shoulders, so encode that structure in the loft itself.
    sponsonY: [[-3.26, 1.42], [-2.32, 1.42], [-2.18, 0.82], [2.36, 0.82], [2.46, 1.20], [3.05, 1.20]],
  });
  // rear side-hump band (turbine deck): raked top 1.86 -> 1.70, recessed
  // center channel. r26: everything below the 1.24 lip pulls forward of
  // -3.30 — the ref stern fades to an overhanging deck (side col -3.33
  // reads 1.28..1.88). Mask ends stay HARD at ±3.39: the r26a ±3.44
  // extension read hullLengthM 6.93/7.03 by grid phase (dims -9/-22) and
  // was reverted — the certified-long oracle keeps its ~2-col end miss.
  const hy = 0;  // (r25f: BV smallness left as a structural residual — see
                 // the squash post-mortem note at the turret section)
  for (const s of [-1, 1]) {
    // r27 stern re-phase (compressed-ref probe, proc frame): the hump band
    // ends -3.30 (ref top 1.836@-2.98 but only 1.711@-3.36); a full-width
    // LIP STEP carries the -3.30..-3.39 columns at the ref's 1.43..1.71
    // band (y 1.405 keeps the band > the 12% body cut so hullLengthM's
    // rear anchor stays at -3.39) and reaches x 1.76 (ref plan rear -3.35
    // at the ±1.70 column, station-0 width 3.387); the top band gains a
    // 1.79 forward step to -2.845 (ref holds 1.774@-2.86, cliff by -2.73).
    // (r27c: hump rear -3.30 -> -3.27 — its last sliver crossed the -3.276
    // column boundary and printed 1.86 into the -3.34 column whose ref
    // tops at 1.745; the lip deepens to meet it.)
    P.add('hull', box(0.875, 0.45, 0.215), s * 1.2175, 1.635 + hy, -3.1625);  // top 1.86, z -3.27..-3.055
    // (r27b: lip x-span to 1.65 — the fresh front columns prove the ref's
    // lip band ends by x 1.65: front cols ±1.68..1.76 read 1.11-1.23 and
    // only the PLAN ±1.70 column's window catches the outer sliver for its
    // -3.35 rear; a 1.76-wide try printed 1.68 into six front columns, -20
    // pts. r27c: the LEFT print's lip stops at 1.62 — the gate's -1.69
    // plan column reads rear -2.91 on the left while the right reads
    // -3.35 (print asymmetry, t80 fender class).)
    P.add('hull', box(s < 0 ? 0.82 : 0.85, 0.305, 0.12), s * (s < 0 ? 1.21 : 1.225), 1.56 + hy, -3.33);  // lip 1.405..1.71 to -3.39
    P.add('hull', box(0.885, 0.155, 0.11), s * 1.2125, 1.7125 + hy, -2.90);  // 1.79 fwd step z -2.955..-2.845
    // (r27c: plate rear face pulled off the -3.15 column boundary,
    // BODY-EDGE PIN)
    P.add('hull', box(0.90, 0.39, 0.19), s * 1.21, 1.215, -3.045);  // rear plate 1.02..1.41, z -3.14..-2.95
    // fender/stow runs at the 1.21-1.25 line feeding the long mid-deck cols
    // (r27b: widened to x 1.715 — the compressed ref's ±1.66..1.72 front
    // columns read the 1.22-1.23 fender line, not the skirt top)
    // Stop the long fender before the idler climb.  The old z=2.65 end
    // crossed the first two raised shoes; the separate bow shoulders below
    // take over visually from z=2.40.
    P.add('hull', box(0.455, 0.14, 4.35), s * 1.4875, 1.19, 0.225);
  }
  // engine-deck center furniture: louvre field + intake hump on the 1.503
  // plateau, dark grilles (decor; tops stay under the loft plateau line)
  P.add('hullDark', box(1.60, 0.02, 1.05), 0, 1.462, -1.95);
  for (let k = 0; k < 5; k++) P.add('hullDetail', box(1.52, 0.02, 0.05), 0, 1.468, -1.62 - k * 0.15);
  P.add('hull', box(0.95, 0.06, 0.58), 0.40, 1.472, -1.50);
  // glacis dress: splash ridge at the ref's 1.27 brow (z 2.70..2.86), driver
  // periscopes, V-board, headlights, tow eyes
  P.add('hull', box(1.90, 0.045, 0.16), 0, 1.253, 2.78);
  // (r27c: eyeY 0.63 — the default 0.50 tori bottomed 0.40 in the z 3.03
  // window whose compressed-ref floor is 0.525)
  ruGlacisKit(P, { w: 3.0, y: 1.15, z: 2.72, eyeX: 0.82, eyeZ: 3.02, eyeY: 0.82, hookY: 0.82, hookZ: 3.12, hlY: 1.26 });
  // bow fender corners: the ARROW plan — diagonal wedge edges 3.17@x0.40 ->
  // 3.44@x1.30 (ref staircase 3.13/3.22/3.31/3.41), corner shelves at 3.44
  // (half of the certified-long ref corners, inside the 1% grace), and the
  // mudguard tips that own the ref's 0.84 bow floor at z 3.45.
  for (const s of [-1, 1]) {
    // r27: arrow re-lined to the compressed ref (3.02@0.35 -> 3.09@0.55 ->
    // 3.27@0.80, slow-then-steep two-segment diagonal); corner boxes widen
    // to the pub face 1.76 (ref plan front 3.40 at the ±1.70 column).
    P.add('hull', box(0.33, 0.10, 0.05), s * 0.46, 1.11, 3.075, 0, -s * 0.273, 0);
    P.add('hull', box(0.57, 0.10, 0.05), s * 0.83, 1.11, 3.275, 0, -s * 0.624, 0);
    // (r27c: pocket at (0.82, 3.06) — at (0.75, 3.12) its corner printed
    // 3.21 into the ±0.56 plan columns whose ref front is 3.08)
    P.add('hull', box(0.38, 0.07, 0.18), s * 0.82, 1.10, 3.06);   // arrow pocket fill (SSB2 hole cells at +-0.77,3.18)
    // (r27c: corners end 1.745 — 1.76 leaked the ±1.82 plan window whose
    // ref front is the 2.95 skirt line)
    P.add('hull', box(0.945, 0.10, 0.21), s * 1.2725, 1.10, 3.285);    // f 3.39
    P.add('hull', box(0.945, 0.05, 0.10), s * 1.2725, 1.155, 3.34);
    // (r27c: first flap 0.85 -> 0.945 — its 0.70 bottom sat under the
    // compressed ref's 0.795 floor at the z 3.28 window)
    P.add('hullRubber', box(0.34, 0.30, 0.045), s * 1.38, 0.945, 3.30);
    P.add('hullRubber', box(0.34, 0.30, 0.045), s * 1.38, 0.99, 3.3675);
    // r27: rear flaps forward to the compressed ref's stern floor (their
    // 0.87 bottoms at -3.24 printed under the new 1.20 undercut line)
    P.add('hullRubber', box(0.34, 0.26, 0.045), s * 1.36, 1.00, -3.10);
  }
  // rear plate kit: turbine grille + fuel drums + unditching log (owner law).
  // r27: the compressed ref's stern floor moved — bottoms now rake
  // 0.71@-2.96 -> 1.23@-3.23 (was the r26 "0.81-0.87 floor to -3.21"), so
  // the grille/ribs/log/flaps ride the new undercut: everything stays
  // above the belly rake line and the log's 0.87 bottom seats at -3.00
  // where the ref floor is ~0.81-0.85.
  P.add('hullDark', box(1.20, 0.32, 0.05), 0, 1.19, -3.095);
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(1.16, 0.04, 0.05), 0, 1.05 + k * 0.09, -3.085);
  for (const s of [-1, 1]) {
    // (r27c: drums z -3.15 -> -3.12 — their rear sliver crossed the -3.276
    // column boundary and printed 1.83/1.26 into the lip-only -3.34 column)
    P.add('hullDetail', cylY(0.135, 0.135, 0.58, 12), s * 1.02, 1.55, -3.12, 0, 0, s * 0.08);
    P.add('hullDark', cylY(0.14, 0.14, 0.03, 12), s * 1.02, 1.815, -3.13, 0, 0, s * 0.08);
  }
  P.add('hullWood', cylX(0.10, 1.95, 10), 0, 0.97, -3.00);
  for (const s of [-0.5, 0.5]) P.add('hullDark', cylX(0.107, 0.04, 10), s * 1.5, 0.97, -3.00);
  KIT.towCable(P, [[-1.02, 1.30, 2.72], [0, 1.34, 2.42], [1.02, 1.30, 2.72]]);
  // §B3.2 DENSITY (owner directive 2026-08-06): common kit FLUSH on the
  // deck lines (t84 recipe — hull mask is hull-only, no tall deck kit).
  // §H.4 VARIANT VARIETY: mirrored seats + seeds per mark so the three
  // T-80s read distinct in the garage.
  {
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 4, width: 0.5, seed: 7 + v });
    links.position.set(v === 1 ? -0.58 : 0.58, 1.395, v === 2 ? 0.30 : 0.60);
    P.hullG.add(links);
  }
  // running gear: pt91m r25 corner-pad recipe from birth — flat dies at the
  // ref's ground reads (rear -1.90 / front +2.33), dip zones land inside
  // ground columns, steep diagonals keep the link pads above the strips.
  buildRunningGear(P, {
    // r26: trackW 0.66 -> 0.57 @ xc 1.315 — the ref front view shows BELLY
    // (0.44 floor) at |x| 0.94..1.01; its track band runs |x| 1.03..1.60.
    style: 'dished', wheelR: 0.335, wheelW: 0.21, wheelY: 0.44, xc: 1.345, dishR: 0.80,
    wheelZs: [-1.60, -0.88, -0.16, 0.56, 1.28, 2.00],
    sprocket: { z: -2.55, y: 0.95, r: 0.235 }, idler: { z: 2.72, y: 0.86, r: 0.19 },
    rollers: [-1.24, -0.52, 0.20, 0.92, 1.64].map((z) => ({ z, y: 0.86, r: 0.08 })),
    // r27: botY 0.06 — a corner-pad dip read the whole-mask floor -0.010
    // on t80's grid phase and pushed heightM to 2.225 (0.14% over grace).
    trackW: 0.58, topY: 0.85, botY: 0.06, paintedEnds: true, coveredTop: true, arms: true,
  });
  // The old "gear-fade" bars were hull-owned shadow geometry laid directly
  // through the native shoe path.  The actual linked course and raised
  // terminal loft now own this silhouette; no proxy solids occupy the lane.
  // skirts: outer face at the EXACT pub width (±1.76) but THICK panels
  // (r26: the ref front view fills x 1.64..1.76 — a 0.032 sheet left lerp
  // junk in the 1.68 column), band re-seated to the ref's 0.82..1.17 line.
  // BV: the print wears the short K-1 skirt (front bottom line 1.049).
  // r27: skirt z-window pulled to the compressed ref's outer-column span
  // (plan ±1.75..1.80 cols read z -2.66..2.96 in the ref vs the old
  // -2.93..3.30 band — the two outermost plan columns carried 0.31 err
  // each); yTop 1.16 -> 1.10 (ref front cols ±1.70..1.77 top 1.101).
  ruSkirtBand(P, { x: v === 2 ? 1.744 : 1.71, th: v === 2 ? 0.032 : 0.10, z0: v === 2 ? -2.93 : -2.66, z1: v === 2 ? 3.30 : 2.96, yTop: v === 2 ? 1.23 : 1.10, yBot: v === 2 ? 1.03 : 0.79, panels: 7, lipX: 1.727, dressIn: 0.012, lipY: v === 2 ? 1.045 : 0.805 });
  if (v !== 2) for (const s of [-1, 1]) P.add('hullTrack', box(0.10, 0.37, 0.09), s * 1.67, 1.045, 3.345);
  // K-1 skirt front plates (BV only; faces stay inside the pub width)
  if (v === 2) for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    P.add('hullTrack', box(0.028, 0.42, 0.50), s * 1.745, 0.95, 2.98 - i * 0.55);
  }

  // ---- turret: wide cast dome, crown 2.20 ----
  // (r25f: BV group y/z-squash attempts BOTH regressed — hull and turret
  // rigs squash independently, shearing their mutual registration, and the
  // stations/dims interplay pins the heights. The BV print's ~4.4%
  // under-scale after width normalization stays a structural residual for
  // a certification ruling next round.)
  // All three marks share the same ring/deck seat.  The former BV-only
  // 5 cm drop compensated for the recovered print's smaller envelope, but
  // made the authored vehicle 2.5% too short and visually sank its casting
  // into the hull.  K-1 changes the protection package, not the turret-ring
  // datum, so keep the family seat common and let the bricks supply their
  // own roof height.
  P.turretG.position.set(0, 1.45, 0.0);
  // r26 dome recalibration from the registered tables: the ref crown is
  // WIDE-FLAT at 2.22-2.25 (raised crown 2.23, +1.4% inside the dims-grace
  // budget) with a LOW front-edge falloff (front cols 2.03@±1.19, 2.07@±1.05
  // — the old rings read 2.11-2.17 there); plan bias cz +0.22. The side
  // 2.16 line at z 1.05..1.35 is NOT the lathe (a revolve cannot hold both
  // views) — the hood step carries it.
  // (r27c: v0/v1 apex 0.75 -> 0.735 — the lathe apex tied the crown box at
  // 2.20 and pinned heightM's p95 with the quantization+pad-dip stack; the
  // crown BOX is the single p95 carrier now. BV list untouched.)
  const ringsT = v === 2
    ? [[1.44, 0.06], [1.465, 0.42], [1.435, 0.47], [1.28, 0.655], [1.19, 0.69], [0.80, 0.74], [0.02, 0.75]]
    : [[1.44, 0.06], [1.465, 0.40], [1.435, 0.44], [1.30, 0.545], [1.19, 0.585], [1.05, 0.615], [0.86, 0.68], [0.60, 0.72], [0.02, 0.735]];
  meshDome(P, ringsT, 0.88, 0, v === 2 ? 0.17 : 0.22);
  // crown plate: the ref roof is FLAT 2.20-2.25 with a falloff beyond — the
  // compressed ref's front profile now falls continuously from ±0.60
  // (2.19@0.54 -> 2.05@1.02 -> 1.96@1.05), which the lathe already tracks;
  // the old 2.04-wide plate printed 2.22 into the ±0.94..1.05 columns
  // (+0.15 err class). Top 2.2215 keeps the heightM p95 anchor over the
  // same 10 side columns.
  // (r27b/c: crown y 0.749 -> 0.72 — MEASURED: the trace reads the crown
  // +1.5 px of MSAA bleed (authored 2.20 read raw 2.217) and heightM
  // stacks the -0.008 pad-dip floor on top (2.225, 0.14% over grace).
  // Authored 2.1925 reads ~2.2175 -> 0.79%, inside grace with margin; the
  // compressed ref's own bodyTop is 2.207, under a mask pixel away.)
  if (v !== 2) P.add('turret', box(1.24, 0.045, 1.25), 0, 0.72, 0.125);
  // r27: LEFT crown shelf — the compressed ref's falloff is asymmetric
  // (left cols -1.04..-1.20 hold 2.14-2.18 where the right reads 1.96-2.05)
  if (v !== 2) P.add('turret', box(0.36, 0.05, 0.90), -1.06, 0.695, 0.10);
  // hidden turret-node carrier: the ref turret mask bottoms 0.715 (print
  // bakes hull-side kit into the turret node). r27: the two compressed
  // prints DIFFER here — t80's apron zone ends by -0.40 (its old -0.475
  // rear left the -0.48 side column reading 0.62 where the fresh ref
  // bottoms at 1.43, the turret p95 driver) while t80b's print keeps the
  // apron out to -0.47 (trimming it read 0.42 err the other way).
  // (r27b: the t80b apron's FRONT end reaches +1.10 — the +1.04 side column
  // reads its ref bottom at 0.675; the rear -0.44 keeps the -0.35 column.)
  P.add('turretDark', box(1.00, 0.78, v === 1 ? 1.54 : 1.40), 0, -0.40, v === 1 ? 0.33 : 0.30);
  // mantlet hood + saddle root own the ref's 1.94-2.06 side band over
  // z 1.19..1.75; the V-nose dust cover carries 1.9 out to z 1.98.
  if (v === 2) {
    // §B3.1 (prism sweep 2026-08-06): the mantlet block is the cast collar
    // under the boot — elliptical frustum, same plan/side extremes at the
    // center axes (masks read identical rectangles); fold ring inside.
    P.addGunExtra(KIT.xform(cylZ(0.5, 0.34, 16, 0.465), 0, 0, 0, 0, 0, 0, [0.46, 0.32, 1]), 0, 0.02, 0.72);
    P.addGunExtraDark(KIT.xform(cylZ(0.5, 0.035, 14), 0, 0, 0, 0, 0, 0, [0.43, 0.295, 1]), 0, 0.015, 0.80);
    // §B3: V-nose dust cover keeps its certified masses + fold-crease
    // strips flush on the faces (canvas grammar, zero growth).
    P.add('turret', box(0.30, 0.20, 0.14), 0, 0.24, 1.70);
    P.add('turret', box(0.56, 0.26, 0.36), 0, 0.22, 1.44);
    P.add('turretDark', box(0.29, 0.02, 0.008), 0, 0.26, 1.766);
    P.add('turretDark', box(0.55, 0.02, 0.008), 0, 0.25, 1.616);
    // §B3.2 (2026-08-06): PKT coax port right of the tube — stub + washer
    // flush-recessed in the V-cover face (all inside its rects).
    P.add('turretDark', KIT.xform(cylZ(0.020, 0.06, 8), 0, 0, 0), 0.17, 0.26, 1.588);
    P.add('turretDark', KIT.xform(cylZ(0.030, 0.012, 10), 0, 0, 0), 0.17, 0.26, 1.612);
    // §B3.1: the right sight is a DRUM (0.26 box -> r 0.13 cylinder:
    // inscribed circle, side/plan rectangles identical) + round lens.
    P.add('turretDetail', KIT.xform(cylZ(0.13, 0.24, 14), 0, 0, 0), 0.55, 0.40, 0.96);
    P.add('turretDark', KIT.xform(cylZ(0.122, 0.014, 14), 0, 0, 0), 0.55, 0.40, 1.082);
    P.add('turretGlass', KIT.xform(cylZ(0.09, 0.02, 14), 0, 0, 0), 0.55, 0.40, 1.09);
  } else {
    // §B3.1 (prism sweep 2026-08-06): boot mass hanging under the hood —
    // elliptical frustum (same extremes), fold ring, clamp hidden under
    // the hood line.
    P.addGunExtra(KIT.xform(cylZ(0.5, 0.40, 16, 0.465), 0, 0, 0, 0, 0, 0, [0.46, 0.50, 1]), 0, -0.10, 0.75);
    P.addGunExtraDark(KIT.xform(cylZ(0.5, 0.035, 14), 0, 0, 0, 0, 0, 0, [0.43, 0.47, 1]), 0, -0.105, 0.84);
    // r27: hood/step dropped to the compressed ref's side band (hood zone
    // tops read 1.905-2.015 where the old 2.00/2.16 pair sat +0.10)
    P.add('turret', box(1.30, 0.32, 0.50), 0, 0.34, 1.44);
    P.add('turret', box(0.90, 0.12, 0.24), 0, 0.545, 1.155);
    P.add('turret', box(0.30, 0.40, 0.28), 0, 0.26, 1.84);
    // §B3.2 (2026-08-06): PKT coax port right of the tube — stub + washer
    // flush-recessed in the hood face (z<=1.689 vs the 1.69 face).
    P.add('turretDark', KIT.xform(cylZ(0.022, 0.06, 8), 0, 0, 0), 0.30, 0.30, 1.658);
    P.add('turretDark', KIT.xform(cylZ(0.032, 0.012, 10), 0, 0, 0), 0.30, 0.30, 1.683);
    // §B3: nose cover fold creases + dark end seam, flush on the box faces.
    P.add('turretDark', box(0.29, 0.02, 0.008), 0, 0.30, 1.976);
    P.add('turretDark', box(0.29, 0.35, 0.008), 0, 0.245, 1.9755);
    // Luna IR seated right of the mantlet (ref plan front 1.81 at x 0.6-0.85)
    // §B3.1: Luna is a SEARCHLIGHT DRUM (0.26 box -> r 0.13 cylinder:
    // inscribed circle keeps both mask rectangles) + rim + round lens.
    P.add('turretDetail', KIT.xform(cylZ(0.13, 0.24, 14), 0, 0, 0), 0.72, 0.35, 1.62);
    P.add('turretDark', KIT.xform(cylZ(0.122, 0.014, 14), 0, 0, 0), 0.72, 0.35, 1.742);
    P.add('turretGlass', KIT.xform(cylZ(0.09, 0.02, 14), 0, 0, 0), 0.72, 0.35, 1.75);
  }
  // cheek staircase + flank slabs (ref plan fronts 1.31@±1.0, 1.12@±1.3,
  // 0.9@±1.45; flank rears +0.1@±1.33 — the old shoulder run owned the
  // ±1.30 rear columns 0.6 too deep)
  for (const s of [-1, 1]) {
    P.add('turret', box(0.34, 0.30, 0.46), s * 1.00, 0.22, 1.08, 0, s * 0.42, 0);
    if (v === 2) {
      P.add('turret', box(0.30, 0.26, 0.40), s * 1.28, 0.16, 0.55, 0, s * 0.72, 0);
      P.add('turret', box(0.40, 0.34, 1.10), s * 1.10, 0.14, -0.08, 0, s * 0.08, 0);
      P.add('turretDetail', box(0.36, 0.05, 0.9), s * 1.11, 0.335, -0.10, 0, s * 0.08, 0);
    } else {
      // r27: cheek chain raised — t80's compressed ref holds 2.13-2.14 at
      // ±1.14..1.27 and 1.98-1.99 out to ±1.45 (the old 1.74 tops read
      // -0.25 over ten front columns); side stays hood-covered. r27c: the
      // raises are t80-ONLY — t80b's print reads 1.84-1.86 at +1.45..1.49
      // and 2.00 at -1.19..-1.25 (per-print falloffs differ; the shared
      // raise cost t80b's front row 5 columns).
      P.add('turret', box(0.28, v === 0 || s < 0 ? 0.50 : 0.26, 0.40), s * 1.27, v === 0 || s < 0 ? 0.28 : 0.16, 0.72, 0, s * 0.66, 0);
      P.add('turret', box(0.12, 0.24, 0.95), s * 1.33, 0.14, 0.575);
      P.add('turret', box(0.34, 0.34, 1.10), s * 1.07, 0.14, -0.08, 0, s * 0.08, 0);
      // LEFT-only mid-cheek riser (the right side's 1.96-2.05 falloff is
      // the lathe's own line; symmetric would read +0.1-0.17 there).
      // r27b: z pulled 1.06 -> 0.95 — its front edge printed 2.13 into the
      // z 1.29 side column where both refs read 1.955-2.015.
      if (s < 0 && v === 0) P.add('turret', box(0.30, 0.28, 0.44), s * 1.00, 0.54, 0.95, 0, s * 0.42, 0);
      P.add('turretDetail', box(0.36, 0.05, 0.9), s * 1.08, 0.335, -0.10, 0, s * 0.08, 0);
    }
  }
  // commander cupola + Utyos NSVT right (hand receiver keeps the r25c
  // 2.2195 anchor on every variant; the r26 fitting NSVT below owns the
  // ref's 2.34 MG spike for t80/t80b)
  P.add('turret', cylY(0.24, 0.26, 0.10, 14), 0.52, 0.66, -0.42);
  P.add('turretDark', KIT.torus(0.25, 0.018, 14), 0.52, 0.72, -0.42);
  // (r27c: hand receiver 0.7195 -> 0.7075 — its 2.2195 top was a p95
  // candidate in the heightM quantization stack; the compressed ref's own
  // 2.30 spike is the sight head's column now.)
  P.add('turretDark', box(0.09, 0.10, 0.16), 0.55, 0.7075, -0.57);
  P.add('turretDark', cylZ(0.024, 0.58, 8), 0.55, 0.725, -0.14, -0.03, 0, 0);
  P.add('turretDark', cylZ(0.036, 0.11, 8), 0.55, 0.735, 0.17, -0.03, 0, 0);
  P.add('turretDetail', box(0.10, 0.12, 0.18), 0.42, 0.69, -0.60);
  P.add('turret', cylY(0.21, 0.21, 0.045, 14), -0.48, 0.70, -0.36);
  P.add('turretDark', cylY(0.215, 0.215, 0.012, 14), -0.48, 0.735, -0.36);
  if (v !== 2) {
    // left sight head — r27: shifted inboard to x -0.325 (the compressed
    // ref keeps ~2.34 only at the -0.33..-0.39 front columns; at ±0.41..
    // 0.54 it reads 2.19 and the old -0.44 seat printed +0.08 x4 cols).
    // Its z-span still owns the ref's 2.30 side spike at the -0.48 column.
    // r27c: t80b's print has NO left spike (front -0.30..-0.34 reads
    // 2.195, side -0.35 reads 2.135) — its head drops to the 2.19 line.
    P.add('turretDetail', box(0.13, 0.15, 0.13), -0.325, v === 0 ? 0.815 : 0.665, -0.50);
    // rear crown cap: the flattened lathe alone drops to 2.0 behind the
    // ring; r27: the compressed ref holds 2.145 (not 2.19) back to z -0.9,
    // and its left-front reads 2.21 out to x -0.86 — cap dropped and
    // widened left.
    P.add('turret', box(0.83, 0.08, 0.40), -0.445, 0.655, -0.68);
  }
  // gunner sight doghouse left (r27c: cap 0.73 -> 0.70 — its 2.20 top was
  // the second member of the heightM quantization stack with the crown)
  P.add('turret', box(0.38, 0.22, 0.40), -0.45, 0.63, 0.40);
  P.add('turret', box(0.40, 0.04, 0.44), -0.45, 0.70, 0.40);
  // bustle: 2.20-top band, ref underside rake 1.70 -> 1.91 with the rear
  // cliff at -1.58 (the old -1.63 rear face aliased a 0.2 err column).
  // r27: the compressed ref's bustle is RIGHT-BIASED in plan (rear -1.41
  // at +0.95 but only -0.54 at +1.08, and the LEFT ends -0.76 by -0.92) —
  // the symmetric ±0.88 boxes printed -1.40 into the ±0.92..1.08 columns.
  // Main boxes narrow to -0.82..0.88 (BV keeps the guarded symmetric form);
  // the right corner box carries the deep -1.41 read only to x 1.005.
  P.add('turret', box(v === 2 ? 1.76 : 1.70, 0.50, 0.31), v === 2 ? 0 : 0.03, 0.50, -1.245);
  if (v === 2) {
    P.add('turret', box(1.76, 0.36, 0.23), 0, 0.57, -1.515);
  } else {
    P.add('turret', box(0.125, 0.50, 0.31), 0.9425, 0.50, -1.245);
    // r27b: the compressed ref's rear-most bustle column is a THIN
    // 1.95..2.10 lip (the old 1.84..2.20 band read 0.09 both edges at the
    // -1.59 column); tail box pulled to -1.52 so the lip owns the column.
    P.add('turret', box(1.70, 0.36, 0.16), 0.03, 0.57, -1.44);
    P.add('turret', box(1.60, 0.16, 0.06), 0.03, 0.575, -1.58);
  }
  P.add('turretDark', cylX(0.07, 1.5, 10), 0, 0.40, -1.06);
  P.add('turretDetail', box(0.05, 0.05, 0.66), 0.80, 0.46, -0.86, 0, 0.5, 0);
  P.add('turretDetail', box(0.05, 0.05, 0.66), -0.80, 0.46, -0.86, 0, -0.5, 0);
  if (v >= 1) {
    // T-80B brow: forward shelf + spread applique tiles (t80b ref plan
    // front reads 1.74 out to |x| 0.8, 1.43-1.56 to 1.15) + 902 tubes left
    P.add('turret', box(0.50, 0.20, 0.30), -0.86, 0.32, 1.24, 0, -0.50, 0);
    // CHEV (§5.14) -> TIP §5.29 (owner refinement 2026-08-07): the three
    // spread applique tiles per side become TWO flat applique panels
    // MEETING AT THE MANTLET HOOD — tip (±0.64, 1.54) at the hood flank
    // (±0.65), outer end (1.24, 0.99) on the old tile-2 line (42.5deg =
    // the landed 41deg class). Face line proud of the dome plan-front
    // ellipse along the run (t80 critic-conditional mechanism, shared).
    // Tile grammar carried by the 3-seg + row seam grid; §H.4: t80b keeps
    // brow shelf + 902 bank as its marks.
    eraRuCheeks(P, { tip: { x: 0.64, z: 1.54, ox: 1.24, oz: 0.99, y: 0.28, h: 0.30, d: 0.13, tilt: -0.20, segs: 3, rows: 1, gap: false } }, 'tip');
    // r27c: 902 tubes dropped 0.52 -> 0.40 — their tops printed 2.10-2.15
    // into the -1.19..-1.25 front columns where the compressed t80b ref
    // reads its 2.00 dome falloff
    for (let k = 0; k < 4; k++) P.add('turretDark', cylZ(0.040, 0.26, 8), -1.00 - k * 0.09, 0.40 + (k % 2) * 0.03, 0.42 - k * 0.10, -0.45, -(0.9 + k * 0.13), 0);
    // bustle tail bin — r27: the compressed t80b ref's 2.0..2.18 band now
    // ends ~-1.61 (the r26 -1.68 seat read ONLY-PROC on the turret row and
    // 0.36 err on side_whole at the -1.67..-1.80 columns)
    P.add('turret', box(0.30, 0.18, 0.09), -0.55, 0.64, -1.575);
    // r27b: t80b keeps a 2.05..2.18 stowage row over z -0.80..-1.06 (its
    // -0.97 side column read the bare lathe 2.005 vs the ref's 2.185)
    P.add('turret', box(0.72, 0.13, 0.28), -0.35, 0.665, -0.92);
  }
  if (v === 0) {
    // CHEV (§5.14) -> TIP §5.29 (owner refinement 2026-08-07 + the critic
    // wave's t80 CONDITIONAL: "the banks tuck UNDER the fat dome bulge in
    // plan — raise proudness until the read BREAKS the dome silhouette"):
    // the light banks become TWO flat K-1 panels MEETING AT THE MANTLET
    // HOOD — tip (±0.66, 1.56) tucks against the hood flank (hood ±0.65,
    // z 1.19..1.69; the 125mm emerges above/behind the tip), outer end
    // (1.30, 0.94) at the cheek chain. The face line rides 3-9cm PROUD of
    // the dome plan-front ellipse (cz 0.22 + 1.289·sqrt(1-(x/1.465)²))
    // along the whole run — the plan V breaks the dome silhouette (the
    // critic's measured pass condition; tilt top-edge retreat 3.7cm
    // priced in). Still the LIGHTEST fit of the three (§H.4): one clean
    // 3-seg panel pair, no flank field, no lower lip.
    eraRuCheeks(P, { tip: { x: 0.66, z: 1.56, ox: 1.30, oz: 0.94, y: 0.21, h: 0.38, d: 0.13, tilt: -0.20, segs: 3, rows: 0, gap: false } }, 'tip');
  }
  if (v === 2) {
    // T-80BV Kontakt-1: cheek field (tip panels) + flank wrap + glacis raft
    // CHEV (§5.14) -> TIP §5.29 (owner refinement 2026-08-07): the banked
    // brick walls become TWO tall flat K-1 panels MEETING AT THE V-NOSE
    // COVER — tip (±0.30, 1.52) tucks at the cover flank (±0.28,
    // z 1.26..1.62; the gun emerges above/behind the tip), outer end
    // (1.28, 0.72) hands off to the arc brick 3 (flank wrap kept EXACTLY,
    // banksOff law). 39deg V; full 3-course grid (rows 2) = the BV's
    // heaviest-fit §H.4 identity; mid-run half-buries in the dome bulge
    // (the K-1-on-casting hug, §B2 no-air).
    eraRuCheeks(P, { rings: ringsT, sz: 1.05, rCz: 0.0, k1Y: 0.06, k1Pitch: 0.25, k1T0: 0.24, k1Step: 0.22, k1H: 0.22, k1Out: 0.02, k1Chevron: { yaw: 0.78, arcFrom: 3, pitch: 0.30, bw: 0.28, bd: 0.15, d0: 0.05, out: 0.07, banksOff: true } }, 'k1');
    eraRuCheeks(P, { tip: { x: 0.30, z: 1.52, ox: 1.28, oz: 0.72, y: 0.28, h: 0.56, d: 0.15, tilt: -0.18, segs: 4, rows: 2, gap: false } }, 'tip');
    // TIP-round §5.29 equipment: the real T-80BV carries the 902B Tucha
    // bank on the LEFT front cheek — four angled tubes over the new panel
    // line (the b87 902B grammar).
    P.add('turret', box(0.36, 0.05, 0.26), -0.98, 0.60, 0.80, 0, 0.55, 0);
    for (let k = 0; k < 4; k++) {
      P.add('turretDark', cylZ(0.040, 0.26, 8), -0.82 - k * 0.082, 0.64 + (k % 2) * 0.02, 0.98 - k * 0.088, -0.45, -(0.35 + k * 0.11), 0);
    }
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
      // The glacis raft belongs on the centre armor plane, not inside the
      // idler lanes.  Five narrower, overlapping seats preserve the heavy
      // BV blanket while keeping its roots inboard of the native course.
      P.add('hullTrack', box(0.36, 0.11, 0.16), -0.72 + c * 0.36, 0.86 + r * 0.14, 3.20 - r * 0.25, -1.03, 0, 0);
    }
  }
  const dxT = ringSkin(ringsT, 0.30) + 0.02;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [dxT, 0.22, -0.30], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [-dxT, 0.22, -0.30], -Math.PI / 2);
  // ---- 125 mm 2A46M-1. r27 re-read on the COMPRESSED oracle (fresh
  // gate-faithful probe): the ref side band is 1.555..1.868 (0.313 thick,
  // axis 1.7115 — the r26 "axis 1.765 / r 0.112" seat carried a flat 0.047
  // err across ~24 side/turret columns on both variants). A true 0.313
  // cylinder would cross the 12% body cut (0.265-0.275 by camera pitch —
  // the t80-line LANDMINE: tube columns becoming BODY explode hullLengthM)
  // so the working tube runs r 0.128 seated cy -0.054 (band 1.583..1.839,
  // 0.256 thick, inside the r26-proven ceiling); the ±0.03 band residual
  // is the certified circle-law trade. t80b's print keeps its tube to
  // 6.33 — its muzzle extends inside the 1% overall grace (ONLY-REF
  // column + turret cover otherwise). ----
  P.gunG.position.set(0, 0.315, 0.60);
  ruSaddle(P, { rollR: 0.15, rollW: 0.40, tubeR: 0.128, rootR: 0.28, rootL: 0.62 });
  // The BV keeps the same 2A46M-family tube run as the bare T-80.  The old
  // BV-only 5.22 m endpoint copied the shortened recovered-print silhouette
  // and left the authored vehicle 45 cm short of the published 9.66 m family
  // datum.  Keep the B's slightly longer registered endpoint, but do not
  // shorten the BV simply to conform to that incompatible source print.
  const gunEnd = v === 1 ? 5.73 : 5.67;
  tubeGun(P, [
    [0.55, 2.03, 0.128, 0.128, 0, -0.040], [2.03, 2.78, 0.130, 0.130, 0, -0.048], [2.78, gunEnd, 0.128, 0.128, 0, -0.054],
  ], { rings: [[3.60, 0.132, 0, -0.054], [4.40, 0.132, 0, -0.054], [Math.min(5.10, gunEnd - 0.18), 0.132, 0, -0.054]], muzzle: gunEnd });
  muzzleBore(P, { r: 0.128, y: -0.054 });  // §B3.1 turret-lane 2026-08-06 (shadow-named, mask/frame-neutral; all three marks)
  // r25f sleeve clamp plate (pt91m precedent): the ref tube's plan edges
  // (±0.19) own the ±0.16..0.19 plan columns — but only to world 6.04
  // (r26: the full-length plate owned the muzzle-tip plan columns 0.23
  // past the ref). Thin plate at the axis plane: side-invisible inside
  // the tube band, never a body column (0.014 band).
  P.add('gun', box(0.37, 0.014, 4.89), -0.005, -0.056, 2.995);
  // r27: crest fin follows the re-seated band (compressed ref side band
  // 1.555..1.868 — the old 1.59..1.94 fin topped +0.07 over its columns)
  P.add('gun', box(0.022, 0.30, 0.75), 0, -0.054, 2.405);
  // (r25e: a whole-tank z-seat was tried and reverted — the fitted view
  // registration re-centers on the body span, so it is seat-invariant;
  // and turretG is NOT a hullG child, so the seat sheared the rig.)
  if (v !== 2) {
    // §I decoration law: the AA NSVT rides as a KIT fitting (census). The
    // carriage is swung INBOARD (barrel sweeps over the roof toward the
    // gunner's side) so the whole assembly adds only the ref's own 2-col
    // 2.34 MG band in side view (heightM p95 law) — receiver mass covers
    // the ref's right-side 2.35 front spike at x 0.38..0.60.
    // TIP-round §5.29 (owner "more machine guns... PROMINENT" + CROWS
    // law §5.07): the inboard-swung stow read as no-gun — the NSVT Utyos
    // now points FORWARD at full posture: receiver top ~2.31w rides the
    // ref's own 2.29-2.30 MG-spike columns (+0.38..0.46), the drooped
    // barrel runs 2.18-2.26 over the 2.20-2.25 ref crown plateau (§C
    // pintle allowance ≤0.4), ammo can on. scale 0.54 -> 0.68.
    const mg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'nsvt', scale: 0.68, tone: 'dark', ammo: true,
      elev: -0.10,
    });
    // (TIP r2: mount 0.62 -> 0.535 — the 2.31w receiver blew heightM
    // grace on BOTH marks, dims 98.9/100 -> 77.6/77.4 MEASURED: "a cap
    // never excuses dims". Top now ~2.22w = inside the 1% grace; the
    // receiver still pokes ~3cm over the 2.19 crown plate, barrel level.)
    mg.position.set(0.42, 0.535, -0.55);
    P.turretG.add(mg);
  } else {
    // §B3.2 (owner directive 2026-08-06): the T-80BV carries the same
    // commander's NSVT Utyos — the BV lane was the roster's mg0 backlog.
    // Seat INTERIOR to the BV's own turret mask: receiver (swung ry -90,
    // ammo off) lands x 0.277..0.499 / z -0.574..-0.526 INSIDE the cupola
    // footprint (x 0.26..0.78, z -0.68..-0.16, top 0.76) with receiver top
    // 0.698 under both the cupola and the 0.727 dome line at its plan
    // radius; the inboard-swung barrel droops (elev -0.25) under the 0.74+
    // crown apex zone. Mask-neutral add (gate HOLD verified).
    // TIP-round §5.29 (owner "more machine guns... PROMINENT" + CROWS
    // law): the BV's buried inboard-swung NSVT points FORWARD, receiver
    // raised to poke ~3cm over the cupola/dome lines (top ~0.755 local vs
    // cupola 0.76 / dome 0.727) — visible posture at minimum mask cost on
    // the stations-pinned row (its min row is stations 33.7; §C pintle
    // allowance).
    const mg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'nsvt', scale: 0.62, tone: 'dark', ammo: true,
      elev: -0.10,
    });
    mg.position.set(0.42, 0.54, -0.55);
    P.turretG.add(mg);
  }
  // Replace the inherited gate-tuned dome and patch boxes atomically with
  // the current first-party family casting, equipment and cannon package.
  // This deliberately happens after the legacy authoring above so one clear
  // operation removes every old turret bucket and direct fitting together.
  rebuildT80FamilyTurret2026(P, v);
  addT80WheelFaces(P);
  addT80HullServiceDetail(P, v);
  // Open the turbine-hull suspension tunnel over the native six-wheel
  // return.  Only the lower outer sponson vertices move; the arrow bow,
  // overhanging stern, deck and turret stations retain their certified
  // silhouettes for all three marks.
  P.raiseTrackCorridor(['hull'], {
    laneInnerX: 1.00, floorY: 1.28, zMin: -2.36, zMax: 2.52,
  });
  P.topY = 1.20;
}

function buildT80(P) { buildT80Line(P, 0); }

function buildT80B(P) { buildT80Line(P, 1); }

function buildT80BV(P) { buildT80Line(P, 2); }


function buildT84LegacyGate(P) {
  const { box, cylX, cylY, cylZ, slab, buildRunningGear } = KIT;
  // ---- hull loft: ends at the V-bow face 1.99 (plan center truth); the
  // stern boxes own −4.30..−4.86 because the overhang is NOT full width
  // (plan rear −4.71 center / −4.55 notch / −4.86 corners-only).
  // r33 TURRET-SEAT re-anchor (batch-40 coupled round): the oracle's compound
  // seat raised the whole hull upper band (k1 x1.22759 over 0.9919..1.3239,
  // k2 x1.61672 above) to the family 1.3994 ring-deck / 1.4851 hump lines and
  // seated the casting 2.3 cm INTO the deck. Every y >= 0.992 below is the
  // packet map re-derived per element (belly/tracks/widths untouched — the
  // warp was y-only, so wUp/wLo stay; the packet table's "wUp 1.28->1.3456"
  // line is a deck-value leak, x half-widths cannot move on a y-only round).
  // DECK SHOULDER (r33 fresh front row): the seated ref's deck EDGE falls to
  // 1.352-1.392 at |x| 1.02..1.27 while its center rides 1.37-1.41 — a flat
  // full-width 1.4141 loft read +0.03..+0.07 on six front cols per side. The
  // loft deck carries the EDGE line (1.356-1.362); the true center line is
  // the ±1.00 overlay slabs below (side/station reads keep the family deck).
  loftHull(P, {
    deck: [[-4.30, 1.3456], [-4.24, 1.3620], [-2.60, 1.3620], [-2.16, 1.3560], [-0.10, 1.3560], [0.35, 1.3560], [0.55, 1.3200], [0.75, 1.3100], [0.90, 1.2658], [1.45, 1.2130], [1.91, 1.1836], [1.99, 1.0755]],
    belly: [[-4.30, 0.68], [-4.24, 0.655], [-4.22, 0.47], [-4.16, 0.42], [-4.05, 0.37], [-3.30, 0.35], [1.30, 0.35], [1.60, 0.38], [1.90, 0.46], [1.99, 0.50]],
    wUp: [[-4.30, 1.28], [1.99, 1.28]],
    // wLo tapers to 0.94 at both wrap zones: the track's inner pin ends
    // print at x 0.9635 (tmp-t84-aabbprobe) and clipped the 0.98 tub
    // walls where the climbs pass (clip audit 268/302 -> 0)
    wLo: [[-4.30, 0.94], [-3.55, 0.94], [-3.35, 0.98], [1.30, 0.98], [1.50, 0.94], [1.99, 0.94]],
    sponsonY: 1.1492,
  });
  // center deck overlay ±1.00 — the certified k2-mapped deck line (1.4141
  // plateau / 1.3959 -> 1.3714 ring fall), segmented <=0.46 (station law);
  // 60 mm plates sitting ON the shoulder loft, so nothing floats
  {
    const deckLine = [[-4.24, 1.4141], [-2.60, 1.4141], [-2.16, 1.3959], [-0.10, 1.3714], [0.35, 1.3714]];
    const { slab } = KIT;
    for (let i = 0; i < deckLine.length - 1; i++) {
      const [z0, y0] = deckLine[i], [z1, y1] = deckLine[i + 1];
      const segs = Math.max(1, Math.ceil((z1 - z0) / 0.46));
      for (let k = 0; k < segs; k++) {
        const za = z0 + ((z1 - z0) * k) / segs, zb = z0 + ((z1 - z0) * (k + 1)) / segs;
        const ya = y0 + ((y1 - y0) * (za - z0)) / (z1 - z0), yb = y0 + ((y1 - y0) * (zb - z0)) / (z1 - z0);
        P.add('hull', slab(   // plan order (-x,+z),(+x,+z),(+x,-z),(-x,-z) — zb > za
          [-1.00, yb - 0.06, zb], [1.00, yb - 0.06, zb], [1.00, ya - 0.06, za], [-1.00, ya - 0.06, za],
          [-1.00, yb, zb], [1.00, yb, zb], [1.00, ya, za], [-1.00, ya, za]));
      }
    }
  }
  // center belly pan: the ref front view floors 0.23 at |x|<=0.84 with the
  // 0.35 tub step outside — the pan hangs under the 0.35 loft floor and is
  // side-invisible (tracks own those bottoms). Segmented (station law).
  // (r33: pan re-read from the fresh front bottoms — ASYMMETRIC like the
  // print: the −0.816 col reads the 0.35 tub step but +0.82 keeps the 0.224
  // pan, so the pan spans x −0.78..+0.835; faces >=15 mm clear of the
  // ±0.7965/0.857 bins)
  for (let i = 0; i < 10; i++) P.add('hull', box(1.615, 0.135, 0.443), 0.0275, 0.2925, -3.33 + (i + 0.5) * 0.455);
  // engine plateau hump 1.365 over −2.67..−3.05 (x±1.00: front cols ±0.94
  // read 1.38, ±1.03.. read the 1.31 fender line — hump must not own them)
  // engine humps, r33 re-anchor to the FRESH front row: the seated ref's
  // front top falls to the 1.35-1.39 fender line at |x| 1.02..1.27 (the old
  // 0.85..1.27 span mapped to 1.4659 there = +0.07..0.11 x5 cols), rises to
  // 1.452 at ±0.82, and crests 1.4851 only near center — side pair pulled to
  // x 0.78..0.98 (faces >=15 mm off the ±0.9965 front bins) + a center rib
  // at the exact 1.4851 crest (which also lands the SIDE hump cols exactly).
  P.add('hull', box(0.20, 0.065, 0.43), -0.88, 1.4334, -2.835);  // left hump top 1.4659 (fresh front −0.82 col reads 1.452)
  P.add('hull', box(0.10, 0.065, 0.43), 0.83, 1.3955, -2.835);   // right hump inner: top 1.428 (+0.82 col reads 1.434)
  P.add('hull', box(0.10, 0.065, 0.43), 0.93, 1.4395, -2.835);   // right hump outer: top 1.472 (+0.94 col reads 1.474 — the print's humps slope opposite ways)
  for (const s of [-1, 1]) P.add('hull', box(0.07, 0.065, 0.38), s * 0.08, 1.4526, -2.86);  // crest ribs x 0.045..0.115: top 1.4851 EXACT (side 'at' 2.58..3.12 line; the ±0.02 front cols keep the ref's 1.434 center channel)
  for (const s of [-1, 1]) P.add('hull', box(0.66, 0.065, 0.38), s * 0.445, 1.4175, -2.86);  // hump saddles x 0.115..0.775: top 1.450 (fresh front ±0.3..0.5 cols read 1.454)
  P.add('hull', box(1.70, 0.041, 0.24), 0, 1.392, 0.18);      // splash rail (top 1.4125 = map of 1.332; bottom held ON the 1.3714 deck — no float)
  // ---- stern assembly (boxed; loft ends −4.30). The rear face is STEPPED
  // in plan: center block −4.70 (|x|<=0.56), notch −4.51 (0.56..0.88),
  // corner FLAP FINGERS to −4.86 at 0.90..1.00 and 1.18..1.30 with a
  // −4.53 notch between (ref plan bins ±1.026/1.135 read −4.58/−4.48). ----
  P.add('hull', box(0.96, 0.147, 0.42), 0, 1.2228, -4.51);    // center overhang -> −4.72 (1.12..1.24 k1-mapped 1.1492..1.2965)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.38, 0.147, 0.26), s * 0.69, 1.2228, -4.43);       // mid notch -> −4.56
    P.add('hull', box(0.40, 0.147, 0.23), s * 1.10, 1.2228, -4.415);      // corner base -> −4.53
    P.add('hull', box(0.08, 0.147, 0.33), s * 0.92, 1.2228, -4.695);      // flap finger A -> −4.86 (bins ±1.03/1.14 read the −4.53 base)
    P.add('hull', box(0.08, 0.147, 0.33), s * 1.26, 1.2228, -4.695);      // flap finger B -> −4.86
    P.add('hull', box(0.14, 0.299, 0.11), s * 0.35, 1.000, -4.695);       // stern tow hooks (band-deep −4.769 col; top 1.1495 meets the overhang bottom)
    P.add('hullRubber', box(0.18, 0.607, 0.06), s * 1.45, 0.9437, -4.43); // rear corner flaps (plan −4.43..−4.46 @ ±1.38..1.53; hem 0.64 stays)
  }
  P.add('hull', box(1.00, 0.278, 0.40), 0, 1.004, -4.50);     // rear plate center face −4.70 (|x|<=0.50: the ±0.59 plan bins read −4.50)
  for (const s of [-1, 1]) P.add('hull', box(0.24, 0.278, 0.21), s * 0.62, 1.004, -4.405); // plate inner step -> −4.51
  for (const s of [-1, 1]) P.add('hull', box(0.14, 0.278, 0.32), s * 0.81, 1.004, -4.46);  // plate outer step -> −4.62 (ref bin ±0.81 reads −4.61)
  P.add('hull', box(1.00, 0.10, 0.33), 0, 0.815, -4.465);     // exhaust shelf face 0.765 -> −4.63 (sub-0.992: identity zone)
  for (const s of [-1, 1]) P.add('hull', box(0.50, 0.10, 0.21), s * 0.75, 0.815, -4.405);
  P.add('hull', box(2.00, 0.11, 0.14), 0, 0.71, -4.37);       // shelf sub-step 0.655 -> −4.44
  P.add('hullDark', box(0.90, 0.180, 0.03), 0, 1.010, -4.695);  // plate louver (0.92..1.08 -> 0.92..1.10)
  // ---- V-bow corner prongs + nose LIP: plan 2.23 at |x| 0.86..1.70 rides
  // as a thin 0.92..0.99 band (side col 2.23 reads 0.985..0.93 exactly);
  // the prong bodies stop at 2.16, clear of the idler wrap (front <=2.0)
  for (const s of [-1, 1]) {
    // Raised terminal shoulder: its lower face now starts above the final
    // raised shoes and overlaps the first lip course.  The previous deep
    // block reproduced the side outline by passing through the idler run.
    P.add('hull', box(0.42, 0.28, 0.12), s * 1.07, 0.97, 2.10);            // prong body 2.04..2.16, bottom 0.83
    // nose lip, r33 three-stage stair per the fresh side row (ref tops
    // 1.122 @ [..2.066] / 1.04 @ [2.066..2.175] / 0.957 beyond — the flat
    // 0.99 lip read −0.06..−0.13 on the 2.01/2.12 cols); every stage
    // overlaps the prong body (floaters) and the tip keeps the 2.23 plan
    P.add('hull', box(0.84, 0.16, 0.04), s * 1.28, 1.038, 2.03);           // lipA top 1.118 @ 2.01..2.05
    P.add('hull', box(0.84, 0.085, 0.085), s * 1.28, 0.9975, 2.1125);      // lipB top 1.04 @ 2.07..2.155
    P.add('hull', box(0.84, 0.065, 0.08), s * 1.28, 0.925, 2.19);          // tip 0.8925..0.9575 @ 2.15..2.23
    P.add('hullRubber', box(0.10, 0.12, 0.14), s * 0.55, 0.68, 1.93, -0.3, 0, 0);  // bow hooks (plan center 2.00; r32 GROUP 4a: dark-rubber flap class, joined by the center flap below)
    P.add('hull', box(0.42, 0.38, 0.06), s * 1.51, 0.79, 2.12);            // fender splash stubs (front ±1.55 bottom 0.60)
  }
  // low front flaps BEHIND the wrap (front cols ±1.59..1.71 bottom 0.30) —
  // outboard of the track band, clip-free; the side col 1.91 bottom 0.21 is
  // a separate inboard bracket the tracks hide in front view.
  // r32 GROUP 4a-bis: these two members WERE the critic's "four pegs
  // dangling in free air" (probe-identified: rubber flap x 1.59..1.70 +
  // dark bracket x 1.36..1.44 silhouetted at close-front). The flap slides
  // aft onto the splash-stub face (z 2.055, same front columns) and the
  // bracket grows a neck to the stub underside (0.60) — interior fill, the
  // 1.91 side col keeps its 0.21 bottom and the wrap still hides the neck
  // dead-front (wrap front z 2.0 > 1.94).
  for (const s of [-1, 1]) {
    // r33 flap split: the fresh ref bottoms read 0.41 @ the 2.01 col but
    // 0.574 @ [2.066..2.175] — the lower flap course ends 16 mm before the
    // 2.066 bin so only the upper course (bottom 0.575) paints that column;
    // courses overlap each other and the upper keeps the r32 stub kiss.
    P.add('hullRubber', box(0.13, 0.175, 0.06), s * 1.655, 0.6625, 2.055); // upper course 0.575..0.75 @ 2.025..2.085
    P.add('hullRubber', box(0.13, 0.19, 0.04), s * 1.655, 0.505, 2.03);    // lower course 0.41..0.60 @ 2.01..2.05
    // Bracket follows the outboard splash-stub seat instead of piercing the
    // idler lane at x=1.40.  Its companion outer bracket remains adjacent.
    P.add('hullDark', box(0.08, 0.42, 0.06), s * 1.56, 0.40, 1.91);
    // r33 outer bracket pair: the fresh FRONT ±1.58/1.62 cols bottom at
    // 0.304 (ref mud-flap class) — hung in the brackets' z-lane where the
    // side col already bottoms 0.19, so no side row moves
    P.add('hullDark', box(0.065, 0.40, 0.06), s * 1.6075, 0.504, 1.91);
  }
  // fender strip rows FOLLOW the deck taper (ref side tops: 1.33 rear /
  // 1.30 mid / falling glacis line forward — r30's flat 1.315 row owned
  // four glacis cols at +0.10..0.16)
  for (const s of [-1, 1]) {
    // r33 stern fender row as TWO courses (fresh front row): the ref fender
    // steps — 1.33-1.34 at |x| 1.42..1.46, 1.42-1.43 outboard of 1.52 — so
    // the inner course tops 1.345 and the outer 1.417 (under the 1.4141
    // side deck line, so no side column moves); courses overlap 5 mm at
    // x 1.505..1.51 (§B2: no top-down slit)
    for (let i = 0; i < 5; i++) P.add('hull', box(0.20, 0.03, 0.40), s * 1.41, 1.330, -4.28 + (i + 0.5) * 0.42);
    for (let i = 0; i < 5; i++) P.add('hull', box(0.245, 0.03, 0.40), s * 1.6275, 1.402, -4.28 + (i + 0.5) * 0.42);
    for (let i = 0; i < 5; i++) P.add('hull', box(0.44, 0.03, 0.40), s * 1.53, 1.3456, -2.18 + (i + 0.5) * 0.42);
    for (let i = 0; i < 2; i++) P.add('hull', box(0.44, 0.026, 0.44), s * 1.53, 1.2658, -0.06 + (i + 0.5) * 0.46);
  }
  ruDeck(P, { deckY: 1.3824, hatchX: 0.45, hatchY: 1.245, hatchZ: 0.62, periY: 1.1737, gz: -2.56, grilles: 3, gw: 1.10 });  // hatchY held at 1.245 (fresh ref side line @ z 0.82 is 1.292 — the k1-mapped 1.3026 hatch topped it by 0.056; the ref hatch is flush)
  // r32 GROUP 3d (critic r31 driver F, identity read): Kontakt-5 wedge
  // banding on the upper glacis — four low-relief rows following the deck
  // fall (<=18 mm proud at row edges, faces well under a half-pixel in the
  // side columns) + dark seam gaps between. Structure read at close-front
  // 3x; also feeds the glacis-deck edge census (1191-class ref).
  for (const [zr, yr] of [[1.10, 1.2375], [1.31, 1.2228], [1.52, 1.196], [1.70, 1.184]]) {
    P.add('hull', box(2.00, 0.018, 0.16), 0, yr, zr);
    P.add('hullDark', box(1.96, 0.008, 0.03), 0, yr + 0.002, zr + 0.095);
  }
  // r32 GROUP 3c: engine-deck dressing (flat lane — the rear-deck side tops
  // are the 1.365 hump line, so everything here stays <=1.39): spare link
  // run + tow cable draped across the plateau + low tool boxes.
  {
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 4, width: 0.48, seed: 7 });
    links.position.set(-0.62, 1.3640, -3.42);   // recessed flush: top 1.414 on the 1.4141 deck (station i2 reads the deck line)
    P.hullG.add(links);
    const links2 = FITTINGS.spareTrackLinks({ mats: P.mats, links: 3, width: 0.48, seed: 9 });
    links2.position.set(0.72, 1.3640, -3.60);
    P.hullG.add(links2);
    // eyes:false + ends inside stations i2/i3 — the first draped run's end
    // eyes printed 1.394 into the stern slice (station i1 topPct 0.26->3.26)
    const cable = FITTINGS.towCable({ mats: P.mats, eyes: false, pts: [[-0.95, 1.4028, -2.72], [0.2, 1.3996, -3.25], [0.95, 1.4028, -3.78]], seed: 5 });
    P.hullG.add(cable);
  }
  P.add('hullDetail', box(0.52, 0.024, 0.16), -0.80, 1.4141, -3.62);   // left tool tray (right side carries the second link run)
  // fender-bay covers between the strip row end and the nose (top-down
  // hole law: 48-cell enclosed pockets at x ±1.65, z 0.9..1.9). They sit
  // at y 0.805 BETWEEN the track runs (bottom run <=0.11, top run >=0.99)
  // so the top-down mask closes with zero voxel contact.
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    P.add('hull', box(0.28, 0.02, 0.34), s * 1.60, 0.805, 1.03 + i * 0.345);
  }
  // r32 ORDER 0d (§B2, critic r31 V4): pod-flank fill. Dead-front the
  // corridor x 1.53..1.70 / y 0.83..1.14 read 1212/1202px of ENCLOSED SKY
  // (rays clear the splash stubs, duck the fender strips, run inboard of the
  // skirt and out the stern; close-front kept a 170px window of the same
  // family). Deep fender-side boxes at the strips' own certified x-planes
  // (1.53/1.74) block every such ray. Tops FOLLOW THE DECK LINE 4mm under
  // (side-view top columns unchanged); bottoms ride the 0.805 bay covers;
  // x >= 1.53 clears the track band + pin bosses (<=1.5165) at every y, so
  // the clip audit cannot move. Front mask: fills bins the REF renders SOLID.
  for (const s of [-1, 1]) {
    // xi 1.52: the first 1.53 edge left a 1-2px sky hairline against the
    // 1.5165 pad-boss print (52/43px clusters). 1.52 stays clear of every
    // dilated track box in 3D (slab y >= 0.80 vs climb-pad tops <= 0.60).
    const xi = Math.min(s * 1.52, s * 1.74), xo = Math.max(s * 1.52, s * 1.74);
    P.add('hull', slab(                                        // z 0.87..1.31
      [xi, 0.80, 1.31], [xo, 0.80, 1.31], [xo, 0.80, 0.87], [xi, 0.80, 0.87],
      [xi, 1.2167, 1.31], [xo, 1.2167, 1.31], [xo, 1.2584, 0.87], [xi, 1.2584, 0.87]));
    P.add('hull', slab(                                        // z 1.35..1.79
      [xi, 0.80, 1.79], [xo, 0.80, 1.79], [xo, 0.80, 1.35], [xi, 0.80, 1.35],
      [xi, 1.1860, 1.79], [xo, 1.1860, 1.79], [xo, 1.2179, 1.35], [xi, 1.2179, 1.35]));
    P.add('hull', slab(                                        // z 1.83..1.93
      [xi, 0.80, 1.93], [xo, 0.80, 1.93], [xo, 0.80, 1.83], [xi, 0.80, 1.83],
      [xi, 1.1516, 1.93], [xo, 1.1516, 1.93], [xo, 1.1835, 1.83], [xi, 1.1835, 1.83]));
    // nose cap: the r32 flap re-seat (z 2.055) closed a ring around the
    // 1.93..2.09 fender pocket — §B2 top-down scan flagged 1 cell/side.
    // Cap the pocket under the lip line (top 1.04 <= the 1.06 deck end).
    P.add('hull', box(0.22, 0.251, 0.14), s * 1.63, 0.9255, 2.00);  // top 1.051 <= the 1.0755 deck end
    // r32 trench close-out: the fender TRENCH between skirt inner face
    // (1.695) and track outer print (1.5165) ran open the whole hull and
    // exited at the STERN — tilted front-view rays threaded it over the
    // V4 slabs/skirt tops (120px pairs @ y0 1.24..1.28) and along the
    // 1.508..1.53 sliver (52/43px). FLOOR the trench at the bay-cover
    // plane (clear of both wrap zones) and CAP its stern end behind the
    // skirt rear edge (mask-identical: the z −4.38 skirt face already
    // paints those rear bins to 0.64).
    for (let i = 0; i < 10; i++) {
      P.add('hull', box(0.17, 0.02, 0.442), s * 1.605, 0.805, -3.50 + (i + 0.5) * 0.436);
    }
    P.add('hull', box(0.20, 0.681, 0.06), s * 1.62, 0.9805, -4.33);
  }
  // r32 GROUP 4a (critic r31 driver E): the four bow pegs dangled in free
  // air under the pods (raw-gray, 3x-decisive). Kit hooks re-slot to the
  // rubber class + tuck up/back against the prong bottoms (y 0.72, z 1.99 —
  // contact read); one WIDE center flap joins the peg pairs under the bow
  // like the ref's. Flap face z 1.95 paints the center front bins only at
  // y 0.42..0.50 — BELOW the nose face (0.50), TOWARD the ref's 0.35 pan
  // line (current bins bottom out 0.50 there); pan face at 0.225 keeps the
  // per-column minimum, so front bottom rows cannot move.
  ruGlacisKit(P, { w: 3.1, y: 1.1246, z: 1.55, eyes: false, hookX: 0.86, hookY: 0.72, hookZ: 1.99, hookBucket: 'hullRubber', hlY: 1.10 });
  P.add('hullRubber', box(1.90, 0.28, 0.05), 0, 0.56, 1.925);
  KIT.towCable(P, [[-1.00, 1.3824, 0.40], [0, 1.3763, -0.30], [1.00, 1.3824, 0.40]]);
  buildRunningGear(P, {
    // ref gear (r31b measured): the drawn climb starts ~0.2 past contactZ*
    // (tangent-overhang), and the REF climb lines zero at 0.80 front /
    // −3.40 rear with ~0.45 slopes — contacts pinned 0.58/−3.20 so the
    // DRAWN ramps land on the ref lines. Small HIGH idler (wrap front <=2.0
    // keeps the 2.03 col for the belly nose, ref 0.55); sprocket
    // (−3.84, 0.66) puts the rear arc over the loft belly ramp.
    // trackW 0.45: the link-pad pin bosses print +0.024/side and the
    // sprocket drum +0.030/side past the band — 0.45 keeps BOTH inside the
    // ±1.5188 front-bin boundary while the shoe inner edge (0.9965) stays
    // outside the ±0.9720 tub-step bins (measured, tmp-t84-aabbprobe).
    style: 'rubber', wheelR: 0.35, wheelW: 0.24, wheelY: 0.40, xc: 1.24, dishR: 0.85,
    wheelZs: evenStations(6, 4.11, -1.225),
    // The front terminal remains distinct at 46% of the road-wheel radius,
    // but its course is lowered below the T-84 bow instead of cutting it.
    sprocket: { z: -3.88, y: 0.74, r: 0.27 }, idler: { z: 1.78, y: 0.65, r: 0.16 },
    rollers: [-2.30, -0.70, 0.90].map((z) => ({ z, y: 0.80, r: 0.08 })),
    trackW: 0.50, topY: 0.82, botY: 0.05, paintedEnds: true, coveredTop: true, arms: false,
    contactZF: 0.63, contactZR: -3.10,
    // r32 ORDER 0c + GROUP 2a (critic r31 V3/driver B): the fixed near-black
    // pad/chain clones (0x171614/0x27251f) rendered INSIDE the ±13 bg
    // tolerance — the dead-front/rear wrap faces scanned as venetian-blind
    // SKY rows (418/404px + ~10 rows/face) and the side track rows read med
    // 6.8 vs ref 55.4. pt91m r27 recipe (measured into the ref's 45-62L
    // window there): family olive-brown hexes + the ambient-floor rehook
    // (Material.clone drops onBeforeCompile — gearFloor restores it).
    padHex: 0x343a29, chainHex: 0x2b3122, gearFloor: true,
  });
  // r32 GROUP 2d (merkava 1b lesson): the rear sprocket faces read as pale
  // concentric bolt-ring bullseyes where the ref keeps dark occluded gear —
  // dark cover discs outboard of the drum faces (x 1.547.., clear of the
  // 1.5165 pad-boss print), r 0.23 inside the r 0.27 drum silhouette so no
  // side-mask column moves and the toothed rim stays visible.
  for (const s of [-1, 1]) P.add('hullDark', cylX(0.23, 0.015, 16), s * 1.5545, 0.74, -3.88);
  // skirts follow the deck line (three bands — the ref side top IS the
  // fender line; a flat 1.33 skirt owned every glacis col forward of 0.4)
  // r32 ORDER 0b + GROUP 2b (§B2 V2 / critic r31 driver B): the DEEP skirt,
  // as a TWO-COURSE stack. The r31 read exposed a wheel row over sky
  // (right-ortho 1794px enclosed tunnel through the under-skirt band; left
  // lower band sub-30 2405 vs REF 0) where the ref is ONE camo mass to near
  // ground with pale streaks reaching the bottom edge.
  // - UPPER course keeps the certified 1.72 face but hems at 0.64: the
  //   gate's ±1.74 front bins want 0.63 (a first flat-0.26 hem read err
  //   0.191 ×2 there) and the stern rows at z −4.0..−4.32 follow the ref's
  //   RISING belly rake (0.33->0.64) — 0.64 also beats r31's 0.72 at −4.32.
  // - LOWER course insets to x 1.6825 (face 1.66..1.705, inside the 1.7213
  //   bin boundary) and hems at 0.26, wheelbase only (z −3.55..0.86 — the
  //   sprocket-wrap zone keeps its certified r31 bottoms). 0.26 overlaps
  //   the inner-chain rail tops (0.271) so no side slit survives; side-mask
  //   bottoms stay the 0.05..0.11 track band; x clears pads/bosses (1.5165).
  ruSkirtBand(P, { x: 1.72, th: 0.05, z0: -4.38, z1: -2.20, yTop: 1.41, yBot: 0.64, panels: 5, lipX: 1.737, lipY: 0.95 });
  ruSkirtBand(P, { x: 1.72, th: 0.05, z0: -2.20, z1: -0.10, yTop: 1.3701, yBot: 0.64, panels: 5, lipX: 1.737, lipY: 0.95 });
  ruSkirtBand(P, { x: 1.72, th: 0.05, z0: -0.10, z1: 0.86, yTop: 1.2965, yBot: 0.64, panels: 3, lipX: 1.737, lipY: 0.95 });
  for (const s of [-1, 1]) for (let i = 0; i < 10; i++) {
    P.add(s < 0 ? 'hullTrackGuardL' : 'hullTrackGuardR',
      box(0.045, 0.40, 0.426), s * 1.6825, 0.46, -3.55 + (i + 0.5) * 0.441);
  }
  // continuous lip rail at EXACTLY ±1.78 (widthM anchor; plan front 2.21 /
  // rear −4.36 at the outermost columns ride here, y 0.93..0.97 per the
  // front-view ±1.78 thin band)
  for (const s of [-1, 1]) for (let i = 0; i < 14; i++) {
    P.add('hullDark', box(0.033, 0.04, 0.447), s * 1.7635, 0.95, -4.36 + (i + 0.5) * 0.447);
  }
  widthAnchor(P, 1.78, 0.95, -1.00);

  // ---- welded turret at ref-world seats (turretG z −0.95 = ring center;
  // apron 0.94 spans −0.16..−1.73). local z = world + 0.95, y = world − 1.40.
  // r33 SEAT: the casting band is re-authored through the batch-40 turret
  // zone map (z1 1.3239..1.7132: 0.93025+(y−1.3239)×1.61672; z2 ..2.0018:
  // y−0.15347; z3 ..2.2317: 1.84853+(y−2.0018)×1.61667) — collar/cheek
  // bottoms tuck 2.7-5.2 cm INTO the raised deck (family contact class,
  // owner daylight CLOSED); the ROOF-PLATE LANE is NOT blind-mapped — it
  // re-authors to the fresh ref plateau 2.20..2.22 abs (heightM p95
  // protection: the datum must stay 2.21-2.23, dims 99.1).
  P.turretG.position.set(0, 1.40, -0.95);
  // low collar (widest band ±1.26, z −1.03..0.50, y 1.344..1.474 — bottom
  // 2.7-5.2 cm into the 1.3714..1.3959 ring deck)
  for (let i = 0; i < 4; i++) P.add('turret', box(2.52, 0.129, 0.3825), 0, 0.009, -0.08 + (i + 0.5) * 0.3825);
  // cheek boxes with the GUN SLOT (ref turret node notches x 0.14..0.26 —
  // the mantlet is a fused separate mass there; slot is deck-backed, no sky)
  for (let i = 0; i < 2; i++) {  // front-cheek bottoms 1.368 (fresh ref rim line 1.368-1.395 fore of the ring; through-rays below stay blocked by the collar/wedges/mantlet at 1.344)
    P.add('turret', box(0.74, 0.379, 0.26), -0.49, 0.1573, 1.30 + (i + 0.5) * 0.26);
    P.add('turret', box(0.59, 0.379, 0.26), 0.565, 0.1573, 1.30 + (i + 0.5) * 0.26);
  }
  for (let i = 0; i < 2; i++) {  // ring-side cheek base sits higher (fresh ref bottom 1.488 @ z W 0.26)
    P.add('turret', box(0.74, 0.321, 0.245), -0.49, 0.1858, 0.81 + (i + 0.5) * 0.245);
    P.add('turret', box(0.59, 0.321, 0.245), 0.565, 0.1858, 0.81 + (i + 0.5) * 0.245);
  }
  // cheek apex ramp 1.751@0.85 -> 1.910@−0.16 (was 1.905/2.04 pre-seat)
  P.add('turret', slab(
    [-0.86, 0.3265, 1.80], [0.86, 0.3265, 1.80], [0.86, 0.3265, 0.79], [-0.86, 0.3265, 0.79],
    [-0.86, 0.3515, 1.80], [0.86, 0.3515, 1.80], [0.86, 0.5103, 0.79], [-0.86, 0.5103, 0.79]));
  // chamfer wedges fill the plan corner line (0.86,1.80)->(1.22,1.36)
  for (const s of [-1, 1]) {
    P.add('turret', orientedSlab(
      [s * 0.86, -0.0557, 1.80], [s * 0.86, -0.0557, 0.79], [s * 1.22, -0.0557, 0.79], [s * 1.22, -0.0557, 1.36],
      [s * 0.86, 0.2665, 1.80], [s * 0.86, 0.2665, 0.79], [s * 1.22, 0.2665, 0.79], [s * 1.22, 0.2665, 1.36]));
  }
  // tall body walls, z −0.50..−0.98: the fresh front reads an ASYMMETRIC
  // wall-top stair at |x| 1.13..1.24 (L −1.18: 1.942 / −1.22: 1.884;
  // R +1.18: 1.994 / +1.22: 1.942 — the mapped flat 2.007 was the
  // k2-amplified +0.065). Main walls ride under the shoulder at ±1.13; four
  // edge strips carry the per-column tops and keep the ±1.24 plan extent
  // (strip gaps 1.182..1.212 never cross a ±0.0405 bin boundary and the
  // collar below closes the top-down view).
  P.add('turret', box(2.26, 0.586, 0.48), 0, 0.2373, 0.21);
  P.add('turret', box(0.052, 0.598, 0.48), -1.156, 0.2432, 0.21);  // L inner strip top 1.942
  P.add('turret', box(0.028, 0.540, 0.48), -1.226, 0.2142, 0.21);  // L outer strip top 1.884
  P.add('turret', box(0.052, 0.650, 0.48), 1.156, 0.2692, 0.21);   // R inner strip top 1.994
  P.add('turret', box(0.028, 0.598, 0.48), 1.226, 0.2432, 0.21);   // R outer strip top 1.942
  P.add('turret', box(2.26, 0.663, 0.33), 0, 0.2758, -0.195);  // shoulder ±1.13 to −1.31 keeps 2.007 (its 0.86..1.13 cols read 2.0-class)
  // r33 canyon plug (§B2): with the seat closing the under-turret daylight,
  // the old shoulder-to-bustle canyon (z −1.31..−1.80 over the carrier)
  // became an ENCLOSED sky window at view-left/right (573/562 px — in r32 it
  // was border-connected through the float gap, so the flood read it open).
  // Solid camo fill at the carrier planform ±0.80: side/plan traces cannot
  // see it (tops stay the 2.216 plates, bottoms the 0.49 carrier) and the
  // ±0.74..0.80 front cols keep reading the 2.052 bustle above it.
  // main plug z −1.30..−1.72 (bottom 1.36 overlaps the carrier top; faces
  // >=15 mm off the 1.3195/1.7355 col boundaries); the REAR 8 cm (to the
  // bustle face −1.80) bottoms at the ref's own 1.45 line so the 'at' 1.82
  // col reads EXACTLY ref (the deck below is 1.4141 — the 3.6 cm shadow
  // seam left under it is sub-cluster at render scale)
  P.add('turret', box(1.60, 0.665, 0.42), 0, 0.292, -0.56);
  P.add('turret', box(1.60, 0.575, 0.08), 0, 0.3373, -0.81);
  // roof plates 2.205 ABS @ −0.40..−1.96 (fresh ref side plateau 2.212-2.220;
  // col −2.04 is the bustle's). r33 SPLIT: the fresh FRONT row reads a center
  // roof DIP — 2.10-2.12 at |x|<=0.19 and 2.09 outboard of 0.74 (the flat
  // ±0.80 plates read +0.08..0.11 on ten front cols) — so each row is two
  // mid plates x 0.21..0.72 at the 2.205 side line + a lower center lane
  // (top 2.117); the 0.72..0.86 front cols fall to the bustle/cheek tops.
  for (let i = 0; i < 4; i++) {
    const zr = 0.55 - (i + 0.5) * 0.39;
    // row 1 (front) tops 2.17 — the fresh ref roof RAMPS 2.10 -> 2.205 over
    // z −0.16..−0.7 (side cols −0.49/−0.61 read 2.164/2.174); rows 2-4 keep
    // the certified 2.205 plateau
    for (const s of [-1, 1]) P.add('turret', box(0.51, 0.145, 0.39), s * 0.465, i === 0 ? 0.6975 : 0.7325, zr);
    P.add('turret', box(0.44, 0.145, 0.39), 0, 0.6445, zr);
  }
  // apex step: top 2.12 (fresh ref side 2.104-2.114 @ z −0.16..−0.33) and
  // ASYMMETRIC in x — the ref keeps its 2.10-2.12 center dip to x −0.18..
  // +0.10, so the step spans −0.21..−0.50 / +0.115..+0.50 only
  P.add('turret', box(0.29, 0.14, 0.21), -0.355, 0.65, 0.695);
  P.add('turret', box(0.385, 0.14, 0.21), 0.3075, 0.65, 0.695);
  P.add('turret', box(0.66, 0.175, 0.14), -0.55, 0.7275, 0.52);   // gunner/pano sight housing 2.215 ABS (sights lane 2.22-2.24; inner edge −0.22 — at −0.20 it bled the −0.198 front bin where the fresh ref roof dips to 2.104)
  P.add('turretGlass', box(0.22, 0.06, 0.02), -0.35, 0.75, 0.60);
  P.add('turret', box(0.17, 0.14, 0.35), -0.945, 0.77, 0.225);    // left shoulder block 2.24 ABS (ref front 2.243 to x −1.02)
  P.add('turret', box(0.26, 0.175, 0.12), 0.35, 0.7275, 0.51);    // commander sight 2.215 ABS
  // r32 ORDER 0a (§B2, critic r31 V1): slot-lane flank walls. The lane
  // between the sight housings (z W −0.50..−0.36), apex step and the cheek
  // rears (−0.14) read OPEN SKY through the turret from both side orthos
  // (304/307px enclosed) and as close-roof notches. Walls at x ±0.795..0.855
  // sit INBOARD of the ±0.86 cheek planes (dead-front occluded), rise from
  // the 1.66 collar top to the 2.06 roof-plate underside and span the whole
  // z-gap — every side/oblique through-ray now lands on camo plate. The
  // side-mask columns here painted NOTHING where the ref is SOLID
  // (fill is gate-positive-or-neutral per the verdict; verified in-gate).
  for (const s of [-1, 1]) P.add('turret', box(0.06, 0.619, 0.36), s * 0.825, 0.3506, 0.63);  // collar top 1.474 -> plate underside 2.06
  // r32 GROUP 1 (critic r31 driver C): the carrier stack re-slots to the CAMO
  // bucket — its raw flat-gray 0x36342f faces WERE the front letterbox
  // (p25=med=p75 63.1, sd 2.5, g−r −1 @ z −0.16), the rear collar slab
  // (uniform 56.0 @ z −1.74) and the hero-canyon walls/floor. Geometry
  // byte-identical, material-only (the ref paints these zones in scheme camo:
  // letterbox sd 14.4 g−r +6).
  // r33 measured: the gate's turret mask is PART-ISOLATED (no hull occlusion)
  // and the seated REF's basket plug paints the band bottom at 0.492 across
  // z −0.18..−1.71 (15 cols read ref 2.216..0.492 vs the packet's "keep
  // apron 0.94" — the plan table mis-attributed the certified 1.0-class
  // refBot to the hull line; it was the plug). The carrier stack follows the
  // plug: apron 0.490, top 1.3766 meets the collar/cheek bottoms. Fully
  // interior (inside wLo ±0.98, above the 0.35 tub floor) — render-invisible.
  for (let i = 0; i < 4; i++) P.add('turret', box(1.60, 0.887, 0.395), 0, -0.4667, 0.79 - (i + 0.5) * 0.395);
  // bustle: core ±0.86 to −3.05. r33 RE-PHASE (fresh workorder): the seated
  // ref's bustle underside is a fine 0.028/col rising line (1.477/1.532/
  // 1.559/1.587/1.614/1.641/1.669 world by column) — the certified 4-step
  // staircase stretched into 0.09 steps under the zone map and mis-phased
  // half a column (§C: the −2.10 face sat 7 mm past the −2.093 boundary).
  // Eight stairs with every face >=15 mm FORE of its column boundary (ref
  // bottoms rise rearward, so the higher stair must own the next column);
  // stair tops carry the ref's 2.052 line, the 2.079 upper band rides a
  // separate slab starting 15 mm PAST the −2.202 boundary (tops read MAX —
  // the transition must not leak forward). Tail chamfer ±0.44 owns 1.723.
  for (const [yB, yT, z0, z1] of [
    [1.474, 2.052, -1.80, -1.966], [1.532, 2.052, -1.966, -2.078],
    [1.559, 2.052, -2.078, -2.187], [1.587, 2.052, -2.187, -2.405],
    [1.614, 2.052, -2.405, -2.514], [1.641, 2.052, -2.514, -2.624],
    [1.669, 2.052, -2.624, -2.84],
  ]) {
    P.add('turret', box(1.72, yT - yB, z0 - z1), 0, (yB + yT) / 2 - 1.40, (z0 + z1) / 2 + 0.95);
  }
  P.add('turret', box(1.68, 0.159, 0.31), 0, 0.5995, -1.425);  // upper band 2.079 @ −2.22..−2.53 (±0.84: the ±0.86 front col reads the ref's 2.034 in-slope — stairs keep the plan width)
  P.add('turret', box(1.68, 0.159, 0.31), 0, 0.5995, -1.735);  // upper band 2.079 @ −2.53..−2.84 (split: station end-cap law)
  P.add('turret', box(0.88, 0.356, 0.21), 0, 0.501, -1.995);   // tail chamfer ±0.44, 1.723..2.079 @ −2.84..−3.05 (ref plan rear −3.0 only at |x|<=0.46)
  // left bustle flank to x −0.93 (print asymmetry: ref plan bin −0.916
  // reads −2.92 while the right stops at ±0.86); bottoms TUCK 0.01-0.03
  // above the core line except the −2.913 col, where the flank alone owns
  // the ref's 1.669 (the core ends at −2.84 to keep the plan face)
  P.add('turret', box(0.07, 0.487, 0.35), -0.895, 0.4085, -1.075);
  P.add('turret', box(0.07, 0.459, 0.35), -0.895, 0.4495, -1.425);
  P.add('turret', box(0.07, 0.4025, 0.35), -0.895, 0.4778, -1.775);
  // Utes/stowage crate 2.185/lid 2.209 @ −2.56..−2.83 (fresh ref bustle roof
  // 2.208 — SIDE reads max-over-x so the narrow crate holds the line). r33:
  // narrowed to the right plate lane x 0.21..0.65 — at 1.10 wide its lid
  // owned the FRONT center cols at 2.209 where the fresh ref roof dips to
  // 2.10-2.12 (the crate sits behind the casting but nothing occludes it
  // above the 2.079 bustle band).
  P.add('turret', box(0.44, 0.146, 0.27), 0.43, 0.7124, -1.745);
  P.add('turretDark', box(0.44, 0.032, 0.29), 0.43, 0.7932, -1.745);
  // right-flank stowage (print asymmetry: plan rear −2.26 @ x 0.87..1.09,
  // −1.87 @ 1.10..1.20 — the garage tell for this mark) + short left bin
  for (let i = 0; i < 2; i++) P.add('turretDetail', box(0.22, 0.388, 0.23), 0.98, 0.3807, -0.85 - (i + 0.5) * 0.23);
  P.add('turretDetail', box(0.105, 0.353, 0.07), 1.1475, 0.2501, -0.885);
  P.add('turretDetail', box(0.19, 0.404, 0.06), -0.965, 0.2758, -0.88);
  // r32 GROUP 3a (critic r31: "flat dark ellipse painted on the roof",
  // cupola sub-45 census 4403 vs ref 478): raised commander drum in the
  // t80-line vocabulary. Height budget is razor here — the ref's own side
  // tops at this lane read 2.05..2.19 and heightM rides the 2.24 grace — so
  // the drum wall tops AT the grace ceiling (2.238) and the cupola READ
  // comes from the proud wall + a ring of seven vision blocks + recessed
  // dark hatch, not from silhouette height (blocks 2.254 over ~2 columns,
  // the currently-certified 2.245..2.281 Kord/sight lane class).
  P.add('turret', cylY(0.235, 0.265, 0.098, 14), 0.42, 0.777, -0.35);   // drum wall 2.128..2.226 (roof lane −0.012 with the fresh 2.2200 ref roof; heightM p95 datum 2.21-2.23)
  P.add('turretDark', cylY(0.20, 0.20, 0.014, 14), 0.42, 0.813, -0.35); // recessed hatch disc (top 2.220)
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.35;
    P.add('turretDark', box(0.055, 0.032, 0.045), 0.42 + Math.cos(a) * 0.195, 0.805, -0.35 + Math.sin(a) * 0.195, 0, -a, 0);
  }
  {
    // Kord on the commander ring — DARK crown-riding lines (pale-deck MG
    // physics), crest ~2.30 over <=2 side cols (heightM p95 budget: the
    // sight tops 2.235 stay inside the 1% grace at published 2.22)
    // r32 GROUP 3b (MG PHYSICS, critic r31: "1px ANGLED ROD — no receiver
    // mass"): scale 0.50 -> 0.62 with the mount dropped 5 cm — the bigger
    // receiver/cradle clear the 2.205 plate line as ~7 cm of dark
    // crown-riding mass (pale-deck inversion) while the crest returns to
    // the ref's own 2.28 furniture line (the first 0.755 seat printed
    // +0.08 x4 turret columns and popped heightM's p95 to 2.26).
    const kord = FITTINGS.pintleMG({
      mats: P.mats, cls: 'nsvt', scale: 0.62, tone: 'dark', ammo: true, elev: 0,
      rotation: [0, -1.75, 0], seed: 6,  // barrel swung left over the roof plates (−2.2's z-spread put the 2.31 crest on THREE side columns at +0.05; −1.75 concentrates it on ~1 while staying clear of the ref's 2.17 center-front cols)
    });
    // y 0.735: nsvt receiver top = mount + 0.192 — at 0.705 it hid 1.3 cm
    // UNDER the 2.205 plate line (still a rod); 0.735 stands 4.2 cm of
    // receiver proud with the crest ~2.31 (the certified furniture class).
    kord.position.set(-0.35, 0.655, -0.10);  // world mount 2.055 ABS (roof lane): crest stays the certified 2.29-2.31 class
    P.turretG.add(kord);
  }
  for (const s of [-1, 1]) {
    // Tucha banks on both cheeks — tubes stay inside the 1.94..1.73 tube
    // band in side view (zero-cost decoration lane)
    const smoke = FITTINGS.smokeBank({ mats: P.mats, count: 5, splay: s * 1.12, slot: 'dark', seed: 3 + s });
    smoke.position.set(s * 0.60, 0.2865, 1.55);  // tube tips stay behind the 0.87 cheek plan face and under the 1.787 mantlet-band line (z2 shift −0.15347 = the axis drop)
    P.turretG.add(smoke);
  }
  {
    // r32 GROUP 3c (§I KIT fittings; critic r31 driver D "bare rack rail on
    // the right flank"): mesh-filled stowage rack over the right-flank bin
    // row — outer face at x 1.17 inside the 1.20 print stowage line, z-span
    // inside the −2.26 plan tell, top 2.00 under the 2.08 bin lids.
    const rack = FITTINGS.stowageRack({ mats: P.mats, w: 0.70, d: 0.30, h: 0.26, rails: 2, seed: 11, rotation: [0, -Math.PI / 2, 0] });
    rack.position.set(0.93, 0.1865, -0.96);  // outer face 1.08: the print's stowage plan steps to −1.87 at x 1.10..1.20 — top 1.847 rides exactly under the re-seated bin lids
    P.turretG.add(rack);
    // roof-plate seam lines (5 mm — side-invisible, top-view edge density
    // toward the ref's 1363 edge-px class; r33: split to the mid-plate lanes
    // so the seams cannot re-paint the center roof dip or the 0.72+ falloff)
    for (const zr of [0.16, -0.23, -0.62]) {
      for (const s of [-1, 1]) P.add('turretDark', box(0.50, 0.006, 0.02), s * 0.46, 0.808, zr);
    }
  }
  // ---- KBA-3 (2A46M class): axis 1.6815 (fresh ref 1.7036 − the certified
  // 0.022 authored offset; band 1.787..1.577), tube r 0.100 (plan bin law:
  // edge inside the ±0.1015 column boundary), evac as a BOX, muzzle +4.86 =
  // rear −4.86 + 9.72. The z2 zone is a pure −0.15347 shift = exactly the
  // axis drop, so every gun-local stage/ring/evac seat is UNCHANGED.
  P.gunG.position.set(0, 0.2815, 1.55);
  ruSaddle(P, { rollR: 0.13, rollW: 0.44, tubeR: 0.064, rootR: 0.080, rootL: 0.50 });
  P.addGunExtra(box(0.38, 0.443, 0.42), -0.05, -0.116, 0.06);  // mantlet 1.344..1.787 @ 0.45..0.87 (slot-asymmetric like the print; bottom buries <=1.3 cm into the glacis corner = family seating, occluded)
  tubeGun(P, [
    [0.27, 0.85, 0.082, 0.082, 0, 0.026],                      // root stage: ref band 1.942..1.778 here (thinner than the free tube)
    [0.85, 1.45, 0.104], [1.45, 1.79, 0.100],
    [2.52, 3.10, 0.101], [3.10, 3.70, 0.100], [3.70, 4.26, 0.099],
  ], { rings: [[0.45, 0.088], [0.66, 0.088], [0.85, 0.101], [1.66, 0.113, 0, 0.026], [2.52, 0.101], [3.49, 0.094, 0, 0.014], [3.61, 0.094, 0, 0.014]], muzzle: 4.26 });
  // ^ r32 GROUP 1b: two thermal-sleeve seam rings on the bare root stage
  // (close-front read "RAW mantlet slot with bare cylinder root" — the ref
  // carries a ringed sleeve). r 0.088 stays inside the ±0.1015 plan bins and
  // the 1.94..1.73 side band; zero silhouette-column movement.
  P.addGunExtra(box(0.40, 0.235, 0.71), 0, 0.018, 2.15);       // evac box: band 1.582..1.817 @ world 2.40..3.11, plan halfW 0.20 (gun-local seat unchanged — rides the axis)
  P.decal('turret', 'number', P.spec.visual.number || '', 0.26, [1.215, 0.2665, 0.20], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.26, [-1.215, 0.2665, 0.20], -Math.PI / 2);
  P.raiseTrackCorridor(['hull'], {
    laneInnerX: 0.60, floorY: 1.12, zMin: -4.34, zMax: 1.94,
  });
  P.topY = 1.40;
}

function buildT84(P) {
  // Standardize the family chassis first: front idler, six road wheels,
  // three supported return rollers and rear final-drive sprocket on one
  // native linked course.  Then atomically replace the inherited BV turret
  // with the distinct first-party welded T-84 package above.
  buildT80Line(P, 2);
  rebuildT84FirstParty2026(P);
  P.topY = 1.45;
}

export const T80_PROFILES = {
  t80: { build: buildT80 },
  t80b: { build: buildT80B },
  t80bv: { build: buildT80BV },
  t84: { build: buildT84 },
};
