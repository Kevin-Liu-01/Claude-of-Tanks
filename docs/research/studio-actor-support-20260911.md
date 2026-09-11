# Studio actor support, 2026-09-11

Storyboard tracks now retain authored horizontal motion while the ordinary
movement support solver controls chassis height and attitude. Replay starts
from canonical state, preserves explicitly staged hydraulic pitch, and steps
support on the global 60 Hz timeline. Display refreshes do not restart settling.

Focused tests use the actual movement solver on flat/sloped surfaces and
compare uniform/cue-subdivided cadence, backward replay and hydraulic staging.
Typecheck and public build pass. Native `studio-native-support-r3` passes the
15-second duel, all four rails, FX controls, JSON round-trip, video recording
(339084-byte VP9), and Garage return. Earlier r2 playback timeout is retained
as a failed run; its unchanged five-second gate passes on r3.

Ground diagnostic `studio-ground-contact-r4/report.json` measures actual
rendered wheel/track vertices against analytic terrain and raycasts selected
lower pad points against rendered terrain triangles. Minimum analytic pad gaps
span -13.667 to +17 mm. Rounded transform hashes repeat after backward seeking;
this is not a deformed-buffer identity certificate. Selected lower pad points
span about -200 to +184 mm against rendered terrain, reflecting terrain mesh
sampling and curved end stock. This does not qualify an entire loaded run or
resolve every terrain/model discrepancy. The old half-metre hover estimate
from an offset shadow alone is unsupported. These diagnostic images retain
Studio authoring guides and are not marketing outputs.

Independent review found the canonical reset and explicit hydraulic fix sound;
no new support-code blocker was identified. Full combined launch testing and
performance ceilings remain separate requirements.
