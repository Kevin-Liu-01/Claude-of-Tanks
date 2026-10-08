import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute, Ray, Triangle, Vector3 } from 'three';
import { sectionSolid } from './sectionSolid.ts';
import { polyMultiLoft, pushConvexQuad } from '../factoryGeometry.ts';
import { sampleArmorFace, sampleConvexArmorFace } from './armorFaceSampling.ts';
import { shellPart, mirroredSurfaceError } from '../../../tools/base-shell-audit-math.mjs';
import { shellEdgeTopology, properSurfaceCrossings, weldedPanelConcavity } from '../../../tools/base-shell-integrity.mjs';
import '../../../tools/tank-surface-collect.mjs';
import { createTank } from '../tankFactory.ts';

const close = (a,b,message,tolerance=0.000003) => assert.ok(Math.abs(a-b)<tolerance,`${message}: ${a} vs ${b}`);
function panelFaces(part, count) {
  for(let i=0;i<count;i+=2) assert.ok(weldedPanelConcavity(part.triangles[i],part.triangles[i+1])<0.000003,
    `welded panel ${i/2} must have outward support facets`);
}
const stations=[{z:-1,ring:[[-1,0],[1,0],[.7,1],[-.7,1]]},
  {z:1,ring:[[-.9,0],[.9,0],[.4,.8],[-.4,.8]]}];
const legacy=sectionSolid(stations),explicitDefault=sectionSolid(stations,{sideQuadDiagonal:'ac'});
assert.deepEqual(legacy.attributes.position.array,explicitDefault.attributes.position.array,'default section output stays unchanged');
assert.ok(mirroredSurfaceError(shellPart(legacy),shellPart(legacy)).maxM>.005,'old diagonal is a real asymmetric surface control');
assert.throws(()=>panelFaces(shellPart(legacy),8),/outward support/,'old inward fold must fail');
const welded=sectionSolid(stations,{sideQuadDiagonal:'convex'}),weldedPart=shellPart(welded);
panelFaces(weldedPart,8);close(mirroredSurfaceError(weldedPart,weldedPart).maxM,0,'reflected welded faces agree');
assert.deepEqual(shellEdgeTopology(weldedPart),{boundary:0,nonmanifold:0,inconsistent:0});
assert.equal(properSurfaceCrossings(weldedPart).length,0);assert.ok(weldedPart.volume>0);
const plan=[[-1,1],[1,1],[1,-1],[-1,-1]],rings=[{height:0,inset:1},{height:[1,.8,.9,.7],inset:[.7,.6,.8,.5]}];
const loft=polyMultiLoft(plan,rings,{convexSideQuads:true});panelFaces(shellPart(loft),8);
assert.deepEqual(polyMultiLoft(plan,rings).attributes.position.array,
  polyMultiLoft(plan,rings,{convexSideQuads:false}).attributes.position.array,'default loft output stays unchanged');

// Non-coplanar crossing versus separated triangles exercises the actual face
// intersection predicate, independently of any vehicle implementation.
const trianglePair=(offset=0)=>{
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute([
    -1,0,-1,1,0,-1,0,0,1, 0,-1,-.5+offset,0,1,-.5+offset,.2,0,.5+offset,
  ],3));return shellPart(g);
};
assert.ok(properSurfaceCrossings(trianglePair()).length>0,'piercing control rejected');
assert.equal(properSurfaceCrossings(trianglePair(4)).length,0,'separated control remains valid');

// Type 10B dimensions independently exercise a marked roof corner. The
// old bilinear sample is off the physical two-facet roof; the replacement
// point and normal must lie on an emitted support triangle on both sides.
for(const side of [-1,1]){
  let corners=[[.176,.638,1.342],[1.43,.671,.638],[1.375,.616,-.715],[.407,.660,.165]].map(([x,y,z])=>[side*x,y,z]);
  const normal=new Vector3().crossVectors(new Vector3(...corners[1]).sub(new Vector3(...corners[0])),new Vector3(...corners[2]).sub(new Vector3(...corners[0])));
  const ordered=normal.y>0?corners:[corners[0],corners[3],corners[2],corners[1]],positions=[];
  pushConvexQuad(positions,...ordered);
  const triangles=[0,9].map(i=>new Triangle(...[0,3,6].map(k=>new Vector3(...positions.slice(i+k,i+k+3)))));
  const distance=p=>Math.min(...triangles.map(t=>t.closestPointToPoint(p,new Vector3()).distanceTo(p)));
  assert.ok(distance(sampleArmorFace(...corners,.5,.5,[0,1,0]).point)>.015,'old bilinear roof has visible separation');
  for(const u of [.16,.38,.60,.82])for(const v of [.12,.36,.60,.84]){
    const sample=sampleConvexArmorFace(...corners,u,v,[0,1,0]);close(distance(sample.point),0,'cassette seat lies on welded face');
    assert.ok(triangles.some(t=>t.closestPointToPoint(sample.point,new Vector3()).distanceTo(sample.point)<1e-7&&t.getNormal(new Vector3()).dot(sample.normal)>.99999));
  }
}

// Source provenance selects the repaired native structural emissions, not a
// second fixture reconstruction. Each selector has an exact expected count
// so deleting or bypassing the stock cannot silently pass this regression.
const targets={
  ztz99a2:{expected:2,select:p=>p.bucket==='hull'&&p.site.includes('buildZTZ99A2Hull (')&&p.part.size.x>1.1&&p.part.size.x<1.13&&p.part.size.z>2.29&&p.part.size.z<2.31&&p.part.bounds.max.y<1.63,convexAll:true,mirrorPair:true},
  k2_x:{expected:3,select:p=>p.bucket==='turret'&&p.part.geometryType==='BufferGeometry'&&p.part.triangles.length===92&&p.site.includes('k2X.ts'),sectionContour:p=>p.part.size.x>2?8:6},
  k21_x:{expected:2,select:p=>p.part.geometryType==='BufferGeometry'&&((p.bucket==='hull'&&p.site.includes('buildK21Hull (')&&p.part.size.z>6)||(p.bucket==='turret'&&p.site.includes('buildK21Turret (')&&p.part.vertices.length===30)),sectionContour:p=>p.bucket==='hull'?14:6},
  marder2:{expected:4,select:p=>p.part.geometryType==='BufferGeometry'&&p.site.includes('buildMarder2 (')&&((p.bucket==='hull'&&p.part.size.z>7)||(p.bucket==='turret'&&p.part.vertices.length>8)),sectionContour:p=>p.bucket==='hull'?8:p.part.size.x>2?6:5},
  challenger1_x:{expected:5,select:p=>(p.bucket==='turret'&&p.site.includes('at body (')&&p.site.includes('challenger1XSuppliedTurret.ts'))||(p.bucket==='hull'&&p.site.includes('at sponson (')&&p.site.includes('challenger1XSuppliedHull.ts')),sectionContour:p=>p.bucket==='hull'?7:p.part.size.z>3?6:4},
  kf41_lynx_x:{expected:8,select:p=>(p.bucket==='hull'&&p.site.includes('buildLynxHull (')&&p.part.geometryType==='BufferGeometry'&&(p.part.vertices.length===70||(p.part.vertices.length===8&&p.part.bounds.max.z<-3)))||(p.bucket==='turret'&&((p.site.includes('buildLynxTurretArmor (')&&p.part.vertices.length===30)||p.site.includes('addLynxTurretCheek ('))),sectionContour:p=>p.part.geometryType==='ExtrudeGeometry'?null:p.bucket==='hull'?(p.part.vertices.length===70?10:4):p.part.vertices.length===30?6:5},
  lrmv_lynx:{expected:6,select:p=>(p.bucket==='hull'&&p.site.includes('buildLynxHull (')&&p.part.geometryType==='BufferGeometry'&&(p.part.vertices.length===70||(p.part.vertices.length===8&&p.part.bounds.max.z<-3)))||(p.bucket==='turret'&&p.site.includes('buildLrmvLynx (')&&p.part.geometryType==='BufferGeometry'&&[8,24].includes(p.part.vertices.length)),sectionContour:p=>p.bucket==='hull'?(p.part.vertices.length===70?10:4):p.part.vertices.length===24?6:4},
  carro45t:{expected:3,select:p=>p.bucket==='turret'&&p.part.geometryType==='BufferGeometry'&&p.site.includes('buildCarro45TTurretStage1 (')&&p.part.vertices.length>8,sectionContour:p=>p.part.size.x>2?8:5},
  strv103:{expected:14,select:p=>p.bucket==='hull'&&p.site.includes('at loft (')&&p.site.includes('casemate.ts'),convexAll:true,mirror:true},
  strv103a:{expected:19,select:p=>p.bucket==='hull'&&p.site.includes('at loftRows (')&&p.site.includes('sweden.ts'),convexAll:true,mirror:true},
  udes03:{expected:8,select:p=>p.bucket==='hull'&&((p.site.includes('at loftRows (')&&p.site.includes('sweden.ts'))||(p.part.vertices.length===8&&p.part.size.z>2.15&&p.part.size.z<2.17&&p.part.size.x<.61)),convexAll:true,mirror:true},
  m1a2_x:{expected:2,select:p=>p.site.includes('buildTurretArmor (')&&p.site.includes('abramsSourceX.ts')&&p.bucket==='turret'&&p.part.size.z>2&&p.part.bounds.max.z>2&&p.part.bounds.min.z>-.02&&p.part.size.x>1},
  ztz85_iii:{expected:1,select:p=>p.site.includes('buildZTZ85III (')&&p.bucket==='turret'&&p.part.triangles.length===84,panels:56,mirror:true},
  sabra_mk2_x:{expected:3,select:p=>(p.site.includes('buildSabraHull (')&&p.part.triangles.length===80)||(p.site.includes('buildSabraTurretArmor (')&&p.bucket==='turret'&&p.part.triangles.length===44),mirror:true},
  type96b_x:{expected:3,select:p=>p.part.triangles.length>24&&((p.site.includes('buildType96Hull (')&&p.bucket==='hull'&&p.part.geometryType!=='ExtrudeGeometry')||(p.site.includes('buildType96Turret (')&&p.bucket==='turret'&&p.part.triangles.length===68)),mirror:true},
  type10b:{expected:3,select:p=>(p.site.includes('addType10BPackage (')&&p.bucket==='turret'&&p.part.vertices.length===8&&p.part.bounds.max.y>.6&&p.part.bounds.min.y<.06)||(p.site.includes('buildType10Native2026TurretStage1 (')&&p.bucket==='turret'&&p.part.triangles.length===108&&p.part.size.z>4)},
  k1a1_x:{expected:2,select:p=>(p.site.includes('hullBody (')&&p.bucket==='hull'&&p.part.bounds.min.z>2&&p.part.bounds.max.z<3.49)||(p.site.includes('turretBody (')&&p.bucket==='turret'&&p.part.triangles.length===92)},
  stb1:{expected:12,select:p=>p.site.includes('addSTB1HullBody (')&&p.bucket==='hull'&&p.part.vertices.length===8&&p.part.size.x>1.4&&p.part.size.z<3.19&&p.part.size.y>.075,mirror:true},
  t90ms:{expected:1,select:p=>p.site.includes('rebuildT90MSTurretExact (')&&p.bucket==='turret'&&p.part.triangles.length===104,panels:96,mirror:true},
  mbt70:{expected:1,select:p=>p.bucket==='turret'&&p.part.bounds.min.z<-2.91&&p.part.bounds.max.z>1.6&&p.part.vertices.length>80},
  challenger2:{expected:2,select:p=>p.bucket==='hull'&&p.part.size.x<.021&&p.part.size.z>7&&p.part.bounds.min.y>1.16},
  t90sm:{expected:1,select:p=>p.site.includes('addT90SMTurretFoundation (')&&p.part.size.x>3,cap:true},
};
let checked=0;
for(const [id,config]of Object.entries(targets))for(const quality of ['high','low']){
  const emissions=[];
  const tank=createTank(id,null,{proceduralOnly:true,quality,camoSeed:4242,geometryReceipt:true,
    partCensus(bucket,g,source){if(source==='add'&&(['hull','turret','turretExternalArmor','turretDark'].includes(bucket)||g.userData.nativeShellFixtureRole))emissions.push({bucket,g,site:new Error().stack??''});}});
  try{
    const parts=emissions.map(p=>({...p,part:shellPart(p.g,{geometryType:p.g.type})})).filter(config.select);
    assert.equal(parts.length,config.expected,`${id}/${quality} complete repaired stock is present`);
    for(const entry of parts){
      const {part,g}=entry;
      if(config.sectionContour){
        // Read actual emitted triangle pairs, retaining degenerate datum
        // triangles so cap indices cannot shift onto an unrelated face.
        const pos=g.getAttribute('position'),n=config.sectionContour(entry);
        const sideVertices=pos.count-6*(n-2);
        for(let i=0;n&&i<sideVertices;i+=6){
          const pair=new BufferGeometry();pair.setAttribute('position',new Float32BufferAttribute(Array.from(pos.array.slice(i*3,(i+6)*3)),3));
          const triangles=shellPart(pair).triangles;
          if(triangles.length===2)assert.ok(weldedPanelConcavity(...triangles)<.000003,`${id}/${quality} section panel ${i/6} outward facets`);
          pair.dispose();
        }
      }
      if(config.convexAll)for(const face of part.triangles){const n=face.triangle.getNormal(new Vector3());
        for(const v of part.vertices)assert.ok(n.dot(new Vector3(...v).sub(face.triangle.a))<.000003,`${id}/${quality} convex welded body`);}
      if(config.mirrorPair){const peer=parts.find(p=>p!==entry&&p.part.bounds.min.x*part.bounds.min.x<0);assert.ok(peer,'opposite shoulder present');
        close(mirroredSurfaceError(part,peer.part).maxM,0,`${id}/${quality} paired shoulder interiors`);}

      assert.equal(properSurfaceCrossings(part).length,0,`${id}/${quality} structural face crossings`);
      const edges=shellEdgeTopology(part);assert.equal(edges.inconsistent,0,`${id}/${quality} consistent native winding`);
      assert.equal(edges.nonmanifold,0,`${id}/${quality} manifold native panels`);
      if(!config.cap)assert.equal(edges.boundary,0,`${id}/${quality} closed finite stock`);
      if(config.panels)panelFaces(part,config.panels);
      if(id==='k1a1_x'&&part.triangles.length===92)panelFaces(part,80);
      if(id==='stb1')for(const face of part.triangles){const n=face.triangle.getNormal(new Vector3());
        for(const v of part.vertices)assert.ok(n.dot(new Vector3(...v).sub(face.triangle.a))<.000003,'STB welded bay is outward convex stock');}
      if(id==='type10b'&&part.triangles.length===108){panelFaces(part,72);close(mirroredSurfaceError(part,part).maxM,0,'native Type10 hull-derived turret symmetry');}
      if(config.mirror)close(mirroredSurfaceError(part,part).maxM,0,`${id}/${quality} mirror interiors`);
      if(config.cap){
        const top=part.bounds.max.y,roof=part.triangles.filter(t=>t.points.every(p=>Math.abs(p[1]-top)<.000001));
        // Base roof is 3.70060687152 m² before the vehicle's authored 1.05 scale.
        close(roof.reduce((sum,t)=>sum+t.area,0),3.70060687152*1.05**2,'T90 roof stays inside its concave outline',.00001);
      }
      checked++;
    }
    if(id==='kf41_lynx_x'||id==='lrmv_lynx'){
      const scale=.9,body=parts.find(p=>p.bucket==='turret'&&p.part.vertices.length===(id==='kf41_lynx_x'?30:24)).part;
      const role=id==='kf41_lynx_x'?'lynx-cheek-fastener-washer':'lrmv-cheek-fitting';
      const fixtures=emissions.filter(p=>p.g.userData.nativeShellFixtureRole===role);
      assert.equal(fixtures.length,id==='kf41_lynx_x'?16:8,'all bilateral armor-mounted fittings are present');
      for(const {g}of fixtures){
        const fixture=shellPart(g),center=fixture.bounds.getCenter(new Vector3());
        const ray=new Ray(new Vector3(Math.sign(center.x)*3,center.y,center.z),new Vector3(-Math.sign(center.x),0,0));
        let best=Infinity,normal;
        for(const face of body.triangles){const hit=ray.intersectTriangle(face.triangle.a,face.triangle.b,face.triangle.c,false,new Vector3());
          if(hit&&hit.distanceTo(ray.origin)<best){best=hit.distanceTo(ray.origin);normal=face.triangle.getNormal(new Vector3());}}
        assert.ok(normal,'fitting has an actual native carrier');
        let tested=0;
        const separation=point=>{
          const probe=new Ray(point.clone().addScaledVector(normal,1),normal.clone().negate());let distance=Infinity;
          for(const face of body.triangles){const hit=probe.intersectTriangle(face.triangle.a,face.triangle.b,face.triangle.c,false,new Vector3());if(hit)distance=Math.min(distance,hit.distanceTo(probe.origin));}
          return distance-1;
        };
        for(const face of fixture.triangles)if(face.triangle.getNormal(new Vector3()).dot(normal)<-.999){
          const point=face.triangle.getMidpoint(new Vector3());
          close(separation(point),-(id==='kf41_lynx_x'?.001:.002)*scale,'fixture foot embeds in actual carrier',.00001);
          assert.ok(separation(point.clone().addScaledVector(normal,.05))>.04,'detached fitting is a failing control');tested++;
        }
        assert.ok(tested>=2,'fitting back faces independently tested');
      }
      if(id==='kf41_lynx_x'){
        const pockets=parts.filter(p=>p.part.geometryType==='ExtrudeGeometry');assert.equal(pockets.length,2);
        const front=y=>y<=2.76?1.63+.525*(y-2.64):1.693-1.75*(y-2.76);
        const oldY=[2.4,2.61,2.825];
        assert.ok(Math.abs(oldY.map(front).reduce((a,b)=>a+b)/3-front(oldY.reduce((a,b)=>a+b)/3))>.04,
          'a triangle bridging the roof break is a material phantom-surface control');
        for(const {part}of pockets){
          for(const face of part.triangles){const normal=face.triangle.getNormal(new Vector3());if(Math.abs(normal.z)<.3)continue;
            const center=face.triangle.getMidpoint(new Vector3()),worldY=center.y/scale+2.29;
            const expected=(front(worldY)-(normal.z>0?0:.21)+.15)*scale;
            close(center.z,expected,'aperture stock obeys actual planar roof breaks',.000002);
          }
          const x=part.bounds.min.x<0?-.545:.745;
          for(const y of [2.60,2.75,2.78]){
            const ray=new Ray(new Vector3(x*scale,(y-2.29)*scale,3),new Vector3(0,0,-1));
            assert.equal(part.triangles.filter(face=>ray.intersectTriangle(face.triangle.a,face.triangle.b,face.triangle.c,false,new Vector3())).length,0,
              'the real optical aperture stays empty through both roof slopes');
          }
        }
      }
    }
    if(id==='t90ms'){
      const source=parts[0].part;
      const plates=emissions.filter(p=>String(p.g.userData.nativeArmorSkinRole).startsWith('t90ms-welded-'));
      assert.equal(plates.length,54,'all native flank, shoulder, lower and roof cassette solids remain');
      assert.equal(plates.filter(p=>p.g.userData.nativeArmorSkinRole.endsWith('roof')).length,5,'five roof plates');
      for(const {g}of plates){
        const plate=shellPart(g),roof=g.userData.nativeArmorSkinRole.endsWith('roof');
        const dir=new Vector3(roof?0:Math.sign(plate.bounds.min.x+plate.bounds.max.x),roof?1:0,0);
        assert.deepEqual(shellEdgeTopology(plate),{boundary:0,nonmanifold:0,inconsistent:0},'closed fitted T90MS cassette');
        assert.equal(properSurfaceCrossings(plate).length,0,'T90MS cassette has no self-crossed faces');
        const gap=point=>{
          const ray=new Ray(point.clone().addScaledVector(dir,4),dir.clone().negate());
          let distance=Infinity;for(const face of source.triangles){const h=ray.intersectTriangle(face.triangle.a,face.triangle.b,face.triangle.c,false,new Vector3());if(h)distance=Math.min(distance,h.distanceTo(ray.origin));}
          return distance-4;
        };
        let backFaces=0;
        for(const face of plate.triangles)if(face.triangle.getNormal(new Vector3()).dot(dir)<-.05){
          backFaces++;const point=face.triangle.getMidpoint(new Vector3()),separation=gap(point);
          assert.ok(separation>=.0009&&separation<=.0043,`T90MS exact carrier gap ${separation}`);
          assert.ok(gap(point.clone().addScaledVector(dir,.05))>.05,'detached cassette seat control fails');
        }
        assert.ok(backFaces>=2,'actual finite back surface tested');
        if(roof)assert.ok(plate.bounds.max.y-plate.bounds.min.y>.052,'roof ERA extrudes upward, never sideways or flat');
      }
    }
    if(id==='sabra_mk2_x'){
      const source=parts.find(p=>p.part.bounds.min.z>.4).part;
      const covers=emissions.filter(p=>p.bucket==='turretExternalArmor'&&p.site.includes('buildSabraTurretArmor ('));
      assert.equal(covers.length,4,'all four Sabra roof covers remain');
      for(const {g}of covers){
        const cover=shellPart(g);assert.deepEqual(shellEdgeTopology(cover),{boundary:0,nonmanifold:0,inconsistent:0},'continuous finite Sabra cover');
        for(const triangle of cover.triangles)if(triangle.triangle.getNormal(new Vector3()).y>.3){
          const point=triangle.triangle.getMidpoint(new Vector3()),ray=new Ray(point.clone().add(new Vector3(0,1,0)),new Vector3(0,-1,0));
          let y=-Infinity;for(const t of source.triangles){const h=ray.intersectTriangle(t.triangle.a,t.triangle.b,t.triangle.c,false,new Vector3());if(h)y=Math.max(y,h.y);}
          close(point.y-y,.012,'cover follows actual native welded face');
        }
      }
    }
  }finally{tank.dispose();}
}
for(const g of [legacy,explicitDefault,welded,loft])g.dispose();
console.log(`welded shell surfaces: ${checked} native HIGH/LOW structural parts, fitted covers, and geometric negative controls passed`);
