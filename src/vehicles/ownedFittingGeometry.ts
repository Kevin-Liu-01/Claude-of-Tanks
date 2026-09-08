import type { BufferGeometry } from 'three';

// Only fresh per-visual fitting merges are registered. Weak ownership neither
// retains dead visuals nor changes authored metadata/geometry receipts.
const owned = new WeakSet<BufferGeometry>();

export function ownFittingGeometry(geometry: BufferGeometry): void {
  owned.add(geometry);
}

/** Shared mesh references in one visual release their fitting buffer once. */
export function disposeOwnedFittingGeometry(geometry: BufferGeometry): boolean {
  if (!owned.delete(geometry)) return false;
  geometry.dispose();
  return true;
}
