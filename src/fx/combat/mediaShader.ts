/**
 * combat/mediaShader.ts — the lit, deforming, wind-borne media puff (combat-fx lane, 2026-10-05).
 *
 * One instanced camera-facing card per puff, GPU-animated like the battle pools (particles.ts): the CPU writes a
 * puff's attributes once at emit time and a shared clock ages it. What changes against the battle puff:
 *
 * MOTION — a puff relaxes from its launch velocity toward a TARGET velocity with its own drag k:
 *   target = wind * windK + up * rise            (the scene's wind; a buoyant or settling terminal speed)
 *   x(t)   = x0 + target t + (v0 - target)(1 - e^-kt)/k + up * grav t^2 / 2
 * so a blast puff shoots out, stalls, then rises and drifts downwind, and dense soil ejecta (grav < 0) climbs, stalls
 * and falls back. The battle pools share one drag per pool and have no wind term.
 *
 * SHAPE — size grows on an ease-out curve (fast early expansion), the card squashes along world-up as it ages
 * (ground dust spreads wide and low), fast puffs smear along their screen-space velocity, and the texture is
 * domain-warped by a drifting noise field whose amplitude grows with age, so a puff's silhouette rolls and tears
 * instead of a rigid sprite scaling. The sheets (mediaAtlas.ts) are lobed clusters that billow open over 16 frames.
 *
 * LIGHT — the sheets carry dome normals and thickness. Each texel is lit by the scene's own rig
 * (scene.userData.lightRig: sun colour x intensity, hemisphere sky/ground), with wrap diffuse, thick-core
 * self-shadowing, a silver lining on thin texels when the sun is behind the smoke, and the pooled explosion light
 * (fire-lit undersides). A puff may carry HEAT: dense pockets glow on a blackbody ramp and cool on the puff's own
 * rate — the fireball's fire-in-smoke and the muzzle gas that is still burning in the first frames.
 *
 * Contracts shared with particles.ts (duplicated, not imported, so this layer never edits the battle pools):
 * the late-FX soft-depth fade against the copied scene depth, the lens near-fade, and three's fog uniforms.
 */

const FOG_PARS_V = `
#ifdef USE_FOG
  varying float vFogDepth;
#endif
`;
const FOG_PARS_F = `
#ifdef USE_FOG
  uniform vec3 fogColor;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  varying float vFogDepth;
#endif
`;
const FOG_FACTOR_F = `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( -fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
#else
  float fogFactor = 0.0;
#endif
`;

/** Per-puff attribute layout (itemSize 4 each). */
export const MEDIA_LAYOUT = Object.freeze({
  aPB: 4, // origin.xyz, birth (s)
  aVL: 4, // launch velocity.xyz, life (s)
  aSR: 4, // size0, size1, rot0, rotVel
  aC0: 4, // albedo at birth (linear rgb), peak alpha
  aC1: 4, // albedo at death (linear rgb), erosion 0 (soft falloff) .. 1 (torn eroding front)
  aDY: 4, // drag k, terminal rise (m/s, + up), wind coupling, ballistic gravity (m/s^2, + up)
  aSH: 4, // grow exponent, flatten (end-of-life vertical squash), fade-in (s), fade-out start (life fraction)
  aMS: 4, // seed, warp amplitude, velocity smear (per m/s), scatter (thin-edge translucency)
  aHT: 4, // heat at birth, cooling rate (1/s), hot-core threshold, emissive gain
});

export const MEDIA_VERT = /* glsl */ `
attribute vec4 aPB;
attribute vec4 aVL;
attribute vec4 aSR;
attribute vec4 aC0;
attribute vec4 aC1;
attribute vec4 aDY;
attribute vec4 aSH;
attribute vec4 aMS;
attribute vec4 aHT;
uniform float uTime;
uniform vec3 uWind;
uniform vec3 uSunDir;
uniform vec4 uFirePos;   // xyz, range (m)
uniform vec3 uFireCol;   // irradiance scale of the explosion light (colour x intensity, gained)
uniform vec2 uNearFade;
uniform vec4 uGradeV;    // diagnostic grade: size scale, cooling scale (1, 1 in play)
varying vec2 vUv;
varying vec2 vCellA;
varying vec2 vCellB;
varying float vFMix;
varying vec4 vColor;
varying float vT;
varying vec3 vLight;     // sun direction in the card's frame (x right, y up, z toward the camera)
varying vec3 vUpL;       // world up in the card's frame
varying vec3 vFire;      // fire-light irradiance at the puff
varying vec4 vMisc;      // erosion, scatter, warp amplitude (age-scaled), heat now
varying vec4 vMisc2;     // noise offset (2), hot-core threshold, emissive gain
varying float vParticleDepth;
${FOG_PARS_V}
float nearFadeM( vec3 wpos ) {
  return smoothstep( uNearFade.x, uNearFade.y, distance( wpos, cameraPosition ) );
}
void main() {
  float life = aVL.w;
  float age = uTime - aPB.w;
  if ( life <= 0.0 || age < 0.0 || age > life ) {
    vUv = uv; vCellA = vec2( 0.0 ); vCellB = vec2( 0.0 ); vFMix = 0.0;
    vColor = vec4( 0.0 ); vT = 0.0; vLight = vec3( 0.0, 0.0, 1.0 ); vUpL = vec3( 0.0, 1.0, 0.0 );
    vFire = vec3( 0.0 ); vMisc = vec4( 0.0 ); vMisc2 = vec4( 0.0 ); vParticleDepth = 1e9;
    gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
    #ifdef USE_FOG
      vFogDepth = 1.0;
    #endif
    return;
  }
  float t = age / life;
  vT = t;
  // --- motion: relax toward wind + terminal rise, plus a ballistic term
  float k = max( aDY.x, 1e-3 );
  vec3 target = uWind * aDY.z + vec3( 0.0, aDY.y, 0.0 );
  float ek = exp( -k * age );
  vec3 center = aPB.xyz + target * age + ( aVL.xyz - target ) * ( ( 1.0 - ek ) / k )
    + vec3( 0.0, 0.5 * aDY.w * age * age, 0.0 );
  vec3 vcur = target + ( aVL.xyz - target ) * ek + vec3( 0.0, aDY.w * age, 0.0 );
  // --- shape: ease-out growth, angular drag on the spin
  float grow = 1.0 - pow( 1.0 - t, max( aSH.x, 0.2 ) );
  float size = mix( aSR.x, aSR.y, grow ) * uGradeV.x;
  float ang = aSR.z + aSR.w * ( 1.0 - exp( -0.8 * age ) ) / 0.8;
  float ca = cos( ang ), sa = sin( ang );
  vec3 camRight = vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] );
  vec3 camUp    = vec3( viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1] );
  vec3 camBack  = vec3( viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2] );
  vec2 corner = vec2( position.x * ca - position.y * sa, position.x * sa + position.y * ca ) * size;
  // flatten along world-up as seen on the card (ground dust spreads wide and low; from straight above it stays round)
  vec2 up2 = vec2( camRight.y, camUp.y );
  float upL = length( up2 );
  float flatNow = mix( 1.0, aSH.y, smoothstep( 0.0, 0.6, t ) );
  if ( upL > 0.05 ) {
    vec2 ud = up2 / upL;
    corner += ud * dot( corner, ud ) * ( flatNow - 1.0 ) * upL;
  }
  // velocity smear: a fast puff stretches along its screen-space motion (ejecta spikes, spray sheets)
  vec2 v2 = vec2( dot( vcur, camRight ), dot( vcur, camUp ) );
  float sp = length( v2 );
  if ( aMS.z > 0.0 && sp > 0.4 ) {
    vec2 vd = v2 / sp;
    float st = 1.0 + min( sp * aMS.z, 2.6 );
    corner += vd * dot( corner, vd ) * ( st - 1.0 );
    // keep the smeared card's area roughly constant across its width
    vec2 pd = vec2( -vd.y, vd.x );
    corner -= pd * dot( corner, pd ) * ( 1.0 - inversesqrt( st ) );
  }
  vec3 wpos = center + camRight * corner.x + camUp * corner.y;
  // --- flipbook (16 frames over life, cross-faded); row 0 sits at the bottom of the sheet
  float ff = t * 15.0;
  float f0 = floor( ff );
  float f1 = min( f0 + 1.0, 15.0 );
  vFMix = ff - f0;
  vCellA = vec2( mod( f0, 4.0 ), floor( f0 / 4.0 ) ) * 0.25;
  vCellB = vec2( mod( f1, 4.0 ), floor( f1 / 4.0 ) ) * 0.25;
  // --- lighting frame: the rotated card axes
  vec3 rightC = camRight * ca + camUp * sa;
  vec3 upC = -camRight * sa + camUp * ca;
  vLight = vec3( dot( uSunDir, rightC ), dot( uSunDir, upC ), dot( uSunDir, camBack ) );
  vUpL = vec3( rightC.y, upC.y, camBack.y );
  // fire light (the pooled explosion light) at the puff centre: inverse square with a smooth range window
  vec3 dF = center - uFirePos.xyz;
  float d2 = max( dot( dF, dF ), 1.0 );
  float win = clamp( 1.0 - d2 / max( uFirePos.w * uFirePos.w, 1.0 ), 0.0, 1.0 );
  vFire = uFireCol * ( win * win / d2 );
  // --- colour and alpha: per-puff fade-in (s) and fade-out start
  float fadeIn = aSH.z > 0.0 ? smoothstep( 0.0, aSH.z, age ) : 1.0;
  float fadeOut = 1.0 - smoothstep( aSH.w, 1.0, t );
  float alpha = aC0.w * fadeIn * fadeOut * nearFadeM( wpos );
  vColor = vec4( mix( aC0.rgb, aC1.rgb, smoothstep( 0.0, 1.0, t ) ), alpha );
  float heat = aHT.x * exp( -aHT.y * uGradeV.y * age );
  vMisc = vec4( aC1.w, aMS.w, aMS.y * ( 0.35 + 0.65 * t ), heat );
  vMisc2 = vec4( fract( aMS.x * 13.17 ) + age * 0.045, fract( aMS.x * 7.31 ) - age * 0.03, aHT.z, aHT.w );
  vUv = uv;
  vec4 mvPosition = viewMatrix * vec4( wpos, 1.0 );
  vParticleDepth = -mvPosition.z;
  #ifdef USE_FOG
    vFogDepth = -mvPosition.z;
  #endif
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const MEDIA_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uNoise;
uniform vec3 uSunCol;     // sun colour x intensity / pi, gained
uniform vec3 uSkyCol;     // hemisphere sky pole (irradiance / pi, gained)
uniform vec3 uGroundCol;  // hemisphere ground pole
uniform vec2 uGrade;      // media alpha, emissive gain (diagnostic grade; 1, 1)
uniform sampler2D uSceneDepth;
uniform vec2 uSoftViewport;
uniform float uCameraNear;
uniform float uCameraFar;
varying vec2 vUv;
varying vec2 vCellA;
varying vec2 vCellB;
varying float vFMix;
varying vec4 vColor;
varying float vT;
varying vec3 vLight;
varying vec3 vUpL;
varying vec3 vFire;
varying vec4 vMisc;
varying vec4 vMisc2;
varying float vParticleDepth;
${FOG_PARS_F}
float softDepthFadeM() {
  vec2 suv = gl_FragCoord.xy / max( uSoftViewport, vec2( 1.0 ) );
  float rawDepth = texture2D( uSceneDepth, suv ).x;
  float sceneDepthM = -( uCameraNear * uCameraFar ) / ( ( uCameraFar - uCameraNear ) * rawDepth - uCameraFar );
  float gapM = sceneDepthM - vParticleDepth;
  float featherM = clamp( vParticleDepth * 0.006, 0.7, 4.0 );
  return smoothstep( 0.0, featherM, gapM );
}
vec3 blackbody( float h ) {
  // dull red -> orange -> yellow -> white-hot (linear, unscaled)
  vec3 c = mix( vec3( 0.45, 0.04, 0.0 ), vec3( 1.0, 0.32, 0.03 ), smoothstep( 0.05, 0.45, h ) );
  c = mix( c, vec3( 1.0, 0.66, 0.2 ), smoothstep( 0.4, 0.75, h ) );
  return mix( c, vec3( 1.0, 0.93, 0.74 ), smoothstep( 0.72, 1.0, h ) );
}
void main() {
  #ifdef MEDIA_LITE
    // the mobile tier: no warp fetch and the nearer flipbook frame only (two fewer texture reads per fragment)
    vec2 uv = clamp( vUv, 0.01, 0.99 ) * 0.25;
    vec4 s = texture2D( uMap, ( vFMix < 0.5 ? vCellA : vCellB ) + uv );
  #else
    // domain warp: a drifting low-frequency field pushes the silhouette around, harder as the puff ages
    // (the warp fades out toward the card's rim, so nothing is pushed into the octagon's cut corners)
    vec2 w = ( texture2D( uNoise, vUv * 0.85 + vMisc2.xy ).rg - 0.5 )
      * ( 1.0 - smoothstep( 0.27, 0.4, length( vUv - 0.5 ) ) );
    vec2 uv = clamp( vUv + w * vMisc.z, 0.01, 0.99 ) * 0.25;
    vec4 s = mix( texture2D( uMap, vCellA + uv ), texture2D( uMap, vCellB + uv ), vFMix );
  #endif
  float d = s.a;
  // coverage: soft media thin out from the rim; eroding media tear apart from their thin texels inward
  float er = vT * 0.34;
  float soft = pow( d, 1.0 + vT * 0.8 );
  float torn = smoothstep( er, er + 0.5 + 0.35 * vT, d );
  float a = mix( soft, torn, vMisc.x ) * vColor.a * uGrade.x;
  if ( a < 0.004 ) discard;
  a *= softDepthFadeM();
  if ( a < 0.004 ) discard;
  // dome normal in the card frame
  vec2 nxy = s.rg * 2.0 - 1.0;
  vec3 n = vec3( nxy, sqrt( max( 0.0, 1.0 - dot( nxy, nxy ) ) ) );
  float thick = s.b;
  vec3 L = vLight;
  float ndl = dot( n, L );
  float diff = clamp( ( ndl + 0.42 ) / 1.42, 0.0, 1.0 );
  float backlit = clamp( -L.z, 0.0, 1.0 );
  // thick cores shade themselves, harder when the sun stands behind the smoke
  float selfShadow = 1.0 - ( 0.30 + 0.38 * backlit ) * thick;
  // silver lining: thin texels transmit the sun when it is behind the smoke
  float silver = pow( backlit, 2.5 ) * ( 1.0 - thick ) * ( 0.35 + 0.65 * vMisc.y );
  float upN = clamp( dot( n, vUpL ) * 0.5 + 0.5, 0.0, 1.0 );
  vec3 amb = mix( uGroundCol, uSkyCol, upN );
  // fire light reaches the faces turned down toward the blaze hardest (fire-lit undersides)
  vec3 fireLit = vFire * ( 0.45 + 0.55 * ( 1.0 - upN ) );
  vec3 albedo = vColor.rgb;
  vec3 col = albedo * ( uSunCol * ( diff * selfShadow + silver * 1.6 ) + amb * ( 0.85 + 0.3 * vMisc.y ) + fireLit );
  // heat: the dense pockets burn hottest and longest, the thin rim cools first (fire inside its own smoke). The
  // emission falls steeply with the local temperature (~h^2.5, Stefan-Boltzmann-like), so a cooling pocket dims to a
  // dull ember and then to soot — never a uniform glowing disc.
  float heat = vMisc.w;
  if ( heat > 0.002 ) {
    float pocket = smoothstep( vMisc2.z - 0.22, vMisc2.z + 0.3, d * ( 0.7 + 0.6 * thick ) );
    float h = clamp( heat * mix( 0.12, 1.0, pocket ), 0.0, 1.0 );
    vec3 glow = blackbody( h ) * ( 12.0 * h * h * sqrt( h ) ) * vMisc2.w * uGrade.y;
    col = col * ( 1.0 - 0.9 * smoothstep( 0.18, 0.7, h ) ) + glow;
  }
  ${FOG_FACTOR_F}
  #ifdef USE_FOG
    col = mix( col, fogColor, fogFactor );
  #endif
  gl_FragColor = vec4( col, a );
}
`;
