import type { RuntimeValue } from '../runtimeTypes.ts';

export interface ResumeCredentialStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): RuntimeValue;
}

interface CredentialRecord {
  key: string;
  current: string;
  next: string;
}

const STORAGE_KEY = 'cot.signaling.resume.v1';
const TOKEN_RE = /^[a-f0-9]{64}$/;
const MAX_RECORDS = 16;

function browserStorage(): ResumeCredentialStorage | null {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function newToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function savedRecords(storage: ResumeCredentialStorage | null): Map<string, CredentialRecord> {
  const records = new Map<string, CredentialRecord>();
  try {
    const saved: RuntimeValue = JSON.parse(storage?.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) for (const value of saved.slice(-MAX_RECORDS)) {
      if (!value || typeof value !== 'object' || !('key' in value)
        || !('current' in value) || !('next' in value)
        || typeof value.key !== 'string' || value.key.length > 2048
        || typeof value.current !== 'string' || typeof value.next !== 'string'
        || (value.current !== '' && !TOKEN_RE.test(value.current))
        || (value.next !== '' && !TOKEN_RE.test(value.next))) continue;
      records.set(value.key, { key: value.key, current: value.current, next: value.next });
    }
  } catch { /* private browsing or invalid storage: retain in-memory recovery */ }
  return records;
}

/** Device/profile-scoped like the existing player ID; never enters invite URLs or events. */
export class SignalingResumeCredentials {
  private readonly storage: ResumeCredentialStorage | null;
  private readonly records: Map<string, CredentialRecord>;

  constructor(storage: ResumeCredentialStorage | null = browserStorage()) {
    this.storage = storage;
    this.records = savedRecords(storage);
  }

  private save(changes: Array<[string, CredentialRecord | null]>): void {
    while (this.records.size > MAX_RECORDS) {
      const oldest = this.records.keys().next().value;
      if (oldest === undefined) break;
      this.records.delete(oldest);
    }
    // Update only our exact keys: an older client object must not roll back
    // another room or a newer client generation sharing the browser profile.
    const merged = savedRecords(this.storage);
    for (const [key, value] of changes) {
      merged.delete(key);
      if (value) merged.set(key, value);
    }
    try { this.storage?.setItem(STORAGE_KEY,
      JSON.stringify([...merged.values()].slice(-MAX_RECORDS))); }
    catch { /* transport reconnect still works without browser storage */ }
  }

  prepare(key: string): { resumeToken: string; nextResumeToken: string } {
    const owned = this.records.get(key);
    const latest = savedRecords(this.storage).get(key);
    if (latest && (!owned || owned.current !== latest.current || owned.next !== latest.next)) {
      throw Object.assign(new Error('room credentials belong to a newer client generation'), {
        code: 'resume_denied',
      });
    }
    const record = owned || { key, current: '', next: '' };
    if (!record.next) record.next = newToken();
    this.records.delete(key);
    this.records.set(key, record);
    // Persist before sending: if the server commits but its response is lost,
    // a reloaded page can prove the already-installed next capability.
    this.save([[key, record]]);
    return { resumeToken: record.current, nextResumeToken: record.next };
  }

  accept(key: string, issued: RuntimeValue, destinationKey = key): void {
    const record = this.records.get(key);
    if (!record?.next || (issued != null && issued !== record.next)) {
      throw Object.assign(new Error('invalid room resume acknowledgement'), {
        code: 'invalid_room_response',
      });
    }
    const latest = savedRecords(this.storage).get(key);
    // The server's successful receipt may beat a competing pending proposal
    // based on the same predecessor. It must never overwrite an already
    // accepted successor (or that successor's own pending rotation).
    const samePredecessor = latest?.current === record.current;
    const alreadyAccepted = latest?.current === record.next && latest.next === '';
    if (latest && !samePredecessor && !alreadyAccepted) {
      throw Object.assign(new Error('room credentials belong to a newer client generation'), {
        code: 'resume_denied',
      });
    }
    this.records.delete(key);
    const accepted = { key: destinationKey, current: record.next, next: '' };
    this.records.set(destinationKey, accepted);
    this.save([[key, null], [destinationKey, accepted]]);
  }

  forget(key: string): void {
    const previous = this.records.get(key);
    const latest = savedRecords(this.storage).get(key);
    this.records.delete(key);
    if (latest && (!previous || latest.current !== previous.current || latest.next !== previous.next)) return;
    this.save([[key, null]]);
  }
}
