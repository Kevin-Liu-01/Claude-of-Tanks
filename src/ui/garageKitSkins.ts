import type { GarageVariant } from '../game/garageVariants.ts';
import type { GarageKitSkin } from './garageKitGeometry.ts';

/**
 * The region skin (garage r9 design 0.4): one row per Garage. Every kit piece takes it, so the same 200 L drum, bench
 * or overhead crane reads native in each place: Sirocco's sand-blasted tan kit with drift on every ledge, Frosthollow's
 * dark green kit under snow caps, Saltmere's galvanised kit blooming with salt, Cinder's sooted black railway steel.
 * Colours stay weathered (rejudge6, 2026-10-15: never toy-saturated) and the safety accent is a worn yellow or orange.
 *
 * `field_shed` is Verdant's hall: clean but well used, the motor pool's own grey-green and the brand-accent yellow.
 */
export const GARAGE_KIT_SKINS: Readonly<Record<GarageVariant['architecture'], GarageKitSkin>> = Object.freeze({
  field_shed: Object.freeze({
    id: 'verdant-hall', paint: 0x55604f, accent: 0xc39a35, steel: 0x5a605e, primer: 0x6e3b30, wood: 0x7a6040,
    rubber: 0x18191a, concrete: 0x8a8a84, canvas: 0x5c6146, ground: 0x4b4b46, weathering: 'clean', wear: 0.25,
  }),
  shade_depot: Object.freeze({
    id: 'sirocco-sand', paint: 0xa48b62, accent: 0xc28a3a, steel: 0x9a8562, primer: 0x7a4a34, wood: 0x8a6c48,
    rubber: 0x1c1a18, concrete: 0xb3a58c, canvas: 0xb9a07a, ground: 0xbfa678, weathering: 'sand', wear: 0.5,
  }),
  repair_bunker: Object.freeze({
    id: 'frosthollow-snow', paint: 0x4e5a4c, accent: 0xc0a040, steel: 0x505a54, primer: 0x6a3a30, wood: 0x6a5238,
    rubber: 0x161718, concrete: 0x8c8f8e, canvas: 0x56604c, ground: 0x7a7e80, weathering: 'snow', wear: 0.4,
  }),
  brick_arsenal: Object.freeze({
    id: 'steinburg-oxide', paint: 0x4f5546, accent: 0xb9953a, steel: 0x6b4638, primer: 0x7a3e30, wood: 0x6e5236,
    rubber: 0x18191a, concrete: 0x8e8a84, canvas: 0x5a5a48, ground: 0x5a5650, weathering: 'clean', wear: 0.45,
  }),
  naval_drydock: Object.freeze({
    id: 'saltmere-salt', paint: 0x4f6268, accent: 0xc39a3c, steel: 0x8b9296, primer: 0x7a4632, wood: 0x76674f,
    rubber: 0x161819, concrete: 0x92948f, canvas: 0x5d6a6a, ground: 0x6c6c66, weathering: 'salt', wear: 0.55,
  }),
  rail_roundhouse: Object.freeze({
    id: 'cinder-coal', paint: 0x3a3d3a, accent: 0xb38a38, steel: 0x2f3234, primer: 0x6a3a2e, wood: 0x4e3e2c,
    rubber: 0x141515, concrete: 0x6c6a66, canvas: 0x45473e, ground: 0x2e2c2a, weathering: 'coal', wear: 0.6,
  }),
  rain_canopy: Object.freeze({
    id: 'monsoon-mud', paint: 0x4f6a52, accent: 0xb99a3c, steel: 0x4f6a52, primer: 0x6e3a2e, wood: 0x6a5234,
    rubber: 0x151616, concrete: 0x7c7e74, canvas: 0x3f6a5a, ground: 0x7a4a32, weathering: 'mud', wear: 0.5,
  }),
  rock_cavern: Object.freeze({
    id: 'glacier-snow', paint: 0x5c6668, accent: 0xc3a03e, steel: 0x6c7478, primer: 0x6e3c32, wood: 0x6e5a40,
    rubber: 0x161718, concrete: 0x8e9294, canvas: 0x5e6862, ground: 0x80868a, weathering: 'snow', wear: 0.35,
  }),
  recovery_yard: Object.freeze({
    id: 'redrock-dust', paint: 0x8a7a5c, accent: 0xc0843a, steel: 0x8a5a3a, primer: 0x7a4030, wood: 0x80603e,
    rubber: 0x1c1816, concrete: 0x8e7866, canvas: 0xa88a64, ground: 0xa5603e, weathering: 'reddust', wear: 0.55,
  }),
  factory_line: Object.freeze({
    id: 'ironworks-heat', paint: 0x4a4e50, accent: 0xc0862e, steel: 0x5d6266, primer: 0x6a3a2c, wood: 0x5a4632,
    rubber: 0x141414, concrete: 0x7a7672, canvas: 0x4a4a44, ground: 0x4a403a, weathering: 'heat', wear: 0.6,
  }),
});

export function garageKitSkin(architecture: GarageVariant['architecture']): GarageKitSkin {
  return GARAGE_KIT_SKINS[architecture] ?? GARAGE_KIT_SKINS.field_shed;
}
