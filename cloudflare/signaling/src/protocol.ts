import type { RuntimeValue } from '../../../src/runtimeTypes.ts';

export const MAX_PAYLOAD_BYTES = 128 * 1024;
export const RATE_WINDOW_MS = 10_000;
export const RATE_MAX_MESSAGES = 120;
export const UNAUTHENTICATED_TIMEOUT_MS = 15_000;
export const MAX_SOCKETS = 32;
export const MAX_PENDING_SOCKETS = 16;
export const ROOM_IDLE_TTL_MS = 24 * 60 * 60 * 1000;
export const ACTIVITY_CHECKPOINT_MS = 60_000;

export interface SignalEnvelope {
  type: string;
  requestId?: string;
  payload: Record<string, RuntimeValue>;
}

export function record(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function roomCodeFromUrl(request: Request): string | null {
  const url = new URL(request.url);
  if (url.search || url.hash) return null;
  return /^\/rooms\/([A-Z0-9]{6})$/.exec(url.pathname)?.[1] ?? null;
}

export function allowedOrigin(request: Request, allowed: string): boolean {
  const origin = request.headers.get('Origin');
  return !!origin && allowed.split(',').some((value) => value.trim() === origin);
}

export function failure(code: string): Error & { code: string } {
  return Object.assign(new Error('Room request rejected'), { code });
}

export function parseEnvelope(message: string): SignalEnvelope {
  let value: RuntimeValue;
  try { value = JSON.parse(message); } catch { throw failure('invalid_payload'); }
  if (!record(value) || typeof value.type !== 'string' || value.type.length > 32 ||
      (value.requestId != null && (typeof value.requestId !== 'string' ||
        value.requestId.length > 128))) throw failure('invalid_payload');
  return { type: value.type, ...(typeof value.requestId === 'string'
    ? { requestId: value.requestId } : {}), payload: record(value.payload) ? value.payload : {} };
}

export function validSignal(signal: RuntimeValue): Record<string, RuntimeValue> {
  if (!record(signal)) throw failure('invalid_payload');
  if (signal.kind === 'restart') return { kind: 'restart' };
  if (signal.kind === 'description') {
    const description = signal.description;
    if (!record(description) || !['offer', 'answer'].includes(String(description.type)) ||
        typeof description.sdp !== 'string' || description.sdp.length > 96_000) {
      throw failure('invalid_payload');
    }
    return { kind: 'description', description: { type: description.type, sdp: description.sdp } };
  }
  if (signal.kind === 'ice') {
    return { kind: 'ice', candidate: validCandidate(signal.candidate) };
  }
  throw failure('invalid_payload');
}

function validCandidate(candidate: RuntimeValue): Record<string, RuntimeValue> {
  if (!record(candidate) || typeof candidate.candidate !== 'string' ||
      candidate.candidate.length > 8_000 ||
      (candidate.sdpMid != null && (typeof candidate.sdpMid !== 'string' || candidate.sdpMid.length > 256)) ||
      (candidate.sdpMLineIndex != null && (!Number.isInteger(candidate.sdpMLineIndex) ||
        Number(candidate.sdpMLineIndex) < 0 || Number(candidate.sdpMLineIndex) > 65_535)) ||
      (candidate.usernameFragment != null && (typeof candidate.usernameFragment !== 'string' ||
        candidate.usernameFragment.length > 256))) throw failure('invalid_payload');
  return {
    candidate: candidate.candidate, sdpMid: candidate.sdpMid ?? null,
    sdpMLineIndex: candidate.sdpMLineIndex ?? null,
    ...(candidate.usernameFragment == null ? {} : { usernameFragment: candidate.usernameFragment }),
  };
}

const SAFE_ERROR_CODES = new Set([
  'invalid_payload', 'invalid_room_code', 'invalid_player', 'invalid_session',
  'invalid_capacity', 'invalid_resume_token', 'already_joined', 'room_not_found',
  'room_full', 'room_code_exhausted', 'resume_denied', 'not_in_room',
  'peer_not_found', 'stale_target_session', 'unknown_message',
]);

export function publicError(error: RuntimeValue, requestId?: string): SignalEnvelope {
  const code = record(error) && typeof error.code === 'string' && SAFE_ERROR_CODES.has(error.code)
    ? error.code : 'signaling_store_unavailable';
  return { type: 'error', ...(requestId ? { requestId } : {}),
    payload: { code, message: 'The room request could not be completed.' } };
}
