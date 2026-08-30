# BMP-3 ROK

`bmp3_rok` is the South Korean service presentation of the first-party
procedural BMP-3 family. The production builder is owned by
`src/vehicles/profiles/afvFamily.ts`; the runtime does not load a source GLB.

## Durable geometry constraints

- The turret, gun, stations, and bustle equipment are turret-local and must
  remain seated while the turret traverses.
- The radio whip bases sit on welded wing shelves that overlap the turret
  crown instead of standing on isolated pots.
- The pintle machine-gun foot is chained through its ring and support column
  into the turret crown.
- The panoramic sight is seated through a pedestal collar into the crown.
- Both bow-light clusters sit on hull-local platforms welded into the upper
  glacis. They must remain clear of the covered running-gear corridor.
- Running gear must retain zero exact band, shoe, and swept-track
  interpenetration at the standard release gate.

These constraints are enforced by the procedural ownership tree, combat
anatomy receipts, and the standard tank release checks. Temporary visual
review images and round-by-round repair narration remain recoverable from Git
history and are not maintained as public reference data.
