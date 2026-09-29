/**
 * The Play menu's classification of a room failure: the room's own refusal or ending (src/mp/room/protocol.ts error
 * codes and close reasons), the room host that could not be reached (RoomConnectError) or the deployment that names
 * none, and everything else as a plain connection failure. Only curated codes reach the UI; never prose.
 */
export type RoomFailureCode =
  | 'expired' | 'kicked' | 'resume_denied' | 'room_closed'
  | 'room_full' | 'invalid_room_code' | 'access_denied'
  | 'room_service_unavailable' | 'connection_failed';

interface RoomFailure {
  readonly code: RoomFailureCode;
  /** Explicit user retry is permitted; this never authorizes an automatic retry. */
  readonly canRetry: boolean;
  /** The room or this membership is known to have ended, not merely gone offline. */
  readonly roomEnded: boolean;
}

/** Local lifecycle cancellation is not a broken room and must not open an error panel. */
export function isIntentionalRoomCloseReason(reason: unknown): boolean {
  return typeof reason === 'string' && [
    'left_room', 'client_leave', 'back_to_menu', 'menu_closed', 'menu_disposed', 'mode_changed',
    'room_connection_closed', 'room_connection_superseded', 'network_match_closed', 'explicit_leave',
    'room_retry', 'returned_to_garage',
  ].includes(reason);
}

const ALIASES: ReadonlyMap<string, RoomFailureCode> = new Map([
  ['expired', 'expired'], ['room_not_found', 'expired'],
  ['kicked', 'kicked'],
  ['resume_denied', 'resume_denied'], ['invalid_resume_token', 'resume_denied'],
  ['room_closed', 'room_closed'], ['match_lost', 'room_closed'],
  ['room_full', 'room_full'], ['spectators_full', 'room_full'], ['team_full', 'room_full'],
  ['invalid_room_code', 'invalid_room_code'],
  ['room_locked', 'access_denied'], ['rate_limit', 'access_denied'], ['origin_not_allowed', 'access_denied'],
  ['access_denied', 'access_denied'],
  // the room host (the rooms Worker, the LAN helper) did not answer, or this deployment names none
  ['room_service_unavailable', 'room_service_unavailable'],
  ['room_unreachable', 'room_service_unavailable'], ['room_unconfigured', 'room_service_unavailable'],
  ['exhausted', 'room_service_unavailable'], ['timeout', 'room_service_unavailable'],
]);
const ENDED_ROOMS = new Set<RoomFailureCode>(['expired', 'kicked', 'resume_denied', 'room_closed']);
const NO_RETRY = new Set<RoomFailureCode>([...ENDED_ROOMS, 'room_full', 'invalid_room_code', 'access_denied']);

/** Normalize untrusted failure codes, never server-provided prose, for the UI. */
export function classifyRoomFailure(error: unknown): RoomFailure {
  const raw = typeof error === 'string' ? error
    : error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : '';
  const code = typeof raw === 'string' ? ALIASES.get(raw) || 'connection_failed' : 'connection_failed';
  return { code, canRetry: !NO_RETRY.has(code), roomEnded: ENDED_ROOMS.has(code) };
}
