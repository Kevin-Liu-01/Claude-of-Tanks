const REPOSITORY_API = 'https://api.github.com/repos/Kevin-Liu-01/claude-of-tanks';
const STAR_CACHE_KEY = 'cot:github-stars';
const STAR_CACHE_TTL_MS = 15 * 60 * 1000;
export const FALLBACK_GITHUB_STAR_COUNT = 145;
const COMPACT_NUMBER = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const FULL_NUMBER = new Intl.NumberFormat('en');

const starNodes = new Set();
const intentBoundControls = new WeakSet();
let activeRequest = null;

export function formatGitHubStarCount(count) {
  return COMPACT_NUMBER.format(count);
}

function renderGitHubStarCount(count) {
  const compactCount = formatGitHubStarCount(count);
  const fullCount = FULL_NUMBER.format(count);

  for (const node of starNodes) {
    node.textContent = compactCount;
    const control = node.closest('a[href*="github.com/Kevin-Liu-01/"]');
    if (!control) continue;
    if (!control.dataset.githubLabel) {
      control.dataset.githubLabel = control.getAttribute('aria-label') || 'Claude of Tanks on GitHub';
    }
    control.setAttribute('aria-label', `${control.dataset.githubLabel}, ${fullCount} stars`);
  }
}

function readCachedStars() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(STAR_CACHE_KEY));
    if (!Number.isInteger(cached?.count) || !Number.isFinite(cached?.savedAt)) return null;
    return cached;
  } catch (_) {
    return null;
  }
}

function writeCachedStars(count) {
  try {
    sessionStorage.setItem(STAR_CACHE_KEY, JSON.stringify({ count, savedAt: Date.now() }));
  } catch (_) {
    // Storage can be blocked without affecting the GitHub controls.
  }
}

async function fetchGitHubStars() {
  try {
    const response = await fetch(REPOSITORY_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) return null;
    const repository = await response.json();
    if (!Number.isInteger(repository.stargazers_count)) return null;
    renderGitHubStarCount(repository.stargazers_count);
    writeCachedStars(repository.stargazers_count);
    return repository.stargazers_count;
  } catch (_) {
    // Keep the last verified numeric fallback when GitHub is unavailable.
    return null;
  }
}

/**
 * Refresh the decorative repository count after explicit user intent.
 * Keeping this request off the boot path avoids making a fresh game session
 * depend on GitHub's unauthenticated API rate limit or network availability.
 * @returns {Promise<number|null>}
 */
export function refreshGitHubStars() {
  const cached = readCachedStars();
  if (cached && Date.now() - cached.savedAt < STAR_CACHE_TTL_MS) {
    renderGitHubStarCount(cached.count);
    return Promise.resolve(cached.count);
  }

  if (!activeRequest) {
    activeRequest = fetchGitHubStars().finally(() => { activeRequest = null; });
  }
  return activeRequest;
}

function bindIntentRefresh(nodes) {
  for (const node of nodes) {
    const control = node.closest?.('a[href*="github.com/Kevin-Liu-01/"]');
    if (!control || intentBoundControls.has(control)) continue;
    intentBoundControls.add(control);
    const refresh = () => refreshGitHubStars();
    control.addEventListener('pointerenter', refresh, { once: true, passive: true });
    control.addEventListener('focus', refresh, { once: true });
  }
}

/**
 * Register every repository star-count node under root. The verified fallback
 * is rendered synchronously; a live refresh waits for pointer or keyboard
 * intent on the repository control so boot and battle entry never make a
 * third-party request. Repeated mounts share both listeners and requests.
 * @param {Document|Element} root
 * @returns {Promise<number|null>}
 */
export function mountGitHubStars(root = document) {
  const mountedNodes = [];
  if (root?.matches?.('[data-github-stars]')) mountedNodes.push(root);
  for (const node of root?.querySelectorAll?.('[data-github-stars]') || []) mountedNodes.push(node);
  for (const node of mountedNodes) starNodes.add(node);
  if (!starNodes.size) return Promise.resolve(null);

  const cached = readCachedStars();
  renderGitHubStarCount(cached?.count ?? FALLBACK_GITHUB_STAR_COUNT);
  bindIntentRefresh(mountedNodes);
  return Promise.resolve(cached?.count ?? FALLBACK_GITHUB_STAR_COUNT);
}
