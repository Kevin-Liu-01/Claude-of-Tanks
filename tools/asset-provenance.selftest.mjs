import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReceipt, signReceipt, verifyReceipt, verifySignature, coveredPath } from './asset-provenance-core.mjs';
import { vehicleProvenance } from '../src/authorship.ts';
const root = await mkdtemp(join(tmpdir(), 'cot-provenance-'));
const key = () => generateKeyPairSync('ed25519', { publicKeyEncoding: {type:'spki',format:'pem'}, privateKeyEncoding: {type:'pkcs8',format:'pem'} });
try {
  await mkdir(join(root,'src/vehicles'),{recursive:true});
  const file='src/vehicles/test.ts';await writeFile(join(root,file),'first-party shape');
  const receipt=await createReceipt(root,[file], 'a'.repeat(40));
  assert.deepEqual(await createReceipt(root,[file,file],'a'.repeat(40)),receipt,'deterministic, duplicate-free receipt');
  const keys=key(), signed=signReceipt(receipt,keys.privateKey);
  assert.equal(await verifyReceipt(root,signed,[file],keys.publicKey),1);
  assert.throws(()=>verifySignature(signed,key().publicKey),/Untrusted/);
  const forged=structuredClone(signed);forged.receipt.creator='Somebody else';
  assert.throws(()=>verifySignature(forged,keys.publicKey),/Invalid/);
  await assert.rejects(()=>verifyReceipt(root,signed,[file]),/trusted/);
  await writeFile(join(root,file),'changed shape');
  await assert.rejects(()=>verifyReceipt(root,signed,[file],keys.publicKey),/mismatch/);
  await writeFile(join(root,'src/vehicles/new.ts'),'new');
  await assert.rejects(()=>verifyReceipt(root,{receipt,signature:null},[file,'src/vehicles/new.ts']),/mismatch/);
  assert.equal(coveredPath('public/models/reference.glb'),false);
  assert.equal(coveredPath('public/brand/partners/mark.png'),false);
  assert.equal(coveredPath('src/vehicles/../../../secret'),false);
  await symlink(join(root,file),join(root,'src/vehicles/link.ts'));
  await assert.rejects(()=>createReceipt(root,['src/vehicles/link.ts'],'a'.repeat(40)),/ordinary file/);
  const model=vehicleProvenance('m1a2');assert.equal(model.creator,'Kevin B. Liu');
  assert.equal(model.assetId,'urn:claude-of-tanks:vehicle:m1a2');
  assert.deepEqual(JSON.parse(JSON.stringify(model)),model,'model metadata survives JSON/glTF extras');
  const { createTank }=await import('../src/vehicles/tankFactory.ts');
  const { Group }=await import('three');
  const { GLTFExporter }=await import('three/addons/exporters/GLTFExporter.js');
  const tank=createTank('m1a2',null,{materialMode:'geometry-only',quality:'low',proceduralOnly:true});
  try {
    assert.deepEqual(tank.root.userData.provenance,model,'real factory attaches canonical credit');
    const group=new Group();group.userData.provenance=tank.root.userData.provenance;
    const exported=await new GLTFExporter().parseAsync(group,{binary:false});
    assert.equal(exported.nodes[0].extras.provenance.creator,'Kevin B. Liu','standard glTF extras retain credit');
  } finally {tank.dispose();}
  console.log('asset provenance: hashes, scope, tampering, trusted signatures, traversal and metadata PASS');
} finally { await rm(root,{recursive:true,force:true}); }
