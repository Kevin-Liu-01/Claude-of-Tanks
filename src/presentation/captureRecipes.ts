import type { RuntimeValue } from '../runtimeTypes.ts';
const RECIPES_URL = '/media/capture-recipes-r1.json';
export interface CaptureRecipeCatalog {
  media: Record<string, string>;
  recipes: Record<string, RuntimeValue>;
}

let recipesPromise: Promise<CaptureRecipeCatalog> | undefined;

export function loadCaptureRecipes(): Promise<CaptureRecipeCatalog> {
  if (!recipesPromise) {
    recipesPromise = fetch(RECIPES_URL).then((response) => {
      if (!response.ok) throw new Error(`Capture recipes unavailable (${response.status})`);
      return response.json() as Promise<CaptureRecipeCatalog>;
    });
  }
  return recipesPromise;
}

export function mediaPath(value: RuntimeValue): string {
  const source = String(value || '');
  if (!source) return '';
  try { return new URL(source, globalThis.location?.href || 'http://localhost/').pathname; }
  catch (_) { return source; }
}

export function recipeForMedia(catalog: CaptureRecipeCatalog, value: RuntimeValue): RuntimeValue | null {
  const id = catalog?.media?.[mediaPath(value)];
  return id ? catalog.recipes?.[id] || null : null;
}
