// Namer roof and shoulder vocabulary measured independently of the Mk.4.
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { namerTurretPart as put } from './namerSourceFrame.ts';

type RoofStation=readonly [z:number,half:number,floor:number,wing:number,roofHalf:number,roof:number,channel:number];
function roofSection([z,half,floor,wing,roofHalf,roof,channel]: RoofStation): SolidSection {
  const inner=Math.min(.307,roofHalf-.025),low=Math.min(floor+.105,wing-.045);
  return {z,ring:[[-half+.09,floor],[half-.09,floor],[half,low],[half,wing],
    [roofHalf+.045,wing+.012],[roofHalf,roof],[inner,roof],[inner,channel],
    [-inner,channel],[-inner,roof],[-roofHalf,roof],[-roofHalf-.045,wing+.012],
    [-half,wing],[-half,low]]};
}

function addTurretBody(P: TankBuilderPort): void {
  const rows: RoofStation[]=[
    [-2.761,.878,2.142,2.391,.646,2.394,2.393],
    [-2.684,.902,2.136,2.397,.674,2.611,2.610],
    [-2.626,.956,2.128,2.407,.685,2.615,2.436],
    [-2.238,1.405,2.102,2.446,.763,2.643,2.464],
    [-1.830,1.425,2.055,2.488,.812,2.673,2.494],
    [-1.633,1.416,2.040,2.510,.749,2.6875,2.508],
    [-1.601,1.415,2.039,2.510,.748,2.688,2.687],
    [-1.073,1.403,2.028,2.480,.748,2.695,2.694],
    [-.572,1.305,2.020,2.424,.652,2.700,2.699],
  ];
  put(P,'turret',sectionSolid(rows.map(roofSection)));
  // Forward cheeks flank the real gun receiving channel instead of carrying
  // a full helmet face across the barrel's local seat.
  for(const side of[-1,1])put(P,'turret',sectionSolid([
    cheekSection(-.574,side,.652,2.700,1.305,2.424,2.020),
    cheekSection(-.300,side,.525,side>0?2.669:2.662,1.291,2.405,2.020),
    cheekSection(-.200,side,.518,side>0?2.644:2.613,1.176,2.334,2.020),
    cheekSection(0,side,.500,side>0?2.527:2.511,.953,2.257,2.144),
    cheekSection(.160,side,.420,2.435,.600,2.355,2.250),
    cheekSection(.240,side,.300,2.402,.335,2.355,2.333),
  ]));
  put(P,'turret',sectionSolid([
    {z:-.574,ring:[[-.169,2.290],[-.100,2.290],[-.100,2.700],[-.169,2.700]]},
    {z:.270,ring:[[-.169,2.167],[-.100,2.167],[-.100,2.414],[-.169,2.414]]},
  ]));
  put(P,'turret',KIT.cylY(.849,.849,.166,32),0,1.969,-1.1717);
}

function cheekSection(z: number, side: number, crown: number, top: number,
  outer: number, shoulder: number, floor: number): SolidSection {
  const inner=side>0?.207:(z>.15?.280:.288);
  const ring: [number,number][]=[[inner,floor],[outer,Math.min(floor+.025,shoulder-.010)],[outer,shoulder],
    [crown,top],[inner,top-.008]];
  return {z,ring:side>0?ring:ring.map(([x,y])=>[-x,y] as [number,number]).reverse()};
}

function countermeasureBlade(side: number): SolidSection[] {
  // A thin folded planform, with a raised outer lip. The central span is
  // only 41 mm thick; the diagonal ends reach out to the source's end tabs.
  const rows=[[-1.830,.904,.913,.913],[-1.688,.747,.862,.888],
    [-1.474,.747,.788,.856],[-1.316,.748,.789,.864],
    [-1.098,.748,.864,.891],[-.953,.906,.915,.915]];
  return rows.map(([z,inner,outer,lip])=>{
    const lowTop=2.812+(inner-.747)*.268;
    const ring: [number,number][]=[[inner,2.491],[outer,2.491],[outer,lowTop-.005],
      [lip,2.845],[lip+.001,2.854],[inner,lowTop]];
    return {z,ring:side>0?ring:ring.map(([x,y])=>[-x,y] as [number,number]).reverse()};
  });
}

function addCountermeasureBlades(P: TankBuilderPort): void {
  for(const side of[-1,1]){
    put(P,'turretDetail',KIT.cylY(.174,.174,.037,20),side*1.157,2.4965,-1.372);
    put(P,'turretDetail',KIT.box(.053,.210,.048),side*1.137,2.6135,-1.361);
    put(P,'turretDetail',KIT.box(.101,.210,.168),side*1.156,2.654,-1.360);
    put(P,'turretDetail',sectionSolid(countermeasureBlade(side)));
    for(const z of[-1.532,-1.210])put(P,'turretDetail',sectionSolid([
      {z:z-.012,ring:side>0?[[.630,2.680],[.749,2.680],[.749,2.806],[.630,2.693]]:
        [[-.749,2.680],[-.630,2.680],[-.630,2.693],[-.749,2.806]]},
      {z:z+.012,ring:side>0?[[.630,2.680],[.749,2.680],[.749,2.806],[.630,2.693]]:
        [[-.749,2.680],[-.630,2.680],[-.630,2.693],[-.749,2.806]]},
    ]));
  }
}

function addRadarFaces(P: TankBuilderPort): void {
  for(const side of[-1,1]){
    put(P,'turretDetail',KIT.box(.443,.182,.029),side*1.080,2.243,-.135,.283,side*.861);
    put(P,'turretDetail',KIT.box(.455,.187,.029),side*1.067,2.291,-2.494,-.190,side*2.328);
  }
}

function addRoofOptics(P: TankBuilderPort): void {
  // The port sight has a rolled crown in side profile, not a tall cuboid.
  put(P,'turretDetail',sectionSolid([
    {z:-.846,ring:[[-.930,2.582],[-.682,2.582],[-.682,2.830],[-.930,2.830]]},
    {z:-.787,ring:[[-.930,2.582],[-.682,2.582],[-.682,2.874],[-.930,2.874]]},
    {z:-.706,ring:[[-.930,2.583],[-.682,2.583],[-.682,2.883],[-.930,2.883]]},
    {z:-.625,ring:[[-.930,2.584],[-.682,2.584],[-.682,2.874],[-.930,2.874]]},
    {z:-.566,ring:[[-.930,2.586],[-.682,2.586],[-.682,2.808],[-.930,2.808]]},
  ]));
  put(P,'turretDark',KIT.box(.071,.167,.010),-.728,2.711,-.560);
  put(P,'turretGlass',KIT.box(.052,.125,.005),-.728,2.716,-.553);
  put(P,'turretDetail',KIT.box(.427,.110,.427),-.772,2.527,-.719);
  addStarboardOptic(P);
}

function addStarboardOptic(P: TankBuilderPort): void {
  put(P,'turretDetail',KIT.box(.471,.316,.205),.769,2.542,-.332);
  put(P,'turretDetail',KIT.box(.120,.347,.342),.763,2.527,-.0545);
  put(P,'turretDetail',KIT.box(.083,.347,.209),.963,2.527,-.121);
  put(P,'turretDetail',KIT.box(.169,.266,.349),.616,2.544,-.096);
  put(P,'turretDark',KIT.box(.130,.203,.013),.616,2.545,.086);
  put(P,'turretGlass',KIT.box(.108,.168,.005),.616,2.545,.095);
  put(P,'turretDark',KIT.box(.086,.241,.013),.873,2.517,-.011);
  put(P,'turretGlass',KIT.box(.059,.190,.005),.873,2.522,-.002);
}

export function addNamerSourceTurret(P: TankBuilderPort): void {
  addTurretBody(P);
  addCountermeasureBlades(P);
  addRadarFaces(P);
  addRoofOptics(P);
  P.turretG.userData.trophySuiteReceipt=Object.freeze({configuration:'namer',radarFaces:4,launchers:2,owner:'rig_turret'});
}
