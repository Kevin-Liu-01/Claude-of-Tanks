// Lightweight garage macro environments. Verdant keeps the authored indoor
// motor pool; every other selection is an open, map-native service staging
// area. Each bounded slice is rebuilt from the selected map's canonical
// heightfield, horizon, tactical structure, tree kit, and palettes. Roots are
// lazy/cached and never wake map-wide streaming, grass, PMREM, or colliders.
import * as THREE from 'three';
import type { GarageVariant } from '../game/garageVariants.ts';
import type { GarageMapStage } from '../world/garageMapStage.ts';

interface ArchitectureEngineContext {
  setupShadowMaterial?(material: THREE.Material): void;
}

export interface GarageArchitectureStats {
  key: GarageVariant['architecture'];
  mapId: string;
  mode: 'verdant-workshop' | 'map-staging';
  signature: string;
  objects: number;
  triangles: number;
  cached: number;
  enclosingSurfaces: number;
  ready: boolean;
  source: 'verdant-workshop' | 'canonical-map-slice' | 'loading';
  sourceCoordinate: readonly [number, number] | null;
  sourceBeat: string;
  sourceStructure: string;
  sourceLandmarkLocal: readonly [number, number, number] | null;
  terrainVertices: number;
  treeSpecies: readonly string[];
  trees: number;
}

export function createGarageArchitectureController(
  engineCtx: ArchitectureEngineContext,
  parent: THREE.Object3D,
  requestRender: () => void = () => {},
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
    frame: track(shadow(new THREE.MeshStandardMaterial({ color: 0x46535c, roughness: 0.55, metalness: 0.58 }))),
    dark: track(shadow(new THREE.MeshStandardMaterial({ color: 0x1d2328, roughness: 0.78, metalness: 0.30 }))),
    accent: track(shadow(new THREE.MeshStandardMaterial({ color: 0xc99b35, roughness: 0.60, metalness: 0.25 }))),
    ground: track(shadow(new THREE.MeshStandardMaterial({ color: 0x53584f, roughness: 0.98, metalness: 0 }))),
    concrete: track(shadow(new THREE.MeshStandardMaterial({ color: 0x5c6264, roughness: 0.92, metalness: 0.02 }))),
    glow: track(new THREE.MeshBasicMaterial({ color: 0xf0a04a })),
  };
  const geometry = {
    box: track(new THREE.BoxGeometry(1, 1, 1)),
    pipe: track(new THREE.CylinderGeometry(1, 1, 1, 8, 1)),
  };
  const cache = new Map<GarageVariant['architecture'], THREE.Group>();
  const mapStages = new Map<GarageVariant['architecture'], GarageMapStage>();
  const pendingStages = new Map<GarageVariant['architecture'], Promise<void>>();
  let active: THREE.Group | null = null;
  let disposed = false;

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

  function lightMast(root: THREE.Object3D, x: number, z: number, yaw = 0): void {
    put(root, 'staging_light_mast', material.frame, x, 4.0, z,
      0.18, 8, 0.18, 0, 0, 0, geometry.pipe);
    put(root, 'staging_light_bar', material.frame, x, 7.9, z,
      2.2, 0.16, 0.16, 0, yaw);
    for (const side of [-0.75, 0.75]) {
      put(root, 'staging_flood_lamp', material.glow,
        x + Math.cos(yaw) * side, 7.82, z - Math.sin(yaw) * side,
        0.42, 0.26, 0.10, -0.18, yaw);
    }
  }

  function serviceSupports(root: THREE.Object3D): void {
    // The battle archive and the two workshop placards were wall-mounted in
    // Verdant. Outdoors they ride on independent service rails, not invisible
    // walls, so every display retains an honest load path.
    for (const [name, x, z, width, height] of [
      ['archive_display', 9.5, 22.72, 7.5, 4.2],
      ['t90_service_sign', -8.7, 22.78, 3.3, 3.8],
      ['k2_service_sign', -11.4, -22.78, 8.8, 3.8],
    ] as const) {
      for (const side of [-1, 1]) {
        put(root, `${name}_post`, material.frame, x + side * width * 0.42,
          height / 2, z, 0.16, height, 0.16);
        put(root, `${name}_foot`, material.concrete, x + side * width * 0.42,
          0.10, z, 0.75, 0.20, 0.75);
      }
      put(root, `${name}_crossbar`, material.frame, x, height - 0.15, z,
        width, 0.16, 0.16);
    }
  }

  function openStage(root: THREE.Group, key: GarageVariant['architecture']): void {
    root.userData.mode = 'map-staging';
    root.userData.enclosingSurfaces = 0;
    root.userData.ready = false;
    root.userData.source = 'loading';
    put(root, 'service_hardstand', material.ground, 0, -0.015, 0, 44, 0.08, 44);
    put(root, 'staging_access_lane', material.ground, 0, -0.035, -38, 13, 0.05, 32);
    serviceSupports(root);
    lightMast(root, -25, 18, 0.2);
    lightMast(root, 25, -18, -0.2);

    // Map terrain, horizon, vegetation and the tactical landmark are hydrated
    // from the canonical world modules after this synchronous, already-warm
    // service shell is visible. No hand-authored biome proxy belongs here.
    void key;
  }

  function build(key: GarageVariant['architecture']): THREE.Group {
    const root = new THREE.Group();
    root.name = `garage_architecture_${key}`;
    root.userData.architectureKey = key;
    if (key === 'field_shed') {
      root.userData.mode = 'verdant-workshop';
      root.userData.enclosingSurfaces = 4;
      root.userData.ready = true;
      root.userData.source = 'verdant-workshop';
      for (const x of [-20.6, -14.1, 14.9, 20.6]) {
        put(root, 'field_portal_post', material.frame, x, 4.4, 21.65, 0.30, 8.8, 0.30);
      }
      put(root, 'field_portal_header', material.frame, 0, 8.8, 21.65, 42, 0.30, 0.30);
      for (const x of [-19, -10, 0, 10, 19]) {
        put(root, 'field_shed_column', material.frame, x, 3.7, -20.8, 0.28, 7.4, 0.28);
      }
      put(root, 'field_shed_header', material.frame, 0, 7.4, -20.8, 43, 0.32, 0.36);
      for (const x of [-20.6, -14.1, 14.9, 20.6]) {
        put(root, 'field_portal_brace', material.accent,
          x + (x < 0 ? 1.5 : -1.5), 6.8, 21.25,
          0.20, 0.20, 4.2, 0, 0, x < 0 ? -0.72 : 0.72);
      }
    } else {
      openStage(root, key);
    }

    refreshRootStats(root, key);
    return root;
  }

  function refreshRootStats(root: THREE.Group, key: GarageVariant['architecture']): void {
    let objects = 0;
    let triangles = 0;
    const names = new Set<string>();
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      objects++;
      names.add(object.name);
      const geo = object.geometry;
      const one = (geo.index ? geo.index.count : geo.attributes.position?.count || 0) / 3;
      triangles += one * (object instanceof THREE.InstancedMesh ? object.count : 1);
    });
    root.userData.objects = objects;
    root.userData.triangles = Math.round(triangles);
    const source = root.userData.sourceCoordinate
      ? `:${root.userData.sourceCoordinate.join(',')}:${root.userData.sourceBeat}` : '';
    root.userData.signature = `${key}:${objects}:${[...names].sort().join(',')}${source}`;
  }

  function hydrateCanonicalMap(
    root: THREE.Group,
    variant: GarageVariant,
  ): void {
    const key = variant.architecture;
    if (typeof document === 'undefined'
        || key === 'field_shed' || mapStages.has(key) || pendingStages.has(key)) return;
    const request = import('../world/garageMapStage.ts')
      .then(({ createGarageMapStage }) => createGarageMapStage(engineCtx, variant.mapId))
      .then(async (stage) => {
        if (disposed) {
          stage.dispose();
          return;
        }
        mapStages.set(key, stage);
        // The slice is assembled off-scene, then revealed one draw owner per
        // frame. Attaching the complete terrain/landmark/tree set at once made
        // ANGLE upload every buffer in one presentation frame (a repeatable
        // 458 ms first visit on Frosthollow).
        const reveal = [...stage.group.children];
        for (const child of reveal) child.visible = false;
        root.add(stage.group);
        requestRender();
        for (const child of reveal) {
          if (disposed) break;
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          child.visible = true;
          requestRender();
        }
        if (disposed) {
          stage.dispose();
          return;
        }
        Object.assign(root.userData, stage.stats);
        refreshRootStats(root, key);
        requestRender();
        if (active === root) {
          Object.assign(group.userData, root.userData, {
            key,
            mapId: variant.mapId,
            cached: cache.size,
          });
        }
      })
      .catch((error) => {
        root.userData.ready = false;
        root.userData.source = 'loading';
        root.userData.error = String(error);
        console.error(`[garageArchitecture] ${variant.mapId} staging slice failed`, error);
      })
      .finally(() => pendingStages.delete(key));
    pendingStages.set(key, request);
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
    active.userData.mapId = variant.mapId;
    hydrateCanonicalMap(active, variant);
    material.accent.color.setHex(variant.accent);
    material.ground.color.setHex(variant.floorTint).offsetHSL(0, -0.06, 0.04);
    material.glow.color.setHex(variant.lightTint);
    const stats: GarageArchitectureStats = {
      key: variant.architecture,
      mapId: variant.mapId,
      mode: active.userData.mode,
      signature: String(active.userData.signature),
      objects: Number(active.userData.objects),
      triangles: Number(active.userData.triangles),
      cached: cache.size,
      enclosingSurfaces: Number(active.userData.enclosingSurfaces || 0),
      ready: active.userData.ready === true,
      source: active.userData.source || 'loading',
      sourceCoordinate: active.userData.sourceCoordinate || null,
      sourceBeat: active.userData.sourceBeat || '',
      sourceStructure: active.userData.sourceStructure || '',
      sourceLandmarkLocal: active.userData.sourceLandmarkLocal || null,
      terrainVertices: Number(active.userData.terrainVertices || 0),
      treeSpecies: active.userData.treeSpecies || [],
      trees: Number(active.userData.trees || 0),
    };
    Object.assign(group.userData, stats);
    return stats;
  }

  return {
    group,
    setVariant,
    stats: (): GarageArchitectureStats => ({
      key: group.userData.key || 'field_shed',
      mapId: group.userData.mapId || 'verdant',
      mode: group.userData.mode || 'verdant-workshop',
      signature: group.userData.signature || '',
      objects: group.userData.objects || 0,
      triangles: group.userData.triangles || 0,
      cached: cache.size,
      enclosingSurfaces: group.userData.enclosingSurfaces || 0,
      ready: group.userData.ready === true,
      source: group.userData.source || 'loading',
      sourceCoordinate: group.userData.sourceCoordinate || null,
      sourceBeat: group.userData.sourceBeat || '',
      sourceStructure: group.userData.sourceStructure || '',
      sourceLandmarkLocal: group.userData.sourceLandmarkLocal || null,
      terrainVertices: group.userData.terrainVertices || 0,
      treeSpecies: group.userData.treeSpecies || [],
      trees: group.userData.trees || 0,
    }),
    dispose() {
      disposed = true;
      group.removeFromParent();
      for (const stage of mapStages.values()) stage.dispose();
      mapStages.clear();
      for (const value of disposables) value.dispose?.();
      disposables.length = 0;
      cache.clear();
    },
  };
}
