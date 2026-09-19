// Test-only inverse of the bounded Barak rear/roof repair. Authenticated old
// profile hashes remain unchanged; every edited block is pinned before reversal.
import assert from'node:assert/strict';
import {createHash} from'node:crypto';
const BLOCKS=[
  {
    "name": "merkava4HullDetails",
    "afterSha256": "4ea9b630f27f09ce2d3e310ae23cd5e230b966f32b0d5e566e28a36a36381ce9",
    "before": "function merkava4HullDetails(P: TankBuilderPort, candidate: 'merkava4_x'|'merkava4_trophy'|'merkava4_barak'|'namer_ifv'): void {\n  for(const side of[-1,1]){\n    for(let i=0;i<8;i++){\n      const z=-2.98+i*.75,hem=.65+(i%2)*.018;\n      P.add('hull',box(.07,1.25-hem,.733),side*1.8384,(1.25+hem)/2,z+.366);\n      P.addEquipment('hullDetail',box(.035,.045,.16),side*1.8709449,1.228,z+.20);\n      for(const at of[z+.10,z+.63])P.addEquipment('hullDark',cylX(.016,.023,8),side*1.8769449,1.196,at);\n    }\n    // The source fender descends to the beak. A level raised guard made the\n    // draft 14\u201322 cm too high at the bow. The 20 mm skin has only a modest\n    // local crown for the native animated sprocket wrap, not a lifted nose.\n    P.addMudguard('merkava4-x-front-guard','hull',sectionSolid([\n      [2.78,1.351,1.316,1.81],[3.0,1.295,1.285,1.79],\n      [3.15,1.250,1.250,1.77],[3.30,1.235,1.235,1.77],\n      [3.45,1.219,1.219,1.77],[3.60,1.115,1.115,1.77],\n      [3.76,1.048,1.048,1.77],\n    ].map(([z,innerY,outerY,outer])=>{\n      const ring: [number,number][]=[[1.04,innerY-.020],[outer,outerY-.020],[outer,outerY],[1.04,innerY]];\n      return {z,ring:side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring};\n    })));\n    P.addMudguard('merkava4-x-front-flap','hullRubber',box(.57,.235,.045),side*1.44,.928,3.76,-.13);\n    P.addMudguard('merkava4-x-rear-flap','hullRubber',box(.58,.45,.043),side*1.45,.92,-3.56,.09);\n    // Trophy owns open source-measured aft receivers here; the generic closed\n    // Mk.4 case would sit inside each opening and erase its 526 mm air path.\n    if(candidate!=='merkava4_trophy')\n      P.addEquipment('hullDetail',box(.66,.36,.35),side*.66,1.37,-3.69);\n    for(const z of[-3.49,3.50])P.addEquipment('hullDetail',torus(.065,.019,12,6),side*.67,.79,z);\n    // Measured paired glacis tow lugs, with transverse pins and open eyes.\n    for(const x of[.930,1.010])P.addEquipment('hullDetail',box(.033,.065,.105),side*x,1.1875,3.3065);\n    P.addEquipment('hullDetail',cylX(.020,.117,16),side*.970,1.185,3.322);\n    P.addEquipment('hullDetail',torus(.044,.0145,16,8),side*.970,1.1925,3.373,0,Math.PI/2);\n    P.addEquipment('hullDark',box(.24,.15,.07),side*1.48,1.414,2.80);\n    P.addEquipment('hullGlass',markVehicleNightLens(box(.17,.082,.010), 'headlight'),side*1.48,1.420,2.840);\n    P.addEquipment('hullDetail',box(.125,.025,.23),side*1.80,1.199,3.20);\n    P.addEquipment('hullDetail',box(.025,.055,.15),side*1.773,1.220,3.16);\n    P.addEquipment('hullDetail',cylY(.028,.1999,12),side*1.8237,1.30635,3.2452);\n    P.addEquipment('hullDark',cylY(.0044,.555,8),side*1.8237,1.6743,3.2452);\n  }\n  P.addEquipment('hullDetail',orientedSlab(\n    [-.204,1.388,2.719],[.186,1.388,2.719],[.186,1.277,3.230],[-.204,1.277,3.230],\n    [-.204,1.410,2.719],[.186,1.410,2.719],[.186,1.300,3.230],[-.204,1.300,3.230],\n  ));\n  P.addEquipment('hullDetail',box(.366,.084,.163),-.009,1.404,2.6495);\n  P.addEquipment('hullDark',box(.29,.050,.010),-.009,1.414,2.736);\n  P.addEquipment('hullDetail',box(.384,.084,.092),-.009,1.258,3.177);\n  merkava4EngineAccess(P);\n}\n"
  },
  {
    "name": "merkava4BarakRoof",
    "afterSha256": "023da4fc1de3b5a25b7b3f5b85eeff5e7a1d8d797661c2536cb5834f7a2e8e86",
    "before": "function merkava4BarakRoof(P: TankBuilderPort): void {\n  const put=(slot:string,g:THREE.BufferGeometry,x:number,y:number,z:number,rx=0,ry=0,rz=0)=>topPart(P,MK4,slot,g,x,y,z,rx,ry,rz);\n  // Barak does not read as the older Mk.4 roof with another optic glued on.\n  // Keep the crew openings low, close the rear bustle with equipment cases,\n  // and leave the tall silhouette to the two measured rear aerials.\n  P.addCupola('turret',cylY(.36,.11,10),-.58,2.545-MK4.y,.04-MK4.z);\n  put('turretDetail',cylY(.31,.045,10),-.58,2.615,.04);\n  for(let i=0;i<8;i++){\n    const a=i*Math.PI/4,x=-.58+Math.cos(a)*.315,z=.04+Math.sin(a)*.315;\n    put('turretGlass',box(.115,.052,.018),x,2.604,z,0,-a);\n  }\n  put('turretDetail',sectionSolid([\n    {z:-1.64-MK4.z,ring:[[-.82,2.35-MK4.y],[.92,2.35-MK4.y],[.84,2.51-MK4.y],[-.72,2.51-MK4.y]]},\n    {z:-.73-MK4.z,ring:[[-.90,2.35-MK4.y],[.98,2.35-MK4.y],[.88,2.55-MK4.y],[-.78,2.55-MK4.y]]},\n  ]),0,0,0);\n  for(const side of[-1,1]){\n    handrail(P,MK4,side*1.18,-2.06,-.88,2.38);\n    // Six-tube banks remain tucked below the new sensor crown rather than\n    // becoming the dominant high furniture of the older roof package.\n    for(let row=0;row<2;row++)for(let i=0;i<3;i++)\n      put('turretDark',cylZ(.036,.34,12),side*(1.05+i*.09),2.34+row*.08,.26-i*.07,-.20,side*.46);\n  }\n  put('turretDetail',box(.58,.14,.74),-.98,2.47,-1.58);\n  put('turretDark',box(.46,.09,.025),-.98,2.51,-1.19);\n  put('turretGlass',box(.34,.065,.012),-.98,2.515,-1.174);\n}\n"
  },
  {
    "name": "addBarakSensorSuite",
    "afterSha256": "eab0cb8e1dd13cb49a25415d19e1eb08df2d6c5c0970f950f4043ce88b800708",
    "before": "function addBarakSensorSuite(P: TankBuilderPort): void {\n  const put=(slot:string,g:THREE.BufferGeometry,x:number,y:number,z:number,rx=0,ry=0,rz=0)=>\n    topPart(P,MK4,slot,g,x,y,z,rx,ry,rz);\n  // Barak retains Mk.4 mobility/firepower and is distinguished by its closed-\n  // hatch awareness and target-processing hardware.  The panoramic head and\n  // four camera clusters are physically seated on the roof/perimeter.\n  put('turretDetail',cylY(.27,.20,8),.50,2.72,-.47);\n  for(let i=0;i<4;i++){\n    const a=i*Math.PI/2;\n    put('turretGlass',box(.22,.075,.014),.50+Math.sin(a)*.255,2.74,-.47+Math.cos(a)*.255,0,a);\n  }\n  put('turretDetail',box(.38,.08,.38),.50,2.60,-.47);\n  // Low transverse IronVision brow: a strong horizontal read, unlike the\n  // older Trophy vehicle's tall outboard radar pylons and cupola forest.\n  put('turretDetail',box(1.36,.15,.25),.04,2.57,.39);\n  for(const x of[-.48,-.16,.16,.48])\n    put('turretGlass',box(.20,.068,.014),x,2.585,.522);\n  for(const [x,z,ry]of[[0,1.05,0],[0,-2.58,Math.PI],[1.43,-.72,Math.PI/2],[-1.43,-.72,-Math.PI/2]] as const){\n    put('turretDetail',box(.27,.17,.19),x,2.53,z,0,ry);\n    put('turretGlass',box(.17,.085,.012),x,2.55,z+(Math.abs(ry)<.1?.101:0),0,ry);\n  }\n  // Source Object_26 resolves into two independent rear whip assemblies at\n  // x \u00b11.03, z -3.63, each seated at y 2.60 and reaching y 5.66.  Instance\n  // the identical authored whip primitive: it remains turret-owned while the\n  // parent audit correctly evaluates the casting rather than antenna extents.\n  const whips=new THREE.InstancedMesh(cylY(.012,3.06,8),P.mats.dark,2);\n  whips.name='barakRearWhips';\n  for(const [index,side]of[-1,1].entries()){\n    // The source aerial feet rise from the near-upright rear equipment wall;\n    // diagonal braces here produced a false high triangular tail in profile.\n    cageBar(P,MK4,[side*1.025,1.98,-3.57],[side*1.025,2.60,-3.63],.050);\n    put('turretDetail',cylY(.052,.13,12),side*1.025,2.64,-3.63);\n    const pose=new THREE.Object3D();\n    pose.position.set(side*1.025,4.13-MK4.y,-3.63-MK4.z);\n    pose.updateMatrix();whips.setMatrixAt(index,pose.matrix);\n  }\n  whips.instanceMatrix.needsUpdate=true;P.turretG.add(whips);\n  P.turretG.userData.barakSensorReceipt=Object.freeze({panoramicHead:true,ironVisionCameraClusters:4,owner:'rig_turret'});\n}\n"
  },
  {
    "name": "addBarakTurretArmor",
    "afterSha256": "28462b8245c9818a24fc4b8b6825508f129b284cccad8ce32a62a1e2742aea3c",
    "before": "function addBarakTurretArmor(P: TankBuilderPort): void {\n  // The later turret carries a visibly different modular cheek course and a\n  // clean roof-to-bustle transition. Separate closed plates preserve the\n  // seams visible in the source without copying any source triangles.\n  for(const side of[-1,1]){\n    for(let i=0;i<3;i++){\n      const rear=-1.72+i*.72,front=rear+.66;\n      armorTile(P,MK4,side,rear,front,1.08,1.66-i*.08,1.00,1.55-i*.13,\n        2.46-i*.015,2.18-i*.04,2.42-i*.03,2.12-i*.06);\n    }\n  }\n  topPart(P,MK4,'turretDetail',box(3.18,.18,.32),0,2.51,-1.46);\n  for(const x of[-1.28,-.85,-.42,0,.42,.85,1.28])\n    topPart(P,MK4,'turretDark',box(.22,.075,.018),x,2.55,-1.291);\n  topPart(P,MK4,'turretDetail',box(1.76,.10,.50),.06,2.39,-2.05);\n  for(const x of[-.62,-.31,0,.31,.62])\n    topPart(P,MK4,'turretDark',box(.018,.11,.46),x+.06,2.39,-2.05);\n}\n"
  },
  {
    "name": "addBarakRearStowage",
    "afterSha256": "488b6847b6d59c6a033dc24f0e92081914e8137be8ef67a8ee624e7a42220b2e",
    "before": "function addBarakRearStowage(P: TankBuilderPort): void {\n  // Flattened source Object_27 is a many-island rear equipment pack occupying\n  // x -1.42..1.48, y 1.67..2.01, z -3.57..-1.88 after registration. Rebuild\n  // that occupied envelope as separate seated cases and a slim carrier so the\n  // basket keeps honest gaps instead of becoming a copied/filled source slab.\n  for(const x of[-1.34,1.34])topPart(P,MK4,'turretOpenLattice',box(.055,.055,1.50),x,1.72,-2.72);\n  for(const z of[-3.38,-2.72,-2.06])topPart(P,MK4,'turretOpenLattice',box(2.68,.055,.055),0,1.72,z);\n  // The source carrier terminates as a near-upright equipment wall at\n  // z -3.60, y 1.68..2.03. Closing that measured case face removes the\n  // triangular tail produced by the draft's short floating cases.\n  topPart(P,MK4,'turretDetail',box(2.68,.34,.18),0,1.855,-3.50);\n  for(const [x,w,d,z]of[[-1.08,.40,1.12,-2.77],[-.55,.46,1.24,-2.69],[0,.40,1.08,-2.80],[.53,.44,1.18,-2.66],[1.07,.39,1.10,-2.75]] as const){\n    topPart(P,MK4,'turretDetail',box(w,.22,d),x,1.88,z);\n    topPart(P,MK4,'turretDark',box(w-.08,.018,d-.12),x,2.00,z);\n  }\n}\n"
  },
  {
    "name": "addBarakRearMissionModule",
    "afterSha256": "3af1172c69ef36af642fe0bdb3ca743e5b4241ed46f59c7556efb9a7a89c7bcc",
    "before": "function addBarakRearMissionModule(P: TankBuilderPort): void {\n  // Barak's source upper body does not end at the clean Mk.4 basket line. Its\n  // broad rear mission/electronics volume runs from z -3.60 to the crew roof,\n  // climbing from a low service wall into the IronVision crown. Reconstruct\n  // that measured silhouette as a closed, faceted body beneath the separate\n  // stowage cases, leaving the whip aerials and sensor faces fully authored.\n  const stations=[\n    [-3.60,.95,1.68,2.45,.82],[-3.34,1.06,1.68,2.59,.92],\n    [-2.76,1.22,1.70,2.52,1.08],[-2.16,1.46,1.72,2.56,1.25],\n    [-1.56,1.60,1.73,2.62,1.36],[-.96,1.62,1.66,2.72,1.38],\n  ] as const;\n  P.add('turret',sectionSolid(stations.map(([z,half,floor,roof,roofHalf])=>({\n    z:z-MK4.z,\n    ring:[[-half,floor-MK4.y],[half,floor-MK4.y],[half,roof-.10-MK4.y],\n      [roofHalf,roof-MK4.y],[-roofHalf,roof-MK4.y],[-half,roof-.10-MK4.y]],\n  }))));\n  for(const side of[-1,1]){\n    const plate=(z:number,top:number): SolidSection=>{\n      const ring: [number,number][]=[\n        [1.3007,2.4288-MK4.y],[1.4447,2.4288-MK4.y],\n        [1.4447,top-MK4.y],[1.3007,top-MK4.y],\n      ];\n      return {z:z-MK4.z,ring:side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring};\n    };\n    P.add('turret',sectionSolid([plate(-1.7401,2.66),plate(-1.1635,2.8892)]));\n  }\n  // Object_22 is one connected roof-weapon assembly in the source: a seated\n  // square foot, an angled support, a narrow upright and the long receiver.\n  // Emitting only the receiver left a detached island at turret yaw 90.\n  topPart(P,MK4,'turretDetail',box(.2910,.1518,.2909),-.7176,2.6429,-.8552);\n  cageBar(P,MK4,[-.75,2.57,-.86],[-.976,2.85,-.82],.055,'turretOpenLatticeDark');\n  // The supported receiver and barrel are the real weapon stock. Register\n  // those visible source-measured parts for the fitting census; do not add a\n  // dummy marker or a second roof weapon.\n  const roofWeapon=new THREE.Group();\n  const weaponPart=(geometry: THREE.BufferGeometry,material: THREE.Material,\n    x:number,y:number,z:number): void=>{\n    const mesh=new THREE.Mesh(geometry,material);\n    mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;\n    roofWeapon.add(mesh);\n  };\n  weaponPart(box(.0421,.1122,.4768),P.mats.detail,0,0,0);\n  weaponPart(box(.0411,.0435,.7131),P.mats.dark,-.0005,.0198,.4932);\n  FITTINGS.markExact(roofWeapon,'pintleMG');\n  roofWeapon.position.set(-.9759,2.8967-MK4.y,-.9093-MK4.z);\n  P.turretG.add(roofWeapon);\n}\n"
  },
  {
    "name": "merkava4Hull",
    "afterSha256": "3ecf5152cd48525ba1f904a75806d23af0be6b149f22fe4ecd9efae0d70c5e40",
    "before": "function merkava4Hull(): THREE.BufferGeometry {\n  const pieces=[sectionSolid([\n    ...merkava4RearHullStations(),\n    bodyStation(-2.00,1.77,1.604,.419,MK4,.97),bodyStation(1.963,1.77,1.604,.419,MK4,.97),\n    bodyStation(2.80,1.77,1.347,.48,MK4,.97,.03),bodyStation(3.15,1.04,1.284,.59,MK4,.97,.03),\n    bodyStation(3.31,1.04,1.255,.64,MK4,.97,.03),bodyStation(3.80,1.025,1.034,.96,MK4,.96,.02),\n  ]),...merkava4RearFoldSolids()];\n  const merged=mergeGeometries(pieces);\n  for(const piece of pieces)piece.dispose();\n  if(!merged)throw new Error('Merkava 4 rear hull primitives did not merge');\n  return merged;\n}\n"
  }
];
const REPLACEMENTS=[
  [
    "import { barakHullBody, addBarakRearCases } from './merkavaBarakRearBody.ts';\n",
    ""
  ],
  [
    "import { addBarakMeasuredRoofStock, addBarakCrewRoof, addBarakBasket, addBarakWhips } from './merkavaBarakTurret.ts';\n",
    ""
  ],
  [
    "P.add('hull',candidate==='merkava4_trophy'?trophyMerkava4Hull():merkava4Hull(candidate==='merkava4_barak'));",
    "P.add('hull',candidate==='merkava4_trophy'?trophyMerkava4Hull():merkava4Hull());"
  ],
  [
    "    addBarakRearCases(P);",
    "    addModernMerkavaRearClosure(P,false);"
  ]
];

export function beforeBarakRearEquipment(source){
  if(!source.includes("import { barakHullBody,"))return source;
  for(const [current,before]of REPLACEMENTS){
    assert.equal(source.split(current).length-1,1,'one exact Barak rear equipment seam');source=source.replace(current,before);
  }
  for(const {name,afterSha256,before}of BLOCKS){
    const start=source.indexOf('function '+name+'('),end=source.indexOf('\n}\n',start)+3;
    assert.ok(start>=0&&end>start,'bounded Barak function exists');
    const current=source.slice(start,end);
    assert.equal(createHash('sha256').update(current).digest('hex'),afterSha256,'exact reviewed Barak '+name);
    source=source.slice(0,start)+before+source.slice(end);
  }
  return source;
}
