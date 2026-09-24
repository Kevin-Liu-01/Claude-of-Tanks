// The fixed camera table of the AAA map program's acceptance captures (docs/MAP-BEAUTIFICATION.md, "Probes and
// metrics as tools"). Every round from 35 on judged its change on these poses at the same seed and tier, so the
// table is pinned by tools/map-probe-runtime.selftest.mjs: adding or moving a view is a deliberate, dated re-pin,
// never a side effect of a capture session. Owner approval to commit the QA probes as tools: 2026-09-23.
//
// A view is { name, round, cam: [x, yAbove, z], at: [x, yAbove, z] }. The heights are metres ABOVE THE GROUND at
// the clamped XZ (|x|,|z| <= MAP_VIEW_PROBE_HALF, the playable square's height field); the XZ itself is not
// clamped, so a look-at 900 m out still points at the ring. World +X is east, +Z is north; the camera looks with
// +Y up, which puts screen-right at (-fz, fx) for a heading (fx, fz) — see screenRightOf in map-probe-runtime.mjs.

export const MAP_VIEW_PROBE_HALF = 511;
export const MAP_VIEW_PROBE_FOV = 55;
export const MAP_VIEW_PROBE_VIEWPORT = Object.freeze({ width: 1600, height: 900 });

const view = (name, round, cam, at) => Object.freeze({ name, round, cam: Object.freeze(cam), at: Object.freeze(at) });

export const MAP_VIEW_PROBE_VIEWS = Object.freeze([
  // round 35 (walls): close and mid views of the ring walls from inside the square — the owner's Redrock SW corner
  // shot stands 112 m from the corner wall
  view('sw-corner-close', 35, [-470, 6, -470], [-640, 40, -640]),
  view('sw-wall-up', 35, [-490, 4, -300], [-700, 90, -300]),          // looking up a side wall from the rim
  view('w-wall-mid', 35, [-380, 12, 0], [-800, 60, 120]),              // 400 m across to the west wall
  view('ne-corner-close', 35, [470, 6, 470], [640, 40, 640]),
  view('n-along-rim', 35, [-200, 8, 495], [400, 30, 700]),             // grazing along the north rim
  view('centre-far', 35, [0, 14, -60], [200, 90, 900]),                // the far ranges over the map
  // round 35: the rim-band walls seen from OUTSIDE the square, 100–200 m past the edge (terrain material territory)
  view('out-w-112', 35, [-540, 18, -100], [-652, 60, -100]),
  view('out-sw-112', 35, [-530, 18, -530], [-610, 60, -610]),
  view('out-n-200', 35, [-100, 25, 560], [-100, 90, 760]),
  view('rim-w-grazing', 35, [-505, 10, -450], [-560, 30, 300]),
  // round 35: the first ridge wall from the rim (200 m) and from the corner
  view('n-wall-200', 35, [-100, 10, 505], [-100, 70, 705]),
  view('sw-corner-wall', 35, [-500, 12, -500], [-680, 90, -680]),
  view('e-wall-300', 35, [420, 10, 100], [720, 90, 100]),
  // round 35 all-map audit: skylines from the map centre (west and south) — sky vs range tone, haze, silhouettes
  view('sky-w', 35, [0, 6, 0], [-900, 260, 0]),
  view('sky-s', 35, [0, 6, 0], [0, 260, -900]),
  // round 36 water audit: from each edge looking straight out, low, at the water line
  view('edge-e-low', 36, [470, 4, 0], [720, 0, 0]),
  view('edge-w-low', 36, [-470, 4, 0], [-720, 0, 0]),
  view('edge-n-low', 36, [0, 4, 470], [0, 0, 720]),
  view('edge-s-low', 36, [0, 4, -470], [0, 0, -720]),
  // round 35: the owner's Redrock shot — from the SW corner toward the west canyon wall's continuation south of the edge
  view('sw-west-wall-112', 35, [-480, 10, -505], [-330, 60, -640]),
  view('wall-south-along', 35, [-350, 8, -500], [-300, 70, -700]),
  // round 35: Redrock's dark north-west wall close up, and bird views of the outland layout
  view('nw-wall-close', 35, [-380, 12, 500], [-470, 70, 680]),
  view('bird-n', 35, [0, 380, -100], [0, 20, 900]),
  view('bird-w', 35, [100, 380, 0], [-900, 20, 0]),
  view('canyon-in', 35, [-140, 8, -40], [80, 40, 60]),
  // round 40 (water past the square): straight down at the east edge, for the apron / sheet / ring layer toggles
  view('over-e-560', 40, [560, 160, 160], [560, -5, 160.5]),
  // round 47 shoreline audit: bird views over the sea edges (the owner's right angle between shore and water)
  view('bird-e-edge', 47, [380, 260, -60], [560, 0, -60]),
  view('bird-w-edge', 47, [-380, 260, 0], [-560, 0, 0]),
  view('bird-e-edge-n', 47, [380, 260, 160], [560, 0, 160]),
  view('shore-e-oblique', 47, [400, 40, -300], [520, -4, 40]),
  view('shore-w-oblique', 47, [-400, 40, 300], [-520, -4, -40]),
  // round 56 (2026-09-24, the strands' wrack line): 4 m over the wrack band looking along the beach at gameplay
  // height — Saltmere's crescent from its 192° station toward 168°, Nordhavn's middle arm head from 191° toward 169°,
  // Saltwind's east shore from 22° toward -22° (the points are the band law's own, strandWrack.ts at seed 1337)
  view('strand-e-low', 56, [320, 4, -99], [329, 0, 18]),
  view('strand-fjord-low', 56, [302, 4, 38], [303, 0, 102]),
  view('strand-w-low', 56, [-305, 4, 67], [-315, 0, -47]),
]);

/** The views a capture run shoots: every view, or the named subset in table order. Unknown names fail closed. */
export function selectMapViews(names = null) {
  if (!names || names.length === 0) return [...MAP_VIEW_PROBE_VIEWS];
  const byName = new Map(MAP_VIEW_PROBE_VIEWS.map((v) => [v.name, v]));
  const unknown = names.filter((n) => !byName.has(n));
  if (unknown.length) throw new Error(`Unknown view(s): ${unknown.join(', ')} (see tools/map-view-probe-views.mjs)`);
  const wanted = new Set(names);
  return MAP_VIEW_PROBE_VIEWS.filter((v) => wanted.has(v.name));
}
