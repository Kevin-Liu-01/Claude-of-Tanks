import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { weaponAssembly } from './weaponStock.ts';
import { reserveDecorVolume } from './fieldChest.ts';
// First-party source-measured Kurganets-25 Epokha turret. Coordinates are
// relative to its measured ring. No hull or running gear is built here.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { openTube } from './europeSourcePrimitives.ts';
const { box, cylX, cylY, cylZ } = KIT;
function localTurret(P: TankBuilderPort, bucket: string, geometry: THREE.BufferGeometry, worldX: number, worldY: number, worldZ: number, rx = 0, ry = 0, rz = 0): void {
    const pivot = { x: 0, y: 2.21, z: -1.27 };
    P.addEquipment(bucket, geometry, worldX - pivot.x, worldY - pivot.y, worldZ - pivot.z, rx, ry, rz);
}
function addKurganetsSmokeCases(P: TankBuilderPort, side: number): void {
    // Object_29's two paired smoke cases sit beneath the forward canister,
    // with a formed receiving tray. The former diagonal row stood in air.
    const handed = side < 0 ? 1 : -1;
    const pairs = side < 0 ? [
        [[-.964395, 2.676650, -.141980], [-1.065745, 2.681700, -.101430]],
        [[-1.409495, 2.678000, -.443980], [-1.512045, 2.677500, -.453230]],
    ] : [
        [[.959405, 2.676650, -.141980], [1.060755, 2.681700, -.101430]],
        [[1.404955, 2.678000, -.443980], [1.506505, 2.677500, -.453230]],
    ];
    for (const [i, mouths] of pairs.entries()) {
        const axis = new THREE.Vector3(handed * (i === 0 ? .371 : -.084), .136, i === 0 ? .924 : .988).normalize();
        const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
        const length = i === 0 ? .381 : .369, radius = i === 0 ? .0417 : .0391;
        const center = new THREE.Vector3(...mouths[0]).add(new THREE.Vector3(...mouths[1])).multiplyScalar(.5).addScaledVector(axis, -length / 2);
        const housing = box(.218, .108, length).applyQuaternion(rotation);
        // 2026-10-19 (owner float sweep): the forward pair stood 95 mm inboard of its tray; each pair is seated on it.
        P.snapGroup('kurganets-smoke-case', () => {
            localTurret(P, 'turretDetail', housing, center.x, center.y, center.z);
            for (const mouth of mouths) {
                const cap = markSmokeTube(cylZ(radius, .019, P.q ? 20 : 12)).applyQuaternion(rotation);
                localTurret(P, 'turretDark', cap, mouth[0], mouth[1], mouth[2]);
            }
        }, { reachM: .10 });
    }
}
function addKurganetsCanisterCarrier(P: TankBuilderPort, side: number, handed: number): void {
    // Source receiving stock is thin folded steel, leaving the air below.
    localTurret(P, 'turretDetail', box(.270, .012, .307), side * 1.148, 2.710, -.464, -.110, handed * .380);
    for (const edge of [-1, 1]) {
        const x = side * 1.148 + edge * .127 * Math.cos(.380);
        const z = -.464 - edge * .127 * Math.sin(handed * .380);
        localTurret(P, 'turretDetail', box(.012, .123, .307), x, 2.650, z, -.110, handed * .380);
    }
    const a = new THREE.Vector3(side * 1.1669, 2.704, -.766);
    const b = new THREE.Vector3(side * 1.1263, 2.690, -.6385);
    const link = b.clone().sub(a), center = a.clone().add(b).multiplyScalar(.5);
    const strap = box(.014, .067, link.length() + .015).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), link.normalize()));
    localTurret(P, 'turretDetail', strap, center.x, center.y, center.z);
    localTurret(P, 'turretDetail', box(side < 0 ? .5205 : .5068, .1711, .1668), side * (side < 0 ? 1.33775 : 1.33900), 2.6847, side < 0 ? -.91773 : -.88338);
    localTurret(P, 'turretDetail', box(.050, .0577, .3017), side * 1.4549, 2.6343, -.9340);
    // The rear carrier crossmember meets the turret shoulder through its
    // measured narrow foot; it also seats the canister above the smoke bank.
    localTurret(P, 'turretDetail', box(side < 0 ? .0879 : .0694, .1726, .0924), side * (side < 0 ? 1.10774 : 1.11150), 2.65665, -1.37653);
    localTurret(P, 'turretDetail', box(.4248, .2287, .0892), side * (side < 0 ? 1.35630 : 1.35070), 2.6906, -1.37463);
}
function addKurganetsTurretSides(P: TankBuilderPort): void {
    for (const side of [-1, 1]) {
        // Two Kornet canisters on each flank; thin protective housing keeps the
        // visible round tube mouths and the air below the launch rails.
        weaponAssembly(P, () => {
          localTurret(P, 'turretDetail', box(.407, .244, 1.263), side * 1.377, 2.859, -1.346);
          for (const x of [1.281, 1.474]) {
              localTurret(P, 'turretDark', cylZ(.089, .02, P.q ? 18 : 10), side * x, 2.869, -.708);
          }
        });
        addKurganetsSmokeCases(P, side);
        const handed = side < 0 ? 1 : -1;
        weaponAssembly(P, () => addKurganetsCanisterCarrier(P, side, handed));
        localTurret(P, 'turretDetail', box(.32, .12, .40), side * .69, 3.12, -1.96);
        localTurret(P, 'turretGlass', box(.20, .075, .018), side * .69, 3.135, -1.75);
    }
}
function clipKurganetsOpticPlan(plan: THREE.Vector2[], front: boolean, creaseZ: number): THREE.Vector2[] {
    const contour: THREE.Vector2[] = [];
    for (let i = 0; i < plan.length; i++) {
        const a = plan[i], b = plan[(i + 1) % plan.length];
        const insideA = front ? -a.y >= creaseZ : -a.y <= creaseZ;
        const insideB = front ? -b.y >= creaseZ : -b.y <= creaseZ;
        if (insideA)
            contour.push(a.clone());
        if (insideA !== insideB) {
            const t = (-creaseZ - a.y) / (b.y - a.y);
            contour.push(new THREE.Vector2(a.x + t * (b.x - a.x), -creaseZ));
        }
    }
    return contour;
}
function addKurganetsOpticalCase(P: TankBuilderPort): void {
    // Two source-measured receiver steps support a rounded optical case.
    localTurret(P, 'turretDetail', cylY(.2885, .2885, .0503, P.q ? 40 : 24), -.554545, 3.01710, -.90073);
    localTurret(P, 'turretDetail', cylY(.267, .267, .0498, P.q ? 40 : 24), -.553345, 3.05395, -.90063);
    const opticCenterX = -.553545, opticCenterZ = -.9006;
    const radius = .2275, faceHalfWidth = .1838, frontZ = -.71473;
    const joinAngle = Math.acos(faceHalfWidth / radius);
    const outline = new THREE.Shape();
    outline.moveTo(faceHalfWidth, -frontZ);
    outline.lineTo(-faceHalfWidth, -frontZ);
    // An analytic circular back joins the narrower flat front. No source
    // polygon/vertex trace is embedded in this authored primitive.
    const segments = P.q ? 24 : 16;
    for (let i = 0; i <= segments; i++) {
        const angle = Math.PI - joinAngle + (Math.PI + 2 * joinAngle) * i / segments;
        outline.lineTo(radius * Math.cos(angle), -(opticCenterZ + radius * Math.sin(angle)));
    }
    outline.closePath();
    // Split the authored plan at the crown crease before capping. Bending a
    // triangulated whole lid would interpolate across the crease and cave in
    // the otherwise flat rear half of the roof.
    const creaseZ = -.85 - (3.31175 - 3.306087) / .4471;
    const plan = outline.getPoints().slice(0, -1);
    for (const front of [false, true]) {
        const contour = clipKurganetsOpticPlan(plan, front, creaseZ);
        const caseGeometry = new THREE.ExtrudeGeometry(new THREE.Shape(contour), { depth: 1, steps: 1, bevelEnabled: false, curveSegments: 1 });
        const vertices = caseGeometry.getAttribute('position');
        for (let i = 0; i < vertices.count; i++) {
            const z = -vertices.getY(i);
            const roof = front ? 3.306087 - .4471 * (z + .85) : 3.31175;
            vertices.setXYZ(i, vertices.getX(i) + opticCenterX, 3.06375 + vertices.getZ(i) * (roof - 3.06375), z);
        }
        caseGeometry.computeVertexNormals();
        localTurret(P, 'turretDetail', caseGeometry, 0, 0, 0);
    }
}
function addKurganetsTurret(P: TankBuilderPort): void {
    const pivot = { x: 0, y: 2.21, z: -1.27 };
    const local = (z: number, half: number, roofHalf: number, low: number, roof: number): SolidSection => ({
        z: z - pivot.z,
        ring: [
            [-half * .88, low - pivot.y], [half * .88, low - pivot.y],
            [half, low + .18 - pivot.y], [roofHalf, roof - pivot.y],
            [-roofHalf, roof - pivot.y], [-half, low + .18 - pivot.y],
        ],
    });
    const rear = [
        local(-2.96, 1.06, .91, 2.58, 2.96),
        local(-2.50, 1.13, 1.02, 2.49, 3.07),
        local(-1.75, 1.13, .98, 2.45, 3.07),
        local(-1.20, 1.06058, .83049, 2.45, 3.04864),
    ];
    // The approved source has an open-topped receiver recess with a solid
    // floor at 2.71465 m. Lofting a roof straight across it buried the gun.
    // Keep the side cheeks and close the channel walls/floor in the hit shell.
    const nose = [
        rear[rear.length - 1],
        local(-.72, 1.00, .70, 2.45, 3.03),
        local(-.20, .64, .39, 2.53, 2.89),
    ].map(section => ({ z: section.z, ring: [
        ...section.ring.slice(0, 4),
        [.24, section.ring[3][1]], [.24, 2.71465 - pivot.y],
        [-.24, 2.71465 - pivot.y], [-.24, section.ring[3][1]],
        ...section.ring.slice(4),
    ] as const }));
    const joinZ = rear[rear.length - 1].z;
    const openJoin = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => {
        const p = geometry.getAttribute('position'), indices: number[] = [];
        for (let i = 0; i < p.count; i += 3) {
            if ([0, 1, 2].every(k => Math.abs(p.getZ(i + k) - joinZ) < 1e-6)) continue;
            indices.push(i, i + 1, i + 2);
        }
        geometry.setIndex(indices);
        return geometry;
    };
    // The lofts meet without doubled internal caps; only the exposed rear
    // wall of the recess remains at the join.
    P.add('turret', openJoin(sectionSolid(rear)));
    P.add('turret', openJoin(sectionSolid(nose)));
    const recessHeight = 3.04864 - 2.71465;
    P.add('turret', new THREE.PlaneGeometry(.48, recessHeight), 0,
        2.71465 - pivot.y + recessHeight / 2, joinZ);
    // Owner markup 2026-10-14 on the bare drum flank under the module (critic panel 10-15: dressing the drum did not
    // answer the mark): the module's base is the faceted armoured collar the Epokha stands on, eight sloped plates round
    // the ring (narrower at the top), their welded corner seams, and the splash-guard lip at its foot. Same height and
    // footprint as the old drum.
    const collar = cylY(.97, 1.06, .25, 8);
    collar.rotateY(Math.PI / 8);
    P.add('turret', collar, 0, .17, 0);
    P.add('turret', cylY(1.075, 1.09, .035, 8).rotateY(Math.PI / 8), 0, .0625, 0);
    for (let i = 0; i < 8; i++) {
        // the corners lie at pi/8 + i pi/4 (the collar's eight corners, turned an eighth); each seam leans inward along
        // its sloped edge (radius 1.06 at the foot to 0.97 at the top: 0.35 rad)
        const a = Math.PI / 8 + i / 8 * Math.PI * 2;
        // (in the turret's own paint: a dark bucket reaching this low would lower the turret's skirt line the decor's
        // sweep guard reads over the whole bustle, and push the hull's rear loads off their rack)
        P.add('turret', box(.022, .26, .022), Math.sin(a) * 1.017, .173, Math.cos(a) * 1.017, -Math.cos(a) * .35, 0, Math.sin(a) * .35);
    }
    addKurganetsTurretSides(P);
    addKurganetsOpticalCase(P);
    // The source's first visible face is a continuous cover in front of the
    // internal ports. Retain closed stock rather than inventing exposed holes.
    localTurret(P, 'turretDetail', box(.55, .35, .43), .06, 2.96, -1.28);
    localTurret(P, 'turretGlass', box(.42, .17, .018), .06, 3.04, -1.055);
    addKurganetsRoofMasts(P);
    localTurret(P, 'turretDetail', box(.729, .055, 1.28), -.648, 3.126, -2.040);
    localTurret(P, 'turretDetail', box(.443, .022, .651), .033, 3.15, -1.917);
    localTurret(P, 'turretDetail', cylY(.20, .20, .07, 24), .577, 3.114, -1.433);
    addKurganetsBulatLauncher(P);
}
/**
 * The rear-roof launcher of the eight Bulat missiles (suppliedSourceFleetSpecs.ts applyKurganetsLaunchers: shell slot 2,
 * eight tubes; fleetLauncherMuzzles.ts fires from these mouths). Owner ruling 2026-10-15 ("keep the missiles and
 * kurganets launcher on it. dont remove. just make it properly attached"): the source's bundle of bare tubes on two
 * thin legs read as loose junk. It is one closed armoured launch container (the tubes inside it, two rows, 3 over 5)
 * mounted like equipment: a solid cradle on a base plate bolted to the roof armour (the plate follows the roof's
 * 13.4-degree fall to the rear edge), side brackets bolted to the container, the firing cable in a conduit to a
 * junction box on the roof; eight rimmed mouths at the measured exits. Fixed to the turret (it traverses with it).
 * Same footprint and reach as the bundle (x 0.41-0.97, rear face z -3.30). Turret roof: flat at y 3.07 from z -2.50
 * forward, falling to 2.96 at the rear edge z -2.96.
 */
function addKurganetsBulatLauncher(P: TankBuilderPort): void {
    const roofAt = (z: number): number => z >= -2.50 ? 3.07 : 2.96 + .11 * (z + 2.96) / .46;
    const fall = -Math.atan2(.11, .46), sf = Math.sin(fall), cf = Math.cos(fall);
    weaponAssembly(P, () => {
        // the container: walls round the tubes, its floor at y 3.235, the front face just behind the tube exits
        localTurret(P, 'turretDetail', box(.557, .29, .881), .688, 3.38, -2.8605);
        // side stiffeners and the lid's seam
        for (const x of [.4065, .9695]) for (const y of [3.30, 3.46]) localTurret(P, 'turretDetail', box(.012, .028, .82), x, y, -2.86);
        localTurret(P, 'turretDark', box(.53, .008, .86), .688, 3.528, -2.8605);
        // the eight mouths: a rim and a dark recessed seal per tube, at the measured exits (row 3.291: three; 3.463: five)
        for (const [y, xs] of [[3.291, [.526, .628, .732]], [3.463, [.479, .580, .686, .789, .893]]] as const) {
            for (const x of xs) {
                localTurret(P, 'turretDetail', cylZ(.049, .008, P.q ? 16 : 8), x, y, -2.418);
                localTurret(P, 'turretDark', cylZ(.040, .010, P.q ? 16 : 8), x, y, -2.4205);
            }
        }
        // lifting lugs on the lid
        for (const x of [.52, .856]) localTurret(P, 'turretDark', box(.04, .03, .06), x, 3.54, -2.86);
    });
    // the mount: one cradle the container's length from the roof armour to its floor, its underside following the roof
    // (flat to z -2.50, then the fall to the rear edge), 1.5 cm into the roof and 5 mm into the container floor, so the
    // launcher stands on solid steel with no air under it; side brackets bolted to the container over the cradle
    const ring = (z: number) => {
        const low = roofAt(z) - .015 - 2.21, top = 3.24 - 2.21;
        return { z: z + 1.27, ring: [[.43, low], [.946, low], [.946, top], [.43, top]] as const };
    };
    P.addEquipment('turretDetail', sectionSolid([ring(-2.93), ring(-2.50), ring(-2.40)]), 0, 0, 0);
    for (const x of [.4095 - .006, .9665 + .006]) for (const z of [-2.46, -2.86]) {
        localTurret(P, 'turretDetail', box(.012, .11, .14), x, 3.235, z);                                  // bracket
        for (const dz of [-1, 1]) localTurret(P, 'turretDark', cylX(.011, .012, 8), x + Math.sign(x - .688) * .009, 3.26, z + dz * .042);
    }
    // the base plate under the cradle, bolted down along both sides: the front part on the flat roof, the rear part
    // along the roof's fall
    const plate = (z: number, depth: number, sloped: boolean): void => {
        const y = roofAt(z) + .008 / (sloped ? cf : 1);
        localTurret(P, 'turretDetail', box(.60, .016, depth), .688, y, z, sloped ? fall : 0);
        for (const dx of [-.28, .28]) for (const f of [-.35, 0, .35]) {
            const dz = f * depth, lz = sloped ? dz * cf : dz, ly = sloped ? -dz * sf : 0;
            localTurret(P, 'turretDark', cylY(.013, .013, .012, 8), .688 + dx, y + .012 + ly, z + lz, sloped ? fall : 0);
        }
    };
    plate(-2.45, .10, false);
    plate(-2.72, .44, true);
    // the container's rear 0.34 m reaches past the turret's rear edge (z -2.96, as the source bundle did): two struts
    // carry it from a bracket under its floor to plates bolted on the turret's rear wall
    const strut = Math.hypot(.285, .435), lean = Math.atan2(.435, .285);
    for (const x of [.47, .91]) {
        localTurret(P, 'turretDetail', box(.06, .02, .08), x, 3.225, -3.25);                                   // floor bracket
        localTurret(P, 'turretDetail', box(.04, .04, strut), x, 3.0175, -3.1075, lean);                        // strut
        localTurret(P, 'turretDetail', box(.10, .08, .012), x, 2.80, -2.966);                                  // wall plate
        for (const y of [2.775, 2.825]) localTurret(P, 'turretDark', cylZ(.011, .012, 8), x, y, -2.974);
    }
    // the firing cable: a conduit from the container's floor down the cradle's side to a junction box on the roof
    localTurret(P, 'turretDark', cylY(.012, .012, 3.24 - roofAt(-2.72) + .01, 8), .96, (3.24 + roofAt(-2.72)) / 2, -2.72);
    localTurret(P, 'turretDetail', box(.07, .045, .08), .985, roofAt(-2.72) + .012, -2.72, fall);
    // a launcher is no shelf: the decor keeps its loads off the container and clear above its lid (turret frame;
    // fieldChest.ts reserveDecorVolume, scaled with the vehicle)
    reserveDecorVolume(P.turretG, [.4095, 2.955 - 2.21, -3.301 + 1.27], [.9665, 3.80 - 2.21, -2.36 + 1.27]);
}
// Object_29 has four different stepped fittings, not a symmetric pair of
// generic whips. These independent axial calipers preserve their real stations.
function addKurganetsRoofMasts(P: TankBuilderPort): void {
    const mast = (x: number, z: number, sections: readonly (readonly [
        number,
        number
    ])[]): void => {
        const points = sections.map(([y, r]) => new THREE.Vector2(r, y));
        localTurret(P, 'turretDetail', new THREE.LatheGeometry(points, P.q ? 20 : 12), x, 0, z);
    };
    // The rear middle fitting sits on the source's raised central roof step.
    localTurret(P, 'turret', box(.5846, .14385, 1.1062), .0506, 3.071925, -2.21733);
    localTurret(P, 'turretDetail', box(.1735, .0234, .1055), -.019845, 3.14335, -2.66298);
    // The port rear fitting has a short folded receiver over the sloping roof.
    localTurret(P, 'turretDetail', box(.1973, .0742, .0547), -.654145, 3.01735, -2.76358);
    localTurret(P, 'turretDetail', box(.12261, .064, .1123), -.646095, 3.03125, -2.84708);
    mast(-.019845, -2.66298, [
        [3.15215, 0], [3.15215, .0409], [3.56375, .0409],
        [3.57155, .0500], [3.59015, .0500], [3.59895, .0409],
        [3.74145, .0409], [3.75025, .0295], [3.79515, .0295],
        [3.80305, .0409], [3.91045, .0409], [3.92415, .0333],
        [3.93385, .0207], [3.93775, 0],
    ]);
    mast(-.638995, -2.84023, [
        [3.06035, 0], [3.06035, .0405], [3.15945, .0405],
        [3.15945, .0620], [3.21465, .0620], [3.21465, .0371],
        [3.26985, .0371], [3.26985, .0454], [3.27375, .0454],
        [3.32055, .0278], [3.48365, .0278], [3.48365, .0156],
        [3.49635, .0156], [3.49635, .0220], [3.76195, .0220],
        [3.79225, .0303], [3.83715, .0303], [3.84985, .0186],
        [4.10285, .0186], [4.10965, .0156], [4.11355, .0103], [4.11555, 0],
    ]);
    mast(-.783995, -1.23913, [
        [3.01495, 0], [3.01495, .0613], [3.01835, .0613],
        [3.02375, .0310], [3.03445, .01605], [3.13405, .01605],
        [3.17655, .0231], [3.19705, .0231], [3.23955, .01605],
        [4.12335, .01605], [4.13305, .0190], [4.14385, .0190],
        [4.15355, .0159], [4.16145, .0104], [4.17415, 0],
    ]);
    mast(-.292545, -1.22183, [
        [3.02025, 0], [3.02025, .04175], [3.21705, .04175],
        [3.21705, .05085], [3.22735, .05085], [3.22735, .03145],
        [3.52275, .03145], [3.59795, .0865], [3.62525, .0865], [3.62525, 0],
    ]);
    localTurret(P, 'turretDetail', box(.022, .0742, .0377), -.292545, 3.66235, -1.22183);
}
function addKurganetsGun(P: TankBuilderPort): void {
    const gunLength = 2.45;
    // Source Object_31: .2366 m receiver, raised .2694 m cover and a
    // .1037 m collar round the cannon. Analytic closed stock, with the
    // mantlet pitching independently of the recoiling barrel.
    P.addGunExtra(sectionSolid([
        { z: -.429, ring: [[-.1183,-.0782],[.1183,-.0782],[.1183,.052],[.09,.082],[-.09,.082],[-.1183,.052]] },
        { z: .025, ring: [[-.1183,-.0782],[.1183,-.0782],[.1183,.052],[.09,.082],[-.09,.082],[-.1183,.052]] },
        { z: .18, ring: [[-.066,-.065],[.066,-.065],[.066,.04],[.048,.067],[-.048,.067],[-.066,.04]] },
    ]));
    P.addGunExtra(box(.2694, .0771, .2466), .0083, .12085, -.0902);
    // Trunnions engage the cheeks across the recess, with feet seated in its
    // floor. No detached cover or floating bearing at legal elevations.
    P.addGunExtra(cylX(.105, .52, P.q ? 24 : 14), 0, 0, 0);
    for (const side of [-1, 1]) {
        localTurret(P, 'turretDetail', box(.07, .30, .23), -.004 + side * .25, 2.85465, -.68);
    }
    // Owner-requested larger cannon package: a long exposed tube and a
    // substantial stepped recoil jacket. Coordinator ruling 2026-10-15: the
    // module is the Bumerang-BM, so the cannon is its 30 mm 2A42 (one real
    // configuration, no 57 mm): the 2.45 m exposed barrel is the 2A42's
    // slim tube with a 30 mm bore beyond the jacket.
    openTube(P, .05, .08, gunLength, .015);
    P.add('gun', cylZ(.105, .46, P.q ? 28 : 16), 0, 0, .35);
    P.add('gun', cylZ(.078, .92, P.q ? 28 : 16, .092), 0, 0, 1.02);
    for (const z of [.18,.55,1.48])
        P.add('gun', cylZ(z < .6 ? .112 : .083, .045, P.q ? 28 : 16),0,0,z);
    // The source has a small offset coaxial receiver/barrel on the right.
    // It follows gun pitch, independently of the main cannon's recoil.
    P.addGunExtraDark(box(.179, .205, .563), .956, .022, -.619);
    P.addGunExtraDark(cylZ(.0188, .619, P.q ? 16 : 9), .951, .034, -.071);
    P.addGunExtra(box(.17, .18, .48), .956, .03, -.143);
    P.muzzleZ = gunLength;
}
export function buildEpokhaTurret(P: TankBuilderPort): void {
    P.gunG.position.set(-.004, .707, .59);
    addKurganetsTurret(P);
    addKurganetsGun(P);
    P.topY = 1.81;
}
