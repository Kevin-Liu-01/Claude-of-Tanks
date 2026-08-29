// Lightweight workshop-only armored vehicle components. These are deliberately
// duplicated from fleet design language into a tiny primitive kit: the garage
// can show recognizable teardown/assembly states without importing, building,
// animating or retaining a playable tank scene graph.
import * as THREE from 'three';

const PART_KINDS = Object.freeze([
  'western_assembly', 'eastern_assembly', 'bare_hull', 'turret_cradle',
  'powerpack', 'running_gear', 'armor_rack', 'weapon_rack', 'recovery_wreck',
] as const);
export { PART_KINDS as WORKSHOP_PART_KINDS };

export type WorkshopPartKind = (typeof PART_KINDS)[number];

type WorkshopScale = number | readonly [number, number, number];
type WorkshopTransform = readonly [
  x: number,
  y: number,
  z: number,
  rotationX?: number,
  rotationY?: number,
  rotationZ?: number,
  scale?: WorkshopScale,
];

export interface WorkshopEngineContext {
  setupShadowMaterial?(material: THREE.Material): void;
}

export interface WorkshopAssemblyOptions {
  name?: string;
}

export function countWorkshopTriangles(root: THREE.Object3D): number {
  let total = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.geometry) return;
    const geometry = object.geometry;
    const triangles = geometry.index
      ? geometry.index.count / 3
      : (geometry.attributes.position?.count || 0) / 3;
    total += triangles * (object instanceof THREE.InstancedMesh ? object.count : 1);
  });
  return Math.round(total);
}

function mark(
  root: THREE.Object3D,
  sourceVehicleId: string,
  component: string,
  assemblyState: string,
): THREE.Object3D {
  root.userData.workshopPart = true;
  root.userData.sourceVehicleId = sourceVehicleId;
  root.userData.component = component;
  root.userData.assemblyState = assemblyState;
  return root;
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
    nato: track(shadow(new THREE.MeshStandardMaterial({ color: 0x343a2e, roughness: 0.8, metalness: 0.12 }))),
    eastern: track(shadow(new THREE.MeshStandardMaterial({ color: 0x3d4532, roughness: 0.82, metalness: 0.1 }))),
    primer: track(shadow(new THREE.MeshStandardMaterial({ color: 0x6a4035, roughness: 0.76, metalness: 0.18 }))),
    steel: track(shadow(new THREE.MeshStandardMaterial({ color: 0x3d444a, roughness: 0.5, metalness: 0.72 }))),
    darkSteel: track(shadow(new THREE.MeshStandardMaterial({ color: 0x202428, roughness: 0.56, metalness: 0.64 }))),
    rubber: track(shadow(new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.95, metalness: 0 }))),
    wheelHub: track(shadow(new THREE.MeshStandardMaterial({ color: 0x4b5148, roughness: 0.7, metalness: 0.28 }))),
    timber: track(shadow(new THREE.MeshStandardMaterial({ color: 0x5d4a2c, roughness: 0.9, metalness: 0 }))),
    safety: track(shadow(new THREE.MeshStandardMaterial({ color: 0xb68524, roughness: 0.68, metalness: 0.2 }))),
    bare: track(shadow(new THREE.MeshStandardMaterial({ color: 0x777d81, roughness: 0.43, metalness: 0.78 }))),
    bore: track(new THREE.MeshBasicMaterial({ color: 0x050607 })),
  };
  const geometries = {
    hull: track(new THREE.BoxGeometry(3.35, 0.78, 6.35, 1, 1, 1)),
    hullTop: track(new THREE.BoxGeometry(3.05, 0.48, 4.7, 1, 1, 1)),
    glacis: track(new THREE.BoxGeometry(3.08, 0.34, 1.65, 1, 1, 1)),
    bustle: track(new THREE.BoxGeometry(2.5, 0.62, 1.28, 1, 1, 1)),
    turretWestern: track(new THREE.CylinderGeometry(1.48, 1.68, 0.86, 10, 1)),
    turretEastern: track(new THREE.CylinderGeometry(1.12, 1.52, 0.72, 10, 1)),
    mantlet: track(new THREE.CylinderGeometry(0.38, 0.48, 0.54, 10, 1)),
    barrel: track(new THREE.CylinderGeometry(0.075, 0.12, 4.5, 10, 1)),
    muzzle: track(new THREE.CylinderGeometry(0.14, 0.14, 0.32, 10, 1, true)),
    bore: track(new THREE.CircleGeometry(0.105, 10)),
    wheel: track(new THREE.CylinderGeometry(0.44, 0.44, 0.24, 12, 1)),
    hub: track(new THREE.CylinderGeometry(0.23, 0.23, 0.255, 10, 1)),
    returnRoller: track(new THREE.CylinderGeometry(0.18, 0.18, 0.18, 10, 1)),
    shoe: track(new THREE.BoxGeometry(0.42, 0.12, 0.22, 1, 1, 1)),
    plate: track(new THREE.BoxGeometry(0.9, 0.52, 0.15, 1, 1, 1)),
    beam: track(new THREE.BoxGeometry(0.18, 0.18, 1, 1, 1)),
    post: track(new THREE.BoxGeometry(0.16, 1, 0.16, 1, 1, 1)),
    pallet: track(new THREE.BoxGeometry(2.3, 0.15, 1.45, 1, 1, 1)),
    engine: track(new THREE.BoxGeometry(1.65, 1.08, 1.42, 1, 1, 1)),
    engineHead: track(new THREE.BoxGeometry(1.45, 0.27, 1.18, 1, 1, 1)),
    pipe: track(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 8, 1)),
    crate: track(new THREE.BoxGeometry(1.05, 0.72, 0.82, 1, 1, 1)),
  };

  function mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
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
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    transforms: readonly WorkshopTransform[],
    parent: THREE.Object3D,
  ): THREE.InstancedMesh {
    const object = new THREE.InstancedMesh(geometry, material, transforms.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    transforms.forEach((t, index) => {
      position.set(t[0], t[1], t[2]);
      euler.set(t[3] || 0, t[4] || 0, t[5] || 0);
      quaternion.setFromEuler(euler);
      const transformScale = t[6];
      if (typeof transformScale === 'number' || transformScale === undefined) {
        scale.setScalar(transformScale || 1);
      } else {
        scale.set(transformScale[0], transformScale[1], transformScale[2]);
      }
      matrix.compose(position, quaternion, scale);
      object.setMatrixAt(index, matrix);
    });
    object.instanceMatrix.needsUpdate = true;
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  function addCrib(parent: THREE.Object3D, width = 3.0, length = 4.4): void {
    for (const z of [-length / 2, length / 2]) {
      mesh(geometries.beam, materials.timber, parent, 0, 0.22, z, 0, 0, 0, [width, 1.3, 0.62]);
    }
    for (const [x, z] of [[-1.15, -1.6], [1.15, -1.6], [-1.15, 1.6], [1.15, 1.6]]) {
      mesh(geometries.crate, materials.timber, parent, x, 0.35, z, 0, 0, 0, [0.42, 0.72, 0.52]);
    }
  }

  function addRunningGear(
    parent: THREE.Object3D,
    { wheels = 7, attached = true, western = false }: {
      wheels?: number;
      attached?: boolean;
      western?: boolean;
    } = {},
  ): void {
    const wheelTransforms: WorkshopTransform[] = [];
    const hubTransforms: WorkshopTransform[] = [];
    const step = 4.7 / Math.max(1, wheels - 1);
    for (const side of [-1, 1]) {
      for (let index = 0; index < wheels; index++) {
        const z = -2.35 + index * step;
        const x = side * 1.72;
        const transform: WorkshopTransform = [x, attached ? 0.52 : 0, z, 0, 0, Math.PI / 2];
        wheelTransforms.push(transform);
        hubTransforms.push([x + side * 0.012, transform[1], z, 0, 0, Math.PI / 2, 0.92]);
      }
    }
    instanced(geometries.wheel, materials.rubber, wheelTransforms, parent);
    instanced(geometries.hub, western ? materials.nato : materials.eastern, hubTransforms, parent);
    if (!attached) return;
    const shoes: WorkshopTransform[] = [];
    for (const side of [-1, 1]) {
      for (let index = 0; index < 22; index++) {
        const z = -2.62 + index * (5.24 / 21);
        shoes.push([side * 1.74, 0.05, z, 0, 0, 0]);
        shoes.push([side * 1.74, 1.08, z, 0, 0, 0]);
      }
    }
    instanced(geometries.shoe, materials.darkSteel, shoes, parent);
  }

  function addGun(
    parent: THREE.Object3D,
    material: THREE.Material,
    y = 2.15,
    z = 1.45,
    elevation = -Math.PI / 2,
  ): THREE.Group {
    const gun = new THREE.Group();
    gun.position.set(0, y, z);
    gun.rotation.x = 0.03;
    parent.add(gun);
    mesh(geometries.mantlet, material, gun, 0, 0, 0, elevation, 0, 0);
    mesh(geometries.barrel, materials.bare, gun, 0, 0.03, 2.38, elevation, 0, 0);
    mesh(geometries.muzzle, materials.darkSteel, gun, 0, 0.03, 4.7, elevation, 0, 0);
    mesh(geometries.bore, materials.bore, gun, 0, 0.03, 4.87, 0, Math.PI, 0);
    return gun;
  }

  function addHull(
    parent: THREE.Object3D,
    { material, western = false, shellOnly = false }: {
      material: THREE.Material;
      western?: boolean;
      shellOnly?: boolean;
    },
  ): THREE.Group {
    const hull = new THREE.Group();
    parent.add(hull);
    mesh(geometries.hull, shellOnly ? materials.primer : material, hull, 0, 1.1, 0);
    mesh(geometries.hullTop, shellOnly ? materials.bare : material, hull, 0, 1.66, -0.25);
    const glacis = mesh(geometries.glacis, material, hull, 0, 1.66, 2.65, -0.12);
    glacis.name = 'workshop_glacis';
    if (western) mesh(geometries.bustle, material, hull, 0, 1.62, -2.75);
    return hull;
  }

  function addTurret(
    parent: THREE.Object3D,
    { material, western = false, seated = true }: {
      material: THREE.Material;
      western?: boolean;
      seated?: boolean;
    },
  ): THREE.Group {
    const turret = new THREE.Group();
    turret.position.y = seated ? 1.9 : 0;
    parent.add(turret);
    mesh(western ? geometries.turretWestern : geometries.turretEastern,
      material, turret, 0, 0.48, -0.1);
    if (western) mesh(geometries.bustle, material, turret, 0, 0.48, -1.2, 0, 0, 0, [1.1, 1, 1]);
    addGun(turret, material, 0.48, 1.0);
    // Sight + hatch are purposefully coarse but source-readable.
    mesh(geometries.crate, materials.darkSteel, turret, -0.58, 1.03, 0.05, 0, 0, 0, [0.26, 0.5, 0.28]);
    mesh(geometries.hub, material, turret, 0.48, 0.96, -0.18, 0, 0, 0, [0.75, 0.24, 0.75]);
    return turret;
  }

  function addGantry(
    parent: THREE.Object3D,
    xSpan = 5.4,
    zSpan = 6.6,
    height = 5.2,
  ): void {
    for (const [x, z] of [[-xSpan / 2, -zSpan / 2], [xSpan / 2, -zSpan / 2], [-xSpan / 2, zSpan / 2], [xSpan / 2, zSpan / 2]]) {
      mesh(geometries.post, materials.safety, parent, x, height / 2, z, 0, 0, x > 0 ? -0.05 : 0.05, [1, height, 1]);
    }
    mesh(geometries.beam, materials.safety, parent, 0, height, 0, 0, 0, 0, [1.4, 1.5, zSpan + 0.8]);
    mesh(geometries.crate, materials.darkSteel, parent, 0, height - 0.35, 0.35, 0, 0, 0, [0.4, 0.45, 0.5]);
    mesh(geometries.pipe, materials.steel, parent, 0, height - 1.15, 0.35, 0, 0, 0, [0.22, 1.6, 0.22]);
  }

  function createAssembly(
    kind: WorkshopPartKind,
    options: WorkshopAssemblyOptions = {},
  ): THREE.Group {
    if (!PART_KINDS.includes(kind)) throw new Error(`unknown workshop part kind '${kind}'`);
    const root = new THREE.Group();
    root.name = `workshop_${kind}`;
    switch (kind) {
      case 'western_assembly': {
        mark(root, 'm1a2', 'partial_vehicle', 'final-assembly');
        addCrib(root);
        addHull(root, { material: materials.nato, western: true });
        addRunningGear(root, { wheels: 7, attached: true, western: true });
        const turret = addTurret(root, { material: materials.nato, western: true, seated: false });
        turret.position.set(0.08, 3.02, -0.05);
        turret.rotation.set(0.025, -0.12, 0.02);
        addGantry(root);
        break;
      }
      case 'eastern_assembly': {
        mark(root, 't90a_burlak', 'partial_vehicle', 'suspension-install');
        addCrib(root, 2.9, 4.0);
        addHull(root, { material: materials.eastern });
        addRunningGear(root, { wheels: 6, attached: true });
        const turret = addTurret(root, { material: materials.eastern, seated: false });
        turret.position.set(-2.7, 1.0, -0.25);
        turret.rotation.y = 0.7;
        break;
      }
      case 'bare_hull': {
        mark(root, 'k2', 'hull_shell', 'bare-welded-shell');
        addCrib(root, 3.2, 4.5);
        addHull(root, { material: materials.primer, western: true, shellOnly: true });
        break;
      }
      case 'turret_cradle': {
        mark(root, 't90m', 'turret_and_gun', 'removed-for-service');
        addCrib(root, 2.7, 2.4);
        const turret = addTurret(root, { material: materials.eastern, seated: false });
        turret.position.y = 0.65;
        turret.rotation.y = -0.55;
        break;
      }
      case 'powerpack': {
        mark(root, 'leopard2a4', 'powerpack', 'removed-for-overhaul');
        mesh(geometries.pallet, materials.timber, root, 0, 0.08, 0);
        mesh(geometries.engine, materials.darkSteel, root, 0, 0.72, 0, 0, 0.18, 0);
        mesh(geometries.engineHead, materials.bare, root, 0, 1.35, -0.03, 0, 0.18, 0);
        for (const x of [-0.55, 0.55]) mesh(geometries.pipe, materials.steel, root, x, 1.0, 0.65, Math.PI / 2, 0, 0);
        break;
      }
      case 'running_gear': {
        mark(root, 'k2', 'road_wheels_and_track', 'sorted-for-inspection');
        mesh(geometries.pallet, materials.timber, root, 0, 0.08, 0);
        const transforms: WorkshopTransform[] = [];
        for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) {
          transforms.push([-0.75 + col * 0.5, 0.25 + row * 0.5, -0.2 + row * 0.15, 0, 0, Math.PI / 2, 0.52]);
        }
        instanced(geometries.wheel, materials.rubber, transforms, root);
        instanced(geometries.hub, materials.wheelHub, transforms, root);
        const shoes: WorkshopTransform[] = [];
        for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) {
          shoes.push([-1.05 + col * 0.42, 0.18 + row * 0.13, 0.52, 0, 0, 0, 0.82]);
        }
        instanced(geometries.shoe, materials.darkSteel, shoes, root);
        break;
      }
      case 'armor_rack': {
        mark(root, 't90m', 'reactive_armor', 'acceptance-inspection');
        mesh(geometries.pallet, materials.timber, root, 0, 0.08, 0);
        for (const x of [-1.1, 1.1]) mesh(geometries.post, materials.steel, root, x, 1.2, -0.35, 0, 0, 0, [1, 2.3, 1]);
        for (const y of [0.45, 1.05, 1.65, 2.2]) mesh(geometries.beam, materials.steel, root, 0, y, -0.35, 0, Math.PI / 2, 0, [1, 1, 2.25]);
        const plates: WorkshopTransform[] = [];
        for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) {
          plates.push([-0.9 + col * 0.45, 0.48 + row * 0.52, -0.31, 0.03, 0, -0.08 + col * 0.04, [0.43, 0.7, 0.8]]);
        }
        instanced(geometries.plate, materials.eastern, plates, root);
        break;
      }
      case 'weapon_rack': {
        mark(root, 'm1a2', 'weapon_station', 'bench-service');
        mesh(geometries.pallet, materials.steel, root, 0, 0.78, 0, 0, 0, 0, [1.8, 0.45, 0.72]);
        for (const x of [-1.45, 0, 1.45]) {
          mesh(geometries.crate, materials.darkSteel, root, x, 1.05, 0, 0, 0, 0, [0.45, 0.38, 0.42]);
          mesh(geometries.barrel, materials.bare, root, x, 1.15, 1.2, -Math.PI / 2, 0, 0, [0.45, 0.45, 0.58]);
          mesh(geometries.muzzle, materials.darkSteel, root, x, 1.15, 2.55, -Math.PI / 2, 0, 0, 0.46);
        }
        break;
      }
      case 'recovery_wreck': {
        mark(root, 'challenger_3', 'recovered_hull', 'battle-damaged-teardown');
        addHull(root, { material: materials.primer, western: true, shellOnly: true });
        root.rotation.z = 0.9;
        root.position.y = 0.6;
        // Detached road wheels and armor sheets communicate salvage without
        // retaining a second complete tank.
        const wheels: WorkshopTransform[] = [];
        for (let index = 0; index < 5; index++) wheels.push([-2 + index, -0.35, 1.7, Math.PI / 2, 0, index * 0.3, 0.72]);
        instanced(geometries.wheel, materials.rubber, wheels, root);
        for (let index = 0; index < 4; index++) mesh(geometries.plate, materials.primer, root, 2.2, -0.35 + index * 0.22, -1.6 + index * 0.55, 0.2, 0.2, index * 0.15);
        break;
      }
    }
    root.userData.triangles = countWorkshopTriangles(root);
    root.userData.detailTier = 'workshop-low';
    if (options.name) root.name = options.name;
    return root;
  }

  return {
    materials,
    geometries,
    createAssembly,
    dispose() {
      for (const value of disposables) value.dispose?.();
      disposables.length = 0;
    },
  };
}
