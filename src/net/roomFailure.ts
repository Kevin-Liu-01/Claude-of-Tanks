import type { RuntimeValue } from '../runtimeTypes.ts';

export type PrivateRoomFailureCode =
  | 'host_left' | 'host_runtime_failed' | 'expired' | 'kicked' | 'resume_denied' | 'room_closed'
  | 'room_full' | 'invalid_room_code' | 'access_denied'
  | 'rtc_connect_timeout' | 'rtc_recovery_exhausted'
  | 'signaling_unavailable' | 'connection_failed';

export interface PrivateRoomFailure {
  readonly code: PrivateRoomFailureCode;
  /** Explicit user retry is permitted; this never authorizes an automatic retry. */
  readonly canRetry: boolean;
  /** The room or this membership is known to have ended, not merely gone offline. */
  readonly roomEnded: boolean;
}

/** Local lifecycle cancellation is not a broken room and must not open an error panel. */
export function isIntentionalRoomCloseReason(reason: RuntimeValue): boolean {
  return typeof reason === 'string' && [
    'left_room', 'client_leave', 'client_closed', 'back_to_menu', 'menu_closed',
    'menu_disposed', 'mode_changed', 'room_connection_closed',
    'room_connection_superseded', 'room_connection_forgotten',
    'network_match_closed', 'explicit_leave', 'room_retry',
  ].includes(reason);
}

const ALIASES: ReadonlyMap<string, PrivateRoomFailureCode> = new Map([
  ['host_left', 'host_left'], ['host_closed', 'host_left'],
  ['host_runtime_failed', 'host_runtime_failed'],
  ['expired', 'expired'], ['room_expired', 'expired'], ['room_not_found', 'expired'],
  ['kicked', 'kicked'], ['peer_kicked', 'kicked'],
  ['resume_denied', 'resume_denied'], ['invalid_resume_token', 'resume_denied'],
  ['membership_replaced', 'resume_denied'],
  ['room_closed', 'room_closed'], ['lobby_closed', 'room_closed'],
  ['room_full', 'room_full'], ['invalid_room_code', 'invalid_room_code'],
  ['origin_not_allowed', 'access_denied'], ['forbidden', 'access_denied'],
  ['room_locked', 'access_denied'], ['access_denied', 'access_denied'],
  ['rtc_connect_timeout', 'rtc_connect_timeout'], ['rtc_connection_timeout', 'rtc_connect_timeout'],
  ['rtc_recovery_exhausted', 'rtc_recovery_exhausted'], ['authority_stalled', 'rtc_recovery_exhausted'],
  ['signaling_unavailable', 'signaling_unavailable'],
  ['room_store_unavailable', 'signaling_unavailable'],
  ['room_store_capacity_exceeded', 'signaling_unavailable'],
  ['signaling_timeout', 'signaling_unavailable'],
  ['signaling_connect_timeout', 'signaling_unavailable'],
  ['signaling_closed', 'signaling_unavailable'],
  ['signaling_capacity_exhausted', 'signaling_unavailable'],
  ['signaling_store_unavailable', 'signaling_unavailable'],
  ['signaling_connection_failed', 'signaling_unavailable'],
]);
const ENDED_ROOMS = new Set<PrivateRoomFailureCode>([
  'host_left', 'host_runtime_failed', 'expired', 'kicked', 'resume_denied', 'room_closed',
]);
const NO_RETRY = new Set<PrivateRoomFailureCode>([
  ...ENDED_ROOMS, 'room_full', 'invalid_room_code', 'access_denied',
]);

/** Normalize untrusted failure codes, never server-provided prose, for the UI. */
export function classifyPrivateRoomFailure(error: RuntimeValue): PrivateRoomFailure {
  const raw = typeof error === 'string' ? error
    : error && typeof error === 'object' && 'code' in error ? error.code : '';
  const code = typeof raw === 'string' ? ALIASES.get(raw) || 'connection_failed' : 'connection_failed';
  return { code, canRetry: !NO_RETRY.has(code), roomEnded: ENDED_ROOMS.has(code) };
}
