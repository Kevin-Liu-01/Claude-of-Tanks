import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';

const near=(got,expected,tolerance,label)=>assert.ok(Number.isFinite(got)&&Math.abs(got-expected)<=tolerance,
  `${label}: ${got}, source ${expected} ± ${tolerance}`);
const cast=(meshes,p,d,far=10)=>new THREE.Raycaster(new THREE.Vector3(...p),
  new THREE.Vector3(...d),0,far).intersectObjects(meshes,false)[0];

function checkInsulators(meshes,turret,detail,dark) {
  // Independent source Object_12:5818 side sections; the broad lower drum
  // changes to a 19–36mm upper neck, not the former full-height cone.
  for(const [y,x]of[[2.425,.797845],[2.520,.757265],[2.600,.735439],
    [2.750,.731044],[2.820,.728899]])
    near(cast(meshes,[1,y,.7057],[-1,0,0])?.point.x,x,.001,'actual front-insulator source section');
  for(const [y,right,left]of[[2.30,1.089902,-1.072282],[2.40,1.056660,-1.039593],
    [2.50,1.038200,-1.021038],[2.60,1.034378,-1.017041]]) {
    near(cast(meshes,[1.3,y,-1.693],[-1,0,0])?.point.x,right,.0023,'actual right-insulator source section');
    near(cast(meshes,[-1.3,y,-1.693],[1,0,0])?.point.x,left,.0023,'actual left-insulator source section');
  }
  for(const [x,y,z]of[[.66,2.65,.65],[1.07,2.60,-1.72],[-1.05,2.60,-1.72]])
    assert.ok(!cast(meshes,[x,y,z],[0,0,1],.08),'source air beside the narrow insulator neck stays empty');
  const frontFoot=cast([detail],[.7195,2.38,.7057],[0,1,0])?.point.y;
  const roof=cast([turret],[.7195,2.40,.7057],[0,-1,0])?.point.y;
  near(frontFoot,2.38349,.0001,'front foot has an actual closed underside');
  assert.ok(roof-frontFoot>.0005&&roof-frontFoot<.003,'front insulator positively engages retained roof');
  for(const x of[-1.007,1.024]) {
    const stockBottom=cast([detail],[x,2.23,-1.693],[0,1,0])?.point.y;
    near(stockBottom,2.235,.0001,'rear stock has a closed source-sized lower casting');
    // Cast from inside the stock: its exterior cannot fake the retained
    // foot's top, which lies 6.5mm inside the new casting volume.
    const actualFootTop=cast([detail],[x,2.25,-1.693],[0,-1,0])?.point.y;
    near(actualFootTop,2.2415,.0001,'retained foot positively enters rear stock');
    near(cast([dark],[x,2.64,-1.693],[0,1,0])?.point.y,2.64721,.0001,'rear whip start unchanged');
    near(cast([dark],[x,4.2,-1.693],[0,-1,0])?.point.y,4.15041,.0001,'rear whip endpoint unchanged');
    near(cast([detail],[x,2.75,-1.693],[0,-1,0])?.point.y,2.74059,.0001,'rear source neck overlaps unchanged whip');
  }
  near(cast([dark],[.7195,2.82,.7057],[0,1,0])?.point.y,2.82345,.0001,'front whip start unchanged');
  near(cast([dark],[.7195,5.2,.7057],[0,-1,0])?.point.y,5.11445,.0001,'front whip endpoint unchanged');
  near(cast([detail],[.7195,2.84,.7057],[0,-1,0])?.point.y,2.82659,.0001,'front source neck overlaps unchanged whip');
}

for(const quality of ['high','low']) {
  const tank=createTank('amx40_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try {
    tank.root.updateMatrixWorld(true);
    const meshes=[];tank.root.traverse(m=>{if(m.isMesh&&!m.name.startsWith('procShadow_')&&!m.userData.vehicleMarking)meshes.push(m)});
    const turret=tank.root.getObjectByName('turret'),detail=tank.root.getObjectByName('turretDetail');
    const yaw=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun');
    assert.ok(turret&&detail&&yaw&&gun,'actual built owners exist in both LODs');
    checkInsulators(meshes,turret,detail,tank.root.getObjectByName('turretDark'));
    // Complete-source Object_12:1908 roof witnesses: there is no continuous
    // raised 141mm rim, and the hatch is a separate raised elliptical lid.
    for(const [x,z]of[[-.9889,-.225],[-.5589,.205],[-.3439,-.597391],[-.931291,-.44]]) {
      near(cast(meshes,[x,3.3,z],[0,-1,0])?.point.y,2.70449,.001,'actual low cupola rim');
      assert.equal(cast(meshes,[x,2.82,z],[0,-1,0],.10),undefined,'source air over the low rim');
    }
    near(cast(meshes,[-.5589,2.83,-.38],[0,-1,0])?.point.y,2.74359,.0001,'source elliptical hatch crown');
    const baseTop=2.70449,lidBottom=2.70349;
    near(cast([detail],[-.60819,2.70,-.27491],[0,1,0])?.point.y,lidBottom,.0001,'lid has a real lower surface');
    assert.ok(baseTop-lidBottom>.0009,'lid positively seats into retained cupola, not air');
    // Object_11:27 is a vertical capsule-shaped window, not a broad round
    // glass disk. These full-scene witnesses retain side walls and recess.
    for(const [x,y]of[[-.24764,2.96],[-.30,2.91]]) {
      const hit=cast(meshes,[x,y,.20],[0,0,-1]);
      assert.equal(hit?.object.name,'turretGlass','actual recessed sight glass is first');
      near(hit?.point.z,-.08551,.0001,'source night-sight glass plane');
      near(cast([tank.root.getObjectByName('turretGlass')],[x,y,-.1],[0,0,1])?.point.z,
        -.08951,.0001,'concealed four-millimetre glazing has a closed physical back');
      assert.equal(cast(meshes,[x,y,-.025],[0,0,-1],.050),undefined,'genuine approach air before glazing');
    }
    near(cast(meshes,[-.34,2.96,.20],[0,0,-1])?.point.z,-.046483,.0015,'source solid side wall beside window');
    near(cast(meshes,[-.24764,3.08,-.175],[0,-1,0])?.point.y,3.07659,.0015,'retained clipped vertical head crown');
    for(const [x,z]of[[-.10,-.175],[-.39,-.175],[-.24764,-.03],[-.24764,-.320]])
      near(cast(meshes,[x,3.2,z],[0,-1,0])?.point.y,3.09509,.0001,'source thin overhanging rain-cap crown');
    near(cast(meshes,[-.39,3.08,-.175],[0,1,0])?.point.y,3.08439,.0001,'actual measured rain-cap underside');
    assert.ok(!cast(meshes,[-.39,3.080,-.220],[0,0,1],.080),'source side overhang retains real under-cap air');
    assert.ok(!cast(meshes,[-.10,3.090,-.030],[0,-1,0],.020),'real clipped cap corner stays empty');
    for(const x of [-.290,-.205]) {
      const foot=cast(meshes,[x,3.071,-.180],[0,1,0])?.point.y;
      const head=cast(meshes,[x,3.08,-.210],[0,-1,0])?.point.y;
      assert.ok(head-foot>.002&&head-foot<.004,'inferred narrow spacer overlaps retained head');
      near(cast(meshes,[x,3.083,-.18],[0,1,0])?.point.y,3.08439,.0001,
        'spacer crosses actual cap underside without a gap');
      near(cast(meshes,[x,3.086,-.18],[0,-1,0])?.point.y,3.0858,.0001,
        'spacer upper surface positively enters cap volume');
    }
    // Independent complete-source roll/case crowns, not only their bounds.
    for(const [x,z,y,t]of[[1.30,-1.20,2.159652,.012],[-1.35,-.35,2.132352,.006],
      [1.33,.40,2.192634,.008],[1.363,-.10,2.101597,.001],[-1.326,.40,2.03751,.001]]) {
      near(cast(meshes,[x,3,z],[0,-1,0])?.point.y,y,t,'actual source-sized stowage crown');
    }
    // Fixed casts protect upper/lower nose lips independently of the separate
    // apron and gun, which legitimately occupy some complete-scene rays.
    near(cast([turret],[-.85,3,1.40],[0,-1,0])?.point.y,2.241153,.001,'source outer upper cast lip');
    near(cast([turret],[-.85,2.10,1.40],[0,1,0])?.point.y,2.175587,.0015,'source cast lip underside');
    near(cast([turret],[-1.05,2.1,1.40],[0,-1,0])?.point.y,1.729484,.004,'source lower cast sill');
    assert.equal(cast([turret],[-.85,2.10,1.41],[0,0,1],.05),undefined,'front-open cast clearance is genuine air');
    // The open tubular guard must exist, not a painted silhouette or solid fill.
    near(cast(meshes,[-1.4,2.1,1.167],[1,0,0])?.point.x,-1.3428,.005,'source left guard upright');
    assert.equal(cast(meshes,[-1.27,2.35,1.30],[0,0,1],.10),undefined,'source upper guard keeps its open interior');
    // Five source jerrycans sit in a thin, open folded carrier. The previous
    // one-box approximation filled 361mm of genuine outer-corner air.
    for(const x of[-1.35,-.675]) {
      near(cast(meshes,[x,2,-2.8],[0,0,1])?.point.z,-1.89231,.001,'actual carrier forward flange only');
      assert.equal(cast(meshes,[x,2,-2.3],[0,0,1],.35),undefined,'source air outside the narrow side sheets');
    }
    assert.ok(!cast(meshes,[-1.18,2.20,-2.15],[0,-1,0],.35),'real gap between the separately carried cans');
    for(const x of[-1.28609,-1.07619,-.97384,-.85864,-.75414])
      near(cast(meshes,[x,2,-2.8],[0,0,1])?.point.z,-2.243714,.005,'each actual can has its own rear face');
    near(cast(meshes,[-1.076,3,-2.15],[0,-1,0])?.point.y,2.172518,.001,'raised can handle crown');
    // Source rising can shoulder resumes at Z about -2.086; the 50mm
    // approach is air, while a longer ray must encounter that real shoulder.
    assert.ok(!cast(meshes,[-1.076,2.15,-2.15],[0,0,1],.05),'open handhold beneath the bridge');
    near(cast(meshes,[-1.076,2.15,-2.15],[0,0,1])?.point.z,-2.08587,.003,'source handhold ends at the rising shoulder');
    near(cast(meshes,[-1.076,3,-2.01],[0,-1,0])?.point.y,2.166699,.001,'separate upper retaining strip');
    near(cast(meshes,[.95,3,-2.10],[0,-1,0])?.point.y,2.163844,.005,'canted right-case outer cover');
    // Independent held-out mantlet and coax-base surfaces, owned by the
    // real pitch group. The barrel/deep-bore tests remain separate and fixed.
    for(const[x,y,z,t]of[[.6,1.94,1.976901,.003],[-.85,2.1,2.146547,.002],
      [-.95,1.94,2.187608,.002],[-.65,1.94,2.186452,.001],[.455,1.94,2.0176,.0002]])
      near(cast(meshes,[x,y,3],[0,0,-1])?.point.z,z,t,'actual measured mantlet first surface');
    for(const[z,y]of[[1.7,2.150336],[1.9,2.087336]])
      near(cast(meshes,[.5,3,z],[0,-1,0])?.point.y,y,.001,'measured forward cast roof slope');
    const before=cast([detail],[-.24764,4,-.175],[0,-1,0]).point.clone();
    yaw.rotation.y=.61;gun.rotation.x=-.1;tank.root.updateMatrixWorld(true);
    const target=before.clone().sub(yaw.position).applyAxisAngle(new THREE.Vector3(0,1,0),.61).add(yaw.position);
    near(cast([detail],[target.x,4,target.z],[0,-1,0])?.point.y,target.y,.0015,'actual equipment follows turret yaw, not gun pitch');
  } finally {tank.dispose();}
}
console.log('amx40XTurretEquipment: actual high/low low-rim air, seated elliptical lid, vertical sight, stowage, cast-nose lips and open guard pass');
