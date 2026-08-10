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

## 3. GRADUATE REGISTRY (40 graduates, hash-frozen)
Freeze = deterministic geometry hash via `node tools/tmp-hashgeo.mjs
--ids=...` (camoSeed 4242 pinned build; FNV-1a over position buffers +
world matrices, mesh-order independent). Graduate-change protocol: fix ->
gate hold x2 -> independent re-cert critic >=9.0 on changed views ->
re-freeze NEW hash, all in ONE commit.

| id | hash | notes |
|---|---|---|
| m60a1 | 912de524 | bore+winding re-cert RATIFIED (floors 9.1-9.4) |
| m60a3 | 097c35a2 | bore+winding re-cert RATIFIED (floors 9.1-9.4) |
| kv2 | 382b2310 | freeze-verify only |
| leo2a6 | 09912270 | bore+winding re-cert RATIFIED (floors 9.1-9.4) |
| m1a1 | 4e28ff40 | RE-FROZEN 2026-08-08 (§5.79 flank-panel pitch; re-cert floor 9.1 / mean 9.19 x14) |
| m1a1ha | 99962364 | RE-FROZEN 2026-08-08 (§5.79 flank-panel pitch; re-cert floor 9.1 / mean 9.19 x14) |
| m1a2_tejas | 01e698e8 | RE-FROZEN 2026-08-08 (§5.80 distinctiveness; massive clean CROWS + sustainment kit; re-cert floor 9.1 / mean 9.23 x14) |
| merkava3b | REMOVED BY OWNER 2026-08-06 (roster prune; was 8bb8d984, packet historical) |
| merkava3c | aa74be6a | RE-FROZEN 2026-08-07 (§B2 under-roof closure wave §5.11: solid casting walls, gate rows EXACT, re-cert floor 9.0 on every changed view; sheets shots/critic-merkava-closure/) |
| kf51 | 9ac547ac | bore+winding re-cert RATIFIED (floors 9.1-9.4) |
| isu122s | 8f420d18 | bore+winding re-cert RATIFIED (floors 9.1-9.4) |
| isu152 | 8e2f75c0 | |
| merkava3d | 667ece84 | RE-FROZEN 2026-08-07 (§B2 under-roof closure wave §5.11: solid casting walls, gate rows EXACT, re-cert floor 9.0 on every changed view; sheets shots/critic-merkava-closure/) |
| pt91m | 2cf10e23 | |
| t72b3m | 175be954 | RE-FROZEN 2026-08-07 (fused-turret fix §5.23: ring-gap shadow band at the measured dome crest; gate row bit-identical to graduation 85.9; re-cert PASS 9.0 every changed view, deltas == the seam footprint exactly; sheets shots/critic-chevron-fused/) |
| merkava1b | 78051af0 | RE-FROZEN 2026-08-07 (§B2 under-roof closure wave §5.11: solid casting walls, gate rows EXACT, re-cert floor 9.0 on every changed view; sheets shots/critic-merkava-closure/) |
| m1a2 | 636a4860 | RE-FROZEN 2026-08-07 (CROWS-FORWARD wave §5.07: forward pose improved whole +4.1..+14.1; re-cert floor 9.1-9.2 x14 views, sheets shots/critic-sep-crowsfwd/) |
| chieftain5 | d4f2a9a6 | bore+winding re-cert RATIFIED (floors 9.1-9.4) |
| t84 | 04707a9c | |
| m47_patton | 2fc99c50 | bore+winding re-cert RATIFIED (floors 9.1-9.4) |
| leo2a5 | e215a738 | bore+winding re-cert RATIFIED (floors 9.1-9.4) |
| leo2_revolution | db70c929 | RE-FROZEN 2026-08-07 (photo-class record): §5.09 closure -85% + §5.17a turret-completion (real collar/chin/under-cheek/under-skirt walls — the floating shell is DEAD, owner diagnosis answered); re-cert 9.4/9.2/9.3 on changed families; §B7 gate caps stand (hull 94.3 trustworthy band) |
| m46_patton | 108806c8 | bore+winding re-cert RATIFIED (floors 9.1-9.4) |
| centurion3 | bad74e60 | RE-FROZEN 2026-08-08 (no-air graduate-change: crown-ridge pedestal + discharger webs, front-low 1810px->14, re-cert floor 9.0 x17 changed views, gate 91.1 exact; prior 50273080 bore-resit lineage) |
| m1a2_sepv2 | a0a4e87c | RE-FROZEN 2026-08-08 (§5.80 distinctiveness; elevated armored CROWS + broad ERA; re-cert floor 9.2 / mean 9.31 x14) |
| m2a2_bradley | 90a5568c | GRADUATED 2026-08-08 (28th; dual gate: geometry 90.9 x2 every component >=90 landed 81bdad1 + visual floor 9.0 / mean 9.16 x14 views at freeze-verified bytes; oracle e699c868; dress-tier defect bank in the verdict: bow T-hooks, taillight fittings, TOW rear ports, lug stacks, ringed hubs) |
| m45_patton | 53caa687 | GRADUATED 2026-08-08 (29th; gate 90.7 x5 total + sitting-2 visual floor 9.0 mean 9.13 x14; sitting-1 orders executed: loft.smooth byte-reproduced, ring cupola adjudicated ring-class at station with the measured Ø0.57/x-0.65 deviation compliant; ring-prominence silhouette-tax residual certified) |
| leclerc | 683be340 | GRADUATED 2026-08-08 (30th; gate 90.3 x2 every component >=90 + visual floor 9.0 mean 9.17 x14 at freeze-verified bytes; the §5.14 §K-exemplar turret standard held through the ladder — no gate-chasing artifacts; commander-well doc trued z_w 0.32..0.66) |
| k2 | 827d5ffc | GRADUATED 2026-08-08 (31st; Leclerc-method closed station loft; gate 90.1 x2 every component >=90; visual R26 floor 9.0 / mean 9.09 x14; exact Object_8/15/18/21 plan inventory, rounded asymmetric cage, countable six-station ISU gear; oracle 8d92cd1b reproducible from pristine .bak) |
| abramsx | d1dbfa2 | GRADUATED 2026-08-09 (32nd; §5.87 owner attachment closeout RE-FROZEN: roof-sight necks + XM914 buried foundation/recoil spine/equipment foot, no air seams; gate 90.2 x2 every component >=90; fresh §B8 floor 9.0 / mean 9.09 x14; oracle 01acf03c reproducible from pristine .bak; prior fe7f9852 complete-redesign freeze retired) |
| challenger_3 | b0c172a4 | GRADUATED 2026-08-09 (33rd; §5.87 owner attachment closeout RE-FROZEN: Protector roof shoe/fork/receiver/optic supports + smoke backing shoes; gate 90.4 x2 every component >=90; fresh §B8 floor 9.0 / mean 9.06 x14; oracle a5fcd801 reproducible from pristine .bak; prior 2678f6c complete-redesign freeze retired) |
| challenger2 | 3b4bd5f0 | GRADUATED 2026-08-09; RE-FROZEN 2026-08-10 (§5.89 owner fused-block repair: material-fused casemate course removed from fixed hull and repartitioned into the articulated source tree; one low ring landing + one rotating turret; gate 90.1 x2 every component >=90; standard/parent/winding clean; fresh §B8 floor 9.0 / mean 9.06 x14, yaw/load paths 9.3; oracle f44e3b46 reproducible from pristine .bak; prior 63ee160 retired) |
| fv510 | 927beeb2 | GRADUATED 2026-08-10; RE-FROZEN 2026-08-10 (§5.91 owner native-track correction: donor Track suppressed and 34 donor running-gear components removed at whole-component boundaries; exact Warrior upper geometry retained around one game-native six-station wheel/sprocket/idler/shoe system; gate 90.3 x2, every component >=90.3; fidelity 98.0; standard/parent/winding clean; independent §B8 floor 9.1 / mean 9.26 x14, yaw/load paths 9.4; prior exact-source freeze 7884762a retired) |
| type10 | 84f5d108 | GRADUATED 2026-08-10 (§5.92 owner-source exact rebuild: semantic source payload around the game-native source-correct five-wheel running gear; donor track/wheels excluded; gate 94.6 x2; fidelity 97.4; independent §B8 floor 9.2 / mean 9.48 x14, yaw/load paths 9.7; mode-2 engine-deck candidate adjudicated hull-owned) |
| amx40 | d2c73d96 | GRADUATED 2026-08-10 (§5.93 Leclerc-method owner-source completion: continuous low welded turret, canted source-height mantlet, seated asymmetric roof/flank kit, layered stern and source-traced hull on game-native six-wheel linked tracks; gate 90.1 x2; fidelity 94.7; standard/track/winding clean; independent §B8 floor 9.0 / mean 9.06 x14, yaw/load paths PASS) |
| m26_pershing | 2f006738 | RE-RECORDED 2026-08-08: hash moved by LANDED 5f39989 (armorM4 gunBarrel shadow-proxy 3.96->3.44; m26/m45 inherit m4a3e8 proxies — patton.js bytes unchanged); double-confirmed by builder bisect + m45-grad critic; prior 65c564c0 bore+winding re-cert lineage (floors 9.1-9.4) carries |
| t90m | e345ee8a | GRADUATED 2026-08-06 (27th; floor 9.0 x14 second sitting; the owner's dedicated-agent arc 81.7 -> dual gate) |
| t90a | 810a6f18 | GRADUATED 2026-08-10 (§5.94 Leclerc-method cast-turret rebuild; gate 90.4 x2; standard/track/winding clean; independent §B8 floor 9.0 / mean 9.11 x14, yaw/load paths 9.2) |
| t90a_vladimir | c13fec50 | GRADUATED 2026-08-10 (§5.94 source-specific compact ESSA/cast-turret/transom rebuild; gate 90.0 x2; standard/track/winding adjudicated; independent §B8 floor 9.0 / mean 9.01 x14, yaw/load paths 9.3) |
| t90sm | 56324371 | GRADUATED 2026-08-10 (§5.94 welded T-90SM source completion with every turret fitting physically seated; gate 90.0 x2; standard/track/winding clean; independent §B8 floor 9.0 / mean 9.04 x14, yaw/load paths 9.1) |

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
  t90m GRADUATED (27th, e345ee8a); hatch rings
  flush; Relikt relief) — gate 90.7 x2 held, candidate e345ee8a, SECOND
  SITTING adjudication IN FLIGHT (critic note: judge actual tones, the
  old drum attribution is dead);
  (bustle band hull-side matching an empty-turret print) — re-parent
  lands COUPLED with the ordered obr-2022 oracle swap + rebuild,
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

## 4.995 RESOLVED (batch-46, 2026-08-06): leo2_revolution ORACLE
ADJUDICATED — the owner's b08d1a2 revert + 8ad527a rescue is a FULL
PRINT RESTRUCTURE (census: GunMesh/TurretMesh meshless shells, geometry
on chassis_vlo001*/002* children, dedicated Tracks material, 1,442,776
B sha1 1d7112d9). Chain 37/41/43 asserts on the retired lineage —
RETIRED to history (repair_oracles.py batch-46 note); old .bak archived
*.pre-batch46-history; fresh .bak = owner bytes. Honest baseline x2:
0 | hull 94.5 / whole 70.3 / turret 0 / stations 72.8 / dims 99.5 /
floaters 100. Turret-0 mechanism (refprobe): the rescue restored the
PRISTINE tall mast/whip band (gate-frame turret y 1.65..4.03 vs pub
roof 2.64) — the exact geometry batch-37 flattened; height clamp 0.771
squeezes the model, turret band comparison collapses. §B7 REF-WRONG
class (owner ruled the source wrong): candidate bbae2c80 re-frozen on
photo-class acceptance (§B8 critic PASSED, grays dead); hull 94.5 is
the print's only trustworthy band. Gate line stays capped until a
fresh batch files against THIS lineage (mast flatten, batch-37 intent).

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

## 4.998 OWNER OVERRIDES (2026-08-06 latest): (1) challenger line
CONFIRMED fully covered — ch1 gate-PASS on its print, ch2 priority
rework LIVE (moderns agent), challenger_3 building LIVE (same agent).
(2) t72b3m RE-ORACLE OVERRIDE ("and build the t72 b3m" with the obr_2022
GLB): the no-swap ruling is SUPERSEDED by owner order — MY LANE next
wake: swap t72b3m's registration to t-72b3m_obr._2022.glb (three maps +
REG; §E normalize plan for the +46.9% roof-cluster stylization; the
frozen row honestly re-baselines — §B7-precedent), THEN the russia lane
rebuilds t72b3m to the 2022 configuration (RWS, roof cluster, ERA fit —
relayed to the live t90m agent as its follow-on). The graduate's re-cert
chain restarts on the new oracle.

## 4.999 NEXT ABRAMS ROUND (spawns ON the visibility re-cert verdict;
combined): (a) CROWS REWORK — point the right direction (not forward),
armor surrounds on some, ammo boxes, lights, shapes CONNECTED; (b)
ABRAMSX BUILD-UP (owner: "make the abramsx look much more like our
abramsx local model... its time to get that running too") — full
oracle-driven round toward its local reference GLB (certified bridge-cap
rows; AbramsX identity: low-profile unmanned turret, XM360 angular
shroud, hybrid hull lines, 30mm RWS) per §B8.1 + ladder; (c) any FAIL
orders from the visibility verdict. sepv2 donor verified already-m1a2.

## 4.9995 TRACK HITBOXES LANDED (owner order): convex prisms per side,
auto-derived from the gear loop fleet-wide (101/101), killcam renders
the real trapezoid + loop-following slats; phantom rectangle claim
removed (m1a2 37%/bmp2 25%/tiger1 7%); true ramp normals; hash+gate
neutrality proven; COMBAT SUITE NOW 253 CHECKS (was 233 — update future
briefs). Queue: ARCHITECTURE.md §2.3 trackShapes addendum (owner WIP in
docs/ — orchestrator lands it when free).

## 4.9996 LEOPARD TRIPLE LANDED: revolution grays FIXED (real apron +
physics-graded fills, candidate bbae2c80); leo2a4 §B8 rework (48/56%
wheel exposure, real nose band, turret trued — 551cb30e); leopard2_proto
BUILT (V3 delta + PT turret + cast mantlet, gate 45.6-at-melted-cap,
f1af7ba8). All three DELIVERED-PENDING-CRITIC (§B8 resit spawned).
MY-LANE ADD: proto MODEL_SOURCE flip to procedural (drains Sources;
keep the GLB as the measurement override — flip-era mechanics).

## 4.9997 IFV RESIT: 2/2 PASS (2026-08-06) — puma + type89 §B8
ACCEPTED by the independent critic (acid YES per view; all 11 original
orders closed; four-box numbers reproduced exactly; hashes 31dca571 /
b19aca94). The owner's founding §B8 rejections are resolved. Laws:
ORDER-NUMBER vs ORDER-SUBSTANCE (orders bind on falsifiable intent),
four-box = deterministic regression harness (promoted).

## 4.9998 LEOPARD TRIPLE RESIT: 3/3 PASS — revolution grays DEAD (owner
acid answered YES x16 views incl. yaw), leo2a4 ACCEPTED (orders 1-3
closed with numbers, 551cb30e), leopard2_proto FIRST ACCEPTANCE
(f1af7ba8; its MODEL_SOURCE flip to procedural is now UNBLOCKED —
my-lane queue). Day resit ledger: 5/5. Four scoring laws banked.

## 4.9999 ABRAMS COMBINED LANDED: seven stations = ONE aim-frame each
(rest yaws +90/-90-outboard/+34, tusk full armor wrap, cans ALL gun-left
— feed nit closed); abramsx 6.2 -> 49.4 (compressed-print caps RETIRED,
wheels exposed, XM360 slimmed; whips re-parent SHIPPED-DISABLED behind
AX_WHIPS_TURRET awaiting the orchestrator's coupled turretFollowers
landing — work order in abramsx.md). MY-LANE ADDS: the coupled abramsx
whip landing; graduate rest-azimuth cap re-adjudication (+95 trial
moved certified rows — transverse is window-pinned).

## 4.99994 TYPE10 ONBOARDED (2026-08-06, my-lane batch item 2): owner
cleared the rip-history hold — GLB un-quarantined to community/, four
harness maps registered (turretNode ^Object_6$ turret+gun fused, nose
+z), extract committed (bodyH +51.2% tall-stylized, challenger2 class;
sights fused into the hull-side Object_5 = turret rows print-capped),
ATTRIBUTION owner-cleared entry. Honest baseline x2: all-0 + floaters
100, verified real (populated curve rows) — the ancient base-21 build.
Fleet denominator 89 -> 90. PRIORITY §B8 round SPAWNED (modern3.js).

## 4.999945 T72B3M ORACLE SWAP EXECUTED (2026-08-06, my-lane batch item
3; §4.998 order): four maps re-keyed to community/t-72b3m_obr._2022.glb
(Object_14/15 + Object_3 follower, yaw PI); t72b3 BASE rows retired
with the roster delist (extract t72b3.json deleted); batch-45 stature
normalize FILED+EXECUTED (same-author dome class: deck-knee 0.736
identity, dome 2.107 -> 1.6055 the recovered recipe's proven landing,
cluster 2.945 -> 1.885 keeping the obr-2022 signature; byte-idempotent
x2 md5 b825c4c3; first cluster-only cut measured 24.4 and the dome cap
was unambiguous — extended per gate-in-loop). Honest re-baseline x2:
69 | hull 69 / whole 77.7 / turret 80.1 / stations 84 / dims 100 /
floaters 100 (frozen 91.8 retired; fleet 22 -> 21 while the re-cert
chain restarts). Graduate proc hash HELD 1e1ca4b8. NEXT: the
russia-lane coupled round (2022 config: RWS, roof cluster, Relikt fit
+ the ORACLE-REGISTRATION-PINNED bustle re-parent) spawns when the
live russia turret agent lands (russia.js single-writer law).

## 4.99995 OWNER PUNCH LIST 3 (2026-08-06 night, verbatim intent):
"finisht eh challegner 3, chjallenger 2, t14 armata (hull is wrong)
t90sm (no attachments or decorations or the machine gun turret, turret
does not look good, both t90a turrets are wrong, just update all soviet
turrets fix all". Parsed orders: (1) challenger_3 FINISH (built
d39f2258, needs its oracle-driven §B8 round to the bar); (2)
challenger2 FINISH (rework landed, same bar); (3) t14 HULL WRONG
(§B8.1 re-proportion — hull specifically); (4) t90sm: attachments +
decorations + the MG turret (RWS) MISSING, turret shape NOT GOOD —
full §B3-real equipment pass + turret re-loft; (5) BOTH t90a turrets
(t90a + t90a_vladimir) WRONG — re-loft; (6) FLEET ORDER: update ALL
soviet/russian turrets (t54/t55/t62/t64/t72/t80/t90 lines + IS/ISU
where turret reads off) — §B8.1 turret-shape-line pass, mantlets
mandatory (§B3.1). Spawned 2026-08-06: challenger lane (ch2+ch3+t14),
russia turret lane (t90sm+t90a pair first, then the soviet sweep).

## 4.99996 MY-LANE BATCH CLOSEOUT (2026-08-06 night): item 4 proto
FLIP LANDED c769c8a (rig-unchanged proof: gate x2 reproduces the HEAD
row; hash HELD f1af7ba8). Item 5 abramsx coupled whips PARKED 0cc8dae
('^Dekali$' followers crater autoPivot — registration-shift class;
refined narrow-node/pinned-pivot/§E-split work order in abramsx.md;
certified 49.4 line + hash 9c059ce0 reproduced post-revert). Item 7:
E8 gunBarrel 3.96->3.44 + t34 4.64->4.00 (packet residuals, stale-
proxy class, single-consumer armor fns verified); ARCHITECTURE.md §2.3
trackShapes addendum LANDED (docs/ freed — symbols verified:
attachTrackShapes specs.js:2013, trackHitboxHull tankFactory.js:442,
intersectTrackPrism armor.js, addTrackPrism killcam.js:3005).
REST-AZIMUTH NOTE (the queued re-adjudication): the +95 trial moved
certified rows — graduate rest yaw is WINDOW-PINNED (transverse); the
cap stands until a dedicated re-cert wave re-measures each graduate's
rest azimuth against its print. Do not move rest yaws piecemeal.

## 4.99997 ASK OWNER (standing questions, non-blocking):
(1) NAME COLLISION: m1a2 and m1a2_tejas BOTH read 'M1A2 Abrams' in the
garage since the "(Tejas)" strip order — keep the collision, or rename
one (e.g. tejas -> 'M1A2 Abrams (hero)' or fold the id)?
(2) CHARIOTEER ERA FLAG: charioteer sits in the coldwar group with a
WW2-ancestry spec (Cromwell hull) — confirm intended era grouping.

## 4.99998 RUSSIA TURRET LANE LANDED f4c323f (2026-08-07): t90sm
turret 73->81 (T05BV-1 RWS connected+aimed, pano sight, Sosna housing,
Relikt, snorkel, mantlet+bore — the owner's "no attachments" complaint
addressed, critic pending), t90a 72.6->76.3 (K-5 clamshell apex,
Shtora on the ref line), vladimir turret 72.9->78.4 (dome squash,
K-5 cheek walls, r13 artifact decoded); tier-2: t54 turret +2.7,
t72b_1987 min +2.8, §B3.1 bore sweep (t72bu + cast-collar mantlet).
Print-pinned classes documented per packet (t80bv barrel re-parent +
scaleToOverall ruling wanted; t54 winding repair queued). Orchestrator
reproduced all five moved lines exactly; graduates held; npm green.
IN FLIGHT NOW (2026-08-07): §B8 critic (t90sm/t90a/vladimir trio,
shots/critic-russia-trio/), t72b3m COUPLED 2022-config round
(russia.js freed — RWS, roof cluster, Relikt, turret-side bustle;
re-freeze after its critic), challenger lane (modern1/2), type10 lane
(modern3). NEXT SPAWNS QUEUED: t34_85/m4a3e8 §B8 resits (ww2.js,
proxies trued), type74 round (misc.js, oracle registered, honest 0s +
dims 99.6), chieftain_mk10/leo1a5 base-21 SCAFFOLD rounds (specs in
userdrops7/userdrops3, no profiles builder yet — briefs need packet
prep), latent reversed-core sweep, §I mg migrations, m60a2 packet
decision, t72bu decision.

## 4.99999 CHALLENGER LANE LANDED 765310f + TYPE10 LANDED 8522056
(2026-08-07): ch3 41.6->61.4 (all components +15; RWS on the print
RCWS plateau, stern anchor posts, dims 99.8), t14 48.1->68.3 (owner
hull ruling executed: full-length skirt walls, raked stern ramp,
masts to 3.16, gunBarrel 6.45), ch2 print-capped (dims 100, stations
19.8; buh print +28.8% tall + polluted split). type10 rebuild: dims
0->100, plan rows 69-81, stations/side/front print-capped with six
evidence classes. Critics spawned for both waves. MY-LANE §E QUEUE
(filed by the lane, execute between landings): (a) ch2 HEIGHT-
NORMALIZE batch (leo2a5 precedent — 249 side cols >2.8, hull shell
3.14-3.21, station tops 2.38-3.98); (b) ch3 TUBE-PIN normalize
(t14-class: 7 only-proc muzzle cols, z-warp knee at the gun bearing
to +7.335 parity, ~+7.9 side_whole); (c) t14 tube-pin stands as filed
in t14.md r1. Law-bank: plan-grid 0.13 pitch, whip rake=x-lean,
registration-anchor measured live (dAlong +0.074 zeroed stations),
AA-sliver 22mm+, gun-union body law + plan column window 0.12
(type10). t14 track-shoe albedo = shared-material lane, report-only.

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

## 4.999991 RUSSIA TRIO §B8 VERDICTS (independent critic, adjudicated
at 3baa25c; sheets shots/critic-russia-trio/ + 27 evidence crops):
t90sm CONDITIONAL 8.0 (orders: bustle/side SLAT GRID mesh; turret-side
stowage BRIM FLARE outward; Relikt glacis rows + retire grey-lavender
glacis tone + pano head +0.2-0.3). t90a FAIL 5.5 — §B8.1 gate-3 kill:
box-stack superstructure, not a cast dome (orders: TURRET REBUILD
reusing the vladimir dome loft, K-5 as dome-hugging plates, Shtora RED
round dazzlers not blue windows, cupola+Kord MG, glacis K-5 rows +
stern drums, rehook near-black light clusters). t90a_vladimir FAIL 7.0
but close (orders: FLOATER above roof x~1005-1018 y~148-178 connect-
or-delete, cupola+Kord MG, box-fort rim thinned so the dome reads,
Shtora red eyes, glacis rows, rear-wall story, bow clusters).
OWNER CHECKLIST: t90sm all three complaints DEAD (attachments,
RWS-yawed-right, welded silhouette matches print numerically); "both
t90a turrets wrong" ALIVE for t90a / MOSTLY DEAD for vladimir.
Trio-wide note: proc track bands read chunky vs the prints' smooth
runs (shared-material lane, report-only — same class as t14's).
FIX ROUND QUEUED behind the live t72b3m coupled agent (russia.js
single-writer): carries ALL orders above verbatim.

## 4.999992 CHALLENGER TRIO §B8 VERDICTS: 3/3 PASS 9.0 (independent
critic, fresh pairs, hash bracket x2 bit-identical to the landed
candidates b4e51df8/17bb2528/a3762fe; sheets
shots/critic-challenger-trio-indep/). OWNER CHECKLIST CLOSED WITH
PIXELS: t14 "hull is wrong" DEAD (V-nose chisel, full-length tall
skirts, 7 countable wheels, raked stern ramp, capsule hump); ch3
FINISHED (angular welded turret, flat mantlet, RWS §H.4-M2, Trophy,
L55A1 to 11.50); ch2 FINISHED WITHIN CAPS (§B7 applied vs the +28.8%
print — CR2 silhouette holds, VS580 at 3.04). ALL print-cap claims
VERIFIED (none rejected); §E queue items confirmed correctly filed.
Detail-round notes banked (t14 Afganit stubs borderline §B3, ch2
wheel-arc at the low end of the window) — NO closing orders. Record
hashes bind the verdicts; dual gate still pending for freezes.

## 4.999993 TYPE10 §B8 VERDICT: FAIL 5.5 (independent critic, fresh
pairs + own four-box, hash bracket 89a11aea x2; sheets
shots/critic-type10-indep/). ROOT CAUSE proven three ways: proc turret
walls at ±1.40 deck-to-roof = casemate read; the print's wide rows
(halfW 1.40-1.44) sit BELOW its deck (bin courses) while its above-
deck turret body is halfW 0.89-1.19 with a plan-converging cheek V.
"Dims verify the box, §B8 verifies the mass inside the box" — box
ratios were print-consistent; the mass distribution was not. CLOSING
ORDERS (gross form first): (1) TURRET WIDTH CUT ±1.40 -> ±1.10-1.20 +
shoulder-step plan convergence (keep mantlet/prow group exactly);
optional stepped bin course <=±1.30 with undercut gap; (2) three side
depth planes (skirt 1.54 / sponson 1.38-1.42 / turret 1.15) + top deck
margins around a readable turret outline; (3) pano pedestal 0.25-0.35
proud (spend the p95 spike budget there, cap crosswind mast <=2.31),
taller gunner brow, M2 silhouettes above the narrowed wall; (4) rear
two-tier verify after the cut. Builder self-read caveat BANKED: the
r13 broad-flat-wall class was self-scored closed but had only moved
outboard — §B8 self-reads-never-accept demonstrated again. Gun run
called EXEMPLARY (nested mantlet + bore at 5x). FIX ROUND SPAWNED
(modern3.js free).

## 4.999994 WW2 RESIT LANE LANDED 7390118: t34_85 (84996d88 — one
30-deg glacis plane, cast lathe dome at exact footprint, rev-1
fleet-baseline winding flag FIXED) + m4a3e8 (977909c8 — 47-deg glacis
+ flush cast nose, TRUE 3-pair HVSS, deck step, ±1.533 adjudicated
factory wrap-pad class). FALSE-0 honored: NO gate rows exist (both
procedural MODEL_SOURCE, no reference override — the weihe print
belongs to t34_85_cad). ORCHESTRATOR DECISION FLAGGED: whether to
register t34_85_weihe.glb as the t34_85 oracle (print frame-shifted
per packet — onboard-oracle lane). All 10 ww2.js siblings
byte-identical; graduates held. Photo-class critic IN FLIGHT
(shots/critic-ww2-resit-indep/). Law notes banked in packets:
roof-lip bow-steepening, co-planar frustum-front glacis,
step-requires-body-split, wrap-pad width attribution.

## 4.999995 TYPE10 RESIT: PASS 9.0 (independent resit critic, hash
bracket 48fc36ba x2; sheets shots/critic-type10-resit/). All four
§4.999993 orders CLOSED with pixels: turret 94% -> 80% of hull width
(wall 74.1% = target band, real ~72%); true shoulder step + deck run;
three side depth planes + top margins with drawn outline; pano 0.275
proud (the only mass above the roof), M2 silhouettes; rear two-tier
84% nesting. Gun four-box byte-identical to r1 (EXEMPLARY ruling
stands, "untouched" proven numerically). §B7 discount applied where
the fused print reads wide/stepless — the proc now beats the print on
that axis. The owner's "build the type 10 as a priority" order is
ACCEPTED at the §B8 bar (record hash 48fc36ba binds; gate curve rows
stay honestly print-capped per the §E evidence — re-rig escalation
remains the path to a measured ladder). Banked notes: solid turret
length 58% just above the gate-4 alarm (watch on length edits), roof
density round candidate, shaded-side seams pipeline-endemic.

## 4.999996 WW2 RESIT VERDICTS: t34_85 PASS 9.0 + m4a3e8 PASS 9.1
(independent photo-class critic; hash bracket x2 EXACT 84996d88 /
977909c8; sheets shots/critic-ww2-resit-indep/). ALL TEN per-tank
slate orders closed in pixels (four-box reproduced to the mm x2; two
intent-resolved deltas per ORDER-NUMBER vs ORDER-SUBSTANCE). Both
owner complaints DEAD ("steep-nosed slab with a faceted box turret" /
"tall shoebox with a Sherman-ish turret"). THE 2026-08-06 SLATE RESIT
LEDGER STANDS 7/7 (puma, type89, leo triple, t34_85, m4a3e8).
Record hashes bind; both ids remain FALSE-0 (no oracle) — weihe
registration decision still flagged (§4.999994).

## 4.999997 FLEET HANDEDNESS FLAG (critic discovery, orchestrator
adjudication + ASK OWNER): the program's "+x = right" labeling is
physically INVERTED (three.js right-handed, forward +z => vehicle-
right is -x) — asymmetric fittings placed per the fleet convention
render mirror-flipped vs real-vehicle photos (E8 cupola, t34 cupola,
tiger1, type89's ratified offset, etc.). Corroborated against the
t34_85_cad print (its cupola at +x = the real vehicle's LEFT;
evidence shots/critic-ww2-resit-indep/handedness-probe/). Fleet-wide,
pre-dates every recent round, ratified by prior verdicts, sub-glance
for acid reads. OPTIONS: (a) accept as the program frame (document in
BUILD-STANDARD §A and move on), or (b) schedule a fleet x-flip —
which INVALIDATES every side-registration digest + prior verdict
crop. Default pending owner word: (a) accept-and-document.

## 4.999998 TYPE74 VERDICT ADJUDICATED TO PASS 9.0: the critic's
CONDITIONAL 8.5 hinged on ONE blocking order — the fleet chirality
frame. ADJUDICATED (orchestrator, fleet-scoped): PROGRAM FRAME IS
CANON — law written into BUILD-STANDARD §A (PROGRAM-FRAME CHIRALITY
LAW); the nullops print banked "mirrored in program frame" in
type74.md (pt91m-class); per the verdict's own option (b) the r5
round PASSES AS-LANDED at 9.0 (record 7ba404c5 binds; all §B8.1
gates + all four print caps + LIVE-vs-EXTRACT law verified by the
critic). §4.999997's ASK-OWNER stands as an OVERRIDE option only
(fleet x-flip = its own wave, re-derives digests). Detail note
banked: type74 track band tone (non-blocking). Cross-lane ledger
sync note: the critic's gate run refreshed the t72b3m row to the
coupled lane's newer local state — reconcile at that landing.

## 4.999999 T72B3M RE-CERT PASS 9.0 -> RE-FROZEN 61a83b2c (registry §3
row updated; graduate-change protocol complete on the owner-overridden
obr_2022 oracle). All eight 2022-config checklist items verified in
pixels; all four honest residuals confirmed as their documented
classes; §B8.1 gates pass. Watch items banked: dome re-loft follow-up
(rear-left plan quarter + roof wedge density), bow light/smoke bank
density, clamp chip cosmetics. The owner's "and build the t72 b3m"
override is CLOSED end-to-end (oracle swap ea740e9 -> batch-45 ->
coupled round cfca3b0 -> re-cert -> re-freeze).

## 5.0 RUSSIA TRIO RESIT: 3/3 PASS 9.0 — OWNER PUNCH LIST 3 FULLY
CLOSED (2026-08-07; fresh independent critic, hash bracket x2 exact:
t90sm 55509794 / t90a 71f67270 / vladimir 782bdbc4; sheets
shots/critic-russia-trio-resit/). All 16 fix-round orders re-verified
CLOSED in pixels; zero floaters across 42 pairs; owner complaints ALL
DEAD ("t90sm attachments/RWS/turret" x3, "both t90a turrets wrong" x2
— t90a's box-stack is a plan-round cast dome, vladimir's dome reads
over the thinned rim with cupola+Kord). t90sm pano literal remains
the documented dims-blocked residual (order-substance satisfied).
PUNCH LIST 3 SCOREBOARD: challenger half 3/3 PASS (§4.999992) +
russia half 3/3 PASS = 6/6. Combined with this window's other
acceptances (type10, type74, ww2 resit pair, t72b3m re-freeze), the
2026-08-06/07 owner-order backlog is CLEAR. Remaining §B8 sub-9.0
work rides the standing queue, not owner orders.

## 5.01 §E QUEUE PROGRESS (2026-08-07 early): batch-47 ch3 TUBE-PIN
LANDED 90f118e (side_whole cover 5.26 -> 1.12, row 65 -> 73; whole min
now rides front_whole by design). t14 tube-pin DEFERRED 25dd459 — the
r1 literals DO NOT SELF-CHECK (7.10 vs 6.45) + the plan is node-scoped
(custom op); re-derive from a fresh vertex-workorder run. LEO1A4 SCAN
ADJUDICATED NOT-ONBOARDABLE-YET: single fused photogrammetry blob (17
chunks 'Stereo textured mesh', ~1.1M verts, scan-site world offset, NO
turret split) — registration would false-0 hull rows; it is RE-RIG
CLASS (type74-print escalation family). leo1a5 proceeds PHOTO-CLASS.
Remaining §E queue: ch2 HEIGHT-NORMALIZE, t54 winding repair, t80bv
barrel re-parent/scaleToOverall, t34_85 weihe decision, type74 +
leo1a4 re-rig escalations, t14 tube-pin re-derivation.

## 5.02 BASE-21 SCAFFOLD VERDICTS: chieftain_mk10 PASS 9.0 + leo1a5
PASS 9.0 (independent photo-class critic, hash bracket x2 exact
59551064 / 1c79188; sheets shots/critic-base21-indep/ + labeled
contact sheets). ZERO orders — none of the 0/12-slate killer classes;
every packet four-box reproduced to the millimeter independently;
flat-region detector 0 defects x28 views. Identity tells confirmed in
pixels (Stillbrew hump measured 2.52-2.71 rising to the 2.90 anchor,
TOGS right, L11A5 sleeved+bore; EMES-18 flat embrasure, welded wedge
lean-in walls, saddle mantlet w 1.394 probe-exact, 7 duals + 4
rollers + correct drive end). The first two "wholly ancient" base-21
customs are ACCEPTED at the §B8 bar (record hashes bind; both remain
FALSE-0/no-oracle — measured ladders need future oracles: chieftain
mk10 none known, leo1a5 awaits the leo1a4-scan re-rig). LAW BANK:
STATE-A-DATUM (bow silhouette fits measure the fender/wing datum, not
the glacis plane), idler-dressing-vs-drive-end verification rule,
chieftain pale-rim ~40-luma = the new gate-1 countability reference.
Polish notes banked in packets (EMES twin-aperture tone step, basket
interior step, bolt-plate decal).

## 5.03 FLEET REVERSED-CORE SWEEP (2026-08-07, read-only audit; raw at
shots/reversed-core-sweep/): 70 audited, 0 errors; 48 roster tanks
CLEAN (all recent landings verified — centurion/vickers/merkava3c/
m1a2/t34_85 closures hold). RANKED FIX LIST (none packet-adjudicated):
(1) is2+is1 RENDER-VISIBLE reversed rear tail slab — shared buildIS2
in tankFactory.js, rig_hull mesh#15, 12 tris, vol -0.319, AABB
[-1.40,1.20,-3.38]->[1.40,1.80,-2.86], rear deficit 60/62px — the
t34-since-authorship class, FIX FIRST; (2) challenger1 right-front
open-plane 199px (packet's "F-vs-D 0" contradicted — regressed or
view-scoped, OPEN); (3) t80u mirrored front-deck strips 208px x2 +
stern edge; (4) t62mv1 paired turret pieces 184/127px; (5) t72b_1987
paired rear-side 171/115px; (6-9) LATENT (deficit 0, flag-until-
visible §C.1): t84 GRADUATE right-turret core (NO PACKET EXISTS —
create one), leo2a5 GRADUATE 2 strips, leo2a6 3 pieces, merkava1b
GRADUATE 2 pieces; (10) t30 bow slab near-latent. HOUSEKEEPING:
'cruiser' = stale ledger row with no spec (drop via drop-ledger-rows);
type99a spec fully gone (delist complete). Mode-2 candidate list
banked (12 HARDs, candidates-not-defects per §J). Graduate fixes need
the graduate-change protocol (fix -> gate x2 -> re-cert -> re-freeze,
ONE commit each).

## 5.04 SWEEP FIX WAVE LANDED (2026-08-07): item 1 is1/is2 tail slab
FIXED b24dfc0 (frustum zF/zR swap — inside-out since authorship;
census rev 0 both); items 2-5 adjudicated f1d49a3 — ALL FOUR were the
new DECAL FLOAT class (floating one-sided P.decal quads = phantom
F-vs-D columns, census-invisible; attribution probe
tools/tmp-winding-attrib.html COMMITTED): t80u soot re-pinned (gate
75.4->75.9), t62mv1 + t72b_1987 bort numbers re-seated (gates
byte-identical), challenger1 STOPPED per the protect clause (verified
fix moves the 90.1 PASS to the razor edge — station-0 topPct was
FAKED by the phantom decal; patch banked in the round evidence, needs
a companion tail-top stowage mass in a builder round). Housekeeping:
cruiser row dropped (fleet /89), t84 packet created. LANE LAW BANKED:
the sweep's file attributions can be stale — PROFILED_BUILDERS shadow
userdrops/modern builders (modern2.js buildT80U is DEAD CODE);
builders live in profiles/*. FOLLOW-UPS: challenger1 companion item,
dead-builder cleanup, fleet decal-pin sweep (same probe), graduate-
latent wave (leo2a5/leo2a6/merkava1b/t84 — deficit-0, LOW).

## 5.05 ORCHESTRATOR ADJUDICATIONS (2026-08-07): (1) t34_85 WEIHE
ORACLE — REFUSED: the weihe print belongs to the separate frozen
t34_85_cad id and is frame-shifted (t34_85.md "NO ORACLE" note);
t34_85 stays photo-class (it holds a fresh §B8 PASS 9.0) — the §E
re-source lane remains the only path to a measured ladder. (2) m60a2
— CERTIFIED AT CEILING: 86.3 x2 with the ceiling MEASURED ~87.5 on
three certified mechanisms (scout-gen2-m60a2.md); per the bmp2
ceiling precedent the id is CLOSED at its measured ceiling — further
work is owner-elective, not queued. (3) t72bu — CERTIFIED-CAP HOLDS:
degenerate single-fused-primitive print + stature class (its packet's
v6/v10 certifications); dims+floaters only; CLOSED-PENDING-RESOURCE
(a new honest print is the only unlock). (4) batch-48b BLOCKER FILED:
the ch2 print's indices are uint32 (5125) — _index_surgery asserts
uint16 (5123); the helper needs a compat extension (parallel 5125
path, 5123 behavior byte-identical so prior chains reproduce) before
the hull-partition split can run. Turret prim = 26,279 verts (node
'challendger 2_0' prim 0); hull shell 65,532 + 2,709; gear 34,968.
(5) t54 winding repair + t80bv re-parent DEFER to the same §E window
as 48b (all three are surgery-class; batch them when the helper
extension lands).

## 5.06 SURGERY WINDOW OUTCOME (2026-08-07): _index_surgery UINT32
EXTENSION LANDED 58e74f0 (5125 accepted; 5123 path byte-proven via the
t90sm chain md5). ch2 batch-48b/48c BOTH NEGATIVE + REVERTED (bins
re-parent = dAlong byte-identical; length-parity shift = dAlong worse
1.532 + plan -6.2; batch-48 bytes restored exact 3c6a15dc). NEW
DEPENDENCY FILED: the dAlong anchor mechanism ("12%-band mid at band
heights") must be analyzed at SOURCE (the fidelity page registration
code) in a DEDICATED round — this gates ch2 batch-48d, t54's winding
repair (same walk class, dAlong 1.29-1.41), and t80bv's re-parent
ruling. All three park on that round. The registration-source round is
now the top §E queue item.

## 5.07 OWNER ORDERS (2026-08-07, direct — SUPERSEDES the queue):
(1) "right now just focus on remaking the sepv2 and sepv3 based on
the current abrams platforms" — m1a2_sepv2 REMAKE on the current
m1a2 platform code (GRADUATE dda7bcf4: graduate-change protocol —
after rebuild, gate x2 + re-cert critic + re-freeze); m1a2_sepv3
CREATE (new roster variant on the m1a2 base; M1A2C/SEPv3 identity;
the local m1a2_sepv3_dannzjs.glb is the measurement source candidate
— provenance already local/owner-supplied, used historically for the
m1a2 hero fixes). (2) "focus on making the crows machine guns point
forward, not to the left" — CROWS-FORWARD LAW: supersedes the
2026-08-06 outboard-yaw ruling (§4.9999 rest yaws +90/-90/+34);
ALL abrams RWS/CROWS stations re-aim to forward rest. HAZARD: the
rest-azimuth window-pinned law — yaw changes move certified gate
rows on the five CROWS graduates (m1a1 a04c8c74, m1a1ha f1aaf80,
m1a2_tejas 89c9f260, m1a2 bbae99a4, m1a2_sepv2 dda7bcf4) — every
touched graduate gates x2, re-certs, re-freezes per protocol. The
registration-source round + remaining queue PARK behind this focus.

## 5.08 OWNER ORDER (2026-08-07, garage screenshot): "abramsX looks
terrible, begin dedicating work on improving this now to match our
actual abramsx model" — a DEDICATED abramsx §B8 round vs the local
abramsx-mortavex.glb, queued to spawn THE MOMENT the SEP lane lands
(abrams.js single-writer; the live agent was scoped down to the
XM914 yaw only). Screenshot verdicts to carry into the brief: the
side reads as ONE full-height slab wall (wheels invisible at garage
angles — the 49.4 round's skirt work is NOT reading; §B8.1 gate-1
FAIL at the acid level), the hull side is a monolithic flat panel,
furniture is sparse (one floating-reading jerry can at the rear
corner), the turret wedge reads generic rather than the AbramsX
faceted low-profile shroud. Current state: 49.4 | 56/49.4/68.6/76.4/
100/100, hash 9c059ce0, whips PARKED (autoPivot crater — abramsx.md).
The round must close the OWNER's look, not just the number.

## 5.09 OWNER ORDER (2026-08-07): NEW LEOPARD ROUND — "update the
leopard 2a7v, leopard 2 prototype, and leopard 2a4 to match their
references. for the leopard revolution, close the gaps and empty
spaces in its turret that dont have plates but are see through to
the other side. and put a huge automated turret crows system on the
revolution and other leopards too." Parsed: (1) leo2a7v reference
round (the queued 77%-hull turret-merge structural rework); (2)
leopard2_proto reference round (photo class — its print is the
melted measurement-only oracle); (3) leo2a4 reference round (photo
class — no oracle, the otco rip was destroyed); (4) leo2_revolution
§B2 TURRET CLOSURE (see-through gaps = missing plates — REAL plates,
no willy-nilly fills; photo class governs its §B7 ref-wrong band);
(5) BIG AUTOMATED RCWS (FLW-200 class, HUGE read, FORWARD per the
CROWS-FORWARD law) on revolution + 2a7v + proto + 2a4 (graduates
leo2a5/leo2a6/kf51 excluded pending owner word — re-cert cost).
SPAWNED immediately (leopard.js free). Graduates hash-guarded:
leo2a5 e215a738, leo2a6 09912270, kf51 9ac547ac; revolution bbae2c80
moves by design (photo-class re-freeze after its critic); leo1a5
1c79188 record held.

## 5.10 OWNER ORDER (2026-08-07): "the t90s look a lot better, keep
working on them too in a new subagent" — T90 CONTINUATION ROUND
spawned (russia.js free): t90sm gate ladder (58.2 — hull 61.2 is the
weak row; slat/brim/pano landed and resit-PASSED 9.0), t90a ladder
(76.1 — dome landed; ESSA pane + deep-shade wings notes), vladimir
ladder (71.0 — dims 96.2 certified hullLengthM class; roof wedge
density note). All three hold fresh §B8 PASS 9.0 records
(55509794/71f67270/782bdbc4) — the round must NOT regress the
accepted look (re-cert on silhouette-changing edits). t90m GRADUATE
e345ee8a excluded + hash-guarded; t72b3m 61a83b2c hands off.

## 5.11 OWNER ORDER (2026-08-07): MERKAVA ROUND — "make sure there
are no gaps you can see through through the turrets... literally
just that there are holes in the actual turret assembly under the
roofs because the roofs were made with straight panels instead of
solid shapes" — §B2 UNDER-ROOF CLOSURE as the lead order: side-view
see-through holes INSIDE the turret assembly (not the turret-hull
gap), caused by straight roof panels; close with SOLID shapes / real
plate geometry per §B2 (no willy-nilly fills). Scope = the merkava.js
family incl. GRADUATES by explicit owner order (merkava1b 2cc7a76c,
merkava3c 8b7ed9bc, merkava3d 39de83c8 — graduate-change protocol:
gate x2 + re-cert + re-freeze each) + merkava2b/2d. The §5.03 latent
pieces on merkava1b (2 deficit-0 roof-area pieces) ride the same
wave (likely the same roof-panel construction). SPAWNED (merkava.js
free). Four builder lanes now live: SEP, leopard, t90, merkava.

## 5.12 OWNER ORDERS (2026-08-07, continued): (1) "challenger 1 looks
good, but we need agents working on the challenger 2 and 3 using the
actual models we have now using the base of the challenger 1" — UK
ROUND: rebuild ch2 + ch3 ON THE CH1 BUILD PLATFORM (challenger1Build
in uk.js — gate-PASS 90.2, owner-approved look) measured vs their
real GLBs (challenger_ii.glb + challenger_3.glb); ch2's §B7 caps +
the §5.06 registration-walk finding stand (photo class where the
print misleads). (2) "redesign the fv510 warrior to look more like
its actual tank" — FV510 REDESIGN vs fv510_warrior.glb (check its
registration state first — FALSE-0 if unregistered; the batch-44
hold was lifted). One UK agent owns modern1.js + uk.js (fv510 +
reading the ch1 base; chieftain5 d4f2a9a6 + chieftain_mk10 59551064 +
challenger1 dbe33204 hash-guarded). Five builder lanes now live:
SEP, leopard, t90, merkava, UK.

## 5.13 OWNER ORDER (2026-08-07, relayed to the live t90 agent):
"i want their turrets to look more like each other. the t90sm and
t90m turrets are good, but the t90a and t90a vladimir need to be
based off of those turrets, with their own designs and attachments
and era and other equipment ofc" — T90 TURRET FAMILY LAW: t90a +
vladimir turret lofts REBASE on the approved t90sm/t90m welded
family grammar (t90m read-only donor — graduate e345ee8a untouched),
each keeping its own variant kit (K-5 clamshell/tiles, red eyes,
Kord, bricks, markings). §B7 owner-taste class: both prints carry
CAST domes — the welded rebase moves turret rows against them; the
look-order OUTRANKS the rows; caps documented per column (type10
evidence pattern). t90sm's approved turret is look-protected; its
ladder is hull-only.

## 5.14 OWNER ORDERS (2026-08-07, continued): (1) FRANCE ROUND —
"update the leclerc. the front sloping was not good, compare the
turret to the actual model again to get the geometry much more
accurate. also add machine guns and lights and other equipment, and
also model the amx 30bs to complement the leclerc (note the amx 30bs'
hulls are backwards" + garage screenshot proving the amx30 hull
renders REVERSED vs its gun. Leclerc: re-measure the turret front
slope vs char_leclerc_andertan.glb (the earlier Tamiya-photo order
stands: sloped front descending to a small flat strip) + §B3.2 MGs/
lights/equipment. AMX-30B/30B2: diagnose the backwards hull (if they
render the ahab GLBs via MODEL_SOURCE, it is a REGISTRATION
yaw/orientation error in userdrops7 — fix the registration; if
procedural, fix the builder) + bring both to §B8 class. (2) RUSSIAN
ERA-FRONT LAW — "many of the russian tanks have this kind of era
front: <. properly represent that when comparing to their models.
this affects the t72s, t80s, and t90s": the chevron/arrow K-5 wedge
banks meeting at the gun (the '<' plan read). Relayed to the live
t90 agent for the t90s; QUEUED as the next russia-lane round for the
t72s + t80s (russia.js single-writer — spawns after the t90 agent
lands).

## 5.15 OWNER ORDER (2026-08-07): "update the armata, the proportions
are def off and need to be remeasured, its really long but not wide
at all. adjust the hull, and also improve the turret" — T14 PROPORTION
ROUND (modern2.js free, spawned): re-MEASURE the four-box vs spec
dims (hull 8.7 / overall 10.8 / width 3.9 / height 3.16 datum) + the
print + photos; the owner reads it LONG-NOT-WIDE — find where the
visual width is under-built (skirt/fender planes vs the true ±1.95,
wheel band width, turret plan width) and/or the length over-reads;
adjust the hull; improve the turret (banked t14.md notes: Afganit
corner stubs borderline §B3, crown seam density, roof sparsity).
The print tube-pin stays DEFERRED (certified short-tube cap — agent
must not chase those columns). Seven builder lanes now live.

## 5.16 OWNER ORDER (2026-08-07): LEO-PROTO/TYPE90/2A4 FAMILY BASIS —
"the type 90 is based off of it [the leopard prototype] so they can
share a basis, and the 2a4 is also similar to the type 90, so make
all of them similar to each other with the type 90 giving the most
basis and being scaled properly and the type 90 needs a better gun
placement and mantlet." Split across the two live lanes: (a) LEOPARD
agent (owns proto + 2a4): rebase both on the type90 grammar (READ
buildType90 in misc.js read-only — the donor), family read across
the trio; (b) FRANCE agent (owns misc.js): +1 job — type90 SCALE
CHECK (the standing too-small flag; dims sovereign, four-box vs spec
+ its registered recovered/type90.glb oracle), BETTER GUN PLACEMENT,
proper MANTLET (§B3.1; the standing "type 90 needs a mantlet" order).
Grammar transfers; per-tank dims stay sovereign.

## 5.17 OWNER ORDER (2026-08-07, revolution close-up screenshot):
"theres still a gap under front part of its turret and still has
these ugly gray squares. fix the turret" — REVOLUTION TURRET FIX
ROUND (leopard.js free post-eff8512, spawned immediately): (1) the
UNDER-FRONT-TURRET GAP (chin/ring daylight — the closure round's
documented station/gun-cradle-air residual is NOT acceptable to the
owner; close it with real chin/collar geometry); (2) the UGLY GRAY
SQUARES on the turret flank — flat rectangular module faces
(including possibly the closure round's own new bins/end-plates/rail
boards) must be re-dressed §B3-real: AMAP-class composite modules
with seams/bolts/chamfers + correct tone slots, NOT flat gray slabs
(the §4.9996 gray-rectangles class returned). The in-flight leopard
critic's revolution verdict is superseded by this owner read; its
other three verdicts stand.

## 5.17a OWNER CORRECTION (2026-08-07): "the squares are not the
issue, its just that the turret didnt finish building under that
front part and sides" — the §5.17 round RE-SCOPED (relayed live):
gray-squares job DROPPED; the whole round = BUILD THE MISSING TURRET
STRUCTURE — the shell's lower side walls down to the ring band + the
under-front chin/cheek undersides to the mantlet collar, real §B2
casting walls; verified at the owner's close 3/4 angle + yaw 0/45/90.

## 5.18 OWNER ORDER (2026-08-07): NO-AIR PRINCIPLE (now BUILD-STANDARD
§B2 law) + AFV UNDER-GLACIS ROUND — "the merkava filling is good, now
do it for the afvs' upper glacis which have big gaps under them,
primarily bmp and bradley. eventually do this procedure for other
tanks too, including side plates that might just be hovering." Round
spawned: bmp2 + m2a2_bradley (builders in the SHARED tankFactory.js —
strict path discipline + wide hash sweep), secondary puma/type89
check (their builders live in modern3.js — free). FLEET NO-AIR SWEEP
(hovering side plates, all tanks) QUEUED as a read-only audit next.
NOTE the owner ALSO said "adjust their stats" for the AFVs — read as
ambiguous (gameplay stats vs geometry); the geometry round is
running; the stats half is FLAGGED FOR OWNER CLARIFICATION.

## 5.19 OWNER ORDER (2026-08-07): SEPv3 DEDUPE + SEP REBUILD-ON-BASE —
"theres two m1a2 sepv3s. lets use M1a2 sepv3 and delete m1a2 abrams
sepv3. then, for sepv2s and sepv3, we need to rebuild them to use the
M1A2 abrams base model and then start slapping on extra stuff and
decorations." EXECUTED: the base m1a2 spec row RENAMED 'M1A2 Abrams
SEPv3' -> 'M1A2' (the duplicate garage name is DELETED; the SEPv3
identity belongs solely to m1a2_sepv3; the base id/geometry stays as
the locked-roster family anchor + graduate + oracle bearer — if the
owner meant delete the TANK, the leo2a7 delist mechanism is 30
seconds, flagged in the code comment). QUEUED: SEP REBUILD-ON-BASE
round (abrams.js — behind the live abramsx agent): sepv2 + sepv3
rebuilt to visibly BE the M1A2 Abrams base platform + slapped-on
kit/decorations (owner's third restatement of this intent — the
visual base-ness isn't reading; the round unifies the SEP variants'
platform detail with the tejas-grade look, then the kit). AMBIGUITY
FLAGGED to the owner: "the M1A2 abrams base model" = the base m1a2
id or the tank NAMED 'M1A2 Abrams' (tejas)?

## 5.20 SEP-LANE VERDICTS RATIFIED (2026-08-07): 5/5 graduate
re-certs PASS -> RE-FROZEN in §3 (m1a1 2f277528, m1a1ha aa7af504,
m1a2 636a4860, tejas f7510d88, sepv2 7ef1c5ec); CROWS-FORWARD
verified 7/7 in pixels (owner order CLOSED — "point forward, not to
the left" reads on every station; shadowBarrel invisible as defect);
sepv2 remake ACCEPTED (elevated forward CROWS II + APU + urban kit);
m1a2_sepv3 ACCEPTED PASS 9.1 into the roster at 12ffb1f4 (FALSE-0,
never gate; M1A2C identity complete; notes banked). tusk b1786e4c
scored 9.1 floor, no orders. Critic observation banked: the
tejas-family loader's skate-rail M240 rests TRANSVERSE (certified
pre-existing on 3 graduates) — if the owner's forward-look extends to
manned rail guns, that is a future cap re-adjudication (ASK OWNER,
nicety). The critic worked a clean-room at 18d3f13 — its name-
collision observation is already resolved by the 56d5b14 rename.

## 5.19a OWNER CLARIFICATION (2026-08-07): "i meant the m1a2 abrams
(ex tejas) is the correct base, the base m1a2 platform is WRONG." —
the queued SEP REBUILD-ON-BASE round's base = the m1a2_tejas platform
configuration (the tank named 'M1A2 Abrams', re-frozen f7510d88), NOT
buildM1a2's base fit. sepv2 + sepv3 rebuild so their hull/turret/
detail grade visibly IS the tejas-grade platform, then the variant
kit (sepv2: elevated CROWS II + APU + urban kit; sepv3: M1A2C set)
slaps on top. SIGNAL BANKED (not yet an order): the owner considers
the BASE M1A2 PLATFORM'S LOOK WRONG — a future base-m1a2 rebuild
toward the tejas grade is the likely next ask; the §3 graduate row
(636a4860) stands until ordered.

## 5.21 LEOPARD ROUND VERDICTS RATIFIED (2026-08-07): 4/4 PASS 9.0
(independent critic, fresh 7x14-view sets; sheets
shots/critic-leopard-509/). Revolution SEE-THROUGH DEAD at 531d8a7c
(old sightlines 0-55px, all bounded intentional structure; -85%
verified) — its RE-FREEZE DEFERRED to the §5.17a understructure
round's landing + re-cert (the lane was already at WIP db70c929;
same region). a4 12db10a0 / proto 24bd57cc / a7v 3ca4af86 records
RATIFIED (a7v merge conclusively dead: yaw-90 top proves the compact
rotating turret; the 61.6% four-box is thin dressing, documented).
§5.16 FAMILY READ PASS (type90+proto+a4 one grammar, marks separable).
ASK-OWNER banked: the proto's RCWS is legally SQUAT (published-height
dims row caps it) — a proud a4-class station there needs an owner
override of the height row. RCWS forward + connected verified x4.

## 5.22 T14 VERDICT RATIFIED (2026-08-07): PASS 9.0 — §5.15 OWNER
ORDER CLOSED (independent critic, clean-room bracket at 60d7d14 x4;
sheets shots/critic-t14-proportion/). LONG-NOT-WIDE DEAD by the
numbers: plan W/L 0.4521 vs the print's 0.4503 (proc now wider-per-
length than the print), front band 0.978 vs 0.953, tail 15.9% vs
18.8%, garage-angle parity +0..+2.1%, 7 wheels at native tone
(variance 738, 7 even peaks). Turret delivered on all five ordered
items (Afganit ring, MG stowed, pano at the real columns, GLONASS,
shroud facets). NO regression on the 765310f tells. Report-only
residuals banked (roof density detail-class, track albedo shared-
material, glacis tone, stern screen hang attributed). Record 60d7d14
binds.

## 5.23 OWNER EVENTS (2026-08-07): (1) ALL BACKGROUND AGENTS STOPPED
from the owner's side mid-flight — owner ordered "bring them all
back": four builders RELAUNCHED fresh (abramsx continuing its WIP in
abrams.js; France continuing its WIP in misc.js+userdrops7; chevron
fresh + the NEW FUSED-TURRET orders; AFV fresh), both critics resumed
from transcripts. (2) FUSED-TURRET ORDER (screenshot): "the t90a
vladimir, the turret is literally fused with the hull, like the
t72b3m, which also needs to be fixed" — folded into the chevron
agent's brief (vladimir 02ebb722 moves; t72b3m 61a83b2c graduate-
change). (3) THREE REFERENCE DROPS staged in community-candidates/ +
ATTRIBUTION'd: abrams_x_low_poly.glb (Mortavex, relayed to the live
abramsx round as the primary look reference), type_74_new.glb
(NullOps, SPLIT nodes — oracle-replacement candidate, kills the
re-rig escalation if clean; onboarding = my lane, QUEUED), the
type-10 source OBJ (source material).

## 5.24 MERKAVA WAVE RATIFIED (2026-08-07): 5/5 closures DEAD (my
numbers reproduced the builder's byte-identically; 2d's honest
after-count is 638 not ~430 — packet-note class), 3/3 graduates PASS
>= 9.0 on every changed view -> RE-FROZEN in §3 (1b 78051af0, 3c
aa74be6a, 3d 667ece84). The owner's §5.11 under-roof diagnosis is
FULLY ANSWERED at the candidate hashes. All adjudicated-air residuals
verified as intentional structure; 3d's y90 under-chin daylight =
turret-hull-gap class (explicitly out of the §5.11 scope).

## 5.25 REVOLUTION COMPLETION RATIFIED (2026-08-07): re-cert PASS
(front 9.4 / side 9.2 / close 9.3; floods verified digit-for-digit,
zero regressions across 63 views; the one new 153px yaw45 pocket
adjudicated REAL AIR — open-notch projection signature, legit
overhang class) -> RE-FROZEN bbae2c80 -> db70c929 in §3. The owner's
§5.17/§5.17a "turret didnt finish building" complaint is CLOSED: the
shell now stands on real casting walls at every angle.

## 5.26 OWNER RATIFICATION (2026-08-07): "the leclerc turret is a
triumph... as are the merkava geometries. all tank designs have to
aim for this level of quality" — codified as BUILD-STANDARD §K
(QUALITY EXEMPLARS: measure -> loft to measured lines -> close with
real geometry -> prove in pixels). Relayed to all live builders.

## 5.27 ABRAMSX VERDICT: FAIL 5.5 (independent critic, native-tone §K
severity; sheets shots/critic-abramsx-dedicated/). Gained: verdict 2
CLOSED (hull panels/fenders/light bays), turret facets + smoke banks
on the face plane, +13.4 min. NOT CLOSED: (1) wheels UNREADABLE at
native tone view-left (proc band spread 3.6L vs the ref's 17-21L at
the same paint — geometry, not scheme: no inter-wheel daylight, no
dark tire annulus); (3) TWO §B2 violations — the left rear flap
floats (bg on all four sides) + the stern rack is a stilted table
with 4,353 bg px through it (NEITHER reference carries that
structure); (4) partial — roofline identity sub-visible at garage
range + a mushroom-eave roof overhang both refs lack. SEVEN ORDERS
(measurable pass conditions in the verdict): wheel daylight + tire
annulus own-bucket, flap hinge-straps to the hull edge, stern rack ->
the print's solid stepped deck (§K merkava mechanism), roof rim
flush, roofline RWS/drums/pods within the cap + the dims-datum
extension work order, tone-honest pepperpot, tray lashings + stern
bays. FIX ROUND QUEUED behind the live SEP-on-tejas agent
(abrams.js single-writer).

## 5.28 FRANCE ROUND RATIFIED: 4/4 PASS 9.0 (independent critic;
sheets shots/critic-france/). LECLERC front-slope complaint DEAD-
MEASURED (brow strip 2.13w REF=PROC, ~9-deg raked face parity, the
silhouette steps in raw pixels; M2 forward; equipment connected) —
the owner's "triumph" state holds under fresh eyes; doc true-up
banked (the packet's commander-well claim isn't in the bytes — flat
roof + hatch ring reads; priced in ratified residuals). AMX30/B2
CORRECT-WAY-ROUND proven four ways + full identity incl the visible
20mm M693; §E re-bake lane proceeds. TYPE90 mantlet + gun-mid PASS.
§B7 TYPE90 TURRET RE-PROPORTION — RATIFIED BY THIS RULING (packet-
recommended + critic-seconded): the print is REF-WRONG on turret
height (oracle roof 1.90 vs the real 2.34); the REAL 2.34 governs;
per-column caps document against the print; the finish round may
spend those ~30 columns. Follow-up round SPAWNED (misc.js free).
Leclerc chirality-anchor observation banked (signed-x top map as the
fleet mirror-scare test).

## 5.29 OWNER REFINEMENT (2026-08-07, REAL PHOTO — T-72B3 obr. 2016
parade): "this is what i meant by the chevrons for the russian ERA,
its like two panels of era that meet at a tip. thats what i wanted
dude! and update all the equipment around and add more machine guns
to the soviet MBTs." — THE CHEVRON SPEC REFINED: TWO large flat
soft-case ERA panels angled as a shallow V MEETING AT A POINTED TIP
at the turret center-front (the obr-2016 wedge read; the photo also
shows: full-perimeter slat/bar armor on the hull rear + turret rear
arc, side-skirt flexible squares with the camo print, the NSVT/Kord
pintle prominent on the cupola, smoke banks angled on the cheek).
FOLLOW-UP ROUND SPAWNED (russia.js free post-78b89f5): re-shape the
just-landed chevron banks into the two-panels-at-a-tip read on every
soviet MBT that carries soft-case ERA fronts + EQUIPMENT DENSITY +
MORE MACHINE GUNS (pintle NSVT/Kord/PKT per cupola, CROWS-FORWARD
law) fleet-wide on the soviet MBTs. The in-flight chevron critic's
verdicts remain useful evidence; the refinement supersedes shape
verdicts where they conflict.

## 5.30 OWNER ORDERS (2026-08-07, relayed into the live §5.29 round):
(1) t90a_vladimir REBASED ON THE T90A — the turret REPLACED wholesale
with the t90a's welded loft (vladimir keeps only its real-distinct
kit; record 190e6a32 moves by order; the 63.8 print-bake cap
discipline stands); (2) t90a — the excess rectangle on the right
side of its tracks near the bottom REMOVED (§B3 no-mystery-boxes:
identify, re-seat if real, delete if not; both sides probed).

## 5.31 OWNER ORDER (2026-08-07): GARAGE REGROUP — "move our custom
tanks into where they properly belong": WW2 <- sherman_jumbo,
leichttraktor, pziii (both pziii ids adjudicated at execution),
sturmtiger, tiger2, jagdtiger, jagdpanzer (jpz_e100 read — confirm at
execution), t34_85_cad, t44, is3 (+is3_bergman), is6b; COLD WAR <-
type59, strv103, t95 ('doomturtle'), m48; MODERN <- merkava4
('merkava mk IVM'), m1a2_tusk. THEN: the SOURCES group becomes the
complete catalog of ALL actual 3D tank models (every GLB-rendered
model listed there, even where the tank also appears in its era
group). EXECUTION BLOCKED on garage.js: the file carries the owner's
live uncommitted WIP (their parallel session) — the group logic
(Sources derivation + COLDWAR_IDS map) lives there. Executes the
moment garage.js lands clean; era-side spec fields ride the same
commit. NOTE the destination judgment on the first list: t44/is3/
is6b read WW2-era (1944-45 vehicles) — the owner's list order is
ambiguous between WW2 and Cold War for them; DEFAULT WW2 with the
type59 in Cold War; owner can re-sort with one word.

## 5.32 CHEVRON+FUSED WAVE RATIFIED (2026-08-07): 8/9 PASS (critic
sheets shots/critic-chevron-fused/). t72b3m RE-FROZEN 61a83b2c ->
175be954 (§3 updated; graduation record carries forward on every
unchanged pixel). VLADIMIR separation PASS 9.0 — the §E escalation
VERIFIED IN PIXELS (the print's hull node wears a complete
non-rotating turret band + ring hole + fused tube; the 63.8 line is
the print-bake cap, not a build break — the ORACLE BAKE-STRIP stays
my top §E item). t80 CONDITIONAL 8.0 with ONE measured order (banks
must break the dome silhouette in plan: proudness 0.07 -> ~0.14
and/or pitch/k1Y until >= ~800px clay-plan footprint + two >= 25px
angled runs per side) — RELAYED into the live §5.29 tip round (t80
in scope). Ledger rows staged for the eight (vladimir's stale 71
corrected). Packet overstatement note banked (t72b3m seam claims).

## 5.33 OWNER MISSION BAR (2026-08-07): "we need to get at least 30
more tanks above 90 is your bar i dont even care. with all specific
issues like see-through-sides or the t72 turrets not spinning right,
fix all of them." — THE 90-LADDER CAMPAIGN: fleet 21/89 passing ->
target 51+. Routes, fastest first: (a) the 80-90 band harvest
(leclerc 86.2, bradley 84.7, type90 83.6-live, t80 82.5, ariete
82.3, t80b 81.6, m45 81.2 — small ladders); (b) §E oracle repairs +
re-oracles for cap-bound ids (vladimir bake-strip, sepv2 re-oracle,
type_74_new, the registration-source round unblocking ch2/t54/
t80bv); (c) the 60-80 band by family. DEFECT CLASSES named by the
owner: SEE-THROUGH SIDES (fleet no-air sweep NOW RUNNING read-only ->
fix list) + T72 TURRETS NOT SPINNING RIGHT (relayed into the live
russia round: turret-parent audits + yaw pairs on the t72 line).
Four interrupted agents RESUMED from transcripts (type90, chevron-
tip, SEP critic, abramsx fix); four others verified already-landed.
First ladder wave spawned: bradley (tankFactory), m45_patton
(patton.js), the fleet see-through sweep.

## 5.34 SEP-ON-TEJAS RATIFIED + SEPV2 RE-ORACLE EXECUTED (2026-08-07):
fresh critic (prior lane's transcript lost to process exit) re-scored
the 73 surviving shots under a fresh hash bracket (sepv2 e60878a9,
sepv3 2c9023d0, tejas anchor f7510d88 — all MATCH): m1a2_sepv2 PASS
9.3, m1a2_sepv3 PASS 9.3 — the §5.19a platform order READS in pixels
(one platform, three kits; CROWS-forward holds). ACTIONS: sepv2
RE-FROZEN e60878a9 (§3); sepv3 2c9023d0 recorded as the binding hash
(stays FALSE-0/never-gate — no oracle of its own); critic's RE-ORACLE
ruling EXECUTED in the registration lane — m1a2_sepv2 re-registered to
/models/tanks/m1a2_tejas.glb in all four maps (procedural-fidelity,
visual-evaluator, tmp-tank-critic, vertex-extract REG; tejas pattern
^Turret$/^Gun$ yaw -PI/2), recovered/m1a2_sepv2.glb registration
RETIRED for this id (m1a2 keeps it — separate instrument, separate
adjudication). Honest baseline x2 bit-identical: min 0 (hull 0, whole
17.3, turret 19.8, stations 77.4, dims 100, floaters 100) — FALSE-0
CLASS: the WORKS-FIELD PARITY ECHO (14 hull-bucket boxes to y 2.30,
abrams.js sep2 block) was built to serve the OLD print's REF-HULL mask
split and now poisons hull vs the bare-hulled tejas print. Per the
critic's own constraint the echo deletion MOVES THE HASH -> queued as
the NEXT abrams-lane touch (graduate-change chain: delete echo ->
gate x2 -> re-cert changed views -> re-freeze). Row lands with this
annotation; never read sepv2's 0 as a regression.

## 5.34a TYPE90 GLB BYTE-HEAL (2026-08-07): d414664 committed the
PARTIAL batch-27-only bytes (c286b555 — the state the NameError crash
left on disk), not the healed byte-idempotent batch-49 output
(b2ece521) the 45.1 ledger row (0184d73) was measured against. Caught
by pre-commit staged-drift check (camoKit lesson). Worktree bytes
b2ece521 committed here; ledger row already honest.

## 5.35 FLEET SEE-THROUGH SWEEP DELIVERED (2026-08-07, §5.33 defect
class 1): 58/58 procedural ids swept read-only (~41 scans each: §B2
enclosed-bg flood + foreground-island CCL), 1403 evidence PNGs under
shots/see-through-sweep/, tools left committed-adjacent as
tools/tmp-sweep-seethrough.{html,mjs} + tmp-sweep-adjudicate.mjs for
fix-round re-verification. TWO SWEEP-LAW DISCOVERIES banked: (1)
GUN-AIR FP — under-barrel air enclosed by whip antennas floods as
"hole" (merkava2d's 6849px headline was entirely this); gun-box
y-band tagging removes it. (2) DARK-COLLAR ISLAND FP — near-bg cold
collar tones fake disconnection (m26 muzzle). Flood is BLIND to
open-ended corridors; the island scan is their detector
(leopard2_proto/t80u proved it). RANKED HOLES (garage-visible first):
1 bmp2 (turret FLOATS above ring, bg through in plain side; modern3),
2 t72b3m GRADUATE (dome-rear<->hull-stack window + full-length top
skirt corridors; graduate-change, couples w/ live t72-spin round),
3 m60a2 (open sponson/fender channels + floating skirt seg; patton),
4 vickers_mk1 (sponson slit; packet documents 2.5cm designed — verify
width), 5 leopard2_proto (7cm full-length top corridors both sides),
6 t90m (rear-overhang slot + skirt-front slots; russia LIVE),
7 t64bv1 (hovering roof bins; russia LIVE), 8 t80u (right top
corridor 6.3m + ERA standoffs; couple w/ §C reversed-slab), 9
spz_puma (rear-deck seam; modern3), 10 centurion3 (mantlet-flank
pockets; uk), 11 patton MG floaters m26/m45/m46/m47/m60a3 (§B3 mount
mass; m45 ladder LIVE), 12 t84 (inter-armor-block gap), 13
t72bu/t80bv (partial top corridors), 14 challenger_3 (skirt leading
plates hover-read; verify), 15 challenger1 (under-turret-skirt band,
hygiene), 16-18 minor (sepv2 post slit, type74 empty-rack, t80-family
shared rear floater — one family-rig fix). CERTIFIED/LEGIT no-order:
all five merkavas, challenger2 basket, abrams family (cleanest),
kf51/ch3 RWS mount air, amx30 mast, type10 basket, pt91m/t62mv1.
CLEAN <100px: kv2 0, type90 4, ariete 8, isu152 12, isu122s 14,
centurion5 16, m1a2 20, chieftain5 20, leo2a5 42, revolution 46,
t80b 56, t90a 99, leclerc, bradley, vladimir, leo2a6, m60a1.
CAVEAT: russia.js dirty throughout the sweep -> its rows PROVISIONAL
(live-tree hazard); abrams.js dirty only after final re-runs.
LANE PLAN: free lanes fix first (modern3: bmp2+puma; uk: vickers+
cent3+ch1; leopard: proto corridors); busy lanes queue their items
behind live rounds (russia: t72b3m/t90m/t64bv1/t84/t72bu/t80bv/
t80-floater; patton: m60a2+MG-mass rides the m45 ladder; misc: t80u+
type74; abrams: sepv2 post slit rides the echo-deletion touch).

## 5.31-EXECUTED GARAGE REGROUP (2026-08-07): owner's garage.js WIP
cleared -> order executed. ERA_PLACED_SOURCES set (18 ids) exempts the
named GLB-sourced customs from the Sources branch; t95 added to
COLDWAR_IDS (spec era ww2, owner places it Cold War — coldwar check
now precedes the era branch in groupOf; proven safe: no other
COLDWAR_IDS member is era-ww2). Census: WW2 +12 (sherman_jumbo,
leichttraktor, both pziii customs, sturmtiger, tiger2, jagdtiger,
jpz_e100, t34_85_cad, t44, is3, is6b), Cold War +4 (type59, strv103,
t95, m48), Modern +2 (merkava4, m1a2_tusk). Sources now = is7,
object279, newc_tiger, q_heavy, recon_tank. ASK-OWNER (default held):
newc_tiger is a Tiger I custom the order didn't name — same principle
would file it WW2; q_heavy/recon_tank are fictional customs with no
era home. "Sources have ALL actual tank models" read as the end-state
description (remaining prints stay listed); if it means onboarding
MORE playable prints, that's a new order.

## 5.36 AMX30 RE-BAKE + RE-ONBOARD EXECUTED (2026-08-08, §5.14 §E
escalation): manifest RZ fix (build_gen2_tanks.py both hull entries
RZ(-90)->RZ(90)), amx30b_ahab/amx30b2_ahab re-baked (md5 e28d68d5/
4d1fc81d, .baks refreshed — batch-22 stays disabled: source cured),
vertex receipts agree:true BOTH (was the owner's backwards hull),
renders shots/gen2-bake/. Re-registered in the three harness maps —
the no-oracle FALSE-0 rows become MEASURABLE. Honest baseline x2
bit-identical: amx30 0 (hull 31, dims 22.7, floaters 0) / amx30b2 0
(hull 29.9, dims 44.6, floaters 0) — HONEST photo-build-vs-print
reads, not artifacts: proc measures heightM 2.46 vs pub 2.29 (+7.2%),
hullLen 6.37 vs 6.59 (-3.3%), 1 floater fail, stations topPct to 22%.
LADDER BRIEF SEEDED (misc.js lane, queue behind type90/leclerc/
ariete): fix the floater, drop roof to pub height, stretch hull to
6.59, then turret/whole curves vs the now-valid oracle. ALSO: 10
stale-since-08-06 vertex receipts refreshed in this commit (amx30 x2,
m1a2_sepv2->tejas per §5.34, type90 batch-49, ch2/ch3 batches 47/48,
fv510 redesign, m1a1ha/tejas/tusk batch-15/16 tejas warp — receipt
heightPct 34.8->1.6); 65 timestamp-only churns reverted unstaged.
Extract CLI note: vertex-extract.mjs <id> arg does NOT filter — it
sweeps all 75 registered ids every run.

## 5.35a PROTO CORRIDOR CLOSURE LANDED (2026-08-08, §5.35 item 5):
sponson-underside/skirt-hanger rail closes the 6.8cm full-length top
corridors both sides — y0-top islands 4992px -> 0, oblique slots
cleared, §B4 2cm annulus kept, §5.16 family silhouette untouched
(no shared-helper edits; leo2a4/revolution/graduates byte-held).
Gate x2 bit-identical 0 | hull 45.8->46.8, rest exact — NO RUNG TO 90
on this oracle (melted turretless tub caps whole/turret/stations ~0
BY CERTIFICATE; oracle-sourcing dependency noted in packet). New hash
afb3cc3c (not frozen). Landed f40ea00-successor commit.

## 5.37 CHEVRON+MG ROUND RATIFIED + LANDED (2026-08-08): independent
critic RATIFY 9/9 at >=9.0 from FRESH self-shot evidence (one ticket,
shots/critic-chevtip/). §5.29 tip-read PASS all nine (t80bv 9.5
strongest — 3-course walls meeting at V-nose; t72b_1987 9.4 crisp
collar-tip V); §5.29 MGs PASS all nine (t72bu's last-mg0 cleared);
§5.30 VERIFIED (vladimir turret IS the t90a design — plan outline
verbatim, kit seats aligned, own mast/gun kept; skid rectangle GONE
with before/after pixel proof); §5.31 SPIN PASS with hard evidence
(t72b_1987 dome orbited ~0.40 before, centered <=0.1 after; pivot
moved to casting plan-chord center, world-identity at rest). HASHES
LANDED (all 9 verified x3 by critic + orchestrator): t72b_1987
d62c8140, t62mv1 db9507ac, t72bu 68082d79, t80 578b7f08, t80b
99393970, t80bv 89769670, t90a 265610e2, t64bv1 f5222a1c, vladimir
bdfe7d24. Graduates held byte-exact: t90m/pt91m/t84/t72b3m/t90sm.
FILE-SHA ANOMALY resolved: builder reported russia.js ea20b889,
critic measured 899d8458 — non-geometry bytes; geometry hashes bind
x3 = the truth per protocol. Vladimir row 9 = documented §5.30
print-cap (2.60m cast dome cannot corroborate 3.23m loft; §E batch-50
bake-strip is the recovery). POLISH BANK (non-gating, next russia
touch): vladimir '112' re-pin z fwd ~1m + x flush 1.435 (§5.04);
t72b_1987 right-arm panel notch; t80/t80b NSVT prominence vs heightM
grace = ASK-OWNER trade; t62mv1 DShK elev -0.32 -> -0.10..-0.15 +
azimuth inboard. RUSSIA LANE FREES: next = t72b3m graduate-change
(spin 0.20 + arc-grammar tips + §5.35 window/corridors) + vladimir
batch-50 + t80/t80b ladders.

## 5.39 TYPE90 ORACLE 49-v2 (2026-08-08, OWNER VERDICT "lol why is
type 90 turret huge and tall now?" + garage screenshot): batch-49 v1's
crown tail (23.359->27.642, "furniture rigid +0.44") over-raised the
print's turret band to 2.67-2.84m (receipt bodyH 2.747, +17.4%) and
the live ladder agent faithfully built a giant turret to it — the
owner saw it in the garage. v2 compresses the tail (23.359->25.31,
y_top_max 25.35): roof stays at the published 2.34, ridge ~2.51,
sight head 2.60. Byte-idempotent x2 fcfeb38a (md5 worktree == staged,
oracle-bytes law). Ladder agent HELD mid-round, told to revert any
turret-raise chasing the v1 band and re-baseline vs v2. LESSON (§E
law bank): a normalize plan's ABSOLUTE height targets must be
sanity-checked against the real vehicle's published profile BEFORE
execution — batch-49 v1 encoded 2.67-2.70 crown targets no Type 90
reaches; the receipt's heightPct (+17.4) was the tell, and the owner's
eyes caught it before I did.

## 5.40 ABRAMSX §5.27 RE-CERT: RATIFY 9.2 — ROUND CLOSED (2026-08-08):
independent critic scored all seven orders >=9.0 on fresh evidence at
bound bytes (abramsx 2c6eb344 verified x3 across three HEADs; family
byte-guard 8/8 EXACT incl. sepv2 e60878a9/sepv3 2c9023d0 — the O1
opt-ins are byte-invisible, proven). Highlights: wheels 9.5 (7/7 disc
peaks both sides, 17 real daylight runs, mush dead), flaps 9.5 (0
enclosed), stern rack 9.5 (4353px through-sky -> 0; 58px residual =
certified under-barrel class), eave 9.0 (closure walls read, §B5 yaw
proven), roofline 9.0 (kit present within 2.435/2.459 caps), muzzle
9.0 (11 lit/dark transitions), lashings 9.0. Gate 62.9 hold-or-improve
stands. §5.08/§5.27 CLOSED. Non-blocking residuals ledgered: idler
disc flat, right band modulation trails left, RCWS detail waits on
the FILED dims-datum work order (orchestrator lane, the remaining
identity headroom). Abrams lane FREES -> sepv2 works-echo deletion
round (§5.34 chain) spawns next.

## 5.38 OWNER PRIORITY WAVE — SEVEN AW-SERIES DROPS (2026-08-08): "bump
this up in priority, fully model a custom <X> based on this model
using our strongest visual comparison and geometric comparison
techniques" x5 messages: K2 Black Panther, Type 99A2, AMX-40, K1A1,
T-90MS Tagil, then "custom t90 and t90a burlak". ONBOARDED (orchestrator
lane): all seven parked LOCAL-ONLY in public/models/community-candidates/
(provenance inconclusive — ATTRIBUTION series entry; ASK-OWNER standing:
type_89-strict deletion available on request); k1a1/t90ms/t90 re-baked
from semantic OBJ sources (real turret/cannon nodes); vertex REG + three
harness maps registered for all seven (k2 receipt already extracted:
dims bind len -2.4/overall -3/width 0, height +20.9 = RWS band, t90m
class). ROSTER DISCOVERIES: k2 spec+buildK2 DORMANT in modern3.js
(owner-delisted 2026-08-06 "no glb" — reason VOIDED by the drop);
type99a spec+buildType99A DORMANT in modern2.js (same). LANE PLAN:
modern2 agent re-activates type99a vs its print; modern3/KOREA agent
(waits for the live no-air round) re-lists k2 + builds k1a1 new;
france.js agent builds amx40 (stub module wired into tankFactory by
the orchestrator, empty-map no-op until filled); russia t90-family
agent builds t90 + t90ms + t90a_burlak (specs userdrops7 make()
pattern from t90a base, builds in profiles/russia.js — §5.13 family
turret law: derive from the landed t90a/t90m/t90sm grammar, each with
its own print-measured identity). Extract sweep for the six new
receipts DEFERRED to a calm-load window (box hit a load-869 render
wave this hour; starved measures read garbage).

## 5.41 M45 LADDER DELIVERED 90.7 PASS x3 (2026-08-08): 84 -> 90.7
(hull 91.4/whole 90.7/turret 92.2/stations 93.4/dims 92.2/floaters
100), candidate 9f5c94d0 UNCOMMITTED — graduation critic RUNNING.
Round root-find: r1 was authored from a Z-FLIPPED workorder plan frame
(the r3 thin-end heuristic still loses on near-bow-flush muzzles —
FLEET LAW CANDIDATE: landmark-verify every plan read); registration
recovery via body-ends probe (dAlong 0.000 all rows). §5.35 item-11
M2-window closed with real mount mass. m26_pershing DRIFT FLAGGED:
reads 2f006738 vs registry 65c564c0 — builder bisected to LANDED
5f39989 (armorM4 gunBarrel proxy 3.96->3.44; m26/m45 inherit m4a3e8
proxies, patton.js bytes unchanged). RE-RECORD PENDING the m45
critic's independent confirmation, then §3 updates with the proxy
attribution note. Owner spec-row flag stands: m45 6.6 -> ~6.47 would
restore dims ~100 (ASK-OWNER, non-blocking).

## 5.31b OWNER CLARIFICATION (2026-08-08): "im not seeing our custom
models on our deployed versions, only the actual comparison models" +
re-send of the §5.31 move list + "then make sources have ALL actual
tank models". READ: the 18 era-placed ids currently RENDER as their
community GLB prints (MODEL_SOURCE=glb) — on deploy the owner sees
the comparison models (or nothing where stripping applies), not OUR
custom builds. DIAGNOSIS AGENT SPAWNING: map which of the 18 have
procedural builders (dormant or live), what VITE_PUBLIC_BUILD strips,
and design the flip (playables -> procedural in era groups; Sources
keeps ALL actual-tank prints browsable). leopard2_proto MODEL_SOURCE
flip is the mechanics precedent.

## 5.42 MODERN3 NO-AIR DELIVERED + BMP2 RULING (2026-08-08): bmp2
fleet-#1 killed with real geometry (side-T 1879->0, garage cluster
243->0, front-low island 3098 dead; ROOT CAUSE was floating ROOF
FURNITURE, not the ring seat — the adjudicator's hover guess was
wrong, the builder measured). ORCHESTRATOR RULING: RATIFY 82.7 (-1.3
whole) as the §B7 owner-law-over-print price — §5.18 NO-AIR is owner
law; the print's OWN launcher floats (ref cols 2.151-2.181 under its
2.39 tube) and sealing pays those columns. Receipts + shape ladder
banked in the r8 comment; recovery = §E launcher re-seat warp
(orchestrator queue). spz_puma: all ordered slots closed (top 573->73
all pre-existing, -T rows 0), stations +0.8. Hashes bmp2 53046196 /
spz_puma 940912c8. LANDING HELD: bradley ladder WIP cohabits
modern3.js (spawn-brief path error made two lanes share the file —
LESSON: verify the actual file per id BEFORE lane assignment; bmp2/
bradley/type10/k2 all live in src/vehicles/modern3.js, NOT profiles/).
modern3.js lands as ONE commit after bradley delivers+verifies;
KOREA round spawns after that landing.

## 5.43 UK NO-AIR ROUND LANDED (2026-08-08): critic verdict — Part 1
centurion3 RE-CERT PASS floor 9.0 x17 changed views (machine truth:
front-low 16px vs frozen-rig 44+slit, rear 1023->17, sides tighter
than the print's own wheel-run daylight; pedestal fill reads as cast
structure) -> RE-FROZEN bad74e60 (§3). Part 2 challenger1 GRADUATION
FAIL 8.5 (bar 9.0) but the ordered hygiene closure is SOUND (0px on
the band, gate 90.2 exact-held, identity unmistakable) -> ledger row
stands, graduation stays OPEN with the critic's exact defect list
banked in challenger1.md: (2) front-corner slots ~90-133px
(bin-to-cheek + lamp-bracket-to-sponson, interior-fill class), (3)
rear corner corridors ~252px (mud-flap class), (4) under-shelf bare
slots ~130px, (1) cheek-course tone/chamfer lane (r11 ceiling). Next
ch1 round = close 2+3, continue 1. vickers_mk1 NO-CHANGE adjudication
STANDS (GUN-AIR FP, designed 2.5cm renders 1.5cm — sweep flag
disproven with ray-attribution receipts). Ledger rows were already
exact at HEAD (closures held every component). Critic + builder tmp
rigs deleted at landing. NOTE: cot-shots FIFO lock now held by the
owner's parallel shadowbisect session — respect it.

## 5.44 BRADLEY 90-LADDER DELIVERED + MODERN3 COHABITATION LANDED
(2026-08-08): m2a2_bradley 84.7 -> 90.9 PASS x2 EVERY component >=90
(hull 91.0 / whole 90.9 / turret 91.9 / stations 93.4 / dims+floaters
100) — candidate 90a5568c, FLEET 22/89. Round unlock = the
REGISTRATION SNAP (bow-plate body tabs z 3.235-3.30 -> dAlong 0.000
every row) + turret rebuild to ref lines (rotor boot, collar floor
1.905, TOW pod fall, rounded bustle) + station slice-paint mechanics
(12 ODS skirt sections; box mid-spans are invisible — z-caps/slopes/
low-seg cylinders paint). §B4 rear 45/121 debt CLOSED (0/0 --exact).
Five law-bank discoveries in m2a2_bradley.md (registration-snap,
slice-paint, gun-extra pivot offset, plan-mirror discipline,
ref-teeter cert class). Landed in ONE modern3.js commit with the
§5.42 no-air round (bmp2 82.7 ratified + spz_puma) per the
cohabitation design; guards byte-held (type89/is1/is2/tiger1/m60a1).
GRADUATION: independent critic spawns at the landed bytes — freeze
90a5568c in §3 only on its >=9.0. KOREA round unblocks (modern3.js
clean post-landing).

## 5.44a LANDING ACCIDENT DOCUMENTED (2026-08-08): commit 81bdad1
swept in TWO files the §5.31b diagnosis agent had STAGED but not yet
reported — userdrops4.js + variants.js (the m1a2_tusk ERA-GROUP FLIP:
MODEL_SOURCE retired, procedural tusk renders everywhere, dannzjs
print retires to candidateGlb per the kv2/t30 pattern). Content
INSPECTED post-land: coherent, precedent-cited (§5.34/kv2/t30/m1a1
backfill), covered by the pre-commit npm test, and directly answers
the owner's §5.31b complaint — KEPT PROVISIONALLY; the diagnosis
agent's final report ratifies or amends. ROOT CAUSE: my `git add &&
git diff --cached --stat | tail && git commit` chain made the staged
pre-check DECORATIVE (output printed, nothing gated). NEW LANDING
LAW: the --cached inspection is a SEPARATE evaluated step — never
chain it into the commit command (extends the camoKit lesson).

## 5.45 §5.31b CLOSED — DEPLOY-RENDER ROOT CAUSE + 15 FLIPS RATIFIED
(2026-08-08): root cause = the 18 era-placed ids' MODEL_SOURCE=glb
registrations were UNCONDITIONAL (not dev-gated) — deploy swapped
prints over our procedural builds everywhere (tankFactory 4629-class
swap; strip-nc only strips quarantine trees; all 18 GLBs are CC-class
and shipped). EXECUTED + RATIFIED (landed in 81bdad1, byte-verified
worktree==HEAD, vite-ssr + public-view probes + npm test green): 15
ids flipped to source:'procedural' with prints retired to candidateGlb
(kv2/t30 pattern) — the ww2/casemate/soviet-heavy 13 + merkava4
(userdrops3) + m1a2_tusk (variants.js + userdrops4 tejas-alias
retirement; tejas stays the measurement oracle §5.34). Deploy-view
glb-sourced 19->5 (exactly is7/object279/newc_tiger/q_heavy/
recon_tank). NO-BUILDER QUEUE (donors named, §5.13-consistent): t44
<- t54 profile, type59 <- t54 (print is a Type 69), m48 <- m60a1 +
m47 turret grammar — russia lane x2 (queue behind t90-family) +
patton lane (after m45 lands). 18 honest procedural ledger rows
staged this commit (leichttraktor 15.9 / tiger2 29.2 lows = ladder
candidates, owner-priority call). FOLLOW-UPS: Q3 SOURCES PRINT-CATALOG
implementation (view-only print cards from candidateGlb rows + 1-line
tankFactory seam + strip-nc candidateGlb guard) — round messaged to
the diagnosis agent; ICON REGEN for the 15 + sepv3 at a calm-load
window (genIcons reads MODEL_SOURCE live); two repo chips filed by
the agent (dist ships *.glb.bak incl. quarantined tejas 18.3MB;
strip-nc registry-probe blind spot). ASK-OWNER: (1) t44/type59/m48
show prints in era groups until built — acceptable interim? (2)
newc_tiger WW2 filing, (3) Sources cards view-only vs playable, (4)
leichttraktor/tiger2 rough procedurals — ladder priority.

## 5.46 SOURCES PRINT-CATALOG LANDED (2026-08-08, §5.31b closing
order "make sources have ALL actual tank models"): NEW
src/vehicles/printCatalog.js — lazy, garage-only print catalog derives
one VIEW-ONLY pseudo-spec `print:<baseId>` per candidateGlb row (18:
the 15 flips + kv2/t30/is1); renders through the existing swap
pipeline; CONTAINED (never in ALL_TANK_IDS 107==107, allSpecs
print-free, bots/matchmaking/tools blind to prints). garage.js 11
markered hunks (Sources chip cards: ribbon+thumb, VIEW ONLY battle
guard layered: battle() hard-return before any emit + disabled button
+ no equipment/camo rows). tankFactory ONE markered seam
(modelCfgOverride). strip-nc guard #2 now FAILS on candidateGlb rows
referencing stripped paths + registry probe emits the candidates map
(the two chip-filed gaps partially covered). VERIFIED on delivered
bytes: dev + VITE_PUBLIC_BUILD=1 vite-ssr probes ALL PASS (deploy
Sources = 5 playable prints + 18 print cards = every shipped
actual-tank model), guard end-to-end OK exit 0, npm test 0. PIXEL
EVIDENCE PENDING the agent's calm-load watcher (tools/
tmp-print531b-shots.mjs self-asserts chip/cards/guard, exit 1 on
miss — fix-forward if it finds a defect). ASK-OWNER additions: (5)
print:newc_pziii shows in Sources though the base id is
carousel-delisted ("Minecraft-grade" curation) — ALL-models read
overrode; one-liner if the delist should win. (6) print-card
portraits ride the base icon — after the pending icon regen they show
the CUSTOM portrait until genIcons learns print ids (icons-lane
follow-up).

## 5.47 M45 GRADUATION: VISUAL FAIL 8.8 — TWO ORDERS, DO NOT FREEZE
(2026-08-08): geometry 90.7 PASS independently CONFIRMED (x5 total,
gate JSON byte-reproduced; hash bracket 9f5c94d0 held through all
renders; sibs byte-held; §J yaw PASS; §B2 zero through-hull; all six
brief identity checks TRUE incl. the bow-flush howitzer + §5.35
item-11 closure flood-0). FAILS the family casting bar: (1) m45 dome
ships the SLAB LOFT — no loft.smooth (patton.js ~3911) while
m46/m47/m26-r2 all carry it; the m26-r1 8.8 precedent EXACTLY;
acceptance = gate JSON BYTE-REPRODUCES post-smooth (SMOOTH-RE-EMIT
law), kills the facet reads in 10/14 views. (2) commander cupola is a
0.076-r knob where the print reads a ~0.63m split-hatch ring — the
roof's second landmark; rebuild r~0.30 ring at the SAME station
(x -0.765, z +0.27) carrying the SAME 2.55-2.625 crowns (side
silhouette unchanged = gate-blind), plan-interior hw<=1.21, lid edge
pinned ON the ref face (CORRELATED-TEETER law). Respawned to the
patton lane; ANY geometry edit invalidates the verdict — next sitting
re-adjudicates all 14 views fresh at the new hash. m26 §3 RE-RECORDED
2f006738 this commit (double-confirmed). m48 new-build stays queued
behind patton.js.

## 5.48 LEOPARD SOURCEFIX DELIVERED (2026-08-08, pending critic):
proto afb3cc3c->4f6360fe x2 (UNSKIRTED early hull — print + trials
photos agree; 4 return rollers exposed; rangefinder-housing turret;
RCWS removed, blanked OWS ring per walkaround; hull 46.8->48.7
hold-improved, dims 100 held, §5.35a rail re-roled + corridor
guarantees re-proven). leo2a4 12db10a0->b68e42c2 x2 (blunt-brick 2A4
turret replaces the type90-dart §5.16 artifact; EMES right-front;
bespoke 3+6 skirts calibrated to the a5 wheel-read; FALSE-0/no-oracle
— visual verdict only). BOTH: §5.18 belly closures. Graduates
byte-held x4 sweeps. Independent critic SPAWNED (source-fidelity
scoring, garage-weighted). ASK-OWNER (banked, adjudicated
newer-order-wins): §5.09 ordered "huge automated turret crows system
on the revolution and OTHER leopards" — the source-material order
for these two historicals removed their RCWS; restoration is one
commented call per tank if stations on historicals are still wanted.
tools/tmp-srcfix-raypick.mjs deletes at landing; proto ledger row
stages at landing.

## 5.49 BACKWARDS-PRINT FLAGS ADJUDICATED: ASSERT MISFIRE, NOT PRINT
DEFECT — MY REPAIR DIRECTION REVERSED (2026-08-08): the extract
flagged t90/k1a1/type99a "hull BACKWARDS vs gun, DO NOT score"
(t62_bergman class). I authored turret-cluster 180 rotations — WRONG
on all three. COUNTER-EVIDENCE (type99a builder, six raw-vertex hull
tells: center-lane dozer +z, glacis toe +3.30 vs grille wall -3.5,
skirt bias, powerpack deck -z, log rack -z, driver +z; t90-family
builder holds its own raw-probe counter-evidence): the prints are
INTERNALLY COHERENT with bow +z; the flag is the DOCUMENTED §D
orientation-assert misfire for hulls whose RAISED REAR DECK tops the
bow run (99a 1.78 > 1.50 — T-90/K1A1 same class). My own experiment
corroborates: physically flipping 99a's tube did NOT change the
assert's gun read. TWO NEGATIVE RECEIPTS BANKED: (v1) cluster-bbox
center is GUN-DRAGGED (99a turret would fly 5.6m off-station — caught
pre-damage by re-inspection); (v2) the transform-path composition
scattered blender-baked clusters (t90 len 7.03->4.57 garbage read =
mesh-local centers are NOT shared-frame when nodes carry transforms).
ALL THREE RESTORED PRISTINE (99a bbb31bfe from the owner drop;
k1a1/t90 re-baked from OBJ sources — recoverable ONLY because sources
existed: instrument bakes now get .bak mirrors like oracles). Pristine
receipts verified to the digit vs the first honest sweep and
COMMITTED with agree:false STANDING as ADJUDICATED-MISFIRE (FALSE-0
analog — never read as a print defect; the §D assert needs a
raised-rear-deck guard, filed). HOLDS LIFTED registration-only:
builders verify presentation in their first pair renders; yawOffset
map fixes on request from my lane. Interpen flags on all seven AW
prints = the sunk-turret print class (§B7 caps; vladimir batch-50
kin). Seven receipts land this commit (k2, amx40, k1a1, t90, t90ms,
t90a_burlak, type99a) + type90's v2-oracle receipt.

## 5.50 AW REST-POSE-REAR TURRET CONVENTION + REGISTRATION FIX
(2026-08-08): the t90-family builder verified IN HARNESS MASKS (gate
pair at load 10.4) that the three russia AW prints' TURRET CLUSTERS
present ~180 reversed while hulls present forward-correct (antenna
seats reading at mirrored z; flip center ~= ring z +0.45..0.47) — the
AW game-rig convention authors turrets at rest facing REAR. This also
explains the §5.49 assert soup (gun-sign reads). FIX APPLIED (my
lane): yawOffset Math.PI on t90/t90ms/t90a_burlak rows in all three
harness maps + vertex REG (perl edits grep-verified 1/1/1 per file
per id). Other AW prints (k2/k1a1/type99a/amx40) NOT changed — their
builders verify presentation per §5.49 and message evidence if
reversed. RULINGS relayed to the builder: burlak width-normalization
(±2.04 cheek modules shrink the hull read to 3.55 vs 3.78) = §B7
PACKET CAP (no named-width mechanism in the harness; do not warp the
print); burlak overallLengthM 9.76 honest-variant = ASK-OWNER banked,
builder may set 9.76 with the ask note (spec-sovereignty ratification
at landing). Baselines x1 landed honest (t90 20.1 / t90ms 16.8 /
burlak 0-capped, floaters 100 all); 14 graduates verified EXACT
mid-round. NOTE: this relay was MISDELIVERED to the owner's parallel
camo/UI session and returned verbatim — cross-session relay routing
is a known hazard; builders should SendMessage the orchestrator
directly, not rely on relays.

## 5.51 TYPE99A ROUND DELIVERED + TWO RULINGS (2026-08-08): re-list +
full print-loft rebuild delivered uncommitted at 8d13f030 (r1 min 0 ->
r7 hull 17.7 / whole 25.4 / turret 29.7 / stations 71.3 / dims 0 /
floaters 100, x2 both ends; battery clean; residents byte-match HEAD;
leo2a4 delta = leopard-lane WIP, expected). Presentation NOT reversed
— no yawOffset on 99a rows (the AW rest-pose-rear convention is NOT
uniform across the series; §5.50 applies to the russia trio only).
Identity critic SPAWNED. RULINGS on its two asks: (1) heightM DATUM
2.37 -> 2.86 APPROVED-WITH-ASK (t14 precedent: p95-envelope datum
incl. mandatory tower+MG; receipt +55.7%; applies AT LANDING with
re-gate x2; ASK-OWNER banked — revert to 2.37 on owner's word); (2)
§E batch-51 QUEUED (99a print: Object_29 turret-handrail strand
excision ~196 verts y>2.05, worth ~-25/-30 both hull rows + the
warp menu body x1.062 / gun -0.21 / roof-mast band — §5.28 type90
pattern) — SANITY GATE per §5.39 + §5.49 laws: warp targets checked
vs the real ZTZ-99A published profile + raw-vertex tells BEFORE
execution; .bak mirror BEFORE any byte surgery (quarantined
instrument class).

## 5.52 TYPE99A RATIFIED + LANDED (2026-08-08): identity critic PASS
9.05 at 8d13f030 (14 fresh pairs, garage-weighted; §H.4 acid
unambiguous; arrow glacis reads as a true arrow with the tip law
honored; per-view floor 8.8 = the front-ortho camo-flattened seam,
banked). Landed with the §5.51 APPROVED datum heightM 2.37->2.86
(re-gate x2 bit-identical: min 0->17.7, dims 0->87.5) — the id is
MEASURABLE and laddering (§E batch-51 menu = the next rungs).
POLISH BANK (next 99a touch): D1 unditching-log tone -> dark
wood-brown (loud at the garage default pose), D2 arrow-seam
catch-light strips for pure front ortho, D3 basket rim -0.02. Owner's
"fully model a custom type99a" order: EXECUTED (re-list + print-loft
rebuild + dual verification). Fleet line read 23/93 mid-window — a
parallel battery landed a pass; reconcile at its landing.

## 5.46-PROVEN (2026-08-08): Sources print-catalog pixel evidence PASS
both views (dev + VITE_PUBLIC_BUILD=1): 18 PRINT-ribboned cards, print
selection renders the actual print on the pedestal with VIEW ONLY
plate + CC-BY credit + no equipment/camo, forced BATTLE click leaves
the garage intact (no battle entry), public Sources = all 22 shipped
actual-tank models (4 playable prints + 18 print cards; newc_tiger =
the delisted 5th playable, standing ask). Shots shots/print531b/
(x6). Census: dev Cold War 21 / Modern 50 / WWII 23 / Sources 30;
public 22/53/27/22 — the era groups carry the flipped customs. Tool
note: the shots rig now freezes HMR (a mid-capture vite reload from a
sibling lane killed run 1 — live-tree hazard, tmp-tool-only fix).

## 5.54 BRADLEY GRADUATED — 28th (2026-08-08): visual half PASS floor
9.0 / mean 9.16 x14 at freeze-verified 90a5568c (critic battery:
trough-run, KOREA-cohabitation audited clean — buildBradley outside
every WIP hunk, hash EXACT through it; rig parity yawProxy <=2.1
except rear 8 under the abort gate; both enclosed-void flags
adjudicated benign in pixels). Dual gate complete (geometry landed
81bdad1). Dress-tier bank (7 items, none <9.0) recorded in §3. The
critic's m2a2_bradley override row in tmp-tank-critic.html already
landed via §5.50 (attributed).

## 5.55 LEOPARD SOURCEFIX RATIFIED + LANDED (2026-08-08): critic PASS
both — proto 9.3 (unskirted early hull lands completely: 7 dual
roadwheels + 4 return rollers countable with real daylight; PT turret
with stereo-rangefinder blisters; cast mantlet fills the front; the
blanked OWS ring reads deliberate), leo2a4 9.2 (blunt-brick plan —
the dart is dead; EMES-15 recessed at the right front corner; 3+6
skirt census exact with 7 wheel arcs countable; the owner's
"counted zero wheels" fixed with real geometry). §5.18 bellies hold
both; §5.16 family grammar held with no borrowed type90 fittings.
Hashes landed: proto 4f6360fe, leo2a4 b68e42c2; graduates byte-held
throughout (leo2a5/leo2a6/kf51/revolution). The owner's "they dont
match their source material at all" is answered in the garage.
leo2a4 = FALSE-0/no-oracle (no ledger row); proto row unchanged
(0-capped, hull 48.7 inside it). RCWS ASK stands (§5.48).

## 5.53 TURRET-REST-YAW INSTRUMENT (WIP, knob DORMANT): the §5.50
scene yawOffset was proven NULLIFIED for the AW trio (t90-family
builder's mask evidence: turret rows value-identical pre/post, ref
guns over engine decks in the board strips) — line ~2357 rotates the
WHOLE SCENE and hull re-registration cancels it (amx30 class). A
turret-LOCAL rest-yaw knob (cfg.turretRestYaw + turretRestYawCenter)
was added to modelLoader (§5.53 block, pre-pivot, world-frame
parent-inverse composition) but BOTH activation attempts CRATERED t90
(hull 67.5->0, ref masks sunk, side_hull cover 3.76% — the transform
chain scatters through the re-bakes' baked node frames, suspect scale
in the chain; bbox-center axis also rear-biased vs the builder's
measured flip center z+0.46). Two-strikes rule (§5.49): rows REVERTED
to the known-scoring state (t90 24.9 verified restored; no yaw keys
on the trio), the knob lands DORMANT (opt-in, no print carries it),
and a FOCUSED INSTRUMENT ROUND spawns with the full evidence chain +
the blender-source alternative (rotate the cluster at obj2glb time —
the amx30 source-cure precedent). The t90-trio identity critic HOLDS
until the instrument fix (reversed ref strips would poison pair
scoring); turret/station/whole rows for the trio stay
presentation-capped and documented.

## 5.56 SEPV2 ECHO-DELETION RATIFIED + RE-FROZEN (2026-08-08): the
§5.34 chain is COMPLETE — works echo deleted (-52/+15, -6588 verts),
gate recovered FALSE-0 -> 64.6 x2 exactly as predicted (hull +69.5,
whole +47.3, turret +59.1), re-cert PASS 9.2-9.4 across all 10
changed views with the builder's evidence BYTE-AUTHENTICATED (critic's
34 own shots byte-identical to the builder's after-set), yaw90 arc
ruled "the first honest sweep" (the echo had been visually colliding
with the shell). §3 re-frozen 54b35994. FALSE-0 annotation RETIRED
for sepv2 — the row is honest geometry now. Critic tmp tools deleted
at landing.

## 5.57 TYPE90 LADDER RATIFIED + LANDED (2026-08-08): identity critic
PASS 9.3 — THE OWNER'S DEFECT IS DEAD, quantified twice (turret-band
fraction front 0.281 proc vs 0.268 ref, side 0.203 vs 0.194;
cross-family garage math: type90 = 0.940 x proto silhouette height =
the real-dims 2.34/2.49 ratio EXACTLY). §5.16 mantlet order executed
in pixels (recessed well, stepped collar, bore low-in-face). Gate
45.1 -> 68.9 landed (stations 93.6 PASS, dims 100; turret 68.9 =
crown-band dims-datum cap + chin-band warp receipts). Hash 741352c4
-> b9182ad4. Round law-bank: HALF-PHASE LERP law + STATION END-CAP
physics + three-bin crown allocation (in the packet R7). UNLOCKS
QUEUED (my lane): §D type90 heightM datum reconciliation (2.34 roof
vs published-3.05-over-sights class) + §E chin-knee revision
(pre-warp 25mm receipt). Dressing bank (next touch): basket lattice,
cheek chamfers, dead-front slab.

## 5.58 M45 GRADUATED — 29th (2026-08-08): sitting-2 PASS floor 9.0 /
mean 9.13 x14 at 53caa687 (triple-bracketed through seven foreign
landings). Order 1 verified in pixels (slab facet family GONE in all
10 carrier views; crown = the m26-r2 anchor grade; hwL asymmetry
survived the re-emit). Order 2 adjudicated RING-CLASS at the correct
station — pixel-blend registration: outboard faces coincide ~6cm,
hinge+lids at the ordered -0.765; the Ø0.57/x-0.65 deviation is
measured-compliant (the ordered literal gates 88.4 by receipt; drum
prominence is measured-impossible under the dual gate — certified
silhouette-tax residual recorded beside the r3 close entry in the
packet). FLEET 23/90 PASSING. Patton lane FREES -> m48 build spawns
(m60a1 + m47 turret grammar donors, §5.45 queue). Round law-bank
already landed §5.41 (workorder-flip, registration-sliver); both
sitting tmp drivers swept at landing.

## 5.59 KOREA DELIVERED + K2 FOLLOWER FIX (2026-08-08): k2 rebuilt to
print lines (48d0f7e — arrowhead turret, KAPS/KSPAW flush cheek-plane
device, dims 0->100 via the p95-spike census) + k1a1 NEW (2e210838 —
baby-Abrams identity, presentation PASS no-flip dAlong 0.000, min
46.2->54.8, dims 100). k2's capped rows = REF partition defects
(numpy receipts): Object_22 carries glacis material (was in the
turret mask), Object_23's turret-roof rails were misfiled hull-side.
FOLLOWER FIX APPLIED (my lane, three maps): 22 OUT / 23 IN — forecast
70-85 band; agent re-gating x2 both ids; identity critic spawns on
its numbers. m48 NEW BUILD SPAWNED (patton lane freed by the m45
graduation; §5.45 queue — m60a1+m47 donors, atmodeler print oracle).

## 5.59a K2 FOLLOWER SWAP DISPROVEN BY MEASUREMENT — REVERTED
(2026-08-08): the §5.59 swap (22 out/23 in) cratered side_hull
42.7->24.6 while plan/front hull gained — BOTH nodes are MIXED
hull+turret materials; follower assignment only picks which mask eats
the foreign half (config A strictly better on every moved row,
x2-exact pairs both configs). Maps REVERTED to config A (grep 1/1/1);
agent restoring the config-A ledger record. ADOPTED: the §E unlock —
BATCH-52 queued (k2 print: bake-strip Object_23 entirely [301 verts:
tow strips + three turret-roof rail clusters, receipts in k2.md] +
split Object_22's sub-1.7 glacis/skirt band keeping the cheek-armor
top as follower; forecast side/front hull -> 70-85 band + first
honest turret read; §5.39/§5.49 sanity gates + .bak). LESSON
(follower-law addendum): mixed-material nodes cannot be mask-assigned
correctly — measure BOTH configs before ratifying any follower change,
or go straight to §E when receipts show mixed bands.

## 5.60 §5.50/§5.53 RETRACTED — THE TRIO WAS NEVER REVERSED
(2026-08-08, instrument round verdict with accessor-bound receipts):
all three prints are FORWARD-CORRECT in their bytes (t90/t90ms/burlak
landmarks all correct-facing; no scales, no matrices — every §5.53
suspect disproven; k1a1 re-verified clean too). THE PHANTOM CHAIN:
(1) my §5.50 scene-yawOffset rows went LIVE before the t90-family
builder measured — its "turret reversed" mask evidence read the
artifact MY fix created; (2) the §5.53 knob's math was EXACT but a
rearward-pointing gun trips procedural-fidelity's rear-facing-gun
AUTO-FLIP (line ~534: ref root += PI) — the whole ref presented
hull-reversed = the crater signature, "sunk masks" were probes of the
flipped root. At HEAD refRootYaw=0 all three; presentation CLEAN; the
trio's capped rows are ORDINARY build-vs-print deltas (russia-lane
ladder work: t90 turret p95 13.3% antenna/roof cols, t90ms bustle-cage
plan footprint, burlak plan footprint + §B7 width + dims-75
proc-vs-published). LANDED: t90ms vertex REG over-strip repaired
(gunNode/autoPivot restored), the swallowed temp hook removed from
procedural-fidelity (4665869 had swept it — §5.44a class), loader
§5.53 block comment true-up (knob stays dormant, code byte-unchanged).
Acceptance x2 at knob-off matches the ledger exactly (t90 24.9 /
t90ms 11.7 / burlak 0). TRIO CRITIC HOLD LIFTED. LESSON (§5.60 law):
when a fix's evidence was gathered while an earlier fix was live,
re-verify the ORIGINAL state before chaining — a fix can manufacture
the artifact the next fix chases; and know the harness's own
auto-behaviors (the rear-gun auto-flip) before interpreting masks.

## 5.61 KOREA CRITIC: BOTH FAIL — FIX ROUND DISPATCHED (2026-08-08):
k2 6.8 / k1a1 6.4 vs the 9.0 bar (hygiene passed: yaw90 unity,
no-air, bore, massing skeletons; identity failed: TURRET-HULL FUSION
the killer on both — flush walls read as casemate slabs; roof kit
underscaled to invisibility under the height caps; wheels buried;
vertical bows; k1a1 inverted rotor + solid baskets; k2 placeholder
fins + decal-flat KAPS; family distinctness weak-fail with the
fleet's own m1a1 as the existence proof). Builder resumed with the
critic's five ordered fixes; fresh sitting on new hashes at delivery.
Batch-52 (k2 print surgery) may run in parallel — the builder is
briefed to re-baseline through it. The bar is the bar: two §5.38
tanks failing critics is the process WORKING (§K).

## 5.62 KOREA FIX ROUND DELIVERED — SITTING 2 SPAWNED (2026-08-08):
all six §5.61 orders built at k2 27c330c3 / k1a1 53b64e74, gates
hold-or-improve x2 (k2 stations +8.7 from the print's-own rising
bustle underside; k1a1 whole +1.6, turret +0.2), guards x7 held incl.
frozen bradley, batch-52 confirmed NOT yet landed (k2 GLB md5
unchanged — every row move is build-side). Measured revert receipt
banked (smoke at |x|1.77 paid -7 front_whole vs the fender lane ->
tucked 1.61). NEW ASK-OWNER: k1a1 K6-on-cupola is dims-law-blocked
(receiver 0.26 over the 2.21 roof kills the 2.25 p95) — low-mount law
applied; owner may trade heightM grace for the cupola-mounted read.

## 5.63 AMX40 RATIFIED + LANDED (2026-08-08): identity critic PASS
9.2 — "reads as the Satory demonstrator at the fleet's ratified bar";
every identity item census-confirmed (underbite beak, 45-degree ramp
drums, one-plane front-left sweep + two-facet right cheek +
right-deep bustle, LLLTV/F2 stations measured in-frame, bore 6.644 =
overall 10.044 +0.04%); §J yaw-90 closed in pixels; two false alarms
run down and cleared by census (camera-tilt leak + the critic's own
px/m error — the adversarial process working). Hash 25633150; row
38.6 lands cap-documented (print optics tower 2.43-3.09 + rod masts
over the 2.38 published roof — the §E knee-2.39 normalize is FILED
and now UNBLOCKED in the orchestrator queue; t90m batch-23 precedent
forecasts the 64->90-class arc). france.js module goes live (stub ->
full resident). Wave score: type99a landed, amx40 landed, type90
landed; k2/k1a1 in sitting 2; t90 trio critic scoring.

## 5.64 T90 TRIO CRITIC: ALL THREE FAIL — FIX ROUND DISPATCHED
(2026-08-08): t90 7.0 / t90ms 6.5 / burlak 6.5 vs the 9.0 bar
(hygiene clean x3, identity short on 17 measurable defects — verdict
doc docs/critique/shaded-parity-t90fam-trio.md). Headliners: §5.29
chevrons authored as WIRE RAILS not panel banks (law candidate:
chevron orders carry a plan-footprint number); shared egg turret plan
across three marks; floating glacis ERA shelves w/ blue untinted
cells; t90ms slat cage inset as a louver grille (law candidate: slat
orders specify STAND-OFF geometry); burlak bustle proportion INVERTED
(2.4-2.6m vs the print's 1.9m magazine). Builder resumed with the
full order set + return-path pin (three prior reports misrouted to
the owner's parallel session). Landing HOLDS; fresh sitting on new
hashes. Wave ledger: 3 landed (type99a/type90/amx40), 5 in fix
rounds (k2/k1a1 sitting-2 pending, trio fixing).

## 5.65 KOREA RATIFIED + LANDED (2026-08-08): sitting 2 PASS both —
k2 9.0 / k1a1 9.1 (from 6.8/6.4; all six §5.61 orders KILLED in real
geometry: fusion carved with shadow gaps + the m1a1-comparator
standard met, roof kit massed within caps, receding bows, k1a1's
defining 3-step rotor + proud smoke + open pipe-frame racks, k2's
faceted KAPS relief). Hashes k2 27c330c3 / k1a1 53b64e74; rows land
(k2 38.8 cap-documented pending batch-52; k1a1 61.5). k2 RE-LISTED +
k1a1 NEW both live in modern3.js. §5.38 WAVE: FIVE LANDED (type99a,
type90, amx40, k2, k1a1) + the t90 trio in its fix round. BATCH-52
UNBLOCKED (k2 print surgery — §E queue). RESIDUAL BANK (next density
round): skirt hems ~2x deeper than the prints' on both (wheel
glance-read + likely side-row gains), k2 K6/pano scale pending the
§5.62 heightM-grace ASK, k2 plan margin 86% vs print 82%.

## 5.66 BATCH-52 NEGATIVE RECEIPT — REVERTED ON THE STATIONS CLAUSE
(2026-08-08): the k2 print surgery executed with full law compliance
(.bak first, byte-derived sanity, idempotence x2, accessor bounds
rebuilt, authored as a proper disarmed REPAIRS batch) and DELIVERED
ITS FORECAST on the target rows (hull 38.8->56.3, front_hull ->74.64,
plan_turret cover deficit cleared) — but stations 50.5->41.7
regressed and turret held 0, so the agent RESTORED pristine
(4d6d7db3 verified) and disarmed the recipe. TWO ROOT CAUSES (byte
receipts in k2.md §E): (1) LADDER-ANCHOR COUPLING — the Korea r7
build anchored its front-half skirts at ±1.80 = the exact Object_22
band the excision removes (the print's true run is ±1.72-class);
(2) SECOND CARRIER — Object_19 (the GUN node) contains the left
roadwheel/suspension colonnade (252 comps, six stacks at 0.9 pitch)
= the refBot -2.0 in both states' worst rows; §5.59a's 22+23 scope
could never open the side row alone. BATCH-52b QUEUED as a COUPLED
landing: re-arm + Object_19 colonnade excision + Korea-lane skirt
de-ladder to ±1.72, ONE landing -> then 70-85 + the honest turret
read. TWO LAW CANDIDATES ADOPTED: ladder-anchor provenance check
before any §E excision; full-cluster census before partition batches.
NEW §E OPS BANKED (in repair_oracles.py, reusable): _detach_child_node
(vladimir-class) + _index_surgery rebuild_bounds opt-in (GLTFLoader
seeds bounds from accessor min/max — load-bearing). Load-deviation
note: the <15 trough never arrived (owner QA fleet at ~21 for 8h) —
x2 bit-identity carried the acceptance instead, all four runs exact.

## 5.67 BATCH-52b LANDED — K2 UNLOCKED (2026-08-08): the coupled
landing succeeded on every acceptance row x2 (hull 38.8->56.1,
front_hull ->76.26, TURRET 0->52.8 = the first honest read proving
the Object_19 colonnade was the §5.66 second carrier, stations
50.5->53.2 — the de-ladder cured the regression AND gained, dims 100
robust after the in-scope KGPS 2.40-datum re-tune). MD5 chain: print
4d6d7db3 -> 7b3a76e9 idempotent x3, .bak pristine; recipe stays
ARMED. Build k2 27c330c3 -> 2ac112a8 (skirts print-true ±1.72,
§5.65 hems executed — wheels read below the hems in both halves).
Guards x8 held, npm 265 green x2. §5.66's two law candidates PROVEN
in practice (full-cluster census found no fourth carrier;
ladder-anchor provenance drove the de-ladder). NEXT (Korea lane):
the k2 90-ladder vs the opened rows (side_whole 48.4 floor = the §B7
pano/mast band -> the banked antenna y-warp is the next print move)
+ the density critic on the §5.65 residuals.

## 5.68 M48 RATIFIED + LANDED (2026-08-08): identity critic PASS 9.15
— boat-bow + egg-dome + Urdan-config A5 unmistakable in the fleet's
densest family (exemplary §B8: the critic REJECTED a pre-existing
shot set as self-reads and reshot everything). Hash 6dd253b0; row
lands 0-capped honest (whole/turret = the unrepaired print's 12.6
pitched tube+shield — §E TUBE-LEVEL batch queued from the packet's
worked _region_pitch recipe + the critic's stern grille-door
suggestion rides it). §5.31b ARC COMPLETE for m48 (MODEL_SOURCE
flipped procedural + candidateGlb — our custom renders everywhere;
the no-builder queue is now t44+type59 only). FLEET LAW LANDED:
WIDTH-CARRIER (buildRunningGear ring-span authored past W/2 silently
rescaled the whole build x0.9921 for five rounds — §F.2 endRingSpan
opt-in in tankFactory, byte-identical default guard-proven) + the
flat-deck slice-paint parity opt-in + three more in m48.md for
BUILD-STANDARD folding. userdrops7 lands BOTH lanes' hunks with
attribution (m48 dims 6.42->6.87 two-source correction + the trio's
round-verified §5.38 spec rows — §5.44 precedent; if trio sitting-2
orders spec changes, a follow-up edits them). ASK-OWNER added: m48
heightM datum (print = low-cupola A5 crown 2.718 vs the 3.09
M1-periscope row — the §E tube-level projection ~80s needs the
ruling for graduation).

## 5.69 T90 TRIO RATIFIED + LANDED — THE §5.38 WAVE IS COMPLETE
(2026-08-08): sitting 2 PASS x3 (9.0/9.0/9.0 from 7.0/6.5/6.5; min
views 8.5; all 17 defects dead in the critic's own pixels — real
panel-bank chevrons x3, three distinct plan grammars, seated
plate-true glacis ERA, stand-off slat lattice, burlak bustle
hierarchy MEASURED 1.68m vs casting 3.05m; both ordered trades
verified to the decimal and not penalized). Hashes land: t90
fe57fdf4 / t90ms a8aceea0 / t90a_burlak 8ef4d428; rows 29.8 / 20.7 /
0-capped. TWO LAWS RATIFIED (validated across both sittings):
CHEVRON-PLAN-FOOTPRINT (chevron orders carry a plan-area number, not
just a tip line) + GRILLE-INSET SLAT FALSE-FRIEND (slat orders
specify STAND-OFF geometry with open air behind). ALL SEVEN §5.38
OWNER-WAVE TANKS ARE NOW LANDED + INDEPENDENTLY RATIFIED: k2 9.0,
type99a 9.05, k1a1 9.1, m48 9.15, amx40 9.2, type90 9.3, t90 9.0,
t90ms 9.0, t90a_burlak 9.0 (nine builds from seven drops — type90
rode the wave's oracle fix). NEXT (russia lane): the trio turret
shape-ladder on the §5.60 worst-column receipts + t44+type59 builds
(t54 donors — the last §5.45 no-builder ids).

## 5.70 MISC LADDERS LANDED (2026-08-08): LECLERC 86.2 -> 90.3 GATE
PASS every component >=90 x2 bit-identical (hash 206c5fd1 ->
683be340) — FLEET 24/96; GRADUATION CRITIC SPAWNED (potential #30).
Five decoded batches incl. the rear-plate razor-anchor rescue
(hullLengthM 6.76-class caught) + the §5.14-era commander-well doc
claim TRUED (measured z_w 0.32..0.66). ARIETE 82.3 -> 83.1 (r3
ceiling broken via the print-band sleeve; new ceiling ~85-86; §E
nose/tube/basket print work = the 90 path, filed). AMX30 PAIR §5.36
ladder complete: floaters 0->100 both, dims 22.7/44.6 -> 99.4/98.1
(hashes e2a7ae50/3aeacbf9); curves capped by the decoded TALL-HULL
PRINT CLASS (print deck 1.68/roof 2.9 vs pub 2.29) — §E y-normalize
escalation joins the queue. INCIDENT BANKED (amx30 packet): a
first-match perl edit transiently hit type74's identical L7 gun line
— caught by the hash battery, reverted byte-exact; LAW: shared-line
edits anchor on unique context, and the guard battery is the net.
Guards held on final bytes (type90 b9182ad4 / type74 7ba404c5 / t80u
af5e3ad9); leclerc track-clip 14/0 BETTER than its certified 24.

## 5.71 LECLERC GRADUATED — 30th (2026-08-08): the §K exemplar tank
completes its dual gate — 90.3 x2 every component >=90 (§5.70) +
graduation floor 9.0 / mean 9.17 x14 at freeze-verified 683be340
(rig pixel-identical to the Aug-6 certified adjudication; every
ladder-touched region adjudicated artifact-free: wrap fills read as
fender assemblies, the drop strip as skirt hardware, gun dead-center
in plan). 30 GRADUATES; FLEET 24/96. The §5.33 campaign's proven
routes continue: ariete §E path (~85-86 ceiling -> print work),
amx30-pair y-normalize, the trio turret ladder (live), k2 ladder vs
the 52b-opened rows, m48 tube-level, type99a §E menu.

## 5.72 TRIO TURRET LADDER LANDED (2026-08-08): t90 29.8->47.8 (st
+35.4), t90ms 20.7->52.5 (the -4.8 stations trade REPAID at 74.7),
burlak 0->8.6 w/ dims 75->88.3 honest (whip-rough re-class) — x2
bit-identical, hold-or-improve every component, guards x14, identity
self-checked byte-visible vs the ratified §5.64 reads (one hem
regression caught + reverted in-round). Hashes: t90 72104d14, t90ms
034e1bac, burlak d588df50. THREE LAW CANDIDATES banked in the
packets: heightM p95 spike-budget arithmetic (<=3 over-court columns,
fittings can silently hold slots), mid-window station blindness to
axis-aligned boxes, the t90ms +0.35 turret-seat class (check
cluster-vs-hull seat before per-column chases). Next trio rungs are
print-side (§B7 caps + the k2-class §E menu); russia lane FREES ->
t44+type59 builds spawn (the last §5.45 no-builder ids).

## 5.73 OWNER RULINGS (2026-08-08, interactive session):
1. HEIGHT-DATUM LAW RATIFIED FLEET-WIDE: heightM = the P95 ENVELOPE
including mandatory roof kit (t14/type99a precedent made law).
type99a 2.86 CONFIRMED. APPLICATIONS QUEUED: type90 datum round
(misc lane, receipts-derived envelope value — unlocks the §5.57
crown-band cap), m48 datum (rides its §E tube-level landing), k1a1
K6-to-cupola + datum (queued behind the k2 ladder, modern3 lane).
2. AW-SERIES PROVENANCE: KEEP as local-only measurement references —
standing state confirmed, ask closed.
3. LEOPARD RCWS: RESTORE on leopard2_proto + leo2a4 (owner overrides
the historical default — §5.09 stands for ALL leopards). Round
spawned: uncomment both calls, gate x2 hold-or-improve, re-cert
critic follows (changes ratified reads).
4. BURLAK 9.76 CONFIRMED + NEW ORDER: "update our previous t90s to
adhere to these new measurements and centering for consistency" —
the older t90 marks (t90a/t90m/t90sm/vladimir incl. GRADUATES) get
the honest-variant measurement approach + the §5.72 cluster-seat
centering law; graduate-change chains per frozen tank; QUEUED behind
t44/type59 in the russia lane.
DISMISSED-PENDING (owner: "wait for next instruction" — NO ACTION):
m45 6.6->6.47 row, newc_tiger era filing, AFV-stats meaning, Sources
cards view-only-vs-playable. All stay at current defaults.

## 5.74 OWNER ORDER — M1A2 LEGACY RETIREMENT + ABRAMS DISTINCTIVENESS
ROUND (2026-08-08): "its time to retire this m1a2 (dont show it,
clearly mark as legacy), but analyze all of its decorations, add ons,
armor, era, and roof decorations, and apply them to sepv2, sepv3,
tusk, and new m1a2 abrams to make them much more visually distinct
based on different equipment types and passive era blocks on turret
and sides of hull and so on and grass to cover stuff on the sepv3
and even more massive crows automated machine gun systems on the
top." EXECUTED NOW: m1a2 carousel-DELISTED (garage.js DELISTED set,
newc_pziii precedent — stays tech-tree selectable) + spec name
"M1A2 (Legacy)" (the mark travels everywhere the id still shows).
QUEUED (abrams lane, BEHIND the live flank-panel round — builds on
the pitched panels): the DISTINCTIVENESS ROUND — harvest the legacy
m1a2 build's full kit inventory (works-field stowage grammar, ERA,
roof kit) and redistribute as per-variant identity packages: sepv2 =
elevated-CROWS signature + one ERA flavor, sepv3 = ADL/IFLIR + GRASS/
FOLIAGE cover + its own package, tusk = ARAT-side ERA + loader shield
emphasis, tejas/new-M1A2 = its own clean package; ALL FOUR get
MORE-MASSIVE CROWS RWS on top (P95-envelope datum law §5.73-1 covers
the height). Coordinated graduate-change wave (sepv2 54b35994 /
tusk b1786e4c / tejas f7510d88 / m1a1-siblings byte-guarded; sepv3
2c9023d0 binding) — re-cert critics + re-freeze wave at landing.

## 5.75 OWNER ORDER — PROFILE-MODULE CONSISTENCY REFACTOR
(2026-08-08): "make some more profile modules for tanks like t90,
t72, t80, challengers, and so on to be consistent." PLAN: one family
per module, PURE REFACTOR LAW = byte-identical tmp-hashgeo for every
moved id (the guard battery IS the proof; zero geometry change).
SPLITS: russia.js -> profiles/t90.js (t90/t90a/t90m/t90sm/vladimir/
t90ms/t90a_burlak/pt91m) + profiles/t72.js (t72b_1987/t72bu/t72b3m)
+ profiles/t80.js (t80/t80b/t80bv/t84) + the t62/t64 residue stays
russia.js (or soviet-mid.js if clean); challengers -> NEW
profiles/challenger.js consolidating challenger1 (from uk.js) +
challenger2/challenger_3 (from modern1.js); "and so on" = the
standing principle for future splits (korea/china candidates noted).
Each split: move builders + shared russia helpers stay importable
(kit.js pattern), export <FAMILY>_PROFILES, wire profiledProcedurals
imports, hash-prove EVERY moved id byte-identical, npm test.
SEQUENCE: challenger module NOW (uk.js+modern1.js free); russia
splits AFTER t44/type59 lands, THEN §5.73-4 (t90-family measurement
consistency) works in the fresh t90.js.

## 5.75a CHALLENGER MODULE EXECUTED (2026-08-08): profiles/
challenger.js (2188 lines) consolidates challenger1 (ex-uk.js,
profiles-class) + challenger2/challenger_3 (ex-modern1.js,
modern-class spec+build) — PURE-REFACTOR LAW satisfied: 15/15 ids
byte-identical before/after (incl. FROZEN centurion3 bad74e60 +
challenger1 5bf5f2ec), ALL_TANK_IDS roster order JSON-identical (the
new module re-inserts at indexOf('merkava4') preserving carousel
order), helpers stay owned by their original files and exported
(never duplicated), npm test x3 green. russia splits (t90/t72/t80)
remain sequenced behind t44/type59 per §5.75.

## 5.76 LEOPARD RCWS RESTORED + LANDED (2026-08-08, §5.73-3): both
calls re-enabled — a4 verbatim (clash-checked clean vs the §5.55
blunt-brick roof), proto with ONE elegant re-seat (the blanked-OWS
ring stand-in became the station's visible MOUNT FLANGE — the
ratified "deliberate ring" read survives as the annulus). §5.09 read
verified in pixels (full FLW anatomy ~0.6m over the a4 roof; squat
station + 2.78w tower on proto); CROWS-FORWARD by construction; §B5
yaw90 unity; ratified §5.55 reads survive BOTH. Proto gate x2: hull
48.7->48.9 IMPROVED, dims 100 held. Builder candidate hashes were proto
d900c8e2 / a4 8fb73bdd (final coupled hashes corrected in §5.78).
leo2a4 heightM 2.48->3.03 APPLIED (P95 law: the FLW band
owns p95Top 3.020 — band-class not spike; m26/type99a precedent).
Guards x3 sweeps EXACT (incl. leo2a7v/leo1a5 siblings). RE-CERT
completed in §5.78; the candidate hashes printed here were corrected
there to the hashes of the actual coupled landing.

## 5.77 TYPE90 DATUM APPLIED — 68.9 -> 79.5 (2026-08-08, §5.73-1):
heightM 2.34 -> 2.55, derived AGAINST the naive 3.05 (a 1-2-column
max-spike over the swung M2 that the gate's antenna-robust p95
correctly excludes — spec'ing it would misdatum honest builds ~16%
low). 2.55 = the ratified 49-v2 oracle's own bodyHeightM through the
gate's dims replica (t14/type99a precedent flow; two-source bracket
2.34 roof < 2.55 p95-kit < 2.60 print max < 3.05 published max). The
§5.57 crown-band cap DISSOLVED: turret_side +10.6, front_whole 90.9,
dims 100 HELD at the new datum via an engineered p95 anchor. Hash
b9182ad4 -> 5d7bc85c x2; guards x6 exact; the ratified 9.3 low-flat
read SURVIVES (kit crowns went flush -> the real proud-ring class).
BRIEF-ERROR CAUGHT by the agent: my D1/D2/D3 dressing items were the
type99a critic's bank, not type90's — the real §5.57 bank (basket
lattice, cheek chamfers, dead-front slab) stays open; §E chin-knee is
now type90's biggest chaseable class. LESSON: brief-writing pulls
banks from the REGISTRY section named, not from memory.

## 5.78 LEOPARD RCWS RE-CERT RATIFIED + HASH RECORD CORRECTED
(2026-08-08): independent fresh sitting PASS x2 — leo2a4 floor 9.1 /
mean 9.21, leopard2_proto floor 9.0 / mean 9.09 across 14 views each
(`shots/critic-leo-rcws/`; full verdict
docs/critique/shaded-parity-leopard-rcws-recert.md). §5.09 anatomy,
CROWS-FORWARD, §B5 yaw-90 unity, mount connection, and the full §5.55
source-fidelity reads all survive. Clean detached-HEAD verification
caught that §5.76's builder candidates were not the hashes of the final
coupled landing: authoritative hashes are proto **a9aba192** and a4
**41587e99**, reproduced both at detached acc0a48 and in the live tree;
the stale d900c8e2/8fb73bdd candidates are retired in both packets.
Frozen guards remain exact: leo2a5 e215a738 / leo2a6 09912270 / kf51
9ac547ac / revolution db70c929. No geometry changed in the correction.

## 5.79 ABRAMS FLANK-PANEL PITCH RE-CERTIFIED + RE-FROZEN
(2026-08-08, owner screenshot order): the shared tejas-family turret flank
bins/lips, CIP and radar faces, seam rails, rear pouch, and drum mounts now
follow the certified 16.9-degree tumblehome instead of standing vertically
off the angled shell. Two full seven-id gate runs were byte-identical; TUSK
reproduced a third time. dims/floaters 100 hold on every gate-able mark.
Independent fresh 14-view sittings PASS all six changed variants: graduate
floors/means m1a1 9.1/9.19, m1a1ha 9.1/9.19, tejas 9.1/9.22, sepv2
9.1/9.18; TUSK 9.0/9.13; false-0 SEPv3 identity 9.1/9.20. RE-FROZEN:
m1a1 **4e28ff40**, m1a1ha **99962364**, tejas **3afe65f0**, sepv2
**c5bfbb70**. Bindings: TUSK **bd371600**, SEPv3 **329ec520**. Retired
legacy m1a2 and abramsx remained hash- and pixel-exact (`636a4860` /
`2c6eb344`). Full verdict:
docs/critique/shaded-parity-abrams-panelpitch-recert.md. The §5.74
DISTINCTIVENESS round is now unblocked and begins from these pitched carriers.

## 5.80 ABRAMS DISTINCTIVENESS ROUND RATIFIED + RE-FROZEN
(2026-08-08, §5.74 owner order): the retired legacy M1A2 inventory has been
redistributed into four unmistakable current-mark packages on the certified
pitched carriers. Tejas/new-M1A2 is the clean ERA-free mark with a broad
unarmored CROWS, sustainment roll, and relay/tool case; TUSK carries the heavy
armored CROWS, strengthened loader shield, four ARAT-style turret panels per
flank, two-course hull ARAT and rear slat cage; SEPv2 carries the tallest
armored CROWS, one broad hull ERA course and four large passive turret slabs
per flank; SEPv3 carries the wide-low CROWS, 9x2 hull plus 5x2 turret micro-ERA,
ADL/IFLIR/Trophy, and deterministic physical olive foliage over the turret,
glacis, and side ERA. The retired `m1a2`, both CWS siblings, and `abramsx`
remain byte guards: **636a4860 / 4e28ff40 / 99962364 / 2c6eb344**.

§5.73-1 P95 DATUM APPLIED to the mandatory kit, replacing the old bare-roof
2.44 row: tejas measured 3.2441 -> heightM 3.24; TUSK 3.2748 -> 3.27; SEPv2
3.4265 -> 3.43; SEPv3 3.1009 -> 3.10. Two edited-tree hash batteries and two
gate sittings reproduced exactly. The resulting oracle rows are tejas 57.8
(91.7/57.8/63.3/91.9/100/100), TUSK 0
(14.7/0/39/23.1/100/100), and SEPv2 37.3
(69.4/37.3/53/73.2/100/100). These are NOT geometry PASSes: the lower mask
scores are the documented, owner-adjudicated divergence caused by mandatory
new CROWS/armor silhouettes plus the honest P95 datum; dims and floaters stay
100. SEPv3 remains FALSE-0 with no invented gate or ledger row.

Independent §B8 fresh sittings PASS all 56 views at >=9.0: tejas floor/mean
9.1/9.23, TUSK 9.1/9.26, SEPv2 9.2/9.31, SEPv3 9.0/9.20. RE-FROZEN:
tejas **01e698e8**, SEPv2 **a0a4e87c**. Bindings: TUSK **7620b020**,
SEPv3 **d6e87b0c**. No fix round ordered. Full verdict and exact score sheets:
docs/critique/shaded-parity-abrams-distinctiveness-recert.md. Fleet ledger
remains **24/96**; graduate count remains **30**.

## 5.81 K2 90-LADDER GRADUATED — 31st (2026-08-08): the Leclerc-method
rebuild closed from §5.67's 48.4 floor to a dual PASS. The final gate is
**90.1** x2 bit-identical: hull 90.6 / whole 90.1 / turret 90.6 / stations
90.7 / dims 95.9 / floaters 100. Geometry hash **827d5ffc** reproduced x2
(63 meshes / 115754 verts). Independent R26 §B8 PASS: all 14 views >=9.0,
floor 9.0 / mean 9.09. Exact track audit is band 8/36 and shoe 14/42;
contiguity 0, decor mg1+5d, turret parent 0/0/0. Batch-56 oracle recovery
reproduced **8d92cd1b8a7421548824ca22ba8d660d4dbeba579c666a3bb893faaa647a69f1**
twice from pristine `.bak` **3e514bedb40be0fde6787dad6513f625ba077cd0c1da04d29defe94e9c156140**.
Fleet is **25/96**; graduates **31**. Verdict:
docs/critique/shaded-parity-k2-graduation.md.

## 5.82 OWNER PRIORITY — LECLERC METHOD + ABRAMSX COMPLETE REDESIGN
(2026-08-08): the owner names Leclerc as the geometry/visual-comparison
standard for every unfinished tank, specifically Challenger 2, Challenger 3,
and all T-90s, then elevates AbramsX to the next full-redesign priority.
Codified in BUILD-STANDARD §K.1: connected-component/station measurements,
joined true-profile lofts, real asymmetry and gaps, P95-only axis
normalization, and fresh 14-view comparisons after meaningful changes.
AbramsX (`abramsx`, `buildAbramsX` in `profiles/abrams.js`) is REOPENED despite
its historical 9.2 re-cert: compare both local references
`community/abramsx-mortavex.glb` and `community-candidates/abrams_x_low_poly.glb`,
replace its geometry comprehensively, and certify from fresh evidence. It
runs immediately after K2 and ahead of K1A1/lower-priority cleanup. Frozen
**2c6eb344** remains the pre-redesign guard only.

## 5.83 ABRAMSX COMPLETE REDESIGN GRADUATED — 32nd (2026-08-09)

The owner-priority §5.82 rebuild is complete. AbramsX now uses the Leclerc
method end to end: connected-component inventory, exact source stations,
non-convex terraces/gaps, measured asymmetry, P95 mandatory-kit datum and a
fresh comparison after each material shape wave. Final gate x2 is identical:
**90.2** | 90.2/90.5/91.0/93.4/99.8/100. Freeze **fe7f9852** reproduced x2
(75 meshes / 161040 verts); oracle repair SHA-256
**01acf03c1027f08512a0bb7c04fa109b167a281fec0bea017b15638c1aec6816**
reproduced x2 from pristine `.bak`. Standard: clip 37/26, contig 0, mg1+5d;
turret-parent 0/0/0; fidelity 93.0; npm test green. Independent polish26
§B8 PASS: all 14 views >=9.0, floor 9.0 / mean 9.04. The old `2c6eb344`
guard is retired to history. Fleet is **26/96**; graduates **32**. Verdict:
docs/critique/shaded-parity-abramsx-redesign-graduation.md. The owner-priority
Leclerc-method lane now advances to Challenger 2, Challenger 3 and the T-90
family.

## 5.84 CHALLENGER 3 LECLERC-METHOD REDESIGN GRADUATED — 33rd
(2026-08-09)

The owner-priority Challenger 3 rebuild is complete and supersedes the earlier
CH1-base candidate. Source connected components and independent longitudinal
stations drove a joined low-shoulder hull, five-station Rheinmetall turret,
collapsed forward brow/lower cheeks, raked bustle, measured oval L55 jacket,
open RWS, large oval loader station, six non-overlapping wheels on measured
pitch, and a broad closed stern course with dense grille/guard layering.

Final gate x2 is bit-identical: **90.4** | 90.8/90.4/91.0/91.8/100/100.
Post-verdict freeze **2678f6c** reproduced x2 (60 meshes / 69,457 vertices).
Exact-tree fidelity is **91.52**, minimum view 91.50. Oracle SHA-256
**a5fcd8018279793fb62bf0ff97c25f110a3b43a2da714fc51138280b9cb35a25**
is bound to pristine `.bak`
**5eaa24a25e3c200b80ab7d1f8301d2ca8d6aed87137940**. Track exact is band
0/24 and shoes 0/38; turret-parent 0/0/0; winding reversed/mixed 0/0;
standard contiguity 0, mg1+5d; npm test green. Independent §B8 PASSes all
14 fresh pairs at floor **9.0**, mean **9.04**. Fleet is **27/96**;
graduates **33**. Verdict:
`docs/critique/shaded-parity-challenger3-graduation.md`. The owner-priority
Leclerc-method lane advances to Challenger 2, then the T-90 family.

## 5.85 CHALLENGER 2 LECLERC-METHOD REDESIGN GRADUATED — 34th
(2026-08-09)

The owner-priority Challenger 2 rebuild is complete and supersedes every
earlier FINISH/CH1-base candidate. Connected-component and station evidence
drove exact hull side profiles/plan bands, joined V-section bow and stern,
a closed three-band turret with separate brow/cassette undercuts, six deep
Hydrogas wheels, exact track runs, true single-lid roof grammar, open basket,
recessed stern/service structure and the complete L30/remote-station stack.

Final gate x2 is bit-identical: **90.1** |
90.1/90.3/90.3/91.1/93.8/100. Freeze **63ee160** reproduced x2
(42 meshes / 250,769 vertices). Direct-tree fidelity is **91.3**, minimum
whole view **93.31**. Exact track clip is band 0/0 and shoes 0/0; standard
contiguity 0, MG 1+1d; winding mode 1 reversed/mixed 0/0; npm test green.
Fresh independent §B8 PASSes all 14 pairs at floor **9.0**, mean **9.03**,
with zero browser/console errors. Oracle SHA-256
**d2e22673103353436517c1d17be38531b530b8936538f921d996a26fcfab5f3f**
is reproducible from pristine `.bak`
**1be3ef855ac9c441e38262a4ae26600d14c763c70c867024554499a451f9ad48**.

The closeout also codifies BUILD-STANDARD §K.4: source-exact visible fitting
groups may carry the normal marker/AABB contract when a generic constructor
would destroy certified variant geometry, and contiguity holes close with the
smallest real local hardpoint rather than broad mask paint. Generic MAG and
broad shoulder experiments both fell to 89.5 and were rejected; terminal
housings 88.2 and proud cassette growth 88.6 remain rejected. The parent and
yaw audit candidates were component-proved fixed driver/hull masses and are
documented false positives in the verdict.

Fleet is **28/96**; graduates **34**. Verdict:
`docs/critique/shaded-parity-challenger2-graduation.md`. The owner-priority
Leclerc-method lane now advances through the required T-44/Type 59 landing,
Russia pure-refactor split, then T-90-family measurement consistency and
complete redesign work in the fresh `t90.js`.

## 5.86 OWNER RECOVERY-BRANCH RECONCILIATION (2026-08-09)

All six named temporary branches were compared fragment-by-fragment against
current `main`; none was merged wholesale and none was deleted during this
accounting. Results:

- `codex/salvage-challenger2-followup` @ **e641e23** — **REJECTED / SAFE TO
  PRUNE**. It preserves the known ~89.5 generic-MAG/broad-fill intermediate.
  The measured replacement graduated at 90.1 as **e83207b / 63ee160**, so no
  code, gate row or ledger byte from the salvage commit is current.
- `codex/salvage-k2-geometry-evidence` @ **c304245** — **SUPERSEDED / SAFE TO
  PRUNE**. Its K2 row is 52.8 versus the landed 90.1 graduate row/freeze
  **827d5ffc**. Its only useful helper fragment, T-44/Type 59 critic override
  coverage, is already present in all current comparison helpers (main
  lineage **7fca27d**); the old row and generated ledger are rejected.
- `codex/salvage-provenance-tuning` @ **f741d73** — **REJECTED / SAFE TO
  PRUNE**. The two one-line experiments would undo the owner-ratified Leopard
  2A4 mandatory-RCWS P95 datum (3.03 -> 2.48) and shrink the Leopard prototype
  source-matched OWS flange (0.31 -> 0.20) without a gate/critic chain. The
  current §5.76/§5.78 values remain authoritative.
- `codex/salvage-tejas-critic` @ **46fba99** — **SUPERSEDED / SAFE TO PRUNE**.
  Its temporary proc-only Tejas capture page is replaced by the generic
  reference/procedural harness and the landed 56-view Abrams distinctiveness
  verdict (**fb5432b**); no shipping or evidence byte is missing.
- `codex/salvage-type99a-geometry` @ **3ea4efa** — **SUPERSEDED / SAFE TO
  PRUNE**. Its gate row is 0 and its 2.37 m datum is obsolete. The useful
  expanded follower registration already landed at **6a8c5f8**; re-onboarding,
  owner-ratified 2.86 m P95 datum and the current measurable 17.7 row landed
  at **c940272**. The salvage gate/ledger/profile deltas are rejected.
- `claude/festive-bell-2e3357` @ **5c76fae** — **PERFORMANCE-REJECTED / SAFE
  TO PRUNE**. Two untouched real-entry controls on e83207b completed with
  zero console errors, zero battle-open program births/freezes and battle-open
  p95 18.2 ms normal / 18.4 ms constrained. Applying the 22-line per-battle
  FX mini-volley made the first normal control DevTools-unresponsive past the
  180 s bound and fail at `Input.dispatchKeyEvent`; the patch was removed and
  `src/main.js` restored byte-clean. The pre-patch path already births zero
  programs in the judged ten-second window, so there is no benefit to trade
  for that regression.

No temporary branch was pruned here; this section is the requested durable
accept/reject accounting. All six listed branches are now safe for the owner
to prune.

## 5.87 OWNER TURRET-ATTACHMENT CLOSEOUT — CHALLENGER 3 + ABRAMSX (2026-08-09)

The owner's close-up Challenger screenshot reopened both graduates: a correct
outer envelope is insufficient when thin brackets disappear at garage range
and make roof hardware read as pieces suspended over the turret. The binding
rule is now explicit for these builds: intentional service openings may remain
inside a mechanism, but every sight, launcher, receiver, rail and equipment
case needs a visible continuous load path into the turret with no air seam at
its seat.

Challenger 3 now carries a half-buried Protector roof shoe, substantial fork
cheeks, a central receiver spine, rail/terminal-optic and outboard-sensor
brackets, plus armored backing shoes behind both five-tube smoke banks. AbramsX
now carries buried necks under raised D-hood sights and a continuous XM914
foundation, recoil spine and gun-right equipment foot. All additions are
turret-parented and overlap the certified shell/roof courses physically; the
open-cradle grammar remains only where real service space belongs.

Geometry gate x2 remains bit-identical to the graduation rows:
Challenger 3 **90.4** (90.8/90.4/91.0/91.8/100/100) and AbramsX **90.2**
(90.2/90.5/91.0/93.4/99.8/100). Standard-check passes both with contiguity 0
and mg1+5d; exact track receipts remain the pre-existing 0/24, shoes 0/38 for
Challenger 3 and 37/26, shoes 10/0 for AbramsX, with zero blind spots. `npm test`
is green. Independent §B8 fresh sittings pass every view: Challenger 3
floor **9.0**, mean **9.06**; AbramsX floor **9.0**, mean **9.09**. The first
Challenger evidence sitting correctly failed six invalid off-screen captures;
those six were recaptured individually at unchanged geometry and all fourteen
final files have distinct SHA-256 values.

Post-verdict freezes reproduce x2: Challenger 3 **b0c172a4** (60 meshes /
71,977 vertices) and AbramsX **d1dbfa2** (75 meshes / 162,372 vertices).
Verdict: `docs/critique/shaded-parity-turret-attachment-recert.md`; evidence:
`shots/critic-turret-attachment-closeout/{challenger_3,abramsx}/`. Graduate
count remains **34** and fleet remains **28/96**. The owner-priority lane now
advances to the complete harmonious T-90 family round.

## 5.88 RUSSIA FAMILY-MODULE PURE REFACTOR (2026-08-09)

The owner explicitly advanced the complete T-90 family immediately after the
§5.87 attachment closeout, superseding the older §5.75 T-44/Type 59 sequencing
clause for priority only. The §5.75 structural prerequisite itself is now
executed before any new T-90 geometry: `profiles/t90.js` owns T-90/T-90A/
T-90M/T-90SM/Vladimir/T-90MS/Burlak/PT-91M, `profiles/t72.js` owns the three
T-72 builders, `profiles/t80.js` owns T-80/T-80B/T-80BV/T-84, and the
T-62/T-64/T-54/T-44/Type 59 residue stays in `profiles/russia.js`. The assembly
map explicitly preserves the prior Russia roster key order.

PURE-REFACTOR proof against `main` at **4d36376** is byte-identical for all
fifteen moved ids (hash / meshes / vertices):

| Family | Receipts |
|---|---|
| T-90 | t90a `265610e2`/54/99,313; t90 `72104d14`/59/89,077; t90ms `034e1bac`/49/86,097; t90a_burlak `d588df50`/51/81,059; pt91m `2cf10e23`/50/93,280; t90sm `d98f27dc`/45/83,511; t90a_vladimir `bdfe7d24`/51/80,413; t90m `e345ee8a`/49/111,241 |
| T-72 | t72b_1987 `d62c8140`/42/62,453; t72b3m `175be954`/122/222,702; t72bu `68082d79`/41/60,749 |
| T-80 | t80 `578b7f08`/43/76,373; t80b `99393970`/43/77,477; t80bv `89769670`/43/78,905; t84 `04707a9c`/43/85,876 |

`npm test` is green. No geometry gate receipt, fleet count, graduation state or
freeze changes in this commit. The next commit may now change only T-90-family
geometry in the fresh module under the normal measurement/gate/critic laws.

## 5.89 CHALLENGER 2 FUSED HULL/TURRET REPAIR (2026-08-10)

The owner's garage screenshot proved that the Challenger 2 source's
material-based split had left a broad turret/casemate course in the fixed hull,
overlapping the real procedural turret and remaining behind at non-zero yaw.
The repair now classifies the raw fused primitive by connected component and
physical ring crossing: 572 components / 12,313 vertices / 14,546 triangles
move into `TurretParts`, while the actual hull remains in `HullParts`. The
procedural hull roof is rebuilt on the physical 1.55 m deck/ring datum rather
than the contaminated 2.07 m trace. A thin continuous ring landing is the only
fixed structure beneath the articulated shell; driver and rear-deck furniture
remain correctly hull-owned.

Two eight-centimetre seams between the centre bow strip and V-section
cross-loft were closed with a narrow profile-following bridge entirely inside
the existing glacis silhouette. This is structural closure, not a mask proxy:
standard contiguity moved 26 -> 0 while exact track clipping stayed 0/0 and the
geometry gate held at **90.1** x2 (hull 90.5 / whole 90.1 / turret 90.3 /
stations 91.8 / dims 93.1 / floaters 100). Turret-parent is 0 stranded / 0
abutting / 0 dangling; winding is 0 reversed / 0 mixed, 0 yaw candidates;
`npm test` is green.

Independent §B8 on `shots/critic-challenger2-fusedfix/` passes all fourteen
fresh views: floor **9.0**, mean **9.06**. The yaw/load-path read passes **9.3**:
the shell, gun, RWS, hatches, optics, smoke banks and bases rotate as one
assembly with no fixed duplicate mass, unsupported hardware or air seam.
Freeze **3b4bd5f0** reproduces x2 (42 meshes / 250,157 vertices). Repaired
oracle SHA-256 is `f44e3b46ee07a457b04fff6cdf8950f880a45fd22d952226e2ef16a4bd3c49ba`,
reproducible from pristine `.bak`
`1be3ef855ac9c441e38262a4ae26600d14c763c70c867024554499a451f9ad48`.
Verdict: `docs/critique/shaded-parity-challenger2-fused-block-recert.md`.

## 5.90 FV510 OWNER-SOURCE EXACT REDESIGN GRADUATED — 35th (2026-08-10)

The owner's supplied `fv510_warrior.glb` is byte-identical to the attributed
42manako CC-BY-4.0 oracle already held locally. The previous photo-estimated
Warrior shell is superseded by the source's exact component geometry. A
census-guarded repair spatially reconnects export-split vertices for analysis
and repartitions 663 complete authored solids without cutting any triangle:
Hull 593 components / 29,689 vertices / 23,703 triangles; Turret 69 / 4,565 /
3,989; Gun 1 / 438 / 410. Track remains 558 vertices / 480 triangles.

The exact transformed positions/indices are now a synchronous generated
profile payload, so private and public-fallback builds render the same Warrior
while the runtime GLB registration is retired. The repaired oracle SHA-256 is
`8bc9e6c1eb9a73794278cdb9ee4f6de2d540364d4772adc87e9c8224b40a2be6`,
reproducible from pristine `.bak`
`d4bcad966b92d0735f0affe65a926502eee9e2a158ff0b35cfe6c443453fa389`;
`tools/fv510-source-bake.py --verify` reproduces all four encoded payloads.

Final gate x2 is bit-identical: **93.2** |
93.2/93.2/98.2/100/100/100. Direct fidelity is **98.7** overall (hull 98.3,
turret/gun 100, tracks 99.9). Exact track/shoe is 5/39 with no blind spot;
standard contiguity 0, mg1+0d; turret-parent 0/0/0; winding reversed/mixed 0/0
and yaw candidates 0. Freeze **7884762a** reproduces x2 (10 meshes / 86,486
vertices). `npm test` and `npm run build:private` are green.

Independent §B8 passes all fourteen current-byte pairs at floor **9.4**, mean
**9.51**. The yaw/load-path sitting passes **9.4**: the RARDEN, turret shell,
sight pedestal, hatch/cupola equipment and turret rails rotate as one seated
assembly; hull-owned deck furniture correctly remains fixed. There is no
unsupported hardware, air seam, detached fitting or duplicate fixed turret
mass. Verdict:
`docs/critique/shaded-parity-fv510-exact-source-graduation.md`. Fleet is
**29/96** and graduates **35**. The owner-priority lane resumes the harmonious
T-90 family, T-72B3M parenting repair, Leopard 2A7/Revolution closeout and T-14
proportion round.

## 5.91 FV510 GAME-NATIVE TRACK SYSTEM RE-FROZEN (2026-08-10)

The owner required the exact-source Warrior to use the fleet's specific track
system. The bake now removes all 34 donor wheel/end-drum spatial components
from the Hull at whole-component boundaries and retains the encoded donor
Track only as reproducible oracle evidence; neither donor running-gear class
is rendered. The exact Warrior hull, side/bow guards, troop body, slat armor,
stern and RARDEN assembly remain source-derived. One normal
`buildRunningGear` course supplies six road-wheel stations per side, distinct
front sprockets and rear idlers, animated/damage-aware linked shoes, chain and
guide horns. Source guards are explicitly tagged `trackGuard`; the audit
exemption is limited to those enclosures and cannot hide donor gear or primary
hull structure.

Final gate x2 is bit-identical: **90.3** |
90.3/90.4/99.8/94.4/100/100. Direct fidelity is **98.0** overall (hull 97.2,
turret/gun 100, tracks 96.6); standard exact containment is 4/3 with no holes
or blind spot, decoration census is mg1+0d, turret-parent is 0/0/0, and winding
is reversed/mixed 0/0 with yaw candidates 0. Freeze **927beeb2** reproduces
x2 (23 meshes / 91,409 vertices). The generator verifies 30,175 encoded
vertices and 23,879 triangles; source payload SHA-256 is
`5b998049fa6397549440f1ed56a66bfa98a63f74f5662339de7d0a16f2e0d406`,
with pre-bake `.bak` SHA-256
`20c8e47be7e23ba29dad48d3eadbb2bd6e998fd3d32a68286c98266090fef372`
retained out of tree.

Independent §B8 passes all fourteen current-byte pairs at floor **9.1**,
mean **9.26**; yaw/load paths pass **9.4**. The sitting confirms one coherent
six-wheel station set, distinct terminal gears, continuous grounded native
shoe wraps behind the source guards, and no donor belt, duplicate wheel,
floater, guard penetration, collapsed arc, or upper-geometry regression.
Verdict:
`docs/critique/shaded-parity-fv510-native-track-recert.md`.

## 5.92 TYPE 10 OWNER-SOURCE EXACT REBUILD GRADUATED — 36th (2026-08-10)

The owner's `type-10-main-battle-tank.zip` is byte-identical to the source OBJ
already preserved in the ignored Type 10 packet. It supersedes the prior
photo-built shell and confirms one authoritative geometry source: ZIP SHA-256
`22bf48234c20edad51c9087dc4c02b99156c687af6a326533275eca9953d7468`,
nested OBJ
`c95211bba65d883700671373816c182c749f1973b638c42d21a562f244d686c5`.
The pristine tracked GLB remains unchanged at
`2cc5748e4357722fc1c21bf7759ec21c29f84b2cfaf1203b5bee995f4cfeca67`.

A deterministic semantic bake classifies all 2,450 authored spatial
components without cutting triangles. The playable source-derived payload is
Hull 30,754 vertices / 20,125 triangles, TrackGuards 15,030 / 10,488, Turret
31,174 / 21,492 and Gun 2,803 / 2,487. The repaired oracle is
`1d7fff3c390aef8898a05e2017e8abdd42f3b1a1df07ab86b7dd456a8c3bdfca`.
All 1,064 donor-track components and 60 donor wheel/end-drum components are
excluded from the playable. The exact upper now rides the game's native
five-wheel Type 10 gear, terminal sprocket/idler, rollers, linked shoes, guide
horns and damage/animation system.

Final gate x2 is bit-identical: **94.6** |
94.6/95.1/96.6/99.9/96.7/100. Direct fidelity is **97.4** overall (hull 97,
turret/gun 100, gear 91); exact band and shoe clipping are 0/0, contiguity is
0 and turret-parent is 0/0/0. Freeze **84f5d108** reproduces x2 (25 meshes /
184,760 vertices). Winding mode 1 is clean. The mode-2 candidate is visually
adjudicated as the correct fixed engine-deck/stern service course behind the
ring: the source-exact turret, gun, bustle, roof kit and antennae all rotate
together with continuous seated load paths. All fourteen current-byte paired
views and yaw 0/90 were inspected with zero browser console warnings/errors;
`npm test` and `npm run build:private` are green.

Independent §B8 passes all fourteen current-byte views at floor **9.2**,
mean **9.48**; yaw/load paths pass **9.7**. The sitting confirms the correct
five-road-wheel-per-side Type 10 layout, clean terminal wraps, complete donor
gear suppression, continuous turret equipment attachment and the mode-2
engine-deck adjudication. Verdict:
`docs/critique/shaded-parity-type10-source-graduation.md`.

Fleet is **30/96** and graduates **36**. The owner-priority lane advances
directly to the AMX-40 completion round.

## 5.93 AMX-40 LECLERC-METHOD COMPLETION GRADUATED — 37th (2026-08-10)

The raw AMX-40 has been rebuilt against the registered measurement-only
source with the Leclerc exact-geometry/paired-view method. The playable stays
fully procedural; oracle SHA-256 is
`570a12b0ced56299061fc0a57c3f86343d2aa45e2fb79d53e049f58da2e9849d`,
reproducible from pristine `.bak`
`2a510ae66a2355bc9766f043c7f42ae51164181ac9a6ed40d45c63993789d50e`.
The local oracle remains ignored and never ships.

The final tank uses one continuous low asymmetric welded turret loft, a
source-height canted mantlet web with bounded oval tunnel, seated
cupola/optic/smoke/flank/service hierarchy, full-width layered stern, and
source-traced belly/bow/skirt courses. `buildRunningGear.loopPoints` is an
optional additive centerline: AMX-40 uses it to match the source wraps while
retaining the fleet's animated/damage-aware linked shoes, six wheels and
terminal gears; every existing caller retains the historical path.

Final gate reproduced twice at **90.1** |
90.2/90.5/90.1/91.8/93.4/100; gate JSON SHA-256 is
`bc02bdb21b99b004e847dbd5c153f1633957c6d5aeaa41aeb668a6e4ceb103b9`.
Direct fidelity is **94.7** overall (H96.4 / T90.9 / G92.1 / R95.9), with
every measured view >=95.57. Exact track containment is band 26/48 and shoes
26/16, below the 60-voxel law with no blind spot; contiguity is 0, census is
mg1+7d, winding is 0 reversed / 0 mixed and yaw-stranded candidates are 0.
Freeze **d2c73d96** reproduces x2 (58 meshes / 83,226 vertices).

Independent §B8 passes all fourteen frozen-byte views at floor **9.0** and
mean **9.06**. Fresh yaw 0/90 confirms the complete turret, mantlet/gun,
cupola, optics, smoke/flank/service kit and bases rotate together with no
fixed duplicate, unsupported decoration or air seam. The game-native
six-wheel linked-shoe system passes with coherent contact and terminal wraps
and no donor gear. Verdict:
`docs/critique/shaded-parity-amx40-source-graduation.md`.

Fleet is **31/96** and graduates **37**. The owner-priority lane returns to
the harmonious T-90 family, T-72B3M parenting repair, Leopard 2A7/Revolution
turret closeout and T-14 proportion round.

## 5.94 T-90 FAMILY FIRST WAVE GRADUATED — 38th–40th (2026-08-10)

The stale dedicated family worktree was reconciled fragment-by-fragment onto
current `main`; only `profiles/t90.js`, the required opt-in Russia helpers and
three independent verdicts were recovered. Its unrelated fleet-wide gate
churn and temporary critic page remain out of the landing. Current-main gate,
hash and audit batteries reproduce the recovered final bytes exactly.

T-90A finishes as the correct low cast primary mass with radial K-5 and its
own ESSA/Shtora/cupola/Kord grammar; Vladimir keeps that cast lineage but uses
its compact recovered sight train, roof asymmetry and unequal service
transom; T-90SM retains the family's angular welded/bustle/Relikt identity.
Shared logic is limited to physical fabrication, attachment and measured
station rules. No tank is reduced to another variant with palette-swapped
boxes, and every turret-owned decoration has a visible seat and coherent yaw
load path.

Final gate x2:

- T-90A **90.4** | 90.6/90.5/90.4/90.4/97.8/100; freeze **810a6f18**.
- Vladimir **90.0** | 90.2/90.0/91.2/92.2/96.2/100; freeze **c13fec50**.
- T-90SM **90.0** | 90.2/90.3/90.8/90.0/100/100; freeze **56324371**.

All standard checks pass; exact track maxima remain below 60 with no blind
spot; contiguity is zero; winding mode 1 is clean. Independent §B8 passes all
42 frozen-byte views: floor/mean T-90A 9.0/9.11, Vladimir 9.0/9.01 and T-90SM
9.0/9.04; yaw/load paths pass 9.2/9.3/9.1. Verdicts:
`docs/critique/shaded-parity-t90a-graduation.md`,
`docs/critique/shaded-parity-t90a-vladimir-graduation.md`, and
`docs/critique/shaded-parity-t90sm-graduation.md`.

Fleet is **34/96** and graduates **40**. The same uninterrupted owner round
continues with the raw T-90, T-90A Burlak and T-90MS Tagil before T-72B3M,
Leopard 2A7/Revolution and T-14.

## 5.95 OWNER SCREENSHOT REOPEN — CHALLENGER 3 / ABRAMSX ATTACHMENT (2026-08-10, CANDIDATE)

The owner identified the two garage references explicitly as Challenger 3
and AbramsX and demonstrated that §5.87's yaw-coherence verdict had not proved
physical attachment. That attachment conclusion is therefore superseded and
both tanks were reopened. Rotation with the turret is now treated only as a
parenting receipt; a continuous visible load path into the local turret
surface is a separate gate (§B5 PHYSICAL-SEAT).

Challenger 3's defect was a datum error: forward fittings were seated from
`C3H`, the peak of the inset crown, although the brow is much lower at their
actual stations. The repair adds a tapered buried Protector foundation,
re-seats the forward optic directly into the descending brow, closes the
roof-to-ammunition tier with a buried service trunk, and authors the EPSOM
hood on the real sloped face rather than translating it from peak height.
Fresh low-side, top, close and yaw views show each complete component meeting
solid turret structure. Candidate freeze reproduces x2 at **5c15b250**
(60 meshes / 72,337 vertices).

AbramsX's screenshot came from the local/private garage runtime installing
the recovered Mortavex GLB. Although its flattened siblings had been made to
yaw together, the asset itself contains the giant stilted receiver and empty
attachment gaps. The GLB is now measurement-only in both critic harnesses;
the playable and private garage paths both use the seated procedural AbramsX.
Its geometry freeze remains **d1dbfa2** (75 meshes / 162,372 vertices).

Fresh gate runs reproduce Challenger 3 at **90.4**
(90.8/90.4/91.0/91.8/100/100) and AbramsX at **90.2**
(90.2/90.5/91.0/93.4/99.8/100). Standard-check passes both: contiguity 0,
decoration mg1+5d, track receipts 0/24 and 37/26 respectively. All 28 paired
PNG receipts are 1280x640 with distinct SHA-256 values; `npm test` is green.
Evidence lives in `shots/critic-challenger3-owner-gap-recert/` and
`shots/critic-abramsx-owner-gap-recert/`.

This is a **candidate repair, not a re-graduation**. The prior §5.87 critic
sitting did not cover the owner-reported failure correctly, so the graduate
registry hashes and counts stay unchanged until a new genuinely independent
§B8 sitting certifies the frozen candidate bytes. The owner-priority sequence
then continues with the reopened Vladimir hull/turret partition and complete
T-90SM redesign before the remaining T-90 family.
