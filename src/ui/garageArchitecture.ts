// Verdant keeps the authored indoor motor pool. Every other selection owns no
// substitute architecture at all: main.ts mounts the actual battlefield and
// seats the Garage at its clear deployment coordinate.
import * as THREE from 'three';
import type { GarageVariant } from '../game/garageVariants.ts';

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
  source: 'verdant-workshop' | 'active-battlefield';
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
  _requestRender: () => void = () => {},
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
    accent: track(shadow(new THREE.MeshStandardMaterial({ color: 0xc99b35, roughness: 0.60, metalness: 0.25 }))),
  };
  const geometry = {
    box: track(new THREE.BoxGeometry(1, 1, 1)),
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

  function openStage(root: THREE.Group): void {
    root.userData.mode = 'map-staging';
    root.userData.enclosingSurfaces = 0;
    root.userData.ready = true;
    root.userData.source = 'active-battlefield';
    root.userData.sourceBeat = 'player-deployment';
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
      openStage(root);
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
    root.userData.signature = `${key}:${objects}:${[...names].sort().join(',')}`;
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
    material.accent.color.setHex(variant.accent);
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
      source: active.userData.source || 'active-battlefield',
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
      source: group.userData.source || 'active-battlefield',
      sourceCoordinate: group.userData.sourceCoordinate || null,
      sourceBeat: group.userData.sourceBeat || '',
      sourceStructure: group.userData.sourceStructure || '',
      sourceLandmarkLocal: group.userData.sourceLandmarkLocal || null,
      terrainVertices: group.userData.terrainVertices || 0,
      treeSpecies: group.userData.treeSpecies || [],
      trees: group.userData.trees || 0,
    }),
    dispose() {
      group.removeFromParent();
      for (const value of disposables) value.dispose?.();
      disposables.length = 0;
      cache.clear();
    },
  };
}
