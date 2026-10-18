// The vehicle material registration audit (2026-10-17, the wheel-band lane, round 2; the owner: "in garage, on all
// tanks, i can see this weird shadow on wheels, no matter what garage i switch through").
//
// The invariant behind the band: every opaque lit material a tank draws holds its own vehicle registration — the cascade
// setup (USE_CSM, the cascade uniforms bound under its own entry) with the readability hook after it, which writes the
// sun state and the vehicle tag into the scene target's alpha. A pixel without the tag is ground to the aerial pass:
// the ground occlusion (engine/vehicleGroundOcclusion.ts) darkens every untagged pixel of a hull's own running gear
// under the belly line + 2 cm (a straight band through the road-wheel hubs), and a material outside the cascades lights
// with every cascade's sun at once. Three ways a material left it, each found on the fleet in October 2026:
//   unregistered  a raw Material.clone() re-hooked by hand (three's copy resets the defines and drops the hooks): the
//                 Patton's camouflaged wheel discs, the KF51's tyres, the KV-2's return-roller tyres, ...;
//   replaced      a registered material whose hook a profile assigned outright (the Abrams' pad grime, the KF51's track
//                 ceiling, the Merkava's void pockets): USE_CSM defined, the cascade uniforms never bound;
//   untagged      a registered material whose chain no longer writes the vehicle tag.
// A tank is built through a cascade-registering engine context (the shape of lighting.ts setupShadowMaterial: the
// defines, then the cascade hook with the extra hook chained after it) and every material it draws is compiled once
// against three's standard program text; on dispose every material it registered must be released. Canvas storage is a
// CPU-only fixture: shader ownership is checked, never painted pixels or WebGL.
import * as THREE from 'three';
import { isVehicleMaterialRegistered } from './materials.ts';
import { VEHICLE_ALPHA_TAG } from '../engine/vehicleOcclusion.ts';

const TAG_WRITE = `gl_FragColor.a += ${VEHICLE_ALPHA_TAG.toFixed(1)};`;

/** A cascade-registering engine context that records each material's registration, compiled entry and release. */
export function createCascadeRecorder() {
  const registered = new Set();
  const released = new Set();
  const entries = new Map();
  const engineCtx = {
    anisotropy: 1,
    setupShadowMaterial(material, hook) {
      material.defines = { ...material.defines, USE_CSM: 1, CSM_CASCADES: 4, CSM_FADE: '' };
      material.onBeforeCompile = (shader, renderer) => {
        shader.uniforms.CSM_cascades = { value: [] };
        entries.set(material, shader);
        hook?.(shader, renderer);
      };
      entries.set(material, null);
      registered.add(material);
      released.delete(material);
      return material;
    },
    releaseShadowMaterial(material) {
      if (!registered.has(material)) return false;
      registered.delete(material);
      released.add(material);
      entries.delete(material);
      return true;
    },
  };
  return { engineCtx, registered, released, entries };
}

function scratchShader(material) {
  const source = material.isMeshPhysicalMaterial ? THREE.ShaderLib.physical : THREE.ShaderLib.standard;
  return { vertexShader: source.vertexShader, fragmentShader: source.fragmentShader, uniforms: {}, defines: material.defines };
}

/** Whether a drawn material is an opaque lit one the scene target's alpha must tag. */
export function isTaggedSurface(material) {
  return !!material?.isMeshStandardMaterial && material.visible !== false && material.colorWrite !== false && !material.transparent;
}

/**
 * Every opaque lit material `root` draws that breaks the registration: rows of { mesh, material, fault }. `recorder` is
 * the createCascadeRecorder the tank was built through.
 */
export function auditVehicleMaterialRegistration(root, recorder) {
  const faults = new Map();
  const seen = new Map();
  root.traverseVisible((object) => {
    if (!object.isMesh) return;
    for (const material of [].concat(object.material ?? [])) {
      if (!isTaggedSurface(material)) continue;
      if (!seen.has(material)) seen.set(material, faultOf(material, recorder));
      const fault = seen.get(material);
      if (!fault) continue;
      const row = faults.get(material) ?? { material: material.name || material.type, fault, meshes: [] };
      row.meshes.push(object.name || object.type);
      faults.set(material, row);
    }
  });
  return { checked: seen.size, faults: [...faults.values()] };
}

function faultOf(material, recorder) {
  if (!recorder.registered.has(material) || !isVehicleMaterialRegistered(material)) return 'unregistered';
  if (material.defines?.USE_CSM !== 1 || material.defines?.CSM_CASCADES !== 4) return 'unregistered';
  const shader = scratchShader(material);
  try { material.onBeforeCompile(shader, {}); } catch (error) { return `throws (${error?.message ?? error})`; }
  if (recorder.entries.get(material) !== shader || !shader.uniforms.CSM_cascades) return 'replaced';
  if (!shader.fragmentShader.includes(TAG_WRITE)) return 'untagged';
  return null;
}

/** The registered materials a disposed build left in the cascade registry (a clone its profile never handed back). */
export function leakedRegistrations(recorder, before) {
  return [...recorder.registered].filter((material) => !before.has(material)).map((material) => material.name || material.type);
}
