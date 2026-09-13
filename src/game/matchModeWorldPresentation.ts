import * as THREE from 'three';

import type { MatchModePresentationState, ObjectiveTeam } from '../sim/matchModes.ts';

const ALLY = 0x6fe887;
const ENEMY = 0xf26a62;
const NEUTRAL = 0xe7edf1;
const AMBER = 0xf3a536;
const HEAL = 0x65e68a;
const MAX_PICKUPS = 12;

interface MarkerGroup extends THREE.Group {
  userData: {
    markerMaterial?: THREE.MeshBasicMaterial;
    heal?: THREE.Object3D;
    ammo?: THREE.Object3D;
  };
}

export interface MatchModeWorldPresentation {
  readonly root: THREE.Group;
  update(state: MatchModePresentationState | null, timeS: number): void;
  dispose(): void;
}

/** campaign slice 3 (2026-09-12): ground fit for dressing that spreads beyond an objective centre. */
export interface MatchModeWorldPresentationOptions {
  groundHeight?: (x: number, z: number) => number;
  /**
   * Engine hook folding a lit material into the cascaded-shadow setup; a lit
   * material outside it is struck by every cascade light at once and blows
   * out. Objective markers stay unlit and never need it.
   */
  setupMaterial?: (material: THREE.Material) => void;
  releaseMaterial?: (material: THREE.Material) => void;
}

export interface WorksPlacement { x: number; y: number; z: number; yaw: number }

export interface LineWorksPlan {
  lines: number;
  bags: WorksPlacement[];
  planks: WorksPlacement[];
  posts: WorksPlacement[];
  pickets: WorksPlacement[];
  crates: WorksPlacement[];
  /** wire strands as flat xyz segment pairs */
  wire: number[];
}

// campaign slice 3 (2026-09-12): each Frontline Assault sector is dressed as a
// trench line — a sandbag parapet in a shallow chevron facing the attackers,
// a timber revetment on posts behind it, ammunition crates in its lee and a
// picket-and-wire belt out front. Lit, shadow-casting, instanced; planned
// once per sector layout and refilled only when a new match lays new sectors.
export const LINE_WORKS = Object.freeze({
  lines: 3,
  bagCourses: 3,
  bagsPerWing: 10,
  planksPerLine: 6,
  postsPerLine: 8,
  picketsPerLine: 7,
  cratesPerLine: 4,
  wireSegmentsPerLine: 24,
  bagSize: [0.62, 0.26, 0.40] as const,
  plankSize: [1.9, 0.85, 0.08] as const,
  postSize: [0.12, 1.25, 0.12] as const,
  picketSize: [0.07, 1.25, 0.07] as const,
  crateSize: [0.9, 0.5, 0.5] as const,
  parapetAheadM: 4.0,
  revetmentAheadM: 1.6,
  wireAheadM: 11.0,
  wingSweepRad: 0.35,
});
const BAGS_PER_LINE = 2 * LINE_WORKS.bagCourses * LINE_WORKS.bagsPerWing;

/** Deterministic 0..1 jitter so a sector layout always dresses the same way. */
function worksJitter(seed: number): number {
  const v = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** Yaw that lays a box's long (x) axis along the world direction (dx, dz). */
const yawAlong = (dx: number, dz: number): number => Math.atan2(-dz, dx);

export function planLineWorks(
  zones: ReadonlyArray<{ x: number; y: number; z: number }>,
  groundHeight?: (x: number, z: number) => number,
): LineWorksPlan {
  const lines = zones.slice(0, LINE_WORKS.lines);
  const plan: LineWorksPlan = {
    lines: lines.length, bags: [], planks: [], posts: [], pickets: [], crates: [], wire: [],
  };
  if (!lines.length) return plan;
  const first = lines[0];
  const last = lines[lines.length - 1];
  let ax = last.x - first.x;
  let az = last.z - first.z;
  const axisLength = Math.hypot(ax, az);
  if (axisLength < 1e-6) { ax = 1; az = 0; } else { ax /= axisLength; az /= axisLength; }
  const lx = -az;
  const lz = ax;
  for (const [index, zone] of lines.entries()) {
    const ground = (x: number, z: number): number =>
      groundHeight ? groundHeight(x, z) : zone.y - 0.12;
    const seed = index * 131;
    // sandbag parapet: apex toward the attackers (-axis), wings sweeping back
    const px = zone.x - ax * LINE_WORKS.parapetAheadM;
    const pz = zone.z - az * LINE_WORKS.parapetAheadM;
    const sweepCos = Math.cos(LINE_WORKS.wingSweepRad);
    const sweepSin = Math.sin(LINE_WORKS.wingSweepRad);
    for (const wing of [-1, 1]) {
      const dx = lx * wing * sweepCos + ax * sweepSin;
      const dz = lz * wing * sweepCos + az * sweepSin;
      const yaw = yawAlong(dx, dz);
      for (let course = 0; course < LINE_WORKS.bagCourses; course++) {
        for (let j = 0; j < LINE_WORKS.bagsPerWing; j++) {
          const s = 0.5 + j * 0.66 + (course % 2) * 0.33;
          const n = seed + wing * 7 + course * 29 + j;
          const x = px + dx * s + (worksJitter(n) - 0.5) * 0.06;
          const z = pz + dz * s + (worksJitter(n + 0.5) - 0.5) * 0.06;
          plan.bags.push({
            x, y: ground(x, z) + 0.10 + course * 0.19, z,
            yaw: yaw + (worksJitter(n + 0.25) - 0.5) * 0.16,
          });
        }
      }
    }
    // timber revetment: planks on posts a stride behind the parapet
    const rx = zone.x - ax * LINE_WORKS.revetmentAheadM;
    const rz = zone.z - az * LINE_WORKS.revetmentAheadM;
    const plankYaw = yawAlong(lx, lz);
    for (const wing of [-1, 1]) {
      for (let j = 0; j < 3; j++) {
        const s = wing * (1.0 + j * 1.95);
        const x = rx + lx * s;
        const z = rz + lz * s;
        plan.planks.push({ x, y: ground(x, z) + 0.45, z, yaw: plankYaw });
      }
      for (let j = 0; j < 4; j++) {
        const s = wing * (0.05 + j * 1.95);
        const x = rx + lx * s;
        const z = rz + lz * s;
        plan.posts.push({ x, y: ground(x, z) + 0.62, z, yaw: plankYaw });
      }
    }
    // ammunition crates in the lee of the revetment
    const cx = zone.x + ax * 1.2;
    const cz = zone.z + az * 1.2;
    const crateSpots: ReadonlyArray<readonly [number, number, number]> = [
      [-0.55, 0.25, 0], [0.55, 0.25, 0.12], [-0.5, 0.75, 0.3], [0.5, 0.75, -0.25],
    ];
    for (const [s, h, twist] of crateSpots) {
      const x = cx + lx * s;
      const z = cz + lz * s;
      plan.crates.push({ x, y: ground(x, z) + h, z, yaw: plankYaw + twist });
    }
    // picket-and-wire belt out front
    const wx = zone.x - ax * LINE_WORKS.wireAheadM;
    const wz = zone.z - az * LINE_WORKS.wireAheadM;
    const picketBases: Array<readonly [number, number, number]> = [];
    for (let j = 0; j < LINE_WORKS.picketsPerLine; j++) {
      const s = (j - (LINE_WORKS.picketsPerLine - 1) / 2) * 2.4;
      const n = seed + 61 + j;
      const x = wx + lx * s + ax * (worksJitter(n) - 0.5) * 0.9;
      const z = wz + lz * s + az * (worksJitter(n) - 0.5) * 0.9;
      const g = ground(x, z);
      picketBases.push([x, g, z]);
      plan.pickets.push({ x, y: g + 0.62, z, yaw: worksJitter(n + 0.7) * Math.PI });
    }
    for (let j = 0; j + 1 < picketBases.length; j++) {
      const [x0, g0, z0] = picketBases[j];
      const [x1, g1, z1] = picketBases[j + 1];
      for (const h of [0.35, 0.72, 1.08]) plan.wire.push(x0, g0 + h, z0, x1, g1 + h, z1);
      plan.wire.push(x0, g0 + 0.35, z0, x1, g1 + 1.08, z1);
    }
  }
  return plan;
}

function teamColor(team: ObjectiveTeam): number {
  return team === 'alpha' ? ALLY : ENEMY;
}

function basic(color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

/**
 * Low-overhead battlefield markers for objective modes. Geometry is allocated
 * only when a mode first needs it, never casts shadows, and updates retained
 * meshes without allocating in the render loop. Frontline Assault adds lit,
 * instanced trench works per sector (campaign slice 3, 2026-09-12); those do
 * cast shadows, and are planned once per sector layout.
 */
export function createMatchModeWorldPresentation(
  scene: THREE.Scene,
  options: MatchModeWorldPresentationOptions = {},
): MatchModeWorldPresentation {
  const root = new THREE.Group();
  root.name = 'match-mode-objectives';
  root.visible = false;
  root.renderOrder = 2;
  scene.add(root);

  let flagMarkers: MarkerGroup[] | null = null;
  let zoneMarkers: MarkerGroup[] | null = null;
  let ballMarker: THREE.Mesh | null = null;
  let goalMarkers: MarkerGroup[] | null = null;
  let pickupMarkers: MarkerGroup[] | null = null;

  const buildFlags = (): MarkerGroup[] => {
    if (flagMarkers) return flagMarkers;
    const poleGeometry = new THREE.CylinderGeometry(0.11, 0.15, 4.5, 8);
    const bannerGeometry = new THREE.PlaneGeometry(2.8, 1.35);
    const ringGeometry = new THREE.RingGeometry(6.6, 8, 48);
    flagMarkers = (['alpha', 'bravo'] as const).map((team) => {
      const marker = new THREE.Group() as MarkerGroup;
      marker.name = `${team}-flag`;
      const pole = new THREE.Mesh(poleGeometry, basic(0xd6dde2));
      pole.position.y = 2.25;
      const banner = new THREE.Mesh(bannerGeometry, basic(teamColor(team), 0.93));
      banner.position.set(1.45, 3.7, 0);
      const ring = new THREE.Mesh(ringGeometry, basic(teamColor(team), 0.38));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.08;
      marker.add(pole, banner, ring);
      root.add(marker);
      return marker;
    });
    return flagMarkers;
  };

  const buildZones = (): MarkerGroup[] => {
    if (zoneMarkers) return zoneMarkers;
    const ringGeometry = new THREE.RingGeometry(26.5, 30, 64);
    const coreGeometry = new THREE.CylinderGeometry(0.28, 0.55, 7, 10);
    zoneMarkers = Array.from({ length: 3 }, (_, index) => {
      const marker = new THREE.Group() as MarkerGroup;
      marker.name = `capture-zone-${index + 1}`;
      const material = basic(NEUTRAL, 0.4);
      const ring = new THREE.Mesh(ringGeometry, material);
      ring.rotation.x = -Math.PI / 2;
      const core = new THREE.Mesh(coreGeometry, material);
      core.position.y = 3.5;
      marker.userData.markerMaterial = material;
      marker.add(ring, core);
      root.add(marker);
      return marker;
    });
    return zoneMarkers;
  };

  const buildTurbo = (): void => {
    if (!ballMarker) {
      const material = new THREE.MeshStandardMaterial({
        color: 0xe8eef2,
        roughness: 0.28,
        metalness: 0.36,
        emissive: 0x25313a,
        emissiveIntensity: 0.45,
      });
      ballMarker = new THREE.Mesh(new THREE.SphereGeometry(2.2, 20, 14), material);
      ballMarker.name = 'turbo-ball';
      root.add(ballMarker);
    }
    if (!goalMarkers) {
      const torusGeometry = new THREE.TorusGeometry(12, 0.72, 8, 48);
      goalMarkers = (['alpha', 'bravo'] as const).map((team) => {
        const marker = new THREE.Group() as MarkerGroup;
        marker.name = `${team}-turbo-goal`;
        const material = basic(teamColor(team), 0.65);
        const hoop = new THREE.Mesh(torusGeometry, material);
        hoop.position.y = 10;
        marker.userData.markerMaterial = material;
        marker.add(hoop);
        root.add(marker);
        return marker;
      });
    }
  };

  const buildPickups = (): MarkerGroup[] => {
    if (pickupMarkers) return pickupMarkers;
    const shellGeometry = new THREE.CylinderGeometry(0.18, 0.24, 1.35, 8);
    const crossLong = new THREE.BoxGeometry(0.5, 2.1, 0.35);
    const crossWide = new THREE.BoxGeometry(2.1, 0.5, 0.35);
    const shellMaterial = basic(AMBER);
    const healMaterial = basic(HEAL);
    const shellOffsets = [-0.48, 0, 0.48];
    pickupMarkers = Array.from({ length: MAX_PICKUPS }, (_, index) => {
      const marker = new THREE.Group() as MarkerGroup;
      marker.name = `horde-pickup-${index + 1}`;
      const shellGroup = new THREE.Group();
      for (const x of shellOffsets) {
        const shell = new THREE.Mesh(shellGeometry, shellMaterial);
        shell.position.x = x;
        shell.rotation.z = Math.PI;
        shellGroup.add(shell);
      }
      const healGroup = new THREE.Group();
      healGroup.add(
        new THREE.Mesh(crossLong, healMaterial),
        new THREE.Mesh(crossWide, healMaterial),
      );
      const cage = new THREE.Mesh(
        new THREE.OctahedronGeometry(2.05, 0),
        basic(NEUTRAL, 0.26),
      );
      (cage.material as THREE.MeshBasicMaterial).wireframe = true;
      marker.userData.heal = healGroup;
      marker.userData.ammo = shellGroup;
      marker.add(cage, shellGroup, healGroup);
      marker.visible = false;
      root.add(marker);
      return marker;
    });
    return pickupMarkers;
  };


  // campaign slice 3 (2026-09-12): Frontline Assault trench works.
  interface LineWorks {
    group: THREE.Group;
    lines: number;
    signature: string;
    bags: THREE.InstancedMesh;
    planks: THREE.InstancedMesh;
    posts: THREE.InstancedMesh;
    pickets: THREE.InstancedMesh;
    crates: THREE.InstancedMesh;
    wire: THREE.LineSegments;
  }
  let lineWorks: LineWorks | null = null;
  const lit = (color: number, roughness: number, metalness = 0): THREE.MeshStandardMaterial => {
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    options.setupMaterial?.(material);
    return material;
  };

  const buildLineWorks = (lines: number): LineWorks => {
    const group = new THREE.Group();
    group.name = 'line-works';
    const instanced = (
      name: string, size: readonly [number, number, number], material: THREE.Material, count: number,
    ): THREE.InstancedMesh => {
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material, count);
      mesh.name = name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      group.add(mesh);
      return mesh;
    };
    const timber = lit(0x5a4630, 0.9);
    const bags = instanced('line-works-bags', LINE_WORKS.bagSize, lit(0x7d6f4e, 0.96), lines * BAGS_PER_LINE);
    // a flattened capsule lying along x reads as a filled sack, not a brick
    const sack = new THREE.CapsuleGeometry(LINE_WORKS.bagSize[2] * 0.5, LINE_WORKS.bagSize[0] - LINE_WORKS.bagSize[2], 2, 7);
    sack.rotateZ(Math.PI / 2);
    sack.scale(1, LINE_WORKS.bagSize[1] / LINE_WORKS.bagSize[2], 1);
    bags.geometry.dispose();
    bags.geometry = sack;
    const planks = instanced('line-works-planks', LINE_WORKS.plankSize, timber, lines * LINE_WORKS.planksPerLine);
    const posts = instanced('line-works-posts', LINE_WORKS.postSize, timber, lines * LINE_WORKS.postsPerLine);
    const pickets = instanced('line-works-pickets', LINE_WORKS.picketSize, lit(0x3b3c3d, 0.7, 0.45),
      lines * LINE_WORKS.picketsPerLine);
    const crates = instanced('line-works-crates', LINE_WORKS.crateSize, lit(0x5f6a3e, 0.85),
      lines * LINE_WORKS.cratesPerLine);
    const wireGeometry = new THREE.BufferGeometry();
    wireGeometry.setAttribute('position', new THREE.BufferAttribute(
      new Float32Array(lines * LINE_WORKS.wireSegmentsPerLine * 6), 3));
    const wire = new THREE.LineSegments(wireGeometry, new THREE.LineBasicMaterial({ color: 0x2a2724 }));
    wire.name = 'line-works-wire';
    wire.frustumCulled = false;
    group.add(wire);
    root.add(group);
    return { group, lines, signature: '', bags, planks, posts, pickets, crates, wire };
  };

  const worksMatrix = new THREE.Matrix4();
  const worksQuaternion = new THREE.Quaternion();
  const worksPosition = new THREE.Vector3();
  const worksUp = new THREE.Vector3(0, 1, 0);
  const worksUnit = new THREE.Vector3(1, 1, 1);
  const worksColor = new THREE.Color();
  const fillInstances = (mesh: THREE.InstancedMesh, placements: WorksPlacement[], shade = 0): void => {
    for (let i = 0; i < mesh.count; i++) {
      const placement = placements[i];
      if (placement) {
        worksQuaternion.setFromAxisAngle(worksUp, placement.yaw);
        worksPosition.set(placement.x, placement.y, placement.z);
        worksMatrix.compose(worksPosition, worksQuaternion, worksUnit);
      } else {
        worksMatrix.makeScale(0, 0, 0);
      }
      mesh.setMatrixAt(i, worksMatrix);
      if (shade > 0) {
        // per-piece weathering so a wall of sacks or a stack of crates is not one flat tone
        const tone = 1 - shade * 0.5 + worksJitter(i * 3.7 + 0.31) * shade;
        mesh.setColorAt(i, worksColor.setScalar(tone));
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  const fillLineWorks = (works: LineWorks, state: MatchModePresentationState): void => {
    const plan = planLineWorks(state.zones, options.groundHeight);
    fillInstances(works.bags, plan.bags, 0.34);
    fillInstances(works.planks, plan.planks, 0.18);
    fillInstances(works.posts, plan.posts);
    fillInstances(works.pickets, plan.pickets);
    fillInstances(works.crates, plan.crates, 0.24);
    const position = works.wire.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = position.array as Float32Array;
    array.fill(0);
    array.set(plan.wire.slice(0, array.length));
    position.needsUpdate = true;
    works.wire.geometry.computeBoundingSphere();
  };

  const disposeLineWorks = (): void => {
    if (!lineWorks) return;
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    lineWorks.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material && !Array.isArray(mesh.material)) materials.add(mesh.material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) {
      if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial) options.releaseMaterial?.(material);
      material.dispose();
    }
    lineWorks.group.removeFromParent();
    lineWorks = null;
  };

  const updateLineWorks = (state: MatchModePresentationState): void => {
    const lines = Math.min(state.zones.length, LINE_WORKS.lines);
    if (!lines) return;
    if (lineWorks && lineWorks.lines !== lines) disposeLineWorks();
    if (!lineWorks) lineWorks = buildLineWorks(lines);
    const signature = state.zones.slice(0, lines)
      .map((zone) => `${zone.x.toFixed(2)}:${zone.z.toFixed(2)}`).join('|');
    if (lineWorks.signature !== signature) {
      fillLineWorks(lineWorks, state);
      lineWorks.signature = signature;
    }
    lineWorks.group.visible = true;
  };

  const hideAll = (): void => {
    if (lineWorks) lineWorks.group.visible = false;
    if (flagMarkers) for (const marker of flagMarkers) marker.visible = false;
    if (zoneMarkers) for (const marker of zoneMarkers) marker.visible = false;
    if (ballMarker) ballMarker.visible = false;
    if (goalMarkers) for (const marker of goalMarkers) marker.visible = false;
    if (pickupMarkers) for (const marker of pickupMarkers) marker.visible = false;
  };

  const updateFlags = (state: MatchModePresentationState, timeS: number): void => {
    const markers = buildFlags();
    for (const [index, flag] of state.flags.entries()) {
      const marker = markers[index];
      if (!marker) break;
      marker.visible = true;
      marker.position.set(flag.x, flag.y - 2.5, flag.z);
      marker.rotation.y = timeS * 0.22 + index * Math.PI;
      const homeRing = marker.children[2];
      homeRing.visible = flag.status === 'home';
      if (flag.status === 'home') marker.position.y = flag.baseY;
    }
  };

  const updateZones = (state: MatchModePresentationState): void => {
    const markers = buildZones();
    for (const [index, zone] of state.zones.entries()) {
      const marker = markers[index];
      if (!marker) break;
      marker.visible = true;
      marker.position.set(zone.x, zone.y, zone.z);
      const material = marker.userData.markerMaterial;
      if (!material) continue;
      const color = zone.contested ? AMBER
        : zone.owner ? teamColor(zone.owner) : NEUTRAL;
      material.color.setHex(color);
      material.opacity = zone.contested ? 0.68 : 0.28 + Math.abs(zone.control) * 0.38;
    }
  };

  const updateTurboBall = (state: MatchModePresentationState, timeS: number): void => {
    buildTurbo();
    if (ballMarker && state.ball) {
      ballMarker.visible = true;
      ballMarker.position.set(state.ball.x, state.ball.y, state.ball.z);
      ballMarker.rotation.set(timeS * 0.55, timeS * 0.8, timeS * 0.35);
    }
    if (!goalMarkers || state.goals.length !== goalMarkers.length) return;
    const firstGoal = state.goals[0];
    const secondGoal = state.goals[1];
    const midX = (firstGoal.x + secondGoal.x) * 0.5;
    const midY = (firstGoal.y + secondGoal.y) * 0.5 + 10;
    const midZ = (firstGoal.z + secondGoal.z) * 0.5;
    for (let index = 0; index < goalMarkers.length; index += 1) {
      const goal = state.goals[index];
      const marker = goalMarkers[index];
      marker.visible = true;
      marker.position.set(goal.x, goal.y, goal.z);
      marker.lookAt(midX, midY, midZ);
    }
  };

  const updatePickups = (state: MatchModePresentationState, timeS: number): void => {
    const markers = buildPickups();
    let markerIndex = 0;
    for (const pickup of state.pickups) {
      if (!pickup.active || markerIndex >= markers.length) continue;
      const marker = markers[markerIndex];
      markerIndex += 1;
      marker.visible = true;
      marker.position.set(
        pickup.x,
        pickup.y + Math.sin(timeS * 2.1 + markerIndex) * 0.45,
        pickup.z,
      );
      marker.rotation.y = timeS * 0.75 + markerIndex * 0.6;
      if (marker.userData.heal) marker.userData.heal.visible = pickup.kind === 'heal';
      if (marker.userData.ammo) marker.userData.ammo.visible = pickup.kind === 'ammo';
    }
  };

  const update = (state: MatchModePresentationState | null, timeS: number): void => {
    if (!state || state.id === 'standard') {
      root.visible = false;
      return;
    }
    root.visible = true;
    hideAll();
    if (state.id === 'capture_the_flag') updateFlags(state, timeS);
    else if (state.id === 'zone_control') updateZones(state);
    else if (state.id === 'frontline_assault') {
      updateZones(state);
      updateLineWorks(state);
    }
    else if (state.id === 'turbo_ball') updateTurboBall(state, timeS);
    else updatePickups(state, timeS);
  };

  const dispose = (): void => {
    disposeLineWorks();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of meshMaterials) if (material) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    root.removeFromParent();
  };

  return { root, update, dispose };
}
