# M48A3 Patton (`m48a3_patton`) — reference packet

## Current status (release 266, 2026-10-28): a new US M48

Owner, 2026-10-28: "add a new m48 variant for the usa since its a really great modeel". Built as the `m48a3` mark of
`src/vehicles/profiles/pattonCast.ts` (`buildM48VariantCastSteps`, `M48_VARIANTS.m48a3`) on the M48A5's measured hull
and dome ([m48a5_patton.md](m48a5_patton.md)); spec `src/vehicles/m48VariantSpecs.ts`, a clone of the M48A5 sharing its
package with the M47's 90 mm round and cadence (fleetBalancePass, ledger entry `m48a3_patton`). USA tree: the Patton
line at I between the M47 and the M48A5 it was rebuilt into. Implementation: DONE; qualification per the release check.

Exact vehicle: the **M48A3 Mod B** of Vietnam: an M48A1 rebuilt with the AVDS-1790-2A diesel and the M60's engine deck,
the 90 mm M41 with its T-shaped blast deflector, the M1 cupola raised on a ring of vision blocks, the xenon searchlight
over the gun.

### Sources

| Key | Source |
|---|---|
| WP48 | https://en.wikipedia.org/wiki/M48_Patton (the A3, the Mod B, the riser Wikipedia names G305) |
| AFV48 | https://afvdatabase.com/usa/m48patton.html (8.68 m over the gun, hull 6.87 m, 3.63 m wide, 3.28 m over the cupola periscope, 48.5 t) |
| Photos | Wikimedia Commons: a US Army M48A3 at a Vietnamese museum (the deflector, the covered searchlight, the riser); the Latrun M48A3 (right side, head-on: five return rollers, the deflector); the Kubinka tank captured in Vietnam; a US Marine Corps M48A3 in Vietnam with an M2 on its cupola; the rear deck and the tail-light boxes. Local copies: `~/cot-lanes/m48-variants-266-refs/m48a3/` |

### Differences from the M48A5 build

| Item | Source | Build |
|---|---|---|
| Gun | 90 mm M41 (about L/48), the long evacuator right behind the deflector, the T-shaped deflector; 1.81 m past the hull front against the A5's 2.44 (AFV48, photos) | `m48M41`: the tube, the evacuator over its last 0.8 m, the collar, the cross tube (0.24 m across, 0.52 m wide) with its two dark ports, 3.80 m from the bore station |
| Cupola | the M1 with its .50 inside, on the riser of vision blocks; in Vietnam an M2 often rode the hatch ring (WP48, photos) | `m48M1Cupola`: the riser with nine blocks, the squat body, the .50's sloped housing and port, five vision blocks, the domed hatch, the M28 sight head, an M2 on the hatch ring |
| Searchlight | the xenon light on the gun shield (photos) | the A5's AN/VSS-1 |
| Loader | an M60 on the loader's side (the Latrun photograph) | the A5's M60D on its post |
| Running gear | five return rollers on the converted A1 hull and, on the Latrun tank, no track-tension wheel (the track runs straight from the last road wheel to the sprocket) | the A5's gear (`m48Gear` 'a5') |
| Rear | armoured boxes round the tail lights (photo) | the A5's guarded tail lights |
| Stowage | the bustle rack | the A5's rack and load without its spare wheel; no flank racks or rucksacks; not the A5 model's drum on the left front fender or its long tow cable |
| Weight | 48.5 t (AFV48) | spec |

### Not drawn

The internal .50's barrel through the cupola's port (the photographs show the M2 outside on the hatch ring, as many
Vietnam tanks carried it). Sandbags and field stowage.
