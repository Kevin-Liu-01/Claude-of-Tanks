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
  const surface = createHinterlandSurface(wire);
  // (one air for the land and the outland: their far haze ends in the dome's own sky)
  const air = createHinterlandAir();
  const land = createHinterlandMesh({
    pyramid,
    surface,
    air,
    hazeSigma: Math.max(0, wire.fogDensity) * 0.42,
    setupMaterial: engine.setupShadowMaterial ? (material, hook) => { engine.setupShadowMaterial!(material, hook); } : undefined,
  });
  group.add(land.mesh);
  const outland = createHinterlandOutlandObjects(wire, pyramid, engine, air);
  if (outland) group.add(outland);
  group.userData.hinterlandLand = land;
  return group;
}
