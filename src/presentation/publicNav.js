const mountStars = () => import('../ui/githubStars.js')
  .then(({ mountGitHubStars }) => mountGitHubStars(document));

window.setTimeout(() => {
  if ('requestIdleCallback' in window) requestIdleCallback(mountStars, { timeout: 2500 });
  else mountStars();
}, 2400);
