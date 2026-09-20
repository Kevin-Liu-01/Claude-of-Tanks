import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {conceptDesignPath,conceptDocumentPassed} from './first-party-concept-policy.mjs';

/** Read and authenticate the selected owner's document; unknown IDs fail closed. */
export function readConceptDesign(id,read=readFileSync) {
  const designPath=conceptDesignPath(id);
  assert.ok(designPath,`${id}: no owner-authored design document`);
  const bytes=read(designPath);
  const record=JSON.parse(bytes);
  assert.ok(conceptDocumentPassed(id,record),`${id}: design document membership or contract changed`);
  return {designPath,designSha256:createHash('sha256').update(bytes).digest('hex')};
}
