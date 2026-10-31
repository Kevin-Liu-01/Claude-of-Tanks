import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {photoReferencePacket,photoTarget} from './photo-reference-policy.mjs';
export function readPhotoReference(id,read=readFileSync){
  const packetPath=photoReferencePacket(id);
  if(!packetPath)throw new Error(`${id}: no complete explicit photographic target`);
  const bytes=read(packetPath),packet=JSON.parse(bytes),target=photoTarget(id,packet);
  if(!target)throw new Error(`${id}: no complete explicit photographic target`);
  return {packet,target,packetPath,packetSha256:createHash('sha256').update(bytes).digest('hex')};
}
