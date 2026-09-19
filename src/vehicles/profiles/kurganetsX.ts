import { preserveSourceStudyGunMountAppearance } from './sourceStudyGunMount.ts';
// Independent procedural study of the owner's Kurganets-25
// sources. No source geometry, topology, material, texture or loader is used.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import type { RunningGearConfig, TankBuilderPort } from '../tankFactoryCore.ts';
import { buildEpokhaTurret } from './epokhaTurret.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
const { box, cylX, cylY, cylZ, torus } = KIT;
function hullSection(z: number, lowerHalf: number, shoulderHalf: number, roofHalf: number, floor: number, shoulder: number, roof: number): SolidSection {
    const shelf = Math.max(floor + .025, Math.min(shoulder - .025, 1.39));
    return { z, ring: [
            [-lowerHalf, floor], [lowerHalf, floor],
            [lowerHalf, shelf], [shoulderHalf, shelf],
            [shoulderHalf, shoulder], [roofHalf, roof],
            [-roofHalf, roof], [-shoulderHalf, shoulder],
            [-shoulderHalf, shelf], [-lowerHalf, shelf],
        ] };
}
function addLamp(P: TankBuilderPort, side: number, x: number, y: number, z: number): void {
    P.addEquipment('hullDetail', box(.20, .18, .11), side * x, y, z);
    P.addEquipment('hullDark', cylZ(.065, .015, P.q ? 18 : 10), side * x, y, z + .064);
    P.addEquipment('hullGlass', markVehicleNightLens(cylZ(.049, .018, P.q ? 18 : 10), 'headlight'), side * x, y, z + .075);
}
/** Independently parameterized rear closure from the approved source scalar study. */
function addAssembledRearDoor(P: TankBuilderPort): void {
    const add = (role: string, g: THREE.BufferGeometry, x = 0, y = 0, z = 0) => {
        g.userData.kurgRearRole = role;
        P.addEquipment('hullDetail', g, x, y, z);
    };
    const clipped = (cx: number, cy: number, w: number, h: number, topCut: number, bottomCut: number) => {
        const a = w / 2, b = h / 2;
        return [[-a + bottomCut, -b], [a - bottomCut, -b], [a, -b + bottomCut],
            [a, b - topCut], [a - topCut, b], [-a + topCut, b], [-a, b - topCut], [-a, -b + bottomCut]]
            .map(([x, y]) => new THREE.Vector2(cx + x, cy + y));
    };
    const sheet = (points: THREE.Vector2[], front: number, depth: number, hole?: THREE.Vector2[]) => {
        const shape = new THREE.Shape(points);
        if (hole)
            shape.holes.push(new THREE.Path(hole.slice().reverse()));
        return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, front);
    };
    // Object_23's surrounding closure has an actual chamfered door receiver.
    const outline = clipped(.003235, 1.51905, 1.28960, 1.30230, .1507, .1060);
    const receiver = clipped(-.04835, 1.50175, .7974, 1.0723, .0806, .0806);
    add('frame', sheet(outline, -3.582, .027, receiver));
    add('door-core', sheet(clipped(-.048335, 1.501762, .7966, 1.07130, .081, .081), -3.561785, .042));
    // Separate upper/lower skins retain the thin horizontal seam and corner cuts.
    const cx = -.054535, w = .7872, half = w / 2;
    add('upper-skin', sheet([
        new THREE.Vector2(cx - half, 1.505312), new THREE.Vector2(cx + half, 1.505312),
        new THREE.Vector2(cx + half, 1.939212), new THREE.Vector2(cx + half - .0801, 2.036412),
        new THREE.Vector2(cx - half + .0801, 2.036412), new THREE.Vector2(cx - half, 1.939212),
    ], -3.582185, .0226));
    add('lower-skin', sheet([
        new THREE.Vector2(cx - half + .0801, .969312), new THREE.Vector2(cx + half - .0801, .969312),
        new THREE.Vector2(cx + half, 1.069312), new THREE.Vector2(cx + half, 1.500512),
        new THREE.Vector2(cx - half, 1.500512), new THREE.Vector2(cx - half, 1.069312),
    ], -3.582185, .0226));
    // The port is an asymmetric shield, with a left-offset lower point.
    // Its scalar width/height/chamfers define a fresh closed extrusion.
    const port = (x: number, y: number, w: number, h: number) => {
        const a = w / 2, b = h / 2;
        return [[-.165 * w, -b], [a, -.10 * h], [a, .10 * h], [.432 * w, .310 * h],
            [.165 * w, b], [-.165 * w, b], [-.432 * w, .310 * h], [-a, .10 * h], [-a, -.10 * h], [-.432 * w, -.310 * h]]
            .map(([u, v]) => new THREE.Vector2(x + u, y + v));
    };
    add('port-receiver', sheet(port(.0487, 1.8420, .3463, .2644), -3.608485, .0485));
    add('port-neck', sheet(port(.047265, 1.8420, .2842, .2198), -3.626, .022));
    add('port-cover', sheet(port(.044365, 1.843262, .3486, .2673), -3.643385, .0176));
    // Two complete hinges: separate fixed and moving leaves, with vertical pin.
    for (const y of [1.158563, 1.834563]) {
        add('hinge-fixed-leaf', box(.1104, .0723, .036), -.518965, y, -3.5785);
        add('hinge-moving-leaf', box(.1052, .0612, .0318), -.4242, y, -3.5773);
        add('hinge-pin', cylY(.0165, .0165, .078, P.q ? 12 : 8), -.4864, y, -3.5967);
        for (const x of [-.552, -.531, -.424, -.390])
            for (const dy of [-.020, .020])
                add('hinge-bolt', cylZ(.006, .007, P.q ? 8 : 6), x, y + dy, -3.6000);
    }
    add('handle-base', cylZ(.04035, .014, P.q ? 18 : 10), .227115, 1.603963, -3.566);
    add('handle-pivot', cylZ(.015, .034, P.q ? 12 : 8), .2195, 1.6040, -3.5875);
    add('handle-lever', box(.133, .017, .016), .1526, 1.6040, -3.5973);
    for (const [x, y] of [[-.35, 1.996], [.19, 1.996], [-.35, 1.72], [.102, 1.861],
        [-.42, 1.54], [.102, 1.68], [-.34, 1.43], [.102, 1.325], [-.34, 1.22],
        [.107, 1.105], [-.35, .996], [.211, .999]])
        add('door-bolt', cylZ(.010, .008, P.q ? 8 : 6), x, y, -3.5855);
    // Bent open step. Center-line stations are source tube calipers, not a mesh copy.
    const c = .007765, path = new THREE.CurvePath<THREE.Vector3>();
    const left = [[-.296, .616, -3.482], [-.296, .732, -3.598], [-.296, .821, -3.635],
        [-.275, .877, -3.656], [-.216, .8992, -3.6628]];
    const points = [...left, ...left.slice().reverse().map(([x, y, z]) => [-x, y, z])]
        .map(([x, y, z]) => new THREE.Vector3(c + x, y, z));
    for (let i = 1; i < points.length; i++)
        path.add(new THREE.LineCurve3(points[i - 1], points[i]));
    add('step-frame', new THREE.TubeGeometry(path, P.q ? 48 : 30, .0116, P.q ? 8 : 6, false));
    for (const [y, z, width] of [[.808162, -3.629635, .5855], [.848162, -3.645535, .5658], [.757712, -3.609985, .5917]])
        add('step-tread', box(width, .0113, .0175), c, y, z);
    const beam = (a: number[], b: number[], r: number, role: string) => {
        const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.clone().sub(from);
        const g = cylY(r, r, delta.length(), P.q ? 10 : 6);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize()));
        const middle = from.add(to).multiplyScalar(.5);
        add(role, g, middle.x, middle.y, middle.z);
    };
    beam([.0067, .7577, -3.610], [.0067, .900, -3.6628], .006, 'step-center-brace');
    add('step-top-hook', cylZ(.016, .0979, 16).scale(1.11875, 1, 1), .006365, .924312, -3.630835);
    add('step-receiver', box(.024, .0371, .021), .0067, .93625, -3.580);
}
function addKurganetsStern(P: TankBuilderPort): void {
    addAssembledRearDoor(P);
    for (const side of [-1, 1]) {
        const upperX = side > 0 ? 1.1358 : -1.1340;
        const lowerX = side > 0 ? 1.1602 : -1.1584;
        P.addEquipment('hullDark', box(.8262, .6357, .012), side > 0 ? 1.1792 : -1.1723, 1.8113, -3.5565);
        // Independently authored folded plates from measured bank widths, lip
        // heights and depths; both quality levels retain all five/six blades.
        const blade = (x: number, width: number, rearY: number, frontY: number, rearZ: number, thickness = .0107): void => {
            const ring = (y: number) => [
                [-width / 2, y], [width / 2, y],
                [width / 2, y + thickness], [-width / 2, y + thickness],
            ] as const;
            P.addEquipment('hullDetail', sectionSolid([
                { z: rearZ, ring: ring(rearY) },
                { z: -3.551, ring: ring(frontY) },
            ]), x, 0, 0);
        };
        for (const [rearY, frontY] of [
            [1.8078, 1.8430], [1.8596, 1.8977], [1.9114, 1.9494],
            [1.9641, 2.0032], [2.0198, 2.0588], [2.0666, 2.1077],
        ])
            blade(upperX, .6338, rearY, frontY, -3.6426);
        for (const [rearY, frontY, rearZ] of [
            [1.5071, 1.5405, -3.6270], [1.5520, 1.5862, -3.6309],
            [1.5979, 1.6350, -3.6348], [1.6369, 1.6760, -3.6387],
            [1.6878, 1.7239, -3.6445],
        ])
            blade(lowerX, .7613, rearY, frontY, rearZ);
    }
}
function addKurganetsDeckFittings(P: TankBuilderPort): void {
    P.addHatch('hullDetail', box(.684, .045, .430), .578, 2.029, 1.542, .125);
    for (const x of [.307, .840]) {
        P.addEquipment('hullDetail', box(.247, .10, .198), x, 2.029, 1.817, .125);
        P.addEquipment('hullGlass', box(.18, .035, .012), x, 2.039, 1.922, .125);
    }
    for (const x of [-.563, .549]) {
        P.addHatch('hullDetail', box(.690, .045, .436), x, 2.193, .175, .125);
        for (const dx of [-.20, .20]) {
            P.addEquipment('hullDetail', cylX(.024, .095, 10), x + dx, 2.228, -.055);
        }
    }
    for (const z of [-2.85, -2.25, -1.65]) {
        P.addEquipment('hullDark', box(.88, .025, .42), -.72, 2.278, z);
        for (let i = -3; i <= 3; i++) {
            P.addEquipment('hullDetail', box(.72, .014, .016), -.72, 2.296, z + i * .052);
        }
    }
    // Source Object_23's closed stepped drum, forward of the right deck fan.
    // The fitted bottom overlaps the native sloping deck; it is not a claimed
    // source underside (the reference contains open sheet construction there).
    const drum = new THREE.LatheGeometry([
        [0, 2.045], [.2652, 2.045], [.2652, 2.2815],
        [.245, 2.2815], [.245, 2.2522], [.220, 2.2522],
        [.220, 2.2815], [0, 2.2815],
    ].map(([r, y]) => new THREE.Vector2(r, y)), P.q ? 40 : 24);
    P.addEquipment('hullDetail', drum, 1.328185, 0, .44935);
    // The paired deck clusters sit on the hull beside the turret ring.
    // Their measured radial arrangement is distinct from the turret launchers.
    // Six nearly horizontal radial tubes per side. The old 75-degree pitch
    // turned this deck fan into a row of upright launchers. Sparse source
    // calipers retain the small left/right height and yaw differences.
    const fan = [
        [-1.35007, 2.38651, -.36095, -.98559, .16914],
        [-1.34669, 2.38651, -.57963, -.96470, -.26335],
        [-1.28348, 2.38651, -.17440, -.86830, .49604],
        [-1.27979, 2.38651, -.74990, -.86371, -.50399],
        [-1.15758, 2.38651, -.02386, -.64605, .76330],
        [-1.15448, 2.38651, -.90125, -.63911, -.76911],
        [1.16411, 2.37517, -.90137, .63885, -.76933],
        [1.16720, 2.37517, -.02393, .64621, .76316],
        [1.28952, 2.37517, -.74997, .86369, -.50403],
        [1.29309, 2.37517, -.17446, .86836, .49594],
        [1.35622, 2.37517, -.57962, .96474, -.26319],
        [1.35966, 2.37517, -.36095, .98560, .16907],
    ];
    for (const [x, y, z, ax, az] of fan) {
        P.addEquipment('hullDetail', cylZ(.062, .4043, P.q ? 16 : 9), x, y, z, 0, Math.atan2(ax, az));
    }
    for (const side of [-1, 1]) {
        P.addEquipment('hullDetail', box(.29, .12, .69), side * 1.044, 2.33, -.461);
        for (const [x, y, z] of [[.79, 2.355, -2.80], [.70, 2.355, -3.33], [1.30, 2.085, 2.014]]) {
            P.addEquipment('hullDetail', box(.23, .09, .32), side * x, y, z);
            P.addEquipment('hullDark', box(.15, .026, .014), side * x, y + .013, z + .167);
        }
        // Grounded bow hinges, tow pin and protective lamp bracket.
        P.addEquipment('hullDetail', box(.45, .028, .21), side * 1.53, 1.85, 3.07, .13);
        P.addEquipment('hullDetail', cylX(.035, .25, 10), side * 1.45, 1.92, 3.34);
    }
    P.addEquipment('hullDetail', box(.48, .11, .32), 0, 1.885, 3.53);
    P.addEquipment('hullDetail', cylX(.032, .39, 12), 0, 1.955, 3.43);
}
/** Source-scale folded bow stock, authored from plate width, rake and folds. */
function bowTransverseSection(section: readonly (readonly [number, number])[], x: number, width: number, hole?: readonly (readonly [number, number])[]): THREE.BufferGeometry {
    const shape = new THREE.Shape(section.map(([y, z]) => new THREE.Vector2(-z, y)));
    if (hole) shape.holes.push(new THREE.Path(hole.map(([y, z]) => new THREE.Vector2(-z, y))));
    return new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 1 })
        .rotateY(Math.PI / 2).translate(x, 0, 0);
}
function addKurganetsBowStock(P: TankBuilderPort): void {
    const add = (role: string, g: THREE.BufferGeometry, structural = false) => {
        g.userData.kurgBowRole = role;
        if (structural) P.add('hull', g);
        else P.addEquipment('hullDetail', g);
    };
    // Separate receiving armor has its own upper bevel below the roof lip.
    add('central-backing', bowTransverseSection([
        [1.0100, 3.1875], [1.7297, 3.6914], [1.7561, 3.6426],
        [1.7444, 3.5918], [1.0325, 3.0938], [1.0012, 3.1387],
    ], -.8652, 1.7139), true);
    for (const [x, width] of [[-1.5014, .6274], [.8570, .6298]]) {
        add('side-backing', bowTransverseSection([
            [1.3088, 3.3984], [1.7297, 3.6914], [1.7561, 3.6426],
            [1.7444, 3.5918], [1.3606, 3.3242],
        ], x, width), true);
    }
    // Object_23's 8 mm forward lip is above genuine air, beyond the main roof.
    add('roof-lip', bowTransverseSection([
        [1.7727, 3.6118], [1.7580, 3.7129],
        [1.7502, 3.7090], [1.7649, 3.6118],
    ], -1.5200, 3.0498), true);
    add('roof-edge-return', bowTransverseSection([
        [1.7580, 3.7125], [1.7561, 3.7324],
        [1.7512, 3.7305], [1.7502, 3.7086],
    ], -1.4331, 2.8906), true);
    // Object_6: 3.214 m transverse skin, 37.3-degree main rake and a steeper
    // upper fold. The receiving hull is behind it; this is physical sheet stock.
    add('folded-skin', bowTransverseSection([
        [1.2014, 3.4141], [1.5940, 3.7129], [1.7190, 3.7559],
        [1.7200, 3.7422], [1.6008, 3.6973], [1.3879, 3.5352],
        [1.3928, 3.5293], [1.2160, 3.3945],
    ], -1.6118, 3.2140));
    // The lower central tongue is narrower than the face; retain the real side air.
    add('central-tongue', bowTransverseSection([
        [1.0823, 3.3242], [1.2020, 3.4145],
        [1.2167, 3.3950], [1.0969, 3.3047],
    ], -.8525, 1.7124));
    // Two narrow side arms connect the lower skin to the receiving side armor.
    // The source's broad lower lugs taper into 19.5 mm webs; do not fill the
    // large space between the front skin and the backing armor.
    for (const x of [-1.5327, 1.5083]) {
        add('side-receiver', bowTransverseSection([
            [1.210, 3.3514], [1.540, 3.4747], [1.680, 3.5714],
            [1.690, 3.592], [1.680, 3.6080], [1.550, 3.5497],
            [1.350, 3.4493], [1.300, 3.4587], [1.210, 3.3920],
        ], x, .0195));
    }
    for (const x of [-1.528765, 1.523985]) {
        add('side-pivot', box(.0605, .0977, .0703).translate(x, 1.65845, 3.54295));
    }
    // The rolled return is a hollow tube, with two measured eight-sided loops.
    // A 0.4 mm hidden rear lap closes its source skin contact; the front face
    // and the real internal channel remain at their measured stations.
    add('lower-return', bowTransverseSection([
        [1.2014, 3.4137], [1.1887, 3.4297], [1.1858, 3.4395],
        [1.1916, 3.4473], [1.2571, 3.4980], [1.2659, 3.5020],
        [1.2737, 3.4961], [1.2864, 3.4781],
    ], -1.6206, 3.2198, [
        [1.2024, 3.4219], [1.1946, 3.4336], [1.1926, 3.4395],
        [1.1955, 3.4434], [1.2600, 3.4941], [1.2649, 3.4961],
        [1.2698, 3.4922], [1.2785, 3.4805],
    ]));
}
function bowReceivingSection(z: number, floor: number, roof: number): SolidSection {
    const t = Math.max(0, (z - 3.4) / .332);
    const shoulderHalf = THREE.MathUtils.lerp(1.61, 1.56, t);
    const roofHalf = THREE.MathUtils.lerp(1.58, 1.54, t);
    const lowerHalf = Math.min(1.531, roofHalf - .002);
    const sideY = z < 3.4 ? 1.67 - (z - 3) * .1 : THREE.MathUtils.lerp(1.63, 1.67, t);
    const shoulder = Math.max(floor + (roof - floor) * .55, sideY);
    const shelf = Math.max(floor + (roof - floor) * .2, Math.min(shoulder - (roof - floor) * .2, 1.39));
    return { z, ring: [[-lowerHalf, floor], [lowerHalf, floor],
        [lowerHalf, shelf], [shoulderHalf, shelf], [shoulderHalf, shoulder],
        [roofHalf, roof], [-roofHalf, roof], [-shoulderHalf, shoulder],
        [-shoulderHalf, shelf], [-lowerHalf, shelf]] };
}
function addKurganetsFrontFlap(P: TankBuilderPort, side: number): void {
    // Object_23's actual bent flap, behind the broad front plate, has a long
    // sloping receiving root and a thin vertical hanging end.
    const geometry = bowTransverseSection([
        [1.4280, 3.1328], [1.3332, 3.2891], [1.3303, 3.2949],
        [1.3010, 3.2949], [1.2629, 3.3008], [1.1936, 3.3066],
        [1.1252, 3.3086], [1.0735, 3.3066], [1.0735, 3.3027],
        [1.1252, 3.3027], [1.1936, 3.3008], [1.2629, 3.2949],
        [1.3049, 3.2891], [1.4006, 3.1328],
    ], side > 0 ? 1.0982 : -1.6148, .5166);
    geometry.userData.kurgBowRole = 'front-flap';
    P.addMudguard('kurganets-front-flap-' + side, 'hullRubber', geometry);
}
function addKurganetsHull(P: TankBuilderPort): void {
    P.add('hull', sectionSolid([
        hullSection(-3.5586, 1.08, 1.60, 1.60, .79, 1.82, 2.25),
        hullSection(-3.28, 1.10, 1.61, 1.60, .535, 1.82, 2.26),
        hullSection(-1.90, 1.10, 1.61, 1.58, .535, 1.82, 2.26),
        hullSection(-.25, 1.10, 1.61, 1.58, .535, 1.82, 2.20),
        hullSection(2.35, 1.10, 1.61, 1.58, .535, 1.73, 1.929),
        hullSection(3.00, 1.10, 1.61, 1.58, .94, 1.67, 1.847),
        hullSection(3.30, 1.10, 1.61, 1.58, 1.3262, 1.64, 1.81025),
        bowReceivingSection(3.3516, 1.3987, 1.803929),
        bowReceivingSection(3.40, 1.4677, 1.798),
        bowReceivingSection(3.6133, 1.7709, 1.7717),
    ]));
    for (const side of [-1, 1]) {
        P.add('hull', box(.32, .18, 6.42), side * 1.72, 1.97, -.10);
        const bays = [-2.82, -1.70, -.58, .54, 1.66, 2.76];
        for (const z of bays) {
            const top = z < .3 ? 2.045 : 2.045 - (z - .3) * .075;
            P.addExternalArmor('hull', box(.347, top - .741, 1.10), side * 1.891, (top + .741) / 2, z);
            // Object_40 and its panel overlays share a flush outer face at
            // |X| 2.0645 m; there are no protruding fasteners at these stations.
        }
        addKurganetsFrontFlap(P, side);
        P.addMudguard('kurganets-rear-flap-' + side, 'hullRubber', sectionSolid([
            { z: -3.73, ring: [[-.269, 1.044], [.269, 1.044], [.269, 1.074], [-.269, 1.074]] },
            { z: -3.57, ring: [[-.269, 1.36], [.269, 1.36], [.269, 1.39], [-.269, 1.39]] },
        ]), side * 1.363, 0, 0);
        addLamp(P, side, 1.49, 1.858, 3.462);
        P.addEquipment('hullDetail', torus(.12, .026, P.q ? 18 : 10, 7), side * .72, 1.63, 3.70, Math.PI / 2);
        P.addEquipment('hullDetail', box(.032, .025, 2.16), side * 1.16, 2.052, 1.65, .125);
        for (const z of [-2.88, -2.34, 2.16]) {
            const deckY = z < 0 ? 2.28 : 2.25 - (z + .25) * .124;
            P.addEquipment('hullDetail', box(.34, .035, .48), side * .96, deckY, z);
        }
    }
    addKurganetsStern(P);
    addKurganetsDeckFittings(P);
}
function buildKurganetsGear(P: TankBuilderPort): void {
    // Independently measured wheel-island centers, retaining nonuniform spacing.
    const wheelZs = [-2.3517, -1.6305, -.9202, -.1978, .5168, 1.2329, 1.9595];
    const config: RunningGearConfig = {
        style: 'rubber', wheelPattern: 'armored-hub-six', trackPattern: 'eastern-ifv',
        wheelR: .285, wheelW: .274, wheelY: .3612, wheelZs,
        xc: 1.405, trackW: .44, trackTh: .032,
        trackShoeDimensions: { padHeight: .034, grouserHeight: .008, webHeight: .026, hornHeight: .08, pinRadius: .014 },
        trackShoeBuilder: buildFleetTrackShoe,
        sprocket: { z: 2.8598, y: .9013, r: .29, trackR: .282, toothTipRadiusM: .3481 },
        idler: { z: -3.3018, y: .9458, r: .2434, trackR: .219 },
        rollers: [-2.28, -1.12, .10, 1.30, 2.42].map((z) => ({ z, y: 1.05, r: .105 })),
        rollerR: .105, topY: 1.245, botY: .037, paintedEnds: true,
        coveredTop: true, arms: true, dedupeLoopPoints: true, fitLoadedRun: true,
    };
    P.gear = KIT.buildRunningGear(P, config);
}
export function buildKurganets25X(P: TankBuilderPort): void {
    // Measured fixed armor extends the shadow silhouette; omit small fittings.
    P.additionalShadowSources = {
        hull: ['hullExternalArmor'],
    };
    P.hullG.position.set(0, 0, 0);
    P.turretG.position.set(0, 2.21, -1.27);
    P.gunG.position.set(-.004, .707, .59);
    addKurganetsHull(P);
    addKurganetsBowStock(P);
    buildKurganetsGear(P);
    buildEpokhaTurret(P);
    P.topY = 4.02 - P.turretG.position.y;
    preserveSourceStudyGunMountAppearance(P);
    P.hullG.userData.xRebuild = {
        candidate: 'kurganets25_x', independent: true, sourceLocalOnly: true, datumVersion: 1,
    };
}
export const KURGANETS_X_PROFILES = {
    kurganets25_x: { build: buildKurganets25X },
} as const;
