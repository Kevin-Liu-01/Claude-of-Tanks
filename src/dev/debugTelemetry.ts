import * as THREE from 'three';

interface OutputResolution {
  native?: boolean;
  budgetLimited?: boolean;
  outputPixels?: number;
}

type DebugRenderer = THREE.WebGLRenderer & {
  userData: { outputResolution?: OutputResolution };
};

interface DebugLighting {
  getShadowTelemetry(): unknown;
  update(force?: boolean): void;
}

interface DebugPost {
  dynScale: number;
  perfTrim: unknown;
  upscaler: { telemetry(): unknown };
}

interface DebugTank {
  combat?: { destroyed?: boolean } | null;
}

interface DebugGame {
  phase: string;
  mapId?: string | null;
  timeS?: number;
  tanks?: DebugTank[];
  shells?: unknown;
}

interface DebugWorld {
  group?: THREE.Object3D;
  mapId?: string | null;
  destructibles?: unknown;
  tankWreckSpots?: unknown;
  getObstacles?(): unknown;
  getColliders?(): unknown;
  getConcealment?(): unknown;
  getLoosePropStats?(): { total: number; active: number };
}

interface NetworkTelemetry {
  connected?: boolean;
  rttMs?: number;
  rttJitterMs?: number;
  estimatedSnapshotLoss?: number;
  transportBufferedBytes?: number;
}

interface DiagnosticGlobal {
  devicePixelRatio?: number;
  __GL_DIAG?: { rescue?: string; errors?: unknown };
}

export interface DebugTelemetryDependencies {
  renderer: DebugRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  lighting: DebugLighting;
  post: DebugPost;
  game: DebugGame;
  getWorld(): DebugWorld | null;
  getNetworkTelemetry(): NetworkTelemetry | null;
  resolvePresetName(): string;
  getDeviceTier(): string;
  now?: () => number;
  nextFrame?: () => Promise<void>;
}

export interface DebugTelemetryOwner {
  collect(): Record<string, unknown>;
  sampleShadowContribution(): Promise<Record<string, unknown>>;
}

function collectionSize(value: unknown): number {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return 0;
  const candidate = value as { length?: number; size?: number };
  if (Number.isFinite(candidate.length)) return candidate.length as number;
  if (Number.isFinite(candidate.size)) return candidate.size as number;
  return 0;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
}

/** Own the low-frequency engineering dashboard and explicit shadow A/B probe. */
export function createDebugTelemetryOwner(
  deps: DebugTelemetryDependencies,
): DebugTelemetryOwner {
  const now = deps.now ?? (() => performance.now());
  const nextFrame = deps.nextFrame ?? (() => new Promise<void>(
    (resolve) => requestAnimationFrame(() => resolve()),
  ));
  const drawSize = new THREE.Vector2();
  const viewport = new THREE.Vector4();
  const scissor = new THREE.Vector4();
  const shadowCountCache: {
    root: THREE.Object3D | null;
    at: number;
    casters: number;
    receivers: number;
  } = { root: null, at: -Infinity, casters: 0, receivers: 0 };
  let gpuName: string | null = null;

  const diagnosticGlobal = (): DiagnosticGlobal => globalThis as DiagnosticGlobal;

  function shadowSceneCounts(force = false): { casters: number; receivers: number } {
    const root = deps.getWorld()?.group ?? deps.scene;
    const sampleNow = now();
    if (!force && shadowCountCache.root === root && sampleNow - shadowCountCache.at < 2000) {
      return { casters: shadowCountCache.casters, receivers: shadowCountCache.receivers };
    }
    let casters = 0;
    let receivers = 0;
    root.traverse((object) => {
      if (!object.visible || (!(object as THREE.Mesh).isMesh
        && !(object as THREE.InstancedMesh).isInstancedMesh)) return;
      const mesh = object as THREE.Mesh;
      if (mesh.castShadow) casters += 1;
      if (mesh.receiveShadow) receivers += 1;
    });
    shadowCountCache.root = root;
    shadowCountCache.at = sampleNow;
    shadowCountCache.casters = casters;
    shadowCountCache.receivers = receivers;
    return { casters, receivers };
  }

  function getGpuName(): string {
    if (gpuName !== null) return gpuName;
    gpuName = '';
    try {
      const gl = deps.renderer.getContext();
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      gpuName = String(info
        ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER) || '');
    } catch {
      // Masked or unsupported renderer strings are a valid privacy choice.
    }
    return gpuName;
  }

  function collect(): Record<string, unknown> {
    const draw = deps.renderer.getDrawingBufferSize(drawSize);
    const outputResolution = deps.renderer.userData.outputResolution ?? null;
    const shadow = recordValue(deps.lighting.getShadowTelemetry());
    const shadowCounts = shadowSceneCounts();
    const world = deps.getWorld();
    const loose = world?.getLoosePropStats?.() ?? { total: 0, active: 0 };
    const net = deps.getNetworkTelemetry();
    const tanks = deps.game.tanks ?? [];
    const alive = tanks.reduce((count, tank) => count + (!tank.combat?.destroyed ? 1 : 0), 0);
    const diag = diagnosticGlobal().__GL_DIAG;
    return {
      quality: {
        buffer: `${draw.x}×${draw.y}`,
        dpr: Number(deps.renderer.getPixelRatio().toFixed(2)),
        deviceDpr: Number((diagnosticGlobal().devicePixelRatio || 1).toFixed(2)),
        nativeOutput: outputResolution?.native ?? null,
        outputBudgetLimited: outputResolution?.budgetLimited ?? null,
        outputPixels: outputResolution?.outputPixels ?? draw.x * draw.y,
        renderScale: Number((Number(deps.renderer.domElement.dataset.renderScale) || 0).toFixed(3)),
        dynScale: Number(deps.post.dynScale.toFixed(3)),
        reconstruction: deps.post.upscaler.telemetry(),
        perfTrim: deps.post.perfTrim,
        preset: deps.resolvePresetName(),
        tier: deps.getDeviceTier(),
        gpu: getGpuName() || 'masked GPU',
      },
      simulation: {
        phase: deps.game.phase,
        map: world?.mapId ?? deps.game.mapId ?? null,
        timeS: deps.game.timeS ?? 0,
        tanks: collectionSize(tanks),
        alive,
        shells: collectionSize(deps.game.shells),
      },
      world: {
        obstacles: collectionSize(world?.getObstacles?.()),
        colliders: collectionSize(world?.getColliders?.()),
        concealers: collectionSize(world?.getConcealment?.()),
        destructibles: collectionSize(world?.destructibles),
        wrecks: collectionSize(world?.tankWreckSpots),
        looseTotal: loose.total,
        looseActive: loose.active,
      },
      shadows: {
        ...shadow,
        enabled: !!deps.renderer.shadowMap.enabled,
        rescue: diag?.rescue ?? null,
        shaderErrors: collectionSize(diag?.errors),
        ...shadowCounts,
      },
      network: net ? {
        connected: !!net.connected,
        rttMs: net.rttMs ?? 0,
        jitterMs: net.rttJitterMs ?? 0,
        lossPct: (net.estimatedSnapshotLoss ?? 0) * 100,
        bufferedBytes: net.transportBufferedBytes ?? 0,
      } : { connected: null },
      memory: { drawBuffer: `${draw.x}×${draw.y}` },
    };
  }

  function markShadowProgramsDirty(): void {
    deps.scene.traverse((object) => {
      const material = (object as THREE.Mesh).material;
      if (!material) return;
      const materials = Array.isArray(material) ? material : [material];
      for (const entry of materials) entry.needsUpdate = true;
    });
  }

  async function sampleShadowContribution(): Promise<Record<string, unknown>> {
    const initialShadow = deps.renderer.shadowMap.enabled;
    const counts = shadowSceneCounts(true);
    if (!initialShadow) {
      return {
        skipped: true,
        reason: diagnosticGlobal().__GL_DIAG?.rescue ?? 'shadow maps disabled',
        ...counts,
      };
    }
    const width = 96;
    const height = 54;
    const pixels = width * height;
    const withShadow = new Uint8Array(pixels * 4);
    const withoutShadow = new Uint8Array(pixels * 4);
    const target = new THREE.WebGLRenderTarget(width, height, {
      depthBuffer: true,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    const previousTarget = deps.renderer.getRenderTarget();
    const previousViewport = deps.renderer.getViewport(viewport);
    const previousScissor = deps.renderer.getScissor(scissor);
    const previousScissorTest = deps.renderer.getScissorTest();
    const previousAutoClear = deps.renderer.autoClear;
    const renderVariant = (enabled: boolean, output: Uint8Array<ArrayBuffer>): void => {
      deps.renderer.shadowMap.enabled = enabled;
      markShadowProgramsDirty();
      deps.lighting.update(true);
      deps.renderer.setRenderTarget(target);
      deps.renderer.setViewport(0, 0, width, height);
      deps.renderer.setScissorTest(false);
      deps.renderer.autoClear = true;
      deps.renderer.clear(true, true, false);
      deps.renderer.render(deps.scene, deps.camera);
      deps.renderer.readRenderTargetPixels(target, 0, 0, width, height, output);
    };
    try {
      renderVariant(true, withShadow);
      renderVariant(false, withoutShadow);
      let absDelta = 0;
      let changedDelta = 0;
      let maxLumaDelta = 0;
      let changed = 0;
      let darkened = 0;
      let lumaOn = 0;
      let lumaOff = 0;
      for (let index = 0; index < withShadow.length; index += 4) {
        const on = withShadow[index] * 0.2126 + withShadow[index + 1] * 0.7152
          + withShadow[index + 2] * 0.0722;
        const off = withoutShadow[index] * 0.2126 + withoutShadow[index + 1] * 0.7152
          + withoutShadow[index + 2] * 0.0722;
        const delta = Math.abs(on - off);
        absDelta += delta;
        maxLumaDelta = Math.max(maxLumaDelta, delta);
        lumaOn += on;
        lumaOff += off;
        if (delta > 2) { changed += 1; changedDelta += delta; }
        if (off - on > 2) darkened += 1;
      }
      return {
        skipped: false,
        width,
        height,
        meanAbsLumaDelta: absDelta / pixels,
        meanChangedLumaDelta: changed ? changedDelta / changed : 0,
        maxLumaDelta,
        changedPixelRatio: changed / pixels,
        darkenedPixelRatio: darkened / pixels,
        meanLumaWithShadows: lumaOn / pixels,
        meanLumaWithoutShadows: lumaOff / pixels,
        ...counts,
      };
    } finally {
      deps.renderer.shadowMap.enabled = initialShadow;
      markShadowProgramsDirty();
      deps.lighting.update(true);
      deps.renderer.setRenderTarget(previousTarget);
      deps.renderer.setViewport(previousViewport);
      deps.renderer.setScissor(previousScissor);
      deps.renderer.setScissorTest(previousScissorTest);
      deps.renderer.autoClear = previousAutoClear;
      target.dispose();
      await nextFrame();
    }
  }

  return { collect, sampleShadowContribution };
}
