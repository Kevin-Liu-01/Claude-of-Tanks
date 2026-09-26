import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PHOTO_REFERENCE_PACKET,photoTarget} from './photo-reference-policy.mjs';
export function readPhotoReference(id,read=readFileSync){
  const bytes=read(PHOTO_REFERENCE_PACKET),packet=JSON.parse(bytes),target=photoTarget(id,packet);
  if(!target)throw new Error(`${id}: no complete explicit photographic target`);
  return {packet,target,packetPath:PHOTO_REFERENCE_PACKET,packetSha256:createHash('sha256').update(bytes).digest('hex')};
}
