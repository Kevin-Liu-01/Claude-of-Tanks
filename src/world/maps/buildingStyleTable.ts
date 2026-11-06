// src/world/maps/buildingStyleTable.ts — the building-style table (item buildings-270, the owner 2026-11-05: "update all of
// our buildings and structured to amke them look better and customize all buildings on maps to look more correct").
//
// One row per battlefield: the real place and era its buildings stand for, and what the photographs of that place show —
// roof forms, coverings and pitch; facade materials and colours; storeys and storey heights; window rhythm; doors and
// shopfronts; ornament; weathering and damage dress — with the photographs themselves (`references`). The rows are typed
// over MapId, so a battlefield without a row fails typecheck.
//
// What a row drives (data only, THREE-free: the sim and the headless builds read it):
//   - `kit`: the regional architecture kit the map's buildings are rebuilt by (the map's `props.architecture`, read from here);
//   - `weathering.damp` / `.moss` and `damage.wear`: the kit's weathering strengths and war-wear share on this map
//     (regional/index.ts buildRegionalParts; decor only, never collision);
//   - `facade.core`: what the walls are made of, for the ram law (sim/structureMaterial.ts) and the breach the damage kit draws.
// The rest is the row's measure of its kit: buildingStyleTable.selftest.mjs builds every kit's houses
// (tools/building-style-reading.mjs) and holds the row's storeys, storey heights, roof forms and pitch, and window bays to
// what the kit builds, so a row never says what its kit does not build. `references` are the photographs that govern.
import type { MapId } from './mapIds.ts';
import type { ArchitectureId } from './regional/index.ts';
import type { BuildingVariation } from './regional/appearance.ts';

/** A roof form the place builds (house.ts RoofKind plus the forms the kits lay in their own code). */
export type RoofForm = 'gable' | 'hip' | 'halfhip' | 'flat' | 'shed' | 'vault' | 'dome' | 'sawtooth' | 'pyramid' | 'curved' | 'mansard';
/** What the walls are, under any render: the ram law's material (sim/structureMaterial.ts). */
export type WallCore = 'adobe' | 'masonry' | 'concrete';
type Hex = `#${string}`;
type Range = readonly [number, number];

/** A photograph that governs a row: its file page, author and license, and what it shows that matters. */
export interface StyleReference {
  readonly url: string;
  readonly author: string;
  readonly license: string;
  readonly shows: string;
}

export interface BuildingStyleRow {
  readonly setting: { readonly country: string; readonly region: string; readonly era: string };
  readonly kit: ArchitectureId;
  /** the forms the place's buildings take (at least one the kit builds), their covering, the pitch of the pitched ones */
  readonly roof: { readonly forms: readonly RoofForm[]; readonly covering: string; readonly pitchDeg: Range | null; readonly colours: readonly Hex[] };
  readonly facade: { readonly materials: string; readonly core: WallCore; readonly colours: readonly Hex[] };
  /** storeys over the ground and the storey height (floor to floor, metres) of the place's houses */
  readonly storeys: Range;
  readonly storeyM: Range;
  /** the window rhythm: its prose, the centre spacing of a storey's windows (metres; null where windows are rare) */
  readonly windows: { readonly rhythm: string; readonly bayM: Range | null; readonly shutters: string | null };
  readonly doors: string;
  readonly shopfronts: string | null;
  readonly ornament: string;
  /** rising damp and splash at the wall foot (0 arid – 1 wet) and moss/lichen toward the eaves (0 – 1), as the kit's
   *  weathering paints them on this map */
  readonly weathering: { readonly damp: number; readonly moss: number; readonly note: string };
  /** the share of houses showing war damage (burnt and boarded windows, stripped roof patches) and what that dress is */
  readonly damage: { readonly wear: number; readonly dress: string };
  /**
   * the walls' surface and depth as the photos show them: `grime` how dark the foot, the eaves' rain shadow and the runs
   * off the sills weather (1: the facade craft's own); `patches` the share of houses whose render shows its losses and
   * repairs (the stone under it); `tileRelief` the roof covering's relief (its normal map's scale; 1: the painter's own);
   * `reveal` and `eave` the least reveal depth of the openings and eaves overhang of the place's houses (metres), which
   * their kit's houses keep (buildingStyleTable.selftest against the pinned reading). Decor and material only: no fetch is
   * added and no collision moves.
   */
  readonly surface: { readonly grime: number; readonly patches: number; readonly tileRelief: number; readonly reveal: number; readonly eave: number };
  /** what the map's buildings vary in (regional/appearance.ts pickLook): the named dress axes its kit reads and the roofs'
   *  age spread; no two neighbours share every feature */
  readonly variation: BuildingVariation;
  readonly references: readonly StyleReference[];
}

export const BUILDING_STYLES = {
  verdant: {
    setting: { country: 'Russia', region: 'Belgorod black-earth steppe (Prokhorovka)', era: 'July 1943' },
    kit: 'kolkhoz',
    roof: { forms: ['hip', 'gable'], covering: 'reed and straw thatch on the khatas; corrugated asbestos-cement or iron sheet on the kolkhoz brick', pitchDeg: [25, 48], colours: ['#8a7d68', '#6b5d4c', '#5c5a52'] },
    facade: { materials: 'wattle-and-daub or saman under limewash, a dark clay plinth band; kolkhoz red brick; plank gables', core: 'adobe', colours: ['#e6e4da', '#c9c5b8', '#9a3f2c', '#3a2b22'] },
    storeys: [1, 2], storeyM: [2.2, 3.2],
    windows: { rhythm: 'two or three small near-square casements a side, widely spaced, painted surrounds', bayM: [1.6, 3.6], shutters: 'painted plank shutters, blue or green' },
    doors: 'plank door under a small porch on the yard side', shopfronts: null,
    ornament: 'carved and painted window surrounds, an onion-domed church and its belfry',
    weathering: { damp: 0.8, moss: 0.5, note: 'clay splash at the foot, grey thatch, green-grey asbestos' },
    damage: { wear: 0.2, dress: 'burnt and boarded windows, thatch torn back to the battens' },
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 1.0, patches: 0.55, tileRelief: 1.0, reveal: 0.15, eave: 0.5 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Russia,_Koltunovka_Fortepan_27289.jpg', author: 'Fortepan, donor Konok Tamás id.', license: 'CC BY-SA 3.0',
        shows: 'Koltunovka (Belgorod oblast) 1942 colour slide: street of single-storey whitewashed khatas under hipped reed/straw thatch, plank gable, wattle fences, shadoof well; mud street' },
      { url: 'https://commons.wikimedia.org/wiki/File:Russia,_Koltunovka_Fortepan_27716.jpg', author: 'Fortepan, donor Konok Tamás id.', license: 'CC BY-SA 3.0',
        shows: 'low limewashed clay khata under thick hipped thatch with ragged eaves, two small paired-casement windows with dark frames and white surrounds, clay chimney through the ridge; chalk hills behind' },
      { url: 'https://commons.wikimedia.org/wiki/File:Russia,_Koltunovka_Fortepan_27631.jpg', author: 'Fortepan, donor Konok Tamás id.', license: 'CC BY-SA 3.0',
        shows: 'village centre: rendered kolkhoz/public buildings with hipped sheet or plain roofs, gabled porch building with wooden posts and boarded gable, whitewashed house with hipped thatch-replacement roof' },
    ],
  },
  desert: {
    setting: { country: 'Tunisia', region: 'Dahar plateau (Ouled Soltane, Hadada, Chenini)', era: 'the twentieth century' },
    kit: 'ksar',
    roof: { forms: ['vault', 'flat', 'dome'], covering: 'rendered barrel vaults on the ghorfas; flat earth or concrete roofs behind parapets; whitewashed domes', pitchDeg: null, colours: ['#c79a5a', '#efe9dd'] },
    facade: { materials: 'rubble in gypsum-lime mortar under a mud-lime render, ochre to buff; whitewash on mosques and some houses', core: 'adobe', colours: ['#c79a5a', '#a87842', '#d8b47a', '#efe9dd', '#2e5f9e'] },
    storeys: [1, 4], storeyM: [2.0, 3.2],
    windows: { rhythm: 'ghorfas windowless, one small door a cell; houses a few small square windows behind blue grilles', bayM: null, shutters: 'blue or green painted grilles' },
    doors: 'studded plank doors painted blue, palm-trunk lintels; small timber hatches to the cells', shopfronts: 'the ghorfa souk: cells open on the court',
    ornament: 'white lime bands round the cell doors, hoisting beams, steep stair ramps up the stacks',
    weathering: { damp: 0.25, moss: 0.05, note: 'render worn back to the rubble at the foot and the vault crowns; no green' },
    damage: { wear: 0.15, dress: 'collapsed vaults and cells, render sheets fallen' },
    variation: { axes: { paint: ['#2e5f9e', '#3a7ab0', '#4e7a5a'] }, roofAge: [0, 1] },
    surface: { grime: 0.6, patches: 0.6, tileRelief: 1.0, reveal: 0.3, eave: 0 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Ksar_Ouled_Soltane_01.jpg', author: 'Ian Sewell', license: 'CC BY 2.5',
        shows: 'Ksar Ouled Soltane: ghorfa cells stacked 3-4 high with barrel-vaulted (rounded) tops, ochre mud-lime render, cantilevered stone/clay stairs up the faces, small plank doors, palm-trunk beams projecting as hoist poles' },
      { url: 'https://commons.wikimedia.org/wiki/File:Ksar_Hadada_3.jpg', author: 'Ciriltoul', license: 'Public domain',
        shows: 'Ksar Hadada ghorfas: rounded vault ends, door and hatch openings outlined in white lime bands, grey-buff render patched to stone; flat-topped dwellings and arid plateau behind' },
      { url: 'https://commons.wikimedia.org/wiki/File:Views_of_Ksar_Hadada_from_the_minaret_of_the_mosque-4.jpg', author: 'Mohatatou', license: 'CC BY-SA 4.0',
        shows: 'modern Ksar Hadada from the minaret: one/two-storey flat-roofed rendered houses, white and sand-buff, parapets, blue doors/shutters, rooftop stair huts, walled courtyards on bare ground' },
    ],
  },
  winter: {
    setting: { country: 'Poland', region: 'Podhale under the Tatra (Nowy Targ to Zakopane)', era: 'winter 1945' },
    kit: 'goral',
    roof: { forms: ['gable', 'halfhip'], covering: 'split spruce shingle (gont), a shingled skirt over the walls; patches of galvanised sheet', pitchDeg: [45, 60], colours: ['#6e685d', '#574334'] },
    facade: { materials: 'squared spruce logs, dovetailed, moss-chinked, on a low granite footing', core: 'masonry', colours: ['#574334', '#7a5a3e', '#9d9690', '#b39e86'] },
    storeys: [1, 2], storeyM: [2.4, 3.0],
    windows: { rhythm: 'small near-square four- or six-pane casements, two or three a room, symmetric about the door', bayM: [1.4, 3.2], shutters: null },
    doors: 'plank door under the gable, a porch on posts', shopfronts: null,
    ornament: 'the sunburst on the boarded gable, carved purlin ends, a ridge spike',
    weathering: { damp: 0.7, moss: 0.55, note: 'logs silvered on the weather side, dark at the foot' },
    damage: { wear: 0.3, dress: 'burnt and boarded windows, shingle torn back' },
    variation: { axes: { gable: ['sunburst', 'star', 'spike'], surround: ['pale', 'white', 'blue'] }, roofAge: [0.15, 1] },
    surface: { grime: 0.8, patches: 0.7, tileRelief: 1.15, reveal: 0.2, eave: 0.5 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Chocholow_75.jpg', author: 'JiriMatejicek', license: 'CC BY-SA 4.0',
        shows: 'Chochołów 75: single-storey squared-spruce log house, eaves-side to street, steep (~50 deg) hipped/half-hipped roof in silvered wooden shingle, small gabled porch roof over central door, three small windows each side, picket fence' },
      { url: 'https://commons.wikimedia.org/wiki/File:Chocholow_101.jpg', author: 'JiriMatejicek', license: 'CC BY-SA 4.0',
        shows: 'Chochołów 101: gable end with sunburst-pattern boarded gable and two small vents, steep roof now re-covered in corrugated galvanised sheet over the shingle lines; log walls on low stone footing, weathered grey-brown' },
      { url: 'https://commons.wikimedia.org/wiki/File:Zakopane_Droga-do_Rojow_6_dom_drewniany_01_A-1100_M.JPG', author: 'Januszk57', license: 'CC BY-SA 3.0 pl',
        shows: 'Zakopane, Droga do Rojów 6: Zakopane-style log house, very steep shingled roof with broken pitch (steeper upper, flatter lower apron), carved boarded gable with sunburst and pazdur finial, arched porch, paired small-pane windows' },
    ],
  },
  urban: {
    setting: { country: 'Germany', region: 'Upper Franconia and Saxony (Kronach, Meissen)', era: 'April 1945' },
    kit: 'franconian',
    roof: { forms: ['gable', 'hip', 'halfhip'], covering: 'red-brown beaver-tail plain tile, eyebrow and gabled dormers', pitchDeg: [45, 60], colours: ['#8a2e24', '#9a4a32'] },
    facade: { materials: 'sandstone or rendered ground storeys with timber-framed upper storeys; smooth lime render in ochre, cream, grey-green and salmon', core: 'masonry', colours: ['#ece7dc', '#c9b48c', '#d9b84e', '#7c8a74', '#d77a5c', '#a4a29e'] },
    storeys: [2, 5], storeyM: [2.8, 3.6],
    windows: { rhythm: 'regular vertical bays, three to six a front, 2:3 multi-pane casements', bayM: [1.6, 2.8], shutters: 'some louvred shutters, grey-green or white' },
    doors: 'arched stone door surrounds, carriage gates', shopfronts: 'ground-floor shops with name boards on the market streets',
    ornament: 'stone window dressings, string courses, oriels, corner Madonnas, ridge turrets',
    weathering: { damp: 0.5, moss: 0.4, note: 'soot over the openings, damp at the plinths' },
    damage: { wear: 0.25, dress: 'burnt-out upper storeys, roofs stripped to the battens, shell scars' },
    variation: { axes: { paint: ['#7c8a74', '#e8e4da', '#5a3a2a'] }, roofAge: [0, 1] },
    surface: { grime: 1.1, patches: 0.6, tileRelief: 1.35, reveal: 0.15, eave: 0.35 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Kronach,_Melchior-Otto-Platz_12,_002.jpg', author: 'Tilman2007', license: 'CC BY-SA 3.0',
        shows: 'Kronach, Melchior-Otto-Platz: ashlar sandstone house (buff-grey) beside a two-storey Fachwerk house with ox-blood red timbers on white infill, jettied upper floor bridging a gate, steep (~55 deg) gable roofs in red plain (beaver-tail) tile, cobbles' },
      { url: 'https://commons.wikimedia.org/wiki/File:Mei%C3%9Fen_Burgstra%C3%9Fe_(01).jpg', author: 'Norbert Kaiser', license: 'CC BY-SA 2.5',
        shows: 'Meissen Burgstraße: continuous terrace of 3-4 storey rendered town houses, eaves to street with dormers, colours ochre-yellow, grey-green, grey; 3-5 window bays, stone door surrounds, ground-floor shopfronts; cathedral spires above' },
      { url: 'https://commons.wikimedia.org/wiki/File:Mei%C3%9Fen,_die_Burgstra%C3%9Fe,_Bild_2.jpg', author: 'Dguendel', license: 'CC BY 3.0',
        shows: 'Meissen lane: rendered houses in white, salmon-red and pale yellow, steep red plain-tile roofs with small dormers, regular vertical windows with grey or green frames, round-arched stone doorways, shop window under a timber fascia' },
    ],
  },
  coastal: {
    setting: { country: 'France', region: 'Finistère, Brittany (Pays Bigouden, Cap Sizun)', era: '1944' },
    kit: 'breton',
    roof: { forms: ['gable'], covering: 'small blue-grey slate, mortared ridges; some thatch; granite stacks in both gables', pitchDeg: [40, 55], colours: ['#4a4e52', '#3b3f45'] },
    facade: { materials: 'granite rubble with dressed quoins and lintels, often limewashed with the dressing left bare', core: 'masonry', colours: ['#e8e7e0', '#8a8476', '#6f665b', '#a5a191'] },
    storeys: [1, 2], storeyM: [2.4, 3.0],
    windows: { rhythm: 'few small windows on the sheltered side, granite surrounds, three or four bays on later houses', bayM: [1.6, 4.8], shutters: 'painted plank shutters, blue, green or red' },
    doors: 'plank doors in granite frames, gabled dormers (lucarnes) over them', shopfronts: 'harbour bars and fish stores with painted boards',
    ornament: 'coped gable parapets with kneelers, granite chimney stacks',
    weathering: { damp: 0.95, moss: 0.8, note: 'orange-yellow lichen on slate and granite, green streaks under the sills' },
    damage: { wear: 0.25, dress: 'burnt and boarded windows, slates blown off' },
    variation: { axes: { paint: ['#2e5a8a', '#3f6a4a', '#8c2a3a', '#e8e6e0'] }, roofAge: [0, 1] },
    surface: { grime: 1.2, patches: 0.7, tileRelief: 1.2, reveal: 0.3, eave: 0.1 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Quelques_maisons_du_village_et_des_habitants_-_A20256S.jpg', author: 'Chevalier Georges', license: 'CC BY-SA 4.0',
        shows: 'Saint-Guénolé (Penmarch), 1929 autochrome: low granite-rubble longères, one under thatch, others under grey slate at ~45 deg, massive granite gable-end chimney stacks, small openings, dry-stone field walls' },
      { url: 'https://commons.wikimedia.org/wiki/File:Le_village,_dont_les_maisons_tournent_leur_fa%C3%A7ade_aveugle_vers_la_mer,_et_du_go%C3%A9mon_-_A20269.jpg', author: 'Chevalier Georges', license: 'CC BY-SA 4.0',
        shows: 'Saint-Guénolé, 1929: line of single-storey houses turning blind gables to the sea, whitewashed gables, dark slate roofs, chimneys on every gable, seaweed (goémon) heaps on bare granite foreshore' },
      { url: 'https://commons.wikimedia.org/wiki/File:Kerity_(Penmarch)_Rue_Paul_Langevin_(1).jpg', author: 'Heinrich Stürzl', license: 'CC BY-SA 4.0',
        shows: 'Kérity (Penmarch) street: 1.5-storey whitewashed houses with dressed granite quoins and window surrounds, grey slate roofs with gable chimneys and dormers, red/maroon shutters and doors; one unrendered granite house' },
    ],
  },
  autumn: {
    setting: { country: 'France', region: 'the Moselle valley of Lorraine (Pont-à-Mousson to Metz)', era: 'autumn 1944' },
    kit: 'lorrain',
    roof: { forms: ['gable'], covering: 'low canal tiles (tuiles creuses) or mechanical tiles, red-brown, continuous over the terrace', pitchDeg: [18, 30], colours: ['#8e5a3c', '#a8794e'] },
    facade: { materials: 'rubble limestone under lime crépi in grey-beige, ochre and cream; Jaumont limestone dressings', core: 'masonry', colours: ['#c9b48a', '#b09a72', '#d8cfc0', '#e6e2d8'] },
    storeys: [1, 2], storeyM: [2.6, 3.2],
    windows: { rhythm: 'two to four bays a dwelling beside the barn door, stone surrounds', bayM: [1.4, 2.8], shutters: 'louvred or plank shutters, grey, green or brown' },
    doors: 'the arched barn gate beside the house door, onto the usoir', shopfronts: 'a café or épicerie front on the square',
    ornament: 'stone door and window surrounds, gable chimneys',
    weathering: { damp: 0.75, moss: 0.45, note: 'green-grey render bases, lichen on the tiles' },
    damage: { wear: 0.3, dress: 'burnt and boarded windows, tiles blown off' },
    variation: { axes: { paint: ['#7a8a8a', '#4e6a52', '#6a4a32'] }, roofAge: [0, 1] },
    surface: { grime: 1.0, patches: 0.7, tileRelief: 1.35, reveal: 0.25, eave: 0.3 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Dornot6.jpg', author: 'Unknown author (U.S. Army photograph)', license: 'Public domain',
        shows: 'Dornot, 8 Sept 1944: US infantry descending the village street to the Moselle crossing; continuous row of two-storey rendered houses, low-pitched tile roofs, gable chimneys, plain flat facades, side hills behind' },
      { url: 'https://commons.wikimedia.org/wiki/File:Dornot,_rue_principale.jpg', author: 'Roland Darré', license: 'CC BY-SA 4.0',
        shows: 'Dornot rue principale today: terraced village houses stepping down to the Moselle, smooth crépi in grey-beige and ochre, dressed limestone window surrounds, tall white louvred shutters, low-pitch roofs in red-brown canal/mechanical tile' },
      { url: 'https://commons.wikimedia.org/wiki/File:Maison_Lorraine_Rouhling.jpg', author: 'KARMANN Jean, maire', license: 'CC BY-SA 4.0',
        shows: 'Rouhling (Moselle), restored c.1790 maison lorraine: eaves-to-street block under shallow (~25 deg) tiled roof, wide segmental-arched barn door (porte charretière) beside the dwelling door, red sandstone surrounds, white crépi, red shutters' },
    ],
  },
  steppe: {
    setting: { country: 'Kazakhstan', region: 'the Virgin Lands of the Sary-Arka grain steppe (Akmola, Kustanai)', era: 'from 1954' },
    kit: 'tselina',
    roof: { forms: ['gable', 'hip', 'flat', 'shed'], covering: 'corrugated grey asbestos-cement (shifer), later painted steel; earth roofs on the oldest saman huts', pitchDeg: [18, 32], colours: ['#a8a49c', '#8a8478'] },
    facade: { materials: 'saman under whitewash, white silicate brick for the sovkhoz blocks, red brick for water towers', core: 'adobe', colours: ['#e6e4dc', '#cfcbc7', '#a0522d', '#3f6fa8'] },
    storeys: [1, 3], storeyM: [2.6, 3.2],
    windows: { rhythm: 'two or three windows to the street, double casements with painted surrounds', bayM: [1.8, 3.4], shutters: 'painted shutters on the older houses' },
    doors: 'plank doors under a gabled porch, the yard gate', shopfronts: 'the sovkhoz shop (magazin) with its sign',
    ornament: 'painted window surrounds, a fretwork gable',
    weathering: { damp: 0.4, moss: 0.15, note: 'dust at the foot, sun-bleached sheet' },
    damage: { wear: 0.25, dress: 'burnt and boarded windows' },
    variation: { axes: { paint: ['#3f6fa8', '#4e7a5a', '#a8b8c8'] }, roofAge: [0, 1] },
    surface: { grime: 0.9, patches: 0.6, tileRelief: 1.15, reveal: 0.15, eave: 0.4 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:%D0%A1%D1%82%D0%B0%D1%80%D0%BE%D0%B5_%D1%82%D0%B5%D1%85_%D0%B7%D0%B4%D0%B0%D0%BD%D0%B8%D0%B5_%D0%BD%D0%B0_%D0%B2%D1%8A%D0%B5%D0%B7%D0%B4%D0%B5_%D0%B2_%D1%81%D0%B5%D0%BB%D0%BE.jpg', author: 'Ivan ideia', license: 'CC BY-SA 4.0',
        shows: 'Taldy (Karaganda region): abandoned Soviet timber-clad grain elevator/silo house raised on steel legs over concrete pits, gabled corrugated asbestos-cement roofs, grey weathered boards; flat steppe horizon' },
      { url: 'https://commons.wikimedia.org/wiki/File:%D0%9F%D0%B0%D0%BD%D0%BE%D1%80%D0%B0%D0%BC%D0%B0_%D0%B3%D0%BE%D1%80%D0%BE%D0%B4%D0%B0_%D0%90%D1%82%D0%B1%D0%B0%D1%81%D0%B0%D1%80.jpg', author: 'Андрей Кирюшкин (Russian Wikipedia)', license: 'CC BY 3.0',
        shows: 'Atbasar (Akmola) from above: low single-storey houses under shallow hipped/gable asbestos-cement sheet roofs in trees, white/cream rendered walls, 2-4 storey Khrushchev-era blocks in buff render and silicate brick, factory chimney, open steppe beyond' },
      { url: 'https://commons.wikimedia.org/wiki/File:%D0%9C%D0%BE%D0%B9_%D0%B0%D1%83%D1%8B%D0%BB.jpg', author: 'Makzhak', license: 'CC BY-SA 4.0',
        shows: 'Akmola-region aul from the air: scattered one-storey houses on big fenced plots, white or pale walls, gable roofs in grey asbestos sheet or later red/blue profiled steel, plank sheds and hay yards, dirt streets' },
    ],
  },
  railyard: {
    setting: { country: 'Germany', region: 'Ruhr and Upper Silesian coalfield junctions', era: '1945' },
    kit: 'ruhr',
    roof: { forms: ['gable', 'shed', 'sawtooth', 'flat'], covering: 'slate and tarred felt, sheet on the sheds', pitchDeg: [15, 45], colours: ['#3b3f45', '#4a4440'] },
    facade: { materials: 'soot-dark red brick with yellow-brick bands, cast-iron windows', core: 'masonry', colours: ['#6a3a2c', '#c9a85c', '#3a3430'] },
    storeys: [1, 4], storeyM: [3.0, 5.0],
    windows: { rhythm: 'tall segmental-arched windows in regular bays, iron glazing bars', bayM: [2.0, 4.5], shutters: null },
    doors: 'cart doors and goods doors with timber hoods', shopfronts: null,
    ornament: 'yellow-brick bands and arches, corbel tables, the company name in brick',
    weathering: { damp: 0.7, moss: 0.1, note: 'soot down every course, coal dust at the foot' },
    damage: { wear: 0.2, dress: 'burnt-out halls, bomb damage, smashed glazing' },
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 1.45, patches: 0.5, tileRelief: 1.2, reveal: 0.15, eave: 0.35 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Katowice-Bogucice,_familok.jpg', author: 'Ewkaa (Polish Wikipedia user)', license: 'CC BY-SA 3.0',
        shows: 'Katowice-Bogucice familok beside the former Katowice colliery: 3-storey soot-darkened red brick block, bands of dark glazed/green brick at sill and floor lines, segmental-arched windows with brick arches, cross-gables, low-pitch roof, rusticated basement' },
      { url: 'https://commons.wikimedia.org/wiki/File:Zabrze_kolonia_Borsiga_1.jpg', author: 'Andrzej Otrębski', license: 'CC BY-SA 4.0',
        shows: 'Zabrze, Borsig colony: long 2.5-storey workers\' terraces in dark purple-red brick, regular segmental-arched windows (~10+ bays), gable-ended roofs in dark slate/felt with tall brick chimneys, small brick outbuildings' },
      { url: 'https://commons.wikimedia.org/wiki/File:Eisenbahnmuseum_Bochum,_Museumstag_April_2014,_Drehlok_Schuppen_und_Dampflok.jpg', author: 'Heinrich Kämpchen', license: 'CC BY 4.0',
        shows: 'Bochum-Dahlhausen railway museum: brick locomotive roundhouse (Rundschuppen) with radial bays and turntable, water tower behind, timber turntable cabin; the junction/depot building type' },
    ],
  },
  frontier: {
    setting: { country: 'Germany', region: 'Osthessen (Fulda Gap, Hünfeld basin)', era: 'the Cold War' },
    kit: 'hessian',
    roof: { forms: ['gable', 'halfhip'], covering: 'red clay tile and slate', pitchDeg: [42, 55], colours: ['#8a3a2a', '#4a4e52'] },
    facade: { materials: 'Fachwerk on a red Buntsandstein ground storey, white infill', core: 'masonry', colours: ['#ece7dc', '#8a3a2a', '#5a3a2a', '#b06a4a'] },
    storeys: [1, 3], storeyM: [2.4, 3.2],
    windows: { rhythm: 'paired casements between the posts of the frame', bayM: [1.2, 2.8], shutters: 'some painted shutters' },
    doors: 'the Hoftor gate into the court, house doors up stone steps', shopfronts: 'the Gasthaus and the village shop',
    ornament: 'carved corner posts, braces in Mann figures',
    weathering: { damp: 0.85, moss: 0.55, note: 'moss on the north slopes, damp in the sandstone' },
    damage: { wear: 0.22, dress: 'burnt and boarded windows' },
    variation: { axes: { paint: ['#4e6a52', '#6a4a32', '#8a8a86'] }, roofAge: [0.1, 1] },
    surface: { grime: 1.0, patches: 0.55, tileRelief: 1.35, reveal: 0.15, eave: 0.35 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Fachwerkhaus_Lietring_1_H%C3%BCnfeld-N%C3%BCst.jpg', author: 'Stargate22', license: 'CC0',
        shows: 'Hünfeld-Nüst, early-19th-c. farmhouse: two-storey Fachwerk with dark timbers on white infill, weather-side gable fully clad in dark brown shingle/fibre-cement slates, steep (~50 deg) red-tile roof, red Buntsandstein ashlar plinth, white-framed windows' },
      { url: 'https://commons.wikimedia.org/wiki/File:Burghaun_Marktplatz_211.jpg', author: 'Jacquesverlaeken', license: 'CC BY-SA 4.0',
        shows: 'Burghaun Marktplatz: Fachwerk house with red-brown timbers and white infill on a sandstone ground floor, steep plain-tile roofs, baroque church with red sandstone dressings, rendered two-storey houses with regular window bays' },
      { url: 'https://commons.wikimedia.org/wiki/File:H%C3%BCnfeld,_Haus_T%C3%B6pferstra%C3%9Fe_20.jpg', author: 'Dguendel', license: 'CC BY 3.0',
        shows: 'Hünfeld, Töpferstraße 20: town Fachwerk facade with ox-blood red timbers and white render panels, regular two-light windows with flower boxes, red sandstone entrance steps, inn sign \'Alt Hünfeld\'' },
    ],
  },
  fjord: {
    setting: { country: 'Norway', region: 'Ofoten, Nordland (Narvik, Bjerkvik, the Herjangsfjord)', era: 'spring 1940' },
    kit: 'nordland',
    roof: { forms: ['gable'], covering: 'slate and red tile, turf on outbuildings, tarred board on the naust', pitchDeg: [30, 45], colours: ['#3b3f45', '#7a3a2a'] },
    facade: { materials: 'painted board-and-batten and weatherboard on a stone footing', core: 'masonry', colours: ['#f0ece2', '#8a2a1e', '#d9b84e', '#e2d6b8'] },
    storeys: [1, 2], storeyM: [2.4, 3.0],
    windows: { rhythm: 'white-framed six-pane windows in regular bays', bayM: [1.4, 3.0], shutters: null },
    doors: 'panel doors under a glazed porch (sval)', shopfronts: 'the landhandel on the quay',
    ornament: 'white corner boards and window trims, carved barge boards',
    weathering: { damp: 0.7, moss: 0.45, note: 'paint weathered back on the sea side' },
    damage: { wear: 0.3, dress: 'burnt and boarded windows' },
    variation: { axes: { paint: ['#2e4a3a', '#7a2a22', '#e8e4da'] }, roofAge: [0, 1] },
    surface: { grime: 1.0, patches: 0.5, tileRelief: 1.2, reveal: 0.1, eave: 0.5 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Narvik_as_it_appeared_in_June_1940_after_bombardment.jpg', author: 'Franz Hollerweger / Kepplinger (via Arkivverket)', license: 'CC BY-SA 2.0',
        shows: 'Narvik, June 1940 after bombardment: burned-out timber town where only brick chimney stacks and masonry stair cores stand; surviving two-storey board houses with gable roofs on the slope behind' },
      { url: 'https://commons.wikimedia.org/wiki/File:Pundsletta_by_Pundslettv%C3%A5gen_on_%C3%85rsteinen_in_V%C3%A5gan,_Nordland,_Norway,_2022_June.jpg', author: 'Ximonic (Simo Räsänen)', license: 'CC BY-SA 4.0',
        shows: 'Vågan, Nordland: red-painted sjøbu/naust on timber piles over the shore, vertical board-and-batten cladding, white corner and fascia boards, low-pitched gable roof (~25-30 deg) in black sheet/felt, small white window' },
      { url: 'https://commons.wikimedia.org/wiki/File:Loaded_Drying_Racks_for_Stockfish_at_Henningsv%C3%A6r,_Lofoten,_Norway.jpg', author: 'Christoph Strässler', license: 'CC BY-SA 2.0',
        shows: 'Henningsvær, Lofoten: hjell (stockfish drying racks) of grey round poles and rails in long rows, behind them white-painted two-storey board houses with dark roofs; snow and rock' },
    ],
  },
  delta: {
    setting: { country: 'Bangladesh', region: 'the Jamuna chars (Sirajganj, Bogura)', era: 'the 1971 war' },
    kit: 'bengal',
    roof: { forms: ['gable', 'hip', 'curved', 'flat'], covering: 'corrugated iron, rusting, some thatch; flat roofs on the brick shops and the mosque, its domes', pitchDeg: [20, 35], colours: ['#7a5a40', '#8a8a86'] },
    facade: { materials: 'corrugated iron and bamboo on earthen plinths; limewashed brick for the mosque and the bazaar', core: 'masonry', colours: ['#8a8a86', '#a86a40', '#ece7dc', '#5a7a5a'] },
    storeys: [1, 2], storeyM: [2.4, 3.2],
    windows: { rhythm: 'few small openings with tin shutters', bayM: [1.6, 3.6], shutters: 'hinged tin shutters' },
    doors: 'tin and plank doors on the court', shopfronts: 'the tin bazaar: open fronts behind shutters',
    ornament: 'painted tin, the mosque\'s domes and minarets',
    weathering: { damp: 0.8, moss: 0.5, note: 'rust down the sheet, mud splash on the plinths' },
    damage: { wear: 0.2, dress: 'burnt and boarded openings' },
    variation: { axes: { paint: ['#3c6a3e', '#3a6a9a', '#8a5a3a'] }, roofAge: [0, 1] },
    surface: { grime: 1.1, patches: 0.5, tileRelief: 1.15, reveal: 0.1, eave: 0.7 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Village_shop_in_char_of_Sirajganj,_Bangladesh_10.jpg', author: 'Afifa Afrin', license: 'CC BY-SA 3.0',
        shows: 'village shop on a Sirajganj char: single-storey corrugated-iron box, CI walls in vertical sheets on timber/bamboo frame, shallow hipped CI roof with lean-to awning, raised earth-and-concrete plinth with steps, painted sign board' },
      { url: 'https://commons.wikimedia.org/wiki/File:Home_in_rural_Bangladesh.jpg', author: 'Mark Knobil', license: 'CC BY 2.0',
        shows: 'rural Bangladeshi house fully of corrugated steel: vertical-corrugation walls, gable CI roof with ridge cap, plank door with cloth curtain, small barred window with green-painted frame, low rendered earth plinth' },
      { url: 'https://commons.wikimedia.org/wiki/File:Sariakandi_Char_Land_Flood_Affected_Bangladesh.jpg', author: 'TausifAlHossain', license: 'CC BY-SA 4.0',
        shows: 'Sariakandi (Bogura) char during the 2016 flood: low huts of jute-stick/bamboo matting walls under thatch and CI, built on raised mounds, bamboo fences, standing water around' },
    ],
  },
  badlands: {
    setting: { country: 'Jordan', region: 'Wadi Rum', era: 'the present' },
    kit: 'wadirum',
    roof: { forms: ['flat'], covering: 'flat concrete roofs with water tanks and rebar left standing for the next storey', pitchDeg: null, colours: ['#c8b8a0', '#9a8a76'] },
    facade: { materials: 'concrete block, rendered or bare, sand and stone colours; a crenellated Desert Patrol fort', core: 'adobe', colours: ['#d9b38c', '#cf9478', '#e1bea0', '#8a8a86', '#2e6aa8'] },
    storeys: [1, 2], storeyM: [2.8, 3.2],
    windows: { rhythm: 'small barred windows, few to a wall', bayM: [1.8, 4.0], shutters: 'steel grilles' },
    doors: 'steel doors painted green or blue, a gate in the yard wall', shopfronts: 'shuttered shopfronts on the village street',
    ornament: 'parapet crenels on the fort, painted door frames',
    weathering: { damp: 0.25, moss: 0, note: 'sand-blasted render, dust-buff wall feet, rust from the rebar and the steel doors; no green' },
    damage: { wear: 0.2, dress: 'unfinished upper storeys, broken block' },
    variation: { axes: { door: ['blue', 'green', 'grey'], tank: ['black', 'white'] }, roofAge: [0, 0.6] },
    surface: { grime: 0.6, patches: 0.45, tileRelief: 1.0, reveal: 0.3, eave: 0 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Siedlung_Wadi_Rum_-_4.jpg', author: 'Rudolfo Kithera', license: 'CC0',
        shows: 'Rum village: single-storey flat-roofed concrete-block house rendered and painted terracotta-red, blue steel doors, small high windows, parapet, rendered compound wall with loose hollow blocks stacked in front; sandstone jebel behind' },
      { url: 'https://commons.wikimedia.org/wiki/File:16_Nabatean_Temple_Trail_-_Wadi_Rum_Village_-_panoramio.jpg', author: 'hikinginjordan', license: 'CC BY-SA 3.0',
        shows: 'Rum village centre from the trail: one/two-storey flat-roofed buildings in sand-ochre render, rooftop water tanks and shade frames, low crenellated wall in the foreground, steel signs, tarmac road, camels' },
      { url: 'https://commons.wikimedia.org/wiki/File:Siedlung_Wadi_Rum_-_1.jpg', author: 'Rudolfo Kithera', license: 'CC0',
        shows: 'Rum village: small sand-coloured mosque with square minaret, black goat-hair Bedouin tent on a block-wall enclosure, whitewashed low walls, rubble; red sandstone cliffs' },
    ],
  },
  monsoon: {
    setting: { country: 'India', region: 'Kohima, the Naga Hills', era: 'April–June 1944' },
    kit: 'kohima',
    roof: { forms: ['gable', 'hip'], covering: 'painted corrugated tin on the bungalows and the bazaar; thatch with carved horns on the Angami houses', pitchDeg: [25, 55], colours: ['#8a3a2a', '#5a6a5a', '#8a7d68'] },
    facade: { materials: 'whitewashed timber and plaster bungalows on stone plinths, bamboo and plank Naga houses', core: 'masonry', colours: ['#ece7dc', '#c8b89a', '#6a5a46'] },
    storeys: [1, 2], storeyM: [2.6, 3.4],
    windows: { rhythm: 'sash windows along verandas; Naga houses near-windowless', bayM: [1.6, 4.6], shutters: 'louvred shutters on the bungalows' },
    doors: 'verandas on posts, plank doors', shopfronts: 'the bazaar\'s open shop fronts',
    ornament: 'carved house horns and posts on the Angami houses, veranda fretwork',
    weathering: { damp: 0.8, moss: 0.5, note: 'monsoon green on everything, rust on the tin' },
    damage: { wear: 0.2, dress: 'shell-stripped roofs, burnt bungalows (the Tennis Court battle)' },
    variation: { axes: { paint: ['#4e6a48', '#7b2e2a', '#e8e4da'] }, roofAge: [0, 1] },
    surface: { grime: 1.3, patches: 0.6, tileRelief: 1.15, reveal: 0.15, eave: 0.9 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Streetscape_of_Khonoma_(2024).jpg', author: 'Ly.n0m', license: 'CC BY-SA 4.0',
        shows: 'Khonoma (Angami village near Kohima): stone-paved lane between dry-stone terrace walls, two-storey timber-plank houses with dark-stained board walls and glazed upper windows, corrugated-iron roofs (gable, ~30 deg), CI sheet walls on outbuildings' },
      { url: 'https://commons.wikimedia.org/wiki/File:Morungs_at_Khonoma_Square_(2024).jpg', author: 'Ly.n0m', license: 'CC BY-SA 4.0',
        shows: 'Khonoma square: Angami morungs (dormitories) with steep gables topped by crossed carved wooden horns (kika), plank walls, roofs now corrugated iron replacing thatch; circular dry-stone sitting platform' },
      { url: 'https://commons.wikimedia.org/wiki/File:View_of_Naga_Bazaar,_Kohima_(2024).jpg', author: 'Ly.n0m', license: 'CC BY-SA 4.0',
        shows: 'Kohima from near the bazaar: dense hillside of houses with painted CI roofs in brown, maroon, green and blue, timber and Assam-type walls, newer concrete blocks in bright paint stepping down the ridge' },
    ],
  },
  alpine: {
    setting: { country: 'France', region: 'Haute-Maurienne and the Col du Mont-Cenis (Savoie)', era: '1945' },
    kit: 'savoyard',
    roof: { forms: ['gable'], covering: 'lauze (stone slab) roofs, larch shingle on the mazots', pitchDeg: [25, 40], colours: ['#6e6a62', '#5a564e'] },
    facade: { materials: 'gneiss rubble, roughly pointed, larch galleries and gables', core: 'masonry', colours: ['#8a8478', '#9d9690', '#6a5040'] },
    storeys: [1, 3], storeyM: [2.3, 3.0],
    windows: { rhythm: 'small deep-set windows, few to a wall', bayM: [1.4, 3.4], shutters: 'plank shutters' },
    doors: 'plank doors in stone frames, the barn ramp', shopfronts: null,
    ornament: 'larch balconies, the chapel\'s bell-cote',
    weathering: { damp: 0.95, moss: 0.5, note: 'lichen on the lauzes, snow damp' },
    damage: { wear: 0.3, dress: 'burnt and boarded windows' },
    variation: { axes: { paint: ['#5a3e2a', '#3f5a4a', '#6a5a4a'] }, roofAge: [0, 1] },
    surface: { grime: 0.9, patches: 0.7, tileRelief: 1.2, reveal: 0.4, eave: 0.55 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Eglise_et_maison_particuli%C3%A8re_%C3%A0_Av%C3%A9rolle_(Altitude_2000_m)._N%C2%B0_647._-_Messines_-_btv1b10687351v.jpg', author: 'Jean Messines (RTM forestry service), via BnF Gallica', license: 'Public domain',
        shows: 'Avérolle (Bessans), 3 Sept 1929: chapel and a house at 2000 m, thick rubble walls partly limewashed, low-pitch (~25-30 deg) roofs of large stone lauzes, small deep-set openings, timber upper gable, rubble field walls' },
      { url: 'https://commons.wikimedia.org/wiki/File:Bonneval-sur-Arc_(Savoie).JPG', author: 'Florian Pépellin', license: 'CC BY-SA 3.0',
        shows: 'Bonneval-sur-Arc: compact village of grey gneiss rubble houses under heavy lauze roofs, church with stone spire, dark larch gables and balconies, houses clustered tightly on the valley floor' },
      { url: 'https://commons.wikimedia.org/wiki/File:Pr%C3%A9paration_couverture_lauzes_gneiss.jpg', author: 'Gabriel Haute Maurienne', license: 'CC BY-SA 4.0',
        shows: 'Haute-Maurienne roof work: thick orthogneiss lauzes (several cm, irregular, grey-blue to grey-green) stacked for laying on a heavy timber roof frame' },
    ],
  },
  caldera: {
    setting: { country: 'Japan', region: 'the Aso caldera, Kumamoto (Kyushu)', era: 'the twentieth century' },
    kit: 'kyushu',
    roof: { forms: ['gable', 'hip', 'halfhip'], covering: 'thatch, grey kawara tile and painted tin; sheet on the works', pitchDeg: [25, 50], colours: ['#4a4e52', '#7a3a2a', '#8a7d68'] },
    facade: { materials: 'timber and white plaster, charred-board walls, white kura storehouses with namako tile skirts', core: 'masonry', colours: ['#ece7dc', '#3a302a', '#7a6048', '#a8a49c'] },
    storeys: [1, 2], storeyM: [2.4, 4.4],
    windows: { rhythm: 'lattice and shoji bays between posts', bayM: [0.9, 2.2], shutters: 'sliding storm shutters (amado)' },
    doors: 'sliding doors under deep eaves', shopfronts: 'the co-op store\'s open front and sign',
    ornament: 'ridge ornaments, namako tile skirts, shrine torii',
    weathering: { damp: 0.7, moss: 0.45, note: 'moss on the thatch, volcanic dust' },
    damage: { wear: 0.22, dress: 'burnt and boarded fronts' },
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 1.1, patches: 0.5, tileRelief: 1.35, reveal: 0.15, eave: 0.55 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:House_damaged_by_the_2016_Kumamoto_earthquake.jpg', author: 'hanonimas', license: 'CC BY-SA 3.0',
        shows: 'Akamizu (Aso caldera) after the 2016 earthquake: two-storey storehouse/barn with white plastered gable and dark grey kawara-tile gable roof (~30 deg) with ridge tiles, walls partly re-clad in blue-painted corrugated iron, timber frame exposed; concrete-block garden wall' },
      { url: 'https://commons.wikimedia.org/wiki/File:Ota_house_Taragi_Kumamoto.jpg', author: 'Mizushimasea', license: 'CC BY-SA 4.0',
        shows: 'Ota house, Taragi (Kumamoto prefecture): large minka under very steep (~55 deg) hipped thatch with thick clipped eaves, dark timber board and plaster walls, lower lean-to roofs in grey tile; L-plan farmhouse' },
      { url: 'https://commons.wikimedia.org/wiki/File:View_in_front_of_Akamizu_Station.jpg', author: 'そらみみ', license: 'CC BY-SA 4.0',
        shows: 'Akamizu station area: ordinary postwar houses with grey or blue-black glazed tile and sheet roofs, two storeys, sheet/siding walls, low walls and utility poles; caldera rim and Aso peaks behind' },
    ],
  },
  foundry: {
    setting: { country: 'Germany', region: 'the Völklingen ironworks on the Saar', era: '1945' },
    kit: 'saar',
    roof: { forms: ['gable', 'sawtooth', 'flat', 'shed'], covering: 'sheet, felt and north-light glazing', pitchDeg: [15, 40], colours: ['#4a4440', '#5a5a58'] },
    facade: { materials: 'brick halls and steel frames, riveted plate', core: 'masonry', colours: ['#7a3a2c', '#3a3430', '#8a6a4a'] },
    storeys: [1, 4], storeyM: [3.2, 8.0],
    windows: { rhythm: 'tall round-headed hall windows in bays, iron glazing', bayM: [2.4, 6.0], shutters: null },
    doors: 'rolling gates and rail doors', shopfronts: null,
    ornament: 'corbelled brick, the works\' clock and name',
    weathering: { damp: 0.6, moss: 0.15, note: 'rust and soot everywhere' },
    damage: { wear: 0.4, dress: 'burnt-out halls, smashed glazing' },
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 1.45, patches: 0.7, tileRelief: 1.15, reveal: 0.2, eave: 0.45 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:V%C3%B6lklingen,_Voelklinger_Huette_(38587846752).jpg', author: 'Herbert Frank from Wien (Vienna), AT', license: 'CC BY 2.0',
        shows: 'Völklingen Ironworks: row of riveted steel blast furnaces with rust-brown and dark grey shells, hot-blast stoves and stacks, inclined skip-hoist bridges, gas mains; tall brick chimney; small rendered building at the foot' },
      { url: 'https://commons.wikimedia.org/wiki/File:20210711_Blasting_hall_of_V%C3%B6lklingen_Ironworks.jpg', author: 'Flocci Nivis', license: 'CC BY 4.0',
        shows: 'Gebläsehalle (blowing-engine hall): long industrial hall with red-brown brick piers between tall round-arched multi-pane steel windows, low-pitch roof with clerestory, rust-stained; Völklingen square in front' },
      { url: 'https://commons.wikimedia.org/wiki/File:20200124_Ensemble_Hohenzollernstra%C3%9Fe_V%C3%B6lklingen.jpg', author: 'Flocci Nivis', license: 'CC BY-SA 4.0',
        shows: 'Hohenzollernstraße workers\'/staff houses: two-storey semi-detached houses in cream, pale yellow and pink render with red sandstone window and door surrounds, steep red-brown tile roofs with gabled dormers' },
    ],
  },
  ruinspires: {
    setting: { country: 'Bosnia and Herzegovina', region: 'Sarajevo, the valley floor and the mahala flanks', era: 'the siege, 1992–1996' },
    kit: 'sarajevo',
    roof: { forms: ['hip', 'flat', 'gable'], covering: 'red tile on the Austro-Hungarian blocks and mahala houses, flat roofs on the Yugoslav towers', pitchDeg: [25, 55], colours: ['#8a3a2a', '#5a5a58'] },
    facade: { materials: 'rendered Austro-Hungarian blocks, concrete panel towers, white-rendered Ottoman houses with timber upper storeys', core: 'masonry', colours: ['#d8cfc0', '#b0a690', '#8a8a86', '#ece7dc'] },
    storeys: [2, 18], storeyM: [2.8, 3.8],
    windows: { rhythm: 'regular bays on the blocks, ribbon balconies on the towers', bayM: [1.4, 3.2], shutters: 'roller shutters' },
    doors: 'portals on the blocks, courtyard gates in the mahala', shopfronts: 'ground-floor shops, shuttered',
    ornament: 'stucco cornices and window heads, Ottoman oriels (kamerija)',
    weathering: { damp: 0.7, moss: 0.3, note: 'shell scars, soot, plastic sheeting in the windows' },
    damage: { wear: 0.5, dress: 'gutted towers, shell holes, burnt facades' },
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 1.3, patches: 0.75, tileRelief: 1.35, reveal: 0.2, eave: 0.8 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Sarajevo_Siege_Shell_Damage_Downtown.jpg', author: 'Christian Maréchal', license: 'CC BY 3.0',
        shows: 'downtown Sarajevo, winter 1992-93: Austro-Hungarian 4-storey rendered block with pedimented window heads, cornice bands and balconies, facade gouged by shell hits exposing brick, ground-floor shop with shutters' },
      { url: 'https://commons.wikimedia.org/wiki/File:Sarajevo_Grbavica.JPG', author: 'Lt. Stacey Wyzkowski, U.S. Navy (U.S. DoD photo)', license: 'Public domain',
        shows: 'Grbavica, March 1996: burned-out Yugoslav-era 6-8 storey concrete apartment blocks with continuous balcony bands, blackened window voids, collapsed corner, rubble and wrecked cars in the street' },
      { url: 'https://commons.wikimedia.org/wiki/File:Sarajevo_bridge.jpg', author: 'Orhan Bilgin (Zargan)', license: 'CC BY 2.5',
        shows: 'Latin Bridge and Baščaršija hillside: Ottoman-type mahala houses climbing the slope, white/cream rendered walls, hipped roofs in red-brown tile with deep eaves, minaret; Austro-Hungarian buildings on the riverfront' },
    ],
  },
  blackglass: {
    setting: { country: 'China', region: 'Shanghai, both banks of Suzhou Creek', era: 'August–November 1937' },
    kit: 'shanghai',
    roof: { forms: ['gable', 'flat', 'hip'], covering: 'grey canal tile with stepped fire walls; flat roofs behind parapets on the Settlement blocks', pitchDeg: [20, 35], colours: ['#4a4e52', '#5a5652'] },
    facade: { materials: 'grey brick banded in red (shikumen), whitewash, timber shop fronts; red brick and stucco blocks over stone', core: 'masonry', colours: ['#6a6a68', '#9a3a2a', '#ece7dc', '#c8a878'] },
    storeys: [2, 4], storeyM: [3.0, 4.0],
    windows: { rhythm: 'lattice casements over the shops; sash windows in white surrounds on the blocks', bayM: [1.4, 2.8], shutters: 'plank shop shutters' },
    doors: 'stone-framed lacquered gates with carved pediments', shopfronts: 'open shop fronts with name boards and vertical signs',
    ornament: 'carved gate pediments, curled ridges, string courses and cornices',
    weathering: { damp: 0.85, moss: 0.35, note: 'damp brick, soot from Zhabei\'s fires' },
    damage: { wear: 0.3, dress: 'burnt-out shophouses, shell holes' },
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 1.2, patches: 0.7, tileRelief: 1.35, reveal: 0.2, eave: 0.6 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Sihang_warehouse_under_fire.jpg', author: 'Unknown author', license: 'Public domain',
        shows: 'Sihang Warehouse, Oct 1937: 6-storey reinforced-concrete godown on Suzhou Creek, flat roof with parapet and painted company name, grid of regular windows between concrete piers, stone embankment; low two-storey tiled Chinese shophouses beside it' },
      { url: 'https://commons.wikimedia.org/wiki/File:A_Lane_in_Zhenxingli.jpg', author: 'Livelikerw', license: 'CC BY-SA 3.0',
        shows: 'Zhenxingli lane (1927 shikumen/old-style lilong): two-storey grey-brick and render lane houses, black timber doors in stone (shikumen) frames with moulded lintels, small upper windows, tiled awnings, narrow paved lane' },
      { url: 'https://commons.wikimedia.org/wiki/File:An_old_pic_of_an_entrance_to_a_Longtang_in_Shanghai.jpg', author: 'Unknown author', license: 'Public domain',
        shows: 'old photograph of a longtang entrance: rendered arched gateway with classical pilasters and moulded archivolt, carved panel above, shop signs and hanging laundry around it, rickshaws in the street' },
    ],
  },
  titan_gorge: {
    setting: { country: 'United States', region: 'Monument Valley, the Navajo Nation (Oljato, Goulding\'s)', era: 'the twentieth century' },
    kit: 'navajo',
    roof: { forms: ['flat', 'dome', 'gable'], covering: 'cribbed-log and earth hogan domes, flat roofs on the trading post, sheet on the HUD houses', pitchDeg: [15, 30], colours: ['#8a6a4a', '#a8a49c'] },
    facade: { materials: 'red sandstone masonry, earth-covered logs, frame houses in pale paint', core: 'adobe', colours: ['#a85a3a', '#c8885a', '#ece7dc', '#7a5a40'] },
    storeys: [1, 2], storeyM: [2.4, 3.2],
    windows: { rhythm: 'few small windows; hogans one door east', bayM: [1.8, 4.0], shutters: null },
    doors: 'the hogan\'s door to the east, the trading post\'s porch', shopfronts: 'the trading post',
    ornament: 'painted signs, the porch posts',
    weathering: { damp: 0.4, moss: 0.03, note: 'red dust at the foot' },
    damage: { wear: 0.15, dress: 'abandoned and fallen-in hogans' },
    variation: { axes: { paint: ['#3a6a9a', '#8a5a3a', '#5a7a5a'] }, roofAge: [0, 1] },
    surface: { grime: 0.6, patches: 0.4, tileRelief: 1.0, reveal: 0.3, eave: 0.35 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Oljato_Trading_Post_ruins,_January_2019.jpg', author: 'Steven Baltakatei Sandoval', license: 'CC BY-SA 4.0',
        shows: 'Oljato Trading Post (1921) ruins, Jan 2019: long single-storey building of red sandstone rubble and adobe with low-pitch/flat roof, timber porch, plank and sheet outbuildings under cottonwoods; red sand and mesa' },
      { url: 'https://commons.wikimedia.org/wiki/File:Navajo_Hogan,_Monument_Valley.jpg', author: 'Wolfgang Staudt from Saarbruecken, Germany', license: 'CC BY 2.0',
        shows: 'Monument Valley earth-covered hogan: domed/cribbed log structure mounded with red earth, projecting log-framed vestibule with plank door facing east, stovepipe at the crown' },
      { url: 'https://commons.wikimedia.org/wiki/File:Meta_Atene_stands_in_front_of_her_home_in_Monument_Valley,_UT_on_June_28,_2012_(7514474932).jpg', author: 'USDA (U.S. Department of Agriculture)', license: 'Public domain',
        shows: 'Monument Valley home, 2012: single-storey house of pale grey concrete block, low gable roof in grey asphalt shingle with a galvanised stovepipe, aluminium sliding window; volunteers re-roofing; bare red sand yard' },
    ],
  },
  skybridge: {
    setting: { country: 'United States', region: 'Glen Canyon Dam and Page, Arizona', era: '1957–1966' },
    kit: 'glencanyon',
    roof: { forms: ['flat', 'gable', 'hip'], covering: 'board-formed concrete decks, low-pitched shingle on the ranch houses', pitchDeg: [15, 25], colours: ['#8a8a86', '#5a5652'] },
    facade: { materials: 'board-formed concrete works, painted frame and block ranch houses', core: 'concrete', colours: ['#c8c4bc', '#a8a49c', '#d8c8a8', '#8aa0a8'] },
    storeys: [1, 3], storeyM: [2.5, 4.5],
    windows: { rhythm: 'ribbon and picture windows on the ranch houses, slots in the works', bayM: [1.6, 7.0], shutters: null },
    doors: 'carports and garage doors', shopfronts: 'the motel row and its sign',
    ornament: 'motel signs, Bureau of Reclamation lettering',
    weathering: { damp: 0.2, moss: 0.02, note: 'runoff stains on the concrete, red dust' },
    damage: { wear: 0.18, dress: 'blown windows, shell scars on the concrete' },
    variation: { axes: { paint: ['#e8e4da', '#8a3a2a', '#3a5a6a'] }, roofAge: [0, 1] },
    surface: { grime: 0.5, patches: 0.35, tileRelief: 1.0, reveal: 0.1, eave: 0.55 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Glen_Canyon_Dam_1962.jpg', author: 'U.S. Bureau of Reclamation', license: 'Public domain',
        shows: 'Glen Canyon Dam under construction, 1962 (aerial): rising concrete arch in vertical block columns, cableway towers, Glen Canyon steel arch bridge across the gorge, batch plant and haul roads cut into red Navajo sandstone' },
      { url: 'https://commons.wikimedia.org/wiki/File:Page,_Arizona_Aerial.jpg', author: 'brewbooks', license: 'CC BY-SA 2.0',
        shows: 'Page, AZ from the mesa edge: low single-storey ranch houses with shallow hipped/gable roofs among planted shade trees, beige stucco and light siding, a church spire; open sagebrush and Vermilion/Echo cliffs behind' },
      { url: 'https://commons.wikimedia.org/wiki/File:Vintage_sign_at_Bashful_Bob%27s_Motel_in_Page,_Arizona_LCCN2011631705.tif', author: 'Carol M. Highsmith (Library of Congress)', license: 'Public domain',
        shows: 'Bashful Bob\'s Motel, Page: 1950s single-storey stucco building in cream with shallow hipped roof, aluminium-framed windows, small porch, tall 1950s neon \'MOTEL\' sign; gravel yard and Siberian elms' },
    ],
  },
  polders: {
    setting: { country: 'Netherlands', region: 'Zeeland and Zeeuws-Vlaanderen (the Scheldt polders)', era: 'autumn 1944' },
    kit: 'polder',
    roof: { forms: ['gable', 'hip', 'halfhip'], covering: 'red and black-glazed pantiles; thatch on the tarred barns', pitchDeg: [40, 55], colours: ['#8a3a2a', '#2e2e2e', '#8a7d68'] },
    facade: { materials: 'red-brown brick, tarred black weatherboard barns with white trim', core: 'masonry', colours: ['#8a3a2a', '#2a2a2a', '#ece7dc', '#5a7a5a'] },
    storeys: [1, 2], storeyM: [2.5, 3.2],
    windows: { rhythm: 'sash and casement windows in white frames, green and white shutters', bayM: [1.4, 4.2], shutters: 'green-and-white shutters' },
    doors: 'green doors, the barn\'s big doors', shopfronts: 'the café on the dike',
    ornament: 'white window frames, decorative anchor plates, gable vlechtingen',
    weathering: { damp: 0.8, moss: 0.5, note: 'green damp at the foot, lichen on the tiles' },
    damage: { wear: 0.2, dress: 'burnt and boarded windows, flooding marks' },
    variation: { axes: { paint: ['#2e5a3a', '#e8e6e0', '#3a3a3a'] }, roofAge: [0, 1] },
    surface: { grime: 1.1, patches: 0.5, tileRelief: 1.35, reveal: 0.15, eave: 0.3 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Rijksmonument_407208_Kwistenburg_Kwadendamme.JPG', author: 'M.Phernambucq', license: 'CC BY-SA 3.0',
        shows: 'Hoeve Kwistenburg, Kwadendamme (Zuid-Beveland): Zeeuwse schuur with black-tarred vertical boarded walls under a huge hipped reed-thatch roof (~50 deg) on a low brick plinth, red-brick farmhouse gable behind, small red-brick outbuilding under orange-red pantiles with white-trimmed openings' },
      { url: 'https://commons.wikimedia.org/wiki/File:Exterieur_vooraanzicht,_zijaanzicht_Zeeuwse_schuur_-_20000128_-_RCE.jpg', author: 'Gerard Dukker (Rijksdienst voor het Cultureel Erfgoed)', license: 'CC BY-SA 4.0',
        shows: 'Borsele: Zeeuwse schuur, long low tarred-board barn with half-hipped thatched roof sweeping down to ~2 m eaves, dark board-and-batten walls, low wagon doors in the long side' },
      { url: 'https://commons.wikimedia.org/wiki/File:Boerderij,_overzicht_vanaf_de_weg_-_Poortvliet_-_20308934_-_RCE.jpg', author: 'G. van Wezel (Rijksdienst voor het Cultureel Erfgoed)', license: 'CC BY-SA 4.0',
        shows: 'Poortvliet farm (anno 1792): whitewashed brick farmhouse with orange-red pantile roof and dormers, regular white-framed sash windows with shutters, barn behind; tree-lined drive and moat-ditch' },
    ],
  },
  copper_mesa: {
    setting: { country: 'Australia', region: 'Queenstown under Mount Lyell, Tasmania', era: '1893–1994' },
    kit: 'queenstown',
    roof: { forms: ['gable', 'hip', 'shed'], covering: 'corrugated iron, red or rusted, on the cottages and the works', pitchDeg: [20, 35], colours: ['#8a3a2a', '#7a5a40'] },
    facade: { materials: 'weatherboard cottages, brick civic buildings, sheet-clad mine works', core: 'masonry', colours: ['#ece7dc', '#c8b89a', '#8a3a2a', '#6a6a68'] },
    storeys: [1, 2], storeyM: [2.6, 4.0],
    windows: { rhythm: 'double-hung sashes either side of a central door', bayM: [1.6, 3.4], shutters: null },
    doors: 'front verandas on posts', shopfronts: 'Orr Street\'s verandah shops',
    ornament: 'veranda lace, painted signs',
    weathering: { damp: 0.6, moss: 0.3, note: 'acid-bleached country, rust' },
    damage: { wear: 0.25, dress: 'derelict works' },
    variation: { axes: { paint: ['#8a2a22', '#2e4a3a', '#e8e4da'] }, roofAge: [0, 1] },
    surface: { grime: 1.2, patches: 0.5, tileRelief: 1.15, reveal: 0.1, eave: 0.4 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Sticht_Street_Queenstown,_Tasmania_from_Spion_Kop_in_1970s.jpg', author: 'JarrahTree', license: 'CC BY 2.5 au',
        shows: 'Sticht Street from Spion Kop, 1970s: hillside of single- and two-storey weatherboard houses, hipped and gable corrugated-iron roofs painted red, maroon and green, white-painted boards, brick chimneys, Federation-era civic building with parapet; denuded hills behind' },
      { url: 'https://commons.wikimedia.org/wiki/File:Mt_Lyell_Mine,_Queenstown,_Tasmania_(13192773065).jpg', author: 'caspar s', license: 'CC BY 2.0',
        shows: 'Mount Lyell mine, 2014: steel headframe and grey corrugated-sheet mill and workshop sheds on the slope, bare eroded orange-buff and grey hills stripped by smelter fumes' },
      { url: 'https://commons.wikimedia.org/wiki/File:Orr_Street,_Queenstown,_Tasmania.jpg', author: 'Gas Panic42 (English Wikipedia)', license: 'CC BY-SA 3.0',
        shows: 'Orr Street: two-storey timber and rendered shopfronts with continuous street verandahs on posts, parapets hiding roofs, painted signs, Empire Hotel tower; misty bush hills' },
    ],
  },
  airfield: {
    setting: { country: 'Ukraine', region: 'Hostomel (Antonov) airport, Kyiv oblast', era: 'February 2022' },
    kit: 'hostomel',
    roof: { forms: ['flat', 'vault', 'gable', 'hip'], covering: 'bitumen flats on the blocks, the barrel-vaulted hangar, sheet; slate or sheet on the dachas', pitchDeg: [5, 40], colours: ['#5a5a58', '#7a8a8a', '#8a3a2a'] },
    facade: { materials: 'precast concrete panels and white silicate brick, sheet-steel hangars; plastered or brick dachas', core: 'masonry', colours: ['#cfcbc7', '#a8a49c', '#e6e4dc', '#3f6fa8'] },
    storeys: [1, 5], storeyM: [2.3, 3.3],
    windows: { rhythm: 'ribbon windows on the 1970s blocks, white plastic replacements in the dachas', bayM: [0.8, 3.0], shutters: null },
    doors: 'steel doors under concrete canopies', shopfronts: 'a kiosk by the gate',
    ornament: 'mosaic panels, Antonov lettering on the hangar',
    weathering: { damp: 0.55, moss: 0.25, note: 'runoff stains on the panels' },
    damage: { wear: 0.45, dress: 'burnt hangars, shell holes, blown windows' },
    variation: { axes: { paint: ['#3f6fa8', '#4e7a5a', '#8a3a2a'] }, roofAge: [0, 1] },
    surface: { grime: 1.0, patches: 0.75, tileRelief: 1.15, reveal: 0.1, eave: 0.35 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Antonov_Airport_after_Russian_invasion_of_Ukraine_and_Mriya.jpg', author: 'Oleksandr Ratushniak', license: 'CC BY-SA 4.0',
        shows: 'Antonov hangar after the battle, April 2022: huge segmental-arch steel hangar with ribbed corrugated cladding, roof shredded to the frame, wrecked An-225 inside; concrete apron with debris' },
      { url: 'https://commons.wikimedia.org/wiki/File:Kalibr_cruise_missile_crater.jpeg', author: 'Крічер (Ukrainian Wikipedia user)', license: 'CC BY-SA 3.0',
        shows: 'dormitory near Hostomel airport, 25 Feb 2022: Soviet 4-storey block in buff/yellow render with white plinth band, regular 3-light windows blown out, small entrance canopy, trees with whitewashed trunks; missile crater in front' },
      { url: 'https://commons.wikimedia.org/wiki/File:Gostomel-airport.jpg', author: 'Oleksiynaumov (English Wikipedia)', license: 'CC BY 3.0',
        shows: 'Hostomel airfield from the air: single long runway and apron, cluster of hangars and service buildings, surrounding pine woods, fields and dacha/village plots with small houses' },
    ],
  },
  oasis: {
    setting: { country: 'Egypt', region: 'Siwa Oasis (Shali)', era: 'the twentieth century' },
    kit: 'siwa',
    roof: { forms: ['flat'], covering: 'palm-beam and mat roofs under mud behind rounded parapets', pitchDeg: null, colours: ['#b8a07a'] },
    facade: { materials: 'kershef (salt-crusted mud and rock) in rounded, battered blocks; palm-trunk beams', core: 'adobe', colours: ['#b8a07a', '#a88a62', '#d8c8a8'] },
    storeys: [1, 3], storeyM: [2.4, 3.0],
    windows: { rhythm: 'few small windows behind palm-wood shutters', bayM: null, shutters: 'palm-wood shutters' },
    doors: 'plank doors with palm lintels', shopfronts: 'the souk\'s stalls under palm-rib mats',
    ornament: 'palm-trunk beam ends through the walls',
    weathering: { damp: 0.12, moss: 0, note: 'salt crust at the foot, rain-melted tops' },
    damage: { wear: 0.2, dress: 'melted and collapsed upper storeys (the 1926 rains)' },
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 0.5, patches: 0.6, tileRelief: 1.0, reveal: 0.3, eave: 0 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Shali_(Historic_Center_of_Siwa)_02.JPG', author: 'Michael Hermann', license: 'CC BY-SA 4.0',
        shows: 'Shali old town from above: dense ruined mass of kershef walls, eroded rounded parapets and flat roofs, rebuilt house volumes in smooth mud render, Gebel Dakrour/palm groves behind; buff-grey-brown palette' },
      { url: 'https://commons.wikimedia.org/wiki/File:SiwaTownSiwaHouse.jpg', author: 'Roland Unger', license: 'CC BY-SA 3.0',
        shows: 'Siwa House (museum), town of Siwa: two-storey flat-roofed kershef house, thick battered walls in grey-buff mud plaster, small square windows with green-painted shutters and pinkish surrounds, palm-trunk beam ends projecting, plank door' },
      { url: 'https://commons.wikimedia.org/wiki/File:Siwa-Homes2009.jpg', author: 'tronics (Flickr)', license: 'CC BY 2.0',
        shows: 'old Siwa homes: stacked 2-3 storey kershef houses with rounded wall tops, irregular small openings, palm-log lintels, exterior stairs, eroded walls and rubble' },
    ],
  },
  whiteout: {
    setting: { country: 'Canada', region: 'Cape Dyer, Baffin Island (DYE-M)', era: 'the 1980s' },
    kit: 'arctic',
    roof: { forms: ['flat', 'vault', 'dome'], covering: 'the module train\'s flats, Jamesway arches, the radome', pitchDeg: null, colours: ['#e6e4dc', '#5a6a5a'] },
    facade: { materials: 'insulated steel modules, painted sheet, canvas Jamesways', core: 'masonry', colours: ['#e6e4dc', '#c83a2a', '#5a6a5a', '#d9b84e'] },
    storeys: [1, 2], storeyM: [2.6, 4.0],
    windows: { rhythm: 'few small windows, triple-glazed', bayM: [2.0, 5.0], shutters: null },
    doors: 'insulated doors in vestibules', shopfronts: null,
    ornament: 'station lettering, aviation stripes',
    weathering: { damp: 0.25, moss: 0, note: 'rime and drift, rust at seams' },
    damage: { wear: 0.1, dress: 'stripped cladding' },
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 0.4, patches: 0.2, tileRelief: 1.0, reveal: 0.1, eave: 0.15 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Point_Lay_Alaska_DEW_Line.jpg', author: 'U.S. Air Force (DoD photo)', license: 'Public domain',
        shows: 'LIZ-2 Point Lay (Alaska) DEW Line station, 1980s aerial: long raised \'module train\' of joined prefabricated box modules on piles, white/pale grey insulated panels, white spherical radome on a tower at one end, flat tropospheric-scatter billboard antennas, small dish antennas, a half-cylinder Jamesway/quonset hut alongside, snow and fuel tanks' },
      { url: 'https://commons.wikimedia.org/wiki/File:Former_DEW_Line_Radar_station.jpg', author: 'TSgt Donald L. Wetterman, U.S. Air Force', license: 'Public domain',
        shows: 'POW-station on the Alaskan coast, 1988 aerial: low flat-roofed module train with white radome tower, masts, outbuildings and vehicle sheds in a row on flat snow; shadow of the aircraft' },
      { url: 'https://commons.wikimedia.org/wiki/File:Campraven.jpg', author: 'Ingo Wölbern', license: 'Public domain',
        shows: 'Camp Raven, Greenland ice sheet, 2000: red Jamesway-type fabric huts (half-cylinder on timber floor, wooden end walls with a door and vestibule), power cables on poles, wind generator; drifting snow' },
    ],
  },
  orchard: {
    setting: { country: 'Lebanon', region: 'the Chouf (Deir el Qamar, Beiteddine, Ain Zhalta)', era: 'the twentieth century' },
    kit: 'chouf',
    roof: { forms: ['hip', 'flat'], covering: 'red Marseille tile; rolled earth on the older flat roofs', pitchDeg: [20, 30], colours: ['#a84a32', '#8a7a60'] },
    facade: { materials: 'dressed honey sandstone and limestone', core: 'masonry', colours: ['#d8c49a', '#c8a878', '#e6dccb'] },
    storeys: [1, 3], storeyM: [3.0, 4.0],
    windows: { rhythm: 'the triple-arched window (qanatir) at the centre of the hall front, paired arches either side', bayM: [1.2, 4.0], shutters: 'green louvred shutters' },
    doors: 'arched doors up stone steps', shopfronts: 'the souk\'s vaulted shops',
    ornament: 'the triple arch, marble colonnettes, ablaq bands',
    weathering: { damp: 0.45, moss: 0.25, note: 'dark stains under the sills, lichen' },
    damage: { wear: 0.3, dress: 'shell scars, burnt houses' },
    variation: { axes: { paint: ['#3f6a4a', '#4c5a6a', '#6a4a32'] }, roofAge: [0, 1] },
    surface: { grime: 0.9, patches: 0.6, tileRelief: 1.35, reveal: 0.3, eave: 0.5 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Deir_El-Qamar_02.jpg', author: 'Patrice Bon', license: 'CC0',
        shows: 'Deir el Qamar square: two-storey cream-sandstone house with low hipped roof in orange-red Marseille tile, upper floor with four round-arched windows with blue-painted fanlights, arched ground-floor openings, vaulted arcades and terraced ashlar walls; more hipped-roof houses and arched loggias up the pine-clad hill' },
      { url: 'https://commons.wikimedia.org/wiki/File:Deir_al-Qamar_from_on_high.jpg', author: 'Peripitus', license: 'CC BY-SA 3.0',
        shows: 'Deir el Qamar from above: dense terraced town of ashlar sandstone houses with pyramidal/hipped red-tile roofs, flat-roofed older vaulted buildings with small domes (souk/khan), mountain valley beyond' },
      { url: 'https://commons.wikimedia.org/wiki/File:Deir_al-Qamar_1.jpg', author: 'Freedom\'s Falcon', license: 'CC BY-SA 3.0',
        shows: 'Deir el Qamar main square: Fakhreddine mosque with octagonal minaret in honey ashlar, ground-floor arcades of pointed and round arches, two-storey houses with arched windows and red tile roofs, shopfronts with awnings' },
    ],
  },
  longleaf: {
    setting: { country: 'United States', region: 'Longleaf, Louisiana (the Crowell company town)', era: '1941' },
    kit: 'longleaf',
    roof: { forms: ['gable', 'hip'], covering: 'corrugated and 5-V crimp tin', pitchDeg: [25, 45], colours: ['#7a7a76', '#8a5a40'] },
    facade: { materials: 'board-and-batten and weatherboard on brick piers, painted or bare', core: 'masonry', colours: ['#ece7dc', '#c8b89a', '#8a7a60'] },
    storeys: [1, 2], storeyM: [2.8, 3.6],
    windows: { rhythm: 'tall double-hung sashes either side of the door', bayM: [1.6, 5.4], shutters: 'board shutters' },
    doors: 'front porches on posts', shopfronts: 'the commissary\'s galleried front',
    ornament: 'porch posts and rails',
    weathering: { damp: 0.65, moss: 0.35, note: 'humid rot and rust' },
    damage: { wear: 0.3, dress: 'burnt and boarded windows' },
    variation: { axes: { paint: ['#e8e4da', '#3a4a3a', '#6a4a32'] }, roofAge: [0, 1] },
    surface: { grime: 1.1, patches: 0.5, tileRelief: 1.15, reveal: 0.05, eave: 0.45 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Dogtrot_house,_Dubach,_LA_IMG_2552.JPG', author: 'Billy Hathorn', license: 'CC BY-SA 3.0',
        shows: 'dogtrot house, Dubach (north Louisiana): two pens under one broad side-gable roof (~30 deg) of rusted corrugated/5-V crimp tin, open central breezeway, full-width front porch on square posts with plain railing, brick end chimneys, raised on piers with board steps; unpainted/white-washed boards' },
      { url: 'https://commons.wikimedia.org/wiki/File:Mandeville_Louisiana_2001_-_Shotgun_House.jpg', author: 'Infrogmation of New Orleans', license: 'CC BY-SA 4.0',
        shows: 'Mandeville, LA: small wooden shotgun house, one room wide, front gable to the road, weathered grey vertical/horizontal boards, rusting standing-seam/tin roof, shuttered front window and door, raised on low piers in pine shade' },
      { url: 'https://commons.wikimedia.org/wiki/File:Marion_Post_Wolcott_cross_roads_store.jpg', author: 'Marion Post Wolcott', license: 'Public domain',
        shows: 'Melrose, LA, June 1940 (Marion Post Wolcott, FSA): crossroads store with false-front parapet and full-width shed porch on posts, walls plastered with tin advertising signs, screen door, gas pump; the commissary/store type in colour' },
    ],
  },
  mangrove: {
    setting: { country: 'Vietnam', region: 'the Cà Mau peninsula (Mekong delta coast)', era: 'the 1960s' },
    kit: 'mekong',
    roof: { forms: ['gable', 'hip'], covering: 'nipa-palm thatch and corrugated iron', pitchDeg: [25, 40], colours: ['#8a7d68', '#7a5a40'] },
    facade: { materials: 'plank and woven palm on stilts', core: 'masonry', colours: ['#8a7a60', '#a89070', '#5a4a3a'] },
    storeys: [1, 1], storeyM: [2.4, 3.0],
    windows: { rhythm: 'shuttered openings, few', bayM: [1.6, 4.0], shutters: 'propped plank and palm shutters' },
    doors: 'plank doors onto the landing stage', shopfronts: 'a riverside shop on stilts',
    ornament: 'ancestral altar and its incense, painted door boards',
    weathering: { damp: 0.8, moss: 0.5, note: 'water marks and mould on the stilts' },
    damage: { wear: 0.2, dress: 'burnt houses' },
    variation: { axes: { paint: ['#3a6a9a', '#8a2a22', '#3c6a3e'] }, roofAge: [0, 1] },
    surface: { grime: 1.2, patches: 0.4, tileRelief: 1.0, reveal: 0.15, eave: 0.5 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:PCF_fire_hits_a_VC_village_on_the_Ca_Mau_peninsula.jpg', author: 'PHC A.R. Hill, U.S. Navy', license: 'Public domain',
        shows: 'Cà Mau peninsula village, April 1969: low hut with steep nipa-palm thatch roof hanging close to the ground, walls of palm-leaf panels, bamboo/stick fences and posts, smoke; cleared mangrove stumps behind' },
      { url: 'https://commons.wikimedia.org/wiki/File:Vietnam_08_-_169_-_riverside_homes_(3187507614).jpg', author: 'McKay Savage', license: 'CC BY 2.0',
        shows: 'Mekong riverbank homes: houses raised on slender timber and concrete piles over the water, plank and sheet walls painted pale blue/white, shallow gable roofs in rusty corrugated iron and fibre-cement, open verandahs with railings, palms behind' },
      { url: 'https://commons.wikimedia.org/wiki/File:Ch%E1%BB%A3_%C4%90%E1%BA%A5t_M%C5%A9i.jpg', author: 'ASM (Vietnamese Wikipedia user)', license: 'CC BY-SA 3.0',
        shows: 'Đất Mũi market (Cà Mau): low market hall with shallow gable roof and painted sign at the canal edge, timber landing stage on piles, 2-3 storey rendered shophouses with coloured signboards, blue tarps' },
    ],
  },
  saltwind: {
    setting: { country: 'Croatia', region: 'the central Dalmatian coast (Brač, the Šibenik hinterland)', era: 'the twentieth century' },
    kit: 'dalmatian',
    roof: { forms: ['gable'], covering: 'canal tile and stone slab (kamene ploče)', pitchDeg: [18, 30], colours: ['#a85a3a', '#a8a49c'] },
    facade: { materials: 'white-grey limestone, dressed or rubble', core: 'masonry', colours: ['#e6e0d2', '#c8c0b0', '#a8a49c'] },
    storeys: [1, 3], storeyM: [2.6, 3.2],
    windows: { rhythm: 'tall narrow windows with stone frames in regular bays', bayM: [1.4, 3.0], shutters: 'green louvred shutters (škure)' },
    doors: 'outside stone stairs to the upper door (balatura)', shopfronts: 'the konoba and harbour shops',
    ornament: 'stone window frames, the bell-cote',
    weathering: { damp: 0.45, moss: 0.25, note: 'salt and lichen' },
    damage: { wear: 0.3, dress: 'abandoned and roofless houses' },
    variation: { axes: { paint: ['#3f6a4a', '#5a7a6a', '#7a5a3a'] }, roofAge: [0, 1] },
    surface: { grime: 0.9, patches: 0.75, tileRelief: 1.35, reveal: 0.3, eave: 0.2 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Li%C5%A1njak.jpg', author: 'Vurlan', license: 'CC BY-SA 4.0',
        shows: 'Lišnjak (Dalmatian hamlet): two-storey rough-coursed limestone houses with gable roofs ~30 deg in red-orange canal (kupa kanalica) tiles, partly collapsed, dry-stone walls and stone stair, small square openings, plank doors' },
      { url: 'https://commons.wikimedia.org/wiki/File:Pu%C4%8Di%C5%A1%C4%87a_BW_2024-10-04_11-39-16.jpg', author: 'Berthold Werner', license: 'CC BY-SA 4.0',
        shows: 'Pučišća (Brač): old house of dressed white Brač limestone, roof in thin grey stone slabs (kamene ploče) with a stone dormer, louvred green-grey shutters (škure), stone window frames, worn render' },
      { url: 'https://commons.wikimedia.org/wiki/File:Skrip.JPG', author: 'Honza Beran', license: 'CC BY 2.5',
        shows: 'Škrip (Brač): long rubble-limestone houses with stone-slab roofs pointed white with lime at the ridges and verges, multiple gables, light grey-blue louvred shutters, Radojković tower behind' },
    ],
  },
  reservoir: {
    setting: { country: 'Germany', region: 'the northern Eifel (Rur and Urft dams, Monschau)', era: '1944–1945' },
    kit: 'eifel',
    roof: { forms: ['gable', 'hip', 'halfhip'], covering: 'Moselle slate', pitchDeg: [40, 55], colours: ['#3b3f45'] },
    facade: { materials: 'black-and-white Fachwerk on greywacke, slate-hung weather sides', core: 'masonry', colours: ['#ece7dc', '#2a2a2a', '#6a6a68'] },
    storeys: [1, 3], storeyM: [2.4, 3.2],
    windows: { rhythm: 'paired casements between the frame\'s posts', bayM: [1.2, 2.8], shutters: 'some painted shutters' },
    doors: 'plank doors up stone steps', shopfronts: 'the Gasthaus',
    ornament: 'black frame, white infill, slate-hung gables',
    weathering: { damp: 0.8, moss: 0.5, note: 'moss and damp, the Eifel rain' },
    damage: { wear: 0.2, dress: 'burnt and boarded windows' },
    variation: { axes: { paint: ['#3a5a40', '#6a2a22', '#8a8a86'] }, roofAge: [0, 1] },
    surface: { grime: 1.2, patches: 0.55, tileRelief: 1.2, reveal: 0.15, eave: 0.35 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Monschau,_Rur_--_2021_--_184134.jpg', author: 'Dietmar Rabich', license: 'CC BY-SA 4.0',
        shows: 'Monschau on the Rur: dark greywacke rubble mill walls along the river, 3-4 storey town houses in black-and-white Fachwerk and slate-hung facades, steep slate roofs with dormers, wooded valley slopes' },
      { url: 'https://commons.wikimedia.org/wiki/File:Simmerath_Witzerath_in_Witzerath_50_Fachwerk_Winkelhof.jpg', author: 'Caronna', license: 'CC BY-SA 3.0',
        shows: 'Witzerath (Simmerath): Eifel Winkelhof, L-shaped single-storey Fachwerk farm with black timbers on white infill, steep (~45-50 deg) roofs in grey slate/fibre-cement, brick chimney, red-framed windows, greywacke garden wall' },
      { url: 'https://commons.wikimedia.org/wiki/File:Simmerath_Rollesbroich_Am_Stein_3.jpg', author: 'Caronna', license: 'CC BY-SA 3.0',
        shows: 'Rollesbroich (Simmerath): long Wohn-Stall-Haus, black-and-white Fachwerk with irregular framing, red window frames, large green plank barn door, dark grey slate-type roof with low eaves' },
    ],
  },
  mars: {
    setting: { country: 'Mars', region: 'Olympus Basin research station', era: '2100' },
    kit: 'olympus',
    roof: { forms: ['flat', 'vault'], covering: 'sintered regolith over pressurised modules', pitchDeg: null, colours: ['#a85a3a'] },
    facade: { materials: 'pressurised cargo modules banked in sintered regolith', core: 'concrete', colours: ['#e6e4dc', '#a85a3a', '#c8783a'] },
    storeys: [1, 2], storeyM: [2.5, 4.0],
    windows: { rhythm: 'none or ports', bayM: null, shutters: null },
    doors: 'airlocks', shopfronts: null,
    ornament: 'agency markings',
    weathering: { damp: 0.05, moss: 0, note: 'dust' },
    damage: { wear: 0.05, dress: 'none' },
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 0.2, patches: 0.1, tileRelief: 1.0, reveal: 0, eave: 0 },
    references: [],
  },
  moon: {
    setting: { country: 'the Moon', region: 'Taurus-Littrow Station (the Apollo 17 valley)', era: '2046' },
    kit: 'littrow',
    roof: { forms: ['vault', 'flat'], covering: 'regolith shielding over the habitats', pitchDeg: null, colours: ['#8a8a86'] },
    facade: { materials: 'white multi-layer insulation dusted grey, gold foil, safety orange', core: 'concrete', colours: ['#e6e4dc', '#c8a040', '#e8742a'] },
    storeys: [1, 2], storeyM: [2.5, 4.0],
    windows: { rhythm: 'none or ports', bayM: null, shutters: null },
    doors: 'airlocks', shopfronts: null,
    ornament: 'agency markings',
    weathering: { damp: 0, moss: 0, note: 'regolith dust' },
    damage: { wear: 0.15, dress: 'micrometeorite pits, stripped insulation' },
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 0.2, patches: 0.1, tileRelief: 1.0, reveal: 0, eave: 0 },
    references: [],
  },
  cliffbridge: {
    setting: { country: 'Spain', region: 'the Serranía de Ronda (Málaga)', era: 'the twentieth century' },
    kit: 'andalusian',
    roof: { forms: ['gable', 'hip'], covering: 'canal tiles (teja árabe), weathered brown with lichen', pitchDeg: [18, 30], colours: ['#a86a4a', '#8a6a52'] },
    facade: { materials: 'limewashed rubble and brick, ochre or grey dados', core: 'masonry', colours: ['#f2f0ea', '#e6e0d2', '#c8a060', '#5a6a8a'] },
    storeys: [1, 3], storeyM: [2.6, 3.4],
    windows: { rhythm: 'irregular small windows behind rejas, iron balconies above', bayM: [1.4, 3.4], shutters: 'green or brown plank shutters' },
    doors: 'plank doors in painted surrounds', shopfronts: 'bars and the tienda on the plaza',
    ornament: 'rejas, wrought-iron balconies, painted dados and door surrounds',
    weathering: { damp: 0.35, moss: 0.3, note: 'limewash greyed at the foot, lichen on the tiles' },
    damage: { wear: 0.18, dress: 'burnt and boarded windows' },
    variation: { axes: { band: ['ochre', 'grey', 'none'], joinery: ['green', 'brown', 'white'] }, roofAge: [0.2, 1] },
    surface: { grime: 0.9, patches: 0.65, tileRelief: 1.35, reveal: 0.25, eave: 0.3 },
    references: [
      { url: 'https://commons.wikimedia.org/wiki/File:Grazalema-plaza-ayuntamiento.jpg', author: 'El Pantera', license: 'CC BY-SA 4.0',
        shows: 'Grazalema (Sierra de Grazalema, adjoining the Serranía): plaza and tightly packed two/three-storey limewashed houses under low (~20-25 deg) brown-red canal-tile roofs, church tower, iron-railed balconies, rock outcrops above' },
      { url: 'https://commons.wikimedia.org/wiki/File:Setenil_de_las_Bodegas_-_020_(30076495474).jpg', author: 'Luis Rogelio HM', license: 'CC BY-SA 2.0',
        shows: 'Setenil de las Bodegas street: houses built into the overhanging rock, brilliant white limewash, iron window grilles (rejas) on ground-floor windows, small iron balconies with flower pots, dark timber doors and frames, ochre/grey dado' },
      { url: 'https://commons.wikimedia.org/wiki/File:Cortijo_de_las_Piletas,_Ronda.jpg', author: 'Toprural', license: 'CC BY-SA 2.0',
        shows: 'Cortijo de las Piletas (Ronda): whitewashed farmstead group with low tiled roofs among oak dehesa and sunflower fields, long single/two-storey ranges around a yard' },
    ],
  },
} as const satisfies { readonly [K in MapId]: BuildingStyleRow };

const ROWS: Readonly<Record<string, BuildingStyleRow | undefined>> = BUILDING_STYLES;
const KIT_ROWS: ReadonlyMap<string, BuildingStyleRow> = new Map(Object.values(BUILDING_STYLES).map((row) => [row.kit, row]));

/** A battlefield's row (null for an id outside the table: a receipt's own map). */
export function buildingStyleOf(mapId: string): BuildingStyleRow | null {
  return ROWS[mapId] ?? null;
}

/**
 * The row a kit's building answers to on a map: the map's own (its climate and its war, whatever kit built the house — a
 * border farmstead of a neighbouring style weathers as the map does); off the table (a receipt's harness map), the row of
 * the battlefield the kit was drawn for. There is no default: a kit without a row fails here.
 */
function rowFor(mapId: string, kit?: string): BuildingStyleRow {
  const row = ROWS[mapId] ?? (kit === undefined ? undefined : KIT_ROWS.get(kit));
  if (!row) throw new Error(`No building-style row for map ${mapId} or kit ${kit ?? '(none)'}`);
  return row;
}

/** The weathering strengths a kit's building takes on a map (rising damp at the wall foot, moss toward the eaves). */
export function climateOf(mapId: string, kit?: string): BuildingStyleRow['weathering'] {
  return rowFor(mapId, kit).weathering;
}

/** A kit's buildings' surface and depth on a map. */
export function surfaceOf(mapId: string, kit: string): BuildingStyleRow['surface'] {
  return rowFor(mapId, kit).surface;
}

/** What a kit's buildings vary in on a map. */
export function variationOf(mapId: string, kit: string): BuildingVariation {
  return rowFor(mapId, kit).variation;
}

/** The share of a kit's houses on a map that show war damage. */
export function wearOf(mapId: string, kit: string): number {
  return rowFor(mapId, kit).damage.wear;
}
