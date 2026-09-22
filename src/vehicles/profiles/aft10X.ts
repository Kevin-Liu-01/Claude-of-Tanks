import * as THREE from 'three';
import { preserveSourceStudyGunMountAppearance } from './sourceStudyGunMount.ts';
import { KIT } from './kit.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import { sectionSolid } from './sectionSolid.ts';
import { EASTERN_SOURCE_STUDIES } from '../easternSourceStudyData.ts';
import { antenna, brace, equipment, panel, hullSolid, hullStation, optic } from './easternSourceKit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylX, cylY, cylZ } = KIT;
function addSternBridge(P: TankBuilderPort): void {
    // Object_18: an 8.7 mm plate bridges the side boxes. The sixteen slots
    // pierce only this plate; the recessed center door and space below remain.
    const halfWidth = .608, halfLength = .2373, centerZ = -3.3857;
    const shape = new THREE.Shape();
    shape.moveTo(-halfWidth, -halfLength);
    shape.lineTo(halfWidth, -halfLength);
    shape.lineTo(halfWidth, halfLength);
    shape.lineTo(-halfWidth, halfLength);
    shape.closePath();
    // Source-only FrontSide boundary rays: the four columns are 184.5–184.9mm
    // wide, and the second row is 43mm long versus 44.9mm for the others.
    // These measured offsets retain real ventilation air without erasing webs.
    for (const [x, halfSlotWidth] of [[-.46435, .09225], [-.14815, .09245], [.15475, .09245], [.47110, .09240]])
        for (const [z, halfSlotLength] of [[-3.55565, .02245], [-3.43750, .02150], [-3.31935, .02245], [-3.20215, .02245]]) {
            const y = centerZ - z, hole = new THREE.Path();
            hole.moveTo(x - halfSlotWidth, y - halfSlotLength);
            hole.lineTo(x - halfSlotWidth, y + halfSlotLength);
            hole.lineTo(x + halfSlotWidth, y + halfSlotLength);
            hole.lineTo(x + halfSlotWidth, y - halfSlotLength);
            hole.closePath();
            shape.holes.push(hole);
        }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: .0087, bevelEnabled: false, steps: 1 });
    geometry.rotateX(-Math.PI / 2);
    equipment(P, 'hull', 'Detail', geometry, 0, 1.9663, centerZ);
}
function addBowMast(P: TankBuilderPort): void {
    // Source support is outboard at x-1.353, not the former x-.99 optic box.
    // Sparse horizontal source rays resolve the flared foot, housing and neck.
    const x = -1.3525, z = 2.782;
    const base = new THREE.LatheGeometry([
        new THREE.Vector2(0, 1.6293), new THREE.Vector2(.216, 1.6293),
        new THREE.Vector2(.216, 1.694), new THREE.Vector2(.150, 1.740),
        new THREE.Vector2(.197, 1.7612), new THREE.Vector2(.187, 1.777),
        new THREE.Vector2(.187, 1.937), new THREE.Vector2(.197, 1.942),
        new THREE.Vector2(.197, 1.9516), new THREE.Vector2(0, 1.9516),
    ], P.q ? 28 : 16);
    equipment(P, 'hull', 'Detail', base, x, 0, z);
    equipment(P, 'hull', 'Detail', box(.327, .116, .075), x, 1.910, 2.935);
    equipment(P, 'hull', 'Dark', box(.258, .051, .010), x, 1.908, 2.977);
    equipment(P, 'hull', 'Detail', box(.327, .030, .094), x, 1.980, 2.935);
    const neck = new THREE.LatheGeometry([
        new THREE.Vector2(0, 1.9506), new THREE.Vector2(.0556, 1.9506),
        new THREE.Vector2(.040, 1.976), new THREE.Vector2(.040, 2.225),
        new THREE.Vector2(0, 2.225),
    ], P.q ? 20 : 12);
    equipment(P, 'hull', 'Detail', neck, -1.23535, 0, z);
    equipment(P, 'hull', 'Detail', cylY(.0468, .0468, .0175, P.q ? 20 : 12), -1.23535, 2.15375, z);
}
function addAftSideLampsAndTowEyes(P: TankBuilderPort, side: number): void {
    // Source lamps occupy low corner recesses under the broad upper bow lip.
    equipment(P, 'hull', 'Dark', box(.442, .147, .025), side * 1.390, 1.245, 3.678);
    equipment(P, 'hull', 'Detail', box(.442, .026, .045), side * 1.390, 1.173, 3.680);
    equipment(P, 'hull', 'Detail', box(.442, .027, .052), side * 1.390, 1.327, 3.677);
    equipment(P, 'hull', 'Detail', cylZ(.068, .036, P.q ? 20 : 12), side * 1.399, 1.260, 3.687);
    equipment(P, 'hull', 'Glass', cylZ(.054, .006, P.q ? 20 : 12), side * 1.399, 1.260, 3.708);
    equipment(P, 'hull', 'Detail', box(.052, .20, .055), side * 1.608, 1.405, 3.678);
    // Upright fore/aft towing eyes retain real air and their measured brackets.
    equipment(P, 'hull', 'Detail', box(.056, .10, .067), side * .940, .867, 3.490);
    equipment(P, 'hull', 'Detail', new THREE.TorusGeometry(.075, .021, 8, P.q ? 20 : 12)
        .rotateY(Math.PI / 2), side * .940, .977, 3.613);
    equipment(P, 'hull', 'Detail', box(.055, .104, .065), side * .788, .716, -3.180);
    equipment(P, 'hull', 'Detail', new THREE.TorusGeometry(.073, .018, 8, P.q ? 20 : 12)
        .rotateY(Math.PI / 2).scale(1.3, 1.27, .69), side * .788, .564, -3.205);
}
function addAftSkirtPanels(P: TankBuilderPort, side: number): void {
    // The lower skirt is a scalloped sheet, separately authored from the tub.
    for (const [i, z] of [-2.76, -1.53, -.30, .93, 2.16].entries()) {
        const low = i === 0 ? .83 : .70;
        const g = sectionSolid([
            { z: z - .60, ring: [[-.012, low], [.012, low], [.012, 1.23], [-.012, 1.23]] },
            { z, ring: [[-.012, low + .10], [.012, low + .10], [.012, 1.23], [-.012, 1.23]] },
            { z: z + .60, ring: [[-.012, low], [.012, low], [.012, 1.23], [-.012, 1.23]] },
        ]);
        P.addMudguard(`aft-side-${side}-${i}`, 'hull', g, side * 1.635, 0, 0);
        if (P.q)
            for (const y of [1.36, 1.80]) {
                equipment(P, 'hull', 'Detail', box(.018, .026, .066), side * 1.646, y, z);
            }
    }
}
function addAftHullSides(P: TankBuilderPort): void {
    for (const side of [-1, 1]) {
        addAftSkirtPanels(P, side);
        P.addMudguard(`aft-front-${side}`, 'hullRubber', box(.39, .25, .035), side * 1.40, 1.02, 3.41, -.36);
        P.addMudguard(`aft-rear-${side}`, 'hullRubber', box(.39, .31, .035), side * 1.40, .92, -3.35, .16);
        addAftSideLampsAndTowEyes(P, side);
        // The stern projects only at its two side boxes; the central door is recessed.
        equipment(P, 'hull', 'Detail', box(.994, .782, .420), side * 1.101, 1.556, -3.383);
        equipment(P, 'hull', 'Detail', box(1.004, .012, .450), side * 1.101, 1.969, -3.400);
        for (const x of [.613, 1.589])
            equipment(P, 'hull', 'Detail', box(.025, .043, .442), side * x, 1.952, -3.400);
        equipment(P, 'hull', 'Detail', box(.763, .054, .412), side * .967, 1.815, -3.398);
        equipment(P, 'hull', 'Dark', box(.178, .136, .020), side * 1.433, 1.808, -3.604);
        equipment(P, 'hull', 'Detail', box(.318, .034, .043), side * 1.424, 1.809, -3.625);
        equipment(P, 'hull', 'Detail', cylZ(.120, .049, P.q ? 24 : 14), side * 1.016, .706, -3.204);
        equipment(P, 'hull', 'Dark', cylZ(.091, .007, P.q ? 24 : 14), side * 1.016, .706, -3.232);
        for (const z of [-2.95, -2.10, 1.55]) {
            equipment(P, 'hull', 'Detail', box(.15, .045, .035), side * 1.32, z > 1 ? 1.944 : 1.979, z);
        }
    }
}
function buildAftHull(P: TankBuilderPort): void {
    hullSolid(P, [
        hullStation(-3.205, 1.12, 1.59, 1.54, .43, 1.25, 1.9477),
        hullStation(-3.08, 1.16, 1.63, 1.56, .41, 1.24, 1.9477),
        hullStation(-.90, 1.17, 1.64, 1.54, .37, 1.20, 1.9477),
        hullStation(.90, 1.17, 1.62, 1.47, .38, 1.18, 1.9477),
        hullStation(2.45, 1.13, 1.61, 1.49, .43, 1.20, 1.77),
        hullStation(3.65, 1.16, 1.17, 1.546, 1.110, 1.23, 1.50),
        hullStation(3.95, 1.16, 1.17, 1.546, 1.435, 1.46, 1.48),
    ]);
    addAftHullSides(P);
    // Object_18 center door is 1.013 m wide, not the old 1.6 m full-height ramp.
    panel(P, 'hull', .020, 1.128, -3.205, 1.013, 1.294, .047, .14, Math.PI / 2 - .047);
    for (const y of [.700, 1.453]) {
        equipment(P, 'hull', 'Detail', cylY(.027, .027, .123, 12), -.536, y, -3.219);
        equipment(P, 'hull', 'Detail', box(.116, .055, .041), -.468, y, -3.201);
    }
    equipment(P, 'hull', 'Detail', cylZ(.048, .045, 16), .474, 1.248, -3.223);
    equipment(P, 'hull', 'Detail', box(.045, .112, .042), .386, 1.035, -3.228);
    addSternBridge(P);
    // Object_18 scalar study: asymmetric polygon driver cover, rectangular
    // service panels, and the substantial box ahead of the launcher.
    panel(P, 'hull', .896, 1.874, 1.839, .820, .725, .055, .15, .165);
    panel(P, 'hull', .896, 1.915, 1.752, .784, .501, .030, .12, .155);
    panel(P, 'hull', .773, 1.970, .066, .60, .77, .042, .09);
    panel(P, 'hull', -.109, 1.982, .928, 1.06, .585, .032, .018);
    panel(P, 'hull', -1.262, 1.985, .674, .552, 1.05, .074, .035);
    panel(P, 'hull', -.767, 2.106, -.449, .610, .360, .362, .030);
    for (const [x, z, w] of [[.895, 1.49, .51], [.773, -.29, .35], [-.109, .64, .74], [-1.262, .18, .31]]) {
        for (const side of [-1, 1])
            equipment(P, 'hull', 'Detail', cylX(.022, .115, 10), x + side * w * .38, z > 1.4 ? 1.952 : 2.002, z);
        equipment(P, 'hull', 'Detail', box(.15, .032, .032), x, z > 1.4 ? 1.976 : 2.026, z + .28);
    }
    for (const x of [.666, 1.125])
        optic(P, 'hull', x, 1.866, 2.009, .161, .080, .122);
    optic(P, 'hull', .895, 1.866, 2.082, .159, .080, .047);
    addBowMast(P);
}
function buildAftGear(P: TankBuilderPort): void {
    // owner 2026-09-22 ("standardize our wheels across NATIONS"): the road-wheel face is the China IFV nation
    // construction (type100, nationWheelSets.ts), fitted by the running-gear builder into this hull's own wheel envelope.
    P.gear = KIT.buildRunningGear(P, {
        style: 'rubber', trackPattern: 'eastern-ifv',
        wheelR: .2976, wheelW: .2647, wheelY: .3613,
        wheelZs: [-2.2951, -1.4028, -.4539, .4847, 1.2860, 2.1781],
        xc: 1.4035, trackW: .389, trackTh: .030, topY: 1.065, botY: .036,
        sprocket: { z: 2.982, y: .7472, r: .324 },
        idler: { z: -2.947, y: .7232, r: .287 },
        rollers: [-1.7205, .0985, 1.828].map(z => ({ z, y: .8707, r: .143 })),
        rollerR: .143, paintedEnds: true, coveredTop: true, arms: true,
        fitLoadedRun: true, dedupeLoopPoints: true,
        trackShoeBuilder: buildFleetTrackShoe,
        trackShoeDimensions: { padHeight: .036, grouserHeight: .012, webHeight: .018,
            hornHeight: .075, pinRadius: .012, pinCentreY: 0 },
    });
}
/** Object_11 envelope; explicit Three.js XY torus avoids KIT's XZ rotation. */
export function aftRearCradleLoop(high: boolean): THREE.BufferGeometry {
    return new THREE.TorusGeometry(.22, .05, 8, high ? 24 : 16)
        .rotateY(Math.PI / 2).scale(1.46, .460 / .540, .597 / .540);
}
function addAftMissileCanister(P: TankBuilderPort, side: number, column: number, row: number): void {
    const x = side * (.505 + column * .53), y = -.025 + row * .475;
    P.addEquipment('gun', box(.435, .435, 2.38), x, y, .045);
    for (const z of [-1.11, 1.20]) {
        P.addEquipment('gun', box(.445, .445, .055), x, y, z);
        P.addEquipment('gunDark', box(.33, .33, .009), x, y, z + .031);
        P.addEquipment('gun', box(.305, .305, .012), x, y, z + .038);
    }
    // Open side lifting handles and separate latch feet, never solid decals.
    for (const z of [-.69, .87])
        for (const s of [-1, 1]) {
            P.addEquipment('gun', box(.018, .085, .025), x + s * .227, y + .045, z - .065);
            P.addEquipment('gun', box(.018, .085, .025), x + s * .227, y + .045, z + .065);
            P.addEquipment('gun', box(.027, .018, .15), x + s * .235, y + .085, z);
        }
    for (const z of [-.70, .09, .87]) {
        P.addEquipment('gun', box(.46, .022, .065), x, y + .221, z);
        for (const s of [-1, 1])
            P.addEquipment('gun', box(.016, .073, .021), x + s * .222, y, z);
    }
}
function addAftMissileCanisters(P: TankBuilderPort): void {
    // Eight sealed missile canisters on the elevating cradle. Their square end
    // caps are transport/launch covers, not an invented tank-gun muzzle.
    for (const side of [-1, 1])
        for (let column = 0; column < 2; column++)
            for (let row = 0; row < 2; row++) {
                addAftMissileCanister(P, side, column, row);
            }
}
function addAftLauncherSensors(P: TankBuilderPort): void {
    // Object_21 has a turned neck and a rounded sensor housing.
    // World dimensions below come from separate scalar component envelopes.
    equipment(P, 'turret', 'Detail', cylY(.149, .149, .311, P.q ? 28 : 16), .0033, 2.3835, -1.9273);
    equipment(P, 'turret', 'Detail', cylY(.151, .151, .205, P.q ? 28 : 16), .0034, 2.6330, -1.9273);
    // Independent horizontal rays narrow from +/-187 mm at y3.00 to
    // +/-71 mm at y3.12: a cylinder would leave an incorrect flat upper edge.
    equipment(P, 'turret', 'Detail', new THREE.SphereGeometry(.187, P.q ? 24 : 16, P.q ? 16 : 10), .0039, 2.9498, -1.9350);
    for (const side of [-1, 1]) {
        equipment(P, 'turret', 'Detail', box(.050, .255, .269), .0039 + side * .162, 2.8285, -1.9345);
        equipment(P, 'turret', 'Detail', cylX(.083, .041, P.q ? 20 : 12), .0039 + side * .167, 2.898, -1.9345);
    }
    for (const [x, y, r, z] of [[-.0542, 3.0136, .0355, -1.7509],
        [-.0590, 2.9426, .0313, -1.7465], [-.0475, 2.8705, .0372, -1.7528],
        [.0376, 2.9511, .0657, -1.7380]]) {
        equipment(P, 'turret', 'Dark', cylZ(r + .009, .025, P.q ? 20 : 12), x, y, z - .005);
        equipment(P, 'turret', 'Glass', cylZ(r, .006, P.q ? 20 : 12), x, y, z + .010);
    }
    // Twelve hull-mounted tubes occupy two staggered rows ahead of the yaw
    // cradle. Their source axes rise forward; they do not turn with the turret.
    const smokeCenters = [[-.3717, -.1747], [-.2230, -.1618], [-.0756, -.1488],
        [.1044, -.1444], [.2511, -.1573], [.4006, -.1703]];
    for (const [x, z] of smokeCenters)
        for (const rear of [0, 1]) {
            const zz = z - rear * .3925, tilt = -.55;
            equipment(P, 'hull', 'Detail', box(.134, .020, .17), x, 1.958, zz - .14);
            equipment(P, 'hull', 'Detail', box(.036, .145, .032), x, 2.020, zz + .102);
            equipment(P, 'hull', 'Detail', cylZ(.054, .268, P.q ? 16 : 10), x, 2.0718, zz, tilt);
            equipment(P, 'hull', 'Detail', cylZ(.057, .018, P.q ? 16 : 10), x, 2.0718 - Math.sin(tilt) * .138, zz + Math.cos(tilt) * .138, tilt);
        }
    P.muzzleZ = 1.245;
}
function buildAftLauncher(P: TankBuilderPort): void {
    P.add('turret', cylY(.78, .78, .16, P.q ? 32 : 18), 0, -.048, 0);
    P.add('turret', box(1.20, .25, 1.26), 0, .13, -.02);
    for (const side of [-1, 1]) {
        // Object_17 diagonal support, with real air beneath the inclined member.
        brace(P, 'turret', [side * .766, 2.12, -1.90], [side * .766, 2.43, -1.19], .135, .12);
        equipment(P, 'turret', 'Detail', box(.15, .18, .20), side * .766, 2.14, -1.92);
        P.add('turret', cylX(.17, .20, P.q ? 24 : 14), side * .71, .725, 0);
        // Object_11 rear support loops, measured 0.146 x 0.460 x 0.597 m.
        const loop = aftRearCradleLoop(Boolean(P.q));
        equipment(P, 'turret', 'Detail', loop, side * .5405, 2.3537, -2.7087);
        equipment(P, 'turret', 'Detail', box(.146, .062, .27), side * .5405, 2.146, -2.62);
        brace(P, 'turret', [side * .54, 2.42, -2.67], [side * .54, 2.56, -2.42], .115, .10);
        equipment(P, 'turret', 'Detail', box(.635, .076, .098), side * 1.155, 2.436, -2.555);
        equipment(P, 'turret', 'Detail', box(.14, .54, .11), side * 1.414, 2.71, -2.489);
        antenna(P, side * 1.43, 2.99, -2.49, 5.27079);
    }
    addAftMissileCanisters(P);
    P.addEquipment('gunMount', box(2.49, .08, .20), 0, -.275, -.83);
    P.addEquipment('gunMount', box(2.49, .08, .20), 0, -.275, .78);
    addAftLauncherSensors(P);
}
export function buildAft10X(P: TankBuilderPort): void {
    const frame = EASTERN_SOURCE_STUDIES.aft10_x.frame;
    P.hullG.position.set(0, 0, 0);
    P.turretG.position.set(...frame.turret);
    P.gunG.position.set(frame.gun[0], frame.gun[1] - frame.turret[1], 0);
    buildAftHull(P);
    buildAftGear(P);
    buildAftLauncher(P);
    preserveSourceStudyGunMountAppearance(P);
    P.topY = 3.50 - frame.turret[1];
    P.hullG.userData.xRebuild = { candidate: 'aft10_x', independent: true, sourceLocalOnly: true };
}
export const AFT10_X_PROFILE = { aft10_x: { build: buildAft10X } };
