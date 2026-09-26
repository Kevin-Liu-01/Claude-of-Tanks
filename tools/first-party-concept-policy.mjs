// Explicit owner-authored designs. This is not a fallback for failed sources.
const CONCEPT_DOCUMENTS = Object.freeze({
  spz_puma_s1:'docs/references/concepts/ifv-upgrades-20260925.json',
  cv90:'docs/references/concepts/ifv-upgrades-20260925.json',
  cv90_mkiv:'docs/references/concepts/ifv-upgrades-20260925.json',
  type89_light_tiger:'docs/references/concepts/ifv-upgrades-20260925.json',

  k2:'docs/references/concepts/xk2-k1a1-20260921.json',
  griffin_viper:'docs/references/concepts/griffin-viper-20260921.json',
  ariete_c2_x:'docs/references/concepts/ariete-c2-20260921.json',
  tos1a_tagil:'docs/references/concepts/tos1a-tagil-20260920.json',
  ztz100_prototype:'docs/references/concepts/missile-turrets-20260919.json',
  object695_x:'docs/references/concepts/missile-turrets-20260919.json',
  type100:'docs/references/concepts/type100-ifv-20260919.json',
});
export const FIRST_PARTY_CONCEPTS = Object.freeze({
  spz_puma_s1: Object.freeze({"id":"spz_puma_s1","test":"src/vehicles/profiles/pumaS1.selftest.mjs","ring":[0.28800000000000003,1.7369999999999999,-0.9900000000000001],"gunLocal":[-0.12600000000000003,0.378,1.197],"barrelLengthM":2.025,"barrelRadiusM":0.0405,"pitchDeg":[-10,45],"mainCaliberMm":30,"roofMachineGuns":2,"hullLengthM":6.924962759017944,"hullWidthM":3.7151997089385986,"widthM":3.7151997089385986,"overallLengthM":6.924962759017944,"tallestM":3.3561144955158233,"silhouette":"High German troop cell with chamfered side cassettes and an asymmetric low remote turret; original game equipment retained","specDimensions":{"hullLengthM":6.84,"widthM":3.51,"overallLengthM":6.84},"cells":2}),
  cv90: Object.freeze({"id":"cv90","test":"src/vehicles/profiles/cv90.selftest.mjs","ring":[0,1.521,-0.432],"gunLocal":[0,0.35100000000000003,1.035],"barrelLengthM":2.8080000000000003,"barrelRadiusM":0.057600000000000005,"pitchDeg":[-8,37],"mainCaliberMm":40,"roofMachineGuns":1,"hullLengthM":7.0042679295852786,"hullWidthM":3.4739999771118164,"widthM":3.4739999771118164,"overallLengthM":7.0042679295852786,"tallestM":3.0771144955158234,"silhouette":"Long Swedish troop roof with clipped stern and a compact upright two-man turret; original game equipment retained","specDimensions":{"hullLengthM":5.904,"widthM":3.258,"overallLengthM":6.57},"weaponSystem":"conventional-cannon"}),
  cv90_mkiv: Object.freeze({"id":"cv90_mkiv","test":"src/vehicles/profiles/cv90.selftest.mjs","ring":[0,1.62,-0.396],"gunLocal":[0,0.405,1.2060000000000002],"barrelLengthM":3.384,"barrelRadiusM":0.0738,"pitchDeg":[-10,45],"mainCaliberMm":50,"roofMachineGuns":1,"hullLengthM":7.850483981800825,"hullWidthM":3.942000150680542,"widthM":3.942000150680542,"overallLengthM":7.850483981800825,"tallestM":3.365001085281372,"silhouette":"Raised Swedish troop roof and a broad low-shouldered turret with a narrower roof citadel; original game equipment retained","specDimensions":{"hullLengthM":6.282,"widthM":3.636,"overallLengthM":7.596},"cells":2}),
  type89_light_tiger: Object.freeze({"id":"type89_light_tiger","test":"src/vehicles/profiles/type89LightTiger.selftest.mjs","ring":[0,1.7369999999999999,-0.45],"gunLocal":[0,0.333,1.071],"barrelLengthM":2.358,"barrelRadiusM":0.045000000000000005,"pitchDeg":[-11,45],"mainCaliberMm":35,"roofMachineGuns":2,"hullLengthM":6.567444095572084,"hullWidthM":3.5207998752593994,"widthM":3.5207998752593994,"overallLengthM":6.567444095572084,"tallestM":3.374082130908966,"silhouette":"Japanese-inspired clipped troop cell and blunt front compact remote turret; original Light Tiger game equipment retained","specDimensions":{"hullLengthM":6.12,"widthM":3.33,"overallLengthM":6.705},"cells":4}),

  k2: Object.freeze({
    id:'k2', test:'src/vehicles/profiles/xk2.selftest.mjs',
    ring:[0,1.70,-.30], gunLocal:[.0352,1.81797-1.49566,1.57716-.42564],
    barrelLengthM:5.9052399-1.57716, barrelRadiusM:.105, pitchDeg:[-10,20],
    mainCaliberMm:120, weaponSystem:'conventional-cannon', roofMachineGuns:1,
    hullLengthM:7.5, hullWidthM:3.629, widthM:3.629,
    overallLengthM:5.9091399-.42564-.30+3.769, tallestM:4.07025-1.49566+1.70,
    silhouette:'Existing XK2 six-wheel hull with the complete current K1A1 turret, gun and roof equipment seated on a shallow collar',
  }),
  griffin_viper: Object.freeze({
    id:'griffin_viper', test:'src/vehicles/profiles/griffinViper.selftest.mjs',
    ring:[0,2.07,-.396], gunLocal:[0,1.08,0], barrelLengthM:1.188, barrelRadiusM:.07,
    pitchDeg:[-6,25], cells:16, mainCaliberMm:140, weaponSystem:'guided-missile-carrier',
    guidedAmmoTotal:64, reloadS:1, roofMachineGuns:0,
    hullLengthM:7.26594, hullWidthM:3.8106, widthM:3.8106, overallLengthM:7.26594, tallestM:3.456,
    silhouette:'Modern Griffin tracked hull, low central armored pedestal, two separated eight-cell open launch pods and central thermal sight',
  }),
  ariete_c2_x: Object.freeze({
    id:'ariete_c2_x', test:'src/vehicles/profiles/arieteC2X.selftest.mjs',
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
    ammoTotal:72, magazineSize:24, intraClipS:.25, fullReloadS:48, roofMachineGuns:1,
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
  object695_x: Object.freeze({
    id:'object695_x', test:'src/vehicles/profiles/object695X.selftest.mjs',
    ring:[0,2.15,-1.10], gunLocal:[0,.88,.20], barrelLengthM:1.35, barrelRadiusM:.04,
    pitchDeg:[-8,35], cells:12, backupCaliberMm:30, roofMachineGuns:0,
    hullLengthM:7.08, hullWidthM:3.985, widthM:3.985, overallLengthM:7.23, tallestM:3.90,
    silhouette:'Tall narrow pedestal with two separated six-cell pods and a short backup cannon',
  }),
  type100: Object.freeze({
    id:'type100', test:'src/vehicles/profiles/type100.selftest.mjs',
    ring:[0,2.02,-.15], gunLocal:[0,.53,.65], barrelLengthM:2.35, barrelRadiusM:.045,
    pitchDeg:[-10,45], cells:4, guidedAmmoTotal:8, mainCaliberMm:30, roofMachineGuns:0,
    hullLengthM:7.13, hullWidthM:3.66, widthM:3.70, overallLengthM:7.30, tallestM:3.56,
    silhouette:'Broad straight-shouldered Chinese heavy IFV, shallow prow, rear troop compartment and compact chamfered autocannon turret with four low guided cells',
  }),
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
  return Object.keys(record.designs).length===members.length
    && members.every(key=>Object.hasOwn(record.designs,key)&&exactDesign(record.designs[key],firstPartyConcept(key)));
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
