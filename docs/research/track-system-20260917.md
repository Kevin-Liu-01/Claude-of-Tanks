# Track system reseat — 2026-09-17

Owner brief: "fix our entire track system: these need to be fixed reseated and the logic for them redone and also
should be the same thickness across all tanks (x tanks set the standard) and then all tracks need to be properly
wrapped around wheels for suspension and the way they move around terrain to be proper and look good" …
"I want the thinner tracks and reseated wheels for all because many wheels and tracks are seated wrong in the first
place. then actually double check in simulations to make sure our suspension and tracks dont glitch wheels."

## What was wrong

- The default casting belt was a 0.09 m slab (`trackTh = 0.09`) with 6–8 cm shoe pads under it; the X studies
  measured 0.024–0.030 m bands. Legacy profiles authored `botY` for the slab, so their shoe soles sat 6 cm
  below the hull's ground plane and the movement solve seated the tank on the soles (`bottomYM`), sinking
  every legacy hull ~6 cm relative to its authored stance.
- Road-wheel heights were authored per tank against the slab's upper face (`botY + 0.045`): some wheels floated
  (default `wheelY = wheelR + 0.10`, 3 cm above the face), the T-90MS sat 9 cm inside the band, measured
  studies were 1–3 cm sunk.
- The end-wheel wrap clearance was a fixed 0.045 m — half of the slab — so a thin band would have floated
  3 cm off every sprocket and idler.
- On terrain the band followed the wheels through a per-vertex influence field; the loaded-run fit
  (`fitLoadedTrackContact`) was opt-in (Challenger 3, Type 10 X) and translated whole spans, and the
  recessed wheels of interleaved rigs were excluded from the band's wheel set. Result: a drooping end wheel
  drove its tire 10–17 cm through the band ramp; a drooping inner Tiger wheel cut 5 cm through the band.

## The law (tankFactoryCore.ts `buildRunningGear`)

1. **Band**: `trackTh = min(authored, TRACK_BAND_STANDARD_M = 0.028)` — the X-study thickness for everyone.
   `TRACK_PATTERN_DEFINITIONS` pad/grouser/web/horn heights scaled to the same standard.
2. **Ground datum**: hull-local y = 0 is the ground. `botY = floorY(0) + shoeOuterReach + TRACK_SHOE_BAND_GAP_M
   + trackTh/2` (`groundSeatBotY`, exported through `KIT`); authored `botY` survives only with
   `bandSeat: 'authored'` or when the profile authors the whole loop (`loopPoints`) — those profiles now call
   `KIT.groundSeatBotY` themselves.
3. **Wheels**: `wheelY = botY + trackTh/2 + wheelR (+ wheelSinkM)` — the foot rests on the band's upper face;
   per-station `wheelYs` keep their authored relative offsets. `wheelSeat: 'authored'` opts out.
4. **Wrap**: `trackWrapClearanceM(trackTh) = trackTh/2 + 0.002` around sprockets, idlers and the tangent
   road-wheel wraps; `KIT.trackLoopPoints` takes `wrapClearanceM` (defaults to the standard band).
5. **Terrain**: the loaded-run fit is the default (`fitLoadedRun !== false`), works per station (each band
   vertex clears its own tire circle + 4 mm) instead of translating spans, the loaded run carries flank
   stations every 0.1 m around each axle, and recessed interleaved wheels are part of the band's wheel set.

## Verification

- `tools/track-wrap-review.mjs --all --gate`, `tools/wheel-review.mjs --all --gate`: 180 tanks, 0 cuts / gaps,
  0 flagged.
- `.qa-dev/track-seat-audit.mjs`: 183 units, every wheel foot on the band face, shoe soles on y = 0.
- `.qa-dev/track-glitch-sim.mjs`: drives each tank with the real movement sim over a ±0.3 m synthetic
  heightfield and measures tire-through-band cut and band-below-tire daylight per frame: 0 mm cut on every
  probed tank; daylight 4 mm (the fit margin) except interleaved rigs (Tiger 18 mm at 0.3 m wheel spacing).
- Receipts moved with the law (see the commit): wheel-seat, rest-height fingerprints, source axle pins.

## End-wheel wraps (later the same day)

A fleet audit of every end wheel (`.qa-dev/end-wrap-audit.mjs`, 728 ends) showed the first cut of the law had kept
the legacy 0.045 m allowance on every `trackR` endpoint: on the thin band that left 30–60 mm of daylight over 70
idlers (Leopard 2A6 X 61 mm, Type 10 X 45 mm, Strv 122 X 41 mm, Chieftain 5 X 39 mm, Challenger 1 X 34 mm, the
Abrams X family 32 mm, …) because the measured datum was the centreline of a THICK source track minus 0.045 and
the modelled idler rims sit well below it. `endpointWrap` now places the band's inner face:

- plain rim → rim + 2 mm (`trackWrapClearanceM`);
- `trackR` → the measured centreline (`trackR + 0.045 − th/2`) capped at `max(rim + 2 mm, toothTipRadiusM + 10 mm)`
  — the band never floats above the rim, never comes down onto authored drive crowns (Abrams X), and crowns never
  lift it above the centreline (the Leclerc S1 X keeps its teeth proud of the pads, as its source shows);
- `trackFace: 'datum'` → exactly on trackR (the Type 10's authored 0.975 r tread sink);
- a loop authored directly with `r = trackR` and no `rimR` keeps the centreline (no rim to cap against).

`orderedTrackEndpoints` carries the rim beside the datum (`rimR`); the Leopard, Merkava and T-14 return-roller
helpers derive their course lines from `KIT.endpointWrapClearanceM`. The audit after the change: 12 ends over
10 mm (visual stock smaller than the authored rim, or crown-gap sprockets), none over 20 mm. The receipt fallout
is documented inline with dated notes (T-14 X shoe extremes, Type 10 reseat constants, Type 90 X return skin,
Leopard A5 web inset following the shoe stock, helper shoes following the kinked course instead of rigid chords,
Merkava heavy pins 19 mm with the authored seats, Strv 122 X front joint gap, Leopard 2A6M X idler crest, the
Chieftain foundation contract's later-seat record, the T-90SM arm forging).
