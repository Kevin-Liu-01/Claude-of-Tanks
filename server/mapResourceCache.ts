export interface MapResourceLease<T> {
  value: T;
  release(): void;
}

/** Active owners are explicit; only the small idle LRU is retained speculatively. */
export function createMapResourceCache<T>(build: (id: string) => T, idleLimit = 2) {
  if (!Number.isSafeInteger(idleLimit) || idleLimit < 0) {
    throw new TypeError('map resource idle limit must be a nonnegative integer');
  }
  const active = new Map<string, { value: T; refs: number }>();
  const idle = new Map<string, T>();
  let builds = 0;

  function remember(id: string, value: T): void {
    idle.delete(id);
    idle.set(id, value);
    while (idle.size > idleLimit) idle.delete(idle.keys().next().value!);
  }

  function get(id: string): T {
    const owned = active.get(id);
    if (owned) return owned.value;
    if (idle.has(id)) {
      const value = idle.get(id)!;
      remember(id, value);
      return value;
    }
    const value = build(id);
    builds++;
    remember(id, value);
    return value;
  }

  function acquire(id: string): MapResourceLease<T> {
    let entry = active.get(id);
    if (!entry) {
      entry = { value: get(id), refs: 0 };
      idle.delete(id);
      active.set(id, entry);
    }
    entry.refs++;
    const owned = entry;
    let released = false;
    return {
      value: owned.value,
      release() {
        if (released) return;
        released = true;
        if (--owned.refs !== 0) return;
        active.delete(id);
        remember(id, owned.value);
      },
    };
  }

  return {
    get,
    acquire,
    stats() {
      let activeLeases = 0;
      for (const entry of active.values()) activeLeases += entry.refs;
      return { activeMaps: active.size, activeLeases, idleMaps: idle.size, idleLimit, builds };
    },
  };
}
