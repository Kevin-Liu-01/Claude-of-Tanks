import * as THREE from 'three';

import { GARAGE_VARIANTS, type GarageVariant } from '../game/garageVariants.ts';
import { registerRetainedObject3DResources } from '../engine/resourceLifetime.ts';
import type {
  GarageEnvironmentAssetLibrary,
  GarageEnvironmentBuild,
} from './garageEnvironmentKit.ts';

interface ArchitectureEngineContext {
  anisotropy?: number;
  renderer?: THREE.WebGLRenderer;
  scene?: THREE.Scene;
  camera?: THREE.Camera;
  setupShadowMaterial?(material: THREE.Material): void;
}

export interface GarageArchitectureStats {
  key: GarageVariant['architecture'];
  mapId: string;
  mode: 'verdant-workshop' | 'garage-environment';
  signature: string;
  objects: number;
  drawCalls: number;
  triangles: number;
  cached: number;
  cacheLimit: number;
  residentTextureSets: number;
  referencedTextureSets: number;
  enclosingSurfaces: number;
  ready: boolean;
  source: 'verdant-workshop' | 'authentic-garage-scene-pack';
  sourceBeat: string;
  sourceStructure: string;
  sourceLandmarkLocal: readonly [number, number, number] | null;
  distinctiveElements: readonly string[];
  landmarkHeightM: number;
  serviceFrame: string;
  terrainProfile: string;
  terrainSourceAnchor: readonly [number, number] | null;
  terrainVertices: number;
  textureSets: readonly string[];
  treeSpecies: readonly string[];
  trees: number;
  backdropLayers: number;
  groundCover: number;
  structures: number;
  wrecks: number;
  facilityProps: number;
  facilityStations: number;
  looseParts: number;
  railSegments: number;
  serviceVehicles: number;
  outdoorWarmReady: boolean;
  lastBuildMs: number;
}

const CACHE_LIMIT = 2;
const loadEnvironmentKit = () => import('./garageEnvironmentKit.ts');

function buildVerdantWorkshopOwner(): GarageEnvironmentBuild {
  const root = new THREE.Group();
  root.name = 'garage_environment_field_shed';
  root.userData.perfOwner = 'garage/verdant-workshop-stage';
  const stats = Object.freeze({
    distinctiveElements: Object.freeze([
      'restored enclosed workshop shell',
      'connected high-bay maintenance volume',
      'wall tools, service signage and floor equipment',
      'authored industrial lighting fixtures',
    ]),
    drawCalls: 0,
    enclosingSurfaces: 4,
    landmarkHeightM: 10,
    objects: 0,
    serviceFrame: 'original enclosed Verdant motor-pool workshop',
    signature: 'field_shed:restored-original-workshop',
    sourceBeat: 'authored-field-workshop',
    sourceLandmarkLocal: Object.freeze([0, 10, -21] as const),
    sourceStructure: 'original Verdant indoor motor pool',
    terrainProfile: 'sealed concrete maintenance floor',
    terrainSourceAnchor: Object.freeze([0, 0] as const),
    terrainVertices: 0,
    textureSets: Object.freeze(['original-wall', 'original-floor', 'original-podium']),
    treeSpecies: Object.freeze([]),
    trees: 0,
    backdropLayers: 0,
    groundCover: 0,
    structures: 1,
    wrecks: 0,
    facilityProps: 0,
    facilityStations: 4,
    looseParts: 0,
    railSegments: 0,
    serviceVehicles: 0,
    triangles: 0,
  });
  Object.assign(root.userData, stats, {
    mode: 'verdant-workshop',
    ready: true,
    source: 'verdant-workshop',
  });
  return {
    root,
    stats,
    dispose() {
      root.removeFromParent();
      root.clear();
    },
  };
}

/**
 * Own the bounded Garage scene-pack cache. Loading the real world-asset
 * builders is intentionally outside the boot-critical Garage chunk; packs
 * stream behind the existing cover and stale rapid-switch completions never
 * become visible.
 */
export function createGarageArchitectureController(
  engineCtx: ArchitectureEngineContext,
  parent: THREE.Object3D,
  requestRender: () => void = () => {},
) {
  const group = new THREE.Group();
  group.name = 'garage_variant_architecture';
  group.userData.perfOwner = 'garage/architecture';
  parent.add(group);

  const cache = new Map<GarageVariant['architecture'], GarageEnvironmentBuild>();
  const pending = new Map<GarageVariant['architecture'], Promise<GarageEnvironmentBuild | null>>();
  let assets: GarageEnvironmentAssetLibrary | null = null;
  let active: GarageEnvironmentBuild | null = null;
  let selected: GarageVariant | null = null;
  let lastBuildMs = 0;
  let textureWarmScheduled = false;
  let environmentKitPromise: ReturnType<typeof loadEnvironmentKit> | null = null;
  let idleWarmTimer: ReturnType<typeof setTimeout> | null = null;
  let selectionGeneration = 0;
  let outdoorWarmReady = !engineCtx.renderer || typeof document === 'undefined';
  const warmedArchitectures = new Set<GarageVariant['architecture']>();
  let disposed = false;

  const isVariantWarm = (variant: GarageVariant): boolean => (
    variant.architecture === 'field_shed'
    || outdoorWarmReady
    || warmedArchitectures.has(variant.architecture)
  );

  const getEnvironmentKit = (): ReturnType<typeof loadEnvironmentKit> => (
    environmentKitPromise ||= loadEnvironmentKit()
  );

  const ensureAssets = (
    kit: Awaited<ReturnType<typeof loadEnvironmentKit>>,
  ): GarageEnvironmentAssetLibrary => {
    if (!assets) {
      assets = kit.createGarageEnvironmentAssetLibrary(engineCtx);
      registerRetainedObject3DResources(group, { textures: assets.retainedTextures() });
    }
    return assets;
  };

  const scheduleOutdoorAssetWarm = (): void => {
    if (textureWarmScheduled || idleWarmTimer !== null || disposed) return;
    const readinessHost = globalThis as typeof globalThis & { __GAME_READY?: boolean };
    if (typeof document !== 'undefined' && readinessHost.__GAME_READY !== true) {
      idleWarmTimer = setTimeout(() => {
        idleWarmTimer = null;
        scheduleOutdoorAssetWarm();
      }, 200);
      return;
    }
    // Verdant is ready synchronously. Import and decode the shared nine-surface
    // library only after that first interactive frame, so the first outdoor
    // selection does not pay a module-parse + image-decode hitch while cold
    // boot remains untouched.
    const host = globalThis as typeof globalThis & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
    };
    const warm = (): void => {
      idleWarmTimer = null;
      if (textureWarmScheduled || disposed) return;
      void getEnvironmentKit().then((kit) => {
        if (disposed) return;
        const library = ensureAssets(kit);
        textureWarmScheduled = true;
        library.warmAll(requestRender);
        const outdoorVariants = GARAGE_VARIANTS.filter(
          (variant) => variant.architecture !== 'field_shed',
        );
        if (!outdoorVariants.length) return;
        void (async () => {
          const { renderer, scene, camera } = engineCtx;
          if (!renderer || !scene || !camera || typeof document === 'undefined') {
            outdoorWarmReady = true;
            publish();
            return;
          }
          // Wait for the actual 512 px image payloads. Compiling while the
          // TextureLoader still exposed placeholder images warmed a different
          // program key and merely moved the ANGLE link stall to reveal time.
          const textureImages: Array<EventTarget & {
            complete?: boolean;
            naturalWidth?: number;
          }> = [];
          for (const texture of library.retainedTextures()) {
            const image = texture.image as EventTarget & {
              complete?: boolean;
              naturalWidth?: number;
            };
            if (image) textureImages.push(image);
          }
          const imageReady = textureImages.map((image) => {
            if (image.complete && Number(image.naturalWidth || 0) > 0) return Promise.resolve();
            return new Promise<void>((resolve) => {
              const finish = (): void => resolve();
              image.addEventListener('load', finish, { once: true });
              image.addEventListener('error', finish, { once: true });
            });
          });
          await Promise.race([
            Promise.all(imageReady),
            new Promise((resolve) => setTimeout(resolve, 2_500)),
          ]);
          if (disposed) return;
          const { createOffscreenSceneWarmer } = await import('../engine/offscreenWarm.ts');
          const remaining = new Map(outdoorVariants.map((variant) => [variant.architecture, variant]));
          while (remaining.size && !disposed) {
            // A user selection jumps to the front of the queue; otherwise the
            // deterministic registry order warms one destination at a time.
            const next = selected && remaining.get(selected.architecture)
              ? remaining.get(selected.architecture)!
              : remaining.values().next().value as GarageVariant;
            remaining.delete(next.architecture);
            const build = await ensure(next);
            if (!build || disposed) break;
            const warmRoot = build.root.clone(true);
            build.root.updateWorldMatrix(true, true);
            warmRoot.matrix.copy(build.root.matrixWorld);
            warmRoot.matrixAutoUpdate = false;
            warmRoot.visible = true;
            const warmLayer = 31;
            const renderables: THREE.Object3D[] = [];
            warmRoot.traverse((object) => {
              object.frustumCulled = false;
              if (object instanceof THREE.Mesh) {
                object.layers.disableAll();
                renderables.push(object);
              }
            });
            const warmCamera = camera.clone();
            warmCamera.layers.set(warmLayer);
            const lightLayers: Array<{ light: THREE.Light; mask: number }> = [];
            scene.traverse((object) => {
              if (!(object instanceof THREE.Light)) return;
              lightLayers.push({ light: object, mask: object.layers.mask });
              object.layers.enable(warmLayer);
            });
            scene.add(warmRoot);
            try {
              // Render against the production scene's real CSM + Garage light
              // counts and a linear offscreen target, isolated on a private
              // camera layer so the live canvas can never reveal the clone.
              const warmer = createOffscreenSceneWarmer(renderer, scene, warmCamera, 0.03125);
              for (const object of renderables) object.layers.enable(warmLayer);
              const parallelCompile = warmer.compileAsync(warmRoot, scene).catch(() => undefined);
              // Some ANGLE/WebGL combinations expose KHR_parallel_shader_compile
              // but never settle its readiness promise. Give the driver a
              // bounded head start, then continue with the real offscreen draw;
              // environment readiness must never depend on extension health.
              await Promise.race([
                parallelCompile,
                new Promise<void>((resolve) => setTimeout(resolve, 350)),
              ]);
              for (const object of renderables) object.layers.disable(warmLayer);
              for (let index = 0; index < renderables.length; index += 3) {
                const batch = renderables.slice(index, index + 3);
                for (const object of batch) object.layers.enable(warmLayer);
                warmer();
                for (const object of batch) object.layers.disable(warmLayer);
                await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
                if (disposed) break;
              }
              warmer.dispose();
              // One final private-target render uses the exact live camera,
              // stage hierarchy, and post target color space. It catches the
              // single anonymous CSM receiver program whose key depends on
              // the outdoor owner being visible, while restoring visibility
              // before the browser can present another frame.
              const priorGroupVisible = group.visible;
              const priorBuildVisible = build.root.visible;
              const priorActiveVisible = active?.root.visible;
              group.visible = true;
              build.root.visible = true;
              if (active && active !== build) active.root.visible = false;
              const exactWarmer = createOffscreenSceneWarmer(renderer, scene, camera, 0.03125);
              exactWarmer();
              exactWarmer.dispose();
              group.visible = priorGroupVisible;
              build.root.visible = priorBuildVisible;
              if (active && active !== build && priorActiveVisible !== undefined) {
                active.root.visible = priorActiveVisible;
              }
            } catch { /* the real visible render remains the fallback */ }
            for (const { light, mask } of lightLayers) light.layers.mask = mask;
            scene.remove(warmRoot);
            warmRoot.clear();
            warmedArchitectures.add(next.architecture);
            const waiting = selected?.architecture === next.architecture
              ? cache.get(next.architecture) : null;
            if (selected && waiting) show(selected, waiting);
            publish();
            requestRender();
          }
          outdoorWarmReady = true;
          publish();
          requestRender();
        })();
      });
    };
    if (typeof host.requestIdleCallback === 'function') {
      host.requestIdleCallback(warm, { timeout: 900 });
    } else {
      // Safari has no requestIdleCallback. Leave its first paint and startup
      // input window alone, then warm while the static Garage frame sleeps.
      idleWarmTimer = setTimeout(warm, 1_200);
    }
  };

  const touch = (key: GarageVariant['architecture'], build: GarageEnvironmentBuild): void => {
    cache.delete(key);
    cache.set(key, build);
  };

  const trim = (): void => {
    while (cache.size > CACHE_LIMIT) {
      const oldest = cache.entries().next().value as
        [GarageVariant['architecture'], GarageEnvironmentBuild] | undefined;
      if (!oldest) return;
      const [key, build] = oldest;
      if (build === active) {
        touch(key, build);
        continue;
      }
      cache.delete(key);
      build.dispose();
    }
  };

  const collectStats = (): GarageArchitectureStats => {
    const root = active?.root;
    const textureStats = assets?.diagnostics() || { residentSets: 0, referencedSets: 0 };
    const selectedReady = !!selected && root?.userData.architectureKey === selected.architecture;
    return {
      key: selected?.architecture || 'field_shed',
      mapId: selected?.mapId || 'verdant',
      mode: selectedReady && root?.userData.mode === 'verdant-workshop'
        ? 'verdant-workshop' : 'garage-environment',
      signature: selectedReady ? String(root?.userData.signature || '') : '',
      objects: selectedReady ? Number(root?.userData.objects || 0) : 0,
      drawCalls: selectedReady ? Number(root?.userData.drawCalls || root?.userData.objects || 0) : 0,
      triangles: selectedReady ? Number(root?.userData.triangles || 0) : 0,
      cached: cache.size,
      cacheLimit: CACHE_LIMIT,
      residentTextureSets: textureStats.residentSets,
      referencedTextureSets: textureStats.referencedSets,
      enclosingSurfaces: selectedReady ? Number(root?.userData.enclosingSurfaces || 0) : 0,
      ready: selectedReady && root?.userData.ready === true,
      source: selectedReady && root?.userData.source === 'verdant-workshop'
        ? 'verdant-workshop' : 'authentic-garage-scene-pack',
      sourceBeat: selectedReady ? String(root?.userData.sourceBeat || '') : '',
      sourceStructure: selectedReady ? String(root?.userData.sourceStructure || '') : '',
      sourceLandmarkLocal: selectedReady ? root?.userData.sourceLandmarkLocal || null : null,
      distinctiveElements: selectedReady ? root?.userData.distinctiveElements || [] : [],
      landmarkHeightM: selectedReady ? Number(root?.userData.landmarkHeightM || 0) : 0,
      serviceFrame: selectedReady ? String(root?.userData.serviceFrame || '') : '',
      terrainProfile: selectedReady ? String(root?.userData.terrainProfile || '') : '',
      terrainSourceAnchor: selectedReady ? root?.userData.terrainSourceAnchor || null : null,
      terrainVertices: selectedReady ? Number(root?.userData.terrainVertices || 0) : 0,
      textureSets: selectedReady ? root?.userData.textureSets || [] : [],
      treeSpecies: selectedReady ? root?.userData.treeSpecies || [] : [],
      trees: selectedReady ? Number(root?.userData.trees || 0) : 0,
      backdropLayers: selectedReady ? Number(root?.userData.backdropLayers || 0) : 0,
      groundCover: selectedReady ? Number(root?.userData.groundCover || 0) : 0,
      structures: selectedReady ? Number(root?.userData.structures || 0) : 0,
      wrecks: selectedReady ? Number(root?.userData.wrecks || 0) : 0,
      facilityProps: selectedReady ? Number(root?.userData.facilityProps || 0) : 0,
      facilityStations: selectedReady ? Number(root?.userData.facilityStations || 0) : 0,
      looseParts: selectedReady ? Number(root?.userData.looseParts || 0) : 0,
      railSegments: selectedReady ? Number(root?.userData.railSegments || 0) : 0,
      serviceVehicles: selectedReady ? Number(root?.userData.serviceVehicles || 0) : 0,
      outdoorWarmReady,
      lastBuildMs,
    };
  };

  const publish = (): GarageArchitectureStats => {
    const stats = collectStats();
    Object.assign(group.userData, stats);
    return stats;
  };

  const show = (variant: GarageVariant, build: GarageEnvironmentBuild): void => {
    if (active && active !== build) active.root.visible = false;
    active = build;
    active.root.visible = true;
    active.root.userData.architectureKey = variant.architecture;
    active.root.userData.mapId = variant.mapId;
    touch(variant.architecture, build);
    trim();
    publish();
    requestRender();
    if (variant.architecture === 'field_shed') scheduleOutdoorAssetWarm();
    if (!textureWarmScheduled && assets) {
      textureWarmScheduled = true;
      // The active pack already acquired six of nine tiny surface sets. Start
      // the remaining six image requests in the same bounded construction
      // transaction, before interactive readiness. A later timer can collide
      // with the first selector click and turn otherwise-async image decode
      // into a visible long frame on 4x-throttled CPUs.
      assets.warmAll(requestRender);
    }
  };

  const attach = (
    variant: GarageVariant,
    build: GarageEnvironmentBuild,
  ): GarageEnvironmentBuild | null => {
    if (disposed) {
      build.dispose();
      return null;
    }
    build.root.userData.architectureKey = variant.architecture;
    build.root.userData.mapId = variant.mapId;
    build.root.visible = false;
    group.add(build.root);
    touch(variant.architecture, build);
    trim();
    // A persisted outdoor selection can be the very first Garage owner. In
    // that case there is no Verdant frame to leave visible while shaders warm,
    // so present the already-built pack beneath the boot cover immediately.
    // Interactive switches still wait for their exact offscreen warm and keep
    // the previously active environment visible throughout the handoff.
    if (selected?.architecture === variant.architecture
        && (isVariantWarm(variant) || active === null)) {
      show(variant, build);
    }
    return build;
  };

  const ensure = (variant: GarageVariant): Promise<GarageEnvironmentBuild | null> => {
    const cached = cache.get(variant.architecture);
    if (cached) return Promise.resolve(cached);
    const inFlight = pending.get(variant.architecture);
    if (inFlight) return inFlight;
    const task = (variant.architecture === 'field_shed'
      ? Promise.resolve(buildVerdantWorkshopOwner())
      : getEnvironmentKit().then((kit) => {
      if (disposed) return null;
      const library = ensureAssets(kit);
      const startedAt = performance.now();
      const build = kit.buildGarageEnvironment(engineCtx, library, variant, requestRender);
      lastBuildMs = performance.now() - startedAt;
      return build;
    })).then((build) => build ? attach(variant, build) : null)
      .finally(() => pending.delete(variant.architecture));
    pending.set(variant.architecture, task);
    return task;
  };

  function setVariant(variant: GarageVariant): GarageArchitectureStats {
    selected = variant;
    // This must run for persisted outdoor selections as well as Verdant. The
    // former never call show(field_shed), which previously left their scene
    // pack hidden forever on a white renderer clear color after reload.
    scheduleOutdoorAssetWarm();
    const generation = ++selectionGeneration;
    const cached = cache.get(variant.architecture);
    if (cached && isVariantWarm(variant)) {
      lastBuildMs = 0;
      show(variant, cached);
    } else {
      publish();
      // UI selection can change several times in one task (keyboard repeat,
      // rapid cards, automated convergence). Start only the final requested
      // pack instead of synchronously constructing every stale intermediate.
      queueMicrotask(() => {
        if (!disposed && generation === selectionGeneration
            && selected?.architecture === variant.architecture) void ensure(variant);
      });
    }
    return collectStats();
  }

  return {
    group,
    setVariant,
    stats: collectStats,
    async whenReady(): Promise<GarageArchitectureStats> {
      if (selected) await ensure(selected);
      return collectStats();
    },
    dispose() {
      disposed = true;
      if (idleWarmTimer !== null) clearTimeout(idleWarmTimer);
      idleWarmTimer = null;
      group.removeFromParent();
      for (const build of cache.values()) build.dispose();
      cache.clear();
      pending.clear();
      active = null;
      assets?.dispose();
      assets = null;
      group.clear();
    },
  };
}
