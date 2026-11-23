/**
 * The build a recording names (replay-system-275, docs/REPLAY.md §7). Vite defines both at build time
 * (vite.config.ts; tools/matchBuild.ts resolveMatchBuild and resolveReplayDigest); a dev server, Node and the headless
 * tools read 'dev'. The local driver may not import src/mp, so the build line is read from its define here, not from
 * mp/wire/matchBuild.ts.
 */
declare const __COT_MATCH_BUILD__: string | undefined;
declare const __COT_REPLAY_DIGEST__: string | undefined;

export const REPLAY_BUILD: string = typeof __COT_MATCH_BUILD__ === 'string' && __COT_MATCH_BUILD__ ? __COT_MATCH_BUILD__ : 'dev';
export const REPLAY_DIGEST: string = typeof __COT_REPLAY_DIGEST__ === 'string' && __COT_REPLAY_DIGEST__ ? __COT_REPLAY_DIGEST__ : 'dev';

/** The version a recording of `digest` came from when this build cannot replay it, or null when it can ('dev' on either
 *  side is admitted: the checksums still stop a replay that drifts). The viewer words the refusal. */
export function replayRefusal(digest: string, build: string): { recordedOn: string } | null {
  if (digest === 'dev' || REPLAY_DIGEST === 'dev' || digest === REPLAY_DIGEST) return null;
  return { recordedOn: build.split(' ')[0] || '' };
}
