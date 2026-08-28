/**
 * Node-compatible room-code generation for serverless signaling.
 *
 * Keep this production closure in JavaScript while `api/signal.js` is a
 * JavaScript Vercel function. Importing a browser-side `.ts` source from that
 * closure works in local Node loaders but is not packaged by Vercel.
 */

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}

/** Generate the same readable six-character alphabet used by room invites. */
export function createRoomCode(rng) {
  if (typeof rng !== 'function') throw new TypeError('room code RNG is required');
  let out = '';
  for (let index = 0; index < ROOM_CODE_LENGTH; index++) {
    const unit = Number(rng());
    if (!Number.isFinite(unit) || unit < 0 || unit >= 1) {
      throw codedError('invalid_rng', 'rng() must return a value in [0, 1)');
    }
    out += ROOM_CODE_ALPHABET[(unit * ROOM_CODE_ALPHABET.length) | 0];
  }
  return out;
}
