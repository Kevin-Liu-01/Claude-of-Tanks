import type { Object3D, BufferGeometry, Material, Texture } from 'three';
import type { OffscreenSceneWarmer } from './offscreenWarm.ts';
import { ProgramUniformPreparationError, type ForwardProgramCompileTiming } from './programWarm.ts';

interface UploadObject extends Object3D {
  geometry: BufferGeometry;
  material: Material | Material[];
  isInstancedMesh?: boolean;
  instanceColor?: BufferGeometry['attributes'][string] | null;
  morphTexture?: Texture | null;
  isBatchedMesh?: boolean;
  _colorsTexture?: Texture | null;
  isSkinnedMesh?: boolean;
}

export interface DeploymentUploadProgramReceipt {
  variants: number;
  stepMs: number[];
  maxStepMs: number;
  syncMs: number;
  totalMs: number;
  timing: ForwardProgramCompileTiming;
}

/** Object-dependent parameters of the fixed, textureless MeshBasic upload material.
 * Renderer, light, fog and target parameters are shared by every representative.
 * The self-test checks this partition against the pinned native program keys.
 */
export function deploymentUploadVariantKey(object: Object3D): string {
  const candidate = object as UploadObject;
  const { attributes, morphAttributes } = candidate.geometry;
  const morph = morphAttributes.position ?? morphAttributes.normal ?? morphAttributes.color;
  return [
    candidate.isInstancedMesh === true,
    candidate.isInstancedMesh === true && candidate.instanceColor !== null,
    candidate.isInstancedMesh === true && candidate.morphTexture !== null,
    candidate.isBatchedMesh === true,
    candidate.isBatchedMesh === true && candidate._colorsTexture !== null,
    candidate.isSkinnedMesh === true,
    attributes.position !== undefined,
    attributes.normal !== undefined,
    morphAttributes.position !== undefined,
    morphAttributes.normal !== undefined,
    morphAttributes.color !== undefined,
    morph?.length ?? 0,
    morphAttributes.color ? 3 : morphAttributes.normal ? 2 : morphAttributes.position ? 1 : 0,
  ].join('/');
}

export async function prepareDeploymentUploadPrograms(
  objects: readonly Object3D[],
  material: Material,
  warmRender: Pick<OffscreenSceneWarmer, 'prepareProgramsSteps'>,
  yieldCovered: () => Promise<void>,
  now: () => number,
): Promise<DeploymentUploadProgramReceipt> {
  const startedAt = now();
  const representatives = new Map<string, UploadObject>();
  for (const object of objects) {
    const key = deploymentUploadVariantKey(object);
    if (!representatives.has(key)) representatives.set(key, object as UploadObject);
  }
  const selected = [...representatives.values()];
  const timing: ForwardProgramCompileTiming = {};
  const stepMs: number[] = [];
  const steps = warmRender.prepareProgramsSteps(selected, timing);
  try {
    while (true) {
      await yieldCovered();
      const prior = selected.map(object => ({ object, material: object.material }));
      const stepAt = now();
      let step: ReturnType<typeof steps.next>;
      try {
        // Native compile ignores scene.overrideMaterial. The strict owner
        // submits these exact objects and captures ALL cached material variants.
        for (const { object } of prior) object.material = material;
        step = steps.next();
      } finally {
        for (const state of prior) state.object.material = state.material;
        stepMs.push(now() - stepAt);
      }
      if (step.done) {
        if (step.value.status !== 'complete') throw new ProgramUniformPreparationError(step.value);
        break;
      }
    }
  } finally { steps.return({ status: 'incomplete', pending: null, reason: 'invalidated' }); }
  return { variants: selected.length, stepMs, maxStepMs: Math.max(0, ...stepMs),
    syncMs: stepMs.reduce((sum, elapsed) => sum + elapsed, 0), totalMs: now() - startedAt, timing };
}
