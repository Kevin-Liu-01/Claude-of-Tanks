# 0180 — Browser action input is strict TypeScript

Status: accepted

## Decision

The browser device-to-action layer is `src/game/input.ts`. It exports one
strict `InputLayer` contract plus canonical action IDs, binding slots, gameplay
settings, and two-component input vectors. Keyboard, mouse, wheel, gamepad,
touch, rebinding, buffered-fire, and pointer-lock behavior remain one owner.

## Why

The former JavaScript object mixed persisted untrusted JSON, mutable binding
dictionaries, DOM event variants, gamepad state, and the public control API.
Callers could misspell an action or setting, use an invalid binding slot, or
assume a storage value had the expected shape without a compiler error.

## Consequences

- Every named action is a closed union derived from the action definition
  table; primary, secondary, and gamepad bindings cover that same union.
- Persisted data enters as `unknown` and is narrowed before assignment.
- DOM handlers use their concrete keyboard, mouse, wheel, and generic event
  shapes; pointer-lock callbacks and cursor coordinates are explicitly nullable.
- The retained per-frame state, aim vectors, maps, and sets preserve the
  existing allocation behavior and fire-edge timing.
- No visual, input feel, binding default, simulation, or networking behavior
  changes with the migration.
- Focused input, frame sampling, settings, responsive mobile, typecheck, and
  production-build gates certify the boundary.
