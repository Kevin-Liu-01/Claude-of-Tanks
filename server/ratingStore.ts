import type { RuntimeValue } from '../src/runtimeTypes.ts';
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
  version?: RuntimeValue;
  profiles?: RuntimeValue;
  settledMatches?: RuntimeValue;
}

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return typeof value === 'object' && value !== null;
}

function hashSecret(secret: RuntimeValue): Buffer {
  return createHash('sha256').update(String(secret)).digest();
}

function secretMatches(expected: Buffer, received: RuntimeValue): boolean {
  const actual = hashSecret(received);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function cleanName(value: RuntimeValue): string {
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

export function rankForRating(rating: RuntimeValue): RatingRank {
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

function readSavedStore(filePath: string): SerializedRatingStore | null {
  try {
    const parsed: RuntimeValue = JSON.parse(readFileSync(filePath, 'utf8'));
    return isRecord(parsed) ? parsed : {};
  } catch (caught) {
    if (isRecord(caught) && caught.code === 'ENOENT') return null;
    const message = caught instanceof Error ? caught.message : String(caught);
    throw new Error(`failed to load rating store: ${message}`);
  }
}

function boundedInteger(value: RuntimeValue, minimum: number, fallback: number): number {
  return Math.max(minimum, Math.round(Number(value)) || fallback);
}

function storedProfile(raw: RuntimeValue): StoredRatingProfile | null {
  if (!isRecord(raw)) return null;
  const playerId = String(raw.playerId || '');
  const tokenHash = String(raw.tokenHash || '');
  if (!PLAYER_ID_RE.test(playerId) || !/^[a-f0-9]{64}$/.test(tokenHash)) return null;
  return {
    playerId,
    name: cleanName(raw.name),
    tokenHash: Buffer.from(tokenHash, 'hex'),
    rating: Math.min(MAX_RATING, boundedInteger(raw.rating, MIN_RATING, START_RATING)),
    bestRating: boundedInteger(raw.bestRating, START_RATING, START_RATING),
    matches: boundedInteger(raw.matches, 0, 0),
    wins: boundedInteger(raw.wins, 0, 0),
    losses: boundedInteger(raw.losses, 0, 0),
    draws: boundedInteger(raw.draws, 0, 0),
  };
}

function populateProfiles(
  target: Map<string, StoredRatingProfile>,
  savedProfiles: RuntimeValue,
): void {
  if (!Array.isArray(savedProfiles)) return;
  for (const raw of savedProfiles) {
    const profile = storedProfile(raw);
    if (profile) target.set(profile.playerId, profile);
  }
}

function populateSettledMatches(target: Set<string>, savedMatches: RuntimeValue): void {
  if (!Array.isArray(savedMatches)) return;
  for (const id of savedMatches) if (typeof id === 'string' && id) target.add(id);
}

function validateRatedResult(result: RuntimeValue): asserts result is RatedResult {
  if (result !== 'alpha' && result !== 'bravo' && result !== 'draw') {
    throw new TypeError('rated result must be alpha, bravo, or draw');
  }
}

function collectRatedTeams(
  players: RatedPlayer[],
  profiles: ReadonlyMap<string, StoredRatingProfile>,
): Record<RatedTeam, StoredRatingProfile[]> {
  const teams: Record<RatedTeam, StoredRatingProfile[]> = { alpha: [], bravo: [] };
  for (const player of players) {
    const profile = profiles.get(String(player.id));
    if (!profile || (player.team !== 'alpha' && player.team !== 'bravo')) {
      throw new TypeError('rated result contains an unknown player');
    }
    teams[player.team].push(profile);
  }
  if (!teams.alpha.length || !teams.bravo.length) {
    throw new TypeError('rated result requires both teams');
  }
  return teams;
}

function averageRating(profiles: readonly StoredRatingProfile[]): number {
  return profiles.reduce((sum, profile) => sum + profile.rating, 0) / profiles.length;
}

function updateRatedProfile(
  profile: StoredRatingProfile,
  team: RatedTeam,
  result: RatedResult,
  score: number,
  expected: number,
): RatingUpdate {
  const before = profile.rating;
  const k = profile.matches < 10 ? 48 : 32;
  profile.rating = Math.max(MIN_RATING,
    Math.min(MAX_RATING, before + Math.round(k * (score - expected))));
  profile.bestRating = Math.max(profile.bestRating, profile.rating);
  profile.matches++;
  if (result === 'draw') profile.draws++;
  else if (result === team) profile.wins++;
  else profile.losses++;
  return { before, delta: profile.rating - before, ...publicProfile(profile) };
}

function teamRatingUpdates(
  teams: Record<RatedTeam, StoredRatingProfile[]>,
  result: RatedResult,
): RatingUpdate[] {
  const alphaAverage = averageRating(teams.alpha);
  const bravoAverage = averageRating(teams.bravo);
  const alphaExpected = 1 / (1 + 10 ** ((bravoAverage - alphaAverage) / 400));
  const alphaScore = result === 'draw' ? 0.5 : result === 'alpha' ? 1 : 0;
  const updates: RatingUpdate[] = [];
  for (const team of ['alpha', 'bravo'] as const) {
    const score = team === 'alpha' ? alphaScore : 1 - alphaScore;
    const expected = team === 'alpha' ? alphaExpected : 1 - alphaExpected;
    for (const profile of teams[team]) {
      updates.push(updateRatedProfile(profile, team, result, score, expected));
    }
  }
  return updates;
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
    const saved = readSavedStore(this.filePath);
    if (!saved) return;
    populateProfiles(this.profiles, saved.profiles);
    populateSettledMatches(this.settledMatches, saved.settledMatches);
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

  createIdentity({ name }: { name?: RuntimeValue } = {}): RatingIdentity {
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

  authenticate(playerId: RuntimeValue, token: RuntimeValue): boolean {
    const profile = this.profiles.get(String(playerId));
    return !!profile && secretMatches(profile.tokenHash, token);
  }

  profile(playerId: RuntimeValue): PublicRatingProfile | null {
    const profile = this.profiles.get(String(playerId));
    return profile ? publicProfile(profile) : null;
  }

  rename(playerId: RuntimeValue, token: RuntimeValue, name: RuntimeValue): PublicRatingProfile | null {
    const profile = this.profiles.get(String(playerId));
    if (!profile || !secretMatches(profile.tokenHash, token)) return null;
    profile.name = cleanName(name);
    this.#save();
    return publicProfile(profile);
  }

  leaderboard(limit: RuntimeValue = 50): RatingLeaderboardEntry[] {
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
    validateRatedResult(result);
    const teams = collectRatedTeams(players, this.profiles);
    const updates = teamRatingUpdates(teams, result);
    this.settledMatches.add(id);
    this.#save();
    return updates;
  }
}
