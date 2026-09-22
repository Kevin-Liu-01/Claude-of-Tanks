import * as THREE from 'three';
import { KIT } from './kit.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import { sectionSolid } from './sectionSolid.ts';
import { preserveSourceStudyGunMountAppearance } from './sourceStudyGunMount.ts';
import { EASTERN_SOURCE_STUDIES } from '../easternSourceStudyData.ts';
import { antenna, equipment, hatch, panel, openGunTube, hullSolid, hullStation, optic, towEye, turretStation } from './easternSourceKit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
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
        P.addMudguard(`type96-front-${side}`, 'hullRubber', box(.57, .29, .033), side * 1.381, 1.315, 3.46, -.41);
        P.addMudguard(`type96-rear-${side}`, 'hullRubber', box(.57, .32, .034), side * 1.381, 1.235, -3.42, .18);
        optic(P, 'hull', side * .98, 1.31, 2.96, .23, .13, .17);
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
function buildType96Hull(P: TankBuilderPort): void {
    hullSolid(P, [
        hullStation(-3.3848, 1.02, 1.68, 1.53, .56, 1.335, 1.60),
        hullStation(-3.20, 1.06, 1.69, 1.55, .48, 1.340, 1.60),
        hullStation(-1.23, 1.08, 1.69, 1.55, .47, 1.350, 1.62),
        hullStation(1.00, 1.08, 1.70, 1.54, .47, 1.370, 1.59),
        hullStation(2.60, 1.03455, 1.70, 1.39455, .54273, 1.37727, 1.43091),
        hullStation(2.6992, 1.03173, 1.70, 1.38553, .54724, 1.37772, 1.41240),
    ]);
    // The forward central shell ends at its own nose, not the fender AABB.
    // Object_22's upper glacis is two measured planes; the former broad flat
    // roof sat above the armor blocks and hid their actual receiving faces.
    hullSolid(P, [
        { z: 2.6992, ring: [[-1.03173, .54724], [1.03173, .54724], [1.03173, 1.350], [.9375, 1.41240], [-.9375, 1.41240], [-1.03173, 1.350]] },
        { z: 3.3008, ring: [[-.9946, .96313], [.9946, .96313], [.9946, 1.104], [.9263, 1.14780], [-.9263, 1.14780], [-.9946, 1.104]] },
        { z: 3.4551, ring: [[-.9263, 1.060], [.9263, 1.060], [.9263, 1.073], [.9263, 1.08040], [-.9263, 1.08040], [-.9263, 1.073]] },
    ]);
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
    hatch(P, 'hull', 0, 1.60, 1.50, .32);
    for (const x of [-.25, 0, .25])
        optic(P, 'hull', x, 1.66, 1.73, .18, .06, .08);
    addType96RearDeck(P);
}
function buildType96Gear(P: TankBuilderPort): void {
    // owner 2026-09-22 ("standardize our wheels across NATIONS"): the road-wheel face is the China MBT nation
    // construction (ztz100_x, nationWheelSets.ts), fitted by the running-gear builder into this hull's own wheel envelope.
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
            equipment(P, 'turret', 'Detail', cylZ(.0485, .196, P.q ? 16 : 10), side * x, y, z, tilt);
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
function buildType96Turret(P: TankBuilderPort): void {
    P.add('turret', cylY(1.00, 1.04, .15, P.q ? 40 : 22), 0, .045, 0);
    P.add('turret', sectionSolid([
        turretStation(P, -2.04, .79, 1.17, .97, 1.75, 1.95, 2.20),
        turretStation(P, -1.57, 1.16, 1.46, 1.15, 1.67, 1.96, 2.28),
        turretStation(P, -.40, 1.27, 1.51, 1.14, 1.60, 1.95, 2.30),
        turretStation(P, .64, 1.18, 1.44, .93, 1.62, 1.84, 2.25),
        turretStation(P, 1.33, .70, 1.00, .50, 1.66, 1.83, 2.05),
        turretStation(P, 1.93, .29, .40, .26, 1.72, 1.84, 1.98),
    ]));
    addTurretBins(P);
    addType96SmokeLaunchers(P);
    addType96Cupola(P);
    addSecondaryHatch(P);
    equipment(P, 'turret', 'Detail', cylY(.205, .205, .145, P.q ? 26 : 14), -.766, 2.291, -.994);
    equipment(P, 'turret', 'Detail', cylY(.122, .122, .140, P.q ? 24 : 14), .897, 2.291, -.719);
    optic(P, 'turret', .649, 2.436, .36, .51, .214, .28);
    optic(P, 'turret', 0, 2.278, 1.540, .25, .236, .396);
    // Object_12's mast is supported by a finite stem and two square collars.
    // Retain the original upper rod; the omitted lower stock caused a real
    // 173 mm air gap to the native turret roof, not a comparison artifact.
    equipment(P, 'turret', 'Detail', cylY(.0698, .0698, .0249, 12), .76195, 2.22111, -1.32953);
    equipment(P, 'turret', 'Detail', box(.0903, .0176, .0898), .76195, 2.24186, -1.32903);
    equipment(P, 'turret', 'Detail', cylY(.02905, .02905, .185, 10), .76145, 2.33046, -1.32903);
    equipment(P, 'turret', 'Detail', box(.0903, .0371, .0898), .76195, 2.43911, -1.32903);
    equipment(P, 'turret', 'Detail', cylY(.026, .045, .557, 10), .761, 2.736, -1.329);
    antenna(P, .95, 2.20, -1.78, 5.26855, -2.057);
    // No roof weapon is present in this particular source configuration.
    // Rounded mantlet boot measured independently from Object_6. The rear
    // cover meets the turret; its front contracts into Object_11's barrel collar.
    const boot = [
        [1.20, .250, 1.595, 2.171], [1.32, .260, 1.582, 2.212],
        [1.60, .246, 1.616, 2.173], [1.75, .216, 1.641, 2.082],
        [1.85, .190, 1.704, 2.044], [1.951, .157, 1.696, 2.017],
    ].map(([z, half, bottom, top]) => ({
        z: z - 1.6, ring: Array.from({ length: P.q ? 20 : 12 }, (_, i) => {
            const a = i * Math.PI * 2 / (P.q ? 20 : 12);
            return [Math.cos(a) * half, (top + bottom) / 2 - 1.8602 + Math.sin(a) * (top - bottom) / 2] as const;
        }),
    }));
    // Object_6 is the pitching mantlet boot; the tube and ambiguous Object_11
    // collar remain in recoil. This changes ownership only, not neutral stock.
    P.addGunExtra(sectionSolid(boot));
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
    P.muzzleZ = 4.92211;
}
export function buildType96bX(P: TankBuilderPort): void {
    // Measured fixed armor extends the shadow silhouette; omit small fittings.
    P.additionalShadowSources = {
        hull: ['hullExternalArmor'],
    };
    const frame = EASTERN_SOURCE_STUDIES.type96b_x.frame;
    P.hullG.position.set(0, 0, 0);
    P.turretG.position.set(...frame.turret);
    P.gunG.position.set(0, frame.gun[1] - frame.turret[1], frame.gun[2] - frame.turret[2]);
    buildType96Hull(P);
    buildType96Gear(P);
    buildType96Turret(P);
    preserveSourceStudyGunMountAppearance(P);
    P.topY = 3.016 - frame.turret[1];
    P.hullG.userData.xRebuild = { candidate: 'type96b_x', independent: true, sourceLocalOnly: true };
}
export const TYPE96B_X_PROFILE = { type96b_x: { build: buildType96bX } };
