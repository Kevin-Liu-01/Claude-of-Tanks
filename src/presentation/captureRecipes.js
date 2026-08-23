const RECIPES_URL = '/media/capture-recipes-r1.json';
let recipesPromise;

export function loadCaptureRecipes() {
  if (!recipesPromise) {
    recipesPromise = fetch(RECIPES_URL).then((response) => {
      if (!response.ok) throw new Error(`Capture recipes unavailable (${response.status})`);
      return response.json();
    });
  }
  return recipesPromise;
}

export function mediaPath(value) {
  const source = String(value || '');
  if (!source) return '';
  try { return new URL(source, globalThis.location?.href || 'http://localhost/').pathname; }
  catch (_) { return source; }
}

export function recipeForMedia(catalog, value) {
  const id = catalog?.media?.[mediaPath(value)];
  return id ? catalog.recipes?.[id] || null : null;
}
