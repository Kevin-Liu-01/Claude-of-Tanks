// Explicit owner-authored designs. This is not a fallback for failed sources.
import {resolveTankId} from '../src/vehicles/tankIdAliases.ts';
const CONCEPT_DOCUMENTS = Object.freeze({
  m6_linebacker:'docs/references/concepts/m6-linebacker-20261003.json',
  t72b3_zubr_ii:'docs/references/concepts/national-legacy-pair-20261001.json',
  t72b3m_hetman_ii:'docs/references/concepts/national-legacy-pair-20261001.json',
  t80u_zoria:'docs/references/concepts/national-modernization-20261001.json',
  t72b3m_hetman:'docs/references/concepts/national-modernization-20261001.json',
  t72b3_sich:'docs/references/concepts/national-modernization-20261001.json',
  t80u_husarz:'docs/references/concepts/national-modernization-20261001.json',
  t72b3m_wilk:'docs/references/concepts/national-modernization-20261001.json',
  t72b3_zubr:'docs/references/concepts/national-modernization-20261001.json',
  t80u_yun:'docs/references/concepts/national-modernization-20261001.json',
  t72b3m_kunlun:'docs/references/concepts/national-modernization-20261001.json',
  t72b3_qilin:'docs/references/concepts/national-modernization-20261001.json',
  t80u_bars_m:'docs/references/concepts/national-modernization-20261001.json',
  t72b3m_bulat_m:'docs/references/concepts/national-modernization-20261001.json',
  t72b3_bastion_m:'docs/references/concepts/national-modernization-20261001.json',

  type96_72_long:'docs/references/concepts/fleet-renewal-20260930.json',
  type96_80_feng:'docs/references/concepts/fleet-renewal-20260930.json',
  type96_72m_lei:'docs/references/concepts/fleet-renewal-20260930.json',
  t72_rys:'docs/references/concepts/fleet-renewal-20260930.json',

  object148_proto:'docs/references/concepts/object148-20260930.json',
  carro45t:'docs/references/concepts/carro45t-roof-20260929.json',
  spz_wotan:'docs/references/concepts/ifv-upgrades-20260925.json',
  cv90:'docs/references/concepts/ifv-upgrades-20260925.json',
  cv90_mk4_concept:'docs/references/concepts/ifv-upgrades-20260925.json',
  raiju_ifv:'docs/references/concepts/ifv-upgrades-20260925.json',

  xk2_black_panther:'docs/references/concepts/xk2-k1a1-20260921.json',
  griffin_viper:'docs/references/concepts/griffin-viper-20260921.json',
  c2_ariete:'docs/references/concepts/ariete-c2-20260921.json',
  tos1a_tagil:'docs/references/concepts/tos1a-tagil-20260920.json',
  ztz100_prototype:'docs/references/concepts/missile-turrets-20260919.json',
  object695:'docs/references/concepts/missile-turrets-20260919.json',
  type100:'docs/references/concepts/type100-ifv-20260919.json',
});
export const FIRST_PARTY_CONCEPTS = Object.freeze({
  m6_linebacker: Object.freeze({"id":"m6_linebacker","test":"src/vehicles/profiles/m6Linebacker.selftest.mjs","ring":[0.04,1.895,-0.36],"gunLocal":[0,0.432,0.81],"barrelLengthM":2.124,"barrelRadiusM":0.0351,"pitchDeg":[-9,45],"mainCaliberMm":25,"roofMachineGuns":1,"cells":4,"guidedAmmoTotal":12,"hullLengthM":6.71,"hullWidthM":4.12,"widthM":4.178,"overallLengthM":6.59,"tallestM":3.5645,"specDimensions":{"hullLengthM":6.71,"overallLengthM":6.71,"widthM":4.12,"heightM":3.5645},"silhouette":"Original upgraded M6 on the native Bradley chassis. Broad 2.412 m welded turret (90% of the previous complete assembly), full sloping cheek masses around a true elevation bay, layered flank cassettes, large shoulder cabinets, shielded hatch, panoramic and gunner optics, paired lamps, peripheral cameras, M2 remote station, filled full-width bustle rack and shoulder cages. Compact left quad Stinger pod is 30 percent smaller in each dimension and sits on a close-fitting articulating cradle. Clipped layered hull skirts and rear slat cages. Historical M6 establishes the weapon layout only."}),
  t72b3_zubr_ii: Object.freeze({"id":"t72b3_zubr_ii","ring":[0,1.4601839739799998,0.065591405],"gunLocal":[0.0014239406586,0.2925099909400002,1.2198708767647],"barrelLengthM":5.2533308821319995,"barrelRadiusM":0.1,"pitchDeg":[-6,14],"mainCaliberMm":125,"roofMachineGuns":1,"hullLengthM":6.94035,"hullWidthM":4.790943,"widthM":4.734,"overallLengthM":9.8991,"tallestM":3.1077,"specDimensions":{"hullLengthM":6.94035,"overallLengthM":10.008968163896698,"widthM":4.790943,"heightM":3.1077},"test":"src/vehicles/nationalModernization.selftest.mjs","weaponSystem":"conventional-cannon","silhouette":"Polish T-72B3 heavy modernization carrying the T-72B3M (2016) turret: raked cheek boxes faced by a stepped terrace of two-layer ERAWA-2 cassettes funnelling into the mantlet, a four-tile roof grid, long squared armour cabinets behind three stepped courses of the same cassettes, square lamps on the cabinet fronts, a long open slatted bustle basket with strapped packs and a roll, guarded rear lights, an independent guarded sight, a monocle sensor and split-panel roof sensor, the 12.7 mm WKM-B closed armoured casemate emplacement with its sensor head and boresighted searchlight, and its own field suit. The native T-72B3 hull carries three stepped glacis terraces of cassettes between two LED cluster housings, framed lower-plate fields and deep four-course ERAWA skirts with a fitted front grid."}),
  t72b3m_hetman_ii: Object.freeze({"id":"t72b3m_hetman_ii","ring":[7.2471277e-06,1.52948397398,0.1143146502203],"gunLocal":[0.0014239406586,0.2925099909400002,1.2198708767647],"barrelLengthM":5.2533308821319995,"barrelRadiusM":0.1,"pitchDeg":[-6,14],"mainCaliberMm":125,"roofMachineGuns":1,"hullLengthM":7.509,"hullWidthM":4.972951,"widthM":4.926,"overallLengthM":10.2615,"tallestM":3.402,"specDimensions":{"hullLengthM":7.509,"overallLengthM":10.342016409117,"widthM":4.972951,"heightM":3.402},"test":"src/vehicles/nationalModernization.selftest.mjs","weaponSystem":"conventional-cannon","silhouette":"Ukrainian T-72B3M command modernization carrying the T-72B3M (2016) turret with its own frontal package instead of Relikt: a stepped prow of three raked courses of discrete ERA blocks on two facets a side, stepping back as they rise on welded ledges between divider plates and a cheek frame post, with stacked jaw collars round the mantlet, shoulder returns and low roof brows on seat rails; squared flank armour cabinets with two wall courses and a lid course of ERA, an open command basket behind the bustle with slat walls, a rear cable drum and stowage, wider cage wings on the cabinet lids, slit lamps, twin sensor heads, a scanner, two panoramas, red infrared dazzler pods, the 30 mm wedge station on the commander's cupola and its own field net. The native T-72B3M hull carries a framed chevron glacis of three sawtooth bands a side on retainer ribs, a nose sill with two recessed LED bars, hinged lower-plate aprons, two-layer bow modules, heavy fitted skirts, joint caps and camouflage carriers."}),
  t80u_zoria: Object.freeze({"id":"t80u_zoria","ring":[0.008,1.49,0.07187],"gunLocal":[0,0.43,0.9],"barrelLengthM":5.2,"barrelRadiusM":0.105,"pitchDeg":[-6,14],"mainCaliberMm":125,"roofMachineGuns":1,"hullLengthM":6.72,"hullWidthM":4.331,"widthM":4.331,"overallLengthM":9.5328,"tallestM":3.095,"specDimensions":{"hullLengthM":6.72,"overallLengthM":9.531870000000001,"widthM":4.331,"heightM":3.095},"test":"src/vehicles/nationalModernization.selftest.mjs","weaponSystem":"conventional-cannon","silhouette":"Ukrainian T-80U assault modernization: the native low turbine hull and curved fenders carry a compact rounded turret, connected split-chevron cheek and flank housings, a short joined rear return, mounted ERA, assault utility cases, guarded lamps and thick chamfered skirt assemblies joined to the native fenders by fitted shoulder panels. Distinct mounted roof weapon, paired guarded mantlet lamps, dedicated observation optics and roof sensor installation."}),
  t72b3m_hetman: Object.freeze({"id":"t72b3m_hetman","ring":[7.2471277e-06,1.52948397398,0.1143146502203],"gunLocal":[0.0014239406586,0.2925099909400002,1.2198708767647],"barrelLengthM":5.2533308821319995,"barrelRadiusM":0.1,"pitchDeg":[-6,14],"mainCaliberMm":125,"roofMachineGuns":1,"hullLengthM":7.31,"hullWidthM":4.870712,"widthM":4.826,"overallLengthM":10.0625,"tallestM":3.382,"specDimensions":{"hullLengthM":7.31,"overallLengthM":10.242516409116998,"widthM":4.870712,"heightM":3.382},"test":"src/vehicles/nationalModernization.selftest.mjs","weaponSystem":"conventional-cannon","silhouette":"Ukrainian T-72B3M modernization carrying the complete T-72B3M (2016) turret: its Relikt cheek fan, roof cassettes and bustle boxes, seven Nizh-style module housings clamped on the flank boxes, a slat screen round the rear boxes, two anti-drone roof cage wings, square lamps on raised posts, the monocle sensor, a radome, a command panorama, rear cases, short field whips, the 30 mm shielded command cannon on the commander's cupola and a leafy field net. The native T-72B3M hull keeps its seven thick Ukrainian skirt modules, open hull screens and glacis cassettes."}),
  t72b3_sich: Object.freeze({"id":"t72b3_sich","ring":[2.374e-07,1.457100315,0.065591405],"gunLocal":[0.0060500476,0.30164998600000015,1.030958583],"barrelLengthM":4.702199816,"barrelRadiusM":0.1,"pitchDeg":[-6,14],"mainCaliberMm":125,"roofMachineGuns":1,"hullLengthM":6.8784,"hullWidthM":4.852844,"widthM":4.806,"overallLengthM":9.1591,"tallestM":3.305,"specDimensions":{"hullLengthM":6.8784,"overallLengthM":9.237949804,"widthM":4.852844,"heightM":3.305},"test":"src/vehicles/nationalModernization.selftest.mjs","weaponSystem":"conventional-cannon","silhouette":"Ukrainian T-72B3 field modernization carrying the complete T-72B3 turret: its Kontakt-5 cheeks and roof cassettes, Kontakt-style brick panels on both side stowage cases and a left flank housing, a slat screen round the rear, anti-drone roof cage wings, slit lamps, the flat sensor head and spine sensor, shovel, pry bar, can and tarpaulin roll, short field whips, the 30 mm open fork cannon on the commander's cupola ring and a leafy field net. The original low T-72B3 hull keeps its six removable skirt segments, long side rails and glacis cassettes."}),
  t80u_husarz: Object.freeze({"id":"t80u_husarz","ring":[0.008,1.49,0.07187],"gunLocal":[0,0.43,0.9],"barrelLengthM":5.2,"barrelRadiusM":0.105,"pitchDeg":[-6,14],"mainCaliberMm":125,"roofMachineGuns":1,"hullLengthM":6.82,"hullWidthM":4.303,"widthM":4.303,"overallLengthM":9.5628,"tallestM":3.165,"specDimensions":{"hullLengthM":6.82,"overallLengthM":9.58187,"widthM":4.303,"heightM":3.165},"test":"src/vehicles/nationalModernization.selftest.mjs","weaponSystem":"conventional-cannon","silhouette":"Polish T-80U modernization concept retaining its native low hull and rounded turret ancestry, with a connected ERAWA cheek-and-pannier armor frame, a broad rear basket carrying field stores and a strapped canvas roll, guarded sensors, pannier tool racks, turbine service fittings and thick wraparound skirts joined to the native fenders by continuous fitted shoulders. Distinct mounted roof weapon, paired guarded mantlet lamps, dedicated observation optics and roof sensor installation."}),
  t72b3m_wilk: Object.freeze({"id":"t72b3m_wilk","ring":[0.008,1.46,0.114315],"gunLocal":[0,0.43,0.9],"barrelLengthM":5.2,"barrelRadiusM":0.105,"pitchDeg":[-6,14],"mainCaliberMm":125,"roofMachineGuns":1,"hullLengthM":7.31,"hullWidthM":4.463,"widthM":4.463,"overallLengthM":9.6902,"tallestM":3.305,"specDimensions":{"hullLengthM":7.31,"overallLengthM":9.869315,"widthM":4.463,"heightM":3.305},"test":"src/vehicles/nationalModernization.selftest.mjs","weaponSystem":"conventional-cannon","silhouette":"Polish T-72B3M heavy modernization concept retaining the native glacis and compact cast turret, with a deep connected cheek-and-bustle armor assembly, three-course ERAWA protection, armored communications cabinets and spare-track stores, guarded sensors and heavy layered skirts with continuous fitted shoulders and front and rear returns. Distinct mounted roof weapon, paired guarded mantlet lamps, dedicated observation optics and roof sensor installation."}),
  t72b3_zubr: Object.freeze({"id":"t72b3_zubr","ring":[0,1.4601839739799998,0.065591405],"gunLocal":[0.0014239406586,0.2925099909400002,1.2198708767647],"barrelLengthM":5.2533308821319995,"barrelRadiusM":0.1,"pitchDeg":[-6,14],"mainCaliberMm":125,"roofMachineGuns":1,"hullLengthM":6.95035,"hullWidthM":4.690134,"widthM":4.634,"overallLengthM":9.8991,"tallestM":3.0777,"specDimensions":{"hullLengthM":6.95035,"overallLengthM":10.013968163896699,"widthM":4.690134,"heightM":3.0777},"test":"src/vehicles/nationalModernization.selftest.mjs","weaponSystem":"conventional-cannon","silhouette":"Polish T-72B3 field modernization carrying the T-72B3M (2016) turret and its bustle boxes: welded cheek boxes faced by a grid of ERAWA-2 cassettes in a welded frame of bars and mullions, a two-tile roof row, slat screens outside the bustle boxes, a short slatted rear rack with the camouflage roll, tools and pack, round lamps, laser-warning heads, a flat sensor head and radome, the 12.7 mm WKM-B field emplacement open behind a bolted square light shield on the commander's cupola and the Polish field net and leaves. The native T-72B3 hull carries framed glacis cassette fields with armoured lamp pockets, a framed lower front plate and layered ERAWA skirts with a fitted front grid."}),
  t80u_yun: Object.freeze({"id":"t80u_yun","ring":[0.008,1.49,0.07187],"gunLocal":[0,0.43,0.9],"barrelLengthM":5.2,"barrelRadiusM":0.105,"pitchDeg":[-6,14],"mainCaliberMm":125,"roofMachineGuns":1,"hullLengthM":6.72,"hullWidthM":4.34,"widthM":4.34,"overallLengthM":9.5328,"tallestM":3.115,"specDimensions":{"hullLengthM":6.72,"overallLengthM":9.531870000000001,"widthM":4.34,"heightM":3.115},"test":"src/vehicles/nationalModernization.selftest.mjs","weaponSystem":"conventional-cannon","silhouette":"Yun T-80U retrofit concept: original turbine hull and compact casting, swept arrowhead armor housing, linked low electronics and service cases, six thick layered skirt modules with fitted continuous shoulders and chamfered wrap returns. Distinct mounted roof weapon, paired guarded mantlet lamps, dedicated observation optics and roof sensor installation."}),
  t72b3m_kunlun: Object.freeze({"id":"t72b3m_kunlun","ring":[0,1.54948397398,0.1143146502203],"gunLocal":[0,0.2602,1.75],"barrelLengthM":4.92211,"barrelRadiusM":0.071,"pitchDeg":[-6,14],"mainCaliberMm":125,"roofMachineGuns":1,"hullLengthM":7.31,"hullWidthM":4.54,"widthM":4.54,"overallLengthM":10.6151,"tallestM":3.4805,"specDimensions":{"hullLengthM":7.31,"overallLengthM":10.4414246502203,"widthM":4.54,"heightM":3.48048},"test":"src/vehicles/nationalModernization.selftest.mjs","weaponSystem":"conventional-cannon","silhouette":"Chinese T-72B3M modernization carrying the complete Type 96B turret with its special chevron ERA laid over both front wedges, two Shtora-style infrared dazzler heads flanking the mantlet, the 30 mm stabilised drum station on the commander's cupola, square guarded lamps, a scanner head, service cases and an open rear maintenance cage with its three-cell console. The low T-72B3M hull keeps seven thick staggered skirt modules, a glacis ERA course and large transverse auxiliary fuel drums."}),
  t72b3_qilin: Object.freeze({"id":"t72b3_qilin","ring":[0,1.511100315,0.065591405],"gunLocal":[0,0.38,0.78],"barrelLengthM":6.42,"barrelRadiusM":0.088,"pitchDeg":[-6,14],"mainCaliberMm":125,"roofMachineGuns":1,"hullLengthM":6.8784,"hullWidthM":4.363,"widthM":4.363,"overallLengthM":10.8464,"tallestM":3.3286,"specDimensions":{"hullLengthM":6.8784,"overallLengthM":10.704791405,"widthM":4.363,"heightM":3.3286},"test":"src/vehicles/nationalModernization.selftest.mjs","weaponSystem":"conventional-cannon","silhouette":"Chinese T-72B3 field modernization carrying the complete production ZTZ-99A2 turret: its integrated chevron front with ERA face panels, deep side armour cassettes, smoke banks, commander's cupola and sights, under the Qilin's compact 12.7 mm remote station on that cupola, with round guarded lamps, a side camera, a low field-service box, tool chest and roll and a small open rear basket. The original low T-72B3 hull keeps five ribbed layered skirt modules, a glacis ERA course and two individually cradled rear fuel drums."}),
  t80u_bars_m: Object.freeze({"id":"t80u_bars_m","ring":[0.008,1.49,0.07187],"gunLocal":[0,0.43,0.9],"barrelLengthM":5.2,"barrelRadiusM":0.105,"pitchDeg":[-6,14],"mainCaliberMm":125,"roofMachineGuns":1,"hullLengthM":6.84,"hullWidthM":4.47,"widthM":4.47,"overallLengthM":9.5328,"tallestM":3.175,"specDimensions":{"hullLengthM":6.84,"overallLengthM":9.59187,"widthM":4.47,"heightM":3.175},"test":"src/vehicles/nationalModernization.selftest.mjs","weaponSystem":"conventional-cannon","silhouette":"Bars-M: T-80U turbine hull and compact cast turret with a connected heavy cheek/flank/rear armor housing beneath two-course ERA, round protection sensors, broad rear cage and deep chamfered side skirts wrapping around both track ends. Distinct mounted roof weapon, paired guarded mantlet lamps, dedicated observation optics and roof sensor installation."}),
  t72b3m_bulat_m: Object.freeze({"id":"t72b3m_bulat_m","ring":[0.008,1.46,0.114315],"gunLocal":[0,0.43,0.9],"barrelLengthM":5.2,"barrelRadiusM":0.105,"pitchDeg":[-6,14],"mainCaliberMm":125,"roofMachineGuns":1,"hullLengthM":7.31,"hullWidthM":4.61,"widthM":4.61,"overallLengthM":9.6902,"tallestM":3.325,"specDimensions":{"hullLengthM":7.31,"overallLengthM":9.869315,"widthM":4.61,"heightM":3.325},"test":"src/vehicles/nationalModernization.selftest.mjs","weaponSystem":"conventional-cannon","silhouette":"Bulat-M: T-72B3M low hull and cast-core turret with a deep continuous armored cheek-and-command-bustle enclosure, layered ERA, thick wraparound side armor with soft lower packets and protected panoramic sensors. Distinct mounted roof weapon, paired guarded mantlet lamps, dedicated observation optics and roof sensor installation."}),
  t72b3_bastion_m: Object.freeze({"id":"t72b3_bastion_m","ring":[0.008,1.39,0.065591],"gunLocal":[0,0.43,0.9],"barrelLengthM":5.2,"barrelRadiusM":0.105,"pitchDeg":[-6,14],"mainCaliberMm":125,"roofMachineGuns":1,"hullLengthM":6.92035,"hullWidthM":4.45,"widthM":4.45,"overallLengthM":9.5268,"tallestM":2.995,"specDimensions":{"hullLengthM":6.92035,"overallLengthM":9.625766,"widthM":4.45,"heightM":2.995},"test":"src/vehicles/nationalModernization.selftest.mjs","weaponSystem":"conventional-cannon","silhouette":"Bastion-M: compact T-72B3 hull and rounded turret with a compact connected cheek-and-pannier armor frame, broad cheek banks, fine side cassettes, thick returned skirt modules, a short open basket and rectangular sight guards. Distinct mounted roof weapon, paired guarded mantlet lamps, dedicated observation optics and roof sensor installation."}),

  type96_72_long: Object.freeze({"id":"type96_72_long","ring":[0,1.475,0.065591],"gunLocal":[0,0.2602,1.75],"barrelLengthM":4.92211,"barrelRadiusM":0.071,"pitchDeg":[-7,14],"mainCaliberMm":125,"roofMachineGuns":0,"hullLengthM":6.356300116,"widthM":3.7653725147247314,"overallLengthM":10.60975112763977,"tallestM":5.143904304504394,"specDimensions":{"hullLengthM":6.356300116,"overallLengthM":9.915851058,"widthM":3.765600068,"heightM":2.891},"test":"src/vehicles/fleetRenewal.selftest.mjs","weaponSystem":"conventional-cannon","hullWidthM":3.765600068,"silhouette":"T-72B3 chassis and complete Type 96B welded turret; radial cheek ERA, compact attached rear cage and field pack"}),
  type96_80_feng: Object.freeze({"id":"type96_80_feng","ring":[0,1.565,0.07187],"gunLocal":[0,0.2602,1.75],"barrelLengthM":4.92211,"barrelRadiusM":0.071,"pitchDeg":[-7,14],"mainCaliberMm":125,"roofMachineGuns":0,"hullLengthM":6.720291335,"widthM":3.5999999046325684,"overallLengthM":10.26855483734131,"tallestM":5.233904304504394,"specDimensions":{"hullLengthM":6.720291335,"overallLengthM":10.1041256675,"widthM":3.6,"heightM":2.981},"test":"src/vehicles/fleetRenewal.selftest.mjs","weaponSystem":"conventional-cannon","hullWidthM":3.6,"silhouette":"T-80U turbine chassis and complete Type 96B turret; clipped bolted shoulders, supported panoramic sensor and rear observation cage"}),
  type96_72m_lei: Object.freeze({"id":"type96_72m_lei","ring":[0,1.545,0.114315],"gunLocal":[0,0.2602,1.75],"barrelLengthM":4.92211,"barrelRadiusM":0.071,"pitchDeg":[-7,14],"mainCaliberMm":125,"roofMachineGuns":0,"hullLengthM":6.68398928642,"widthM":3.951275110244751,"overallLengthM":10.460425105514526,"tallestM":5.2139043045043945,"specDimensions":{"hullLengthM":6.68398928642,"overallLengthM":10.12841964321,"widthM":3.95101606846,"heightM":2.961},"test":"src/vehicles/fleetRenewal.selftest.mjs","weaponSystem":"conventional-cannon","hullWidthM":3.95101606846,"silhouette":"T-72B3M chassis and Type 96B turret; extended command bustle, paired warning receivers, cheek ERA and supported thermal head"}),
  t72_rys: Object.freeze({"id":"t72_rys","ring":[0,1.55158,0.0718698169],"gunLocal":[0,0.20484740709999993,1.3480699999999999],"barrelLengthM":4.5828147161,"barrelRadiusM":0.068,"pitchDeg":[-5,14],"mainCaliberMm":125,"roofMachineGuns":1,"hullLengthM":6.720291335,"widthM":3.5999999046325684,"overallLengthM":9.528229266973241,"tallestM":2.649079966621399,"specDimensions":{"hullLengthM":6.720291335,"overallLengthM":9.534282731,"widthM":3.6,"heightM":2.172451481},"test":"src/vehicles/fleetRenewal.selftest.mjs","weaponSystem":"conventional-cannon","hullWidthM":3.6,"silhouette":"Polish game concept on the complete T-80U chassis and casting, with seated cheek ERA, command optics, open rear cage and field equipment"}),

  object148_proto: Object.freeze({"id":"object148_proto","test":"src/vehicles/profiles/t14RoofFidelity.selftest.mjs","ring":[0,1.685,-0.6],"gunLocal":[0,0.345,0.6],"barrelLengthM":5.64,"barrelRadiusM":0.07,"pitchDeg":[-8,20],"mainCaliberMm":125,"weaponSystem":"conventional-cannon","roofMachineGuns":1,"hullLengthM":8.7,"hullWidthM":3.9,"widthM":3.898,"overallLengthM":10.0136,"tallestM":3.49712,"specDimensions":{"hullLengthM":8.7,"widthM":3.9,"overallLengthM":9.98},"silhouette":"Object 148 complete development-vehicle rebuild: long three-seat crew capsule, stepped engine deck, replaceable side cassettes, open rear cages, separate unmanned cheek modules with deep sight apertures, open main-gun channel, chamfered service bustle and independently articulated 30 mm roof cannon"}),
  carro45t: Object.freeze({"id":"carro45t","test":"src/vehicles/profiles/carro45tRoof.selftest.mjs","ring":[0,1.5,-0.3],"gunLocal":[0,0.4,1.3],"barrelLengthM":6.13,"barrelRadiusM":0.1,"pitchDeg":[-8,18],"mainCaliberMm":105,"weaponSystem":"conventional-cannon","roofMachineGuns":1,"hullLengthM":6.98,"hullWidthM":3.43,"widthM":3.43,"overallLengthM":10.6,"tallestM":4.05,"silhouette":"Retained Carro 45t hull and running gear with a continuous asymmetric turret crown, integral bustle and two tapered cheeks flanking an open elevating mantlet bay"}),
  // 2026-10-16 (226 gate): roofMachineGuns 2 -> 0. The owner's markup (2026-10-14, surface 5) and VH.14 (76ef67d65,
  // roofWeaponPolicy.ts): the Puma S1 carries its 30 mm, a coaxial MG4 and MELLS and no roof weapon station (the
  // commander's sight is the PERI RTWL head), so the compact RWS and the K2b-style station are gone.
  spz_wotan: Object.freeze({"id":"spz_wotan","test":"src/vehicles/profiles/pumaS1.selftest.mjs","ring":[0.28800000000000003,1.7369999999999999,-0.9900000000000001],"gunLocal":[-0.12600000000000003,0.378,1.197],"barrelLengthM":2.025,"barrelRadiusM":0.0405,"pitchDeg":[-10,45],"mainCaliberMm":30,"roofMachineGuns":0,"hullLengthM":6.924962759017944,"hullWidthM":3.7151997089385986,"widthM":3.7151997089385986,"overallLengthM":6.924962759017944,"tallestM":3.3561144955158233,"silhouette":"High German troop cell with chamfered side cassettes and an asymmetric low remote turret; original game equipment retained","specDimensions":{"hullLengthM":6.84,"widthM":3.51,"overallLengthM":6.84},"cells":2}),
  cv90: Object.freeze({"id":"cv90","test":"src/vehicles/profiles/cv90.selftest.mjs","ring":[0,1.521,-0.432],"gunLocal":[0,0.35100000000000003,1.035],"barrelLengthM":2.8080000000000003,"barrelRadiusM":0.057600000000000005,"pitchDeg":[-8,37],"mainCaliberMm":40,"roofMachineGuns":1,"hullLengthM":7.0042679295852786,"hullWidthM":3.4739999771118164,"widthM":3.4739999771118164,"overallLengthM":7.0042679295852786,"tallestM":3.0771144955158234,"silhouette":"Long Swedish troop roof with clipped stern and a compact upright two-man turret; original game equipment retained","specDimensions":{"hullLengthM":5.904,"widthM":3.258,"overallLengthM":6.57},"weaponSystem":"conventional-cannon"}),
  cv90_mk4_concept: Object.freeze({"id":"cv90_mk4_concept","test":"src/vehicles/profiles/cv90.selftest.mjs","ring":[0,1.62,-0.396],"gunLocal":[0,0.405,1.2060000000000002],"barrelLengthM":3.384,"barrelRadiusM":0.0738,"pitchDeg":[-10,45],"mainCaliberMm":50,"roofMachineGuns":1,"hullLengthM":7.850483981800825,"hullWidthM":3.942000150680542,"widthM":3.942000150680542,"overallLengthM":7.850483981800825,"tallestM":3.365001085281372,"silhouette":"Raised Swedish troop roof and a broad low-shouldered turret with a narrower roof citadel; original game equipment retained","specDimensions":{"hullLengthM":6.282,"widthM":3.636,"overallLengthM":7.596},"cells":2}),
  raiju_ifv: Object.freeze({"id":"raiju_ifv","test":"src/vehicles/profiles/type89LightTiger.selftest.mjs","ring":[0,1.7369999999999999,-0.45],"gunLocal":[0,0.333,1.071],"barrelLengthM":2.358,"barrelRadiusM":0.045000000000000005,"pitchDeg":[-11,45],"mainCaliberMm":35,"roofMachineGuns":2,"hullLengthM":6.567444095572084,"hullWidthM":3.5207998752593994,"widthM":3.5207998752593994,"overallLengthM":6.567444095572084,"tallestM":3.374082130908966,"silhouette":"Japanese-inspired clipped troop cell and blunt front compact remote turret; original Light Tiger game equipment retained","specDimensions":{"hullLengthM":6.12,"widthM":3.33,"overallLengthM":6.705},"cells":4}),

  xk2_black_panther: Object.freeze({
    id:'xk2_black_panther', test:'src/vehicles/profiles/xk2.selftest.mjs',
    ring:[0,1.70,-.30], gunLocal:[.0352,1.81797-1.49566,1.57716-.42564],
    barrelLengthM:5.9052399-1.57716, barrelRadiusM:.105, pitchDeg:[-10,20],
    mainCaliberMm:120, weaponSystem:'conventional-cannon', roofMachineGuns:1,
    hullLengthM:7.5, hullWidthM:3.629, widthM:3.629,
    overallLengthM:5.9091399-.42564-.30+3.769, tallestM:4.07025-1.49566+1.70,
    silhouette:'Existing XK2 six-wheel hull with the complete current K1A1 turret, gun and roof equipment seated on a shallow collar',
  }),
  griffin_viper: Object.freeze({"id":"griffin_viper","test":"src/vehicles/profiles/griffinViper.selftest.mjs","ring":[0,1.863,-0.35640000000000005],"gunLocal":[0,0.9720000000000001,0],"barrelLengthM":1.0692,"barrelRadiusM":0.06300000000000001,"pitchDeg":[-6,25],"cells":16,"mainCaliberMm":140,"weaponSystem":"guided-missile-carrier","guidedAmmoTotal":64,"reloadS":1,"roofMachineGuns":0,"hullLengthM":6.539346,"hullWidthM":3.4295400000000003,"widthM":3.4295400000000003,"overallLengthM":6.539346,"tallestM":3.1104,"silhouette":"Modern Griffin tracked hull, low central armored pedestal, two separated eight-cell open launch pods and central thermal sight"}),
  c2_ariete: Object.freeze({
    id:'c2_ariete', test:'src/vehicles/profiles/arieteC2X.selftest.mjs',
    ring:[0.0, 1.6092726791680003, 0.40413158632000007], gunLocal:[0.0, 0.42537434631999993, 1.2486628184800002],
    barrelLengthM:5.54101740174752, barrelRadiusM:0.17805652480000003, pitchDeg:[-9,20],
    mainCaliberMm:120, weaponSystem:'conventional-cannon', roofMachineGuns:2,
    hullLengthM:8.638053844851202, hullWidthM:4.447520000000001, widthM:4.447520000000001,
    overallLengthM:11.512838728603523, tallestM:4.391563431024001,
    silhouette:'Definitive enlarged C1-derived C2 with extended thick main gun, smaller decorative K2-style roof gun, 20 removable glacis/turret ERA cassettes, wide tracks and modern optics',
  }),
  tos1a_tagil: Object.freeze({
    id:'tos1a_tagil', test:'src/vehicles/profiles/tos1aTagil.selftest.mjs',
    ring:[-.00095,1.5455,.118], gunLocal:[0,1.30,-1.30],
    barrelLengthM:2.60, barrelRadiusM:.11, pitchDeg:[-5,45],
    cells:24, mainCaliberMm:220, weaponSystem:'unguided-rocket-battery',
    // 2026-10-16 (226 gate): roofMachineGuns 1 -> 0. VH.14 (76ef67d65, roofWeaponPolicy.ts): the TOS-1A carries no
    // machine gun (its crew relies on personal arms), so the drawn-only turret pintle is gone.
    ammoTotal:72, magazineSize:24, intraClipS:.25, fullReloadS:48, roofMachineGuns:0,
    hullLengthM:6.36530017853, hullWidthM:3.7802, widthM:3.7802,
    overallLengthM:7.4785, tallestM:3.4555,
    silhouette:'A broad three-by-eight circular-tube battery with a chamfered armored housing and heavy pitching cradle above the retained T-90MS Tagil chassis',
  }),
  ztz100_prototype: Object.freeze({
    id:'ztz100_prototype', test:'src/vehicles/profiles/ztz100Prototype.selftest.mjs',
    ring:[0,1.41,-.55], gunLocal:[0,.64,.80], barrelLengthM:1.45, barrelRadiusM:.045,
    pitchDeg:[-6,20], cells:8, backupCaliberMm:35, roofMachineGuns:0,
    hullLengthM:6.94, hullWidthM:3.70, widthM:3.734, overallLengthM:7.70, tallestM:2.74,
    silhouette:'Broad low armored turret with eight large canisters and a short backup cannon',
  }),
  object695: Object.freeze({"id":"object695","test":"src/vehicles/profiles/object695X.selftest.mjs","ring":[0.0,1.935,-0.9900000000000001],"gunLocal":[0.0,0.792,0.18000000000000002],"barrelLengthM":1.215,"barrelRadiusM":0.036000000000000004,"pitchDeg":[-8,35],"cells":12,"backupCaliberMm":30,"roofMachineGuns":0,"hullLengthM":6.372,"widthM":3.5865,"tallestM":3.51,"silhouette":"Tall narrow pedestal with two separated six-cell pods and a short backup cannon","hullWidthM":3.5865,"overallLengthM":6.507000000000001}),
  type100: Object.freeze({"id":"type100","test":"src/vehicles/profiles/type100.selftest.mjs","ring":[0,1.818,-0.135],"gunLocal":[0,0.47700000000000004,0.5850000000000001],"barrelLengthM":2.115,"barrelRadiusM":0.0405,"pitchDeg":[-10,45],"cells":4,"guidedAmmoTotal":8,"mainCaliberMm":30,"roofMachineGuns":0,"hullLengthM":6.417,"hullWidthM":3.294,"widthM":3.33,"overallLengthM":6.57,"tallestM":3.204,"silhouette":"Broad straight-shouldered Chinese heavy IFV, shallow prow, rear troop compartment and compact chamfered autocannon turret with four low guided cells"}),
});
export function firstPartyConcept(id) {
  return Object.hasOwn(FIRST_PARTY_CONCEPTS,id) ? FIRST_PARTY_CONCEPTS[id] : null;
}
export function conceptDesignPath(id) {
  return Object.hasOwn(CONCEPT_DOCUMENTS,id) ? CONCEPT_DOCUMENTS[id] : null;
}
export function conceptDesignReady(id) {
  const design=firstPartyConcept(id);
  return Boolean(design && ['widthM','overallLengthM','tallestM'].every(key=>
    Number.isFinite(design[key]) && design[key]>0));
}
function exactDesign(actual,expected) {
  return actual && Object.keys(actual).length===Object.keys(expected).length
    && Object.keys(expected).every(key=>JSON.stringify(actual[key])===JSON.stringify(expected[key]));
}
/** Each document must contain exactly its assigned designs, never a transplanted approval. */
export function conceptDocumentPassed(id,record) {
  const document=conceptDesignPath(id);
  if (!document || record?.schemaVersion!==1 || record.dimensionToleranceFraction!==.03
      || record.comparisonPurpose!=='owner-authored-concept' || record.comparisonApplicable!==false
      || record.sourceScore!==null || !record.designs) return false;
  const members=Object.keys(CONCEPT_DOCUMENTS).filter(key=>CONCEPT_DOCUMENTS[key]===document);
  // The owner's documents keep the ids they were written under (docs/references, unstamped = schema 1): read their
  // designs in today's ids (tankIdAliases.ts, SSOT 2.19).
  const resolve=(key)=>resolveTankId(key,record.tankIdSchema);
  const designs=Object.fromEntries(Object.entries(record.designs).map(([key,design])=>
    [resolve(key),typeof design?.id==='string'?{...design,id:resolve(design.id)}:design]));
  return Object.keys(designs).length===members.length
    && members.every(key=>Object.hasOwn(designs,key)&&exactDesign(designs[key],firstPartyConcept(key)));
}
export function validateSelectedIds(ids, knownIds) {
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size!==ids.length
      || ids.some(id=>typeof id!=='string'||!knownIds.includes(id))) {
    throw new Error('Expected unique known playable tank IDs');
  }
  return ids;
}
export function partitionConceptIds(ids) {
  return {concepts:ids.filter(firstPartyConcept), comparisons:ids.filter(id=>!firstPartyConcept(id))};
}
export function assertNoConceptReferences(registry) {
  for (const id of Object.keys(FIRST_PARTY_CONCEPTS)) {
    if (registry[id]?.source==='glb') throw new Error(`${id}: retired comparison cannot qualify the new concept`);
  }
}
export function conceptEquipmentVerdict(id,census) {
  const design=firstPartyConcept(id);
  if (!design) throw new Error(`${id}: no first-party concept equipment authority`);
  const valid=Number.isInteger(census?.mg)&&census.mg>=0&&census.invalidWeaponMarkers===0;
  return {passed:valid&&census.mg===design.roofMachineGuns,
    required:design.roofMachineGuns,observed:census?.mg,authority:conceptDesignPath(id)};
}
function conceptDimensionsPassed(row,design) {
  const min=row?.bounds?.min,max=row?.bounds?.max;
  if(row?.passed!==true || row.fillLoaded!==true || !Array.isArray(min) || !Array.isArray(max)
      || min.length!==3 || max.length!==3 || ![...min,...max].every(Number.isFinite))return false;
  if(min.some((value,axis)=>value>=max[axis]))return false;
  const errors=[Math.abs(max[0]-min[0]-design.widthM)/design.widthM,
    Math.abs(max[2]-min[2]-design.overallLengthM)/design.overallLengthM,
    Math.abs(max[1]-design.tallestM)/design.tallestM];
  return errors.every(error=>error<=.03);
}
export function conceptReceiptPassed(id,report,startedAt,designHash) {
  const design=firstPartyConcept(id);
  return Boolean(design && conceptDesignReady(id) && report?.id===id && report.comparisonPurpose==='owner-authored-concept'
    && report.comparisonApplicable===false && report.score===null && report.passed===true
    && report.designPath===conceptDesignPath(id) && /^[a-f0-9]{64}$/.test(designHash??'')
    && report.designSha256===designHash && Date.parse(report.startedAt)>=startedAt
    && report.test?.path===design.test && report.test.exitCode===0
    && report.inputSha256Before===report.inputSha256After
    && /^[a-f0-9]{64}$/.test(report.inputSha256Before??'')
    && report.dimensions?.length===2 && ['high','low'].every(quality=>
      report.dimensions.some(row=>row.quality===quality&&conceptDimensionsPassed(row,design))));
}
