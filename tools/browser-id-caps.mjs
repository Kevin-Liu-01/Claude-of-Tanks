// Tank ids per browser, by tool (2026-10-31, item 266): the table tools/browser-id-chunks.mjs splits ids by.
//
// A row is the tool's file name without its directory and .mjs (genIcons, garage-wheel-band for its .browser.mjs).
// Each comment gives the guard's peaks behind the row (largest renderer / whole browser tree, on this Mac, 2026-10-31)
// and how they were measured. tools/browser-launch.mjs kills a renderer past 6 GB or a tree past 10 GB (exit 86): a
// cap keeps a chunk's renderer near half its limit, so the fleet can grow. The tools that run worker pages in one
// browser (fleet-geometry-audit, fleet-surface-overlap-audit, fleet-battle-views) are bound by the tree: WORKER_PAGES
// sets most of it, and their heaviest chunk is set by its heaviest ids, not by the cap.
//
// A cap decides only where a fresh browser starts, never what an id renders or writes (centering --update chunked and
// unchunked: byte for byte), so this table is out of every changed-only key (steps.mjs DECLARED_DYNAMIC scheduleOnly):
// re-measure and edit a row without re-running a step. Each chunk logs its peaks ([browser-chunks]); a row whose tool
// has only run at smoke size says so.
/**
 * Worker pages per browser for the tools that work through a chunk's jobs in parallel pages (--workers overrides it).
 * Each page is a renderer. With four, whole-fleet runs passed 8 GB of the guard's 10 GB tree in 4 of 11
 * surface-overlap chunks (9.41 at most), and fleet-geometry-audit at 60 ids passed 10 GB (exit 86) (2026-10-31). With
 * three, every chunk of the three tools stays under 7.5 GB but the geometry and battle-view chunks that hold merkava4b:
 * their jobs are an id in one mode or at one range, so the pages build that one heavy tank at once (rows below).
 */
export const WORKER_PAGES = 3;

export const BROWSER_ID_CAPS = Object.freeze({
  // whole fleet, 5 chunks of 48: 2.28 / 3.47 GB; the 60 heaviest ids in one browser: 3.0 / 4.4 GB
  'genIcons': 51,
  // whole fleet, 2 chunks of 118: 3.02 / 4.03 GB; all 236 ids in one browser: 4.45 / 5.7 GB
  'presentation-centering': 120,
  // whole fleet, 4 chunks of 59: 2.34 / 3.30 GB
  'tank-assets-check': 60,
  // 3 workers, whole fleet as 13 chunks of 20 (run in slices of 40): 3.48 / 9.25 GB in the chunk from m60a1, at most
  // 2.25 / 6.91 GB in the others. merkava4b sets that chunk's peak: alone it reaches 2.49 / 7.85 GB (merkava4_trophy
  // alone 4.44 GB, as a light id), so a lower cap cannot lower it: at 15 the chunk still peaked at 3.10 / 9.18 GB and
  // its slice ran 1143 s against 778 (4 workers, the first 3 chunks at 20: 3.82 / 8.98 GB; at 60 its tree passed
  // 10 GB, exit 86)
  'fleet-geometry-audit': 20,
  // 3 workers, whole fleet, 11 chunks of 24 (the last 87 ids rerun as 4 chunks of 22): at most 2.72 / 7.41 GB
  // (4 workers: 3.69 / 9.41 GB, four chunks past 8 GB)
  'fleet-surface-overlap-audit': 25,
  // not measured: a whole-fleet run stops at its fingerprint check before any browser (as on main, 2026-10-31)
  'fleet-freeze-snapshot': 60,
  // whole fleet at 60, 5 chunks of 51: 4.62 / 5.76 GB; 36 keeps a chunk near 3.5 GB
  'turret-parent-audit': 36,
  // a page per tank, as turret-parent-audit and track-clip-audit (4.2-4.6 GB at 51); smoke only (2 ids): 1.04 / 2.14 GB
  'winding-audit': 36,
  // whole fleet at 60, 2 of 5 chunks of 51: 4.21 / 5.40 GB; 36 keeps a chunk near 3.5 GB
  'track-clip-audit': 36,
  // whole fleet, 4 chunks of 59: 3.86 / 4.87 GB
  'track-duplicate-audit': 60,
  // whole fleet, 4 chunks of 59: 0.86 / 1.67 GB (two icon trees compared, no tank built)
  'fleet-visual-compare': 60,
  // every id with a reference, 5 chunks of 29: 2.47 / 3.46 GB
  'procedural-fidelity': 30,
  // its default list, 2 chunks of 17: 2.52 / 3.64 GB
  'geometry-gate': 30,
  // whole fleet static, 8 chunks of 30: 3.80 / 4.74 GB; --battle on the 60 heaviest ids, 2 chunks of 30: 3.89 / 5.69 GB
  'track-system-audit': 30,
  // whole fleet, 8 chunks of 30: 1.96 / 3.23 GB
  'model-rig-probe': 30,
  // whole fleet, 8 chunks of 30: 2.16 / 3.41 GB
  'module-visual-align-probe': 30,
  // whole fleet, 6 chunks of 40: 1.43 / 2.42 GB
  'vehicle-marking-visibility': 40,
  // --mode tank-switch over the whole fleet, 6 chunks of 40: 1.62 / 2.70 GB
  'loading-budget-probe': 40,
  // 3 workers, whole fleet, 9 chunks of 29: 3.18 / 8.84 GB in the chunk with merkava4b, at most 1.78 / 5.53 GB
  // in the other eight; at 20 that chunk still reached 3.03 / 8.48 GB and the run took 890 s against 756 (4 workers:
  // 3.90 / 9.49 GB in the same chunk)
  'fleet-battle-views': 30,
  // --all, 6 chunks of 40: 1.65 / 2.67 GB
  'muzzle-bore-probe': 40,
  // default lists of 3 to 8 ids, one browser each; smoke size only (2 ids per browser): garage-wheel-band
  // 2.66 / 4.28 GB, decoration-eval 1.45 / 2.52, anatomy-render-set 0.77 / 1.90, salvo-indicator-probe 3.13 / 4.94
  // (a battle per case: 3, its default list)
  'garage-wheel-band': 12,
  'decoration-eval': 8,
  'salvo-indicator-probe': 3,
  'anatomy-render-set': 8,
  // smoke size only (2 ids per browser): genHeroCards 1.21 / 2.29 GB, contig-phase-audit 1.25 / 2.27,
  // tank-standard-check 1.10 / 2.20, genDrawings 1.71 / 2.84. Each takes ids by --ids (or an explicit --all); measure
  // a full chunk before raising one.
  'genHeroCards': 30,
  'contig-phase-audit': 30,
  'tank-standard-check': 30,
  'genDrawings': 30,
});
