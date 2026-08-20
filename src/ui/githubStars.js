const REPOSITORY_API = 'https://api.github.com/repos/Kevin-Liu-01/claude-of-tanks';
const STAR_CACHE_KEY = 'cot:github-stars';
const STAR_CACHE_TTL_MS = 15 * 60 * 1000;

const starNodes = new Set();
let activeRequest = null;

export function formatGitHubStarCount(count) {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(count);
}

function renderGitHubStarCount(count) {
  const compactCount = formatGitHubStarCount(count);
  const fullCount = new Intl.NumberFormat('en').format(count);

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
    // Keep the readable “Stars” fallback when GitHub is unavailable.
    return null;
  }
}

/**
 * Register every repository star-count node under root and refresh them from
 * one session-cached GitHub request. Repeated mounts share the same request so
 * the inline boot screen and the garage never issue duplicate API calls.
 * @param {Document|Element} root
 * @returns {Promise<number|null>}
 */
export function mountGitHubStars(root = document) {
  if (root?.matches?.('[data-github-stars]')) starNodes.add(root);
  for (const node of root?.querySelectorAll?.('[data-github-stars]') || []) starNodes.add(node);
  if (!starNodes.size) return Promise.resolve(null);

  const cached = readCachedStars();
  if (cached) renderGitHubStarCount(cached.count);
  if (cached && Date.now() - cached.savedAt < STAR_CACHE_TTL_MS) {
    return Promise.resolve(cached.count);
  }

  if (!activeRequest) {
    activeRequest = fetchGitHubStars().finally(() => { activeRequest = null; });
  }
  return activeRequest;
}
