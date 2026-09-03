// Baked structures that participate in the same collision certification as
// the procedural structure catalog. Keeping their authored scaling here makes
// runtime construction and offline QA consume one source of truth.

export const SOURCED_STRUCTURE_TYPES = {
  sandbagbig: {
    model: 'sack_trench_quaternius', targetH: 1.35, sink: 0.12, r: 2.0, h: 1.35,
  },
  sandbagsmall: {
    model: 'sack_trench_small_quaternius', targetH: 1.05, sink: 0.1, r: 1.7, h: 1.05,
  },
  sandbagwall: {
    model: 'sandbags_jtoastie', targetH: 1.0, sink: 0.1, r: 1.5, h: 1.0,
  },
} as const;

export type SourcedStructureType = keyof typeof SOURCED_STRUCTURE_TYPES;
