import { createHash } from 'node:crypto';

/** The generator's exact four-decimal serialization; this is not a tolerance. */
export function presentationNumberSource(value) {
  const rounded = Number(Number(value).toFixed(4));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** Compare a measured/generated receipt with its published runtime values. */
export function presentationReceiptErrors(id, anchor, projection, savedAnchor, savedProjection) {
  const errors = [];
  for (const [kind, actual, saved, fields] of [
    ['anchor', anchor, savedAnchor, ['xM', 'zM']],
    ['projection', projection, savedProjection, ['centerYM', 'topHalfM', 'sideHalfM']],
  ]) for (const field of fields) {
    const value = actual?.[field], expected = saved?.[field];
    if (!Number.isFinite(value) || !Number.isFinite(expected)) {
      errors.push(`${id}: missing/nonfinite presentation ${kind}.${field}`);
    } else if (field.endsWith('HalfM') && (value <= 0 || expected <= 0)) {
      errors.push(`${id}: presentation ${kind}.${field} must be positive`);
    } else if (Number(presentationNumberSource(value)) !== expected) {
      errors.push(`${id}: stale presentation ${kind}.${field}: measured ${presentationNumberSource(value)} != published ${expected}`);
    }
  }
  return errors;
}

function checkedAsset(id, record, file, readAsset) {
  if (!record || record.file !== file || !/^[0-9a-f]{64}$/.test(record.sha256 || '')) {
    throw new Error(`${id}: missing or invalid saved asset ${file}`);
  }
  const bytes = readAsset(file);
  if (bytes.length !== record.bytes || createHash('sha256').update(bytes).digest('hex') !== record.sha256) {
    throw new Error(`${id}: saved asset hash/size mismatch ${file}`);
  }
}

function verifySyncScope(ids, manifest, live) {
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length
      || ids.some(id => typeof id !== 'string' || !/^[a-z0-9_]+$/.test(id))) {
    throw new Error('asset projection sync requires nonempty distinct tank IDs');
  }
  const views = live?.requiredViews;
  if (!Number.isInteger(live?.schemaVersion) || live.schemaVersion !== manifest?.schemaVersion
      || !Array.isArray(views) || !views.length || new Set(views).size !== views.length
      || JSON.stringify(views) !== JSON.stringify(manifest.requiredViews)) {
    throw new Error('saved/native asset schema or required views disagree');
  }
}

function verifiedAssetProjection(id, manifest, live, anchors, readAsset) {
    const saved = manifest.tanks?.[id], actual = live.tanks?.[id];
    if (!saved || !actual || actual.error) throw new Error(`${id}: missing saved/live asset receipt`);
    for (const key of ['geometryHash', 'metadataHash', 'presentationHash']) {
      if (!/^[0-9a-f]{8}$/.test(saved[key] || '') || saved[key] !== actual[key]) {
        throw new Error(`${id}: stale native asset ${key}`);
      }
    }
    const errors = [
      ...presentationReceiptErrors(id, saved.presentationAnchor, saved.presentationProjection,
        anchors[id], saved.presentationProjection),
      ...presentationReceiptErrors(id, actual.presentationAnchor, actual.presentationProjection,
        saved.presentationAnchor, saved.presentationProjection),
    ];
    if (errors.length) throw new Error(errors.join('\n'));
    const files = actual.requiredFiles;
    if (!files || !files.angle || [Object.keys(files), Object.keys(saved.assets || {})]
      .some(keys => JSON.stringify(keys.sort()) !== JSON.stringify([...live.requiredViews].sort()))) {
      throw new Error(`${id}: incomplete native/saved asset file set`);
    }
    for (const [view, file] of Object.entries(files)) checkedAsset(id, saved.assets[view], file, readAsset);
    checkedAsset(id, saved.assets.angle.thumbnail, `thumbs/${files.angle}`, readAsset);
    return saved.presentationProjection;
}

/** Pure source transform; all file reads are caller-owned and no input mutates.
 * Synchronize only selected projection lines after authenticating existing
 * images and their actual native capture, never a proposed new centroid. */
export function syncAssetProjectionSource(source, ids, manifest, live, anchors, readAsset) {
  verifySyncScope(ids, manifest, live);
  let updated = source;
  for (const id of ids) {
    const a = anchors[id], p = verifiedAssetProjection(id, manifest, live, anchors, readAsset);
    const anchorLine = `  ${id}: Object.freeze({ xM: ${presentationNumberSource(a.xM)}, zM: ${presentationNumberSource(a.zM)} }),`;
    if (source.split('\n').filter(line => line === anchorLine).length !== 1) {
      throw new Error(`${id}: runtime anchor source does not match its receipt`);
    }
    const old = source.split('\n').filter(line => line.startsWith(`  ${id}: Object.freeze({ centerYM: `)
      && line.endsWith(' }),'));
    if (old.length !== 1) throw new Error(`${id}: require one existing projection source row`);
    const replacement = `  ${id}: Object.freeze({ centerYM: ${presentationNumberSource(p.centerYM)}, `
      + `topHalfM: ${presentationNumberSource(p.topHalfM)}, sideHalfM: ${presentationNumberSource(p.sideHalfM)} }),`;
    updated = updated.split('\n').map(line => line === old[0] ? replacement : line).join('\n');
  }
  return updated;
}
