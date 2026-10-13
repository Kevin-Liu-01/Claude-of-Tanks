// src/engine/battleWorldProgramWarm.ts — the battle world's terrain programs link, and their GPU pipelines compile, while
// the world builds under the loading cover (2026-10-13, the perf stream: option E).
//
// A three.js program is keyed by the scene's light signature (how many directional, spot, point and hemisphere lights,
// and how many cast shadows). Until now the Garage's spots stood in the scene through the whole world build and the
// battle's own lights (the night pool, the FX and kill-cam pools) arrived around it, so the build could not link a
// single program the battle would draw with: the deployment warm linked them, and the first covered draw compiled the
// GPU pipeline behind the scene watchdog's readback. A map whose terrain program is its own pays for both on the first
// entry of a session (1.5–2.7 s in the perf stream's block 16).
//
// Now the solo entry makes the battle's light signature final as soon as its cover is up (main.ts
// prepareBattleLightSignature: the Garage presentation out, the night pool in, dark and empty) and arms this warm for
// the map it enters. The world build offers its terrain the moment it stands (world/map.ts prepareTerrainPrograms); once
// the FX and kill-cam pools are in the scene too, the terrain's programs are submitted to the parallel compiler against
// the scene pass's target, and once they have linked one covered draw per distinct terrain material compiles their GPU
// pipelines, while the vegetation and the props still build. The deployment warm (soloBattleDeploymentRuntime.ts
// prepareWorldPrograms) stays as it is and finds them linked.
//
// Every step re-checks what the step before assumed. An offer while disarmed (the Garage, the Studio, a background
// build, another map) is ignored. A light signature that moved between the submission and the draw skips the draw (the
// deployment warm links the variant the battle draws with, as before). A lost or replaced context, a disarm (a failed
// entry back to the Garage), or a link that outlives its deadline abandons the warm without touching the renderer again.
import * as THREE from 'three';
import type { Camera, Material, Object3D } from 'three';

type WorldProgramWarmStatus =
  | 'waiting-for-lights' | 'linking' | 'drawn' | 'abandoned' | 'link-timeout' | 'compile-error' | 'signature-moved';

interface WorldProgramWarmReceipt {
  mapId: string;
  status: WorldProgramWarmStatus;
  /** ms from the offer: the lights final and the programs submitted, linked, the pipelines drawn */
  startedMs: number | null;
  linkedMs: number | null;
  drawnMs: number | null;
  /** distinct materials submitted, and how many had not linked when the warm stopped */
  materials: number;
  pending: number;
  /** pipelines drawn (one per distinct terrain material) */
  drawn: number;
  /** the scene's light signature at the submission and at the draw */
  signature: string | null;
  drawSignature: string | null;
  /** the linked programs' ids (a probe checks the battle's first frames draw the terrain with these) */
  programIds: number[];
  error?: string;
}

interface BattleWorldProgramWarmPorts {
  /** The battle's light signature is final: the Garage presentation out; the night, FX and kill-cam pools in. */
  isSignatureFinal(): boolean;
  /** The scene's light signature as three's programs see it (lightSignature below). */
  signature(): string;
  /** Submits the root's programs against the scene pass's target and the scene; returns the materials submitted. */
  compile(root: Object3D): Iterable<Material>;
  /** The material's program has linked (KHR_parallel_shader_compile; a renderer without it reports true). */
  isLinked(material: Material): boolean;
  /** The id of the program the material was given (receipts only). */
  programOf?(material: Material): number | null;
  /** Captures the renderer context current now; the check is false once that context is lost or replaced. */
  lifetime(): () => boolean;
  /** One covered draw of each distinct material under the root; returns how many were drawn. */
  drawPipelines(root: Object3D): number;
  wait(ms: number): Promise<void>;
  now(): number;
  publish?(receipt: WorldProgramWarmReceipt): void;
}

export interface BattleWorldProgramWarm {
  /** A battle entry's cover is up and its light signature final: offers for `mapId` start the warm. */
  arm(mapId: string): void;
  /** The Garage is back (or the entry failed): every pending or running warm stops. */
  disarm(): void;
  /** A built (or cached) world's terrain for `mapId`. */
  offer(root: Object3D, mapId: string): void;
  readonly armedMapId: string | null;
  readonly receipt: WorldProgramWarmReceipt | null;
  /** Settles when the current warm stops (drawn, skipped or abandoned); for receipts and probes. */
  settled(): Promise<WorldProgramWarmReceipt | null>;
}

const LIGHTS_POLL_MS = 50;
const LINK_POLL_MS = 16;
/** A link this long is a driver in trouble: the deployment warm's own strict preparation takes over. */
const LINK_DEADLINE_MS = 20000;
/** The FX and kill-cam pools load beside the world; a battle whose lights never settle leaves it to the warm. */
const LIGHTS_DEADLINE_MS = 60000;

interface LightLike {
  isLight?: boolean; isDirectionalLight?: boolean; isSpotLight?: boolean; isPointLight?: boolean;
  isHemisphereLight?: boolean; isRectAreaLight?: boolean; isLightProbe?: boolean; isAmbientLight?: boolean;
  castShadow?: boolean; map?: unknown; layers: { test(layers: unknown): boolean };
}

/** The light counts three.js keys a lit program by (WebGLLights setup), for the lights the camera sees. */
export function lightSignature(scene: Pick<Object3D, 'traverseVisible'>, camera: Pick<Camera, 'layers'>): string {
  const n = { dir: 0, dirShadow: 0, spot: 0, spotShadow: 0, spotMap: 0, point: 0, pointShadow: 0, hemi: 0, rect: 0, probe: 0 };
  scene.traverseVisible((object) => {
    const light = object as unknown as LightLike;
    if (!light.isLight || !light.layers.test(camera.layers)) return;
    if (light.isDirectionalLight) { n.dir++; if (light.castShadow) n.dirShadow++; }
    else if (light.isSpotLight) { n.spot++; if (light.castShadow) n.spotShadow++; if (light.map) n.spotMap++; }
    else if (light.isPointLight) { n.point++; if (light.castShadow) n.pointShadow++; }
    else if (light.isHemisphereLight) n.hemi++;
    else if (light.isRectAreaLight) n.rect++;
    else if (light.isLightProbe) n.probe++;
  });
  return `dir ${n.dir}/${n.dirShadow} spot ${n.spot}/${n.spotShadow}/${n.spotMap} point ${n.point}/${n.pointShadow}`
    + ` hemi ${n.hemi} rect ${n.rect} probe ${n.probe}`;
}

export function createBattleWorldProgramWarm(ports: BattleWorldProgramWarmPorts): BattleWorldProgramWarm {
  let armedMapId: string | null = null;
  let generation = 0;
  let receipt: WorldProgramWarmReceipt | null = null;
  let running: Promise<WorldProgramWarmReceipt | null> = Promise.resolve(null);
  // one warm per world root per armed entry (a retried entry on a cached world warms it again)
  let offered = new WeakSet<Object3D>();

  const publish = (): void => { if (receipt) ports.publish?.({ ...receipt }); };

  async function warm(root: Object3D, mapId: string, stamp: number): Promise<WorldProgramWarmReceipt | null> {
    const offeredAt = ports.now();
    const since = (): number => Math.round(ports.now() - offeredAt);
    const own: WorldProgramWarmReceipt = receipt = {
      mapId, status: 'waiting-for-lights', startedMs: null, linkedMs: null, drawnMs: null,
      materials: 0, pending: 0, drawn: 0, signature: null, drawSignature: null, programIds: [],
    };
    const current = (): boolean => stamp === generation;
    const stop = (status: WorldProgramWarmStatus, error?: unknown): WorldProgramWarmReceipt => {
      own.status = status;
      if (error !== undefined) own.error = String(error);
      publish();
      return own;
    };
    publish();
    // the FX and kill-cam pools arrive beside the world build (their chunks load in the entry's acquisition)
    while (!ports.isSignatureFinal()) {
      if (!current()) return stop('abandoned');
      if (ports.now() - offeredAt > LIGHTS_DEADLINE_MS) return stop('abandoned', 'the battle lights never settled');
      await ports.wait(LIGHTS_POLL_MS);
    }
    if (!current()) return stop('abandoned');
    const alive = ports.lifetime();
    if (!alive()) return stop('abandoned', 'context lost');
    own.signature = ports.signature();
    let materials: Material[];
    try {
      materials = [...new Set(ports.compile(root))];
      if (ports.programOf) {
        own.programIds = [...new Set(materials.map((material) => ports.programOf!(material)).filter((id): id is number => id !== null))]
          .sort((a, b) => a - b);
      }
    } catch (error) {
      return stop('compile-error', error);
    }
    own.materials = materials.length;
    own.startedMs = since();
    own.status = 'linking';
    publish();
    const linkStartedAt = ports.now();
    for (;;) {
      if (!current() || !alive()) { own.pending = materials.length; return stop('abandoned', alive() ? undefined : 'context lost'); }
      try {
        materials = materials.filter((material) => !ports.isLinked(material));
      } catch (error) {
        own.pending = materials.length;
        return stop('abandoned', error);
      }
      own.pending = materials.length;
      if (!materials.length) break;
      if (ports.now() - linkStartedAt > LINK_DEADLINE_MS) return stop('link-timeout');
      await ports.wait(LINK_POLL_MS);
    }
    own.linkedMs = since();
    if (!current() || !alive()) return stop('abandoned', alive() ? undefined : 'context lost');
    own.drawSignature = ports.signature();
    // a draw under another signature would link a program synchronously on the main thread; leave it to the warm
    if (own.drawSignature !== own.signature || !ports.isSignatureFinal()) return stop('signature-moved');
    try {
      own.drawn = ports.drawPipelines(root);
    } catch (error) {
      return stop('abandoned', error);
    }
    own.drawnMs = since();
    return stop('drawn');
  }

  return {
    arm(mapId) {
      generation++;
      armedMapId = mapId;
      offered = new WeakSet();
    },
    disarm() {
      generation++;
      armedMapId = null;
      offered = new WeakSet();
    },
    offer(root, mapId) {
      if (armedMapId === null || mapId !== armedMapId || offered.has(root)) return;
      offered.add(root);
      running = warm(root, mapId, generation).catch((error) => {
        if (receipt) { receipt.status = 'abandoned'; receipt.error = String(error); publish(); }
        return receipt;
      });
    },
    get armedMapId() { return armedMapId; },
    get receipt() { return receipt ? { ...receipt } : null; },
    settled: () => running,
  };
}

interface RendererWorldProgramWarmOptions {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  /** The scene pass's target (post.sceneAA.sceneTarget): the programs are keyed by its formats. */
  getSceneTarget(): THREE.WebGLRenderTarget;
  isSignatureFinal(): boolean;
  /** Where each receipt goes (default: window.__WORLD_PROGRAM_WARM, for the entry probes). */
  publish?(receipt: WorldProgramWarmReceipt): void;
}

const publishOnWindow = (receipt: WorldProgramWarmReceipt): void => {
  (globalThis as { __WORLD_PROGRAM_WARM?: WorldProgramWarmReceipt }).__WORLD_PROGRAM_WARM = receipt;
};

/** The warm on the game's renderer: compile against the scene pass's target, one covered pipeline draw per material. */
export function createRendererWorldProgramWarm(
  { renderer, scene, camera, getSceneTarget, isSignatureFinal, publish = publishOnWindow }: RendererWorldProgramWarmOptions,
): BattleWorldProgramWarm {
  let pipelineTarget: THREE.WebGLRenderTarget | null = null;
  const withTarget = <T>(target: THREE.WebGLRenderTarget, work: () => T): T => {
    const priorTarget = renderer.getRenderTarget();
    const priorFace = renderer.getActiveCubeFace(), priorMip = renderer.getActiveMipmapLevel();
    try {
      renderer.setRenderTarget(target);
      return work();
    } finally {
      renderer.setRenderTarget(priorTarget, priorFace, priorMip);
    }
  };
  // One proxy per distinct material: the chunk's own geometry and material (the same program and vertex layout), never
  // the chunk itself, which may not stand in the scene yet. A material's per-draw hook (the terrain's receiver-only shadow
  // guard, lighting.ts) sees the proxy, which shares the chunk's userData and casts no shadow.
  const proxiesFor = (root: Object3D): THREE.Mesh[] => {
    const proxies: THREE.Mesh[] = [];
    const seen = new Set<Material>();
    root.traverse((object) => {
      const mesh = object as THREE.Mesh & { isInstancedMesh?: boolean; isBatchedMesh?: boolean; isSkinnedMesh?: boolean };
      const material = mesh.material;
      if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isBatchedMesh || mesh.isSkinnedMesh || !mesh.geometry
        || !material || Array.isArray(material) || seen.has(material)) return;
      seen.add(material);
      const proxy = new THREE.Mesh(mesh.geometry, material);
      proxy.name = 'world-program-warm-proxy';
      proxy.userData = mesh.userData;
      proxy.frustumCulled = false;
      proxy.matrixAutoUpdate = false;
      proxy.receiveShadow = mesh.receiveShadow;
      proxy.castShadow = false;
      proxy.layers.enableAll();
      proxies.push(proxy);
    });
    return proxies;
  };
  const drawPipelines = (root: Object3D): number => {
    const proxies = proxiesFor(root);
    if (!proxies.length) return 0;
    const sceneTarget = getSceneTarget();
    if (!pipelineTarget || pipelineTarget.samples !== sceneTarget.samples
      || pipelineTarget.texture.type !== sceneTarget.texture.type
      || pipelineTarget.depthTexture?.type !== sceneTarget.depthTexture?.type) {
      pipelineTarget?.dispose();
      pipelineTarget = new THREE.WebGLRenderTarget(8, 8, {
        type: sceneTarget.texture.type,
        depthTexture: new THREE.DepthTexture(8, 8, sceneTarget.depthTexture?.type),
        stencilBuffer: false,
        samples: sceneTarget.samples,
      });
      pipelineTarget.texture.name = 'WorldProgramWarm.color';
    }
    // only the proxies draw: every other renderable is hidden for this one render, the shadow pass does not run (its
    // router, caches and maps untouched), nothing is presented, and every flag is restored in this task
    const hidden: Object3D[] = [];
    scene.traverseVisible((object) => {
      const r = object as THREE.Mesh & { isLine?: boolean; isPoints?: boolean; isSprite?: boolean };
      if (r.isMesh || r.isLine || r.isPoints || r.isSprite) hidden.push(object);
    });
    const holder = new THREE.Group();
    holder.name = 'world-program-warm';
    holder.matrixAutoUpdate = false;
    holder.add(...proxies);
    const shadowMap = renderer.shadowMap;
    const shadowRender = shadowMap.render;
    const background = scene.background;
    try {
      for (const object of hidden) object.visible = false;
      shadowMap.render = () => {};
      scene.background = null;
      scene.add(holder);
      withTarget(pipelineTarget, () => renderer.render(scene, camera));
    } finally {
      scene.remove(holder);
      scene.background = background;
      shadowMap.render = shadowRender;
      for (const object of hidden) object.visible = true;
      holder.clear();
    }
    return proxies.length;
  };
  return createBattleWorldProgramWarm({
    isSignatureFinal,
    signature: () => lightSignature(scene, camera),
    compile: (root) => withTarget(getSceneTarget(), () => renderer.compile(root, camera, scene)),
    isLinked: (material) => {
      const program = (renderer.properties.get(material) as { currentProgram?: { isReady?(): boolean } }).currentProgram;
      return !program?.isReady || program.isReady() === true;
    },
    programOf: (material) => (renderer.properties.get(material) as { currentProgram?: { id?: number } }).currentProgram?.id ?? null,
    lifetime: () => {
      const gl = renderer.getContext(), info = renderer.info;
      return () => renderer.getContext() === gl && renderer.info === info && !gl.isContextLost();
    },
    drawPipelines,
    wait: (ms) => new Promise((resolve) => { setTimeout(resolve, ms); }),
    now: () => performance.now(),
    publish,
  });
}
