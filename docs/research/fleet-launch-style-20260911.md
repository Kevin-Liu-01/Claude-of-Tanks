# Fleet launch corrections, 2026-09-11

CV90, CV90 Mk IV and Type89 Light Tiger now use armor paint on broad structural
panels; narrow dark seams and material-specific equipment remain. T72B3M X and
T90SM X retain visible neutral rubber annuli around their painted wheel faces.
K2 X gains six measured rotating return rollers with receiving shafts, a
deduplicated physical carrier loop, and measured cannon sections. Its muzzle
stock accounts for the factory lip without shifting the firing datum.

Verification: complete npm lifecycle PASS (308 pre,629 core,41 post); anatomy
update/check and generated assets PASS. Nine-ID HIGH/LOW wheel-face rays PASS,
six matched paint/control native pairs PASS with unchanged alpha, and the
Type89 control is byte-identical. Historical whole-model regressions retain
their original goldens through a tightly checked test-only inverse of each
explicit wheel opening. The current native geometry still runs physical tests.

K2 X and T90SM X: fresh source geometry floors93.4/92 and92.4/92, strict carrier
and shoe overlap0, open-cell census0, MG1 each. Fidelity and native muzzle
bores pass. K2 roller tests cover actual hull attachment, continuous shoe
clearance, full suspension travel, and visible support at near/far LODs.
Their complete targeted release is still running in
`.qa-dev/launch/k2-t90-final-release-r1.log`; this commit alone is not its result.

T72B3M X retains the preexisting268-cell source-air conflict described in
`t72b3m-x-side-mounts.md`. No source-air waiver or altered gate is introduced.
The three first-party paint targets have no registered external comparison
oracle; the source checks above apply only to K2/T90SM. The wider fleet and
launch-performance program remain open. No third-party geometry is added to
the playable loading path.
