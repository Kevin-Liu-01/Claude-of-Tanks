import type { RuntimeValue } from '../runtimeTypes.ts';
export interface StructureTintTarget {
  setRGB(r: number, g: number, b: number): RuntimeValue;
}

export interface StructureWindowStyle {
  readonly glassColor: number;
  readonly glassRoughness: number;
  readonly glassMetalness: number;
  readonly glassClearcoat: number;
  readonly glassClearcoatRoughness: number;
  readonly glassEnvMapIntensity: number;
  readonly curtainColor: number;
  readonly curtainEmissive: number;
  readonly curtainEmissiveIntensity: number;
}

/** Shared window palette kept below the post-processing highlight shoulder. */
export const STRUCTURE_WINDOW_STYLE: Readonly<StructureWindowStyle> = Object.freeze({
  glassColor: 0x25323a,
  glassRoughness: 0.35,
  glassMetalness: 0.12,
  glassClearcoat: 0.32,
  glassClearcoatRoughness: 0.28,
  glassEnvMapIntensity: 1.0,
  curtainColor: 0x756f61,
  curtainEmissive: 0x2b190d,
  curtainEmissiveIntensity: 0.08,
});

export const RUINSPIRES_WINDOW_STYLE: Readonly<StructureWindowStyle> = Object.freeze({
  glassColor: 0x12191d,
  glassRoughness: 0.78,
  glassMetalness: 0.02,
  glassClearcoat: 0.04,
  glassClearcoatRoughness: 0.78,
  glassEnvMapIntensity: 0.22,
  curtainColor: 0x302c25,
  curtainEmissive: 0x090604,
  curtainEmissiveIntensity: 0.02,
});

export function resolveStructureWindowStyle(mapId: string): Readonly<StructureWindowStyle> {
  return mapId === 'ruinspires' ? RUINSPIRES_WINDOW_STYLE : STRUCTURE_WINDOW_STYLE;
}

export function resolveRowhouseTrimBucket(
  wallBucket: string,
  preferStone: boolean,
  lowContrast: boolean,
): 'stone' | 'plaster' {
  if (lowContrast) return 'stone';
  return preferStone || wallBucket === 'plaster' ? 'stone' : 'plaster';
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function hashStructureInstance(kind: string, index: number, worldSeed: number): number {
  let hash = (2166136261 ^ (worldSeed >>> 0) ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  for (let i = 0; i < kind.length; i++) {
    hash ^= kind.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  return Math.imul(hash, 0x846ca68b) >>> 0;
}

/**
 * Write a restrained, deterministic diffuse multiplier for one instanced
 * structure. The material, geometry and shader remain shared; only the
 * existing InstancedMesh color attribute varies. This breaks up repeated
 * prefab rows without introducing another draw call or frame-loop update.
 */
export function writeStructureInstanceTint(
  target: StructureTintTarget,
  kind: string,
  index: number,
  worldSeed: number,
  strength = 0.065,
): StructureTintTarget {
  if (!kind || !Number.isInteger(index) || index < 0 || !Number.isFinite(worldSeed)) {
    throw new TypeError('structure tint requires a family, non-negative index, and finite seed');
  }
  const boundedStrength = clamp(strength, 0, 0.12);
  const hash = hashStructureInstance(kind, index, worldSeed);
  const value = (((hash & 0x3ff) / 0x3ff) - 0.5) * 2 * boundedStrength;
  const warmth = ((((hash >>> 10) & 0x3ff) / 0x3ff) - 0.5) * boundedStrength;
  const coolness = ((((hash >>> 20) & 0x3ff) / 0x3ff) - 0.5) * boundedStrength;
  target.setRGB(
    clamp(1 + value + warmth * 0.42, 0.86, 1.12),
    clamp(1 + value - warmth * 0.18, 0.86, 1.12),
    clamp(1 + value + coolness * 0.36, 0.86, 1.12),
  );
  return target;
}
