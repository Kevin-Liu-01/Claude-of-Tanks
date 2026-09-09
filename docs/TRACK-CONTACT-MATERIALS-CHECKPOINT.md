# Sand/snow track contact — local source checkpoint

Base: `7351f0b4ad92c97be03e7be0bb7a700a3f332484`. This is a presentation-only draft, not a native-art or performance acceptance. No precipitation, deformation, simulation ground-type, map authoring, particle texture, pool-cap or draw-family change.

The actual sourced terrain palette selects sand for Desert/Badlands and their Oasis/Copper aliases, snow for Winter/Alpine/Whiteout, and sandy beach only for Coastal/Saltwind. Existing road/hardstand distance and shoreline inputs exclude powder from the full14m road/shoulder support, frozen sheets, liquid coverage>.02 and inland coastal grass. The remaining21 maps retain ordinary earth. The optional query follows map replacement through the existing live proxy; simulation-only fields need not implement presentation queries.

Each admitted sand/snow event uses one existing dust-pool puff instead of the earth kick/large wake/upper wake/clod recipes: ground+.12m, life≤.74s, final size≤1.26m, alpha≤.22, upward velocity≤1.15m/s and downward gravity. Existing emission spacing, dust pool1024 and tread ring96 stay fixed. The old aSurface attribute carries0 earth/1 water/2 sand/3 snow; only exact1 selects water duration/opacity. Muted packed-sand and compressed-snow marks use the same geometry, texture and material.

## Completed checks

- First normal-FIFO CPU packet: `/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/track-contact-cpu-r1.AfLh4f/report.json`. Actual nine-map surface test, actual-source FX recipe/ring test, proxy, clock, attachment and battle-presentation regressions PASS; core-unused PASS. Actual map fixtures recorded993 powder admissions and1160 excluded road nodes. Ordinary earth recipe outputs, call order and RNG tail match a small literal predecessor dispatch using the actual production recipe helpers. Mutation controls reject road/ice/water/inland leakage and the old large-cloud recipe.
- Strict new-file quality:54 functions, zero violations, no explicit any/unknown. Full eight-file scan retains only three untouched terrain functions: heightAt22/34, applyHeightConstraints15/24, createSplatMaterialSteps23/23 (cyclomatic/cognitive). No threshold changes or full-file goldens.
- The first TS7 invocation failed because a required presentation query excluded the vehicle balance simulator's deliberately flat headless field. The interface alone was corrected to optional; proxy/FX already had ordinary fallback. The one narrow normal-FIFO TS7+diff recheck PASS: `/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/track-contact-types-r2.Ck4ClI/report.json`. No emitted runtime change or passed behavior-test rerun.
- Full Doctor scan exits1, retained rather than suppressed: two unchanged guided-missile buffer-upload findings (the existing commitAtgmInstances owner already marks both buffers), three existing shell-property warnings, and three test-only no-eval findings for executing repository-owned/literal source. These tests accept no external code strings. This is not a clean full-Doctor certificate.
- Both packets preserve before/after source pins; diff check PASS. R1 wrapper37554/worker42351 and R2 wrapper43872/worker45384 have terminated. No build, browser, collision/minimap generation or push was performed.

## Limitations / integration

Classification conservatively follows authored material inputs, not rendered pixel/slope/noise readback. It adds event-gated scalar/grid/shore queries; reduced particle work and unchanged GPU owners do not establish CPU/GPU no-regression. Ordinary hard-ground dust remains unchanged on roads/ice; only the new powder is excluded.

Root owns surgical integration into the separate water candidate. Preserve its newer wet-ring branch, actual water-depth behavior, expired-slot admission and allocation-free corner writer; its expiry/duration checks must use exact surface==1, never surface>0. This older source base does not contain those water corrections. Do not replace effects.ts, terrain.ts or the proxy wholesale. Foundry R2 remains a separate art-unapproved local checkpoint and is not included here.

## Integrated review

Integrated with the newer water candidate at `22f7966a3`. Both contact tests now
use the existing `typescript-compiler-api` package after the original `typescript`
import resolved the TS7 version-only package and failed before assertions.
No dependency changes or disabled assertions. Seven focused tests, TS7 and
production build pass together; the full-FX Doctor limitations above remain.

Native production-build R4 (`shallow-water-native-r4.JCVlSt` under the evidence
root) includes reviewed sand and snow views with actual material codes 2 and 3:
short, low, subtle powder rather than the old tall earth clouds. Those views
stage FX; they are not natural driving or performance evidence. The subsequent
`shallow-water-live-r1.GKX9rY` uses real held-input driving from dry Coastal spawn
through beach into water, then verifies clean Garage ownership. See
`SHALLOW-WATER-CONTACT.md` for exact evidence and remaining device/performance limits.
