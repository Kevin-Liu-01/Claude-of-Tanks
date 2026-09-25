/**
 * Entity row codec: one varint group mask, then the present groups in bit
 * order. Keyframe rows carry every group except the two with a defined
 * default (GUN_RELOAD mirrors RELOAD, ERA empty); delta rows carry only the
 * groups that differ from the viewer's acknowledged baseline row.
 */
import type { ByteReader, ByteWriter } from './bytes.ts';
import { WireError } from './bytes.ts';
import {
  ENTITY_FLAG_BITS, MAX_ENTITIES, MAX_ERA_PER_ROW, MAX_POS_REL_MM, MAX_TILT_REL_UNITS, ROW_GROUP,
  STATUS_FLAGS_SHIFT, STATUS_GUN_RELOAD_KIND_SHIFT, STATUS_GUN_RELOAD_MIRRORS, STATUS_RELOAD_KIND_SHIFT,
  STATUS_SHELL_SLOT_SHIFT,
} from './constants.ts';
import type { EntityRow, EntityRowPatch } from './messages.ts';
import { angleUnitsDelta } from './quantize.ts';

const FLAGS_MASK = (1 << ENTITY_FLAG_BITS) - 1;
const KEYFRAME_GROUPS = ROW_GROUP.POS_ABS | ROW_GROUP.VEL | ROW_GROUP.YAW | ROW_GROUP.TILT_ABS |
  ROW_GROUP.TURRET | ROW_GROUP.HP | ROW_GROUP.MAX_HP | ROW_GROUP.RELOAD | ROW_GROUP.MAGAZINE |
  ROW_GROUP.AMMO | ROW_GROUP.STATUS;

export function zeroEntityRow(entityId: number): EntityRow {
  return {
    entityId, x: 0, y: 0, z: 0, speed: 0, verticalSpeed: 0,
    yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0,
    hp: 0, maxHp: 1, reload: 0, reloadTotal: 0, reloadKind: 0,
    gunReload: 0, gunReloadTotal: 0, gunReloadKind: 0,
    magazineRounds: 0, magazineCapacity: 0, shellSlot: 0,
    ammo0: 0, ammo1: 0, ammo2: 0, flags: 0, eraSpent: [],
  };
}

export function cloneEntityRow(row: EntityRow): EntityRow {
  return { ...row, eraSpent: row.eraSpent.slice() };
}

function gunReloadMirrors(row: EntityRow): boolean {
  return row.gunReload === row.reload && row.gunReloadTotal === row.reloadTotal &&
    row.gunReloadKind === row.reloadKind;
}

export function packStatus(row: EntityRow): number {
  return (row.reloadKind & 3) << STATUS_RELOAD_KIND_SHIFT |
    (row.gunReloadKind & 3) << STATUS_GUN_RELOAD_KIND_SHIFT |
    (row.shellSlot & 3) << STATUS_SHELL_SLOT_SHIFT |
    (gunReloadMirrors(row) ? STATUS_GUN_RELOAD_MIRRORS : 0) |
    (row.flags & FLAGS_MASK) << STATUS_FLAGS_SHIFT;
}

function sameEra(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return false;
  return true;
}

/** Indices in `next` missing from `base`, or null when `next` is not a superset. */
function eraAdditions(base: readonly number[], next: readonly number[]): number[] | null {
  if (next.length < base.length) return null;
  const added: number[] = [];
  let cursor = 0;
  for (const index of next) {
    if (cursor < base.length && base[cursor] === index) { cursor++; continue; }
    added.push(index);
  }
  return cursor === base.length ? added : null;
}

/** Decide the groups a row needs against its baseline (null = keyframe). */
export function diffEntityRow(row: EntityRow, base: EntityRow | null): EntityRowPatch {
  const fields: EntityRowPatch['fields'] = {};
  let mask = 0;
  let era: number[] | null = null;
  const status = packStatus(row);
  if (!base) {
    mask = KEYFRAME_GROUPS;
    fields.x = row.x; fields.y = row.y; fields.z = row.z;
    fields.speed = row.speed; fields.verticalSpeed = row.verticalSpeed;
    fields.yaw = row.yaw; fields.pitch = row.pitch; fields.roll = row.roll;
    fields.turretYaw = row.turretYaw; fields.gunPitch = row.gunPitch;
    fields.hp = row.hp; fields.maxHp = row.maxHp;
    fields.reload = row.reload; fields.reloadTotal = row.reloadTotal;
    fields.magazineRounds = row.magazineRounds; fields.magazineCapacity = row.magazineCapacity;
    fields.ammo0 = row.ammo0; fields.ammo1 = row.ammo1; fields.ammo2 = row.ammo2;
    if (!(status & STATUS_GUN_RELOAD_MIRRORS)) {
      mask |= ROW_GROUP.GUN_RELOAD;
      fields.gunReload = row.gunReload; fields.gunReloadTotal = row.gunReloadTotal;
    }
    if (row.eraSpent.length) { mask |= ROW_GROUP.ERA_RESET; era = row.eraSpent.slice(); }
    return {
      entityId: row.entityId, mask, fields: { ...fields, ...statusFields(status) },
      mirrors: (status & STATUS_GUN_RELOAD_MIRRORS) !== 0, era,
    };
  }
  if (row.x !== base.x || row.y !== base.y || row.z !== base.z) {
    const dx = row.x - base.x, dy = row.y - base.y, dz = row.z - base.z;
    if (Math.abs(dx) <= MAX_POS_REL_MM && Math.abs(dy) <= MAX_POS_REL_MM && Math.abs(dz) <= MAX_POS_REL_MM) {
      mask |= ROW_GROUP.POS_REL;
    } else mask |= ROW_GROUP.POS_ABS;
    fields.x = row.x; fields.y = row.y; fields.z = row.z;
  }
  if (row.speed !== base.speed || row.verticalSpeed !== base.verticalSpeed) {
    mask |= ROW_GROUP.VEL; fields.speed = row.speed; fields.verticalSpeed = row.verticalSpeed;
  }
  if (row.yaw !== base.yaw) { mask |= ROW_GROUP.YAW; fields.yaw = row.yaw; }
  if (row.pitch !== base.pitch || row.roll !== base.roll) {
    const dp = angleUnitsDelta(base.pitch, row.pitch), dr = angleUnitsDelta(base.roll, row.roll);
    mask |= Math.abs(dp) <= MAX_TILT_REL_UNITS && Math.abs(dr) <= MAX_TILT_REL_UNITS
      ? ROW_GROUP.TILT_REL : ROW_GROUP.TILT_ABS;
    fields.pitch = row.pitch; fields.roll = row.roll;
  }
  if (row.turretYaw !== base.turretYaw || row.gunPitch !== base.gunPitch) {
    mask |= ROW_GROUP.TURRET; fields.turretYaw = row.turretYaw; fields.gunPitch = row.gunPitch;
  }
  if (row.hp !== base.hp) { mask |= ROW_GROUP.HP; fields.hp = row.hp; }
  if (row.maxHp !== base.maxHp) { mask |= ROW_GROUP.MAX_HP; fields.maxHp = row.maxHp; }
  if (row.reload !== base.reload || row.reloadTotal !== base.reloadTotal) {
    mask |= ROW_GROUP.RELOAD; fields.reload = row.reload; fields.reloadTotal = row.reloadTotal;
  }
  if (!(status & STATUS_GUN_RELOAD_MIRRORS) &&
      (row.gunReload !== base.gunReload || row.gunReloadTotal !== base.gunReloadTotal)) {
    mask |= ROW_GROUP.GUN_RELOAD; fields.gunReload = row.gunReload; fields.gunReloadTotal = row.gunReloadTotal;
  }
  if (row.magazineRounds !== base.magazineRounds || row.magazineCapacity !== base.magazineCapacity) {
    mask |= ROW_GROUP.MAGAZINE; fields.magazineRounds = row.magazineRounds; fields.magazineCapacity = row.magazineCapacity;
  }
  if (row.ammo0 !== base.ammo0 || row.ammo1 !== base.ammo1 || row.ammo2 !== base.ammo2) {
    mask |= ROW_GROUP.AMMO; fields.ammo0 = row.ammo0; fields.ammo1 = row.ammo1; fields.ammo2 = row.ammo2;
  }
  let mirrors: boolean | null = null;
  if (status !== packStatus(base)) {
    mask |= ROW_GROUP.STATUS;
    Object.assign(fields, statusFields(status));
    mirrors = (status & STATUS_GUN_RELOAD_MIRRORS) !== 0;
  }
  if (!sameEra(row.eraSpent, base.eraSpent)) {
    const added = eraAdditions(base.eraSpent, row.eraSpent);
    if (added) { mask |= ROW_GROUP.ERA_ADD; era = added; }
    else { mask |= ROW_GROUP.ERA_RESET; era = row.eraSpent.slice(); }
  }
  return { entityId: row.entityId, mask, fields, mirrors, era };
}

function statusFields(status: number): Pick<EntityRow, 'reloadKind' | 'gunReloadKind' | 'shellSlot' | 'flags'> {
  return {
    reloadKind: (status >> STATUS_RELOAD_KIND_SHIFT) & 3,
    gunReloadKind: (status >> STATUS_GUN_RELOAD_KIND_SHIFT) & 3,
    shellSlot: (status >> STATUS_SHELL_SLOT_SHIFT) & 3,
    flags: (status >> STATUS_FLAGS_SHIFT) & FLAGS_MASK,
  };
}

function statusFromPatch(patch: EntityRowPatch): number {
  const fields = patch.fields;
  for (const key of ['reloadKind', 'gunReloadKind', 'shellSlot', 'flags'] as const) {
    if (fields[key] == null) throw new WireError('invalid_message', `status group needs ${key}`);
  }
  if (patch.mirrors == null) throw new WireError('invalid_message', 'status group needs the mirror bit');
  return (fields.reloadKind! & 3) << STATUS_RELOAD_KIND_SHIFT |
    (fields.gunReloadKind! & 3) << STATUS_GUN_RELOAD_KIND_SHIFT |
    (fields.shellSlot! & 3) << STATUS_SHELL_SLOT_SHIFT |
    (patch.mirrors ? STATUS_GUN_RELOAD_MIRRORS : 0) |
    (fields.flags! & FLAGS_MASK) << STATUS_FLAGS_SHIFT;
}

/** Gap-coded sorted index list: count, first index, then strictly positive gaps. */
export function writeIndexList(writer: ByteWriter, indices: readonly number[], max: number): void {
  if (indices.length > max) throw new WireError('too_many', `index list exceeds ${max}`);
  writer.varint(indices.length);
  let previous = -1;
  for (const index of indices) {
    if (!Number.isInteger(index) || index <= previous) {
      throw new WireError('range', 'index list must be strictly increasing non-negative integers');
    }
    writer.varint(index - previous - 1);
    previous = index;
  }
}

export function readIndexList(reader: ByteReader, max: number): number[] {
  const count = reader.count(max);
  const out: number[] = new Array(count);
  let previous = -1;
  for (let position = 0; position < count; position++) {
    const index = previous + 1 + reader.varint();
    if (index > 0xffffffff) throw new WireError('range', 'index list overflow');
    out[position] = index;
    previous = index;
  }
  return out;
}

export function writeEntityRowPatch(writer: ByteWriter, patch: EntityRowPatch, base: EntityRow | null): void {
  const { mask, fields } = patch;
  if (!Number.isInteger(patch.entityId) || patch.entityId < 1 || patch.entityId > MAX_ENTITIES) {
    throw new WireError('range', `entity id out of range: ${patch.entityId}`);
  }
  if ((mask & ROW_GROUP.POS_ABS) && (mask & ROW_GROUP.POS_REL)) throw new WireError('invalid_message', 'both position groups set');
  if ((mask & ROW_GROUP.TILT_ABS) && (mask & ROW_GROUP.TILT_REL)) throw new WireError('invalid_message', 'both tilt groups set');
  if ((mask & ROW_GROUP.ERA_ADD) && (mask & ROW_GROUP.ERA_RESET)) throw new WireError('invalid_message', 'both era groups set');
  writer.u8(patch.entityId);
  writer.varint(mask);
  if (mask & ROW_GROUP.POS_ABS) { writer.i32(fields.x!); writer.i32(fields.y!); writer.i32(fields.z!); }
  if (mask & ROW_GROUP.POS_REL) {
    if (!base) throw new WireError('missing_baseline', 'relative position without a baseline');
    writer.i16(fields.x! - base.x); writer.i16(fields.y! - base.y); writer.i16(fields.z! - base.z);
  }
  if (mask & ROW_GROUP.VEL) { writer.i16(fields.speed!); writer.i16(fields.verticalSpeed!); }
  if (mask & ROW_GROUP.YAW) writer.u16(fields.yaw!);
  if (mask & ROW_GROUP.TILT_ABS) { writer.u16(fields.pitch!); writer.u16(fields.roll!); }
  if (mask & ROW_GROUP.TILT_REL) {
    if (!base) throw new WireError('missing_baseline', 'relative tilt without a baseline');
    writer.i8(angleUnitsDelta(base.pitch, fields.pitch!)); writer.i8(angleUnitsDelta(base.roll, fields.roll!));
  }
  if (mask & ROW_GROUP.TURRET) { writer.u16(fields.turretYaw!); writer.u16(fields.gunPitch!); }
  if (mask & ROW_GROUP.HP) writer.u16(fields.hp!);
  if (mask & ROW_GROUP.MAX_HP) writer.u16(fields.maxHp!);
  if (mask & ROW_GROUP.RELOAD) { writer.u16(fields.reload!); writer.u16(fields.reloadTotal!); }
  if (mask & ROW_GROUP.GUN_RELOAD) { writer.u16(fields.gunReload!); writer.u16(fields.gunReloadTotal!); }
  if (mask & ROW_GROUP.MAGAZINE) { writer.u8(fields.magazineRounds!); writer.u8(fields.magazineCapacity!); }
  if (mask & ROW_GROUP.AMMO) { writer.varint(fields.ammo0!); writer.varint(fields.ammo1!); writer.varint(fields.ammo2!); }
  if (mask & ROW_GROUP.STATUS) writer.u16(statusFromPatch(patch));
  if (mask & (ROW_GROUP.ERA_ADD | ROW_GROUP.ERA_RESET)) writeIndexList(writer, patch.era || [], MAX_ERA_PER_ROW);
}

/**
 * Read one patch. Relative groups are resolved against `base` here so the
 * decoded patch already carries absolute field values; the caller supplies
 * the baseline row (or null for a keyframe, which never uses relative groups).
 */
export function readEntityRowPatch(reader: ByteReader, resolveBase: (entityId: number) => EntityRow | null): EntityRowPatch {
  const entityId = reader.u8();
  if (entityId < 1 || entityId > MAX_ENTITIES) throw new WireError('range', `entity id out of range: ${entityId}`);
  const mask = reader.varint();
  if (mask > 0xffff) throw new WireError('range', 'row mask exceeds 16 bits');
  if ((mask & ROW_GROUP.POS_ABS) && (mask & ROW_GROUP.POS_REL)) throw new WireError('invalid_message', 'both position groups set');
  if ((mask & ROW_GROUP.TILT_ABS) && (mask & ROW_GROUP.TILT_REL)) throw new WireError('invalid_message', 'both tilt groups set');
  if ((mask & ROW_GROUP.ERA_ADD) && (mask & ROW_GROUP.ERA_RESET)) throw new WireError('invalid_message', 'both era groups set');
  const fields: EntityRowPatch['fields'] = {};
  let era: number[] | null = null;
  let mirrors: boolean | null = null;
  if (mask & ROW_GROUP.POS_ABS) { fields.x = reader.i32(); fields.y = reader.i32(); fields.z = reader.i32(); }
  if (mask & ROW_GROUP.POS_REL) {
    const base = resolveBase(entityId);
    if (!base) throw new WireError('missing_baseline', `relative position for entity ${entityId} without a baseline`);
    fields.x = base.x + reader.i16(); fields.y = base.y + reader.i16(); fields.z = base.z + reader.i16();
  }
  if (mask & ROW_GROUP.VEL) { fields.speed = reader.i16(); fields.verticalSpeed = reader.i16(); }
  if (mask & ROW_GROUP.YAW) fields.yaw = reader.u16();
  if (mask & ROW_GROUP.TILT_ABS) { fields.pitch = reader.u16(); fields.roll = reader.u16(); }
  if (mask & ROW_GROUP.TILT_REL) {
    const base = resolveBase(entityId);
    if (!base) throw new WireError('missing_baseline', `relative tilt for entity ${entityId} without a baseline`);
    fields.pitch = (base.pitch + reader.i8() + 65536) & 0xffff;
    fields.roll = (base.roll + reader.i8() + 65536) & 0xffff;
  }
  if (mask & ROW_GROUP.TURRET) { fields.turretYaw = reader.u16(); fields.gunPitch = reader.u16(); }
  if (mask & ROW_GROUP.HP) fields.hp = reader.u16();
  if (mask & ROW_GROUP.MAX_HP) fields.maxHp = reader.u16();
  if (mask & ROW_GROUP.RELOAD) { fields.reload = reader.u16(); fields.reloadTotal = reader.u16(); }
  if (mask & ROW_GROUP.GUN_RELOAD) { fields.gunReload = reader.u16(); fields.gunReloadTotal = reader.u16(); }
  if (mask & ROW_GROUP.MAGAZINE) { fields.magazineRounds = reader.u8(); fields.magazineCapacity = reader.u8(); }
  if (mask & ROW_GROUP.AMMO) { fields.ammo0 = reader.count(0xffff); fields.ammo1 = reader.count(0xffff); fields.ammo2 = reader.count(0xffff); }
  if (mask & ROW_GROUP.STATUS) {
    const status = reader.u16();
    Object.assign(fields, statusFields(status));
    mirrors = (status & STATUS_GUN_RELOAD_MIRRORS) !== 0;
  }
  if (mask & (ROW_GROUP.ERA_ADD | ROW_GROUP.ERA_RESET)) era = readIndexList(reader, MAX_ERA_PER_ROW);
  return { entityId, mask, fields, mirrors, era };
}

/** Merge a patch onto its baseline row (null baseline = keyframe defaults). */
export function applyEntityRowPatch(patch: EntityRowPatch, base: EntityRow | null): EntityRow {
  const row = base ? cloneEntityRow(base) : zeroEntityRow(patch.entityId);
  const mirroredBefore = base ? gunReloadMirrors(base) : true;
  Object.assign(row, patch.fields);
  row.entityId = patch.entityId;
  if (patch.mask & ROW_GROUP.ERA_RESET) row.eraSpent = (patch.era || []).slice();
  else if (patch.mask & ROW_GROUP.ERA_ADD) {
    const merged = new Set(row.eraSpent);
    for (const index of patch.era || []) merged.add(index);
    row.eraSpent = [...merged].sort((a, b) => a - b);
  }
  // The encoder sets the status mirror bit exactly when both reload channels
  // agree; an absent STATUS group leaves the baseline's bit in force.
  const mirrors = patch.mirrors ?? mirroredBefore;
  if (mirrors) {
    row.gunReload = row.reload; row.gunReloadTotal = row.reloadTotal; row.gunReloadKind = row.reloadKind;
  }
  return row;
}
