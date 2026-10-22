// black-world-page-probes.mjs — page functions the black-world tools share (black-world-repro.mjs, the black-world
// browser receipt; 2026-10-21, black-screen-228 round 3). Each runs inside a dev page (window.__DEBUG) through
// page.evaluate, so it closes over nothing and brings no imports.

/**
 * (round 3, eng E1) A player looking toward the map's own sun: the camera circles 1.2-3 deg about the disc for `seconds`
 * (4 deg under it, the way a player pans near it) and the scene target is read back at the disc every 10 frames. On a
 * day battle the disc's ~9e4 radiance saturates the half-float scene target (65504 on Metal), the value the round-2
 * guard misread as a NaN. window.__bwrSunScan holds the result; `done` once the steer ended.
 */
export function sunScan(seconds) {
  const D = window.__DEBUG, P = D.post, C = D.camera, R = D.renderer, gl = R.getContext();
  let u = null;
  D.scene.traverse((o) => { if (!u && o.material?.name === 'AtmosphereSkyMaterial') u = o.material.uniforms; });
  if (!u) return { error: 'no AtmosphereSkyMaterial' };
  const sun = u.uSunDirection.value;
  const V = C.position.constructor;
  const az = Math.atan2(sun.z, sun.x), el = Math.asin(sun.y);
  const look = new V(), target = new V(), disc = new V();
  const guard = window.__COT_BLACK_GUARD;
  const before = guard ? guard.stats() : null;
  const result = { elevationDeg: +(el * 180 / Math.PI).toFixed(1), radiance: Math.round(u.uSunDiscRadiance.value), frames: 0,
    reads: 0, maxSeen: 0, over6e4Texels: 0, nonFiniteTexels: 0, done: false };
  window.__bwrSunScan = result;
  const original = P.render;
  const buf = new Float32Array(11 * 11 * 4);
  const until = performance.now() + seconds * 1000;
  P.render = function (dt, wall) {
    const f = result.frames++;
    const radius = (f % 240 < 120 ? 3 : 1.2) * Math.PI / 180, a = f * 0.07;
    const e = el - 4 * Math.PI / 180 + radius * Math.sin(a), h = az + radius * Math.cos(a) / Math.max(0.2, Math.cos(el));
    look.set(Math.cos(e) * Math.cos(h), Math.sin(e), Math.cos(e) * Math.sin(h));
    target.copy(C.position).add(look);
    C.lookAt(target); C.updateMatrixWorld(true);
    const out = original.call(this, dt, wall);
    if (f % 10 === 5) {
      const st = P.sceneAA.sceneTarget;
      disc.copy(C.position).addScaledVector(sun, 1000).project(C);
      const x = Math.round((disc.x * 0.5 + 0.5) * st.width) - 5, y = Math.round((disc.y * 0.5 + 0.5) * st.height) - 5;
      if (x >= 0 && y >= 0 && x + 11 <= st.width && y + 11 <= st.height) {
        R.state.bindFramebuffer(gl.READ_FRAMEBUFFER, R.properties.get(st).__webglFramebuffer);
        gl.readPixels(x, y, 11, 11, gl.RGBA, gl.FLOAT, buf);
        R.state.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        result.reads++;
        for (let i = 0; i < buf.length; i++) {
          if (i % 4 === 3) continue;
          const v = buf[i];
          if (!Number.isFinite(v)) result.nonFiniteTexels++;
          else { if (v > result.maxSeen) result.maxSeen = Math.round(v); if (v >= 6e4) result.over6e4Texels++; }
        }
      }
    }
    if (performance.now() >= until && P.render !== original) {
      P.render = original;
      const after = guard ? guard.stats() : null;
      result.guard = before && after ? { probes: after.probes - before.probes, verdicts: after.verdicts - before.verdicts,
        incidents: after.incidents - before.incidents, lastLit: after.lastLit, lastNan: after.lastNan } : null;
      result.samples = P.sceneAA.sceneTarget.samples;
      result.done = true;
    }
    return out;
  };
  return { started: true, seconds, elevationDeg: result.elevationDeg, radiance: result.radiance, samples: P.sceneAA.sceneTarget.samples };
}

/**
 * A NaN over the whole scene target inside the scene pass for `seconds` (a NaN light or a broken material over the view):
 * three's render into the scene target draws, then a NaN quad (the NaN from its bits, a uniform no compiler can fold)
 * covers it, before the guard's probe reads the target. The NaN class's positive control on a real GPU.
 */
export function nanSceneFault(seconds) {
  const D = window.__DEBUG, R = D.renderer, P = D.post;
  const vc = D.scene.userData.volumetricClouds;
  if (!vc?.renderQuad || !vc.resolveMaterial) return { error: 'no cloud layer (its quad draws the NaN)' };
  const material = new vc.resolveMaterial.constructor({ uniforms: { uBits: { value: 0x7fc00000 } },
    vertexShader: vc.resolveMaterial.vertexShader,
    fragmentShader: 'uniform uint uBits; void main(){ gl_FragColor = vec4(uintBitsToFloat(uBits)); }', depthTest: false, depthWrite: false });
  const render = R.render;
  let inside = false;
  R.render = function (sceneArg, cameraArg) {
    const target = R.getRenderTarget();
    const result = render.call(this, sceneArg, cameraArg);
    if (!inside && target === P.sceneAA.sceneTarget) {
      inside = true;
      try { vc.renderQuad(material, target); } finally { inside = false; }
    }
    return result;
  };
  setTimeout(() => { R.render = render; material.dispose(); }, seconds * 1000);
  return { started: true, seconds };
}
