// Polish removable protection layouts. Data only: safe for the ghillie registry.
import type {GhillieConfig} from './ghillieSuit.ts';

export const POLISH_PROTECTION_LAYOUTS = [
  {id:'pl_t80u_modern', hullX:2.33, hullBottom:.83, hullTop:1.38,
    hullPanels:[[-2.42,-1.10],[-.90,.59],[.80,2.32]],
    turretX:1.91, turretBottom:.33, turretTop:.60, turretPanels:[[-1.65,-.58]],
    rearZ:-2.55, rearHalf:1.29, rearBottom:.43, rearTop:.73, rearSeatZ:-1.72, rearSeatY:.465},
  {id:'pl_t72b3m_modern', hullX:2.42, hullBottom:.73, hullTop:1.40,
    hullPanels:[[-2.70,-1.50],[-1.32,-.12],[.17,1.28],[1.46,2.68]],
    turretX:2.04, turretBottom:.35, turretTop:.67, turretPanels:[[-1.83,-.75],[-.57,.43]],
    rearZ:-2.62, rearHalf:1.37, rearBottom:.44, rearTop:.77, rearSeatZ:-1.98, rearSeatY:.515},
  {id:'pl_t72b3_modern', hullX:2.30, hullBottom:.94, hullTop:1.37,
    hullPanels:[[-2.32,-.92],[-.72,.56],[.89,2.30]],
    turretX:1.81, turretBottom:.33, turretTop:.53, turretPanels:[[-1.38,-.40]],
    rearZ:-2.11, rearHalf:1.13, rearBottom:.41, rearTop:.65, rearSeatZ:-1.50, rearSeatY:.415},
  {id:'pl_t72b3_zubr_ii', hullX:2.35, hullBottom:.72, hullTop:1.34,
    hullPanels:[[-2.43,-1.25],[-1.07,.11],[.29,1.47],[1.65,2.68]],
    turretX:2.05, turretBottom:.38, turretTop:.72, turretPanels:[[-1.98,-1.24],[-1.08,-.34]],
    rearZ:-2.99, rearHalf:1.34, rearBottom:.44, rearTop:.78, rearSeatZ:-2.18, rearSeatY:.51},
] as const;

type Layout = (typeof POLISH_PROTECTION_LAYOUTS)[number];
type Point2 = [number, number];
type TopPanel = NonNullable<NonNullable<GhillieConfig['hull']>['top']>[number];

// Covers are stitched to the new screen frames, not draped across hatches,
// optics or launch areas. Leaving alternate hull panels bare makes the ERA
// array legible and retains Polish ordered modularity beneath the scrim.
function screenScrim(d: Layout, m: number): GhillieConfig {
  return {
    id:d.id,seed:7400+m*97,style:'ulcans',density:.87,leafScale:.66,
    light:[0x68724b,0x73744d,0x657547,0x747852][m]!,dark:0x35412c,
    netColor:'rgba(49,61,37,0.88)',
    hull:{side:[-1,1].flatMap(side=>d.hullPanels.filter((_,i)=>i!==1||m===2).map(([a,b],i)=>({
      side,z0:a+.06,z1:b-.06,nz:12,ny:5,topAt:()=>d.hullTop-.026,
      bottomAt:()=>d.hullBottom+.027,outAt:()=>d.hullX+.027,seed:51+m*11+i+side,
    })))},
    turret:{
      side:[-1,1].flatMap(side=>d.turretPanels.map(([a,b],i)=>({
        side,z0:a+.045,z1:b-.045,nz:10,ny:4,topAt:()=>d.turretTop-.025,
        bottomAt:()=>d.turretBottom+.025,outAt:()=>d.turretX+.027,seed:111+m*13+i+side,
      }))),
      face:[{z:d.rearZ-.027,x0:-d.rearHalf+.05,x1:d.rearHalf-.05,
        y0:d.rearBottom+.025,y1:d.rearTop-.025,nx:20,ny:4,seat:'Polish rear cage crossbars',seatGapM:.027,seed:211+m*17}],
    },
  };
}

/**
 * 2026-10-13 (netting-pl; the owner: "also add a bunch of ghillie on the husarz and zubr polish tanks", with "make sure
 * roof ghillie and leaves aren't as ridiculously placed like peacock feathers, make them more proper" and, of the
 * earlier field suits, "be unafraid of adding these on roofs of hulls or turrets"): the Husarz and both Zubrs wear the
 * full field suit, measured on the built hulls. The hull frame's decks: `deck` is the engine and front deck's height,
 * the glacis falls `fall` a metre ahead of `glacis`, the net runs from `stern` to `bow`; the turret frame's roof:
 * `roof` is its height, the net runs from the bustle screen to `brow`. `marks` are the turret-frame seats of the
 * national insignia and the hull number (vehicleMarkingSeatGroups/nationalModernization.generated.ts, solved on the
 * bare kit): the roof net opens 26 cm round each, so the finished hull still shows them, as the UA hulls' and the
 * Burlak's. `pivot` is the turret ring's centre on the hull (its z): the deck under the cast turret (`ring` round it) is
 * never seen and carries no net.
 */
const POLISH_FIELD: Readonly<Partial<Record<Layout['id'], {
  deck: number; glacis: number; fall: number; stern: number; bow: number; pivot: number; ring: number;
  roof: number; brow: number; marks: readonly (readonly [number, number])[];
}>>> = {
  pl_t80u_modern: {deck: 1.53, glacis: 1.95, fall: .41, stern: -3.24, bow: 3.34, pivot: .07187, ring: 1.30,
    roof: .70, brow: 1.70, marks: [[-.64, -1.18], [-1.11, -.71]]},
  pl_t72b3_modern: {deck: 1.46, glacis: 1.90, fall: .48, stern: -3.12, bow: 3.28, pivot: .065591, ring: 1.24,
    roof: .64, brow: 1.55, marks: [[-.51, -1.12], [-1.09, -.66]]},
  pl_t72b3_zubr_ii: {deck: 1.46, glacis: 1.90, fall: .48, stern: -3.12, bow: 3.28, pivot: .065591, ring: 1.24,
    roof: .80, brow: 1.85, marks: [[-1.31, -1.93], [1.30, -1.97]]},
};

const square = ([x, z]: readonly [number, number], r: number): Point2[] => [[x - r, z - r], [x + r, z - r], [x + r, z + r], [x - r, z + r]];
const circle = (z: number, r: number): Point2[] => Array.from({length: 24}, (_, k): Point2 =>
  [Math.cos(k * Math.PI / 12) * r, z + Math.sin(k * Math.PI / 12) * r]);

/** A roof or deck net laid over the armour (ghillieFleetSuits.ts laid: clipped to the armour, opened round every lid). */
function laid(panel: Omit<TopPanel, 'yFromArmour' | 'clipToArmour' | 'autoOpeningsM' | 'rimScale'>): TopPanel {
  return {yFromArmour: true, clipToArmour: true, autoOpeningsM: .07, rimScale: .5, ...panel};
}

/**
 * The field suit: one net over the hull from the stern to the bow (the engine deck, the fenders and the skirt modules'
 * tops, the front deck and the glacis over its ERA to the nose; the driver's hatch, periscopes and lamps opened by the
 * builder, the cloth flat under the gun), drapes on every bay of the slat screens (no bay left bare: the owner asked for
 * "a bunch"), tied under each screen's top rail; the turret roof and bustle under one net round the hatches, sights, the
 * roof weapon's sweep and the drone dock (the builder) and the markings (above), drapes on the turret screens and the
 * bustle cage's rear face. The suit keeps the working vehicle's clearances (fieldClearanceM); its garnish lies along the
 * net (ghillieSuit.ts, netting-proper). The tones follow the Polish three-tone woodland
 * (authoredPaintCatalog paint_pl_t80u_modern: green #4a563b, black-green #29342d, khaki #827458), on the fleet's woodland
 * net texture (seed 1101, shared).
 */
function fieldSuit(d: Layout, m: number): GhillieConfig {
  const f = POLISH_FIELD[d.id]!;
  const deckAt = (_x: number, z: number): number => f.deck - Math.max(0, z - f.glacis) * f.fall;
  return {
    id: d.id, seed: 7400 + m * 97, style: 'leafy', density: 1.8, leafScale: .9, boughShare: .42,
    fieldClearanceM: .03, hemFloorM: d.hullBottom - .05, maxHalfWidth: d.hullX + .14,
    // the owner's performance push (the coordinator, 2026-10-13): 70 % of each clump's cards, broader, so the clump covers
    // the same net; the far tier (LOW) keeps 35 % of them (the Zubr II's LOW was already 75.4 % of its HIGH bare)
    garnishBudget: {clumpCards: .7, lowShare: .35},
    light: [0x68724b, 0x73744d, 0x657547, 0x747852][m]!, dark: 0x2f3a2c, netColor: 'rgba(49,61,37,0.88)', netTextureSeed: 1101,
    hull: {
      top: [laid({x0: -2.12, x1: 2.12, z0: f.stern, z1: f.bow, nx: 42, nz: Math.round((f.bow - f.stern) / .1), yAt: deckAt,
        holes: [circle(f.pivot, f.ring)], garnishRiseM: .12, seed: 31})],
      // tied under each bay's top rail (tiedTop), hung over the slats to the bottom rail
      side: [-1, 1].flatMap((side) => d.hullPanels.map(([a, b], i) => ({
        side, z0: a + .055, z1: b - .055, nz: Math.max(10, Math.round((b - a) / .09)), ny: 7, seed: 37 + side + i * 17,
        topAt: () => d.hullTop - .004, tiedTop: true,
        bottomAt: (z: number) => d.hullBottom + .02 + .018 * Math.sin(z * 5.4 + i),
        outAt: (_z: number, t: number) => d.hullX + .024 + (1 - t) * .018,
      }))),
    },
    turret: {
      top: [laid({x0: -(d.turretX - .04), x1: d.turretX - .04, z0: d.rearZ + .02, z1: f.brow, nx: Math.round((d.turretX - .04) * 20),
        nz: Math.round((f.brow - d.rearZ) / .1), yAt: () => f.roof, garnishRiseM: .12, seed: 151,
        holes: f.marks.map((mark) => square(mark, .26))})],
      side: [-1, 1].flatMap((side) => d.turretPanels.map(([a, b], i) => ({
        side, z0: a + .04, z1: b - .055, nz: Math.max(10, Math.round((b - a) / .08)), ny: 7, seed: 71 + side + i * 13,
        topAt: () => d.turretTop - .026, bottomAt: (z: number) => d.turretBottom + .045 + .017 * Math.sin(z * 5.2),
        outAt: (_z: number, t: number) => d.turretX + .028 + (1 - t) * .015,
      }))),
      face: [{z: d.rearZ - .030, x0: -d.rearHalf + .08, x1: d.rearHalf - .08, y0: d.rearBottom + .04, y1: d.rearTop - .03,
        nx: 26, ny: 6, seed: 91, seatGapM: .027, seat: 'Polish rear cage crossbars'}],
    },
  };
}

export const NATIONAL_POLAND_GHILLIE_CONFIGS: Readonly<Record<string,GhillieConfig>> = Object.fromEntries(
  POLISH_PROTECTION_LAYOUTS.map((d, m) => [d.id, POLISH_FIELD[d.id] ? fieldSuit(d, m) : screenScrim(d, m)]),
);
