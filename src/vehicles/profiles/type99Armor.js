// Type 99 family armor envelopes. These are combat surfaces, not render-only
// diagram art: sim/armor.js traces shells against these exact quads.
//
// The original Type 99 rows inherited mbtArmor's generic two-box side view.
// Both playable vehicles were later rebuilt around measured, multi-course
// hulls and welded arrow turrets, leaving the combat envelope visibly shallow
// and offset. Keep this pure-data module shared by the two distinct builders
// so their collision geometry can follow each authored silhouette without
// importing either render-heavy profile.

const FY4 = Object.freeze({ keReduction: 0.22, ceFlatMm: 380 });

function armorPlate(name, physicalMm, verts, options = {}) {
  return {
    name,
    verts,
    physicalMm,
    keMm: options.keMm ?? physicalMm,
    ceMm: options.ceMm ?? options.keMm ?? physicalMm,
    kind: options.kind || 'main',
    era: options.era || null,
    moduleLink: options.moduleLink || null,
    gunFollow: !!options.gunFollow,
  };
}

// +Z-facing planar quad. `bottom`/`top` are [y,z] profile points.
function frontPlate(name, physicalMm, x0, x1, bottom, top, options) {
  return armorPlate(name, physicalMm, [
    [x0, bottom[0], bottom[1]], [x1, bottom[0], bottom[1]],
    [x1, top[0], top[1]], [x0, top[0], top[1]],
  ], options);
}

// Mirrored side plates from two profile stations [z, bottomY, topY, x].
// The winding faces away from the hull on each side.
function sidePlatePair(name, physicalMm, front, rear, options) {
  const xf = front[3], xr = rear[3];
  return [
    armorPlate(`${name}_R`, physicalMm, [
      [xf, front[1], front[0]], [xr, rear[1], rear[0]],
      [xr, rear[2], rear[0]], [xf, front[2], front[0]],
    ], options),
    armorPlate(`${name}_L`, physicalMm, [
      [-xr, rear[1], rear[0]], [-xf, front[1], front[0]],
      [-xf, front[2], front[0]], [-xr, rear[2], rear[0]],
    ], options),
  ];
}

// Upward-facing deck quad between [z, y, halfWidth] stations.
function deckPlate(name, physicalMm, front, rear, options) {
  return armorPlate(name, physicalMm, [
    [-front[2], front[1], front[0]], [front[2], front[1], front[0]],
    [rear[2], rear[1], rear[0]], [-rear[2], rear[1], rear[0]],
  ], options);
}

function rearPlate(name, physicalMm, halfWidth, z, bottomY, topY, options) {
  return armorPlate(name, physicalMm, [
    [halfWidth, bottomY, z], [-halfWidth, bottomY, z],
    [-halfWidth, topY, z], [halfWidth, topY, z],
  ], options);
}

// A welded cheek is commonly a deliberately twisted four-corner surface.
// Combat quads must remain planar, so represent it as the same two triangles
// the rendered slab uses. Repeating the final vertex keeps the existing
// convex-quad trace contract while preserving the exact triangular face.
function splitFace(name, physicalMm, [a, b, c, d], options, sharedName = true) {
  return [
    armorPlate(sharedName ? name : `${name}_A`, physicalMm, [a, b, c, c], options),
    armorPlate(sharedName ? name : `${name}_B`, physicalMm, [a, c, d, d], options),
  ];
}

function moduleBox(module, min, max, turretLocal = false) {
  return { module, min, max, turretLocal };
}

function crewBox(crew, min, max, turretLocal = false) {
  return { crew, min, max, turretLocal };
}

function type99AArmor() {
  const hullPlates = [
    // FY-4 is split at the centerline so one impact cannot spend both halves.
    frontPlate('glacis_era_L', 15, -1.34, 0, [1.215, 3.02], [1.50, 2.02],
      { kind: 'era', era: FY4 }),
    frontPlate('glacis_era_R', 15, 0, 1.34, [1.215, 3.02], [1.50, 2.02],
      { kind: 'era', era: FY4 }),
    ...sidePlatePair('skirt_era', 15,
      [2.72, 0.61, 1.35, 1.865], [-2.10, 0.61, 1.35, 1.865],
      { kind: 'era', era: FY4 }),

    frontPlate('upper_glacis', 550, -1.70, 1.70, [0.70, 3.30], [1.50, 2.02],
      { keMm: 500, ceMm: 700 }),
    frontPlate('lower_front', 100, -1.08, 1.08, [0.385, 3.34], [0.70, 3.30],
      { keMm: 130, ceMm: 130 }),

    // The central pan is correctly deep between the tracks; the upper
    // sponson then steps outward to the visible 1.70 m shoulder.
    ...sidePlatePair('hull_side_lower_bow', 100,
      [3.30, 0.385, 0.70, 1.08], [1.84, 0.385, 1.30, 1.10],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_lower_center', 100,
      [1.84, 0.385, 1.30, 1.10], [-1.21, 0.385, 1.30, 1.10],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_lower_engine', 100,
      [-1.21, 0.385, 1.30, 1.10], [-3.52, 0.385, 1.30, 1.08],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_upper_bow', 100,
      [3.02, 1.30, 1.57, 1.70], [1.84, 1.30, 1.50, 1.70],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_upper_center', 100,
      [1.84, 1.30, 1.50, 1.70], [-1.21, 1.30, 1.50, 1.70],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_upper_ramp', 100,
      [-1.21, 1.30, 1.50, 1.70], [-1.48, 1.30, 1.78, 1.70],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_upper_engine', 100,
      [-1.48, 1.30, 1.78, 1.70], [-3.52, 1.30, 1.78, 1.62],
      { keMm: 100, ceMm: 100 }),

    ...sidePlatePair('skirt_front', 8,
      [3.34, 0.47, 1.47, 1.855], [-2.10, 0.47, 1.47, 1.855],
      { kind: 'spaced' }),
    ...sidePlatePair('skirt_rear', 8,
      [-2.10, 0.44, 1.47, 1.855], [-3.58, 0.44, 1.47, 1.855],
      { kind: 'spaced' }),
    // Legacy fallback only. createTank replaces these with prisms derived
    // from the six-wheel running gear before live shell tracing.
    ...sidePlatePair('track', 20,
      [3.45, 0.03, 1.28, 1.77], [-3.47, 0.03, 1.28, 1.77],
      { kind: 'external', moduleLink: 'trackR' }).map((plate, index) => ({
        ...plate,
        name: index ? 'track_L' : 'track_R',
        moduleLink: index ? 'trackL' : 'trackR',
      })),
    rearPlate('hull_rear', 45, 1.62, -3.52, 0.385, 1.78),
    deckPlate('hull_roof_fighting', 45, [2.02, 1.50, 1.67], [-1.21, 1.50, 1.67]),
    deckPlate('hull_roof_powerpack_ramp', 45, [-1.21, 1.50, 1.67], [-1.48, 1.78, 1.67]),
    deckPlate('hull_roof_engine', 45, [-1.48, 1.78, 1.60], [-3.52, 1.78, 1.58]),
  ];

  const turretPlates = [
    // ERA follows the same swept cheek courses visible on the authored
    // welded shell instead of the former 0.8 m-deep rectangular cap.
    ...splitFace('turret_era_R', 15, [
      [0.42, 0.05, 1.56], [1.36, 0.05, 0.55],
      [1.34, 0.80, 0.48], [0.42, 0.84, 1.48],
    ], { kind: 'era', era: FY4 }, true),
    ...splitFace('turret_era_L', 15, [
      [-1.36, 0.05, 0.55], [-0.42, 0.05, 1.56],
      [-0.42, 0.84, 1.48], [-1.34, 0.80, 0.48],
    ], { kind: 'era', era: FY4 }, true),
    ...splitFace('turret_cheek_R', 700, [
      [0.24, 0.05, 1.68], [1.36, 0.05, 0.55],
      [1.34, 0.80, 0.48], [0.24, 0.84, 1.60],
    ], { keMm: 600, ceMm: 850 }),
    ...splitFace('turret_cheek_L', 700, [
      [-1.36, 0.05, 0.55], [-0.24, 0.05, 1.68],
      [-0.24, 0.84, 1.60], [-1.34, 0.80, 0.48],
    ], { keMm: 600, ceMm: 850 }),
    frontPlate('mantlet', 380, -0.27, 0.27, [0.10, 1.70], [0.50, 1.62],
      { keMm: 380, ceMm: 450, gunFollow: true }),
    ...sidePlatePair('turret_side_forward', 300,
      [0.55, 0.08, 1.02, 1.30], [-1.18, 0.16, 1.05, 1.30],
      { keMm: 300, ceMm: 420 }),
    ...sidePlatePair('turret_side_rear', 300,
      [-1.18, 0.16, 1.05, 1.30], [-1.96, 0.28, 1.05, 1.12],
      { keMm: 300, ceMm: 420 }),
    ...sidePlatePair('turret_bustle_side', 55,
      [-1.40, 0.54, 1.05, 1.58], [-2.22, 0.54, 1.05, 1.58],
      { keMm: 55, ceMm: 55 }),
    ...sidePlatePair('turret_stowage_screen', 10,
      [0.55, 0.20, 0.86, 1.73], [-2.18, 0.20, 0.86, 1.73],
      { kind: 'spaced' }),
    rearPlate('turret_rear', 55, 1.58, -2.22, 0.54, 1.05),
    deckPlate('turret_roof_forward', 45, [1.60, 1.05, 0.36], [-1.40, 1.05, 1.18]),
    deckPlate('turret_roof_bustle', 45, [-1.40, 1.05, 1.55], [-2.22, 1.05, 1.55]),
  ];

  return {
    boundingRadiusM: 7.7,
    turretPivot: [0, 1.40, -0.02],
    gunPivot: [0, 0.46, 0.70],
    gunBarrel: { lengthM: 6.25, radiusM: 0.068 },
    hullPlates,
    turretPlates,
    modules: [
      moduleBox('engine', [-1.10, 0.45, -3.42], [1.10, 1.74, -1.60]),
      moduleBox('fuelTank', [0.48, 0.48, -1.58], [1.08, 1.24, -0.62]),
      moduleBox('ammoRack', [-0.95, 0.46, -0.62], [0.95, 1.15, 0.70]),
      moduleBox('turretRing', [-1.05, 1.39, -1.02], [1.05, 1.52, 0.98]),
      moduleBox('radio', [-0.92, 0.38, -1.68], [-0.30, 0.82, -0.82], true),
      moduleBox('optics', [0.18, 0.70, 0.45], [1.12, 1.50, 1.48], true),
      moduleBox('gun', [-0.24, 0.18, -0.55], [0.24, 0.76, 1.62], true),
      moduleBox('trackL', [-1.78, 0.0, -3.47], [-1.10, 1.28, 3.45]),
      moduleBox('trackR', [1.10, 0.0, -3.47], [1.78, 1.28, 3.45]),
    ],
    crew: [
      crewBox('driver', [-0.42, 0.62, 1.20], [0.42, 1.42, 2.34]),
      crewBox('gunner', [0.12, 0.10, 0.12], [0.88, 0.92, 1.12], true),
      crewBox('commander', [0.14, 0.12, -1.18], [0.96, 0.98, -0.24], true),
    ],
  };
}

function ztz99A2Armor() {
  const hullPlates = [
    frontPlate('glacis_era_L', 15, -1.22, 0, [1.02, 3.42], [1.64, 1.35],
      { kind: 'era', era: FY4 }),
    frontPlate('glacis_era_R', 15, 0, 1.22, [1.02, 3.42], [1.64, 1.35],
      { kind: 'era', era: FY4 }),
    ...sidePlatePair('skirt_era', 15,
      [3.18, 0.62, 1.48, 1.887], [-0.62, 0.62, 1.48, 1.887],
      { kind: 'era', era: FY4 }),
    frontPlate('upper_glacis', 550, -1.62, 1.62, [1.02, 3.55], [1.64, 1.35],
      { keMm: 500, ceMm: 700 }),
    frontPlate('lower_front', 100, -1.06, 1.06, [0.46, 3.55], [1.02, 3.55],
      { keMm: 130, ceMm: 130 }),

    ...sidePlatePair('hull_side_lower_bow', 100,
      [3.55, 0.46, 1.02, 1.06], [1.90, 0.46, 1.36, 1.06],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_lower_center', 100,
      [1.90, 0.46, 1.36, 1.06], [-2.05, 0.46, 1.36, 1.06],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_lower_rear', 100,
      [-2.05, 0.46, 1.36, 1.06], [-4.05, 0.70, 1.36, 1.06],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_upper_bow', 100,
      [3.55, 1.02, 1.10, 1.26], [1.90, 1.36, 1.64, 1.66],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_upper_forward', 100,
      [1.90, 1.36, 1.64, 1.66], [-0.30, 1.36, 1.68, 1.66],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_upper_engine', 100,
      [-0.30, 1.36, 1.68, 1.66], [-2.05, 1.36, 1.72, 1.66],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_upper_rear', 100,
      [-2.05, 1.36, 1.72, 1.66], [-4.05, 1.36, 1.60, 1.66],
      { keMm: 100, ceMm: 100 }),

    ...sidePlatePair('skirt_front', 8,
      [3.48, 0.62, 1.56, 1.85], [-0.62, 0.62, 1.56, 1.85],
      { kind: 'spaced' }),
    ...sidePlatePair('skirt_rear', 8,
      [-0.62, 0.62, 1.56, 1.85], [-4.02, 0.62, 1.56, 1.85],
      { kind: 'spaced' }),
    ...sidePlatePair('track', 20,
      [3.40, 0.03, 1.24, 1.78], [-3.48, 0.03, 1.24, 1.78],
      { kind: 'external', moduleLink: 'trackR' }).map((plate, index) => ({
        ...plate,
        name: index ? 'track_L' : 'track_R',
        moduleLink: index ? 'trackL' : 'trackR',
      })),
    rearPlate('hull_rear', 45, 1.66, -4.05, 0.70, 1.60),
    deckPlate('hull_roof_forward', 45, [1.90, 1.64, 1.62], [-0.30, 1.68, 1.66]),
    deckPlate('hull_roof_engine', 45, [-0.30, 1.68, 1.66], [-2.05, 1.72, 1.66]),
    deckPlate('hull_roof_rear', 45, [-2.05, 1.72, 1.66], [-4.05, 1.60, 1.62]),
  ];

  const turretPlates = [
    ...splitFace('turret_era_R', 15, [
      [0.20, 0.30, 1.60], [1.55, 0.08, 0.16],
      [1.14, 0.62, 0.10], [0.20, 0.82, 0.92],
    ], { kind: 'era', era: FY4 }, true),
    ...splitFace('turret_era_L', 15, [
      [-1.55, 0.08, 0.16], [-0.20, 0.30, 1.60],
      [-0.20, 0.82, 0.92], [-1.14, 0.62, 0.10],
    ], { kind: 'era', era: FY4 }, true),
    ...splitFace('turret_cheek_R', 700, [
      [0.18, 0.30, 1.68], [1.55, 0.08, 0.16],
      [1.14, 0.62, 0.10], [0.16, 0.82, 0.92],
    ], { keMm: 600, ceMm: 850 }),
    ...splitFace('turret_cheek_L', 700, [
      [-1.55, 0.08, 0.16], [-0.18, 0.30, 1.68],
      [-0.16, 0.82, 0.92], [-1.14, 0.62, 0.10],
    ], { keMm: 600, ceMm: 850 }),
    frontPlate('mantlet', 380, -0.25, 0.25, [0.18, 1.68], [0.62, 1.54],
      { keMm: 380, ceMm: 450, gunFollow: true }),
    ...sidePlatePair('turret_side_forward', 300,
      [0.16, 0.08, 0.89, 1.55], [-0.60, 0.08, 0.89, 1.62],
      { keMm: 300, ceMm: 420 }),
    ...sidePlatePair('turret_side_center', 300,
      [-0.60, 0.08, 0.89, 1.62], [-1.55, 0.16, 0.89, 1.38],
      { keMm: 300, ceMm: 420 }),
    ...sidePlatePair('turret_bustle_side', 55,
      [-1.55, 0.16, 0.89, 1.38], [-2.46, 0.22, 0.82, 1.30],
      { keMm: 55, ceMm: 55 }),
    ...sidePlatePair('turret_stowage_screen', 10,
      [0.46, 0.10, 0.56, 1.72], [-2.42, 0.10, 0.56, 1.72],
      { kind: 'spaced' }),
    rearPlate('turret_rear', 55, 1.30, -2.46, 0.22, 0.82),
    deckPlate('turret_roof_forward', 45, [1.42, 0.89, 0.48], [-1.55, 0.89, 1.35]),
    deckPlate('turret_roof_bustle', 45, [-1.55, 0.89, 1.35], [-2.46, 0.82, 1.30]),
  ];

  return {
    boundingRadiusM: 7.4,
    turretPivot: [0, 1.56, -0.15],
    gunPivot: [0, 0.39, 0.75],
    gunBarrel: { lengthM: 6.42, radiusM: 0.088 },
    hullPlates,
    turretPlates,
    modules: [
      moduleBox('engine', [-1.28, 0.50, -3.76], [1.28, 1.67, -1.72]),
      moduleBox('fuelTank', [0.52, 0.52, -1.70], [1.30, 1.30, -0.70]),
      moduleBox('ammoRack', [-1.00, 0.52, -0.72], [1.00, 1.24, 0.72]),
      moduleBox('turretRing', [-1.08, 1.39, -1.05], [1.08, 1.61, 0.92]),
      moduleBox('radio', [-0.96, 0.30, -1.62], [-0.26, 0.76, -0.82], true),
      moduleBox('optics', [0.12, 0.62, 0.16], [1.02, 1.34, 1.44], true),
      moduleBox('gun', [-0.24, 0.14, -0.58], [0.24, 0.72, 1.56], true),
      moduleBox('trackL', [-1.79, 0.0, -3.48], [-1.06, 1.24, 3.40]),
      moduleBox('trackR', [1.06, 0.0, -3.48], [1.79, 1.24, 3.40]),
    ],
    crew: [
      crewBox('driver', [-0.42, 0.62, 1.05], [0.42, 1.50, 2.40]),
      crewBox('gunner', [0.10, 0.12, 0.08], [0.86, 0.82, 1.02], true),
      crewBox('commander', [0.14, 0.12, -1.22], [0.92, 0.86, -0.24], true),
    ],
  };
}

export function createType99Armor(variant) {
  if (variant === 'type99a') return type99AArmor();
  if (variant === 'ztz99a2') return ztz99A2Armor();
  throw new Error(`Unknown Type 99 armor variant: ${variant}`);
}
