// The far panorama's bake on a real WebGL context, for horizon-panorama-bake.browser.selftest.mjs (the drift receipt on
// Saltwind's far country as gauntlet wave 47 passed it). A map's ring and far country are built and baked as the
// battlefield bakes them: its sky published (sky.ts scene.userData.atmosphere) and the battlefield's ground and rock
// means set first (horizonAutumnGround.refreshHorizonGroundTone), both as the game's own capture recorded them. Then:
//  - views: the shell rendered alone from a census camera (the ring hidden, the sky a sentinel) into an 800 x 450 float
//    target, its far country measured by silhouette inside a pixel box (per column every pixel under the skyline),
//    through the aerial pass's haze law over each column's distance to the shell and each pixel's layer mean, against
//    the sky at the horizon. These are the bake's own levels before the game's output grade, which is not modelled: a
//    drift measure, not a prediction of a capture's frames;
//  - band: the atlas over an azimuth window — the far country above the ring's skyline from the bake eye (the ridge) and
//    the band an elevated camera sees under it (the strip's fill), their medians.
import * as THREE from 'three';
import { buildHorizonRing } from '../src/world/maps/horizon.ts';
import { getMapConfig } from '../src/world/maps/index.ts';
import { createHeightField } from '../src/world/terrain.ts';
import { HORIZON_PANORAMA, horizonPanoramaHaze } from '../src/world/horizonPanorama.ts';
import { HAZE_EXT_CHROMA, hazeLayerInverseScale, hazeSigma } from '../src/engine/hazeLaw.ts';

const srgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
/** a linear colour's level (0-255 luma of its sRGB encoding) */
const level = (lin) => {
  const v = lin.map((c) => 255 * srgb(Math.min(1, Math.max(0, c))));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const quantile = (values, q) => {
  if (!values.length) return NaN;
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

/**
 * spec: { map, sky: { horizon, sunHorizon, fogTint, fogMix, overcast } (the published sky, linear), ground, rock (the
 * battlefield's means, linear), datum? (the haze layer's datum, default 0),
 * views: [{ name, position, quaternion, fov, box: [x0, y0, x1, y1] (pixels of the 800 x 450 frame, top-left origin,
 * x1 and y1 exclusive) }], band: { u0, u1 } (an atlas azimuth window) }
 */
export async function measureHorizonPanoramaBake(spec) {
  const cfg = getMapConfig(spec.map);
  const hf = createHeightField(1337, cfg);
  const ring = buildHorizonRing(null, cfg, 1337, hf);
  const pano = ring.userData.horizonPanorama;
  if (!pano) throw new Error(`${spec.map}: no panorama`);
  const scene = new THREE.Scene();
  scene.add(ring);
  const sky = cfg.sky ?? {};
  const az = (sky.sunAzimuthDeg ?? 115) * Math.PI / 180, el = (sky.sunElevationDeg ?? 32) * Math.PI / 180;
  const sun = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  const col = (rgb) => new THREE.Color(rgb[0], rgb[1], rgb[2]);
  scene.userData.atmosphere = {
    active: true, sunDir: new THREE.Vector3(...sun), fogDensity: sky.fogDensity, fogMix: spec.sky.fogMix,
    fogTint: col(spec.sky.fogTint), summary: { horizon: col(spec.sky.horizon), sunHorizon: col(spec.sky.sunHorizon) },
  };
  scene.userData.lightModel = { overcast: spec.sky.overcast };
  pano.setGroundTone(col(spec.ground), col(spec.rock));
  const W = 800, H = 450;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  try {
    const gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    let baked = false;
    for (let i = 0; i < 4 && !baked; i++) baked = pano.ensureBaked(renderer);
    const stats = { ...pano.stats };
    if (!baked) return { gpu, baked, stats, views: null, band: null };
    const law = horizonPanoramaHaze(scene.userData.atmosphere, sun, sky.fogDensity, spec.sky.overcast);
    const sigma = hazeSigma(sky.fogDensity);
    const skyLevel = level(spec.sky.horizon);
    // the shell alone over a sentinel sky
    const ringMaterial = ring.material;
    ring.material = new THREE.MeshBasicMaterial({ visible: false });
    const hidden = ring.children.filter((c) => c !== pano.mesh && c.visible);
    for (const c of hidden) c.visible = false;
    scene.background = new THREE.Color(1e4, 0, 0);
    ring.updateMatrixWorld(true);
    pano.mesh.updateMatrixWorld(true);
    const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType });
    const px = new Float32Array(W * H * 4);
    const raycaster = new THREE.Raycaster();
    const views = {};
    const inv = hazeLayerInverseScale(), datum = spec.datum ?? 0;
    const anti = [law.anti.x, law.anti.y, law.anti.z], toward = [law.toward.x, law.toward.y, law.toward.z];
    for (const v of spec.views) {
      const camera = new THREE.PerspectiveCamera(v.fov, W / H, 0.5, 60000);
      camera.position.set(...v.position);
      camera.quaternion.set(...v.quaternion);
      camera.updateMatrixWorld(true);
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
      const [bx0, by0, bx1, by1] = v.box;
      const ridge = [];
      for (let x = bx0; x < bx1; x++) {
        let top = -1, bottom = -1;
        for (let y = by0; y < by1; y++) {
          const o = ((H - 1 - y) * W + x) * 4;
          if (px[o] < 1e3) { if (top < 0) top = y; bottom = y; }
        }
        if (top < 0) continue;
        // the column's distance to the shell (a ray through its middle row) and its target (the sun's side warmer)
        raycaster.setFromCamera(new THREE.Vector2((x + 0.5) / W * 2 - 1, -(((top + bottom) / 2 + 0.5) / H * 2 - 1)), camera);
        const hit = raycaster.intersectObject(pano.mesh, false)[0];
        const d = hit ? hit.distance : 3000;
        const dir = raycaster.ray.direction, sh = Math.hypot(sun[0], sun[2]) || 1, dh = Math.hypot(dir.x, dir.z) || 1;
        const tw = Math.pow(0.5 + 0.5 * (dir.x * sun[0] + dir.z * sun[2]) / (dh * sh), 2);
        const tgt = anti.map((t, i) => t + (toward[i] - t) * tw);
        for (let y = top; y <= bottom; y++) {
          const o = ((H - 1 - y) * W + x) * 4;
          if (px[o] >= 1e3) continue;
          // the aerial pass's layer: its mean density between the camera's height and the point's (hazeLaw hazeLayerMean)
          raycaster.setFromCamera(new THREE.Vector2((x + 0.5) / W * 2 - 1, -((y + 0.5) / H * 2 - 1)), camera);
          const a0 = Math.max(camera.position.y - datum, 0) * inv, a1 = Math.max(camera.position.y + raycaster.ray.direction.y * d - datum, 0) * inv;
          const layer = Math.abs(a0 - a1) < 1e-3 ? Math.exp(-0.5 * (a0 + a1)) : (Math.exp(-a1) - Math.exp(-a0)) / (a0 - a1);
          const T = HAZE_EXT_CHROMA.map((c) => Math.exp(-sigma * c * d * layer));
          ridge.push(level([0, 1, 2].map((i) => px[o + i] * T[i] + tgt[i] * (1 - T[i]))));
        }
      }
      views[v.name] = { pixels: ridge.length, sky: skyLevel, median: quantile(ridge, 0.5), p10: quantile(ridge, 0.1), p90: quantile(ridge, 0.9) };
    }
    rt.dispose();
    ring.material = ringMaterial;
    for (const c of hidden) c.visible = true;
    // the band: the atlas over an azimuth window, the ridge above the ring's skyline from the eye against the fill under it
    let band = null;
    if (spec.band) {
      const tex = pano.mesh.material.map;
      const AW = 2048, AH = 512;
      const art = new THREE.WebGLRenderTarget(AW, AH);
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
        uniforms: { t: { value: tex } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main() { gl_FragColor = texture2D(t, vUv); }',
      }));
      const copy = new THREE.Scene();
      copy.add(quad);
      renderer.setRenderTarget(art);
      renderer.render(copy, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
      renderer.setRenderTarget(null);
      const apx = new Uint8Array(AW * AH * 4);
      renderer.readRenderTargetPixels(art, 0, 0, AW, AH, apx);
      art.dispose(); quad.geometry.dispose(); quad.material.dispose();
      const P = HORIZON_PANORAMA, ringSky = new Float32Array(AW).fill(-90);
      const pa = ring.geometry.getAttribute('position');
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), r = Math.hypot(x, z);
        if (r < 200) continue;
        const e = Math.atan2(y - P.eyeY, r) * 180 / Math.PI;
        const k = Math.floor((((Math.atan2(z, x) / (Math.PI * 2)) % 1 + 1) % 1) * AW) % AW;
        if (e > ringSky[k]) ringSky[k] = e;
      }
      for (let k = 1; k < AW; k++) if (ringSky[k] < -80) ringSky[k] = ringSky[k - 1];
      const elevOf = (j) => (P.elevMin + (P.elevMax - P.elevMin) * ((j + 0.5) / AH)) * 180 / Math.PI;
      const ridge = [], fill = [];
      for (let k = Math.floor(spec.band.u0 * AW); k < Math.ceil(spec.band.u1 * AW); k++) {
        const kk = ((k % AW) + AW) % AW;
        for (let j = 0; j < AH; j++) {
          const o = (j * AW + kk) * 4, a = apx[o + 3] / 255;
          if (a < 0.98) continue;
          const lv = level([0, 1, 2].map((c) => Math.pow(apx[o + c] / 255 / a, 2.2)));
          const e = elevOf(j), s = ringSky[kk];
          if (e > s + 0.3) ridge.push(lv);
          else if (e > s - 1.5 && e < s - 0.2) fill.push(lv);
        }
      }
      band = { ridge: quantile(ridge, 0.5), fill: quantile(fill, 0.5), ridgeTexels: ridge.length, fillTexels: fill.length };
    }
    return { gpu, baked, stats, views, band };
  } finally {
    renderer.dispose();
    pano.dispose();
  }
}
