// src/world/hinterland/pipeline.ts — the Hinterland's CPU pipeline in one call (HL-1/HL-3, the horizons stream,
// 2026-10-13; B-architecture §3's data flow): the spec over the battlefield's ground → the field (terms 1, 2, 4, 5, 6)
// → a planning grid → the outland plan → the field with the plan levelled in (term 3) → the height pyramid. The worker,
// the envelope, the plan view and the receipts all run this one function, so they agree.
import { createHinterlandField, type HinterlandField, type HinterlandGround, type HinterlandReliefTerm } from './field.ts';
import { createLandformRelief } from './landforms.ts';
import { planHinterlandOutland, planInputsFrom, type HinterlandPlan } from './outland.ts';
import {
  bakeHinterlandPyramid, createCachedGround, HINTERLAND_LEVELS_DESKTOP, HINTERLAND_LEVELS_MOBILE, samplePyramid,
  type HinterlandLevelSpec, type HinterlandPyramid,
} from './pyramid.ts';
import type { HinterlandSpec } from './spec.ts';

/** The ground the pipeline continues: the height field, with its road exits past the edge. */
export interface HinterlandPipelineGround extends HinterlandGround {
  _roadExitLines?(): readonly { xs: ArrayLike<number>; zs: ArrayLike<number>; length: number }[];
}

export interface HinterlandBuild {
  spec: HinterlandSpec;
  field: HinterlandField;
  plan: HinterlandPlan;
  pyramid: HinterlandPyramid;
  /** Milliseconds per stage (field, planning grid, plan, bake). */
  ms: { field: number; planning: number; plan: number; bake: number; total: number };
}

/** The relief terms the field adds (term 4 landforms; term 5, the far forms, joins in HL-2). */
export type HinterlandTermFactory = (spec: HinterlandSpec, seed: number) => HinterlandReliefTerm | null;
const TERM_FACTORIES: HinterlandTermFactory[] = [createLandformRelief];
/** Register a relief term's factory (far.ts registers the far forms). */
export function registerHinterlandTerm(factory: HinterlandTermFactory): void {
  if (!TERM_FACTORIES.includes(factory)) TERM_FACTORIES.push(factory);
}

/** The planning grid: 24 m out to 3 km, enough for the sites' footprints, the roads' routes and the water. */
const PLANNING_LEVELS: readonly HinterlandLevelSpec[] = Object.freeze([{ texelM: 24, halfM: 3072 }, { texelM: 192, halfM: 15360 }]);

export function buildHinterland(
  spec: HinterlandSpec, seed: number, ground: HinterlandPipelineGround,
  { tier = 'desktop' as 'desktop' | 'mobile', levels = null as readonly HinterlandLevelSpec[] | null } = {},
): HinterlandBuild {
  const t0 = performance.now();
  const cached = createCachedGround(ground);
  const relief = TERM_FACTORIES.map((f) => f(spec, seed)).filter((t): t is HinterlandReliefTerm => t !== null);
  const base = createHinterlandField(spec, seed, cached, { relief });
  const t1 = performance.now();
  const planning = bakeHinterlandPyramid(base, PLANNING_LEVELS, { ground: cached });
  const t2 = performance.now();
  const exits = ground._roadExitLines ? ground._roadExitLines() : [];
  const plan = planHinterlandOutland(spec, seed, planInputsFrom(base, (x, z) => samplePyramid(planning, x, z), exits));
  const field = base.withFeatures(plan.features);
  const t3 = performance.now();
  const pyramid = bakeHinterlandPyramid(field, levels ?? (tier === 'mobile' ? HINTERLAND_LEVELS_MOBILE : HINTERLAND_LEVELS_DESKTOP), { ground: cached });
  const t4 = performance.now();
  return { spec, field, plan, pyramid, ms: { field: t1 - t0, planning: t2 - t1, plan: t3 - t2, bake: t4 - t3, total: t4 - t0 } };
}
