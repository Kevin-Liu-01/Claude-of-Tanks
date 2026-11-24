/**
 * The page's saved battles (replay-system-275, docs/REPLAY.md §2): the last KEEP recordings in IndexedDB, gzipped, the
 * oldest pruned first. A recording is a few tens of KB, so the store stays under a megabyte. Every call fails soft: a
 * private window or blocked storage keeps no replays and never breaks a battle.
 */
import type { ReplayEnd, ReplayHeader } from '../../sim/replayFormat.ts';

export const REPLAY_KEEP = 20;
const DB_NAME = 'cot-replays';
const STORE = 'replays';

/** One saved battle as the list shows it (the bytes load on demand). */
export interface SavedReplaySummary {
  id: number;
  recordedAtMs: number;
  mapId: string | null;
  gameMode: string | null;
  playerSpecId: string | null;
  result: string | null;
  ticks: number;
  bytes: number;
}

interface SavedReplay extends SavedReplaySummary {
  gzip: boolean;
  data: Uint8Array;
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore(STORE, { keyPath: 'id' }); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const body = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(body).arrayBuffer());
}

/** gzip when the browser can (CompressionStream), else the raw bytes. */
export async function packReplay(bytes: Uint8Array): Promise<{ gzip: boolean; data: Uint8Array }> {
  if (typeof CompressionStream === 'undefined') return { gzip: false, data: bytes };
  try { return { gzip: true, data: await transform(bytes, new CompressionStream('gzip')) }; } catch { return { gzip: false, data: bytes }; }
}

/** A recording's raw bytes from a file or the store: gzip is recognised by its magic. */
export async function unpackReplay(data: Uint8Array): Promise<Uint8Array> {
  if (data[0] !== 0x1f || data[1] !== 0x8b) return data;
  if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot read a compressed replay');
  return transform(data, new DecompressionStream('gzip'));
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}

export async function saveReplay(bytes: Uint8Array, header: ReplayHeader, end: ReplayEnd): Promise<SavedReplaySummary | null> {
  try {
    const db = await openDb();
    if (!db) return null;
    const packed = await packReplay(bytes);
    const setup = header.setup as Record<string, unknown>;
    const entry: SavedReplay = {
      id: header.recordedAtMs,
      recordedAtMs: header.recordedAtMs,
      mapId: typeof setup.mapId === 'string' ? setup.mapId : null,
      gameMode: typeof setup.gameMode === 'string' ? setup.gameMode : null,
      playerSpecId: typeof setup.playerSpecId === 'string' ? setup.playerSpecId : null,
      result: end.result,
      ticks: end.ticks,
      bytes: packed.data.length,
      gzip: packed.gzip,
      data: packed.data,
    };
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    await request(store.put(entry));
    const keys = (await request(store.getAllKeys())) as number[];
    keys.sort((a, b) => a - b);
    for (const key of keys.slice(0, Math.max(0, keys.length - REPLAY_KEEP))) await request(store.delete(key));
    db.close();
    const { data: _data, gzip: _gzip, ...summary } = entry;
    return summary;
  } catch { return null; }
}

export async function listReplays(): Promise<SavedReplaySummary[]> {
  try {
    const db = await openDb();
    if (!db) return [];
    const all = (await request(db.transaction(STORE, 'readonly').objectStore(STORE).getAll())) as SavedReplay[];
    db.close();
    return all.map(({ data: _data, gzip: _gzip, ...summary }) => summary).sort((a, b) => b.recordedAtMs - a.recordedAtMs);
  } catch { return []; }
}

/** A saved battle's file bytes (gzipped when it was saved so), or null. */
export async function loadReplayFile(id: number): Promise<Uint8Array | null> {
  try {
    const db = await openDb();
    if (!db) return null;
    const entry = (await request(db.transaction(STORE, 'readonly').objectStore(STORE).get(id))) as SavedReplay | undefined;
    db.close();
    return entry?.data ?? null;
  } catch { return null; }
}
