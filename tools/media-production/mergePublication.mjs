/** A partial capture refresh replaces matching URLs without hiding older films.
 * Retained assets keep their original provenance; a new map capture does not
 * certify that an older film was rendered or reviewed again. */
export function mergePublication(previous, fresh) {
  if (!previous) return fresh;
  const replaced = new Set(fresh.assets.map(asset => asset.src));
  const retained = (previous.assets ?? []).filter(asset => !replaced.has(asset.src));
  const retainedUrls = new Set(retained.map(asset => asset.src));
  const media = Object.fromEntries(Object.entries(previous.media ?? {})
    .filter(([uri]) => retainedUrls.has(uri)));
  const recipeIds = new Set(Object.values(media));
  const recipes = Object.fromEntries(Object.entries(previous.recipes ?? {})
    .filter(([id]) => recipeIds.has(id)));
  const earlierBatches = (previous.retainedBatches ?? []).map(batch => ({
    ...batch, assets: batch.assets.filter(asset => retainedUrls.has(asset.src)),
  })).filter(batch => batch.assets.length);
  const earlierUrls = new Set(earlierBatches.flatMap(batch => batch.assets.map(asset => asset.src)));
  const priorBatchAssets = retained.filter(asset => !earlierUrls.has(asset.src));
  if (priorBatchAssets.length) earlierBatches.push({
    created: previous.created, revision: previous.revision,
    sourceDigest: previous.sourceDigest, review: previous.review, assets: priorBatchAssets,
  });
  return {
    ...fresh,
    shots: [...fresh.shots, ...(previous.shots ?? []).filter(shot => retainedUrls.has(shot.src))],
    films: [...fresh.films, ...(previous.films ?? []).filter(film => retainedUrls.has(film.src))],
    assets: [...fresh.assets, ...retained],
    media: { ...media, ...fresh.media }, recipes: { ...recipes, ...fresh.recipes },
    retainedBatches: earlierBatches,
  };
}
