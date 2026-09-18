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

## End-wheel re-lay (2026-09-18)

Owner: "the tracks appear sticky to the wheels … the tracks are morphing to stick onto the wheels instead of behaving like
they should" (front and rear road wheels in battle). Measured on the 18 m round course (`.qa-dev/band-ramp-probe.mjs`): at
rest every band station beyond the outer road wheels sat exactly on the wrap circle or the common tangent to the idler /
sprocket wrap; with the outer wheels drooped 11 cm the wrap arc followed the wheel down (0–1 mm) but the ramp never
pivoted — the band climbed 13 cm in 8 cm of run to rejoin the rest ramp, 62 mm off the true tangent on the Bradley. The
influence field moved those stations by a fading share of the travel (`resolveBandWheelWeights`, 0.5 m beyond the end
wheel) and the loaded-run fit then pushed whatever the moved tire intersected back onto the tire, so the band wore the
wheel like a sock. `buildRunningGear` now classifies, from the authored course, the road-wheel wrap arc, the ramp
stations and the end-wheel arc below its top exit (`hullG.userData.runningGearEndRelays`), and `deformBand` re-solves the
external tangent from the LIVE seat circle to the fixed end-wheel wrap every frame (`roadWheelWrap` with the moved axle),
re-laying the three groups by their rest fractions — cross-sections translate as one, so the stock is kept and the shoes
sample the same centreline. The contact fit runs after the re-lay (an interleaved Tiger neighbour that drooped less than
the outer wheel still gets cleared). With the end wheel at rest the stations are the rest vertices and the garage reset
restores the authored band byte for byte. Receipt `src/vehicles/trackEndRamp.selftest.mjs`: six rigs (Bradley, T-90M,
Puma S1, Tiger, Leopard 2A6, KF51 X) on the round course, every re-laid station within 6 mm of the live wrap / tangent /
end circle (measured 4 mm — the fit's chord-sagitta margin), byte-identical rest after `resetForGaragePresentation`.
Authored loops (`cfg.loopPoints`) take part when their course carries the same wrap; ends whose geometry does not match
are left on the legacy law.

The landed law reads the course itself: the seat radius is the foot station's distance under the axle, the end radius the
first arc point past the ramp, and the rest course must be their external tangent within 0.05° — so the loop-authoring
studies (Leclerc X, AMX-30 / 40 X, Chieftain X, Type 10 X, Ariete C1 X, Strv 122 X, Challenger 1 X) take part, and the
ramp-subdivision station that sits a sagitta inside a large end-wheel arc keeps its own radius. The contact fit runs
after the re-lay, reads the authored clearance at the rest z and skips its footprint follow on the re-laid stations
(`pinned`), while its clearance passes still push a station out of any tire the pivoted ramp meets. Fleet sweep
(`.qa-dev/ramp-sweep.mjs`, 171 production tanks on the round course): every tank carries both re-lays; the only
deviations from the exact law are the fit's ≤ 3 mm outward chord clearances on large seats.
