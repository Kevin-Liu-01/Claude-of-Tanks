import verdant from './verdant.ts';
import type { MapCompositionConfig } from './contracts.ts';
/** A dry gorge: the deck is real collision support, never terrain painted as water. */
export default {
  id: 'cliffbridge', name: 'Aegis Crossing',
  blurb: 'A monumental stone viaduct joins two lush cliffs, with bridgehead villages and a wooded eastern flank',
  terrain: {
    hillScale: .32, microScale: .42, rimH: 32, marshes: [], lakes: [], fieldTrenches: false,
    village: { x0: -150,x1: 95,z0: 170,z1: 310,cx:-30,cz:240,feather:35,flatten:.8 },
    bridges: [{ x:0,z:0,yawDeg:90,spanM:200,widthM:18,approachM:95,route:0 }],
    roads: { paths: [
      [[-100,-480],[-70,-340],[0,-220],[0,-100],[0,100],[0,220],[-35,320],[-50,480]],
      [[270,-480],[300,-340],[380,-190],[410,-70],[405,90],[370,240],[285,340],[240,480]],
      [[0,-220],[120,-245],[245,-250],[380,-190]],
      [[0,220],[110,260],[245,280],[370,240]],
    ] },
    landforms: [
      {kind:'gorge',x:-80,z:0,length:780,width:96,height:-38,corridorScale:1,settlementScale:1},
      {kind:'ridge',x:-240,z:-230,length:270,width:60,height:12,yawDeg:12},
      {kind:'ridge',x:195,z:180,length:220,width:55,height:10,yawDeg:-15},
      {kind:'knoll',x:235,z:-350,rx:90,rz:90,height:7},
      {kind:'knoll',x:-225,z:365,rx:115,rz:85,height:9},
    ],
  },
  spawns: {player:{x:-65,z:-385},enemies:[
    {x:-170,z:380},{x:-95,z:410},{x:-25,z:380},{x:45,z:420},{x:115,z:385},{x:185,z:420},{x:255,z:385},
  ]},
  splat: {...verdant.splat, sourcedPalette:'verdant', fieldPatch:.35,
    tintA:[.94,1.04,.87],tintB:[.82,.91,.74],tintC:[1,1.05,.88],roadTint:[.83,.80,.70]},
  vegetation: {...verdant.vegetation,clusterCount:60,loneCount:130,rimCount:95,grassDensity:1,bushCount:.8},
  props: {...verdant.props,plan:['cottage','farmhouse','tavern','chapel','barn','schoolhouse','cottage','granary','cottage','farmhouse'],
    destructibleBuildings:['fieldhut','leanto'], blockFill:false,extraKits:[],buildingLat:[20,5],spacingPad:12,sideSkip:.12,
    wallRuns:[],telegraph:true,rocks:180,outcrops:38,craters:8,rubblePiles:0,hedgehogs:4,sandbagLines:6,
    cropFields:3,haystacks:14,
    plannedSites:[
      {structure:'tavern',x:-48,z:-222,yawDeg:90},
      {structure:'cottage',x:45,z:-280,yawDeg:-90},
      {structure:'farmhouse',x:-87,z:-273,yawDeg:90},
      {structure:'barn',x:37,z:-310,yawDeg:-90},
      {structure:'farmhouse',x:330,z:135,yawDeg:90},
    ],
    tacticalBeats:[
      {id:'south-tollhouse',role:'brawl',x:-48,z:-150,yawDeg:90,structure:'guardpost',redoubt:true},
      {id:'north-watch',role:'support',x:52,z:155,yawDeg:-90,structure:'guardpost',outcrop:{count:4,radius:9}},
    ],
  },
  horizon:{...verdant.horizon,amp:1.55,baseHex:0x456a38,rockHex:0x777c70,treeline:.95,haze:.7},
  sky:{...verdant.sky,sunElevationDeg:34,sunAzimuthDeg:235,cloudOpacity:.56,cloudOpacity2:.2,cloudAltM:1250,
    fogDensity:.00028,fogTintHex:0xb3c4b6,sunColorHex:0xfff0d9,sunIntensity:3.5,postExposure:.98},
  clouds:{regime:'fair-weather-cumulus',baseM:1200,coverage:.28,contrails: 0.3, cirrus: 0.25, sunset: { mid: 'altocumulus', midCoverage: 0.4 }},
  minimap:{...verdant.minimap},
  shot:{pos:[-170,45,-170],look:[20,-4,30]},
} satisfies MapCompositionConfig;
