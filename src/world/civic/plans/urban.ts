// src/world/civic/plans/urban.ts — Steinburg's civic plan (the maps lane, 228; the owner's pick, 2026-10-18: "a civic
// square with a tree-lined green, memorial column and parked period cars"; 2026-10-19: Steinburg is the pilot of the
// shared civic-area and pathway kit). World metres; north is +z, east +x.
//
// The Friedensplatz: the Hauptstrasse (road 0) and the trade road (road 1) cross the 64 m apron at (-50, 0) as two
// prop-free arms (18 m and 17 m) round an empty roundel (r 9: the zone hold disc and the ball's kickoff). West of the
// trade road, the green: two kerbed quarters of lawn behind Burgsandstein dwarf walls and a cast-iron railing, the
// north one a flower roundel on its paths' crossing, the south one the memorial grove (Ehrenhain) with the
// Friedenssäule at its head, its forecourt open to the square. Thirteen oaks in rows on the two quarters, inside their
// railings (the north quarter's church-side corner and the column's two left open: the church's front and the column
// stand clear), more in iron grates in the paving east of the trade road, three screening the north-east lot. East of
// the trade road, the Platz: the Wochenmarkt's Franconian stalls, a row in the north-east lot and a short row by the
// south frontage, a kiosk, two Litfaßsäulen, two phone boxes, and the period cars parked at the kerb along the south frontage and in the
// lot (the 1980s' Golfs and W123 estates; no painted bays). Eleven gas lanterns join the town's: twelve stand within 45 m
// of the crossing.
// (228 r4, the gameplay critic's frontline battles: the attackers drive north over x -33..-38 into line-2's disc and
// jostle within about 15 m of its point (-36, 37.9); the north market stood on that line and was crushed in every seed.
// The north side's hull-high pieces stand off the driven line and every corridor's footprint, line-2's jostle disc is a
// hold, and the cover across the Hauptstrasse is within a piece both counted narrow (stalls, kiosk, cars: north 4, south
// 5) and wide (every piece 1.3 m and taller: north 6, south 7). The lane's ruling (the owner's free hand): in Frontline a
// line's 30 m capture disc is the fight's ground, and its dressing is there to be used up as the craters and rubble are;
// the balance across the Hauptstrasse is held at the start of every mode.)
// (228 r2, the blind critics on r1: the bay lines read as the car park the owner rejected, the oaks stood on the railing
// lines, the church and the column were hidden behind crowns, the market was thin, a modern garage, a checkpoint hut and
// oil drums stood about the room: each answered below.)
//
// The column's seat (review R2): the incentre of the south triangle of the planner cell x -75..-50, z -25..0, 5.18 m
// from its six lattice segments and 13.5 m from the nearest node, in front of the oak rows, facing the crossing.
import type { CivicPlan } from '../types.ts';

const ROOM = { x0: -92.4, x1: -8.7, z0: -40.3, z1: 40.2 } as const;
const NW = { x0: -83.4, x1: -59.0, z0: 9.5, z1: 31.0 } as const;
const SW = { x0: -83.4, x1: -59.0, z0: -31.0, z1: -9.5 } as const;
const MID_X = -71.2, NW_Z = 20.25, SW_AXIS = -19.8;
const COLUMN = { x: -62.5, z: -19.8 } as const;

/** Each bench's front turned to face (tx, tz) from (x, z), degrees (0 = +z, 90 = +x). */
const facing = (x: number, z: number, tx: number, tz: number): number => +(Math.atan2(tx - x, tz - z) * 180 / Math.PI).toFixed(2);

/** A pair of bollards at a mouth: either side of the path, on the granite band outside the bed. */
function bollards(side: 'n' | 's' | 'e' | 'w', rect: { x0: number; x1: number; z0: number; z1: number }, at: number, half = 2.2) {
  if (side === 'n') return [[at - half, rect.z1 + 0.25], [at + half, rect.z1 + 0.25]] as const;
  if (side === 's') return [[at - half, rect.z0 - 0.25], [at + half, rect.z0 - 0.25]] as const;
  if (side === 'e') return [[rect.x1 + 0.25, at - half], [rect.x1 + 0.25, at + half]] as const;
  return [[rect.x0 - 0.25, at - half], [rect.x0 - 0.25, at + half]] as const;
}

const POLLER = [
  ...bollards('n', NW, MID_X), ...bollards('s', NW, MID_X), ...bollards('e', NW, NW_Z), ...bollards('w', NW, NW_Z),
  ...bollards('n', SW, MID_X), ...bollards('s', SW, MID_X), ...bollards('w', SW, SW_AXIS),
  // the Ehrenhof's opening (6 m): one each side of it
  [SW.x1 + 0.25, SW_AXIS - 3.6], [SW.x1 + 0.25, SW_AXIS + 3.6],
].map(([x, z]) => ({ kind: 'poller', x: +x.toFixed(2), z: +z.toFixed(2), yawDeg: 0 }));

// the oak rows 2.2 m inside the beds' edges (the railing 1.6 m clear of each trunk), 6.67 m apart
const OAK_X = [-81.2, -74.53, -67.87, -61.2];
const OAK_N = 28.5, OAK_S = 12.0;

export const URBAN_CIVIC_PLAN: CivicPlan = {
  mapId: 'urban',
  style: 'franconian',
  overlay: { hedgehogsAtApproaches: true, monumentKind: 'memorialcolumn' },
  pathways: {
    // the Hauptstrasse and the trade road are the main streets; the back lanes and the alleys are Gassen, kerbed low with
    // a narrow pavement (228 r2: the blind pairs preferred the legacy strips to the lanes' bare setts and weedy margins)
    classes: { 0: 'main', 1: 'main', 6: 'gasse', 7: 'gasse', 8: 'gasse', 9: 'gasse', 10: 'gasse', 11: 'gasse', 12: 'gasse', 13: 'gasse' },
    kerbM: 3.8,
    frontage: [1.2, 3.5],
    returnR: 3.0,
    maxWalkM: 2.5,
    openWalkM: 2.0,
    lane: { face: 0.08, maxWalkM: 1.8, openWalkM: 1.4 },
    exclude: [ROOM],
    gates: [
      { x: -51.839, z: 100.564, halfWidth: 4.1, yawDeg: 2 },
      { x: -48.339, z: -101.256, halfWidth: 4.1, yawDeg: 184 },
    ],
    // the town wall's line (props.wallRuns' town stretches), west gate round to the west gate, and (228 r3: the blind pairs
    // lost the gate road to the legacy strips) the suburb outside the west gate, its houses either side of the Hauptstrasse
    inside: [[-262, 22], [-226, 18], [-216, 50], [-188, 80], [-150, 96], [-104, 104], [-64, 101], [-36, 100], [0, 94], [34, 80], [58, 56], [68, 22],
      [68, -26], [58, -64], [34, -90], [-2, -104], [-38, -102], [-66, -100], [-104, -104], [-156, -98], [-196, -76], [-218, -44], [-226, -12], [-262, -14]],
    mouths: [[ROOM.x0, 0], [ROOM.x1, 0], [-50, ROOM.z1], [-50, ROOM.z0]],
  },
  areas: [{
    id: 'friedensplatz',
    room: ROOM,
    paved: { x0: -96, x1: -6, z0: -47.5, z1: 41.5 },
    // the carriageways' gutters at 3.8 m either side of each street through the square, stopping short of the roundel
    rinnen: [
      { from: [ROOM.x0, -3.8], to: [-59.4, -3.8] }, { from: [ROOM.x0, 3.8], to: [-59.4, 3.8] },
      { from: [-40.6, -3.8], to: [ROOM.x1, -3.8] }, { from: [-40.6, 3.8], to: [ROOM.x1, 3.8] },
      { from: [-53.8, ROOM.z0], to: [-53.8, -9.6] }, { from: [-46.2, ROOM.z0], to: [-46.2, -9.6] },
      { from: [-53.8, 9.6], to: [-53.8, ROOM.z1] }, { from: [-46.2, 9.6], to: [-46.2, ROOM.z1] },
    ],
    vetoExempt: ['lamp'],
    // the Pfarrgarten behind the church's north-west corner (the orange-ringed crater that sat there), and the north-east
    // lot behind the parked cars (its rubble mounds stood round the screen's trunks)
    keepOuts: [{ x0: -116, x1: -92.4, z0: 19, z1: 48 }, { x0: -8.7, x1: 0, z0: 6, z1: 36 }],
    // (228 r2) round the room: the settlement's service garage on the south-west corner (behind the column) and its
    // checkpoint hut by the south gap, the oil drums, pallets and barrels at the fountain and the frontages
    clears: [{ rect: { x0: -100, x1: 0, z0: -56, z1: 56 },
      kinds: ['servicegarage', 'checkpointhut', 'drum', 'drumred', 'pallet', 'barrel', 'gasbottle', 'jerrycan', 'cablespool'] },
    // (228 r3, the blind critics: "an out-of-place oil drum is left on the new pavements") the town's streets' oil drums
    { rect: { x0: -262, x1: 72, z0: -104, z1: 104 }, kinds: ['drum', 'drumred'] }],
    pad: 0,
    arms: [{ x0: ROOM.x0, x1: ROOM.x1, z0: -9, z1: 9 }, { x0: -58.5, x1: -41.5, z0: -41, z1: 41 }],
    // the study's routeheat (C11): the north-east diagonal to frontline line-2 and the spur to the ac130 extraction
    corridors: [
      { from: [-22, 0], to: [-22, 24], half: 4 }, { from: [-22, 24], to: [-36, 38], half: 4 },
      { from: [-50, 0], to: [-39.1, -9.7], half: 4 },
      // (228 r3, the gameplay critic: 108 of 140 seeded routes to frontline line-2 ran here, over the north market and
      // the north-east kerb row) the bots' two measured routes to line-2
      // (a half metre wider than the drawn ones: the routes' band is the seeds' spread)
      { from: [0, 0], to: [-25, 25], half: 4.5 }, { from: [-25, 0], to: [-36, 37.9], half: 4.5 },
      // (228 r4, the gameplay critic's frontline battles: the hulls leave the Hauptstrasse at x -21..-27 and drive north
      // along x -33..-38 into line-2's disc, over where the north market stood) the driven line
      { from: [-24, 6], to: [-35.5, 14], half: 5 }, { from: [-35.5, 14], to: [-35.5, 37.9], half: 6 },
    ],
    // the ring lanes round the green (C12: 9 m, two hulls abreast): the west walk from the corner lot's garage north to the
    // church, the walks between the quarters and the church and the south frontage
    lanes: [
      { id: 'west-walk', rect: { x0: ROOM.x0, x1: NW.x0, z0: -34.0, z1: ROOM.z1 }, minWidth: 9.0 },
      { id: 'north-walk', rect: { x0: NW.x0, x1: NW.x1, z0: NW.z1, z1: ROOM.z1 }, minWidth: 9.0 },
      { id: 'south-walk', rect: { x0: SW.x0, x1: SW.x1, z0: ROOM.z0, z1: SW.z0 }, minWidth: 9.0 },
    ],
    // the ac130 extraction's seat (matchPlacement: the 8 m ring search's solid-free disc east of the crossing; the study's
    // modes probe), its convoy's 8 m kept clear of every piece and trunk
    // (228 r4) and frontline line-2's point, where the attackers jostle once inside its 30 m capture disc (the critic's
    // crush traces: within about 15 m of it), clear of every piece and trunk
    holds: [{ id: 'ac130-extraction', x: -39.1, z: -9.7, r: 8 }, { id: 'frontline-line-2', x: -36, z: 37.9, r: 15 }],
    centre: { x: -50, z: 0, ringR: [8.0, 9.0], roseR: 3, rays: 8 },
    beds: [
      {
        id: 'blumenrondell', rect: NW,
        mouths: [{ side: 'n', at: MID_X, width: 3 }, { side: 's', at: MID_X, width: 3 }, { side: 'e', at: NW_Z, width: 3 }, { side: 'w', at: NW_Z, width: 3 }],
        paths: [{ from: [MID_X, NW.z0], to: [MID_X, NW.z1], width: 3 }, { from: [NW.x0, NW_Z], to: [NW.x1, NW_Z], width: 3 }],
        feature: { kind: 'flowerRondell', x: MID_X, z: NW_Z, r: 2.5, ring: 5.0 },
      },
      {
        id: 'ehrenhain', rect: SW,
        mouths: [{ side: 'w', at: SW_AXIS, width: 3 }, { side: 'n', at: MID_X, width: 3 }, { side: 's', at: MID_X, width: 3 },
          { side: 'e', at: SW_AXIS, width: 6, open: 6 }],
        paths: [{ from: [SW.x0, SW_AXIS], to: [COLUMN.x - 2.9, SW_AXIS], width: 3 }, { from: [MID_X, SW.z0], to: [MID_X, SW.z1], width: 3 }],
        // the clipped box semicircle behind the column, open where the axis path comes in from the west
        feature: { kind: 'hedgeArc', x: COLUMN.x, z: COLUMN.z, r: 3.4, height: 0.55, fromDeg: 190, toDeg: 350 },
      },
    ],
    paving: [
      // the granite bands between the beds' kerbs and the arms
      { rect: { x0: NW.x0, x1: -58.5, z0: 9.0, z1: NW.z0 }, kind: 'granite' },
      { rect: { x0: NW.x1, x1: -58.5, z0: NW.z0, z1: NW.z1 }, kind: 'granite' },
      { rect: { x0: SW.x0, x1: -58.5, z0: SW.z1, z1: -9.0 }, kind: 'granite' },
      { rect: { x0: SW.x1, x1: -58.5, z0: SW.z0, z1: SW_AXIS - 3 }, kind: 'granite' },
      { rect: { x0: SW.x1, x1: -58.5, z0: SW_AXIS + 3, z1: SW.z1 }, kind: 'granite' },
      // the Ehrenhof: the trade road's small setts carried in as the column's forecourt
      { rect: { x0: COLUMN.x - 2.9, x1: -58.5, z0: SW_AXIS - 3, z1: SW_AXIS + 3 }, kind: 'setts' },
      // the Kirchweg from the church's west door to the green's north mouth
      { rect: { x0: -77.0, x1: -74.6, z0: 31.25, z1: 39.4 }, kind: 'flags' },
      { rect: { x0: -74.6, x1: -69.9, z0: 31.25, z1: 33.65 }, kind: 'flags' },
    ],
    monument: { kind: 'memorialcolumn', x: COLUMN.x, z: COLUMN.z, faceX: -50, faceZ: 0 },
    trees: {
      // (228 r2: 1.45-1.6 stood the crowns over the column's figure and the church; the trunks read as wide orange posts)
      species: 'oak', scale: [1.1, 1.22],
      stations: [
        // the north quarter's rows, its church-side east corner left open (the church's front seen across the green)
        ...OAK_X.filter((x) => x < -61.5).map((x) => ({ x, z: OAK_N })),
        ...OAK_X.map((x) => ({ x, z: OAK_S })),
        // the Ehrenhain's rows, their east pair left out: the column stands at the grove's head in the open
        ...OAK_X.filter((x) => x < -61.5).flatMap((x) => [{ x, z: -OAK_S }, { x, z: -OAK_N }]),
        // the pits in the paving east of the trade road, and its east side (228 r3: the north three stood on the bots'
        // routes to line-2; they are left out)
        // (the south three half a metre east of the review's seats: the first's trunk clear of the extraction's 8 m disc)
        { x: -30.5, z: -11, grate: true }, { x: -24, z: -11, grate: true }, { x: -17.5, z: -11, grate: true },
        { x: -40, z: -25, grate: true }, { x: -40, z: -33, grate: true },
        // (the fill, 228 r1) a pit tree before the north row and on the trade road's east side south of the extraction's
        // disc (the walks round the green stay lanes: C12)
        // (228 r4: the north row's two pits stood in line-2's jostle disc; left out)
        { x: -40, z: -18.4, grate: true },
        // (228 r2) the south market's shade behind its stalls, and the south-west corner the garage left
        { x: -26, z: -30, grate: true }, { x: -19.3, z: -30, grate: true }, { x: -88.5, z: -37.5, grate: true },
        // the north-east lot's screen, and the Pfarrgarten behind the church
        { x: -8, z: 21, grate: true }, { x: -8, z: 28, grate: true },
        { x: -104, z: 24 }, { x: -112, z: 34 }, { x: -103, z: 44 },
      ],
    },
    furniture: [
      // the flower roundel's benches on the diagonals, facing in
      ...[[-75.16, 24.21], [-67.24, 24.21], [-75.16, 16.29], [-67.24, 16.29]].map(([x, z]) => ({ kind: 'bench', x, z, yawDeg: facing(x, z, MID_X, NW_Z) })),
      // the Ehrenhain's benches facing its axis
      { kind: 'bench', x: -67.0, z: -16.6, yawDeg: 180 }, { kind: 'bench', x: -76.0, z: -16.6, yawDeg: 180 },
      { kind: 'bench', x: -67.0, z: -23.0, yawDeg: 0 }, { kind: 'bench', x: -76.0, z: -23.0, yawDeg: 0 },
      // a bench under the north row's pit tree, facing the square
      { kind: 'bench', x: -19.4, z: 35.2, yawDeg: 200 },
      // (228 r2) one by the north-east kerb parking facing the market, one behind the south row facing the square
      { kind: 'bench', x: -17.8, z: 29.5, yawDeg: 90 }, { kind: 'bench', x: -33.0, z: -30.6, yawDeg: 0 },
      // the Brunnenplatz: two benches against the church's east flank, facing the Marktbrunnen
      { kind: 'bench', x: -69.0, z: 45.5, yawDeg: 90 }, { kind: 'bench', x: -69.0, z: 48.5, yawDeg: 90 },
      ...POLLER,
      { kind: 'trashcan', x: -60.2, z: 17.6, yawDeg: 0 }, { kind: 'trashcan', x: -60.2, z: -27.5, yawDeg: 0 },
      { kind: 'trashcan', x: -66.5, z: 41.2, yawDeg: 0 }, { kind: 'trashcan', x: -29.0, z: -19.5, yawDeg: 0 },
      ...[[-64.0, 41.5], [-60.0, 41.5], [-29.5, -17.0], [-23.0, -17.0], [-10.8, -9.6]].map(([x, z]) => ({ kind: 'pflanzkuebel', x, z, yawDeg: 0 })),
      // (228 r2) the Wochenmarkt: two rows of Franconian stalls facing across their aisle north of the Hauptstrasse, their
      // head stall at the aisle's north end, and a short row by the south frontage facing the square; crates at their backs
      // (228 r3: one row by the trade road's arm, west of the bots' routes to line-2; the south row three, the cover across
      // the Hauptstrasse within a piece)
      // (228 r4, the gameplay critic: the bots drive north over x -33..-38 into line-2's disc and crushed the row there in
      // every seed) the north row three stalls in the north-east lot facing the square, off the driven line and every
      // corridor's footprint
      ...[23.0, 26.5, 30.0].map((z) => ({ kind: 'stall', x: -13.5, z, yawDeg: -90 })),
      ...[-34.5, -31.0].map((x) => ({ kind: 'stall', x, z: -24.0, yawDeg: 0 })),
      // (228 r4: the cover across the Hauptstrasse within a piece) a bench where the south row's third stall stood
      { kind: 'bench', x: -27.5, z: -24.6, yawDeg: 0 },
      { kind: 'crate', x: -32.9, z: -26.0, yawDeg: 17 }, { kind: 'crate', x: -26.0, z: -26.1, yawDeg: -11 },
      // where the south row's fourth stall and the east kerb's cars stood: a bench and a planter
      { kind: 'bench', x: -12.5, z: -30.0, yawDeg: -90 }, { kind: 'pflanzkuebel', x: -12.5, z: -26.5, yawDeg: 0 },
      { kind: 'kiosk', x: -15.5, z: -14.5, yawDeg: -45 },
      // (228 r4: the cover across the Hauptstrasse within a piece, the north market's row in the lot) planters where the
      // south kerb's east two cars stood, a bench toward the kiosk
      { kind: 'bench', x: -20.5, z: -23.0, yawDeg: 0 },
      { kind: 'pflanzkuebel', x: -22.4, z: -37.2, yawDeg: 0 }, { kind: 'pflanzkuebel', x: -16.7, z: -37.2, yawDeg: 0 },
      // (228 r3: the north-east one stood on its tree's grate, then on the bots' route) by the north-east kerb parking
      { kind: 'litfass', x: -31.5, z: -15.5, yawDeg: 0 }, { kind: 'litfass', x: -17.0, z: 36.5, yawDeg: 20 },
      { kind: 'telzelle', x: -11.0, z: -21.0, yawDeg: -90 }, { kind: 'telzelle', x: -10.0, z: 31.5, yawDeg: -90 },
    ],
    // (228 r2) the cars parked at the kerb, nose to tail along the south frontage and the east, a little off true (no
    // painted bays: the owner's "parking-lot lines" and the critics' "modern car park")
    parking: [
      { kind: 'wagon', x: -34.0, z: -37.2, yawDeg: 91.5 }, { kind: 'sedan', x: -28.3, z: -37.3, yawDeg: 88.5 },
      // (228 r3: the north-east row 3 m and more off the bots' diagonal to line-2; the east kerb's two left out)
      // (228 r4: the lot is the north market's now) one car at its north end
      { kind: 'sedan', x: -12.6, z: 34.6, yawDeg: 0.6 },
    ],
    bayMarks: [],
    // (228 r2: the column's pair out on the granite band either side of its forecourt, wide of the plaques; the north
    // quarter's corner lamp between its trunks; the Brunnenplatz's off the basin's rim; the east one off the kerb parking)
    // (228 r3: the column's pair stood in its entry views) behind the column now, either side of its hedge's ends
    lamps: [
      [-73.4, 30.4], [-59.6, 22.45], [-82.8, 18.05], [-61.2, -23.8], [-82.8, -22.45], [-56.8, 42.4],
      [-41.0, 9.9], [-27.5, -11.0], [-16.5, 26.0], [-64.5, 9.25], [-66.66, -20.37],
      // (228 r4) on the Hauptstrasse's edge where the r3b bench stood between the bots' two lanes (its footprint was in one)
      [-17.4, 9.6],
    ].map(([x, z]) => ({ kind: 'lamp', x, z, yawDeg: 0 })),
    fountainRing: { x: -62, z: 47, r: 5.5 },
    steps: [{ x: -75.8, z: 39.9, width: 6, yawDeg: 180, count: 2, rise: 0.12 }],
    lawns: [NW, SW],
  }],
};
