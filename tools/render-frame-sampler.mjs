/** Runs in the inspected page: measure submitted game frames, not idle rAF ticks. */
export function sampleRenderedFrames({ count, syncGpu = false, timeoutMs = 30000 }) {
  const { post, renderer } = window.__DEBUG;
  const original = post.render;
  const gl = renderer.getContext();
  return new Promise((resolve, reject) => {
    const samples = [];
    let warm = 8;
    let previous = null;
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      post.render = original;
      clearTimeout(timeout);
    };
    const timeout = setTimeout(() => {
      restore();
      reject(new Error(`Only ${samples.length}/${count} game frames rendered before timeout`));
    }, timeoutMs);
    post.render = function (...args) {
      const started = performance.now();
      const autoReset = renderer.info.autoReset;
      renderer.info.autoReset = false;
      renderer.info.reset();
      try {
        original.apply(this, args);
        // Opt-in throughput diagnostic. This serializes GPU completion, so it
        // is explicitly separate from native presentation interval metrics.
        if (syncGpu) gl.finish();
        const elapsed = performance.now() - started;
        if (warm > 0) warm--;
        else if (previous !== null) samples.push({
          intervalMs: started - previous,
          renderMs: elapsed,
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
        });
        previous = started;
        if (samples.length >= count) {
          restore();
          resolve({ syncGpu, samples });
        }
      } catch (error) {
        restore();
        reject(error);
        throw error;
      } finally {
        renderer.info.autoReset = autoReset;
      }
    };
  });
}
