// The far panorama's bake on a real WebGL context, for horizon-panorama-bake.browser.selftest.mjs (gauntlet wave 32,
// Saltwind: "a nearly shadeless silhouette at almost the sky's value", "a second range rests on a uniform bright haze
// stripe, lighter than the range above it"). A map's ring and far country are built and baked as the battlefield bakes
// them: its sky published (sky.ts scene.userData.atmosphere) and the battlefield's ground and rock means set first
// (horizonAutumnGround.refreshHorizonGroundTone), both pinned from the game's own capture. The atlas is read back, and
// over azimuth windows the far country above the ring's skyline from the bake eye (the ridge) and the band an elevated
// camera sees under it (the strip's fill) are measured as the frame shows them: through the aerial pass's haze law over
// the shell's depth from the map's edge, against the sky at the horizon, in display levels.
import * as THREE from 'three';
import { buildHorizonRing } from '../src/world/maps/horizon.ts';
import { getMapConfig } from '../src/world/maps/index.ts';
import { createHeightField } from '../src/world/terrain.ts';
import { HORIZON_PANORAMA, horizonPanoramaHaze } from '../src/world/horizonPanorama.ts';
import { HAZE_EXT_CHROMA, hazeLayerInverseScale, hazeSigma } from '../src/engine/hazeLaw.ts';

const srgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
/** a linear colour's display level (0-255 luma of its sRGB encoding) */
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
 * battlefield's means, linear), shellD (m: the shell's depth from the edge camera), layer (the haze layer's mean density
 * over that path), windows: [{ name, u0, u1 }] (atlas azimuth fractions) }
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
  const col = (rgb) => new THREE.Color(rgb[0], rgb[1], rgb[2]);
  scene.userData.atmosphere = {
    active: true, sunDir: new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)),
    fogDensity: sky.fogDensity, fogMix: spec.sky.fogMix, fogTint: col(spec.sky.fogTint),
    summary: { horizon: col(spec.sky.horizon), sunHorizon: col(spec.sky.sunHorizon) },
  };
  scene.userData.lightModel = { overcast: spec.sky.overcast };
  pano.setGroundTone(col(spec.ground), col(spec.rock));
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: false });
  try {
    let baked = false;
    for (let i = 0; i < 4 && !baked; i++) baked = pano.ensureBaked(renderer);
    const stats = { ...pano.stats };
    if (!baked) return { baked, stats, windows: null };
    // the atlas read back through a plain copy (premultiplied, the strip's own encoding)
    const tex = pano.mesh.material.map;
    const W = 2048, H = 512;
    const rt = new THREE.WebGLRenderTarget(W, H);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { t: { value: tex } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main() { gl_FragColor = texture2D(t, vUv); }',
    }));
    const copy = new THREE.Scene();
    copy.add(quad);
    renderer.setRenderTarget(rt);
    renderer.render(copy, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
    renderer.setRenderTarget(null);
    const px = new Uint8Array(W * H * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
    rt.dispose(); quad.geometry.dispose(); quad.material.dispose();
    // the ring's skyline from the bake eye, per atlas column (its vertices' highest elevation)
    const P = HORIZON_PANORAMA, ringSky = new Float32Array(W).fill(-90);
    const pa = ring.geometry.getAttribute('position');
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), r = Math.hypot(x, z);
      if (r < 200) continue;
      const e = Math.atan2(y - P.eyeY, r) * 180 / Math.PI;
      const k = Math.floor((((Math.atan2(z, x) / (Math.PI * 2)) % 1 + 1) % 1) * W) % W;
      if (e > ringSky[k]) ringSky[k] = e;
    }
    for (let k = 1; k < W; k++) if (ringSky[k] < -80) ringSky[k] = ringSky[k - 1];
    // the aerial pass over the shell's depth (hazeLaw: the map's σ, the per-channel extinction, the layer's mean), toward
    // the in-scatter target the bake itself used (the published sky's horizon band drawn toward the tint, a step under it)
    const sigma = hazeSigma(sky.fogDensity);
    const sun = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
    const law = horizonPanoramaHaze(scene.userData.atmosphere, sun, sky.fogDensity, spec.sky.overcast);
    const target = [law.anti.x, law.anti.y, law.anti.z];
    const T = HAZE_EXT_CHROMA.map((c) => Math.exp(-sigma * c * spec.shellD * spec.layer));
    const aerial = (lin) => lin.map((c, i) => c * T[i] + target[i] * (1 - T[i]));
    const skyLevel = level(spec.sky.horizon);
    const elevOf = (j) => (P.elevMin + (P.elevMax - P.elevMin) * ((j + 0.5) / H)) * 180 / Math.PI;
    const windows = {};
    for (const w of spec.windows) {
      const ridge = [], band = [];
      for (let k = Math.floor(w.u0 * W); k < Math.ceil(w.u1 * W); k++) {
        const kk = ((k % W) + W) % W;
        for (let j = 0; j < H; j++) {
          const o = (j * W + kk) * 4, a = px[o + 3] / 255;
          if (a < 0.98) continue;
          const lin = [0, 1, 2].map((c) => Math.pow(px[o + c] / 255 / a, 2.2));
          const e = elevOf(j), s = ringSky[kk];
          if (e > s + 0.3) ridge.push(level(aerial(lin)));
          else if (e > s - 1.5 && e < s - 0.2) band.push(level(aerial(lin)));
        }
      }
      windows[w.name] = {
        texels: ridge.length, bandTexels: band.length, sky: skyLevel,
        ridge: quantile(ridge, 0.5), p10: quantile(ridge, 0.1), p90: quantile(ridge, 0.9), band: quantile(band, 0.5),
      };
    }
    return { baked, stats, hazeInvScale: hazeLayerInverseScale(), windows };
  } finally {
    renderer.dispose();
    pano.dispose();
  }
}
