const REPOSITORY_API = 'https://api.github.com/repos/Kevin-Liu-01/claude-of-tanks';
const STAR_CACHE_KEY = 'cot:github-stars';
const STAR_CACHE_TTL_MS = 15 * 60 * 1000;

const starNodes = [...document.querySelectorAll('[data-github-stars]')];

function formatStarCount(count) {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(count);
}

function renderStarCount(count) {
  const compactCount = formatStarCount(count);
  const fullCount = new Intl.NumberFormat('en').format(count);
  for (const node of starNodes) {
    node.textContent = compactCount;
    const link = node.closest('.public-nav__github');
    link?.setAttribute('aria-label', `Claude of Tanks on GitHub, ${fullCount} stars`);
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

async function mountGitHubStars() {
  if (!starNodes.length) return;
  const cached = readCachedStars();
  if (cached) renderStarCount(cached.count);
  if (cached && Date.now() - cached.savedAt < STAR_CACHE_TTL_MS) return;

  try {
    const response = await fetch(REPOSITORY_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) return;
    const repository = await response.json();
    if (!Number.isInteger(repository.stargazers_count)) return;
    renderStarCount(repository.stargazers_count);
    try {
      sessionStorage.setItem(STAR_CACHE_KEY, JSON.stringify({
        count: repository.stargazers_count,
        savedAt: Date.now(),
      }));
    } catch (_) {
      // A blocked storage API should not prevent the navigation from rendering.
    }
  } catch (_) {
    // Keep the readable “Stars” fallback when the GitHub API is unavailable.
  }
}

mountGitHubStars();
