import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanBlobIds, createReceipt, signReceipt, verifyReceipt, verifySignature, coveredPath } from './asset-provenance-core.mjs';
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
  // The hashing window keeps path order and still throws the first failure in path order (2026-10-22).
  const many=Array.from({length:40},(_,i)=>`src/vehicles/w${String(i).padStart(2,'0')}.ts`);
  for(const path of many)await writeFile(join(root,path),path);
  assert.deepEqual((await createReceipt(root,[...many].reverse(),'a'.repeat(40))).files.map(f=>f.path),many,'sorted receipt');
  await assert.rejects(()=>createReceipt(root,[...many,'src/vehicles/w99-missing.ts','src/vehicles/link.ts'],'a'.repeat(40)),/ordinary file/);
  await assert.rejects(()=>createReceipt(root,[...many,'src/vehicles/a-missing.ts','src/vehicles/link.ts'],'a'.repeat(40)),{code:'ENOENT'});
  const model=vehicleProvenance('m1a1_abrams_hc');assert.equal(model.creator,'Kevin B. Liu');
  assert.equal(model.assetId,'urn:claude-of-tanks:vehicle:m1a1_abrams_hc');
  assert.deepEqual(JSON.parse(JSON.stringify(model)),model,'model metadata survives JSON/glTF extras');
  const { createTank }=await import('../src/vehicles/tankFactory.ts');
  const { Group }=await import('three');
  const { GLTFExporter }=await import('three/addons/exporters/GLTFExporter.js');
  const tank=createTank('m1a1_abrams_hc',null,{materialMode:'geometry-only',quality:'low',proceduralOnly:true});
  try {
    assert.deepEqual(tank.root.userData.provenance,model,'real factory attaches canonical credit');
    const group=new Group();group.userData.provenance=tank.root.userData.provenance;
    const exported=await new GLTFExporter().parseAsync(group,{binary:false});
    assert.equal(exported.nodes[0].extras.provenance.creator,'Kevin B. Liu','standard glTF extras retain credit');
  } finally {tank.dispose();}
  // 272: --write reuses a digest by Git blob id only for a file whose working copy equals its index entry. Run on a
  // fixture repository in tmpdir, never on this checkout.
  const blob = (n) => String(n).repeat(40);
  assert.deepEqual([...cleanBlobIds([`100644 ${blob(1)} 0\tsrc/vehicles/a.ts`, `100755 ${blob(2)} 0\tsrc/vehicles/b.ts`,
    `120000 ${blob(3)} 0\tsrc/vehicles/link.ts`, `100644 ${blob(4)} 1\tsrc/vehicles/c.ts`, `100644 ${blob(5)} 0\tsrc/vehicles/d.ts`, ''].join('\0'),
  'src/vehicles/d.ts\0')], [['src/vehicles/a.ts', blob(1)], ['src/vehicles/b.ts', blob(2)]],
  'clean blobs: ordinary index entries at stage 0 that diff-files does not list (no link, conflict or dirty file)');
  const repo = join(root, 'repo'), out = join(root, 'out');
  const git = (...args) => execFileSync('git', ['-C', repo, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', ...args], { encoding: 'utf8' });
  for (const [path, text] of [['src/vehicles/a.ts', 'shape-one'], ['src/vehicles/b.ts', 'shape-b'], ['public/maps/m.json', '{}'],
    ['NOTICE.md', 'notice'], ['README.md', 'outside the scope']]) {
    await mkdir(join(repo, path, '..'), { recursive: true }); await writeFile(join(repo, path), text);
  }
  git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', 'fixture');
  let runs = 0;
  const write = (...flags) => {
    const target = join(out, `${++runs}.json`);
    const stdout = execFileSync(process.execPath, [fileURLToPath(new URL('./asset-provenance.mjs', import.meta.url)), `--root=${repo}`,
      `--write=${target}`, ...flags], { encoding: 'utf8' });
    return { stdout, read: async () => JSON.parse(await readFile(target, 'utf8')).receipt };
  };
  const fresh = async () => (await write('--no-cache')).read();
  const store = join(repo, 'node_modules/.cache/cot-asset-provenance/digests.json');
  const first = await fresh();
  assert.equal(first.files.length, 4, 'the fixture scope: three content files and one policy file');
  const cold = write(), warm = write();
  assert.match(cold.stdout, /\(0 digests reused\)/); assert.match(warm.stdout, /\(4 digests reused\)/, 'the second run reuses every digest');
  assert.deepEqual([await cold.read(), await warm.read()], [first, first], '(a) cached runs equal a run with the cache off');
  await writeFile(join(repo, 'src/vehicles/a.ts'), 'shape-two');
  const unstaged = write();
  assert.match(unstaged.stdout, /\(3 digests reused\)/);
  const edited = await fresh();
  assert.notDeepEqual(edited.files, first.files);
  assert.deepEqual(await unstaged.read(), edited, '(b) an unstaged edit reports the new hash');
  git('add', 'src/vehicles/a.ts');
  assert.deepEqual(await write().read(), edited, '(c) a staged edit reports the new hash');
  await writeFile(store, '{"version":1,"digests":');
  const corrupt = write();
  assert.match(corrupt.stdout, /\(0 digests reused\)/);
  assert.deepEqual(await corrupt.read(), edited, '(d) a corrupt store gives the receipt of no store');
  assert.equal(Object.keys(JSON.parse(await readFile(store, 'utf8')).digests).length, 4, 'and is rewritten');
  console.log('asset provenance: hashes, scope, tampering, trusted signatures, traversal, metadata and the blob-keyed digest cache PASS');
} finally { await rm(root,{recursive:true,force:true}); }
