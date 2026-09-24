import { weaponAssembly } from './weaponStock.ts';
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
        localTurret(P, 'turretDetail', housing, center.x, center.y, center.z);
        for (const mouth of mouths) {
            const cap = cylZ(radius, .019, P.q ? 20 : 12).applyQuaternion(rotation);
            localTurret(P, 'turretDark', cap, mouth[0], mouth[1], mouth[2]);
        }
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
    P.add('turret', cylY(1.01, 1.01, .25, P.q ? 36 : 20), 0, .17, 0);
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
    // Source's raised rear rack sits on two braced feet rather than a floating
    // crossbar. Its eight small launch tubes remain distinct in both LODs.
    weaponAssembly(P, () => {
      for (const x of [.44, .92]) {
          localTurret(P, 'turretDetail', box(.04, .27, .38), x, 3.14, -2.56);
      }
      for (const [y, xs] of [[3.291, [.526, .628, .732]], [3.463, [.479, .580, .686, .789, .893]]] as const) {
          for (const x of xs) {
              localTurret(P, 'turretDetail', cylZ(.046, .827, P.q ? 16 : 8), x, y, -2.821);
              localTurret(P, 'turretDark', cylZ(.035, .015, P.q ? 12 : 8), x, y, -3.24);
          }
      }
      for (const z of [-3.208, -2.429]) {
          localTurret(P, 'turretDetail', box(.557, .045, .186), .688, 3.59, z);
      }
    });
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
    const gunLength = 1.537;
    // Source Object_31: .2366 m receiver, raised .2694 m cover and a
    // .1037 m collar around the compact 57 mm tube. Analytic closed stock,
    // with the mantlet pitching independently of the recoiling barrel.
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
    openTube(P, .0395, .08, gunLength, .0285);
    P.add('gun', cylZ(.052, .25, P.q ? 24 : 12), 0, 0, .30);
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
