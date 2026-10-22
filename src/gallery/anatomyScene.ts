// Gallery anatomy scene: the combat armor model drawn as real geometry in the combat frames.
//
// Node-runnable (Three.js only, no DOM, no WebGL): the fleet receipt builds this exact scene for every vehicle and
// checks it against the sim. Frames follow createCombatFrames: hull → turret (pivot, yaw) → trunnion (gun pivot,
// pitch) → gun-follow, plus the roof-weapon mount, so presentation-only rig scales never move a drawn part.
import * as THREE from 'three';
import {
  TRACK_MODULES, armorSurfaces, crewStations, hullFloorY, moduleParts, plateMetricMm,
  type AnatomyArmor, type AnatomyShape, type ArmorSurface, type CrewStation, type ModulePart,
} from './anatomyData.ts';
import { ARMOR_LAYER_COLORS, armorRampRgb, type ArmorMetric } from './anatomyPalette.ts';
import { techLineMaterial, techMaterial, type TechMaterial } from './anatomyMaterials.ts';
import { buildModuleModel } from './anatomyModules.ts';
import { buildCrewModel } from './anatomyCrew.ts';

interface AnatomyFrames {
  root: THREE.Group;
  hull: THREE.Group;
  turret: THREE.Group;
  trunnion: THREE.Group;
  gun: THREE.Group;
  roofGun: THREE.Group | null;
}

function createAnatomyFrames(armor: AnatomyArmor): AnatomyFrames {
  const root = new THREE.Group();
  root.name = 'gallery_anatomy';
  const hull = new THREE.Group(), turret = new THREE.Group(), trunnion = new THREE.Group(), gun = new THREE.Group();
  hull.name = 'anatomy_frame_hull'; turret.name = 'anatomy_frame_turret';
  trunnion.name = 'anatomy_frame_trunnion'; gun.name = 'anatomy_frame_gun';
  root.add(hull); hull.add(turret); turret.add(trunnion); trunnion.add(gun);
  turret.position.fromArray(armor.turretPivot || [0, 0, 0]);
  trunnion.position.fromArray(armor.gunPivot || [0, 0, 0]);
  gun.position.copy(trunnion.position).negate();
  let roofGun: THREE.Group | null = null;
  if (armor.roofGun) {
    const mount = armor.roofGun;
    const frame = new THREE.Group();
    frame.name = 'anatomy_frame_roof_mount';
    frame.position.fromArray(mount.position);
    frame.quaternion.fromArray(mount.rotation);
    frame.scale.fromArray(mount.scale);
    roofGun = new THREE.Group();
    roofGun.name = 'anatomy_frame_roof_gun';
    roofGun.position.fromArray(mount.pivot);
    frame.add(roofGun);
    (mount.owner === 'turret' ? turret : hull).add(frame);
  }
  return { root, hull, turret, trunnion, gun, roofGun };
}

function frameGroup(frames: AnatomyFrames, frame: string): THREE.Object3D {
  if (frame === 'roofGun') return frames.roofGun || frames.hull;
  if (frame === 'trunnion') return frames.trunnion;
  if (frame === 'gun') return frames.gun;
  if (frame === 'turret') return frames.turret;
  return frames.hull;
}

/** What a pick on a drawn anatomy object refers to. */
export type AnatomyPick =
  | { kind: 'armor'; surface: ArmorSurface; index: number }
  | { kind: 'module'; part: ModulePart }
  | { kind: 'crew'; station: CrewStation }
  | { kind: 'barrel'; lengthM: number; radiusM: number };

export interface AnatomyToggles {
  armor: boolean;
  addOns: boolean;
  modules: boolean;
  crew: boolean;
  hits: boolean;
}

interface AnatomySceneOptions {
  caliberMm: number;
  modern: boolean;
  metric?: ArmorMetric;
  eraSpent?: ReadonlySet<string>;
}

interface ArmorMesh {
  mesh: THREE.Mesh;
  owner: Int32Array; // triangle → surface index
  layer: 'main' | 'addOn';
}

const ADD_ON_LAYERS = new Set(['era', 'spaced', 'external', 'housing']);
/** Hit volumes glow lime: apart from every system colour (electronics is cyan) and from the glass shell. */
export const HIT_VOLUME_COLOR = '#b6ff4d';
const SUPPORT_MODULES = new Set(['ammoRack', 'autoloader', 'fuelTank', 'engine', 'transmission', 'feedSystem']);
/** A module counts as under a crew member only if its top leaves at least a seated body's height below the head. */
const CREW_SUPPORT_HEADROOM_M = 0.62;
const STATE_YELLOW = new THREE.Color('#ffd15c');
const STATE_RED = new THREE.Color('#ff5a4e');

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function surfaceRgb(surface: ArmorSurface, metric: ArmorMetric): [number, number, number] {
  if (surface.layer === 'main') return armorRampRgb(plateMetricMm(surface.plate, metric));
  const hex = ARMOR_LAYER_COLORS[surface.layer as keyof typeof ARMOR_LAYER_COLORS];
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function hitShapeGeometry(shape: AnatomyShape): THREE.BufferGeometry {
  if (shape.kind === 'ellipsoid') {
    return new THREE.SphereGeometry(1, 20, 12).scale(shape.radii[0], shape.radii[1], shape.radii[2])
      .translate(shape.center[0], shape.center[1], shape.center[2]);
  }
  if (shape.kind === 'ellipticCylinder') {
    const geometry = new THREE.CylinderGeometry(1, 1, shape.halfLength * 2, 28);
    // Perpendicular radii are indexed by ascending coordinate axis (armor.ts), as in combatHitboxes.ts.
    geometry.scale(shape.radii[0], 1, shape.radii[1]);
    if (shape.axis === 0) geometry.rotateZ(-Math.PI / 2);
    if (shape.axis === 2) geometry.rotateX(Math.PI / 2);
    return geometry.translate(shape.center[0], shape.center[1], shape.center[2]);
  }
  const a = new THREE.Vector3(...shape.a), b = new THREE.Vector3(...shape.b);
  const delta = b.clone().sub(a), length = delta.length();
  const geometry = new THREE.CapsuleGeometry(shape.radius, Math.max(length, 1e-4), 6, 14);
  if (length > 1e-9) geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.divideScalar(length)));
  return geometry.translate((shape.a[0] + shape.b[0]) / 2, (shape.a[1] + shape.b[1]) / 2, (shape.a[2] + shape.b[2]) / 2);
}

const HIT_VERTEX = /* glsl */ `
#include <common>
varying vec3 vViewPosition;
varying vec3 vHitNormal;
void main() {
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <project_vertex>
  vViewPosition = -mvPosition.xyz;
  vHitNormal = normalize(transformedNormal);
}
`;
const HIT_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying vec3 vViewPosition;
varying vec3 vHitNormal;
void main() {
  float facing = abs(dot(normalize(vHitNormal), normalize(vViewPosition)));
  float rim = pow(1.0 - facing, 2.0);
  gl_FragColor = vec4(uColor, clamp((0.06 + 0.62 * rim) * uStrength, 0.0, 1.0));
  #include <colorspace_fragment>
}
`;

function hitMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(HIT_VOLUME_COLOR) }, uStrength: { value: 1 } },
    vertexShader: HIT_VERTEX, fragmentShader: HIT_FRAGMENT,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

export interface AnatomyScene {
  frames: AnatomyFrames;
  surfaces: ArmorSurface[];
  parts: ModulePart[];
  stations: CrewStation[];
  groups: { armor: THREE.Group; addOns: THREE.Group; modules: THREE.Group; crew: THREE.Group; hits: THREE.Group; barrel: THREE.Group };
  pickables: THREE.Object3D[];
  /** World-space anchor of each module part and crew station (for screen badges). */
  anchors: Array<{ key: string; pick: AnatomyPick; object: THREE.Object3D; local: THREE.Vector3 }>;
  metric: ArmorMetric;
  setMetric(metric: ArmorMetric): void;
  setToggles(toggles: Partial<AnatomyToggles>): void;
  toggles(): AnatomyToggles;
  /** Read the live articulation from the exterior rig (turret yaw, gun pitch). */
  syncPose(turretYaw: number, gunPitch: number): void;
  pick(intersection: THREE.Intersection): AnatomyPick | null;
  select(pick: AnatomyPick | null): void;
  /** Dim every part but the hovered or selected one. */
  isolate(pick: AnatomyPick | null): void;
  /** Tint damaged (yellow) and disabled (red) modules and crew; state never replaces identity in the legend. */
  setStates(state: (pick: AnatomyPick) => 'ok' | 'yellow' | 'red' | 'removed'): void;
  /** Frame-local centroid of a named plate's drawn surface and its frame object, for effects anchored on it. */
  plateCenter(name: string): { object: THREE.Object3D; local: THREE.Vector3 } | null;
  stats(): { triangles: number; moduleTriangles: number; crewTriangles: number; drawables: number };
  dispose(): void;
}

export function buildAnatomyScene(armor: AnatomyArmor, options: AnatomySceneOptions): AnatomyScene {
  const frames = createAnatomyFrames(armor);
  const disposables: Array<{ dispose(): void }> = [];
  const pickables: THREE.Object3D[] = [];
  const anchors: AnatomyScene['anchors'] = [];
  let metric: ArmorMetric = options.metric || 'ke';
  const groups = {
    armor: new THREE.Group(), addOns: new THREE.Group(), modules: new THREE.Group(), crew: new THREE.Group(), hits: new THREE.Group(),
    barrel: new THREE.Group(),
  };
  for (const [name, group] of Object.entries(groups)) group.name = `anatomy_${name}`;
  // Category groups live inside each frame; one holder per (frame, category) keeps toggling a visibility flip.
  const holders = new Map<string, THREE.Group>();
  const holder = (category: keyof typeof groups, frame: string): THREE.Group => {
    const key = `${category}:${frame}`;
    let group = holders.get(key);
    if (!group) {
      group = new THREE.Group();
      group.name = `anatomy_${category}_${frame}`;
      frameGroup(frames, frame).add(group);
      holders.set(key, group);
    }
    return group;
  };

  // --- armor heat map --------------------------------------------------------------------------------------------
  const surfaces = armorSurfaces(armor, options.eraSpent);
  const armorMeshes: ArmorMesh[] = [];
  const mainMaterial = techMaterial({ vertexColors: true, flat: true });
  // Plates are one-sided in the sim (a shell strikes the outward face only): draw them that way, add-ons included.
  const addOnMaterial = techMaterial({ vertexColors: true, flat: true, opacity: 0.62, polygonOffset: -1 });
  const seamMaterial = techLineMaterial('#0b0e11', 0.5);
  const addOnSeamMaterial = techLineMaterial('#e4d8ff', 0.34);
  disposables.push(mainMaterial, addOnMaterial, seamMaterial, addOnSeamMaterial);
  for (const frame of ['hull', 'turret', 'gun'] as const) {
    for (const layer of ['main', 'addOn'] as const) {
      const indices = surfaces.map((surface, index) => ({ surface, index }))
        .filter(({ surface }) => surface.frame === frame && (layer === 'addOn') === ADD_ON_LAYERS.has(surface.layer));
      if (!indices.length) continue;
      const triangles = indices.reduce((sum, { surface }) => sum + surface.positions.length / 9, 0);
      const positions = new Float32Array(triangles * 9);
      const surfaceIds = new Float32Array(triangles * 3);
      const owner = new Int32Array(triangles);
      let triangle = 0;
      for (const { surface, index } of indices) {
        for (let offset = 0; offset < surface.positions.length; offset += 9, triangle += 1) {
          positions.set(surface.positions.slice(offset, offset + 9), triangle * 9);
          surfaceIds.fill(index, triangle * 3, triangle * 3 + 3);
          owner[triangle] = index;
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(triangles * 9), 3));
      geometry.setAttribute('aSurface', new THREE.BufferAttribute(surfaceIds, 1));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, layer === 'main' ? mainMaterial : addOnMaterial);
      mesh.name = `anatomy_armor_${frame}_${layer}`;
      mesh.userData.anatomyArmor = true;
      holder(layer === 'main' ? 'armor' : 'addOns', frame).add(mesh);
      const seams = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 24), layer === 'main' ? seamMaterial : addOnSeamMaterial);
      seams.name = `${mesh.name}_seams`;
      seams.raycast = () => {};
      holder(layer === 'main' ? 'armor' : 'addOns', frame).add(seams);
      disposables.push(geometry, seams.geometry);
      armorMeshes.push({ mesh, owner, layer });
      pickables.push(mesh);
    }
  }
  function paintArmor(): void {
    for (const { mesh, owner } of armorMeshes) {
      const color = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
      const array = color.array as Float32Array;
      for (let triangle = 0; triangle < owner.length; triangle += 1) {
        const rgb = surfaceRgb(surfaces[owner[triangle]], metric).map(srgbToLinear);
        for (let vertex = 0; vertex < 3; vertex += 1) array.set(rgb, (triangle * 3 + vertex) * 3);
      }
      color.needsUpdate = true;
    }
  }
  paintArmor();

  // The gun barrel: the trunnion-frame cylinder traceGunBarrel tests (a module hit, drawn in the armor view).
  let barrelMesh: THREE.Mesh | null = null;
  if (armor.gunBarrel && armor.gunBarrel.collision !== false) {
    const { lengthM, radiusM } = armor.gunBarrel;
    const geometry = new THREE.CylinderGeometry(radiusM, radiusM, lengthM, 24, 1, false);
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, 0, lengthM / 2);
    // A glass tube with its bore axis drawn through it (the Gallery follow-up of 2026-10-21: the opaque hit cylinder read
    // as a solid cone over the crew in close-ups); the tube keeps the exact tested radius and length.
    const material = techMaterial({ color: '#8d9aa5', opacity: 0.3 });
    barrelMesh = new THREE.Mesh(geometry, material);
    barrelMesh.name = 'anatomy_barrel';
    barrelMesh.renderOrder = 2;
    barrelMesh.userData.anatomyPick = { kind: 'barrel', lengthM, radiusM } satisfies AnatomyPick;
    const axisGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, lengthM)]);
    const axisMaterial = techLineMaterial('#dbe5ec', 0.9);
    const axis = new THREE.Line(axisGeometry, axisMaterial);
    axis.name = 'anatomy_barrel_axis';
    barrelMesh.add(axis);
    // Every anatomy layer shows the barrel: inside the glass shell it is the gun's real reference line.
    holder('barrel', 'trunnion').add(barrelMesh);
    pickables.push(barrelMesh);
    disposables.push(geometry, material, axisGeometry, axisMaterial);
  }

  // --- modules ---------------------------------------------------------------------------------------------------
  const parts = moduleParts(armor);
  const moduleItems: Array<{ part: ModulePart; group: THREE.Group; materials: TechMaterial[] }> = [];
  let moduleTriangles = 0;
  for (const part of parts) {
    if (TRACK_MODULES.has(part.module)) continue;
    const model = buildModuleModel(part, { caliberMm: options.caliberMm, modern: options.modern });
    const pick: AnatomyPick = { kind: 'module', part };
    model.group.traverse((object) => { if (object instanceof THREE.Mesh) { object.userData.anatomyPick = pick; pickables.push(object); } });
    holder('modules', part.frame).add(model.group);
    disposables.push(...model.geometries, ...model.materials);
    moduleItems.push({ part, group: model.group, materials: model.materials });
    moduleTriangles += model.triangles;
    // The badge floats just above the part, so it labels the model without covering it.
    anchors.push({ key: `module:${part.index}:${part.part}`, pick, object: model.group,
      local: new THREE.Vector3(0, (part.max[1] - part.min[1]) / 2 + 0.14, 0) });
  }

  // --- crew ------------------------------------------------------------------------------------------------------
  const stations = crewStations(armor);
  const floor = hullFloorY(armor);
  const turretY = Number(armor.turretPivot?.[1] || 0);
  const crewItems: Array<{ station: CrewStation; group: THREE.Group; materials: TechMaterial[] }> = [];
  let crewTriangles = 0;
  // A station's floor is the hull-shell floor, or the top of a stowage or powerplant module directly under the
  // station (an AZ carousel under the turret crew): the boots rest on it instead of passing through it.
  const pivot = armor.turretPivot || [0, 0, 0];
  const supports = parts.filter((part) => SUPPORT_MODULES.has(part.module) && (part.frame === 'hull' || part.frame === 'turret'));
  const stationFloor = (station: CrewStation): number => {
    const offset = station.frame === 'turret' ? pivot : [0, 0, 0];
    const head = [station.head[0] + Number(offset[0]), station.head[1] + Number(offset[1]), station.head[2] + Number(offset[2])];
    let support = floor;
    for (const part of supports) {
      const shift = part.frame === 'turret' ? pivot : [0, 0, 0];
      const min = part.min.map((value, axis) => value + Number(shift[axis]));
      const max = part.max.map((value, axis) => value + Number(shift[axis]));
      const under = [0, 0.3].some((ahead) => head[0] >= min[0] && head[0] <= max[0] && head[2] + ahead >= min[2] && head[2] + ahead <= max[2]);
      if (under && max[1] < head[1] - CREW_SUPPORT_HEADROOM_M) support = Math.max(support, max[1]);
    }
    return support;
  };
  // Inside the exact hull shell: a point inside any hull or turret collision cell (face planes, 2 cm tolerance), with the
  // turret at rest. Crew poses keep their legs inside it.
  const cellContains = (cell: { min?: readonly number[]; max?: readonly number[]; faces?: ReadonlyArray<{ normal?: readonly number[]; constant?: number }> }, point: readonly number[]) =>
    !!cell.min && !!cell.max && [0, 1, 2].every((axis) => point[axis] >= cell.min![axis] - 0.02 && point[axis] <= cell.max![axis] + 0.02)
    && (cell.faces || []).every((face) => !face.normal || !Number.isFinite(face.constant)
      || face.normal[0] * point[0] + face.normal[1] * point[1] + face.normal[2] * point[2] + Number(face.constant) <= 0.02);
  const hullCells = (armor.collisionShells?.hull || []) as unknown as Parameters<typeof cellContains>[0][];
  const turretCells = (armor.collisionShells?.turret || []) as unknown as Parameters<typeof cellContains>[0][];
  const insideShell = (frame: string) => (point: readonly [number, number, number]) => {
    const hullPoint = frame === 'turret' ? point.map((value, axis) => value + Number(pivot[axis])) : point;
    const turretPoint = frame === 'turret' ? point : point.map((value, axis) => value - Number(pivot[axis]));
    return hullCells.some((cell) => cellContains(cell, hullPoint)) || turretCells.some((cell) => cellContains(cell, turretPoint));
  };
  for (const station of stations) {
    const supportY = stationFloor(station);
    const frameFloor = station.frame === 'hull' ? supportY : supportY - turretY;
    const model = buildCrewModel(station, frameFloor, station.frame === 'hull' || station.frame === 'turret' ? insideShell(station.frame) : undefined);
    const pick: AnatomyPick = { kind: 'crew', station };
    model.group.traverse((object) => { if (object instanceof THREE.Mesh) { object.userData.anatomyPick = pick; pickables.push(object); } });
    holder('crew', station.frame).add(model.group);
    disposables.push(...model.geometries, ...model.materials);
    crewItems.push({ station, group: model.group, materials: model.materials });
    crewTriangles += model.triangles;
    anchors.push({ key: `crew:${station.index}`, pick, object: model.group,
      local: new THREE.Vector3(station.head[0], station.head[1] + 0.2, station.head[2]) });
  }

  // --- exact hit volumes -----------------------------------------------------------------------------------------
  const hitFill = hitMaterial();
  disposables.push(hitFill);
  const addHit = (shape: AnatomyShape, frame: string, pick: AnatomyPick) => {
    const geometry = hitShapeGeometry(shape);
    const mesh = new THREE.Mesh(geometry, hitFill);
    mesh.name = `anatomy_hit_${pick.kind}`;
    mesh.userData.anatomyHit = { shape, pick };
    mesh.raycast = () => {};
    mesh.renderOrder = 6;
    holder('hits', frame).add(mesh);
    disposables.push(geometry);
  };
  for (const part of parts) for (const shape of part.shapes) addHit(shape, part.frame, { kind: 'module', part });
  for (const station of stations) for (const shape of station.shapes) addHit(shape, station.frame, { kind: 'crew', station });
  if (armor.gunBarrel && armor.gunBarrel.collision !== false && barrelMesh) {
    const { lengthM, radiusM } = armor.gunBarrel;
    const geometry = new THREE.CylinderGeometry(radiusM, radiusM, lengthM, 20, 1, true).rotateX(Math.PI / 2).translate(0, 0, lengthM / 2);
    const mesh = new THREE.Mesh(geometry, hitFill);
    mesh.name = 'anatomy_hit_barrel';
    mesh.raycast = () => {};
    holder('hits', 'trunnion').add(mesh);
    disposables.push(geometry);
  }

  let toggles: AnatomyToggles = { armor: true, addOns: true, modules: true, crew: true, hits: false };
  function applyToggles(): void {
    for (const [key, group] of holders) {
      const category = key.split(':')[0];
      group.visible = category === 'barrel' ? true : toggles[category as keyof AnatomyToggles];
    }
  }
  applyToggles();

  let selected: AnatomyPick | null = null;
  let isolated: AnatomyPick | null = null;
  const samePick = (a: AnatomyPick | null, b: AnatomyPick | null): boolean => {
    if (!a || !b || a.kind !== b.kind) return false;
    if (a.kind === 'armor' && b.kind === 'armor') return a.index === b.index;
    if (a.kind === 'module' && b.kind === 'module') return a.part.index === b.part.index;
    if (a.kind === 'crew' && b.kind === 'crew') return a.station.index === b.station.index;
    return a.kind === 'barrel';
  };
  function refreshEmphasis(): void {
    const focus = isolated || selected;
    for (const material of [mainMaterial, addOnMaterial]) material.uniforms.uSelected.value = selected?.kind === 'armor' ? selected.index : -1;
    for (const item of moduleItems) {
      const on = samePick(selected, { kind: 'module', part: item.part });
      const dim = !!focus && focus.kind !== 'armor' && !samePick(focus, { kind: 'module', part: item.part });
      for (const material of item.materials) { material.uniforms.uHighlight.value = on ? 1 : 0; material.uniforms.uDim.value = dim ? 1 : 0; }
    }
    for (const item of crewItems) {
      const on = samePick(selected, { kind: 'crew', station: item.station });
      const dim = !!focus && focus.kind !== 'armor' && !samePick(focus, { kind: 'crew', station: item.station });
      for (const material of item.materials) { material.uniforms.uHighlight.value = on ? 1 : 0; material.uniforms.uDim.value = dim ? 1 : 0; }
    }
  }

  return {
    frames, surfaces, parts, stations, groups, pickables, anchors,
    get metric() { return metric; },
    setMetric(next) { if (next !== metric) { metric = next; paintArmor(); } },
    setToggles(next) { toggles = { ...toggles, ...next }; applyToggles(); },
    toggles: () => ({ ...toggles }),
    syncPose(turretYaw, gunPitch) {
      frames.turret.rotation.y = turretYaw;
      frames.trunnion.rotation.x = -gunPitch;
    },
    pick(intersection) {
      const object = intersection.object;
      if (object.userData.anatomyArmor) {
        const owner = armorMeshes.find((entry) => entry.mesh === object)?.owner;
        const index = owner && intersection.faceIndex !== undefined && intersection.faceIndex !== null ? owner[intersection.faceIndex] : -1;
        return index >= 0 ? { kind: 'armor', surface: surfaces[index], index } : null;
      }
      return (object.userData.anatomyPick as AnatomyPick | undefined) || null;
    },
    select(pick) { selected = pick; refreshEmphasis(); },
    setStates(state) {
      const tint = (materials: TechMaterial[], value: string) => {
        for (const material of materials) {
          material.userData.anatomyBaseColor ||= material.uniforms.uColor.value.clone();
          const base = material.userData.anatomyBaseColor as THREE.Color;
          if (value === 'yellow') material.uniforms.uColor.value.copy(base).lerp(STATE_YELLOW, 0.7);
          else if (value === 'red') material.uniforms.uColor.value.copy(base).lerp(STATE_RED, 0.78);
          else material.uniforms.uColor.value.copy(base);
        }
      };
      for (const item of moduleItems) tint(item.materials, state({ kind: 'module', part: item.part }));
      for (const item of crewItems) tint(item.materials, state({ kind: 'crew', station: item.station }));
    },
    plateCenter(name) {
      const index = surfaces.findIndex((surface) => surface.plate.name === name);
      if (index < 0) return null;
      const surface = surfaces[index];
      const local = new THREE.Vector3();
      const count = surface.positions.length / 3;
      for (let offset = 0; offset < surface.positions.length; offset += 3) {
        local.x += surface.positions[offset] / count;
        local.y += surface.positions[offset + 1] / count;
        local.z += surface.positions[offset + 2] / count;
      }
      return { object: frameGroup(frames, surface.frame), local };
    },
    isolate(pick) { isolated = pick; refreshEmphasis(); },
    stats() {
      let triangles = 0, drawables = 0;
      frames.root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        drawables += 1;
        const geometry = object.geometry as THREE.BufferGeometry;
        const count = (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
        triangles += object instanceof THREE.InstancedMesh ? count * object.count : count;
      });
      return { triangles, moduleTriangles, crewTriangles, drawables };
    },
    dispose() {
      frames.root.removeFromParent();
      for (const item of disposables) item.dispose();
      disposables.length = 0;
      pickables.length = 0;
      anchors.length = 0;
    },
  };
}
