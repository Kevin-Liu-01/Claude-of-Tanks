import { BufferAttribute, type BufferGeometry } from 'three';
import type { ModuleStateName } from '../sim/damage.ts';

interface Range { module: string; geometry: BufferGeometry; start: number; count: number; original: Float32Array | null }
/** Only native weapon stock is scorched. Shared camo/materials and neighbouring
 * armor keep their paint. Originals are captured on first damage and restored
 * on repair/reuse; this never changes a weapon's authoritative hit shape. */
export class WeaponDamageVisuals {
  private ranges: Range[] = [];
  private states = new Map<string, ModuleStateName>();
  bind(parts: readonly BufferGeometry[], merged: BufferGeometry): void {
    if (merged.index || !(merged.getAttribute('color') instanceof BufferAttribute)) return;
    let start = 0;
    for (const part of parts) {
      const count = part.index?.count ?? part.getAttribute('position').count;
      const module = part.userData.auxiliaryStation?.stage === 'pitch' ? 'roofGun' : part.userData.weaponStock?.module;
      if (module) this.ranges.push({module, geometry: merged, start, count, original: null});
      start += count;
    }
  }
  set(module: string, state: ModuleStateName): void {
    if ((this.states.get(module) ?? 'ok') === state) return;
    this.states.set(module, state);
    for (const range of this.ranges) {
      if (range.module !== module) continue;
      const color = range.geometry.getAttribute('color') as BufferAttribute;
      const data = color.array as Float32Array, first = range.start * 3, end = first + range.count * 3;
      range.original ??= data.slice(first, end);
      const multiplier = state === 'red' ? .22 : state === 'yellow' ? .62 : 1;
      for (let i = first; i < end; i++) data[i] = range.original[i - first] * multiplier;
      color.needsUpdate = true;
    }
  }
  reset(): void { for (const module of this.states.keys()) this.set(module, 'ok'); }
}
