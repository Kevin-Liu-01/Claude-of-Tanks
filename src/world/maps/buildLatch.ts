// (2026-11-02 audit R2) What a destructible type's `build` records for its pool: the wall, fence and scenery kits' frozen
// contact band (sceneryKit.ts onLegacyCollision: a set per props build), their terrain-fit module, the drawn collider
// band, the adobe wall's envelope. The props build reads them after it built the intact module (props.ts
// refitDestructibleColliders, the wall fit, the broken build), and each reader
// fell back silently when it read nothing: the band derived from the drawn module, the fit on the drawn geometry, a
// hard-coded mud envelope — a different collision record set (the collision manifests the authority plays) with no
// error. Read before the build, they throw now; a later build replaces them (the band and fit are the last build's).

/** The value `build` recorded for `field` of `kind`; throws when read before the pool built the type. */
export function builtValue<T>(value: T | undefined, kind: string, field: string): T {
  if (value === undefined) throw new Error(`world/props: ${kind}.${field} read before its pool built the type (build runs first)`);
  return value;
}

// (webcontent-diet-278) A latched field's accessor is one module-level function per field, never a closure a build makes.
// V8 keeps an accessor's getter in the hidden class's descriptor array, and that array is shared along the transition
// tree with the long-lived record the entry was spread from (props.ts PROP_TYPE_REGISTRY.wallstone): a getter closure made
// in a world's build pinned the build's whole scope, the props group with it and through it the released world (73.5 MB of
// geometry on a phone, the second battle's heap; tools/battle-retention-probe.mjs). The values live in a cell keyed weakly
// by the entry, so nothing a build makes reaches a descriptor array; tools/accessor-closures.selftest.mjs keeps it so.
interface LatchCell { kind: string; values: Record<string, unknown> }
const cells = new WeakMap<object, LatchCell>();
const getters = new Map<string, (this: object) => unknown>();

function cellOf(target: object): LatchCell | undefined {
  // a spread copy carries the values (the spread reads them); an object made over the entry finds it up its chain
  for (let at: object | null = target; at; at = Object.getPrototypeOf(at)) {
    const cell = cells.get(at);
    if (cell) return cell;
  }
  return undefined;
}

function latchGetter(field: string, strict: boolean): (this: object) => unknown {
  const key = `${strict ? 'strict' : 'lenient'}:${field}`;
  let getter = getters.get(key);
  if (!getter) {
    getter = strict
      ? function strictLatch(this: object) { const cell = cellOf(this); return builtValue(cell?.values[field], cell?.kind ?? '?', field); }
      : function lenientLatch(this: object) { return cellOf(this)?.values[field]; };
    getters.set(key, getter);
  }
  return getter;
}

/** The values a type's `build` records, as the entry's own enumerable fields. */
export interface BuildLatch {
  set(field: string, value: unknown): void;
  /** The value recorded now (undefined before the build), for the build that replaces it. */
  peek<T>(field: string): T | undefined;
}

/**
 * Latch `fields` on `entry` (a kit's per-build destructible type): each an own enumerable accessor whose getter is shared
 * by every entry and build. Strict (the default), a read before the build throws (builtValue); lenient, it reads undefined.
 */
export function latchBuiltValues(entry: object, kind: string, fields: readonly string[], { strict = true } = {}): BuildLatch {
  const cell: LatchCell = { kind, values: {} };
  cells.set(entry, cell);
  for (const field of fields) Object.defineProperty(entry, field, { enumerable: true, configurable: true, get: latchGetter(field, strict) });
  return {
    set(field, value) { cell.values[field] = value; },
    peek<T>(field: string) { return cell.values[field] as T | undefined; },
  };
}
