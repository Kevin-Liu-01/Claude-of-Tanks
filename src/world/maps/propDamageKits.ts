// src/world/maps/propDamageKits.ts — the scenery lane's prop damage kit (b39; docs/DESTRUCTION.md §16.5): what each
// destructible prop breaks into — its fracture slots, in its own bucket and its own colours — and the debris a blow
// throws from them along its direction. The type table's `broken` builders are the broken states (inhabitKit,
// sceneryKit, haystackKit, civilianVehicleKit); this is the burst that goes with them.
//
// A prop's slots are its kind's materials (how each breaks: KIND_MATERIALS, else its `mat`'s default, §16.5) in its
// type's bucket. A vertex-coloured prop's tints are read from its intact geometry at `describe`: its colours binned by
// hue and lightness, weighted by triangle area, the largest bins in order — a canvas stall's planks and canvas, a
// tomb's stucco and its tiles, a car's paint and its glass. A textured prop's tint is white (its texture is its look).
// Every draw from `damageRng(seed)`: the same prop, cause and direction throws the same pieces on every peer.
import type { BufferGeometry } from 'three';
import {
  damageRng, damageSeed, registerPropDamageKit,
  type DamagePieceWriter, type DebrisShape, type FractureMaterial, type FractureSlot, type PropDamageAnatomy,
  type PropDamageKit, type PropDescribeInput, type Rgb,
} from '../destructionKit.ts';
import type { DestructionCause } from '../../sim/destructionEvents.ts';

/** The kit's anatomy: the core's, with the prop's size the debris scales by. */
interface SceneryPropAnatomy extends PropDamageAnatomy {
  radiusM: number;
  heightM: number;
}

/** How a kind breaks, most of it first, with the share of its debris; the rest default from its `mat` (§16.5). */
const KIND_MATERIALS: Readonly<Record<string, ReadonlyArray<readonly [FractureMaterial, number]>>> = {
  stall: [['plank', 0.55], ['canvas', 0.45]],
  tent: [['canvas', 0.7], ['timber', 0.3]],
  laundry: [['canvas', 0.75], ['timber', 0.25]],
  rugframe: [['canvas', 0.65], ['timber', 0.35]],
  fencepicket: [['plank', 1]],
  fencewattle: [['plank', 0.6], ['timber', 0.4]],
  gate: [['plank', 0.8], ['metal', 0.2]],
  pallet: [['plank', 1]],
  trough: [['plank', 0.8], ['metal', 0.2]],
  sled: [['plank', 0.7], ['timber', 0.3]],
  walladobe: [['adobe', 0.8], ['plaster', 0.2]],
  transformer: [['metal', 0.75], ['glass', 0.25]],
  tomb: [['plaster', 0.5], ['rubble', 0.35], ['tile', 0.15]],
  sedan: [['metal', 0.75], ['glass', 0.25]],
  pickup: [['metal', 0.75], ['glass', 0.25]],
  van: [['metal', 0.75], ['glass', 0.25]],
  truck: [['metal', 0.8], ['glass', 0.2]],
};
const MAT_MATERIALS: Readonly<Record<string, ReadonlyArray<readonly [FractureMaterial, number]>>> = {
  wood: [['plank', 1]],
  straw: [['thatch', 1]],
  stone: [['stone', 1]],
  plaster: [['adobe', 0.75], ['plaster', 0.25]],
  baked: [['metal', 0.8], ['glass', 0.2]],
  vehicle: [['metal', 0.8], ['glass', 0.2]],
};
/** Buckets whose material is textured: their pieces are white, the texture their look. */
const TEXTURED = new Set(['wood', 'straw', 'stone', 'plaster']);

/** The intact prop's colours, binned by hue and lightness and weighted by triangle area, the largest bins first. */
function dominantTints(geometry: BufferGeometry, count: number): Rgb[] {
  const color = geometry.getAttribute('color'), position = geometry.getAttribute('position');
  if (!color || !position) return [];
  const index = geometry.getIndex();
  const tris = index ? index.count / 3 : position.count / 3;
  const bins = new Map<number, { w: number; r: number; g: number; b: number }>();
  for (let t = 0; t < tris; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3, i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1, i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const ax = position.getX(i1) - position.getX(i0), ay = position.getY(i1) - position.getY(i0), az = position.getZ(i1) - position.getZ(i0);
    const bx = position.getX(i2) - position.getX(i0), by = position.getY(i2) - position.getY(i0), bz = position.getZ(i2) - position.getZ(i0);
    const area = 0.5 * Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
    if (!(area > 0)) continue;
    const r = (color.getX(i0) + color.getX(i1) + color.getX(i2)) / 3;
    const g = (color.getY(i0) + color.getY(i1) + color.getY(i2)) / 3;
    const b = (color.getZ(i0) + color.getZ(i1) + color.getZ(i2)) / 3;
    // a coarse bin: lightness in five steps, the dominant channel's lead in three
    const l = Math.min(4, Math.floor(Math.cbrt(Math.max(0, (r + g + b) / 3)) * 5));
    const hi = r >= g && r >= b ? 0 : g >= b ? 1 : 2, lead = Math.min(2, Math.floor((Math.max(r, g, b) - Math.min(r, g, b)) * 12));
    const key = l * 9 + hi * 3 + lead;
    const bin = bins.get(key) ?? { w: 0, r: 0, g: 0, b: 0 };
    bin.w += area; bin.r += r * area; bin.g += g * area; bin.b += b * area;
    bins.set(key, bin);
  }
  return [...bins.values()].sort((p, q) => q.w - p.w).slice(0, count).map((bin) => [bin.r / bin.w, bin.g / bin.w, bin.b / bin.w] as const);
}

/** A prop's fracture slots: its kind's materials in its type's bucket, each with its own tint and share. */
function propFractureSlots(kind: string, mat: string, geometry: BufferGeometry): FractureSlot[] {
  const materials = KIND_MATERIALS[kind] ?? MAT_MATERIALS[mat] ?? MAT_MATERIALS.baked;
  const tints = TEXTURED.has(mat) ? [] : dominantTints(geometry, materials.length);
  return materials.map(([material, share], i) => ({
    material, bucket: mat, share,
    tint: material === 'glass' ? [0.2, 0.24, 0.26] : tints[i] ?? tints[0] ?? [1, 1, 1],
    thicknessM: material === 'canvas' || material === 'metal' || material === 'glass' ? 0.01 : 0.05,
  }));
}

/** The pooled piece a material breaks into, and its unit size in metres. */
function pieceOf(material: FractureMaterial, rng: () => number): { shape: DebrisShape; size: number } {
  switch (material) {
    case 'plank': return rng() < 0.7 ? { shape: 'splinter', size: 0.45 } : { shape: 'plate', size: 0.35 };
    case 'timber': return rng() < 0.5 ? { shape: 'beam', size: 0.5 } : { shape: 'splinter', size: 0.4 };
    case 'canvas': return { shape: 'sheet', size: 0.45 };
    case 'thatch': return { shape: 'straw', size: 0.45 };
    case 'stone': return rng() < 0.6 ? { shape: 'stone', size: 0.22 } : { shape: 'chunk', size: 0.2 };
    case 'rubble': return { shape: 'stone', size: 0.18 };
    case 'adobe': case 'earth': case 'infill': return { shape: 'clod', size: 0.2 };
    case 'plaster': return rng() < 0.5 ? { shape: 'chunk', size: 0.18 } : { shape: 'plate', size: 0.2 };
    case 'metal': return rng() < 0.6 ? { shape: 'sheet', size: 0.4 } : { shape: 'plate', size: 0.3 };
    case 'glass': return { shape: 'shard', size: 0.1 };
    case 'tile': return { shape: 'tile', size: 0.25 };
    case 'slate': return { shape: 'slate', size: 0.25 };
    case 'brick': return { shape: 'brick', size: 0.22 };
    case 'concrete': return rng() < 0.7 ? { shape: 'chunk', size: 0.25 } : { shape: 'rebar', size: 0.5 };
    default: return { shape: 'chunk', size: 0.2 };
  }
}

/** How hard each cause throws (m/s along the blow, m/s up) and how many pieces a metre of prop gives. */
const CAUSE: Readonly<Record<DestructionCause, { code: number; along: number; up: number; perM: number }>> = {
  blast: { code: 1, along: 6.5, up: 4.0, perM: 9 },
  kinetic: { code: 2, along: 3.5, up: 1.8, perM: 6 },
  ram: { code: 3, along: 1.6, up: 0.9, perM: 4 },
};

/** The debris a blow throws: the prop's own materials, by their shares, from its body along the blow's direction. */
function throwPropDebris(anatomy: SceneryPropAnatomy, cause: DestructionCause, dirX: number, dirZ: number,
  out: DamagePieceWriter): void {
  const law = CAUSE[cause] ?? CAUSE.kinetic;
  const rng = damageRng(damageSeed(anatomy.seed, law.code));
  const slots = anatomy.fracture;
  if (!slots.length) return;
  const total = slots.reduce((sum, slot) => sum + slot.share, 0) || 1;
  const r = anatomy.radiusM, h = anatomy.heightM;
  const count = Math.max(3, Math.round(law.perM * Math.sqrt(Math.max(0.2, r * h))));
  const dl = Math.hypot(dirX, dirZ) || 1, fx = dirX / dl, fz = dirZ / dl;
  for (let k = 0; k < count; k++) {
    let pick = rng() * total, slot = slots[0];
    for (const s of slots) { pick -= s.share; if (pick <= 0) { slot = s; break; } }
    const unit = pieceOf(slot.material, rng);
    const size = unit.size * Math.min(1.3, Math.max(0.5, r)) * (0.7 + rng() * 0.6);
    // from the prop's body: across its footprint, up its height, the blow's side first
    const x = (rng() - 0.5) * r * 1.2 - fx * r * 0.3, y = h * (0.15 + rng() * 0.6), z = (rng() - 0.5) * r * 1.2 - fz * r * 0.3;
    // along the blow, fanned ±0.5 rad, slower for the heavy units
    const fan = (rng() - 0.5) * 1.0, c = Math.cos(fan), s = Math.sin(fan);
    const speed = law.along * (0.5 + rng() * 0.7) * (unit.shape === 'beam' || unit.shape === 'stone' ? 0.7 : 1);
    const vx = (fx * c - fz * s) * speed, vz = (fz * c + fx * s) * speed, vy = law.up * (0.4 + rng() * 0.8);
    // a uniformly random orientation (Shoemake)
    const u1 = rng(), u2 = rng() * Math.PI * 2, u3 = rng() * Math.PI * 2, qa = Math.sqrt(1 - u1), qb = Math.sqrt(u1);
    const flat = unit.shape === 'plate' || unit.shape === 'sheet' || unit.shape === 'tile' || unit.shape === 'slate' || unit.shape === 'straw';
    const shade = 0.85 + rng() * 0.25;
    if (!out.push(slot.bucket, unit.shape, Math.floor(rng() * 4), x, y, z,
      qa * Math.sin(u2), qa * Math.cos(u2), qb * Math.sin(u3), qb * Math.cos(u3),
      size, size * (flat ? 0.12 : 0.55), size * 0.75,
      slot.tint[0] * shade, slot.tint[1] * shade, slot.tint[2] * shade, vx, vy, vz)) break;
  }
}

/** The scenery lane's prop kit: the fallback for every destructible prop ('default'). */
export const SCENERY_PROP_DAMAGE_KIT: PropDamageKit = {
  id: 'scenery-props',
  kinds: ['default'],
  describe(input: PropDescribeInput): SceneryPropAnatomy {
    return {
      propIdx: input.propIdx, kind: input.kind, seed: input.seed,
      fracture: propFractureSlots(input.kind, input.mat, input.geometry),
      radiusM: input.radiusM, heightM: input.heightM,
    };
  },
  debris(anatomy, cause, dirX, dirZ, out) {
    throwPropDebris(anatomy as SceneryPropAnatomy, cause, dirX, dirZ, out);
  },
};

registerPropDamageKit(SCENERY_PROP_DAMAGE_KIT);
