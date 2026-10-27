// The technical look as a render pass (258; the owner, 2026-10-26, of the new technical drawings: "these would be great
// for views in gallery too ... we should even tell gallery to update its 3d views too"). One shading for the drawings'
// plates (tools/drawing-page.ts) and a live 3D view (the Gallery's inspection): the scene drawn as graphite form shading
// from its view-space normals (a key from the upper left toward the viewer, a sky fill from above), darkened by a cavity
// term (a neighbour nearer the camera by 1.5 to 120 cm within 5 or 11 px occludes: the wheels behind the skirts, the
// recesses between plates), part edges engraved dark where depth or surface direction breaks, the silhouette drawn light
// round the form, fine hatching in the shade, over a transparent ground. Two passes (an antialiased coverage pass and a
// normal-and-depth pass, each with an override material) and one composite, blended over the current target.
// The palette is display values: draw it into the output (after any tone mapping), as the overlays above it are.
// First-party: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';

const VERTEX = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';

const FRAGMENT = /* glsl */ `
#include <packing>
uniform sampler2D tCover; uniform sampler2D tNormal; uniform sampler2D tDepth;
uniform vec2 texel; uniform float near; uniform float far; uniform float pxScale; uniform bool orthographic;
varying vec2 vUv;
float metresAt(vec2 uv){
  float d = texture2D(tDepth, uv).x;
  return orthographic ? -orthographicDepthToViewZ(d, near, far) : -perspectiveDepthToViewZ(d, near, far);
}
vec3 normalAt(vec2 uv){ return normalize(texture2D(tNormal, uv).xyz * 2. - 1.); }
float coverAt(vec2 uv){ return texture2D(tCover, uv).r; }
void main(){
  float cover = coverAt(vUv);
  // silhouette: coverage breaks within two texels (a heavier line); part edges: depth or normal breaks
  float silhouette = 0.;
  for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) {
    if (i * i + j * j > 5) continue;
    silhouette = max(silhouette, abs(coverAt(vUv + vec2(float(i), float(j)) * texel) - cover));
  }
  float m0 = metresAt(vUv);
  vec3 n0 = normalAt(vUv);
  float crease = 0.;
  for (int k = 0; k < 4; k++) {
    vec2 o = k == 0 ? vec2(texel.x, 0.) : k == 1 ? vec2(-texel.x, 0.) : k == 2 ? vec2(0., texel.y) : vec2(0., -texel.y);
    if (coverAt(vUv + o) < .5) continue;
    crease = max(crease, smoothstep(.04, .14, abs(metresAt(vUv + o) - m0)));
    crease = max(crease, smoothstep(.10, .28, 1. - dot(normalAt(vUv + o), n0)));
  }
  float occ = 0.;
  for (int k = 0; k < 12; k++) {
    float a = float(k) * .5236;
    vec2 uv = vUv + vec2(cos(a), sin(a)) * texel * pxScale * (k - (k / 2) * 2 == 0 ? 5. : 11.);
    if (coverAt(uv) < .5) continue;
    float nearer = m0 - metresAt(uv);
    occ += smoothstep(.015, .12, nearer) * (1. - smoothstep(.6, 1.2, nearer));
  }
  float cavity = occ / 12.;
  vec3 light = normalize(vec3(-.5, .65, .58));
  float key = smoothstep(-.35, 1., dot(n0, light));
  float lum = (.10 + .64 * key + .16 * (.5 + .5 * n0.y)) * (1. - .62 * cavity) * mix(.84, 1.06, vUv.y);
  // fine 45 deg hatching where the form turns from the light or sits in a recess
  float hatch = step(fract((gl_FragCoord.x + gl_FragCoord.y) / (4. * pxScale)), .22) * (1. - smoothstep(.16, .30, lum));
  vec3 body = mix(vec3(.07, .085, .10), vec3(.43, .48, .52), smoothstep(.0, .9, lum));
  body = mix(body, vec3(.05, .06, .075), hatch * .5);
  // part edges engraved dark into the body, the silhouette drawn light round it
  vec3 rgb = mix(body, vec3(.035, .045, .06), crease * .7);
  rgb = mix(rgb, vec3(.80, .85, .89), silhouette * .95);
  float alpha = max(cover, silhouette * .95);
  gl_FragColor = vec4(rgb * alpha, alpha);
}`;

/** The composite: the coverage, normal and depth textures of one view into the technical look (premultiplied). */
export function createTechnicalCompositeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      tCover: { value: null }, tNormal: { value: null }, tDepth: { value: null },
      texel: { value: new THREE.Vector2() }, near: { value: 0.1 }, far: { value: 100 }, pxScale: { value: 1 },
      orthographic: { value: false },
    },
    vertexShader: VERTEX, fragmentShader: FRAGMENT,
    depthTest: false, depthWrite: false, transparent: true, premultipliedAlpha: true, toneMapped: false,
  });
}

export interface TechnicalPassOptions {
  /** The coverage pass's MSAA samples (the silhouette's antialiasing). */
  readonly samples?: number;
  /** Device pixels per CSS pixel: the cavity radii and hatching period scale with it. */
  readonly pxScale?: number;
}

export interface TechnicalPass {
  /** Draw `scene` (less `hide`, every line, point and sprite, and every draw that writes no colour) in the technical
   * look, blended over the renderer's current target. */
  render(scene: THREE.Scene, camera: THREE.Camera, options?: { readonly hide?: readonly THREE.Object3D[] }): void;
  /** The drawing buffer's size in device pixels. */
  setSize(width: number, height: number): void;
  dispose(): void;
}

function writesColour(object: THREE.Object3D): boolean {
  const mesh = object as THREE.Mesh;
  if (mesh.userData?.shadowOnly) return false;
  const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.Material[];
  return materials.some((m) => m && m.visible !== false && m.colorWrite !== false && !(m.transparent && m.opacity <= 0));
}

export function createTechnicalPass(renderer: THREE.WebGLRenderer, { samples = 4, pxScale = 1 }: TechnicalPassOptions = {}): TechnicalPass {
  const cover = new THREE.WebGLRenderTarget(1, 1, { samples });
  const normals = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) });
  const coverMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const normalMaterial = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  const composite = createTechnicalCompositeMaterial();
  composite.uniforms.pxScale!.value = pxScale;
  const quadScene = new THREE.Scene(), quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), composite);
  quad.frustumCulled = false;
  quadScene.add(quad);
  const clearColor = new THREE.Color();
  const hidden: THREE.Object3D[] = [];

  return {
    render(scene, camera, { hide = [] } = {}) {
      const target = renderer.getRenderTarget(), autoClear = renderer.autoClear, clearAlpha = renderer.getClearAlpha();
      renderer.getClearColor(clearColor);
      const background = scene.background, override = scene.overrideMaterial;
      const skip = new Set(hide);
      scene.traverse((object) => {
        if (!object.visible || object === scene) return;
        const drawn = (object as THREE.Mesh).isMesh ? !skip.has(object) && writesColour(object)
          : !((object as THREE.Line).isLine || (object as THREE.Points).isPoints || (object as THREE.Sprite).isSprite || skip.has(object));
        if (!drawn) { object.visible = false; hidden.push(object); }
      });
      try {
        scene.background = null;
        renderer.autoClear = true;
        renderer.setClearColor(0x000000, 0);
        scene.overrideMaterial = coverMaterial;
        renderer.setRenderTarget(cover);
        renderer.render(scene, camera);
        scene.overrideMaterial = normalMaterial;
        renderer.setRenderTarget(normals);
        renderer.render(scene, camera);
      } finally {
        scene.overrideMaterial = override;
        scene.background = background;
        for (const object of hidden) object.visible = true;
        hidden.length = 0;
      }
      const u = composite.uniforms;
      u.tCover!.value = cover.texture;
      u.tNormal!.value = normals.texture;
      u.tDepth!.value = normals.depthTexture;
      const projected = camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
      u.near!.value = projected.near ?? 0.1;
      u.far!.value = projected.far ?? 100;
      u.orthographic!.value = (camera as THREE.OrthographicCamera).isOrthographicCamera === true;
      renderer.setRenderTarget(target);
      renderer.autoClear = false;
      renderer.render(quadScene, quadCamera);
      renderer.autoClear = autoClear;
      renderer.setClearColor(clearColor, clearAlpha);
    },
    setSize(width, height) {
      const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
      cover.setSize(w, h);
      normals.setSize(w, h);
      (composite.uniforms.texel!.value as THREE.Vector2).set(1 / w, 1 / h);
    },
    dispose() {
      cover.dispose();
      normals.depthTexture?.dispose();
      normals.dispose();
      coverMaterial.dispose();
      normalMaterial.dispose();
      composite.dispose();
      quad.geometry.dispose();
    },
  };
}
