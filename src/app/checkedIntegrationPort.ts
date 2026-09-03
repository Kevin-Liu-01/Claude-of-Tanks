import type { RuntimeValue } from '../runtimeTypes.ts';
/**
 * Validate a lazy phase adapter before narrowing it to the loaded owner's
 * exact parameter type. Callers derive T with Parameters<typeof owner> so the
 * bridge cannot silently drift from the module it activates.
 */
export function checkedIntegrationPort<T extends object>(
  value: object,
  label: string,
  requiredFunctions: readonly string[],
): T {
  const record = value as Record<string, RuntimeValue>;
  for (const key of requiredFunctions) {
    if (typeof record[key] !== 'function') {
      throw new TypeError(`${label} integration requires ${key}()`);
    }
  }
  return value as T;
}
