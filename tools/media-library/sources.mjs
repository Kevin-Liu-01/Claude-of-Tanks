// The media library's sources (2026-11-16, owner: "what about our /media page? its missing so much stuff not just from
// loading but from stuff between that page going up and new stuf"): what the library does with every folder under
// public/media. The library (public/media/library-r3, src/presentation/mediaLibrary.ts) drifted for three weeks because
// it was a snapshot built outside the repository; now each published folder has a rule here, read from its manifest:
//
//   read(ctx)   the folder's pictures: each one's collection, set and caption [title, about, shot] in both locales, from
//               its manifest or the catalogs (src/ui/i18nCatalog.*.json), never from a file name; and a reason for every
//               other picture in it (a smaller rung, a poster's thumbnail, a copy, an older render the library replaces).
//               A picture with a moving take carries its clip (the owner, 2026-11-16: clips play from their pictures), and
//               every film in the folder is a picture's clip or has a reason too.
//               `owns` folders give the library all their pictures: one the folder stops yielding leaves the library.
//               The others (the site fifty, the interface set, the Filming manual) keep the pictures the library already
//               shows from them and add the new ones.
//   exclude     the reason no picture in the folder joins the library (retired, a superseded interface, other people's).
//
// tools/media-library/build.mjs plans the library from these rules and writes it; the library's receipt
// (tools/marketing-shots/media-library.selftest.mjs) fails when a picture under public/media is neither in the library nor
// given a reason here, so a new folder or a new still cannot go missing silently again. The owner's rule for public
// pictures: modern shots only (current models, current maps, current UI); where a newer render replaces an older picture
// of the same scene, the library shows the newer one.

/** A collection set for a duel at ground level, by its hour. */
export const duelSet = (hour) => (hour === 'night' ? 'duels-night'
  : ['golden', 'sunset', 'dusk'].includes(hour) ? 'duels-golden' : 'duels-day');
const DUEL_SET_AT = {
  'duels-day': { first: true }, 'duels-golden': { after: ['duels-day'] },
  'duels-night': { after: ['duels-golden', 'duels-day'] }, 'duels-above': { last: true },
};
const duel = (hour, above = false) => {
  const set = above ? 'duels-above' : duelSet(hour);
  return { collection: 'duels', set, setAt: DUEL_SET_AT[set] };
};
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const camel = (s) => s.replace(/[-_]([a-z0-9])/g, (_, c) => c.toUpperCase());
/** A manifest's { en, zh } text as the library's { locale: text }. */
const own = (title, what) => {
  if (!title?.en || !title?.zh) throw new Error(`${what}: no title in both languages`);
  return { 'en-US': title.en, 'zh-CN': title.zh };
};
/** "place: who" in each locale (": " in English, "：" in Chinese), as the versus and gallery manifests write it. */
function placeAndWho(title, what) {
  const en = own(title, what)['en-US'].split(': ');
  const zh = title.zh.split('：');
  if (en.length !== 2 || zh.length !== 2) throw new Error(`${what}: the title "${title.en}" is not "place: who"`);
  return { place: { 'en-US': en[0], 'zh-CN': zh[0] }, who: { 'en-US': en[1], 'zh-CN': zh[1] } };
}
/** The rung a picture is shown at: the widest at most 1920 px wide (else the widest). */
const shown = (rungs) => {
  const fit = rungs.filter((r) => r.width <= 1920);
  return (fit.length ? fit : rungs).reduce((a, b) => (b.width > a.width ? b : a));
};
const scenesAt = { before: ['scenes-studio', 'scenes-blur'] };

function sink() {
  return { pictures: [], relinks: [], drops: [], notes: new Map(), clips: new Map() };
}
/**
 * A picture's clip (2026-11-16, owner: clips play from their pictures): its moving take's files in the ladder order the
 * site's player reads (VP9 before H.264; `wide` only on wide screens, `phone` on phones: src/presentation/mediaPlayer.ts),
 * each [file, type, rung?]. The viewer plays it on the press of its play control; nothing transfers before that.
 */
const videoType = (src) => (/\.mp4$/i.test(src) ? 'video/mp4' : 'video/webm');
function clipOf(seconds, ...files) {
  const sources = files.filter((f) => f && f[0]).map(([src, rung]) => (rung ? [src, videoType(src), rung] : [src, videoType(src)]));
  return sources.length ? { seconds: seconds ?? null, sources } : null;
}
/** A home r2 take's ladder: its film, its 1920 file for wide screens, its phone rung. */
const homeClip = (it) => clipOf(it.seconds ?? it.film?.seconds, [it.film?.path], [it.wide?.path, 'wide'], [it.mobile?.path, 'phone']);
/** Every rung but the shown one, as a smaller (or larger) copy of it. */
function rungNotes(out, rungs, main) {
  for (const r of rungs) if (r.path !== main) out.notes.set(r.path, `the ${r.width} px rung of ${main}`);
}

// ---- folders whose pictures the library takes from their manifests ------------------------------------------------

/** The owner's loading-screen gallery (78 stills, 11-10/11, current tanks and fireballs): its close-ups join the battle
 *  scenes by battlefield, its elevated stills the duels from above. */
function gallery(ctx) {
  const out = sink();
  for (const it of ctx.manifest('gallery-r1').items) {
    const what = `gallery-r1/${it.id}`;
    const { who } = placeAndWho(it.title, what);
    if (it.group !== 'close' && it.group !== 'elevated') throw new Error(`${what}: group ${it.group}`);
    const close = it.group === 'close';
    out.pictures.push({
      url: it.path, name: it.id, lead: close,
      ...(close ? { collection: 'scenes', set: `scenes-${slug(it.map)}`, setTitle: ctx.cat(`map.${it.map}`), setAt: scenesAt }
        : duel(it.hour, true)),
      caption: [ctx.text(who), ctx.place(it.map, it.hour), close ? ctx.word('shots', 'close') : null],
    });
    rungNotes(out, it.rungs ?? [], it.path);
  }
  return out;
}

/** The versus stills: each versus scene at its newest round (an older round of the same scene, view and variant is
 *  superseded, and so is its loop's frame), at ground level by hour or from above. */
function versus(ctx) {
  const out = sink();
  const items = ctx.manifest('versus-r1').items;
  const slot = (it) => [it.id.split('-')[0], it.view ?? 'side', /-boot$/.test(it.id) ? 'boot' : ''].join('/');
  const newest = new Map();
  for (const it of items) {
    const best = newest.get(slot(it));
    if (best && best.round === it.round) throw new Error(`versus-r1: ${best.id} and ${it.id} are one scene at one round`);
    if (!best || it.round > best.round) newest.set(slot(it), it);
  }
  for (const it of items) {
    rungNotes(out, it.rungs ?? [], it.path);
    const best = newest.get(slot(it));
    if (best !== it) {
      const why = `an older render of a versus scene (round ${it.round}): the library shows its round ${best.round}, ${best.path}`;
      out.notes.set(it.path, why);
      out.drops.push({ name: `${it.id}-loop`, reason: why });
      continue;
    }
    const { place, who } = placeAndWho(it.title, `versus-r1/${it.id}`);
    out.pictures.push({ url: it.path, name: it.id, lead: true, ...duel(it.hour, it.view === 'top'),
      caption: [ctx.text(who), ctx.text(place), null] });
  }
  return out;
}

/** The home page's reel and features (home r2): the duels' films' posters with the duels, the multi-tank clips with
 *  their battlefield's scenes, the fleet strip's vehicles by country, the Garage and the Studio with the interface. The
 *  watch, kill cam and multiplayer features are ui-246 pictures, which the library shows from there. */
const HOME_FEATURES = {
  destruction: (it) => ({ collection: 'scenes', set: `scenes-${slug(it.map)}` }),
  garage: () => ({ collection: 'interface', set: 'interface-garage' }),
  studio: () => ({ collection: 'interface', set: 'interface-studio' }),
};
const MONTAGES = new Set(['battlefields', 'fleet']);
function home(ctx) {
  const out = sink();
  const m = ctx.manifest('home-r2');
  for (const it of [...m.hero, ...m.clips]) {
    const what = `home-r2/${it.id}`;
    const main = shown(it.poster.rungs).path;
    rungNotes(out, it.poster.rungs, main);
    const names = it.tanks.map((id) => ctx.tank(id).name);
    const about = own(it.title, what);
    out.clips.set(main, homeClip(it));
    if (names.length === 2) {
      out.pictures.push({ url: main, name: it.id, ...duel(it.hour, /topdown/.test(it.id)),
        caption: [ctx.versus(names[0], names[1]), about, null] });
    } else {
      out.pictures.push({ url: main, name: it.id, collection: 'scenes', set: `scenes-${slug(it.map)}`,
        setTitle: ctx.cat(`map.${it.map}`), setAt: scenesAt, caption: [ctx.list(names), about, null] });
    }
  }
  for (const it of Object.values(m.duels)) {
    const main = shown(it.poster.rungs).path;
    rungNotes(out, it.poster.rungs, main);
    const { place, who } = placeAndWho(it.title, `home-r2/${it.id}`);
    out.pictures.push({ url: main, name: it.id, ...duel(it.hour), caption: [ctx.text(who), ctx.text(place), ctx.word('shots', 'moment')] });
    out.clips.set(main, homeClip(it));
  }
  for (const [key, it] of Object.entries(m.features)) {
    const main = shown(it.poster.rungs).path;
    if (!main.startsWith('/media/home-r2/')) continue;
    if (MONTAGES.has(key)) {
      for (const r of it.poster.rungs) out.notes.set(r.path, `the poster of the ${key} montage, a film cut from other takes (a clip)`);
      for (const f of [it.film, it.mobile]) if (f) out.notes.set(f.path, `the ${key} montage, a film cut from takes the library plays from their own pictures`);
      continue;
    }
    const place = HOME_FEATURES[key];
    if (!place) throw new Error(`home-r2: the feature "${key}" has no place in the library (tools/media-library/sources.mjs)`);
    rungNotes(out, it.poster.rungs, main);
    const at = place(it);
    out.clips.set(main, homeClip(it));
    out.pictures.push({ url: main, name: it.id, ...at,
      ...(at.collection === 'scenes' ? { setTitle: ctx.cat(`map.${it.map}`), setAt: scenesAt } : {}),
      caption: [ctx.cat(`home.features.${key}`), own(it.title, `home-r2/${it.id}`), null] });
  }
  for (const it of m.fleetStrip) {
    const tank = ctx.tank(it.specId);
    const main = shown(it.rungs).path;
    rungNotes(out, it.rungs, main);
    out.pictures.push({ url: main, name: `fleet-${it.specId.replace(/_/g, '-')}`, lead: true, collection: 'vehicles',
      set: `vehicles-${slug(tank.nation)}`, setTitle: ctx.cat(`nation.${tank.nation}`),
      caption: [tank.name, ctx.place(it.map, it.hour), null] });
  }
  out.notes.set('/media/home-r2/trailer-thumb.webp', 'the trailer button\'s thumbnail, a frame of the trailer (a film)');
  return out;
}

/** The battlefield picker's stills (maps-r1, 10-26 on 251): each battlefield's landmark at its default hour. */
function maps(ctx) {
  const out = sink();
  for (const it of ctx.manifest('maps-r1').maps) {
    const main = shown(it.poster.rungs).path;
    rungNotes(out, it.poster.rungs, main);
    out.pictures.push({ url: main, name: it.id.replace(/_/g, '-'), collection: 'battlefields', set: 'battlefields-landmarks',
      setAt: { first: true }, caption: [ctx.cat(`map.${it.id}`), ctx.cat(`atmosphere.${it.hour}`), null] });
    // the picker's hover loop of the same view
    out.clips.set(main, clipOf(it.loop?.seconds, [it.loop?.path]));
  }
  return out;
}

/** The Deploy screen's art: each other mode's 1600 px panel, the campaign's operation plates. The core modes' cards and
 *  panels are cuts of versus and site-fifty stills, and a tile is the panel's smaller rung or an earlier capture. */
function deploy(ctx) {
  const out = sink();
  // the operations in their order (op-01 first), the rest as the manifest lists them
  const listed = ctx.manifest('deploy-r1').items;
  const items = [...listed.filter((it) => !/^op-/.test(it.id)), ...listed.filter((it) => /^op-/.test(it.id)).sort((a, b) => a.id.localeCompare(b.id))];
  // the operation each plate briefs (src/ui/deployScreen.ts CAMPAIGN_PLATES)
  const plates = new Map([...ctx.source('src/ui/deployScreen.ts').matchAll(/^\s+(\w+): '(\/media\/deploy-r1\/op-\d+-\d+\.webp)',$/gm)]
    .map(([, op, url]) => [url, op]));
  for (const it of items) {
    const url = `/media/deploy-r1/${it.file}`;
    if (/^op-\d+$/.test(it.id)) {
      const op = plates.get(url);
      if (!op) throw new Error(`deploy-r1: no operation in src/ui/deployScreen.ts CAMPAIGN_PLATES shows ${url}`);
      out.pictures.push({ url, name: `campaign-${op.replace(/_/g, '-')}`, collection: 'gameplay', set: 'gameplay-campaign',
        setAt: { after: ['gameplay-deploy', 'gameplay-modes'] },
        caption: [ctx.cat(`campaign.op.${op}.title`), ctx.cat(`campaign.op.${op}.brief`), null] });
      continue;
    }
    const cut = it.source.match(/(?:^|\()public(\/media\/[^ )]+\.webp)/);
    if (cut) { out.notes.set(url, `a cut of ${cut[1]} for the Deploy screen's ${it.mode} card`); continue; }
    if (it.id.endsWith('-panel')) {
      out.pictures.push({ url, name: `deploy-${it.mode.replace(/_/g, '-')}`, collection: 'gameplay', set: 'gameplay-deploy',
        setAt: { after: ['gameplay-modes'] }, caption: [ctx.cat(`playMenu.matchMode.${it.mode}.label`), null, null] });
      continue;
    }
    if (it.id.endsWith('-tile')) {
      const panel = items.find((p) => p.id === `${it.mode}-panel`);
      if (!panel) throw new Error(`deploy-r1: ${it.id} has no panel`);
      out.notes.set(url, panel.source === it.source ? `the 480 px rung of /media/deploy-r1/${panel.file}`
        : `the Deploy screen's 480 px tile, an earlier capture: the library shows the mode's 1600 px panel, /media/deploy-r1/${panel.file}`);
      continue;
    }
    throw new Error(`deploy-r1: ${it.id} has no rule (tools/media-library/sources.mjs)`);
  }
  return out;
}

/** The first game's tips (tutorial-r1, 272): each loop's poster with its tip. */
function tutorial(ctx) {
  const out = sink();
  const items = ctx.manifest('tutorial-r1').items;
  for (const it of items) {
    if (it.type !== 'image/webp') continue;
    // the tip's loop, whose middle frame the poster is
    out.clips.set(it.src, clipOf(null, ...items.filter((v) => v.slot === it.slot && v.type.startsWith('video/')).map((v) => [v.src])));
    out.pictures.push({ url: it.src, name: `tip-${slug(it.slot)}`, collection: 'gameplay', set: 'gameplay-tutorial',
      setAt: { after: ['gameplay-campaign', 'gameplay-deploy', 'gameplay-modes'] },
      caption: [ctx.cat(`tutorial.tips.${it.slot}.title`), ctx.cat(`tutorial.tips.${it.slot}.body`), null] });
  }
  return out;
}

/** The Field Manual's moving topic heroes (docs-hero-r2, 251): each loop's poster with the duels. The manifest names
 *  no hour: each poster's, read off its frame, is here, so a new hero stops the build until it has one. */
const DOCS_HERO_HOURS = { 'frontier-t90m-leo2a6': 'day', 'verdant-challenger3-t80u': 'day' };
function docsHero(ctx) {
  const out = sink();
  for (const it of ctx.manifest('docs-hero-r2').items) {
    const hour = DOCS_HERO_HOURS[it.id];
    if (!hour) throw new Error(`docs-hero-r2: ${it.id} has no hour in tools/media-library/sources.mjs DOCS_HERO_HOURS`);
    out.pictures.push({ url: it.files.poster.path, name: `hero-${it.id}`, ...duel(hour), caption: [own(it.title, `docs-hero-r2/${it.id}`), null, null] });
    // the topic header's ladder (src/docs/topics.ts topicHeroMarkup): the 960 loop, the 1920 one on wide screens, the phone rung
    out.clips.set(it.files.poster.path, clipOf(it.seconds, [it.files.r960?.path], [it.files.wide?.path, it.files.r960 ? 'wide' : null], [it.files.phone?.path, 'phone']));
    if (it.files.thumb) out.notes.set(it.files.thumb.path, `the thumbnail of ${it.files.poster.path}`);
  }
  return out;
}

/** The Scene Studio's Director sequences (studio-r1): each sequence's frame at 1280, its preset's title and line. */
function studio(ctx) {
  const out = sink();
  for (const it of ctx.manifest('studio-r1').items) {
    if (/-640$/.test(it.id)) { out.notes.set(it.src, `the 640 px rung of ${it.src.replace(/-640\.webp$/, '-1280.webp')}`); continue; }
    if (!/-1280$/.test(it.id)) throw new Error(`studio-r1: ${it.id} has no rule`);
    const key = `studio.director.ui.preset.${it.preset}`;
    out.pictures.push({ url: it.src, name: `sequence-${it.preset}`, collection: 'scenes', set: 'scenes-studio',
      setAt: { before: ['scenes-blur'] }, caption: [ctx.cat(`${key}.title`), ctx.cat(`${key}.description`), null] });
  }
  return out;
}

// ---- folders whose pictures the library already shows, plus what they add -------------------------------------------

/** The site fifty (site50-r14): the library shows its takes (some as its own copies, made when the site published only
 *  a smaller one). A published still at least as large as the library's own copy now serves it (the newer render, or
 *  the same at a larger size), a thumbnail link becomes its full picture, and a picture no take of the library holds
 *  joins its take's set; everything else is a smaller copy, a frame of a take the library shows, or a film's poster. */
function site50(ctx) {
  const out = sink();
  const m = ctx.manifest('site50-r14');
  const files = new Map(m.files.map((f) => [`/${f.path}`, f]));
  const lib = ctx.library;
  /** The library's picture of a still by its name, or by its render file's name (`<name>-<map>-landscape-2160p-...`). */
  const twin = (name) => lib.named(name) ?? lib.find((e) => e.item.name.startsWith(`${name}-`)
    && /-[a-z_]+-(?:landscape|portrait)-\d+p-still-/.test(e.item.name.slice(name.length)));
  const ofTake = (take) => lib.find((e) => e.item.name === take || e.item.name.startsWith(`${take}-`));
  const all = ctx.files('site50-r14');
  // a thumbnail the library links whose full picture is published now: the library shows the full picture
  const relinked = new Set();
  for (const url of all) {
    const full = url.replace(/-thumb\.webp$/, '.webp');
    if (full === url || !lib.byUrl(url) || !ctx.exists(full) || lib.byUrl(full) || ctx.size(full)[0] <= ctx.size(url)[0]) continue;
    out.relinks.push({ from: url, url: full });
    out.notes.set(url, `the thumbnail of ${full}`);
    relinked.add(full);
  }
  for (const url of all) {
    const f = files.get(url) ?? {};
    const sub = url.split('/')[3];
    const base = url.slice(url.lastIndexOf('/') + 1).replace(/\.(?:webp|jpe?g)$/, '');
    if (lib.byUrl(url) || relinked.has(url)) continue;
    if (/-(?:thumb|640)$/.test(base) && ['stills', 'frames', 'home'].includes(sub)) {
      out.notes.set(url, `the thumbnail of ${url.replace(/-(?:thumb|640)\.webp$/, '.webp')}`);
      continue;
    }
    // the boot splash's copy of a still (src/ui/featuredShots.ts bootImg): the same render at the boot's size
    const booted = sub === 'stills' && base.match(/^(.+)-boot$/)?.[1];
    if (booted && ctx.exists(`/media/site50-r14/stills/${booted}.webp`)) {
      out.notes.set(url, `the boot splash's copy of /media/site50-r14/stills/${booted}.webp, a picture the library shows`);
      continue;
    }
    if (sub === 'frames' && /^sheet-\d+$/.test(base)) { out.notes.set(url, 'a contact sheet of the motion-blur studies (the library shows each study)'); continue; }
    if (sub === 'films') { out.notes.set(url, `the poster of the ${f.film ?? base} film (a clip)`); continue; }
    if (sub === 'loops' || sub === 'reels') {
      const take = ofTake(f.take ?? base);
      if (take) out.notes.set(url, `a frame of the take ${f.take ?? base}'s ${sub === 'loops' ? 'loop (its poster)' : 'reel'}: the library shows the take (${take.item.name})`);
      continue;
    }
    if (sub === 'fleet') {
      const take = f.take && ofTake(f.take);
      if (take) { out.notes.set(url, `a 640 px card of the take ${f.take}: the library shows the take (${take.item.name})`); continue; }
      if (!f.take || !f.vehicle) continue;
      const tank = ctx.tank(f.vehicle);
      const key = `media.site50.title.${camel(f.take)}`;
      out.pictures.push({ url, name: f.take, collection: 'vehicles', set: `vehicles-${slug(tank.nation)}`,
        setTitle: ctx.cat(`nation.${tank.nation}`), caption: [tank.name, ctx.has(key) ? ctx.cat(key) : null, null] });
      continue;
    }
    if (sub === 'home' && /\.jpg$/.test(url)) { out.notes.set(url, `the poster of the ${f.home ?? base} loop (a clip)`); continue; }
    if (!['stills', 'frames', 'home'].includes(sub)) continue;
    const name = sub === 'home' && f.home ? `${f.home.split('/')[0]}-${f.home.split('/')[1].replace(/_/g, '-')}` : base;
    const held = twin(name);
    if (held) {
      if ('url' in held.item.ref) {
        // the library shows this close-up from its take's 640 px fleet card: the same picture, published full size here
        if (held.item.ref.url.includes('/site50-r14/fleet/') && ctx.size(url)[0] > ctx.size(held.item.ref.url)[0]) {
          out.relinks.push({ from: held.item.ref.url, url });
          out.notes.set(held.item.ref.url, `a 640 px card of ${url}, which the library shows`);
          continue;
        }
        // the library's picture of the take is another frame of it (its loop's or the reel's poster): this still joins it
        if (sub === 'stills' && addStill(url, `${base}-still`, f.take ?? base, base)) continue;
        out.notes.set(url, `the library shows ${held.item.name} from ${held.item.ref.url}`);
        continue;
      }
      if (ctx.size(url)[0] >= held.item.width) { out.relinks.push({ name: held.item.name, collection: held.collection, set: held.set, url }); continue; }
      out.notes.set(url, `a smaller copy of ${held.collection}/${held.item.name}, which the library holds at ${held.item.width} px`);
      continue;
    }
    if (sub === 'home' && f.home?.startsWith('modes/')) {
      const mode = f.home.split('/')[1];
      out.pictures.push({ url, name: name, collection: 'gameplay', set: 'gameplay-modes',
        caption: [ctx.cat(`playMenu.matchMode.${mode}.label`), ctx.cat(`media.home.modes.${mode}`), null] });
      continue;
    }
    if (sub === 'stills' && f.take) addStill(url, base, f.take, base);
  }
  // the moving takes of the pictures the library shows from here: a loop's poster plays its loop (the topic headers'
  // ladder, src/docs/topics.ts), a reel's frame its reel, the feature reel's poster the reel
  const phone = (take) => `/media/web-video-r1/${take}-mobile.mp4`;
  const seconds = (url) => files.get(url)?.seconds ?? null;
  for (const e of lib.entries) {
    const url = e.item.ref.url;
    const loop = url?.match(/^\/media\/site50-r14\/loops\/([\w-]+)\.jpg$/)?.[1];
    if (loop) {
      const wide = `/media/site50-r14/loops/${loop}.webm`, r960 = `/media/site50-r14/loops/${loop}-960.webm`;
      const small = ctx.exists(r960);
      out.clips.set(url, clipOf(seconds(wide), [small ? r960 : null], [ctx.exists(wide) ? wide : null, small ? 'wide' : null],
        [ctx.exists(phone(loop)) ? phone(loop) : null, 'phone']));
    }
    const reel = url?.match(/^\/media\/site50-r14\/reels\/([\w-]+)\.webp$/)?.[1];
    if (reel && ctx.exists(`/media/site50-r14/reels/${reel}.mp4`)) out.clips.set(url, clipOf(seconds(`/media/site50-r14/reels/${reel}.mp4`), [`/media/site50-r14/reels/${reel}.mp4`]));
    if (url === '/media/site50-r14/films/reel.jpg') {
      out.clips.set(url, clipOf(seconds('/media/site50-r14/films/reel.webm'), ['/media/site50-r14/films/reel.webm'],
        ['/media/site50-r14/films/reel.mp4'], [ctx.exists(phone('reel')) ? phone('reel') : null, 'phone']));
    }
  }
  // the folder's other films (a clip above plays from its picture; these stay with the pages that play them)
  const FILM_REASONS = {
    fleet: 'a vehicle\'s take film for the Garage\'s take panel (src/ui/fleetTakes.ts): the library shows the vehicle\'s pictures',
    loops: 'a take\'s loop: the library plays it from the take\'s loop poster where it shows that picture, else shows the take\'s stills',
    reels: 'a take\'s reel: the library plays it from the reel\'s frame where it shows that picture, else shows the take\'s stills',
    films: 'a film the landing plays in its dialog (the trailers) or the feature reel, which the library plays from the reel\'s poster',
    home: 'the Studio feature\'s earlier loop: home r2\'s studio-246 replaced it, and the library plays that one from its picture',
  };
  for (const url of ctx.videos('site50-r14')) {
    const reason = FILM_REASONS[url.split('/')[3]];
    if (reason) out.notes.set(url, reason);
  }
  /** A still the library lacks joins its take's other pictures (else its battlefield's scenes), in the take's words. */
  function addStill(url, name, takeId, base) {
    const take = ofTake(takeId);
    const key = camel(takeId);
    const [title, about] = ctx.has(`media.site50.short.${key}`) ? [ctx.cat(`media.site50.short.${key}`), ctx.cat(`media.site50.title.${key}`)]
      : take ? take.item.caption.slice(0, 2) : [null, null];
    const map = m.takes[takeId]?.map;
    if (!title || (!take && !map)) return false;
    const shot = /-close$/.test(base) ? ctx.word('shots', 'close') : name !== base ? null : ctx.word('shots', 'moment');
    out.pictures.push({ url, name, collection: take?.collection ?? 'scenes', set: take?.set ?? `scenes-${slug(map)}`,
      ...(take ? { afterName: takeId } : { setTitle: ctx.cat(`map.${map}`), setAt: scenesAt }), caption: [title, about, shot] });
    return true;
  }
  return out;
}

/** The post-overhaul interface set (ui-246): the library shows its stills (captioned on 10-24); a -640 file is a rung. */
function ui246(ctx) {
  const out = sink();
  for (const url of ctx.files('ui-246')) {
    if (!ctx.library.byUrl(url) && /-640\.webp$/.test(url)) out.notes.set(url, `the 640 px rung of ${url.replace(/-640\.webp$/, '.webp')}`);
  }
  return out;
}

/** The Filming manual's takes (filming-r1): the library shows the finals it took from them; the rest is the media
 *  rounds' process (a take at round four, in review, in previz, and the process figures). */
function filming(ctx) {
  const out = sink();
  const m = ctx.manifest('filming-r1');
  const stage = new Map();
  for (const take of m.takes) for (const [name, s] of Object.entries(take.stages)) if (s.poster) stage.set(s.poster, `the take ${take.id} at its ${name} stage`);
  // every other picture the manifest names (the process figures, a take's frame strip and its card)
  const named = new Set();
  const walk = (x) => {
    if (typeof x === 'string' && /^\/media\/filming-r1\/.+\.(?:webp|jpe?g|png)$/.test(x)) named.add(x);
    else if (x && typeof x === 'object') Object.values(x).forEach(walk);
  };
  walk(m);
  for (const url of ctx.files('filming-r1')) {
    if (ctx.library.byUrl(url) || !named.has(url)) continue;
    out.notes.set(url, `the Filming manual's process: ${stage.get(url) ?? 'a process figure (a frame strip, a card or a review sheet)'}`);
  }
  for (const take of m.takes) {
    for (const [name, s] of Object.entries(take.stages)) if (s.video) out.notes.set(s.video, `the Filming manual's process: the take ${take.id} at its ${name} stage (its viewer plays it)`);
  }
  return out;
}

/** The battle report's backdrops (battle-end-r1): each a copy of a picture the library shows. */
function battleEnd(ctx) {
  const out = sink();
  const gallery = ctx.manifest('gallery-r1').items;
  for (const it of ctx.manifest('battle-end-r1').items) {
    const home = it.source.match(/^home:(\w+)\/(\w+)$/);
    const name = home ? `${home[1]}-${home[2].replace(/_/g, '-')}` : it.source;
    const held = ctx.library.named(name) ?? ctx.library.find((e) => e.item.name.startsWith(`${name}-`))
      ?? (gallery.some((g) => g.id.startsWith(`${name}-`)) ? { item: { name: gallery.find((g) => g.id.startsWith(`${name}-`)).id } } : null);
    if (held) out.notes.set(it.src, `the battle report's backdrop for ${it.map}: a copy of ${held.item.name}, which the library shows`);
  }
  return out;
}

/** Each page's share clip (share-r1, og:video): a re-cut of a take the library plays from its own picture. */
function share(ctx) {
  const out = sink();
  for (const it of ctx.manifest('share-r1').items) out.notes.set(it.path, `a page's share clip (og:video), cut from ${it.master}: the library plays the takes from their pictures`);
  return out;
}

/** The phone rungs of the site fifty's loops (web-video-r1): part of a clip's ladder where the library plays that loop. */
function webVideo(ctx) {
  const out = sink();
  for (const f of ctx.manifest('web-video-r1').files) out.notes.set(`/media/web-video-r1/${f.path}`, `the phone rung of ${f.source}`);
  return out;
}

const RETIRED = 'which no page shows (tools/media-freshness.selftest.mjs RETIRING)';
export const FOLDERS = {
  'gallery-r1': { owns: true, read: gallery },
  'versus-r1': { owns: true, read: versus },
  'home-r2': { owns: true, read: home },
  'maps-r1': { owns: true, read: maps },
  'deploy-r1': { owns: true, read: deploy },
  'tutorial-r1': { owns: true, read: tutorial },
  'docs-hero-r2': { owns: true, read: docsHero },
  'studio-r1': { owns: true, read: studio },
  'site50-r14': { read: site50 },
  'ui-246': { read: ui246 },
  'filming-r1': { read: filming },
  'battle-end-r1': { read: battleEnd },
  'share-r1': { read: share },
  'web-video-r1': { read: webVideo },
  'docs-r1': { exclude: 'the Field Manual\'s screens, captured on release 243 before the 246 interface overhaul: the library shows the current screens (ui-246)' },
  'settings-r1': { exclude: 'the Settings screen\'s 640 x 360 quality previews (captured on 243): parts of a screen, not pictures to view' },
  'feature-evidence-r2': { exclude: `the August feature evidence, retired for the versus renders, ${RETIRED}` },
  'garage-environments-r2': { exclude: `the old garages, ${RETIRED}` },
  home: { exclude: `pre-overhaul interface pictures and an August Garage still, ${RETIRED}` },
  'landing-r1': { exclude: `the landing's Studio stand-in, ${RETIRED}` },
  modern: { exclude: `the August portraits of older vehicle models, ${RETIRED}` },
  'multiplayer-r1': { exclude: `the pre-overhaul multiplayer capture (ui-246 multiplayer-pair replaced it), ${RETIRED}` },
  'presentation-r1': { exclude: `pre-overhaul interface pictures (ui-246 replaced them), ${RETIRED}` },
  'showcase-r2': { exclude: `the old garages, the pre-overhaul interface and the filming process's review sheets, ${RETIRED}` },
  'home-hero-r1': { exclude: 'the landing hero\'s rungs of an older render of the Steinburg duel (versus-r1 f6-leo2a6-steinburg-r6), which no page shows: the library shows its newer render' },
  'versus-films-r1': { exclude: 'the versus films\' posters: no page plays the films since the home r2 reel replaced the landing\'s versus wall (10-25); the library shows the versus stills' },
  'social-proof': { exclude: 'community members\' avatars and posts: other people\'s pictures, not the game\'s' },
};
