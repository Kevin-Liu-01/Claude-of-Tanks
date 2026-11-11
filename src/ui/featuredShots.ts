/**
 * featuredShots.ts — the ONE canonical list of featured stills.
 *
 * Consumed by the boot splash (bootScreen.ts), the garage battle gallery
 * (garage.ts) and the state-transition loading screens (transition.ts).
 * It exists because three hand-maintained copies of these filenames drifted
 * from disk twice (r9.1: preload() errored forever and every rotation stuck
 * on frame 1). URLs must match a checked-in public asset exactly.
 *
 * `FEATURED_SHOTS` remains the complete garage gallery. Loading and transition
 * surfaces use `TRANSITION_SHOTS`: the boot pick (the gallery's one `bootImg`
 * shot), then `LOADING_SHOTS`, the owner's loading-screen gallery (2026-11-11:
 * close-ups, then elevated stills, public/media/loading-r1). Both lists are
 * written by tools/media-r5/site-media-wire.mjs from
 * tools/media-r5/site-media/picks.json (`featured`, `loading`).
 */
import { isMapId } from '../world/maps/catalog.ts';
import { getLocalizedMapName } from './mapNames.ts';
import { mapBackdropFor, type ViewportSample } from './mapBackdrop.ts';

interface FeaturedShot {
  readonly img: string;
  readonly bootImg?: string;
  readonly capKey: string;
  readonly capVars?: Readonly<Record<string, string | number>>;
  readonly maps?: readonly string[];
  readonly focal: string;
  readonly handmade?: boolean;
  readonly animated?: boolean;
}

export const FEATURED_SHOTS: readonly FeaturedShot[] = Object.freeze([
  {
    img: '/media/versus-r1/f6-leo2a6-steinburg-r7.webp',
    bootImg: '/media/versus-r1/f6-leo2a6-steinburg-r7-boot-1280.webp',
    capKey: 'media.versus.title.f6Leo2a6SteinburgR7',
    maps: ['urban'], focal: '46% 60%',
  },
  {
    img: '/media/site50-r14/stills/s07-lake-shellfire.webp',
    capKey: 'media.site50.title.s07LakeShellfire',
    maps: ['alpine', 'whiteout'], focal: '55% 60%',
  },
  {
    img: '/media/site50-r14/stills/s19-roof-tiles-close.webp',
    capKey: 'media.site50.title.s19RoofTiles',
    maps: ['urban', 'ruinspires'], focal: '57% 55%',
  },
  {
    img: '/media/site50-r14/stills/s29-fjord-road-kill.webp',
    capKey: 'media.site50.title.s29FjordRoadKill',
    maps: ['fjord', 'saltwind', 'coastal'], focal: '38% 55%',
  },
  {
    img: '/media/site50-r14/stills/s13-farm-race.webp',
    capKey: 'media.site50.title.s13FarmRace',
    maps: ['frontier', 'steppe', 'longleaf'], focal: '64% 55%',
  },
  {
    img: '/media/site50-r14/stills/s26-minaret-fire.webp',
    capKey: 'media.site50.title.s26MinaretFire',
    maps: ['oasis', 'desert', 'badlands', 'copper_mesa'], focal: '50% 50%',
  },
  {
    img: '/media/site50-r14/stills/s05-barn-advance-close.webp',
    capKey: 'media.site50.title.s05BarnAdvance',
    maps: ['polders'], focal: '64% 50%',
  },
  {
    img: '/media/site50-r14/stills/s30-temple-village-close.webp',
    capKey: 'media.site50.title.s30TempleVillage',
    maps: ['monsoon', 'mangrove'], focal: '57% 55%',
  },
  {
    img: '/media/site50-r14/stills/s33-water-tower-close.webp',
    capKey: 'media.site50.title.s33WaterTower',
    maps: ['railyard', 'airfield'], focal: '50% 55%',
  },
  {
    img: '/media/site50-r14/stills/s34-furnace-salvo-4k.webp',
    capKey: 'media.site50.title.s34FurnaceSalvo',
    maps: ['foundry', 'caldera', 'blackglass'], focal: '38% 50%',
  },
  {
    img: '/media/site50-r14/stills/s38-church-knockout-close.webp',
    capKey: 'media.site50.title.s38ChurchKnockout',
    maps: ['winter'], focal: '39% 50%',
  },
  {
    img: '/media/site50-r14/stills/s49-orchard-sunset.webp',
    capKey: 'media.site50.title.s49OrchardSunset',
    maps: ['orchard', 'autumn'], focal: '78% 62%',
  },
  {
    img: '/media/site50-r14/stills/s37-river-village-close.webp',
    capKey: 'media.site50.title.s37RiverVillage',
    maps: ['delta'], focal: '26% 50%',
  },
  {
    img: '/media/site50-r14/stills/s39-lakeside-village.webp',
    capKey: 'media.site50.title.s39LakesideVillage',
    maps: ['reservoir', 'cliffbridge', 'titan_gorge', 'skybridge'], focal: '43% 50%',
  },
  {
    img: '/media/site50-r14/stills/s23-village-crossroads.webp',
    capKey: 'media.site50.title.s23VillageCrossroads',
    focal: '50% 50%',
  },
  {
    img: '/media/site50-r14/stills/s06-farm-charge.webp',
    capKey: 'media.site50.title.s06FarmCharge',
    focal: '50% 50%',
  },
  {
    img: '/media/site50-r14/stills/s24-ice-duel-close.webp',
    capKey: 'media.site50.title.s24IceDuel',
    focal: '50% 50%',
  },
  {
    img: '/media/site50-r14/stills/s04-column-under-fire.webp',
    capKey: 'media.site50.title.s04ColumnUnderFire',
    focal: '50% 50%',
  },
  {
    img: '/media/site50-r14/stills/s20-road-return-fire-close.webp',
    capKey: 'media.site50.title.s20RoadReturnFire',
    focal: '50% 50%',
  },
  {
    img: '/media/site50-r14/stills/s18-street-knockout.webp',
    capKey: 'media.site50.title.s18StreetKnockout',
    focal: '50% 50%',
  },
]);

/** The loading screens' stills after the boot pick, in the gallery's order (picks.json `loading`). */
export const LOADING_SHOTS: readonly FeaturedShot[] = Object.freeze([
  {
    img: '/media/loading-r1/s198-m1a2-tusk-copper-mesa-duel-low-t70-f33-m271-r14.webp',
    capKey: 'media.loading.title.s198M1a2TuskCopperMesaDuelLowT70F33M271R14',
    maps: ['copper_mesa'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s294-sepv3-copper-mesa-herolow-f33-m271-r14.webp',
    capKey: 'media.loading.title.s294Sepv3CopperMesaHerolowF33M271R14',
    maps: ['copper_mesa'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s298-t90ms-tagil-saltwind-herolow-v3-f33-m271-r14.webp',
    capKey: 'media.loading.title.s298T90msTagilSaltwindHerolowV3F33M271R14',
    maps: ['saltwind'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s280-leo2a3-b4-urban-duel-low-t70-f33-m271-r14.webp',
    capKey: 'media.loading.title.s280Leo2a3B4UrbanDuelLowT70F33M271R14',
    maps: ['urban'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s199-m1a2-x-desert-herolow-m271-r14.webp',
    capKey: 'media.loading.title.s199M1a2XDesertHerolowM271R14',
    maps: ['desert'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s143-ru-t72b3m-modern-mars-herolow-fb-m271-r14.webp',
    capKey: 'media.loading.title.s143RuT72b3mModernMarsHerolowFbM271R14',
    maps: ['mars'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s39-leo2a7v-lakeside-village-herolow-cl-t3333-m271-r14.webp',
    capKey: 'media.loading.title.s39Leo2a7vLakesideVillageHerolowClT3333M271R14',
    maps: ['reservoir'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s120-type10-skybridge-herolow-v3-m271-r14.webp',
    capKey: 'media.loading.title.s120Type10SkybridgeHerolowV3M271R14',
    maps: ['skybridge'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s286-leo2a4m-monsoon-herohigh-v2-fb-m271-r14.webp',
    capKey: 'media.loading.title.s286Leo2a4mMonsoonHerohighV2FbM271R14',
    maps: ['monsoon'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s296-t90m-proryv-coastal-duel-low-tm70-f33-m271-r14.webp',
    capKey: 'media.loading.title.s296T90mProryvCoastalDuelLowTm70F33M271R14',
    maps: ['coastal'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s202-kf51-panther-copper-mesa-herohigh-m271-r14.webp',
    capKey: 'media.loading.title.s202Kf51PantherCopperMesaHerohighM271R14',
    maps: ['copper_mesa'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s267-t90a-vladimir-caldera-herohigh-fb-m271-r14.webp',
    capKey: 'media.loading.title.s267T90aVladimirCalderaHerohighFbM271R14',
    maps: ['caldera'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s289-t90ms-2011-longleaf-duel-low-tm95-m271-r14.webp',
    capKey: 'media.loading.title.s289T90ms2011LongleafDuelLowTm95M271R14',
    maps: ['longleaf'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s307-sepv2-airfield-herolow-m271-r14.webp',
    capKey: 'media.loading.title.s307Sepv2AirfieldHerolowM271R14',
    maps: ['airfield'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s47-ironworks-crane-herolow-fb-m271-r14.webp',
    capKey: 'media.loading.title.s47IronworksCraneHerolowFbM271R14',
    maps: ['foundry'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s190-t90am-frontier-herolow-own-m271-r14.webp',
    capKey: 'media.loading.title.s190T90amFrontierHerolowOwnM271R14',
    maps: ['frontier'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s219-amx56-oasis-herolow-fb-m271-r14.webp',
    capKey: 'media.loading.title.s219Amx56OasisHerolowFbM271R14',
    maps: ['oasis'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s157-leo2-revolution-delta-herolow-own-fb-m271-r14.webp',
    capKey: 'media.loading.title.s157Leo2RevolutionDeltaHerolowOwnFbM271R14',
    maps: ['delta'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s105-merkava4-trophy-copper-mesa-duel-low-t70-m271-r14.webp',
    capKey: 'media.loading.title.s105Merkava4TrophyCopperMesaDuelLowT70M271R14',
    maps: ['copper_mesa'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s107-puma-s1-desert-duel-low-t70-t3100-dx18-tk32-m271-r14.webp',
    capKey: 'media.loading.title.s107PumaS1DesertDuelLowT70T3100Dx18Tk32M271R14',
    maps: ['desert'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s276-strv105-fjord-reel-m271-r14.webp',
    capKey: 'media.loading.title.s276Strv105FjordReelM271R14',
    maps: ['fjord'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s118-type10b-skybridge-reel-m271-r14.webp',
    capKey: 'media.loading.title.s118Type10bSkybridgeReelM271R14',
    maps: ['skybridge'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s100-merkava2b-badlands-reel-fb-m271-r14.webp',
    capKey: 'media.loading.title.s100Merkava2bBadlandsReelFbM271R14',
    maps: ['badlands'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s154-t90sm-steppe-reel-fb-m271-r14.webp',
    capKey: 'media.loading.title.s154T90smSteppeReelFbM271R14',
    maps: ['steppe'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s72-amx10p-orchard-reel-m271-r14.webp',
    capKey: 'media.loading.title.s72Amx10pOrchardReelM271R14',
    maps: ['orchard'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s84-leo1a5-polders-reel-m271-r14.webp',
    capKey: 'media.loading.title.s84Leo1a5PoldersReelM271R14',
    maps: ['polders'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s173-challenger1-saltwind-duel-drone-tm95-f33-m271-r13.webp',
    capKey: 'media.loading.title.s173Challenger1SaltwindDuelDroneTm95F33M271R13',
    maps: ['saltwind'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/vs11-desert-osorio-t90m-drone-tm40-m271-r13.webp',
    capKey: 'media.loading.title.vs11DesertOsorioT90mDroneTm40M271R13',
    maps: ['desert'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/vs15-oasis-magach6b-t72b3-drone-tm20-new-herohigh-m271-r13.webp',
    capKey: 'media.loading.title.vs15OasisMagach6bT72b3DroneTm20NewHerohighM271R13',
    maps: ['oasis'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/vs24-railyard-magach7c-t72b3-drone-tm20-m271-r13.webp',
    capKey: 'media.loading.title.vs24RailyardMagach7cT72b3DroneTm20M271R13',
    maps: ['railyard'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s285-pt84-sokol-orchard-duel-drone-tm70-f33-m271-r13.webp',
    capKey: 'media.loading.title.s285Pt84SokolOrchardDuelDroneTm70F33M271R13',
    maps: ['orchard'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s304-magach7c-caldera-duel-drone-tm95-f33-m271-r13.webp',
    capKey: 'media.loading.title.s304Magach7cCalderaDuelDroneTm95F33M271R13',
    maps: ['caldera'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s64-type59-alpine-duel-drone-t70-f33-m271-r13.webp',
    capKey: 'media.loading.title.s64Type59AlpineDuelDroneT70F33M271R13',
    maps: ['alpine'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s173-challenger1-saltwind-duel-drone-t70-f33-m271-r13.webp',
    capKey: 'media.loading.title.s173Challenger1SaltwindDuelDroneT70F33M271R13',
    maps: ['saltwind'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s211-t62mv1-foundry-drone-new-drone-f33-m271-r13.webp',
    capKey: 'media.loading.title.s211T62mv1FoundryDroneNewDroneF33M271R13',
    maps: ['foundry'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/vs26-coastal-cv9035dk-bmp3-ridge-m271-r13.webp',
    capKey: 'media.loading.title.vs26CoastalCv9035dkBmp3RidgeM271R13',
    maps: ['coastal'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s206-m60a1-desert-drone-m271-r13.webp',
    capKey: 'media.loading.title.s206M60a1DesertDroneM271R13',
    maps: ['desert'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s276-strv105-fjord-ridge-m271-r13.webp',
    capKey: 'media.loading.title.s276Strv105FjordRidgeM271R13',
    maps: ['fjord'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s307-m41a3-airfield-drone-m271-r13.webp',
    capKey: 'media.loading.title.s307M41a3AirfieldDroneM271R13',
    maps: ['airfield'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/vs04-railyard-leclerc-t14-drone-m271-r13.webp',
    capKey: 'media.loading.title.vs04RailyardLeclercT14DroneM271R13',
    maps: ['railyard'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/vs14-railyard-tamoyo3-t14-drone-tm40-m271-r13.webp',
    capKey: 'media.loading.title.vs14RailyardTamoyo3T14DroneTm40M271R13',
    maps: ['railyard'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s108-sabra-mk2-x-caldera-duel-drone-t95-f33-m271-r13.webp',
    capKey: 'media.loading.title.s108SabraMk2XCalderaDuelDroneT95F33M271R13',
    maps: ['caldera'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s263-bm-oplot-m-caldera-duel-drone-tm95-f33-m271-r13.webp',
    capKey: 'media.loading.title.s263BmOplotMCalderaDuelDroneTm95F33M271R13',
    maps: ['caldera'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s272-ztz99a2-qinglong-copper-mesa-duel-drone-tm95-f33-m271-r13.webp',
    capKey: 'media.loading.title.s272Ztz99a2QinglongCopperMesaDuelDroneTm95F33M271R13',
    maps: ['copper_mesa'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s154-t90sm-steppe-ridge-fb-m271-r13.webp',
    capKey: 'media.loading.title.s154T90smSteppeRidgeFbM271R13',
    maps: ['steppe'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/vs12-verdant-leo2a5dk-t80u-drone-m271-r13.webp',
    capKey: 'media.loading.title.vs12VerdantLeo2a5dkT80uDroneM271R13',
    maps: ['verdant'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/vs22-verdant-leo1a3dk-t62-drone-new-crane-m271-r13.webp',
    capKey: 'media.loading.title.vs22VerdantLeo1a3dkT62DroneNewCraneM271R13',
    maps: ['verdant'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s211-t62mv1-foundry-duel-drone-t95-m271-r13.webp',
    capKey: 'media.loading.title.s211T62mv1FoundryDuelDroneT95M271R13',
    maps: ['foundry'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s270-t72b3m-xuanwu-delta-duel-drone-tm95-new-crane-f33-m271-r13.webp',
    capKey: 'media.loading.title.s270T72b3mXuanwuDeltaDuelDroneTm95NewCraneF33M271R13',
    maps: ['delta'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s271-vt4a1-baihu-delta-duel-drone-t70-new-herohigh-f33-m271-r13.webp',
    capKey: 'media.loading.title.s271Vt4a1BaihuDeltaDuelDroneT70NewHerohighF33M271R13',
    maps: ['delta'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s276-strv105-fjord-duel-drone-t95-f33-m271-r13.webp',
    capKey: 'media.loading.title.s276Strv105FjordDuelDroneT95F33M271R13',
    maps: ['fjord'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s206-m60a1-desert-ridge-m271-r13.webp',
    capKey: 'media.loading.title.s206M60a1DesertRidgeM271R13',
    maps: ['desert'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s271-vt4a1-baihu-delta-duel-drone-tm95-f33-m271-r13.webp',
    capKey: 'media.loading.title.s271Vt4a1BaihuDeltaDuelDroneTm95F33M271R13',
    maps: ['delta'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s273-centurion5-1-aus-airfield-drone-new-herohigh-f33-m271-r13.webp',
    capKey: 'media.loading.title.s273Centurion51AusAirfieldDroneNewHerohighF33M271R13',
    maps: ['airfield'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s96-marder2-autumn-crane-m271-r13.webp',
    capKey: 'media.loading.title.s96Marder2AutumnCraneM271R13',
    maps: ['autumn'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s134-t72m1-jaguar-longleaf-duel-drone-t70-f33-m271-r13.webp',
    capKey: 'media.loading.title.s134T72m1JaguarLongleafDuelDroneT70F33M271R13',
    maps: ['longleaf'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s256-christian2-reservoir-drone-f33-m271-r13.webp',
    capKey: 'media.loading.title.s256Christian2ReservoirDroneF33M271R13',
    maps: ['reservoir'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s284-pt84-orzel-reservoir-duel-drone-t45-f33-m271-r13.webp',
    capKey: 'media.loading.title.s284Pt84OrzelReservoirDuelDroneT45F33M271R13',
    maps: ['reservoir'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s264-bm-oplot-t-titan-gorge-duel-drone-t95-f33-m271-r13.webp',
    capKey: 'media.loading.title.s264BmOplotTTitanGorgeDuelDroneT95F33M271R13',
    maps: ['titan_gorge'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s154-t90sm-steppe-duel-drone-t70-f33-m271-r13.webp',
    capKey: 'media.loading.title.s154T90smSteppeDuelDroneT70F33M271R13',
    maps: ['steppe'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s298-leo1a5dk-saltwind-duel-drone-t95-f33-m271-r13.webp',
    capKey: 'media.loading.title.s298Leo1a5dkSaltwindDuelDroneT95F33M271R13',
    maps: ['saltwind'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s150-t90a-vladimir-steppe-duel-drone-tm95-f33-m271-r13.webp',
    capKey: 'media.loading.title.s150T90aVladimirSteppeDuelDroneTm95F33M271R13',
    maps: ['steppe'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/vs26-coastal-cv9035dk-bmp3-crane-m271-r13.webp',
    capKey: 'media.loading.title.vs26CoastalCv9035dkBmp3CraneM271R13',
    maps: ['coastal'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s307-m41a3-airfield-ridge-m271-r13.webp',
    capKey: 'media.loading.title.s307M41a3AirfieldRidgeM271R13',
    maps: ['airfield'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s272-ztz99a2-qinglong-copper-mesa-duel-drone-t70-f33-m271-r13.webp',
    capKey: 'media.loading.title.s272Ztz99a2QinglongCopperMesaDuelDroneT70F33M271R13',
    maps: ['copper_mesa'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s203-m47-patton-badlands-drone-new-herohigh-f33-m271-r13.webp',
    capKey: 'media.loading.title.s203M47PattonBadlandsDroneNewHerohighF33M271R13',
    maps: ['badlands'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/vs29-alpine-m41a3-t62-drone-m271-r13.webp',
    capKey: 'media.loading.title.vs29AlpineM41a3T62DroneM271R13',
    maps: ['alpine'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s190-ua-t84-oplot-m-frontier-drone-new-herohigh-f33-m271-r13.webp',
    capKey: 'media.loading.title.s190UaT84OplotMFrontierDroneNewHerohighF33M271R13',
    maps: ['frontier'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s275-olifant-mk2-alpine-drone-m271-r13.webp',
    capKey: 'media.loading.title.s275OlifantMk2AlpineDroneM271R13',
    maps: ['alpine'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s152-t90m-whiteout-duel-drone-tm70-f33-m271-r13.webp',
    capKey: 'media.loading.title.s152T90mWhiteoutDuelDroneTm70F33M271R13',
    maps: ['whiteout'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s300-leo2a5dk-skybridge-duel-drone-t70-f33-m271-r13.webp',
    capKey: 'media.loading.title.s300Leo2a5dkSkybridgeDuelDroneT70F33M271R13',
    maps: ['skybridge'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/vs02-verdant-challenger-t80u-ridge-m271-r13.webp',
    capKey: 'media.loading.title.vs02VerdantChallengerT80uRidgeM271R13',
    maps: ['verdant'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s86-leo2a4-longleaf-duel-drone-tm45-f33-m271-r13.webp',
    capKey: 'media.loading.title.s86Leo2a4LongleafDuelDroneTm45F33M271R13',
    maps: ['longleaf'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s272-ztz99a2-qinglong-copper-mesa-duel-drone-tm45-f33-m271-r13.webp',
    capKey: 'media.loading.title.s272Ztz99a2QinglongCopperMesaDuelDroneTm45F33M271R13',
    maps: ['copper_mesa'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s265-t64b1v-2022-cliffbridge-duel-drone-t45-new-elevhigh-f33-m271-r13.webp',
    capKey: 'media.loading.title.s265T64b1v2022CliffbridgeDuelDroneT45NewElevhighF33M271R13',
    maps: ['cliffbridge'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s86-leo2a4-longleaf-duel-drone-t45-f33-m271-r13.webp',
    capKey: 'media.loading.title.s86Leo2a4LongleafDuelDroneT45F33M271R13',
    maps: ['longleaf'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s257-pt64-tur-ruinspires-duel-drone-t70-f33-m271-r13.webp',
    capKey: 'media.loading.title.s257Pt64TurRuinspiresDuelDroneT70F33M271R13',
    maps: ['ruinspires'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s293-tamoyo3-badlands-duel-drone-t45-f33-m271-r13.webp',
    capKey: 'media.loading.title.s293Tamoyo3BadlandsDuelDroneT45F33M271R13',
    maps: ['badlands'], focal: '50% 50%',
  },
]);

/** The boot splash and transition rotation: the boot pick first, then the loading stills. */
export const TRANSITION_SHOTS: readonly FeaturedShot[] = Object.freeze([
  ...FEATURED_SHOTS.filter((shot) => shot.bootImg),
  ...LOADING_SHOTS,
]);
/** Just the image URLs (boot hero + transition backdrops). */
export const FEATURED_IMAGES = TRANSITION_SHOTS.map((s) => s.img);

let rotation: FeaturedShot[] = [];
let previousImage = '';

function refillRotation(): void {
  rotation = [...TRANSITION_SHOTS];
  for (let i = rotation.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rotation[i], rotation[j]] = [rotation[j], rotation[i]];
  }
  if (rotation.length > 1 && rotation[0].img === previousImage) {
    [rotation[0], rotation[1]] = [rotation[1], rotation[0]];
  }
}

/** Next curated capture, shuffled without immediate repeats. */
export function nextFeaturedShot(): FeaturedShot {
  if (!rotation.length) refillRotation();
  const shot = rotation.shift();
  if (!shot) throw new Error('No transition shots are configured');
  previousImage = shot.img;
  return shot;
}

/** Backward-compatible random-shot name; now uses the non-repeating rotation. */
export function randomFeaturedShot(): FeaturedShot {
  return nextFeaturedShot();
}

/**
 * Current overview for a battlefield. The first match is intentional and
 * stable so a loading screen does not change art when network setup restages
 * the same operation. With a viewport the image tier follows it (mapBackdrop.ts);
 * without one it is the native 4K hero.
 * @param {string} mapId
 */
export function featuredShotForMap(mapId: string, viewport: ViewportSample | null = null): FeaturedShot {
  const key = String(mapId || '').trim().toLowerCase();
  // Reuse the packaged map art; publishing a new capture updates every surface.
  if (isMapId(key)) {
    return {
      img: mapBackdropFor(key, viewport), capKey: 'garage.featuredShot.battlefieldOverview',
      capVars: { name: getLocalizedMapName(key) },
      maps: [key], focal: '50% 50%',
    };
  }
  return nextFeaturedShot();
}
