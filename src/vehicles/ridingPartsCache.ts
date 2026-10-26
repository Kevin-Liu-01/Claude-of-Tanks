// The riding cradles' and riding stations' stored parts (profiles/kit.ts): a riding emplacement's yaw stage, cradle and
// gun are built once per option set and every build takes copies. A cache key is the fitting's prefix and the JSON of
// its geometric options (kit.ts ridingCradleKey), so a worker can build any entry from its key alone: the Garage's
// riding-parts prebuild (game/ridingPartsPrebuild.ts) seeds entries here from the workshop worker before the builds that
// need them, and a build that finds none still builds its own in-line (UI-LOCKDOWN E, 2026-10-25). The wire the worker
// posts them on is ridingPartsWire.ts (kept out of the boot chunks kit.ts rides in).
import type * as THREE from 'three';
import type { RidingCradleFit } from './machineGunGeometry.ts';

type StoredSlots = readonly (readonly [string, readonly THREE.BufferGeometry[]])[][];

export const RIDING_CRADLE_PARTS = new Map<string, { readonly parts: StoredSlots; readonly fit: RidingCradleFit }>();
export const RIDING_STATION_PARTS = new Map<string, StoredSlots>();
