# K21 final approved-target exterior review — 2026-09-18

**FAIL pending three bounded bow/deck corrections.** All fourteen official
originals and both Garage originals were actually inspected. The approved source,
source-world camera, geometry scoring floors and current passing score receipts
are unchanged; numerical shape passage does not resolve these visible defects.

Evidence: `.qa-dev/tank-run/final-approved-targets-review/official14/k21_x/`
and its `identity.json`; Garage `k21_x-neutral.png` and `k21_x-oblique.png` in
the sibling `garage/` directory. Independent hash verification, per-view scores
and measurements are in `.qa-dev/tank-run/k21-final-independent-review/`.
Profile hash: `9e800d5f744999d73bf2c86c6ebc33999b6a9599fc47421b4262f2c140cc6791`.
Source hash: `e2103e87628337778107ba4beec0fb5f6ad9e29136eab65ba27aa7f8bfdd956b`.
Capture input drift is empty, source-world registration is shared, native fills
were loaded, and rig parity passed.

## Findings

1. **Low bow tow fittings are misplaced.** Front and front-quarter originals
   expose two source tow loops below the bow; the native model has no counterparts
   there. Source Object_6 components489/490 have X centers+0.650315/−0.648035m,
   Y envelope0.51310–0.73280m and Z2.98440–3.06050m. Their real fork brackets
   are components18/308 at Y0.661–0.8085m, Z2.918–3.0645m. The native calls
   `towEye(...,.76,1.30,3.60)`, approximately0.68m too high and0.58m too far
   forward relative to the loop assembly center. This is physical placement and
   stock mismatch, not camouflage. Replace the two wrong-position generic eyes
   with source-measured loop/fork stock and verify finite hull attachment.

2. **Broad forward deck panels have the wrong slope and project above the bow.**
   The broad paired panels rotate by−0.16rad, raising their forward ends, while
   the source deck falls forward. At X−0.76m, Z2.47/2.65/3.05m, source whole-scene
   first tops are Y1.82857/1.77623/1.78344m; native first tops are
   Y1.89321/1.92226/1.98681m. The mismatch reaches203mm in a visible panel region.
   Side, front-quarter, close-front and overhead views show the lifted native
   plates. The nose panel also uses−0.22rad; measure each actual source plate
   separately and seat it to its receiver rather than changing a sign blindly.

3. **The bow's broad outer fascia is too far forward through its lower/middle
   section.** Source Object_6 component4 is a distinct broad folded/sloping sheet.
   Whole-scene rays at X0.76m and Y1.0/1.1/1.2m first meet source stock at
   Z3.50195/3.56810/3.60432m, versus native Z3.59320/3.68120/3.69000m. That is
   85.7–113.1mm excess extension in this band. The native straight terminal
   section also differs from the source's folded lower relationship. This explains
   the flatter/deeper-looking bow in front and side-quarter views. A receiving
   correction must use source section measurements, preserve suspension clearance
   and not expand the hull to hide missing fittings.

## Scoped passes and limits

The updated rear ramp and small rounded door, recessed rear fittings, open rear
lamp guards, folded rear fenders, launcher housing/tube terminals and visible
basket remain represented without a new specific seating/opening defect in these
views. Rear, rearleft, rearright, hero-rearright and close-roof merit scoped9.0.
Front and close-front score8.0; other affected views score8.5. These are explicit
visual judgments, not replacement numerical geometry scores.

Both Garage views have readable contact and wheel relief with enabled real
shadow maps; neither shows a new shadow artifact at its captured scale. They
show front quarters only and cannot clear the identified underside geometry or
unseen rear surfaces. No frame-rate claim follows from these images.

The reviewer previously authored the whip receiver seats and gun-cradle ownership
migration and excludes them from independent approval. The parent independently
inspected those parts. The reviewer also supplied source-only front-hood calipers;
Europe authored their geometry. No runtime or source edits were made for this
review, and the failed original images remain retained.
