// Diagnostic only: call outside timed sampling windows. Equal bytes shortlist
// candidates; mutable state and disposal ownership still require code review.
export function resourceOwnershipInventory() {
  const D=window.__DEBUG, owners=new WeakMap(), geometries=new Map(), materials=new Map(), objects=[];
  const mark=(root,owner)=>root?.traverse(o=>owners.set(o,owner));
  for(const child of D.world?.group?.children||[])mark(child,`world/${child.name||child.type}`);
  mark(D.fx?.group,'effects');mark(D.garageDressing?.group,'garage/workshop');
  for(const [i,entity] of (D.game?.tanks||[]).entries())mark(entity.visual?.root,`vehicle/${i}/${entity.specId}`);
  const bytesEqual=(a,b)=>a.byteLength===b.byteLength&&a.every((v,i)=>v===b[i]);
  const hash=bytes=>{let n=2166136261;for(const b of bytes)n=Math.imul(n^b,16777619);return n>>>0;};
  const layouts=new Map();
  D.scene.traverse(o=>{
    const owner=owners.get(o)||'scene';
    let visible=true;for(let p=o;p;p=p.parent)if(!p.visible){visible=false;break;}
    const mats=(Array.isArray(o.material)?o.material:o.material?[o.material]:[]);
    objects.push({name:o.name,type:o.type,owner,parent:o.parent?.name,visible,children:o.children.length,
      geometry:o.geometry?.id,materials:mats.map(m=>m.id),instances:o.isInstancedMesh?o.count:null});
    for(const m of mats)if(!materials.has(m.id))materials.set(m.id,{id:m.id,name:m.name,type:m.type,
      color:m.color?.getHex(),opacity:m.opacity,transparent:m.transparent,side:m.side,
      textures:Object.fromEntries(Object.entries(m).filter(([,v])=>v?.isTexture).map(([k,v])=>[k,v.id])),
      userDataKeys:Object.keys(m.userData),customHook:m.onBeforeCompile.toString()});
    const g=o.geometry;if(!g||geometries.has(g.id))return;
    const arrays=[],attrs={};let mutable=false;
    for(const [name,a] of [...Object.entries(g.attributes),...(g.index?[['index',g.index]]:[])]){
      if(a.isInterleavedBufferAttribute){mutable=true;continue;}
      const bytes=new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength);
      arrays.push(bytes);attrs[name]={size:a.itemSize,count:a.count,normalized:a.normalized,
        type:a.array.constructor.name,usage:a.usage,hash:hash(bytes)};
      mutable ||= a.usage!==35044;
    }
    const layout=JSON.stringify({attrs,groups:g.groups,drawRange:g.drawRange});
    const candidates=layouts.get(layout)||[];
    const equal=candidates.find(prior=>prior.arrays.length===arrays.length&&arrays.every((a,i)=>bytesEqual(a,prior.arrays[i])));
    const entry={id:g.id,name:g.name,owner,firstMesh:o.name,attrs,mutable,
      userDataKeys:Object.keys(g.userData),equalBytesTo:equal?.id??null};
    if(!equal){candidates.push({id:g.id,arrays});layouts.set(layout,candidates);}
    geometries.set(g.id,entry);
  });
  return {scope:'attached scene; detached caches excluded',objects,geometries:[...geometries.values()],materials:[...materials.values()]};
}
