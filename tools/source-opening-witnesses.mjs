import {BARAK_OPENING_WITNESSES} from './barak-source-openings.mjs';
import {isArieteOpeningTarget,arieteOpeningWitnesses} from './ariete-source-openings.mjs';
// Local qualification only. Independently measured source stock/air probes;
// no source geometry is used by the playable model. Warrior witnesses refer
// to docs/research/warrior-side-ledge-source-study-20260918.md; AFT slot edges
// to docs/research/sabra-fitting-aft-continuity-20260918.md.
const columns=[[-.46435,.18450],[-.14815,.18490],[.15475,.18490],[.47110,.18480]];
const rows=[[-3.55565,.04490],[-3.43750,.04300],[-3.31935,.04490],[-3.20215,.04490]];
export const AFT_SOURCE_SLOTS=Object.freeze(columns.flatMap(([x,width])=>rows.map(([z,length])=>Object.freeze({x,z,width,length}))));

function aftWitnesses(){
 const witnesses=[];
 for(const [i,slot]of AFT_SOURCE_SLOTS.entries()){
  const {x,z,width,length}=slot;
  witnesses.push({key:`slot-${i}-center`,origin:[x,2.04,z],direction:[0,-1,0],far:.080,expect:'air'});
  for(const [edge,dx,dz]of [['left',-width/2,0],['right',width/2,0],['rear',0,-length/2],['front',0,length/2]]){
   const axis=dx?0:2,sign=Math.sign(dx||dz),inside=[x+dx,2.04,z+dz],outside=[...inside];
   inside[axis]-=sign*.001;outside[axis]+=sign*.001;
   witnesses.push({key:`slot-${i}-${edge}-air`,origin:inside,direction:[0,-1,0],far:.080,expect:'air'});
   witnesses.push({key:`slot-${i}-${edge}-web`,origin:outside,direction:[0,-1,0],far:.080,expect:'stock',axis:1,value:1.975,tolerance:.001});
  }
 }
 witnesses.push({key:'bridge-top',origin:[0,2.04,-3.555],direction:[0,-1,0],far:.1,expect:'stock',axis:1,value:1.975,tolerance:.001});
 witnesses.push({key:'bridge-bottom',origin:[0,1.92,-3.555],direction:[0,1,0],far:.1,expect:'stock',axis:1,value:1.9663,tolerance:.001});
 return witnesses;
}

const WARRIOR_SOURCE_WITNESSES=[
  {
    "key": "warrior-00-ledge-stock-probe",
    "origin": [
      -1.68,
      6,
      -2.2
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "stock",
    "axis": 1,
    "value": 1.900499939918518,
    "tolerance": 0.002
  },
  {
    "key": "warrior-01-stand-off-gap-probe",
    "origin": [
      -1.8,
      6,
      -2.2
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "air"
  },
  {
    "key": "warrior-02-ledge-stock-probe",
    "origin": [
      -1.68,
      6,
      -1.55
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "stock",
    "axis": 1,
    "value": 1.900499939918518,
    "tolerance": 0.002
  },
  {
    "key": "warrior-03-stand-off-gap-probe",
    "origin": [
      -1.8,
      6,
      -1.55
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "air"
  },
  {
    "key": "warrior-04-ledge-stock-probe",
    "origin": [
      -1.68,
      6,
      -0.65
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "stock",
    "axis": 1,
    "value": 1.900499939918518,
    "tolerance": 0.002
  },
  {
    "key": "warrior-05-stand-off-gap-probe",
    "origin": [
      -1.8,
      6,
      -0.65
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "air"
  },
  {
    "key": "warrior-06-ledge-stock-probe",
    "origin": [
      -1.68,
      6,
      0.45
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "stock",
    "axis": 1,
    "value": 1.900499939918518,
    "tolerance": 0.002
  },
  {
    "key": "warrior-07-stand-off-gap-probe",
    "origin": [
      -1.8,
      6,
      0.45
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "air"
  },
  {
    "key": "warrior-08-ledge-stock-probe",
    "origin": [
      -1.68,
      6,
      1.23
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "stock",
    "axis": 1,
    "value": 1.900499939918518,
    "tolerance": 0.002
  },
  {
    "key": "warrior-09-stand-off-gap-probe",
    "origin": [
      -1.8,
      6,
      1.23
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "air"
  },
  {
    "key": "warrior-10-ledge-stock-probe",
    "origin": [
      -1.68,
      6,
      1.83
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "air"
  },
  {
    "key": "warrior-11-stand-off-gap-probe",
    "origin": [
      -1.8,
      6,
      1.83
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "air"
  },
  {
    "key": "warrior-12-ledge-stock-probe",
    "origin": [
      1.68,
      6,
      -2.2
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "stock",
    "axis": 1,
    "value": 1.900499939918518,
    "tolerance": 0.002
  },
  {
    "key": "warrior-13-stand-off-gap-probe",
    "origin": [
      1.8,
      6,
      -2.2
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "air"
  },
  {
    "key": "warrior-14-ledge-stock-probe",
    "origin": [
      1.68,
      6,
      -1.55
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "stock",
    "axis": 1,
    "value": 1.900499939918518,
    "tolerance": 0.002
  },
  {
    "key": "warrior-15-stand-off-gap-probe",
    "origin": [
      1.8,
      6,
      -1.55
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "air"
  },
  {
    "key": "warrior-16-ledge-stock-probe",
    "origin": [
      1.68,
      6,
      -0.65
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "stock",
    "axis": 1,
    "value": 1.900499939918518,
    "tolerance": 0.002
  },
  {
    "key": "warrior-17-stand-off-gap-probe",
    "origin": [
      1.8,
      6,
      -0.65
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "air"
  },
  {
    "key": "warrior-18-ledge-stock-probe",
    "origin": [
      1.68,
      6,
      0.45
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "stock",
    "axis": 1,
    "value": 1.900499939918518,
    "tolerance": 0.002
  },
  {
    "key": "warrior-19-stand-off-gap-probe",
    "origin": [
      1.8,
      6,
      0.45
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "air"
  },
  {
    "key": "warrior-20-ledge-stock-probe",
    "origin": [
      1.68,
      6,
      1.23
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "stock",
    "axis": 1,
    "value": 1.8997430329993739,
    "tolerance": 0.002
  },
  {
    "key": "warrior-21-stand-off-gap-probe",
    "origin": [
      1.8,
      6,
      1.23
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "air"
  },
  {
    "key": "warrior-22-ledge-stock-probe",
    "origin": [
      1.68,
      6,
      1.83
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "stock",
    "axis": 1,
    "value": 1.7499048573478886,
    "tolerance": 0.002
  },
  {
    "key": "warrior-23-stand-off-gap-probe",
    "origin": [
      1.8,
      6,
      1.83
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "air"
  },
  {
    "key": "warrior-24-left-top-rail-probe",
    "origin": [
      -1.895,
      6,
      -2.2
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "stock",
    "axis": 1,
    "value": 1.862690305768382,
    "tolerance": 0.002
  },
  {
    "key": "warrior-25-left-top-rail-probe",
    "origin": [
      -1.895,
      6,
      -1.55
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "stock",
    "axis": 1,
    "value": 1.862690305768382,
    "tolerance": 0.002
  },
  {
    "key": "warrior-26-left-top-rail-probe",
    "origin": [
      -1.895,
      6,
      -0.65
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "stock",
    "axis": 1,
    "value": 1.862690305768382,
    "tolerance": 0.002
  },
  {
    "key": "warrior-27-left-top-rail-probe",
    "origin": [
      -1.895,
      6,
      0.45
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "stock",
    "axis": 1,
    "value": 1.862690305768382,
    "tolerance": 0.002
  },
  {
    "key": "warrior-28-left-top-rail-probe",
    "origin": [
      -1.895,
      6,
      1.23
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "stock",
    "axis": 1,
    "value": 1.862690305768382,
    "tolerance": 0.002
  },
  {
    "key": "warrior-29-left-forward-ledge-probe",
    "origin": [
      -1.57,
      6,
      1.7
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "stock",
    "axis": 1,
    "value": 1.53371027602938,
    "tolerance": 0.002
  },
  {
    "key": "warrior-30-left-forward-ledge-probe",
    "origin": [
      -1.57,
      6,
      2.15
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 20,
    "expect": "stock",
    "axis": 1,
    "value": 1.521810021893491,
    "tolerance": 0.002
  },
  {
    "key": "warrior-31-hanging-panel-and-inner-web",
    "origin": [
      -1.8,
      1.3,
      -2.2
    ],
    "direction": [
      1,
      0,
      0
    ],
    "far": 0.3,
    "expect": "stock",
    "axis": 0,
    "value": -1.7060999870300293,
    "tolerance": 0.002
  },
  {
    "key": "warrior-32-hanging-panel-and-inner-web",
    "origin": [
      -1.8,
      1.7,
      -2.2
    ],
    "direction": [
      1,
      0,
      0
    ],
    "far": 0.3,
    "expect": "stock",
    "axis": 0,
    "value": -1.7060999870300293,
    "tolerance": 0.002
  },
  {
    "key": "warrior-33-hanging-panel-and-inner-web",
    "origin": [
      -1.8,
      1.3,
      -0.65
    ],
    "direction": [
      1,
      0,
      0
    ],
    "far": 0.3,
    "expect": "stock",
    "axis": 0,
    "value": -1.7060999870300293,
    "tolerance": 0.002
  },
  {
    "key": "warrior-34-hanging-panel-and-inner-web",
    "origin": [
      -1.8,
      1.7,
      -0.65
    ],
    "direction": [
      1,
      0,
      0
    ],
    "far": 0.3,
    "expect": "stock",
    "axis": 0,
    "value": -1.7060999870300293,
    "tolerance": 0.002
  },
  {
    "key": "warrior-35-hanging-panel-and-inner-web",
    "origin": [
      -1.8,
      1.3,
      0.45
    ],
    "direction": [
      1,
      0,
      0
    ],
    "far": 0.3,
    "expect": "stock",
    "axis": 0,
    "value": -1.7060999870300293,
    "tolerance": 0.002
  },
  {
    "key": "warrior-36-hanging-panel-and-inner-web",
    "origin": [
      -1.8,
      1.7,
      0.45
    ],
    "direction": [
      1,
      0,
      0
    ],
    "far": 0.3,
    "expect": "stock",
    "axis": 0,
    "value": -1.7060999870300293,
    "tolerance": 0.002
  },
  {
    "key": "warrior-37-hanging-panel-and-inner-web",
    "origin": [
      -1.8,
      1.3,
      1.23
    ],
    "direction": [
      1,
      0,
      0
    ],
    "far": 0.3,
    "expect": "stock",
    "axis": 0,
    "value": -1.7060999870300293,
    "tolerance": 0.002
  },
  {
    "key": "warrior-38-hanging-panel-and-inner-web",
    "origin": [
      -1.8,
      1.7,
      1.23
    ],
    "direction": [
      1,
      0,
      0
    ],
    "far": 0.3,
    "expect": "stock",
    "axis": 0,
    "value": -1.7060999870300293,
    "tolerance": 0.002
  },
  {
    "key": "warrior-39-hanging-panel-and-inner-web",
    "origin": [
      1.8,
      1.3,
      -2.2
    ],
    "direction": [
      -1,
      0,
      0
    ],
    "far": 0.3,
    "expect": "stock",
    "axis": 0,
    "value": 1.701200008392334,
    "tolerance": 0.002
  },
  {
    "key": "warrior-40-hanging-panel-and-inner-web",
    "origin": [
      1.8,
      1.7,
      -2.2
    ],
    "direction": [
      -1,
      0,
      0
    ],
    "far": 0.3,
    "expect": "stock",
    "axis": 0,
    "value": 1.701200008392334,
    "tolerance": 0.002
  },
  {
    "key": "warrior-41-hanging-panel-and-inner-web",
    "origin": [
      1.8,
      1.3,
      -0.65
    ],
    "direction": [
      -1,
      0,
      0
    ],
    "far": 0.3,
    "expect": "stock",
    "axis": 0,
    "value": 1.701200008392334,
    "tolerance": 0.002
  },
  {
    "key": "warrior-42-hanging-panel-and-inner-web",
    "origin": [
      1.8,
      1.7,
      -0.65
    ],
    "direction": [
      -1,
      0,
      0
    ],
    "far": 0.3,
    "expect": "stock",
    "axis": 0,
    "value": 1.701200008392334,
    "tolerance": 0.002
  },
  {
    "key": "warrior-43-hanging-panel-and-inner-web",
    "origin": [
      1.8,
      1.3,
      0.45
    ],
    "direction": [
      -1,
      0,
      0
    ],
    "far": 0.3,
    "expect": "stock",
    "axis": 0,
    "value": 1.7148000001907349,
    "tolerance": 0.002
  },
  {
    "key": "warrior-44-hanging-panel-and-inner-web",
    "origin": [
      1.8,
      1.7,
      0.45
    ],
    "direction": [
      -1,
      0,
      0
    ],
    "far": 0.3,
    "expect": "stock",
    "axis": 0,
    "value": 1.7148000001907349,
    "tolerance": 0.002
  },
  {
    "key": "warrior-45-hanging-panel-and-inner-web",
    "origin": [
      1.8,
      1.3,
      1.23
    ],
    "direction": [
      -1,
      0,
      0
    ],
    "far": 0.3,
    "expect": "stock",
    "axis": 0,
    "value": 1.701200008392334,
    "tolerance": 0.002
  },
  {
    "key": "warrior-46-hanging-panel-and-inner-web",
    "origin": [
      1.8,
      1.7,
      1.23
    ],
    "direction": [
      -1,
      0,
      0
    ],
    "far": 0.3,
    "expect": "stock",
    "axis": 0,
    "value": 1.701200008392334,
    "tolerance": 0.002
  }
];
export function sourceOpeningWitnesses(id,quality='high'){
 if(isArieteOpeningTarget(id))return arieteOpeningWitnesses(id,quality);
 if(id==='merkava4_barak')return BARAK_OPENING_WITNESSES;
 if(id==='aft10_x')return aftWitnesses();
 if(id==='fv510_milan_x')return WARRIOR_SOURCE_WITNESSES;
 return [];
}
export function requiredOpeningGuardKeys(id,quality='high'){return sourceOpeningWitnesses(id,quality).map(witness=>witness.key);}
