# Supplied fleet readability verification — 2026-09-18

This cleanup separates authored hulls, fittings, launchers, optical housings and
roof receivers into named construction functions. It retains numeric dimensions,
primitive order, attachment ownership, materials and quality-dependent detail.
It does not move the running gear or change rendering policy.

The current main integration is `88592876f84eb1794f2a6d5505bd39d7c51c4ecd`.
Fresh fetch and fast-forward pull confirmed that base before this cleanup.

## Native geometry identity

AFT-10, Kurganets-25, K21 and Type 96B each match their pre-extraction native
HIGH and LOW snapshots exactly. The comparison includes all mesh attributes,
indices, instance buffers, traversal order, local/world matrices, native shadow
meshes, material/shader properties and actual generated camouflage pixels.
The four files have102 functions and zero violations of the repository's strict
cyclomatic/cognitive/Halstead limits. BMP-3M's integrated roof correction was
frozen separately, then its HIGH and LOW snapshots also matched exactly across
the readability extraction. Formatting was checked for identical syntax trees.
These are deterministic stock-identity checks, not frame-time measurements.

Warrior, Griffin and Ajax have the same exact six-build parity proof and zero
complexity violations across153 functions. Their existing source/seat/guard,
gun-pitch/recoil, LOD and disposal fixtures and native TypeScript check pass.

Private receipts are retained under `.qa-dev/tank-run/eastern-readability/` and
`.qa-dev/tank-run/british-trio-readability/`. The latter's freeze records exact
profile hashes. Source-model binaries and private rendered receipts are not
publication assets.

The four European builds (CV90 Mk.IV, KF41, Sabra and CV90105 TML) also pass
all eight native HIGH/LOW identity comparisons and strict metrics. In total,
the24 new non-generated runtime modules currently contain473 measured functions,
with zero complexity violations and no explicit `any` or `unknown` types.
The geometry identity checks cover all12 new profiles in both qualities;
ZTZ-100's existing profile is outside this extraction. Nine shared/tool modules
also have exact old/new positive and negative behavior comparisons, described
in [their repair report](launch-bounded-complexity-repair-20260918.md).

## Tool boundaries

The track audit's changed browser-driver callback now delegates report writing
to a named helper. Four fixed-input mocked runs preserve exact navigation URLs,
events, logs, output and error behavior; a changed strict-query negative is
rejected. The unchanged option tests pass and the module has17 functions with
zero violations. This proves driver equivalence, not a new real-browser audit.

Whole-file diagnostic checks still expose inherited legacy complexity. In
`gen-interior-fills.mjs`, `tank-sealed-check.mjs` and `track-clip-audit.html`,
seven failing function bodies are byte- and syntax-identical to current main.
The other untouched historical image-analysis functions are likewise retained.
Their diagnostic failures are not reported as passing or counted as completed
legacy cleanup. Changed/new functions are checked separately without raising
any thresholds. Final fleet release and real-browser checks are recorded in the
batch packet after regeneration and independent review.
