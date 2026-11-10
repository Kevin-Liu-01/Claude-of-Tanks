/**
 * Three's dispose listeners can outlive the GL context which allocated their
 * handles. Its restored renderer builds fresh property stores, but an old
 * geometry/target listener still closes over the previous store. Deleting one
 * of those browser-invalidated handles on the restored context raises
 * INVALID_OPERATION. Track allocations, and retire only that stale deletion.
 * Drawing and current-context validation remain entirely native.
 */
export interface ContextResourceLifetime {
  /**
   * (2026-11-02 audit R3) count one loss (idempotent per event). The canvas listener calls it, and the context recovery
   * calls it first on the same event (contextRecovery.ts beforeLost), so the generation moves before any owner's
   * onLost whatever order the listeners were registered in.
   */
  noteLost(event?: unknown): void;
  dispose(): void;
}

export function installContextResourceLifetime(
  gl: WebGL2RenderingContext,
  canvas: Pick<HTMLCanvasElement, 'addEventListener' | 'removeEventListener'>,
): ContextResourceLifetime {
  let generation = 0;
  const generations = new WeakMap<object, number>();
  const restoreMethods: Array<() => void> = [];
  function protect<Args extends number[], Handle extends object | null>(
    create: (...args: Args) => Handle,
    remove: (resource: NoInfer<Handle> | null) => void,
    install: (create: (...args: NoInfer<Args>) => NoInfer<Handle>, remove: (resource: NoInfer<Handle> | null) => void) => void,
  ): void {
    install(function (...args: Args): Handle {
      const resource = create.apply(gl, args);
      if (resource) generations.set(resource, generation);
      return resource;
    }, function (resource: Handle | null): void {
      const created = resource && generations.get(resource);
      // Unknown handles retain native validation. Skip only allocations whose
      // ownership by a lost context we actually witnessed.
      if (created !== undefined && created !== null && created < generation) return;
      remove.call(gl, resource);
    });
    restoreMethods.push(() => install(create, remove));
  }
  // Explicit families keep their native parameter/return types. Syncs use
  // fenceSync, and timer queries may be disposed long after a context loss.
  protect(gl.createBuffer, gl.deleteBuffer, (create, remove) => { gl.createBuffer = create; gl.deleteBuffer = remove; });
  protect(gl.createTexture, gl.deleteTexture, (create, remove) => { gl.createTexture = create; gl.deleteTexture = remove; });
  protect(gl.createFramebuffer, gl.deleteFramebuffer, (create, remove) => { gl.createFramebuffer = create; gl.deleteFramebuffer = remove; });
  protect(gl.createRenderbuffer, gl.deleteRenderbuffer, (create, remove) => { gl.createRenderbuffer = create; gl.deleteRenderbuffer = remove; });
  protect(gl.createProgram, gl.deleteProgram, (create, remove) => { gl.createProgram = create; gl.deleteProgram = remove; });
  protect(gl.createShader, gl.deleteShader, (create, remove) => { gl.createShader = create; gl.deleteShader = remove; });
  protect(gl.createVertexArray, gl.deleteVertexArray, (create, remove) => { gl.createVertexArray = create; gl.deleteVertexArray = remove; });
  protect(gl.createQuery, gl.deleteQuery, (create, remove) => { gl.createQuery = create; gl.deleteQuery = remove; });
  protect(gl.createSampler, gl.deleteSampler, (create, remove) => { gl.createSampler = create; gl.deleteSampler = remove; });
  protect(gl.createTransformFeedback, gl.deleteTransformFeedback, (create, remove) => { gl.createTransformFeedback = create; gl.deleteTransformFeedback = remove; });
  protect(gl.fenceSync, gl.deleteSync, (create, remove) => { gl.fenceSync = create; gl.deleteSync = remove; });
  const counted = new WeakSet<object>();
  const noteLost = (event?: unknown): void => {
    if (event && typeof event === 'object') {
      if (counted.has(event)) return;
      counted.add(event);
    }
    generation++;
  };
  const lost = (event: Event) => { noteLost(event); };
  canvas.addEventListener('webglcontextlost', lost);
  return {
    noteLost,
    dispose() {
      canvas.removeEventListener('webglcontextlost', lost);
      for (const restore of restoreMethods) restore();
    },
  };
}
