// Garage-only armored workshop LODs. These are independently authored,
// low-poly reductions of the fleet's Abrams, T-90M and Leclerc design
// language. They never import or retain playable vehicle builders/scene graphs.
import * as THREE from 'three';

const PART_KINDS = Object.freeze([
  'abrams_assembly', 't90_assembly', 'leclerc_assembly',
  'abrams_turret_cradle', 't90_turret_cradle', 'leclerc_turret_cradle',
  'powerpack', 'armor_rack', 'weapon_rack',
] as const);
export { PART_KINDS as WORKSHOP_PART_KINDS };

export type WorkshopPartKind = (typeof PART_KINDS)[number];
type WorkshopScale = number | readonly [number, number, number];
type WorkshopTransform = readonly [
  x: number, y: number, z: number,
  rotationX?: number, rotationY?: number, rotationZ?: number,
  scale?: WorkshopScale,
];

export interface WorkshopEngineContext {
  setupShadowMaterial?(material: THREE.Material): void;
}

export interface WorkshopAssemblyOptions { name?: string }

type FamilyKey = 'abrams' | 't90' | 'leclerc';
interface FamilyProfile {
  id: string;
  label: string;
  material: 'nato' | 'eastern' | 'french';
  wheels: number;
  wheelRadius: number;
  wheelSpan: number;
  hullPlan: readonly (readonly [number, number])[];
  upperPlan: readonly (readonly [number, number])[];
  turretPlan: readonly (readonly [number, number])[];
  hullBottom: number;
  hullTop: number;
  upperBottom: number;
  upperTop: number;
  turretBottom: number;
  turretTop: number;
  gunY: number;
  gunRootZ: number;
  barrelLength: number;
  barrelRadius: number;
}

// +Z is forward, matching the playable fleet. Plan corners intentionally keep
// each vehicle's characteristic silhouette rather than sharing one tank blob.
export const WORKSHOP_FAMILY_PROFILES: Readonly<Record<FamilyKey, FamilyProfile>> = Object.freeze({
  abrams: Object.freeze<FamilyProfile>({
    id: 'm1a2', label: 'M1A2 Abrams', material: 'nato', wheels: 7,
    wheelRadius: 0.42, wheelSpan: 5.25,
    hullPlan: [[-1.82, 3.55], [1.82, 3.55], [1.76, 2.25], [1.72, -3.62], [-1.72, -3.62], [-1.76, 2.25]],
    upperPlan: [[-1.58, 3.08], [1.58, 3.08], [1.55, 1.65], [1.48, -2.85], [-1.48, -2.85], [-1.55, 1.65]],
    turretPlan: [[-0.58, 1.72], [0.58, 1.72], [1.57, 0.72], [1.55, -1.72], [1.30, -2.20], [-1.30, -2.20], [-1.55, -1.72], [-1.57, 0.72]],
    hullBottom: 0.55, hullTop: 1.27, upperBottom: 1.17, upperTop: 1.77,
    turretBottom: 1.75, turretTop: 2.72, gunY: 2.23, gunRootZ: 1.42,
    barrelLength: 4.35, barrelRadius: 0.115,
  }),
  t90: Object.freeze<FamilyProfile>({
    id: 't90m', label: 'T-90M', material: 'eastern', wheels: 6,
    wheelRadius: 0.46, wheelSpan: 4.62,
    hullPlan: [[-1.53, 3.38], [1.53, 3.38], [1.70, 2.05], [1.62, -3.12], [-1.62, -3.12], [-1.70, 2.05]],
    upperPlan: [[-1.42, 2.92], [1.42, 2.92], [1.45, 1.48], [1.34, -2.48], [-1.34, -2.48], [-1.45, 1.48]],
    turretPlan: [[-0.50, 1.54], [0.50, 1.54], [1.30, 0.70], [1.38, -0.82], [1.12, -1.68], [-1.12, -1.68], [-1.38, -0.82], [-1.30, 0.70]],
    hullBottom: 0.52, hullTop: 1.18, upperBottom: 1.08, upperTop: 1.62,
    turretBottom: 1.60, turretTop: 2.48, gunY: 2.02, gunRootZ: 1.34,
    barrelLength: 4.55, barrelRadius: 0.105,
  }),
  leclerc: Object.freeze<FamilyProfile>({
    id: 'leclerc', label: 'Leclerc S2', material: 'french', wheels: 6,
    wheelRadius: 0.43, wheelSpan: 4.80,
    hullPlan: [[-1.48, 3.45], [1.48, 3.45], [1.73, 2.02], [1.65, -3.28], [-1.65, -3.28], [-1.73, 2.02]],
    upperPlan: [[-1.25, 3.00], [1.25, 3.00], [1.48, 1.18], [1.40, -2.62], [-1.40, -2.62], [-1.48, 1.18]],
    turretPlan: [[-0.34, 1.67], [0.34, 1.67], [1.34, 0.62], [1.43, -1.42], [1.20, -2.24], [-1.20, -2.24], [-1.43, -1.42], [-1.34, 0.62]],
    hullBottom: 0.54, hullTop: 1.22, upperBottom: 1.12, upperTop: 1.68,
    turretBottom: 1.66, turretTop: 2.67, gunY: 2.17, gunRootZ: 1.40,
    barrelLength: 4.15, barrelRadius: 0.105,
  }),
});

export function countWorkshopTriangles(root: THREE.Object3D): number {
  let total = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.geometry) return;
    const geometry = object.geometry;
    const triangles = geometry.index ? geometry.index.count / 3
      : (geometry.attributes.position?.count || 0) / 3;
    total += triangles * (object instanceof THREE.InstancedMesh ? object.count : 1);
  });
  return Math.round(total);
}

function facetedPrism(
  plan: readonly (readonly [number, number])[], bottomY: number, topY: number,
  topScale = 1,
): THREE.BufferGeometry {
  const count = plan.length;
  const positions: number[] = [0, bottomY, 0, 0, topY, 0];
  for (const [x, z] of plan) positions.push(x, bottomY, z);
  for (const [x, z] of plan) positions.push(x * topScale, topY, z * topScale);
  const indices: number[] = [];
  const lower = 2;
  const upper = 2 + count;
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count;
    indices.push(0, lower + next, lower + index);
    indices.push(1, upper + index, upper + next);
    indices.push(lower + index, lower + next, upper + next,
      lower + index, upper + next, upper + index);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function mark(
  root: THREE.Object3D, family: FamilyKey | 'support', sourceVehicleId: string,
  component: string, assemblyState: string,
): void {
  Object.assign(root.userData, {
    workshopPart: true,
    workshopLod: 'authored-family-low',
    family,
    sourceVehicleId,
    component,
    assemblyState,
  });
}

export function createWorkshopPartLibrary(engineCtx: WorkshopEngineContext = {}) {
  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(value: T): T => {
    disposables.push(value);
    return value;
  };
  const shadow = <T extends THREE.Material>(material: T): T => {
    engineCtx.setupShadowMaterial?.(material);
    return material;
  };
  const materials = {
    nato: track(shadow(new THREE.MeshStandardMaterial({ color: 0x394236, roughness: 0.82, metalness: 0.1 }))),
    eastern: track(shadow(new THREE.MeshStandardMaterial({ color: 0x47513c, roughness: 0.84, metalness: 0.08 }))),
    french: track(shadow(new THREE.MeshStandardMaterial({ color: 0x3d493a, roughness: 0.78, metalness: 0.12 }))),
    primer: track(shadow(new THREE.MeshStandardMaterial({ color: 0x74483b, roughness: 0.77, metalness: 0.2 }))),
    steel: track(shadow(new THREE.MeshStandardMaterial({ color: 0x555d63, roughness: 0.46, metalness: 0.68 }))),
    darkSteel: track(shadow(new THREE.MeshStandardMaterial({ color: 0x202428, roughness: 0.58, metalness: 0.62 }))),
    rubber: track(shadow(new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.95, metalness: 0 }))),
    timber: track(shadow(new THREE.MeshStandardMaterial({ color: 0x5d4a2c, roughness: 0.9, metalness: 0 }))),
    safety: track(shadow(new THREE.MeshStandardMaterial({ color: 0xb68524, roughness: 0.68, metalness: 0.2 }))),
    optic: track(new THREE.MeshBasicMaterial({ color: 0x82b7ab })),
    bore: track(new THREE.MeshBasicMaterial({ color: 0x030405 })),
  };
  const geometries = {
    wheel: track(new THREE.CylinderGeometry(1, 1, 0.22, 12, 1)),
    hub: track(new THREE.CylinderGeometry(0.53, 0.53, 0.235, 10, 1)),
    shoe: track(new THREE.BoxGeometry(0.4, 0.11, 0.23)),
    barrel: track(new THREE.CylinderGeometry(1, 1.12, 1, 10, 1)),
    muzzle: track(new THREE.CylinderGeometry(1, 1, 0.28, 10, 1, true)),
    bore: track(new THREE.CircleGeometry(1, 10)),
    box: track(new THREE.BoxGeometry(1, 1, 1)),
    cyl: track(new THREE.CylinderGeometry(1, 1, 1, 10, 1)),
    beam: track(new THREE.BoxGeometry(0.18, 0.18, 1)),
    post: track(new THREE.BoxGeometry(0.16, 1, 0.16)),
    pallet: track(new THREE.BoxGeometry(2.3, 0.15, 1.45)),
  };
  const familyGeometries = Object.fromEntries(Object.entries(WORKSHOP_FAMILY_PROFILES).map(([key, profile]) => [
    key,
    {
      lower: track(facetedPrism(profile.hullPlan, profile.hullBottom, profile.hullTop, 0.98)),
      upper: track(facetedPrism(profile.upperPlan, profile.upperBottom, profile.upperTop, 0.90)),
      turret: track(facetedPrism(profile.turretPlan, 0, profile.turretTop - profile.turretBottom, 0.88)),
    },
  ])) as Record<FamilyKey, { lower: THREE.BufferGeometry; upper: THREE.BufferGeometry; turret: THREE.BufferGeometry }>;

  function mesh(
    geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D,
    x: number, y: number, z: number, rx = 0, ry = 0, rz = 0,
    scale: WorkshopScale = 1,
  ): THREE.Mesh {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.rotation.set(rx, ry, rz);
    if (typeof scale === 'number') object.scale.setScalar(scale);
    else object.scale.set(scale[0], scale[1], scale[2]);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  function instanced(
    geometry: THREE.BufferGeometry, material: THREE.Material,
    transforms: readonly WorkshopTransform[], parent: THREE.Object3D,
  ): THREE.InstancedMesh {
    const object = new THREE.InstancedMesh(geometry, material, transforms.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    transforms.forEach((t, index) => {
      position.set(t[0], t[1], t[2]);
      euler.set(t[3] || 0, t[4] || 0, t[5] || 0);
      quaternion.setFromEuler(euler);
      const s = t[6];
      if (typeof s === 'number' || s === undefined) scale.setScalar(s || 1);
      else scale.set(s[0], s[1], s[2]);
      matrix.compose(position, quaternion, scale);
      object.setMatrixAt(index, matrix);
    });
    object.instanceMatrix.needsUpdate = true;
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  function addCrib(parent: THREE.Object3D, width = 3.2, length = 4.8): void {
    for (const z of [-length / 2, length / 2]) {
      mesh(geometries.beam, materials.timber, parent, 0, 0.18, z, 0, 0, 0, [width, 1.15, 0.64]);
    }
    for (const x of [-width / 2 + 0.28, width / 2 - 0.28]) {
      for (const z of [-length / 2 + 0.35, length / 2 - 0.35]) {
        mesh(geometries.box, materials.timber, parent, x, 0.29, z, 0, 0, 0, [0.34, 0.58, 0.46]);
      }
    }
  }

  function addRunningGear(parent: THREE.Object3D, family: FamilyKey): void {
    const profile = WORKSHOP_FAMILY_PROFILES[family];
    const wheels: WorkshopTransform[] = [];
    const hubs: WorkshopTransform[] = [];
    const shoes: WorkshopTransform[] = [];
    const step = profile.wheelSpan / (profile.wheels - 1);
    for (const side of [-1, 1]) {
      for (let index = 0; index < profile.wheels; index++) {
        const z = -profile.wheelSpan / 2 + index * step;
        const transform: WorkshopTransform = [side * 1.66, profile.wheelRadius + 0.10, z,
          0, 0, Math.PI / 2, [profile.wheelRadius, profile.wheelRadius, profile.wheelRadius]];
        wheels.push(transform);
        hubs.push([side * 1.67, profile.wheelRadius + 0.10, z,
          0, 0, Math.PI / 2, [profile.wheelRadius, profile.wheelRadius, profile.wheelRadius]]);
      }
      for (let index = 0; index < 26; index++) {
        const z = -profile.wheelSpan / 2 - 0.35 + index * ((profile.wheelSpan + 0.7) / 25);
        shoes.push([side * 1.69, 0.10, z]);
        shoes.push([side * 1.69, profile.wheelRadius * 2 + 0.16, z]);
      }
    }
    instanced(geometries.wheel, materials.rubber, wheels, parent);
    instanced(geometries.hub, materials[profile.material], hubs, parent);
    instanced(geometries.shoe, materials.darkSteel, shoes, parent);
    parent.userData.roadWheelsPerSide = profile.wheels;
  }

  function addGun(parent: THREE.Object3D, family: FamilyKey): THREE.Group {
    const profile = WORKSHOP_FAMILY_PROFILES[family];
    const gun = new THREE.Group();
    gun.name = `${family}_gun`;
    gun.position.set(0, profile.gunY - profile.turretBottom, profile.gunRootZ);
    parent.add(gun);
    mesh(geometries.box, materials[profile.material], gun, 0, 0, 0.10, 0, 0, 0,
      family === 'abrams' ? [0.76, 0.54, 0.52] : [0.60, 0.48, 0.48]);
    mesh(geometries.barrel, materials.steel, gun, 0, 0, profile.barrelLength / 2 + 0.25,
      -Math.PI / 2, 0, 0, [profile.barrelRadius, profile.barrelLength, profile.barrelRadius]);
    mesh(geometries.muzzle, materials.darkSteel, gun, 0, 0, profile.barrelLength + 0.39,
      -Math.PI / 2, 0, 0, [profile.barrelRadius * 1.22, 1, profile.barrelRadius * 1.22]);
    const bore = mesh(geometries.bore, materials.bore, gun, 0, 0, profile.barrelLength + 0.54,
      0, Math.PI, 0, profile.barrelRadius * 0.86);
    bore.name = `${family}_muzzle_bore`;
    parent.userData.hasGunBore = true;
    return gun;
  }

  function addTurret(parent: THREE.Object3D, family: FamilyKey, seated = true): THREE.Group {
    const profile = WORKSHOP_FAMILY_PROFILES[family];
    const turret = new THREE.Group();
    turret.name = `${family}_turret`;
    turret.position.y = seated ? profile.turretBottom : 0;
    parent.add(turret);
    mesh(familyGeometries[family].turret, materials[profile.material], turret, 0, 0, 0);

    if (family === 'abrams') {
      mesh(geometries.box, materials.nato, turret, 0, 0.50, -1.96, 0, 0, 0, [2.62, 0.62, 0.72]);
      for (const side of [-1, 1]) mesh(geometries.box, materials.nato, turret,
        side * 1.32, 0.40, 0.36, 0, side * 0.17, 0, [0.40, 0.66, 1.68]);
      mesh(geometries.box, materials.darkSteel, turret, -0.52, 1.13, 0.02, 0, 0, 0, [0.34, 0.50, 0.38]);
      mesh(geometries.box, materials.nato, turret, 0.58, 1.08, -0.18, 0, 0, 0, [0.50, 0.16, 0.50]);
    } else if (family === 't90') {
      for (const side of [-1, 1]) for (let row = 0; row < 2; row++) {
        mesh(geometries.box, materials.eastern, turret, side * (0.72 + row * 0.25),
          0.52 - row * 0.18, 0.80 - row * 0.22, -0.10, side * 0.28, side * 0.10,
          [0.62, 0.26, 0.42]);
      }
      mesh(geometries.box, materials.eastern, turret, 0, 0.46, -1.78, 0, 0, 0, [2.12, 0.60, 0.72]);
      mesh(geometries.box, materials.darkSteel, turret, -0.58, 1.04, 0.02, 0, 0, 0, [0.30, 0.64, 0.30]);
      for (const side of [-1, 1]) mesh(geometries.beam, materials.darkSteel, turret,
        side * 1.02, 0.55, -2.25, Math.PI / 2, 0, 0, [1, 1, 1.18]);
      for (const x of [-1.02, -0.34, 0.34, 1.02]) mesh(geometries.post, materials.darkSteel, turret,
        x, 0.55, -2.55, 0, 0, 0, [0.65, 0.72, 0.65]);
    } else {
      mesh(geometries.box, materials.french, turret, 0, 0.46, -2.02, 0, 0, 0, [2.45, 0.78, 0.88]);
      for (const side of [-1, 1]) mesh(geometries.box, materials.french, turret,
        side * 1.20, 0.44, 0.24, 0, side * 0.24, side * 0.12, [0.42, 0.80, 1.62]);
      mesh(geometries.box, materials.darkSteel, turret, 0.72, 1.13, 0.06, 0, 0, 0, [0.32, 0.48, 0.42]);
      mesh(geometries.box, materials.optic, turret, 0.72, 1.12, 0.28, 0, 0, 0, [0.20, 0.20, 0.03]);
    }
    addGun(turret, family);
    turret.userData.family = family;
    turret.userData.hasGunBore = true;
    return turret;
  }

  function addVehicle(parent: THREE.Object3D, family: FamilyKey): void {
    const profile = WORKSHOP_FAMILY_PROFILES[family];
    mesh(familyGeometries[family].lower, materials[profile.material], parent, 0, 0, 0);
    mesh(familyGeometries[family].upper, materials[profile.material], parent, 0, 0, 0);
    for (const side of [-1, 1]) mesh(geometries.box, materials[profile.material], parent,
      side * 1.72, 0.94, -0.10, 0, 0, 0, [0.12, 0.62, family === 'abrams' ? 5.60 : 5.10]);
    addRunningGear(parent, family);
    addTurret(parent, family, true);
    parent.userData.roadWheelsPerSide = profile.wheels;
    parent.userData.hasGunBore = true;
  }

  function addTurretCradle(parent: THREE.Object3D, family: FamilyKey): void {
    addCrib(parent, 3.0, 2.6);
    const turret = addTurret(parent, family, false);
    turret.position.y = 0.54;
    turret.rotation.y = family === 'abrams' ? -0.28 : family === 't90' ? 0.44 : -0.48;
    parent.userData.hasGunBore = true;
  }

  function createAssembly(kind: WorkshopPartKind, options: WorkshopAssemblyOptions = {}): THREE.Group {
    if (!PART_KINDS.includes(kind)) throw new Error(`unknown workshop part kind '${kind}'`);
    const root = new THREE.Group();
    root.name = options.name || `workshop_${kind}`;
    switch (kind) {
      case 'abrams_assembly':
        mark(root, 'abrams', 'm1a2', 'complete_vehicle', 'final-assembly');
        addCrib(root, 3.4, 5.4); addVehicle(root, 'abrams');
        break;
      case 't90_assembly':
        mark(root, 't90', 't90m', 'complete_vehicle', 'suspension-install');
        addCrib(root, 3.2, 5.0); addVehicle(root, 't90');
        break;
      case 'leclerc_assembly':
        mark(root, 'leclerc', 'leclerc', 'complete_vehicle', 'acceptance-inspection');
        addCrib(root, 3.2, 5.0); addVehicle(root, 'leclerc');
        break;
      case 'abrams_turret_cradle':
        mark(root, 'abrams', 'm1a2', 'turret_and_gun', 'removed-for-service');
        addTurretCradle(root, 'abrams');
        break;
      case 't90_turret_cradle':
        mark(root, 't90', 't90m', 'turret_and_gun', 'removed-for-service');
        addTurretCradle(root, 't90');
        break;
      case 'leclerc_turret_cradle':
        mark(root, 'leclerc', 'leclerc', 'turret_and_gun', 'removed-for-service');
        addTurretCradle(root, 'leclerc');
        break;
      case 'powerpack':
        mark(root, 'support', 'leclerc', 'powerpack', 'removed-for-overhaul');
        mesh(geometries.pallet, materials.timber, root, 0, 0.08, 0);
        mesh(geometries.box, materials.darkSteel, root, 0, 0.72, 0, 0, 0.18, 0, [1.65, 1.08, 1.42]);
        mesh(geometries.box, materials.steel, root, 0, 1.35, -0.03, 0, 0.18, 0, [1.45, 0.27, 1.18]);
        for (const x of [-0.55, 0.55]) mesh(geometries.cyl, materials.steel, root,
          x, 1.0, 0.65, Math.PI / 2, 0, 0, [0.08, 0.90, 0.08]);
        break;
      case 'armor_rack': {
        mark(root, 'support', 't90m', 'reactive_armor', 'acceptance-inspection');
        mesh(geometries.pallet, materials.timber, root, 0, 0.08, 0);
        for (const x of [-1.1, 1.1]) mesh(geometries.post, materials.steel, root, x, 1.2, -0.35, 0, 0, 0, [1, 2.3, 1]);
        const plates: WorkshopTransform[] = [];
        for (let row = 0; row < 4; row++) for (let column = 0; column < 5; column++) {
          plates.push([-0.9 + column * 0.45, 0.48 + row * 0.52, -0.31,
            0.03, 0, -0.08 + column * 0.04, [0.38, 0.30, 0.12]]);
        }
        instanced(geometries.box, materials.eastern, plates, root);
        break;
      }
      case 'weapon_rack': {
        mark(root, 'support', 'm1a2', 'gun_tubes', 'bench-service');
        mesh(geometries.box, materials.steel, root, 0, 0.78, 0, 0, 0, 0, [3.2, 0.36, 0.85]);
        for (const [index, x] of [-1.0, 0, 1.0].entries()) {
          const family: FamilyKey = index === 0 ? 'abrams' : index === 1 ? 't90' : 'leclerc';
          const profile = WORKSHOP_FAMILY_PROFILES[family];
          mesh(geometries.barrel, materials.steel, root, x, 1.22, 1.18,
            -Math.PI / 2, 0, 0, [profile.barrelRadius * 0.70, 2.25, profile.barrelRadius * 0.70]);
          mesh(geometries.muzzle, materials.darkSteel, root, x, 1.22, 2.44,
            -Math.PI / 2, 0, 0, [profile.barrelRadius * 0.88, 1, profile.barrelRadius * 0.88]);
          const bore = mesh(geometries.bore, materials.bore, root, x, 1.22, 2.59,
            0, Math.PI, 0, profile.barrelRadius * 0.56);
          bore.name = `${family}_rack_muzzle_bore`;
        }
        root.userData.hasGunBore = true;
        break;
      }
    }
    root.userData.triangles = countWorkshopTriangles(root);
    root.userData.detailTier = 'workshop-family-low';
    return root;
  }

  return {
    materials, geometries, createAssembly,
    dispose() {
      for (const value of disposables) value.dispose?.();
      disposables.length = 0;
    },
  };
}
