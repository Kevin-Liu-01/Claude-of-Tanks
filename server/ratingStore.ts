import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const PLAYER_ID_RE = /^r_[a-zA-Z0-9_-]{12,48}$/;
const START_RATING = 1000;
const MIN_RATING = 100;
const MAX_RATING = 3000;

export type RatingRank = 'Master' | 'Diamond' | 'Platinum' | 'Gold' |
  'Silver' | 'Bronze' | 'Recruit';
export type RatedTeam = 'alpha' | 'bravo';
export type RatedResult = RatedTeam | 'draw';

interface StoredRatingProfile {
  playerId: string;
  name: string;
  tokenHash: Buffer;
  rating: number;
  bestRating: number;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface PublicRatingProfile {
  playerId: string;
  name: string;
  rating: number;
  rank: RatingRank;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  bestRating: number;
}

export interface RatingIdentity extends PublicRatingProfile {
  token: string;
}

export interface RatingLeaderboardEntry extends PublicRatingProfile {
  place: number;
}

export interface RatedPlayer {
  id: string;
  team: RatedTeam;
}

export interface RatingUpdate extends PublicRatingProfile {
  before: number;
  delta: number;
}

export interface RatingStoreOptions {
  identityFactory?: () => string;
  secretFactory?: () => string;
  filePath?: string | null;
}

export interface RecordTeamMatchOptions {
  matchId?: string;
  result?: RatedResult;
  players?: RatedPlayer[];
}

interface SerializedRatingStore {
  version?: unknown;
  profiles?: unknown;
  settledMatches?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hashSecret(secret: unknown): Buffer {
  return createHash('sha256').update(String(secret)).digest();
}

function secretMatches(expected: Buffer, received: unknown): boolean {
  const actual = hashSecret(received);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function cleanName(value: unknown): string {
  const name = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  if (!name) throw new TypeError('display name is required');
  return name;
}

function defaultIdentity(): string {
  return `r_${randomBytes(12).toString('base64url')}`;
}

function defaultSecret(): string {
  return randomBytes(24).toString('base64url');
}

export function rankForRating(rating: unknown): RatingRank {
  const value = Number(rating) || START_RATING;
  if (value >= 1800) return 'Master';
  if (value >= 1600) return 'Diamond';
  if (value >= 1400) return 'Platinum';
  if (value >= 1200) return 'Gold';
  if (value >= 1000) return 'Silver';
  if (value >= 800) return 'Bronze';
  return 'Recruit';
}

function publicProfile(profile: StoredRatingProfile): PublicRatingProfile {
  return {
    playerId: profile.playerId,
    name: profile.name,
    rating: profile.rating,
    rank: rankForRating(profile.rating),
    matches: profile.matches,
    wins: profile.wins,
    losses: profile.losses,
    draws: profile.draws,
    bestRating: profile.bestRating,
  };
}

/** Server-owned anonymous ladder identities and idempotent team Elo results. */
export class RatingStore {
  readonly identityFactory: () => string;
  readonly secretFactory: () => string;
  readonly filePath: string | null;
  readonly profiles = new Map<string, StoredRatingProfile>();
  readonly settledMatches = new Set<string>();

  constructor({
    identityFactory = defaultIdentity,
    secretFactory = defaultSecret,
    filePath = null,
  }: RatingStoreOptions = {}) {
    this.identityFactory = identityFactory;
    this.secretFactory = secretFactory;
    this.filePath = filePath ? String(filePath) : null;
    this.#load();
  }

  #load(): void {
    if (!this.filePath) return;
    let saved: SerializedRatingStore;
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'));
      saved = isRecord(parsed) ? parsed : {};
    } catch (caught) {
      if (isRecord(caught) && caught.code === 'ENOENT') return;
      const message = caught instanceof Error ? caught.message : String(caught);
      throw new Error(`failed to load rating store: ${message}`);
    }
    const profiles: unknown[] = Array.isArray(saved.profiles) ? saved.profiles : [];
    for (const raw of profiles) {
      if (!isRecord(raw)) continue;
      const playerId = String(raw.playerId || '');
      const tokenHash = String(raw.tokenHash || '');
      if (!PLAYER_ID_RE.test(playerId) || !/^[a-f0-9]{64}$/.test(tokenHash)) continue;
      this.profiles.set(playerId, {
        playerId,
        name: cleanName(raw.name),
        tokenHash: Buffer.from(tokenHash, 'hex'),
        rating: Math.max(MIN_RATING,
          Math.min(MAX_RATING, Math.round(Number(raw.rating)) || START_RATING)),
        bestRating: Math.max(START_RATING,
          Math.round(Number(raw.bestRating)) || START_RATING),
        matches: Math.max(0, Math.round(Number(raw.matches)) || 0),
        wins: Math.max(0, Math.round(Number(raw.wins)) || 0),
        losses: Math.max(0, Math.round(Number(raw.losses)) || 0),
        draws: Math.max(0, Math.round(Number(raw.draws)) || 0),
      });
    }
    const settledMatches: unknown[] = Array.isArray(saved.settledMatches)
      ? saved.settledMatches : [];
    for (const id of settledMatches) {
      if (typeof id === 'string' && id) this.settledMatches.add(id);
    }
  }

  #save(): void {
    if (!this.filePath) return;
    const profiles = [...this.profiles.values()].map((profile) => ({
      ...publicProfile(profile),
      tokenHash: profile.tokenHash.toString('hex'),
    }));
    const settledMatches = [...this.settledMatches].slice(-10_000);
    const tempPath = `${this.filePath}.tmp`;
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(tempPath, `${JSON.stringify({ version: 1, profiles, settledMatches })}\n`, {
      mode: 0o600,
    });
    renameSync(tempPath, this.filePath);
  }

  createIdentity({ name }: { name?: unknown } = {}): RatingIdentity {
    let playerId: string;
    do { playerId = String(this.identityFactory()); } while (this.profiles.has(playerId));
    if (!PLAYER_ID_RE.test(playerId)) throw new Error('identity factory returned an invalid id');
    const token = String(this.secretFactory());
    if (token.length < 24) throw new Error('identity factory returned a weak token');
    const profile: StoredRatingProfile = {
      playerId,
      name: cleanName(name),
      tokenHash: hashSecret(token),
      rating: START_RATING,
      bestRating: START_RATING,
      matches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    };
    this.profiles.set(playerId, profile);
    this.#save();
    return { ...publicProfile(profile), token };
  }

  authenticate(playerId: unknown, token: unknown): boolean {
    const profile = this.profiles.get(String(playerId));
    return !!profile && secretMatches(profile.tokenHash, token);
  }

  profile(playerId: unknown): PublicRatingProfile | null {
    const profile = this.profiles.get(String(playerId));
    return profile ? publicProfile(profile) : null;
  }

  rename(playerId: unknown, token: unknown, name: unknown): PublicRatingProfile | null {
    const profile = this.profiles.get(String(playerId));
    if (!profile || !secretMatches(profile.tokenHash, token)) return null;
    profile.name = cleanName(name);
    this.#save();
    return publicProfile(profile);
  }

  leaderboard(limit: unknown = 50): RatingLeaderboardEntry[] {
    const count = Math.max(1, Math.min(100, Number(limit) || 50));
    return [...this.profiles.values()]
      .sort((a, b) => b.rating - a.rating || b.matches - a.matches ||
        a.playerId.localeCompare(b.playerId))
      .slice(0, count)
      .map((profile, index) => ({ place: index + 1, ...publicProfile(profile) }));
  }

  recordTeamMatch({
    matchId,
    result,
    players,
  }: RecordTeamMatchOptions = {}): RatingUpdate[] | null {
    const id = String(matchId || '');
    if (!id || this.settledMatches.has(id)) return null;
    if (!Array.isArray(players) || players.length < 2) {
      throw new TypeError('rated result requires at least two players');
    }
    if (result !== 'alpha' && result !== 'bravo' && result !== 'draw') {
      throw new TypeError('rated result must be alpha, bravo, or draw');
    }
    const teams: Record<RatedTeam, StoredRatingProfile[]> = { alpha: [], bravo: [] };
    for (const player of players) {
      const profile = this.profiles.get(String(player.id));
      if (!profile || (player.team !== 'alpha' && player.team !== 'bravo')) {
        throw new TypeError('rated result contains an unknown player');
      }
      teams[player.team].push(profile);
    }
    if (!teams.alpha.length || !teams.bravo.length) throw new TypeError('rated result requires both teams');
    const average = (entries: readonly StoredRatingProfile[]): number =>
      entries.reduce((sum, entry) => sum + entry.rating, 0) / entries.length;
    const alphaAverage = average(teams.alpha);
    const bravoAverage = average(teams.bravo);
    const alphaExpected = 1 / (1 + 10 ** ((bravoAverage - alphaAverage) / 400));
    const alphaScore = result === 'draw' ? 0.5 : result === 'alpha' ? 1 : 0;
    const updates: RatingUpdate[] = [];
    for (const team of ['alpha', 'bravo'] as const) {
      const score = team === 'alpha' ? alphaScore : 1 - alphaScore;
      const expected = team === 'alpha' ? alphaExpected : 1 - alphaExpected;
      for (const profile of teams[team]) {
        const before = profile.rating;
        const k = profile.matches < 10 ? 48 : 32;
        const delta = Math.round(k * (score - expected));
        profile.rating = Math.max(MIN_RATING, Math.min(MAX_RATING, before + delta));
        profile.bestRating = Math.max(profile.bestRating, profile.rating);
        profile.matches++;
        if (result === 'draw') profile.draws++;
        else if (result === team) profile.wins++;
        else profile.losses++;
        updates.push({ before, delta: profile.rating - before, ...publicProfile(profile) });
      }
    }
    this.settledMatches.add(id);
    this.#save();
    return updates;
  }
}
