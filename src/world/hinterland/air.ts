// src/world/hinterland/air.ts — the far land's air: its haze ends in the dome's own sky (the horizons stream, 2026-10-13;
// the coordinator on the Polders pilot's overview frames: "from altitude the horizon haze ends in a hard, bright,
// horizontal band with a flat top edge ... it has to blend into the sky with no visible line").
//
// The haze the land and the outland add for the distance the compression takes away converges to the sky the dome
// draws in that pixel's direction (at the horizon for rays below it): the atmosphere's sky-view lookup with the dome's
// knee, intensity and deck greying, bound read-only each draw from what sky.ts publishes (scene.userData.atmosphere,
// the 'atmosphere-dome' mesh's deck uniforms) — the old panorama's "far earth landing on the screen's horizon"
// (horizonPanorama.ts). Where the sky publishes no atmosphere the scene's fog colour stays the target.
import * as THREE from 'three';
import { ATMO_GROUND_KM, ATMOSPHERE_SKY_GLSL } from '../../engine/atmosphere.ts';

interface PublishedAtmosphere {
  active?: boolean;
  sunDir?: { x: number; y: number; z: number };
  skyView?: THREE.Texture | null; viewHeightKm?: number; knee?: THREE.Vector3; skyIntensity?: number;
}

export interface HinterlandAir {
  uniforms: Record<string, THREE.IUniform>;
  /** Fragment declarations: the atmosphere's lookup and `vec3 hlHazeTarget( vec3 fallback )`. Needs vViewPosition. */
  fragmentPars: string;
  /** Bind this frame's sky (an onBeforeRender's scene). */
  update(scene: THREE.Object3D): void;
}

export function createHinterlandAir(): HinterlandAir {
  const uniforms: Record<string, THREE.IUniform> = {
    tAtmoSky: { value: null },
    uAtmoSun: { value: new THREE.Vector3(0, 1, 0) },
    uAtmoViewH: { value: ATMO_GROUND_KM + 0.05 },
    uAtmoKnee: { value: new THREE.Vector3(1e6, 0, 1) },
    uAtmoIntensity: { value: 1 },
    uHlSkyOn: { value: 0 },
    uHlDeckHorizon: { value: new THREE.Vector4(1, 1, 1, 0) },
    uHlDeckClosed: { value: 0 },
  };
  const fragmentPars = /* glsl */`
${ATMOSPHERE_SKY_GLSL}
uniform float uHlSkyOn;
uniform vec4 uHlDeckHorizon;
uniform float uHlDeckClosed;
// the dome's deck greying (sky.ts): a deck's grey near the horizon, everywhere under a closed one
vec3 hlDeckGrey( vec3 skyCol, vec3 direction ) {
  float deckW = max( uHlDeckHorizon.w * ( 1.0 - smoothstep( 0.0, 0.12, direction.y ) ), uHlDeckClosed );
  if ( deckW > 0.0 ) {
    float deckTintL = max( dot( uHlDeckHorizon.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-4 );
    float deckL = dot( skyCol, vec3( 0.2126, 0.7152, 0.0722 ) );
    if ( uHlDeckClosed > 0.0 ) {
      vec2 hzXZ = length( direction.xz ) > 1e-4 ? normalize( direction.xz ) : vec2( 1.0, 0.0 );
      deckL = mix( deckL, dot( atmoSky( vec3( hzXZ.x, 0.0, hzXZ.y ) ), vec3( 0.2126, 0.7152, 0.0722 ) ), uHlDeckClosed );
    }
    skyCol = mix( skyCol, uHlDeckHorizon.rgb * ( deckL / deckTintL ), deckW );
  }
  return skyCol;
}
// the far land's haze target: the sky the dome draws in this pixel's direction (at the horizon for rays below it)
vec3 hlHazeTarget( vec3 fallback ) {
  if ( uHlSkyOn < 0.5 ) return fallback;
  vec3 d = inverseTransformDirection( -vViewPosition, viewMatrix );
  d = normalize( vec3( d.x, max( d.y, 0.0 ), d.z ) );
  return atmoKnee( hlDeckGrey( atmoSky( d ), d ) ) * uAtmoIntensity;
}
`;
  let domeScene: THREE.Object3D | null = null;
  let dome: THREE.Object3D | undefined;
  return {
    uniforms,
    fragmentPars,
    update(scene) {
      const atmosphere = (scene.userData as { atmosphere?: PublishedAtmosphere }).atmosphere;
      const live = !!(atmosphere?.active && atmosphere.skyView && atmosphere.sunDir && atmosphere.knee);
      uniforms.uHlSkyOn.value = live ? 1 : 0;
      if (!live || !atmosphere) { uniforms.tAtmoSky.value = null; return; }
      uniforms.tAtmoSky.value = atmosphere.skyView ?? null;
      const sun = atmosphere.sunDir!;
      (uniforms.uAtmoSun.value as THREE.Vector3).set(sun.x, sun.y, sun.z).normalize();
      uniforms.uAtmoViewH.value = ATMO_GROUND_KM + (atmosphere.viewHeightKm ?? 0.05);
      (uniforms.uAtmoKnee.value as THREE.Vector3).copy(atmosphere.knee!);
      uniforms.uAtmoIntensity.value = atmosphere.skyIntensity ?? 1;
      if (domeScene !== scene || dome?.parent == null) { domeScene = scene; dome = scene.getObjectByName('atmosphere-dome'); }
      const domeUniforms = ((dome as THREE.Mesh | undefined)?.material as THREE.ShaderMaterial | undefined)?.uniforms;
      const deckHorizon = domeUniforms?.uDeckHorizon?.value, deckClosed = domeUniforms?.uDeckClosed?.value;
      if (deckHorizon instanceof THREE.Vector4 && typeof deckClosed === 'number') {
        (uniforms.uHlDeckHorizon.value as THREE.Vector4).copy(deckHorizon);
        uniforms.uHlDeckClosed.value = deckClosed;
      } else {
        (uniforms.uHlDeckHorizon.value as THREE.Vector4).set(1, 1, 1, 0);
        uniforms.uHlDeckClosed.value = 0;
      }
    },
  };
}
