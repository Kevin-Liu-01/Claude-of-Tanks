// Independently authored Revolution geometry, measured against the owner's
// September 2026 reference. The source remains a local comparison asset: no
// source topology, textures, or runtime loader is used by this builder.
import * as THREE from 'three';
import { KIT, FITTINGS, orientedSlab } from './kit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type XY = readonly [number, number];
type Section = { z: number; ring: readonly XY[] };
const { box, cylY, cylZ, cylX, torus } = KIT;
const YAW_Z = 0.4774;
const ROOF_BASE = 1.537;

/** Closed longitudinal solid. Each XY section has the same winding.
 * Adjacent stations share exact vertices; no independent floating roof plate. */
function sectionSolid(sections: readonly Section[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const vertex = (s: number, i: number): number[] => [
    sections[s].ring[i][0], sections[s].ring[i][1], sections[s].z,
  ];
  const triangle = (a: number[], b: number[], c: number[]) => positions.push(...a, ...b, ...c);
  const n = sections[0].ring.length;
  for (let s = 0; s < sections.length - 1; s++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      triangle(vertex(s, i), vertex(s, j), vertex(s + 1, j));
      triangle(vertex(s, i), vertex(s + 1, j), vertex(s + 1, i));
    }
  }
  for (const s of [0, sections.length - 1]) {
    // A tub's wheel-well shoulder is concave. A centroid fan crosses that
    // recess and reverses triangles even when the section winding is valid.
    const contour = sections[s].ring.map(([x, y]) => new THREE.Vector2(x, y));
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, [])) {
      if (s === 0) triangle(vertex(s, c), vertex(s, b), vertex(s, a));
      else triangle(vertex(s, a), vertex(s, b), vertex(s, c));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const uv: number[] = [];
  for (let i = 0; i < positions.length; i += 3) uv.push(positions[i], positions[i + 2]);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function hullSection(z: number, half: number, top: number, bottom: number): Section {
  const depth = top - bottom;
  const keel = Math.min(0.99, half * 0.84);
  // The tub stays inboard of the 1.0445 m inner belt edge until it reaches
  // the fender underside. A low diagonal flare occupies the wheel well.
  // The bow tapers to a 16 mm lip, so neither bevel may exceed its depth.
  const bevel = Math.min(z >= 2.70 ? 0.045 : 0.16, depth * 0.35);
  const chine = top - bevel - Math.min(0.02, depth * 0.10);
  return { z, ring: [
    [-keel, bottom], [keel, bottom], [Math.min(1.00, half), chine],
    [half, top - bevel], [half - 0.17, top],
    [-half + 0.17, top], [-half, top - bevel], [-Math.min(1.00, half), chine],
  ] };
}

function turretSection(z: number, half: number, bottom: number, top: number, inset = 0.16): Section {
  return { z: z - YAW_Z, ring: [
    [-half + 0.09, bottom - ROOF_BASE], [half - 0.09, bottom - ROOF_BASE],
    [half, bottom + 0.12 - ROOF_BASE], [half, top - 0.23 - ROOF_BASE],
    [half - inset, top - ROOF_BASE], [-half + inset, top - ROOF_BASE],
    [-half, top - 0.23 - ROOF_BASE], [-half, bottom + 0.12 - ROOF_BASE],
  ] };
}

export function buildLeopardRevolution(P: TankBuilderPort): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(0, ROOF_BASE, YAW_Z);
  P.gunG.position.set(0.012, 1.856 - ROOF_BASE, 1.60 - YAW_Z);

  // Tub, upper shoulders and both glacis planes are one closed sectioned
  // body. The narrower lower body leaves a real wheel well underneath.
  P.add('hull', sectionSolid([
    hullSection(-3.66, 1.59, 1.606, 0.75),
    hullSection(-3.28, 1.70, 1.650, 0.40),
    hullSection(-2.60, 1.70, 1.623, 0.342),
    hullSection(-0.64, 1.70, 1.543, 0.342),
    hullSection(-0.48, 1.949, 1.537, 0.342),
    hullSection(1.80, 1.949, 1.537, 0.342),
    hullSection(2.70, 1.949, 1.400, 0.365),
    hullSection(3.48, 1.825, 1.278, 0.686),
    hullSection(3.86, 1.03, 0.996, 0.980),
  ]));

  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: 0.3305, wheelW: 0.35,
    wheelZs: [-2.211, -1.471, -0.663, 0.092, 0.828, 1.588, 2.386],
    wheelY: 0.421, xc: 1.312, trackW: 0.535, trackTh: 0.072,
    sprocket: { z: -2.7783, y: 0.836, r: 0.3514 },
    idler: { z: 3.202, y: 0.809, r: 0.2777 },
    topY: 1.157, botY: 0.048, paintedEnds: true, arms: true,
    coveredTop: true,
  });

  // AMAP heavy forward skirt modules meet the shoulder skin and are capped
  // on every side. Rear cage armor has its own frame and hull-mounted feet.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const rear = -0.49 + i * 0.87;
      const front = rear + 0.86;
      const yTop = (z: number) => 1.537 - Math.max(0, z - 1.80) * 0.155;
      P.add('hull', orientedSlab(
        [side * 1.64, 0.77, rear], [side * 1.88, 0.77, rear],
        [side * 1.88, 0.82, front], [side * 1.64, 0.82, front],
        [side * 1.64, yTop(rear) - 0.015, rear], [side * 1.95, yTop(rear) - 0.17, rear],
        [side * 1.95, yTop(front) - 0.17, front], [side * 1.64, yTop(front) - 0.015, front],
      ));
      for (const z of [rear + 0.13, front - 0.13]) {
        P.addEquipment('hullDetail', box(0.025, 0.045, 0.12), side * 1.956, 1.24, z);
        P.addEquipment('hullDark', cylX(0.016, 0.028, 8), side * 1.972, 1.24, z);
      }
    }
    // Broad front corner follows the same upper glacis angle, not a box
    // hung in space ahead of the return wheel.
    P.addMudguard('revolution-front-shoulder', 'hull', orientedSlab(
      [side * 1.10, 1.20, 3.62], [side * 1.80, 1.20, 3.62],
      [side * 1.95, 1.30, 2.90], [side * 1.10, 1.30, 2.90],
      [side * 1.10, 1.27, 3.49], [side * 1.825, 1.27, 3.49],
      [side * 1.949, 1.368, 2.90], [side * 1.10, 1.368, 2.90],
    ));
    P.addMudguard('revolution-front-rubber', 'hullRubber', box(0.60, 0.19, 0.045), side * 1.42, 0.977, 3.606, -0.13);
    P.addMudguard('revolution-rear-rubber', 'hullRubber', box(0.54, 0.51, 0.045), side * 1.32, 0.63, -3.30, 0.12);
    for (let j = 0; j < 4; j++) {
      const z = -0.72 - j * 0.98;
      const low = 0.735 + (-z - 0.62) * 0.305 / 3.20;
      P.addEquipment('hullOpenLatticeDark', box(0.31, 0.038, 0.045), side * 1.83, 1.35, z);
      P.addEquipment('hullOpenLattice', box(0.036, 1.59 - low, 0.035), side * 1.984, (1.59 + low) / 2, z);
    }
    for (let j = 0; j < 13; j++) {
      const y = 0.735 + j * 0.069;
      const length = Math.max(0.06, Math.min(3.20, (y - 0.735) * 3.20 / 0.305));
      P.addEquipment('hullOpenLattice', box(0.03, 0.019, length), side * 1.984, y, -0.62 - length / 2);
    }
    // Rear corners, cross-cage and rear shoulder beam share the same end.
    P.add('hull', box(0.28, 0.13, 3.03), side * 1.57, 1.46, -2.09);
    P.addEquipment('hullOpenLattice', box(0.075, 0.075, 3.27), side * 1.93, 1.61, -2.21);
    P.addEquipment('hullDark', box(0.31, 0.16, 0.065), side * 0.72, 1.128, 3.68, -0.15);
    P.addEquipment('hullGlass', box(0.18, 0.098, 0.008), side * 0.72, 1.136, 3.716, -0.15);
    P.addEquipment('hullDetail', box(0.33, 0.025, 0.125), side * 0.72, 1.218, 3.667, -0.15);
    for (const z of [2.8, 0.95, -1.20, -3.15]) {
      P.addEquipment('hullDetail', torus(0.035, 0.012, 12, 6), side * 1.45, z > 2 ? 1.40 : 1.57, z, Math.PI / 2);
    }
    P.addEquipment('hullDark', box(0.54, 0.19, 0.05), side * 1.16, 1.04, -3.678);
    for (let j = 0; j < 8; j++) P.addEquipment('hullDetail', box(0.47, 0.013, 0.025), side * 1.16, 0.964 + j * 0.022, -3.711);
    P.addEquipment('hullDark', cylZ(0.067, 0.13, 12), side * 0.74, 0.84, 3.50);
    P.addEquipment('hullDetail', torus(0.058, 0.022, 12, 6), side * 0.74, 0.79, 3.56, Math.PI / 2);
  }
  for (let j = 0; j < 9; j++) {
    const y = 1.04 + j * 0.069;
    if (j < 7) P.addEquipment('hullOpenLattice', box(3.97, 0.019, 0.03), 0, y, -3.82);
    else for (const x of [-1.06, 1.06]) P.addEquipment('hullOpenLattice', box(1.85, 0.019, 0.03), x, y, -3.82);
  }
  for (const x of [-1.98, -0.68, 0.68, 1.98]) P.addEquipment('hullOpenLattice', box(0.035, 0.56, 0.035), x, 1.31, -3.82);
  P.add('hull', box(2.16, 0.62, 0.32), 0, 0.77, -3.47);
  for (const side of [-1, 1]) {
    const cable = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.91, 0.66, -3.667),
      new THREE.Vector3(side * 0.33, 0.80, -3.683),
      new THREE.Vector3(-side * 0.70, 1.235, -3.680),
    ]);
    P.addEquipment('hullDark', new THREE.TubeGeometry(cable, 16, 0.020, 6, false));
    for (const [x, y] of [[side * 0.91, 0.66], [-side * 0.70, 1.235]]) {
      P.addEquipment('hullDetail', torus(0.047, 0.015, 12, 6), x, y, -3.676, Math.PI / 2);
    }
    P.addEquipment('hullDark', cylZ(0.09, 0.075, 16), side * 0.89, 0.99, -3.67);
  }
  // Engine deck fans, fitted grilles and hatches are non-ballistic equipment.
  for (const x of [-0.60, 0.60]) {
    P.addEquipment('hullDark', cylY(0.52, 0.52, 0.035, 40), x, 1.66, -2.83);
    P.addEquipment('hullDetail', torus(0.51, 0.023, 40, 8), x, 1.687, -2.83);
    for (let n = -9; n <= 9; n++) {
      const z = n * 0.05;
      const width = 2 * Math.sqrt(Math.max(0, 0.49 ** 2 - z ** 2));
      P.addEquipment('hullDetail', box(width, 0.014, 0.014), x, 1.684, -2.83 + z);
    }
  }
  P.addEquipment('hullDetail', box(0.74, 0.035, 0.56), 0.55, 1.539, 1.02);
  P.addEquipment('hullDark', box(0.30, 0.067, 0.10), 0.55, 1.578, 1.19);
  P.addEquipment('hullGlass', box(0.245, 0.035, 0.012), 0.55, 1.591, 1.247);
  P.addEquipment('hullDetail', box(1.26, 0.02, 0.62), -0.36, 1.502, 2.06, 0.15);
  for (const x of [-0.83, 0.83]) P.addEquipment('hullDetail', box(0.28, 0.022, 0.06), x, 1.359, 3.07, 0.15);

  // Main shell is low and broad. The bustle rises underneath to clear the
  // engine deck. Front cheek solids overlap this shell at z=1.19; their
  // armor is structural, not removed when a reactive panel is depleted.
  P.add('turret', sectionSolid([
    turretSection(-2.808, 1.10, 1.680, 2.163, 0.12),
    turretSection(-2.06, 1.505, 1.680, 2.205, 0.18),
    turretSection(-1.82, 1.526, 1.680, 2.236, 0.18),
    turretSection(-0.87, 1.607, 1.680, 2.236, 0.19),
    turretSection(-0.32, 1.616, 1.537, 2.236, 0.19),
    turretSection(0.48, 1.616, 1.537, 2.236, 0.19),
    turretSection(1.10, 1.616, 1.537, 2.165, 0.23),
  ]));
  P.add('turret', cylY(0.94, 0.94, 0.16, 48), 0, 0.005, 0);
  for (const side of [-1, 1]) {
    // AMAP cheek chine: distinctly angular in plan and side elevation, with
    // a full-thickness leading face instead of a hollow triangular visor.
    const inner = side > 0 ? 0.94 : 0.39;
    P.add('turret', orientedSlab(
      [side * inner, 0.014, 1.08 - YAW_Z], [side * 1.615, 0.014, 1.08 - YAW_Z],
      [side * 1.13, 0.140, 2.096 - YAW_Z], [side * inner, 0.140, 2.096 - YAW_Z],
      [side * inner, 0.628, 1.08 - YAW_Z], [side * 1.39, 0.628, 1.08 - YAW_Z],
      [side * 1.13, 0.485, 2.096 - YAW_Z], [side * inner, 0.485, 2.096 - YAW_Z],
    ));
    P.add('turret', orientedSlab(
      [side * 1.10, 0.015, 1.08 - YAW_Z], [side * 1.617, 0.015, 1.08 - YAW_Z],
      [side * 1.617, 0.094, 1.85 - YAW_Z], [side * 1.13, 0.139, 2.096 - YAW_Z],
      [side * 1.10, 0.628, 1.08 - YAW_Z], [side * 1.39, 0.628, 1.08 - YAW_Z],
      [side * 1.47, 0.528, 1.85 - YAW_Z], [side * 1.13, 0.485, 2.096 - YAW_Z],
    ));
    for (const z of [-1.6, -0.60, 0.4]) {
      P.addEquipment('turretDetail', box(0.025, 0.075, 0.13), side * 1.615, 0.335, z - YAW_Z);
    }
  }
  // The large EMES opening is actual negative space, almost one metre deep:
  // a low shelf, one full-height outer cheek, and a rear bulkhead/window.
  // Do not bridge its mouth with a roof polygon or paste glass onto armor.
  P.add('turret', orientedSlab(
    [.385,.014,1.08-YAW_Z],[.945,.014,1.08-YAW_Z],[.945,.140,2.096-YAW_Z],[.385,.140,2.096-YAW_Z],
    [.385,.175,1.08-YAW_Z],[.945,.175,1.08-YAW_Z],[.945,.170,2.096-YAW_Z],[.385,.170,2.096-YAW_Z],
  ));
  P.addEquipment('turretDark', box(0.53, 0.415, 0.12), 0.665, 0.409, 1.13 - YAW_Z);
  P.addEquipment('turretGlass', box(0.44, 0.338, 0.012), 0.665, 0.419, 1.198 - YAW_Z);
  P.addEquipment('turretDetail', box(0.56, 0.034, 0.22), 0.665, 0.635, 1.13 - YAW_Z);

  const equip = (bucket: string, g: THREE.BufferGeometry, x: number, y: number, z: number, ...r: number[]) =>
    P.addEquipment(bucket, g, x, y - ROOF_BASE, z - YAW_Z, ...r);
  // Paired roof hatches at their measured stations, with seated hinges,
  // handles and a small periscope ring rather than a second oversized tower.
  for (const x of [-0.509, 0.541]) {
    equip('turretDark', cylY(0.34, 0.34, 0.045, 32), x, 2.250, -0.226);
    P.add('turretHatch', cylY(0.31, 0.31, 0.045, 32), x, 2.283 - ROOF_BASE, -0.226 - YAW_Z);
    equip('turretDetail', box(0.15, 0.035, 0.045), x, 2.322, -0.226);
    for (const dx of [-0.17, 0.17]) equip('turretDetail', cylX(0.035, 0.075, 12), x + dx, 2.283, -0.524);
    for (let i = 0; i < 4; i++) {
      const angle = (i - 1.5) * 0.52;
      equip('turretDark', box(0.12, 0.064, 0.07), x + Math.sin(angle) * 0.33, 2.278, -0.226 + Math.cos(angle) * 0.33, 0, angle);
    }
  }
  // SEOSS stabilized panoramic optic: base is directly on the roof.
  equip('turretDetail', cylY(0.22, 0.235, 0.10, 24), -0.273, 2.277, -0.875);
  equip('turretDark', cylY(0.19, 0.19, 0.045, 24), -0.273, 2.350, -0.875);
  equip('turretDetail', cylY(0.202, 0.202, 0.286, 16), -0.273, 2.507, -0.875);
  equip('turretDark', box(0.255, 0.226, 0.025), -0.273, 2.516, -0.667);
  equip('turretGlass', box(0.206, 0.171, 0.01), -0.273, 2.521, -0.649);
  equip('turretDetail', cylY(0.215, 0.215, 0.030, 24), -0.273, 2.666, -0.875);

  // Remote weapon station: all equipment shares its spindle, and its gun
  // fires straight along +Z; no barrel-only arbitrary rotation.
  equip('turretDetail', cylY(0.23, 0.25, 0.10, 24), 0.858, 2.278, -1.596);
  equip('turretDetail', box(0.26, 0.28, 0.25), 0.858, 2.459, -1.596);
  equip('turretDark', cylX(0.11, 0.44, 18), 0.858, 2.604, -1.596);
  const weaponHood = new THREE.CapsuleGeometry(0.133, 0.565, 6, 16);
  weaponHood.rotateX(Math.PI / 2).scale(1, 0.59, 1);
  equip('turretDetail', weaponHood, 0.858, 2.788, -1.534);
  equip('turretDetail', box(0.22, 0.19, 0.28), 1.083, 2.687, -1.58);
  equip('turretDark', box(0.16, 0.16, 0.24), 0.56, 2.650, -1.55);
  equip('turretGlass', box(0.12, 0.115, 0.012), 0.56, 2.650, -1.423);
  const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', scale: 0.74,
    tone: 'two-tone', elev: 0, ammo: false, shield: false, ring: false, seed: 260905 });
  mg.name = 'revolutionRemoteMachineGun';
  mg.position.set(0.858, 2.605 - ROOF_BASE, -1.57 - YAW_Z);
  P.turretG.add(mg);

  // Rear electronics lids and railings are supported by the rising bustle.
  for (const x of [-0.40, 0.40]) {
    equip('turretDetail', box(0.77, 0.075, 0.73), x, 2.242, -2.20);
    equip('turretDark', box(0.68, 0.012, 0.62), x, 2.285, -2.20);
    equip('turretDetail', box(0.16, 0.033, 0.034), x, 2.308, -2.10);
  }
  for (const x of [-0.98, 0.98]) {
    for (const z of [-2.05, -2.66]) equip('turretDetail', cylY(0.017, 0.017, 0.19, 8), x, 2.26, z);
    equip('turretDetail', cylZ(0.017, 0.64, 8), x, 2.352, -2.35);
  }
  equip('turretDetail', cylX(0.017, 1.97, 8), 0, 2.35, -2.66);
  for (const side of [-1, 1]) {
    for (const [x, y, z] of [[1.47, 2.027, 1.79], [1.03, 2.266, -2.59]]) {
      equip('turretDark', box(0.36, 0.08, 0.27), side * x, y, z, 0, side * 0.40);
      for (let i = 0; i < 4; i++) {
        const dx = (i - 1.5) * 0.085;
        equip('turretDetail', cylZ(0.034, 0.17, 10), side * x + dx, y + 0.075, z + 0.01, -0.32, side * 0.40);
        equip('turretDark', cylZ(0.025, 0.012, 10), side * x + dx, y + 0.102, z + 0.089, -0.32, side * 0.40);
      }
    }
  }
  // Two distinct radio stations measured from the source, not paired rear
  // whips: forward starboard and aft port, with the latter leaning aft.
  equip('turretDetail', cylY(0.045, 0.058, 0.10, 12), 1.049, 2.192, 0.847);
  equip('turretDark', cylY(0.006, 0.012, 1.724, 8), 1.049, 3.099, 0.847);
  equip('turretDetail', cylY(0.042, 0.055, 0.10, 12), -0.842, 2.303, -1.984);
  equip('turretDark', cylY(0.006, 0.012, 1.679, 8), -0.842, 3.190, -2.029, -0.053);
  // Gun-owned mantlet rolls and armored cover fill the central cheek slot.
  P.add('gunMount', sectionSolid([
    { z: -0.43, ring: [[-.40,-.24],[.40,-.24],[.415,.25],[-.40,.25]] },
    { z: 0.46, ring: [[-.40,-.24],[.40,-.24],[.415,.27],[-.40,.27]] },
    { z: 0.81, ring: [[-.22,-.17],[.22,-.17],[.26,.18],[-.26,.18]] },
  ]));
  P.add('gunMount', cylZ(0.245, 0.40, 28), 0, 0, -0.45);
  P.add('gunMount', cylZ(0.205, 0.46, 28), 0, 0, 0.56);
  P.addEquipment('gunMount', box(0.62, 0.024, 0.47), 0.005, 0.281, 0.06);
  for (const x of [-0.28, 0.28]) P.addEquipment('gunDark', cylX(0.023, 0.10, 10), x, 0.292, -0.17);
  KIT.buildGun(P, { len: 4.51, r: 0.077, baseR: 0.16, sleeve: true, evac: 0.46, evacR: 1.92, collar: true });
  P.muzzleZ = 4.51;
  P.topY = 2.866 - ROOF_BASE;
  P.hullG.userData.revolutionGeometry = {
    design: 'independent-owner-reference-2026', structuralArmorClosed: true,
    turretStationM: YAW_Z, turretBaseM: ROOF_BASE,
    sourceDimensionsM: { hullLength: 7.72, width: 4.0, turretWidth: 3.232, turretHeight: 0.699, turretLength: 4.904 },
  };
}
