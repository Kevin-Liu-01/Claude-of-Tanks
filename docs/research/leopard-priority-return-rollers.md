# A7V X and Revolution: fitted return rollers

Only `leo2a7v_x` and `leo2_revolution` opt in. This delivery is isolated from
published `508bb19b0`; it does not activate the separately developed A4M X,
A5 X or KF51 X changes. There is no `leo2_revolution_x` registry alias.

## Source basis and geometry

The Slovak Ministry of Defence's [October 2009 military publication](https://www.mod.gov.sk/data/files/1420.pdf),
printed page 26 (PDF page 25), explicitly describes four return rollers per
side on Leopard 2. The count follows that real chassis arrangement; the
stations below are fitted to each existing procedural model, not claimed
measurements of the source document or copied A6M stations.

| Vehicle | Fitted Z stations (m) | Axle absolute X (m) |
| --- | --- | ---: |
| Leopard 2A7V X | −2.05, −0.35, 1.25, 2.20 | 1.300 |
| Leopard 2 Revolution | −1.93, −0.29, 1.25, 2.06 | 1.132 |

Each vehicle gains eight real 95 mm-radius, 160 mm-wide rotors and eight
finite painted spindles. The shared closed `efficientReturnRoller` primitive
has rubber crown and camouflage-aware wheel-metal groups. Native running
gear owns rotor placement, spin, damage and disposal; stationary shafts
share the hull owner and remain visible with the rollers at distant LODs.
The shafts extend from absolute X 0.965 m into the finite hubs, with more
than 25 mm lap into the existing hull skin. No floating decorative supports
or material-only substitutes are added.

The helper adds fitted upper support spans through the canonical track-loop
builder. It retains the original end crowns, complete lower course/contact
and lower end arcs, road-wheel geometry/axles, suspension settings, hull,
turret, cannon and authored equipment. Actual track length and pitch are
recomputed by the same native course; the formerly unsupported upper run
is not falsely described as unchanged. Neither target needs inner-band
lining or the protected-outer-face option.

Complete rotor plus spindle cost is **160 triangles HIGH / 80 LOW**, or
**1,280 / 640** across each vehicle's eight instances. The published general
roller recipe would cost 336 / 192 per assembly. Required roller count,
positive stock and finite attachment are retained. This is not a complete
vehicle performance, draw-call or tank-switch-latency acceptance claim.

## Focused contract

The two-ID test retains the five-model candidate's exact physical checks,
without importing or authenticating the unrelated A5 lining. It compares
all original authored emissions and actual body/material/rig/road-wheel
buffers against an exact old-gear-input control. It measures every native
road axle reaching the rig's configured compression and droop, checks finite
road/band/near-and-far-shoe stock throughout motion, and checks actual
render-eligible support gaps at 15, 75 and 200 m. The fixed support limit is
6 mm and numerical nonpenetration tolerance remains 2 micrometres.

The independently calibrated shared test helper and its default/hydraulic/
override regression are included because they are absent from this main
baseline. They do not change runtime suspension. Apart from the two profile
call sites and new helper, the only core edit exports the existing
`RunningGearConfig` type. No global roller default changes.

The existing A6M eight-roller HIGH/LOW control and the T-62MV-1 X zero-roller
control remain executable. The latter follows the US Army's description of
the [rollerless T-62 in FM 100-2-3](https://www.trngcmd.marines.mil/Portals/207/Docs/MCIS/ITEP/RITC-East/FM%20100-2-3.pdf).
Invalid stations and roots plus a deliberately raised penetrating roller
are rejecting controls. Rotor/spindle geometry and instance buffers must
each be disposed exactly once, including the real far battle LOD.

Fresh focused checks and typecheck on this exact two-ID main-based tree are
pending. Native GPU images, source comparison, anatomy and complete composed
release belong to the parent integration and remain required. Earlier
five-model Node geometry passes are not substituted for these receipts.
