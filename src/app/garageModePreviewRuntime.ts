import type { ProgramPreparationResult } from '../engine/programWarm.ts';
import type { Object3D } from 'three';
import type { MissionCarrierSpec } from '../sim/missionAttachment.ts';
import type { createGarageModePreview } from '../game/garageModePreview.ts';
import { createLazyRuntimeOwner } from './lazyRuntimeOwner.ts';

type Preview = ReturnType<typeof createGarageModePreview>;
interface Options {
  load(): Promise<Preview>;
  prepare(root: Object3D, current: () => boolean): Promise<void>;
  invalidate(): void;
  warn(error: Error): void;
}
const hasPreview = (mode: string) => ['juggernaut', 'infected', 'capture_the_flag', 'drone'].includes(mode);

/** Prepare the selected mode before its first visible frame. The canvas retains
 * the previous complete frame while DOM controls and network pumping stay live.
 * Serial ownership prevents a stale shader warm from touching a newer selection. */
export function createGarageModePreviewRuntime({ load, prepare, invalidate, warn }: Options) {
  const owner = createLazyRuntimeOwner(load, runtime => runtime);
  let root: Object3D | null = null, mode = '', generation = 0, pending = false, failed = false;
  let tail = Promise.resolve();
  const report = (error: Error) => warn(error instanceof Error ? error : new Error(String(error)));
  const preload = () => owner.preload().then(() => {
    if (failed) { root = null; invalidate(); }
  }, report);
  function clear() {
    if (!root && !pending && !failed) return;
    generation++;
    root = null; mode = ''; pending = false; failed = false;
    owner.current?.clear();
  }
  function update(nextRoot: Object3D | null, spec: MissionCarrierSpec | null, nextMode: string, dt: number) {
    if (!nextRoot || !spec) { clear(); return; }
    if (root === nextRoot && mode === nextMode) {
      if (!pending && !failed) owner.current?.update(root, spec, mode, dt);
      return;
    }
    root = nextRoot; mode = nextMode;
    const token = ++generation, current = () => token === generation;
    // Optional equipment stays lazy; the dormant energy shader is already
    // part of the pedestal hero's ordinary covered preparation.
    if (!hasPreview(mode) && !owner.current && !pending) return;
    const retry = failed || pending;
    // Resident aura styles and a disabled aura are uniform-only changes.
    // Apply them synchronously, without freezing even one Garage frame.
    const updated = !!owner.current && !pending && !retry;
    const needsWarm = updated ? owner.current!.update(nextRoot, spec, nextMode, 0) : undefined;
    if (updated && needsWarm === false) { invalidate(); return; }
    pending = true; failed = false;
    // Start transfer immediately; queued preparation still owns all mutations.
    const loaded = owner.preload();
    // The serialized consumer below reports failure; attach now in case a
    // rejected import settles while an older GPU preparation still yields.
    void loaded.catch(() => {});
    tail = tail.then(async () => {
      const preview = await loaded;
      if (!current()) return;
      if ((updated ? needsWarm : preview.update(nextRoot, spec, nextMode, 0)) !== false || retry) await prepare(nextRoot, current);
    }).catch(error => { if (current()) { failed = true; owner.current?.clear(); report(error); } }).finally(() => {
      if (!current()) return;
      pending = false;
      invalidate();
    });
  }
  return { preload, update, clear, get pending() { return pending; } };
}

/** Never reveal a shader merely because its bounded preparation iterator ended.
 * Slow drivers can need another yielded admission window; failed preparation
 * restores plain paint through the preview owner's error path. */
export async function prepareGarageModePrograms(
  createSteps: () => Generator<void, ProgramPreparationResult, void>,
  current: () => boolean,
  yieldFrame: () => Promise<void>,
): Promise<void> {
  for (let attempt = 0; attempt < 3 && current(); attempt++) {
    const steps = createSteps();
    try {
      while (current()) {
        const step = steps.next();
        if (step.done) {
          if (step.value.status === 'complete') return;
          if (step.value.reason !== 'budget') throw new Error(`Garage mode shader preparation failed: ${step.value.reason}`);
          break;
        }
        await yieldFrame();
      }
    } finally { steps.return({status:'incomplete',pending:null,reason:'invalidated'}); }
    if (current()) await yieldFrame();
  }
  if (current()) throw new Error('Garage mode shader preparation exceeded its retry budget');
}
