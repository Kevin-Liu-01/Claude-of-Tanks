import { weaponAssembly } from './weaponStock.ts';
import { preserveSourceStudyGunMountAppearance } from './sourceStudyGunMount.ts';
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import { sectionSolid } from './sectionSolid.ts';
import { EASTERN_SOURCE_STUDIES } from '../easternSourceStudyData.ts';
import { barrel, equipment, hatch, panel, openGunTube, hullStation, optic, smokeBank, towEye, turretStation } from './easternSourceKit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylX, cylY, cylZ } = KIT;
/** Rear ramp rests on the measured raked wall, including its existing fittings. */
function seatedRearRamp(P: TankBuilderPort): void {
    const angle = -Math.atan(.145177), centerY = 1.32335, centerZ = -3.6203;
    const place = (kind: string, g: THREE.BufferGeometry, x: number, y: number, z: number) => {
        g.rotateX(angle);
        equipment(P, 'hull', kind, g, x, centerY + y * Math.cos(angle) - z * Math.sin(angle), centerZ + y * Math.sin(angle) + z * Math.cos(angle));
    };
    place('Dark', box(1.4063, 1.3156, .018), 0, 0, .03);
    place('Detail', box(1.3613, 1.2706, .05), 0, 0, 0);
    for (const x of [-.54, .54])
        place('Detail', cylX(.035, .19, 10), x, -.572, -.035);
    place('Detail', box(.20, .045, .05), -.177, .24, -.090);
    // The supplied small access door has a rounded outline and its own depth.
    const shape = new THREE.Shape(), w = .5797 / 2, h = .8994 / 2, r = .115;
    shape.moveTo(-w + r, -h);
    shape.lineTo(w - r, -h);
    shape.quadraticCurveTo(w, -h, w, -h + r);
    shape.lineTo(w, h - r);
    shape.quadraticCurveTo(w, h, w - r, h);
    shape.lineTo(-w + r, h);
    shape.quadraticCurveTo(-w, h, -w, h - r);
    shape.lineTo(-w, -h + r);
    shape.quadraticCurveTo(-w, -h, -w + r, -h);
    const door = new THREE.ExtrudeGeometry(shape, { depth: .042, bevelEnabled: false, curveSegments: P.q ? 8 : 5 }).translate(0, 0, -.021);
    place('Detail', door, .0943, .00255, -.0440);
}
/** Source Object_6 rear steel channel and seated lower flap. */
function rearFender(P: TankBuilderPort, side: number): void {
    const inner = side < 0 ? .8943 : .8967, outer = side < 0 ? 1.5701 : 1.5725;
    const wall = .0078;
    const strip = (x0: number, x1: number, lower: boolean) => sectionSolid([
        { z: -3.9375, ring: [[side * x0, 1.1444], [side * x1, 1.1444], [side * x1, 1.1717], [side * x0, 1.1717]] },
        { z: -3.5996, ring: [[side * x0, lower ? 1.1444 : 1.3632], [side * x1, lower ? 1.1444 : 1.3632],
                [side * x1, 1.3729], [side * x0, 1.3729]] },
        { z: -3.5664, ring: [[side * x0, 1.1444], [side * x1, 1.1444], [side * x1, 1.1825], [side * x0, 1.1825]] },
    ].map(s => ({ ...s, ring: (side < 0 ? s.ring.reverse() : s.ring).map(([x, y]) => [x, y] as const) })));
    P.addMudguard(`k21-rear-roof-${side}`, 'hull', strip(inner, outer, false));
    P.addMudguard(`k21-rear-inboard-web-${side}`, 'hull', strip(inner, inner + wall, true));
    P.addMudguard(`k21-rear-outboard-web-${side}`, 'hull', strip(outer - wall, outer, true));
    P.addMudguard(`k21-rear-lip-${side}`, 'hull', box(outer - inner, .0273, .0117), side * (inner + outer) / 2, 1.15805, -3.93165);
    P.addMudguard(`k21-rear-${side}`, 'hullRubber', box(.6587, .1162, .0117), side < 0 ? -1.2320 : 1.2343, 1.0961, -3.92185);
    // The existing side wall starts forward of the actual rear corner.
    equipment(P, 'hull', 'Detail', box(.0157, .9619, .720), side < 0 ? -1.5643 : 1.5666, 1.33435, -3.3041);
    // Measured shallow open channel continues along the reduced rear shoulder.
    const offset = side < 0 ? 1.4856 : 1.4880;
    const channel = [[0, 0], [.0049, 0], [.0049, .0283], [.0107, .0342],
        [.0703, .0342], [.0771, .0283], [.0771, 0], [.082, 0], [.082, .0293],
        [.0713, .040], [.0097, .040], [0, .0293]].map(([x, y]) => [side * (offset + x), 1.8153 + y] as const);
    if (side < 0)
        channel.reverse();
    equipment(P, 'hull', 'Detail', sectionSolid([{ z: -3.6641, ring: channel }, { z: -.98, ring: channel }]), 0, 0, 0);
    // The complete source roof ray first meets this hinge, not the plate below.
    const shift = side < 0 ? -.0023 : 0;
    equipment(P, 'hull', 'Detail', box(.4843, .0097, .0117), side * (1.19455 + shift), 1.37975, -3.63085);
    for (const x of [.9704, 1.0290, 1.3630, 1.4216])
        equipment(P, 'hull', 'Detail', box(.0108, .0410, .0313), side * (x + shift), 1.37, -3.62695);
}
/** Object_6 rear lamp guards: a folded open hood with two seated side webs. */
function rearLampGuard(P: TankBuilderPort, side: number): void {
    const cx = side < 0 ? -1.4036 : 1.4059;
    const flat = .03665, half = .07910, wall = .0078;
    const roof = (xa: number, xb: number, ya: number, yb: number, frontA: number, frontB: number) => {
        const g = sectionSolid([
            { z: 0, ring: [[xa, ya - .0107], [xb, yb - .0107], [xb, yb], [xa, ya]] },
            { z: 1, ring: [[xa, frontA - .0107], [xb, frontB - .0107], [xb, frontB], [xa, frontA]] },
        ]);
        // The outer shoulder folds end forward of the flat cap's rear edge.
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const blend = Math.min(1, Math.max(0, (Math.abs(p.getX(i)) - flat) / (half - flat)));
            const z = p.getZ(i) < .5 ? -3.8203 + blend * .0137 : -3.6719 + blend * .0059;
            p.setZ(i, z);
        }
        g.computeVertexNormals();
        equipment(P, 'hull', 'Detail', g, cx, 0, 0);
    };
    roof(-flat, flat, 1.8280, 1.8280, 1.8397, 1.8397);
    // Half-millimetre hidden lap at each fold provides a finite seam.
    roof(-half, -flat + .0005, 1.7948, 1.8280, 1.8065, 1.8397);
    roof(flat - .0005, half, 1.8280, 1.7948, 1.8397, 1.8065);
    for (const sideX of [-1, 1]) {
        // A simple folded side web follows the source's support envelope and
        // reaches the actual raked rear wall; the lamp aperture remains open.
        const yz = [[-3.6875, 1.6298], [-3.6367, 1.6376], [-3.6563, 1.7528],
            [-3.6660, 1.8065], [-3.8066, 1.7948], [-3.7930, 1.7606],
            [-3.7305, 1.7606], [-3.7070, 1.7440]];
        const shape = new THREE.Shape(yz.map(([z, y]) => new THREE.Vector2(-z, y)));
        const web = new THREE.ExtrudeGeometry(shape, { depth: wall, bevelEnabled: false, steps: 1 }).rotateY(Math.PI / 2);
        equipment(P, 'hull', 'Detail', web, cx + sideX * (half - wall / 2) - wall / 2, 0, 0);
    }
}
/** Asymmetric source headlamp covers retain the open mouth below each crown. */
function frontLampHoods(P: TankBuilderPort): void {
    for (const [lo, hi, tongue] of [[-1.485135, -.871435, .4634], [1.060665, 1.488465, .2754]]) {
        const cx = (lo + hi) / 2, bevel = .0156, wall = .0068;
        const outline = [[lo + bevel, 3.3867], [hi - bevel, 3.3867], [hi - bevel, 3.6016],
            [cx + tongue / 2, 3.6094], [cx + tongue / 2, 3.6191], [cx - tongue / 2, 3.6191],
            [cx - tongue / 2, 3.6094], [lo + bevel, 3.6016]];
        const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
        const crown = new THREE.ExtrudeGeometry(shape, { depth: .0058, bevelEnabled: false, steps: 1 }).rotateX(-Math.PI / 2);
        equipment(P, 'hull', 'Detail', crown, 0, 1.6503, 0);
        for (const edge of [-1, 1]) {
            const outer = edge < 0 ? lo : hi, inner = outer - edge * (bevel + .0005);
            const points = edge < 0 ? [[outer, 1.6337], [inner, 1.6503], [inner, 1.6561], [outer, 1.6395]] :
                [[inner, 1.6503], [outer, 1.6337], [outer, 1.6395], [inner, 1.6561]];
            const ring = points.map(([x, y]) => [x, y] as const);
            equipment(P, 'hull', 'Detail', sectionSolid([{ z: 3.3867, ring }, { z: 3.6016, ring }]), 0, 0, 0);
            const yz = [[3.3867, 1.5282], [3.4082, 1.5028], [3.5742, 1.5028], [3.6016, 1.6307],
                [3.6016, 1.6397], [3.3867, 1.6397]];
            const webShape = new THREE.Shape(yz.map(([z, y]) => new THREE.Vector2(-z, y)));
            const web = new THREE.ExtrudeGeometry(webShape, { depth: wall, bevelEnabled: false, steps: 1 }).rotateY(Math.PI / 2);
            equipment(P, 'hull', 'Detail', web, edge < 0 ? lo : hi - wall, 0, 0);
        }
        // Source rear wall seats on the existing bow roof; no solid box fills
        // the source opening or the space beneath the forward cap tongue.
        equipment(P, 'hull', 'Detail', box(hi - lo - wall * 2, .1223, .0059), cx, 1.58935, 3.38965);
    }
}
/** Measured round receivers and their real tabs replace the former aft boxes. */
function frontLampReceivers(P: TankBuilderPort): void {
    const segments = P.q ? 20 : 12;
    for (const [mainX, lobeX, smallX] of [[-1.16394, -1.283535, -1.417835], [1.24237, 1.122215, 1.422065]]) {
        const shape = new THREE.Shape();
        shape.absarc(0, 0, .07325, 0, Math.PI * 2, false);
        const hole = new THREE.Path();
        hole.absarc(0, 0, .05375, 0, Math.PI * 2, true);
        shape.holes.push(hole);
        const receiver = new THREE.ExtrudeGeometry(shape, { depth: .0762, bevelEnabled: false, steps: 1, curveSegments: segments / 2 });
        equipment(P, 'hull', 'Detail', receiver, mainX, 1.57605, 3.5156);
        equipment(P, 'hull', 'Dark', cylZ(.05375, .004, segments), mainX, 1.57605, 3.5859);
        equipment(P, 'hull', 'Detail', box(.1055, .1065, .0566), lobeX, 1.57655, 3.5537);
        equipment(P, 'hull', 'Detail', box(.0224, .0068, .0332), mainX, 1.6498, 3.5576);
        equipment(P, 'hull', 'Detail', cylZ(.03665, .0547, segments), smallX, 1.6092, 3.56645);
        equipment(P, 'hull', 'Dark', cylZ(.029, .0019, segments), smallX, 1.6092, 3.59475);
        equipment(P, 'hull', 'Detail', box(.0215, .0107, .0332), smallX, 1.64785, 3.5576);
    }
}
/** Source-only scalar bow fittings: real low towing shackles and folded front. */
function bowTowFittings(P: TankBuilderPort): void {
    for (const x of [-.648035, .650315]) {
        const eye = new THREE.TorusGeometry(.05645, .020, P.q ? 8 : 6, P.q ? 24 : 16).scale(1, 1.213, 1);
        equipment(P, 'hull', 'Detail', eye, x, .6058, 3.0215);
        for (const side of [-1, 1])
            equipment(P, 'hull', 'Detail', box(.0102, .067, .041), x + side * .03565, .6993, 3.0225);
        equipment(P, 'hull', 'Detail', cylX(.0178, .0561, P.q ? 16 : 10), x, .7052, 3.0215);
        const shape = new THREE.Shape();
        // Closed forged receiver: measured attachment slope, narrower lower nose.
        shape.moveTo(-2.918, .705);
        shape.lineTo(-3.0078, .8085);
        shape.lineTo(-3.0234, .7953);
        shape.lineTo(-3.0645, .7118);
        shape.lineTo(-3.0547, .6757);
        shape.lineTo(-3.0195, .661);
        shape.lineTo(-2.9316, .6923);
        shape.closePath();
        const receiver = new THREE.ExtrudeGeometry(shape, { depth: .0503, bevelEnabled: false, steps: 1 }).rotateY(Math.PI / 2);
        equipment(P, 'hull', 'Detail', receiver, x - .02515, 0, 0);
        // Wider upper shoulder is the actual finite hull seat.
        const shoulder = new THREE.Shape([new THREE.Vector2(-2.918, .705), new THREE.Vector2(-3.0078, .8085),
            new THREE.Vector2(-3.0234, .7953), new THREE.Vector2(-2.9316, .6923)]);
        equipment(P, 'hull', 'Detail', new THREE.ExtrudeGeometry(shoulder, { depth: .0845, bevelEnabled: false, steps: 1 }).rotateY(Math.PI / 2), x - .04225, 0, 0);
    }
}
function bowFascia(P: TankBuilderPort): void {
    const sheet = (width: number, stations: readonly (readonly [
        number,
        number
    ])[]) => {
        const shape = new THREE.Shape(stations.map(([z, y]) => new THREE.Vector2(-z, y)));
        equipment(P, 'hull', 'Detail', new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, steps: 1 }).rotateY(Math.PI / 2), .001165 - width / 2, 0, 0);
    };
    // Two broad measured folds; the center lower return is narrower than the face.
    sheet(3.1484, [[3.4199, .9403], [3.5313, 1.0663], [3.6445, 1.4169],
        [3.6797, 1.4081], [3.5527, 1.0575], [3.4355, .9247]]);
    sheet(1.2607, [[3.2148, .8265], [3.2871, .8910], [3.3594, .9281], [3.4300, .9424],
        [3.4450, .9250], [3.3672, .9105], [3.2988, .8758], [3.2285, .8119]]);
    // Thin rolled receiving strap, measured across its four folded stations.
    // The hollow channel and its mating barrel both remain visible.
    sheet(2.9356, [[3.5801, 1.4432], [3.5723, 1.4178], [3.5762, 1.4071], [3.6270, 1.3885],
        [3.6367, 1.3944], [3.6465, 1.4208], [3.6426, 1.4217], [3.6328, 1.3983],
        [3.6270, 1.3944], [3.5781, 1.4120], [3.5762, 1.4188], [3.5840, 1.4413]]);
    // Source transverse rolled hinge joins the hull tip and fascia upper fold.
    equipment(P, 'hull', 'Detail', cylX(.03125, 2.915, P.q ? 16 : 12).scale(1, 1, .0371 / .03125), .003565, 1.41975, 3.6094);
}
function bowDeckPanels(P: TankBuilderPort): void {
    const pitch = Math.atan2(.27694, .96089), c = Math.cos(pitch), s = Math.sin(pitch);
    const deckY = (z: number) => 1.9667 - (z - 1.8428) * (.5059 / 1.7373);
    // Actual thin upper receiver, with source-width lamp recesses at the nose.
    const deck = sectionSolid([{ z: 1.8428, ring: [[-1.4861, 1.9515], [1.4885, 1.9515], [1.4885, 1.9667], [-1.4861, 1.9667]] },
        { z: 3.3867, ring: [[-1.4861, 1.5023], [1.4885, 1.5023], [1.4885, 1.5175], [-1.4861, 1.5175]] }]);
    equipment(P, 'hull', 'Detail', deck, 0, 0, 0);
    // Nose receiver between lamp cutouts. One-millimetre hidden edge lap seats
    // the port hood across the measured half-millimetre source export seam.
    equipment(P, 'hull', 'Detail', sectionSolid([
        { z: 3.3862, ring: [[-.8720, 1.5038], [1.0610, 1.5038], [1.0610, 1.5177], [-.8720, 1.5177]] },
        { z: 3.5801, ring: [[-.8720, 1.4471], [1.0610, 1.4471], [1.0610, 1.4608], [-.8720, 1.4608]] },
    ]), 0, 0, 0);
    // Starboard source side web physically connects its cover to the hull.
    const tab = new THREE.Shape([new THREE.Vector2(-3.4082, 1.4960), new THREE.Vector2(-3.5723, 1.4481),
        new THREE.Vector2(-3.5723, 1.5682), new THREE.Vector2(-3.4082, 1.5682)]);
    equipment(P, 'hull', 'Detail', new THREE.ExtrudeGeometry(tab, { depth: .0073, bevelEnabled: false, steps: 1 }).rotateY(Math.PI / 2), 1.474765, 0, 0);
    // Chamfered asymmetric service lid: rear notch clears the adjacent deck.
    // A thin lid and actual perimeter skirt retain the recessed underside air.
    const outline: readonly (readonly [
        number,
        number
    ])[] = [[-.7923, 2.4551], [-.7337, 2.4004], [-.4170, 2.3984],
        [-.2322, 2.6230], [.6442, 2.6348], [.6965, 3.1406], [.5983, 3.2344], [-.7923, 3.2344]];
    const lidShape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
    const slope = .2266 / .7793, intercept = 1.8329 + slope * 2.4551;
    const lid = new THREE.ExtrudeGeometry(lidShape, { depth: .012, bevelEnabled: false, steps: 1 }).rotateX(-Math.PI / 2);
    lid.applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, -slope, intercept - .012, 0, 0, 1, 0, 0, 0, 0, 1));
    equipment(P, 'hull', 'Detail', lid, 0, 0, 0);
    for (let i = 0; i < outline.length; i++) {
        const [ax, az] = outline[i], [bx, bz] = outline[(i + 1) % outline.length];
        const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz), x = (ax + bx) / 2, z = (az + bz) / 2;
        const web = new THREE.BoxGeometry(length + .006, .037, .012).rotateY(-Math.atan2(dz, dx));
        web.applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, -slope, 0, 0, 0, 1, 0, 0, 0, 0, 1));
        equipment(P, 'hull', 'Detail', web, x, intercept - slope * z - .0295, z);
    }
    const xs = [-.929555, -.565825, -.202105, .161745, .593965, .957735, 1.321455];
    for (const x of xs)
        for (const [y, z] of [[1.7901885, 2.82828], [1.694423, 3.160651]]) {
            equipment(P, 'hull', 'Detail', new THREE.BoxGeometry(.3524, .1098, .3365), x, y, z, pitch);
            for (const side of [-1, 1])
                for (const offset of (P.q ? [-.08065, -.00315, .07435, .15185] : [-.08065, .15185])) {
                    const localY = -.027;
                    equipment(P, 'hull', 'Detail', new THREE.BoxGeometry(.0278, .175, .0154), x + side * .16135, y + localY * c - offset * s, z + localY * s + offset * c, pitch);
                }
        }
}
function addK21HullSides(P: TankBuilderPort): void {
    for (const side of [-1, 1]) {
        // Source Object_6 is a thin lower hull side, distinct from the higher
        // detachable armor. Ray-measured floor .8672-.0138 = .8534 m. It lies
        // outside the 1.466 m track edge; axle and armor datums stay unchanged.
        equipment(P, 'hull', 'Detail', box(.033, .90, 5.85), side * 1.5535, 1.3034, -.025);
        for (let i = 0; i < 6; i++) {
            const z = -2.18 + i * .94;
            P.addExternalArmor('hull', box(.164, .607, .91), side * 1.652, 1.473, z);
            equipment(P, 'hull', 'Detail', box(.20, .028, .86), side * 1.648, 1.792, z);
            if (P.q)
                for (const dz of [-.39, .39])
                    for (const y of [1.24, 1.70]) {
                        equipment(P, 'hull', 'Detail', box(.012, .022, .031), side * 1.738, y, z + dz);
                    }
        }
        P.addMudguard(`k21-front-${side}`, 'hullRubber', box(.45, .28, .036), side * 1.235, 1.10, 3.29, -.23);
        rearFender(P, side);
        // Source Object_20 rear stowage cases rake with the hull rear wall.
        // Preserve the exposed rear face; extend only the hidden receiver face
        // 12 mm into its actual wall seat (the supplied front clearance is ~9 mm).
        const caseAngle = -Math.atan(.145177), caseDepth = .1193 + .012;
        const caseY = 1.6608 + .006 * Math.sin(-caseAngle), caseZ = -3.7183 + .006 * Math.cos(caseAngle);
        equipment(P, 'hull', 'Detail', box(.302, .392, caseDepth), side * 1.04785, caseY, caseZ, caseAngle);
        for (const z of [-3.27, -2.65, 1.60]) {
            const y = z < 0 ? 1.912 : 2.079;
            equipment(P, 'hull', 'Detail', box(.16, .045, .035), side * 1.35, y, z);
        }
    }
}
function buildK21Hull(P: TankBuilderPort): void {
    // Source Object_6 has a narrow lower tub, a vertical over-track wall and
    // a shallow beveled roof. The old flat 2.075 m rear shoulder filled air.
    // The source export intersects its own upper shoes by 15 mm. A hidden
    // receiving pocket keeps the measured outer wall/tub and clears both native
    // qualities (max moving stock Y 1.249411) by more than 10 mm.
    // Relief: Y 1.2274 -> 1.2700, X .9563..1.474 / -1.472..-.9544.
    const rearRing = [[-.9544, .6053], [.9563, .6053], [.9563, 1.2700],
        [1.474, 1.2700], [1.474, 1.2274], [1.4885, 1.2274], [1.4885, 1.8612], [1.0598, 1.9540],
        [-1.0574, 1.9530], [-1.4861, 1.8612], [-1.4861, 1.2274], [-1.472, 1.2274],
        [-1.472, 1.2700], [-.9544, 1.2700]] as const;
    const between = (a: readonly [
        number,
        number
    ], b: readonly [
        number,
        number
    ], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as const;
    const frontStations = [
        hullStation(.81, .96, 1.62, 1.50, .48, 1.42, 1.995),
        hullStation(1.8389, .9563, 1.4885, 1.4885, .6053, 1.2700, 1.9530),
        hullStation(2.5352, .9563, 1.4885, 1.4885, .6053, 1.2700, 1.7510),
        hullStation(2.5670, .7253, 1.4885, 1.4885, .6459, 1.2700, 1.7418),
        hullStation(2.8672, .7253, 1.4885, 1.4885, .6459, 1.2700, 1.6548),
        hullStation(3.3867, .7253, 1.4885, 1.4885, 1.2274, 1.2700, 1.5038),
        hullStation(3.5879, 1.4861, 1.4885, 1.4885, 1.4328, 1.4450, 1.4471),
    ].map(({ z, ring: r }) => ({ z, ring: [r[0], r[1], r[2], between(r[2], r[3], .45),
            between(r[2], r[3], .75), r[3], between(r[3], r[4], .5), r[4], r[5],
            between(r[5], r[6], .5), r[6], between(r[6], r[7], .25), between(r[6], r[7], .55), r[7]] }));
    const body = sectionSolid([{ z: -3.690, ring: rearRing }, { z: -.98, ring: rearRing }, ...frontStations]);
    // The physical rear wall slopes forward toward its floor. Only vertices
    // on the authored rear section move; this is a scalar construction rule.
    const p = body.attributes.position;
    const rearZ = (y: number) => y <= 1.2274 ?
        -3.498 - (y - .6053) * (.086 / .6221) : y <= 1.8612 ?
        -3.584 - (y - 1.2274) * (.0957 / .6338) :
        -3.6797 - (y - 1.8612) * (.0103 / .0928);
    for (let i = 0; i < p.count; i++)
        if (p.getZ(i) < -3.6899)
            p.setZ(i, rearZ(p.getY(i)));
    body.computeVertexNormals();
    body.computeBoundingBox();
    P.add('hull', body);
    addK21HullSides(P);
    seatedRearRamp(P);
    for (const side of [-1, 1])
        rearLampGuard(P, side);
    frontLampHoods(P);
    frontLampReceivers(P);
    hatch(P, 'hull', -.69, 2.005, .93, .35);
    for (const x of [-1.01, -.69, -.37])
        optic(P, 'hull', x, 2.05, 1.28, .21, .09, .08);
    panel(P, 'hull', .725, 2.022, 1.695, .67, .93, .042, .085, -.13);
    bowTowFittings(P);
    bowFascia(P);
    bowDeckPanels(P);
    // Object_6's actual rear hatch has a low stepped rim and clipped corners.
    panel(P, 'hull', .0012, 1.9545, -3.09475, .9985, .6699, .007, .060);
    panel(P, 'hull', .0012, 1.9696, -3.09475, 1.0254, .6973, .0234, .072);
    equipment(P, 'hull', 'Detail', box(.5669, .0215, .0235), -.0011, 1.99105, -3.47655);
    for (const side of [-1, 1])
        for (const z of [-3.3809, -2.9551]) {
            const x = side < 0 ? -.6170 : .6193;
            equipment(P, 'hull', 'Detail', box(.0889, .012, .1407), x, 1.957, z);
            for (const dz of [-.062, .062])
                equipment(P, 'hull', 'Detail', box(.0889, .134, .014), x, 2.018, z + dz);
            equipment(P, 'hull', 'Detail', box(.0889, .014, .1407), x, 2.0847, z);
        }
}
function buildK21Gear(P: TankBuilderPort): void {
    // owner 2026-09-22 ("standardize our wheels across NATIONS") and 2026-09-23 (round 46: "the K21 uses the BMP-3
    // ROK wheel"): the road-wheel face is the BMP-3 family Dragun rolled-lip construction bmp3_rok draws
    // (WHEEL_STANDARD_EXCEPTIONS, nationWheelSets.ts), fitted by the running-gear builder into this hull's own
    // wheel envelope (tire .242 .. cap .428 around the construction's natural .277 width: axial fit 1.0).
    P.gear = KIT.buildRunningGear(P, {
        style: 'rubber', trackPattern: 'eastern-ifv',
        wheelR: .2990, wheelW: .242, wheelY: .3665,
        wheelZs: [-2.5965, -1.6687, -.7410, .1867, 1.1144, 2.0422],
        xc: 1.228, trackW: .476, trackTh: .030, topY: 1.212, botY: .035,
        sprocket: { z: 2.888, y: .8837, r: .293 },
        idler: { z: -3.216, y: .887, r: .295 },
        rollers: [-1.9045, -.028, 1.8485].map(z => ({ z, y: .9952, r: .128 })),
        rollerR: .128, paintedEnds: true, coveredTop: true, arms: true,
        fitLoadedRun: true, dedupeLoopPoints: true,
        trackShoeBuilder: buildFleetTrackShoe,
        trackShoeDimensions: { padHeight: .036, grouserHeight: .012, webHeight: .018,
            hornHeight: .080, pinRadius: .012, pinCentreY: 0 },
    });
}
function addBasket(P: TankBuilderPort): void {
    // Source Object_32 scalar extents: rails x+-1.034, y2.039..2.479,
    // z-2.447..-1.717 before the registered -13.8 mm floor shift.
    for (const x of [-1.018, -.328, 0, .328, 1.018]) {
        equipment(P, 'turret', 'Detail', box(.032, .424, .032), x, 2.237, -2.431);
        equipment(P, 'turret', 'Detail', box(.032, .032, .73), x, 2.042, -2.082);
    }
    for (const y of [2.133, 2.309, 2.449]) {
        equipment(P, 'turret', 'Detail', box(2.068, .032, .032), 0, y, -2.431);
        for (const x of [-1.018, 1.018])
            equipment(P, 'turret', 'Detail', box(.032, .032, .73), x, y, -2.082);
    }
    // Independently authored rounded bags/rolls from Object_20 envelope study.
    for (const [x, y, z, w, h, d] of [[.602, 2.300, -2.062, .237, .482, .383], [-.601, 2.287, -2.071, .354, .447, .290],
        [.130, 2.477, -2.029, .615, .320, .297], [-.006, 2.252, -2.231, 1.003, .324, .331],
        [-.116, 2.236, -1.905, .439, .319, .437], [.260, 2.247, -1.872, .374, .368, .402]]) {
        const g = new THREE.SphereGeometry(1, P.q ? 14 : 10, P.q ? 10 : 6).scale(w / 2, h / 2, d / 2);
        equipment(P, 'turret', 'Cloth', g, x, y, z);
        equipment(P, 'turret', 'Detail', box(.026, h * .72, d * .82), x, y, z);
    }
}
function addK21Launcher(P: TankBuilderPort): void {
    // Object_32 housing and Object_27/33 closed terminal/tube sections, measured
    // in the immutable source's 20-degree launcher frame. The small finite wall
    // thickness closes the source's one-sided sheet; it is a native fitted value.
    const angle = Math.PI / 9, width = .2335, height = .4110, wall = .008;
    const centerV = 2.8196568, front = .4243, back = -.8886;
    const terminalV = [2.71787735, 2.90094968];
    const face = new THREE.Shape();
    face.moveTo(-width / 2, -height / 2);
    face.lineTo(width / 2, -height / 2);
    face.lineTo(width / 2, height / 2);
    face.lineTo(-width / 2, height / 2);
    face.closePath();
    for (const v of terminalV) {
        const hole = new THREE.Path();
        hole.absarc(-.01195, v - centerV, .0754, 0, Math.PI * 2, true);
        face.holes.push(hole);
    }
    const housing: THREE.BufferGeometry[] = [new THREE.ExtrudeGeometry(face, {
            depth: wall, steps: 1, bevelEnabled: false, curveSegments: P.q ? 12 : 8,
        }).translate(0, 0, front - wall)];
    for (const side of [-1, 1]) {
        housing.push(box(wall, height, front - back).translate(side * (width - wall) / 2, 0, (front + back) / 2));
        housing.push(box(width, wall, front - back).translate(0, side * (height - wall) / 2, (front + back) / 2));
    }
    housing.push(box(width, height, wall).translate(0, 0, back + wall / 2));
    for (const [i, v] of terminalV.entries()) {
        const offset = i * .0012817;
        // Closed convex caps: neither a painted disc nor an invented open bore.
        const section = [[0, back], [.0752, back], [.0752, .31342 + offset],
            [.072, .34462 + offset], [.0627, .36272 + offset], [.0502, .37592 + offset],
            [.0363, .38512 + offset], [.0196, .39102 + offset], [0, .39392255 + offset]];
        // Both qualities retain the source's twelve radial flats and −7.5° phase;
        // adding sectors here changes the finite cap profile between its flats.
        housing.push(new THREE.LatheGeometry(section.map(([r, z]) => new THREE.Vector2(r, z)), 12)
            .rotateX(Math.PI / 2).rotateZ(-Math.PI / 24).translate(-.01195, v - centerV, 0));
    }
    equipment(P, 'turret', 'Detail', KIT.mergeAll(housing), 1.254325, centerV * Math.cos(angle) - .0138, -centerV * Math.sin(angle), -angle);
    // Existing finite receiver joins the measured housing to the turret shoulder.
    equipment(P, 'turret', 'Detail', box(.20, .30, .35), 1.10, 2.30, -1.21);
}
function buildK21Turret(P: TankBuilderPort): void {
    P.add('turret', cylY(.93, 1.00, .15, P.q ? 36 : 20), 0, .045, 0);
    P.add('turret', sectionSolid([
        turretStation(P, -1.91, .91, 1.16, .91, 2.00, 2.37, 2.59),
        turretStation(P, -1.26, 1.12, 1.28, .94, 1.96, 2.41, 2.606),
        turretStation(P, -.41, .94, 1.18, .82, 1.98, 2.40, 2.606),
        turretStation(P, .46, .68, .87, .42, 2.02, 2.35, 2.54),
        turretStation(P, .79, .42, .53, .31, 2.07, 2.32, 2.48),
    ]));
    for (const side of [-1, 1])
        smokeBank(P, side, .76, 2.24, .47, 4, .145);
    for (const [x, z] of [[-.49, -.82], [.43, -1.00]]) {
        panel(P, 'turret', x, 2.631, z, .64, .62, .050, .10);
        for (const d of [-.19, .19])
            equipment(P, 'turret', 'Detail', cylX(.023, .11, 12), x + d, 2.669, z - .295);
    }
    // Source sight envelopes are asymmetric, with a sloped left hood and a
    // rounded right optical head. Both sit on their own finite roof mounts.
    equipment(P, 'turret', 'Detail', sectionSolid([
        { z: -.22, ring: [[-.254, 0], [.254, 0], [.20, .3115], [-.20, .3115]] },
        { z: .13, ring: [[-.254, 0], [.254, 0], [.16, .28], [-.16, .28]] },
        { z: .22, ring: [[-.254, 0], [.254, 0], [.16, .23], [-.16, .23]] },
    ]), -.642, 2.607, -.34);
    optic(P, 'turret', -.642, 2.760, -.123, .32, .115, .058);
    // Measured cap/neck/collar profile, with the receiving roof lowered to
    // Object_22's actual 2.606 m datum so the narrow neck is visible.
    const sightProfile = [[0, 0], [.153, 0], [.150, .035], [.132, .075],
        [.159, .115], [.186, .175], [.201, .275], [.197, .375], [.165, .420], [0, .428]];
    equipment(P, 'turret', 'Detail', new THREE.LatheGeometry(sightProfile.map(([r, y]) => new THREE.Vector2(r, y)), P.q ? 28 : 16), .711, 2.6112, -.166);
    optic(P, 'turret', .711, 2.906, -.009, .18, .125, .075);
    for (const x of [-.797, -.667, -.537]) {
        equipment(P, 'turret', 'Detail', box(.120, .066, .060), x, 2.666, -.126);
        equipment(P, 'turret', 'Glass', box(.095, .034, .010), x, 2.671, -.092);
    }
    for (const side of [-1, 1]) {
        equipment(P, 'turret', 'Detail', sectionSolid([
            { z: -.138, ring: [[-.158, 0], [.158, 0], [.158, .085], [-.158, .085]] },
            { z: .138, ring: [[-.158, 0], [.158, 0], [.158, .140], [-.158, .140]] },
        ]), side * .812, 2.383, .308);
        equipment(P, 'turret', 'Detail', box(.335, .020, .292), side * .812, 2.390, .308);
        for (const z of [.206, .410])
            equipment(P, 'turret', 'Detail', cylX(.018, .040, 10), side * .975, 2.470, z);
        equipment(P, 'turret', 'Detail', box(.080, .135, .065), side * .94, 2.445, .195);
    }
    optic(P, 'turret', -.10, 2.60, .61, .25, .15, .30);
    // Object_14 collars start in the rear roof shoulder at 2.50638 m;
    // Object_21 whips begin at their narrow 2.673 m terminal, not above a gap.
    for (const [x, tip] of [[-.883495, 4.17597], [.884605, 4.17628]]) {
        equipment(P, 'turret', 'Detail', new THREE.LatheGeometry([
            [0, 0], [.059, 0], [.0681, .0384], [.0681, .0627], [.0337, .066],
            [.02955, .1436], [.01465, .1704], [0, .1704],
        ].map(([r, y]) => new THREE.Vector2(r, y)), P.q ? 16 : 10), x, 2.50638, -1.61571);
        const bottom = 2.6728;
        equipment(P, 'turret', 'Dark', cylY(.0058, .0126, tip - bottom, P.q ? 8 : 6), x, (bottom + tip) / 2, -1.61599);
    }
    addBasket(P);
    weaponAssembly(P, () => addK21Launcher(P));
    P.addGunExtra(KIT.xform(box(.34, .37, .53), 0, .06, .05, -.06));
    barrel(P, 2.391, .036, .63, undefined, .020);
    openGunTube(P, 2.391, 2.601, .045, .096, .020, .11);
}
export function buildK21X(P: TankBuilderPort): void {
    // Measured fixed armor extends the shadow silhouette; omit small fittings.
    P.additionalShadowSources = {
        hull: ['hullExternalArmor'],
    };
    const frame = EASTERN_SOURCE_STUDIES.k21_x.frame;
    P.hullG.position.set(0, 0, 0);
    P.turretG.position.set(...frame.turret);
    P.gunG.position.set(0, frame.gun[1] - frame.turret[1], frame.gun[2] - frame.turret[2]);
    buildK21Hull(P);
    buildK21Gear(P);
    buildK21Turret(P);
    P.topY = 3.057 - frame.turret[1];
    preserveSourceStudyGunMountAppearance(P);
    P.hullG.userData.xRebuild = { candidate: 'k21_x', independent: true, sourceLocalOnly: true };
}
export const K21_X_PROFILE = { k21_x: { build: buildK21X } };
