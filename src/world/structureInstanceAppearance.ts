export interface StructureTintTarget {
  setRGB(r: number, g: number, b: number): unknown;
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
