# Kurganets deck drum and optical housing — source calipers, 2026-09-18

Read-only authoring study by `/root/afv_europe`; no runtime profile, oracle, camera or gate changed. The inspected reference images were the source panels of `postfill-root-r8/official14/kurganets25_x/close-roof.png` and `top.png`. Canonical source `public/models/community-candidates/kurganets25_x_source.glb` SHA-256 remains `a2b4074765a9f1765c35e3838bd775cfcc2657cb6bb6e7530dc71930f95630d0`. All coordinates below are canonical world metres, +Z forward. Existing source-only translation is `[.0054349899291992,.0139,0]`; do not apply it twice.

The private evidence directory `.qa-dev/tank-run/europe-source/kurg-calipers-r8/` contains `measure.mjs/json/log`, `sections.mjs/json/log` and `stock.mjs/json`. Source meshes are read only to recover sparse scalar dimensions and complete-scene FrontSide ray intersections. No extracted vertices, topology or dense outline is proposed for runtime.

## Hull deck drum

The round stock immediately forward/outboard of the +X radial fan belongs to **Object_23**, merged with hull stock. It is not an independently connected island. The roof fan's height must not be reused for this fitting.

- Refined circular axis: X **1.328185**, Z **.44935**.
- Outer radius approximately **.2652** m; top plan bounds X `[1.063035,1.593335]`, Z `[.1843,.7144]` (small source tessellation/asymmetry).
- Top elevation **2.2815**. At axis and radial samples .10/.20, downward first hits meet this closed top. Samples .25/.26 also hit the outer lip at2.2815.
- Annular groove: the r=.23 sample meets **Y2.2522**, 29.3 mm below the top. Source ring boundaries approximately r=.220 and .245; four small retaining fixtures occupy Y2.2502..2.2619. Retain this real stepped recess rather than using a flat disc or an open bore.
- Source outer wall stays approximately cylindrical through the top but ends at the existing **sloped hull surface**, not a single horizontal bottom. Source triangles with near-horizontal radial normals give bottom-Y minima by successive45° angle bins (angle measured in XZ from +X toward +Z): `2.0627,2.0666,2.0862,2.1311,2.1584,2.1389,2.1057,2.0764`; every bin reaches top2.2815. These are scalar wall/deck intersection bounds, not independent watertight bottom measurements.
- Complete-source inward/upward rays below the disc often find no reverse face; the original sheet construction is not proof of a closed underside. A native closed fitting must seat into the actual native deck. Do not claim the source supplied a uniform flat bottom or a measured real-world thickness.

Representative complete-scene source rays: at canonical `[1.329135,2.6,.44985]` downward → Object_23 atY2.2815; at `[1.559135,2.6,.44985]` → grooveY2.2522; at `[1.579135,2.6,.44985]` → lipY2.2815. AtY2.23..2.28 lateral first hits give leftX1.063136 and rightX≈1.5933. AtY2.15 front/back first hits giveZ.714175/.184522.

## Turret roof optical housing

**Object_29** outer housing bounds: X `[-.781095,-.325995]`, Y `[3.06375,3.31175]`, Z `[-1.12833,-.71473]`; center of bounds `[-.553545,3.18775,-.92153]`. This matches the old box envelope, but the actual plan is rounded around axis approximately X−.5535,Z−.9006, radius .2275. The front has a narrower flat receiving face and a sloping crown; copying only the AABB loses this shape.

Sparse full-source lateral first-hit calipers at Y3.10:

| Z | Left X | Right X |
| ---: | ---: | ---: |
| −1.125 | −.583243 | −.523184 |
| −1.100 | −.661463 | −.445170 |
| −1.050 | −.724363 | −.382506 |
| −1.000 | −.758059 | −.348243 |
| −.950 | −.775805 | −.330796 |
| −.900 | −.781057 | −.326031 |
| −.850 | −.772734 | −.333855 |
| −.800 | −.754171 | −.352314 |
| −.750 / −.718 | −.737095 | −.369495 |

Use these as checks on an authored rounded section, not an embedded polygon trace. The source outer housing has a stepped circular receiver:

- Lower base bounds X `[-.843095,-.265995]`, Z `[-1.18923,-.61223]`, Y2.99195..3.04225; approximately radius .2885, centerX−.554545,Z−.90073.
- Upper base bounds X `[-.820195,-.286495]`, Z `[-1.16763,-.63363]`, Y3.02905..3.07885; approximately radius .267, centerX−.553345,Z−.90063. This overlaps the actual housing bottom3.06375.
- The complete-source receiver/deck layer beneath axisX−.554,Z−.900 is atY3.01635. Several reverse rays are unavailable because the source stock is a sheet; author native closed connected stock rather than inheriting open bottoms.

**Do not turn the front into invented open holes.** Object_29 does contain three small circular receiver components, but complete-scene FrontSide rays encounter **Object_19 cover/pane atZ−.71863 first**. Source material identity/transparency was not established by this geometry loader, so no glass-versus-painted or transparency claim is made. Its bounds in this region are X`[-.734195,-.374595]`,Y`[3.07545,3.30695]`,Z`[-.85193,-.71863]`. The front is flat atZ−.71863 up to the sloping roof; at centerX−.553545 topdown source hits are Y3.306087 atZ−.85,3.283732 at−.80,3.261376 at−.75,3.247963 at−.72. Rear top atZ−1.10/−1.05 isY3.31175; a small top plate aroundZ−1.00..−.90 reachesY3.31575.

Behind that front cover, the three receiver axes/approximate radii are `[-.447595,3.1441]`/r.0496, `[-.661695,3.14725]`/r.039, `[-.542545,3.14405]`/r.03055 in XY. Complete-scene rays first encounter the cover, then Object_25 stock nearZ−.776289/−.77433 or Object_29 nearZ−.762583, then backing atZ−.78163. These inner stock values establish layering; they do not authorize showing it through an opaque cover.

Implementation and native full-scene seating/ray checks remain with the parent author. This study is not an independent review of any resulting correction and does not resolve detached-source, roof-weapon, raw-source fidelity or release gates.
