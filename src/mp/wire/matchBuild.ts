/**
 * The same-wire build check (2026-10-13, MP stream plan step 13; docs/MULTIPLAYER-V2.md "Mixed builds on one wire").
 *
 * WIRE_VERSION and PROTOCOL_VERSION name the layout and the handshake, not the code behind them: deploys 219-222 all
 * speak wire 5 / protocol 6, so a tab left open on one build can host a seat of the next. In peer-to-peer play that is
 * the common case after every deploy (the host is often an old tab). The host's authority and the seat's prediction
 * both run src/sim's movement; when they differ the seat mispredicts silently.
 *
 * Every build stamps one line, `<app version> t<commit seconds, base36> p<prediction digest> a<authority digest>`, into
 * the HELLO's free-form `clientBuild` (tools/matchBuild.ts computes it at build time; vite defines
 * `__COT_MATCH_BUILD__`). The digests hash the source closures of the seat's prediction (the predictor, its world, the
 * match client, the vehicle specs) and of the host's authority (the actor and the host core). The host compares:
 *   - prediction differs: the seat is refused with PROTOCOL_VERSION and a refusal code its client words ("Refresh the
 *     page to join: your game version differs from the host's", localized in the lobby); never a host decline or an
 *     election — the seat only fails its own entry;
 *   - authority differs alone: admitted (the host is authoritative, the seat predicts the same), and logged;
 *   - the version alone, or either side without a stamp (a build before this check, a dev or headless run): admitted.
 * Node-runnable: no DOM, no Node built-ins.
 */

declare const __COT_MATCH_BUILD__: string | undefined;

/** This build's line ('dev' where no build stamped it: vite dev without the define, Node, the headless harnesses). */
export const MATCH_BUILD: string = typeof __COT_MATCH_BUILD__ === 'string' && __COT_MATCH_BUILD__ ? __COT_MATCH_BUILD__ : 'dev';

interface MatchBuildStamp {
  version: string;
  /** Commit time in seconds (0 when unknown). */
  committedAt: number;
  prediction: string;
  authority: string;
}

const DIGEST_RE = /^[0-9a-f]{12}$/;
const LINE_RE = /^(\S{1,24}) t([0-9a-z]{1,8}) p([0-9a-f]{12}) a([0-9a-f]{12})$/;

/** The HELLO line (at most 62 bytes, inside MAX_BUILD_BYTES: the version is trimmed to 24). */
export function formatMatchBuild(stamp: MatchBuildStamp): string {
  if (!DIGEST_RE.test(stamp.prediction) || !DIGEST_RE.test(stamp.authority)) throw new TypeError('match build digests must be 12 hex characters');
  const time = Math.max(0, Math.floor(Number(stamp.committedAt) || 0)).toString(36);
  const version = String(stamp.version || 'unknown').replace(/\s+/g, '').slice(0, 24) || 'unknown';
  return `${version} t${time} p${stamp.prediction} a${stamp.authority}`;
}

/** A stamped line, or null (a build before this check sends its vite mode, 'production'; dev and headless send others). */
export function parseMatchBuild(line: unknown): MatchBuildStamp | null {
  const match = typeof line === 'string' ? LINE_RE.exec(line.trim()) : null;
  if (!match) return null;
  const committedAt = parseInt(match[2], 36);
  return { version: match[1], committedAt: Number.isFinite(committedAt) ? committedAt : 0, prediction: match[3], authority: match[4] };
}

type MatchBuildVerdict =
  /** Both stamped, the same build. */
  | 'same'
  /** Either side unstamped: nothing to compare (admitted). */
  | 'unknown'
  /** Another build, the same prediction and authority code (admitted). */
  | 'version'
  /** The host's authority differs, the seat's prediction matches (admitted, logged). */
  | 'authority'
  /** The seat would predict with other code than the host's authority runs: refused, "refresh". */
  | 'prediction';

interface MatchBuildComparison {
  verdict: MatchBuildVerdict;
  /** Which side's commit is newer, when both are stamped with a time and they differ. */
  newer: 'host' | 'seat' | null;
}

export function compareMatchBuilds(hostLine: unknown, seatLine: unknown): MatchBuildComparison {
  const host = parseMatchBuild(hostLine);
  const seat = parseMatchBuild(seatLine);
  if (!host || !seat) return { verdict: 'unknown', newer: null };
  const newer = host.committedAt > 0 && seat.committedAt > 0 && host.committedAt !== seat.committedAt
    ? (host.committedAt > seat.committedAt ? 'host' : 'seat') : null;
  if (host.prediction !== seat.prediction) return { verdict: 'prediction', newer };
  if (host.authority !== seat.authority) return { verdict: 'authority', newer };
  if (host.version !== seat.version) return { verdict: 'version', newer };
  return { verdict: 'same', newer: null };
}

/** True when the seat must not play on this host. */
export function matchBuildRefused(comparison: MatchBuildComparison): boolean {
  return comparison.verdict === 'prediction';
}

/**
 * Why a seat cannot play on this host, as the host's CLOSE detail carries it: a code, never prose — the joining client
 * words it in its own build (matchRefusalMessage) and the lobby in the player's locale (playMenu
 * `playMenu.entryRefusal.*`). The other-wire gate (matchClient.ts matchBuildMismatchMessage) uses the same codes.
 */
export type MatchRefusalCode = 'build_mismatch' | 'build_host_older' | 'build_host_newer';

const REFUSAL_WORDS: Readonly<Record<MatchRefusalCode, string>> = Object.freeze({
  build_mismatch: "Refresh the page to join: your game version differs from the host's.",
  build_host_older: "Refresh the page to join: your game version differs from the host's. The host is running an older version, so ask them to refresh too.",
  build_host_newer: "Refresh the page to join: your game version differs from the host's. A newer version of the game is out.",
});

/** The code a refused seat's CLOSE carries (at most MAX_DETAIL_BYTES). */
export function matchBuildRefusalCode(comparison: MatchBuildComparison): MatchRefusalCode {
  if (comparison.newer === 'seat') return 'build_host_older';
  if (comparison.newer === 'host') return 'build_host_newer';
  return 'build_mismatch';
}

/** The English words of a refusal (the fallback wherever no locale reaches: logs, the loader, a missing catalog key). */
export function matchRefusalMessage(code: MatchRefusalCode): string {
  return REFUSAL_WORDS[code];
}

/** A refusal's code from its code or its English words (exact), else null. */
export function matchRefusalCodeOf(text: unknown): MatchRefusalCode | null {
  if (typeof text !== 'string') return null;
  const value = text.trim();
  for (const code of Object.keys(REFUSAL_WORDS) as MatchRefusalCode[]) if (value === code || value === REFUSAL_WORDS[code]) return code;
  return null;
}
