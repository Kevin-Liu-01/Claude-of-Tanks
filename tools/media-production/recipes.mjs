import { resolveSeaOpenings, seaSectorWeightAt, seaSectorBlend, SEA_APRON_OUTER_RADIUS_M } from '../../src/world/edgeWater.ts';

/** Sun bearings against a camera (degrees added to the camera's bearing): `map` keeps the battlefield's own sun. */
const SUN_OFFSETS = Object.freeze({ back: 0, rim: 32, side: 90, front: 180 });
export const MAP_SUN_MODES = Object.freeze(['map', ...Object.keys(SUN_OFFSETS)]);

/**
 * The Studio `light` block that puts the sun at a bearing relative to a camera (the sky preset convention: 0 = +Z,
 * 90 = +X). `back` faces the camera into the sun (backlit subjects, bright rims), `rim` keeps the sun just off the
 * axis, `side` crosses the frame, `front` puts the sun behind the camera. `map` returns null (the authored sun).
 */
export function sunForCamera(camera, mode = 'map') {
  if (!MAP_SUN_MODES.includes(mode)) throw new RangeError(`Unknown sun mode: ${mode}`);
  if (mode === 'map') return null;
  const bearing = Math.atan2(camera.lookAt[0] - camera.pos[0], camera.lookAt[2] - camera.pos[2]) * 180 / Math.PI;
  return { sunAzimuthDeg: Math.round((((bearing + SUN_OFFSETS[mode]) % 360) + 360) % 360 * 100) / 100 };
}

/** Capture plans use the live authored world. Saved absolute cameras are the review/reproduction contract. */
export function mapScene(world, timeOfDay = 'day', sun = 'map') {
  // Saltwind's old inland-facing overview cropped its defining bay out of the
  // picture. Look seaward from the village ridge for public map artwork.
  const { pos, look } = world.mapId === 'saltwind'
    ? { pos: [120, 170, 280], look: [-260, 2, -15] }
    : world.config.shot;
  const seat = ([x, y, z]) => [x, world.heightField.getHeightAt(x, z) + y, z];
  const camera = { pos: seat([pos[0],pos[1]+24,pos[2]]), lookAt: seat(look), fov: 55 };
  const light = sunForCamera(camera, sun);
  return { map: world.mapId, timeOfDay, ...(light ? { light } : {}), seed: 5000, actors: [], effects: [], fxTime: 2000, timeScale: 0,
    camera };
}

/** Read the rendered ring, whose distant ridges differ from the playable height field. */
function surveyHeight(world) {
  const hf = world.heightField, half = hf.size / 2;
  let ring;
  world.group?.traverse(object => { if (object.userData.horizonRing) ring = object; });
  const p = ring?.geometry.attributes.position, columns = ring?.userData.horizonRing.columns;
  const rows = p ? p.count / (columns + 1) : 0;
  return (x, z) => {
    if (Math.max(Math.abs(x), Math.abs(z)) <= half) return hf.getHeightAt(x,z);
    if (p) {
      const sector = ((Math.atan2(z,x) / (2*Math.PI) + 1) % 1) * columns;
      const column = Math.floor(sector), mix = sector - column, radius = Math.hypot(x,z);
      const value = (row, height) => {
        const a = row * (columns+1) + column, b = a + 1;
        const va = height ? p.getY(a) : Math.hypot(p.getX(a),p.getZ(a));
        const vb = height ? p.getY(b) : Math.hypot(p.getX(b),p.getZ(b));
        return va + (vb-va)*mix;
      };
      if (radius >= value(0,false) && radius <= value(rows-1,false)) {
        let lo=0, hi=rows-1;
        while(hi-lo>1) {const mid=(lo+hi)>>1;if(value(mid,false)<radius)lo=mid;else hi=mid;}
        const t=(radius-value(lo,false))/(value(hi,false)-value(lo,false));
        return value(lo,true)+(value(hi,true)-value(lo,true))*t;
      }
    }
    return hf.getOutlandHeightAt?.(x,z) ?? hf.getHeightAt(Math.max(-half,Math.min(half,x)),Math.max(-half,Math.min(half,z)));
  };
}

/** Paired driving-height and raised views around all four edges and corners.
 * Whole-landscape views expose simplified water footprints and distant gaps
 * that a close, downward-facing shoreline survey cannot reveal. */
export function landscapeSurvey(world) {
  const height = surveyHeight(world), views = [];
  for (let station = 0; station < 8; station++) {
    const angle = station * Math.PI / 4, x = Math.cos(angle), z = Math.sin(angle);
    const rim = 512 / Math.max(Math.abs(x), Math.abs(z));
    const px = x * (rim - 34), pz = z * (rim - 34);
    const tx = x * (rim + 170) - z * 80, tz = z * (rim + 170) + x * 80;
    for (const [label, lift] of [['drive', 5], ['raised', 72]]) {
      views.push({id:`edge-${station}-${label}`,camera:{pos:[px,height(px,pz)+lift,pz],
        lookAt:[tx,height(tx,tz)+3,tz],fov:65}});
    }
  }
  for (const [id,pos,lookAt] of [
    ['whole-north',[0,680,-650],[0,0,280]], ['whole-south',[0,680,650],[0,0,-280]],
  ]) views.push({id,camera:{pos,lookAt,fov:70}});
  return {stations:8,views};
}

/** Cover every sampled waterline, including the continued contours beyond the battle boundary.
 * The receipt distinguishes sample coverage from visual acceptance; it never calls a screenshot a pass. */
export function shorelineSurvey(world, { gridM = 8, radiusM = 68 } = {}) {
  const hf = world.heightField, half = hf.size / 2;
  let extent = half;
  if (!world.config.splat?.seaLake || hf._layout?.terrain.frozenMarshes) return {gridM,radiusM,extentM:extent,samples:0,maxUncoveredM:0,views:[]};
  const openings = world.config.splat?.seaLake ? resolveSeaOpenings(world.config.horizon?.seaOpening, hf, world.mapId) : [];
  if (openings.length) extent = SEA_APRON_OUTER_RADIUS_M - 48;
  const ramp = world.config.splat?.seaRamp ?? [.4,.78];
  const smooth = (a,b,x) => { const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t); };
  const outside = (x, z) => Math.max(Math.abs(x), Math.abs(z)) > half;
  const wet = (x, z) => {
    if (!outside(x,z)) return hf.getWaterMaskAt(x,z);
    if (!openings.length) return 0;
    const coast=hf.getOutlandWaterAt?.(x,z)?.wetness??0;
    let sector=0;
    const distance=Math.max(Math.abs(x),Math.abs(z))-half;
    for(const opening of openings) sector=Math.max(sector,seaSectorWeightAt(x,z,opening,half)*smooth(...seaSectorBlend(opening.coastReachM,opening.bankProfile),distance));
    return smooth(...ramp,coast+sector-coast*sector);
  };
  const height = surveyHeight(world);
  const points = [];
  for (let z = -extent; z <= extent; z += gridM) for (let x = -extent; x <= extent; x += gridM) {
    if (Math.hypot(x,z) > extent-gridM) continue;
    const w = wet(x,z) - .2;
    for (const [dx,dz] of [[gridM,0],[0,gridM]]) {
      const next = wet(x+dx,z+dz) - .2;
      if ((w >= 0) === (next >= 0)) continue;
      // Exclude false contour at the map border where outland water is not authored.
      if (outside(x,z) !== outside(x+dx,z+dz) && !hf.getOutlandWaterAt?.(x+dx,z+dz)) continue;
      const t = w/(w-next);
      points.push([x+dx*t,z+dz*t]);
    }
  }
  const views = [];
  for (const [x,z] of points) {
    if (views.some(view => Math.hypot(view.target[0]-x, view.target[2]-z) <= radiusM)) continue;
    let nx = wet(x-4,z)-wet(x+4,z), nz = wet(x,z-4)-wet(x,z+4);
    const n = Math.hypot(nx,nz);
    if (n > .001) { nx /= n; nz /= n; } else { nx = .707; nz = .707; }
    const y = height(x,z), cx = x + nx*70, cz = z + nz*70;
    // A raised bank camera shows a ~170 m patch and its approach; sampled 68 m discs overlap.
    let cy = Math.max(y+64,height(cx,cz)+38);
    for (let k=1;k<10;k++) {
      const t=k/10, h=height(cx+(x-cx)*t,cz+(z-cz)*t);
      cy=Math.max(cy,(h+8-y*t)/(1-t));
    }
    views.push({id:`shore-${String(views.length+1).padStart(3,'0')}`,kind:outside(x,z)?'extension':'shore',
      camera:{pos:[cx,cy,cz],lookAt:[x,y+.4,z],fov:72},target:[x,y,z]});
  }
  const maxUncoveredM = points.reduce((max,[x,z]) => Math.max(max,
    Math.min(...views.map(view=>Math.hypot(view.target[0]-x,view.target[2]-z)))),0);
  // Wide views cover the final sea apron and its handoff to the distant haze.
  for(const [index,opening] of openings.entries()) {
    const a=(90-opening.azimuthDeg)*Math.PI/180,dx=Math.cos(a),dz=Math.sin(a);
    const edge=half/Math.max(Math.abs(dx),Math.abs(dz));
    const x=dx*(edge-60),z=dz*(edge-60),y=height(x,z)+160;
    views.push({id:`mouth-${index+1}`,kind:'sea-mouth',camera:{pos:[x,y,z],lookAt:[dx*1050,opening.level,dz*1050],fov:85},target:[dx*1050,opening.level,dz*1050]});
  }
  return {gridM,radiusM,extentM:extent,samples:points.length,maxUncoveredM,views};
}

export function waterScene(timeOfDay = 'sunset') {
  return {map:'reservoir',timeOfDay,seed:5000,actors:[{id:'t90m_x',name:'lead',pos:[92,-26],facingDeg:90}],
    effects:[],fxTime:0,timeScale:0,storyboard:{durationMs:6000,
      shots:[{id:'start',tMs:0,pos:[103,-.5,-13],lookAt:[92,-5.8,-26],fov:48,transition:'linear'},
        {id:'end',tMs:6000,pos:[139,0,-13],lookAt:[128,-5.8,-26],fov:45}],
      actorTracks:[{actor:'lead',keys:[{id:'a',tMs:0,pos:[92,-26],facingDeg:90,transition:'drive'},
        {id:'b',tMs:6000,pos:[128,-26],facingDeg:90}]}]}};
}

/** Reframe the actual 3D camera for each aspect ratio; never crop a barrel off a landscape master. */
export function frameScene(scene, format) {
  const result=structuredClone(scene), scale=format==='portrait'?2:format==='square'?1.25:1;
  const camera=shot=>{if(shot?.pos&&shot.lookAt)shot.pos=shot.pos.map((v,i)=>shot.lookAt[i]+(v-shot.lookAt[i])*scale);};
  camera(result.camera);for(const shot of result.storyboard?.shots??[])camera(shot);
  return result;
}

/** Reciprocal street-level views plus an oblique plan expose frontage,
 * road access and settlement grouping without hiding them behind HUD/tanks. */
export function settlementSurvey(world) {
  const v = world.heightField._layout.village;
  const x = v.cx, z = v.cz, h = (x,z) => world.heightField.getHeightAt(x,z);
  const radius = Math.max(80,Math.min(180,Math.max(v.x1-v.x0,v.z1-v.z0)*.6));
  return [
    {id:'village-plan',camera:{pos:[x+radius,h(x,z)+radius*.85,z+radius],lookAt:[x,h(x,z)+2,z],fov:58}},
    {id:'street-north',camera:{pos:[x-radius*.7,h(x-radius*.7,z-radius*.5)+12,z-radius*.5],lookAt:[x,h(x,z)+4,z],fov:60}},
    {id:'street-south',camera:{pos:[x+radius*.7,h(x+radius*.7,z+radius*.5)+12,z+radius*.5],lookAt:[x,h(x,z)+4,z],fov:60}},
  ];
}
