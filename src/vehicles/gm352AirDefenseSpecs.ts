// Release 268, the twin-cannon air-defence round (owner 2026-11-02: "love your work on the terminnators. that made me
// realize we should add more double barrel vehicels"): the Russian pair on the GM-352 chassis family, the 2K22M
// Tunguska-M and the Pantsir-S1 on the tracked GM-352M1E (docs/references/tanks/tunguska_m.md, pantsir_s1.md).
//
// The combat rows are the registrar's (268 R0: published numbers, the BMPT twin 2A42 rows' ammunition and cadence model).
// Builder R's measured build (profiles/gm352Chassis.ts, tunguskaM.ts, pantsirS1.ts) and this spec read one datum table,
// profiles/gm352Layout.ts: the hull's plates, the ring, the trunnion, the twin fire axes, the launch exits, the turret's
// plates, modules and crew all stand on the geometry they describe.
// Combat numbers are game tuning on published figures, not weapon specifications. First-party: Kevin B. Liu (NOTICE.md).
import './afvFamily.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { applyAirDefenseFirepower } from './airDefenseFirepower.ts';
import { crewBox, frontPlate, leftSidePlate, modernArmor, moduleBox, plate, rearPlate, rightSidePlate, roofPlate, shell,
  type ArmorPlate } from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';
import { GM352_GEAR, GM352_HULL as H, GM352_RING, PANTSIR, TUNGUSKA, rackMouths } from './profiles/gm352Layout.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
type Point = [number, number, number];
type Profile = readonly (readonly [number, number])[];

/** One convex planar face, its corners counter-clockwise seen from outside. */
function face(name: string, verts: readonly Point[], keMm: number, ceMm: number): ArmorPlate {
  return { ...plate(name, keMm, verts[0], verts[1], verts[verts.length - 1], { keMm, ceMm, kind: 'main' }),
    verts: verts.map((v) => [...v] as Point), convexPolygon: true };
}

/** A side profile (z, y; counter-clockwise with z to the right) swept across x = -w..w: one face per profile edge and
 * the two flanks. */
function prismPlates(name: string, w: number, profile: Profile, keMm: number, ceMm: number): ArmorPlate[] {
  const edges = profile.map(([z, y], i) => {
    const [z1, y1] = profile[(i + 1) % profile.length];
    return face(`${name}_${i}`, [[-w, y, z], [w, y, z], [w, y1, z1], [-w, y1, z1]], keMm, ceMm);
  });
  return [...edges,
    face(`${name}_left`, profile.map(([z, y]) => [w, y, z] as Point).reverse(), keMm, ceMm),
    face(`${name}_right`, profile.map(([z, y]) => [-w, y, z] as Point), keMm, ceMm)];
}

/** A convex face with its corners wound counter-clockwise seen from outside: from the side away from `inside`. */
function outwardFace(name: string, verts: Point[], inside: Point, keMm: number, ceMm: number): ArmorPlate {
  const [a, b, c] = verts, u = b.map((v, i) => v - a[i]), w = c.map((v, i) => v - a[i]);
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const out = n[0] * (a[0] - inside[0]) + n[1] * (a[1] - inside[1]) + n[2] * (a[2] - inside[2]);
  return face(name, out >= 0 ? verts : [...verts].reverse(), keMm, ceMm);
}

/** The Tunguska's oval lower turret (TUNGUSKA.tub, the rings TUB_PROFILE leans in through): sixteen facets round each
 * band, and its top. */
function tubPlates(name: string, keMm: number, ceMm: number): ArmorPlate[] {
  const { tub } = TUNGUSKA, k = 16;
  const rings = [[0, tub.bottomY], [-0.05, 0.20], [-0.20, 0.30]].map(([dr, y]) => Array.from({ length: k }, (_, i) => {
    const a = (i + 0.5) * 2 * Math.PI / k, rx = (tub.halfWidth + dr) / Math.cos(Math.PI / k);
    return [rx * Math.sin(a), y, tub.centreZ + rx * (tub.halfLength / tub.halfWidth) * Math.cos(a)] as Point;
  }));
  const inside: Point = [0, (tub.bottomY + 0.30) / 2, tub.centreZ];
  const flanks = rings.slice(1).flatMap((ring, band) => ring.map((_, i) => outwardFace(`${name}_${band}_${i}`,
    [rings[band][i], rings[band][(i + 1) % k], ring[(i + 1) % k], ring[i]], inside, keMm, ceMm)));
  return [...flanks, outwardFace(`${name}_top`, [...rings[2]], inside, keMm, ceMm)];
}

/** The regular octagonal lower turret: eight tapered flanks and its top. */
function octagonPlates(name: string, bottomApothem: number, topApothem: number, bottomY: number, topY: number,
  keMm: number, ceMm: number): ArmorPlate[] {
  const at = (apothem: number, y: number, k: number): Point => {
    const a = Math.PI / 8 + k * Math.PI / 4, r = apothem / Math.cos(Math.PI / 8);
    return [r * Math.sin(a), y, r * Math.cos(a)];
  };
  const flanks = Array.from({ length: 8 }, (_, k) => face(`${name}_${k}`, [at(bottomApothem, bottomY, k - 1),
    at(bottomApothem, bottomY, k), at(topApothem, topY, k), at(topApothem, topY, k - 1)], keMm, ceMm));
  // seen from above, counter-clockwise runs from +z toward +x (the angle's own sense)
  const top = face(`${name}_top`, Array.from({ length: 8 }, (_, k) => at(topApothem, topY, k)), keMm, ceMm);
  return [...flanks, top];
}

/** A drum along z (the Pantsir's tracking radar): twelve facets and its front face. */
function drumPlates(name: string, r: number, y: number, z0: number, z1: number, keMm: number, ceMm: number): ArmorPlate[] {
  const at = (k: number, z: number): Point => [r * Math.cos(k * Math.PI / 6), y + r * Math.sin(k * Math.PI / 6), z];
  return [...Array.from({ length: 12 }, (_, k) => face(`${name}_${k}`, [at(k, z0), at(k + 1, z0), at(k + 1, z1), at(k, z1)],
    keMm, ceMm)), face(`${name}_front`, Array.from({ length: 12 }, (_, k) => at(k, z1)), keMm, ceMm)];
}

/** A flat antenna box (the Pantsir's search radar): its outline across the face (x, up) swept through its depth, then
 * leaned back about its centre. */
function antennaBoxPlates(name: string, outline: readonly (readonly [number, number])[], depth: number,
  at: (x: number, up: number, out: number) => Point, keMm: number, ceMm: number): ArmorPlate[] {
  const inside = at(0, 0, 0), front = outline.map(([x, up]) => at(x, up, depth / 2)), back = outline.map(([x, up]) => at(x, up, -depth / 2));
  return [outwardFace(`${name}_front`, front, inside, keMm, ceMm), outwardFace(`${name}_back`, back, inside, keMm, ceMm),
    ...outline.map((_, i) => outwardFace(`${name}_${i}`, [front[i], front[(i + 1) % outline.length], back[(i + 1) % outline.length],
      back[i]], inside, keMm, ceMm))];
}

/** The GM-352 hull's plates (gm352Layout.ts GM352_HULL, the shells gm352Chassis.ts draws), each at the thickness the
 * registrar's BMP-3-class envelope gave its namesake (aluminium-and-steel light armour: the GM-352's 7.62 mm and
 * splinter protection). */
function gm352HullPlates(donor: readonly ArmorPlate[]): ArmorPlate[] {
  const mm = (name: string): [number, { keMm: number; ceMm: number }] => {
    const p = donor.find((candidate) => candidate.name === name);
    if (!p) throw new Error(`gm352 hull: the donor envelope has no ${name}`);
    return [p.physicalMm, { keMm: p.keMm, ceMm: p.ceMm }];
  };
  const L = H.halfLength;
  const [glacis, glacisArmor] = mm('upper_glacis'), [lowerMm, lowerArmor] = mm('lower_front');
  const [sideMm, sideArmor] = mm('hull_side_upper_R'), [rearMm] = mm('hull_rear'), [roofMm] = mm('hull_roof');
  return [
    frontPlate('upper_glacis', glacis, H.sideX, H.noseY, L, H.deckY, H.glacisTopZ, glacisArmor),
    frontPlate('lower_front', lowerMm, H.tubX, H.bellyY, H.lowerFootZ, H.noseY, L, lowerArmor),
    rightSidePlate('hull_side_upper_R', sideMm, H.sideX, H.sponsonY, H.sideX, H.deckY, -L, H.glacisTopZ, sideArmor),
    leftSidePlate('hull_side_upper_L', sideMm, H.sideX, H.sponsonY, H.sideX, H.deckY, -L, H.glacisTopZ, sideArmor),
    rightSidePlate('hull_side_lower_R', sideMm, H.tubX, H.bellyY, H.tubX, H.sponsonY, H.sternBellyZ, H.lowerFootZ, sideArmor),
    leftSidePlate('hull_side_lower_L', sideMm, H.tubX, H.bellyY, H.tubX, H.sponsonY, H.sternBellyZ, H.lowerFootZ, sideArmor),
    rightSidePlate('track_R', 20, GM352_GEAR.xc + GM352_GEAR.trackW / 2, 0.12, GM352_GEAR.xc + GM352_GEAR.trackW / 2,
      GM352_GEAR.topY, -L, L, { kind: 'external', moduleLink: 'trackR' }),
    leftSidePlate('track_L', 20, GM352_GEAR.xc + GM352_GEAR.trackW / 2, 0.12, GM352_GEAR.xc + GM352_GEAR.trackW / 2,
      GM352_GEAR.topY, -L, L, { kind: 'external', moduleLink: 'trackL' }),
    rearPlate('hull_rear', rearMm, H.sideX, H.sternFootY, -L, H.sternTopY, -L),
    roofPlate('hull_roof', roofMm, H.sideX, H.deckY, H.deckRearZ, H.glacisTopZ),
  ];
}

interface AirDefenseRow {
  readonly id: string;
  readonly name: string;
  readonly gunPivot: readonly [number, number, number];
  readonly gunX: number;
  readonly boreDx: number;
  readonly muzzleZ: number;
  readonly tubes: readonly { x: number; y: number; z: number }[];
}

function airDefenseVariant(row: AirDefenseRow): FleetTankSpec {
  const spec = cloneFleetVariant(registries.tankSpecs, row.id, 'bmp3', {
    name: row.name, nation: 'Russia', era: 'modern', role: 'ifv',
  });
  delete spec.balancePeerOf;
  delete spec.publicVisualFallback;
  delete spec.label;
  delete spec.roster;
  delete spec.variantOf;
  stripSilhouetteDimensions(spec.dims);
  const gunPivot: Point = [...row.gunPivot];
  // The GM-352 envelope (the shared fighting-compartment template on this hull's numbers), then the measured plates
  const envelope = modernArmor({
    hl: H.halfLength, hw: H.sideX, inW: H.tubX, floor: H.bellyY, trkTop: GM352_GEAR.topY, roofY: H.deckY,
    turretPivot: [GM352_RING[0], GM352_RING[1], GM352_RING[2]], gunPivot, barrelLenM: row.muzzleZ, barrelRadM: 0.044,
    glacis: [35, 45, 60], lower: [30, 35, 40], side: [25, 28, 30], skirt: null, rear: 20, roof: 10,
    tw: 1.0, tFrontZ: 1.0, tRearZ: -1.0, tH: 0.9, cheek: [15, 15, 20], tSide: [15, 15, 20], tRear: 15, tRoof: 10,
    mantlet: [15, 15, 20],
  });
  spec.armor = {
    ...envelope,
    gunBarrel: { lengthM: row.muzzleZ, radiusM: 0.044, collision: false },
    hullPlates: gm352HullPlates(spec.armor.hullPlates),
    // the driver sits front left (+x), under his vision box
    crew: [crewBox('driver', [0.30, H.bellyY + 0.15, 2.30], [1.00, H.deckY - 0.05, 3.10])],
    modules: envelope.modules.filter((box) => !box.turretLocal),
  };
  spec.gun = {
    ...spec.gun,
    // one fire axis per 2A38M, on its inner bore (barrel groups 0 and 1, firing alternately)
    muzzles: [{ x: -(row.gunX - row.boreDx), y: 0 }, { x: row.gunX - row.boreDx, y: 0 }],
    launcherMuzzles: row.tubes.map((tube) => ({ ...tube })),
  };
  for (const key of ['launcherSalvo', 'autoloader', 'fixedLaunchCanisters', 'primaryGuided', 'muzzleBoreSegments'] as const) {
    delete spec.gun[key];
  }
  spec.visual = { ...spec.visual, trackWidthM: GM352_GEAR.trackW };
  return spec;
}

// ---- 2K22M Tunguska-M ---------------------------------------------------------------------------------------------
// The 2K22M's 9M311M ride outboard of the 2A38M guns, four a side, two by two (Wikipedia 2K22: "eight ready-to-fire 9M311M
// missiles, four per side"): the launch exits on the containers' front covers.
const { rack: TR, body: TB, radarBox: TRB, trackRadar: TT } = TUNGUSKA;
const tunguska = airDefenseVariant({
  id: 'tunguska_m', name: '2K22M Tunguska-M', gunPivot: TUNGUSKA.gunPivot, gunX: TUNGUSKA.gunX, boreDx: TUNGUSKA.boreDx,
  muzzleZ: TUNGUSKA.muzzleZ, tubes: rackMouths(TR.tubeXs, TR.tubeYs, TR.mouthZ),
});
// Wikipedia 2K22 (the M1 data for the M): ~35 t (34 t for the M), 7.90-7.93 m, 3.25 m, 3.35 m radar stowed and 4.0 m
// raised, the V-46 at 780 hp (710 hp governed), 65 km/h, crew 4; 1,904 30 mm rounds; the guns -10 to +87 degrees.
Object.assign(tunguska, {
  hp: 2300, enginePowerHp: 780, weightTons: 34, topSpeedKmh: 65, reverseSpeedKmh: 18, hullTraverseDegS: 40,
  turretTraverseDegS: 70, gunPitchDegS: 50, gunElevationDeg: 87, gunDepressionDeg: 10,
});
// the build shows the search radar folded, as photographs 01-06 do: the gunner's sight head is its top (the published
// 3.36 m stowed height)
tunguska.dims = { hullLengthM: 7.93, overallLengthM: 7.93, widthM: 3.24, heightM: +(GM352_RING[1] + TB.roofY + 0.36).toFixed(2) };
{
  const gp = TUNGUSKA.gunPivot;
  // the turret: 7.62 mm and splinter protection (Wikipedia 2K22), the lower turret, the upper body, the radar housing
  tunguska.armor.turretPlates = [
    ...tubPlates('tg_lower', 15, 20),
    ...prismPlates('tg_body', TB.halfWidth, [[TB.rearZ, TB.bottomY], [TB.frontZ, TB.bottomY], [TB.frontZ, TB.browY],
      [TB.browZ, TB.roofY], [TB.rearZ, TB.roofY]], 15, 20),
    ...prismPlates('tg_radar', TRB.halfWidth, [[TRB.rearZ, TRB.bottomY], [TRB.frontZ, TRB.bottomY], [TRB.frontZ, TRB.topY],
      [TRB.rearZ + 0.08, TRB.topY], [TRB.rearZ, TRB.topY - 0.08]], 15, 20),
    ...drumPlates('tg_track', TT.r, TT.y, TT.rearZ, TT.frontZ, 10, 12),
  ];
  tunguska.armor.modules.push(
    moduleBox('radio', [-0.70, 0.30, TRB.rearZ + 0.10], [0.70, 1.00, TRB.frontZ - 0.10], true),
    moduleBox('optics', [-0.55, TB.roofY, 0.37], [-0.29, TB.roofY + 0.36, 0.63], true),
    { ...moduleBox('gun', [-(TUNGUSKA.gunX + 0.14), gp[1] - 0.13, gp[2] - 0.32], [TUNGUSKA.gunX + 0.14, gp[1] + 0.13, gp[2] + 0.64],
      true), external: true },
    { ...moduleBox('missileRack', [-TR.outerX, gp[1] + TR.bottomY, gp[2] - TR.arcR], [TR.outerX, gp[1] + TR.topY, gp[2] + TR.mouthZ],
      true), gunFollow: true, external: true },
  );
  tunguska.armor.crew.push(
    // internalLayoutRegistry.ts spaaTunguska: commander front left (+x), gunner front right, radar operator rear left
    crewBox('gunner', [-0.70, TB.bottomY + 0.05, -0.40], [-0.05, TB.roofY - 0.08, 0.40], true),
    crewBox('commander', [0.05, TB.bottomY + 0.05, -0.40], [0.70, TB.roofY - 0.08, 0.40], true),
    crewBox('radioOperator', [0.05, TB.bottomY + 0.05, -1.25], [0.70, TB.roofY - 0.08, -0.45], true),
  );
}
// The BMPT Terminator 2's twin 2A42 package (afvFamily.ts, at the shown-tier floor fleetBalancePass applyShownTierFloors
// gave it): the 2A38M fires the same 30 x 165 mm ammunition. The 1,904 rounds split evenly, as the BMPT's 850.
tunguska.gun = {
  ...tunguska.gun, caliberMm: 30, reloadS: .30, baseAccuracy: .26, aimTimeS: 1.10, soundProfile: 'twin-2a42',
  shells: [
    shell('3UBR8 APDS', 'APFSDS', 30, 125, 112, 52, 1120, { pen2000Mm: 100, reloadS: .30, count: 952 }),
    // Game balance on the M6 Linebacker's Stinger handling (m6LinebackerSpecs.ts): a blast-fragmentation SAM, its 9 kg
    // rod warhead over the Stinger's, at the 9M311's 900 m/s peak; one round per tube.
    shell('9M311M', 'HE', 76, 25, 25, 360, 900,
      { pen2000Mm: 25, reloadS: 3.0, count: 8, guided: true, launcherTubes: 8, soundProfile: 'tow-launch' }),
    shell('3UOF8 HE-I', 'HE', 30, 8, 8, 48, 960, { pen2000Mm: 8, reloadS: .30, count: 952 }),
  ],
};
// The 2008 Moscow parade coat (owner 2026-11-05: "tunguska and pantsir need camos"; the parade rehearsal photographs):
// broad soft bands of a grey buff and a near-black over the olive, about equal in area
tunguska.visual = { ...tunguska.visual, scheme: 'nato', base: '#5a5d3b', weather: '#6b6d4a', patches: ['#a59e7f', '#2f3329'],
  camoScale: .9, patchK: 1.2, marking: 'number', number: '211' };

// ---- Pantsir-S1 (tracked) -----------------------------------------------------------------------------------------
// The Pantsir-S1 combat module: twelve 57E6 in two six-tube banks (Wikipedia Pantsir: "up to twelve 57E6"), two
// columns of three a side, outboard of the 2A38M guns.
const { bank: PB, body: PBD, radar: PR, platform: PP, searchRadar: PS, sidePlate: PSP } = PANTSIR;
const pantsir = airDefenseVariant({
  id: 'pantsir_s1', name: 'Pantsir-S1 (tracked)', gunPivot: PANTSIR.gunPivot, gunX: PANTSIR.gunX, boreDx: PANTSIR.boreDx,
  muzzleZ: PANTSIR.muzzleZ, tubes: rackMouths(PB.tubeXs, PB.tubeYs, PB.mouthZ),
});
// The tracked option on the GM-352M1E (Engineering Technologies 2012; Wikipedia lists it under prototypes): no weight is
// published; the GM-352 family's 34-35 t and the Tunguska's 780 hp V-46 are the estimate. Crew 3; 700 rounds a gun
// (1,400); the system's -5 to +85 degree envelope.
Object.assign(pantsir, {
  hp: 2450, enginePowerHp: 780, weightTons: 35, topSpeedKmh: 65, reverseSpeedKmh: 18, hullTraverseDegS: 39,
  turretTraverseDegS: 72, gunPitchDegS: 50, gunElevationDeg: 85, gunDepressionDeg: 5,
});
// the "~7.8 m" the brief gives for the tracked option is not a published datum; the shared GM-352 hull builds 7.93 m
pantsir.dims = { hullLengthM: 7.93, overallLengthM: 7.93, widthM: 3.24,
  heightM: +(GM352_RING[1] + PANTSIR.searchRadar.panelTopY + 0.01).toFixed(2) };
{
  const gp = PANTSIR.gunPivot, tilt = PS.tilt, cy = (PS.panelBottomY + PS.panelTopY) / 2, h = PS.panelTopY - PS.panelBottomY;
  // the search radar's box antenna, its top corners chamfered, leaning back on its mast (pantsirS1.ts searchRadar; the
  // plates leave out its back edges' 8 cm chamfers)
  const w = PS.halfWidth, c = PS.chamfer;
  const panel = antennaBoxPlates('ps_search', [[-w, -h / 2], [w, -h / 2], [w, h / 2 - c], [w - c, h / 2], [-w + c, h / 2], [-w, h / 2 - c]],
    PS.depth, (x, up, out) => [x, cy + up * Math.cos(tilt) - out * Math.sin(tilt), PS.z + up * Math.sin(tilt) + out * Math.cos(tilt)],
    8, 10);
  // the side plates at the banks' rear feet (pantsirS1.ts moduleBody)
  const sidePlates = [-1, 1].flatMap((s) => {
    const [x0, x1] = s < 0 ? [-PSP.outerX, -PSP.innerX] : [PSP.innerX, PSP.outerX];
    const corners = [x0, x1].flatMap((x) => [PSP.bottomY, PSP.topY].flatMap((y) => [PSP.rearZ, PSP.frontZ].map((z) => [x, y, z] as Point)));
    const inside: Point = [(x0 + x1) / 2, (PSP.bottomY + PSP.topY) / 2, (PSP.rearZ + PSP.frontZ) / 2];
    const quad = (k: number, a: number[]) => outwardFace(`ps_side${s < 0 ? 'R' : 'L'}_${k}`, a.map((i) => corners[i]), inside, 15, 20);
    return [quad(0, [0, 1, 3, 2]), quad(1, [4, 5, 7, 6]), quad(2, [0, 1, 5, 4]), quad(3, [2, 3, 7, 6]), quad(4, [0, 2, 6, 4]),
      quad(5, [1, 3, 7, 5])];
  });
  pantsir.armor.turretPlates = [
    ...octagonPlates('ps_platform', PP.bottomApothem, PP.topApothem, PP.bottomY, PP.topY, 15, 20),
    ...prismPlates('ps_body', PBD.halfWidth, [[PBD.rearZ, PBD.bottomY], [PBD.frontZ, PBD.bottomY], [PBD.frontZ, PBD.topY],
      [PBD.rearZ + 0.20, PBD.topY], [PBD.rearZ, PBD.topY - 0.18]], 15, 20),
    ...drumPlates('ps_radar', PR.r, PR.y, PR.rearZ, PR.frontZ, 10, 12),
    ...panel,
    ...sidePlates,
  ];
  pantsir.armor.modules.push(
    moduleBox('radio', [-0.45, 0.25, PBD.rearZ + 0.10], [0.45, 0.85, -0.55], true),
    // the tracking radar is the module's sight: its drum
    moduleBox('optics', [-PR.r, PR.y - PR.r, PR.rearZ + 0.10], [PR.r, PR.y + PR.r, PR.frontZ + 0.10], true),
    { ...moduleBox('gun', [-(PANTSIR.gunX + 0.14), gp[1] - 0.13, gp[2] + PANTSIR.gunDz - 0.32],
      [PANTSIR.gunX + 0.14, gp[1] + 0.13, gp[2] + PANTSIR.gunDz + 0.64], true), external: true },
    { ...moduleBox('missileRack', [-(PB.tubeXs[1] + PB.tubeR), gp[1] + PB.cradleBottomY, gp[2] + PB.cradleRearZ],
      [PB.tubeXs[1] + PB.tubeR, gp[1] + PB.tubeYs[2] + PB.tubeR, gp[2] + PB.mouthZ], true), gunFollow: true, external: true },
  );
  // the 30 mm ready rounds kept under the module's roof: the template's rack (modernArmor) stood to 1.10 m, through the
  // 0.95 m roof into the roof sight (268 internalPlacement: ammoRack ∩ optics once the cradle arm refit its seat)
  pantsir.armor.modules = pantsir.armor.modules.map((box) => box.module !== 'ammoRack' ? box
    : { ...box, max: [box.max[0], PBD.topY - 0.05, box.max[2]] as Point });
  pantsir.armor.crew.push(
    // internalLayoutRegistry.ts IFV_TWO_MAN_TURRET: gunner front right (-x), commander rear right
    crewBox('gunner', [-0.48, PBD.bottomY + 0.05, -0.30], [-0.05, PBD.topY - 0.08, 0.20], true),
    crewBox('commander', [-0.48, PBD.bottomY + 0.05, -0.85], [-0.05, PBD.topY - 0.08, -0.35], true),
  );
}
// The BMPT T-90's twin 2A42 package (afvFamily.ts) at the Pantsir's tier VI
pantsir.gun = {
  ...pantsir.gun, caliberMm: 30, reloadS: .28, baseAccuracy: .25, aimTimeS: 1.05, soundProfile: 'twin-2a42',
  shells: [
    shell('3UBR8 APDS', 'APFSDS', 30, 122, 110, 50, 1120, { pen2000Mm: 98, reloadS: .28, count: 700 }),
    // the 57E6's 20 kg warhead and its 1,300 m/s peak; one round per tube
    shell('57E6', 'HE', 90, 25, 25, 380, 1300,
      { pen2000Mm: 25, reloadS: 3.0, count: 12, guided: true, launcherTubes: 12, soundProfile: 'tow-launch' }),
    shell('3UOF8 HE-I', 'HE', 30, 8, 8, 46, 960, { pen2000Mm: 8, reloadS: .28, count: 700 }),
  ],
};
// The Pantsir-S1's Russian tri-colour (owner 2026-11-05): green under khaki and black blotches, warmer and darker than
// the Tunguska's parade bands so the two GM-352 vehicles read apart
pantsir.visual = { ...pantsir.visual, scheme: 'blotch', base: '#4b5a36', weather: '#5c6844', patches: ['#8c7a55', '#24271f'],
  camoScale: .7, patchK: 1.3, marking: 'number', number: '421' };

// The owner's air-defence firepower (2026-11-06, airDefenseFirepower.ts): the floor cycle, twice the output, six times the
// rounds; each rack fires whole: the Tunguska-M's eight 9M311M, the Pantsir-S1's twelve 57E6, three loads of each.
applyAirDefenseFirepower(tunguska, { rounds: 8, intervalS: 0.15 });
applyAirDefenseFirepower(pantsir, { rounds: 12, intervalS: 0.15 });
registerFleetSpecs(registries, ['tunguska_m', 'pantsir_s1'], { tunguska_m: tunguska, pantsir_s1: pantsir });
