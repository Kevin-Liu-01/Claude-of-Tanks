import type * as THREE from 'three';

/** The two validated procedural skies cover authored day/night returns. */
const RETAINED_ENVIRONMENTS = 2;

/** Per-Sky ownership: no shared render targets, partial bakes, or dead-context hits. */
export class SkyEnvironmentCache {
  private readonly cached = new Map<string, THREE.WebGLRenderTarget>();
  private readonly owned = new Set<THREE.WebGLRenderTarget>();
  private context: ReturnType<THREE.WebGLRenderer['getContext']> | null = null;
  private rendererInfo: THREE.WebGLRenderer['info'] | null = null;
  private active: THREE.WebGLRenderTarget | null = null;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    this.renderer = renderer;
    this.scene = scene;
  }

  private readonly disposed = (event: { target: THREE.WebGLRenderTarget }): void => {
    this.forget(event.target);
    if (this.scene.environment === event.target.texture) this.scene.environment = null;
  };

  private readonly textureDisposed = (event: { target: THREE.Texture }): void => {
    for (const target of this.owned) if (target.texture === event.target) this.release(target);
  };

  private forget(target: THREE.WebGLRenderTarget): void {
    this.owned.delete(target);
    target.removeEventListener('dispose', this.disposed);
    target.texture.removeEventListener('dispose', this.textureDisposed);
    for (const [key, value] of this.cached) if (value === target) this.cached.delete(key);
    if (this.active === target) this.active = null;
  }

  private release(target: THREE.WebGLRenderTarget): void {
    if (!this.owned.has(target)) return;
    this.forget(target);
    if (this.scene.environment === target.texture) this.scene.environment = null;
    target.dispose();
  }

  private releaseOthers(keep: THREE.WebGLRenderTarget | null, keepCached: boolean): void {
    let rethrow: (() => never) | null = null;
    for (const target of this.owned) {
      if (target === keep || (keepCached && this.isRetained(target))) continue;
      try { this.release(target); }
      catch (error) { rethrow ??= () => { throw error; }; }
    }
    rethrow?.();
  }

  private updateLifetime(): boolean {
    const context = this.renderer.getContext();
    const live = !context.isContextLost();
    if (!live || context !== this.context || this.renderer.info !== this.rendererInfo) {
      try { this.releaseOthers(null, false); }
      finally {
        this.context = context;
        this.rendererInfo = this.renderer.info;
      }
    }
    return live;
  }

  private isCurrent(): boolean {
    return this.renderer.getContext() === this.context
      && this.renderer.info === this.rendererInfo && !this.context?.isContextLost();
  }

  private isRetained(target: THREE.WebGLRenderTarget): boolean {
    for (const value of this.cached.values()) if (value === target) return true;
    return false;
  }

  private retain(key: string | null, target: THREE.WebGLRenderTarget): void {
    // A bypass remains the one active target but cannot become a later hit.
    if (key === null) {
      this.releaseOthers(target, false);
      return;
    }
    this.cached.delete(key);
    this.cached.set(key, target);
    this.releaseOthers(target, true);
    if (this.cached.size <= RETAINED_ENVIRONMENTS) return;
    const oldest = this.cached.values().next();
    if (!oldest.done) this.release(oldest.value);
  }

  private rollback(
    target: THREE.WebGLRenderTarget | undefined,
    previousEnvironment: THREE.Scene['environment'],
    previousIntensity: number,
    previousActive: THREE.WebGLRenderTarget | null,
  ): void {
    if (target && target !== previousActive) {
      try { this.release(target); } catch { /* Preserve the original transaction error. */ }
    }
    if (this.isCurrent()) {
      const previousDisposed = previousActive?.texture === previousEnvironment
        && !this.owned.has(previousActive);
      this.scene.environment = previousDisposed ? null : previousEnvironment;
      this.scene.environmentIntensity = previousIntensity;
      this.active = previousActive && this.owned.has(previousActive) ? previousActive : null;
    } else {
      try { this.updateLifetime(); } catch { /* Preserve the expired transaction error. */ }
    }
  }

  /** Validation runs on every installation, including an exact retained hit. */
  install(
    key: string | null,
    createTarget: () => THREE.WebGLRenderTarget,
    intensity: number,
    validate: () => boolean,
  ): void {
    if (!this.updateLifetime()) throw new Error('Sky environment requires a live graphics context');
    const previousEnvironment = this.scene.environment;
    const previousIntensity = this.scene.environmentIntensity;
    const previousActive = this.active;
    const cached = key === null ? undefined : this.cached.get(key);
    let target: THREE.WebGLRenderTarget | undefined;
    try {
      target = cached ?? createTarget();
      if (!this.owned.has(target)) {
        this.owned.add(target);
        target.addEventListener('dispose', this.disposed);
        target.texture.addEventListener('dispose', this.textureDisposed);
      }
      if (!this.isCurrent()) throw new Error('Sky environment bake outlived its graphics context');
      this.scene.environment = target.texture;
      this.scene.environmentIntensity = intensity;
      if (!validate()) {
        this.release(target);
        return;
      }
      if (!this.isCurrent() || !this.owned.has(target)) {
        throw new Error('Sky environment validation outlived its graphics resources');
      }
      this.active = target;
      this.retain(key, target);
    } catch (error) {
      this.rollback(target, previousEnvironment, previousIntensity, previousActive);
      throw error;
    }
  }
}
