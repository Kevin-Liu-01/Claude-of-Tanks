# T-90A Vladimir Leclerc-method graduation — final independent sitting

Date: 2026-08-09
Candidate: final `codex/t90-family` working bytes (pre-landing)
Reference: recovered T-90A Vladimir source GLB + normalized component oracle
Verdict: **PASS**

## Independent 14-view scorecard

Order: front, front-left, left, rear-left, rear, rear-right, right,
front-right, top, hero front-left, hero rear-right, hero top-tilt,
close front, close roof.

`[9.0, 9.1, 9.0, 9.0, 9.0, 9.0, 9.0, 9.1, 9.0, 9.0, 9.0, 9.0, 9.0, 9.0]`

- Floor: **9.0**
- Mean: **9.01**
- Yaw-90 attachment check: **9.3**
- All-decoration verdict: **PASS**

The independent critic confirmed that the compact ESSA hierarchy, two-tone
MG and buried shield, K-5/Shtora field, cupola, mast/collars and continuous
gun assembly remain visibly seated and rotate coherently.  The final raked
transom exposes two unequal service fields, proud louvre/latch courses and a
dark protected log as distinct depth planes without extending the envelope.
There are no unsupported decorations, empty-air seams, floaters, missing
faces or detached islands.

## Machine receipts

- Geometry gate, twice identically: **90.0** minimum — hull 90.2, whole 90.0,
  turret 91.2, stations 92.2, dimensions 96.2, floaters 100.
- Gate JSON SHA-256:
  `65f470e56fb30822e72680e4451c2039423245c50688f4ec5462a3cda2b2bb22`.
- Freeze, twice identically: **c13fec50** (39 meshes / 71,113 vertices).
- Standard: track band **54/0**, contiguity **0**, fittings **MG 1 + 0**.
- Winding: mode 1 reversed/mixed/deficit **0/0/0**.  The mode-2 `rig_hull`
  generic candidate is an adjudicated false positive: three fresh yaw views
  show no reversed/missing face, see-through wound or separated hull island.
- Full `npm test`: green.
- Recovered source GLB SHA-256:
  `3ceda4972aa0e4cdba9ecf0353ab584ed61b6cd22e1af75d4c077f75c4a67400`.

## Method/result

The rebuild applies the Leclerc method directly: source section curves and
primary cast mass first, source-owned asymmetric stations next, then
attachment/load-path and shaded-parity proof.  The former tall cabinet and
broad blank rear were rejected.  The finished Vladimir remains a low cast
T-90A-family tank, but its compact optical train, roof asymmetry and recovered
transom are its own geometry rather than palette-swapped family decoration.

The earlier near-pass sittings (8.96, 8.99 and 9.01 mean with a rear floor of
8.9) are superseded.  This receipt binds the fresh final-byte sitting above.
