/**
 * vehicleGroundOcclusion.ts — 2026-10-03 (the skies-and-atmosphere lane, which the gauntlet's wave 0 handed light,
 * colour and atmosphere: "no ambient occlusion"; "the grass in the tank's shadow ... reads as a hole in the ground").
 *
 * The ground's sky light under and beside the near hulls, inside the aerial pass. Scene-wide GTAO stays off on every
 * tier by the owner's choice (2026-09-28, quality.ts: its speckled crevice wash over terrain and foliage), so this is
 * analytic: no screen-space search, no noise, nothing but the ground around the few hulls the shadow router already
 * selects each frame (nearVehicleShadowDetail.ts: the nearest four within 70 m). Each hull stands for an oriented box
 * — its convex shadow proxy (the armour-derived hull and track guards, tankFactoryCore.ts) carried down to the ground
 * over the running gear — and a ground point loses the sky that box hides from it:
 *
 *   beside the hull (d the horizontal distance to the box, h the box's top over the point, L its long half length)
 *     occ = ½ · sin²(atan(h / d)) · (2/π) · atan(L / d)
 *   a wall of height h subtends elevation α = atan(h/d); the cosine-weighted sky below α over half the azimuth is
 *   ½ sin²α (a long wall); a finite hull covers the azimuth share (2/π) atan(L/d) of that half
 *   under the hull (s metres inside the footprint's nearest edge, W its half width, c the belly's clearance): the sky the
 *   point sees through the two side gaps, 1 − ½ sin²(atan(c/s)) − ½ sin²(atan(c/(2W − s))) — ½ at the edge (continuous
 *   with the law beside it: the first captures showed a hard dark rectangle under every hull on overcast snow), toward
 *   GROUND_AO_UNDER at the belly's middle
 *
 * The term dims only the pixel's ambient share, as the vehicle cavity term does (vehicleOcclusion.ts): colour ·
 * (1 − occ · A / (T + A)), the sun term T and the ambient A the light rig gives the pixel's depth normal
 * (contactShadows.ts) — sunlit ground beside a hull keeps its sun, the ground in the hull's own shadow (T = 0) takes the
 * whole darkening. A grass or leaf card (its alpha is its coverage, no sun state) takes a fixed ambient share. Vehicle
 * pixels are never receivers (their own cavities are vehicleOcclusion.ts's). The term fades out over the selection's
 * last 20 m. `vehicleGroundOcclusionAt` is the CPU twin the receipt pins against the GLSL.
 */
import * as THREE from 'three';

/** At most this many hulls (the shadow router's near selection: NEAR_VEHICLE_SHADOW_MAX). */
export const GROUND_AO_MAX_HULLS = 4;
/** The most sky the ground under a hull's belly loses (its middle; the edge loses half, continuous with the side). */
export const GROUND_AO_UNDER = 0.85;
/** The belly's clearance over the ground (m): the side gaps the ground under a hull sees the sky through. */
export const GROUND_AO_CLEARANCE_M = 0.45;
/** The box is carried this far below the proxy's lowest point (the running gear under the track guards, to the ground). */
export const GROUND_AO_GEAR_DROP_M = 0.9;
/** The selection's range (m) and the fade over its last stretch. */
export const GROUND_AO_RANGE_M = 70;
export const GROUND_AO_FADE_M = 20;
/** A card pixel's assumed ambient share (its sun state is unknown: a meadow half in sun, half in shade). */
export const GROUND_AO_CARD_AMBIENT_SHARE = 0.6;

export interface VehicleGroundOcclusionUniforms {
  uVehGround: THREE.IUniform<number>;
  /** Per hull: the box centre (xyz) and its long half length (w). */
  uVehGroundC: THREE.IUniform<THREE.Vector4[]>;
  /** Per hull: the box's unit axes (x, y, z) scaled by nothing; the half extents ride in uVehGroundH. */
  uVehGroundX: THREE.IUniform<THREE.Vector3[]>;
  uVehGroundY: THREE.IUniform<THREE.Vector3[]>;
  uVehGroundZ: THREE.IUniform<THREE.Vector3[]>;
  uVehGroundH: THREE.IUniform<THREE.Vector3[]>;
}

export function createVehicleGroundOcclusionUniforms(): VehicleGroundOcclusionUniforms {
  const v3 = () => Array.from({ length: GROUND_AO_MAX_HULLS }, () => new THREE.Vector3());
  return {
    uVehGround: { value: 0 },
    uVehGroundC: { value: Array.from({ length: GROUND_AO_MAX_HULLS }, () => new THREE.Vector4()) },
    uVehGroundX: { value: v3() }, uVehGroundY: { value: v3() }, uVehGroundZ: { value: v3() }, uVehGroundH: { value: v3() },
  };
}

/** The sky share a ground point at horizontal distance d from a box of top height h (over the point) and long half
 * length L loses (the beside law above); `under` inside the footprint. */
export function vehicleGroundOcclusionBeside(d: number, h: number, L: number): number {
  if (h <= 0) return 0;
  const dd = Math.max(d, 0.05);
  const s = h / Math.hypot(h, dd);
  return 0.5 * s * s * (2 / Math.PI) * Math.atan(L / dd);
}

const _box = new THREE.Box3();
const _c = new THREE.Vector3();
const _ax = new THREE.Vector3(), _ay = new THREE.Vector3(), _az = new THREE.Vector3();

interface HullBoxSource { readonly matrixWorld: THREE.Matrix4; readonly geometry: THREE.BufferGeometry; }

/** The hull proxy of a vehicle root (its shadow detail record's first proxy: procShadow_hull). */
export function hullProxyOf(root: THREE.Object3D, detailKey = 'nearShadowDetail'): HullBoxSource | null {
  const cached = root.userData.groundAoHull as HullBoxSource | null | undefined;
  if (cached !== undefined) return cached;
  const detail = root.userData[detailKey] as { proxies?: readonly THREE.Object3D[] } | undefined;
  const hull = detail?.proxies?.find((p) => p.name === 'procShadow_hull') as THREE.Mesh | undefined;
  const source = hull?.geometry ? (hull as unknown as HullBoxSource) : null;
  if (source && !source.geometry.boundingBox) source.geometry.computeBoundingBox();
  root.userData.groundAoHull = source;
  return source;
}

/**
 * Per frame (post.ts): the boxes of the near hulls the shadow router selected (lighting.ts publishes the selection
 * on scene.userData.nearVehicles). No allocation: the uniform arrays are written in place.
 */
export function updateVehicleGroundOcclusionUniforms(
  u: VehicleGroundOcclusionUniforms, roots: readonly { readonly root: THREE.Object3D }[] | null | undefined, enabled: boolean,
): void {
  let n = 0;
  if (enabled && roots) {
    for (let i = 0; i < roots.length && n < GROUND_AO_MAX_HULLS; i++) {
      const root = roots[i].root;
      if (!root.visible) continue;
      const hull = hullProxyOf(root);
      const bb = hull?.geometry.boundingBox;
      if (!hull || !bb || bb.isEmpty()) continue;
      _box.copy(bb);
      _box.min.y -= GROUND_AO_GEAR_DROP_M;
      _box.getCenter(_c).applyMatrix4(hull.matrixWorld);
      const e = hull.matrixWorld.elements;
      _ax.set(e[0], e[1], e[2]); _ay.set(e[4], e[5], e[6]); _az.set(e[8], e[9], e[10]);
      const sx = _ax.length(), sy = _ay.length(), sz = _az.length();
      const hx = 0.5 * (_box.max.x - _box.min.x) * sx, hy = 0.5 * (_box.max.y - _box.min.y) * sy, hz = 0.5 * (_box.max.z - _box.min.z) * sz;
      u.uVehGroundC.value[n].set(_c.x, _c.y, _c.z, Math.max(hx, hz));
      u.uVehGroundX.value[n].copy(_ax).divideScalar(sx || 1);
      u.uVehGroundY.value[n].copy(_ay).divideScalar(sy || 1);
      u.uVehGroundZ.value[n].copy(_az).divideScalar(sz || 1);
      u.uVehGroundH.value[n].set(hx, hy, hz);
      n++;
    }
  }
  u.uVehGround.value = n;
}

/** The sky share a point s metres inside the footprint's nearest edge loses (the side-gap law above; W the half width). */
export function vehicleGroundOcclusionUnder(s: number, W: number, clearance = GROUND_AO_CLEARANCE_M): number {
  const sin2 = (h: number, d: number): number => { const dd = Math.max(d, 1e-3); return (h * h) / (h * h + dd * dd); };
  const ss = Math.max(0, Math.min(s, W));
  return Math.min(GROUND_AO_UNDER, 1 - 0.5 * sin2(clearance, ss) - 0.5 * sin2(clearance, 2 * W - ss));
}

/** The CPU twin of the GLSL: the occlusion a world point takes from one box (centre c, unit axes, half extents). */
export function vehicleGroundOcclusionAt(
  p: THREE.Vector3, c: THREE.Vector3, ax: THREE.Vector3, ay: THREE.Vector3, az: THREE.Vector3, half: THREE.Vector3,
): number {
  const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
  const lx = dx * ax.x + dy * ax.y + dz * ax.z, ly = dx * ay.x + dy * ay.y + dz * ay.z, lz = dx * az.x + dy * az.y + dz * az.z;
  const qx = Math.max(Math.abs(lx) - half.x, 0), qz = Math.max(Math.abs(lz) - half.z, 0);
  const h = half.y - ly; // the box's top over the point
  if (h <= 0 || ly < -half.y - 0.6) return 0; // above the box, or well below its foot (a slope under it)
  const d = Math.hypot(qx, qz);
  if (d <= 0) return vehicleGroundOcclusionUnder(Math.min(half.x - Math.abs(lx), half.z - Math.abs(lz)), Math.min(half.x, half.z));
  return Math.min(GROUND_AO_UNDER, vehicleGroundOcclusionBeside(d, h, Math.max(half.x, half.z)));
}

const f = (x: number): string => x.toFixed(4);

/**
 * The block the aerial fragment includes AFTER `CONTACT_SHADOW_GLSL` (it uses that block's cotSunVisOf, cotNormalAt
 * and ambient uniforms): `cotVehicleGroundShade(uv, P, alpha)` → the multiplier for a ground pixel's colour.
 */
export const VEHICLE_GROUND_OCCLUSION_GLSL = /* glsl */ `
    // 2026-10-03: the ground's sky under and beside the near hulls (vehicleGroundOcclusion.ts)
    uniform float uVehGround;
    uniform vec4 uVehGroundC[ ${GROUND_AO_MAX_HULLS} ];
    uniform vec3 uVehGroundX[ ${GROUND_AO_MAX_HULLS} ];
    uniform vec3 uVehGroundY[ ${GROUND_AO_MAX_HULLS} ];
    uniform vec3 uVehGroundZ[ ${GROUND_AO_MAX_HULLS} ];
    uniform vec3 uVehGroundH[ ${GROUND_AO_MAX_HULLS} ];
    float cotVehicleGroundOcclusion( vec3 P ) {
      float vis = 1.0;
      for ( int i = 0; i < ${GROUND_AO_MAX_HULLS}; i++ ) {
        if ( float( i ) >= uVehGround ) break;
        vec3 d = P - uVehGroundC[ i ].xyz;
        vec3 l = vec3( dot( d, uVehGroundX[ i ] ), dot( d, uVehGroundY[ i ] ), dot( d, uVehGroundZ[ i ] ) );
        vec3 hf = uVehGroundH[ i ];
        float h = hf.y - l.y;
        if ( h <= 0.0 || l.y < -hf.y - 0.6 ) continue;
        float dist = length( max( abs( l.xz ) - hf.xz, vec2( 0.0 ) ) );
        float occ;
        if ( dist <= 0.0 ) {
          // under the belly: the sky through the two side gaps (continuous with the side at the edge)
          float W = min( hf.x, hf.z );
          float si = clamp( min( hf.x - abs( l.x ), hf.z - abs( l.z ) ), 0.0, W );
          float c2 = ${f(GROUND_AO_CLEARANCE_M * GROUND_AO_CLEARANCE_M)};
          float g1 = max( si, 1e-3 ), g2 = max( 2.0 * W - si, 1e-3 );
          occ = min( ${f(GROUND_AO_UNDER)}, 1.0 - 0.5 * c2 / ( c2 + g1 * g1 ) - 0.5 * c2 / ( c2 + g2 * g2 ) );
        } else {
          float dd = max( dist, 0.05 );
          float s = h / sqrt( h * h + dd * dd );
          occ = min( ${f(GROUND_AO_UNDER)}, 0.5 * s * s * ${f(2 / Math.PI)} * atan( uVehGroundC[ i ].w / dd ) );
        }
        vis *= 1.0 - occ;
      }
      return 1.0 - vis;
    }
    float cotVehicleGroundShade( vec2 uv, vec3 P, float alpha, float dist ) {
      float occ = cotVehicleGroundOcclusion( P )
        * ( 1.0 - smoothstep( ${f(GROUND_AO_RANGE_M - GROUND_AO_FADE_M)}, ${f(GROUND_AO_RANGE_M)}, dist ) );
      if ( occ <= 0.003 ) return 1.0;
      float vis = cotSunVisOf( alpha );
      float ambShare = ${f(GROUND_AO_CARD_AMBIENT_SHARE)};
      if ( vis >= 0.0 ) {
        vec3 N = cotNormalAt( uv, P );
        float T = uContactSunLum * max( dot( N, uSunDir ), 0.0 ) * clamp( vis, 0.0, 1.0 );
        float A = mix( uContactAmb.y, uContactAmb.x, N.y * 0.5 + 0.5 ) + uContactAmb.z
          + uContactAmb.w * max( dot( N, uContactFillDir ), 0.0 );
        ambShare = A / max( T + A, 1e-4 );
      }
      return 1.0 - occ * ambShare;
    }
`;
