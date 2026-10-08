import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import { createProductionScene, productionPreset, productionAspect, reframeProductionPoint, reframeProductionFov } from './studioProduction.ts';

// Execute the real serialization, loading and reframing callers, retaining
// authored camera positions. A recipe-only round trip misses private format state.
const source = ts.createSourceFile('studio.ts', readFileSync(new URL('./studio.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const names = new Set(['stateJson', 'load', 'setProductionFormat', 'directProduction']);
const functions = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) functions.push(node.getText(source));
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(functions.length, names.size);
const create = new Function('ports', `
  const {createProductionScene, productionPreset, productionAspect, reframeProductionPoint, reframeProductionFov} = ports;
  let productionFormat='landscape', productionLoading=false, loading=false, recording=false;
  let storyboard={shots:[],durationMs:8000}, clockMs=0, timeScale=0, timeOfDay='day', selectedShotId=null;
  let camera={pos:[0,4,-10],lookAt:[0,1.7,0],fov:40,rollDeg:0}, map='verdant', replacements=0, refreshed=[];
  const actors=[], effectLog=[], sceneMeta={seed:5000}, BATTLE_TIMES=['day','sunset','night'];
  const hfProxy={getHeightAt:()=>0}, getWorld=()=>({mapId:map});
  const getCamera=()=>structuredClone(camera), getStoryboard=()=>structuredClone(storyboard);
  const applyCamera=next=>{camera={...camera,...structuredClone(next)};};
  const setStoryboard=next=>{storyboard=structuredClone(next);};
  const pauseTimeline=()=>{}, invalidate=()=>{}, r2=v=>v;
  const panel={refreshAll:()=>refreshed.push(productionFormat)};
  const setMap=async id=>{map=id;}, ensureLoadMap=async json=>setMap(json.map||'verdant');
  const setTimeOfDay=async time=>{timeOfDay=time;};
  const replaceLoadActors=async()=>{replacements++;};
  const loadedStoryboard=json=>structuredClone(json.storyboard||{shots:[],durationMs:8000});
  const bindStoryboardTracks=()=>{}, rail={rebuild(){}};
  const createFrameBudgetYielder=()=>async()=>{};
  const clampStudioTime=time=>time, replaceLoadEffects=()=>{};
  const restoreLoadedPresentation=(json,ms)=>{clockMs=ms;timeScale=json.timeScale||0;panel.refreshAll();};
  const selectActor=()=>{},setRailVisible=()=>{};
  const post={};
  ${stripTypeScriptTypes(functions.join('\n'))}
  return {load,stateJson,setProductionFormat,directProduction,stats:()=>({replacements,format:productionFormat,refreshed})};
`);
const runtime = create({ createProductionScene, productionPreset, productionAspect, reframeProductionPoint, reframeProductionFov });
for (const format of ['portrait', 'square', 'landscape']) {
  const recipe = createProductionScene({ presetId:'steel-pursuit', format }, () => 0);
  assert.equal(recipe.productionFormat, format, 'CLI recipes carry their actual framing');
  await runtime.load(recipe);
  const saved = JSON.parse(JSON.stringify(runtime.stateJson()));
  assert.equal(saved.productionFormat, format);
  runtime.setProductionFormat(format === 'landscape' ? 'portrait' : 'landscape');
  await runtime.load(saved);
  assert.deepEqual(runtime.stateJson(), saved, 'loading restores framing without applying another dolly or lens conversion');
  runtime.setProductionFormat(format);
  assert.deepEqual(runtime.stateJson(), saved, 'reselecting the restored format is a no-op');
  assert.equal(runtime.stats().refreshed.at(-1), format, 'UI refresh observes restored format');
}
const direct = await runtime.directProduction({ presetId:'desert-crossfire', format:'portrait' });
assert.equal(direct.productionFormat, 'portrait', 'directed sequence returns its format in the saved state');
const before = runtime.stateJson(), replacements = runtime.stats().replacements;
await assert.rejects(runtime.load({...before,productionFormat:'invalid'}), /format/);
assert.deepEqual(runtime.stateJson(), before);
assert.equal(runtime.stats().replacements, replacements, 'invalid formats fail before replacing actors');
const legacy = {...before}; delete legacy.productionFormat;
await runtime.load(legacy);
assert.equal(runtime.stateJson().productionFormat, 'landscape', 'old scenes have a stable format default');
assert.deepEqual(runtime.stateJson().storyboard, legacy.storyboard, 'legacy load never transforms existing camera keys');
console.log('studioProductionPersistence: real save/load/direct/preset format round trips, legacy defaults, UI refresh and invalid-input isolation pass');
