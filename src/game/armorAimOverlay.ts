// WoT/Blitz-style scoped armor flashlight. The overlay is rendered from the
// same closed collision cells used by authoritative shell traces, and every
// color sample calls queryAimArmor + estimatePenRatio. It therefore includes
// impact angle, normalization, ricochet, ERA, spaced armor, tracks and shell
// falloff instead of painting a static thickness texture. Scope state owns
// visibility; direct reticle contact only supplies the ordinary HUD marker.

import * as THREE from 'three';
import { queryAimArmor, tankPoseFromState } from '../sim/armor.js';
import { estimatePenRatio } from '../sim/damage.ts';
import type { AimArmorInfo, DamageShellSpec } from '../sim/damage.ts';

const SAMPLE_INTERVAL_MS = 110;
const SAMPLE_BATCH_SIZE = 48;
const SURFACE_LIFT_M = 0.022;
const MAX_QUERY_M = 820;

const LOW = new THREE.Color(0xe53d35);
const MID = new THREE.Color(0xf0aa35);
const HIGH = new THREE.Color(0x48d985);
const NEUTRAL = new THREE.Color(0x66737f);
const _color = new THREE.Color();
const _world = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pose = { pos: new THREE.Vector3() };

interface ArmorOverlayFace {
  indices: readonly number[];
  normal: readonly number[];
  center: number[];
  internal?: boolean;
}

interface ArmorOverlayCell {
  vertices: readonly (readonly number[])[];
  faces?: readonly ArmorOverlayFace[];
}

export interface ArmorOverlayModel {
  collisionShells?: {
    hull?: readonly ArmorOverlayCell[];
    turret?: readonly ArmorOverlayCell[];
  };
  [key: string]: unknown;
}

interface ArmorOverlayVisual {
  root: THREE.Object3D;
}

export interface ArmorOverlayTarget {
  id: string;
  state?: unknown;
  combat?: {
    destroyed?: boolean;
    eraSpent?: Set<string>;
  } | null;
  visual?: ArmorOverlayVisual;
  spec?: { armor?: ArmorOverlayModel };
}

interface ArmorOverlaySample {
  center: number[];
  offset: number;
}

export interface ArmorOverlayFrame {
  owner: THREE.Object3D;
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  color: THREE.Float32BufferAttribute;
  samples: ArmorOverlaySample[];
}

export interface ArmorOverlayEntry {
  target: ArmorOverlayTarget;
  group: THREE.Group;
  frames: ArmorOverlayFrame[];
  visible: boolean;
  inScope: boolean;
  sampling: boolean;
  sampleFrameIndex: number;
  samplePointIndex: number;
  nextSampleMs: number;
  lastShellSpec: DamageShellSpec | null;
}

export interface ArmorAimOverlayUpdateOptions {
  enabled: boolean;
  scoped: boolean;
  targets?: readonly ArmorOverlayTarget[];
  target?: ArmorOverlayTarget | null;
  shellSpec?: DamageShellSpec | null;
  muzzle?: THREE.Vector3 | null;
  nowMs?: number;
}

export interface ArmorAimOverlayRuntime {
  prime(target: ArmorOverlayTarget | null | undefined): ArmorOverlayEntry | null;
  warm(): () => void;
  update(options: ArmorAimOverlayUpdateOptions): void;
  hide(): void;
  clear(): void;
  dispose(): void;
}

function penetrationColor(ratio: number, out: THREE.Color): THREE.Color {
  if (!Number.isFinite(ratio)) return out.copy(NEUTRAL);
  if (ratio <= 0.72) return out.copy(LOW);
  if (ratio < 1) return out.copy(LOW).lerp(MID, (ratio - 0.72) / 0.28);
  if (ratio < 1.35) return out.copy(MID).lerp(HIGH, (ratio - 1) / 0.35);
  return out.copy(HIGH);
}

function ownerForFrame(
  visual: ArmorOverlayVisual | undefined,
  turretLocal: boolean,
): THREE.Object3D | null {
  if (!visual?.root) return null;
  return visual.root.getObjectByName(turretLocal ? 'rig_turret' : 'rig_hull') || visual.root;
}

function buildFrameGeometry(cells: readonly ArmorOverlayCell[] | undefined): {
  geometry: THREE.BufferGeometry;
  color: THREE.Float32BufferAttribute;
  samples: ArmorOverlaySample[];
} | null {
  const positions: number[] = [];
  const colors: number[] = [];
  const samples: ArmorOverlaySample[] = [];
  for (const cell of cells || []) {
    for (const face of cell.faces || []) {
      if (face.internal) continue;
      const offset = positions.length / 3;
      for (const index of face.indices) {
        const point = cell.vertices[index];
        if (!point) continue;
        positions.push(
          point[0] + face.normal[0] * SURFACE_LIFT_M,
          point[1] + face.normal[1] * SURFACE_LIFT_M,
          point[2] + face.normal[2] * SURFACE_LIFT_M,
        );
        colors.push(NEUTRAL.r, NEUTRAL.g, NEUTRAL.b);
      }
      if (positions.length / 3 === offset + 3) {
        samples.push({ center: face.center, offset });
      } else {
        positions.length = offset * 3;
        colors.length = offset * 3;
      }
    }
  }
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const color = new THREE.Float32BufferAttribute(colors, 3);
  color.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('color', color);
  geometry.computeBoundingSphere();
  return { geometry, color, samples };
}

function paintSample(
  attribute: THREE.Float32BufferAttribute,
  offset: number,
  color: THREE.Color,
): void {
  for (let vertex = 0; vertex < 3; vertex++) {
    attribute.setXYZ(offset + vertex, color.r, color.g, color.b);
  }
}

/**
 * @returns {{prime:Function,warm:Function,update:Function,hide:Function,clear:Function,dispose:Function}}
 */
export function createArmorAimOverlay(): ArmorAimOverlayRuntime {
  const entries = new Map<string, ArmorOverlayEntry>();
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.46,
    depthTest: true,
    depthWrite: false,
    side: THREE.FrontSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  material.name = 'cot:scoped-armor-flashlight';
  const visibleEntries: ArmorOverlayEntry[] = [];
  let sampleCursor = 0;

  function prime(target: ArmorOverlayTarget | null | undefined): ArmorOverlayEntry | null {
    if (!target?.id || !target.visual?.root) return null;
    const existing = entries.get(target.id);
    if (existing) return existing;
    const group = new THREE.Group();
    group.name = `armor_flashlight_${target.id}`;
    group.visible = false;
    group.renderOrder = 92;
    const frames: ArmorOverlayFrame[] = [];
    const frameKinds = [['hull', false], ['turret', true]] as const;
    for (const [key, turretLocal] of frameKinds) {
      const cells = target.spec?.armor?.collisionShells?.[key] || [];
      const built = buildFrameGeometry(cells);
      const owner = ownerForFrame(target.visual, turretLocal);
      if (!built || !owner) continue;
      const mesh = new THREE.Mesh(built.geometry, material);
      mesh.name = `armor_flashlight_${key}`;
      mesh.renderOrder = 92;
      mesh.visible = false;
      mesh.frustumCulled = true;
      mesh.raycast = () => {};
      owner.add(mesh);
      frames.push({ owner, mesh, ...built });
    }
    const entry = {
      target,
      group,
      frames,
      visible: false,
      inScope: false,
      sampling: false,
      sampleFrameIndex: 0,
      samplePointIndex: 0,
      nextSampleMs: -Infinity,
      lastShellSpec: null,
    };
    // The meshes live directly in their articulation owners; `group` is only
    // a lightweight visibility/state handle and never enters the scene.
    entries.set(target.id, entry);
    return entry;
  }

  function warm(): () => void {
    const warmed: THREE.Mesh[] = [];
    for (const entry of entries.values()) {
      for (const frame of entry.frames) {
        if (frame.mesh.visible) continue;
        frame.mesh.visible = true;
        warmed.push(frame.mesh);
      }
    }
    return () => {
      for (const mesh of warmed) mesh.visible = false;
    };
  }

  function setVisible(entry: ArmorOverlayEntry | null, visible: boolean): void {
    if (!entry || entry.visible === visible) return;
    entry.visible = visible;
    for (const frame of entry.frames) frame.mesh.visible = visible;
  }

  function hide(): void {
    if (!visibleEntries.length) return;
    for (const entry of entries.values()) {
      setVisible(entry, false);
      entry.inScope = false;
      entry.sampling = false;
    }
    visibleEntries.length = 0;
  }

  function sampleBatch(
    entry: ArmorOverlayEntry,
    shellSpec: DamageShellSpec | null | undefined,
    muzzle: THREE.Vector3 | null | undefined,
  ): boolean {
    const target = entry.target;
    const armor = target.spec?.armor;
    if (!target?.state || !target?.combat || !armor || !shellSpec || !muzzle) return true;
    const pose = tankPoseFromState(target.state, _pose);
    let remaining = SAMPLE_BATCH_SIZE;
    while (entry.sampleFrameIndex < entry.frames.length && remaining > 0) {
      const frame = entry.frames[entry.sampleFrameIndex];
      frame.owner.updateWorldMatrix(true, false);
      while (entry.samplePointIndex < frame.samples.length && remaining > 0) {
        const samplePoint = frame.samples[entry.samplePointIndex++];
        remaining--;
        _world.fromArray(samplePoint.center).applyMatrix4(frame.owner.matrixWorld);
        _dir.copy(_world).sub(muzzle);
        const distance = _dir.length();
        if (!(distance > 0.05) || distance > MAX_QUERY_M) {
          paintSample(frame.color, samplePoint.offset, NEUTRAL);
          continue;
        }
        _dir.multiplyScalar(1 / distance);
        const info = queryAimArmor(
          muzzle, _dir, Math.min(MAX_QUERY_M, distance + 0.3), pose, armor,
          target.combat.eraSpent,
        ) as AimArmorInfo | null;
        const ratio = info ? estimatePenRatio(shellSpec, info.distM, info) : NaN;
        paintSample(frame.color, samplePoint.offset, penetrationColor(ratio, _color));
      }
      frame.color.needsUpdate = true;
      if (entry.samplePointIndex >= frame.samples.length) {
        entry.sampleFrameIndex++;
        entry.samplePointIndex = 0;
      }
    }
    return entry.sampleFrameIndex >= entry.frames.length;
  }

  function addScopedTarget(candidate: ArmorOverlayTarget | null | undefined): void {
    if (!candidate || candidate.combat?.destroyed || !candidate.visual?.root?.visible) return;
    const entry = prime(candidate);
    if (!entry?.frames.length) return;
    entry.inScope = true;
    if (!entry.visible) {
      entry.sampling = false;
      entry.nextSampleMs = -Infinity;
    }
    setVisible(entry, true);
    visibleEntries.push(entry);
  }

  function update({
    enabled,
    scoped,
    targets,
    target,
    shellSpec,
    muzzle,
    nowMs,
  }: ArmorAimOverlayUpdateOptions): void {
    if (!enabled || !scoped) {
      hide();
      return;
    }

    visibleEntries.length = 0;
    for (const entry of entries.values()) entry.inScope = false;
    if (Array.isArray(targets)) {
      for (const candidate of targets) addScopedTarget(candidate);
    } else {
      addScopedTarget(target);
    }
    for (const entry of entries.values()) {
      if (!entry.inScope) {
        setVisible(entry, false);
        entry.sampling = false;
      }
    }
    if (!visibleEntries.length) return;

    const sampleNowMs = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : 0;
    for (const entry of visibleEntries) {
      if (entry.lastShellSpec !== shellSpec) {
        entry.lastShellSpec = shellSpec ?? null;
        entry.nextSampleMs = -Infinity;
        entry.sampling = false;
      }
      if (!entry.sampling && sampleNowMs >= entry.nextSampleMs) {
        entry.sampling = true;
        entry.sampleFrameIndex = 0;
        entry.samplePointIndex = 0;
      }
    }

    // The old single-target overlay spent one 48-query batch per frame. Keep
    // that exact global budget while rotating through every scoped enemy, so
    // broader visibility cannot turn a seven-vehicle sightline into a spike.
    for (let offset = 0; offset < visibleEntries.length; offset++) {
      const index = (sampleCursor + offset) % visibleEntries.length;
      const entry = visibleEntries[index];
      if (!entry.sampling) continue;
      if (sampleBatch(entry, shellSpec, muzzle)) {
        entry.sampling = false;
        entry.nextSampleMs = sampleNowMs + SAMPLE_INTERVAL_MS;
      }
      sampleCursor = (index + 1) % visibleEntries.length;
      break;
    }
  }

  function clear(): void {
    hide();
    for (const entry of entries.values()) {
      for (const frame of entry.frames) {
        frame.mesh.removeFromParent();
        frame.geometry.dispose();
      }
    }
    entries.clear();
    visibleEntries.length = 0;
    sampleCursor = 0;
  }

  function dispose(): void {
    clear();
    material.dispose();
  }

  return { prime, warm, update, hide, clear, dispose };
}
