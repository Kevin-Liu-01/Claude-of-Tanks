import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

/** Only a matching on-disk original enables an owner-approved configuration.
 * Keep originals available even when a separately derived assembly is used. */
export function verifyConfigurationSource(id, configuration, root=process.cwd()) {
  const expectedPath=`public/models/community-candidates/${id}_source.glb`;
  if (!configuration || configuration.id!==id || !/^[a-z0-9_]+$/.test(id)
      || configuration.source?.path!==expectedPath
      || !/^[a-f0-9]{64}$/.test(configuration.source?.sha256 ?? '')) {
    return {id,verified:false,reason:'Malformed source configuration'};
  }
  try {
    const sha256=createHash('sha256').update(readFileSync(path.join(root,expectedPath))).digest('hex');
    return {id,path:expectedPath,sha256,verified:sha256===configuration.source.sha256};
  } catch (error) {
    return {id,path:expectedPath,verified:false,reason:error.code || 'Unreadable source'};
  }
}
