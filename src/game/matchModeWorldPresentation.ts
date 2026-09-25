import * as THREE from 'three';

import type { MatchModePresentationState, ObjectiveTeam } from '../sim/matchModes.ts';
import { objectiveMarkers, type ObjectiveMarker } from '../ui/minimapObjectives.ts';
import {
  drawCheck, drawGoalGlyph, drawHexBadge, drawPennant, drawPickupGlyph, drawSpawnGlyph,
  sideColor, sideFill, type ObjectiveSide,
} from '../ui/objectiveGlyphs.ts';

const ALLY = 0x6fe887;
const ENEMY = 0xf26a62;
const NEUTRAL = 0xe7edf1;
const AMBER = 0xf3a536;
const HEAL = 0x65e68a;
const MAX_PICKUPS = 12;
/** tactical map 2026-09-15: sprite icon texture edge (px) and the beacon column height (m). */
const ICON_PX = 128;
const BEACON_HEIGHT_M = 18;
const ZONE_RADIUS_M = 26.5;
const ARC_STEPS = 20;
/** icons are invisible inside ICON_NEAR_M, full at ICON_FAR_M, and grow with distance past ICON_HOLD_M */
const ICON_NEAR_M = 16;
const ICON_FAR_M = 42;
const ICON_HOLD_M = 120;
const ICON_MAX_GROWTH = 3.5;

interface MarkerGroup extends THREE.Group {
  userData: {
    markerMaterial?: THREE.MeshBasicMaterial;
    heal?: THREE.Object3D;
    ammo?: THREE.Object3D;
    /** materials tinted by the viewer's side (own / enemy) on every update */
    teamMaterials?: THREE.MeshBasicMaterial[];
    /** floating icon sprite above the objective */
    icon?: THREE.Sprite;
    /** capture-zone area disc and progress arc */
    discMaterial?: THREE.MeshBasicMaterial;
    arc?: THREE.Mesh;
    arcMaterial?: THREE.MeshBasicMaterial;
    beaconMaterial?: THREE.MeshBasicMaterial;
    /** the light column's authored opacity before the viewer-distance fade */
    beaconOpacity?: number;
  };
}

function sideHex(side: ObjectiveSide): number {
  return side === 'own' ? ALLY : side === 'enemy' ? ENEMY : side === 'contested' ? AMBER : NEUTRAL;
}

export interface MatchModeWorldPresentation {
  readonly root: THREE.Group;
  update(state: MatchModePresentationState | null, timeS: number): void;
  dispose(): void;
}

/** campaign slice 3 (2026-09-12): ground fit for dressing that spreads beyond an objective centre. */
interface MatchModeWorldPresentationOptions {
  groundHeight?: (x: number, z: number) => number;
  /**
   * tactical map 2026-09-15: the viewer's world position. Floating icons and
   * light columns fade out within a few tank lengths (a badge over your own
   * spawn would fill the screen) and icons hold a constant screen size beyond
   * ICON_HOLD_M so a far zone letter stays legible.
   */
  viewerPosition?: () => { x: number; y: number; z: number } | null;
  /**
   * Engine hook folding a lit material into the cascaded-shadow setup; a lit
   * material outside it is struck by every cascade light at once and blows
   * out. Objective markers stay unlit and never need it.
   */
  setupMaterial?: (material: THREE.Material) => void;
  releaseMaterial?: (material: THREE.Material) => void;
}

interface WorksPlacement { x: number; y: number; z: number; yaw: number }

interface LineWorksPlan {
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
  let flagBaseMarkers: MarkerGroup[] | null = null;
  let zoneMarkers: MarkerGroup[] | null = null;
  let ballMarker: THREE.Mesh | null = null;
  let goalMarkers: MarkerGroup[] | null = null;
  let pickupMarkers: MarkerGroup[] | null = null;
  let spawnMarkers: MarkerGroup[] | null = null;

  // tactical map 2026-09-15: the same glyphs the minimap paints, rasterised
  // once per (kind, side, label, status) into sprite textures that float
  // above the objectives — a zone letter, a sector number, a flag pennant, a
  // spawn mark, a goal, a cache — so the world and the map share one language.
  const iconTextures = new Map<string, THREE.CanvasTexture>();
  const iconTexture = (key: string, paint: (ctx: CanvasRenderingContext2D, c: number) => void): THREE.CanvasTexture => {
    let texture = iconTextures.get(key);
    if (texture) return texture;
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (canvas) {
      canvas.width = ICON_PX; canvas.height = ICON_PX;
      const ctx = canvas.getContext('2d');
      if (ctx) paint(ctx, ICON_PX / 2);
    }
    texture = new THREE.CanvasTexture(canvas ?? ({ width: ICON_PX, height: ICON_PX } as unknown as HTMLCanvasElement));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    iconTextures.set(key, texture);
    return texture;
  };
  const iconSprite = (name: string, scale: number, y: number): THREE.Sprite => {
    const material = new THREE.SpriteMaterial({
      transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.name = name;
    sprite.scale.set(scale, scale, 1);
    sprite.position.y = y;
    sprite.renderOrder = 6;
    sprite.userData.baseScale = scale;
    return sprite;
  };
  // distance treatment for a marker's icon and light column
  const fadeByViewer = (marker: MarkerGroup): void => {
    const viewer = options.viewerPosition?.();
    if (!viewer) return;
    const distance = Math.hypot(marker.position.x - viewer.x, marker.position.z - viewer.z);
    const visibility = Math.max(0, Math.min(1, (distance - ICON_NEAR_M) / (ICON_FAR_M - ICON_NEAR_M)));
    const icon = marker.userData.icon;
    if (icon) {
      const base = Number(icon.userData.baseScale) || icon.scale.x;
      const growth = Math.max(1, Math.min(ICON_MAX_GROWTH, distance / ICON_HOLD_M));
      icon.scale.set(base * growth, base * growth, 1);
      (icon.material as THREE.SpriteMaterial).opacity = visibility;
      icon.visible = visibility > 0.02;
    }
    const column = marker.userData.beaconMaterial;
    if (column) {
      const full = Number(marker.userData.beaconOpacity ?? column.opacity);
      marker.userData.beaconOpacity = full;
      column.opacity = full * visibility;
    }
  };
  const setIcon = (
    sprite: THREE.Sprite | undefined, key: string, paint: (ctx: CanvasRenderingContext2D, c: number) => void,
  ): void => {
    if (!sprite) return;
    const material = sprite.material as THREE.SpriteMaterial;
    const texture = iconTexture(key, paint);
    if (material.map !== texture) {
      material.map = texture;
      material.needsUpdate = true;
    }
  };
  let beaconGeometry: THREE.CylinderGeometry | null = null;
  // additive light column: the objective is visible from across the map
  const beacon = (color: number, opacity: number): THREE.Mesh => {
    beaconGeometry ??= new THREE.CylinderGeometry(0.7, 1.5, BEACON_HEIGHT_M, 12, 1, true);
    const material = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
      toneMapped: false, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(beaconGeometry, material);
    mesh.name = 'beacon';
    mesh.position.y = BEACON_HEIGHT_M / 2;
    return mesh;
  };
  const arcGeometries: (THREE.RingGeometry | null)[] = Array.from({ length: ARC_STEPS + 1 }, () => null);
  const arcGeometry = (step: number): THREE.RingGeometry => {
    const q = Math.max(0, Math.min(ARC_STEPS, step));
    let geometry = arcGeometries[q];
    if (!geometry) {
      const length = Math.max(1e-3, (q / ARC_STEPS) * Math.PI * 2);
      geometry = new THREE.RingGeometry(ZONE_RADIUS_M - 3.4, ZONE_RADIUS_M - 1.2, Math.max(3, Math.round(48 * q / ARC_STEPS)), 1, Math.PI / 2, length);
      arcGeometries[q] = geometry;
    }
    return geometry;
  };
  const perspectiveOf = (state: MatchModePresentationState): ObjectiveTeam =>
    state.perspectiveTeam === 'bravo' ? 'bravo' : 'alpha';
  const sideOf = (team: ObjectiveTeam, state: MatchModePresentationState): ObjectiveSide =>
    team === perspectiveOf(state) ? 'own' : 'enemy';

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
      const icon = iconSprite(`${team}-flag-icon`, 5.2, 7.2);
      marker.userData.teamMaterials = [banner.material as THREE.MeshBasicMaterial, ring.material as THREE.MeshBasicMaterial];
      marker.userData.icon = icon;
      marker.add(pole, banner, ring, icon);
      root.add(marker);
      return marker;
    });
    return flagMarkers;
  };

  // the flag's home: an outer halo ring and a light column that stay at the
  // base while the flag itself travels with its carrier
  const buildFlagBases = (): MarkerGroup[] => {
    if (flagBaseMarkers) return flagBaseMarkers;
    const haloGeometry = new THREE.RingGeometry(8.6, 9.6, 48);
    flagBaseMarkers = (['alpha', 'bravo'] as const).map((team) => {
      const marker = new THREE.Group() as MarkerGroup;
      marker.name = `${team}-flag-base`;
      const halo = new THREE.Mesh(haloGeometry, basic(teamColor(team), 0.3));
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.1;
      const column = beacon(teamColor(team), 0.14);
      marker.userData.teamMaterials = [halo.material as THREE.MeshBasicMaterial];
      marker.userData.beaconMaterial = column.material as THREE.MeshBasicMaterial;
      marker.add(halo, column);
      root.add(marker);
      return marker;
    });
    return flagBaseMarkers;
  };

  // team spawns (Zone Control both sides; the co-op modes the human side):
  // ring, light column and the spawn mark floating above
  const buildSpawns = (): MarkerGroup[] => {
    if (spawnMarkers) return spawnMarkers;
    const ringGeometry = new THREE.RingGeometry(5.4, 6.6, 48);
    spawnMarkers = (['alpha', 'bravo'] as const).map((team) => {
      const marker = new THREE.Group() as MarkerGroup;
      marker.name = `${team}-spawn`;
      const ring = new THREE.Mesh(ringGeometry, basic(teamColor(team), 0.34));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.1;
      const column = beacon(teamColor(team), 0.12);
      const icon = iconSprite(`${team}-spawn-icon`, 6, 8.5);
      marker.userData.teamMaterials = [ring.material as THREE.MeshBasicMaterial];
      marker.userData.beaconMaterial = column.material as THREE.MeshBasicMaterial;
      marker.userData.icon = icon;
      marker.add(ring, column, icon);
      marker.visible = false;
      root.add(marker);
      return marker;
    });
    return spawnMarkers;
  };

  const buildZones = (): MarkerGroup[] => {
    if (zoneMarkers) return zoneMarkers;
    const ringGeometry = new THREE.RingGeometry(ZONE_RADIUS_M, 30, 64);
    const coreGeometry = new THREE.CylinderGeometry(0.28, 0.55, 7, 10);
    const discGeometry = new THREE.CircleGeometry(ZONE_RADIUS_M, 48);
    zoneMarkers = Array.from({ length: 3 }, (_, index) => {
      const marker = new THREE.Group() as MarkerGroup;
      marker.name = `capture-zone-${index + 1}`;
      const material = basic(NEUTRAL, 0.4);
      const ring = new THREE.Mesh(ringGeometry, material);
      ring.rotation.x = -Math.PI / 2;
      const core = new THREE.Mesh(coreGeometry, material);
      core.position.y = 3.5;
      marker.userData.markerMaterial = material;
      // tactical map 2026-09-15: the zone reads as an area (tinted disc), its
      // capture progress as an arc inside the ring, its letter / sector number
      // as a floating badge
      const discMaterial = basic(NEUTRAL, 0.09);
      const disc = new THREE.Mesh(discGeometry, discMaterial);
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.05;
      const arcMaterial = basic(NEUTRAL, 0.85);
      const arc = new THREE.Mesh(arcGeometry(0), arcMaterial);
      arc.rotation.x = -Math.PI / 2;
      arc.position.y = 0.14;
      arc.visible = false;
      const icon = iconSprite(`capture-zone-${index + 1}-icon`, 7.5, 9.5);
      marker.userData.discMaterial = discMaterial;
      marker.userData.arc = arc;
      marker.userData.arcMaterial = arcMaterial;
      marker.userData.icon = icon;
      marker.add(ring, core, disc, arc, icon);
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
        const icon = iconSprite(`${team}-turbo-goal-icon`, 8, 24);
        marker.userData.markerMaterial = material;
        marker.userData.icon = icon;
        marker.add(hoop, icon);
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
      const icon = iconSprite(`horde-pickup-${index + 1}-icon`, 3.4, 4.4);
      marker.userData.heal = healGroup;
      marker.userData.ammo = shellGroup;
      marker.userData.icon = icon;
      marker.add(cage, shellGroup, healGroup, icon);
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
    if (flagBaseMarkers) for (const marker of flagBaseMarkers) marker.visible = false;
    if (spawnMarkers) for (const marker of spawnMarkers) marker.visible = false;
    if (zoneMarkers) for (const marker of zoneMarkers) marker.visible = false;
    if (ballMarker) ballMarker.visible = false;
    if (goalMarkers) for (const marker of goalMarkers) marker.visible = false;
    if (pickupMarkers) for (const marker of pickupMarkers) marker.visible = false;
  };

  const tintTeam = (marker: MarkerGroup, side: ObjectiveSide): void => {
    const hex = sideHex(side);
    for (const material of marker.userData.teamMaterials || []) material.color.setHex(hex);
    marker.userData.beaconMaterial?.color.setHex(hex);
  };

  const updateFlags = (state: MatchModePresentationState, timeS: number): void => {
    const markers = buildFlags();
    const bases = buildFlagBases();
    for (const [index, flag] of state.flags.entries()) {
      const marker = markers[index];
      if (!marker) break;
      const side = sideOf(flag.team, state);
      marker.visible = true;
      marker.position.set(flag.x, flag.y - 2.5, flag.z);
      marker.rotation.y = timeS * 0.22 + index * Math.PI;
      const homeRing = marker.children[2];
      homeRing.visible = flag.status === 'home';
      if (flag.status === 'home') marker.position.y = flag.baseY;
      tintTeam(marker, side);
      setIcon(marker.userData.icon, `flag:${side}`, (ctx, c) => drawPennant(ctx, c - 14, c + 8, 92, sideColor(side)));
      fadeByViewer(marker);
      const base = bases[index];
      if (base) {
        base.visible = true;
        base.position.set(flag.baseX, flag.baseY, flag.baseZ);
        tintTeam(base, side);
        // the halo breathes while the flag is away
        const halo = base.userData.teamMaterials?.[0];
        if (halo) halo.opacity = flag.status === 'home' ? 0.3 : 0.32 + 0.22 * Math.sin(timeS * 4);
        fadeByViewer(base);
      }
    }
  };

  const updateSpawns = (state: MatchModePresentationState, markers: readonly ObjectiveMarker[]): void => {
    // in the world only a revive point is worth a beacon; the map marks every spawn
    if (!state.respawns) return;
    const spawnMarks = markers.filter((marker) => marker.kind === 'spawn');
    if (!spawnMarks.length) return;
    const groups = buildSpawns();
    for (const mark of spawnMarks) {
      const spawn = state.spawns.find((entry) => entry.x === mark.x && entry.z === mark.z);
      const group = groups[spawn?.team === 'bravo' ? 1 : 0];
      if (!group) continue;
      group.visible = true;
      group.position.set(mark.x, spawn?.y ?? (options.groundHeight?.(mark.x, mark.z) ?? 0), mark.z);
      tintTeam(group, mark.side);
      setIcon(group.userData.icon, `spawn:${mark.side}`, (ctx, c) =>
        drawSpawnGlyph(ctx, c, c + 6, 34, sideColor(mark.side), sideFill(mark.side)));
      fadeByViewer(group);
    }
  };

  const updateZones = (state: MatchModePresentationState, marks: readonly ObjectiveMarker[]): void => {
    const markers = buildZones();
    const zoneMarks = marks.filter((mark) => mark.kind === 'zone' || mark.kind === 'sector');
    for (const [index, zone] of state.zones.entries()) {
      const marker = markers[index];
      if (!marker) break;
      marker.visible = true;
      marker.position.set(zone.x, zone.y, zone.z);
      const mark = zoneMarks[index];
      const material = marker.userData.markerMaterial;
      if (material) {
        const color = mark ? sideHex(mark.side) : NEUTRAL;
        material.color.setHex(color);
        material.opacity = zone.contested ? 0.68 : 0.28 + Math.abs(zone.control) * 0.38;
      }
      if (!mark) continue;
      const hex = sideHex(mark.side);
      const disc = marker.userData.discMaterial;
      if (disc) {
        disc.color.setHex(hex);
        disc.opacity = mark.status === 'locked' ? 0.05 : mark.side === 'neutral' ? 0.07 : 0.13;
      }
      const arc = marker.userData.arc;
      const arcMaterial = marker.userData.arcMaterial;
      const progress = mark.progress ?? 0;
      if (arc && arcMaterial) {
        const partial = progress > 0.01 && progress < 0.995 && !!mark.progressSide;
        arc.visible = partial;
        if (partial) {
          arc.geometry = arcGeometry(Math.round(progress * ARC_STEPS));
          arcMaterial.color.setHex(sideHex(mark.progressSide ?? 'neutral'));
        }
      }
      const label = mark.label ?? '';
      const status = mark.status ?? '';
      setIcon(marker.userData.icon, `${mark.kind}:${mark.side}:${label}:${status}`, (ctx, c) => {
        drawHexBadge(ctx, c, c, 46, {
          fill: sideFill(mark.side), stroke: sideColor(mark.side), label, ringWidth: 9,
          dashed: mark.side === 'contested' || status === 'locked', font: '700 48px system-ui, sans-serif',
        });
        if (status === 'taken') drawCheck(ctx, c + 30, c + 30, 22, sideColor(mark.side));
      });
      fadeByViewer(marker);
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
      const side = sideOf(goal.team, state);
      marker.userData.markerMaterial?.color.setHex(sideHex(side));
      setIcon(marker.userData.icon, `goal:${side}`, (ctx, c) => drawGoalGlyph(ctx, c, c, 44, sideColor(side), sideFill(side)));
      fadeByViewer(marker);
    }
  };

  const updatePickups = (state: MatchModePresentationState, timeS: number): void => {
    const markers = buildPickups();
    let markerIndex = 0;
    for (const pickup of state.pickups) {
      if (pickup.active === false || markerIndex >= markers.length) continue;
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
      const kind = pickup.kind === 'heal' ? 'heal' : 'ammo';
      setIcon(marker.userData.icon, `pickup:${kind}`, (ctx, c) => drawPickupGlyph(ctx, c, c, 44, kind));
      fadeByViewer(marker);
    }
  };

  const update = (state: MatchModePresentationState | null, timeS: number): void => {
    if (!state || state.id === 'standard') {
      root.visible = false;
      return;
    }
    root.visible = true;
    hideAll();
    // one derivation shared with the minimap: sides from the viewer's team,
    // zone letters / sector numbers and statuses, spawn marks per mode
    const marks = objectiveMarkers(state);
    if (state.id === 'capture_the_flag') updateFlags(state, timeS);
    else if (state.id === 'zone_control' || state.id === 'mars') updateZones(state, marks);
    else if (state.id === 'frontline_assault') {
      updateZones(state, marks);
      updateLineWorks(state);
    }
    else if (state.id === 'turbo_ball') updateTurboBall(state, timeS);
    // Caches coexist with objectives (Mars has both zones and drops).
    // Keep their lifecycle independent of the exclusive objective dispatch.
    if (state.pickups.length || state.id === 'endless_horde') updatePickups(state, timeS);
    updateSpawns(state, marks);
  };

  const dispose = (): void => {
    disposeLineWorks();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      // sprites share three's one static plane; never dispose that
      if (mesh.geometry && !(object as THREE.Sprite).isSprite) geometries.add(mesh.geometry);
      const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of meshMaterials) if (material) materials.add(material);
    });
    for (const geometry of arcGeometries) if (geometry) geometries.add(geometry);
    if (beaconGeometry) geometries.add(beaconGeometry);
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of iconTextures.values()) texture.dispose();
    iconTextures.clear();
    root.removeFromParent();
  };

  return { root, update, dispose };
}
