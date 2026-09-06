import { isPinnedSceneReceipt } from './pinned-scene-acquisition.mjs';
import { RESIDENCY_TERRAIN_PROTOCOL } from './world-residency-acquisition.mjs';

export const ACQUISITION_PROTOCOL = 'settled-pinned-map-timing-v5';

/** Browser-side actual owners; phase labels do not prove scene membership. */
export function captureTimingPhaseOwnership() {
  const D = window.__DEBUG;
  const owner = D.phaseSceneResidency;
  if (!D.scene?.isScene || typeof owner?.garageMounted !== 'boolean'
      || typeof owner.worldMounted !== 'boolean') throw new Error('Missing timing phase owner');
  const rootState = root => {
    if (root?.isObject3D !== true || typeof root.visible !== 'boolean') {
      throw new Error('Missing actual timing phase root');
    }
    return { parentIsScene: root.parent === D.scene, parentIsNull: root.parent === null,
      visible: root.visible };
  };
  return {
    protocol: 'exclusive-phase-owners-v1', mapId: D.world?.mapId,
    owner: { garageMounted: owner.garageMounted, worldMounted: owner.worldMounted },
    garageDressing: rootState(D.garageDressing?.group), battlefield: rootState(D.world?.group),
  };
}

export function requireTimingPhaseOwnership(receipt, phase, mapId) {
  if (phase !== 'garage' && phase !== 'battlefield') throw new Error('Unknown timing ownership phase');
  const garage = phase === 'garage';
  if (receipt?.protocol !== 'exclusive-phase-owners-v1' || receipt.mapId !== mapId
      || receipt.owner?.garageMounted !== garage || receipt.owner.worldMounted !== !garage) {
    throw new Error(`Incorrect timing phase owner: ${phase}/${mapId}`);
  }
  for (const [key, active] of [['garageDressing', garage], ['battlefield', !garage]]) {
    const root = receipt[key];
    if (root?.parentIsScene !== active || root.parentIsNull !== !active || root.visible !== active) {
      throw new Error(`Incorrect actual timing phase root: ${phase}/${key}`);
    }
  }
}

/** Match the production archive's recurring pair, not its one-off boot pair. */
export function selectTimingArchiveTarget(featuredShots) {
  const shots = featuredShots.filter(shot => shot.maps?.length).slice(0, 6);
  const target = { primary: shots[1]?.img, secondary: shots[0]?.img };
  if (Object.values(target).some(source => typeof source !== 'string' || !source.startsWith('/media/'))
      || target.primary === target.secondary) throw new Error('Missing canonical Garage archive pair');
  return target;
}

/** Browser predicate: wait for the actual producer, never for stable counts. */
export function captureTimingGarageArchive(target) {
  const root = window.__DEBUG.garageDressing.group;
  const data = root.userData;
  const names = ['garage_battle_archive_screen', 'garage_battle_archive_screen_secondary'];
  const sources = [data.battleScreenCurrentImage, data.battleScreenSecondaryImage];
  const screens = names.map((name, index) => {
    const uniforms = root.getObjectByName(name)?.material?.uniforms;
    if (!uniforms?.uImageA || !uniforms.uImageB || !uniforms.uTransition) {
      throw new Error(`Missing Garage archive producer: ${name}`);
    }
    const texture = uniforms.uImageA.value;
    const image = texture?.image;
    if (!texture?.isTexture || texture.isDataTexture || texture !== uniforms.uImageB.value
        || uniforms.uTransition.value !== 0 || image?.complete !== true
        || !(image.naturalWidth > 1 && image.naturalHeight > 1)) return null;
    const source = new URL(image.currentSrc || image.src, window.location.href).pathname;
    if (source !== sources[index]) return null;
    return { name, source, width: image.naturalWidth, height: image.naturalHeight,
      format: texture.format, type: texture.type, minFilter: texture.minFilter,
      magFilter: texture.magFilter, generateMipmaps: texture.generateMipmaps,
      colorSpace: texture.colorSpace, anisotropy: texture.anisotropy,
      transition: 0, pairedUniforms: true };
  });
  if (data.battleScreenDisplayCount !== 2 || data.battleScreenResidentImageCount !== 2
      || screens.some(screen => !screen) || sources[0] !== target.primary
      || sources[1] !== target.secondary) return null;
  return { protocol: 'decoded-canonical-archive-v1', displayCount: 2, residentImageCount: 2, screens };
}

/** Browser-side: let the production scheduler finish; never race its pump. */
export async function waitForTimingGarage({ timeoutMs = 180000, pollMs = 100 } = {}) {
  const workshop = window.__GARAGE_WORKSHOP;
  const dressing = window.__DEBUG?.garageDressing;
  if (!workshop?.ensureBuilt || !dressing?.isBuilt || !window.__GARAGE_IDLE_WORK) {
    throw new Error('Missing natural Garage build diagnostics');
  }
  const started = performance.now();
  for (;;) {
    if (window.__DEBUG.game.phase !== 'garage') throw new Error('Natural Garage build left Garage');
    const idle = window.__GARAGE_IDLE_WORK;
    if (dressing.isBuilt() === true && idle.current === null && idle.queued === 0) break;
    if (performance.now() - started >= timeoutMs) throw new Error('Natural Garage build timeout');
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
  // This is now an idempotent assertion, not a competing chunk drain. The
  // subsequent canonical Garage recipe also finds an already-built owner.
  await workshop.ensureBuilt();
  if (!dressing.isBuilt()) throw new Error('Garage build regressed after completion');
}

/** Browser-side: fixed eight submitted frames, not rAFs or warm-until-pass. */
export function warmTimingGarage({ archive, timeoutMs = 30000 } = {}) {
  const { post, renderer } = window.__DEBUG;
  const root = window.__DEBUG.garageDressing.group;
  const monitors = archive.screens.map(screen => {
    const uniforms = root.getObjectByName(screen.name).material.uniforms;
    return { uniforms, texture: uniforms.uImageA.value };
  });
  const archiveUnchanged = () => root.userData.battleScreenResidentImageCount === 2
    && monitors.every(({ uniforms, texture }) => uniforms.uImageA.value === texture
      && uniforms.uImageB.value === texture && uniforms.uTransition.value === 0);
  const original = post.render;
  return new Promise((resolve, reject) => {
    let frames = 0, previous = null;
    const restore = () => { post.render = original; clearTimeout(timer); };
    const timer = setTimeout(() => {
      restore();
      reject(new Error(`Garage rendered only ${frames}/8 frames before timeout`));
    }, timeoutMs);
    post.render = function (...args) {
      try {
        original.apply(this, args);
        if (!archiveUnchanged()) throw new Error('Garage archive changed during fixed warmup');
        const counts = { geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures, programs: renderer.info.programs.length };
        if (++frames === 8) {
          restore();
          resolve({ frames, archiveUnchanged: true,
            stable: JSON.stringify(previous) === JSON.stringify(counts), renderer: counts });
        }
        previous = counts;
      } catch (error) {
        restore();
        reject(error);
        throw error;
      }
    };
  });
}

/** Browser-side: finite scalar ownership, independent of scene mount/UUID. */
export function captureTimingGarageOwner() {
  const stats = window.__GARAGE_WORKSHOP.stats();
  const root = window.__DEBUG.garageDressing.group;
  const geometries = new Set(), materials = new Set(), textures = new Set();
  let nodes = 0, meshes = 0;
  root.traverse(object => {
    nodes++;
    if (!object.isMesh) return;
    meshes++;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      for (const uniform of Object.values(material.uniforms || {})) {
        if (uniform.value?.isTexture) textures.add(uniform.value);
      }
    }
  });
  return {
    built: stats.built, variant: stats.selected, mapId: stats.mapId,
    exhibitCount: stats.exhibitCount, sourceVehicleIds: stats.sourceVehicleIds,
    optimizedTriangleParity: stats.optimizedTriangleParity,
    triangles: stats.triangles, optimizedTriangles: stats.optimizedTriangles,
    nodes, meshes, geometries: geometries.size, materials: materials.size, textures: textures.size,
  };
}

/** Browser-side: actual GL backend, not the generic headless user-agent. */
export function captureTimingBackend() {
  const gl = window.__DEBUG.renderer.getContext();
  const extension = gl.getExtension('WEBGL_debug_renderer_info');
  if (!extension) throw new Error('Actual timing GPU backend is unavailable');
  return {
    vendor: gl.getParameter(extension.UNMASKED_VENDOR_WEBGL),
    renderer: gl.getParameter(extension.UNMASKED_RENDERER_WEBGL),
    version: gl.getParameter(gl.VERSION), contextLost: gl.isContextLost(),
  };
}

/** Browser-side, bounded on both legacy promise-only and receipt-aware worlds. */
export async function settleMapTextures({ mapId, timeoutMs = 120000 }) {
  const world = window.__DEBUG.world;
  const state = world?.minimapTextureState;
  if (world?.mapId !== mapId || !state?.promise) {
    throw new Error(`Missing active map texture readiness: ${mapId}`);
  }
  let timer;
  try {
    await Promise.race([
      state.promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Map texture timeout: ${mapId}`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  if (window.__DEBUG.world !== world || !state.settled) {
    throw new Error(`Map changed or textures remain unsettled: ${mapId}`);
  }
  // The clean upstream parent has a settled promise but no per-target results.
  // Preserve that honest distinction; never treat a present failed receipt as
  // legacy success, and never race either implementation's asynchronous loads.
  if (state.results !== undefined && (!Array.isArray(state.results) || !state.results.length
      || state.results.some(result => !result.applied || result.failures?.length))) {
    throw new Error(`Map texture application failed: ${mapId}`);
  }
  return {
    mapId, settled: true,
    evidence: state.results === undefined ? 'legacy-settled-promise' : 'verified-target-results',
    results: state.results ?? null,
  };
}

/** Browser-side: timed views use the baseline camera, not a later image pose. */
export function applyTimingCamera(saved) {
  const D = window.__DEBUG;
  D.camera.position.fromArray(saved.position);
  D.camera.quaternion.fromArray(saved.quaternion);
  D.camera.fov = saved.fov;
  D.camera.near = saved.near;
  D.camera.far = saved.far;
  D.camera.updateProjectionMatrix();
  D.camera.updateMatrixWorld(true);
  D.world.update(0, D.camera.position);
  D.lighting.updateFrustums();
  D.lighting.update(true);
}

/** Browser-side plain scalars only; call outside the measured render interval. */
export function captureTimingState() {
  const D = window.__DEBUG;
  const canvas = D.renderer.domElement;
  const number = value => Number(Number(value).toFixed(7));
  return {
    mapId: D.world.mapId,
    camera: {
      position: D.camera.position.toArray().map(number),
      quaternion: D.camera.quaternion.toArray().map(number),
      fov: number(D.camera.fov), near: number(D.camera.near), far: number(D.camera.far),
    },
    render: {
      canvas: [canvas.width, canvas.height],
      pixelRatio: D.renderer.getPixelRatio(),
      renderScale: Number(canvas.dataset.renderScale), dynScale: D.post.dynScale,
      postAA: canvas.dataset.postAa, msaaSamples: D.post.msaaSamples,
      preset: D.quality.resolvePresetName(), perfTrim: D.post.perfTrim,
      gtao: D.post.gtao.enabled, bloom: D.post.bloom.enabled,
      contextLost: D.renderer.getContext().isContextLost(),
    },
  };
}

const identical = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Fail before launching a browser: legacy/mixed-history reports are not paired. */
export function requireComparableRun(baseline, acquisition) {
  if (baseline?.schemaVersion !== 6 || !baseline.acquisition
      || baseline.acquisition.protocol !== ACQUISITION_PROTOCOL) {
    throw new Error('Baseline needs schema 6 exclusive-phase/decoded-archive/build-mode timing acquisition; recapture it');
  }
  requireTimingBuildProvenance(baseline);
  if (baseline.acquisition.captureShots || acquisition.captureShots) {
    throw new Error('Paired performance runs must be timing-only; capture images separately');
  }
  for (const key of ['protocol', 'harnessHash', 'production', 'garageArchiveTarget', 'viewport', 'sampleCount', 'repeats', 'settleMs', 'syncGpu', 'tier']) {
    if (!identical(baseline.acquisition[key], acquisition[key])) {
      throw new Error(`Mismatched timing acquisition: ${key}`);
    }
  }
  const prior = baseline.maps?.map(row => row.id);
  if (!prior?.length || !identical(prior, baseline.acquisition.maps)
      || !identical(prior, acquisition.maps.slice(0, prior.length))) {
    throw new Error('Baseline maps must match the exact candidate prefix/order; no missing comparison rows');
  }
  if (baseline.pageErrors?.length || baseline.acquisitionError) throw new Error('Baseline contains browser/acquisition errors');
  requireTimingGarageSetup(baseline.garageSetup);
  if (!identical(baseline.acquisition.garageArchiveTarget, baseline.garageSetup.archiveWait.target)) {
    throw new Error('Baseline Garage archive target differs from acquisition');
  }
  for (const row of baseline.maps) {
    requireTimingReceipt(row.acquisition, row.id, acquisition.viewport);
    requireSameTimingGarageOwner(baseline.garageSetup.owner, row.acquisition.garage);
    requireSameTimingGarageArchive(baseline.garageSetup.archive, row.acquisition.garageArchive);
    requireFrameRunReceipts(row, acquisition);
  }
}

/** Build hashes identify each artifact; baseline and candidate may differ. */
export function requireTimingBuildProvenance(report) {
  const production = report?.acquisition?.production;
  if (typeof production !== 'boolean') throw new Error('Timing build mode is missing');
  const validHash = typeof report.buildIndexHash === 'string' && /^[a-f0-9]{64}$/.test(report.buildIndexHash);
  if (production ? !validHash : report.buildIndexHash !== null) {
    throw new Error('Invalid timing production build provenance');
  }
}

function requireFrameRunReceipts(row, acquisition) {
  if (row.frames?.runs?.length !== acquisition.repeats) {
    throw new Error(`Missing independent frame repeats: ${row.id}`);
  }
  for (const run of row.frames.runs) {
    if (run.sampleCount !== acquisition.sampleCount) throw new Error(`Incomplete frame run: ${row.id}`);
    for (const key of ['medianMs', 'p95Ms', 'renderMedianMs', 'renderP95Ms', 'callsMax', 'trianglesMax']) {
      if (!Number.isFinite(run[key]) || run[key] < 0) throw new Error(`Invalid frame metric: ${row.id}/${key}`);
    }
    for (const receipt of [run.acquisitionBefore, run.acquisitionAfter]) {
      requireTimingReceipt(receipt, row.id, acquisition.viewport);
      requireSameTimingState(row.acquisition, receipt);
    }
  }
}

export function requireTimingReceipt(receipt, mapId, viewport) {
  requireTimingPhaseOwnership(receipt?.phaseOwnership, 'battlefield', mapId);
  requireTimingGarageOwner(receipt?.garage);
  requireSameTimingGarageArchive(receipt?.garageArchive, receipt?.garageArchive);
  if (!isPinnedSceneReceipt(receipt?.scene) || receipt?.state?.mapId !== mapId
      || receipt?.readiness?.mapId !== mapId || receipt?.readiness?.settled !== true) {
    throw new Error(`Invalid pinned/settled timing receipt: ${mapId}`);
  }
  requireTextureReceipt(receipt.readiness);
  const { camera, render } = receipt.state;
  const values = [...(camera?.position ?? []), ...(camera?.quaternion ?? []), camera?.fov, camera?.near, camera?.far];
  if (camera?.position?.length !== 3 || camera?.quaternion?.length !== 4
      || values.some(value => !Number.isFinite(value))) throw new Error(`Invalid timing camera: ${mapId}`);
  if (!identical(render?.canvas, [viewport.width, viewport.height]) || render.pixelRatio !== viewport.dpr
      || render.dynScale !== 1 || render.renderScale !== 1 || render.perfTrim !== 0
      || !render.postAA || !render.preset || !Number.isFinite(render.msaaSamples)
      || render.contextLost !== false) {
    throw new Error(`Timing render is not native/untrimmed: ${mapId}`);
  }
  requireTerrainReceipt(receipt.terrain, camera);
}

function requireTextureReceipt(readiness) {
  if (readiness.evidence === 'legacy-settled-promise' && readiness.results === null) return;
  if (readiness.evidence !== 'verified-target-results' || !Array.isArray(readiness.results)
      || !readiness.results.length || readiness.results.some(result => result.applied !== true
        || !Array.isArray(result.failures) || result.failures.length)) {
    throw new Error(`Invalid/failed texture application receipt: ${readiness.mapId}`);
  }
}

function requireTerrainReceipt(terrain, camera) {
  if (terrain?.protocol !== RESIDENCY_TERRAIN_PROTOCOL || terrain.exhausted !== true
      || terrain.verified !== true || terrain.pendingAfterRender !== 0
      || !Number.isInteger(terrain.jobs) || terrain.jobs < 0 || terrain.jobs >= 256
      || typeof terrain.topology?.worldUuid !== 'string') {
    throw new Error('Missing verified finite terrain topology');
  }
  for (const key of ['initialGeometryCount', 'streamedGeometryCount', 'indexReferences']) {
    if (!Number.isInteger(terrain.topology[key]) || terrain.topology[key] < 0) {
      throw new Error(`Invalid terrain topology: ${key}`);
    }
  }
  const rounded = terrain.topology.camera?.map(value => Number(Number(value).toFixed(7)));
  if (!identical(rounded, [...camera.position, ...camera.quaternion])) {
    throw new Error('Terrain was warmed for a different timing camera');
  }
}

export function requireSameTimingState(reference, current) {
  requireTimingPhaseOwnership(reference.phaseOwnership, 'battlefield', reference.state?.mapId);
  requireTimingPhaseOwnership(current.phaseOwnership, 'battlefield', current.state?.mapId);
  requireSameTimingGarageOwner(reference.garage, current.garage);
  requireSameTimingGarageArchive(reference.garageArchive, current.garageArchive);
  if (!identical(reference.scene, current.scene) || !identical(reference.state, current.state)
      || !identical(reference.phaseOwnership, current.phaseOwnership)) {
    throw new Error(`Timed roster/camera/quality changed: ${current.state?.mapId}`);
  }
  // UUIDs differ between independent browser processes; the same camera must
  // nevertheless acquire the same production LOD allocation counts. The
  // browser-side verifier separately guards the actual world's UUID on each
  // repeated sample, so an eviction cannot masquerade as stable topology.
  for (const key of ['initialGeometryCount', 'streamedGeometryCount', 'indexReferences']) {
    if (reference.terrain?.topology?.[key] !== current.terrain?.topology?.[key]) {
      throw new Error(`Timed terrain topology changed: ${key}`);
    }
  }
}

function requireTimingGarageOwner(owner) {
  const sourceIds = ['t90a_burlak', 'm1a2', 'leo2a5_a5nl', 't90m', 'k2'];
  if (owner?.built !== true || owner.variant !== 'verdant_motor_pool' || owner.mapId !== 'verdant'
      || owner.exhibitCount !== 5 || owner.optimizedTriangleParity !== true
      || !identical(owner.sourceVehicleIds, sourceIds)) {
    throw new Error('Incomplete or different canonical Garage workshop');
  }
  for (const key of ['triangles', 'optimizedTriangles', 'nodes', 'meshes', 'geometries', 'materials', 'textures']) {
    if (!Number.isInteger(owner[key]) || owner[key] <= 0) throw new Error(`Invalid Garage owner count: ${key}`);
  }
}

export function requireSameTimingGarageOwner(reference, current) {
  requireTimingGarageOwner(reference);
  requireTimingGarageOwner(current);
  if (!identical(reference, current)) throw new Error('Timing Garage owner changed');
}

export function requireTimingGarageSetup(setup) {
  requireTimingPhaseOwnership(setup?.phaseBefore, 'garage', 'verdant');
  requireTimingPhaseOwnership(setup?.phaseOwnership, 'garage', 'verdant');
  requireTimingGarageOwner(setup?.owner);
  requireSameTimingGarageOwner(setup.ownerBefore, setup.owner);
  requireTimingGarageArchive(setup.archiveBefore, setup.archiveWait?.target);
  requireTimingGarageArchive(setup.archive, setup.archiveWait?.target);
  if (!identical(setup.archiveBefore, setup.archive)) throw new Error('Garage archive changed during warmup');
  if (setup.archiveWait.timeoutMs !== 120000 || !Number.isFinite(setup.archiveWait.elapsedMs)
      || setup.archiveWait.elapsedMs < 0 || setup.archiveWait.elapsedMs > 120000) {
    throw new Error('Invalid bounded Garage archive wait');
  }
  if (setup.warm?.frames !== 8 || setup.warm.stable !== true || setup.warm.archiveUnchanged !== true) {
    throw new Error('Garage must stabilize within the fixed eight rendered frames');
  }
  for (const key of ['geometries', 'textures', 'programs']) {
    if (!Number.isInteger(setup.warm.renderer?.[key]) || setup.warm.renderer[key] <= 0) {
      throw new Error(`Invalid Garage GPU count: ${key}`);
    }
  }
  if (setup.backend?.contextLost !== false || typeof setup.browserVersion !== 'string' || !setup.browserVersion) {
    throw new Error('Missing live timing GPU/browser receipt');
  }
  for (const key of ['vendor', 'renderer', 'version']) {
    if (typeof setup.backend[key] !== 'string' || !setup.backend[key]) throw new Error(`Missing GPU ${key}`);
  }
}

function requireTimingGarageArchive(archive, target) {
  const names = ['garage_battle_archive_screen', 'garage_battle_archive_screen_secondary'];
  const sources = [target?.primary, target?.secondary];
  if (archive?.protocol !== 'decoded-canonical-archive-v1' || archive.displayCount !== 2
      || archive.residentImageCount !== 2 || archive.screens?.length !== 2
      || sources.some(source => typeof source !== 'string' || !source.startsWith('/media/'))
      || sources[0] === sources[1]) throw new Error('Invalid canonical Garage archive receipt');
  for (let index = 0; index < 2; index++) {
    const screen = archive.screens[index];
    if (screen.name !== names[index] || screen.source !== sources[index]
        || screen.transition !== 0 || screen.pairedUniforms !== true
        || typeof screen.generateMipmaps !== 'boolean' || typeof screen.colorSpace !== 'string') {
      throw new Error('Invalid decoded Garage archive screen');
    }
    for (const key of ['width', 'height', 'format', 'type', 'minFilter', 'magFilter', 'anisotropy']) {
      if (!Number.isInteger(screen[key]) || screen[key] < (key === 'width' || key === 'height' ? 2 : 1)) {
        throw new Error(`Invalid Garage archive capacity: ${key}`);
      }
    }
  }
}

export function requireSameTimingGarageArchive(reference, current) {
  const target = { primary: reference?.screens?.[0]?.source, secondary: reference?.screens?.[1]?.source };
  requireTimingGarageArchive(reference, target);
  requireTimingGarageArchive(current, target);
  if (!identical(reference, current)) throw new Error('Timing Garage archive capacity changed');
}

export function requireSameTimingGarageSetup(reference, current) {
  requireTimingGarageSetup(reference);
  requireTimingGarageSetup(current);
  requireSameTimingGarageOwner(reference.owner, current.owner);
  if (!identical(reference.phaseOwnership, current.phaseOwnership)) throw new Error('Timing phase owners changed');
  requireSameTimingGarageArchive(reference.archive, current.archive);
  if (!identical(reference.backend, current.backend) || reference.browserVersion !== current.browserVersion) {
    throw new Error('Timing GPU backend/browser changed');
  }
  // Global GPU totals include the first world's minimap preparation. Record
  // them, but compare the exact Garage owner rather than forbid legitimate
  // battlefield resource reductions in this pre-map receipt.
}
