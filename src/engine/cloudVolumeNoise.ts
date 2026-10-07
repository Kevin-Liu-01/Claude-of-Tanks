/**
 * cloudVolumeNoise.ts — the cloud layer's noise volumes, baked on the GPU at load (Clouds 2.0, 2026-10-06).
 *
 * Three tileable textures, each one fragment pass per slice into a render target the layer then samples:
 *   shape       128³ R8 — the Perlin–Worley base shape of Schneider & Vos ("The Real-time Volumetric Cloudscapes of
 *               Horizon Zero Dawn", SIGGRAPH 2015): a gradient-noise fbm dilated by an inverted-Worley fbm, then
 *               remapped over a second, finer inverted-Worley fbm, so a mass is a cluster of round billows of a few
 *               sizes. One period spans CLOUD_SHAPE_PERIOD_M of world, three times a fair-weather cumulus, so the
 *               neighbouring clouds of one view never share a billow (the v1 volume's one-kilometre period stamped the
 *               same lobes on every cloud).
 *   detail      32³ R8 — an inverted-Worley fbm at four octaves that erodes the shape's edges (billows on the tops, wisps
 *               at the base).
 *   turbulence  128² RGBA8 — a divergence-free 2D field (the curl of a gradient-noise potential, Bridson, Hourihan &
 *               Nordenstam 2007) and a third, vertical channel, which the trace uses to drag the bases with the wind.
 * Every noise is integer-lattice periodic (the lattice coordinate is wrapped before it is hashed), so the volumes tile
 * in world space, and every value comes from a first-party integer hash: the bakes are deterministic (the same bytes on
 * a given GPU for every boot; the receipt pins the shader text and the browser fixture the statistics). The GLSL is
 * written here from the papers; nothing is copied from a reference implementation.
 */
import * as THREE from 'three';

/** Texel counts of the three bakes. */
export const CLOUD_SHAPE_TEXELS = 128;
export const CLOUD_DETAIL_TEXELS = 32;
export const CLOUD_TURBULENCE_TEXELS = 128;
/** The seed every bake hashes with (the weather fields keep their own). */
const CLOUD_VOLUME_SEED = 6406;

const QUAD_VERTEX = /* glsl */`
out vec2 vUv;
void main() {
	vUv = position.xy * 0.5 + 0.5;
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}`;

/**
 * The lattice noises (GLSL 3): an integer hash, tileable gradient noise and tileable Worley F1. `cells` is the lattice
 * count over one period of the unit cube; the lattice coordinate wraps by it before it is hashed.
 */
export const CLOUD_LATTICE_NOISE_GLSL = /* glsl */`
uint cotHash( ivec3 c, uint seed ) {
	uint h = uint( c.x ) * 0x8da6b343u ^ uint( c.y ) * 0xd8163841u ^ uint( c.z ) * 0xcb1ab31fu ^ seed * 0x165667b1u;
	h ^= h >> 15u; h *= 0x2c1b3c6du; h ^= h >> 12u; h *= 0x297a2d39u; h ^= h >> 15u;
	return h;
}
float cotHash01( ivec3 c, uint seed ) { return float( cotHash( c, seed ) >> 8u ) * ( 1.0 / 16777216.0 ); }
ivec3 cotWrap( ivec3 c, int n ) { return ( ( c % n ) + n ) % n; }
// the gradient at a lattice point: uniform on the sphere
vec3 cotGrad( ivec3 c, int n, uint seed ) {
	ivec3 w = cotWrap( c, n );
	float a = cotHash01( w, seed ) * 6.283185307179586;
	float b = cotHash01( w, seed + 7u ) * 2.0 - 1.0;
	float r = sqrt( max( 0.0, 1.0 - b * b ) );
	return vec3( r * cos( a ), r * sin( a ), b );
}
// tileable gradient noise, about -1..1
float cotPerlin( vec3 p, float cells, uint seed ) {
	vec3 q = p * cells;
	vec3 i = floor( q ), f = q - i;
	ivec3 c = ivec3( i );
	int n = int( cells );
	vec3 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
	float n000 = dot( cotGrad( c, n, seed ), f );
	float n100 = dot( cotGrad( c + ivec3( 1, 0, 0 ), n, seed ), f - vec3( 1.0, 0.0, 0.0 ) );
	float n010 = dot( cotGrad( c + ivec3( 0, 1, 0 ), n, seed ), f - vec3( 0.0, 1.0, 0.0 ) );
	float n110 = dot( cotGrad( c + ivec3( 1, 1, 0 ), n, seed ), f - vec3( 1.0, 1.0, 0.0 ) );
	float n001 = dot( cotGrad( c + ivec3( 0, 0, 1 ), n, seed ), f - vec3( 0.0, 0.0, 1.0 ) );
	float n101 = dot( cotGrad( c + ivec3( 1, 0, 1 ), n, seed ), f - vec3( 1.0, 0.0, 1.0 ) );
	float n011 = dot( cotGrad( c + ivec3( 0, 1, 1 ), n, seed ), f - vec3( 0.0, 1.0, 1.0 ) );
	float n111 = dot( cotGrad( c + ivec3( 1, 1, 1 ), n, seed ), f - vec3( 1.0, 1.0, 1.0 ) );
	float x00 = mix( n000, n100, u.x ), x10 = mix( n010, n110, u.x ), x01 = mix( n001, n101, u.x ), x11 = mix( n011, n111, u.x );
	return mix( mix( x00, x10, u.y ), mix( x01, x11, u.y ), u.z ) * 1.4;
}
// tileable fbm of the gradient noise: octaves double the lattice and halve the weight, normalised to about -1..1
float cotPerlinFbm( vec3 p, float cells, int octaves, uint seed ) {
	float sum = 0.0, w = 1.0, wsum = 0.0, c = cells;
	for ( int k = 0; k < 8; k++ ) {
		if ( k >= octaves ) break;
		sum += cotPerlin( p, c, seed + uint( k ) * 101u ) * w;
		wsum += w;
		w *= 0.5;
		c *= 2.0;
	}
	return sum / wsum;
}
// tileable Worley: the squared distance to the nearest feature point (one per lattice cell), in cell units, clamped to 1
float cotWorley( vec3 p, float cells, uint seed ) {
	vec3 q = p * cells;
	vec3 i = floor( q ), f = q - i;
	ivec3 c = ivec3( i );
	int n = int( cells );
	float d = 1.0;
	for ( int z = -1; z <= 1; z++ ) for ( int y = -1; y <= 1; y++ ) for ( int x = -1; x <= 1; x++ ) {
		ivec3 o = ivec3( x, y, z );
		ivec3 w = cotWrap( c + o, n );
		vec3 fp = vec3( cotHash01( w, seed ), cotHash01( w, seed + 3u ), cotHash01( w, seed + 5u ) );
		vec3 r = vec3( o ) + fp - f;
		d = min( d, dot( r, r ) );
	}
	return d;
}
`;

/** The shape bake: Perlin fbm dilated by an inverted-Worley fbm, remapped over a finer inverted-Worley fbm. */
const SHAPE_FRAGMENT = /* glsl */`
precision highp float;
precision highp int;
in vec2 vUv;
uniform float uLayer;
uniform uint uSeed;
out vec4 fragColor;
${CLOUD_LATTICE_NOISE_GLSL}
float remapf( float v, float lo, float hi ) { return ( v - lo ) / max( hi - lo, 1e-5 ); }
void main() {
	vec3 p = vec3( vUv, uLayer );
	// the base: gradient fbm at 8 cells (three octaves), in 0..1
	float perlin = clamp( cotPerlinFbm( p, 8.0, 3, uSeed ) * 0.5 + 0.5, 0.0, 1.0 );
	// billows: inverted Worley at 8, 24 and 48 cells, weighted toward the coarse
	vec3 w = vec3( 1.0 - cotWorley( p, 8.0, uSeed + 11u ), 1.0 - cotWorley( p, 24.0, uSeed + 12u ), 1.0 - cotWorley( p, 48.0, uSeed + 13u ) );
	float billow = dot( w, vec3( 0.625, 0.25, 0.125 ) );
	// the Perlin–Worley: the gradient noise dilated by the billows (a smooth mass made of round cells)
	float perlinWorley = billow + perlin * ( 1.0 - billow );
	// the finer billow fbm the mass is remapped over (four octaves, 8 to 64 cells): the low values carve the gaps
	vec4 v = vec4( 1.0 - cotWorley( p, 8.0, uSeed + 21u ), 1.0 - cotWorley( p, 16.0, uSeed + 22u ),
		1.0 - cotWorley( p, 32.0, uSeed + 23u ), 1.0 - cotWorley( p, 64.0, uSeed + 24u ) );
	float fine = dot( vec3( dot( v.xyz, vec3( 0.625, 0.25, 0.125 ) ), dot( v.yzw, vec3( 0.625, 0.25, 0.125 ) ), dot( v.zw, vec2( 0.75, 0.25 ) ) ), vec3( 0.625, 0.25, 0.125 ) );
	float shape = clamp( remapf( perlinWorley, fine - 1.0, 1.0 ), 0.0, 1.0 );
	fragColor = vec4( shape, 0.0, 0.0, 1.0 );
}`;

/** The detail bake: an inverted-Worley fbm (2 to 16 cells), billowy at its high values. */
const DETAIL_FRAGMENT = /* glsl */`
precision highp float;
precision highp int;
in vec2 vUv;
uniform float uLayer;
uniform uint uSeed;
out vec4 fragColor;
${CLOUD_LATTICE_NOISE_GLSL}
void main() {
	vec3 p = vec3( vUv, uLayer );
	vec4 v = vec4( 1.0 - cotWorley( p, 2.0, uSeed + 31u ), 1.0 - cotWorley( p, 4.0, uSeed + 32u ),
		1.0 - cotWorley( p, 8.0, uSeed + 33u ), 1.0 - cotWorley( p, 16.0, uSeed + 34u ) );
	float fbm = dot( vec3( dot( v.xyz, vec3( 0.625, 0.25, 0.125 ) ), dot( v.yzw, vec3( 0.625, 0.25, 0.125 ) ), dot( v.zw, vec2( 0.75, 0.25 ) ) ), vec3( 0.625, 0.25, 0.125 ) );
	fragColor = vec4( clamp( fbm, 0.0, 1.0 ), 0.0, 0.0, 1.0 );
}`;

/**
 * The turbulence bake: RG the curl of a tileable gradient-noise potential on the plane (divergence-free, so the base it
 * drags swirls instead of bunching), B a vertical push from a second potential, all mapped -1..1 to 0..1.
 */
const TURBULENCE_FRAGMENT = /* glsl */`
precision highp float;
precision highp int;
in vec2 vUv;
uniform uint uSeed;
uniform float uTexels;
out vec4 fragColor;
${CLOUD_LATTICE_NOISE_GLSL}
float potential( vec2 uv, uint seed ) { return cotPerlinFbm( vec3( uv, 0.5 / 4.0 ), 4.0, 3, seed ); }
void main() {
	float e = 1.0 / uTexels;
	float dx = potential( vUv + vec2( e, 0.0 ), uSeed + 41u ) - potential( vUv - vec2( e, 0.0 ), uSeed + 41u );
	float dy = potential( vUv + vec2( 0.0, e ), uSeed + 41u ) - potential( vUv - vec2( 0.0, e ), uSeed + 41u );
	vec2 curl = vec2( dy, -dx ) / ( 2.0 * e ) / 20.0;
	float up = cotPerlinFbm( vec3( vUv, 0.25 ), 8.0, 2, uSeed + 51u );
	fragColor = vec4( clamp( vec3( curl, up ) * 0.5 + 0.5, 0.0, 1.0 ), 1.0 );
}`;

/** The three baked textures (null until the bake ran). */
export interface CloudVolumeTextures {
  shape: THREE.Texture;
  detail: THREE.Texture;
  turbulence: THREE.Texture;
  /** The render targets that own them (disposed with the layer). */
  targets: readonly (THREE.WebGL3DRenderTarget | THREE.WebGLRenderTarget)[];
}

function volumeTarget(size: number, name: string): THREE.WebGL3DRenderTarget {
  const rt = new THREE.WebGL3DRenderTarget(size, size, size, {
    format: THREE.RedFormat, type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false,
  });
  const t = rt.texture;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  t.name = name;
  return rt;
}

/**
 * Bake the three textures with `renderer` (one draw per volume slice: 128 + 32 + 1). Restores the renderer's target and
 * state. Deterministic for a given seed.
 */
export function bakeCloudVolumes(renderer: THREE.WebGLRenderer, seed = CLOUD_VOLUME_SEED): CloudVolumeTextures {
  const camera = new THREE.Camera();
  const geometry = new THREE.PlaneGeometry(2, 2);
  const make = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>): THREE.RawShaderMaterial => new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: `precision highp float;\nin vec3 position;\n${QUAD_VERTEX}`,
    fragmentShader, uniforms, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  });
  const shapeMat = make(SHAPE_FRAGMENT, { uLayer: { value: 0 }, uSeed: { value: seed } });
  const detailMat = make(DETAIL_FRAGMENT, { uLayer: { value: 0 }, uSeed: { value: seed } });
  const turbMat = make(TURBULENCE_FRAGMENT, { uSeed: { value: seed }, uTexels: { value: CLOUD_TURBULENCE_TEXELS } });
  const mesh = new THREE.Mesh(geometry, shapeMat);
  mesh.frustumCulled = false;
  const shape = volumeTarget(CLOUD_SHAPE_TEXELS, 'clouds-shape-128');
  const detail = volumeTarget(CLOUD_DETAIL_TEXELS, 'clouds-detail-32');
  const turbulence = new THREE.WebGLRenderTarget(CLOUD_TURBULENCE_TEXELS, CLOUD_TURBULENCE_TEXELS, {
    format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
    generateMipmaps: false,
  });
  turbulence.texture.name = 'clouds-turbulence-128';
  turbulence.texture.colorSpace = THREE.NoColorSpace;
  const prevTarget = renderer.getRenderTarget();
  const prevFace = renderer.getActiveCubeFace(), prevMip = renderer.getActiveMipmapLevel();
  const prevXr = renderer.xr.enabled, prevToneMapping = renderer.toneMapping, prevAutoClear = renderer.autoClear;
  try {
    renderer.xr.enabled = false;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.autoClear = false;
    const slices = (rt: THREE.WebGL3DRenderTarget, material: THREE.RawShaderMaterial): void => {
      mesh.material = material;
      const n = rt.depth;
      for (let layer = 0; layer < n; layer++) {
        material.uniforms.uLayer.value = (layer + 0.5) / n;
        renderer.setRenderTarget(rt, layer);
        renderer.render(mesh, camera);
      }
    };
    slices(shape, shapeMat);
    slices(detail, detailMat);
    mesh.material = turbMat;
    renderer.setRenderTarget(turbulence);
    renderer.render(mesh, camera);
    renderer.setRenderTarget(prevTarget, prevFace, prevMip);
    // the volumes' mip chains, built once: a far cloud's footprint spans many texels, and sampled at level 0 its billows
    // aliased into a shimmer the history could not settle
    const gl = renderer.getContext() as WebGL2RenderingContext;
    for (const rt of [shape, detail]) {
      const glTexture = (renderer.properties.get(rt.texture) as { __webglTexture?: WebGLTexture }).__webglTexture;
      if (!glTexture) continue;
      renderer.state.bindTexture(gl.TEXTURE_3D, glTexture);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.generateMipmap(gl.TEXTURE_3D);
      renderer.state.unbindTexture();
      rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
    }
  } finally {
    renderer.xr.enabled = prevXr;
    renderer.toneMapping = prevToneMapping;
    renderer.autoClear = prevAutoClear;
    renderer.setRenderTarget(prevTarget, prevFace, prevMip);
    geometry.dispose();
    shapeMat.dispose();
    detailMat.dispose();
    turbMat.dispose();
  }
  return { shape: shape.texture, detail: detail.texture, turbulence: turbulence.texture, targets: [shape, detail, turbulence] };
}
