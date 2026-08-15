import { normalizeRoomCode } from './protocol.js';

const INVITE_ROOM_PARAM = 'room';
const INVITE_MODE_PARAM = 'mode';
const INVITE_MODES = new Set(['private', 'lan']);

function asUrl(value) {
  if (value instanceof URL) return new URL(value.href);
  return new URL(String(value || ''), 'https://invalid.local/');
}

/** Parse a private/LAN room invite without trusting raw URL input. */
export function parseRoomInvite(value) {
  let url;
  try { url = asUrl(value); } catch (_) { return null; }
  const roomCode = normalizeRoomCode(url.searchParams.get(INVITE_ROOM_PARAM));
  if (roomCode.length !== 6) return null;
  const requestedMode = String(url.searchParams.get(INVITE_MODE_PARAM) || '').toLowerCase();
  return {
    roomCode,
    mode: INVITE_MODES.has(requestedMode) ? requestedMode : 'private',
  };
}

/** Build the clean, same-deployment URL a host can send to another player. */
export function createRoomInviteUrl({ roomCode, mode = 'private', baseUrl } = {}) {
  const code = normalizeRoomCode(roomCode);
  if (code.length !== 6) throw new TypeError('room invite requires a six-character room code');
  const inviteMode = INVITE_MODES.has(mode) ? mode : 'private';
  const url = asUrl(baseUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set(INVITE_ROOM_PARAM, code);
  if (inviteMode !== 'private') url.searchParams.set(INVITE_MODE_PARAM, inviteMode);
  return url.href;
}
