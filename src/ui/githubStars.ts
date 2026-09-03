import type { RuntimeValue } from '../runtimeTypes.ts';
const REPOSITORY_STATS_ENDPOINT = '/api/github-stars';
const STAR_CACHE_KEY = 'cot:github-stars';
const STAR_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const STATIC_PREVIEW_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

const COMPACT_NUMBER = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const FULL_NUMBER = new Intl.NumberFormat('en');
const starNodes = new Set<Element>();
const intentBoundControls = new WeakSet<HTMLAnchorElement>();
let activeRequest: Promise<number | null> | null = null;
let memoryCache: { count: number; savedAt: number } | null = null;

type GitHubStarState = 'loading' | 'ready' | 'unavailable';

function githubControlFor(node: Element): HTMLAnchorElement | null {
  const control = node.closest<HTMLAnchorElement>('a[href*="github.com/Kevin-Liu-01/"]');
  if (control && !control.dataset.githubLabel) {
    control.dataset.githubLabel = control.getAttribute('aria-label') ||
      'Claude of Tanks on GitHub';
  }
  return control;
}

function setGitHubStarState(
  node: Element,
  state: GitHubStarState,
  count?: number,
): void {
  const status = node as HTMLElement;
  status.dataset.githubStarsState = state;
  const control = githubControlFor(node);
  const baseLabel = control?.dataset.githubLabel || 'Claude of Tanks on GitHub';

  if (state === 'ready' && count !== undefined) {
    const fullCount = FULL_NUMBER.format(count);
    node.textContent = formatGitHubStarCount(count);
    node.removeAttribute('aria-busy');
    node.setAttribute('aria-label', `${fullCount} GitHub stars`);
    control?.setAttribute('aria-label', `${baseLabel}, ${fullCount} stars`);
    return;
  }

  node.textContent = '';
  if (state === 'loading') {
    node.setAttribute('aria-busy', 'true');
    node.setAttribute('aria-label', 'Loading GitHub star count');
    control?.setAttribute('aria-label', `${baseLabel}, loading star count`);
    return;
  }

  node.removeAttribute('aria-busy');
  node.setAttribute('aria-label', 'GitHub star count unavailable');
  control?.setAttribute('aria-label', `${baseLabel}, star count unavailable`);
}

export function repositoryStatsEndpointAvailable(
  locationLike: Pick<Location, 'hostname' | 'protocol'> | null | undefined = globalThis.location,
): boolean {
  if (!locationLike) return true;
  if (locationLike.protocol === 'file:') return false;
  return !STATIC_PREVIEW_HOSTS.has(locationLike.hostname.toLowerCase());
}

export function formatGitHubStarCount(count: number): string {
  return COMPACT_NUMBER.format(count);
}

function renderGitHubStarCount(count: number): void {
  for (const node of starNodes) {
    setGitHubStarState(node, 'ready', count);
  }
}

function renderGitHubStarLoading(nodes: Iterable<Element> = starNodes): void {
  for (const node of nodes) setGitHubStarState(node, 'loading');
}

function renderGitHubStarUnavailable(): void {
  for (const node of starNodes) {
    const status = node as HTMLElement;
    if (status.dataset.githubStarsState === 'loading') {
      setGitHubStarState(node, 'unavailable');
    }
  }
}

function readCachedStars(): { count: number; savedAt: number } | null {
  if (memoryCache) return memoryCache;
  try {
    const cached: RuntimeValue = JSON.parse(localStorage.getItem(STAR_CACHE_KEY) || 'null');
    if (!cached || typeof cached !== 'object') return null;
    const { count, savedAt } = cached as { count?: RuntimeValue; savedAt?: RuntimeValue };
    if (typeof count !== 'number' || !Number.isInteger(count) ||
        typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return null;
    memoryCache = { count, savedAt };
    return memoryCache;
  } catch (_) {
    return null;
  }
}

function writeCachedStars(count: number): void {
  memoryCache = { count, savedAt: Date.now() };
  try {
    localStorage.setItem(STAR_CACHE_KEY, JSON.stringify(memoryCache));
  } catch (_) {
    // Storage can be blocked without affecting the GitHub controls.
  }
}

async function fetchGitHubStars(): Promise<number | null> {
  try {
    const response = await fetch(REPOSITORY_STATS_ENDPOINT, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      renderGitHubStarUnavailable();
      return null;
    }
    const repository: RuntimeValue = await response.json();
    if (!repository || typeof repository !== 'object') {
      renderGitHubStarUnavailable();
      return null;
    }
    const count = (repository as { stargazers_count?: RuntimeValue }).stargazers_count;
    if (typeof count !== 'number' || !Number.isInteger(count)) {
      renderGitHubStarUnavailable();
      return null;
    }
    const verifiedCount = count;
    renderGitHubStarCount(verifiedCount);
    writeCachedStars(verifiedCount);
    return verifiedCount;
  } catch (_) {
    renderGitHubStarUnavailable();
    return null;
  }
}

/** Refresh through the same-origin cached endpoint without blocking UI startup. */
export function refreshGitHubStars(): Promise<number | null> {
  const cached = readCachedStars();
  if (cached && Date.now() - cached.savedAt < STAR_CACHE_TTL_MS) {
    renderGitHubStarCount(cached.count);
    return Promise.resolve(cached.count);
  }

  // Vite's static production preview intentionally has no serverless API
  // routes. Avoid a known 404 and resolve the spinner honestly; real
  // deployments continue to refresh through the same-origin cached handler.
  if (!repositoryStatsEndpointAvailable()) {
    renderGitHubStarUnavailable();
    return Promise.resolve(null);
  }

  if (!activeRequest) {
    activeRequest = fetchGitHubStars().finally(() => { activeRequest = null; });
  }
  return activeRequest;
}

function bindIntentRetry(nodes: Element[]): void {
  for (const node of nodes) {
    const control = node.closest<HTMLAnchorElement>('a[href*="github.com/Kevin-Liu-01/"]');
    if (!control || intentBoundControls.has(control)) continue;
    intentBoundControls.add(control);
    const refresh = (): void => { void refreshGitHubStars(); };
    control.addEventListener('pointerenter', refresh, { once: true, passive: true });
    control.addEventListener('focus', refresh, { once: true });
  }
}

/**
 * Register repository star nodes, render a verified cached value or loading
 * state synchronously, then refresh in the background. Repeated mounts share
 * one request and never present an invented numeric fallback.
 */
export function mountGitHubStars(root: Document | Element = document): Promise<number | null> {
  const mountedNodes: Element[] = [];
  if ('matches' in root && root.matches('[data-github-stars]')) mountedNodes.push(root);
  for (const node of root.querySelectorAll<Element>('[data-github-stars]')) mountedNodes.push(node);
  for (const node of mountedNodes) starNodes.add(node);
  if (!starNodes.size) return Promise.resolve(null);

  const cached = readCachedStars();
  if (cached) renderGitHubStarCount(cached.count);
  else renderGitHubStarLoading(mountedNodes);
  bindIntentRetry(mountedNodes);
  return refreshGitHubStars();
}
