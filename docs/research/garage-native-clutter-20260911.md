# Garage clutter submission, 2026-09-11

The fixed interior clutter palette previously submitted offscreen gaps inside
one merged mesh. It now uses one native batch with per-piece culling, retaining
original baked positions, material values, ordering and all scene contents.
The private material omits identity per-instance transforms because the
geometry already contains them; this preserves original normal arithmetic.
The owner disposes the geometry, both native control textures and material.
Other immutable workshop merges retain at most64 conservative draw ranges;
fixed instances can trim only an invisible tail, with no attribute uploads.

Native r3 exact RGBA comparisons pass all five fixed cameras against the same
baked buffers submitted as an ordinary mesh. All A/B pixels match exactly,
control captures remain stable, and an intentionally dropped batch changes
pixels. Draw calls and warmed resource counts do not increase within A/B.
The candidate creates one private material and two native control textures;
this A/B test does not claim those allocations are absent versus the old build.

| View | Control triangles | Culled triangles | Calls, both |
|---|---:|---:|---:|
| Default |288409|228377|238|
| Left edge |324077|280311|266|
| Quarter |270877|219541|259|
| Right edge |254963|216495|273|
| Rear |261725|206493|286|

Receipt: `.qa-dev/launch/garage-native-clutter-parity-r3/report.json`.
The earlier r2 failed with5–21 changed RGBA bytes from redundant identity
normal arithmetic; no pixel tolerance was introduced. Focused buffer,
frustum, failure restoration and idempotent resource-disposal tests pass;
type checking and public build pass. Phase budgets and live control flow
remain separate required checks before publication.
