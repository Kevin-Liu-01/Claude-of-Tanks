import type { IncomingMessage, ServerResponse } from 'node:http';

const REPOSITORY_API = 'https://api.github.com/repos/Kevin-Liu-01/claude-of-tanks';
const SUCCESS_CACHE_CONTROL = 'public, max-age=60, s-maxage=900, stale-while-revalidate=86400';

export interface GitHubStarsHandlerOptions {
  fetchImpl?: typeof fetch;
}

export type GitHubStarsHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

function send(
  response: ServerResponse,
  status: number,
  body: unknown,
  cacheControl = 'private, no-store, max-age=0',
): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', cacheControl);
  response.end(JSON.stringify(body));
}

export function createGitHubStarsHandler({
  fetchImpl = globalThis.fetch,
}: GitHubStarsHandlerOptions = {}): GitHubStarsHandler {
  return async function githubStars(request, response): Promise<void> {
    if (request.method !== 'GET') {
      response.setHeader('allow', 'GET');
      send(response, 405, { error: 'method_not_allowed' });
      return;
    }

    try {
      const upstream = await fetchImpl(REPOSITORY_API, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'claude-of-tanks-star-counter',
        },
        signal: AbortSignal.timeout(4_000),
      });
      if (!upstream.ok) {
        send(response, 503, { error: 'github_unavailable' });
        return;
      }

      const repository: unknown = await upstream.json();
      if (!repository || typeof repository !== 'object') {
        send(response, 503, { error: 'github_response_invalid' });
        return;
      }
      const count = (repository as { stargazers_count?: unknown }).stargazers_count;
      if (typeof count !== 'number' || !Number.isInteger(count)) {
        send(response, 503, { error: 'github_response_invalid' });
        return;
      }

      send(response, 200, { stargazers_count: count }, SUCCESS_CACHE_CONTROL);
    } catch (_) {
      send(response, 503, { error: 'github_unavailable' });
    }
  };
}

export default createGitHubStarsHandler();
