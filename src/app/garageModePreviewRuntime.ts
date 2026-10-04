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
      if (!pending) owner.current?.update(root, spec, mode, dt);
      return;
    }
    root = nextRoot; mode = nextMode;
    const token = ++generation, current = () => token === generation;
    // The ordinary Garage never acquires optional equipment or shader code.
    if (!hasPreview(mode) && !owner.current && !pending) return;
    const retry = failed;
    pending = true; failed = false;
    // Start transfer immediately; queued preparation still owns all mutations.
    const loaded = owner.preload();
    // The serialized consumer below reports failure; attach now in case a
    // rejected import settles while an older GPU preparation still yields.
    void loaded.catch(() => {});
    tail = tail.then(async () => {
      const preview = await loaded;
      if (!current()) return;
      if (preview.update(nextRoot, spec, nextMode, 0) !== false || retry) await prepare(nextRoot, current);
    }).catch(error => { if (current()) { failed = true; report(error); } }).finally(() => {
      if (!current()) return;
      pending = false;
      invalidate();
    });
  }
  return { preload, update, clear, get pending() { return pending; } };
}
