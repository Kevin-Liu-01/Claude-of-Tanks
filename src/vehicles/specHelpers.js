// Pure constructors shared by fleet spec packs. Keep this module free of
// registry imports so extension packs can use it without creating cycles.

export function plate(name, physicalMm, v0, v1, v3, o = {}) {
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

export const frontPlate = (name, mm, w, yB, zB, yT, zT, o) =>
  plate(name, mm, [-w, yB, zB], [w, yB, zB], [-w, yT, zT], o);
export const rearPlate = (name, mm, w, yB, zB, yT, zT, o) =>
  plate(name, mm, [w, yB, zB], [-w, yB, zB], [w, yT, zT], o);
export const rightSidePlate = (name, mm, xB, yB, xT, yT, zR, zF, o) =>
  plate(name, mm, [xB, yB, zF], [xB, yB, zR], [xT, yT, zF], o);
export const leftSidePlate = (name, mm, xB, yB, xT, yT, zR, zF, o) =>
  plate(name, mm, [-xB, yB, zR], [-xB, yB, zF], [-xT, yT, zR], o);
export const roofPlate = (name, mm, w, y, zR, zF, o) =>
  plate(name, mm, [-w, y, zF], [w, y, zF], [-w, y, zR], o);
export const rightCheekPlate = (name, mm, xIn, zIn, xOut, zOut, y0, y1, tb = 0, xi = 0, o) =>
  plate(name, mm, [xIn, y0, zIn], [xOut, y0, zOut], [xIn - xi, y1, zIn - tb], o);
export const leftCheekPlate = (name, mm, xIn, zIn, xOut, zOut, y0, y1, tb = 0, xi = 0, o) =>
  plate(name, mm, [-xOut, y0, zOut], [-xIn, y0, zIn], [-xOut + xi, y1, zOut - tb], o);

export const moduleBox = (module, min, max, turretLocal = false) => ({ module, min, max, turretLocal });
export const crewBox = (crew, min, max, turretLocal = false) => ({ crew, min, max, turretLocal });

/** Global gameplay balance applied to every guided missile in the fleet. */
export const GUIDED_MISSILE_SPEED_MULTIPLIER = 0.65;

export const shell = (name, type, caliberMm, pen100Mm, pen1000Mm, dmg, velocityMps, extra) => {
  const shellSpec = {
    name, type, caliberMm, pen100Mm, pen1000Mm, dmg, velocityMps,
    moduleDmg: caliberMm, tracer: type, ...(extra || {}),
  };
  if (shellSpec.guided === true) {
    shellSpec.authoredVelocityMps = shellSpec.velocityMps;
    shellSpec.velocityMps *= GUIDED_MISSILE_SPEED_MULTIPLIER;
  }
  return shellSpec;
};

export const apfsdsPenetration = (quoted2km) => {
  const pen1000 = quoted2km / 0.90;
  return [Math.round(pen1000 / 0.91), Math.round(pen1000), quoted2km];
};

/**
 * Build the fleet's class-template armor envelope. Two legacy callers omit
 * the layout flag from their records; one of those also disallows turretless
 * sizing. The options make those schema exceptions explicit and testable.
 */
export function communityArmor(o, { exposeTurretless = true, allowTurretless = true } = {}) {
  const hl = o.lenM / 2;
  const hw = o.widM / 2;
  const inW = hw * 0.62;
  const floor = o.hgtM * 0.16;
  const trkTop = o.hgtM * 0.38;
  const roofY = o.turretPivot[1];
  const tp = o.turretPivot;
  const tH = Math.max(0.5, o.hgtM - roofY - 0.1);
  const tw = hw * 0.55;
  const tl = allowTurretless && o.turretless ? hl * 0.5 : hw * 0.62;
  return {
    boundingRadiusM: hl + o.barrelLenM * 0.55 + 0.4,
    ...(exposeTurretless ? { turretless: o.turretless === true } : {}),
    turretPivot: [tp[0], tp[1], tp[2]],
    gunPivot: [o.gunPivot[0], o.gunPivot[1], o.gunPivot[2]],
    gunBarrel: { lengthM: o.barrelLenM, radiusM: o.barrelRadM },
    hullPlates: [
      frontPlate('upper_glacis', o.frontMm, hw * 0.95, o.hgtM * 0.34, hl * 0.92, roofY, hl * 0.62),
      frontPlate('lower_front', o.frontMm, hw * 0.95, floor, hl * 0.8, o.hgtM * 0.34, hl * 0.92),
      rightSidePlate('hull_side_upper_R', o.sideMm, hw, trkTop, hw, roofY, -hl, hl * 0.6),
      leftSidePlate('hull_side_upper_L', o.sideMm, hw, trkTop, hw, roofY, -hl, hl * 0.6),
      rightSidePlate('hull_side_lower_R', o.sideMm, inW, floor, inW, trkTop, -hl * 0.95, hl * 0.9),
      leftSidePlate('hull_side_lower_L', o.sideMm, inW, floor, inW, trkTop, -hl * 0.95, hl * 0.9),
      rightSidePlate('track_R', 18, hw * 0.9, 0.15, hw * 0.9, trkTop, -hl, hl, { kind: 'external', moduleLink: 'trackR' }),
      leftSidePlate('track_L', 18, hw * 0.9, 0.15, hw * 0.9, trkTop, -hl, hl, { kind: 'external', moduleLink: 'trackL' }),
      rearPlate('hull_rear', o.rearMm, hw * 0.95, floor, -hl * 0.92, roofY, -hl),
      roofPlate('hull_roof', o.roofMm, hw * 0.95, roofY, -hl, hl * 0.62),
    ],
    turretPlates: [
      frontPlate('turret_front', o.tFrontMm, tw * 0.8, 0.02, tl, tH, tl * 0.9),
      rightSidePlate('turret_side_R', o.tSideMm, tw, 0.02, tw * 0.92, tH, -tl, tl * 0.85),
      leftSidePlate('turret_side_L', o.tSideMm, tw, 0.02, tw * 0.92, tH, -tl, tl * 0.85),
      rearPlate('turret_rear', o.tRearMm, tw * 0.85, 0.02, -tl, tH, -tl * 1.05),
      roofPlate('turret_roof', o.roofMm, tw, tH + 0.02, -tl, tl * 0.85),
      plate('mantlet', o.mantletMm,
        [-o.barrelRadM * 4, o.gunPivot[1] - 0.28, tl + 0.04],
        [o.barrelRadM * 4, o.gunPivot[1] - 0.28, tl + 0.04],
        [-o.barrelRadM * 4, o.gunPivot[1] + 0.28, tl],
        { kind: 'spaced', gunFollow: true }),
    ],
    modules: [
      moduleBox('engine', [-inW * 0.95, floor, -hl * 0.95], [inW * 0.95, roofY * 0.85, -hl * 0.5]),
      moduleBox('fuelTank', [-inW * 0.95, floor, -hl * 0.48], [inW * 0.95, roofY * 0.65, -hl * 0.28]),
      moduleBox('ammoRack', [-inW * 0.9, floor, -hl * 0.2], [inW * 0.9, roofY * 0.55, hl * 0.28]),
      moduleBox('turretRing', [-tw, roofY - 0.18, tp[2] - tw], [tw, roofY + 0.02, tp[2] + tw]),
      moduleBox('radio', [inW * 0.25, roofY * 0.55, hl * 0.5], [inW * 0.9, roofY * 0.9, hl * 0.8]),
      moduleBox('optics', [0.1, tH * 0.5, tl * 0.3], [tw * 0.55, tH * 0.85, tl * 0.8], true),
      moduleBox('gun', [-o.barrelRadM * 2.4, o.gunPivot[1] - 0.22, -tl * 0.4], [o.barrelRadM * 2.4, o.gunPivot[1] + 0.28, tl], true),
      moduleBox('trackL', [-hw, 0, -hl], [-inW, trkTop, hl]),
      moduleBox('trackR', [inW, 0, -hl], [hw, trkTop, hl]),
    ],
    crew: [
      crewBox('driver', [-inW * 0.8, floor + 0.2, hl * 0.45], [-inW * 0.1, roofY * 0.9, hl * 0.85]),
      crewBox('gunner', [-tw * 0.85, 0.05, -tl * 0.3], [-tw * 0.15, tH * 0.85, tl * 0.5], true),
      crewBox('commander', [tw * 0.15, 0.05, -tl * 0.9], [tw * 0.85, tH * 0.9, -tl * 0.1], true),
      crewBox('loader', [tw * 0.1, 0.05, -tl * 0.2], [tw * 0.8, tH * 0.8, tl * 0.5], true),
    ],
  };
}

/**
 * Build the shared modern fighting-compartment envelope used by MBT and IFV
 * packs. Inputs and returned records stay in runtime meters and millimeters.
 */
export function modernArmor(o) {
  const { hl, hw, inW, floor, trkTop, roofY, tw, tFrontZ, tRearZ, tH } = o;
  const tp = o.turretPivot;
  const armor = (v) => ({ keMm: v[1], ceMm: v[2] });
  return {
    boundingRadiusM: hl + o.barrelLenM * 0.5 + 0.4,
    turretPivot: [tp[0], tp[1], tp[2]],
    gunPivot: [o.gunPivot[0], o.gunPivot[1], o.gunPivot[2]],
    gunBarrel: { lengthM: o.barrelLenM, radiusM: o.barrelRadM },
    hullPlates: [
      frontPlate('upper_glacis', o.glacis[0], hw * 0.92, floor + (roofY - floor) * 0.4, hl * 0.98, roofY, hl * 0.35, armor(o.glacis)),
      frontPlate('lower_front', o.lower[0], hw * 0.9, floor, hl * 0.82, floor + (roofY - floor) * 0.4, hl * 0.98, armor(o.lower)),
      rightSidePlate('hull_side_upper_R', o.side[0], hw, trkTop, hw, roofY, -hl, hl * 0.5, armor(o.side)),
      leftSidePlate('hull_side_upper_L', o.side[0], hw, trkTop, hw, roofY, -hl, hl * 0.5, armor(o.side)),
      rightSidePlate('hull_side_lower_R', o.side[0], inW, floor, inW, trkTop, -hl * 0.95, hl * 0.9, armor(o.side)),
      leftSidePlate('hull_side_lower_L', o.side[0], inW, floor, inW, trkTop, -hl * 0.95, hl * 0.9, armor(o.side)),
      ...(o.skirt ? [
        rightSidePlate('skirt_R', o.skirt[0], hw + 0.02, trkTop * 0.55, hw + 0.02, trkTop + 0.15, -hl * 0.9, hl * 0.9,
          { kind: 'spaced', ...armor(o.skirt) }),
        leftSidePlate('skirt_L', o.skirt[0], hw + 0.02, trkTop * 0.55, hw + 0.02, trkTop + 0.15, -hl * 0.9, hl * 0.9,
          { kind: 'spaced', ...armor(o.skirt) }),
      ] : []),
      rightSidePlate('track_R', 20, hw * 0.86, 0.12, hw * 0.86, trkTop, -hl, hl, { kind: 'external', moduleLink: 'trackR' }),
      leftSidePlate('track_L', 20, hw * 0.86, 0.12, hw * 0.86, trkTop, -hl, hl, { kind: 'external', moduleLink: 'trackL' }),
      rearPlate('hull_rear', o.rear, hw * 0.95, floor, -hl, roofY, -hl),
      roofPlate('hull_roof', o.roof, hw * 0.95, roofY, -hl, hl * 0.35),
    ],
    turretPlates: [
      rightCheekPlate('turret_cheek_R', o.cheek[0], tw * 0.16, tFrontZ, tw, tFrontZ - tw * 0.72, 0.0, tH, tH * 0.12, 0, armor(o.cheek)),
      leftCheekPlate('turret_cheek_L', o.cheek[0], tw * 0.16, tFrontZ, tw, tFrontZ - tw * 0.72, 0.0, tH, tH * 0.12, 0, armor(o.cheek)),
      plate('mantlet', o.mantlet[0],
        [-o.barrelRadM * 3.6, o.gunPivot[1] - 0.24, tFrontZ + 0.06],
        [o.barrelRadM * 3.6, o.gunPivot[1] - 0.24, tFrontZ + 0.06],
        [-o.barrelRadM * 3.6, o.gunPivot[1] + 0.24, tFrontZ + 0.03],
        { ...armor(o.mantlet), gunFollow: true }),
      rightSidePlate('turret_side_R', o.tSide[0], tw, 0.0, tw, tH, tRearZ, tFrontZ - tw * 0.7, armor(o.tSide)),
      leftSidePlate('turret_side_L', o.tSide[0], tw, 0.0, tw, tH, tRearZ, tFrontZ - tw * 0.7, armor(o.tSide)),
      rearPlate('turret_rear', o.tRear, tw * 0.95, 0.0, tRearZ, tH, tRearZ),
      roofPlate('turret_roof', o.tRoof, tw, tH + 0.01, tRearZ, tFrontZ - tw * 0.7),
    ],
    modules: [
      moduleBox('engine', [-inW * 0.95, floor, -hl * 0.95], [inW * 0.95, roofY * 0.9, -hl * 0.5]),
      moduleBox('fuelTank', [-inW * 0.95, floor, -hl * 0.48], [inW * 0.95, roofY * 0.65, -hl * 0.25]),
      o.bustleAmmo
        ? moduleBox('ammoRack', [-tw * 0.7, 0.0, tRearZ], [tw * 0.7, tH * 0.8, tRearZ * 0.45], true)
        : moduleBox('ammoRack', [-inW * 0.85, floor, -hl * 0.18], [inW * 0.85, roofY * 0.55, hl * 0.28]),
      moduleBox('turretRing', [-tw * 0.85, roofY - 0.18, tp[2] - tw * 0.8], [tw * 0.85, roofY + 0.02, tp[2] + tw * 0.8]),
      moduleBox('radio', [-tw * 0.6, 0.05, tRearZ * 0.85], [-tw * 0.1, tH * 0.55, tRearZ * 0.45], true),
      moduleBox('optics', [tw * 0.2, tH * 0.55, tFrontZ * 0.3], [tw * 0.7, tH * 0.95, tFrontZ * 0.85], true),
      moduleBox('gun', [-o.barrelRadM * 2.4, o.gunPivot[1] - 0.22, -tw * 0.5], [o.barrelRadM * 2.4, o.gunPivot[1] + 0.26, tFrontZ], true),
      moduleBox('trackL', [-hw, 0, -hl], [-inW, trkTop, hl]),
      moduleBox('trackR', [inW, 0, -hl], [hw, trkTop, hl]),
    ],
    crew: [
      crewBox('driver', [-inW * 0.75, floor + 0.15, hl * 0.5], [-inW * 0.05, roofY * 0.9, hl * 0.9]),
      crewBox('gunner', [tw * 0.12, 0.02, -tw * 0.35], [tw * 0.75, tH * 0.85, tw * 0.45], true),
      crewBox('commander', [tw * 0.12, 0.02, tRearZ * 0.6], [tw * 0.8, tH * 0.9, -tw * 0.35], true),
      ...(o.loader
        ? [crewBox('loader', [-tw * 0.75, 0.02, -tw * 0.3], [-tw * 0.12, tH * 0.8, tw * 0.45], true)]
        : []),
    ],
  };
}
