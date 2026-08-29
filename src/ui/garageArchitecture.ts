// Ten low-poly macro garage shells. The central podium and lighting remain
// stable while each battlefield selection swaps a genuinely different
// structural language around it. Roots are built lazily, cached, and hidden as
// whole subtrees, so repeat selection is allocation-free and battle cost stays 0.
import * as THREE from 'three';
import type { GarageVariant } from '../game/garageVariants.ts';

interface ArchitectureEngineContext {
  setupShadowMaterial?(material: THREE.Material): void;
}

export interface GarageArchitectureStats {
  key: GarageVariant['architecture'];
  signature: string;
  objects: number;
  triangles: number;
  cached: number;
}

export function createGarageArchitectureController(
  engineCtx: ArchitectureEngineContext,
  parent: THREE.Object3D,
) {
  const group = new THREE.Group();
  group.name = 'garage_variant_architecture';
  group.userData.perfOwner = 'garage/architecture';
  parent.add(group);

  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(value: T): T => {
    disposables.push(value);
    return value;
  };
  const shadow = <T extends THREE.Material>(material: T): T => {
    engineCtx.setupShadowMaterial?.(material);
    return material;
  };
  const material = {
    frame: track(shadow(new THREE.MeshStandardMaterial({ color: 0x46535c, roughness: 0.55, metalness: 0.58, emissive: 0x111820, emissiveIntensity: 0.32 }))),
    dark: track(shadow(new THREE.MeshStandardMaterial({ color: 0x1d2328, roughness: 0.7, metalness: 0.35 }))),
    accent: track(shadow(new THREE.MeshStandardMaterial({ color: 0xc99b35, roughness: 0.6, metalness: 0.25, emissive: 0x241708, emissiveIntensity: 0.28 }))),
    concrete: track(shadow(new THREE.MeshStandardMaterial({ color: 0x5c6264, roughness: 0.92, metalness: 0.02 }))),
    brick: track(shadow(new THREE.MeshStandardMaterial({ color: 0x5b4037, roughness: 0.94, metalness: 0 }))),
    rock: track(shadow(new THREE.MeshStandardMaterial({ color: 0x4d5351, roughness: 1, metalness: 0 }))),
    canopy: track(shadow(new THREE.MeshStandardMaterial({ color: 0x56594d, roughness: 0.88, metalness: 0.03, side: THREE.DoubleSide }))),
    glass: track(new THREE.MeshBasicMaterial({ color: 0x83aab5, transparent: true, opacity: 0.20, depthWrite: false, side: THREE.DoubleSide })),
    glow: track(new THREE.MeshBasicMaterial({ color: 0xf0a04a })),
  };
  const geometry = {
    box: track(new THREE.BoxGeometry(1, 1, 1)),
    cylinder: track(new THREE.CylinderGeometry(1, 1, 1, 10, 1)),
    pipe: track(new THREE.CylinderGeometry(1, 1, 1, 8, 1)),
    arch: track(new THREE.TorusGeometry(8.8, 0.17, 6, 30, Math.PI)),
    rock: track(new THREE.DodecahedronGeometry(1, 0)),
  };
  const cache = new Map<GarageVariant['architecture'], THREE.Group>();
  let active: THREE.Group | null = null;

  function put(
    root: THREE.Object3D, name: string, mat: THREE.Material,
    x: number, y: number, z: number,
    sx: number, sy: number, sz: number,
    rx = 0, ry = 0, rz = 0,
    source: THREE.BufferGeometry = geometry.box,
  ): THREE.Mesh {
    const object = new THREE.Mesh(source, mat);
    object.name = name;
    object.position.set(x, y, z);
    object.scale.set(sx, sy, sz);
    object.rotation.set(rx, ry, rz);
    object.castShadow = true;
    object.receiveShadow = true;
    root.add(object);
    return object;
  }

  function frameLine(
    root: THREE.Object3D, name: string,
    columns: readonly number[], z: number, height: number,
    mat: THREE.Material = material.frame,
  ): void {
    for (const x of columns) put(root, `${name}_column`, mat, x, height / 2, z, 0.28, height, 0.28);
    put(root, `${name}_header`, mat, 0, height, z, 43, 0.32, 0.36);
  }

  function rails(root: THREE.Object3D, z0 = -22, z1 = 22): void {
    const length = z1 - z0;
    for (const x of [-2.9, -2.1, 2.1, 2.9]) {
      put(root, 'rail_track', material.dark, x, 0.06, (z0 + z1) / 2,
        0.10, 0.11, length);
    }
    for (let z = z0; z <= z1; z += 1.2) {
      put(root, 'rail_sleeper', material.concrete, 0, 0.035, z, 7.4, 0.07, 0.20);
    }
  }

  // The showroom camera favors the south wall. Every architecture owns a
  // broad portal there, deliberately using the clear structural lanes around
  // the measured dressing bays so its identity reads on the normal garage UI.
  function southPortal(
    root: THREE.Object3D, name: string, mat: THREE.Material,
    height = 8.9, depth = 0.44,
  ): void {
    for (const x of [-20.6, -14.1, 14.9, 20.6]) {
      put(root, `${name}_portal_post`, mat, x, height / 2, 21.65, depth, height, depth);
    }
    put(root, `${name}_portal_header`, mat, 0, height, 21.65, 42.0, depth, depth);
  }

  function build(key: GarageVariant['architecture']): THREE.Group {
    const root = new THREE.Group();
    root.name = `garage_architecture_${key}`;
    root.userData.architectureKey = key;
    switch (key) {
      case 'field_shed':
        southPortal(root, 'field', material.frame, 8.8, 0.30);
        frameLine(root, 'field_shed', [-19, -10, 0, 10, 19], -20.8, 7.4);
        for (const x of [-19, -10, 0, 10, 19]) {
          put(root, 'field_roof_pitch_l', material.frame, x, 8.45, -17.8, 0.22, 0.22, 6.6, -0.48);
          put(root, 'field_roof_pitch_r', material.frame, x, 8.45, -23.8, 0.22, 0.22, 6.6, 0.48);
        }
        put(root, 'field_canvas_awning', material.canopy, -10.5, 7.75, -17.0, 18, 0.10, 7.0, -0.18);
        for (const x of [-20.6, -14.1, 14.9, 20.6]) put(root, 'field_portal_brace', material.accent,
          x + (x < 0 ? 1.5 : -1.5), 6.8, 21.25, 0.20, 0.20, 4.2, 0, 0, x < 0 ? -0.72 : 0.72);
        break;
      case 'shade_depot':
        southPortal(root, 'shade', material.accent, 7.5, 0.28);
        for (const x of [-18, -6, 6, 18]) for (const z of [-18, 18]) {
          put(root, 'shade_post', material.accent, x, 3.7, z, 0.24, 7.4, 0.24);
        }
        put(root, 'shade_canopy', material.canopy, 0, 7.45, 0, 42, 0.12, 34);
        put(root, 'shade_front_valance', material.canopy, 0, 7.15, 21.30, 41.5, 0.65, 0.10);
        for (const z of [-18, 18]) put(root, 'dust_screen', material.glass, 0, 4.2, z, 42, 6.2, 0.05);
        break;
      case 'repair_bunker':
        southPortal(root, 'bunker', material.concrete, 9.3, 0.82);
        for (const x of [-19.5, -13, -6.5, 0, 6.5, 13, 19.5]) {
          put(root, 'bunker_rib', material.concrete, x, 4.7, -21.7, 0.75, 9.4, 1.25);
        }
        for (const x of [-14, -7, 0, 7, 14]) {
          put(root, 'blast_door_panel', material.dark, x, 3.35, -21.0, 6.4, 6.5, 0.30);
          put(root, 'blast_door_chevron', material.accent, x, 3.35, -20.78, 0.12, 5.3, 0.12, 0, 0, x < 0 ? -0.58 : 0.58);
        }
        put(root, 'bunker_duct', material.frame, -17.5, 7.4, -18.8, 0.55, 19, 0.55, Math.PI / 2, 0, 0, geometry.pipe);
        break;
      case 'brick_arsenal':
        southPortal(root, 'arsenal', material.brick, 9.4, 0.72);
        for (const x of [-20, -14, -7, 0, 7, 14, 20]) put(root, 'brick_pilaster', material.brick, x, 4.8, -21.8, 0.78, 9.6, 0.9);
        for (const x of [-17, -10.5, -3.5, 3.5, 10.5, 17]) {
          put(root, 'arsenal_window', material.glass, x, 5.6, -21.2, 4.3, 3.7, 0.08);
          put(root, 'window_lintel', material.concrete, x, 7.6, -21.0, 4.8, 0.36, 0.34);
        }
        put(root, 'arsenal_mezzanine', material.frame, -17.8, 4.0, 0, 0.42, 0.28, 42);
        for (const x of [-11.0, -6.0]) put(root, 'arsenal_south_window', material.glass,
          x, 6.9, 21.18, 3.8, 2.2, 0.08);
        break;
      case 'naval_drydock':
        southPortal(root, 'drydock', material.accent, 9.0, 0.52);
        for (const x of [-20, 20]) {
          put(root, 'drydock_leg', material.accent, x, 4.7, -2, 0.65, 9.4, 0.65);
          put(root, 'drydock_foot', material.concrete, x, 0.22, -2, 2.2, 0.44, 3.4);
        }
        put(root, 'drydock_crane', material.accent, 0, 8.7, -2, 41, 0.72, 0.72);
        put(root, 'drydock_catwalk', material.frame, 0, 5.7, -20.8, 40, 0.24, 1.8);
        for (const x of [-19, -12, -5, 2, 9, 16]) put(root, 'catwalk_stanchion', material.frame, x, 6.25, -20.0, 0.12, 1.1, 0.12);
        put(root, 'drydock_front_catwalk', material.frame, 0, 8.0, 20.95, 40.0, 0.32, 1.4);
        break;
      case 'rail_roundhouse':
        rails(root);
        southPortal(root, 'roundhouse', material.frame, 9.1, 0.32);
        for (const z of [-20.8, -10.4, 0, 10.4, 20.8]) {
          const arch = put(root, 'roundhouse_arch', material.frame, 0, 0.18, z,
            1, 1, 1, 0, 0, 0, geometry.arch);
          arch.rotation.x = 0;
          put(root, 'roundhouse_arch_left', material.frame, -8.8, 4.5, z, 0.35, 9, 0.35);
          put(root, 'roundhouse_arch_right', material.frame, 8.8, 4.5, z, 0.35, 9, 0.35);
        }
        put(root, 'roundhouse_front_lintel', material.accent, 0, 8.2, 21.15, 27.0, 0.30, 0.36);
        break;
      case 'rain_canopy':
        southPortal(root, 'monsoon', material.frame, 7.8, 0.26);
        for (const x of [-19, -9.5, 0, 9.5, 19]) {
          put(root, 'rain_post', material.frame, x, 3.8, -19.5, 0.24, 7.6, 0.24);
          put(root, 'rain_roof_left', material.canopy, x, 8.0, -9.8, 0.20, 0.20, 20, -0.22);
          put(root, 'rain_roof_right', material.canopy, x, 8.0, 9.8, 0.20, 0.20, 20, 0.22);
        }
        for (const x of [-20.5, 20.5]) put(root, 'rain_gutter', material.accent, x, 7.2, 0,
          0.16, 43, 0.16, Math.PI / 2, 0, 0, geometry.pipe);
        for (const x of [-15, -5, 5, 15]) put(root, 'rain_curtain', material.glass, x, 4.0, -21.6, 8.5, 7.7, 0.03);
        put(root, 'monsoon_front_eave_l', material.canopy, -10.8, 8.35, 20.9, 20.5, 0.18, 2.0, 0, 0, -0.12);
        put(root, 'monsoon_front_eave_r', material.canopy, 10.8, 8.35, 20.9, 20.5, 0.18, 2.0, 0, 0, 0.12);
        break;
      case 'rock_cavern':
        southPortal(root, 'cavern', material.frame, 8.6, 0.32);
        for (const side of [-1, 1]) for (let index = 0; index < 9; index++) {
          const z = -20 + index * 5;
          const scale = 2.1 + (index % 3) * 0.55;
          put(root, 'cavern_rock', material.rock, side * (20.5 + (index % 2) * 0.5),
            2.2 + (index % 2), z, scale, scale * 1.4, scale, index * 0.18, index * 0.27, 0, geometry.rock);
        }
        for (const x of [-16, -8, 0, 8, 16]) put(root, 'cavern_crown', material.rock,
          x, 9.25, -20.5, 3.8, 2.1, 2.6, x * 0.03, x * 0.05, 0, geometry.rock);
        put(root, 'cavern_reinforcement', material.accent, 0, 8.0, -19.8, 34, 0.34, 0.34);
        for (const x of [-19.0, -14.6, 15.4, 19.4]) put(root, 'cavern_portal_rock', material.rock,
          x, 6.8, 21.0, 2.0, 2.6, 1.6, x * 0.02, x * 0.03, 0, geometry.rock);
        break;
      case 'recovery_yard':
        southPortal(root, 'recovery', material.accent, 7.8, 0.26);
        for (const x of [-20, -10, 0, 10, 20]) put(root, 'yard_light_mast', material.frame, x, 4.2, -20.5, 0.26, 8.4, 0.26);
        put(root, 'yard_crane_mast', material.accent, 18.5, 5.4, 9.5, 0.65, 10.8, 0.65);
        put(root, 'yard_crane_boom', material.accent, 8.0, 9.6, 9.5, 22, 0.42, 0.42, 0, 0, -0.18);
        for (const x of [-17, -11, -5, 5, 11, 17]) put(root, 'yard_barrier', material.concrete,
          x, 0.55, -20.5, 5.0, 1.1, 1.1);
        for (const z of [-16, -10, -4, 2, 8, 14]) put(root, 'scrap_screen', material.dark,
          -21.0, 2.0, z, 0.35, 4.0, 4.8, 0, 0, z * 0.01);
        put(root, 'recovery_front_crane', material.accent, -9.5, 8.6, 20.8, 8.0, 0.32, 0.32, 0, 0, -0.22);
        break;
      case 'factory_line':
        southPortal(root, 'factory', material.accent, 9.5, 0.46);
        for (const x of [-20, -12, -4, 4, 12, 20]) {
          put(root, 'factory_column', material.accent, x, 4.8, -19.8, 0.55, 9.6, 0.55);
          put(root, 'factory_drop', material.frame, x, 7.2, 0, 0.20, 0.20, 38);
        }
        put(root, 'factory_conveyor', material.dark, 0, 6.2, -17.8, 38, 1.1, 1.4);
        for (const x of [-15, -9, -3, 3, 9, 15]) put(root, 'furnace_window', material.glow,
          x, 3.5, -21.1, 3.8, 2.4, 0.05);
        put(root, 'factory_crane_rail', material.accent, 0, 8.8, 2, 43, 0.48, 0.48);
        put(root, 'factory_front_conveyor', material.dark, -7.5, 7.0, 21.05, 12.0, 1.0, 0.90);
        break;
    }
    let objects = 0;
    let triangles = 0;
    const names = new Set<string>();
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      objects++;
      names.add(object.name);
      const geo = object.geometry;
      triangles += (geo.index ? geo.index.count : geo.attributes.position?.count || 0) / 3;
    });
    root.userData.objects = objects;
    root.userData.triangles = Math.round(triangles);
    root.userData.signature = `${key}:${objects}:${[...names].sort().join(',')}`;
    return root;
  }

  function setVariant(variant: GarageVariant): GarageArchitectureStats {
    if (active) active.visible = false;
    let next = cache.get(variant.architecture);
    if (!next) {
      next = build(variant.architecture);
      cache.set(variant.architecture, next);
      group.add(next);
    }
    active = next;
    active.visible = true;
    material.accent.color.setHex(variant.accent);
    material.canopy.color.setHex(variant.wallTint).offsetHSL(0, 0, 0.05);
    material.glass.color.setHex(variant.lightTint).offsetHSL(0, -0.18, -0.2);
    material.glow.color.setHex(variant.lightTint);
    const stats = {
      key: variant.architecture,
      signature: String(active.userData.signature),
      objects: Number(active.userData.objects),
      triangles: Number(active.userData.triangles),
      cached: cache.size,
    };
    Object.assign(group.userData, stats);
    return stats;
  }

  return {
    group,
    setVariant,
    stats: (): GarageArchitectureStats => ({
      key: group.userData.key || 'field_shed',
      signature: group.userData.signature || '',
      objects: group.userData.objects || 0,
      triangles: group.userData.triangles || 0,
      cached: cache.size,
    }),
    dispose() {
      group.removeFromParent();
      for (const value of disposables) value.dispose?.();
      disposables.length = 0;
      cache.clear();
    },
  };
}
