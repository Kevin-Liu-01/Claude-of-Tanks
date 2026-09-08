/** Small diagnostics only: never retain images, canvases, textures or Error objects. */
export interface SourcedTextureResult {
  target: string;
  applied: boolean;
  failures: string[];
}

export interface SourcedTextureState {
  settled: boolean;
  results: SourcedTextureResult[];
  promise: Promise<void>;
}

/** Production remains non-blocking and fallback-safe; capture validates the receipt. */
export function createSourcedTextureState(
  terrain: Promise<SourcedTextureResult[]> | undefined,
  buildings: Promise<SourcedTextureResult[]> | undefined,
): SourcedTextureState {
  const state: SourcedTextureState = { settled: false, results: [], promise: Promise.resolve() };
  const jobs = [terrain, buildings].map((job, index) => {
    const target = index === 0 ? 'terrain' : 'buildings';
    return (job || Promise.reject(new Error(`missing ${target} readiness`))).catch((error) => [{
      target, applied: false, failures: [error instanceof Error ? error.message : String(error)],
    }]);
  });
  state.promise = Promise.all(jobs).then((results) => {
    state.results = results.flat();
    state.settled = true;
  });
  return state;
}
