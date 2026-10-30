# Envelope honesty 264: per-family classification and edit (agent brief)

Repo worktree: `/Users/kevinliu/cot-lanes/envelope-honesty-264` (branch item/envelope-honesty-264, the release-263 tree).
Run every command from that directory. Shell cwd resets between calls: use `cd /Users/kevinliu/cot-lanes/envelope-honesty-264 && ...`.

## The defect
`tools/gen-combat-anatomy.mjs` builds each tank's combat turret and hull boxes from the primary `turret` and `hull` buckets only
(PRIMARY_BUCKETS), and `reconcileFrame` (src/vehicles/combatAnatomy.ts) maps every authored main plate onto that box. A thin
frame, rail, chain, basket floor, bin, mudguard, bolt or stowage part drawn into `turret`/`hull` inflates the box, and every
real plate, the ring, the collision slabs and the crew seats move out with it. Precedent: the Leopard 2A3 OTCO's 22 rim and
shroud parts moved from `turret` to `turretEquipment` (same paint) and its anatomy came back equal to its twin's.

## The census (your measuring tool)
`perl -e 'alarm 1200; exec @ARGV' node --max-old-space-size=4096 tools/envelope-census.mjs --ids=<a,b> --sites`
prints, per tank and frame, every FLAGGED primary-bucket part (thin: smallest side <= 7 cm, or small: <= 2% of the bucket's
largest part's box volume; and standing > 5 cm past the tank's authored main plates in x or z) with its size, centre,
how far past the plates, and the BUILDER LINE that drew it (`fn@profiles/file.ts:line <- caller`), plus the growth (how far
the box shrinks without the flagged parts: side, front, rear). Your ids' rows on the unedited tree are in
`/Users/kevinliu/cot-lanes/envelope-honesty-264-evidence/census-i263/worklist.txt` (grep your id).

## What to do, per flagged part (anatomy only: THE LOOK MUST NOT CHANGE)
Change ONLY the bucket a part is drawn into. Never move, resize, reshape, re-rotate, add or delete geometry; never change
specs, armor values, plates, modules or any combat data. Minimal edits, matching the surrounding code style.
- Non-armour (frames, rails, racks, baskets and basket floors, bins, stowage boxes, chains, tool boxes, smoke/dischargers
  housings, lamp housings, tow bars, bolts, brackets, sight housings that are not the authored optics module):
  - turret parts: `P.add('turret', ...)` -> `P.add('turretEquipment', ...)` (or `P.addEquipment('turret', ...)`).
  - hull mudguards, fender skins, fender flaps/shoulders, valances (sheet bodywork): -> `hullFixedPaintedBodywork`
    (`P.addMudguard(label, 'hull', ...)` -> `P.addMudguard(label, 'hullFixedPaintedBodywork', ...)`; plain
    `P.add('hull', ...)` -> `P.add('hullFixedPaintedBodywork', ...)`). Same paint, kept at every LOD, non-armour.
  - other hull fittings (boxes, racks, brackets, tow bars, bolts, stowage) -> `hullEquipment`.
- Real spaced/bolt-on armour (armoured side skirts and skirt panels on MBTs/IFVs, add-on side modules, wedge modules, appliqué
  cassettes): -> `hullExternalArmor` / `turretExternalArmor` (or `P.addExternalArmor('hull'|'turret', ...)`).
- ERA bricks drawn into `turret`/`hull`: -> `turretExternalArmor` / `hullExternalArmor` (do NOT author ERA plates: that is
  combat data; note it in your report as "ERA plate path owed").
- Real armour the census mis-flags (a thin roof/floor plate that IS the body, a cast gun mask/mantlet block that is the
  turret's armour, a hull plate forming the real outline): LEAVE IT in the primary bucket, and give a one-line reason.
- Weigh each judgement on the real vehicle (what the part is) and on the code's own comments. A part a comment calls
  "structural" is not automatically armour: a bustle carrier floor is stowage.
- A helper shared by many builders (e.g. profiles/kit.ts addShapedMudguard, korea.ts cassette): change the CALL SITE's
  bucket argument, not the shared helper, unless every caller is in your ids and should change.
- If one builder line serves several ids (variants share builders), the change applies to all of them: list every id the
  line builds and verify them all.

## Verify, per id, after your edits
1. `perl -e 'alarm 1200; exec @ARGV' node --max-old-space-size=4096 tools/envelope-census.mjs --ids=<ids> --sites` —
   the growth falls; what remains flagged is real armour you left on purpose (or harmless, growth ~0).
2. `perl -e 'alarm 1800; exec @ARGV' node --max-old-space-size=4096 .qa-dev/envelope/look.mjs compare <ids>` — must print
   `look identical` for every id (it compares every part's box, parent group and material against a baseline taken before any
   edit; it lists which buckets parts moved into). A `LOOK CHANGED` line means you moved geometry: fix it.
3. `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -E "<your files>"` should print nothing
   (or run on the whole project only if quick; never pipe-trust the exit code).

## Rules
- Edit ONLY the files assigned to you below. Other agents are editing other files in this same tree at the same time.
- Do NOT run generators (gen-combat-anatomy, gen-*, fleet-geometry-ledger, genIcons, etc.), do NOT commit, do NOT run
  git stash/checkout/reset/restore/add, do NOT touch generated files, docs, or the allowance.
- Node heaps capped: always `node --max-old-space-size=4096` inside `perl -e 'alarm N; exec @ARGV'`. Never pkill; kill only
  exact PIDs you started. No rm -rf.
- Avoid the line ranges listed as "in flight" for your files (another lane is rewriting them); if a flagged part sits there,
  leave it and report it as "in flight: <branch>".

## Report (your final message; it is all I see)
For each id: frame, before (flagged/total, growth side/front/rear), after (same), the parts moved (count, file:line,
from -> to bucket, what they are), what you left flagged and why (one line each: these become allowance reasons), and the
look check result. Then a list of every file:line you changed. Keep it compact.
