// src/world/wireMaterial.ts — the power lines' conductors drawn as wires a pixel wide at the least (the scenery lane,
// 2026-10-04; gauntlet wave 48: "the power cables break into dashes" in both Verdant village-wall views).
//
// A conductor is 3-6 cm across: past a few hundred metres it covers a fraction of a pixel, and a lit tube that thin is
// sampled by the rasteriser in dashes. So a conductor is a ribbon along its catenary (maps/sceneryKit.ts
// buildConductor: the centre line twice over, a side each), and this material's vertex stage turns it to face the
// camera and widens it to half a pixel either side of its centre at the least; the fragment's alpha is the share of
// that width the true wire covers, so a far wire thins to a faint continuous line instead of breaking up. Unlit (a
// conductor reads as a dark line against the sky), fogged with the scene, blended, writing no depth, casting nothing.
// One program for every map's wires (`customProgramCacheKey`).
import * as THREE from 'three';

/** The vertex attributes a wire ribbon carries (buildConductor). */
export const WIRE_ATTRIBUTES = Object.freeze(['position', 'aWireTangent', 'aWireSide', 'aWireRadius'] as const);

const VERTEX_DECLARATIONS = /* glsl */`
attribute vec3 aWireTangent;
attribute float aWireSide;
attribute float aWireRadius;
uniform float uWirePixel;
varying float vWireCover;`;

// replaces three's project_vertex: the ribbon faces the eye, half a pixel either side of its centre at the least
const VERTEX_PROJECT = /* glsl */`
vec4 wireWorld = modelMatrix * vec4( transformed, 1.0 );
vec3 wireTangent = normalize( mat3( modelMatrix ) * aWireTangent );
vec3 wireToEye = cameraPosition - wireWorld.xyz;
float wireDistance = max( length( wireToEye ), 1e-4 );
vec3 wireAcross = cross( wireTangent, wireToEye / wireDistance );
float wireAcrossLength = length( wireAcross );
wireAcross = wireAcrossLength > 1e-4 ? wireAcross / wireAcrossLength : vec3( 0.0, 1.0, 0.0 );
float wireHalf = max( aWireRadius, 0.5 * uWirePixel * wireDistance );
vWireCover = aWireRadius / wireHalf;
wireWorld.xyz += wireAcross * aWireSide * wireHalf;
vec4 mvPosition = viewMatrix * wireWorld;
gl_Position = projectionMatrix * mvPosition;`;

/** Replace one anchor that must occur exactly once (a three.js chunk rename fails loudly, never silently). */
function replaceOnce(source: string, anchor: string, replacement: string): string {
  const parts = source.split(anchor);
  if (parts.length !== 2) throw new Error(`wireMaterial: anchor ${anchor} found ${parts.length - 1} times`);
  return parts.join(replacement);
}

/** Patch a basic material's shader source into the wire's (exported for the receipt). */
export function patchWireShader(shader: { vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform> },
  pixel: THREE.IUniform<number>): void {
  shader.uniforms.uWirePixel = pixel;
  shader.vertexShader = replaceOnce(shader.vertexShader, '#include <common>', `#include <common>${VERTEX_DECLARATIONS}`);
  shader.vertexShader = replaceOnce(shader.vertexShader, '#include <project_vertex>', VERTEX_PROJECT);
  shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <common>', '#include <common>\nvarying float vWireCover;');
  shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <alphatest_fragment>',
    '#include <alphatest_fragment>\n\tdiffuseColor.a *= clamp( vWireCover, 0.0, 1.0 );');
}

/** The world size of one pixel of the target being drawn, a metre in front of a perspective camera. */
export function wirePixelAtOneMetre(camera: THREE.Camera, targetHeight: number): number | null {
  const perspective = camera as THREE.PerspectiveCamera;
  if (!perspective.isPerspectiveCamera || !(targetHeight > 0)) return null;
  return (2 * Math.tan(THREE.MathUtils.degToRad(perspective.fov) * 0.5)) / (targetHeight * Math.max(1e-6, perspective.zoom));
}

const _size = new THREE.Vector2();

/**
 * The conductors as one mesh on the wire material (the geometries are consumed into it). Its pixel is refreshed from
 * the camera and the target before every draw, so a resolution scale, a resize or a zoom keeps it a pixel.
 */
export function createWireMesh(geometry: THREE.BufferGeometry, colorHex = 0x2d3134): THREE.Mesh {
  const pixel: THREE.IUniform<number> = { value: 0.001 };
  const material = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, depthWrite: false, fog: true });
  material.onBeforeCompile = (shader) => patchWireShader(shader, pixel);
  material.customProgramCacheKey = () => 'world-wire-v1';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.onBeforeRender = (renderer, _scene, camera) => {
    const target = renderer.getRenderTarget();
    const height = target ? target.height : renderer.getDrawingBufferSize(_size).y;
    const at = wirePixelAtOneMetre(camera, height);
    if (at !== null) pixel.value = at;
  };
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}
