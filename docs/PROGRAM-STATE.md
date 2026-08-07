# TANK GENERATION PROGRAM — STATE REGISTRY + TAKEOVER HANDBOOK
(written 2026-08-05 at the owner's takeover order; supersedes nothing —
this INDEXES the living law docs, it does not replace them)

## 0. Doc map (where the law lives)
- **docs/BUILD-STANDARD.md** — the LIVING RULEBOOK (owner-ratified build
  laws §A-§J incl. §B3.1/§B3.2; owner standing directive: keep editing it as lessons land).
- **docs/GEOMETRY-GATE.md** — the measured gate, §10 graduation protocol,
  amendments (three-map retirement, trim-boundary interp clamp).
- **docs/references/tanks/<id>.md** — per-tank PACKETS: round history,
  certified caps/classes, banked orders, freeze entries. The packet is the
  tank's single source of truth.
- **docs/critique/** — independent critic verdicts (shaded-parity-*).
- **docs/ATTRIBUTION.md** — oracle licenses (CC-BY / NC-SA quarantine).
- **docs/geometry-gate/** — tool-written gate rows + ledger.json (NEVER
  hand-edit; stage rows via index-blob surgery, see §6 below).

## 1. Mission + definition of DONE
Every tank in the ~88-row ledger ships as a procedural build in
src/vehicles/profiles/*.js, measured against its community reference GLB
until passing BOTH gates, then graduated per §10. A tank is DONE when:
(1) `node tools/geometry-gate.mjs --ids=<id>` reports every component >=90
(hullCurves, wholeCurves, turretCurves, stations, dims, floaters; certified
oracle-defect caps never cover dims); (2) independent critic >=9.0/10 on
EVERY of 14 views of shaded pairs; (3) turntable eyeball; (4) §10
graduation in the same commit. Program ends when ledger min >=90
fleet-wide, every graduate hash-frozen, no tank registers a reference GLB
at load.

## 2. ABSOLUTE RULES (verbatim-critical)
- THE ONE ABSOLUTE RULE: no assets extracted from commercial games, ever.
- Private local project — never publish, never create accounts.
- docs/geometry-gate/ledger.json is TOOL-WRITTEN only.
- NEVER gate m60a1 / m60a3 / kv2 (kv2's oracle is unrecoverable by design —
  freeze-hash verification only).
- FALSE-0 LAW: never record gate runs against missing/broken references.
- Owner plays on port 5001 — headless tools use their own vite 74xx-77xx.
- /tmp/cot-shots.lock FIFO serializes browser tools. Official tools
  SELF-TICKET — never wrap them in an external lock (deadlocks proven).
  Tickets 15-digit zero-padded. Never clear a live lock; 5-min staleness
  reclaim per the tools' law.
- Agents NEVER commit; the orchestrator verifies rigs+hashes+packets and
  commits precise paths. One family per agent; profile files single-owner.
- ICON TRAP: genIcons rewrites all ~520 icons — use `--tanks <id>` and/or
  stage ONLY the target's 5 icons by exact filename, `git restore
  public/icons/` for the rest. Regenerate from a CLEAN HEAD WORKTREE when
  the live tree carries agent WIP (symlink node_modules into the worktree).
- recovered/* GLBs are NC-SA LOCAL-ONLY QUARANTINE (see ATTRIBUTION.md).
- Env for EVERY node run: `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"`
- npm test before every landing (166 equipment checks + track-geometry).

## 3. GRADUATE REGISTRY (26 graduates, hash-frozen)
Freeze = deterministic geometry hash via `node tools/tmp-hashgeo.mjs
--ids=...` (camoSeed 4242 pinned build; FNV-1a over position buffers +
world matrices, mesh-order independent). Graduate-change protocol: fix ->
gate hold x2 -> independent re-cert critic >=9.0 on changed views ->
re-freeze NEW hash, all in ONE commit.

| id | hash | notes |
|---|---|---|
| m60a1 | fbf9f4cc -> 912de524 CANDIDATE (bore+winding sweep, batch re-cert in flight) |
| m60a3 | 051c454c -> 097c35a2 CANDIDATE (bore+winding sweep, batch re-cert in flight) |
| kv2 | 382b2310 | freeze-verify only |
| leo2a6 | cff6f478 -> 09912270 CANDIDATE (bore+winding sweep, batch re-cert in flight) |
| m1a1 | 5290e3bc -> ba45613c CANDIDATE (owner visibility round: CROWS/shields/sterns; §B7-class capped rows, re-cert in flight) |
| m1a1ha | 4023964c -> ff97bc44 CANDIDATE (owner visibility round: CROWS/shields/sterns; §B7-class capped rows, re-cert in flight) |
| m1a2_tejas | 93a9a890 -> 4891abb6 CANDIDATE (owner visibility round: CROWS/shields/sterns; §B7-class capped rows, re-cert in flight) |
| merkava3b | REMOVED BY OWNER 2026-08-06 (roster prune; was 8bb8d984, packet historical) |
| merkava3c | b7318b10 -> 8b7ed9bc CANDIDATE (bore+winding sweep, batch re-cert in flight) |
| kf51 | fcc60d6c -> 9ac547ac CANDIDATE (bore+winding sweep, batch re-cert in flight) |
| isu122s | 60b08d10 -> 8f420d18 CANDIDATE (bore+winding sweep, batch re-cert in flight) |
| isu152 | 8e2f75c0 | |
| merkava3d | 6b97616c -> 39de83c8 CANDIDATE (bore+winding sweep, batch re-cert in flight) |
| pt91m | 2cf10e23 | |
| t72b3m | 1e1ca4b8 | |
| merkava1b | 470f3665 -> 2cc7a76c CANDIDATE (bore+winding sweep, batch re-cert in flight) |
| m1a2 | 75e981e0 -> 4778c7a8 CANDIDATE (owner visibility round: CROWS/shields/sterns; §B7-class capped rows, re-cert in flight) |
| chieftain5 | 94c09bb0 -> d4f2a9a6 CANDIDATE (bore+winding sweep, batch re-cert in flight) |
| t84 | 04707a9c | |
| m47_patton | 53b6123a -> 2fc99c50 CANDIDATE (bore+winding sweep, batch re-cert in flight) |
| leo2a5 | d34a0a58 -> e215a738 CANDIDATE (bore+winding sweep, batch re-cert in flight) |
| leo2_revolution | fa1a47fc -> bb2bb60c CANDIDATE (bore+winding sweep, batch re-cert in flight) |
| m46_patton | 90ebf864 -> 108806c8 CANDIDATE (bore+winding sweep, batch re-cert in flight) |
| centurion3 | fea56ecc -> 46b03895 CANDIDATE (bore+winding sweep, batch re-cert in flight) |
| m1a2_sepv2 | b284b8ac -> 83277374 CANDIDATE (owner visibility round: CROWS/shields/sterns; §B7-class capped rows, re-cert in flight) |
| m26_pershing | 2f579de8 -> 65c564c0 CANDIDATE (bore+winding sweep, batch re-cert in flight) |

*Historical note: the 2026-08-05 INVISIBLE-LOD fix mass re-froze the
then-24 stable graduates (old->new table in commit 9bf2a6d); every row
above now shows its CURRENT ratified hash after the 2026-08-06 waves
(cheek+gun, density, shoe, gun-run, ring rounds — all re-certified).

Mirror maps (graduates + flip-era tanks measure via these, NOT runtime
registration): tools/procedural-fidelity.html LOCAL_REFERENCE_OVERRIDES,
tools/visual-evaluator-page.html CRITIC_REFERENCE_OVERRIDES (committed),
tools/tmp-tank-critic.html CRITIC_REFERENCE_OVERRIDES (committed at the
takeover sweep decec28). §10 LESSON: mirror
the HELPER-EXPANDED config, never the surface call (the gunNode incident —
userdrops5's `articulated` helper includes `gunNode:'^Gun'`; dropping it
cratered leo2a5 to min 0 at load-prove). Load-prove = `node
tools/tmp-modelsource-dump.mjs` shows the id ABSENT from the glb map +
gate still measures via mirror.

## 4. FLEET STATE at handoff (ledger 2026-08-05, 23/88 pass — revolution
honestly parked at 88.9 pending its retune)
- **Gate-PASS awaiting visual ladder / adjudication**: challenger1 90.2
  (critic floor 7.0, chieftain-exact recipe one round behind), centurion5
  90.7 (floor 7.0, O3 cast-turret round) — uk round-4 agent ON IT.
  m1a2_sepv2 GRADUATED (25th).
- **80-90 band**: m60a2 86.3 (ceiling 87.5 — cert decision pending),
  bradley 84.7, bmp2 84.0 (ceiling), m45_patton 81.2 (stop-rule closed).
- **80-90 additions (misc r3 CLOSED, ceiling-measured ~84-85 each)**:
  type90 83.6 (station lane class binds; 3.69 band-solver col =
  orchestrator lane), ariete 82.3 (wrap break LANDED via lane-local fill
  — the sanctioned non-circular mechanism; cover/frame-lock certified).
- **70-80**: t64bv1 73.4, t90a_vladimir 71.4. m26_pershing 90.4 GATE
  GRADUATED (26th, 2f579de8). X-brace architecture conflict remains an
  orchestrator ruling item (stations-law open track zone).
- **Russia tail**: t72b_1987 56.0 CEILING-CERTIFIED (print drum-band cap),
  t90sm 56.4 (AA-teeter binds), t62mv1 63.7 (fade-cap ceiling ~77-81),
  t72bu ~55-70 certified-ceiling — ORACLE
  DECISION PENDING (orchestrator lane). t72b3m RE-ORACLE DECIDED
  2026-08-06: NO SWAP (onboarding evidence: current oracle dims-EXACT +
  split-clean + the 91.8 row frozen against it; the obr-2022 drop is a
  later configuration = feature order + §E normalize + full re-gate,
  not a measurement upgrade; it serves as the t72b3 BASE oracle instead;
  ATTRIBUTION LEAD: the recovered t72b3m print is very likely 42manako's
  own earlier upload — mesh 'T-72B3M_Zavod_edition', identical width).
- **BASE-21 MODERNIZATION WORKSTREAM (owner directive 2026-08-06: "the
  21 original base-game customs (Sherman, Tiger I, T-34-85, Leopard
  2A4/2A7, T-14, Challenger 2, etc.) need to begin being worked on
  because the current models are wholly ancient")**: these predate the
  oracle program — most have NO ledger row (no reference GLB; leo2a7v 0,
  t80u 75.4 and t90m 81.7 are exceptions with oracles). Mechanics: (a)
  identify the exact 21-id roster from TANK_SPECS (first triage task);
  (b) per-family PHOTO-CLASS modernization rounds under the full current
  rulebook (§B1-§B7, §C) as lanes free — the visual critic is the bar
  where no oracle exists (false-0 law: never gate without a reference);
  (c) parallel oracle-sourcing lane (community CC models only, bradley
  flow — THE ONE ABSOLUTE RULE stands). SLICE 2 DONE (2026-08-06 pm): ROSTER DELIVERED
  (docs/PROGRAM-STATE-base21.md — 17 no-oracle ids: 15 true originals +
  2 quarantine-fallbacks; real ids are t14/k2 not t14_armata/
  k2_black_panther); challenger2 REBUILT (modern1.js, floor 8.6, clips
  102/78+182/74 -> 0/0+0/0, mg1+5d, hash 22c8127); t14 REBUILT
  (modern2.js, floor 8.6, clips zeroed, mg1+2d, hash 1d232727); ww2 trio
  AUTHORED in ww2.js but ladders PARKED per the modern-first order
  (next-slice item; Sherman rx-sign fix banked). QUEUED my-lane: spec
  gunBarrel true-ups (challenger2 ~6.3, t14 6.15 — verify per-tank
  before editing). FIRST SLICE DONE (2026-08-06): leo2a4 REBUILT
  photo-class (the first base-21 modernization — new buildLeo2A4, all
  batteries clean from 83/436-clip mg0 ancient state; spec 9.67 true-up
  landed); leo2a7v re-laid on the V3 rig (dims 100, clips 0/0, certified
  proportional ceiling; §E re-source request filed in packet);
  PHOTO-CLASS FLOW law banked (tmp-leo-photoclass rig = the no-oracle
  lane mechanism for the remaining base-21 slices).
- **fv510 NEW ORACLE (2026-08-06, owner drop)**: community/
  fv510_warrior.glb (42manako CC-BY-4.0, verified; ATTRIBUTION.md).
  ONBOARDING = orchestrator lane, bradley flow: vertex-extract REG +
  registration into the harness maps (HELPER-EXPANDED law) + gate
  baseline x2 + retire the recovered/ short-print (batch-44 note stays
  historical). The live fv510 photo-parity round gates dims/floaters
  only meanwhile (notified).
- AFV LANE LANDED (2026-08-06 eve): spz_puma BUILT + oracle-registered
  (honest 7.7 baseline x2, dims 100; §E NORMALIZE PLAN FILED z x1.0418 /
  y x1.0444 — orchestrator executes, build already authored post-warp
  frame); type89 BUILT photo-class (rip stayed refused); k2 verified
  (flap suspect negative); type99a REBUILT from blueprint (clips
  119/44 -> 0/0, mg1+6d). Queue: type99a spec-width 3.5-vs-3.7 owner
  ruling, gunBarrel true-ups, icons x4.
- **SPz PUMA — NEW VEHICLE (owner order + oracle drop 2026-08-06:
  "make the spz puma as well")**: community/spz_puma.glb landed (42manako
  CC-BY-4.0, verified). FULL BUILD-UP QUEUED, next free lane: (a) spec
  row (German modern IFV: 30mm MK30-2/ABM in an unmanned RCT30 turret
  offset left, hull crew of 6+3, ~7.6m x 3.7m x 3.6m, twin whips, ROSY,
  slat/skirt options); (b) profile home = wherever bradley/bmp2 live
  (AFV class) or a new afv builder; (c) bradley-flow oracle onboarding
  (extract + registration + baseline); (d) full photo-class round to the
  rulebook incl. §B3.2 density; (e) icons + CUSTOM tab row.
- **TYPE 89 IFV — NEW VEHICLE queued; oracle drop REFUSED (2026-08-06)**:
  the dropped type_89_ifv_war_thunder.glb is titled "Type 89 IFV (War
  Thunder)" in its embedded metadata = a commercial-game extraction; THE
  ONE ABSOLUTE RULE refuses it regardless of the Sketchfab CC-BY tag
  (uploader cannot license Gaijin's model). File NOT copied. The Type 89
  builds PHOTO-CLASS on the bradley recipe (owner: "use the bradley on
  puma and this type 89 ifv") — 35mm KDE autocannon turret two-man
  right-offset, 6 roadwheels, firing ports; a properly-licensed
  community oracle is welcome if one exists (bradley/warrior/puma are
  all 42manako CC-BY — check that catalog first).
- PUMA amendment: base the build on the BRADLEY recipe (owner order),
  with its 42manako oracle for measurement.
- **BASE-21 ORACLE WAVE (2026-08-06, owner drop x8, licenses verified)**:
  ONBOARDING QUEUE (orchestrator lane, bradley flow each: extract + REG +
  harness registration (HELPER-EXPANDED law) + gate baseline x2):
  leo2a4 <- leopard_2a4_otco; type10 <- type-10_main_battle_tank;
  challenger2 <- challenger_ii (80MB); t14 <- community-candidates/
  t-14_armara (223MB LOCAL-ONLY, gitignored — extracts committed, GLB
  never pushed); t72b3 base + t72b3m graduate re-oracle candidate <-
  t-72b3m_obr_2022 (graduate swap = full re-gate + re-cert protocol);
  leo1a5 family influence <- leopard_1a4 photogrammetry scan;
  challenger1 ALTERNATE ref (already gate-PASS on its print — optional
  compare); challenger_3 = NEW-VEHICLE candidate (CC-BY-NC: local
  measurement only, never ship). Type 89 rip stays REFUSED — photos.
- **BASE-21 FAMILY-INSPO GUIDANCE (owner 2026-08-06): k2, type10,
  type99a, leo1a5, t72b3, chieftain_mk10 take inspiration from their
  tank families** (type10 <- type90 recipes, type99a <- the russia-style
  lineage, leo1a5 <- leopard1 family, t72b3 <- t72 family, chieftain_mk10
  <- chieftain5 the graduate, k2 <- its own modern class) — "but this
  should also be intuitied": builders derive family grammar themselves.
- **OWNER PUNCH LIST 3 (2026-08-06 eve)**: (1) MUZZLE BORES fleet-wide
  (§B3.1 addendum banked 32a6946: rim + recessed near-black bore disc;
  graduates = graduate-change flow) — abrams round + fleet sweep agent
  spawned, live lanes (misc/modern2+3/ww2) relayed; (2) "fix m1 butts"
  (screenshot): M1-family rears — §B2 void pocket beside the exhaust
  grille, grille reads stuck-on-box not the real full-width plate,
  floating rear fender rails, deck camo scale mismatch — abrams round
  spawned (same agent as bores).
- **OWNER PUNCH LIST 2 (2026-08-06 pm, four screenshots)**: (1) DONE — fv510 photo-parity r2: all NINE gap-table reads closed
  (turret left-offset, 2x4 chunky banks, tall whips, deep vent rings,
  low guarded lights + convoy plate, loaded bins/racks mg1+16d, skirts
  22cm over wheel tops, mirrors inside the anchor); self-read floor 8.7;
  dims/floaters held; hash bf3bdf00. New-oracle onboarding still queued
  (the gap table = the re-verify checklist); (2) DONE — SEPv3 RESOLVED: TANK_SPECS.m1a2 IS the named M1A2 SEPv3;
  TUSK rebuilt real (ARAT-1/2 grammar, cage, TIP, LAGS-M240, 14.1,
  clips/contig zeroed); AIM 48.8; abramsx bow closed; five graduate
  candidates pending re-cert; (3) revolution turret
  see-through sides/ring ("disembodied") — relayed to the LIVE leopard
  agent; (4) DONE — leclerc front re-authored (29-deg plane per cheek to the
  1.55-1.74w strip, sight recessed §B1.1, gun run per §B3.1; 85.3 held
  x2 with receipted symmetry trades) + §B3.2 density + the t80u/type90/
  type74 winding fixes verified in the final file (REVERSED 0 x27); (5) DONE — russia §B3.2 density: mg backlog CLEARED 10/10 (census mg>=1
  everywhere, +25 markers; T05BV-1 RWS grammar on t90sm/t90m, Utyos on
  t80bv, coax ports x9, logs/links/cables laned); every gate held or up
  (t72b_1987 +1.3); graduates EXACT x3. Residual classes packet-noted
  (jerryCans/headlights blocked by certified-tight rows).
- **OWNER PUNCH LIST (2026-08-06, five rounds spawned)**: (1) DONE — ariete+leclerc left sides FIXED (reversed-winding class
  decoded: mirror loops hand slabs inward faces, FrontSide-culled but
  DoubleSide-mask visible; orientedSlab guard landed; gates held exact;
  leclerc bonus: contig 0, mg1, §B3.1 gun root. OPEN CARRIERS: t80u,
  type90, type74 — next misc/russia rounds);
  (2) merkava guns DONE — MG251/253 runs de-prismed all 8 marks (frozen
  rows EXACT; 3b/3c candidates 8bb8d984/b7318b10 pending re-cert critic;
  mk4 evac surfaced at station; 4b +3.1 stations); abrams DONE — cheeks raked family-wide (A/B curve-identity proofs),
  gun runs de-prismed x8, AIM on the family shell (46.3 honest: family
  mandate vs short print, cert extension filed), TUSK/abramsx actively
  batched; FIVE graduate candidates pending the family re-cert critic;
  (3)+(4) folded into the abrams round above; (5)
  russia-wide §B3.1 prism sweep; (6) DONE — fv510 Warrior BUILT ACTUAL (photo class: offset
  turret, RARDEN §B3.1 cylinders + perforated hider, slat cages, skirts,
  GPMG, mg1+13d; dims 100, batteries clean; hash 6bfcee8). Oracle
  adjudicated HONEST-0 (print -10.9% short + shape-divergent); batch-44
  warp EXECUTED (hold lifted, height-clamp root cause) — frame honest
  (cover 1.12%, safeScale 1.0), headline stays print-capped: the
  photo-class build is the truth, visual critic is fv510's bar.
- **OWNER PRIORITY (2026-08-05): fv510 Warrior marked a PERFECT CANDIDATE
  for a full round** — next open family-lane slot takes it (its repair
  recipe was incident-disabled; re-adjudicate the oracle first, §E).
- **Zero/low rows** (triage lane): recon_tank ruling, q_heavy/t30 walls
  (fv510 RESOLVED: built actual + photo-parity r2 + new oracle pending
  onboarding), merkava2b 39.6 / 2d 34.9 / 4 0 (family rebuilds; 3b+4b REMOVED BY
  OWNER 2026-08-06), t54 winding repair, m48 pitch, type74+t80bv scaleToOverall
  ruling.

## 4.9 GEAR R8/R8B REVERTED (2026-08-06 pm): the unconditional belly pan
(3ce46b8 + 2811281) is UNDONE per the owner's screenshot report ("terrible
gray rectangle under the tanks") — §B2 CLARIFICATION law banked (holes,
not channels; per-tank authored closures only). Revert verified: five
sampled graduates return EXACTLY to ratified registry hashes (2f579de8/
90ebf864/75e981e0/94c09bb0/fbf9f4cc) — no re-freeze needed. The earlier
belly-pan clamp task is SUPERSEDED by this revert. sherman_jumbo's 22/10
band + 34/6 shoe audit reading is PRE-PAN (persists post-revert) — ww2
lane decode item.

## 4.95 §C.1 FLEET BASELINE (winding-audit, 2026-08-06): mode-2 HARD
candidates -> lane queue: t72b3m 11227 (russia agent ON IT), t90a_vladimir
9973 + t90m 1903 (russia agent), m1a2_sepv2 5519 (abrams agent relayed),
challenger2 2666 (moderns agent relayed), spz_puma 2829 (modern3 queue),
m60a2 5304 + vickers_mk1 4562 + is1/is2 (lane queue); isu122s/isu152 =
casemate by-design (adjudicated). Mode-1: t80u 0.33% open-surface,
challenger1 0.31%, t62mv1/t72b_1987 0.25%. LATENT REVERSED-CORES (census
only, occluded): vickers 8, centurion3 6, centurion5 6, merkava3c 6,
merkava1b 5, merkava3d 4, +12 more — sweep when lanes free.

## 4.97 OWNER ORDERS 2026-08-06 late: (1) jerry cans darkened fleet-wide
(kit.js default slot -> canvasCloth; graduates carried via live rounds'
candidates); (2) MANTLETS MANDATORY fleet-wide (§B3.1 addendum; relayed
to live sweep + t90m lanes; type90 named); (3) type90 SIZE audit (spec
vs real 3.43x2.34x9.76 — my-lane verify-first true-up; dims=100 doesn't
prove the spec); (4) still-unstarted base-21: leo2a7, chieftain_mk10,
type10(held), leo1a5, type74, t72b3 build rounds queue BEHIND the §B8
acceptance-critic calibration (building six more tanks before the
proportions verdicts would repeat the puma mistake); k2/t14/challenger2
rebuilds await their §B8 verdicts; sepv2/sepv3 visible upgrades are
MID-FLIGHT (live abrams round, not yet landed).

## 4.98 GARAGE FOUR-GROUP CATALOG LANDED (owner order 2026-08-06):
Cold War 15 | Modern 42 | WWII 12 | Sources 32 — Sources computed live
from MODEL_SOURCE (auto-shrinks on graduation; COLDWAR_IDS map documented
in garage.js; six glb-sourced cold-war ids auto-migrate on graduation).
Owner files untouched. Flag for owner: charioteer spec era 'ww2' (a
1950s TD — say the word for a spec-era true-up).

## 4.99 §B8 ACCEPTANCE SLATE (2026-08-06): 0/12 PASS — verdicts +
prioritized orders in docs/critique/photo-acceptance-20260806.md.
RESPAWN PLAN (hardest first, lanes as they free, briefs MUST carry
§B8.1 target numbers + the per-tank order lists): (1) t14 + leo2a7v
(structural: turret 1.82->~1.0 shroud; a7v band re-parent/cut), (2)
spz_puma + challenger2, (3) type99a (drum->wedge rebuild) + t34_85,
(4) type89 + m4a3e8, (5) leo2a4, k2, fv510, tiger1 (single-dominant-
order marginals). Also: promote the four-box probe; tmp-tank-critic
matched-scale mode wanted; fv510 print -11% (pub sovereign, held).

## 4.995 URGENT MY-LANE: leo2_revolution turret measures 0.2 at HEAD
(ledger 62.8) — the owner's b08d1a2 GLB revert broke the batch-43
coupled baseline; adjudicate the repair chain vs the last-good asset +
re-baseline the §B7 cap BEFORE any revolution re-cert ratifies.

## 4.996 leo2a7 REMOVED BY OWNER (2026-08-06: "fully focus on the 2a7v")
— roster-delisted (spec row stays as the revolution's donor); leo2a7v's
§B8 structural rework (the 77%-hull turret merge) is THE 2a7-line focus,
queued for the leopard lane after the live round (revolution priority +
proto + 2a4). CROWS REWORK ORDERS banked for the next abrams round (on
the visibility re-cert verdict): point the right direction (not
forward), armor surrounds on some, ammo boxes, lights, shapes CONNECTED;
sepv2 donor verified already-m1a2. FLEET ICON REGEN queued (full
worktree run — the "3d images for the tank scrolling section" order).

## 4.997 OWNER ORDER BATCH (2026-08-06 late — EXECUTE FIRST NEXT WAKE):
(1) REMOVE t72b3 + type99a from the roster (CAUTION: t72b3 is the make()
donor for pt91m/t64bv1/t72b_1987 — delist-keep-spec like leo2a7; type99a
spec modern2.js:291 + its new builder go dormant; drop ledger rows +
icons; the type99a spec-width ruling dies with it). (2) type10
UN-QUARANTINED BY OWNER ("build the type 10 and challenger 2 as a
priority using the real glbs" = the pending adjudication CLEARED): mv
community-candidates/type-10_main_battle_tank.glb -> community/,
ATTRIBUTION owner-cleared note, register (three maps + REG, the held
config comments are in the map files), then the PRIORITY type10
oracle-driven §B8 rebuild (misc.js lane, free). (3) challenger2 PRIORITY
oracle-driven §B8 rework — RELAYED to the live moderns agent. (4) K2
REAL GLB: owner says one exists — check ~/Downloads for a k2/black
panther GLB (none seen in the 11 drops); if present: provenance check
(§E ORACLE PROVENANCE law — live page, not just extras), bradley flow,
then k2's oracle-driven round. (5) FLEET ICON REGEN still queued.

## 5. IN-FLIGHT AGENTS (SUPERSEDED BY §12 — the 2026-08-05 device
handover interrupted these; respawn per §12)
1. DONE+RATIFIED: abrams dual critic (m1a1ha f5c556dc, sepv2 §10 run).
2. DONE+RATIFIED: revolution re-cert (1993cfb1); retune round SPAWNED
   (hull 88.9 -> 90+ + P-1 fore-ring tells + P-2).
3. **misc r3**: type90 ladder + ariete wrap-break attempt.
4. **russia tail-3**: t62mv1 decode + t90sm §B1 loft rework.
5. **patton re-anchor**: m26 post-warp re-anchor from the WARPED extract
   (dims 91.9 -> 100 via proc M2 band lift to the 3.08 spec).
6. **uk round-4**: challenger1 + centurion5 visual ladders toward
   adjudication (26th/27th candidates). MUST hold centurion3 bf0a45e8.

## 6. ORCHESTRATOR MECHANICS (how landings actually work)
- **Pathspec/hunk-split commits**: the owner's parallel session stages
  deletions and edits shared files — check `git diff --cached --name-only`
  before every commit; never `git commit -a`. For tool-written JSON
  (ledger) stage surgical row updates WITHOUT touching the worktree file:
  build content = HEAD + target rows, then `git hash-object -w` +
  `git update-index --cacheinfo 100644,<blob>,<path>` (script:
  scratchpad stage-ledger-rows.py pattern — HEAD rows + worktree rows for
  the named ids + recomputed passed/total).
- **Split-staging a shared code file** (e.g. repair_oracles.py holding two
  batches for different landings): build the staged variant from the
  worktree by cutting the held-back block, hash-object + cacheinfo, keep
  the worktree intact.
- **Cross-file rider grep at every landing**: profile diffs referencing
  symbols (BUCKET_DEF entries, cfg.*/S.* params) must resolve in COMMITTED
  files — grep before committing or HEAD lands mid-state.
- **Oracle repairs (warp law v2, §E)**: fresh .bak from committed HEAD
  bytes; PRE-FLIGHT: run the existing chain and prove it reproduces
  committed bytes BEFORE extending; batches before `if __name__`;
  byte-idempotent shasum x2; census expect guards; gate-in-loop vs stable
  baseline; demotion notes when a recipe supersedes (archive old bak as
  *.pre-batchNN-history). Spec-mirror true-ups (vertex-extract.mjs
  pubDims) land in the SAME batch as their userdrops spec edit.
- **Agent brief boilerplate** (every spawn): NEVER commit; single-owner
  file; env line; own vite 74xx-77xx; FIFO hard rules; NEVER stop to wait
  on watchers (stopping ends the run — run chains sequentially
  in-process); graduate hashes to hold; false-0; read BUILD-STANDARD
  first; §F.4 report format; packets WRITTEN before reporting.
- **Infrastructure deaths**: SendMessage-resume first (context intact);
  respawn fresh only if the transcript is unrecoverable. Waiter-stalls
  (agent stops "to wait") get a finalize nudge via SendMessage.

## 7. MY-LANE QUEUE (+ ammo-can LEFT-FEED nit: hand-authored CROWS/band cans hang gun-right; M2 feed is left — abrams family lane, non-blocking) (orchestrator work, ripeness order at handoff)
1. Land the six in-flight agents' results (per §5 protocols).
2. t72bu oracle decision (certified-ceiling ~55-70; packet has the
   evidence; options: warp batch vs ceiling-cert vs re-source).
3. m60a2 cert decision (86.3 vs ceiling 87.5).
4. Fleet flip wave 2 (donor/0-row ids as builds land) + full fleet gate
   sweep (post-amendment ledger refresh; expect frozen-row drift-up
   refreshes, no re-cert needed per the amendment).
5. Band-solver front mirror for type90 (flagged orchestrator-lane by misc
   r2: the 3.68 col, ~0.28x2).
6. Smaller rulings: t54 winding repair (scout-gen2-t54.md), m48 pitch +
   _region_pitch, scaleToOverall ruling (type74+t80bv), workorder
   shared-box promote, mask-island certs, contact-alias, tejas drift 89.4,
   recon_tank ruling, fv510/q_heavy/t30 walls, RIM-FLOOR fleet lighting
   term, padHug frozen-centurion coupling, mg FITTINGS migrations (§I),
   shoe-envelope audit extension.

## 8. OWNER DIRECTIVE LOG (this program's history; all codified as law)
1. §B5 turret furniture parenting (sepv3/merkavas/t72b3m rear-turret kit
   must rotate) — LAW + fleet audit tool; DONE for named tanks.
2. §B6 track silhouette \\________/ (chieftain front) — LAW; DONE.
3. §B1 Abrams sloped turret fronts (with photo) — LAW; DONE.
4. LIVING RULEBOOK: continuously edit the generating rules — ONGOING.
5. AFV love (bradley/bmp2) + owner-downloaded m2_bradley_ifv.glb
   (CC-BY-4.0, ATTRIBUTION.md) — oracle landed; bands 84.7/84.0.
6. CUSTOM tab completeness (t80, type10, type99a, leo1a5, t14, t72b3,
   challenger2, type74, pt-91, k2, chieftain mk10, sepv3-from-abrams) —
   DONE (roster 70).
7. t84 turret seat (batch-40 compound warp) — DONE, graduated.
8. c1 ariete broken turret — rebuilt; ladder ongoing (78.5).
9. kf51 turret front — DONE, graduated 3ae9b70c.
10. §B1 NO-STAIRCASES (screenshot) — LAW.
11. §B1 SLOPE-MOTIVATES-THE-MASS — LAW.
12. §B3 NO-MYSTERY-BOXES (merkavas/t-xx/sepv3, especially guns) — LAW;
    merkava pod-tells re-certed + re-frozen; sepv2 swept (candidate 25).
13. m1a1ha rear tracks/gaps (screenshot) — fixed, pending re-cert critic.
14. leo2_revolution fused turret (screenshot) — coupled de-fusion LANDED
    c9ddba0 (honest 88.9; retune round owed).
15. Scale: "many more agents open building tanks" — 6 in flight at
    handoff; keep respawning freed family lanes on every landing.
16. Takeover order (2026-08-05): this document + full commit/push.

## 9. INCIDENT LESSONS (codified; the mechanism lives in the named law)
- gunNode/helper-expansion (§10 lesson, GEOMETRY-GATE.md + §3 above).
- t84 double-warp: python asserts on REPAIRS[id] must target the LAST
  definition site (rindex) — duplicate keys ran a stale batch and
  double-warped; restore from fresh .bak = committed bytes.
- Assert-after-append bug: landing scripts must assert against the FILE,
  not the in-memory copy they just appended to.
- Stale staged deletions (owner's parallel session) swept into commits
  twice — hence the §6 pathspec/cacheinfo discipline, always.
- genIcons on a live tree with agent WIP times out / bakes WIP geometry —
  clean HEAD worktree + symlinked node_modules + --tanks filter.
- zsh word-splitting: `for t in $VAR` treats the string as one word — use
  `${=VAR}`.
- FIFO: foreign plain-FILE lock wedged the dir-lock FIFO — all lock tools
  patched (rmdir -> ENOTDIR -> unlink). Self-locking tools deadlock inside
  external wrappers (two incidents). 16-digit tickets queue-jump the
  15-digit sort. Under fleet load, official runs die at the 30-min queue
  timeout — retry honestly; one-ticket batch drivers for render batches.
- Vite serves LIVE bytes at navigation time — a queued driver renders the
  tree as of lock-acquisition; treat in-flight runs as measuring the
  current tree.
- Browser-pane screenshots read black on this box — verify visuals via
  repo puppeteer tools (tools/tmp-*.mjs), never pane screenshots.
- Cross-critic calibration: the ratified chieftain5 anchor governs
  severity disputes; adjudicate with measurements, not vibes.
- Agents stopping to "wait on watchers/monitors" end their own runs — the
  brief boilerplate forbids it; nudge stalled agents to run chains
  sequentially in-process.
- Critic top-pair orientation: bow = image bottom (gun-overhang check
  before calling turret-front reads).
- ORACLE-REGISTRATION-PINNED class: when the REF keeps furniture
  hull-side, the fix is coupled (followers extension in the three maps +
  proc re-parent + full re-gate in ONE landing).
- Camo-bucket moves reseed bakeDirt mottle (LOCAL frame) — pixel-diff
  unreachable; full critic re-cert required.

## 10. PERF/CERT SIDE-LANE (background)
tools/quietcert.mjs waits for a genuinely quiet machine to certify the
perf budget (docs/cert-r6-* artifacts; contended attempts REFUSED by
design). Under constant fleet load it may never find a window — that is
honest; do not relax its stamps. Re-launch overnight when agent load
drops: `nohup node tools/quietcert.mjs >> docs/quietcert-r6.log 2>&1 &`

## 11. SESSION CHRONOLOGY 2026-08-05 (the takeover-day landings, in order)
0e47256 merkava re-cert PASS x4 — pod tells certified, four re-freezes
(1fda7dbd/87ba249c/4880b0a4/93e7b4eb). 8cfa546 patton m26/m45 band (m45
59.4->81.2; m26 warp request filed). 0eeaced misc push-2 (type90 79.0,
ariete 78.5 ceiling-measured). 0c37688 russia tail-2 (t90sm 46.9,
t72b_1987 56.0 ceiling-certified). a6c01ed rulebook six-law bank.
bc17984 m26 batch-42 warp EXECUTED (print cured, 74.8, dims 91.9 =
re-anchor debt; heightM 3.08 true-up). fd2c365 GRADUATION centurion3
(24th, bf0a45e8). c9ddba0 leo2_revolution coupled vlo de-fusion (honest
88.9). e85e546 abrams round (m1a1ha rear-fix + sepv2 §B3). 588fe43 this
registry + §10 helper-expansion amendment. decec28 takeover sweep (full
tree). 636d3e4 GRADUATION m1a2_sepv2 (25th, b489ba14) + m1a1ha f5c556dc
and revolution 1993cfb1 re-certs RATIFIED + §J critic laws. 92f5817 uk
round-4 (ch1 90.1 orders delivered, c5 chamfer grammar law).

## 12. INTERRUPTED ROUNDS — respawn briefs for a new device
This session's background agents die with the machine. Their WIP (if any)
is snapshot-committed; each line below is the respawn mission. Use the §6
agent-brief boilerplate (never-commit, single-owner file, env line, vite
74xx-77xx, FIFO §F.1, never-wait-on-watchers, graduate hashes, false-0,
read BUILD-STANDARD+packets first, §F.4 report).
1. DONE pre-handover (landed in 2a6094b, report verified): misc r3 —
   type90 83.6, ariete 82.3, both ceiling-measured; eight laws banked in
   packets (1024-PARITY PROBE, FRUSTUM-HALFWIDTH, LANE-LOCAL FILL, etc.).
   Next misc round = orchestrator band-solver col + certified classes.
2. DONE (landed post-handover): russia tail-3 — t62mv1 63.7 (+15.8, stale
   crown caps retired, drum row decoded, dims 100), t90sm 56.4 (+9.5,
   dims 100, clips 0/0; AA-teeter family binds ~2-4 pts variance).
   Ceilings: t62mv1 ~77-81 (print rear-gear fade certified). Next russia
   round: t62mv1 side-row ladder under the fade cap.
3. DONE: m26 re-anchor landed — 74.8 -> 90.4 GATE PASS x2 (first-ever
   pass; dims 100; registration -0.002/0.001; clips 0/0 band + shoe;
   cheekPod deleted; bow = certified print-class near-vertical glacis, no
   further warp). Candidate hash f348ecd5. PENDING GRADUATION
   ADJUDICATION (14-view critic = new-device spawn; would be the 26th).
4. uk round-5 (uk.js): ch1 (gate wall 90.1, spare 0.1) O6 shading family +
   close-roof camo + dead-rear MG; c5 crown-tab pair + plateau-vs-pear
   casting + top clutter. Self-read >=8.9 every view -> request
   adjudication (26th/27th). Hold chieftain5 5117b9a8 / centurion3
   bf0a45e8.
5. DONE PENDING RE-CERT: revolution r17 retune landed — 88.9 -> 91.2
   PASS x2 (honest deck shelf, mast-column riser, belly 0.338, P-1 tells
   mask-free, P-2 proven cast-shadow). Candidate 323228f8; re-cert critic
   = new device's first spawn (all 14 views; camo reseeds).
6. DONE: m1a2 §B3 re-cert PASS — re-frozen 248a8468 (bytes were already
   at HEAD via the handover snapshot; ratification landed).
7. DONE (landed post-handover): INVISIBLE-LOD ENVELOPE fix — root cause
   was the de-track destruction kit parked hidden at thrown pose (not
   LOD); now lazy-built on first throw. 12/12 render pairs byte-identical
   (incl. detrack visuals), gates held, 24-graduate mass re-freeze landed.
   Follow-ups for family lanes: procShadow_gun oversize true-ups (t84
   +1.80m, m46 +1.60, kf51 +1.16, leo2a6 +1.09, kv2 +0.84, ariete +0.25);
   icons re-frame tighter at next genIcons per tank.
8. DONE (landed post-handover): shoe-envelope audit shipped — instance
   sampling with >=1.5cm depth bar + dressingSkipped conformance
   exclusion; bandVox output backward-compatible; m1a1ha + 15 negative
   controls clean. FINDINGS = the new §B4 queue (graduate-change flow,
   re-run --ids fresh before acting; full table in the audit report/log):
   BLIND SPOTS ranked — kf51 front 387 (glacis toe, render-confirmed) +
   rear 184; leo2a6 316+192; leo2a5 308+126; isu152 264+50; merkava1b
   140; t72b3m 112+24; t84 near-blind front 162; merkava3d 32; 3b/3c 18;
   t62mv1/t90sm/t90m 12-18; isu122s 8. Worse-than-band severity: t90a
   608, t64bv1, t72bu, bradley rear 121, chieftain_mk10 44.
Plus the standing my-lane queue in §7.

## 13. HOW TO RESUME FROM A NEW DEVICE (the loop protocol)
1) Clone; `npm install`; verify `npm test` (166 + track-geometry).
2) Read this file, BUILD-STANDARD.md, GEOMETRY-GATE.md.
3) Respawn §12 rounds (one agent per profile file; two critics max
   concurrently for FIFO sanity; 6-8 agents total is the proven load).
4) Land on notification: verify hashes yourself (tmp-hashgeo), pathspec/
   cacheinfo commits (§6), re-freezes only on critic PASS, §10 on
   graduation PASS, push after each wave, update §3/§4/§5 rows here.
5) Re-arm a ~25-min heartbeat that re-reads this file as the handoff.
The owner's standing orders: keep going with everything, many agents,
LIVING RULEBOOK (every lesson lands in BUILD-STANDARD the turn it
arrives), never gate m60a1/m60a3/kv2, never false-0, owner port 5001.
