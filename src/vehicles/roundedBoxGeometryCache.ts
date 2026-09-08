// CPU-only immutable templates. Callers always own their returned geometry;
// transforms, UV painting and disposal cannot mutate another vehicle's stock.
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

interface TemplateEntry {
  geometry: RoundedBoxGeometry;
  bytes: number;
}

function geometryBytes(geometry: RoundedBoxGeometry): number {
  let bytes = geometry.index?.array.byteLength ?? 0;
  for (const attribute of Object.values(geometry.attributes)) {
    bytes += attribute.array.byteLength;
  }
  return bytes;
}

function copyTemplate(template: RoundedBoxGeometry): RoundedBoxGeometry {
  // BufferGeometry.clone() invokes the derived default constructor first.
  // For RoundedBoxGeometry that would recompute the expensive rounded shell.
  // A zero-segment shell retains its real prototype/type/parameter contracts,
  // while inherited copy() replaces every buffer with an independent copy.
  const geometry = new RoundedBoxGeometry(1, 1, 1, 0).copy(template);
  // Three's copy() aliases userData. Authored owners attach equipment/armor
  // receipts here, so preserve the constructor's fresh empty metadata too.
  geometry.userData = {};
  return geometry;
}

export function createRoundedBoxGeometryCache(maxEntries = 128, maxBytes = 4 * 1024 * 1024) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1
    || !Number.isFinite(maxBytes) || maxBytes < 1) throw new RangeError('Invalid rounded-box cache limits');
  const entries = new Map<string, TemplateEntry>();
  let bytes = 0, hits = 0, misses = 0;

  function evictOldest(): void {
    const oldest = entries.entries().next().value;
    if (!oldest) return;
    entries.delete(oldest[0]);
    bytes -= oldest[1].bytes;
    oldest[1].geometry.dispose();
  }

  function geometry(width: number, height: number, depth: number, segments: number, radius: number): RoundedBoxGeometry {
    // Preserve the constructor's historical handling of exceptional inputs;
    // never quantize dimensions or coalesce +0/-0/NaN cache identities.
    const values = [width, height, depth, segments, radius];
    if (!values.every(value => Number.isFinite(value) && value > 0)) {
      return new RoundedBoxGeometry(width, height, depth, segments, radius);
    }
    const key = values.join('/');
    const existing = entries.get(key);
    if (existing) {
      hits++;
      entries.delete(key);
      entries.set(key, existing);
      return copyTemplate(existing.geometry);
    }
    misses++;
    const template = new RoundedBoxGeometry(width, height, depth, segments, radius);
    const size = geometryBytes(template);
    if (size > maxBytes) return template;
    while (entries.size >= maxEntries || bytes + size > maxBytes) evictOldest();
    entries.set(key, { geometry: template, bytes: size });
    bytes += size;
    return copyTemplate(template);
  }

  return {
    geometry,
    clear(): void { while (entries.size) evictOldest(); },
    stats: () => ({ entries: entries.size, bytes, hits, misses, maxEntries, maxBytes }),
  };
}

const templates = createRoundedBoxGeometryCache();
export const cachedRoundedBoxGeometry = templates.geometry;
