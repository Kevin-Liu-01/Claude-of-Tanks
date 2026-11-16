// The media library's plan and census (2026-11-16): the library as committed (public/media/library-r3), the pictures
// tools/media-library/sources.mjs reads from every published folder's manifest, and the library they make together.
// Plain Node, no image work: the builder (build.mjs) writes the plan's packs, sheets and indexes; the library's receipt
// (tools/marketing-shots/media-library.selftest.mjs) checks the committed library is the plan, the census is clean and
// every linked picture is the file its thumbnail was cut from (lock.json).
//
// The committed library is the record of the pictures only it holds (the media rounds' finals packed into its pack
// files: their masters and the old builder's plan are gone). Every other picture is a link to a published file. A
// picture keeps its place once it has one; a new one leads or trails its set (or follows its take's pictures).
import { createHash } from 'node:crypto';
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTankAssets } from '../tank-assets-store.mjs';
import { FOLDERS } from './sources.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const LIBRARY_ROOT = 'library-r3';
export const MEDIA = join(ROOT, 'public/media');
export const LIB = join(MEDIA, LIBRARY_ROOT);
export const LOCK_FILE = join(ROOT, 'tools/media-library/lock.json');
export const LOCALES = ['en-US', 'zh-CN'];
const IMAGE = /\.(?:webp|jpe?g|png|avif|gif)$/i;

/** A WebP file's pixel size from its head (VP8, VP8L or VP8X). */
export function webpSize(head) {
  const chunk = head.toString('latin1', 12, 16);
  if (chunk === 'VP8X') return [1 + head.readUIntLE(24, 3), 1 + head.readUIntLE(27, 3)];
  if (chunk === 'VP8 ') return [head.readUInt16LE(26) & 0x3fff, head.readUInt16LE(28) & 0x3fff];
  if (chunk === 'VP8L') {
    const b = head.subarray(21, 25);
    return [1 + (((b[1] & 0x3f) << 8) | b[0]), 1 + (((b[3] & 0xf) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6))];
  }
  throw new Error(`unknown WebP chunk ${chunk}`);
}

function jpegSize(b) {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

/** An image file's pixel size from its head (WebP, PNG or JPEG). */
export function imageSize(file) {
  const fd = openSync(file, 'r');
  try {
    const head = Buffer.alloc(65536);
    const n = readSync(fd, head, 0, head.length, 0);
    const b = head.subarray(0, n);
    if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return webpSize(b);
    if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)];
    if (b[0] === 0xff && b[1] === 0xd8) {
      const size = jpegSize(b) ?? jpegSize(readFileSync(file));
      if (size) return size;
    }
  } finally {
    closeSync(fd);
  }
  throw new Error(`${file}: not a WebP, PNG or JPEG the library reads`);
}

export const publicFile = (url) => join(ROOT, 'public', url);
export const sha16 = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 16);

/** The committed library: its collections, sets and pictures (a picture's thumbnail cell, and a pack range or a link). */
export function readLibrary(dir = LIB) {
  const top = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  return {
    version: top.version,
    count: top.count,
    collections: top.collections.map((summary) => {
      const c = JSON.parse(readFileSync(join(dir, summary.key, 'index.json'), 'utf8'));
      return {
        key: c.key, title: c.title, blurb: c.blurb, packs: c.packs, sheets: c.sheets,
        sets: c.sets.map((s) => ({
          key: s.key, title: s.title, kind: s.kind,
          items: s.items.map((item, k) => ({
            name: item[0], width: item[1], height: item[2], thumb: item.slice(3, 8),
            ref: typeof item[8] === 'string' ? { url: item[8] } : { pack: item[8], offset: item[9], length: item[10] },
            caption: s.captions?.[k] ?? [null, null, null],
          })),
        })),
      };
    }),
  };
}

/** Every picture with its collection and set, in the library's order. */
export function entriesOf(library) {
  const out = [];
  for (const c of library.collections) for (const s of c.sets) for (const item of s.items) out.push({ collection: c.key, set: s.key, item });
  return out;
}

function walkImages(dir, base) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) out.push(...walkImages(file, `${base}/${name}`));
    else if (IMAGE.test(name)) out.push(`${base}/${name}`);
  }
  return out;
}

/** What the folder rules read with: manifests, the catalogs' words, the tanks' names and the committed library. */
export function createContext(library) {
  const json = new Map();
  const readJson = (rel) => {
    if (!json.has(rel)) json.set(rel, JSON.parse(readFileSync(join(ROOT, rel), 'utf8')));
    return json.get(rel);
  };
  const catalogs = Object.fromEntries(LOCALES.map((l) => [l, readJson(`src/ui/i18nCatalog.${l}.json`)]));
  const words = readJson('tools/media-library/words.json');
  let tanks = null;
  const sizes = new Map();
  /** A { locale: text } worded in every locale, or one string when every locale reads the same (a vehicle's name). */
  const text = (t) => {
    if (t == null || typeof t === 'string') return t;
    for (const l of LOCALES) if (typeof t[l] !== 'string' || !t[l].trim()) throw new Error(`a text without ${l}: ${JSON.stringify(t)}`);
    const values = LOCALES.map((l) => t[l]);
    return values.every((v) => v === values[0]) ? values[0] : Object.fromEntries(LOCALES.map((l) => [l, t[l]]));
  };
  const per = (t, l) => (typeof t === 'string' ? t : t[l]);
  const has = (key) => LOCALES.every((l) => typeof catalogs[l][key] === 'string' && catalogs[l][key].trim());
  const cat = (key) => {
    if (!has(key)) throw new Error(`the catalogs have no "${key}" in ${LOCALES.join(' and ')}`);
    return text(Object.fromEntries(LOCALES.map((l) => [l, catalogs[l][key]])));
  };
  const wordOf = (w, what) => {
    if (!w) throw new Error(`tools/media-library/words.json has no ${what}`);
    return w.catalog ? cat(w.catalog) : text(w);
  };
  const word = (group, key) => wordOf(words[group]?.[key], `${group}.${key}`);
  const fill = (template, vars) => text(Object.fromEntries(LOCALES.map((l) => [l,
    Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, per(v, l)), per(template, l))])));
  const entries = entriesOf(library);
  const byUrl = new Map(entries.filter((e) => 'url' in e.item.ref).map((e) => [e.item.ref.url, e]));
  return {
    words,
    text,
    has,
    cat,
    word,
    collectionWords: (key) => words.collections[key] && {
      title: wordOf(words.collections[key].title, `collections.${key}.title`),
      blurb: wordOf(words.collections[key].blurb, `collections.${key}.blurb`),
    },
    setWord: (key) => (words.sets[key] ? wordOf(words.sets[key], `sets.${key}`) : null),
    /** "Copper Mesa Mine, golden hour": the battlefield and the hour, lower case after the comma in English. */
    place: (map, hour) => {
      const h = cat(`atmosphere.${hour}`);
      const lower = Object.fromEntries(LOCALES.map((l) => [l, l.startsWith('en') ? per(h, l).replace(/^./, (c) => c.toLowerCase()) : per(h, l)]));
      return fill(word('joins', 'place'), { map: cat(`map.${map}`), hour: lower });
    },
    versus: (a, b) => fill(word('joins', 'versus'), { a, b }),
    /** Names as a list in each locale ("A, B, and C"; "A、B和C"). */
    list: (names) => text(Object.fromEntries(LOCALES.map((l) => [l, new Intl.ListFormat(l, { type: 'conjunction' }).format(names)]))),
    tank: (id) => {
      tanks ??= readTankAssets(join(ROOT, 'public/icons')).tanks;
      const row = tanks[id];
      if (!row) throw new Error(`no tank ${id} in public/icons/tank-assets`);
      const nation = row.nation === 'USSR/Russia' ? 'Russia' : row.nation;
      return { name: row.label?.displayName ?? row.name, nation };
    },
    manifest: (folder) => readJson(`public/media/${folder}/manifest.json`),
    source: (rel) => readFileSync(join(ROOT, rel), 'utf8'),
    files: (folder) => walkImages(join(MEDIA, folder), `/media/${folder}`),
    exists: (url) => existsSync(publicFile(url)),
    size: (url) => {
      if (!sizes.has(url)) sizes.set(url, imageSize(publicFile(url)));
      return sizes.get(url);
    },
    library: {
      entries,
      byUrl: (url) => byUrl.get(url) ?? null,
      named: (name) => entries.find((e) => e.item.name === name) ?? null,
      find: (test) => entries.find(test) ?? null,
    },
  };
}

function placeSet(list, at) {
  const index = (keys) => (keys ?? []).map((k) => list.findIndex((x) => x.key === k)).find((i) => i >= 0);
  if (at?.first) return 0;
  if (at?.before) { const i = index(at.before); if (i !== undefined) return i; }
  if (at?.after) { const i = index(at.after); if (i !== undefined) return i + 1; }
  return list.length;
}

/**
 * The library the rules make from the committed one: relinks (a published file now serves a picture), drops (a picture
 * an owning folder no longer yields, an older render's frame), the folders' pictures in place, and the words.
 */
export function planLibrary(library = readLibrary()) {
  const ctx = createContext(library);
  const results = new Map();
  for (const [folder, rule] of Object.entries(FOLDERS)) if (rule.read) results.set(folder, rule.read(ctx));
  const plan = {
    collections: library.collections.map((c) => ({
      key: c.key, title: c.title, blurb: c.blurb,
      sets: c.sets.map((s) => ({ key: s.key, title: s.title, kind: s.kind, items: s.items.map((i) => ({ ...i })) })),
    })),
  };
  const log = [];
  const all = () => entriesOf(plan);
  const urlOf = (url) => all().find((e) => e.item.ref.url === url) ?? null;
  const folderOf = (url) => url?.match(/^\/media\/([^/]+)\//)?.[1];

  // 1. a published file now serves a picture the library held as its own copy (or as a thumbnail)
  for (const [folder, r] of results) {
    for (const rl of r.relinks) {
      const e = rl.from ? urlOf(rl.from)
        : all().find((x) => x.collection === rl.collection && x.set === rl.set && x.item.name === rl.name);
      if (!e) throw new Error(`${folder}: no library picture to relink to ${rl.url}`);
      const [width, height] = ctx.size(rl.url);
      log.push(`relink ${e.collection}/${e.item.name}: ${'url' in e.item.ref ? e.item.ref.url : 'its packed copy'} -> ${rl.url}`);
      e.item.ref = { url: rl.url };
      e.item.width = width;
      e.item.height = height;
    }
  }
  // 2. what leaves: an owning folder's picture it no longer yields, and the pictures a rule drops
  const yielded = new Map();
  for (const [folder, r] of results) {
    for (const p of r.pictures) {
      if (yielded.has(p.url)) throw new Error(`${p.url}: yielded by ${yielded.get(p.url)} and ${folder}`);
      yielded.set(p.url, folder);
    }
  }
  const drops = new Map();
  for (const [folder, r] of results) for (const d of r.drops) drops.set(d.name, `${folder}: ${d.reason}`);
  for (const c of plan.collections) {
    for (const s of c.sets) {
      s.items = s.items.filter((i) => {
        const url = i.ref.url;
        if (url && FOLDERS[folderOf(url)]?.owns && !yielded.has(url)) { log.push(`leave ${c.key}/${s.key}/${i.name}: ${url} is no longer in its folder's pictures`); return false; }
        if (drops.has(i.name)) { log.push(`leave ${c.key}/${s.key}/${i.name}: ${drops.get(i.name)}`); return false; }
        return true;
      });
    }
  }
  // 3. the folders' pictures: in place when they have one, else new in their set
  const pending = new Map();
  const ensureSet = (p) => {
    let c = plan.collections.find((x) => x.key === p.collection);
    if (!c) {
      const w = ctx.collectionWords(p.collection);
      if (!w) throw new Error(`${p.url}: no collection ${p.collection} (tools/media-library/words.json collections)`);
      c = { key: p.collection, ...w, sets: [] };
      plan.collections.push(c);
    }
    let s = c.sets.find((x) => x.key === p.set);
    if (!s) {
      const title = ctx.setWord(p.set) ?? p.setTitle;
      if (!title) throw new Error(`${p.url}: no title for the new set ${p.set}`);
      s = { key: p.set, title: ctx.text(title), kind: 'final', items: [] };
      c.sets.splice(placeSet(c.sets, p.setAt), 0, s);
      log.push(`new set ${c.key}/${p.set}`);
    }
    return s;
  };
  for (const [, r] of results) {
    for (const p of r.pictures) {
      const [width, height] = ctx.size(p.url);
      const caption = p.caption.map((t) => ctx.text(t ?? null));
      if (!caption[0]) throw new Error(`${p.url}: no title`);
      const target = ensureSet(p);
      const existing = urlOf(p.url);
      const here = existing && target.items.includes(existing.item);
      if (here) {
        Object.assign(existing.item, { name: p.name, width, height, caption });
        continue;
      }
      if (existing) {
        const from = plan.collections.find((c) => c.key === existing.collection).sets.find((s) => s.key === existing.set);
        from.items = from.items.filter((i) => i !== existing.item);
        log.push(`move ${existing.collection}/${existing.set}/${existing.item.name} -> ${p.collection}/${p.set}`);
      } else {
        log.push(`add ${p.collection}/${p.set}/${p.name} (${p.url})`);
      }
      const item = { name: p.name, width, height, ref: { url: p.url }, caption, thumb: null };
      if (!pending.has(target)) pending.set(target, { lead: [], after: [], trail: [] });
      const slot = pending.get(target);
      if (p.lead) slot.lead.push(item);
      else if (p.afterName) slot.after.push([p.afterName, item]);
      else slot.trail.push(item);
    }
  }
  for (const [set, { lead, after, trail }] of pending) {
    const items = [...set.items];
    for (const [prefix, item] of after) {
      let at = -1;
      items.forEach((i, k) => { if (i.name === prefix || i.name.startsWith(`${prefix}-`)) at = k; });
      if (at < 0) trail.push(item); else items.splice(at + 1, 0, item);
    }
    set.items = [...lead, ...items, ...trail];
  }
  // 4. empty sets leave; the words
  for (const c of plan.collections) {
    const w = ctx.collectionWords(c.key);
    if (w) Object.assign(c, w);
    c.sets = c.sets.filter((s) => {
      if (!s.items.length) log.push(`empty set ${c.key}/${s.key} leaves`);
      return s.items.length > 0;
    });
    for (const s of c.sets) {
      const t = ctx.setWord(s.key);
      if (t) s.title = t;
      const names = new Set();
      for (const i of s.items) {
        if (names.has(i.name)) throw new Error(`${c.key}/${s.key}: two pictures named ${i.name}`);
        names.add(i.name);
      }
    }
  }
  plan.collections = plan.collections.filter((c) => c.sets.length);
  plan.count = entriesOf(plan).length;
  return { plan, ctx, results, log };
}

/**
 * Every image under public/media (the library's own files aside) is in the library, given a reason by its folder's rule
 * (a rung, a copy, an older render...), or in a folder the rules exclude with a reason. A new folder, or a new still in
 * a folder, fails here until the library takes it (build.mjs --write) or sources.mjs says why not.
 */
export function census(plan, results) {
  const linked = new Map();
  for (const e of entriesOf(plan)) if (e.item.ref.url) linked.set(e.item.ref.url, e);
  const notes = new Map();
  for (const [folder, r] of results) for (const [url, why] of r.notes) notes.set(url, `${folder}: ${why}`);
  const problems = [];
  const counts = { files: 0, linked: 0, noted: 0, excluded: 0 };
  for (const folder of readdirSync(MEDIA).sort()) {
    if (folder === LIBRARY_ROOT) continue;
    const dir = join(MEDIA, folder);
    if (!statSync(dir).isDirectory()) {
      if (IMAGE.test(folder)) problems.push(`/media/${folder}: a picture outside any folder`);
      continue;
    }
    const rule = FOLDERS[folder];
    for (const url of walkImages(dir, `/media/${folder}`)) {
      counts.files++;
      if (linked.has(url)) {
        counts.linked++;
        if (notes.has(url)) problems.push(`${url}: in the library, yet its rule says it is ${notes.get(url)}`);
      } else if (notes.has(url)) counts.noted++;
      else if (rule?.exclude) counts.excluded++;
      else {
        problems.push(`${url}: neither in the library nor given a reason`
          + (rule ? '' : ` (public/media/${folder} has no rule in tools/media-library/sources.mjs)`));
      }
    }
  }
  for (const url of linked.keys()) if (!existsSync(publicFile(url))) problems.push(`${url}: the library links a file that is not published`);
  return { problems, counts };
}

/** The lock: each linked picture's file as its thumbnail was cut from it (sha256, 16 hex). */
export function lockOf(plan) {
  const lock = {};
  for (const url of [...new Set(entriesOf(plan).filter((e) => e.item.ref.url).map((e) => e.item.ref.url))].sort()) {
    lock[url] = sha16(readFileSync(publicFile(url)));
  }
  return lock;
}

export const readLock = () => (existsSync(LOCK_FILE) ? JSON.parse(readFileSync(LOCK_FILE, 'utf8')) : {});

/** How a library reads, layout aside: its collections, sets and pictures (a link's file, a packed copy's length). */
export function shapeOf(library) {
  return library.collections.map((c) => ({
    key: c.key, title: c.title, blurb: c.blurb,
    sets: c.sets.map((s) => ({
      key: s.key, title: s.title, kind: s.kind,
      items: s.items.map((i) => [i.name, i.width, i.height, i.ref.url ?? `packed:${i.ref.length}`, i.caption]),
    })),
  }));
}

/** Where the committed library differs from the plan (at most `limit` lines). */
export function differences(plan, library, limit = 12) {
  const a = shapeOf(library);
  const b = shapeOf(plan);
  const out = [];
  const keys = (list) => list.map((x) => x.key).join(',');
  if (keys(a) !== keys(b)) out.push(`collections: ${keys(a)} -> ${keys(b)}`);
  for (const cb of b) {
    const ca = a.find((x) => x.key === cb.key);
    if (!ca) continue;
    if (JSON.stringify([ca.title, ca.blurb]) !== JSON.stringify([cb.title, cb.blurb])) out.push(`${cb.key}: its title or blurb`);
    if (keys(ca.sets) !== keys(cb.sets)) out.push(`${cb.key}: sets ${keys(ca.sets)} -> ${keys(cb.sets)}`);
    for (const sb of cb.sets) {
      const sa = ca.sets.find((x) => x.key === sb.key);
      if (!sa) continue;
      if (JSON.stringify(sa.title) !== JSON.stringify(sb.title)) out.push(`${cb.key}/${sb.key}: its title`);
      if (JSON.stringify(sa.items) !== JSON.stringify(sb.items)) {
        const before = new Map(sa.items.map((i) => [i[0], JSON.stringify(i)]));
        const after = new Map(sb.items.map((i) => [i[0], JSON.stringify(i)]));
        const some = (list) => `${list.slice(0, 4).join(', ')}${list.length > 4 ? ` and ${list.length - 4} more` : ''}`;
        const parts = [
          ['new', [...after.keys()].filter((n) => !before.has(n))],
          ['changed', [...after.keys()].filter((n) => before.has(n) && before.get(n) !== after.get(n))],
          ['gone', [...before.keys()].filter((n) => !after.has(n))],
        ].filter(([, list]) => list.length).map(([what, list]) => `${what} ${some(list)}`);
        out.push(`${cb.key}/${sb.key}: ${parts.join('; ') || 'order'}`);
      }
    }
  }
  return out.slice(0, limit).concat(out.length > limit ? [`... and ${out.length - limit} more`] : []);
}
