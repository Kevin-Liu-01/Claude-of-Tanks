/**
 * src/entry/telemetry.ts — the entry-resilience beacon client
 * (docs/ENTRY-RESILIENCE.md).
 *
 * Loaded before the renderer, so it imports nothing from the game and stays
 * small. Events are batched into one same-origin `navigator.sendBeacon` (fetch
 * keepalive fallback) per flush; every payload is anonymous: a random per-load
 * session id, the build stamp, stage names, timings, bounded error text and a
 * capability summary. Never a player name, room code, address or user agent.
 *
 * Disabled by `?telemetry=off`, the Diagnostics setting (localStorage
 * `cot.telemetry` = `off`), Do Not Track / Global Privacy Control, headless
 * automation and self-hosted builds; `?telemetry=on` re-enables it for a probe.
 */

export const TELEMETRY_ENDPOINT = '/api/telemetry';
export const TELEMETRY_OPT_OUT_KEY = 'cot.telemetry';
const SCHEMA_VERSION = 1;
const DEFAULT_MAX_EVENTS = 80;
const DEFAULT_MAX_ERRORS = 5;
const DEFAULT_MAX_BODY_BYTES = 3800;
const MAX_EVENTS_PER_FLUSH = 25;
const IMMEDIATE_KINDS = new Set(['boot_error', 'entry_result', 'room_failure', 'ice_degraded', 'slow_reveal']);

/** `hud_mask_failed` (2026-09-25): the damage panel gave up on a tank's top-down masks —
 *  `stage` damagePanel, `code` the mask pipeline's failure code, `reason` the spec id. */
export type TelemetryKind = 'boot_stage' | 'boot_ready' | 'boot_error' | 'entry_result' | 'capability'
  | 'slow_reveal' | 'room_failure' | 'ice_degraded' | 'hud_mask_failed';
type TelemetryOutcome = 'ok' | 'failed' | 'cancelled' | 'timeout' | 'halted' | 'notice';
type TelemetryMode = 'solo' | 'private' | 'lan' | 'studio' | 'network' | 'unknown';

interface TelemetryErrorSummary {
  message: string;
  frames: string[];
}

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
}

interface EntryTelemetry {
  readonly enabled: boolean;
  readonly sessionId: string;
  readonly build: string;
  /** Events handed to the transport so far. */
  readonly sent: number;
  /** The last boot stage begun; errors are attributed to it. */
  readonly currentStage: string;
  /** Record a boot stage boundary (`end` carries the stage duration). */
  stage(stage: string, phase: 'begin' | 'end', ms?: number): void;
  /** Queue one event; returns false when disabled or over the session cap. */
  send(event: TelemetryEvent): boolean;
  /** Queue a bounded description of an error against a stage (at most a few per session). */
  error(stage: string | null, error: unknown, code?: string): boolean;
  /** Send everything queued now (used before the page hides). */
  flush(): void;
}

interface EntryTelemetryOptions {
  enabled?: boolean;
  endpoint?: string;
  build?: string;
  sessionId?: string;
  /** Deliver one serialized body; return false when nothing could be sent. */
  transport?: (endpoint: string, body: string) => boolean;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancel?: (handle: unknown) => void;
  /** Origin prefix stripped from stack-frame URLs so frames stay short. */
  origin?: string;
  flushDelayMs?: number;
  maxEvents?: number;
  maxErrors?: number;
  maxBodyBytes?: number;
}

const CODE_RE = /[^A-Za-z0-9_.:-]+/g;

function cleanText(value: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
}

/** Bound an arbitrary code/reason string to the beacon alphabet. */
export function telemetryCode(value: unknown, max = 48): string {
  const text = String(value ?? '').replace(CODE_RE, '_').replace(/^_+|_+$/g, '').slice(0, max);
  return text || 'unknown';
}

/** Bound the application-version stamp (`v1.0.0+gd464a813f.dirty`); the build alphabet keeps `+`. */
export function telemetryBuild(value: unknown): string {
  return String(value ?? '').replace(/[^A-Za-z0-9+._-]+/g, '_').slice(0, 64) || 'unknown';
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

export function createEntryTelemetry({
  enabled = true,
  endpoint = TELEMETRY_ENDPOINT,
  build = 'unknown',
  sessionId = randomSessionId(),
  transport = () => false,
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancel = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  origin = '',
  flushDelayMs = 400,
  maxEvents = DEFAULT_MAX_EVENTS,
  maxErrors = DEFAULT_MAX_ERRORS,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
}: EntryTelemetryOptions = {}): EntryTelemetry {
  const queue: TelemetryEvent[] = [];
  let sent = 0;
  let queued = 0;
  let errors = 0;
  let currentStage = 'imports';
  let timer: unknown = null;

  const body = (events: TelemetryEvent[]): string => JSON.stringify({
    v: SCHEMA_VERSION, sid: sessionId, build, events,
  });

  const flush = (): void => {
    if (timer !== null) { cancel(timer); timer = null; }
    while (queue.length) {
      let count = Math.min(MAX_EVENTS_PER_FLUSH, queue.length);
      let text = body(queue.slice(0, count));
      // A body over the sink's limit is split; a single oversized event loses its detail.
      while (text.length > maxBodyBytes && count > 1) {
        count = Math.ceil(count / 2);
        text = body(queue.slice(0, count));
      }
      if (text.length > maxBodyBytes) {
        const [first] = queue;
        text = body([{ kind: first.kind, stage: first.stage, phase: first.phase, ms: first.ms,
          outcome: first.outcome, mode: first.mode, reason: first.reason, code: first.code || 'oversized' }]);
      }
      queue.splice(0, count);
      sent += count;
      try { transport(endpoint, text); } catch (_) { /* the beacon never breaks the caller */ }
    }
  };

  const send = (event: TelemetryEvent): boolean => {
    if (!enabled || queued >= maxEvents || !event || typeof event.kind !== 'string') return false;
    queued += 1;
    queue.push({
      ...event,
      ...(event.stage !== undefined ? { stage: telemetryCode(event.stage, 32) } : {}),
      ...(event.code !== undefined ? { code: telemetryCode(event.code) } : {}),
      ...(event.reason !== undefined ? { reason: telemetryCode(event.reason) } : {}),
    });
    if (IMMEDIATE_KINDS.has(event.kind)) flush();
    else if (timer === null) timer = schedule(flush, flushDelayMs);
    return true;
  };

  return {
    get enabled() { return enabled; },
    get sessionId() { return sessionId; },
    get build() { return build; },
    get sent() { return sent; },
    get currentStage() { return currentStage; },
    stage(stage, phase, ms) {
      if (phase === 'begin') currentStage = stage;
      send({ kind: 'boot_stage', stage: telemetryCode(stage, 32), phase,
        ...(typeof ms === 'number' && Number.isFinite(ms) ? { ms: Math.max(0, Math.round(ms)) } : {}) });
    },
    send,
    error(stage, error, code) {
      if (!enabled || errors >= maxErrors) return false;
      errors += 1;
      return send({ kind: 'boot_error', stage: telemetryCode(stage || currentStage, 32),
        ...(code ? { code: telemetryCode(code) } : {}), error: describeError(error, origin) });
    },
    flush,
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
      method: 'POST', body: text, keepalive: true, credentials: 'omit',
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
    build: telemetryBuild(build),
    sessionId: window.__COT_TELEMETRY_SID || randomSessionId(),
    transport: browserTransport,
    origin: location.origin,
  });
  window.__COT_TELEMETRY_SID = telemetry.sessionId;
  if (telemetry.enabled) {
    window.addEventListener('pagehide', () => telemetry.flush());
    document.addEventListener('visibilitychange', () => { if (document.hidden) telemetry.flush(); });
  }
  singleton = telemetry;
  return telemetry;
}
