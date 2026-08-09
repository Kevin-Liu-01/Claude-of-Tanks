# Challenger 2 — independent §B8 graduation verdict (2026-08-09)

**PASS.** A wholly fresh isolated sitting on the fourteen current
reference/procedural pairs clears the mandatory >=9.0-per-view shaded-parity
bar. Evidence: `shots/critic-challenger2-graduation/` (all PNGs captured
2026-08-09 13:30:34 PDT). Zero browser/console errors were reported; the sole
HTTP 404 was the expected ignored favicon request.

Current procedural hash: **63ee160** (reproduced x2 before the sitting;
42 meshes / 250,769 vertices).

## Receipt

| Check | Result |
|---|---:|
| Geometry gate, run 1 | PASS, minimum 90.1 |
| Geometry gate, run 2 | PASS, minimum 90.1 |
| Hull | 90.1 |
| Whole | 90.3 |
| Turret | 90.3 |
| Stations | 91.1 |
| Dimensions | 93.8 |
| Floaters | 100 |
| Direct-tree fidelity | 91.3; minimum whole view 93.31 |
| Exact track clip | band 0/0; shoes 0/0 |
| Standard check | contiguity 0; MG 1+1d |

## Independent shaded-parity scores

| View | Score |
|---|---:|
| view-front | 9.0 |
| view-frontleft | 9.1 |
| view-left | 9.0 |
| view-rearleft | 9.0 |
| view-rear | 9.0 |
| view-rearright | 9.0 |
| view-right | 9.0 |
| view-frontright | 9.1 |
| view-top | 9.0 |
| hero-frontleft | 9.1 |
| hero-rearright | 9.0 |
| hero-toptilt | 9.0 |
| close-front | 9.1 |
| close-roof | 9.0 |

Floor **9.0**; mean **9.03**; **14/14 PASS**.

## Final visual read

The complete Leclerc-method rebuild now follows the repaired source rather
than the earlier Challenger-1-base approximation: exact side profiles and
plan bands, joined V-section bow/stern lofts, offset lower/upper turret brow,
three-band closed turret shell, true cheek cassette undercuts, six correctly
spaced Hydrogas wheels with deep dishes and nested hubs, source-measured track
runs, a single flattened loader lid plus thin right roof plate, open rear
basket, stern recess/service structure, bow tools and guarded lights, and the
L30 boot/sleeve/extractor stack. The remote station retains its real folded
transverse L7A2/MAG receiver+tube silhouette instead of a generic upright
pintle. These forms remain coherent in orthographic, hero and close views.
Residual differences are shaded surface simplifications only; none creates a
silhouette, attachment, readability or vehicle-identity failure.

## Audit adjudications

`turret-parent-audit` reports one 38% stranded candidate only because all
`hullDetail` pieces share one merged AABB (-1.25..1.20,
y 1.197..2.016, z -4.102..3.708). Connected-component inspection proves its
only piece above the ring is the **11 x 2.8 x 10.2 cm driver periscope slit**
at x -0.055..0.055, y 1.988..2.016, z 0.879..0.981. It is fixed foredeck
equipment, not turret furniture: **ADJUDICATED MERGED-BUCKET FALSE POSITIVE**.

`winding-audit` mode 1 is clean (0 reversed / 0 mixed; worst deficit 70 px,
0.12%). Mode 2 attributes 14,066 candidate pixels to `rig_hull/mesh#19`.
Connected-component inspection identifies the real fixed-hull contents: the
two measured side profile strips, center profile strip, two shoulder slabs
and driver hood (high-zone boxes ending at y 2.05..2.07). They correctly stay
static under turret yaw: **ADJUDICATED STATIC-HULL FALSE POSITIVE**.

## Rejected experiments and provenance

- Generic canonical MAG substitution: gate minimum **89.5**; rejected because
  it replaced the measured folded source weapon and regressed graduation.
- Broad rear-shoulder fill: gate minimum **89.5**; rejected because it painted
  over the source recess. The narrow x=±1.12 hardpoint closes the two 4x4
  plan wells with the certified 90.1 row unchanged.
- Broad terminal housings: gate minimum **88.2**; rejected.
- Proud 12 mm cheek/cassette growth: gate minimum **88.6**; rejected.

The measurement oracle SHA-256 is
`d2e22673103353436517c1d17be38531b530b8936538f921d996a26fcfab5f3f`,
reproducible from pristine `.bak`
`1be3ef855ac9c441e38262a4ae26600d14c763c70c867024554499a451f9ad48`.

**Verdict: Challenger 2 graduation PASS.**
