# Merkava Mk.3D X — fitted front fender returns

Status: **candidate; not release-qualified or published** (2026-09-08).

This addresses the owner's request to close the exposed **upper** end-wheel
opening while retaining the visible lower wheels. It does not change the Mk.4,
the running gear, the hull datums, armor resistance, or any release threshold.
The inherited guard roof differs from the static reference; reshaping that
whole roof is deliberately outside this small additive checkpoint.

## What the source actually shows

The existing [Merkava source packet](../references/tanks/merkava3d_x.md)
documents the owner's local-reference authorization and redistribution limits.
No source geometry, texture, topology or rig is imported into runtime.
The canonical local comparison GLB is authenticated by SHA-256
`68aab556c5202455881862e5beae79fbe6b6dec4cf690ab3f1c73716e3bb3a5c`.
Coordinates below are its existing vehicle frame: metres, +Z forward, +X right.

Independent transverse rays from X=2.2 toward −X hit thin outer fender skin,
not merely a tire or an inner hull wall:

| Z | Y | Outer X | Inner X |
|---:|---:|---:|---:|
| 3.22 | 1.30 | 1.864854 | 1.855561 |
| 3.30 | 1.10 | 1.868925 | 1.862530 |
| 3.40 | 1.20 | 1.870341 | 1.863960 |
| 3.50 | 1.10 | 1.866437 | 1.860046 |
| 3.60 | 1.10 | 1.869821 | 1.863439 |
| 3.70 | 1.10 | 1.870392 | 1.864011 |

These faces belong to the source's `vehicle#ex_decor_l_01_123_0` mesh.
At Z=3.22/Y=1.20 the source instead exposes the track: its lower aft cutback
is real. At Z=3.8/Y=1.1 the forward opening is also real. The entire wheel
mouth must therefore **not** become a solid box.

Before this change, the corresponding native outer rays generally reached
only the much narrower inner hull (approximately X=1.1). The native front
end-wheel body reaches X=1.882315, wider than that static source skin. Placing
the skin exactly on the source X coordinates would intersect the native gear.
The source supplies the existence, thin fabrication and cutback pattern;
the current animated assembly supplies the receiving fit.

## Narrow additive construction

`merkava3dXFrontReturn.ts` adds only four independently authored primitives:
two closed concave L-section lofts and two short folded outer-corner strips.

- A 16 mm wall at absolute X=1.904–1.920 occupies only the upper opening.
- A finite top flange extends inward to X=1.832, lapping the unchanged
  shoulder by 8 mm. Its roof follows that shoulder's actual slope.
- Z=3.190 begins inside the last skirt's Z=3.2018175 end, giving a real
  longitudinal lap rather than a touching bounding box.
- The hem begins at Y=1.20, falls to Y=1.075 after the aft cutback, and
  retains the lower wheel/track mouth.
- The 90 mm outer corner strip has exactly the existing front flap's rake;
  it does not cover the width of the track.

This is an explicit fitted-source deviation: the side skin is approximately
35–55 mm farther outboard than the source, and the already-higher native
shoulder remains higher. The existing whole-vehicle width, height and length
envelope is unchanged. This is not a claim of identical source microgeometry.

Both additions use the native camouflaged `hullTrackGuardL/R` material role,
remain hull-owned, and are classified **nonArmor**. Rubber flaps and equipment
retain their old geometry, buckets and finishes. The new skin remains present
in LOW and after ERA removal; it does not grant a new ballistic armor layer.

## Verification and limits

The focused `merkava3dXFrontReturn.selftest.mjs` authenticates the complete
prechange profile hash
`a7cb2366ce25ac6c6e3ff9c9d78ad7bf4c8fa2a6b0f6211ef9d92e6391d127f6`
after removing **exactly** the new import and Mk.3-only helper call. Its old
native witness omits only the four explicitly named new additions. It does
not refresh a historical golden, reuse a paint-only inverse, remove old
physical rays, or suppress unrelated geometry.

The test checks retained authored geometry/buckets, actual native running
gear bytes, whole-vehicle bounds, closed positively wound new stock, finite
shoulder/skirt/flap contacts, historical open-skin failures and retained lower
air. For moving clearance it recovers a convex partition from the emitted
L-section itself, recomputes each live geometry's bounds, and clips complete
actual gear triangles against occupied stock. Merged bodies, open finite
hardware surfaces, tire/disc assemblies, suspension, both deforming bands,
near shoes and hidden far shoes remain included. An inboard guard mutant
must fail against the actual front end-wheel, so traversal is not vacuous.
Complete gear components inside a folded cell are included by the same
finite clipping. Conversely, a native mesh bound capable of enclosing an
entire new convex cell fails conservatively: ambiguous reverse containment
cannot pass merely because no gear surface crossed the cell's boundary.

Motion coverage samples an entire revolution of the largest wheel, both
track phases, neutral poses, compression/droop requests and a wavy sampled
surface in HIGH and LOW. This is a bounded pose/finite-triangle certificate,
**not** proof of arbitrary terrain clearance, continuous-time motion or a
fix for the fleet's still-open track/terrain fitting work.

Focused checks passed on the frozen candidate:

- New front-return test: 168 finite receiving contacts, 12 prechange open-skin
  failures and two inboard-stock rejection controls. The 520 HIGH/LOW poses
  visit 242,088 actual instances; broad-phase rejection is followed by finite
  triangle clipping, not treated as occupied-stock intersection itself. The
  strengthened rerun passes 2,024 reverse-containment exclusions as well.
- Existing `merkavaXShoulderReturns`, `westXGeometry`, `westXEraBinding` and
  fleet `mudguardFenderSeating` tests pass unchanged. The last check covers
  174 tanks and 485 registered guards on 80 tanks.

## Native comparison, 2026-09-08

The unmodified control and candidate both descend from the exact bodywork
candidate `4831d43d05d700da3336f93a58fcf8eb31ad2f4d`. Each native capture has
16/16 stable, finish-passing images: HIGH/LOW geometry, factory/winter finish,
front-left/rear-left/left/right at 15 m, 1200×800 and camouflage seed 4242.
The maintained native driver constructs the real procedural visual and renders
it with WebGL. This is **not** a Gallery click-flow or switching benchmark.

Local, deliberately untracked evidence:

- Control tree `cot-merkava3d-front-return-control-20260908`, receipt
  `.qa-dev/front-return-before-native/tank-assets.json`; input hash
  `a4d86d4d727218942381d71344f426059126fa6a8e988898380a4ba571da8b53`.
- Candidate tree `cot-merkava3d-front-return-20260908`, receipt
  `.qa-dev/front-return-after-native/tank-assets.json`; input hash
  `4bdd8268fc371bd420edfae228d376df34313f753b7c2fc5fe0c8552e6a7ab2a`.
- Independently sampled complete source and prechange native rays are retained
  in the candidate's `.qa-dev/merkava-front-study.json`, with the source hash
  above. They are not a new whole-source fidelity score.

Actual complete-view submissions increase by **136 triangles and two draw
calls**, identically in each geometry quality: HIGH 77,508→77,644 triangles,
LOW 71,684→71,820; 45→47 calls. This is a visible finite-stock repair, not a
performance optimization.

The author directly inspected all eight HIGH-winter/LOW-factory candidate
views and paired prechange HIGH-winter front-left/LOW-factory left views.
The parent independently inspected paired HIGH-factory front-left and
LOW-winter left views. The new upper side/corner stock is visibly present,
camouflaged and connected; the lower end-wheel/road-wheel opening remains
visible, the original front rubber flap remains distinct, and the complete
vehicle and gun fit the image. No new obvious floating or static coplanar
defect was observed in these fixed views. This does not certify temporal
z-fighting or arbitrary camera/terrain motion. Inherited flat wheel faces,
thin tracks and unchanged rear openings remain separate unfinished work;
the rear openings have not been relabelled intentional without source proof.

### Authenticated non-runtime follow-up

After the native capture, only the focused test gained the conservative
reverse-containment assertion and its diagnostic counter. The original
images and manifest remain intact; no images were regenerated for a test-only
change. Reversing exactly that block and counter in the input-hash calculation
recovers the original complete capture hash `4bdd8268…` byte for byte.
The other 818 captured files and all four QA driver files are unchanged, and
all 16 original PNG hashes verify. Seed, views, runtime geometry and finish
inputs were not altered.

The strengthened complete input hash is
`16a9d542db1fd4dfc2a1023fff19671ee576a683a131a5c1daa97e0836ff525b`.
The old/new test SHA-256 values are
`4cef0f13a8cde3535876fce56b0c6a080a492e56c04e68c74c4750686d0820f4`
and `39d6f5f7f49a3def90222e52631e235daa53cd742ddf65a5a59828795483ff9a`.
The deliberately untracked `.qa-dev/front-return-containment-strengthening.json`
and `.qa-dev/front-return-test-delta-proof.mjs` retain this exact authenticated
delta. This preserves the existing native evidence; it is not a new render
or broader moving-clearance claim.

`npm run typecheck` and `npm run build:public` pass on this candidate,
including localization checks and the public registry probe: 174 playable
vehicles, zero GLB-sourced. Existing large-chunk warnings remain; the build
result is not a switch-latency improvement claim.

Combat-anatomy regeneration/check and composed targeted release remain
pending. Focused, native or build results are not substituted for those gates.
The candidate is not release-qualified or published.
