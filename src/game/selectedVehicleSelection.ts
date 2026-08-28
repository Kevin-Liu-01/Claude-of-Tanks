interface SelectionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SelectedVehicleSelection {
  readonly id: string;
  set(id: string): void;
  remember(id: string): void;
  select(id: string): void;
}

export interface SelectedVehicleSelectionOptions {
  visibleIds: readonly string[];
  defaultId: string;
  storageKey?: string;
  getStorage?: () => SelectionStorage;
}

export function createSelectedVehicleSelection({
  visibleIds,
  defaultId,
  storageKey = 'cot.lastTank.v1',
  getStorage = () => globalThis.localStorage,
}: SelectedVehicleSelectionOptions): SelectedVehicleSelection {
  const visible = new Set(visibleIds);
  if (!visible.has(defaultId)) {
    throw new TypeError('selected vehicle default must be in the visible roster');
  }

  let id = defaultId;
  try {
    const remembered = getStorage().getItem(storageKey);
    if (remembered && visible.has(remembered)) id = remembered;
  } catch {
    // Storage may be unavailable in private or restricted browser contexts.
  }

  const set = (nextId: string): void => {
    if (typeof nextId === 'string' && nextId) id = nextId;
  };
  const remember = (nextId: string): void => {
    if (!visible.has(nextId)) return;
    try {
      getStorage().setItem(storageKey, nextId);
    } catch {
      // The in-memory selection remains valid for this page session.
    }
  };

  return {
    get id() { return id; },
    set,
    remember,
    select(nextId) {
      set(nextId);
      remember(nextId);
    },
  };
}
