// WoT/Blitz-style scoped armor flashlight. The overlay is rendered from the
// same closed collision cells used by authoritative shell traces, and every
// color sample calls queryAimArmor + estimatePenRatio. It therefore includes
// impact angle, normalization, ricochet, ERA, spaced armor, tracks and shell
// falloff instead of painting a static thickness texture.

import * as THREE from 'three';
import { queryAimArmor, tankPoseFromState } from '../sim/armor.js';
import { estimatePenRatio } from '../sim/damage.js';

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

function penetrationColor(ratio, out) {
  if (!Number.isFinite(ratio)) return out.copy(NEUTRAL);
  if (ratio <= 0.72) return out.copy(LOW);
  if (ratio < 1) return out.copy(LOW).lerp(MID, (ratio - 0.72) / 0.28);
  if (ratio < 1.35) return out.copy(MID).lerp(HIGH, (ratio - 1) / 0.35);
  return out.copy(HIGH);
}

function ownerForFrame(visual, turretLocal) {
  if (!visual?.root) return null;
  return visual.root.getObjectByName(turretLocal ? 'rig_turret' : 'rig_hull') || visual.root;
}

function buildFrameGeometry(cells) {
  const positions = [];
  const colors = [];
  const samples = [];
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

function paintSample(attribute, offset, color) {
  for (let vertex = 0; vertex < 3; vertex++) {
    attribute.setXYZ(offset + vertex, color.r, color.g, color.b);
  }
}

/**
 * @returns {{prime:Function,warm:Function,update:Function,hide:Function,clear:Function,dispose:Function}}
 */
export function createArmorAimOverlay() {
  const entries = new Map();
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
  let active = null;
  let nextSampleMs = -Infinity;
  let lastShellKey = '';
  let sampling = false;
  let sampleFrameIndex = 0;
  let samplePointIndex = 0;

  function prime(target) {
    if (!target?.id || !target.visual?.root || entries.has(target.id)) return entries.get(target?.id) || null;
    const group = new THREE.Group();
    group.name = `armor_flashlight_${target.id}`;
    group.visible = false;
    group.renderOrder = 92;
    const frames = [];
    for (const [key, turretLocal] of [['hull', false], ['turret', true]]) {
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
    const entry = { target, group, frames, visible: false };
    // The meshes live directly in their articulation owners; `group` is only
    // a lightweight visibility/state handle and never enters the scene.
    entries.set(target.id, entry);
    return entry;
  }

  function warm() {
    const warmed = [];
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

  function setVisible(entry, visible) {
    if (!entry || entry.visible === visible) return;
    entry.visible = visible;
    for (const frame of entry.frames) frame.mesh.visible = visible;
  }

  function hide() {
    if (active) setVisible(active, false);
    active = null;
    sampling = false;
  }

  function sampleBatch(entry, shellSpec, muzzle) {
    const target = entry.target;
    if (!target?.state || !target?.combat || !shellSpec || !muzzle) return true;
    const armor = target.spec.armor;
    const pose = tankPoseFromState(target.state, _pose);
    let remaining = SAMPLE_BATCH_SIZE;
    while (sampleFrameIndex < entry.frames.length && remaining > 0) {
      const frame = entry.frames[sampleFrameIndex];
      frame.owner.updateWorldMatrix(true, false);
      while (samplePointIndex < frame.samples.length && remaining > 0) {
        const samplePoint = frame.samples[samplePointIndex++];
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
        );
        const ratio = info ? estimatePenRatio(shellSpec, info.distM, info) : NaN;
        paintSample(frame.color, samplePoint.offset, penetrationColor(ratio, _color));
      }
      frame.color.needsUpdate = true;
      if (samplePointIndex >= frame.samples.length) {
        sampleFrameIndex++;
        samplePointIndex = 0;
      }
    }
    return sampleFrameIndex >= entry.frames.length;
  }

  function update({ enabled, scoped, target, shellSpec, muzzle, nowMs }) {
    const allowed = !!enabled && !!scoped && !!target && !target.combat?.destroyed
      && !!target.visual?.root?.visible;
    if (!allowed) {
      hide();
      return;
    }
    const entry = prime(target);
    if (!entry || !entry.frames.length) {
      hide();
      return;
    }
    if (active !== entry) {
      if (active) setVisible(active, false);
      active = entry;
      setVisible(active, true);
      nextSampleMs = -Infinity;
      sampling = false;
    }
    const shellKey = `${target.id}:${shellSpec?.name || shellSpec?.type || ''}`;
    if (shellKey !== lastShellKey) {
      lastShellKey = shellKey;
      nextSampleMs = -Infinity;
      sampling = false;
    }
    if (!sampling && nowMs >= nextSampleMs) {
      sampling = true;
      sampleFrameIndex = 0;
      samplePointIndex = 0;
    }
    if (sampling && sampleBatch(entry, shellSpec, muzzle)) {
      sampling = false;
      nextSampleMs = nowMs + SAMPLE_INTERVAL_MS;
    }
  }

  function clear() {
    hide();
    for (const entry of entries.values()) {
      for (const frame of entry.frames) {
        frame.mesh.removeFromParent();
        frame.geometry.dispose();
      }
    }
    entries.clear();
    lastShellKey = '';
    sampling = false;
  }

  function dispose() {
    clear();
    material.dispose();
  }

  return { prime, warm, update, hide, clear, dispose };
}
