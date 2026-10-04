import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Shared physical CTF banner, used on the battlefield and the Garage payload rail. */
export function createCaptureFlag(color = 0x6fe887) {
  const root = new THREE.Group();
  root.name = 'Capture flag assembly';
  const metal = new THREE.MeshStandardMaterial({ color: 0x647079, metalness: .8, roughness: .32 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xd1b67c, metalness: .7, roughness: .4 });
  const pole = new THREE.CylinderGeometry(.023, .033, 2.35, 10).translate(0, 1.175, 0);
  const fittings: THREE.BufferGeometry[] = [];
  for (const y of [.07, .23, 1.36, 2.23]) fittings.push(new THREE.CylinderGeometry(.049, .049, .055, 10).translate(0, y, 0));
  fittings.push(new THREE.SphereGeometry(.052, 10, 6).translate(0, 2.39, 0));
  fittings.push(new THREE.BoxGeometry(.16, .06, .16).translate(0, .03, 0));
  const hardware = mergeGeometries(fittings)!;
  fittings.forEach(g => g.dispose());
  const cloth = new THREE.PlaneGeometry(1.36, .86, 24, 14);
  const positions = cloth.getAttribute('position');
  // A restrained swallowtail gives the free edge a distinctive silhouette.
  for (let i = 0; i < positions.count; i++) {
    const u = cloth.getAttribute('uv').getX(i), v = cloth.getAttribute('uv').getY(i);
    positions.setXYZ(i, .045 + u * (1.36 - .17 * (1 - Math.abs(v * 2 - 1))), 1.36 + v * .86, 0);
  }
  cloth.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color, roughness: .96, metalness: 0, side: THREE.DoubleSide });
  const time = { value: 0 };
  material.onBeforeCompile = shader => {
    shader.uniforms.flagTime = time;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      uniform float flagTime; varying vec2 vFlagUv;
      float flagWave(vec2 p) {
        float freeEdge = smoothstep(0.04, 1.35, p.x);
        return freeEdge * (0.13 * sin(p.x * 5.0 - flagTime * 2.8 + p.y * 1.8)
          + 0.045 * sin(p.x * 11.0 - flagTime * 4.4 - p.y * 4.0));
      }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        float dx = (flagWave(position.xy + vec2(0.005,0.0)) - flagWave(position.xy - vec2(0.005,0.0))) / 0.01;
        float dy = (flagWave(position.xy + vec2(0.0,0.005)) - flagWave(position.xy - vec2(0.0,0.005))) / 0.01;
        objectNormal = normalize(vec3(-dx,-dy,1.0));`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlagUv = uv; transformed.z += flagWave(position.xy);');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vFlagUv;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 edge = min(vFlagUv, 1.0-vFlagUv);
        float hem = 1.0-smoothstep(0.018,0.032,min(edge.x,edge.y));
        vec2 emblem = (vFlagUv-vec2(0.48,0.5))*vec2(1.55,1.0);
        float diamond = abs(emblem.x)+abs(emblem.y);
        float badge = (1.0-smoothstep(0.24,0.255,diamond))*smoothstep(0.15,0.165,diamond);
        float stitch = hem * step(0.5,fract((vFlagUv.x+vFlagUv.y)*95.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86,0.91,0.85), max(badge,hem*0.72));
        diffuseColor.rgb *= 1.0-stitch*0.15;`);
  };
  material.customProgramCacheKey = () => 'ctf-woven-banner-v1';
  const banner = new THREE.Mesh(cloth, material);
  banner.name = 'Woven team banner';
  banner.frustumCulled = false; // wind extends beyond the rest plane
  root.add(new THREE.Mesh(pole, metal), new THREE.Mesh(hardware, trim), banner);
  return {
    root, material,
    update(timeS: number) { time.value = timeS; },
    dispose() { root.removeFromParent(); pole.dispose(); hardware.dispose(); cloth.dispose(); metal.dispose(); trim.dispose(); material.dispose(); },
  };
}
export type CaptureFlag = ReturnType<typeof createCaptureFlag>;
