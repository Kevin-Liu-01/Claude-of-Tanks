# Stridsvagn 122 X — bounded supplied-equipment reconstruction

This is a shape study of the owner-selected `stridsvagn_122.glb`, not a claim
about the historical vehicle's fittings. Its canonical SHA-256 remains
`d1ac97d98dd477d52850aaed8ae98184f9a3fd9b7ef20c5aadcf6c34d8e6d582`.
All 18 fused source chunks remain intact. The source's material boundaries
are not used to invent component masks. No source vertex, index, UV or
connectivity arrays enter the authored runtime.

The independently authored parts are in `strv122XSuppliedEquipment.ts` and
`strv122XSuppliedRoofWeapon.ts`. Complete-source triangle/ray intersections
and source front, roof, weapon and aft stills establish the following forms.
Numbers below are deterministic file-space measurements, not real-vehicle
measurement precision.

## Roof and weapon

- The center-front fixture is a low round lid plus a narrow post, not the
  earlier broad tall optical box. Held-out top heights are 2.509255 m at
  X−.069/Z.279 and 2.675111 m at X−.12/Z.33. Air beside the post at
  X−.069/Y2.60 is retained.
- The left front fixture is a wide low carrier, separate visor/jambs and
  two raised loops. Source roofs at X−.94/Z.84 and X−.777/Z.927 are
  2.527063 and 2.545117 m. Its recessed front at X−.777/Y2.47 is
  Z1.014520, behind the forward visor. The 31 mm-deep right sight uses
  proportionate wall/back thickness; glass no longer projects beyond its
  mouth. The latter retains the initial outer housing approximation.
- Good aft optic and weapon crowns remain unchanged. The short left roof
  tube has the measured wide sleeve around Z.38–.43 and a separate
  approximately 44 mm-diameter foretip through Z.52, ending natively at
  Z.533. The supplied narrow tip does not stop at the old Z.442.
- The center weapon connection is a narrow stepped member above a lower
  cradle. The source has approximately 39.5 mm of vertical air at
  X−.624/Z−.324 between cradle top2.765641 and upper part bottom2.805185.
  Source cradle front Z−.287206 is preserved. The new upper member overlaps
  the existing receiver in positive stock and stays in the existing exact
  yaw-owned `sourceMeasuredMachineGun` assembly. Main weapon crowns,
  receiver wings and the right tube endpoint are retained. Working native
  roof-tube bores are explicit construction, not invented source rigging.

## Aft cage

The source cage has seven horizontal courses, broad side returns, rounded
aft corners and open intervals, rather than the old narrow six-course
rectangle. The native analytic return spans approximately 2.74 m in X,
Y1.90–2.29 and back Z−3.39. Complete-source rear rays at Y2.214 give
Z−3.385790 at X0, −3.369060 at X1.10 and −3.349736 at X1.18; the analytic
return is within 4 mm at these independent stations. Posts, floor members
and permanent supports share positive stock. Open intervals between all
seven courses are tested in the actual tank in both detail levels.

## Side canisters and linking member

The supplied layout is **three upper plus three staggered lower aft
canisters, with a separate forward inclined pair on each side**. The old
two-by-four aft array omitted the forward pair and put an extra aft tube
in genuine source air. The forward pair leans inward/up; the upper aft
row is chiefly outward/up and the lower row has a greater forward rake.
The slightly offset source left side is not treated as an exact mirror.

Source first-surface right-X witnesses include:

| Y / Z | Source X | Feature |
| --- | ---: | --- |
| 2.30 / −1.94 | 1.445951 | Upper aft cap |
| 2.32 / −1.94 | 1.431344 | Same rounded cap, held-out height |
| 2.30 / −1.72 | 1.437698 | Middle upper cap |
| 2.30 / −1.50 | 1.472946 | Forward upper cap |
| 2.08 / −1.96 | 1.417741 | Rear lower cap |
| 2.08 / −1.77 | 1.442117 | Middle lower cap |
| 2.08 / −1.54 | 1.470295 | Forward lower cap |
| 2.30 / +.40 | 1.558933 | Separate forward pair |
| 2.26 / +.57 | 1.563853 | Separate forward pair |
| 2.18 / +.35 | 1.670806 | Forward stock |
| 2.13 / −1.10 | 1.519280 | Separate round linking rod |

The source axis rays show rounded closed aft caps, not the deep hollow
shells in the prior generic helper. Original stepped lathe solids therefore
retain closed stock and rounded caps with a small central relief; no cap is
erased to expose an unbacked shell. The independently sampled cap/rod
surfaces on both sides are checked within 12 mm, accounting for the
supplied irregular cap fillets and this original rotational approximation.
This is not a claim that every point on an AI-generated cap is reproduced.

Individual mounting webs retain the source air between canisters. The long
round side rod stands away from the side armor and has separate short
mounts. Their concealed ends overlap permanent stock; the source body's
independent side-plane correction remains separate from this equipment
work. Air at Y2.317/Z−2.10, Y2.25/Z−1.84 and Y2.17/Z−1.80 specifically
prevents restoration of the misplaced aft array or a broad backing block.
The forward-pair gap and clear space above/below the side rod are retained.

## Verification scope

### Antenna receiving feet — subsequent matched-view correction

Actual-ID/source matched aft and roof views exposed a 26.6–26.8 mm air
gap below both aft antenna cones. Complete-source rays confirmed that the
source has continuous receiving stock there. The native feet now use
closed narrow collars rooted into the bevel (concealed root Y2.453),
rather than the old broad cone ending at Y2.4955. Separate source flange
shapes are retained for the tall outboard aerial and short central mast:
approximately 108 mm and 153 mm outer radii, respectively. These are
original lathe profiles fitted to scalar sections, not copied source
triangles. The concealed overlap is an explicit assembly repair.

Independent source flange-height witnesses at X.7601/Z−1.809 and
X.6801/Z−1.719 are Y2.531353 and Y2.527591; the central flange at
X.1136/Z−1.717 is Y2.559323. Rear collar witnesses at X1.0638/Z−2.4224
and X−1.0433/Z−2.4243 are Y2.482145 and Y2.481231. Actual high/low
geometry tests check those surfaces, positive foot/roof stock, continuous
spindle contact, and air outside the round feet. All four original aerial
tip heights are independently asserted unchanged.

`src/vehicles/profiles/strv122XSuppliedEquipment.selftest.mjs` uses the actual
registered tank in high and low detail, not a helper-only or old photo-draft
fixture. It checks source surfaces and gaps, all sixteen cap/stock locations,
permanent mounting contact, cage support, and exact weapon ownership. Its
closed-stock test sums signed crossings of the actual merged geometry so
overlapping closed parts are not mistaken for empty space; no shadow/proxy
or marking becomes structural support.

Existing source-frame, optical-air, full-envelope and articulation tests
remain applicable. No source recipe, gate, threshold, comparison camera,
main hull, gear, yaw/pitch datum or overall dimension is changed by these
two equipment files. Complete fresh source comparison and official standard
proof must follow the combined frozen model; focused CPU checks alone are
not release qualification.
