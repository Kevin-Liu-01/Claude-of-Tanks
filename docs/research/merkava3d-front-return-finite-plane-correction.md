# Mk3D X front returns — separate finite receiving planes

Status: **focused physical/native checks passed; not release-qualified**,
2026-09-08.

This is a narrow successor to local bodywork commit
`3787c9868ce362b6e5260fc734bbe0e358fb9be9` and its
[original source/fit report](merkava3d-x-front-return-checkpoint.md).
The earlier 16 before/after images, 520-pose proof and test-only containment
receipt remain preserved. They do not certify the corrected runtime below.

An exact authored-surface review found two overlaps that the earlier 15 m
native images did not resolve: the new outer cap shared the old rubber flap's
front/back and top/bottom planes over its 8 mm-wide lap, and the new side
flange shared the old shoulder's upper plane over an 8 mm lap. These are
physical coplanarity witnesses, not a claim that every distant frame visibly
flickered. The old assertions actually required equal exposed planes.

Only new stock changes:

- The same 90 mm-wide corner becomes .364 m high and .049 m deep at its
  unchanged centre/rake, separating all four local Y/Z planes by 2 mm.
- The 16 mm flange embeds 2 mm into the unchanged shoulder: lower plane
  `roof−.018`, upper plane `roof−.002`. Its width, hem and stations remain.

Every old armor, rubber, kit, wheel, suspension and track buffer is untouched.
The same complete physical test retains lower wheel-mouth air, whole-model
bounds, actual near/far and deforming gear, both details and 520 sampled
poses. All six cap planes are reconstructed from actual emitted triangles,
not nominal box metadata; parallel receiver planes must be separated by more
than 1 mm. Ray entry/exit intervals must overlap more than 40 mm. Both the
old cap and depth-only repair remain negative controls. Shoulder rays now
require 1–4 mm embedding instead of identical exposed height.

Original helper SHA-256:
`0697518437165af17e509543daaaa6246911cefe3b4f90df0bbaf413989f0f93`.
Corrected helper SHA-256:
`31f87c0c11deb1fc86f5fa1ffede512494f2cf2fec0e0e1a555626889c3c5479`.
The original complete shared profile hash `a7cb2366…` is not refreshed.
No anatomy or release threshold is weakened; the parent will qualify the
composed final tree rather than aggregate unrelated receipts.

## Corrected evidence

The fresh HIGH/LOW physical run passed 168 finite receiving contacts, 12 old
gap witnesses, 48 separated actual cap/receiver plane pairs, ten negative
controls, and 520 complete sampled poses (242,088 native instance evaluations,
94 finite triangle tests, 2,112 conservative reverse-containment exclusions).
All original lower-air, retained-buffer, ownership and whole-envelope checks
remain active. These are sampled finite-stock checks, not all-terrain or
continuous-time certification.

Fresh native receipt:
`cot-merkava-end-return-history-20260908/.qa-dev/mk3-front-cap-corrected-native/tank-assets.json`,
input `1fc109b530da667e8444237e5d1076ec283cefeced6411f840297a8728eb527a`
unchanged through capture. All 16 images and eight finish pairs PASS with the
same four maintained QA-native driver files and 15 m/HIGH+LOW/factory+winter/
four-view/seed4242 setup as the original report. The author personally viewed
all eight HIGH-winter/LOW-factory front-left/rear-left/left/right images:
upper closure, lower wheel visibility, native camo, separate rubber/kit and
full framing are retained. These 15 m pixels do not measure 2 mm separation;
the actual finite-plane tests establish it.

Native submission counts remain HIGH 77,644 / LOW 71,820 triangles and 47
calls, identical to the precursor addition. No performance improvement is
claimed. The parent must still run current combined anatomy and composed
release; prior screenshots or this focused pass do not substitute for it.

Fresh corrected `npm run typecheck` and `npm run build:public` both PASS.
The public registry probe remains 174 procedural playables and zero
GLB-sourced runtime models; the existing large-chunk warning remains.
