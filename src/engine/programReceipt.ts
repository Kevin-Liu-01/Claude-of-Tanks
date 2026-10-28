/**
 * programReceipt.ts — (2026-10-27, the room-stalls lane) the programs a renderer links after the point its warm owns
 * them all, as a receipt: how many, each named by its material, keyed against the nearest program the warm made, and
 * traced to the draw that linked it. A program linked there is a synchronous link wait in a presented frame (the rooms
 * census: a 580-590 ms first battle frame, a 0.4-1.1 s Garage return). The network entry reads it from its black
 * watchdog through its first frames after the reveal (browserComposition's revealPrograms); the Garage return from its
 * program warm through its first frames (main.ts, the restore receipt's lateLinks). 0 is the receipt.
 */

/** A live program as the receipt reads it (three's WebGLProgram: its material's type and name, its cache key). */
export interface ReceiptProgram { type?: string; name?: string; cacheKey?: string }

/** The draws that linked a program while armed (`material<object<parent<grandparent`), and the end of the watch. */
export interface ProgramOriginWatch { readonly origins: readonly string[]; stop(): void }

export interface ProgramReceipt {
  made: number;
  /** frames counted since the window opened */
  frames: number;
  /** the first eight made, by material type and name */
  names: string[];
  /**
   * beside each name: where its key departs from the nearest warmed program of its type (index:made/warmed), 'same-key'
   * where a warmed program with its very key was released and linked again, or 'new'
   */
  diffs: string[];
  origins?: string[];
  /** programs the warm had made that the renderer released since the window opened */
  released: number;
}

export function programLabel(program: ReceiptProgram): string {
  return [program.type, program.name].filter(Boolean).join(':') || '?';
}

/** A differing key field: short fields whole, long ones (an onBeforeCompile source) from their first differing character. */
function fieldDiff(index: number, made: string, warmed: string): string {
  if (made.length <= 32 && warmed.length <= 32) return `${index}:${made}/${warmed}`;
  let at = 0;
  while (at < made.length && at < warmed.length && made[at] === warmed[at]) at++;
  return `${index}@${at}:${made.slice(at, at + 24)}/${warmed.slice(at, at + 24)}`;
}

/** Where a program's cache key departs from the nearest warmed program of its type (at most four fields), or 'new'. */
export function programKeyDiff(program: ReceiptProgram, warmed: Iterable<ReceiptProgram>): string {
  const fields = program.cacheKey?.split(',') ?? [];
  let best: string[] | null = null;
  for (const other of warmed) {
    if (other.type !== program.type || !other.cacheKey) continue;
    const theirs = other.cacheKey.split(',');
    if (theirs.length !== fields.length) continue;
    const diff: string[] = [];
    for (let i = 0; i < fields.length && diff.length < 5; i++) {
      if (fields[i] !== theirs[i]) diff.push(fieldDiff(i, fields[i]!, theirs[i]!));
    }
    if (!best || diff.length < best.length) best = diff;
  }
  return best ? best.length ? best.slice(0, 4).join(' ') : 'same-key' : 'new';
}

/** The receipt of the programs `live` holds that `baseline` (the warm's own, at the window's opening) does not. */
export function programReceipt(live: readonly ReceiptProgram[], baseline: ReadonlySet<ReceiptProgram>, frames: number,
  watch: Pick<ProgramOriginWatch, 'origins'> | null): ProgramReceipt {
  const made = live.filter((program) => !baseline.has(program));
  const named = made.slice(0, 8);
  const held = new Set(live);
  let released = 0;
  for (const program of baseline) if (!held.has(program)) released++;
  return { made: made.length, frames, names: named.map(programLabel),
    diffs: named.map((program) => programKeyDiff(program, baseline)), ...(watch ? { origins: [...watch.origins] } : {}),
    released };
}
