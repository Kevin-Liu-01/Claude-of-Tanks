// WoT/Blitz-style scoped armor flashlight. The overlay is rendered from the
// same closed collision cells used by authoritative shell traces, and every
// color sample calls queryAimArmor + estimatePenRatio. It therefore includes
// impact angle, normalization, ricochet, ERA, spaced armor, tracks and shell
// falloff instead of painting a static thickness texture. Scope state owns
// visibility; direct reticle contact only supplies the ordinary HUD marker.

import * as THREE from 'three';
import { queryAimArmor, tankPoseFromState } from '../sim/armor.ts';
import type { ArmorModel, ArmorPoseState } from '../sim/armor.ts';
import { estimatePenRatio } from '../sim/damage.ts';
import type { AimArmorInfo, DamageShellSpec } from '../sim/damage.ts';
import { buildFlashlightGeometry, createFlashlightMaterial, type FlashlightSample } from './armorFlashlightMesh.ts';

const SAMPLE_INTERVAL_MS = 110;
const SAMPLE_BATCH_SIZE = 48;
// 2026-09-13 owner review ("the highlights are sometimes behind tank
// surfaces — make them a little bigger than the tank"): the shell stands just
// proud of skirts, stowage and ERA. 243 (owner: "so many terrible weird
// geometries"): it is the cells' outer skin, evenly lifted, with outlined
// panels (armorFlashlightMesh.ts), not every cell triangle blown up about its
// own cell. 262 (owner: "make highlighting simpler and generalized"): a few
// armour panels per zone with straight borders (armorPanels.ts), each one
// colour blended from a few samples spread over it.
const MAX_QUERY_M = 820;
// A sample whose ray meets main armour this far (m) short of the panel point
// sees another panel in front of it (a turret over the hull roof, a sponson
// over the side): it counts only when no sample of the panel is clear.
const OCCLUDED_M = 0.12;

const LOW = new THREE.Color(0xe53d35);
const MID = new THREE.Color(0xf0aa35);
const HIGH = new THREE.Color(0x48d985);
const NEUTRAL = new THREE.Color(0x66737f);
const _color = new THREE.Color();
const _world = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pose = {
  pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0,
};

export type ArmorOverlayModel = ArmorModel;

interface ArmorOverlayVisual {
  root: THREE.Object3D;
}

export interface ArmorOverlayTarget {
  id: string;
  state?: ArmorPoseState | null;
  combat?: {
    destroyed?: boolean;
    eraSpent?: Set<string>;
  } | null;
  visual?: ArmorOverlayVisual | null;
  spec?: { armor?: ArmorOverlayModel } | null;
}

interface ArmorOverlayFrame {
  owner: THREE.Object3D;
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  color: THREE.Float32BufferAttribute;
  samples: FlashlightSample[];
  targets: Uint32Array;
}

/** The panel being sampled across batches: its clear and its occluded samples' weighted ratio sums. */
interface PanelBlend {
  clear: number;
  clearWeight: number;
  hidden: number;
  hiddenWeight: number;
}

interface ArmorOverlayEntry {
  target: ArmorOverlayTarget;
  group: THREE.Group;
  frames: ArmorOverlayFrame[];
  visible: boolean;
  inScope: boolean;
  sampling: boolean;
  sampleFrameIndex: number;
  samplePanelIndex: number;
  samplePointIndex: number;
  blend: PanelBlend;
  nextSampleMs: number;
  lastShellSpec: DamageShellSpec | null;
}

interface ArmorAimOverlayUpdateOptions {
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

function blendedRatio(blend: PanelBlend): number {
  if (blend.clearWeight > 0) return blend.clear / blend.clearWeight;
  if (blend.hiddenWeight > 0) return blend.hidden / blend.hiddenWeight;
  return NaN;
}

function paintSample(
  attribute: THREE.Float32BufferAttribute,
  targets: Uint32Array,
  sample: FlashlightSample,
  color: THREE.Color,
): void {
  for (let index = sample.start; index < sample.end; index++) {
    attribute.setXYZ(targets[index], color.r, color.g, color.b);
  }
}

/**
 * @returns {{prime:Function,warm:Function,update:Function,hide:Function,clear:Function,dispose:Function}}
 */
export function createArmorAimOverlay(): ArmorAimOverlayRuntime {
  const entries = new Map<string, ArmorOverlayEntry>();
  const material = createFlashlightMaterial();
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
      const armor = target.spec?.armor;
      const cells = armor?.collisionShells?.[key] || [];
      const built = buildFlashlightGeometry(cells, turretLocal ? armor?.turretPlates : armor?.hullPlates, NEUTRAL);
      const owner = ownerForFrame(target.visual, turretLocal);
      if (!built || !owner) continue;
      const mesh = new THREE.Mesh(built.geometry, material);
      mesh.name = `armor_flashlight_${key}`;
      // combat coordinates carry no rig scale (tools/rigid-hull-frame.mjs: the CR2/CR3 families' 1.1, the Improved's
      // narrowing): the cells drawn under a scaled rig undo it
      mesh.scale.set(1 / owner.scale.x, 1 / owner.scale.y, 1 / owner.scale.z);
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
      samplePanelIndex: 0,
      samplePointIndex: 0,
      blend: { clear: 0, clearWeight: 0, hidden: 0, hiddenWeight: 0 },
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
    const blend = entry.blend;
    while (entry.sampleFrameIndex < entry.frames.length && remaining > 0) {
      const frame = entry.frames[entry.sampleFrameIndex];
      frame.owner.updateWorldMatrix(true, false);
      while (entry.samplePanelIndex < frame.samples.length && remaining > 0) {
        const panel = frame.samples[entry.samplePanelIndex];
        if (entry.samplePointIndex === 0) {
          blend.clear = 0; blend.clearWeight = 0; blend.hidden = 0; blend.hiddenWeight = 0;
        }
        while (entry.samplePointIndex < panel.points.length && remaining > 0) {
          const k = entry.samplePointIndex++;
          remaining--;
          _world.fromArray(panel.points[k]).applyMatrix4(frame.owner.matrixWorld);
          _dir.copy(_world).sub(muzzle);
          const distance = _dir.length();
          if (!(distance > 0.05) || distance > MAX_QUERY_M) continue;
          _dir.multiplyScalar(1 / distance);
          const maxDist = Math.min(MAX_QUERY_M, distance + 0.3);
          const info = queryAimArmor(muzzle, _dir, maxDist, pose, armor, target.combat.eraSpent) as AimArmorInfo | null;
          if (!info) continue;
          const ratio = estimatePenRatio(shellSpec, info.distM, info);
          if (!Number.isFinite(ratio)) continue;
          const last = info.layers[info.layers.length - 1];
          const weight = panel.weights[k];
          if (last && last.plate.kind === 'main' && last.t * maxDist < distance - OCCLUDED_M) {
            blend.hidden += ratio * weight; blend.hiddenWeight += weight;
          } else {
            blend.clear += ratio * weight; blend.clearWeight += weight;
          }
        }
        if (entry.samplePointIndex < panel.points.length) break;
        paintSample(frame.color, frame.targets, panel, penetrationColor(blendedRatio(blend), _color));
        entry.samplePanelIndex++;
        entry.samplePointIndex = 0;
      }
      frame.color.needsUpdate = true;
      if (entry.samplePanelIndex >= frame.samples.length) {
        entry.sampleFrameIndex++;
        entry.samplePanelIndex = 0;
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

  function collectScopedTargets(
    targets: ArmorOverlayTarget[] | readonly ArmorOverlayTarget[] | null | undefined,
    target: ArmorOverlayTarget | null | undefined,
  ): void {
    visibleEntries.length = 0;
    for (const entry of entries.values()) entry.inScope = false;
    if (Array.isArray(targets)) {
      for (const candidate of targets) addScopedTarget(candidate);
    } else {
      addScopedTarget(target);
    }
    for (const entry of entries.values()) {
      if (entry.inScope) continue;
      setVisible(entry, false);
      entry.sampling = false;
    }
  }

  function prepareScopedSamples(
    shellSpec: DamageShellSpec | null | undefined,
    sampleNowMs: number,
  ): void {
    for (const entry of visibleEntries) {
      if (entry.lastShellSpec !== shellSpec) {
        entry.lastShellSpec = shellSpec ?? null;
        entry.nextSampleMs = -Infinity;
        entry.sampling = false;
      }
      if (entry.sampling || sampleNowMs < entry.nextSampleMs) continue;
      entry.sampling = true;
      entry.sampleFrameIndex = 0;
      entry.samplePanelIndex = 0;
      entry.samplePointIndex = 0;
    }
  }

  function sampleNextScopedEntry(
    shellSpec: DamageShellSpec | null | undefined,
    muzzle: THREE.Vector3 | null | undefined,
    sampleNowMs: number,
  ): void {
    // Keep the original global one-batch-per-frame query budget while
    // rotating across every visible scoped enemy.
    for (let offset = 0; offset < visibleEntries.length; offset++) {
      const index = (sampleCursor + offset) % visibleEntries.length;
      const entry = visibleEntries[index];
      if (!entry.sampling) continue;
      if (sampleBatch(entry, shellSpec, muzzle)) {
        entry.sampling = false;
        entry.nextSampleMs = sampleNowMs + SAMPLE_INTERVAL_MS;
      }
      sampleCursor = (index + 1) % visibleEntries.length;
      return;
    }
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

    collectScopedTargets(targets, target);
    if (!visibleEntries.length) return;

    const sampleNowMs = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : 0;
    prepareScopedSamples(shellSpec, sampleNowMs);
    sampleNextScopedEntry(shellSpec, muzzle, sampleNowMs);
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
