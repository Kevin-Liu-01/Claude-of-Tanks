import type { ProgramOriginWatch } from '../engine/programReceipt.ts';

/** The draw entry point the watch wraps (three's WebGLRenderer.renderBufferDirect), as far as the watch reads it. */
type DrawCall<Material, Node> = (
  this: unknown,
  camera: unknown,
  scene: unknown,
  geometry: unknown,
  material: Material,
  object: Node,
  group: unknown,
) => void;

interface WatchedNode {
  name?: string;
  type?: string;
  parent?: WatchedNode | null;
}

export interface ProgramOriginRenderer<Material extends { type: string }, Node extends WatchedNode> {
  renderBufferDirect: DrawCall<Material, Node>;
  info: { programs?: readonly unknown[] | null };
}

interface ProgramOriginWatcherOptions {
  /** A watch stops by itself after this long, so no live frame carries the check after its window. */
  watchMs?: number;
  setTimer?: (callback: () => void, milliseconds: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface ProgramOriginWatcher<Node> {
  /** Arm one watch: the draws that link a program until stop() (or the window), each as `material<object<parent<...`. */
  watch(annotate?: (object: Node) => string): ProgramOriginWatch;
  /** Watches armed and not yet stopped. */
  readonly active: number;
}

/**
 * (2026-10-27, the room-stalls lane; 2026-11-02 audit F2) The program-link origin watch as ONE wrapper around the
 * renderer's draw entry point, shared by every armed watch and removed when the last one stops. Each watch used to
 * wrap whatever was installed and restore its predecessor only if it was still on top, so two watches stopped in arm
 * order (the network reveal's and the Garage restore's late links, a leave and rejoin within the window) left the
 * inner wrapper on every draw for the life of the renderer.
 */
export function createProgramOriginWatcher<Material extends { type: string }, Node extends WatchedNode>(
  renderer: ProgramOriginRenderer<Material, Node>,
  {
    watchMs = 10_000,
    setTimer = (callback, milliseconds) => setTimeout(callback, milliseconds),
    clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  }: ProgramOriginWatcherOptions = {},
): ProgramOriginWatcher<Node> {
  interface ArmedWatch { readonly origins: string[]; readonly annotate?: (object: Node) => string }
  const armed = new Set<ArmedWatch>();
  let original: DrawCall<Material, Node> | null = null;

  const watched: DrawCall<Material, Node> = function (this: unknown, camera, drawScene, geometry, material, object, group) {
    const draw = original;
    if (!draw) return;
    const before = renderer.info.programs?.length ?? 0;
    draw.call(this, camera, drawScene, geometry, material, object, group);
    if ((renderer.info.programs?.length ?? 0) <= before) return;
    let origin: string | null = null;
    for (const watch of armed) {
      if (watch.origins.length >= 8) continue;
      if (origin === null) {
        const path: string[] = [material.type];
        for (let node: Node | null | undefined = object; node && path.length < 5; node = node.parent as Node | null | undefined) {
          path.push(node.name || node.type || '?');
        }
        origin = path.join('<');
      }
      watch.origins.push(`${origin}${watch.annotate?.(object) ?? ''}`);
    }
  };

  const install = (): void => {
    // still in the chain (left inert under a later patch): it records again, never wraps itself a second time
    if (original) return;
    original = renderer.renderBufferDirect;
    renderer.renderBufferDirect = watched;
  };
  const uninstall = (): void => {
    // Another patch installed over ours keeps working: ours then stays inert under it, never a stale copy of it.
    if (!original || renderer.renderBufferDirect !== watched) return;
    renderer.renderBufferDirect = original;
    original = null;
  };

  return {
    watch(annotate) {
      const watch: ArmedWatch = { origins: [], annotate };
      armed.add(watch);
      install();
      let stopped = false;
      let timer: unknown = null;
      const stop = (): void => {
        if (stopped) return;
        stopped = true;
        if (timer !== null) clearTimer(timer);
        armed.delete(watch);
        if (armed.size === 0) uninstall();
      };
      timer = setTimer(stop, watchMs);
      return { origins: watch.origins, stop };
    },
    get active() { return armed.size; },
  };
}
