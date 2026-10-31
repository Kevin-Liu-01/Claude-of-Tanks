import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {photoReferencePacket,photoTarget} from './photo-reference-policy.mjs';
export function readPhotoReference(id,read=readFileSync){
  const packetPath=photoReferencePacket(id);
  if(!packetPath)throw new Error(`${id}: no photographic packet`);
  const bytes=read(packetPath),packet=JSON.parse(bytes),target=photoTarget(id,packet);
  if(!target)throw new Error(`${id}: no complete explicit photographic target`);
  // The packet's fixture, resolved in this checkout rather than the working directory: it exists and names the id it proves.
  const test=new URL(`../${target.test}`,import.meta.url);
  if(!existsSync(test)||!readFileSync(test,'utf8').includes(`'${id}'`))throw new Error(`${id}: fixture ${target.test} is missing or does not name it`);
  return {packet,target,packetPath,packetSha256:createHash('sha256').update(bytes).digest('hex')};
}
