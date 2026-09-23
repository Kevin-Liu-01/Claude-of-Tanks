// Local comparison preparation only. Source triangles never enter gameplay.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const GRIFFIN_PROPORTION_INPUT_SHA='1aef6401c01b5d9a6adfc65838c94d350f4aa39afa039709241c426371ca2003';
const turretMeshes=new Set([3,6,9,11,13,14,15,16,18,19]);
const wheelStations=[-1.9865,-1.4585,-.7285,.0015,.7315,1.4885,2.2185,2.8175];

function read(bytes) {
  assert.equal(bytes.readUInt32LE(0),0x46546c67);
  const jsonSize=bytes.readUInt32LE(12),binOffset=28+jsonSize;
  return {json:JSON.parse(bytes.subarray(20,20+jsonSize)),bin:Buffer.from(bytes.subarray(binOffset))};
}
function accessor(json,bin,id) {
  const a=json.accessors[id],v=json.bufferViews[a.bufferView];
  const count=a.type==='VEC3'?3:1,bytes=a.componentType===5123?2:4;
  const start=(v.byteOffset??0)+(a.byteOffset??0),stride=v.byteStride??count*bytes;
  const method=a.componentType===5126?'readFloatLE':bytes===2?'readUInt16LE':'readUInt32LE';
  return {count:a.count,get:(i,k=0)=>bin[method](start+i*stride+k*bytes),
    set:(i,k,value)=>bin.writeFloatLE(value,start+i*stride+k*bytes)};
}
function parts(position,index) {
  const keys=new Map(),parents=[],vertices=[];
  const find=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
  for(let i=0;i<position.count;i++) {
    const key=[0,1,2].map(k=>Math.round(position.get(i,k)*1e5)).join(',');
    if(!keys.has(key)){keys.set(key,parents.length);parents.push(parents.length);}
    vertices.push(keys.get(key));
  }
  for(let i=0;i<index.count;i+=3) {
    const a=find(vertices[index.get(i)]);
    for(const j of [1,2])parents[find(vertices[index.get(i+j)])]=a;
  }
  const result=new Map();
  for(let i=0;i<position.count;i++) {
    const id=find(vertices[i]);
    if(!result.has(id))result.set(id,[]);
    result.get(id).push(i);
  }
  return [...result.values()];
}
function encode(json,bin) {
  const text=Buffer.from(JSON.stringify(json)),padding=Buffer.alloc((4-text.length%4)%4,32);
  const jsonBytes=Buffer.concat([text,padding]),header=Buffer.alloc(20),tail=Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);
  header.writeUInt32LE(28+jsonBytes.length+bin.length,8);
  header.writeUInt32LE(jsonBytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
  tail.writeUInt32LE(bin.length);tail.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,jsonBytes,tail,bin]);
}

/** Exact owner-prescribed +10% hull Z / -10% turret, without candidate input. */
function resizeGriffinReference(bytes) {
  assert.equal(hash(bytes),GRIFFIN_PROPORTION_INPUT_SHA,'complete approved assembled source');
  const {json,bin}=read(bytes),report=[],used=new Set();
  for(const node of json.nodes.filter(n=>n.mesh!==undefined)) {
    assert(!node.matrix&&!node.translation&&!node.rotation&&!node.scale,'source already in world metres');
    const number=Number(node.name.slice(7));
    assert(number>=2&&number<=26,'known source owner');
    for(const primitive of json.meshes[node.mesh].primitives) {
      const id=primitive.attributes.POSITION;
      assert(!used.has(id),'position buffer has one physical owner');used.add(id);
      const p=accessor(json,bin,id),normal=accessor(json,bin,primitive.attributes.NORMAL);
      const groups=number===24||number===22||number===23
        ?parts(p,accessor(json,bin,primitive.indices)):[Array.from({length:p.count},(_,i)=>i)];
      const counts={hull:0,turret:0,wheel:0};
      for(const group of groups) {
        const min=[0,1,2].map(k=>Math.min(...group.map(i=>p.get(i,k))));
        const max=[0,1,2].map(k=>Math.max(...group.map(i=>p.get(i,k))));
        let owner=turretMeshes.has(number)?'turret':'hull';
        if(number===24) {
          assert(max[1]<2.19||min[1]>2.16,'mixed fitting needs an explicit owner');
          owner=min[1]>2.16?'turret':'hull';
        }
        if(number===22||number===23)owner='wheel';
        const zCenter=(min[2]+max[2])/2;
        const axle=wheelStations.reduce((best,z)=>Math.abs(z-zCenter)<Math.abs(best-zCenter)?z:best);
        for(const i of group) {
          const x=p.get(i,0),y=p.get(i,1),z=p.get(i,2);
          if(owner==='turret') {p.set(i,0,x*.9);p.set(i,1,2.07+(y-2.07)*.9);p.set(i,2,-.396+(z+.36)*.9);}
          else p.set(i,2,owner==='wheel'?z+axle*.1:z*1.1);
          if(owner==='hull') {
            const nx=normal.get(i,0),ny=normal.get(i,1),nz=normal.get(i,2)/1.1,length=Math.hypot(nx,ny,nz)||1;
            [nx,ny,nz].forEach((v,k)=>normal.set(i,k,v/length));
          }
        }
        counts[owner]+=group.length;
      }
      json.accessors[id].min=[0,1,2].map(k=>{let v=Infinity;for(let i=0;i<p.count;i++)v=Math.min(v,p.get(i,k));return v;});
      json.accessors[id].max=[0,1,2].map(k=>{let v=-Infinity;for(let i=0;i<p.count;i++)v=Math.max(v,p.get(i,k));return v;});
      report.push({mesh:node.name,vertices:p.count,owners:counts});
    }
  }
  assert.equal(report.length,25,'all original meshes retained');
  const output=encode(json,bin);
  return {bytes:output,receipt:{inputSha256:hash(bytes),outputSha256:hash(output),
    hullLengthScale:1.1,turretScale:.9,removedTriangles:0,candidateGeometryUsed:false,meshes:report}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const result=resizeGriffinReference(fs.readFileSync('public/models/community-candidates/griffin50_x_assembled_20260918.glb'));
  fs.writeFileSync('public/models/community-candidates/griffin50_x_proportions_20260921.glb',result.bytes);
  fs.writeFileSync('docs/history/research/griffin-proportions-20260921.receipt.json',JSON.stringify(result.receipt,null,2)+'\n');
  console.log(JSON.stringify(result.receipt,null,2));
}
