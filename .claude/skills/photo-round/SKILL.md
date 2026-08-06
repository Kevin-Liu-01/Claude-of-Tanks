---
name: photo-round
description: Run a photo-parity / photo-class round - building or fixing a tank against real-vehicle photos instead of (or over) a GLB oracle. Use for no-oracle base-21 ids, owner screenshot reports ("doesn't look like the source material"), section B7 ref-wrong regions, and new vehicles without references. Triggers - "photo-class round", "photo-parity", "make it look like the real tank", "no oracle", "base-21 modernization", "gap table".
---

# PHOTO-ROUND — the photo-parity flow

Law: PHOTO-CLASS FLOW (banked in docs/references/tanks/leo2a4.md), §B7 owner ref-wrong
override (docs/BUILD-STANDARD.md), FALSE-0 law, base-21 mechanics
(docs/PROGRAM-STATE-base21.md). Executed exemplars: leo2a4 rebuild, fv510 photo rounds 1+2
(docs/references/tanks/fv510.md — the gap-table template), challenger2/t14 slice-2.

## When this flow applies
- **No-oracle ids** (PROGRAM-STATE-base21 table A): NEVER gate them — no reference GLB
  means the gate prints a meaningless 0 and tmp-tank-critic refuses. FALSE-0 LAW: never
  record such runs. The visual bar IS the critic/photo class.
- **§B7 ref-wrong regions**: the owner ruled a print region wrong — the REAL VEHICLE
  (photo class) governs that region; the gate keeps recording honest rows; the divergence
  is certified in the packet as an OWNER REF-WRONG cap (region, rows, measured cost,
  owner quote + date; caps never cover dims). Per-region, not per-tank — uncontested
  regions still chase the print.
- **Certified-capped oracles** (short/shape-divergent prints): curve rows stay the
  certified cap; dims/floaters still gate and must HOLD (usually 100).

## The contract

### 1. GAP TABLE FIRST (the round's scoring contract)
Start with a NUMBERED gap table before touching geometry:

| # | Photo read | Baseline (was) | Fix (now) |

One row per identity read (turret placement/shape, gun grammar, running-gear stance,
kit density, skirts/wheels exposure, antennas, mirrors...). Source = the owner's photo
if given, else the type's photo class (documented refs in the packet). Every §B7
divergence from the print gets its row so it stays per-region certified. The gap table
doubles as the re-verify checklist if a real oracle lands later (fv510 precedent).

### 2. The rig
- `tools/tmp-leo-photoclass.{html,mjs}` / `tools/tmp-ww2-photoclass.{html,mjs}` —
  id-generic PROC-ONLY renders on the critic's EXACT 14-view rig + yaw pose (the critic
  tool refuses no-GLB ids; this rig is the missing instrument).
- Published-dims SELF-ANCHORING: author world = published dims exactly (§D width anchor:
  the width-defining face AT the anchor, scale 1.0, authored = world; ONE proud fitting
  past it rescales the whole build).

### 3. Full current rulebook applies (no oracle ≠ no laws)
§B1 slopes/no-staircases/slope-motivates-the-mass, §B1.1 cheek symmetry, §B2 contiguity
+ top-down holes, §B3 no-mystery-boxes + §B3.1 gun cylinders + §B3.2 density (KIT
fittings, census mg>=1), §B4 track containment (band AND shoe, --exact), §B5 parenting
+ yaw-90 pair, §B6 trapezoid run, §C winding/missing-side (LEFT render vs right —
mirrored slabs through an orientedSlab/sslab guard), §H.4 family tells + national MG
grammar. Machine battery every round close:
`tank-standard-check` / `track-clip-audit --exact` / `turret-parent-audit` (+
`visual-evaluator` where a ref exists), npm test.

### 4. Gate line = the HOLD line
Where a (defective) reference exists: gate x2 with dims 100 / floaters 100 HELD, curve
rows = the certified cap (record honestly, never chase). Where NO reference exists: no
gate runs at all; dims are proven by authored-world = published + the rig's own
measurements.

### 5. Self-read table + packet
- Per-view self-read scores vs the round's floor target (8.5-8.7 build-round class;
  the ACID view is the owner photo's angle). Self-reads are builder estimates, not
  verdicts — say so; the independent critic is the bar (floor >= 9.0 at graduation
  ambitions).
- Packet section: gap table + close-out, battery lines, before/after hashes
  (tmp-hashgeo), honest residuals (rig-wide limits like gun rest-elevation documented,
  not hacked), law-bank candidates, evidence paths (shots/critic-<id>/,
  shots/<round>/).

### 6. Family grammar (base-21 guidance)
Derive the family recipe yourself ("this should also be intuitied"): type10 <- type90,
type99a <- russia lineage, leo1a5 <- leopard1 family, t72b3 <- t72 family,
chieftain_mk10 <- chieftain5 graduate, k2 <- its own modern class. Rebuild in your OWNED
profile home (PROGRAM-STATE-base21 table A) — family homes owned by live agents get
QUEUED notes, never edits.

### 7. Parallel oracle lane
Photo-class never blocks oracle sourcing: a properly-licensed community oracle (bradley
flow — `onboard-oracle`) can land later and revive the measured ladder; the gap table is
the bridge. THE ONE ABSOLUTE RULE stands during sourcing.
