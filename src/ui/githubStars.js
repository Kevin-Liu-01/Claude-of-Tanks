/**
 * GitHub stars are decorative release metadata, not a boot dependency.
 *
 * A direct browser request to api.github.com is rate-limited by public IP.
 * Fresh players behind a shared NAT therefore received noisy 403 responses,
 * and both the boot and Garage mounts could retry the same unavailable
 * service. Keep the last release-verified value deterministic and network
 * silent. Updating it belongs to the release/docs workflow, never runtime.
 */
export const FALLBACK_GITHUB_STAR_COUNT = 154;

const COMPACT_NUMBER = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const FULL_NUMBER = new Intl.NumberFormat('en');
const starNodes = new Set();

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
      control.dataset.githubLabel = control.getAttribute('aria-label') ||
        'Claude of Tanks on GitHub';
    }
    control.setAttribute('aria-label', `${control.dataset.githubLabel}, ${fullCount} stars`);
  }
}

/**
 * Retained for compatibility with existing mounts. The refresh is deliberately
 * local: callers get a resolved receipt without issuing third-party traffic.
 */
export function refreshGitHubStars() {
  renderGitHubStarCount(FALLBACK_GITHUB_STAR_COUNT);
  return Promise.resolve(FALLBACK_GITHUB_STAR_COUNT);
}

/** Register every repository star-count node under root without network I/O. */
export function mountGitHubStars(root = document) {
  if (root?.matches?.('[data-github-stars]')) starNodes.add(root);
  for (const node of root?.querySelectorAll?.('[data-github-stars]') || []) starNodes.add(node);
  if (!starNodes.size) return Promise.resolve(null);
  return refreshGitHubStars();
}
