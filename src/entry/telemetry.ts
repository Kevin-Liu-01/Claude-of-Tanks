/**
 * src/entry/telemetry.ts — the entry-resilience beacon client
 * (docs/ENTRY-RESILIENCE.md, schema v2 — `server/telemetryRecord.ts`).
 *
 * Loaded before the renderer, so it imports nothing from the game and stays
 * small. It sends one `session` record per page load — at boot-ready, or on
 * the first error / halt / pagehide when boot never gets there — carrying
 * the whole boot as a timings map, the capability summary, the outcome and
 * whatever else happened before it left. After that only an `entry`
 * follow-up (a battle entry resolving) or an `error` record (uncaught
 * errors, coalesced over a second, deduplicated by message, three per
 * session) costs a request; the whole session is capped at three. Every
 * payload is anonymous: a random per-load session id, the build stamp,
 * stage names, timings, bounded error text and a capability summary. Never
 * a player name, room code, address or user agent.
 *
 * Disabled by `?telemetry=off`, the Diagnostics setting (localStorage
 * `cot.telemetry` = `off`), Do Not Track / Global Privacy Control, headless
 * automation and self-hosted builds; `?telemetry=on` re-enables it for a
 * probe. `VITE_TELEMETRY_URL` names the Cloudflare sink (else the Vercel
 * fallback `/api/telemetry`); `VITE_TELEMETRY_SAMPLE` keeps that share of
 * clean sessions (failures always send).
 */

export const TELEMETRY_ENDPOINT = '/api/telemetry';
export const TELEMETRY_OPT_OUT_KEY = 'cot.telemetry';
const SCHEMA_VERSION = 2;
const DEFAULT_MAX_REQUESTS = 3;
const DEFAULT_MAX_ERRORS = 3;
const DEFAULT_MAX_BODY_BYTES = 1500;
const DEFAULT_ERROR_DELAY_MS = 1000;
const MAX_TIMINGS = 24;
const MAX_NOTES = 6;
const NAMED_STAGES = new Set([
  'imports', 'renderer', 'sky', 'lighting', 'garage', 'vehicle', 'hud', 'ui', 'audio', 'post', 'studio', 'ready',
]);

/** `hud_mask_failed` (2026-09-25): the damage panel gave up on a tank's top-down masks —
 *  `reason` the spec id, `code` the mask pipeline's failure code; it folds into one session note.
 *  Multiplayer v2 link kinds (2026-09-26, never per tick): `mp_reconnect` (`reason` `match` | `room`)
 *  and `mp_drop` (`code` the wire reason) only count; `mp_exit` folds the battle's link into one
 *  note — `mp:<exit>:<health>:r<reconnects>:d<drops>:<lastDrop>:i<impaired s>` — and, when the
 *  session record already left, posts one `entry` follow-up carrying it (`code` `mp_<exit>`). */
export type TelemetryKind = 'boot_stage' | 'boot_ready' | 'boot_error' | 'entry_result' | 'capability'
  | 'slow_reveal' | 'room_failure' | 'ice_degraded' | 'hud_mask_failed' | 'mp_reconnect' | 'mp_drop' | 'mp_exit'
  /** Peer-to-peer (2026-09-28): `mp_host` (this seat hosted; `reason` `start` | `migrate`) and `mp_migrate` (an election reached this
   *  seat; `code` its new role, `reason` the room's) only count; the counts ride the `mp_exit` note as `:h<hosted>:m<migrations>` when nonzero. */
  | 'mp_host' | 'mp_migrate';
type TelemetryOutcome = 'ok' | 'failed' | 'cancelled' | 'timeout' | 'halted' | 'notice';
type TelemetryMode = 'solo' | 'private' | 'lan' | 'studio' | 'network' | 'unknown';
type SessionOutcome = 'ready' | 'halted' | 'error' | 'left';

interface TelemetryErrorSummary {
  message: string;
  frames: string[];
}

interface PendingError extends TelemetryErrorSummary {
  stage: string;
  code?: string;
}

interface EntryResult {
  outcome: TelemetryOutcome;
  mode?: TelemetryMode;
  code?: string;
  ms?: number;
  error?: TelemetryErrorSummary;
}

/** What a multiplayer v2 battle's link left behind (the status model's summary, a few bytes). */
export interface TelemetryLinkSummary {
  health: string;
  worst?: string;
  reconnects: number;
  roomReconnects: number;
  drops: number;
  lastDrop: string | null;
  impairedMs: number;
  /** Peer-to-peer: rounds hosted and elections lived through (absent on the WebSocket path). */
  hosted?: number;
  migrations?: number;
}

/** What the call sites report; the client folds these into the three wire records (the damage panel types its sink by it). */
export interface TelemetryEvent {
  kind: TelemetryKind;
  stage?: string;
  phase?: 'begin' | 'end';
  ms?: number;
  outcome?: TelemetryOutcome;
  code?: string;
  mode?: TelemetryMode;
  reason?: string;
  error?: TelemetryErrorSummary;
  capability?: Record<string, string | number | boolean>;
  timings?: Record<string, number>;
  /** `mp_exit`: the battle's link summary (counts the client kept itself stand in when absent). */
  link?: TelemetryLinkSummary;
}

interface TelemetryEndpoints {
  session: string;
  error: string;
}

interface EntryTelemetry {
  readonly enabled: boolean;
  readonly sessionId: string;
  readonly build: string;
  /** Requests handed to the transport so far (the session budget is three). */
  readonly sent: number;
  /** The last boot stage begun; errors are attributed to it. */
  readonly currentStage: string;
  /** The session outcome once the session record left, else null. */
  readonly outcome: SessionOutcome | null;
  /** Record a boot stage boundary (`end` carries the stage duration). */
  stage(stage: string, phase: 'begin' | 'end', ms?: number): void;
  /** Fold one event into the session; returns false when disabled or dropped. */
  send(event: TelemetryEvent): boolean;
  /** Report an error against a stage (deduplicated by message, three per session). */
  error(stage: string | null, error: unknown, code?: string): boolean;
  /** Send everything now: the session record if it has not left, then any follow-up (pagehide). */
  flush(): void;
  /** Send only what is already scheduled (the page was hidden; the session may still reach ready). */
  flushPending(): void;
}

interface EntryTelemetryOptions {
  enabled?: boolean;
  endpoints?: TelemetryEndpoints;
  build?: string;
  sessionId?: string;
  /** Deliver one serialized body; return false when nothing could be sent. */
  transport?: (endpoint: string, body: string) => boolean;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancel?: (handle: unknown) => void;
  /** Origin prefix stripped from stack-frame URLs so frames stay short. */
  origin?: string;
  /** Share of clean sessions that send, 0–1; failing sessions always send. */
  sample?: number;
  random?: () => number;
  now?: () => number;
  errorDelayMs?: number;
  maxRequests?: number;
  maxErrors?: number;
  maxBodyBytes?: number;
}

const CODE_RE = /[^A-Za-z0-9_.:-]+/g;

function cleanText(value: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
}

/** Bound an arbitrary code/reason string to the beacon alphabet. */
export function telemetryCode(value: unknown, max = 48): string {
  const text = String(value ?? '').replace(CODE_RE, '_').replace(/^_+|_+$/g, '').slice(0, max);
  return text || 'unknown';
}

/** Bound a stage / timings key: the stage alphabet keeps the lifecycle's `gap>stage` entries. */
function timingKey(value: unknown): string {
  return String(value ?? '').replace(/[^A-Za-z0-9>_:.-]+/g, '_').replace(/^[^a-z]+/, '').slice(0, 32) || 'unknown';
}

/** Bound the application-version stamp (`v1.0.0+gd464a813f.dirty`); the build alphabet keeps `+`. */
export function telemetryBuild(value: unknown): string {
  return String(value ?? '').replace(/[^A-Za-z0-9+._-]+/g, '_').slice(0, 64) || 'unknown';
}

/** The deployed site and its telemetry sink — the same values as `src/officialHost.ts`, repeated here because this module
 * imports nothing (the receipt pins both): Vercel stores the project's variables as sensitive, so the CLI build inlines
 * the literal `[SENSITIVE]` for `VITE_TELEMETRY_URL` (2026-09-28) and the site had silently fallen back to the Vercel route. */
export const OFFICIAL_SITE_HOST = 'cot.kevinliu.studio';
export const OFFICIAL_TELEMETRY_URL = 'https://cot-telemetry.kk23907751.workers.dev';

/** The sink's two routes from `VITE_TELEMETRY_URL`; the official site's sink when the build carries no usable value;
 * the Vercel fallback for both elsewhere. */
export function telemetryEndpoints(base: unknown, hostname: unknown = ''): TelemetryEndpoints {
  let url = String(base ?? '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(url)) url = String(hostname ?? '').trim().toLowerCase() === OFFICIAL_SITE_HOST ? OFFICIAL_TELEMETRY_URL : '';
  if (!url) return { session: TELEMETRY_ENDPOINT, error: TELEMETRY_ENDPOINT };
  return { session: `${url}/v1/session`, error: `${url}/v1/error` };
}

/** `VITE_TELEMETRY_SAMPLE` as a share in (0, 1]; anything unreadable keeps every session. */
export function telemetrySampleRate(value: unknown): number {
  const number = Number(String(value ?? '').trim());
  if (!Number.isFinite(number) || number <= 0 || number > 1) return 1;
  return number;
}

/** A bounded, origin-stripped description of any thrown value: message plus the top three frames. */
export function describeError(error: unknown, origin = ''): TelemetryErrorSummary {
  const source = error && typeof error === 'object' ? error as { message?: unknown; stack?: unknown } : null;
  const message = cleanText(source && source.message !== undefined ? source.message : error, 200) || 'unknown';
  const stack = source && typeof source.stack === 'string' ? source.stack : '';
  const frames: string[] = [];
  for (const rawLine of stack.split('\n')) {
    const line = rawLine.trim();
    if (!line || frames.length >= 3) continue;
    // V8 frames start with "at"; Firefox/Safari frames are "fn@url:line:col".
    if (!/^at\s/.test(line) && !/@.+:\d+/.test(line)) continue;
    frames.push(cleanText(origin ? line.split(origin).join('') : line, 160));
  }
  return { message, frames };
}

export function randomSessionId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return `s${Array.from(bytes, (byte) => (byte % 36).toString(36)).join('')}`;
  }
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function telemetryOptOutStored(storage: StorageLike | null | undefined): boolean {
  try { return storage?.getItem(TELEMETRY_OPT_OUT_KEY) === 'off'; } catch (_) { return false; }
}

export function setTelemetryOptOut(off: boolean, storage: StorageLike | null | undefined): void {
  try {
    if (off) storage?.setItem(TELEMETRY_OPT_OUT_KEY, 'off');
    else storage?.removeItem(TELEMETRY_OPT_OUT_KEY);
  } catch (_) { /* storage may be blocked */ }
}

interface DisableProbe {
  search?: string;
  storage?: StorageLike | null;
  navigator?: { doNotTrack?: string | null; globalPrivacyControl?: boolean; webdriver?: boolean } | null;
  windowDoNotTrack?: string | null;
  selfHosted?: boolean;
}

/**
 * Why the beacon is off for this page, or null when it may run. The URL flag
 * `telemetry=on` re-enables a probe or headless run; self-hosted builds never send.
 */
export function telemetryDisabledReason({
  search = '', storage = null, navigator = null, windowDoNotTrack = null, selfHosted = false,
}: DisableProbe): string | null {
  if (selfHosted) return 'self-hosted';
  if (/[?&]telemetry=off(?:[&#]|$)/.test(search)) return 'query';
  if (/[?&]telemetry=on(?:[&#]|$)/.test(search)) return null;
  if (navigator?.doNotTrack === '1' || windowDoNotTrack === '1' || navigator?.globalPrivacyControl === true) return 'dnt';
  if (telemetryOptOutStored(storage)) return 'stored';
  if (navigator?.webdriver === true) return 'webdriver';
  return null;
}

type WireRecord = Record<string, unknown>;

/** Shrink a record to the body budget, dropping the least useful detail first. */
function fitRecord(record: WireRecord, maxBodyBytes: number): string {
  const trims: Array<(value: WireRecord) => void> = [
    (value) => { delete value.notes; },
    (value) => { delete value.errors; },
    (value) => { if (value.error) value.error = { ...(value.error as PendingError), frames: [] }; },
    (value) => {
      if (value.error) value.error = { ...(value.error as PendingError), message: (value.error as PendingError).message.slice(0, 100) };
    },
    (value) => {
      if (value.t) value.t = Object.fromEntries(Object.entries(value.t as Record<string, number>).filter(([key]) => !key.includes('>')));
    },
    (value) => { delete value.cap; },
    (value) => { if (value.error) value.error = { message: 'oversized', frames: [] }; },
  ];
  let text = JSON.stringify(record);
  for (const trim of trims) {
    if (text.length <= maxBodyBytes) break;
    trim(record);
    text = JSON.stringify(record);
  }
  return text;
}

export function createEntryTelemetry({
  enabled = true,
  endpoints = telemetryEndpoints(''),
  build = 'unknown',
  sessionId = randomSessionId(),
  transport = () => false,
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancel = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  origin = '',
  sample = 1,
  random = Math.random,
  now = () => Date.now(),
  errorDelayMs = DEFAULT_ERROR_DELAY_MS,
  maxRequests = DEFAULT_MAX_REQUESTS,
  maxErrors = DEFAULT_MAX_ERRORS,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
}: EntryTelemetryOptions = {}): EntryTelemetry {
  const startedAt = now();
  const timings: Record<string, number> = {};
  const errors: PendingError[] = [];
  const seenMessages = new Set<string>();
  const notes: string[] = [];
  let currentStage = 'imports';
  let ready = false;
  let bootMs: number | undefined;
  let mode: TelemetryMode | undefined;
  let capability: Record<string, string | number | boolean> | undefined;
  let capOutcome: 'ok' | 'notice' | 'halted' | undefined;
  let capCode: string | undefined;
  let entry: EntryResult | null = null;
  let outcome: SessionOutcome | null = null;
  let sessionSent = false;
  let errorCount = 0;
  let requests = 0;
  let timer: unknown = null;
  // Multiplayer v2 link counters: folded, never sent on their own.
  let linkReconnects = 0;
  let linkRoomReconnects = 0;
  let linkDrops = 0;
  let linkLastDrop: string | null = null;
  let linkHosted = 0;
  let linkMigrations = 0;
  // A clean session is kept with probability `sample`; the record carries the weight so counts scale back.
  const sampledOut = sample < 1 && random() >= sample;
  const weight = Math.max(1, Math.round(1 / sample));

  const roundMs = (value: unknown): number | undefined => (
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : undefined
  );

  const setTiming = (key: string, ms: number): void => {
    if (key in timings || Object.keys(timings).length < MAX_TIMINGS) { timings[key] = ms; return; }
    if (!NAMED_STAGES.has(key)) return;
    // A named stage outranks a gap entry once the map is full.
    const gap = Object.keys(timings).find((existing) => existing.includes('>'));
    if (gap === undefined) return;
    delete timings[gap];
    timings[key] = ms;
  };

  const post = (endpoint: string, record: WireRecord): boolean => {
    if (requests >= maxRequests) return false;
    requests += 1;
    try { transport(endpoint, fitRecord(record, maxBodyBytes)); } catch (_) { /* the beacon never breaks the caller */ }
    return true;
  };

  const withCommon = (record: WireRecord, clean: boolean): WireRecord => ({
    v: SCHEMA_VERSION, sid: sessionId, build, ...record,
    ...(clean && weight > 1 ? { w: weight } : {}),
    ...(notes.length ? { notes: notes.splice(0, notes.length) } : {}),
  });

  const sendSession = (): void => {
    if (sessionSent) return;
    sessionSent = true;
    if (outcome === null) outcome = ready ? 'ready' : errors.length ? 'error' : 'left';
    const first = errors.shift();
    const clean = outcome === 'ready' && !first && (!entry || entry.outcome === 'ok');
    const record: WireRecord = {
      kind: 'session', outcome, stage: currentStage,
      ms: bootMs ?? Math.max(0, Math.round(now() - startedAt)),
      ...(mode ? { mode } : {}),
      t: timings,
      ...(capability ? { cap: capability } : {}),
      ...(capOutcome ? { capOutcome } : {}),
      ...(capCode ? { capCode } : {}),
      ...(entry ? { entry: { outcome: entry.outcome, ...(entry.mode ? { mode: entry.mode } : {}),
        ...(entry.code ? { code: entry.code } : {}), ...(entry.ms !== undefined ? { ms: entry.ms } : {}) } } : {}),
      ...(first ? { error: first } : entry?.error ? { error: entry.error } : {}),
    };
    entry = null;
    if (clean && sampledOut) return;
    post(endpoints.session, withCommon(record, clean));
  };

  const sendFollowUps = (): void => {
    if (entry) {
      const pending = entry;
      entry = null;
      const clean = pending.outcome === 'ok';
      if (!(clean && sampledOut)) {
        post(endpoints.session, withCommon({
          kind: 'entry', outcome: pending.outcome, ...(pending.mode ? { mode: pending.mode } : {}),
          ...(pending.code ? { code: pending.code } : {}), ...(pending.ms !== undefined ? { ms: pending.ms } : {}),
          ...(pending.error ? { error: pending.error } : {}),
        }, clean));
      }
    }
    if (errors.length) {
      const [first, ...rest] = errors.splice(0, errors.length);
      post(endpoints.error, withCommon({
        kind: 'error', stage: first.stage, ...(first.code ? { code: first.code } : {}), ready,
        ms: Math.max(0, Math.round(now() - startedAt)),
        error: { message: first.message, frames: first.frames },
        ...(rest.length ? { errors: rest } : {}),
      }, false));
    }
  };

  const runScheduled = (): void => {
    if (timer !== null) { cancel(timer); timer = null; }
    if (!sessionSent && errors.length) sendSession();
    sendFollowUps();
  };

  const arm = (delayMs: number): void => {
    if (timer === null) timer = schedule(runScheduled, delayMs);
  };

  const conclude = (result: SessionOutcome): void => {
    if (outcome === null) outcome = result;
    if (timer !== null) { cancel(timer); timer = null; }
    sendSession();
    sendFollowUps();
  };

  const note = (text: string): void => {
    const code = telemetryCode(text);
    if (notes.length < MAX_NOTES && !notes.includes(code)) notes.push(code);
  };

  const stage = (name: string, phase: 'begin' | 'end', ms?: number): void => {
    const key = timingKey(name);
    if (phase === 'begin') currentStage = key;
    const rounded = roundMs(ms);
    if (phase === 'end' && rounded !== undefined) setTiming(key, rounded);
  };

  const error = (stageName: string | null, thrown: unknown, code?: string): boolean => {
    if (!enabled || errorCount >= maxErrors) return false;
    const summary = describeError(thrown, origin);
    if (seenMessages.has(summary.message)) return false;
    seenMessages.add(summary.message);
    errorCount += 1;
    errors.push({ stage: timingKey(stageName || currentStage), ...(code ? { code: telemetryCode(code) } : {}), ...summary });
    arm(errorDelayMs);
    return true;
  };

  const send = (event: TelemetryEvent): boolean => {
    if (!enabled || !event || typeof event.kind !== 'string') return false;
    switch (event.kind) {
      case 'boot_stage':
        if (!event.stage || !event.phase) return false;
        stage(event.stage, event.phase, event.ms);
        return true;
      case 'capability':
        if (event.capability) capability = event.capability;
        capOutcome = event.outcome === 'halted' ? 'halted' : event.outcome === 'notice' ? 'notice' : 'ok';
        capCode = event.code ? telemetryCode(event.code) : undefined;
        if (capOutcome === 'halted') conclude('halted');
        return true;
      case 'boot_ready': {
        ready = true;
        bootMs = roundMs(event.ms);
        mode = event.mode;
        const extra = Object.entries(event.timings || {}).filter(([, value]) => typeof value === 'number' && Number.isFinite(value));
        // Named stages first so gaps never crowd them out of the map.
        for (const [key, value] of [...extra.filter(([key]) => NAMED_STAGES.has(key)), ...extra.filter(([key]) => !NAMED_STAGES.has(key))]) {
          setTiming(timingKey(key), Math.max(0, Math.round(value)));
        }
        conclude('ready');
        return true;
      }
      case 'boot_error':
        return error(event.stage || null, event.error || event.code || 'unknown', event.code);
      case 'entry_result': {
        if (!event.outcome) return false;
        entry = {
          outcome: event.outcome, ...(event.mode ? { mode: event.mode } : {}),
          ...(event.code ? { code: telemetryCode(event.code) } : {}),
          ...(roundMs(event.ms) !== undefined ? { ms: roundMs(event.ms) } : {}),
          ...(event.error ? { error: event.error } : {}),
        };
        if (sessionSent) sendFollowUps();
        return true;
      }
      case 'slow_reveal':
      case 'room_failure':
      case 'ice_degraded':
        note(`${event.kind}:${event.code || event.reason || event.stage || 'unknown'}`);
        return true;
      case 'hud_mask_failed':
        // The spec id first so a long pipeline code is what the 48-char bound trims, never the tank.
        note(`hud_mask:${event.reason || 'unknown'}:${event.code || 'unknown'}`);
        return true;
      case 'mp_reconnect':
        if (event.reason === 'room') linkRoomReconnects += 1;
        else linkReconnects += 1;
        return true;
      case 'mp_host':
        linkHosted += 1;
        return true;
      case 'mp_migrate':
        linkMigrations += 1;
        return true;
      case 'mp_drop':
        linkDrops += 1;
        linkLastDrop = telemetryCode(event.code || 'unknown', 24);
        return true;
      case 'mp_exit': {
        // One note for the whole battle; the exit's health verdict is the fact the funnel needs.
        const link = event.link;
        const reconnects = link ? link.reconnects + link.roomReconnects : linkReconnects + linkRoomReconnects;
        const drops = link ? link.drops : linkDrops;
        const lastDrop = link ? link.lastDrop : linkLastDrop;
        const impairedS = Math.round((link ? link.impairedMs : 0) / 1000);
        const exit = telemetryCode(event.code || 'left', 12);
        const health = telemetryCode(event.reason || link?.health || 'unknown', 10);
        const hosted = link && typeof link.hosted === 'number' ? link.hosted : linkHosted;
        const migrations = link && typeof link.migrations === 'number' ? link.migrations : linkMigrations;
        const p2p = hosted || migrations ? `:h${hosted}:m${migrations}` : '';
        note(`mp:${exit}:${health}:r${reconnects}:d${drops}:${lastDrop ? telemetryCode(lastDrop, 16) : 'none'}:i${impairedS}${p2p}`);
        linkReconnects = 0; linkRoomReconnects = 0; linkDrops = 0; linkLastDrop = null; linkHosted = 0; linkMigrations = 0;
        if (sessionSent) {
          // The session record has left: the battle's link rides one `entry` follow-up (the session budget still holds).
          entry = { outcome: exit === 'dropped' || exit === 'lost' ? 'failed' : 'ok', mode: 'network', code: `mp_${exit}`, ...(roundMs(event.ms) !== undefined ? { ms: roundMs(event.ms) } : {}) };
          sendFollowUps();
        }
        return true;
      }
      default:
        return false;
    }
  };

  return {
    get enabled() { return enabled; },
    get sessionId() { return sessionId; },
    get build() { return build; },
    get sent() { return requests; },
    get currentStage() { return currentStage; },
    get outcome() { return sessionSent ? outcome : null; },
    stage,
    send,
    error,
    flush() {
      if (!enabled) return;
      if (timer !== null) { cancel(timer); timer = null; }
      sendSession();
      sendFollowUps();
    },
    flushPending() {
      if (!enabled || timer === null) return;
      runScheduled();
    },
  };
}

/** The subset of ErrorEvent / PromiseRejectionEvent the reporter reads (every DOM Event satisfies it). */
interface HostErrorEvent {
  target?: unknown;
  error?: unknown;
  filename?: unknown;
  reason?: unknown;
}

interface ErrorEventHost {
  addEventListener(type: string, listener: (event: HostErrorEvent) => void, options?: boolean): void;
  removeEventListener(type: string, listener: (event: HostErrorEvent) => void, options?: boolean): void;
  location?: { origin: string };
}

/**
 * Report the first few uncaught errors and unhandled rejections of the page
 * against the boot stage they interrupted. Resource errors (a failed image
 * or script tag) and cross-origin extension errors are left to the inline
 * chunk-recovery script, which owns their retry.
 */
export function installEntryErrorTelemetry(telemetry: EntryTelemetry, host: ErrorEventHost): () => void {
  const sameOrigin = (filename: string): boolean => {
    if (!filename) return true;
    const origin = host.location?.origin || '';
    return !origin || filename.startsWith(origin) || filename.startsWith('/');
  };
  const onError = (event: HostErrorEvent): void => {
    if (!event || (event.target && event.target !== host) || !event.error) return;
    if (!sameOrigin(String(event.filename || ''))) return;
    telemetry.error(null, event.error, 'uncaught');
  };
  const onRejection = (event: HostErrorEvent): void => {
    if (!event) return;
    telemetry.error(null, event.reason, 'unhandled_rejection');
  };
  host.addEventListener('error', onError, true);
  host.addEventListener('unhandledrejection', onRejection);
  return () => {
    host.removeEventListener('error', onError, true);
    host.removeEventListener('unhandledrejection', onRejection);
  };
}

function browserTransport(endpoint: string, text: string): boolean {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'
      && navigator.sendBeacon(endpoint, text)) return true;
  } catch (_) { /* fall through to fetch */ }
  try {
    void fetch(endpoint, {
      method: 'POST', body: text, keepalive: true, credentials: 'omit', mode: 'no-cors',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
    }).catch(() => {});
    return true;
  } catch (_) {
    return false;
  }
}

function safeStorage(): StorageLike | null {
  try { return window.localStorage; } catch (_) { return null; }
}

declare global {
  interface Window {
    /** Session id minted by the inline boot script so its beacons and the module's share one session. */
    __COT_TELEMETRY_SID?: string;
  }
}

let singleton: EntryTelemetry | null = null;

/** The page's one beacon client (browser only; Node receipts use the factory). */
export function getEntryTelemetry(): EntryTelemetry {
  if (singleton) return singleton;
  const storage = safeStorage();
  const reason = telemetryDisabledReason({
    search: location.search,
    storage,
    navigator,
    windowDoNotTrack: (window as Window & { doNotTrack?: string | null }).doNotTrack ?? null,
    selfHosted: import.meta.env.VITE_SELF_HOSTED === '1',
  });
  const build = document.querySelector('meta[name="application-version"]')?.getAttribute('content') || 'unknown';
  const telemetry = createEntryTelemetry({
    enabled: reason === null,
    endpoints: telemetryEndpoints(import.meta.env.VITE_TELEMETRY_URL, location.hostname),
    sample: telemetrySampleRate(import.meta.env.VITE_TELEMETRY_SAMPLE),
    build: telemetryBuild(build),
    sessionId: window.__COT_TELEMETRY_SID || randomSessionId(),
    transport: browserTransport,
    origin: location.origin,
  });
  window.__COT_TELEMETRY_SID = telemetry.sessionId;
  if (telemetry.enabled) {
    window.addEventListener('pagehide', () => telemetry.flush());
    document.addEventListener('visibilitychange', () => { if (document.hidden) telemetry.flushPending(); });
  }
  singleton = telemetry;
  return telemetry;
}
