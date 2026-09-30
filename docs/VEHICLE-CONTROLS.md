# Vehicle controls

The battle HUD exposes one flat, equal-size control row immediately above the
ammunition and equipment tray. Desktop buttons are 74×32 pixels; touch keeps
44-pixel targets. Shortcuts and on/off/cooldown labels remain visible, and the
strip scrolls horizontally on narrow screens. Controls are limited to equipment fitted
on the current procedural model. Desktop defaults are E for the primary special
system, G for smoke, N for lights, B for an automatic roof weapon, and F for the
Gravity Mode / Turbo Ball jump. Settings can rebind these actions; the row shows
the active primary or secondary binding. A secondary ATGM channel uses its
ammunition-slot binding when another special system owns E.

Smoke has three salvos per vehicle life and a 28-second cooldown. Canisters
leave the modeled apertures and converge on a forward screen. Five overlapping
volumes form gradually after flight, drift with a mild breeze, then thin over
18 seconds. On slopes, visible clouds and optical cover follow the same terrain
height at each drifting lobe. `src/sim/smokeScreen.ts` owns the shared visual/spotting envelope.
Smoke obstructs sight, not shells or movement; existing spotting persistence
and proximity detection still apply. Match-owned screens survive destruction
of the vehicle that launched them.

An enabled remote roof station aims at spotted opponents within 240 m, checks
terrain and friendly firing lanes, and fires five-round bursts. Its ammunition
and timing are independent of the main cannon. The authored yaw/pitch hierarchy
also drives recoil, muzzle flashes and pooled ejected cases. Only remotely
controlled modeled stations qualify; a manually crewed pintle or a vehicle's
primary remote turret does not become an extra automatic gun.

Lights start automatically at night, and explicit on/off requests work in every
lighting preset. The existing bounded lighting pool is prepared behind the
battle loading screen to avoid compiling a new light signature on first use.

## Geometry and network maintenance

`npm run tank:controls:update` measures every tank's actual smoke apertures and
roof stations into the small, renderer-free auxiliary inventory.
`npm run tank:controls:check` rejects stale inventory, missing weapon datums, and
rearward/downward smoke axes. Keep these checks alongside the normal anatomy
and affected-tank release gates after changes to fittings or builder frames.

Auxiliary actions are authority-owned. The v2 transport uses wire layout 2 /
protocol 3, with a dedicated delta group for stationary controls and a bounded
match smoke list. The legacy protocol version is 11. Mismatched game builds
must refresh before joining each other.

## Integration validation — 2026-09-30

Integrated onto `5c72eb52b` (the current main branch), preserving the media
rollback, UI-free view, landing-drive recovery and flag dropdown releases.
Type checking, the 24 focused integration checks and the 201-vehicle auxiliary
inventory check pass. The inventory finds 175 smoke-equipped vehicles and 26
remote stations, with no backwards/downwards outlets or missing gun datums.
The five new runtime owners pass the complexity check.

This is not a fully green fleet release. Earlier anatomy/diagram validation
passed, but the whole-fleet release attempt failed its standard/fidelity gates
(33/106 available comparisons passed; 36 source references unavailable). Exact
baseline runs confirmed existing failures for Jaguar, M46 and AbramsX; this
does not establish that every failed comparison predates this work.
The integration suite also reports TOS-1A's frozen T-90MS donor fingerprint,
supplied-source armor registration and Soviet auxiliary-armor assertions.
The full suite was interrupted to complete the owner's explicit main-branch
push request; no full-suite pass is claimed and no failing assertion was
removed or relaxed. Follow-up fleet qualification remains outstanding.
