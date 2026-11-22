import {addRearFieldStowage} from './rearFieldStowage.ts';
import { antennaPart } from './antennaPart.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import { sectionSolid } from './sectionSolid.ts';
import { addGunFloodlight, type GunFloodlightSeat } from './gunFloodlight.ts';
import { preserveSourceStudyGunMountAppearance } from './sourceStudyGunMount.ts';
import { EASTERN_SOURCE_STUDIES } from '../easternSourceStudyData.ts';
import { antenna, equipment, hatch, panel, openGunTube, hullStation, optic, towEye, turretStation } from './easternSourceKit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
const { box, cylX, cylY, cylZ } = KIT;
// Closed X-extruded stock from scalar plane intersections. These are authored
// prisms, not sampled source contours or runtime source topology.
function bowPrism(x0: number, x1: number, yz: readonly (readonly [
    number,
    number
])[]): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    yz.forEach(([y, z], i) => i ? shape.lineTo(-z, y) : shape.moveTo(-z, y));
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false, steps: 1 })
        .rotateY(Math.PI / 2).translate(x0, 0, 0);
}
function addBowStock(P: TankBuilderPort): void {
    // Object_23's five protective blocks. Internal explosive composition is
    // unproven: use permanent external armor, never inherited donor ERA zones.
    // The source omits their receiving faces; close each native underside.
    const forward: readonly (readonly [
        number,
        number
    ])[] = [
        [1.22635, 3.11416], [1.07997, 3.45481], [1.15437, 3.56476], [1.32157, 3.15558],
    ];
    for (const [x0, x1] of [[-.59890, .00030], [.00054, .59974]])
        P.addExternalArmor('hull', bowPrism(x0, x1, forward));
    const aft: readonly (readonly [
        number,
        number
    ])[] = [
        [1.39885, 2.71730], [1.23472, 3.11114], [1.32430, 3.15161],
        [1.38201, 2.99573], [1.41244, 2.71949],
    ];
    for (const [x0, x1] of [[-.92359, -.39919], [-.39884, .39996], [.40046, .92346]])
        P.addExternalArmor('hull', bowPrism(x0, x1, aft));
}
function addType96HullSides(P: TankBuilderPort): void {
    for (const side of [-1, 1]) {
        for (let i = 0; i < 6; i++) {
            const z = -2.80 + i * 1.03;
            P.addMudguard(`type96-skirt-${side}-${i}`, 'hull', box(.028, .43, 1.00), side * 1.708, 1.235, z);
            equipment(P, 'hull', 'Detail', box(.39, .036, .93), side * 1.51, 1.49, z);
            if (P.q)
                for (const dz of [-.41, .41])
                    equipment(P, 'hull', 'Detail', box(.018, .020, .038), side * 1.728, 1.414, z + dz);
        }
        P.addMudguard(`type96-front-${side}`, 'hullRubber', box(.57, .29, .033), side * 1.381, 1.235, 3.46, -.41); // bottom edge seated in the bow fender sheet
        P.addMudguard(`type96-rear-${side}`, 'hullRubber', box(.57, .32, .034), side * 1.381, 1.235, -3.42, .18);
        // These two bow fixtures are driving lamps, not crew optics.
        equipment(P, 'hull', 'Detail', box(.23, .13, .17), side * .98, 1.31, 2.96);
        equipment(P, 'hull', 'Dark', box(.23 * .76, .13 * .70, .018), side * .98, 1.31, 2.96 + .17 / 2 + .005);
        equipment(P, 'hull', 'Glass', markVehicleNightLens(box(.23 * .62, .13 * .52, .012), 'headlight'),
          side * .98, 1.31, 2.96 + .17 / 2 + .017);
        equipment(P, 'hull', 'Detail', box(.045, .17, .27), side * .98, 1.40, 2.98);
        towEye(P, side, .73, .99, 3.35);
        equipment(P, 'hull', 'Detail', box(.11, .10, .34), side * 1.37, 1.58, -2.61);
        equipment(P, 'hull', 'Detail', box(.41, .10, .16), side * .86, 1.60, -3.19);
    }
}
function addType96RearDeck(P: TankBuilderPort): void {
    // Source rear deck has access covers and two separate horizontal louver
    // banks on its vertical rear face. There are no broad top deck grilles.
    for (const side of [-1, 1]) {
        panel(P, 'hull', side * .68, 1.641, -2.64, 1.28, 1.29, .025, .025);
        for (const z of [-3.20, -2.10])
            for (const x of [.20, 1.13])
                equipment(P, 'hull', 'Detail', cylX(.018, .08, 10), side * x, 1.662, z);
        equipment(P, 'hull', 'Dark', box(.932, .415, .026), side * .473, 1.318, -3.3978);
        // Object_22 has nine overlapping pitched blades in each 821 mm bank.
        // Preserve their real 29–35 mm cadence rather than seven coarse bars.
        for (const y of [1.1875, 1.2163, 1.2505, 1.2847, 1.31935, 1.34765, 1.38185, 1.4160, 1.4507])
            equipment(P, 'hull', 'Detail', box(.8212, .006, .055), side * .4732, y + .0042, -3.3985, .79);
        for (const x of [.0347, .9146])
            equipment(P, 'hull', 'Detail', box(.018, .415, .024), side * x, 1.318, -3.4118);
        for (const y of [1.113, 1.521])
            equipment(P, 'hull', 'Detail', box(.932, .018, .024), side * .473, y, -3.4118);
        // -3.4824 is the source towing extent, not the hull's rear cap.
        equipment(P, 'hull', 'Detail', box(.064, .044, .085), side * .6555, 1.001, -3.4273);
        equipment(P, 'hull', 'Detail', new THREE.TorusGeometry(.055, .0145, 8, P.q ? 20 : 12), side * .6555, .9465, -3.467);
        // Separate bow panel hinges and raised towing seats.
        for (const x of [.24, .99])
            equipment(P, 'hull', 'Detail', cylX(.024, .12, 12), side * x, 1.481, 1.83);
        equipment(P, 'hull', 'Detail', box(.14, .12, .21), side * .73, 1.13, 3.34, -.18);
    }
}
// A shell station: z, low/shoulder/top half widths, floor, shoulder and roof heights.
type Type96Station = readonly [z: number, lowHalf: number, shoulderHalf: number, topHalf: number,
    floor: number, shoulder: number, roof: number];
// The central hull's stations.
const TYPE96_HULL_STATIONS: readonly Type96Station[] = [
    [-3.3848, 1.02, 1.68, 1.53, .56, 1.335, 1.60],
    [-3.20, 1.06, 1.69, 1.55, .48, 1.340, 1.60],
    [-1.23, 1.08, 1.69, 1.55, .47, 1.350, 1.62],
    [1.00, 1.08, 1.70, 1.54, .47, 1.370, 1.59],
    [2.60, 1.03455, 1.70, 1.39455, .54273, 1.37727, 1.43091],
    [2.6992, 1.03173, 1.70, 1.38553, .54724, 1.37772, 1.41240],
];
/** The driver's station on the roof plane between the 1.00 and 2.60 stations (level across, falling 159 mm forward).
 * Release 227 (CN critic round 5): the level hatch lid hovered 9-65 mm over that plane and its three periscopes
 * 108-117 mm over the roof, under the mantlet boot (the middle head stood 59 mm inside it with the gun at rest).
 * The lid now stands on a coaming, 20 mm inside its rim, its underside 6 mm into the roof at every point of its
 * foot, its top 2 mm into the lid; the periscope row stands 10 mm ahead of the rim, out of the boot's sweep, each
 * head's floor 8 mm over the roof at its centre on a base cut to the roof's fall (underside 6 mm into the roof). The
 * base stands 2 mm inside the head's sides, front and rear and reaches 8 mm into it, past the 14 mm round of its
 * lower edges. A 30 mm neck on a 15 mm inset left slots under the head's overhang and its window that the watertight
 * gate's 25 mm lattice reads as enclosed pockets (0.19 L a side head). */
function addType96DriverStation(P: TankBuilderPort): void {
    const [a, b] = [TYPE96_HULL_STATIONS[3], TYPE96_HULL_STATIONS[4]];
    const roof = (z: number) => a[6] + (b[6] - a[6]) * (z - a[0]) / (b[0] - a[0]);
    const lid = { y: 1.60, z: 1.50, r: .32, h: .045 };
    hatch(P, 'hull', 0, lid.y, lid.z, lid.r);
    const coaming = cylY(lid.r - .02, lid.r - .02, lid.h, P.q ? 28 : 16), p = coaming.getAttribute('position');
    for (let i = 0; i < p.count; i++)
        p.setY(i, p.getY(i) > 0 ? lid.y - lid.h / 2 + .002 : roof(lid.z + p.getZ(i)) - .006);
    equipment(P, 'hull', 'Detail', coaming, 0, 0, lid.z);
    const head = { w: .18, h: .06, d: .08 }, z = lid.z + lid.r + .01 + head.d / 2, floor = roof(z) + .008;
    for (const x of [-.25, 0, .25]) {
        optic(P, 'hull', x, floor + head.h / 2, z, head.w, head.h, head.d);
        const x0 = x - head.w / 2 + .002, x1 = x + head.w / 2 - .002;
        equipment(P, 'hull', 'Detail', sectionSolid([z - head.d / 2 + .002, z + head.d / 2 - .002].map(zz => ({ z: zz,
            ring: [[x0, roof(zz) - .006], [x1, roof(zz) - .006], [x1, floor + .008], [x0, floor + .008]] as const }))), 0, 0, 0);
    }
}
function buildType96Hull(P: TankBuilderPort): void {
    P.add('hull', sectionSolid(TYPE96_HULL_STATIONS.map(row => hullStation(...row)), { sideQuadDiagonal: 'convex' }));
    // The forward central shell ends at its own nose, not the fender AABB.
    // Object_22's upper glacis is two measured planes; the former broad flat
    // roof sat above the armor blocks and hid their actual receiving faces.
    P.add('hull', sectionSolid([
        { z: 2.6992, ring: [[-1.03173, .54724], [1.03173, .54724], [1.03173, 1.350], [.9375, 1.41240], [-.9375, 1.41240], [-1.03173, 1.350]] },
        { z: 3.3008, ring: [[-.9946, .96313], [.9946, .96313], [.9946, 1.104], [.9263, 1.14780], [-.9263, 1.14780], [-.9946, 1.104]] },
        { z: 3.4551, ring: [[-.9263, 1.060], [.9263, 1.060], [.9263, 1.073], [.9263, 1.08040], [-.9263, 1.08040], [-.9263, 1.073]] },
    ], { sideQuadDiagonal: 'convex' }));
    // Separate thin bent fenders follow their own higher outboard planes.
    // This avoids either raising the center receiver or filling the track bay.
    const fender: readonly (readonly [
        number,
        number
    ])[] = [
        [1.3623, 2.6992], [1.3667, 2.8047], [1.3319, 3.1211], [1.2109, 3.373],
        [1.0986, 3.500], [1.0712, 3.5488], [1.0860, 3.5488], [1.1165, 3.500],
        [1.2288, 3.373], [1.3499, 3.1211], [1.3851, 2.8047], [1.3801, 2.6992],
    ];
    for (const side of [-1, 1]) {
        const x0 = side < 0 ? -1.7100 : .9961, x1 = side < 0 ? -.9961 : 1.7100;
        P.add('hull', bowPrism(x0, x1, fender));
    }
    addBowStock(P);
    addType96HullSides(P);
    // Object_22 rear upper latches project beyond the cap and overlap it
    // by 2 mm. Their source open receiving faces become closed native stock.
    for (const x of [-.79935, -.25125, .25125, .79935])
        equipment(P, 'hull', 'Detail', box(.1787, .0293, .0899), x, 1.57845, -3.42775);
    // Sloped upper glacis service panels remain thin plates on the actual hull.
    for (const x of [-.59, .59])
        equipment(P, 'hull', 'Detail', box(.87, .035, 1.04), x, 1.443, 2.12, -.16);
    addType96DriverStation(P);
    addType96RearDeck(P);
}
function buildType96Gear(P: TankBuilderPort): void {
    // owner 2026-09-22 ("standardize our wheels across NATIONS"): the road-wheel face is the China MBT nation
    // construction (ztz100, nationWheelSets.ts), fitted by the running-gear builder into this hull's own wheel envelope.
    P.gear = KIT.buildRunningGear(P, {
        style: 'rubber', trackPattern: 'soviet-single-pin',
        wheelR: .3383, wheelW: .3994, wheelY: .4119,
        wheelZs: [-2.1506, -1.3273, -.5014, .4641, 1.4368, 2.3793],
        xc: 1.3772, trackW: .569, trackTh: .030, topY: 1.225, botY: .040,
        sprocket: { z: -2.900, y: .8557, r: .343 },
        idler: { z: 3.028, y: .828, r: .335 },
        rollers: [-1.72, -.20, 1.68].map(z => ({ z, y: 1.068, r: .127 })),
        rollerR: .127, paintedEnds: true, coveredTop: true, arms: true,
        fitLoadedRun: true, dedupeLoopPoints: true,
        trackShoeBuilder: buildFleetTrackShoe,
        trackShoeDimensions: { padHeight: .036, grouserHeight: .013, webHeight: .018,
            hornHeight: .100, pinRadius: .013, pinCentreY: 0 },
    });
}
function addTurretBins(P: TankBuilderPort): void {
    for (const side of [-1, 1]) {
        // Open-topped bins: actual floor, outboard wall and two end plates.
        equipment(P, 'turret', 'Detail', box(.34, .045, 2.14), side * 1.525, 1.905, -.99);
        equipment(P, 'turret', 'Detail', box(.043, .31, 2.14), side * 1.698, 2.073, -.99);
        for (const z of [-2.05, .08])
            equipment(P, 'turret', 'Detail', box(.36, .31, .04), side * 1.525, 2.073, z);
        for (const z of [-1.56, -.84, -.16])
            equipment(P, 'turret', 'Detail', box(.36, .034, .035), side * 1.525, 2.228, z);
    }
}
function addSecondaryHatch(P: TankBuilderPort): void {
    // Object_12's 736 x 513 mm lid is oval in plan, with a shallow dished
    // plate and a separate raised circular center. Its AABB is not a rectangle.
    const lid = new THREE.LatheGeometry([
        new THREE.Vector2(0, 2.287), new THREE.Vector2(1, 2.287),
        new THREE.Vector2(1, 2.304), new THREE.Vector2(.96, 2.312),
        new THREE.Vector2(.55, 2.304), new THREE.Vector2(0, 2.304),
    ], P.q ? 36 : 20).scale(.36805, 1, .25645);
    equipment(P, 'turret', 'Detail', lid, .58755, 0, -.21318);
    equipment(P, 'turret', 'Detail', cylY(.137, .167, .018, P.q ? 28 : 16), .585, 2.313, -.190);
    // Source hinge blocks and transverse pins sit forward of the oval rim.
    for (const x of [.4381, .7324]) {
        equipment(P, 'turret', 'Detail', box(.0744, .051, .124), x, 2.3265, .0382);
        equipment(P, 'turret', 'Detail', cylX(.023, .148, P.q ? 16 : 10), x, 2.337, .057);
    }
    equipment(P, 'turret', 'Detail', box(.183, .032, .055), .5683, 2.339, .0662);
    // Open grab handle: two feet and a raised longitudinal rail.
    for (const z of [-.2448, -.1384])
        equipment(P, 'turret', 'Detail', box(.1226, .0337, .0317), .4199, 2.3217, z);
    equipment(P, 'turret', 'Detail', box(.0337, .014, .1381), .37545, 2.332, -.1916);
    equipment(P, 'turret', 'Detail', box(.039, .027, .161), .824, 2.321, -.155);
}
function addType96SmokeLaunchers(P: TankBuilderPort): void {
    // Each source cheek has six launchers: two columns on three inclined
    // rows. These are scalar component centers, not a copied source contour.
    for (const side of [-1, 1]) {
        equipment(P, 'turret', 'Detail', box(.318, .040, .22), side * 1.306, 1.970, .344, -.42);
        for (const [x, y, z, tilt] of [
            [1.2871, 2.0504, .4441, -.31], [1.3984, 2.0572, .4616, -.31],
            [1.2676, 1.9677, .5398, -.44], [1.3804, 1.9786, .5619, -.44],
            [1.2603, 1.8714, .5910, -.39], [1.3775, 1.8757, .6145, -.39],
        ]) {
            equipment(P, 'turret', 'Detail', markSmokeTube(cylZ(.0485, .196, P.q ? 16 : 10)), side * x, y, z, tilt);
            equipment(P, 'turret', 'Dark', cylZ(.043, .016, P.q ? 16 : 10), side * x, y - Math.sin(tilt) * .104, z + Math.cos(tilt) * .104, tilt);
        }
    }
}
function addType96Cupola(P: TankBuilderPort): void {
    // Source cupola is a low ring at x-.592,z-.045, not a raised mushroom.
    equipment(P, 'turret', 'Detail', cylY(.360, .350, .064, P.q ? 32 : 18), -.592, 2.328, -.045);
    equipment(P, 'turret', 'Detail', cylY(.377, .377, .072, P.q ? 32 : 18), -.592, 2.393, -.045);
    equipment(P, 'turret', 'Detail', cylY(.322, .347, .062, P.q ? 32 : 18), -.592, 2.455, -.045);
    for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        optic(P, 'turret', -.592 + Math.sin(a) * .276, 2.464, -.045 + Math.cos(a) * .276, .085, .048, .061);
    }
    for (const x of [-.866, -.323]) {
        equipment(P, 'turret', 'Detail', box(.078, .073, .156), x, 2.430, -.107);
        equipment(P, 'turret', 'Detail', cylX(.021, .09, 12), x, 2.477, -.107);
    }
    // The lid's forward latch is a raised clevis, not a featureless cap.
    // Object_12 canonical envelope: x[-.671,-.513], y[2.417,2.577], z[.112,.239].
    for (const x of [-.651, -.533])
        equipment(P, 'turret', 'Detail', box(.040, .120, .127), x, 2.477, .176);
    equipment(P, 'turret', 'Detail', cylX(.024, .158, 12), -.592, 2.552, .176);
    equipment(P, 'turret', 'Detail', box(.126, .026, .038), -.711, 2.487, -.068);
    equipment(P, 'turret', 'Detail', box(.106, .028, .121), -.710, 2.457, -.128);
    equipment(P, 'turret', 'Detail', box(.418, .105, .304), -.592, 2.350, -.539);
    equipment(P, 'turret', 'Detail', cylX(.036, .34, P.q ? 20 : 12), -.592, 2.432, -.493);
}
// The turret shell's stations (source frame). The shell stops at z 0.64; the front is the two add-on modules and the
// centre block between them (TYPE96_FRONT_MODULE).
const TYPE96_TURRET_STATIONS: readonly Type96Station[] = [
    [-2.04, .79, 1.17, .97, 1.75, 1.95, 2.20],
    [-1.57, 1.16, 1.46, 1.15, 1.67, 1.96, 2.28],
    [-.40, 1.27, 1.51, 1.14, 1.60, 1.95, 2.30],
    [.64, 1.18, 1.44, .93, 1.62, 1.84, 2.25],
];
/** china-turrets-275 (Kevin: "make the type 96 72m, type 96 80, type 96b ... have proper turrets and mantlets"): the
 * Type 96A/96B front is two bolt-on armour modules, one each side of the gun, and the mantlet sits in a vertical slot
 * between them under a canvas dust cover (photographs: Commons "Type 96B 02/03", Tank Biathlon 2022). The old shell ran
 * on to a 0.26 m point at the gun with the gun leaving through its tip. Each module is one loft of these stations
 * (source frame, the right-hand module; the left mirrors it): [z, floor half-width, shoulder half-width, roof-edge
 * half-width, floor y, shoulder y, roof y], every ring closed on the slot wall at x `slotHalf`. Its outer face rakes
 * back about 45 degrees from the shoulder to the inner front face (stations `rakeFrom` to `rakeTo`), which stands nearly square to the
 * bore; the top runs level with the roof front behind a narrow bevel. The first station sits inside the shell's last
 * one; the third turns the side vertical (`sideFrom`), so the side ahead of it stands square for the concepts' tiles. The centre block between the modules carries the roof from the shell to the slot's back wall at `slotBackZ`.
 * The concepts' kits (chinaDonorTurretKit.ts) seat on these faces. */
export const TYPE96_FRONT_MODULE = {
    slotHalf: .30,
    slotBackZ: 1.30,
    /** The station where the module's side turns vertical, and the raked outer face's two ends. */
    sideFrom: 2, rakeFrom: 3, rakeTo: 4,
    stations: [
        [.60, 1.165, 1.425, .915, 1.63, 1.84, 2.24],
        [.64, 1.18, 1.44, .93, 1.62, 1.84, 2.25],
        [.90, 1.235, 1.245, .965, 1.64, 1.89, 2.185],
        [1.24, 1.092, 1.10, 1.00, 1.655, 1.95, 2.10],
        [1.72, .632, .64, .58, 1.68, 1.98, 2.065],
        [1.82, .315, .325, .315, 1.69, 1.985, 2.06],
    ] as readonly Type96Station[],
} as const;
/** The roof between the modules (source frame): [z, top y]; its floor is the shell's front floor. Its last 0.14 m is a
 * chamfer down to the slot's back wall (top 1.96), where the gun-mounted box sight's rear lower edge swings at full
 * elevation (type96MantletClearance.selftest.mjs). */
const TYPE96_CENTRE_ROOF: readonly (readonly [number, number])[] = [[.60, 2.245], [1.16, 2.10], [1.30, 1.96]];
// The gunner's sight housing on the right front roof: centre and width, height, depth (source frame).
const TYPE96_GUNNER_SIGHT = { x: .649, y: 2.436, z: .36, w: .51, h: .214, d: .28 } as const;
/** Options for reusing the Type 96B turret on another hull. mastTopY lowers the rear whip's tip (Type 96B frame,
 * default its own 5.26855 m) for a concept whose listed height is its body and roof weapon, keeping the whip's rake.
 * Release 227 (each defaults to the Type 96B's own output, byte-identical): `bins: false` leaves out the two open side
 * bins and `smoke: false` the twelve cheek launchers, for a concept whose own armour housing fills their volume and
 * which carries its own smoke tubes; `bootHeel: true` lifts the mantlet boot's rear rings (behind the trunnion) to a
 * heel line, so the boot clears a lower host's driver's hatch at full elevation and its shoulder covers at every yaw.
 * `boxSightOnGun: true` (release 227, CN track) builds the box sight over the mantlet on the gun's pitch group rather
 * than the turret: on the fleet build it stands 10-50 mm inside the pitching boot under it at rest; here it rides the
 * boot, its flat bottom 2 mm into the boot's highest point under it and a saddle whose underside follows the boot's top
 * 1-5 mm in filling the rest, so the sight pitches with the gun it lays and never meets the boot at any pitch (the
 * boot, saddle and sight go through add() into the same mantlet buckets, so the part census sees the seat).
 * `bootFloor` clips the pitching mantlet boot's underside at each of its six stations (source-frame heights, null for
 * none) so the boot clears the hull it is carried over through the whole traverse and pitch range; without it the
 * boot keeps Object_6's measured underside (applied after `bootHeel`, where both are given).
 * `boxSightSourceTop: true` (with `boxSightOnGun`; release 227, 2026-10-20) keeps the sight's measured top (source y
 * 2.396): the box stands from its flat bottom on the boot's crown up to that top, as the source draws it over the boot,
 * instead of the whole authored box raised onto the crown (its top then 46 mm over the source's on the Type 96B's boot);
 * its window keeps the authored size, centred on the shorter face.
 * `floodlight: true` (release 240) carries a gun floodlight right of the gun (TYPE96_GUN_FLOODLIGHT). */
export interface Type96TurretOptions {
    mastTopY?: number; bins?: boolean; smoke?: boolean; bootHeel?: boolean; boxSightOnGun?: boolean;
    bootFloor?: number; boxSightSourceTop?: boolean; floodlight?: boolean;
}

// 2026-10-24 (the owner: "make the ... type 96b, type 96-80, have floodlights at front by guns"): the gun floodlight
// (gunFloodlight.ts) right of the gun, its back 7 cm ahead of the cheek beside it (gun frame 0.33); its bracket runs on
// the bore line, under the cheek's 0.33 lip at y 0.10, into the boot's 0.35 face 19 cm off the bore (the barrel's
// collars are 16 cm)
// (main-reds-259, Main's ruling: its own draw, gunMountLamp, so the boot, the measured source Object_6, keeps its envelope)
// (china-turrets-275: the bracket's root now runs into the steel collar round the sleeve, r .160 over z .24-.36: the
// square mantlet has no nose 19 cm off the bore)
const TYPE96_GUN_FLOODLIGHT: GunFloodlightSeat = {
  side: 'right', x: .40, y: .02, backZ: .40, anchorX: .15, anchorY: 0, anchorZ: .31, bucket: 'gunMountLamp',
};

// The box sight over the mantlet (Type 96B source frame): centre, width, height, depth.
const TYPE96_BOX_SIGHT = { x: 0, y: 2.278, z: 1.540, w: .25, h: .236, d: .396 } as const;
/** The box sight seated on the pitching boot (gun frame): `boot` is the boot's geometry in that frame; `sourceTop` keeps
 * the authored top (Type96TurretOptions.boxSightSourceTop). */
function addBoxSightOnBoot(P: TankBuilderPort, boot: THREE.BufferGeometry, bootStations: readonly number[], sourceTop = false): void {
    const s = TYPE96_BOX_SIGHT, origin = P.turretG.position.clone().add(P.gunG.position);
    const x = s.x - origin.x, cy = s.y - origin.y, cz = s.z - origin.z, z0 = cz - s.d / 2, z1 = cz + s.d / 2;
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), mesh = new THREE.Mesh(boot, material);
    mesh.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 3);
    const top = (px: number, pz: number): number => {
        ray.ray.origin.set(px, cy + 1, pz);
        const hit = ray.intersectObject(mesh, false)[0];
        if (!hit) throw new Error(`${P.spec.id}: no mantlet boot under the box sight at ${px.toFixed(3)}, ${pz.toFixed(3)}`);
        return hit.point.y;
    };
    try {
        // the saddle (4 mm inside the sight's footprint, so no face of it lies in a face of the sight): its stations are its
        // ends, the boot's own ring stations under it (the boot's top creases there) and a 6 cm grid between, with nine
        // samples across, so its underside lies 1-5 mm into the boot everywhere and never above it
        const inset = .004, sz0 = z0 + inset, sz1 = z1 - inset;
        const xs = Array.from({ length: 9 }, (_, k) => x + (k / 4 - 1) * (s.w / 2 - inset));
        const zs = [sz0, sz1, ...bootStations.filter((z) => z > sz0 + .01 && z < sz1 - .01)];
        for (let k = 1; k < 6; k++) zs.push(sz0 + (sz1 - sz0) * k / 6);
        zs.sort((a, b) => a - b);
        const rows = zs.filter((z, i) => i === 0 || z - zs[i - 1] > .015).map((z) => ({ z, under: xs.map((px) => top(px, z)) }));
        const bottom = Math.max(...rows.flatMap((r) => r.under)) - .002;
        P.add('gunMount', sectionSolid(rows.map((r) => ({
            z: r.z, ring: [...xs.map((px, i) => [px, r.under[i] - .001] as const), [xs[8], bottom + .002] as const, [xs[0], bottom + .002] as const],
        }))));
        const [y, h] = sourceTop ? [(bottom + cy + s.h / 2) / 2, cy + s.h / 2 - bottom] : [bottom + s.h / 2, s.h];
        if (h < s.h * .70 + .01) throw new Error(`${P.spec.id}: the box sight's face (${h.toFixed(3)} m) no longer holds its window`);
        P.add('gunMount', box(s.w, h, s.d), x, y, cz);
        P.add('gunMountDark', box(s.w * .76, s.h * .70, .018), x, y, z1 + .005);
        P.add('gunMountGlass', box(s.w * .62, s.h * .52, .012), x, y, z1 + .017);
    } finally { material.dispose(); }
}

// The boot's heel line in the gun frame (z, y): the lower points of the rings at and behind the trunnion rise to it (the
// trunnion ring's lowest point 8 mm); ahead of the trunnion nothing moves.
const TYPE96_BOOT_HEEL: readonly (readonly [number, number])[] = [[-.40, -.149], [-.28, -.178], [0, -.236]];
function bootHeelY(z: number): number {
    const h = TYPE96_BOOT_HEEL;
    if (z <= h[0][0]) return h[0][1];
    for (let i = 1; i < h.length; i++) if (z <= h[i][0] + 1e-9) {
        const t = (z - h[i - 1][0]) / (h[i][0] - h[i - 1][0]);
        return h[i - 1][1] + (h[i][1] - h[i - 1][1]) * t;
    }
    return -Infinity;
}
/** One front module's ring at a station (turret frame), counter-clockwise seen from ahead, closed on the slot wall. */
function frontModuleRing(P: TankBuilderPort, side: number, row: Type96Station): { z: number; ring: (readonly [number, number])[] } {
    const [z, low, sh, roof, floor, shY, roofY] = row, xi = TYPE96_FRONT_MODULE.slotHalf, py = P.turretG.position.y;
    const ring: (readonly [number, number])[] = [[xi, floor - py], [low, floor - py], [sh, shY - py], [roof, roofY - py], [xi, roofY - py]];
    return { z: z - P.turretG.position.z, ring: side > 0 ? ring : ring.map(([x, y]) => [-x, y] as const).reverse() };
}
/** The two front modules and the roof block between them (TYPE96_FRONT_MODULE). The block's sides stand 10 mm inside
 * the modules' slot walls; its front face is the slot's back wall, which the mantlet passes through. */
function addType96FrontModules(P: TankBuilderPort): void {
    for (const side of [-1, 1])
        P.add('turret', sectionSolid(TYPE96_FRONT_MODULE.stations.map((row) => frontModuleRing(P, side, row)), { sideQuadDiagonal: 'convex' }));
    const w = TYPE96_FRONT_MODULE.slotHalf + .01, py = P.turretG.position.y, pz = P.turretG.position.z;
    const floor = (z: number) => 1.63 + (1.66 - 1.63) * (z - .60) / (TYPE96_FRONT_MODULE.slotBackZ - .60);
    P.add('turret', sectionSolid(TYPE96_CENTRE_ROOF.map(([z, top]) => ({ z: z - pz,
        ring: [[-w, floor(z) - py], [w, floor(z) - py], [w, top - py], [-w, top - py]] as const }))));
}
/** A chamfered rectangle's ring (gun frame), counter-clockwise seen from ahead. */
function chamferedRing(half: number, bottom: number, top: number, c: number): (readonly [number, number])[] {
    return [[-half + c, bottom], [half - c, bottom], [half, bottom + c], [half, top - c], [half - c, top], [-half + c, top],
        [-half, top - c], [-half, bottom + c]];
}
interface MantletStation { z: number; half: number; bottom: number; top: number }
/** The mantlet block's stations (gun frame about the trunnion, source y 1.8602, z 1.60). The rear station stands inside
 * the centre roof block; the next is the slot's back wall (z -0.30); the front chamfers to the collar's face. The top
 * runs on the modules' roof line (2.06-2.07), the bottom on their floor line (1.69 at the front). At and behind the
 * trunnion the underside rises to `bootFloor` (source y) and, with `bootHeel`, to the heel line, so the block clears each
 * host's deck through the traverse and pitch range (type96MantletClearance.selftest.mjs). */
function type96MantletStations(options: Type96TurretOptions): MantletStation[] {
    return ([[-.40, .25, -.08, .19], [-.30, .265, -.13, .20], [-.26, .265, -.135, .20], [.12, .265, -.152, .195],
        [.18, .235, -.135, .17], [.21, .20, -.11, .135]] as const).map(([z, half, bottom, top]) => {
        let b: number = bottom;
        if (z <= 1e-9) {
            if (options.bootHeel) b = Math.max(b, bootHeelY(z));
            if (options.bootFloor != null) b = Math.max(b, options.bootFloor - 1.8602);
        }
        return { z, half, bottom: Math.min(b, top - .08), top };
    });
}
function mantletAt(block: readonly MantletStation[], z: number): MantletStation {
    const i = Math.max(1, block.findIndex((s) => s.z >= z));
    const a = block[i - 1], b = block[i], t = Math.min(1, Math.max(0, (z - a.z) / (b.z - a.z)));
    return { z, half: a.half + (b.half - a.half) * t, bottom: a.bottom + (b.bottom - a.bottom) * t, top: a.top + (b.top - a.top) * t };
}
/** A rounded box ring (gun frame): a superellipse of exponent p over [bottom, top], counter-clockwise from below. */
function clothRing(half: number, bottom: number, top: number, p: number, n: number): (readonly [number, number])[] {
    const cy = (top + bottom) / 2, hy = (top - bottom) / 2;
    return Array.from({ length: n }, (_, k) => {
        const a = -Math.PI / 2 + k * Math.PI * 2 / n, c = Math.cos(a), s = Math.sin(a);
        return [Math.sign(c) * Math.pow(Math.abs(c), p) * half, cy + Math.sign(s) * Math.pow(Math.abs(s), p) * hy] as const;
    });
}
/** The canvas dust cover over the mantlet (gun frame): from the slot's back wall to the front, 15-25 mm proud of the block
 * and bunched in three rolls across its crown, then gathered onto the steel collar round the thermal sleeve and strapped
 * there. The collar is the sleeve's real exit: 6 mm round the sleeve, 0.12 m long, its underside on the old boot nose's
 * (-0.164), so the gun keeps its measured clearance over the rear deck with the turret reversed. */
function addType96MantletCover(P: TankBuilderPort, block: readonly MantletStation[]): void {
    // [z, crown lift]: the bunched folds rise and sag along the crown (the photographs' slack cloth), never under 12 mm
    // (its rear edge, on the slot's back wall, is tucked 30 mm up into the wall so it does not swing under the block at
    // full elevation)
    const n = P.q ? 24 : 12, rows: { z: number; ring: (readonly [number, number])[] }[] = ([[-.30, .022, .03], [-.26, .03, 0], [-.18, .036, 0], [-.10, .016, 0], [-.02, .034, 0], [.06, .014, 0], [.14, .026, 0]] as const).map(([z, lift, tuck]) => {
        const s = mantletAt(block, z);
        return { z, ring: clothRing(Math.min(s.half + .022, TYPE96_FRONT_MODULE.slotHalf - .008), s.bottom - .008 + tuck, s.top + lift, .35, n) };
    });
    // the gather: the boxy cover rounds into the collar over three rings (one ring left the block's corners as facets)
    rows.push({ z: .175, ring: clothRing(.235, -.150, .175, .5, n) }, { z: .205, ring: clothRing(.20, -.150, .160, .7, n) },
        { z: .245, ring: clothRing(.168, -.153, .168, 1, n) });
    P.add('gunMountCloth', sectionSolid(rows, { centeredSideQuads: true, smoothSideEdges: [...Array(n).keys()] }));
    P.add('gunMount', cylZ(.160, .12, P.q ? 28 : 16), 0, 0, .30);
}
export function buildType96Turret(P: TankBuilderPort, options: Type96TurretOptions = {}): void {
    P.add('turret', cylY(1.00, 1.04, .15, P.q ? 40 : 22), 0, .045, 0);
    P.add('turret', sectionSolid(TYPE96_TURRET_STATIONS.map(row => turretStation(P, ...row)),
        { sideQuadDiagonal: 'convex' }));
    addType96FrontModules(P);
    if (options.bins !== false) addTurretBins(P);
    if (options.smoke !== false) addType96SmokeLaunchers(P);
    addType96Cupola(P);
    addSecondaryHatch(P);
    equipment(P, 'turret', 'Detail', cylY(.205, .205, .145, P.q ? 26 : 14), -.766, 2.291, -.994);
    equipment(P, 'turret', 'Detail', cylY(.122, .122, .140, P.q ? 24 : 14), .897, 2.291, -.719);
    const s = TYPE96_GUNNER_SIGHT;
    optic(P, 'turret', s.x, s.y, s.z, s.w, s.h, s.d);
    // the turret-fixed box sight (without boxSightOnGun; every 230 caller rides it on the gun's boot instead)
    if (!options.boxSightOnGun) {
        optic(P, 'turret', TYPE96_BOX_SIGHT.x, TYPE96_BOX_SIGHT.y, TYPE96_BOX_SIGHT.z, TYPE96_BOX_SIGHT.w, TYPE96_BOX_SIGHT.h, TYPE96_BOX_SIGHT.d);
        // 2026-10-19 (owner float sweep): this sensor stood 113 mm over the roof, resting only on the pitching mantlet boot;
        // a bridge of two posts outboard of the boot and a crossbar under the housing carries it on the turret.
        // 2026-10-21 (float-gaps 230): the bridge stands at the housing's front end (z 1.665..1.735), not mid-housing: there
        // the crossbar hid the boot's shoulders from above at full elevation (type96GunOwnership.selftest.mjs; the shoulder
        // line crosses it at z 1.50..1.65 over -7..14 degrees) and nearly met the boot's rising rear at full depression.
        // (Release 229 merge: the turret-fixed sight only; with boxSightOnGun the sight rides the boot and needs no bridge.)
        for (const side of [-1, 1])
            equipment(P, 'turret', 'Detail', box(.06, .25, .07), side * .30, 2.12, 1.70);
        equipment(P, 'turret', 'Detail', box(.66, .03, .07), 0, 2.23, 1.70);
    }
    // Object_12's mast is supported by a finite stem and two square collars.
    // Retain the original upper rod; the omitted lower stock caused a real
    // 173 mm air gap to the native turret roof, not a comparison artifact.
    equipment(P, 'turret', 'Detail', cylY(.0698, .0698, .0249, 12), .76195, 2.22111, -1.32953);
    equipment(P, 'turret', 'Detail', box(.0903, .0176, .0898), .76195, 2.24186, -1.32903);
    equipment(P, 'turret', 'Detail', cylY(.02905, .02905, .185, 10), .76145, 2.33046, -1.32903);
    equipment(P, 'turret', 'Detail', box(.0903, .0371, .0898), .76195, 2.43911, -1.32903);
    equipment(P, 'turret', 'Detail', antennaPart(cylY(.026, .045, .557, 10)), .761, 2.736, -1.329);
    if (options.mastTopY === undefined) antenna(P, .95, 2.20, -1.78, 5.26855, -2.057);
    else antenna(P, .95, 2.20, -1.78, options.mastTopY, -1.78 - .277 * (options.mastTopY - 2.31) / (5.26855 - 2.31));
    // No roof weapon is present in this particular source configuration.
    // china-turrets-275: the mantlet is a square block in the slot between the front modules (TYPE96_FRONT_MODULE), its
    // top and bottom on the modules' top and floor lines, under a canvas dust cover gathered onto a steel collar round
    // the thermal sleeve (the old rounded Object_6 boot stood on the shell's nose tip, 0.12 m proud of its roof).
    const block = type96MantletStations(options);
    const bootGeometry = sectionSolid(block.map(({ z, half, bottom, top }) => ({ z, ring: chamferedRing(half, bottom, top, .035) })),
        { preserveCapBoundary: true });
    if (options.boxSightOnGun) {
        P.add('gunMount', bootGeometry);
        addBoxSightOnBoot(P, bootGeometry, block.map((r) => r.z), options.boxSightSourceTop);
    }
    else P.addGunExtra(bootGeometry);
    addType96MantletCover(P, block);
    // Source Object_13 is the outer tapered shroud. Object_14's 68 mm
    // radius belongs to its inner bore and must not become the outer barrel.
    const stations: readonly (readonly [
        number,
        number
    ])[] = [
        [.25, .154], [.65, .154], [.68, .1375], [2.04, .1205],
        [2.90, .1105], [4.67, .1105], [4.92211, .099],
    ];
    for (let i = 1; i < stations.length; i++) {
        const [z0, r0] = stations[i - 1], [z1, r1] = stations[i];
        if (i === stations.length - 1)
            openGunTube(P, z0, z1, r0, r1, .068);
        else
            P.add('gun', cylZ(r1, z1 - z0, P.q ? 28 : 16, r0), 0, 0, (z0 + z1) / 2);
    }
    for (const z of [.43, .65])
        P.add('gun', cylZ(.160, .045, P.q ? 28 : 16), 0, 0, z);
    if (options.floodlight) addGunFloodlight(P, TYPE96_GUN_FLOODLIGHT);
    P.muzzleZ = 4.92211;
}
/** Release 227 (critic CN5-02): buildType96Turret draws the gunner's sight housing 59-71 mm over the roof with nothing
 * under it. On the fleet Type 96B it stands on a cast plinth, the construction the CN lane gives its Kunlun and Yun
 * (chinaDonorTurretKit.ts type96SightPlinth): the footprint 20 mm inside the housing's sides, front and rear, the
 * underside 6 mm into the roof, the top 2 mm into the housing's floor. The roof there is the plane between the -.40 and
 * .64 stations (level across, falling 50 mm forward), so the two end sections carry it exactly. Called by the fleet
 * builder and the Sino-Soviet concepts (2026-10-21, float-gaps 230: their reused turrets drew the housing 60 mm over
 * the roof with nothing under it); the Kunlun and Yun keep their own seats. */
export function addType96GunnerSightPlinth(P: TankBuilderPort): void {
    const s = TYPE96_GUNNER_SIGHT, [a, b] = [TYPE96_TURRET_STATIONS[2], TYPE96_TURRET_STATIONS[3]];
    const roof = (z: number) => a[6] + (b[6] - a[6]) * (z - a[0]) / (b[0] - a[0]);
    const x0 = s.x - s.w / 2 + .02, x1 = s.x + s.w / 2 - .02, top = s.y - s.h / 2 + .002;
    equipment(P, 'turret', 'Detail', sectionSolid([s.z - s.d / 2 + .02, s.z + s.d / 2 - .02].map(z => ({ z,
        ring: [[x0, roof(z) - .006], [x1, roof(z) - .006], [x1, top], [x0, top]] as const }))), 0, 0, 0);
}
/** The fleet Type 96B's mantlet boot floors (buildType96Turret's bootFloor; the stations at source z 1.20, 1.32, 1.60,
 * 1.75, 1.85, 1.951 about the trunnion at y 1.8602, z 1.60). Release 227: Object_6's underside (y 1.582-1.704) hung
 * 4-10 cm below the turret's own floor and swept through this hull's roof (y 1.59-1.62) at every traverse, through the
 * driver's hatch lid at rest, and 5.6 cm into the roof at full elevation. Behind the trunnion the clipped floor rides
 * inside the turret at rest and swings down to the turret's floor line at +14 degrees, 15 mm over the driver's hatch
 * handle (y 1.651); ahead of it the floor clears the rear-deck panels (y 1.6535) with the turret reversed. The two front
 * stations, which wrap the barrel collar, keep their measured undersides. type96MantletClearance.selftest.mjs sweeps
 * every traverse and pitch for crossings. */
const TYPE96B_BOOT_FLOOR = 1.73;
export function buildType96bX(P: TankBuilderPort): void {
  // 2026-10-09 (owner): the field net and garnish (ghillieFleetSuits.ts), laid on the assembled build
  addVehicleGhillieSuit(P);
    // Measured fixed armor extends the shadow silhouette; omit small fittings.
    P.additionalShadowSources = {
        hull: ['hullExternalArmor'],
    };
    const frame = EASTERN_SOURCE_STUDIES.type96b.frame;
    P.hullG.position.set(0, 0, 0);
    P.turretG.position.set(...frame.turret);
    P.gunG.position.set(0, frame.gun[1] - frame.turret[1], frame.gun[2] - frame.turret[2]);
    buildType96Hull(P);
    buildType96Gear(P);
    // Release 227: the box sight over the mantlet rides the pitching boot (boxSightOnGun); turret-fixed, the boot passed
    // through it at every pitch. It keeps its measured top (boxSightSourceTop; type96bSightBoot.selftest.mjs).
    buildType96Turret(P, { bootFloor: TYPE96B_BOOT_FLOOR, boxSightOnGun: true, boxSightSourceTop: true, floodlight: true });
    addType96GunnerSightPlinth(P);
    preserveSourceStudyGunMountAppearance(P);
    addRearFieldStowage(P);
    P.topY = 3.016 - frame.turret[1];
    P.hullG.userData.xRebuild = { candidate: 'type96b', independent: true, sourceLocalOnly: true };
}
