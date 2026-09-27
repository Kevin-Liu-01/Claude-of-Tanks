/** The outland's last tree casters end at 1050 m. Farther out, CSM samples can
 * project the edge of a cascade as a hard rectangle across the open sea/strand.
 * Preserve every nearby caster, then fade reception over the empty outer coast.
 * This is per receiver; it never changes the shared lighting program or budget. */
export function fadeDistantCoastShadows(fragment: string, worldPosition: string): string {
  const anchor = '#include <shadowmap_pars_fragment>';
  if (!fragment.includes(anchor)) throw new Error('Missing coast shadow shader anchor');
  return fragment.replace(anchor, `${anchor}
#ifdef USE_SHADOWMAP
#if defined(SHADOWMAP_TYPE_PCF)
#define COAST_SHADOW_SAMPLER sampler2DShadow
#else
#define COAST_SHADOW_SAMPLER sampler2D
#endif
float coastShadow(COAST_SHADOW_SAMPLER shadowMap, vec2 mapSize, float intensity, float bias, float radius, vec4 coord) {
  float shadow = getShadow(shadowMap, mapSize, intensity, bias, radius, coord);
  float distanceFromCenter = max(abs(${worldPosition}.x), abs(${worldPosition}.z));
  return mix(shadow, 1.0, smoothstep(1100.0, 1400.0, distanceFromCenter));
}
#undef COAST_SHADOW_SAMPLER
#define getShadow coastShadow
#endif
`);
}
