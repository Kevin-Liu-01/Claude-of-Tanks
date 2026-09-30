# Role balance and battlefield update — 29 September 2026

The complete 200-vehicle roster now has an explicit tactical role, view range, and stationary/moving concealment profile. These are gameplay values, not claims about historical sensor specifications. The accompanying [CSV](2026-09-29-role-balance.csv) records every vehicle, its new scouting values, and before/after handling values.

## Scouting and handling

- M551 Sheridan: 480 m view range. M551A1 TTS: 490 m, the highest base view range in the roster.
- Recon vehicles and IFVs emphasize scouting and moving concealment; M3A3 Bradley has 470 m and Ajax 465 m. Heavy assault/support vehicles trade concealment and agility for their existing protection and weapon strengths.
- Ten role profiles adjust the individually authored hull/gun traverse, aim time, aimed dispersion and movement dispersion. Damage, reload, armor, hit points and speed are preserved.
- The existing 445 m detection cap, 50 m proximity spotting, camouflage, line of sight, damaged optics and equipment modifiers remain in force. Extra view range counters concealment; it does not reveal enemies beyond the cap.
- Both lazy browser and eager server fleet initialization apply balance only after donor synchronization. Regression checks compare all 200 final specifications and ensure later synchronization cannot erase the adjustments.

The garage displays final equipped values for hull and turret/gun traverse, aim time, dispersion at 100 m, moving dispersion at 30 km/h and turning dispersion at 20 degrees/s. Fixed hydraulic guns show hull handling without a fictional turret statistic. Armor/module/crew info uses the selected tank's existing technical diagrams.

## Battle setup

Gravity Mode replaces the visible Mars Mode label; the saved/network identifier remains `mars`. Each mode saves its own applicable settings: enemy nation, objective score and respawn delay, Horde wave growth, or Frontline hold time. Hosts pass these settings into room creation. Campaign rules retain their authored hold time. Special modes have distinct accents; Gravity's galaxy sky is purple. Regular battle is abbreviated REG in the top button.

## Two new battlefields

**Aegis Crossing:** a 200 m stone viaduct, 18 m wide, over a roughly 40 m wooded gorge. Green cliffs, mixed woodland, bridgehead villages and an eastern flanking route create three approaches. The deck has continuous physical support, including Turbo Ball support, and collision records are partitioned to fit the server wire format.

**Earthrise Basin:** airless lunar terrain, impact craters, a research station and a large Earth in the starfield. It has no atmospheric clouds, fog or vegetation and uses powder track effects. It is explicitly selectable and excluded from normal random rotation, like Olympus Basin.

Both maps have native 3840×2160 scene captures, picker images, scene-baked minimaps and dedicated-server collision manifests. The full catalog contains 33 maps. Map cards have small region badges and a separate expanded inspection view.

## Verification

- Actual fixed-step M1A2 movement across the exported Aegis bridge collision in both directions; full-width deck and approach checks across three seeds; rolling-ball deck/under-deck/fall behavior.
- Objective placement for CTF, Zone Control, Turbo Ball and Gravity on both new collision manifests.
- Full roster coverage, browser/server parity, repeated synchronization, equipment effects, and a real scouting encounter with normal and damaged optics.
- Per-mode persistence, room boundaries, live score targets, clamping and campaign protection.
- Native map art and minimap export validation, TypeScript and production build.

Visual review covered both native map heroes, the garage and Gravity setup. This is a gameplay rebalance, not a claim of competitive balance from live multiplayer telemetry; the existing deterministic matchup checks remain the regression baseline.
