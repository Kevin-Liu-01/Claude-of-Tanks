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
leave the modeled apertures along each tube’s forward-facing axis. Overlapping
volumes form at the landing banks after flight, drift with a mild breeze, then
thin over 18 seconds. On slopes, visible clouds and optical cover follow the same terrain
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

The Challenger 3 and Challenger 3 Prototype stations include their authored
cradle, sensor pods and rear housing in the rotating mount. The receiver spine
and recoil rails elevate with the gun; the roof foundation and independent
turret sights stay fixed. `challenger3MachineGunAssembly.selftest.mjs` checks
these relationships and support damage/repair in both detail levels, and
`tools/challenger-assembly.browser.mjs` checks the live Garage and cached return.

Lights start automatically at night, and explicit on/off requests work in every
lighting preset. The existing bounded lighting pool is prepared behind the
battle loading screen to avoid compiling a new light signature on first use.

## Geometry and network maintenance

`npm run tank:controls:update` measures every tank's actual smoke apertures and
roof stations into the small, renderer-free auxiliary inventory. Include the
shipped decoration layer: several vehicles, including the KF41 Lynx, carry their
working dispensers there. The inventory also records the actual turret mount;
a nominal armor pivot can differ from the rendered model’s seat. Preserve
aperture metadata through decoration merging and static batching, and align
complete banks before batching flattens their hierarchy.
`npm run tank:controls:check` rejects stale inventory, missing weapon datums, and
rearward/downward smoke axes. Keep these checks alongside the normal anatomy
and affected-tank release gates after changes to fittings or builder frames.

Auxiliary actions are authority-owned. The v2 transport uses wire layout 3 /
protocol 4, with a dedicated delta group for stationary controls and a bounded
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

## Smoke launcher review — 2026-10-01

The fleet review covers all 205 vehicles, including older families and newer
supplied-model variants. It finds 195 smoke-equipped vehicles and 3,571
registered outlets, with no rearward launch axis. Several visible dispensers had never been connected
to the smoke control inventory. Declared smoke banks are now functional fittings:
they are installed before cosmetic cargo, and cosmetic placement retries or
random selection cannot remove their controls at lower detail settings.

Decorative cheek-mounted banks face forward in a mirrored fan. Their mouths
remain registered after material merging, low-detail static batching and
distance changes. The Ariete’s hollow tube rims supply real aperture receipts.
The actual turret mount and authored rig scale drive the authority’s launch
position and compact multiplayer smoke receipt. The Leopard 1A5 retains its
launcher seating surface at low detail, and the Object 148 prototype’s tubes
are tilted forward while retaining their shelf contacts. This also corrects displaced
launches on T-90, Challenger, Merkava, Warrior and M60 family variants.

Validation:

- `src/vehicles/smokeLauncherFleet.selftest.mjs --all`: all 390 decorated,
  batched high/low builds pass, including 21,426 actual-mouth launches across
  turret bearings and hull tilt, distant visibility, reload and network
  receipt checks. Every selected vehicle is checked before failures are reported.
- `src/sim/smokeBallistics.selftest.mjs`: 10,713 fleet/slope launches, terrain
  contacts, compact receipt reconstruction and real spotting obstruction.
- `tools/smoke-launchers.browser.mjs`: actual Garage selection/cache return for
  Lynx, KF51, Ariete, T-14 X, Object 148, Griffin Viper, T-90A Burlak, Challenger 2,
  STB-1 and Leopard 1A5; the Lynx’s live Smoke button fires all 12 tubes and
  consumes one of three salvos. Local screenshots and machine report are in
  `.qa-dev/smoke-live/`. This is local validation, not a deployment claim.
- Focused smoke presentation, auxiliary actions, roof-gun mounts, decoration
  staging, combat visibility and multiplayer wire checks pass.
- The anatomy refresh/check validates 205 receipts, 1,789 modules and 410 track
  sides with no module-hit failures. After refreshing the changed framing and
  assets for 15 vehicles, centering checks pass and the fleet asset check passes
  all 615 technical diagrams (the separate bore gate is skipped).
- Type checking and the final public production build pass.

The immutable factory-staging snapshot already failed on the original code
(M1A1 actual `7ea1eb316a7835dbfc52b7b2f052c51111e9cf064407a0bb2c2df9f1633d494d`
versus frozen `373a36f1a3cdbd9892cdd2e5bf03462bde7e2cf492e317534d09a28b8ea2fbdc`).
The intentional launcher priority/geometry changes also alter the current
fingerprint. The frozen expectations are not rewritten. The focused decoration
staging test verifies matching synchronous/staged output and resource cleanup.

The broader selected-vehicle release check cannot certify source fidelity:
registered comparison models for KF41 Lynx X, KF51 X, T-14 X and Ariete C1 X
are unavailable locally, as is the Leopard 1A5 comparison model. All eight
vehicles selected across the two release checks pass their sealed-hull gates.
The scoped complexity audit retains 14 existing violations and six existing
`unknown` annotations in legacy builders; comparison against the base revision
finds no new complexity violations. The general quality gate is not green.
No full fleet-release pass or deployment is claimed.

## Damage to running gear and weapons

A destroyed track removes the working belt from that side. Loose shoes and a
road wheel leave the vehicle with its motion, fall under gravity, bounce and
settle against the battlefield surface. Once settled they stay in the world;
they do not follow the tank's position or pitch. The debris is cosmetic and
adds no invisible driving obstacle. Repair restores the working assembly and
retires that vehicle's debris. Respawning or returning to the garage resets it.

Weapon failures follow the physical weapon being used:

- A destroyed external missile or rocket rack cannot launch. A separate main
  cannon remains available. Gun-launched missiles still depend on the barrel.
- A destroyed autocannon feed stops that cannon until repaired. A separate
  missile launcher remains available.
- Armed automatic roof stations have their own **Roof gun** module. Its hit
  volumes follow the station's yaw and elevation. Yellow damage slows its
  aiming and firing cadence; red damage stops automatic fire and prevents
  activation. Repair the station, then reactivate it with its normal control.
- External weapon stock receives one damage roll per projectile, including
  projectiles crossing several housing faces. Hits outside the hull do not
  invent hull penetration or hull HP damage. Disabled-critical-damage modes
  retain their rules.

Damage paint is applied only to the weapon's registered colored geometry,
leaving neighboring armor and shared camouflage intact. Module repair and
vehicle reuse restore the appropriate appearance.

Both solo and authoritative multiplayer use the same weapon-failure policy.
Multiplayer wire layout 3 / protocol 4 includes all fifteen module states in
the viewer snapshot, so repaired or disabled launchers, feeds and roof guns
are represented after reconnects as well as after live hit events. Client and
host must use the matching protocol.


Capture and spawn markers use their own subdivided ground geometry, fitted to
the rendered terrain surface. Progress arcs share that fit instead of reverting
to a flat plane. The carried flag has no moving ground decal; its stationary
home marker remains at the base.

Focused regression checks are `detachedGear.selftest.mjs`,
`objectiveSurface.selftest.mjs`, `weaponModuleDamage.selftest.mjs` and
`weaponDamageVisuals.selftest.mjs` under their owning source directories.
`tools/running-gear-damage.browser.mjs` exercises a real battle: breaking both
tracks, settling debris, moving the tank away, repairing it and sampling every
capture-marker vertex against the live terrain. Its local report and screenshots
are written to `.qa-dev/running-gear-damage/`.

Local validation on 2026-10-01: the full anatomy check passes 205 receipts,
1,834 module probes, 410 track sides and all 615 technical diagrams (bore gate
skipped), with 96 dimension-drift warnings. The live debris/capture probe passes
with no browser errors; its 9,572 objective samples match the terrain fit, and
moving the tank leaves settled debris stationary. Type checking, new-owner
complexity gates, focused damage/repair/network tests and the public build pass.
The selected M1A2, Bradley and T-14 hull-closure checks pass. Their broader
release gate is not green: the M1A2 and Bradley comparison models are unavailable
locally. This work is not pushed or deployed.
