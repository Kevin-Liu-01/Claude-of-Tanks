import mars from './mars.ts';
import type { MapCompositionConfig } from './contracts.ts';
const grey = (_h: number, _s: number, l: number): [number, number, number] => [0.60, .025, .30 + l * .35];
export default {
  id: 'moon', name: 'Earthrise Basin',
  blurb: 'Lunar crater rims, a research outpost and long shadows beneath a vast blue Earth',
  terrain: {
    hillScale: .45, microScale: .48, rimH: 24, marshes: [], lakes: [], fieldTrenches: false,
    village: { x0: 70, x1: 210, z0: -50, z1: 120, cx: 140, cz: 35, feather: 35, flatten: .9 },
    roads: { paths: [
      [[-180,-480],[-145,-310],[-90,-210],[0,-140],[100,-120],[140,-50],[140,130],[80,245],[20,360],[-30,480]],
      [[-480,130],[-340,110],[-240,25],[-90,-210],[0,-280],[240,-240],[360,-110],[400,160],[480,240]],
      [[80,245],[-100,270],[-270,220],[-340,110]],
    ] },
    landforms: [
      { kind: 'basin', x: -155, z: 20, rx: 145, rz: 130, height: -16, corridorScale: 1 },
      { kind: 'ridge', x: -270, z: -30, length: 235, width: 48, height: 9, yawDeg: 85 },
      { kind: 'ridge', x: -135, z: 148, length: 195, width: 50, height: 11 },
      { kind: 'basin', x: 285, z: 270, rx: 115, rz: 100, height: -12 },
      { kind: 'ridge', x: 240, z: 180, length: 175, width: 44, height: 9, yawDeg: -25 },
      { kind: 'knoll', x: -350, z: -270, rx: 120, rz: 90, height: 14 },
    ],
  },
  spawns: { player: { x: -140, z: -350 }, enemies: [
    {x:-170,z:370},{x:-100,z:395},{x:-30,z:375},{x:40,z:405},{x:110,z:390},{x:180,z:410},{x:250,z:395},
  ] },
  splat: { ...mars.splat, sourcedPalette: 'moon', sandstone: false,
    grassTone: grey, dirtTone: grey, rockTone: grey, mudTone: grey,
    tintA: [.94,.96,1], tintB: [.82,.84,.88], tintC: [1,1,1], roadTint: [.76,.78,.82], rippleAmp: .05, strata: 0,
  },
  vegetation: { ...mars.vegetation },
  props: { ...mars.props, sourcedPalette: 'winter', plan: [], destructibleBuildings: [], tacticalBeats: [],
    // Olympus Basin's recorded station (props townPlan / townLightPlan) stays on Mars
    townPlan: undefined, townLightPlan: undefined, roadBuildingClearance: undefined,
    rockTone: grey, rocks: 260, outcrops: 48, craters: 90, rubblePiles: 0, hedgehogs: 0,
    tankWrecks: { era: 'modern', count: 3, debris: true, ids: ['m1a2','type10','m551_sheridan'] },
    orbitalSettlement: [
      { id:'lunar-control',structure:'missioncontrol',x:178,z:30,yawDeg:90 },
      { id:'lunar-relay',structure:'commsmast',x:200,z:64,yawDeg:0 },
      { id:'lunar-crew-a',structure:'habdome',x:100,z:18,yawDeg:0 },
      { id:'lunar-crew-b',structure:'habmodule',x:100,z:58,yawDeg:90 },
      { id:'lunar-lab',structure:'habmodule',x:178,z:-10,yawDeg:90 },
      { id:'lunar-lander',structure:'ascentlander',x:235,z:-115,yawDeg:0 },
      { id:'lunar-pad',structure:'landingpad',x:275,z:-110,yawDeg:0 },
      { id:'lunar-rovers',structure:'rovergarage',x:195,z:110,yawDeg:180 },
      ...[0,1,2,3].map(i=>({id:`lunar-power-${i}`,structure:'solararray',x:85+i*32,z:165,yawDeg:25})),
      { id:'crater-relay',structure:'commsmast',x:-200,z:180,yawDeg:0 },
    ],
  },
  horizon: { baseHex: 0x686b73, rockHex: 0x858a94, amp: 1.35, style: 'rolling', treeline: 0,
    treelineLayers: 0, ground: 'sand', relief: 'martian', haze: 0, grain: .7, farRange: true,
    // the mountains lane (2026-10-02): the moon keeps its own walls — the carved landform drew straight-flanked
    // pyramids on these airless ranges (the skyline cone measure, horizonMassif.selftest.mjs: 0 -> 13 over three seeds)
    massif: false },
  sky: { skyIntensity: 0, nightSky: 1, galaxy: .35, nebulaHex: 0, earth: 1, planetDeg: 18, planetHex: 0x8abdff,
    sunElevationDeg: 28, sunAzimuthDeg: 48, turbidity: 1, rayleigh: 0, mieCoefficient: 0,
    fogDensity: 0, fogMix: 0, envIntensity: .3, cloudOpacity: 0, cloudOpacity2: 0, cloudShadowAmp: 0,
    sunIntensity: 3.5, sunColorHex: 0xf1f4ff, hemiIntensity: .38, fillIntensity: .16, postExposure: .98,
    atmosphere: { rayleighScale: 0, mieScale: 0, ozoneScale: 0, groundAlbedoHex: 0x676b73 },
  },
  minimap: { ...mars.minimap, base: [108,111,118], hard: [145,148,155], soft: [90,93,100],
    roadFill: 'rgba(180,185,195,.95)', roadCasing: 'rgba(60,65,75,.9)' },
  shot: { pos: [-175,38,-195], look: [110,167.55,65] },
} satisfies MapCompositionConfig;
