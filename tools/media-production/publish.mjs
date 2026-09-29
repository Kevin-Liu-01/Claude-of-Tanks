#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { requireReview, sourceDigest, digest } from './pipeline.mjs';
import { requireNative4kPng } from '../map-art-guards.mjs';
import { mergePublication } from './mergePublication.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(value=>{
  const match=/^--(receipt|review)=(.+)$/.exec(value);
  if(!match)throw Error('npm run media:publish -- --receipt=shots/production-current/all-receipt.json --review=shots/production-current/review.json');
  return [match[1],match[2]];
}));
const receipt=JSON.parse(readFileSync(resolve(args.receipt??'shots/production-current/all-receipt.json'),'utf8'));
const review=JSON.parse(readFileSync(resolve(args.review??'shots/production-current/review.json'),'utf8'));
requireReview(receipt,review);
if(sourceDigest()!==receipt.sourceDigest)throw Error('Rendering sources changed since this batch; recapture before publishing');
const mapStills=receipt.maps.flatMap(row=>row.stills.filter(file=>file.timeOfDay==='day').map(file=>({map:row.map,file})));
if(!mapStills.length)throw Error('No day map masters in this batch');
for(const {file} of mapStills)requireNative4kPng(file.path);
// Finish every derivative in a private staging directory before replacing any public assets.
const stage=mkdtempSync(join(tmpdir(),'cot-media-publish-'));
const paths=[];
const target=path=>{const file=join(stage,path);mkdirSync(dirname(file),{recursive:true});paths.push(path);return file;};
const webp=(file,path,w,h)=>execFileSync('cwebp',['-quiet','-m','6','-sharp_yuv','-q','88','-resize',String(w),String(h),file,'-o',target(path)]);
const prefix='/media/production-r1';
const manifest={version:1,created:new Date().toISOString(),sourceDigest:receipt.sourceDigest,revision:receipt.revision,shots:[],films:[],media:{},recipes:{},assets:[],review:{reviewedAt:review.reviewedAt,notes:review.notes,maps:review.maps}};
function recipe(id,scene,uris){manifest.recipes[id]=scene;for(const uri of uris)manifest.media[uri]=id;}
try{
  for(const {map,file} of mapStills){
    const full=`/maps/${map}.webp`,card=`/maps/cards/${map}.webp`,thumb=`/maps/thumbs/${map}.webp`;
    webp(file.path,full.slice(1),3840,2160);webp(file.path,card.slice(1),1280,720);webp(file.path,thumb.slice(1),512,288);
    manifest.shots.push({src:full,previewSrc:card,alt:`${map.replaceAll('_',' ')} battlefield overview`,title:map.replaceAll('_',' '),map,feature:'world system',kind:'battlefield',effects:['daylight'],sequence:manifest.shots.length+1});
    recipe(`production-map-${map}`,file.scene,[full,card,thumb]);
  }
  for(const row of receipt.maps){
    for(const file of row.posters??[]){
      const stem=`${row.map}-${file.timeOfDay}-${file.format}`,folder=file.branded?'promo':'posters';
      const uri=`${prefix}/${folder}/${stem}.webp`;
      webp(file.path,uri.slice(1),file.width,file.height);
      if(!file.branded){
        const scene={...file.scene,fxTime:file.frame/(receipt.config.fps??30)*1000};
        recipe(`production-${stem}`,scene,[uri]);
        if(file.format==='landscape'){
          const jpg=`${prefix}/${row.map}-${file.timeOfDay}.jpg`;
          execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',file.path,'-q:v','2',target(jpg.slice(1))]);
          manifest.shots.push({src:uri,alt:`A tank crossing water at ${file.timeOfDay}`,title:`Water in motion · ${file.timeOfDay}`,map:row.map,feature:'battlefield atmosphere',kind:'studio',effects:[file.timeOfDay,'water'],sequence:manifest.shots.length+1});
          manifest.media[jpg]=`production-${stem}`;
        }
      }
    }
    for(const film of row.videos){
      const stem=`${row.map}-${film.timeOfDay}${film.format==='landscape'?'':`-${film.format}`}`,uri=`${prefix}/${stem}.mp4`;
      copyFileSync(film.path,target(uri.slice(1)));
      manifest.films.push({src:uri,poster:`${prefix}/posters/${row.map}-${film.timeOfDay}-${film.format}.webp`,map:row.map,timeOfDay:film.timeOfDay,format:film.format,fps:film.fps,frames:film.frames,width:film.probe.streams[0].width,height:film.probe.streams[0].height,silent:true});
      recipe(`production-film-${stem}`,film.scene,[uri]);
    }
  }
  for(const path of paths)manifest.assets.push({src:`/${path}`,sha256:digest(readFileSync(join(stage,path)))});
  // The public record contains review notes and hashes, never private absolute workspace paths.
  for(const value of Object.values(manifest.review.maps)) delete value.paths;
  const previousPath=join(process.cwd(),'public/media/production-r1/manifest.json');
  const previous=existsSync(previousPath)?JSON.parse(readFileSync(previousPath,'utf8')):null;
  const publication=mergePublication(previous,manifest);
  for(const batch of publication.retainedBatches??[]) for(const asset of batch.assets) {
    if(digest(readFileSync(join(process.cwd(),'public',asset.src.slice(1))))!==asset.sha256) {
      throw Error(`Retained media changed: ${asset.src}`);
    }
  }
  writeFileSync(target('media/production-r1/manifest.json'),JSON.stringify(publication,null,2)+'\n');
  for(const path of paths){const dest=join(process.cwd(),'public',path);mkdirSync(dirname(dest),{recursive:true});copyFileSync(join(stage,path),dest);}
  console.log(`[media] published ${mapStills.length} map sets, ${manifest.films.length} films, ${manifest.shots.length} archive images to public/`);
}finally{rmSync(stage,{recursive:true,force:true});}
