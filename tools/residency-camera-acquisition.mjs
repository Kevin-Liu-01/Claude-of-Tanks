import { createHash } from 'node:crypto';

export const RESIDENCY_CAMERA_PROTOCOL = 'absolute-map-camera-v1';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const vector = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);

function validCamera(camera) {
  return typeof camera?.mapId === 'string' && vector(camera.position, 3) && vector(camera.quaternion, 4)
    && Math.abs(Math.hypot(...camera.quaternion) - 1) < 1e-6
    && Number.isFinite(camera.fov) && camera.fov > 0 && camera.fov < 180
    && Number.isFinite(camera.near) && camera.near > 0
    && Number.isFinite(camera.far) && camera.far > camera.near;
}

export function cameraManifestRecord(content) {
  return { sha256: createHash('sha256').update(JSON.stringify(content)).digest('hex'), content };
}

/** Validate immutable content, exact hash and requested-map coverage offline. */
export function cameraManifestValid(record, maps) {
  const content = record?.content;
  if (content?.schemaVersion !== 1 || content.protocol !== RESIDENCY_CAMERA_PROTOCOL
      || !Array.isArray(content.maps) || !content.maps.length || !content.maps.every(validCamera)) return false;
  const ids = content.maps.map(camera => camera.mapId);
  return new Set(ids).size === ids.length && maps.every(id => ids.includes(id))
    && typeof content.source?.reportSha256 === 'string' && /^[a-f0-9]{64}$/.test(content.source.reportSha256)
    && record.sha256 === cameraManifestRecord(content).sha256;
}

export function cameraForMap(record, mapId) {
  const camera = record.content.maps.find(camera => camera.mapId === mapId);
  if (!camera) throw new Error(`Camera manifest is missing ${mapId}`);
  return camera;
}

/** Browser-side; an external shot is already pinned, so rig.update is a no-op. */
export function applyResidencyCamera(saved) {
  const D = window.__DEBUG;
  if (D.world?.mapId !== saved.mapId || D.rig?.externalActive !== true) {
    throw new Error(`Absolute residency camera needs the matching external shot: ${saved.mapId}`);
  }
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

/** Browser-side, actual unrounded scalars before/after rendered-frame sampling. */
export function captureResidencyCameraState() {
  const D = window.__DEBUG, canvas = D.renderer.domElement;
  return {
    camera: {
      position: D.camera.position.toArray(), quaternion: D.camera.quaternion.toArray(),
      fov: D.camera.fov, near: D.camera.near, far: D.camera.far,
    },
    render: {
      canvas: [canvas.width, canvas.height], pixelRatio: D.renderer.getPixelRatio(),
      renderScale: Number(canvas.dataset.renderScale), dynScale: D.post.dynScale,
      postAA: canvas.dataset.postAa, msaaSamples: D.post.msaaSamples,
      preset: D.quality.resolvePresetName(), perfTrim: D.post.perfTrim,
      gtao: D.post.gtao.enabled, bloom: D.post.bloom.enabled,
    },
  };
}

function validRender(render, viewport) {
  return same(render?.canvas, [viewport.width, viewport.height])
    && render.pixelRatio === viewport.deviceScaleFactor && render.renderScale === 1
    && render.dynScale === 1 && render.perfTrim === 0
    && typeof render.postAA === 'string' && render.postAA.length > 0
    && typeof render.preset === 'string' && render.preset.length > 0
    && Number.isInteger(render.msaaSamples) && render.msaaSamples >= 0
    && typeof render.gtao === 'boolean' && typeof render.bloom === 'boolean';
}

export function isCameraStateReceipt(state, expectedCamera, viewport) {
  if (!validCamera(expectedCamera)) return false;
  const { position, quaternion, fov, near, far } = expectedCamera;
  return same(state?.camera, { position, quaternion, fov, near, far }) && validRender(state.render, viewport);
}
