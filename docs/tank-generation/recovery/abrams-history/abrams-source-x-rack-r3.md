# Abrams X rack R3 — working source contract

This is an authoring record, not a visual/release acceptance. The selected OBJ
SHA256 is `85c33cee1ec041cbc3b5453841a6a006c8f1f866365a7a16c078bad3d630bd29`;
the unchanged frame is `[-rawX, rawY + .203945, .357965 - rawZ]`. Source59 is
the rack; source79 supplies the folded rear screen and its attachment stocks.
Source triangles remain offline inputs. Runtime uses independently authored
closed strips, section lofts and round members.

## Independent review corrections

The initial R3 replacement passed its limited silhouette/air witnesses but an
independent stock review found real errors. Those tests were not sufficient to
certify the attachment profiles:

- Source59 fore uprights1/15/56 have7.40mm stems. The30.83mm aft extent is a
  small top hook, not full-height stock. Runtime now models the thin stem,
  approximately7mm-high return and asymmetric end chamfer separately in its
  section profile.
- Source59 receivers697/1352 likewise have6.79mm stems with upper hooked
  returns. Their43.33mm depth bounds must not be filled. The rounded forward
  tip retains its measured360µm seam to the adjacent upright; the actual
  connection uses small vertical hexagonal pins, not a filler across the seam.
- Source79 receivers2628/2670/2712 have inclined4.61mm strips and an upper
  curl at Y2.256–2.277. The earlier lower feet were wrong and are removed.
  The curls overlap the upper rear course by about2.94mm at the measured
  Y2.26 section.
- Source79 island2346 is the true inclined receiving sheet behind the five
  folded strips. Its thin stock includes a folded lower edge and extends
  about106mm above the highest decorative strip. Its absence had also made
  the initial isolated screen too short. The screen hooks' unmeshed long aft
  face lies within this backing; closing only that thin hidden face preserves
  the union without filling surrounding air.

Scalar/plane and complete143-owner evidence is retained in
`.qa-dev/reports/abrams-rack-attachments-hLgBqK/source.json` and
`.qa-dev/reports/abrams-rack-attachments-ploTKr/source.json`, with final pin
and complete-scene queries in `abrams-rack-attachments-YC9ahl/source.json`
under the same reports directory. They are source
measurements, not candidate-derived targets. Exact faces and mid-section
evidence accompany the manufacturing dimensions above.

## Negative-space distinctions

The three fore lanes at Y2.22/Z−2.835 are genuinely empty in the complete
source. A lower sample at Y2.12/Z−2.82 is not: it crosses a separate thin
upright. At screen Y2.0/Z−3.29, the two outer receiver lanes are empty, while
the center lane crosses another real source59 upright. Tests preserve these
distinctions instead of declaring an entire bounding region empty.

The rear container lane is occupied by source81 cans. The clear forward side
bay at Z−2.88 is the complete-scene air witness. Source79's zero-thickness
folded decorative sheets have a disclosed2.5mm concealed forward backing;
their measured outward fold planes are unchanged.

All permanent rack parts belong to the turret, not gun pitch or detachable
ERA. The corrected checkpoint has40 closed stocks and1300 outward triangles.
Focused checks pass14 complete-source rear witnesses, true open rack/floor
lanes, thin stem depths, fold→backing→hook→rail contact, and three real pin
seats with less than0.1mm top overlap. Actual high/low builds at three
turret/gun poses retain those rear surfaces and five additional source-empty
attachment lanes. The helper has17 functions, zero complexity violations,
and zero `any`/`unknown` types. These are geometric checks, not a visual score;
the fresh fourteen-view comparison is still required.

## R4 main-rack correction

The later fixed-camera plan-outline audit found that the six generic round
posts and floor bars squared off the rear corners. Source59 instead has
three formed13.76mm-wide receiving ribs, an open6.2mm floor frame, and two
transverse floor members. The old twelve bars are removed; the existing
measured U-shaped courses and R3 extension/screen stocks are preserved.

The independent `abrams-gun-rack-Efz6Mp` and `abrams-muzzle-Y5Nhaf` source
packets retain the sparse source59/4432,4878,4968 rib profiles. They prove
that the old outer-post lanes at X−1.55/+1.42, Z−2.75 are empty. The right
formed rib has exposed front/rear surfaces at Z−2.757276295/−2.795539826
at X.447697/Y2.22. Left and central complete-source rays are obscured by
other equipment, so they are not misrepresented as equivalent first hits.

The focused R4 test passes46 closed stocks/1732 outward triangles, the
retained fourteen R3 rear witnesses, the new right-rib source planes and
all six outer-corner air lanes in actual high/low articulated builds. It
also intercepts the actual emitted upper course to check that all three
formed ribs carry it, and checks their floor-frame contacts. There is no
test-only surrogate support at the desired joint. The helper now has20
functions and zero code-quality/type-escape violations. The R3 fourteen
images remain historical evidence, not a visual acceptance of these new
R4 forms.

