// src/world/hinterland/install.ts — the Hinterland's scene object from the worker's answer (HL-3; HL-6 adds the
// outland's buildings and trees; the horizons stream, 2026-10-13): the land mesh over the height pyramid (mesh.ts), lit
// by the scene's own light model through the engine's lit-material setup (the cascade rule), its haze for the distance
// the compression takes away by the map's own air.
import * as THREE from 'three';
import { createHinterlandMesh } from './mesh.ts';
import { wirePyramid, type HinterlandWire } from './wire.ts';
import { createHinterlandSurface } from './material.ts';
import { createHinterlandOutlandObjects } from './buildings.ts';
import { createHinterlandAir } from './air.ts';
import { presetLightWorld } from '../../engine/quality.ts';

interface EngineLike {
  setupShadowMaterial?: (material: THREE.Material, hook: (shader: THREE.WebGLProgramParametersWithUniforms) => void) => THREE.Material;
  getDeviceTier?: () => string;
}

/** The Hinterland's group: the land, then (HL-6) the outland's buildings and trees. */
export function createHinterlandObject(wire: HinterlandWire, engineCtx: unknown): THREE.Object3D {
  const engine = (engineCtx ?? {}) as EngineLike;
  const group = new THREE.Group();
  group.name = 'hinterland';
  group.matrixAutoUpdate = false;
  const pyramid = wirePyramid(wire);
  // (the light tiers — a phone, the light presets — draw the land without its bedding, shoulders and ground bump: the
  // coordinator, "nothing at the phone/Ultra Low tiers"; read at the world's build, as the presets' light world is)
  const lite = engine.getDeviceTier?.() === 'mobile' || presetLightWorld();
  const surface = createHinterlandSurface(wire, { lite });
  // (one air for the land and the outland: their far haze ends in the dome's own sky)
  const air = createHinterlandAir(wire.air ?? 1);
  const land = createHinterlandMesh({
    pyramid,
    surface,
    air,
    // (a region's air: the alpine col's is clear, its ranges standing crisp at 10 km — regions.ts far.air)
    hazeSigma: Math.max(0, wire.fogDensity) * 0.42 * (wire.air ?? 1),
    setupMaterial: engine.setupShadowMaterial ? (material, hook) => { engine.setupShadowMaterial!(material, hook); } : undefined,
    // (Glacier round 6: a finer patch on the full tiers — the crags' faces and skylines smooth at 2–6 km)
    patchQuads: lite ? 16 : 32,
  });
  group.add(land.mesh);
  const outland = createHinterlandOutlandObjects(wire, pyramid, engine, air);
  if (outland) group.add(outland);
  group.userData.hinterlandLand = land;
  // (drawn after the battlefield's opaque objects — a group's order sorts its whole subtree — so the ground, props and
  // trees in front reject the land's hidden fragments by depth before its shader runs: at eye height the square covers
  // the lower half of the frame, and drawn first the land shaded all of it to be overwritten)
  group.renderOrder = 1;
  return group;
}
