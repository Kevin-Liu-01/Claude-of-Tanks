/**
 * Values accepted at JavaScript runtime boundaries before domain validation.
 *
 * This deliberately enumerates the ECMAScript value space instead of using
 * TypeScript's opaque top type. Callers must still narrow objects to their
 * subsystem contract before reading fields or invoking behavior.
 */
// `{}` is TypeScript's non-nullish value space (including primitives and
// callable objects). Adding both nullish values makes this an exact boundary
// type for arbitrary JavaScript inputs while still requiring a type guard
// before object property access. Do not add `void`: although JavaScript void
// evaluates to undefined, TypeScript gives it deliberately stricter
// assignability rules that make a top-value alias unsound at callback seams.
export type RuntimeValue = {} | null | undefined;

/** Values that can cross the game's JSON network and persistence boundaries. */
export type JsonPrimitive = null | string | number | boolean;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
