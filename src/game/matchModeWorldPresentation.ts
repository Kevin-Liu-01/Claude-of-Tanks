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
 * meshes without allocating in the render loop.
 */
export function createMatchModeWorldPresentation(
  scene: THREE.Scene,
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

  const hideAll = (): void => {
    if (flagMarkers) for (const marker of flagMarkers) marker.visible = false;
    if (zoneMarkers) for (const marker of zoneMarkers) marker.visible = false;
    if (ballMarker) ballMarker.visible = false;
    if (goalMarkers) for (const marker of goalMarkers) marker.visible = false;
    if (pickupMarkers) for (const marker of pickupMarkers) marker.visible = false;
  };

  const update = (state: MatchModePresentationState | null, timeS: number): void => {
    const active = !!state && state.id !== 'standard';
    root.visible = active;
    if (!active || !state) return;
    hideAll();

    if (state.id === 'capture_the_flag') {
      const markers = buildFlags();
      for (let index = 0; index < markers.length; index++) {
        const flag = state.flags[index];
        const marker = markers[index];
        if (!flag) continue;
        marker.visible = true;
        marker.position.set(flag.x, flag.y - 2.5, flag.z);
        marker.rotation.y = timeS * 0.22 + index * Math.PI;
        const homeRing = marker.children[2];
        homeRing.visible = flag.status === 'home';
        if (flag.status === 'home') {
          marker.position.y = flag.baseY;
        }
      }
    } else if (state.id === 'zone_control') {
      const markers = buildZones();
      for (let index = 0; index < markers.length; index++) {
        const zone = state.zones[index];
        const marker = markers[index];
        if (!zone) continue;
        marker.visible = true;
        marker.position.set(zone.x, zone.y, zone.z);
        const material = marker.userData.markerMaterial;
        material?.color.setHex(zone.contested ? AMBER
          : zone.owner ? teamColor(zone.owner) : NEUTRAL);
        if (material) material.opacity = zone.contested ? 0.68 : 0.28 + Math.abs(zone.control) * 0.38;
      }
    } else if (state.id === 'turbo_ball') {
      buildTurbo();
      if (ballMarker && state.ball) {
        ballMarker.visible = true;
        ballMarker.position.set(state.ball.x, state.ball.y, state.ball.z);
        ballMarker.rotation.set(timeS * 0.55, timeS * 0.8, timeS * 0.35);
      }
      if (goalMarkers && state.goals.length === goalMarkers.length) {
        const midX = (state.goals[0].x + state.goals[1].x) * 0.5;
        const midY = (state.goals[0].y + state.goals[1].y) * 0.5 + 10;
        const midZ = (state.goals[0].z + state.goals[1].z) * 0.5;
        for (let index = 0; index < goalMarkers.length; index++) {
          const goal = state.goals[index];
          const marker = goalMarkers[index];
          marker.visible = true;
          marker.position.set(goal.x, goal.y, goal.z);
          marker.lookAt(midX, midY, midZ);
        }
      }
    } else if (state.id === 'endless_horde') {
      const markers = buildPickups();
      let markerIndex = 0;
      for (const pickup of state.pickups) {
        if (!pickup.active || markerIndex >= markers.length) continue;
        const marker = markers[markerIndex++];
        marker.visible = true;
        marker.position.set(pickup.x,
          pickup.y + Math.sin(timeS * 2.1 + markerIndex) * 0.45, pickup.z);
        marker.rotation.y = timeS * 0.75 + markerIndex * 0.6;
        if (marker.userData.heal) marker.userData.heal.visible = pickup.kind === 'heal';
        if (marker.userData.ammo) marker.userData.ammo.visible = pickup.kind === 'ammo';
      }
    }
  };

  const dispose = (): void => {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material?.dispose();
    });
    root.removeFromParent();
  };

  return { root, update, dispose };
}
