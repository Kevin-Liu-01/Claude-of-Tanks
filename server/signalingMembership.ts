import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { RuntimeValue } from '../src/runtimeTypes.ts';

const TOKEN_RE = /^[a-f0-9]{64}$/;

/** Resume capabilities never enter room rosters, notification payloads or logs. */
export function newSignalingResumeToken(candidate: RuntimeValue = null): string {
  if (candidate == null || candidate === '') return randomBytes(32).toString('hex');
  if (typeof candidate !== 'string' || !TOKEN_RE.test(candidate)) {
    throw Object.assign(new Error('invalid room resume credential'), { code: 'invalid_resume_token' });
  }
  return candidate;
}

export function signalingResumeHash(token: RuntimeValue): string {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return '';
  return createHash('sha256').update(token).digest('hex');
}

export function signalingResumeAllowed(stored: string | undefined, ...proofs: string[]): boolean {
  if (!stored || !TOKEN_RE.test(stored)) return false;
  const expected = Buffer.from(stored, 'hex');
  return proofs.some((proof) => TOKEN_RE.test(proof)
    && timingSafeEqual(expected, Buffer.from(proof, 'hex')));
}

export function newSignalingConnectionId(): string {
  return randomBytes(16).toString('hex');
}
