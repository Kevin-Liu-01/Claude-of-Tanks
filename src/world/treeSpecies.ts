import type { RuntimeValue } from '../runtimeTypes.ts';
export const TREE_SPECIES = Object.freeze([
  'pine',
  'spruce',
  'fir',
  'cedar',
  'cypress',
  'oak',
  'poplar',
  'willow',
  'acacia',
  'eucalyptus',
  'palm',
  'birch',
  'aspen',
] as const);

export type TreeSpecies = (typeof TREE_SPECIES)[number];

export interface TreeArchetype {
  family: 'conifer' | 'broadleaf' | 'palm' | 'birch';
  leanMaxRad: number;
  trunkRadiusM: number;
  trunkHeightM: number;
  canopyCenterM: number;
  canopyRadiusM: number;
  fallHeightM: number;
  fallRadiusM: number;
  rootDecalRadiusM: number;
}

/**
 * Shared visual/physical proportions for every procedural tree archetype.
 * The renderer uses these values for deterministic instance variation while
 * collision, shell hits, and hinge-topple use the same trunk dimensions.
 */
export const TREE_ARCHETYPES: Readonly<Record<TreeSpecies, Readonly<TreeArchetype>>> =
  Object.freeze({
    pine: Object.freeze({
      family: 'conifer', leanMaxRad: 0.05, trunkRadiusM: 0.24, trunkHeightM: 3.2,
      canopyCenterM: 4.5, canopyRadiusM: 2.5, fallHeightM: 6.8,
      fallRadiusM: 0.15, rootDecalRadiusM: 1.3,
    }),
    spruce: Object.freeze({
      family: 'conifer', leanMaxRad: 0.035, trunkRadiusM: 0.22, trunkHeightM: 3.8,
      canopyCenterM: 5.6, canopyRadiusM: 2.1, fallHeightM: 8.1,
      fallRadiusM: 0.14, rootDecalRadiusM: 1.25,
    }),
    fir: Object.freeze({
      family: 'conifer', leanMaxRad: 0.04, trunkRadiusM: 0.28, trunkHeightM: 3.4,
      canopyCenterM: 4.8, canopyRadiusM: 2.7, fallHeightM: 7.0,
      fallRadiusM: 0.17, rootDecalRadiusM: 1.45,
    }),
    cedar: Object.freeze({
      family: 'conifer', leanMaxRad: 0.055, trunkRadiusM: 0.30, trunkHeightM: 3.0,
      canopyCenterM: 4.2, canopyRadiusM: 3.0, fallHeightM: 6.4,
      fallRadiusM: 0.18, rootDecalRadiusM: 1.55,
    }),
    cypress: Object.freeze({
      family: 'conifer', leanMaxRad: 0.03, trunkRadiusM: 0.18, trunkHeightM: 4.1,
      canopyCenterM: 5.4, canopyRadiusM: 1.35, fallHeightM: 7.8,
      fallRadiusM: 0.12, rootDecalRadiusM: 0.95,
    }),
    oak: Object.freeze({
      family: 'broadleaf', leanMaxRad: 0.05, trunkRadiusM: 0.32, trunkHeightM: 3.2,
      canopyCenterM: 4.35, canopyRadiusM: 3.0, fallHeightM: 6.8,
      fallRadiusM: 0.17, rootDecalRadiusM: 1.8,
    }),
    poplar: Object.freeze({
      family: 'broadleaf', leanMaxRad: 0.035, trunkRadiusM: 0.23, trunkHeightM: 4.2,
      canopyCenterM: 5.6, canopyRadiusM: 1.8, fallHeightM: 8.0,
      fallRadiusM: 0.14, rootDecalRadiusM: 1.15,
    }),
    willow: Object.freeze({
      family: 'broadleaf', leanMaxRad: 0.07, trunkRadiusM: 0.38, trunkHeightM: 2.5,
      canopyCenterM: 3.55, canopyRadiusM: 3.7, fallHeightM: 6.2,
      fallRadiusM: 0.20, rootDecalRadiusM: 2.0,
    }),
    acacia: Object.freeze({
      family: 'broadleaf', leanMaxRad: 0.08, trunkRadiusM: 0.30, trunkHeightM: 3.4,
      canopyCenterM: 4.25, canopyRadiusM: 3.6, fallHeightM: 6.4,
      fallRadiusM: 0.17, rootDecalRadiusM: 1.75,
    }),
    eucalyptus: Object.freeze({
      family: 'broadleaf', leanMaxRad: 0.065, trunkRadiusM: 0.25, trunkHeightM: 4.8,
      canopyCenterM: 6.1, canopyRadiusM: 2.0, fallHeightM: 8.8,
      fallRadiusM: 0.15, rootDecalRadiusM: 1.25,
    }),
    palm: Object.freeze({
      family: 'palm', leanMaxRad: 0.10, trunkRadiusM: 0.26, trunkHeightM: 5.2,
      canopyCenterM: 6.1, canopyRadiusM: 3.1, fallHeightM: 7.4,
      fallRadiusM: 0.18, rootDecalRadiusM: 1.8,
    }),
    birch: Object.freeze({
      family: 'birch', leanMaxRad: 0.045, trunkRadiusM: 0.18, trunkHeightM: 4.0,
      canopyCenterM: 4.8, canopyRadiusM: 2.4, fallHeightM: 6.8,
      fallRadiusM: 0.12, rootDecalRadiusM: 1.3,
    }),
    aspen: Object.freeze({
      family: 'birch', leanMaxRad: 0.05, trunkRadiusM: 0.16, trunkHeightM: 4.6,
      canopyCenterM: 5.5, canopyRadiusM: 1.9, fallHeightM: 7.6,
      fallRadiusM: 0.11, rootDecalRadiusM: 1.1,
    }),
  });

export function isTreeSpecies(value: RuntimeValue): value is TreeSpecies {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TREE_ARCHETYPES, value);
}
