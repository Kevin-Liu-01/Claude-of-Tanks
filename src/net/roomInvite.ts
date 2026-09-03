import type { RuntimeValue } from '../runtimeTypes.ts';
/**
 * Canonical private/LAN invitation URLs.
 *
 * The room code and mode control entry. The optional host callsign improves
 * first-paint presentation only; signaling returns the authoritative host
 * identity after join. main.ts parses these links and playMenu.ts creates them.
 */
import { normalizeRoomCode } from './protocol.ts';
import { normalizePlayerName } from './playerNames.ts';

export type RoomInviteMode = 'private' | 'lan';

export interface RoomInvite {
  roomCode: string;
  mode: RoomInviteMode;
  hostName: string | null;
}

export interface CreateRoomInviteOptions {
  roomCode?: RuntimeValue;
  mode?: RuntimeValue;
  hostName?: RuntimeValue;
  baseUrl?: RuntimeValue;
}

const INVITE_ROOM_PARAM = 'room';
const INVITE_MODE_PARAM = 'mode';
const INVITE_HOST_PARAM = 'host';
const INVITE_MODES = new Set<RoomInviteMode>(['private', 'lan']);

function isInviteMode(value: RuntimeValue): value is RoomInviteMode {
  return typeof value === 'string' && INVITE_MODES.has(value as RoomInviteMode);
}

function asUrl(value: RuntimeValue): URL {
  if (value instanceof URL) return new URL(value.href);
  return new URL(String(value || ''), 'https://invalid.local/');
}

/** Parse a private/LAN room invite without trusting raw URL input. */
export function parseRoomInvite(value: RuntimeValue): RoomInvite | null {
  let url: URL;
  try {
    url = asUrl(value);
  } catch {
    return null;
  }
  const roomCode = normalizeRoomCode(url.searchParams.get(INVITE_ROOM_PARAM));
  if (roomCode.length !== 6) return null;
  const requestedMode = String(url.searchParams.get(INVITE_MODE_PARAM) || '').toLowerCase();
  const hostName = normalizePlayerName(url.searchParams.get(INVITE_HOST_PARAM)) || null;
  return {
    roomCode,
    mode: isInviteMode(requestedMode) ? requestedMode : 'private',
    hostName,
  };
}

/** Build the clean, same-deployment URL a host can send to another player. */
export function createRoomInviteUrl({
  roomCode,
  mode = 'private',
  hostName = null,
  baseUrl,
}: CreateRoomInviteOptions = {}): string {
  const code = normalizeRoomCode(roomCode);
  if (code.length !== 6) throw new TypeError('room invite requires a six-character room code');
  const inviteMode: RoomInviteMode = isInviteMode(mode) ? mode : 'private';
  const inviteHost = normalizePlayerName(hostName);
  const url = asUrl(baseUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set(INVITE_ROOM_PARAM, code);
  if (inviteMode !== 'private') url.searchParams.set(INVITE_MODE_PARAM, inviteMode);
  if (inviteHost) url.searchParams.set(INVITE_HOST_PARAM, inviteHost);
  return url.href;
}

/** Human invitation heading. Unnamed legacy links retain a useful fallback. */
export function roomInviteTitle(hostName: RuntimeValue): string {
  const inviteHost = normalizePlayerName(hostName);
  return inviteHost ? `Join ${inviteHost}’s Game` : 'Join a Private Game';
}
