// src/world/maps/moon.ts — Earthrise Basin, redesigned 2026-10-02 (maps-and-layouts lane B; docs/MAP-LAYOUT-BRIEF.md).
// The regolith palette, the airless sky with its Earth, the outpost's modules and the name are the map's identity and
// stay; the ground under them is new. The old basin let each team's pad see the other across open ground, offered two
// lanes, and stood its research outpost off to one side with one module far from any track.
//
// Reference: the Taurus-Littrow valley of Apollo 17 (December 1972): a flat-floored valley between two massifs, its floor
// pitted with craters of every size (Camelot, Horatio, Shorty), boulders shed from the massif flanks, and the landing
// site in the middle of the floor with the rover tracks radiating from it.
//
// The story on the ground: the valley runs west to east between the South and North massifs, each team assembling
// behind one of them. The massifs are each broken by one saddle where a rover track climbs over to the valley floor.
// The floor is a mare plain pitted with craters (bowls with raised rims and their ejecta), and the research outpost
// stands in the middle of it round its landing field, where the tracks meet.
//
// The layout is rotationally symmetric about the landing field (0, 0) in its massifs, craters, tracks, pads,
// strongpoints and objectives: alpha deploys behind the South Massif west of its saddle, bravo behind the North Massif
// east of its saddle, so neither saddle opens a view from pad to pad. The zone-control discs stand on the landing field
// (also the turbo-ball kickoff) and on two crater-free stretches of the floor either side of it.
import mars from './mars.ts';
import type { MapCompositionConfig } from './contracts.ts';
import { APOLLO_SITE, EARTHRISE_STATION, EARTH_SKY, EXCAVATION_FRONT, ISRU_PLANT, RELAY_REPEATERS, STATION_DOMES, SUN_SKY, roverTrack, stationTracks } from './earthriseStation.ts';
import { LUNAR_STRUCTURE_VARIANTS } from './regional/lunarWorks.ts';
// (2026-10-10, the map-revival lane; wave 346: "icy-blue crater-free regolith") the regolith a neutral, faintly warm grey,
// not a blue one: hue 0.60 -> 0.09, saturation 0.025 -> 0.012
const grey = (_h: number, _s: number, l: number): [number, number, number] => [0.09, .012, .30 + l * .35];
/** (the Earthrise 228 rebuild) the regolith the station's wheels and dozers turned over: a shade darker than the gardened
 * surface, as the disturbed ground round every Apollo site photographs (the worn channel: the yards, the excavation
 * strips, the tracks' shoulders). */
const turned = (_h: number, _s: number, l: number): [number, number, number] => [0.09, .014, .24 + l * .32];
/** A painted ring of radius `r` round the landing field's centre, in `n` straight runs closed on itself. */
const ring = (r: number, n: number): Array<[number, number]> =>
  Array.from({ length: n + 1 }, (_, i) => [Math.round(Math.sin((i / n) * Math.PI * 2) * r * 100) / 100, Math.round(Math.cos((i / n) * Math.PI * 2) * r * 100) / 100]);
/** An approach chevron on the landing field's axis at `d` m out along (ux, uz), its point toward the centre. */
const chevron = (ux: number, uz: number, d: number): Array<[number, number]> =>
  [[ux * (d + 3) - uz * 4, uz * (d + 3) + ux * 4], [ux * d, uz * d], [ux * (d + 3) + uz * 4, uz * (d + 3) - ux * 4]];
/**
 * (round 2, 2026-10-18; the blind critics on the frames from the landing field: "the foreground is empty", "a large flat
 * featureless foreground") the landing field's paint (world/groundMarkings.ts): the pad's edge line, the touchdown ring
 * and the inner ring round the kickoff, an approach chevron on each axis and the station's number at the ring's north and
 * south, each the other's rotation — white and safety yellow, worn by the dust the landers blow across it.
 */
/** A hash in [0, 1) of an integer (the blast's streaks are fixed by their index). */
const frac = (i: number, k: number): number => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
/**
 * (round 3, 2026-10-18; the blind judge: "a bare white pad line crosses an empty foreground") the landers' blast across
 * the pad: forty soot streaks radiating from the touchdown point out to 11-20 m, overlapping into a dark core round it,
 * and two rings of scorch at the core — laid under the paint, so the rings and the chevrons stand over the burn.
 */
const BLAST_SOOT = [
  ...Array.from({ length: 40 }, (_, i) => {
    const a = (i / 40) * Math.PI * 2 + (frac(i, 1) - 0.5) * 0.12, r0 = 2.5 + 2.5 * frac(i, 2), r1 = 11 + 9 * frac(i, 3);
    const p = (r: number): [number, number] => [Math.round(Math.sin(a) * r * 100) / 100, Math.round(Math.cos(a) * r * 100) / 100];
    return { points: [p(r0), p(r1)], width: Math.round((0.9 + 1.5 * frac(i, 4)) * 100) / 100, paint: 'soot' as const, round: 0 };
  }),
  { points: ring(3.4, 24), width: 2.6, paint: 'soot' as const, round: 0.4 },
  { points: ring(6.2, 32), width: 2.2, paint: 'soot' as const, round: 0.5 },
];
const LANDING_FIELD_PAINT = {
  lines: [
    ...BLAST_SOOT,
    { points: [[-33, -33], [33, -33], [33, 33], [-33, 33], [-33, -33]] as Array<[number, number]>, width: 0.45, paint: 'white' as const, round: 1.5 },
    { points: ring(21, 48), width: 0.7, paint: 'white' as const, round: 0.5 },
    { points: ring(6.5, 24), width: 0.35, paint: 'yellow' as const, round: 0.3 },
    ...([[0, 1], [1, 0], [0, -1], [-1, 0]] as const).map(([ux, uz]) => ({ points: chevron(ux, uz, 25), width: 0.6, paint: 'yellow' as const, round: 0.4 })),
  ],
  numbers: [
    { x: 0, z: -13.5, headingDeg: 0, text: '17', height: 3.6, paint: 'white' as const },
    { x: 0, z: 13.5, headingDeg: 180, text: '17', height: 3.6, paint: 'white' as const },
  ],
  slabM: 0,
};
const MOON_ROADS: Array<Array<[number, number]>> = [
  // 0 — the north-south rover track: from the south edge over the South Massif's saddle to the landing field, and on
  // over the North Massif's saddle to the north edge (its two halves are each other's rotation).
  [[150, -448], [136, -400], [118, -340], [100, -280], [76, -220], [48, -150], [24, -80], [0, 0], [-24, 80],
    [-48, 150], [-76, 220], [-100, 280], [-118, 340], [-136, 400], [-150, 448]],
  // 1 — the west-east rover track along the valley floor through the landing field.
  [[-448, 70], [-380, 64], [-300, 50], [-220, 34], [-150, 20], [-80, 8], [0, 0], [80, -8], [150, -20], [220, -34],
    [300, -50], [380, -64], [448, -70]],
  // 2 / 3 — the survey loops: from the landing field round the craters on each side and back to the long track.
  [[-80, 8], [-120, -60], [-200, -110], [-290, -96], [-330, -40], [-320, 10], [-300, 50]],
  [[80, -8], [120, 60], [200, 110], [290, 96], [330, 40], [320, -10], [300, -50]],
];
/** A point and its rotation about the landing field. */
const both = (pts: ReadonlyArray<readonly [number, number]>): Array<Array<[number, number]>> =>
  [pts.map(([x, z]): [number, number] => [x, z]), pts.map(([x, z]): [number, number] => [-x, -z])];
/**
 * (round 3, 2026-10-18; the blind judge: "few roads or cables linking them", "the foreground is flat and featureless")
 * the station's service tracks (earthriseStation.ts stationTracks) and the rovers' longer tracks, each with its rotation:
 * from the power masts round the berms to the long track, along the tank farms' solar arrays, from each deployment's
 * pads over its scarp to the north-south track (the frames from the pads lead down them to the station), and from
 * Challenger's gate and the excavation front out to the survey loops; the oxygen works' spur to the long track.
 */
const ROVER_TRACKS = [
  ...stationTracks(),
  ...[
    ...both([[133, 14], [142, 2], [143.5, -18.5]]),
    ...both([[128, -112], [125, -68], [119, -34], [118.5, -14.6]]),
    ...both([[-60, -412], [-56, -362], [-42, -300], [-12, -232], [22, -178], [40, -131]]),
    ...both([[136.7, 205], [128, 178], [140, 122], [160, 86]]),
    [[46, -61], [19.6, -62]] as Array<[number, number]>,
  ].flatMap((pts) => roverTrack(pts)),
];
/** The ejecta blocks' breccia (sceneryRocks.ts 'breccia'): a neutral grey a shade under the regolith, dust at the foot. */
const LUNAR_BRECCIA: readonly [number, number, number] = [0.09, 0.04, 0.33];
export default {
  id: 'moon', name: 'Earthrise Basin',
  blurb: 'Lunar crater rims, a research outpost and long shadows beneath a vast blue Earth',
  terrain: {
    hillScale: .40, microScale: .46, rimH: 24, marshes: [], lakes: [], fieldTrenches: false,
    // the outpost round its landing field
    village: { x0: -95, x1: 95, z0: -95, z1: 95, cx: 0, cz: 0, feather: 35, flatten: .9 },
    // (the Earthrise 228 rebuild) the turned regolith keeps to the station's working ground — each plot's yard and pad, the
    // excavation front's two strips — and the rest of the floor stays the gardened grey (workedGroundMask.ts)
    villageWear: 'activity-patches',
    yardWear: EARTHRISE_STATION.map(({ x, z, yawDeg }) => ({ x, z, w: 26, l: 30, yawDeg })),
    workedGround: [
      // the excavation front's two graded strips, along the front's long axis either side of it
      { boundary: [[-186.6, -225.6], [-178.8, -214.0], [-129.0, -247.6], [-136.8, -259.2]], feather: 6, strength: 0.9 },
      { boundary: [[-162.1, -207.2], [-155.4, -197.2], [-122.3, -219.6], [-129.0, -229.6]], feather: 6, strength: 0.9 },
    ],
    // the landing field: a level apron where the zone-control disc and the turbo-ball kickoff seat
    hardstands: [{ x: 0, z: 0, width: 72, length: 72, yawDeg: 0, grade: 0 }],
    roads: { paths: MOON_ROADS },
    landforms: [
      // The South and North massifs, each broken by its saddle (rotation pairs): the south massif's west and east
      // blocks leave the saddle at x 70..160; the north massif's at x -160..-70.
      // (the Earthrise 228 rebuild, 2026-10-18; the 10-12 report: "massifs that are snowbanks") each block a lobe of the
      // Lee-Lincoln thrust scarp on its old seat, length, height and saddle: a rounded crest, its steep face to the floor
      // (about 20 degrees at the steepest, drivable), a long even back slope down to the deployments (landformGeology.ts
      // scarpProfile), knobbly under its regolith and rilled on its face
      ...([[-230, -345, 520, 130, 13, -3, 1], [330, -340, 300, 120, 11, 4, 1], [230, 345, 520, 130, 13, -3, -1], [-330, 340, 300, 120, 11, 4, -1]] as const)
        .map(([x, z, length, width, height, yawDeg, face]) => ({ kind: 'ridge', x, z, length, width, height, yawDeg, corridorScale: 1,
          geology: { profile: 'scarp' as const, face, outline: 0.08, rough: 0.45, gullies: { count: 5, depthM: 0.9, width: 0.4 } } })),
      // The craters of the valley floor (rotation pairs): each a bowl inside a raised rim of ejecta. The last pair
      // (2026-10-03) keeps the middle lane's cover over the layout brief's band once the map-borders lane's edge
      // pass had moved the props beside it (0.156 -> 0.146; now 0.164).
      // (the Earthrise 228 rebuild) the pair in the base, (±74, ±34), graded away under the station's plots: their cover is
      // the station's buildings now
      ...[[-230, -150, 56, 16], [205, -190, 40, 12], [-70, -230, 34, 10], [320, -150, 46, 13], [-120, 165, 30, 9],
        [-60, -110, 22, 7], [-5, -122, 20, 6], [200, -75, 20, 6]]
        .flatMap(([x, z, r, depth]) => [
          { kind: 'knoll', x, z, r: r * 1.32, height: depth * 0.62, settlementScale: 1, corridorScale: 1 },
          { kind: 'basin', x, z, r, height: -depth * 1.45, settlementScale: 1, corridorScale: 1 },
          { kind: 'knoll', x: -x, z: -z, r: r * 1.32, height: depth * 0.62, settlementScale: 1, corridorScale: 1 },
          { kind: 'basin', x: -x, z: -z, r, height: -depth * 1.45, settlementScale: 1, corridorScale: 1 },
        ]),
      // (the Earthrise 228 rebuild) the station's regolith berms — radiation and blast shielding banked up by the dozers,
      // 2.4-2.6 m high, in rotation pairs, laid across the deployments' axis where the middle of the floor was open
      // ground (the layout brief's middle sector, cover .168 at 227): north of the habitat row and its rotation, between
      // the apron and the habitats, beyond the logistics yard and its rotation; each toe outside the 30 m disc an objective
      // seats on (matchPlacement.ts: under 20 degrees everywhere in it). Terrain: cover with no collision records.
      // (round 3, 2026-10-18) the pair north and south of the apron gave its seats to the station's commons (STATION_DOMES)
      // (round 3; the blind judge: "the dark flat-topped berm ... looks like an untextured slab", "dark rectangular berm
      // shadows") dozed banks, not ruled dykes: each long bank pushed up as two heaps a little apart in line and height, every
      // heap turned a few degrees off the axis, its crest a rounded ridge (a twentieth of the half-width level, was three
      // tenths), its plan lobed and its back knobbly with the clods the blade left — the face the sun leaves falls at 23
      // degrees at the steepest, under the sun's 25 across the bank, so it takes the low light at a graze instead of one
      // black slab and its shadow ends at its foot; the heaps keep the banks' seats, lengths and the layout brief's cover
      ...([
        [52, 16, 18, 2.4, 5], [-69, 103, 18, 2.5, 7], [-54, 105.5, 16, 2.3, -6], [-127, -5, 15, 2.5, -8], [-114, -7, 13, 2.4, 6],
        [-102, 107, 13, 2.5, 6], [-90.5, 109.5, 13, 2.3, -7], [61, -28, 14, 2.4, -6], [98, 128, 20, 2.5, 4],
      ] as const).flatMap(([x, z, length, height, yawDeg]) => [x, -x].map((bx, k) => ({
        kind: 'ridge', x: bx, z: k ? -z : z, length, width: 7, height, yawDeg, corridorScale: 1, settlementScale: 1,
        geology: { profile: 'dyke' as const, crest: 0.05, outline: 0.2, rough: 0.5 } }))),
    ],
  },
  spawns: {
    // Alpha assembles behind the South Massif west of its saddle; bravo's seven pads are its rotation behind the North
    // Massif east of its saddle.
    player: { x: -60, z: -420 },
    enemies: [
      { x: -60, z: 440 }, { x: 0, z: 410 }, { x: 60, z: 440 }, { x: 120, z: 410 },
      { x: 180, z: 440 }, { x: 30, z: 400 }, { x: 90, z: 400 },
    ],
  },
  splat: { ...mars.splat, sourcedPalette: 'moon', sandstone: false,
    grassTone: grey, dirtTone: turned, rockTone: grey, mudTone: grey,
    // (wave 346) the macro tints neutral (they leaned blue: B/R 1.06-1.07), each at its luminance
    tintA: [.957,.957,.955], tintB: [.838,.838,.836], tintC: [1,1,1], roadTint: [.776,.776,.774], rippleAmp: .05, strata: 0,
    // (2026-10-11, the map-revival lane; wave 380: "a high-frequency wavy normal-map pattern that reads as crumpled foil or
    // rippled water") under the hard 20-degree sun the sand set's lumps and Mars's 1-5 m dapple shaded as foil: the detail
    // normal at 0.4 of its strength and the dapple at a third of Mars's (midRelief .6 -> .2) — fine powder, gardened smooth
    detailNormal: 0.4, midRelief: 0.2,
  },
  vegetation: { ...mars.vegetation },
  // (the Earthrise 228 rebuild, 2026-10-18) the props written out in full: the Moon no longer spreads Mars's, so a later Mars
  // change never reaches it; every value it used is copied (the inhabit block, the field-works settings, the tones), and
  // what changes is the station: Taurus-Littrow Station's plan built by its own kit, its set pieces, and every terrestrial
  // form dressed in the station's stock
  props: {
    // the station: Taurus-Littrow Station's plan (maps/earthriseStation.ts), built by its own kit (maps/regional/littrow.ts)
    architecture: 'littrow',
    plannedSites: EARTHRISE_STATION,
    // the landing field's paint (LANDING_FIELD_PAINT, above)
    groundMarkings: { ...LANDING_FIELD_PAINT, lines: [...LANDING_FIELD_PAINT.lines, ...ROVER_TRACKS] },
    plan: [],
    sourcedPalette: 'winter',
    yardClutter: false,
    // the four light station kinds the plan keeps: the solar arrays beside the tank farms, each the other's rotation,
    // turned to the sun (earthriseStation.ts SUN_SKY)
    orbitalSettlement: [
      { id: 'farm-power-a', structure: 'solararray', x: 124, z: -62, yawDeg: SUN_SKY.azimuthDeg },
      { id: 'farm-power-b', structure: 'solararray', x: 128, z: -118, yawDeg: SUN_SKY.azimuthDeg },
      { id: 'farm-power-c', structure: 'solararray', x: -124, z: 62, yawDeg: SUN_SKY.azimuthDeg },
      { id: 'farm-power-d', structure: 'solararray', x: -128, z: 118, yawDeg: SUN_SKY.azimuthDeg },
    ],
    // the outpost's own module families are its strongpoints' structures
    destructibleBuildings: ['habmodule', 'commsmast', 'fueltanks'],
    // Three strongpoint pairs, each the other's rotation about the landing field: the track posts below the saddles,
    // the crater-rim masts on the survey loops, the fuel caches on the long track.
    tacticalBeats: [
      { id: 'south-saddle-post', role: 'brawl', x: 75, z: -118, yawDeg: -20, structure: 'habmodule', redoubt: true,
        outcrop: { count: 5, radius: 9 } },
      { id: 'north-saddle-post', role: 'brawl', x: -75, z: 118, yawDeg: 160, structure: 'habmodule', redoubt: true,
        outcrop: { count: 5, radius: 9 } },
      { id: 'west-crater-mast', role: 'scout', x: -180, z: -40, yawDeg: 0, structure: 'commsmast',
        outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      { id: 'east-crater-mast', role: 'scout', x: 180, z: 40, yawDeg: 180, structure: 'commsmast',
        outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      { id: 'west-fuel-cache', role: 'support', x: -340, z: 100, yawDeg: 90, structure: 'fueltanks', redoubt: true,
        outcrop: { count: 4, radius: 8 } },
      { id: 'east-fuel-cache', role: 'support', x: 340, z: -100, yawDeg: -90, structure: 'fueltanks', redoubt: true,
        outcrop: { count: 4, radius: 8 } },
    ],
    // the set pieces: Challenger's site kept as found (the hero), the oxygen works and its excavation front at the site's
    // rotation, the two solar towers on the scarp's crests turned to the low sun (landmarks/lunar.ts)
    landmarks: [
      { kind: 'apolloSite' as const, ...APOLLO_SITE, name: "Challenger's site, Apollo 17" },
      { kind: 'isruWorks' as const, ...ISRU_PLANT, name: 'the oxygen works' },
      { kind: 'isruWorks' as const, ...EXCAVATION_FRONT, params: { part: 'front' }, name: "the oxygen works' excavation front" },
      { kind: 'solarTower' as const, x: 300, z: -342, yawDeg: SUN_SKY.azimuthDeg, name: 'the solar tower on the south scarp' },
      { kind: 'solarTower' as const, x: -300, z: 342, yawDeg: SUN_SKY.azimuthDeg, name: 'the solar tower on the north scarp' },
      // (round 2, 2026-10-18; the blind critics: "the base is small in the mid-distance under a mostly empty sky", "the
      // outpost reads as scattered white specks") the station's own power masts, a rotation pair 24 m high beyond the
      // habitat rows' outer berms, their blankets turned to the sun: the verticals of the station's west and east ends
      { kind: 'solarTower' as const, x: -130, z: -20, yawDeg: SUN_SKY.azimuthDeg, params: { height: 24 }, name: 'the station\'s west power mast' },
      { kind: 'solarTower' as const, x: 130, z: 20, yawDeg: SUN_SKY.azimuthDeg, params: { height: 24 }, name: 'the station\'s east power mast' },
      // (round 3, 2026-10-18; the blind judge from the aerial: "no strong hero landmark") the station's two commons, each
      // a 24 m dome under its shielding collar, its main airlock to the hub (earthriseStation.ts STATION_DOMES)
      ...STATION_DOMES.map((d, i) => ({ kind: 'stationDome' as const, ...d, name: `the station's ${i ? 'south' : 'north'} commons` })),
      // (round 3) the deployments' relay repeaters on the scarps' crests beside the rovers' tracks over them
      ...RELAY_REPEATERS.map((r, i) => ({ kind: 'relayRepeater' as const, ...r, name: `the relay repeater on the ${i ? 'north' : 'south'} scarp` })),
    ],
    // every terrestrial form on the Moon dressed in the station's stock on its own seat (maps/regional/lunarWorks.ts):
    // regolith bags for the sandbags, a keep-out tether for the wire, sintered blocks for the barrier, the beacon, the
    // power box, the cable reel, the dewar, the canister and the mesh wheel for the street clutter, the yards' bag course
    structureVariants: LUNAR_STRUCTURE_VARIANTS,
    // (copied from Mars's props as the Moon used them, 2026-10-18)
    sideSkip: 0.14, spacingPad: 8, buildingLat: [12, 5], maxSpread: 2.0,
    tones: {
      // the bags' geotextile and the station's dusted panels, the sintered regolith's neutral grey (the kit's own tones)
      plaster: (_h: number, _s: number, l: number) => [0.1, 0.025, Math.min(1, 0.42 + l * 0.26)],
      roof: (_h: number, s: number, l: number) => [0.1, Math.min(1, s * 0.2), Math.min(1, l)],
      stone: (_h: number, s: number, l: number) => [0.09, Math.min(1, s * 0.3 + 0.02), Math.min(1, l * 0.95)],
      wood: (_h: number, s: number, l: number) => [0.08, Math.min(1, s * 0.4), Math.min(1, l * 0.9)],
      straw: null,
    },
    rockTone: grey, wallStoneChance: 1.0, wallRuns: [],
    well: false, hayCrates: false, fences: false, telegraph: false, carts: false, logs: false,
    haystacks: 0, rocks: 260, outcrops: 48, craters: 90, rubblePiles: 0, hedgehogs: 0,
    // (2026-10-11, the map-revival lane; wave 380: "the loaf boulder ... never sunk in dust") the surface stones sunk
    // deeper into the regolith banked round them (a share of their height: .22 -> .38)
    rockSink: 0.38,
    // the map-vehicles lane (2026-10-06, the period ruling): no tank hulks — the public fleet has no tank of this
    // front's war; the war shows through the burnt period trucks and carts
    tankWrecks: { era: 'cold-war', count: 0, debris: true, ids: [] },
    sandbagLines: 0,
    // (round 3, 2026-10-18; the blind judge: "the white sandbag stacks on the pad apron are off-palette") the plaza's corner
    // nest stood on the landing field's painted pad: a landing field keeps its pad clear
    plazaNest: false,
    // (the Earthrise 228 rebuild) a stack the variants leave a sandbag (none on the Moon) the regolith's grey, not Mars's ochre
    sandbagTint: [1.0, 1.0, 0.98],
    wallStyle: 'adobe',
    inhabit: {
      stalls: 0, benches: 0, coreClutter: 6,
      pots: 0,
      troughs: 0, laundry: 0, handcarts: 0, carts: 0,
      trucks: 0, jeeps: 0, drumClusters: 8, camps: 0,
      modernClutter: { barrier: 6, roadsign: 0, cone: 6, transformer: 3, cablespool: 4 },
    },
    // 2026-10-06 (the map-vehicles lane, P5): Apollo 17's rover where the crew left it — inside the ring at Challenger's
    // site (the second rover went: Apollo 17 landed one; maps/vehicleSetPieces.ts)
    vehicleSetPieces: [
      { kind: 'lrv' as const, x: 150.5, z: 215.0, yawDeg: 128 },
    ],
  },
  // The hitbox lane (2026-10-08; round 2): the stones' own colliders took from the brief's cover the empty corners their
  // legacy records had counted, and the valley's middle band fell under its band (coverMidShare 0.308 -> 0.296 of
  // 0.30). Three pairs of block fields on the floor, each pair the other's rotation about the landing field and clear of
  // the zone-control discs: the breccia a crater threw out, as round Shorty and Camelot — angular blocks of every size,
  // sunk in the regolith banked against them, chips round their feet (gauntlet wave 272 read the boulder crescents first
  // put there as smooth pale domes).
  scenery: {
    rocks: ([[106, 88, 20], [244, -26, 70], [224, -58, 140]] as const).flatMap(([x, z, yawDeg], i) => [
      { form: 'blocks' as const, geology: 'breccia' as const, x, z, radius: 6, height: 2.6, yawDeg, tone: LUNAR_BRECCIA,
        name: `the ejecta blocks ${['north-east of the outpost', 'on the east floor', 'on the east floor, south'][i]}` },
      { form: 'blocks' as const, geology: 'breccia' as const, x: -x, z: -z, radius: 6, height: 2.6, yawDeg: yawDeg + 180, tone: LUNAR_BRECCIA,
        name: `the ejecta blocks ${['south-west of the outpost', 'on the west floor', 'on the west floor, north'][i]}` },
    ]).concat([
      // (the Earthrise 228 rebuild) the split boulders shed from the massifs, on each scarp lobe's face clear of its saddle:
      // Tracy's Rock on the north lobe (Station 6, Apollo 17), the Nansen boulders at its rotation on the south lobe
      { form: 'blocks' as const, geology: 'breccia' as const, x: -215, z: 296, radius: 7, height: 5.5, yawDeg: 34, tone: [0.09, 0.035, 0.4] as const,
        name: "Tracy's Rock, split on the north scarp" },
      { form: 'blocks' as const, geology: 'breccia' as const, x: 215, z: -296, radius: 7, height: 5.5, yawDeg: 214, tone: [0.09, 0.035, 0.4] as const,
        name: 'the Nansen boulders on the south scarp' },
    ]),
    // (2026-10-11, the map-revival lane; gauntlet wave 380: a crater rim "a smooth ... billowing drift with no strata,
    // blocks or talus ... it reads as a snowbank") the four big craters' rims (and their rotations) carry the breccia their
    // impact threw out — blocks and scree on the rim's steeper ground, none in the bowl
    rockFields: ([[-230, -150, 56], [205, -190, 40], [320, -150, 46], [-70, -230, 34]] as const).flatMap(([x, z, r], i) => [
      { geology: 'breccia' as const, x, z, radius: Math.round(r * 1.45), count: 4, slopeBias: 0.85, size: [1.6, 3.4] as const,
        avoid: [[x, z, Math.round(r * 0.7)]] as const, tone: LUNAR_BRECCIA, name: `the rim blocks of crater ${i + 1}` },
      { geology: 'breccia' as const, x: -x, z: -z, radius: Math.round(r * 1.45), count: 4, slopeBias: 0.85, size: [1.6, 3.4] as const,
        avoid: [[-x, -z, Math.round(r * 0.7)]] as const, tone: LUNAR_BRECCIA, name: `the rim blocks of crater ${i + 5}` },
    ]),
  },
  // (2026-10-11, the map-revival lane; gauntlet wave 380: "an airless sky can't have blue haze"; "a notched black skyline
  // wall at the far edge"; "a flat-topped slab cut into its left skyline"; "fluted, streak-banded mountains"; "the
  // regolith is cool blue-white") the far country the regolith's warm neutral grey (was a blue-grey 0x686b73 / 0x858a94);
  // the Taurus-Littrow massifs smooth, rounded and unbedded under their regolith — the martian far bake's tablelands
  // (its stepped, flat-topped slabs) and strata off, rock only on the steepest faces, and the ring's relief without the
  // bedding and varnish bands; with fogDensity 0 the panorama and the far range take no air (horizonPanorama.ts
  // uAirless, horizonFarRange.ts airless)
  horizon: { baseHex: 0x6a6865, rockHex: 0x86837e, amp: 1.35, style: 'rolling', treeline: 0,
    treelineLayers: 0, ground: 'sand', relief: 'martian', haze: 0, grain: .7, farRange: true,
    // (the Earthrise 228 rebuild, round 3, 2026-10-18; the blind judge: "vertical, repeating stripes from stretched texture"
    // on the far ridge, poses 3, 6, 7, 8) the stripes were the martian character's erosion octaves — Clay John's gullies,
    // waves across the slope 35 m deep at 600 and 300 m, lit apart by the low sun with no air to soften them: the
    // massifs of Taurus-Littrow are gardened smooth under their regolith, so the Moon's far country takes no gullies
    panorama: { tables: false, strata: 0, rockSlope: 0.62, sharp: 0.85, gullyM: 0 },
    reliefCover: { varnish: 0, beds: 0 },
    // the mountains lane (2026-10-02): the moon keeps its own walls — the carved landform drew straight-flanked
    // pyramids on these airless ranges (the skyline cone measure, horizonMassif.selftest.mjs: 0 -> 13 over three seeds)
    massif: false },
  // (the Earthrise 228 rebuild, 2026-10-18; the 10-12 report: "the light comes out of the Earth") the Earth apart from the
  // sun (sky.ts uPlanetDir / uPlanetPhase), 12 degrees across (the earthriseCrossing floor, was 18); round 1 hung it at
  // its true bearing (240, over the open west, 22 up) under a sun from the east (92, 18 up)
  // (round 2, 2026-10-18; the blind critics: "Earth has left the frame", "the habs are dark and backlit", "the shaded
  // hills read as snow-blue") the Earth and the sun from the station's sky (earthriseStation.ts EARTH_SKY / SUN_SKY): the
  // Earth in the north-north-east over the North Massif, 18 up, the sun 20 up in the south-east, 97 degrees apart (the
  // Earth a little more than half lit); the shade light the regolith's own grey (shadeHex: the black sky lends no blue)
  sky: { skyIntensity: 0, nightSky: 1, galaxy: .35, nebulaHex: 0, earth: 1, planetDeg: 12, planetHex: 0x8abdff,
    earthAzimuthDeg: EARTH_SKY.azimuthDeg, earthElevationDeg: EARTH_SKY.elevationDeg, shadeHex: 0x948f88,
    // (2026-10-10, the map-revival lane; wave 346: "flat shadowless light") an airless sky gives the sun no help: the sky's
    // fill and the bounce come down (hemi .38 -> .12, fill .16 -> .05, environment .3 -> .15), so the shadows are the hard
    // black of the photographs, and a lower sun (28 -> 20 deg) draws them long across the crater floors and rims
    sunElevationDeg: SUN_SKY.elevationDeg, sunAzimuthDeg: SUN_SKY.azimuthDeg, turbidity: 1, rayleigh: 0, mieCoefficient: 0,
    fogDensity: 0, fogMix: 0, envIntensity: .15, cloudOpacity: 0, cloudOpacity2: 0, cloudShadowAmp: 0,
    // (2026-10-11) the sun white, not blue-white (0xf1f4ff), and the air's tint the regolith's neutral grey where a law
    // reads one (the horizon's sky term, the default 0x8fa3bd tinted it blue)
    sunIntensity: 3.5, sunColorHex: 0xfffaf2, hemiIntensity: .12, fillIntensity: .05, postExposure: .98, fogTintHex: 0x76746f,
    atmosphere: { rayleighScale: 0, mieScale: 0, ozoneScale: 0, groundAlbedoHex: 0x6b6a68 },
  },
  minimap: { ...mars.minimap, base: [108,111,118], hard: [145,148,155], soft: [90,93,100],
    roadFill: 'rgba(180,185,195,.95)', roadCasing: 'rgba(60,65,75,.9)' },
  shot: { pos: [-175,38,-195], look: [110,167.55,65] },
} satisfies MapCompositionConfig;
