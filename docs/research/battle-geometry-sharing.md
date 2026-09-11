# Shared immutable battle geometry

Battle vehicles can retain separate GPU geometry objects for identical rigid
wheels, fittings and markings. The final construction stage now shares these
stocks only after byte equality, attribute layouts, groups and bounds match.
A sampled fingerprint only finds candidates; it never decides equality.
Animated carriers/shoes, thrown tracks, ERA and shadow batches are excluded.
Garage static previews preserve their existing construction path.

Each visual retains its original CPU construction owners. The pool owns
independent geometry clones and restores originals before existing disposal.
The last live lease disposes a pooled clone and removes its entry. Comparison
views reference the clone's arrays, so they do not pin a departed visual's
original backing. This trades extra bounded CPU storage for fewer GPU objects;
it does not reduce triangles or materials.

The focused test exercises actual Type90/Type90A articulation, suspension,
wreck/reset, first-owner disposal and final release. The native regression uses
real materialled vehicles, four camera views, composed color/PCF pixels, sibling
disposal and a moved-stock negative control. All four before/after images are
byte-identical; the native pair reduces 122 geometry owners to 94 and 111 uploaded
geometry objects to 83. Its 37 pooled clones retain 910,188 attribute/index bytes;
all pool entries disappear after final disposal. Measured 11.2 ms construction
is an observation from this host, not clean timing qualification.

A production battle inventory reduces attached geometry708→664. In the two
short samples, uploaded geometry changes614→608 and JS heap282.6→289.2MB;
those asynchronous residency/heap observations are not all attributable to this
change. Both samples retain the same235 material owners. Garage triangle limits
and battle material limits remain unresolved; this is not a launch-wide pass.
The full eight-second phase gate completes with four remaining failures:
Garage idle/returned triangles are 264,999/268,705 against 240,000, and battle
materials are 235 against 220. Uploaded battle geometry is 716 against 680;
attached geometry passes at 664 against 680. No browser errors
were reported. Combined regression remains required.

Reproduce native equality with
`node tools/battle-geometry-sharing.browser.selftest.mjs --out=.qa-dev/battle-geometry`.
The tool owns the shared capture lease. Per-file source hashes and actual output
are retained in its report. Initial queued capture invalidated by source edits
is not acceptance evidence; fresh captures must freeze their inputs.
