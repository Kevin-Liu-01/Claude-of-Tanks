import type { RuntimeValue } from '../runtimeTypes.ts';

// campaign slice 4 (2026-09-12): a durable local record of Frontline Assault
// sorties — how far the line was pushed on each map and how often the last
// sector was held. Like the battle profile it records outcomes only; there
// is no wallet, research or unlock behind it.

export const CAMPAIGN_KEY = 'cot.campaign.v1';
const CAMPAIGN_VERSION = 1;

export type CampaignResult = 'victory' | 'draw' | 'defeat';

export interface FrontlineMapProgress {
  attempts: number;
  /** Sectors taken on the best sortie (the total means the last one was held). */
  bestLine: number;
  total: number;
  held: number;
  lastResult: CampaignResult | null;
  updatedAt: number;
}

export interface CampaignRecord {
  version: number;
  frontline: Record<string, FrontlineMapProgress>;
}

export interface FrontlineOutcomeInput {
  mapId?: RuntimeValue;
  result?: RuntimeValue;
  reason?: RuntimeValue;
  line?: RuntimeValue;
  completedAt?: RuntimeValue;
}

export interface CampaignStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface CampaignEventBus {
  on(event: string, listener: (payload?: RuntimeValue) => void): RuntimeValue;
}

const installedBuses = new WeakSet<CampaignEventBus>();

function defaultStorage(): CampaignStorage | null {
  try {
    const storage = (globalThis as { localStorage?: CampaignStorage }).localStorage;
    return storage && typeof storage.getItem === 'function' ? storage : null;
  } catch {
    return null;
  }
}

function emptyRecord(): CampaignRecord {
  return { version: CAMPAIGN_VERSION, frontline: {} };
}

function finiteInt(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
}

function normalizeResult(value: unknown): CampaignResult | null {
  return value === 'victory' || value === 'defeat' || value === 'draw' ? value : null;
}

export function readCampaignRecord(storage: CampaignStorage | null = defaultStorage()): CampaignRecord {
  if (!storage) return emptyRecord();
  try {
    const raw = storage.getItem(CAMPAIGN_KEY);
    if (!raw) return emptyRecord();
    const parsed = JSON.parse(raw) as Partial<CampaignRecord> | null;
    if (!parsed || parsed.version !== CAMPAIGN_VERSION || typeof parsed.frontline !== 'object' || !parsed.frontline) {
      return emptyRecord();
    }
    const frontline: Record<string, FrontlineMapProgress> = {};
    for (const [mapId, entry] of Object.entries(parsed.frontline)) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Partial<FrontlineMapProgress>;
      frontline[mapId] = {
        attempts: finiteInt(e.attempts), bestLine: finiteInt(e.bestLine), total: finiteInt(e.total, 3),
        held: finiteInt(e.held), lastResult: normalizeResult(e.lastResult), updatedAt: finiteInt(e.updatedAt),
      };
    }
    return { version: CAMPAIGN_VERSION, frontline };
  } catch {
    return emptyRecord();
  }
}

function writeCampaignRecord(record: CampaignRecord, storage: CampaignStorage | null): void {
  if (!storage) return;
  try { storage.setItem(CAMPAIGN_KEY, JSON.stringify(record)); } catch { /* storage full or blocked: keep playing */ }
}

/**
 * Records one Frontline Assault sortie. A victory means the last sector was
 * held (`line_held`), so the whole line counts; otherwise the sectors taken so
 * far (`line.index`) stand as the push.
 */
export function recordFrontlineOutcome(
  input: FrontlineOutcomeInput,
  storage: CampaignStorage | null = defaultStorage(),
): CampaignRecord {
  const record = readCampaignRecord(storage);
  const mapId = typeof input.mapId === 'string' && input.mapId ? input.mapId : 'unknown';
  const result = normalizeResult(input.result);
  const line = input.line && typeof input.line === 'object' ? input.line as Record<string, unknown> : null;
  const total = Math.max(1, finiteInt(line?.total, 3));
  const reached = result === 'victory' ? total : Math.min(total, finiteInt(line?.index));
  const previous = record.frontline[mapId] ?? {
    attempts: 0, bestLine: 0, total, held: 0, lastResult: null, updatedAt: 0,
  };
  record.frontline[mapId] = {
    attempts: previous.attempts + 1,
    bestLine: Math.max(previous.bestLine, reached),
    total,
    held: previous.held + (result === 'victory' ? 1 : 0),
    lastResult: result,
    updatedAt: finiteInt(input.completedAt, Date.now()),
  };
  writeCampaignRecord(record, storage);
  return record;
}

export interface FrontlineSummary {
  attempts: number;
  bestLine: number;
  total: number;
  held: number;
  maps: number;
}

export function frontlineSummary(record: CampaignRecord = readCampaignRecord()): FrontlineSummary {
  const summary: FrontlineSummary = { attempts: 0, bestLine: 0, total: 3, held: 0, maps: 0 };
  for (const entry of Object.values(record.frontline)) {
    summary.attempts += entry.attempts;
    summary.held += entry.held;
    summary.maps += 1;
    if (entry.bestLine > summary.bestLine || (entry.bestLine === summary.bestLine && entry.total > summary.total)) {
      summary.bestLine = entry.bestLine;
      summary.total = entry.total;
    }
  }
  return summary;
}

function recordOf(payload: RuntimeValue): Record<string, RuntimeValue> | null {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, RuntimeValue> : null;
}

/** Listens for battle ends and records the Frontline Assault ones. */
export function installCampaignProgress(
  bus: CampaignEventBus | null | undefined,
  storage: CampaignStorage | null = defaultStorage(),
): void {
  if (!bus || typeof bus.on !== 'function' || installedBuses.has(bus)) return;
  installedBuses.add(bus);
  bus.on('battle:ended', (payload) => {
    const event = recordOf(payload);
    if (!event || event.gameMode !== 'frontline_assault') return;
    if (event.reason === 'network_disconnect') return;
    recordFrontlineOutcome({
      mapId: event.mapId ?? event.map, result: event.result, reason: event.reason, line: event.line,
    }, storage);
  });
}
