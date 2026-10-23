// src/world/hinterland/groundDetail.ts — the battlefield's own ground carried past the edge (horizons-240, 2026-10-23).
// The blind pairs of the lab drafts against the old ring (driver, gunner and chase, day to night) lost on the first
// kilometre past the edge: the ring draws it with the battlefield's own terrain material, so its textured sward, dirt and
// roads run on across the red line, where the Hinterland's land switched at 511 m to its atlas — 4–24 m texels and
// detail octaves that fade by the pixel's long footprint axis, gone from a tank's eye ("golf lawn", "colour cards").
// Here the land reads the battlefield's grass and dirt sheets (terrain.ts splat layers G and D, anisotropically
// filtered, at the battlefield's own world scales and its far variant) and lays their luminance under the atlas's colour,
// as the ring's border parcels do (terrain.ts vBorderTint: a crop's colour times the sward's own luminance); its roads
// take the battlefield's packed-earth law (the dirt sheet's deep mip toward the field, times the map's road tint).
// Fades out by 1.3 km past the edge, where the atlas's own detail carries the land.
import * as THREE from 'three';

/** The battlefield's ground the land reads (terrain.ts hinterlandStage hands it over). */
export interface HinterlandGround {
  /** The grass (G) and dirt (D) albedo sheets. */
  grass: THREE.Texture;
  dirt: THREE.Texture;
  /** Their measured linear means (terrain.ts layerMeans). */
  meanG: THREE.Vector4;
  meanD: THREE.Vector4;
  /** The map's road tint (splat.roadTint). */
  roadTint: readonly [number, number, number];
}

/** The terrain build's splat material and textures as the Hinterland's ground (null when any piece is missing). */
export function hinterlandGroundFrom(source: unknown): HinterlandGround | null {
  const s = source as { textures?: THREE.Texture[]; layerMeans?: { G?: THREE.Vector4; D?: THREE.Vector4 }; roadTint?: readonly number[] } | null;
  const grass = s?.textures?.[0], dirt = s?.textures?.[2], meanG = s?.layerMeans?.G, meanD = s?.layerMeans?.D;
  if (!grass || !dirt || !meanG || !meanD) return null;
  const t = s?.roadTint && s.roadTint.length === 3 ? s.roadTint : [1.08, 1.04, 0.96];
  return { grass, dirt, meanG, meanD, roadTint: [t[0], t[1], t[2]] };
}

/** The battlefield's packed-earth road colour (linear; terrain.ts roadCol: the dirt toward the field beside it, tinted). */
export function hinterlandRoadColor(g: HinterlandGround): [number, number, number] {
  const off = [0.014, 0.010, 0.006];
  return [0, 1, 2].map((i) => (0.7 * g.meanD.getComponent(i) + 0.3 * g.meanG.getComponent(i)) * g.roadTint[i] + off[i]) as [number, number, number];
}

/** The ground's uniforms (the sheets shared with the battlefield's material: the same texture objects). */
export function hinterlandGroundUniforms(g: HinterlandGround): Record<string, THREE.IUniform> {
  return {
    uHlGrass: { value: g.grass },
    uHlDirt: { value: g.dirt },
    uHlMeanG: { value: g.meanG },
    uHlMeanD: { value: g.meanD },
    uHlRoadTint: { value: new THREE.Vector3(g.roadTint[0], g.roadTint[1], g.roadTint[2]) },
  };
}

/** The fragment declarations (inside the program's pars, under HL_GROUND). */
export const HINTERLAND_GROUND_PARS = /* glsl */`
#ifdef HL_GROUND
uniform sampler2D uHlGrass;
uniform sampler2D uHlDirt;
uniform vec4 uHlMeanG;
uniform vec4 uHlMeanD;
uniform vec3 uHlRoadTint;
const mat2 HL_TILEROT = mat2( 0.7431, 0.6691, -0.6691, 0.7431 );
float hlLumaG( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }
// a sheet as the battlefield samples it (terrain.ts splatSamp / groundSamp, reduced): near, the tile and its 42° twin
// over ragged 10–20 m patches; from ~45 to ~160 m the far variant (the same sheet at 0.2317x, a mip bias) takes over,
// eased toward the layer's mean with distance so its repeat never prints as rows
vec3 hlGroundTile( sampler2D t, vec4 mean, vec2 uv, float camD, float rot ) {
  float df = smoothstep( 45.0, 160.0, camD );
  vec3 s = mean.rgb;
  if ( df < 0.996 ) {
    vec3 a = texture2D( t, uv ).rgb;
    if ( rot > 0.003 ) a = mix( a, texture2D( t, HL_TILEROT * uv * 1.16 + vec2( 0.37, 0.61 ) ).rgb, rot );
    s = a;
  }
  if ( df > 0.004 ) {
    vec3 f = texture2D( t, uv * 0.2317 + vec2( 0.5 ), 1.2 ).rgb;
    f = mix( f, mean.rgb, min( 0.24 + 0.4 * smoothstep( 90.0, 600.0, camD ), 0.72 ) );
    s = mix( s, f, df );
  }
  return s;
}
#endif
`;

/**
 * The albedo step (after the atlas's albedo and its detail octaves: hlAlb, hlS, vHlWorld, hlFlag in scope): the near
 * band's land takes the battlefield's sheets. Water, woods and rock keep their own reading.
 */
export const HINTERLAND_GROUND_APPLY = /* glsl */`
#ifdef HL_GROUND
    {
      float hlPast = max( abs( vHlWorld.x ), abs( vHlWorld.z ) ) - 512.0;
      float hlGW = 1.0 - smoothstep( 800.0, 1300.0, hlPast );
      if ( hlGW > 0.0 && !hlFlag( 1.0 ) && !hlFlag( 2.0 ) ) {
        float hlCamD = distance( vHlWorld, cameraPosition );
        vec2 hlUv = vHlWorld.xz;
        float hlRot = smoothstep( 0.4, 0.6, hlNoise( hlUv * 0.07 + vec2( 3.1, 7.7 ) ) );
        bool hlRoad = hlFlag( 16.0 );
        bool hlBare = hlRoad || hlFlag( 32.0 ) || hlFlag( 4.0 );
        vec3 hlG;
        if ( hlBare ) {
          vec3 d = hlGroundTile( uHlDirt, uHlMeanD, hlUv * 0.210, hlCamD, hlRot );
          if ( hlRoad ) {
            // the battlefield's packed earth (terrain.ts roadCol): the dirt toward its mean, a third of the field beside
            vec3 hlField = hlAlb * clamp( hlLumaG( d ) / max( 1e-3, hlLumaG( uHlMeanD.rgb ) ), 0.6, 1.5 );
            hlG = mix( mix( d, uHlMeanD.rgb, 0.5 ), hlField, 0.3 ) * uHlRoadTint + vec3( 0.014, 0.010, 0.006 );
          } else {
            hlG = hlAlb * clamp( hlLumaG( d ) / max( 1e-3, hlLumaG( uHlMeanD.rgb ) ), 0.55, 1.6 );
          }
        } else {
          // a field, a pasture, a heath: the atlas's colour times the sward's own luminance (the ring's border parcels)
          vec3 g = hlGroundTile( uHlGrass, uHlMeanG, hlUv * 0.240, hlCamD, hlRot );
          hlG = hlAlb * clamp( hlLumaG( g ) / max( 1e-3, hlLumaG( uHlMeanG.rgb ) ), 0.55, 1.6 );
        }
        diffuseColor.rgb = mix( diffuseColor.rgb, hlG, hlGW );
      }
    }
#endif
`;
