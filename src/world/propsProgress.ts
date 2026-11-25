// (mp-fixes-277) The props build's place on the loading bar. Its fine slices are not known before it runs (verdant: 283
// progress steps warm, 363 on a cold 4x-CPU entry, where prints the paint worker had not finished are painted in line), so
// a fixed count filled the bar's props range early and held it (slot11: "Placing structures" 15.5 s). The bar follows
// propsProgress instead, and the loader names the part of the build under way (PROPS_PHASE_LABELS).

/** (mp-fixes-277) The props bar's scale: a fine build reports propsProgress(steps) out of it. */
export const PROPS_PROGRESS_SCALE = 1000;
/** The progress steps of a usual fine build (verdant 283 warm); the bar is linear to 85 % there. */
const PROPS_PROGRESS_USUAL = 280;
/**
 * (mp-fixes-277) A fine props build's progress after `steps` progress steps, out of PROPS_PROGRESS_SCALE: linear to 85 % at
 * the usual count, then a tail that approaches the end and never reaches it, so a build longer than usual keeps moving.
 */
export function propsProgress(steps: number): number {
  const fraction = steps <= PROPS_PROGRESS_USUAL
    ? 0.85 * steps / PROPS_PROGRESS_USUAL
    : 0.85 + 0.15 * (1 - Math.exp(-3 * (steps - PROPS_PROGRESS_USUAL) / PROPS_PROGRESS_USUAL));
  return Math.min(PROPS_PROGRESS_SCALE - 1, Math.round(PROPS_PROGRESS_SCALE * fraction));
}
/**
 * (mp-fixes-277) The loader's names for the parts of a props build, in build order; a part begins at the first slice
 * whose stage it names (propsPhaseOf) and the label never steps back. Each is in battleLoad.ts STAGE_LABEL_KEYS and
 * worldBuildCoordinator.ts STAGE_KEYS (timed as 'props').
 */
export const PROPS_PHASE_LABELS = ['Placing structures', 'Raising landmarks', 'Setting rocks', 'Dressing the battlefield'] as const;
const PROPS_PHASE_STAGES: ReadonlyArray<RegExp> = [
  /^(landmarks|civic-area|boundary-walls|village-well|settlement-dressing)$/,
  /^(rock-(forms|variants|colliders|beds|instances)|tactical-outcrops|surface-rocks|embedded-rocks|boulder-outcrops)$/,
  /^(field-haystacks|field-logs-and-stumps|pillbox-footprint|wreck-.+)$/,
];
/** The part of a props build a slice's stage begins (index into PROPS_PHASE_LABELS), 0 for a stage that begins none. */
export function propsPhaseOf(stage: string): number {
  for (let index = PROPS_PHASE_STAGES.length - 1; index >= 0; index--) if (PROPS_PHASE_STAGES[index].test(stage)) return index + 1;
  return 0;
}
/**
 * (mp-fixes-277, slot12) The loader's name for a wreck in bake: its place among the map's planned bakes (the prefetch's
 * plan; a bake past the plan names its place alone). A stage label carries a count after " · " (battleLoad.ts translates
 * the name before it, worldBuildCoordinator.ts times it under that name).
 */
export const PROPS_WRECK_LABEL = 'Placing wrecks';
export function propsWreckLabel(place: number, planned: number): string {
  return `${PROPS_WRECK_LABEL} · ${planned >= place ? `${place}/${planned}` : place}`;
}
