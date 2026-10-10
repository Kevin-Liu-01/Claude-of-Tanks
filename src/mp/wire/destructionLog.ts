/**
 * The destruction log on the wire (destruction core lane, 2026-10-07; docs/DESTRUCTION.md §8.2).
 *
 * The log (sim/destructionEvents.ts DestructionLogEntry: a structure's stage, a breach, a crater) only grows within a
 * match, so a snapshot carries it as the destroyed-prop list travels: whole in a keyframe, the entries after its
 * baseline's length in a delta (the packet names that length, so a client never splices a delta onto the wrong
 * base). Entries are compact binary: a stage 11–13 bytes (with its footprint centre), a breach 20–28 (with it), a crater 19. Positions travel in millimetres,
 * radii in centimetres, depths in millimetres: the authority quantizes its own entries the same way, so the log a
 * migrated host restores is the log every peer applied.
 */
import { WireError, type ByteReader, type ByteWriter } from './bytes.ts';
import type { DestructionLogEntry, StructureStage } from '../../sim/destructionEvents.ts';

/** Entries one snapshot may carry (a keyframe carries the whole log). */
export const MAX_DESTRUCTION_PER_SNAPSHOT = 4096;
const KIND_STAGE = 1;
const KIND_BREACH = 2;
const KIND_CRATER = 3;
const STAGES: readonly StructureStage[] = ['intact', 'damaged', 'breached', 'collapsed'];

const mm = (value: number): number => Math.max(-0x7fffffff, Math.min(0x7fffffff, Math.round(value * 1000)));
const cm16 = (value: number): number => Math.max(0, Math.min(0xffff, Math.round(value * 100)));
const mm16 = (value: number): number => Math.max(0, Math.min(0xffff, Math.round(value * 1000)));

/** The entry exactly as the wire carries it (positions to the millimetre, radii to the centimetre). */
export function quantizeDestructionEntry(entry: DestructionLogEntry): DestructionLogEntry {
  if (entry.kind === 'stage') {
    return Number.isFinite(entry.cx) && Number.isFinite(entry.cz)
      ? { kind: 'stage', structureId: entry.structureId, stage: entry.stage, cx: mm(entry.cx!) / 1000, cz: mm(entry.cz!) / 1000 }
      : { kind: 'stage', structureId: entry.structureId, stage: entry.stage };
  }
  if (entry.kind === 'breach') {
    const breach = {
      kind: 'breach' as const, structureId: entry.structureId, section: entry.section & 0x7f, hole: entry.hole & 0xff,
      x: mm(entry.x) / 1000, y: mm(entry.y) / 1000, z: mm(entry.z) / 1000, radiusM: cm16(entry.radiusM) / 100,
      sectionDown: !!entry.sectionDown,
    };
    return Number.isFinite(entry.cx) && Number.isFinite(entry.cz)
      ? { ...breach, cx: mm(entry.cx!) / 1000, cz: mm(entry.cz!) / 1000 } : breach;
  }
  return {
    kind: 'crater', craterId: entry.craterId, x: mm(entry.x) / 1000, z: mm(entry.z) / 1000,
    radiusM: cm16(entry.radiusM) / 100, depthM: mm16(entry.depthM) / 1000, rimM: mm16(entry.rimM) / 1000,
    seed: entry.seed & 0xffff,
  };
}

export function writeDestructionEntries(writer: ByteWriter, entries: readonly DestructionLogEntry[]): void {
  if (entries.length > MAX_DESTRUCTION_PER_SNAPSHOT) throw new WireError('too_many', 'destruction log entries');
  writer.varint(entries.length);
  for (const entry of entries) {
    if (entry.kind === 'stage') {
      const stage = STAGES.indexOf(entry.stage);
      if (stage < 0) throw new WireError('invalid_message', 'destruction stage');
      const identity = Number.isFinite(entry.cx) && Number.isFinite(entry.cz);
      writer.u8(KIND_STAGE);
      writer.varint(entry.structureId);
      // the high bit: the footprint centre follows (the structure's identity in a world laid out otherwise)
      writer.u8(stage | (identity ? 0x80 : 0));
      if (identity) { writer.i32(mm(entry.cx!)); writer.i32(mm(entry.cz!)); }
    } else if (entry.kind === 'breach') {
      const identity = Number.isFinite(entry.cx) && Number.isFinite(entry.cz);
      writer.u8(KIND_BREACH);
      writer.varint(entry.structureId);
      // the high bit: the footprint centre follows (sections are at most 4 · 6 + 1)
      writer.u8((entry.section & 0x7f) | (identity ? 0x80 : 0));
      writer.u8(entry.hole & 0xff);
      writer.i32(mm(entry.x)); writer.i32(mm(entry.y)); writer.i32(mm(entry.z));
      writer.u16(cm16(entry.radiusM));
      writer.u8(entry.sectionDown ? 1 : 0);
      if (identity) { writer.i32(mm(entry.cx!)); writer.i32(mm(entry.cz!)); }
    } else {
      writer.u8(KIND_CRATER);
      writer.varint(entry.craterId);
      writer.i32(mm(entry.x)); writer.i32(mm(entry.z));
      writer.u16(cm16(entry.radiusM)); writer.u16(mm16(entry.depthM)); writer.u16(mm16(entry.rimM));
      writer.u16(entry.seed & 0xffff);
    }
  }
}

export function readDestructionEntries(reader: ByteReader): DestructionLogEntry[] {
  const count = reader.count(MAX_DESTRUCTION_PER_SNAPSHOT);
  const entries: DestructionLogEntry[] = [];
  for (let i = 0; i < count; i++) {
    const kind = reader.u8();
    if (kind === KIND_STAGE) {
      const structureId = reader.varint();
      const word = reader.u8();
      const stage = STAGES[word & 0x7f];
      if (!stage) throw new WireError('range', 'destruction stage out of range');
      if (word & 0x80) {
        const cx = reader.i32() / 1000, cz = reader.i32() / 1000;
        entries.push({ kind: 'stage', structureId, stage, cx, cz });
      } else {
        entries.push({ kind: 'stage', structureId, stage });
      }
    } else if (kind === KIND_BREACH) {
      const structureId = reader.varint();
      const word = reader.u8(), hole = reader.u8();
      const section = word & 0x7f;
      const x = reader.i32() / 1000, y = reader.i32() / 1000, z = reader.i32() / 1000;
      const radiusM = reader.u16() / 100;
      const sectionDown = reader.u8() !== 0;
      if (word & 0x80) {
        const cx = reader.i32() / 1000, cz = reader.i32() / 1000;
        entries.push({ kind: 'breach', structureId, section, hole, x, y, z, radiusM, sectionDown, cx, cz });
      } else {
        entries.push({ kind: 'breach', structureId, section, hole, x, y, z, radiusM, sectionDown });
      }
    } else if (kind === KIND_CRATER) {
      const craterId = reader.varint();
      const x = reader.i32() / 1000, z = reader.i32() / 1000;
      const radiusM = reader.u16() / 100, depthM = reader.u16() / 1000, rimM = reader.u16() / 1000;
      const seed = reader.u16();
      entries.push({ kind: 'crater', craterId, x, z, radiusM, depthM, rimM, seed });
    } else {
      throw new WireError('range', `destruction entry kind out of range: ${kind}`);
    }
  }
  return entries;
}

/** The same entry (by what it records; a crater by its id, a breach by its structure, section and slot). */
export function sameDestructionEntry(a: DestructionLogEntry, b: DestructionLogEntry): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'stage' && b.kind === 'stage') return a.structureId === b.structureId && a.stage === b.stage;
  if (a.kind === 'breach' && b.kind === 'breach') return a.structureId === b.structureId && a.section === b.section && a.hole === b.hole;
  return a.kind === 'crater' && b.kind === 'crater' && a.craterId === b.craterId;
}

/** The log a retained seat knows: the base's entries, then every retained entry the base lacks, in received order. */
export function mergeDestructionLogs(base: readonly DestructionLogEntry[], retained: readonly DestructionLogEntry[]): DestructionLogEntry[] {
  const merged = base.slice();
  for (const entry of retained) if (!merged.some((known) => sameDestructionEntry(known, entry))) merged.push(entry);
  return merged;
}

