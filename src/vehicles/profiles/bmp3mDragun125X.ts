import { preserveSourceStudyGunMountAppearance } from './sourceStudyGunMount.ts';
import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { mergeAll, xform } from '../factoryGeometry.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import { lathedWheelSection, type AxialWheelStation } from './lathedWheelStock.ts';
import { sectionSolid } from './sectionSolid.ts';
import { EASTERN_SOURCE_STUDIES } from '../easternSourceStudyData.ts';
import { barrel, equipment, hatch, panel, hullSolid, hullStation, optic, smokeBank, towEye, turretStation } from './easternSourceKit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylX, cylY, cylZ, torus } = KIT;
/** Source access door and its relief sit on the hull's raked rear wall. */
function addDragunRearDoor(P: TankBuilderPort): void {
    const plane = (y: number) => -3.242423 - .11529 * (y - 1.3);
    const add = (role: string, geometry: THREE.BufferGeometry, material = 'Detail') => {
        geometry.userData.dragunFittingRole = role;
        equipment(P, 'hull', material, geometry, 0, 0, 0);
    };
    const skin = (shape: THREE.Shape, depth: number, offset: number) => {
        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth, bevelEnabled: false, curveSegments: P.q ? 12 : 8,
        });
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            positions.setZ(i, plane(positions.getY(i)) + offset + positions.getZ(i));
        }
        geometry.computeVertexNormals();
        return geometry;
    };
    const doorOutline = (padding: number) => {
        const x = -.057695, y = 1.231283, w = .7731 / 2 + padding;
        const h = .9699 / 2 + padding, bevel = .045;
        const shape = new THREE.Shape();
        shape.moveTo(x - w + bevel, y - h);
        for (const [a, b] of [[w - bevel, -h], [w, -h + bevel], [w, h - bevel],
            [w - bevel, h], [-w + bevel, h], [-w, h - bevel], [-w, -h + bevel]])
            shape.lineTo(x + a, y + b);
        shape.closePath();
        return shape;
    };
    add('door-seam', skin(doorOutline(.007), .006, .001), 'Dark');
    add('door-leaf', skin(doorOutline(0), .022, 0));
    // Both measured port outlines lean left at their upper/lower poles.
    // Parametric ellipses retain that silhouette without reusing source faces.
    const port = (cx: number, cy: number, rx: number, ry: number, skew: number) => {
        const shape = new THREE.Shape(), segments = P.q ? 32 : 20;
        for (let i = 0; i < segments; i++) {
            const angle = i / segments * Math.PI * 2, s = Math.sin(angle);
            const x = cx + rx * Math.cos(angle) - skew * s * s;
            const y = cy + ry * s;
            if (i === 0)
                shape.moveTo(x, y);
            else
                shape.lineTo(x, y);
        }
        shape.closePath();
        return shape;
    };
    add('port-receiver', skin(port(.042055, 1.496983, .182, .14715, .0389), .032, -.0279));
    add('port-cover', skin(port(.035955, 1.49148, .1456, .11505, .0328), .022, -.0493));
    const plate = (role: string, x: number, y: number, w: number, h: number, depth: number, offset: number) => {
        const shape = new THREE.Shape();
        shape.moveTo(x - w / 2, y - h / 2);
        shape.lineTo(x + w / 2, y - h / 2);
        shape.lineTo(x + w / 2, y + h / 2);
        shape.lineTo(x - w / 2, y + h / 2);
        shape.closePath();
        add(role, skin(shape, depth, offset));
    };
    for (const y of [.89968, 1.47458]) {
        plate('hinge-leaf', -.39370, y, .0883, .0891, .014, -.004);
        const pin = cylX(.0207, .1042, P.q ? 16 : 12);
        pin.translate(-.401645, y - .00145, plane(y) - .02564);
        add('hinge-pin', pin);
        for (const x of [-.423, -.370])
            plate('hinge-neck', x, y, .024, .035, .028, -.030);
    }
    plate('latch-seat', .220455, 1.30383, .092, .099, .038, -.013);
    plate('latch-head', .220455, 1.30158, .0388, .0425, .041, -.0491);
    plate('latch-lever', .138255, 1.29963, .1326, .0312, .054, -.0545);
}
/** Measured bow lamps and open protective cages; fixed hull equipment. */
function addDragunBowLamps(P: TankBuilderPort): void {
    const add = (role: string, geometry: THREE.BufferGeometry, material = 'Detail') => {
        geometry.userData.dragunFittingRole = role;
        equipment(P, 'hull', material, geometry, 0, 0, 0);
    };
    // Closed flat strip swept around an independently authored bent guard path.
    const strip = (points: THREE.Vector2[], x: number) => {
        const edges = [-1, 1].map(side => points.map((p, i) => {
            const tangent = points[Math.min(i + 1, points.length - 1)].clone()
                .sub(points[Math.max(i - 1, 0)]).normalize();
            return p.clone().add(new THREE.Vector2(-tangent.y, tangent.x).multiplyScalar(side * .0045));
        }));
        const outline = [...edges[0], ...edges[1].reverse()];
        const shape = new THREE.Shape(outline);
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: .0073, bevelEnabled: true, bevelThickness: .0054, bevelSize: .0045, bevelSegments: 1, steps: 1 });
        // Shape coordinates are forward/up; extrusion becomes the cross-vehicle stock.
        const p = geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const z = p.getX(i), y = p.getY(i), depth = p.getZ(i);
            p.setXYZ(i, x + depth - .00365, y, z);
        }
        // Swapping X/Z reverses handedness; retain outward triangle winding.
        const index = geometry.index;
        if (index) {
            for (let i = 0; i < index.count; i += 3) {
                const b = index.getX(i + 1);
                index.setX(i + 1, index.getX(i + 2));
                index.setX(i + 2, b);
            }
        }
        else {
            for (const attribute of Object.values(geometry.attributes)) {
                for (let i = 0; i < attribute.count; i += 3)
                    for (let c = 0; c < attribute.itemSize; c++) {
                        const b = attribute.getComponent(i + 1, c);
                        attribute.setComponent(i + 1, c, attribute.getComponent(i + 2, c));
                        attribute.setComponent(i + 2, c, b);
                    }
            }
        }
        geometry.computeVertexNormals();
        return geometry;
    };
    function guardPath(positive: boolean): THREE.Vector2[] {
        const path = new THREE.CurvePath<THREE.Vector2>();
        const p0 = new THREE.Vector2(positive ? 3.3232 : 3.4404, positive ? 1.6615 : 1.6400);
        const p1 = new THREE.Vector2(positive ? 3.3496 : 3.4629, positive ? 1.7860 : 1.7610);
        const p2 = new THREE.Vector2(positive ? 3.4346 : 3.5117, positive ? 1.8440 : 1.7950);
        const p3 = new THREE.Vector2(positive ? 3.6006 : 3.6191, positive ? 1.8170 : 1.7940);
        const p4 = new THREE.Vector2(3.6690, positive ? 1.7370 : 1.7430);
        const p5 = new THREE.Vector2(3.6690, positive ? 1.6040 : 1.6030);
        path.add(new THREE.LineCurve(p0, p1));
        path.add(new THREE.QuadraticBezierCurve(p1, new THREE.Vector2(positive ? 3.3700 : 3.4775, p2.y), p2));
        path.add(new THREE.LineCurve(p2, p3));
        path.add(new THREE.QuadraticBezierCurve(p3, new THREE.Vector2(p4.x, p3.y), p4));
        path.add(new THREE.LineCurve(p4, p5));
        const points = path.getPoints(P.q ? 10 : 7).filter((p, i, all) => !i || p.distanceTo(all[i - 1]) > 1e-7);
        return points;
    }
    function addLamp(x: number, y: number, back: number, front: number): void {
        const length = front - back;
        // The source has a separate forged deck bracket just behind each light.
        const shiftZ = x > 0 ? 0 : .1104, shiftY = x > 0 ? 0 : -.0205;
        const bracket = new THREE.Shape([[3.2324, 1.6760], [3.2402, 1.7197], [3.2480, 1.7256],
            [3.2734, 1.7217], [3.2871, 1.7148], [3.3105, 1.6836], [3.3066, 1.6640]]
            .map(([z, y]) => new THREE.Vector2(-z - shiftZ, y + shiftY)));
        add('bow-deck-bracket', new THREE.ExtrudeGeometry(bracket, { depth: .1401, bevelEnabled: false, steps: 1 })
            .rotateY(Math.PI / 2).translate(x - .07005, 0, 0));
        // Sparse measured dome radii; the front cylindrical lip begins before the lens.
        const dome = x > 0 ? [[0, 0], [.0058, .0259], [.0215, .0510], [.0488, .0708], [.0820, .0800], [.1347, .0923], [length, .0923]]
            : [[0, 0], [.0039, .0259], [.0215, .0510], [.0488, .0708], [.0820, .0800], [.1328, .0923], [length, .0923]];
        const stations = dome.map(([z, r]) => new THREE.Vector2(r, z));
        stations.push(new THREE.Vector2(0, length));
        const lamp = new THREE.LatheGeometry(stations, P.q ? 24 : 16).rotateX(Math.PI / 2);
        add('bow-lamp-body', lamp.translate(x, y, back));
        add('bow-lamp-face', cylZ(.081, .008, P.q ? 24 : 16).translate(x, y, front + .001), 'Glass');
        add('bow-lamp-bezel', torus(.085, .007, P.q ? 24 : 16, 6).translate(x, y, front + .002));
        // Actual lower pedestal enters both the lamp shell and the local bow deck.
        add('bow-lamp-seat', box(.075, .058, .092).translate(x + .025, y - .070, back + .024));
        const positive = x > 0;
        const points = guardPath(positive);
        for (const side of [-1, 1])
            add('bow-guard-side', strip(points, x + side * .106));
        // The cross ribs bend in BOTH height and depth. Measured center/end scalar
        // sections define these small stock sweeps, not broad filled rectangular plates.
        const ribs = positive ? [[1.7622, 3.31545, 1.7544, 3.34375], [1.8130, 3.3291, 1.80125, 3.35645],
            [1.85645, 3.3652, 1.8330, 3.3838], [1.87355, 3.42285, 1.84375, 3.42285]] :
            [[1.7173, 3.42675, 1.70945, 3.45505], [1.76515, 3.43655, 1.7578, 3.46485],
                [1.81055, 3.46875, 1.7871, 3.4863], [1.8242, 3.5205, 1.79495, 3.5205]];
        for (const [centerY, centerZ, edgeY, edgeZ] of ribs) {
            const stations = [-1, -.5, 0, .5, 1].map(t => ({ z: x + t * .109, ring: Array.from({ length: 8 }, (_, i) => {
                    const a = i * Math.PI / 4, blend = t * t;
                    const yy = centerY + (edgeY - centerY) * blend, zz = centerZ + (edgeZ - centerZ) * blend;
                    return [-zz + .00685 * Math.cos(a), yy + .00735 * Math.sin(a)] as [
                        number,
                        number
                    ];
                }) }));
            add('bow-guard-rib', sectionSolid(stations).rotateY(Math.PI / 2));
        }
        if (x > 0) {
            // The right light carries a short blackout visor; the left lens remains exposed.
            const outer = Array.from({ length: 13 }, (_, i) => { const a = i * Math.PI / 12; return new THREE.Vector2(x + .084 * Math.cos(a), 1.7617 + .041 * Math.sin(a)); });
            const inner = [...outer].reverse().map(p => new THREE.Vector2(p.x, p.y - .007));
            add('bow-lamp-visor', new THREE.ExtrudeGeometry(new THREE.Shape([...outer, ...inner]), { depth: .1455, bevelEnabled: false, steps: 1 }).translate(0, 0, 3.4951));
            for (const side of [-1, 1])
                add('bow-lamp-visor-foot', box(.018, .037, .029).translate(x + side * .0716, 1.776, 3.50875));
        }
    }
    for (const [x, y, back, front, guardBack, crown, crownZ, topEnd] of [
        [.53413, 1.74560, 3.33010, 3.49610, 3.3215, 1.8455, 3.4355, 1.8235],
        [-.62347, 1.72510, 3.44140, 3.60550, 3.4387, 1.7960, 3.5117, 1.7940],
    ]) {
        addLamp(x, y, back, front);
    }
}
function addDragunSideArmor(P: TankBuilderPort): void {
    for (const side of [-1, 1]) {
        // Separate massive flotation/armor shoulders preserve daylight over the
        // wheel bay. Rear slats remain open and have real connecting stanchions.
        P.addExternalArmor('hull', box(.36, .79, 5.25), side * 1.83, 1.39, .72);
        equipment(P, 'hull', 'Detail', box(.04, .038, 5.28), side * 2.020, 1.805, .72);
        for (const z of [-1.54, -.58, .38, 1.34, 2.30, 3.19]) {
            equipment(P, 'hull', 'Detail', box(.23, .045, .040), side * 1.86, 1.82, z);
            if (P.q)
                for (const dz of [-.28, .28])
                    equipment(P, 'hull', 'Detail', box(.024, .037, .032), side * 2.024, 1.10, z + dz);
        }
        for (const z of [-3.32, -2.68, -2.02])
            equipment(P, 'hull', 'Detail', box(.045, .82, .044), side * 1.982, 1.37, z);
        for (let i = 0; i < (P.q ? 12 : 7); i++) {
            const y = .94 + i * (P.q ? .072 : .132);
            equipment(P, 'hull', 'Detail', box(.040, .020, 1.34), side * 1.992, y, -2.67);
        }
        // Leading skirt return is a structural tapered end, not a duplicate belt.
        P.addExternalArmor('hull', box(.38, .64, .42), side * 1.80, 1.28, 3.61, -.25);
        P.addMudguard(`dragun-front-${side}`, 'hullRubber', box(.42, .29, .04), side * 1.41, .98, 3.42, -.20);
        P.addMudguard(`dragun-rear-${side}`, 'hullRubber', box(.42, .36, .04), side * 1.41, .96, -3.31, .15);
        towEye(P, side, .76, 1.47, 3.55);
        optic(P, 'hull', side * 1.48, 1.74, 3.42, .23, .15, .18);
    }
}
function buildDragunHull(P: TankBuilderPort): void {
    // Source Object_15 has a sloping central deck and lower aft shoulders.
    // The body ends at the seated ramp; separate rear wings leave the real
    // access recess open instead of stretching a rectangular shell across it.
    const deck = (z: number, floor: number, edge: number, crown: number) => ({ z, ring: [
            [-1.13, floor], [1.13, floor], [1.13, 1.27], [1.68, 1.30],
            [1.56, edge], [.72, crown], [-.72, crown], [-1.56, edge],
            [-1.68, 1.30], [-1.13, 1.27],
        ] as [
            number,
            number
        ][] });
    const forward = (z: number, low: number, wide: number, top: number, floor: number, shoulder: number, roof: number, center = roof) => {
        const section = hullStation(z, low, wide, top, floor, shoulder, roof);
        return { ...section, ring: [...section.ring.slice(0, 5), [.85, center], [-.85, center], ...section.ring.slice(5)] as [
                number,
                number
            ][] };
    };
    const body = sectionSolid([
        deck(-3.30, .75, 1.837, 1.837), deck(-3.10, .536, 1.840, 1.853),
        deck(-2.80, .524, 1.845, 1.876), deck(-1.20, .524, 1.855, 1.9814),
        deck(-.80, .524, 1.868, 1.9814), deck(1.05, .524, 1.9814, 1.9814),
        // Freeze the existing mid-hull roof through Z3.0; only the local lamp
        // receiver changes forward of this section.
        (() => {
            const a = deck(1.05, .524, 1.9814, 1.9814), b = forward(3.20, 1.11, 1.69, 1.51, .58, 1.35, 1.70);
            b.ring[5] = [.72, 1.70];
            b.ring[6] = [-.72, 1.70];
            const t = (3.0 - 1.05) / (3.20 - 1.05);
            return { z: 3.0, ring: a.ring.map(([x, y], i) => [x + (b.ring[i][0] - x) * t, y + (b.ring[i][1] - y) * t] as [
                    number,
                    number
                ]) };
        })(),
        forward(3.20, 1.11, 1.69, 1.51, .58, 1.35, 1.70, 1.681796),
        forward(3.60, 1.12, 1.70, 1.51, .66, 1.26, 1.63, 1.616235),
        // Preserve the existing sides/underside by linear interpolation while
        // restoring only the source central receiving plane beneath the lamp feet.
        ...[[3.6777, 1.6035], [3.8730, 1.5723]].map(([z, center]) => {
            const t = (z - 3.60) / .43, lerp = (a: number, b: number) => a + (b - a) * t;
            return forward(z, lerp(1.12, .97), lerp(1.70, 1.65), lerp(1.51, 1.49), lerp(.66, 1.00), lerp(1.26, 1.18), lerp(1.63, 1.37), center);
        }),
        forward(4.03, .97, 1.65, 1.49, 1.00, 1.18, 1.37),
    ]);
    // The source access wall rakes forward below the aft deck. A flat rear
    // section would bury the measured door hardware and fill its recess.
    const positions = body.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        if (positions.getZ(i) < -3.2999) {
            positions.setZ(i, -3.242423 - .11529 * (positions.getY(i) - 1.3) + .0015);
        }
    }
    body.computeVertexNormals();
    P.add('hull', body);
    for (const side of [-1, 1]) {
        const stations = [
            { z: -3.916, ring: [[.768, 1.14], [1.19, 1.236], [1.49, 1.30], [1.572, 1.37], [1.572, 1.832], [.768, 1.832]] },
            { z: -3.70, ring: [[.673, .94], [.97, .96], [1.49, 1.30], [1.572, 1.37], [1.572, 1.832], [.673, 1.832]] },
            { z: -3.295, ring: [[.673, .94], [.97, .94], [1.49, 1.295], [1.58, 1.37], [1.58, 1.837], [.673, 1.837]] },
        ].map(station => {
            const ring = station.ring.map(([x, y]) => [side * x, y] as [
                number,
                number
            ]);
            return { z: station.z, ring: side < 0 ? ring.reverse() : ring };
        });
        P.add('hull', sectionSolid(stations));
    }
    addDragunSideArmor(P);
    addDragunRearDoor(P);
    hatch(P, 'hull', .79, 2.004, .76, .34);
    hatch(P, 'hull', -.86, 2.004, .65, .30);
    // The source aft shoulders have access lids, not broad engine grilles.
    // The separately assembled source ramp fixes the rear access recess target.
    for (const x of [-1.13, 1.13]) {
        panel(P, 'hull', x, 1.840, -3.22, .55, .84, .025, .055);
        for (const z of [-3.54, -2.90])
            equipment(P, 'hull', 'Detail', box(.13, .025, .028), x, 1.862, z);
    }
    for (const x of [-.69, .69]) {
        panel(P, 'hull', x, 1.793, 2.65, 1.23, 1.24, .025, .045, -.115);
        for (const z of [2.19, 2.84])
            equipment(P, 'hull', 'Detail', box(.105, .031, .155), x * .257, 1.99 - (z - 1.05) * .116, z, -.115);
    }
    addDragunBowLamps(P);
    // Four source wedge modules, not six thin rectangular flaps. Source-only
    // section calipers establish the lower return, broad slope and front bevel.
    for (const x of [-.7883, -.2682, .2519, .7719]) {
        const width = .515;
        const wedge = sectionSolid([
            { z: 3.724, ring: [[-width / 2, 1.058], [width / 2, 1.058], [width / 2, 1.066], [-width / 2, 1.066]] },
            { z: 4.010, ring: [[-width / 2, .9943], [width / 2, .9943], [width / 2, 1.552], [-width / 2, 1.552]] },
            { z: 4.0816, ring: [[-width / 2, .9802], [width / 2, .9802], [width / 2, 1.50986], [-width / 2, 1.50986]] },
            { z: 4.225, ring: [[-width / 2, 1.405], [width / 2, 1.405], [width / 2, 1.443], [-width / 2, 1.443]] },
            { z: 4.234, ring: [[-width / 2, 1.430], [width / 2, 1.430], [width / 2, 1.435], [-width / 2, 1.435]] },
        ]).translate(x, 0, 0);
        equipment(P, 'hull', 'Detail', wedge, 0, 0, 0);
        equipment(P, 'hull', 'Detail', cylX(.026, .504, 12), x, 1.539, 4.011);
    }
    for (const x of [-.95, -.63, -.31])
        optic(P, 'hull', x, 1.973, 1.55, .18, .085, .075);
    equipment(P, 'hull', 'Detail', box(2.76, .045, .16), 0, 1.472, 3.80, -.26);
    for (let i = -4; i <= 4; i++)
        equipment(P, 'hull', 'Detail', box(.027, .10, .21), i * .29, 1.46, 3.79, -.26);
}
function buildDragunGear(P: TankBuilderPort): void {
    // Source wheel rays, relative to its measured axle: hub +.113 m,
    // web +.072 m, rolled outer lip +.135 m, separated paired tire bands.
    const section: AxialWheelStation[] = [
        [.045, 0], [.113, 0], [.113, .075], [.072, .092], [.072, .195],
        [.114, .221], [.1355, .239], [.1355, .250], [.102, .250],
        [.044, .212], [.044, .09], [.045, 0],
    ];
    const wheelCore = KIT.mergeAll([
        lathedWheelSection(section, P.q ? 28 : 16),
        lathedWheelSection(section.map(([x, r]) => [-x, r]), P.q ? 28 : 16),
        cylX(.059, .224, P.q ? 20 : 12),
    ]);
    P.gear = KIT.buildRunningGear(P, {
        style: 'rubber', wheelPattern: 'armored-hub-six', trackPattern: 'eastern-ifv',
        wheelR: .2925, wheelW: .271, wheelY: .3525,
        wheelTireBands: [{ centerM: -.090, widthM: .091, innerRadiusM: .247 },
            { centerM: .090, widthM: .091, innerRadiusM: .247 }],
        wheelCoreGeometry: { disc: wheelCore },
        wheelZs: [-2.0378, -1.1838, -.4836, .3303, 1.2851, 2.0898],
        xc: 1.380, trackW: .386, trackTh: .030, topY: 1.195, botY: .032,
        sprocket: { z: 2.890, y: .835, r: .377 },
        idler: { z: -2.85, y: .89, r: .32 },
        rollers: [-1.8965, -.2705, 1.4415].map(z => ({ z, y: 1.0015, r: .1215 })),
        rollerR: .1215, paintedEnds: true, coveredTop: true, arms: true,
        fitLoadedRun: true, dedupeLoopPoints: true,
        trackShoeBuilder: buildFleetTrackShoe,
        trackShoeDimensions: { padHeight: .036, grouserHeight: .012, webHeight: .018,
            hornHeight: .080, pinRadius: .012, pinCentreY: 0 },
    });
}
/** Closed first-party receiver, barrel and mount from the source roof study.
 * Measurements are scalar dimensions only; no source mesh data is reused. */
function buildDragunRoofWeapon(P: TankBuilderPort): void {
    equipment(P, 'turret', 'Detail', cylY(.09, .10, .105, 12), .413, 2.684, -2.278);
    equipment(P, 'turret', 'Detail', box(.285, .40, .335), .364, 2.91, -2.303);
    const group = new THREE.Group();
    const stock = mergeAll([
        box(.134, .16, .66),
        xform(box(.125, .036, .46), 0, .094, -.02),
        xform(box(.042, .073, .13), -.082, -.015, -.05),
        xform(cylZ(.010, .288, P.q ? 14 : 8), .011, .049, .430),
        xform(cylZ(.017, .04, P.q ? 14 : 8), .011, .049, .557),
        xform(box(.012, .04, .018), .011, .077, .530),
        xform(box(.026, .08, .04), -.047, -.03, -.37),
        xform(box(.026, .08, .04), .047, -.03, -.37),
    ]);
    const weapon = new THREE.Mesh(stock, P.mats.dark);
    weapon.name = 'dragunRoofReceiverAndBarrel';
    weapon.castShadow = true;
    group.add(weapon);
    P.disposables.push(stock);
    group.position.set(.404, 3.035 - P.turretG.position.y, -2.383 - P.turretG.position.z);
    FITTINGS.markExact(group, 'pintleMG');
    group.name = 'dragunSourceRoofWeapon';
    group.userData.sourceOwner = 'Object_14';
    P.turretG.add(group);
}
/** Closed chamfered optical hood with real front recess and clamp feet. */
function dragunSight(P: TankBuilderPort, x: number, y: number, z: number, w: number, h: number, d: number): void {
    const shape = new THREE.Shape(), c = Math.min(w, h) * .15;
    shape.moveTo(-w / 2 + c, -h / 2);
    for (const [a, b] of [[w / 2 - c, -h / 2], [w / 2, -h / 2 + c], [w / 2, h / 2 - c], [w / 2 - c, h / 2], [-w / 2 + c, h / 2], [-w / 2, h / 2 - c], [-w / 2, -h / 2 + c]])
        shape.lineTo(a, b);
    shape.closePath();
    const aperture = new THREE.Path(), iw = w * .68, ih = h * .62;
    aperture.moveTo(-iw / 2, -ih / 2);
    aperture.lineTo(-iw / 2, ih / 2);
    aperture.lineTo(iw / 2, ih / 2);
    aperture.lineTo(iw / 2, -ih / 2);
    aperture.closePath();
    shape.holes.push(aperture);
    const hood = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, steps: 1 }).translate(0, 0, -d / 2);
    equipment(P, 'turret', 'Detail', hood, x, y, z);
    equipment(P, 'turret', 'Dark', box(w, h, .018), x, y, z - d / 2 + .009);
    equipment(P, 'turret', 'Glass', box(iw * .94, ih * .94, .012), x, y, z + d / 2 - .055);
    for (const side of [-1, 1]) {
        equipment(P, 'turret', 'Detail', box(.025, .035, d * .78), x + side * w * .39, y - h / 2 - .011, z);
        equipment(P, 'turret', 'Detail', cylX(.018, .04, 10), x + side * (w / 2 + .013), y - .035, z - .035);
    }
}
/** Closed local roof receiver and the two measured forward units. */
function dragunForwardRoof(P: TankBuilderPort): THREE.BufferGeometry {
    const rows = [[-2.77, .90, 1.09, .87, 2.11, 2.37, 2.58], [-2.30, 1.04, 1.225, .83, 2.01, 2.40, 2.66],
        [-1.08, 1.05, 1.205, .71, 2.01, 2.40, 2.66], [-.19, .64, .94, .52, 2.03, 2.37, 2.55],
        [.35, .38, .54, .34, 2.06, 2.31, 2.49]];
    const old = (z: number) => {
        let i = rows.findIndex(r => r[0] >= z);
        if (i === 0)
            return rows[0];
        const a = rows[i - 1], b = rows[i], t = (z - a[0]) / (b[0] - a[0]);
        return a.map((v, k) => v + (b[k] - v) * t);
    };
    const shoulder = (x: number, z: number) => {
        const a = 2.7641609 - 1.1767288 * x - .5888652 * z, b = 2.737945411 - 1.131504439 * x - .587201554 * z;
        const c = 2.7629368 - 1.1803070 * x - .5940623 * z, d = 2.7653037 - 1.1468534 * x - .5545776 * z;
        const e = 2.7332007 - 1.0859709 * x - .5556959 * z, f = 2.7333956 - 1.1041320 * x - .5741652 * z;
        return z <= -.65113 ? Math.min(a, b) : z <= -.49893 ? Math.max(c, d) : Math.min(d, Math.max(e, f));
    };
    const blend = (z: number) => Math.min(1, Math.max(0, (z + 1.08) / .05917), Math.max(0, (-.19 - z) / .03793));
    const shallow = (z: number) => 2.584291039 - .053476306 * z;
    const station = (z: number) => {
        const s = old(z), [, low, wide, top, floor, edge, roof] = s, t = blend(z);
        let a = .2, b = 1.4;
        for (let i = 0; i < 32; i++) {
            const x = (a + b) / 2;
            if (shoulder(x, z) > 2.04978)
                a = x;
            else
                b = x;
        }
        const outer = wide + (b - wide) * t, edgeY = edge + (2.04978 - edge) * t;
        const originalTop = (x: number) => Math.abs(x) <= top ? roof : roof + (edge - roof) * (Math.abs(x) - top) / (wide - top);
        const surface = (x: number) => {
            const lateral = Math.max(0, Math.min(1, (x + .20) / .10));
            return originalTop(x) + (Math.min(shallow(z), shoulder(x, z)) - originalTop(x)) * t * lateral;
        };
        const dz = (z + .64653) / .157;
        const half = Math.abs(dz) < 1 ? .171 * Math.sqrt(1 - dz * dz) : .0001;
        const left = .43258 - half, right = .43258 + half;
        const roofAt = (x: number) => {
            const y = surface(x);
            if (Math.abs(dz) >= 1)
                return y;
            const f = Math.max(0, Math.min(1, (x - left) / .003, (right - x) / .003));
            return y + (Math.min(y, 2.568) - y) * f;
        };
        const planes = [[2.7641609, 1.1767288, .5888652], [2.737945411, 1.131504439, .587201554],
            [2.7629368, 1.180307, .5940623], [2.7653037, 1.1468534, .5545776],
            [2.7332007, 1.0859709, .5556959], [2.7333956, 1.104132, .5741652]];
        const creases = planes.map(([a, b, c]) => (a - c * z - shallow(z)) / b);
        for (const [i, j] of [[0, 1], [2, 3], [3, 4], [3, 5], [4, 5]]) {
            const a = planes[i], b = planes[j];
            creases.push((a[0] - b[0] - (a[2] - b[2]) * z) / (a[1] - b[1]));
        }
        let knots = [outer - .0002, ...creases,
            right + .003, right, right - .003, left + .003, left, left - .003, 0, -.1, -.2, -top];
        knots = knots.map(x => Math.min(outer - .0002, Math.max(-top, x))).sort((x, y) => y - x);
        for (let i = 1; i < knots.length; i++)
            if (knots[i] >= knots[i - 1] - .00001)
                knots[i] = knots[i - 1] - .00001;
        const ring: [
            [
                number,
                number
            ],
            ...[
                number,
                number
            ][]
        ] = [[-low, floor], [low, floor], [outer, edgeY],
            ...knots.map(x => [x, roofAt(x)] as [
                number,
                number
            ]), [-wide, edge]];
        return { z: z - P.turretG.position.z, ring: ring.map(([x, y]) => [x, y - P.turretG.position.y] as const) };
    };
    const zs = [-1.08, -1.02083, -.95, -.88, -.84, -.80353, -.795, -.78, -.755, -.73, -.705, -.68,
        -.65113, -.625, -.60, -.575, -.55, -.525, -.50, -.48953, -.46, -.40, -.35, -.28, -.22793, -.19];
    const geometry = mergeAll([
        sectionSolid(rows.slice(0, 3).map(r => turretStation(P, ...r as [
            number,
            number,
            number,
            number,
            number,
            number,
            number
        ]))),
        sectionSolid(zs.map(station)),
        sectionSolid(rows.slice(3).map(r => turretStation(P, ...r as [
            number,
            number,
            number,
            number,
            number,
            number,
            number
        ]))),
    ]);
    geometry.userData.dragunRoofRole = 'receiving-shell';
    return geometry;
}
function addDragunLargeRoofReceiver(P: TankBuilderPort): void {
    const add = (role: string, g: THREE.BufferGeometry, finish: 'Detail' | 'Dark' | 'Glass' = 'Detail') => { g.userData.dragunRoofRole = role; equipment(P, 'turret', finish, g, 0, 0, 0); };
    // Scalar circle fits of the high rim: R180.415 mm / R130.210 mm.
    // The remaining outboard arc is lowered to the exposed recessed floor.
    const n = P.q ? 72 : 36, floor = 2.58478, top = 2.65558;
    const points: number[][] = [];
    function addRingPoint(ring: number, i: number): void {
        const angle = i / n * Math.PI * 2, c = Math.cos(angle), s = Math.sin(angle), deg = i / n * 360;
        const high = deg >= 115 && deg <= 310;
        const y = high ? top : floor - .0005;
        if (ring === 0)
            points.push([.417769 + .13021 * c, floor, -.664461 + .13021 * s]);
        if (ring === 1)
            points.push([.417769 + .13021 * c, y, -.664461 + .13021 * s]);
        if (ring === 2)
            points.push([.419691 + (high ? .180415 : .1745) * c, y, -.663314 + (high ? .180415 : .1745) * s]);
        if (ring === 3) {
            const x = .42578 + .19245 * c, z = -.65843 + .192 * s;
            const roof = Math.min(2.584291039 - .053476306 * z, 2.7629368 - 1.180307 * x - .5940623 * z);
            points.push([x, Math.min(floor - .014, roof - .002), z]);
        }
        if (ring === 4)
            points.push([.417769 + .13021 * c, 2.567, -.664461 + .13021 * s]);
    }
    for (let ring = 0; ring < 5; ring++)
        for (let i = 0; i < n; i++)
            addRingPoint(ring, i);
    const pos: number[] = [];
    const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);
    for (let k = 0; k < 4; k++)
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n, a = points[k * n + i], b = points[k * n + j], c = points[(k + 1) * n + j], d = points[(k + 1) * n + i];
            tri(a, b, c);
            tri(a, c, d);
        }
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        tri([.417769, floor, -.664461], points[j], points[i]);
        tri([.417769, 2.567, -.664461], points[4 * n + i], points[4 * n + j]);
    }
    const bowl = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    bowl.setAttribute('uv', new THREE.Float32BufferAttribute(pos.flatMap((v, i) => i % 3 === 0 ? [v, pos[i + 2]] : []), 2));
    bowl.computeVertexNormals();
    add('large-receiver', bowl);
}
function addDragunRoofHood(P: TankBuilderPort): void {
    const add = (role: string, g: THREE.BufferGeometry, finish: 'Detail' | 'Dark' | 'Glass' = 'Detail') => { g.userData.dragunRoofRole = role; equipment(P, 'turret', finish, g, 0, 0, 0); };
    // Raised hood: source front/side surfaces are retained as finite thin stock.
    // The source is open underneath; do not replace it with a filled cuboid.
    const capRows = [[-.75863, .1204, 2.67848], [-.75363, .1623, 2.68338], [-.73843, .1763, 2.69758], [-.70083, .1763, 2.73418], [-.57173, .1763, 2.73418]];
    const topSkin = sectionSolid(capRows.map(([z, w, y]) => ({ z, ring: [[-w / 2, y - .006], [w / 2, y - .006], [w / 2, y], [-w / 2, y]] }))).translate(.42268, 0, 0);
    add('large-hood-top', topSkin);
    for (const side of [-1, 1]) {
        const wall = sectionSolid(capRows.map(([z, w, y]) => { const x = .42268 + side * (w / 2 - .003); return { z, ring: [[x - .003, 2.58428], [x + .003, 2.58428], [x + .003, y], [x - .003, y]] }; }));
        add('large-hood-side', wall);
    }
    // Source faces6898/6899 are a real aft wall; keep its measured outer plane.
    add('large-hood-back', box(.1204, .0942, .006).translate(.42283, 2.63138, -.75563));
    const face = new THREE.Shape([[-.08815, -.07495], [.08815, -.07495], [.08815, .07495], [-.08815, .07495]].map(([x, y]) => new THREE.Vector2(x + .42268, y + 2.65923)));
    const aperture = new THREE.Path(), cx = .43818, cy = 2.65295, w = .11310, h = .10010, c = .0074;
    const opening = [[-w / 2 + c, -h / 2], [w / 2 - c, -h / 2], [w / 2, -h / 2 + c], [w / 2, h / 2 - c], [w / 2 - c, h / 2], [-w / 2 + c, h / 2], [-w / 2, h / 2 - c], [-w / 2, -h / 2 + c]];
    opening.reverse().forEach(([x, y], i) => i ? aperture.lineTo(cx + x, cy + y) : aperture.moveTo(cx + x, cy + y));
    aperture.closePath();
    face.holes.push(aperture);
    // A hidden 3.2 mm throat extension joins the measured rear optical plane
    // to the finite hood skin while leaving the complete front aperture open.
    add('large-hood-front', new THREE.ExtrudeGeometry(face, { depth: .0155, bevelEnabled: false }).translate(0, 0, -.58723));
    const lens = new THREE.Shape(), lw = .0618, lh = .0835, lc = .014;
    lens.moveTo(-lw / 2 + lc, -lh / 2);
    for (const [x, y] of [[lw / 2 - lc, -lh / 2], [lw / 2, -lh / 2 + .0283], [lw / 2, lh / 2 - .0176],
        [lw / 2 - .005, lh / 2 - .0073], [lw / 2 - .021, lh / 2], [-lw / 2 + .021, lh / 2],
        [-lw / 2 + .005, lh / 2 - .0073], [-lw / 2, lh / 2 - .0176], [-lw / 2, -lh / 2 + .0283]])
        lens.lineTo(x, y);
    lens.closePath();
    const receiver = new THREE.Shape([[-.05935, -.0569], [.05935, -.0569], [.05935, .0569], [-.05935, .0569]].map(([x, y]) => new THREE.Vector2(x + .43708, y + 2.64798)));
    const lensHole = new THREE.Path(lens.getPoints().map(v => new THREE.Vector2(v.x + .43723, v.y + 2.64753)).reverse());
    receiver.holes.push(lensHole);
    add('large-optic-receiver', new THREE.ExtrudeGeometry(receiver, { depth: .003, bevelEnabled: false }).translate(0, 0, -.58983), 'Dark');
    add('large-optic-lens', new THREE.ExtrudeGeometry(lens, { depth: .003, bevelEnabled: false }).translate(.43723, 2.64753, -.58983), 'Glass');
    // Object14 component132: two overlapping straight plate stocks at the
    // source bearing, with the measured narrow forward return. The source
    // lower edge has a3.9mm assembly gap above the crescent; a4.38mm hidden
    // downward lap gives the actual native plate a finite rim seat.
    const plateAxis = new THREE.Vector3(-.0528, 0, .1098).normalize();
    const plateNormal = new THREE.Vector3(plateAxis.z, 0, -plateAxis.x);
    const plateYaw = Math.atan2(plateAxis.x, plateAxis.z), plateFloor = 2.6551;
    for (const [start, length, width] of [[0, .10675, .0135], [.105, .016832, .0078]]) {
        const center = new THREE.Vector3(.42393, 0, -.90273)
            .addScaledVector(plateAxis, start + length / 2).addScaledVector(plateNormal, width / 2);
        const g = box(width, 2.83578 - plateFloor, length).rotateY(plateYaw)
            .translate(center.x, (2.83578 + plateFloor) / 2, center.z);
        add('large-angled-plate', g);
    }
}
function addDragunForwardRoofUnits(P: TankBuilderPort): void {
    const add = (role: string, g: THREE.BufferGeometry, finish: 'Detail' | 'Dark' | 'Glass' = 'Detail') => { g.userData.dragunRoofRole = role; equipment(P, 'turret', finish, g, 0, 0, 0); };
    addDragunLargeRoofReceiver(P);
    addDragunRoofHood(P);
    // Low, sloping cone receiver with two real thin arch straps above it.
    const dome = new THREE.LatheGeometry([[0, 0], [.08125, 0], [.08125, .004], [.046, .0252], [0, .0331]].map(([r, y]) => new THREE.Vector2(r, y)), P.q ? 32 : 16);
    const p = dome.attributes.position;
    for (let i = 0; i < p.count; i++) {
        const z = p.getZ(i) - .41248;
        p.setXYZ(i, p.getX(i) + .13798, p.getY(i) + 2.60438 - .053476306 * (z + .41248), z);
    }
    dome.computeVertexNormals();
    add('small-receiver', dome);
    const arch = (span: number, thickness: number, centerTop: number, slope: number) => {
        const w = span / 2, foot = (u: number) => 2.60438 + slope * u, topY = (u: number) => centerTop + slope * u;
        const outer = [[-w, foot(-w)], [-w, topY(-w) - .028], [-w + .011, topY(-w + .011) - .009], [-w + .028, topY(-w + .028)],
            [w - .028, topY(w - .028)], [w - .011, topY(w - .011) - .009], [w, topY(w) - .028], [w, foot(w)]];
        const inner = [[w - thickness, foot(w - thickness)], [w - thickness, topY(w) - .028],
            [w - .014, topY(w - .014) - .013], [w - .029, topY(w - .029) - thickness],
            [-w + .029, topY(-w + .029) - thickness], [-w + .014, topY(-w + .014) - .013], [-w + thickness, topY(-w) - .028], [-w + thickness, foot(-w + thickness)]];
        return new THREE.Shape([...outer, ...inner].map(([x, y]) => new THREE.Vector2(x, y)));
    };
    const long = new THREE.ExtrudeGeometry(arch(.2239, .0063, 2.652788, -.05029), { depth: .0077, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(.14193, 0, -.41118);
    add('small-long-strap', long);
    const cross = new THREE.ExtrudeGeometry(arch(.2228, .0063, 2.645906, 0), { depth: .0095, bevelEnabled: false }).translate(.13823, 0, -.41643);
    add('small-cross-strap', cross);
}
function buildDragunTurret(P: TankBuilderPort): void {
    P.add('turret', cylY(.91, .99, .15, P.q ? 36 : 20), 0, .055, 0);
    P.add('turret', dragunForwardRoof(P));
    addDragunForwardRoofUnits(P);
    for (const side of [-1, 1]) {
        smokeBank(P, side, .93, 2.43, -.17, 3, .24);
        // Object_5 side heads sit below the roof, on the sloping shoulders.
        dragunSight(P, side * 1.209, 2.337, -1.588, .25, .268, .30);
        dragunSight(P, side * 1.258, 2.335, -1.86, .27, .261, .232);
    }
    hatch(P, 'turret', -.563, 2.672, -1.664, .275);
    hatch(P, 'turret', .499, 2.679, -1.664, .272);
    equipment(P, 'turret', 'Detail', cylY(.20, .22, .15, P.q ? 24 : 14), -.887, 2.69, -2.33);
    equipment(P, 'turret', 'Detail', cylY(.147, .147, .182, P.q ? 24 : 14).scale(.90, 1, 1), -.887, 2.842, -2.33);
    dragunSight(P, -.887, 2.865, -2.33, .265, .216, .280);
    for (const x of [-.563, .499])
        for (const d of [-.16, .16])
            equipment(P, 'turret', 'Detail', cylX(.020, .09, 10), x + d, 2.711, -1.887);
    // Source's tall central octagonal panoramic unit; its narrow pedestal is
    // physically seated, and its faceted housing is distinct from the roof MG.
    equipment(P, 'turret', 'Detail', cylY(.078, .078, .108, 12), -.070, 2.681, -1.95);
    // Source Object_5: the 200 mm optical tier is genuinely recessed.
    // Lower and upper closed stock plus corner posts leave real window space.
    equipment(P, 'turret', 'Detail', cylY(.237, .237, .226, 8).scale(.793, 1, 1), -.070, 2.8426, -2.00);
    equipment(P, 'turret', 'Detail', cylY(.237, .237, .138, 8).scale(.793, 1, 1), -.070, 3.225, -2.00);
    equipment(P, 'turret', 'Dark', cylY(.171, .171, .203, 8).scale(.793, 1, 1), -.070, 3.055, -2.00);
    for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        equipment(P, 'turret', 'Detail', box(.037, .201, .038), -.070 + Math.sin(a) * .183, 3.055, -2 + Math.cos(a) * .231, 0, a);
        const face = a + Math.PI / 8;
        equipment(P, 'turret', 'Glass', box(.084, .155, .013), -.070 + Math.sin(face) * .148, 3.055, -2 + Math.cos(face) * .185, 0, face);
    }
    // Object_14's two different receivers and Object_20's actual whip axes.
    // The left whip leans outboard; its tip X is not its attachment datum.
    equipment(P, 'turret', 'Detail', box(.1269, .0342, .1280), -.98282, 2.57648, -1.93303);
    equipment(P, 'turret', 'Detail', box(.0830, .0937, .0468), -.99117, 2.62873, -1.93253);
    const leftReceiver = new THREE.LatheGeometry([
        [0, 0], [.0298, 0], [.0298, .020], [.0549, .054], [.0395, .116], [.0259, .178], [0, .178],
    ].map(([r, y]) => new THREE.Vector2(r, y)), P.q ? 12 : 8).rotateZ(.1302);
    equipment(P, 'turret', 'Detail', leftReceiver, -.9920, 2.6307, -1.9320);
    equipment(P, 'turret', 'Detail', new THREE.LatheGeometry([
        [0, 0], [.0508, 0], [.0486, .027], [.04345, .1345], [.03515, .19285], [.02735, .2861], [0, .2861],
    ].map(([r, y]) => new THREE.Vector2(r, y)), P.q ? 12 : 8), .96148, 2.56428, -1.91983);
    for (const [base, tip] of [
        [[-1.013869, 2.792851, -1.93194], [-1.209075, 4.283319, -1.93194]],
        [[.96180, 2.81351, -1.91950], [.96180, 4.31671, -1.91950]],
    ]) {
        const a = new THREE.Vector3(...base), b = new THREE.Vector3(...tip), axis = b.clone().sub(a);
        const whip = cylY(.0058, .0126, axis.length(), P.q ? 8 : 6);
        whip.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize()));
        const center = a.add(b).multiplyScalar(.5);
        equipment(P, 'turret', 'Dark', whip, center.x, center.y, center.z);
    }
    buildDragunRoofWeapon(P);
    optic(P, 'turret', -.32, 2.535, .12, .25, .17, .28);
    // The trunnion boot pitches with the cradle; only the tube recoils.
    // Object_17's rounded stepped boot: independent 16/10-sided elliptical
    // sections, measured maximum .652 x .388 x .305 m around the trunnion.
    const sides = P.q ? 16 : 10;
    P.addGunExtra(sectionSolid([
        [-.237, -.0524, -.0106, .262, .170], [-.100, -.0524, -.0106, .326, .1938],
        [.0685, 0, 0, .166, .1564],
    ].map(([z, cx, cy, rx, ry]) => ({ z, ring: Array.from({ length: sides }, (_, i) => {
            const a = 2 * Math.PI * i / sides;
            return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as const;
        }) }))));
    P.addGunExtra(cylZ(.160, .075, P.q ? 28 : 16), 0, 0, .052);
    barrel(P, 4.6957, .083, 2.60, { z: 2.58, length: .74, radius: .119 }, .0625);
}
export function buildBmp3mDragun125X(P: TankBuilderPort): void {
    // Measured fixed armor extends the shadow silhouette; omit small fittings.
    P.additionalShadowSources = {
        hull: ['hullExternalArmor'],
    };
    const frame = EASTERN_SOURCE_STUDIES.bmp3m_dragun125_x.frame;
    P.hullG.position.set(0, 0, 0);
    P.turretG.position.set(...frame.turret);
    P.gunG.position.set(0, frame.gun[1] - frame.turret[1], frame.gun[2] - frame.turret[2]);
    buildDragunHull(P);
    buildDragunGear(P);
    buildDragunTurret(P);
    P.topY = 3.31 - frame.turret[1];
    preserveSourceStudyGunMountAppearance(P);
    P.hullG.userData.xRebuild = { candidate: 'bmp3m_dragun125_x', independent: true, sourceLocalOnly: true };
}
export const BMP3M_DRAGUN125_X_PROFILE = { bmp3m_dragun125_x: { build: buildBmp3mDragun125X } };
