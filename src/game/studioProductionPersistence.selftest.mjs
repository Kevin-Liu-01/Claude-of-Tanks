import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import { Vector3 } from 'three';
import { normalizeStudioFx, studioFxState } from './studioFxSettings.ts';
import { createProductionScene, productionPreset, productionAspect, reframeProductionPoint, reframeProductionFov } from './studioProduction.ts';
import { normalizeFilm } from './studioFilmPlan.ts';
import { NEUTRAL_PICTURE, pictureStateJson, resolvePicture } from './studioPicture.ts';
import { isStudioTime, normalizeStudioLight, studioTimeFor } from './studioLight.ts';
// 2026-10-13 (SSOT 2.19 ID.03): load() reads a scene's tank id schema and stateJson()/directProduction() stamp
// theirs; the sandbox gets the same two names the module imports.
import { sceneInCurrentTankIds } from './tankIdBoundaries.ts';
import { TANK_IDS } from '../vehicles/tankIdAliases.ts';
import { createStudioSession, studioBusy } from './studioSession.ts';

// Execute the real serialization, loading and reframing callers, retaining
// authored camera positions. A recipe-only round trip misses private format state.
const source = ts.createSourceFile('studio.ts', readFileSync(new URL('./studio.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
// (2026-11-03 audit F9) and the one busy reading the production entry points ask
const names = new Set(['stateJson', 'actorStateJson', 'pictureStateEntry', 'load', 'setProductionFormat', 'directProduction', 'busy',
  'busyFlags', 'productionBusy']); // (round 2) busy() ranks the flags busyFlags() reads
const functions = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) functions.push(node.getText(source));
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(functions.length, names.size);
const create = new Function('ports', `
  const {createProductionScene, productionPreset, productionAspect, reframeProductionPoint, reframeProductionFov,
    NEUTRAL_PICTURE, pictureStateJson, resolvePicture, normalizeFilm, sceneInCurrentTankIds, TANK_IDS, session, studioBusy} = ports;
  session.open(session.beginEntry()); // an open Studio: the build checks its session after every await
  const t=key=>key;
  let picture=NEUTRAL_PICTURE, pictureApplied=0;
  const applyPictureRuntime=()=>{pictureApplied++;};
  let sceneFilm=null, filmExport=null; const filmRenderer={active:false}, getFilm=()=>sceneFilm;
  let productionFormat='landscape', productionLoading=false, productionOwnsLoad=false, loading=false, recording=false;
  let filming=false, mapChange=null, restoringHistory=false, lightChanges=0;
  let storyboard={shots:[],durationMs:8000}, clockMs=0, timeScale=0, timeOfDay='day', selectedShotId=null;
  let camera={pos:[0,4,-10],lookAt:[0,1.7,0],fov:40,rollDeg:0}, map='verdant', replacements=0, refreshed=[];
  const actors=[], effectLog=[], sceneMeta={seed:5000};
  const {isStudioTime, normalizeStudioLight, studioTimeFor} = ports;
  let studioLight=null;
  // an open world: directProduction's sight test (its module scratch vectors) finds every rig clear
  const hfProxy={getHeightAt:()=>0}, getWorld=()=>({mapId:map,raycast:()=>null});
  const _v1=new ports.Vector3(), _v2=new ports.Vector3(), _v3=new ports.Vector3();
  const getCamera=()=>structuredClone(camera), getStoryboard=()=>structuredClone(storyboard);
  const applyCamera=next=>{camera={...camera,...structuredClone(next)};};
  const setStoryboard=next=>{storyboard=structuredClone(next);};
  const pauseTimeline=()=>{}, invalidate=()=>{}, r2=v=>v;
  const panel={refreshAll:()=>refreshed.push(productionFormat)};
  let mapGate=null;
  const setMap=async id=>{if(mapGate)await mapGate;map=id;}, ensureLoadMap=async json=>{await setMap(json.map||'verdant'); return session.token();};
  const setTimeOfDay=async time=>{timeOfDay=time;};
  const replaceLoadActors=async()=>{replacements++;};
  const loadedStoryboard=json=>structuredClone(json.storyboard||{shots:[],durationMs:8000});
  const bindStoryboardTracks=()=>{}, rail={rebuild(){}};
  const createFrameBudgetYielder=()=>async()=>{};
  const clampStudioTime=time=>time, replaceLoadEffects=()=>{};
  const restoreLoadedPresentation=(json,ms)=>{clockMs=ms;timeScale=json.timeScale||0;panel.refreshAll();};
  const normalizeStudioFx=ports.normalizeStudioFx, studioFxState=ports.studioFxState;
  let fxSettings=normalizeStudioFx(null);
  const applyFxSettings=next=>{fxSettings=next;};
  const selectActor=()=>{},setRailVisible=()=>{};
  const post={};
  ${stripTypeScriptTypes(functions.join('\n'))}
  return {load,stateJson,setProductionFormat,directProduction,stats:()=>({replacements,format:productionFormat,refreshed,pictureApplied}),
    setFilming:(value)=>{filming=value;}, setLightChanges:(value)=>{lightChanges=value;},
    holdMap:()=>{let release;mapGate=new Promise((resolve)=>{release=resolve;});return ()=>{mapGate=null;release();};}};
`);
const runtime = create({ createProductionScene, productionPreset, productionAspect, reframeProductionPoint, reframeProductionFov,
  NEUTRAL_PICTURE, pictureStateJson, resolvePicture, normalizeFilm, isStudioTime, normalizeStudioLight, studioTimeFor,
  normalizeStudioFx, studioFxState, sceneInCurrentTankIds, TANK_IDS, Vector3, session: createStudioSession(), studioBusy });
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
const cine = { ...before, fx: { quality: 'cinematic' } };
await runtime.load(cine);
const cineState = JSON.parse(JSON.stringify(runtime.stateJson()));
assert.deepEqual(cineState.fx, { quality: 'cinematic' }, 'state() writes the non-default fx block (track dust implied)');
await runtime.load({ ...cineState, fx: { quality: 'cinematic', trackDust: false } });
assert.deepEqual(runtime.stateJson().fx, { quality: 'cinematic', trackDust: false }, 'an explicit override survives the round trip');
await runtime.load(cineState);
assert.deepEqual(runtime.stateJson(), cineState, 'load(state()) is identity with an fx block');
await runtime.load(before);
assert.equal('fx' in runtime.stateJson(), false, 'a scene without fx reloads the battle look and the earlier state shape');
const legacy = {...before}; delete legacy.productionFormat;
await runtime.load(legacy);
assert.equal(runtime.stateJson().productionFormat, 'landscape', 'old scenes have a stable format default');
assert.deepEqual(runtime.stateJson().storyboard, legacy.storyboard, 'legacy load never transforms existing camera keys');
assert.equal('picture' in runtime.stateJson(), false, 'scenes without a picture keep the earlier state shape');
const graded = { ...legacy, picture: { preset: 'cinematic', letterbox: '2.39', dof: { enabled: true, focusActor: 'hero', fStop: 2 } } };
await runtime.load(graded);
const gradedState = JSON.parse(JSON.stringify(runtime.stateJson()));
assert.deepEqual(gradedState.picture, graded.picture, 'state() writes the look plus its minimal overrides');
await runtime.load(gradedState);
assert.deepEqual(runtime.stateJson(), gradedState, 'load(state()) is identity with a picture');
const beforeBad = runtime.stateJson(), applied = runtime.stats().pictureApplied, replaced = runtime.stats().replacements;
await assert.rejects(runtime.load({ ...gradedState, picture: { preset: 'kodachrome' } }), /Unknown picture preset/);
assert.deepEqual(runtime.stateJson(), beforeBad);
assert.equal(runtime.stats().replacements, replaced, 'an invalid picture fails before replacing actors');
assert.equal(runtime.stats().pictureApplied, applied);
await runtime.load(legacy);
assert.equal('picture' in runtime.stateJson(), false, 'loading a scene without a picture resets it to neutral');
// (2026-11-02 audit F9) a staging sequence holds the scene through its battlefield change: a take or a JSON file loaded
// meanwhile is refused, not raced (the last to finish won, and the panel could name the loser as staged)
{
  const releaseMap = runtime.holdMap();
  const staging = runtime.directProduction({ presetId: 'desert-crossfire', format: 'landscape' });
  await Promise.resolve();
  const replacedBefore = runtime.stats().replacements;
  const raced = runtime.load(legacy).then(() => 'loaded', (error) => error.message);
  const answer = await Promise.race([raced, new Promise((resolve) => { setImmediate(() => resolve('waiting on the staging')); })]);
  assert.match(answer, /studio\.error\.loadInFlight/, 'a load during a staging is refused at once');
  assert.equal(runtime.stats().replacements, replacedBefore, 'and replaces nothing');
  releaseMap();
  const staged = await staging;
  assert.equal(staged.productionFormat, 'landscape', 'the staging finishes as its own scene');
  await runtime.load(legacy);
}
// (2026-11-03 audit F9) the production entry points ask the one busy reading: a reframe under an open film or beside a
// light change is ignored (the film renders the framing it opened with), and a staging is refused before it stages
{
  const framed = runtime.stateJson(), replacedBefore = runtime.stats().replacements;
  runtime.setFilming(true);
  runtime.setProductionFormat(framed.productionFormat === 'landscape' ? 'portrait' : 'landscape');
  assert.deepEqual(runtime.stateJson(), framed, 'no reframe under an open film');
  await assert.rejects(runtime.directProduction({ presetId: 'desert-crossfire', format: 'landscape' }), /studio\.error\.finishFilm/,
    'a staging under an open film is refused');
  runtime.setFilming(false);
  runtime.setLightChanges(1);
  runtime.setProductionFormat(framed.productionFormat === 'landscape' ? 'portrait' : 'landscape');
  assert.deepEqual(runtime.stateJson(), framed, 'no reframe beside a light change');
  await assert.rejects(runtime.directProduction({ presetId: 'desert-crossfire', format: 'landscape' }), /studio\.error\.busy/);
  runtime.setLightChanges(0);
  assert.equal(runtime.stats().replacements, replacedBefore, 'and nothing was replaced');
}
console.log('studioProductionPersistence: real save/load/direct/preset format round trips, legacy defaults, UI refresh, picture round trip, invalid-input isolation and the busy refusals pass');
