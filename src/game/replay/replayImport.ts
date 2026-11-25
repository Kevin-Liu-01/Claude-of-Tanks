/**
 * A replay file the player opens or drops (replay-fixes-277, docs/REPLAY.md): read and checked before any battle is
 * entered. The file is the recorder's own (`.cotreplay`, as Download replay saves it): gzipped where the browser could,
 * its bytes opening with the format's magic and version (sim/replayFormat.ts). A file over REPLAY_IMPORT_MAX_BYTES is
 * refused before it is read (a real one is tens of KB). The build check (the replay digest) is the viewer's, as for a
 * saved replay: a file from another version opens its timeline alone with the refusal. Node-runnable.
 */
import { decodeReplay, REPLAY_FORMAT_VERSION, REPLAY_MAGIC, type ReplayRecording } from '../../sim/replayFormat.ts';
import { unpackReplay } from './replayStore.ts';

/** The largest file the import reads: a seven-minute solo battle records to about 25 KB. */
export const REPLAY_IMPORT_MAX_BYTES = 2 * 1024 * 1024;

/** Why a file is not a replay this build can open (the Service Record's Replays tab words it). */
export type ReplayImportProblem =
  | { readonly code: 'too_big' }
  | { readonly code: 'not_replay' }
  | { readonly code: 'format'; readonly version: number; readonly current: number }
  | { readonly code: 'damaged' };

export type ReplayImportCheck =
  | { readonly ok: true; readonly raw: Uint8Array; readonly recording: ReplayRecording }
  | { readonly ok: false; readonly problem: ReplayImportProblem };

const MAGIC = new TextEncoder().encode(REPLAY_MAGIC);

/** The refusal for a file of `size` bytes before it is read, or null. */
export function replayImportSizeProblem(size: number): ReplayImportProblem | null {
  return Number.isFinite(size) && size > REPLAY_IMPORT_MAX_BYTES ? { code: 'too_big' } : null;
}

/** A file's bytes checked: magic, format version and the whole recording decoded. */
export async function checkReplayFile(data: Uint8Array): Promise<ReplayImportCheck> {
  const tooBig = replayImportSizeProblem(data.length);
  if (tooBig) return { ok: false, problem: tooBig };
  let raw: Uint8Array;
  try { raw = await unpackReplay(data); } catch { return { ok: false, problem: { code: data[0] === 0x1f && data[1] === 0x8b ? 'damaged' : 'not_replay' } }; }
  if (raw.length < MAGIC.length + 1 || MAGIC.some((byte, i) => raw[i] !== byte)) return { ok: false, problem: { code: 'not_replay' } };
  const version = raw[MAGIC.length]!;
  if (version !== REPLAY_FORMAT_VERSION) return { ok: false, problem: { code: 'format', version, current: REPLAY_FORMAT_VERSION } };
  // past its magic and version, a file that does not decode whole is damaged (cut short, a section missing, its header
  // not JSON): the decoder's ReplayFormatError and RangeError, and whatever a mangled header throws
  try { return { ok: true, raw, recording: decodeReplay(raw) }; } catch { return { ok: false, problem: { code: 'damaged' } }; }
}
