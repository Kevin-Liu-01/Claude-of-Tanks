import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const PLAYER_ID_RE = /^r_[a-zA-Z0-9_-]{12,48}$/;
const START_RATING = 1000;
const MIN_RATING = 100;
const MAX_RATING = 3000;

function hashSecret(secret) {
  return createHash('sha256').update(String(secret)).digest();
}

function secretMatches(expected, received) {
  const actual = hashSecret(received);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function cleanName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  if (!name) throw new TypeError('display name is required');
  return name;
}

function defaultIdentity() {
  return `r_${randomBytes(12).toString('base64url')}`;
}

function defaultSecret() {
  return randomBytes(24).toString('base64url');
}

export function rankForRating(rating) {
  const value = Number(rating) || START_RATING;
  if (value >= 1800) return 'Master';
  if (value >= 1600) return 'Diamond';
  if (value >= 1400) return 'Platinum';
  if (value >= 1200) return 'Gold';
  if (value >= 1000) return 'Silver';
  if (value >= 800) return 'Bronze';
  return 'Recruit';
}

function publicProfile(profile) {
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
  constructor({
    identityFactory = defaultIdentity,
    secretFactory = defaultSecret,
    filePath = null,
  } = {}) {
    this.identityFactory = identityFactory;
    this.secretFactory = secretFactory;
    this.filePath = filePath ? String(filePath) : null;
    this.profiles = new Map();
    this.settledMatches = new Set();
    this.#load();
  }

  #load() {
    if (!this.filePath) return;
    let saved;
    try { saved = JSON.parse(readFileSync(this.filePath, 'utf8')); }
    catch (error) {
      if (error && error.code === 'ENOENT') return;
      throw new Error(`failed to load rating store: ${error.message}`);
    }
    for (const value of Array.isArray(saved?.profiles) ? saved.profiles : []) {
      if (!PLAYER_ID_RE.test(String(value?.playerId)) || !/^[a-f0-9]{64}$/.test(value?.tokenHash)) continue;
      this.profiles.set(value.playerId, {
        playerId: value.playerId,
        name: cleanName(value.name),
        tokenHash: Buffer.from(value.tokenHash, 'hex'),
        rating: Math.max(MIN_RATING, Math.min(MAX_RATING, Math.round(value.rating) || START_RATING)),
        bestRating: Math.max(START_RATING, Math.round(value.bestRating) || START_RATING),
        matches: Math.max(0, Math.round(value.matches) || 0),
        wins: Math.max(0, Math.round(value.wins) || 0),
        losses: Math.max(0, Math.round(value.losses) || 0),
        draws: Math.max(0, Math.round(value.draws) || 0),
      });
    }
    for (const id of Array.isArray(saved?.settledMatches) ? saved.settledMatches : []) {
      if (typeof id === 'string' && id) this.settledMatches.add(id);
    }
  }

  #save() {
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

  createIdentity({ name } = {}) {
    let playerId;
    do { playerId = String(this.identityFactory()); } while (this.profiles.has(playerId));
    if (!PLAYER_ID_RE.test(playerId)) throw new Error('identity factory returned an invalid id');
    const token = String(this.secretFactory());
    if (token.length < 24) throw new Error('identity factory returned a weak token');
    const profile = {
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

  authenticate(playerId, token) {
    const profile = this.profiles.get(String(playerId));
    return !!profile && secretMatches(profile.tokenHash, token);
  }

  profile(playerId) {
    const profile = this.profiles.get(String(playerId));
    return profile ? publicProfile(profile) : null;
  }

  rename(playerId, token, name) {
    const profile = this.profiles.get(String(playerId));
    if (!profile || !secretMatches(profile.tokenHash, token)) return null;
    profile.name = cleanName(name);
    this.#save();
    return publicProfile(profile);
  }

  leaderboard(limit = 50) {
    const count = Math.max(1, Math.min(100, Number(limit) || 50));
    return [...this.profiles.values()]
      .sort((a, b) => b.rating - a.rating || b.matches - a.matches ||
        a.playerId.localeCompare(b.playerId))
      .slice(0, count)
      .map((profile, index) => ({ place: index + 1, ...publicProfile(profile) }));
  }

  recordTeamMatch({ matchId, result, players } = {}) {
    const id = String(matchId || '');
    if (!id || this.settledMatches.has(id)) return null;
    if (!Array.isArray(players) || players.length < 2) {
      throw new TypeError('rated result requires at least two players');
    }
    const teams = { alpha: [], bravo: [] };
    for (const player of players) {
      const profile = this.profiles.get(String(player.id));
      if (!profile || !teams[player.team]) throw new TypeError('rated result contains an unknown player');
      teams[player.team].push(profile);
    }
    if (!teams.alpha.length || !teams.bravo.length) throw new TypeError('rated result requires both teams');
    const average = (entries) => entries.reduce((sum, entry) => sum + entry.rating, 0) / entries.length;
    const alphaAverage = average(teams.alpha);
    const bravoAverage = average(teams.bravo);
    const alphaExpected = 1 / (1 + 10 ** ((bravoAverage - alphaAverage) / 400));
    const alphaScore = result === 'draw' ? 0.5 : result === 'alpha' ? 1 : 0;
    const updates = [];
    for (const team of ['alpha', 'bravo']) {
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
        updates.push({ playerId: profile.playerId, before, delta: profile.rating - before,
          ...publicProfile(profile) });
      }
    }
    this.settledMatches.add(id);
    this.#save();
    return updates;
  }
}
