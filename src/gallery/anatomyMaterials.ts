// Gallery anatomy materials: one technical shading model for every drawn anatomy part, and the ghost-exterior pass.
//
// The shading is camera-relative (a fixed key and fill in view space), so a part reads the same from every orbit
// angle, untouched by scene lights, fog or tone mapping: the legend colour is the surface colour.
import * as THREE from 'three';

const TECH_VERTEX = /* glsl */ `
#include <common>
#include <color_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
attribute float aSurface;
varying vec3 vViewPosition;
varying vec3 vTechNormal;
varying float vSurface;
void main() {
  #include <color_vertex>
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <project_vertex>
  #include <logdepthbuf_vertex>
  #include <clipping_planes_vertex>
  vViewPosition = -mvPosition.xyz;
  vTechNormal = normalize(transformedNormal);
  vSurface = aSurface;
}
`;

const TECH_FRAGMENT = /* glsl */ `
#include <common>
#include <color_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
uniform vec3 uColor;
uniform float uOpacity;
uniform float uDim;
uniform float uHighlight;
uniform float uSelected;
uniform vec3 uHighlightColor;
varying vec3 vViewPosition;
varying vec3 vTechNormal;
varying float vSurface;
void main() {
  #include <clipping_planes_fragment>
  #include <logdepthbuf_fragment>
  #ifdef TECH_FLAT
    vec3 normal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
  #else
    vec3 normal = normalize(vTechNormal);
    normal = gl_FrontFacing ? normal : -normal;
  #endif
  vec3 base = uColor;
  #ifdef USE_COLOR
    base *= vColor.rgb;
  #endif
  vec3 view = normalize(vViewPosition);
  float key = max(dot(normal, normalize(vec3(-0.42, 0.70, 0.58))), 0.0);
  float fill = max(dot(normal, normalize(vec3(0.62, -0.18, 0.76))), 0.0);
  float rim = pow(1.0 - clamp(dot(normal, view), 0.0, 1.0), 3.0);
  vec3 color = base * (0.34 + 0.66 * key + 0.18 * fill) + rim * 0.07;
  float selected = uHighlight;
  if (uSelected >= 0.0 && abs(vSurface - uSelected) < 0.5) selected = 1.0;
  color = mix(color, uHighlightColor * (0.55 + 0.45 * key), selected * 0.62);
  gl_FragColor = vec4(color * mix(1.0, 0.32, uDim), uOpacity * mix(1.0, 0.45, uDim));
  #include <colorspace_fragment>
}
`;

interface TechMaterialOptions {
  color?: THREE.ColorRepresentation;
  vertexColors?: boolean;
  flat?: boolean;
  opacity?: number;
  side?: THREE.Side;
  depthWrite?: boolean;
  polygonOffset?: number;
}

/** Tungsten: the one selection colour of the anatomy views. */
const ANATOMY_HIGHLIGHT = '#ffbd5c';

export type TechMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uColor: { value: THREE.Color };
    uOpacity: { value: number };
    uDim: { value: number };
    uHighlight: { value: number };
    uSelected: { value: number };
    uHighlightColor: { value: THREE.Color };
  };
};

export function techMaterial(options: TechMaterialOptions = {}): TechMaterial {
  const opacity = options.opacity ?? 1;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(options.color ?? '#ffffff') },
      uOpacity: { value: opacity },
      uDim: { value: 0 },
      uHighlight: { value: 0 },
      uSelected: { value: -1 },
      uHighlightColor: { value: new THREE.Color(ANATOMY_HIGHLIGHT) },
    },
    vertexShader: TECH_VERTEX,
    fragmentShader: TECH_FRAGMENT,
    vertexColors: !!options.vertexColors,
    transparent: opacity < 1,
    depthWrite: options.depthWrite ?? opacity >= 1,
    side: options.side ?? THREE.FrontSide,
    defines: options.flat ? { TECH_FLAT: '' } : {},
  }) as TechMaterial;
  if (options.polygonOffset) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = options.polygonOffset;
    material.polygonOffsetUnits = options.polygonOffset;
  }
  material.userData.anatomyBaseOpacity = opacity;
  return material;
}

/** Thin technical line work (plate seams, hit-shape wire). */
export function techLineMaterial(color: THREE.ColorRepresentation, opacity: number, depthTest = true): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest, depthWrite: false, toneMapped: false });
}

const GHOST_VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vViewPosition;
varying vec3 vGhostNormal;
void main() {
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <project_vertex>
  #include <logdepthbuf_vertex>
  vViewPosition = -mvPosition.xyz;
  vGhostNormal = normalize(transformedNormal);
}
`;

const GHOST_FRAGMENT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uFill;
uniform float uRim;
varying vec3 vViewPosition;
varying vec3 vGhostNormal;
void main() {
  #include <logdepthbuf_fragment>
  vec3 normal = normalize(vGhostNormal);
  float facing = abs(dot(normal, normalize(vViewPosition)));
  float rim = pow(1.0 - facing, 2.4);
  gl_FragColor = vec4(uColor, clamp(uFill + uRim * rim, 0.0, 1.0));
  #include <colorspace_fragment>
}
`;

/**
 * The exterior as a glass shell: a depth-only pre-pass keeps only the front-most surface, then a fresnel rim with a
 * faint fill draws over the opaque anatomy, so the result reads as a technical drawing instead of overlapping wire.
 */
export function ghostMaterials(): { depth: THREE.MeshBasicMaterial; ghost: THREE.ShaderMaterial } {
  const depth = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true });
  const ghost = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#d6e2ea') },
      uFill: { value: 0.035 },
      uRim: { value: 0.42 },
    },
    vertexShader: GHOST_VERTEX,
    fragmentShader: GHOST_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthFunc: THREE.LessEqualDepth,
  });
  return { depth, ghost };
}
