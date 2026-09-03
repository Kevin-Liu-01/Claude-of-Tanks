import type { RuntimeValue } from '../src/runtimeTypes.ts';
/**
 * Node-compatible room-code generation for serverless signaling.
 *
 * This leaf stays Node-only so the Vercel signaling closure never imports the
 * browser protocol or its rendering-adjacent graph.
 */

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;

export interface CodedError extends Error {
  code: string;
}

function codedError(code: string, message: string): CodedError {
  return Object.assign(new Error(message), { code });
}

/** Generate the same readable six-character alphabet used by room invites. */
export function createRoomCode(rng: () => RuntimeValue): string {
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
