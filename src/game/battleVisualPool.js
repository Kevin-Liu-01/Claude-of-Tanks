/**
 * Small detached cache for clean non-player battle visuals. Simulation owns
 * entities; this pool owns only reset scene graphs, so combat state can be
 * destroyed at the garage boundary without forcing every rematch to rebuild
 * the same procedural geometry.
 */
export function createBattleVisualPool({ capacity = 4 } = {}) {
  const limit = Math.max(0, capacity | 0);
  const entries = new Map();

  const disposeVisual = (visual) => {
    visual?.setVisible?.(false);
    visual?.dispose?.();
  };

  const release = (visual) => {
    if (!visual) return false;
    if (limit === 0 || !visual.specId || !visual.root) {
      disposeVisual(visual);
      return false;
    }
    try {
      visual.resetForGaragePresentation?.();
      visual.setVisible?.(false);
      visual.root.parent?.remove(visual.root);
    } catch (_) {
      disposeVisual(visual);
      return false;
    }

    const prior = entries.get(visual.specId);
    if (prior && prior !== visual) disposeVisual(prior);
    entries.delete(visual.specId);
    entries.set(visual.specId, visual);
    while (entries.size > limit) {
      const oldestId = entries.keys().next().value;
      const oldest = entries.get(oldestId);
      entries.delete(oldestId);
      disposeVisual(oldest);
    }
    return true;
  };

  const take = (specId) => {
    const visual = entries.get(specId) || null;
    if (!visual) return null;
    entries.delete(specId);
    try {
      visual.prepareForSimulation?.();
      return visual;
    } catch (_) {
      disposeVisual(visual);
      return null;
    }
  };

  const clear = () => {
    for (const visual of entries.values()) disposeVisual(visual);
    entries.clear();
  };

  return {
    release,
    take,
    clear,
    stats: () => ({ size: entries.size, capacity: limit, ids: [...entries.keys()] }),
  };
}
