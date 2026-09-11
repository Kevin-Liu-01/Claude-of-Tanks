// QA-only identity for a separately reviewed photo assembly. This is an
// invariance check, never a numeric fidelity score derived from a photograph.
const finite = values => {
  if (!values.every(Number.isFinite)) throw new Error('nonfinite supplement geometry');
  return values;
};
const attribute = a => ({itemSize:a.itemSize, normalized:a.normalized,
  values:finite(Array.from({length:a.count*a.itemSize},(_,i)=>a.getComponent(Math.floor(i/a.itemSize),i%a.itemSize)))});
function imageSnapshot(image) {
  if(Array.isArray(image))return image.map(imageSnapshot);
  if(!image)throw new Error('supplement texture has no image');
  const width=image.width,height=image.height;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new Error('supplement texture dimensions unavailable');
  if(image.data)return {width,height,pixels:Array.from(image.data)};
  const canvas=typeof document==='undefined'?null:document.createElement('canvas');
  if(!canvas)throw new Error('supplement texture pixels unavailable');
  canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');
  context.drawImage(image,0,0);return {width,height,pixels:Array.from(context.getImageData(0,0,width,height).data)};
}
function textureSnapshot(texture) {
  return {image:imageSnapshot(texture.image),colorSpace:texture.colorSpace,flipY:texture.flipY,
    wrapS:texture.wrapS,wrapT:texture.wrapT,minFilter:texture.minFilter,magFilter:texture.magFilter,
    offset:texture.offset.toArray(),repeat:texture.repeat.toArray(),center:texture.center.toArray(),rotation:texture.rotation};
}
export function supplementSnapshot(root, declaration) {
  const matches=[];root.traverse(o=>{if(o.name===declaration.group)matches.push(o)});
  if(matches.length!==1)throw new Error('supplement requires exactly one declared group');
  const group=matches[0];
  const parents=[];root.traverse(o=>{if(o.name===declaration.parent)parents.push(o)});
  if(parents.length!==1 || group.parent!==parents[0] || parents[0].parent!==root)
    throw new Error('supplement requires the unique direct articulation rig');
  if(group.parent?.name!==declaration.parent || Object.entries(declaration.metadata).some(([k,v])=>group.userData[k]!==v))
    throw new Error('supplement ownership differs from approved target');
  root.updateMatrixWorld(true);
  const ancestors=[];for(let o=group.parent;o;o=o.parent){if(!o.visible)throw new Error('supplement ancestor hidden');ancestors.push({name:o.name,layers:o.layers.mask,matrix:finite(o.matrix.toArray())});}
  const nodes=[];
  group.traverse(o=>{
    if(!o.visible)throw new Error('reviewed supplement contains hidden stock');
    const row={name:o.name,type:o.type,layers:o.layers.mask,renderOrder:o.renderOrder,frustumCulled:o.frustumCulled,matrix:finite(o.matrixWorld.toArray()),localMatrix:finite(o.matrix.toArray())};
    if(o.geometry){
      const g=o.geometry;
      row.geometry={attributes:Object.fromEntries(Object.keys(g.attributes).sort().map(k=>[k,attribute(g.attributes[k])])),
        index:g.index?attribute(g.index):null,groups:g.groups,drawRange:{start:g.drawRange.start,count:Number.isFinite(g.drawRange.count)?g.drawRange.count:'all'},
        morphAttributes:Object.fromEntries(Object.keys(g.morphAttributes).sort().map(k=>[k,g.morphAttributes[k].map(attribute)]))};
      if(o.isInstancedMesh)row.instances={count:o.count,matrix:attribute(o.instanceMatrix),color:o.instanceColor?attribute(o.instanceColor):null};
      row.materials=(Array.isArray(o.material)?o.material:[o.material]).map(m=>({type:m.type,visible:m.visible,alphaTest:m.alphaTest,colorWrite:m.colorWrite,depthTest:m.depthTest,blending:m.blending,blendSrc:m.blendSrc,blendDst:m.blendDst,blendEquation:m.blendEquation,wireframe:m.wireframe,alphaHash:m.alphaHash,alphaToCoverage:m.alphaToCoverage,color:m.color?.getHex(),emissive:m.emissive?.getHex(),
        metalness:m.metalness,roughness:m.roughness,opacity:m.opacity,transparent:m.transparent,side:m.side,depthWrite:m.depthWrite,
        maps:Object.fromEntries(Object.keys(m).filter(k=>m[k]?.isTexture).sort().map(k=>[k,textureSnapshot(m[k])]))}));
    }
    nodes.push(row);
  });
  if(!nodes.some(o=>o.geometry?.attributes.position?.values.length))throw new Error('supplement has no physical stock');
  return {schemaVersion:1,group:group.name,parent:group.parent.name,ancestors,nodes};
}
export async function supplementDigest(snapshot) {
  const bytes=new TextEncoder().encode(JSON.stringify(snapshot));
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function verifySupplement(root, declaration, receipt) {
  if(receipt?.arrangementAccepted!==true || receipt?.reference!==declaration.reference
    || !/^[a-f0-9]{64}$/.test(receipt?.geometryPoseSha256??''))throw new Error('missing accepted photo supplement receipt');
  const snapshot=supplementSnapshot(root,declaration),digest=await supplementDigest(snapshot);
  if(digest!==receipt.geometryPoseSha256)throw new Error('photo supplement changed; fresh review required');
  return {reference:declaration.reference,group:declaration.group,geometryPoseSha256:digest,
    arrangementAccepted:true,numericPhotoFidelity:null,scope:'Previously reviewed assembly geometry, pose and material invariance; not photo survey dimensions'};
}
