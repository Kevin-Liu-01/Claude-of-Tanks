import type { Camera, Material, Object3D } from 'three';
import { nextPaintFrame } from '../engine/frameScheduler.ts';
import type { OffscreenSceneWarmer } from '../engine/offscreenWarm.ts';
import type { ForwardProgramCompileTiming, ProgramPreparationResult } from '../engine/programWarm.ts';

interface FxRenderable extends Object3D {
  isMesh?: boolean;
  isPoints?: boolean;
  isLine?: boolean;
  isSprite?: boolean;
  material?: Material | Material[];
}

export interface DeploymentFxProgramReceipt {
  /** Eligible objects, not isolated-draw cohorts (which may include skipped materials/layers). */
  objects: number;
  result: ProgramPreparationResult;
  timing: ForwardProgramCompileTiming;
  stepCount: number;
  /** Synchronous step wall time only, separate from scheduling waits and later draws. */
  syncMs: number;
  maxStepMs: number;
  totalMs: number;
  error?: string;
}

export interface DeploymentFxProgramOptions {
  root: Object3D;
  camera: Pick<Camera, 'layers'>;
  warmRender: Pick<OffscreenSceneWarmer, 'prepareProgramsSteps'>;
  /** Caller owns generation, FX pool/root identity and renderer info/context lifetime. */
  assertCurrent(): void;
  yieldProgramFrame?: () => Promise<void>;
  now?: () => number;
  /** Publish the bounded record before awaiting so cancellation retains paid work. */
  onReceipt?(receipt: DeploymentFxProgramReceipt): void;
}

function visibleAncestry(root: Object3D): boolean {
  for (let ancestor: Object3D | null = root; ancestor; ancestor = ancestor.parent) {
    if (!ancestor.visible) return false;
  }
  return true;
}

function visibleMaterial(object: FxRenderable): boolean {
  const material = object.material;
  return Array.isArray(material)
    ? material.some(entry => entry?.visible === true)
    : material?.visible === true;
}

function selectedFxObjects(root: Object3D, camera: Pick<Camera, 'layers'>): Object3D[] {
  const selected: Object3D[] = [];
  if (!visibleAncestry(root)) return selected;
  root.traverseVisible(object => {
    const candidate = object as FxRenderable;
    if (!(candidate.isMesh || candidate.isPoints || candidate.isLine || candidate.isSprite)) return;
    if (candidate.layers.test(camera.layers) && visibleMaterial(candidate)) selected.push(object);
  });
  return selected;
}

function noteFailure(receipt: DeploymentFxProgramReceipt, error: object | string | number | boolean | null | undefined): void {
  receipt.result = { status: 'incomplete', pending: null, reason: 'reflection' };
  receipt.error = String(error).slice(0, 512);
}

function terminalResult(result: ProgramPreparationResult | undefined): ProgramPreparationResult {
  if (result?.status === 'complete' && result.pending === 0) return result;
  if (result?.status === 'incomplete') return result;
  throw new Error('FX program preparation ended without a valid completion receipt');
}

/**
 * Prepare only the staged, actually eligible FX objects against the warmer's
 * exact private target. Keep the staging lease and camera mask owned by the
 * caller; this helper never changes visibility, layers, materials or parents.
 * Strict owner budgets are final: an incomplete result is recorded, not retried.
 */
export async function prepareDeploymentFxPrograms({
  root, camera, warmRender, assertCurrent: checkCurrent,
  yieldProgramFrame = nextPaintFrame, now = () => performance.now(), onReceipt,
}: DeploymentFxProgramOptions): Promise<DeploymentFxProgramReceipt> {
  checkCurrent();
  const startedAt = now();
  const objects = selectedFxObjects(root, camera);
  const receipt: DeploymentFxProgramReceipt = {
    objects: objects.length,
    result: { status: 'incomplete', pending: null, reason: 'not-requested' },
    timing: {}, stepCount: 0, syncMs: 0, maxStepMs: 0, totalMs: 0,
  };
  onReceipt?.(receipt);
  const assertCurrent = (): void => {
    try { checkCurrent(); }
    catch (error) {
      receipt.result = { status: 'incomplete', pending: null, reason: 'invalidated' };
      receipt.error = String(error).slice(0, 512);
      throw error;
    }
  };
  let steps: ReturnType<OffscreenSceneWarmer['prepareProgramsSteps']> | undefined;
  try {
    assertCurrent();
    if (objects.length) {
      try { steps = warmRender.prepareProgramsSteps(objects, receipt.timing); }
      catch (error) { noteFailure(receipt, error as Error); }
    }
    while (steps) {
      assertCurrent();
      const stepAt = now();
      let step: ReturnType<typeof steps.next>;
      try {
        step = steps.next();
        if (step.done) receipt.result = terminalResult(step.value);
      } catch (error) {
        noteFailure(receipt, error as Error);
        break;
      } finally {
        const elapsed = Math.max(0, now() - stepAt);
        receipt.stepCount++;
        receipt.syncMs += elapsed;
        receipt.maxStepMs = Math.max(receipt.maxStepMs, elapsed);
      }
      assertCurrent();
      if (step.done) break;
      // A task-only loading yield can exhaust native link polls without ever
      // allowing a rendering opportunity. The default requires rAF AND a task.
      assertCurrent();
      try { await yieldProgramFrame(); }
      finally { assertCurrent(); }
    }
  } catch (error) {
    receipt.result = { status: 'incomplete', pending: null, reason: 'invalidated' };
    receipt.error = String(error).slice(0, 512);
    throw error;
  } finally {
    try { steps?.return({ status: 'incomplete', pending: null, reason: 'invalidated' }); }
    catch (error) { noteFailure(receipt, error as Error); }
    receipt.totalMs = Math.max(0, now() - startedAt);
  }
  // Native failures are optional warm fallbacks. Lost caller ownership is not.
  assertCurrent();
  return receipt;
}
