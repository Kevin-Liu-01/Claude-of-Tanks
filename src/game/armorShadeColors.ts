/**
 * armorShadeColors.ts — the armour shading's three colours (game/armorAimOverlay.ts paints them on the plates in the
 * sight; ui/noticeDiagrams.ts draws its picture of them), in one leaf so the hints' lazy chunk never loads three.js.
 * Copyright © 2026 Kevin B. Liu.
 */
/** A plate the loaded round does not defeat. */
export const ARMOR_SHADE_STOPS = 0xe53d35;
/** A plate at the edge of what it defeats. */
export const ARMOR_SHADE_EDGE = 0xf0aa35;
/** A plate the loaded round goes through. */
export const ARMOR_SHADE_PASSES = 0x48d985;
