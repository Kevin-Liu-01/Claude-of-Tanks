import type { RuntimeValue } from '../src/runtimeTypes.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';

const REPOSITORY_API = 'https://api.github.com/repos/Kevin-Liu-01/claude-of-tanks';
const SUCCESS_CACHE_CONTROL = 'public, max-age=60, s-maxage=900, stale-while-revalidate=86400';

interface GitHubStarsHandlerOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** One structured line per failed upstream call (INFRA-P7): GitHub's status and rate-limit budget, the cause. */
  warn?: (line: string) => void;
}

type GitHubStarsHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

function send(
  response: ServerResponse,
  status: number,
  body: RuntimeValue,
  cacheControl = 'private, no-store, max-age=0',
): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', cacheControl);
  response.end(JSON.stringify(body));
}

export function createGitHubStarsHandler({
  fetchImpl = globalThis.fetch,
  now = Date.now,
  warn = (line) => console.warn(line),
}: GitHubStarsHandlerOptions = {}): GitHubStarsHandler {
  return async function githubStars(request, response): Promise<void> {
    if (request.method !== 'GET') {
      response.setHeader('allow', 'GET');
      send(response, 405, { error: 'method_not_allowed' });
      return;
    }

    const startedAt = now();
    // Unauthenticated calls share Vercel's egress addresses (60 an hour each), so the rate-limit headers say whether a
    // failure is GitHub refusing the budget or GitHub being down.
    const upstreamFailure = (error: string, upstream: Response | null, reason: string): void => {
      const header = (name: string): string | null => upstream?.headers?.get(name) ?? null;
      warn(JSON.stringify({
        tag: 'cot-github-stars', event: 'upstream_failure', error, upstreamStatus: upstream ? upstream.status : null, reason,
        rateLimitRemaining: header('x-ratelimit-remaining'), rateLimitReset: header('x-ratelimit-reset'),
        latencyMs: Math.max(0, now() - startedAt),
      }));
    };
    let upstream: Response | null = null;
    try {
      upstream = await fetchImpl(REPOSITORY_API, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'claude-of-tanks-star-counter',
        },
        signal: AbortSignal.timeout(4_000),
      });
      if (!upstream.ok) {
        upstreamFailure('github_unavailable', upstream, 'http');
        send(response, 503, { error: 'github_unavailable' });
        return;
      }

      const repository: RuntimeValue = await upstream.json();
      if (!repository || typeof repository !== 'object') {
        upstreamFailure('github_response_invalid', upstream, 'invalid_body');
        send(response, 503, { error: 'github_response_invalid' });
        return;
      }
      const count = (repository as { stargazers_count?: RuntimeValue }).stargazers_count;
      if (typeof count !== 'number' || !Number.isInteger(count)) {
        upstreamFailure('github_response_invalid', upstream, 'invalid_body');
        send(response, 503, { error: 'github_response_invalid' });
        return;
      }

      send(response, 200, { stargazers_count: count }, SUCCESS_CACHE_CONTROL);
    } catch (error) {
      const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
      const reason = upstream ? 'invalid_json' : name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network';
      upstreamFailure('github_unavailable', upstream, reason);
      send(response, 503, { error: 'github_unavailable' });
    }
  };
}

export default createGitHubStarsHandler();
