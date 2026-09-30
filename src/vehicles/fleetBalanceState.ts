const finalized = new WeakSet<object>();
export const isFleetBalanceFinalized = (registry: object): boolean => finalized.has(registry);
export function markFleetBalanceFinalized(registry: object): void { finalized.add(registry); }
