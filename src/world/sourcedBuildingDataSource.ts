import { Source, type Texture } from 'three';

// Only final, immutable building normal/surface canvases enter this table.
// A weak key adds no residency beyond the existing canvas cache/live views.
// Three owns GPU reference counts separately for each Source + sampler policy.
const sources = new WeakMap<HTMLCanvasElement, Source<HTMLCanvasElement>>();

/** Keep each Texture/UV owner, but reuse immutable pixel storage. Replacing a
 * shared Source's data through texture.image would also change its siblings. */
export function replaceSourcedBuildingDataImage(
  texture: Texture, canvas: HTMLCanvasElement,
): void {
  // Release the old allocation while its original Source is still attached.
  texture.dispose();
  let source = sources.get(canvas);
  if (!source) {
    source = new Source(canvas);
    sources.set(canvas, source);
  }
  texture.source = source;
  texture.needsUpdate = true;
}
