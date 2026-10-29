// The loading census's page half (tools/loading-census.mjs; owner 2026-10-27: "lets ensure we have good loading states
// for everything"). Copyright (c) 2026 Kevin B. Liu. First-party tool; see NOTICE.md.
//
// Installed before the document's first script (puppeteer evaluateOnNewDocument), it records from the navigation's start:
// every layout shift with the nodes it moved, every image and video that loaded with how it arrived (faded, under a
// hidden ancestor, or popped in at full opacity), the first contentful paint and the page's errors. watch() follows one
// surface's load: from the moment its box paints until its content is ready, a sample every 100 ms reads what the box
// showed (a skeleton, a poster, text, nothing), whether a spinner turned, whether the wait was announced (aria-busy, a
// status or progressbar, a live region with text), whether a full-window layer covered the page's navigation, and
// whether a quiet retry state stood up when the content could not arrive. Plain script, no imports: puppeteer passes it
// as source text.
(() => {
  if (window.__ls) return;
  const t0 = 0; // performance.now() is relative to the navigation's start
  const shifts = [], media = [], errors = [], paints = {};
  const describe = (node) => {
    if (!node || node.nodeType !== 1) return node?.nodeType === 3 ? '#text' : '?';
    const parts = [];
    for (let e = node, i = 0; e && e.nodeType === 1 && i < 4; e = e.parentElement, i++) {
      let s = e.tagName.toLowerCase();
      if (e.id) s += `#${e.id}`;
      else if (e.classList.length) s += `.${[...e.classList].slice(0, 2).join('.')}`;
      parts.unshift(s);
      if (e.id) break;
    }
    return parts.join('>');
  };
  const rect = (r) => [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        shifts.push({ t: Math.round(e.startTime), value: e.value, input: e.hadRecentInput,
          sources: (e.sources ?? []).map((s) => ({ node: describe(s.node), from: rect(s.previousRect), to: rect(s.currentRect) })) });
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) paints[e.name] = Math.round(e.startTime);
    }).observe({ type: 'paint', buffered: true });
  } catch { /* observers unsupported: the census reads nothing */ }

  /** The opacity the element is drawn at: its own and every ancestor's, multiplied. */
  const drawnOpacity = (el) => {
    let o = 1;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
      o *= Number(cs.opacity);
    }
    return o;
  };
  /** An opacity (or filter) transition or animation running on the element or one of its three nearest ancestors. */
  const fading = (el) => {
    for (let e = el, i = 0; e && e.nodeType === 1 && i < 4; e = e.parentElement, i++) {
      for (const a of e.getAnimations?.() ?? []) {
        if (a.playState !== 'running' && a.playState !== 'pending') continue;
        if (a.transitionProperty && /opacity|filter|all/.test(a.transitionProperty)) return true;
        const frames = a.effect?.getKeyframes?.() ?? [];
        if (frames.some((k) => 'opacity' in k || 'filter' in k)) return true;
      }
      const cs = getComputedStyle(e);
      if (/opacity|filter|all/.test(cs.transitionProperty) && parseFloat(cs.transitionDuration) > 0 && Number(cs.opacity) < 0.99) return true;
    }
    return false;
  };
  const inView = (r) => r.width > 2 && r.height > 2 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  // when each image or video joined the document: one that arrives with its element (a cached picture a surface draws as
  // it opens) never stood as an empty box, so it cannot pop
  const joined = new WeakMap();
  const stamp = (node) => {
    if (node.nodeType !== 1) return;
    const at = Math.round(performance.now());
    if (node.matches('img,video')) joined.set(node, at);
    for (const el of node.querySelectorAll?.('img,video') ?? []) joined.set(el, at);
  };
  new MutationObserver((records) => { for (const r of records) for (const n of r.addedNodes) stamp(n); })
    .observe(document, { childList: true, subtree: true });
  const onMedia = (event) => {
    const el = event.target;
    const video = el instanceof HTMLVideoElement;
    if (!(el instanceof HTMLImageElement) && !video) return;
    const at = Math.round(performance.now());
    // read it on the next frame, where a load handler's own fade has started
    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const drawn = drawnOpacity(el);
      const small = r.width < 64 && r.height < 64; // icons and flags: no fade owed
      const waited = at - (joined.get(el) ?? 0);
      const entry = { el, t: at, kind: video ? 'video' : 'img', src: String(el.currentSrc || el.src || '').split('/').pop()?.slice(0, 80),
        node: describe(el), box: rect(r), inView: inView(r), drawn: Math.round(drawn * 100) / 100, faded: fading(el),
        poster: video && !!el.poster, small, waited };
      // (a video's first frame replaces its own poster, already drawn: no pop; a picture that came within 100 ms of its
      // element never stood empty)
      entry.popped = entry.inView && !small && !entry.poster && waited > 100 && drawn > 0.98 && !entry.faded
        && at > (paints['first-contentful-paint'] ?? 0) + 150;
      media.push(entry);
    });
  };
  document.addEventListener('load', onMedia, true);
  document.addEventListener('loadeddata', onMedia, true);
  document.addEventListener('error', (event) => {
    const el = event.target;
    if (el instanceof HTMLImageElement || el instanceof HTMLVideoElement || el instanceof HTMLScriptElement || el instanceof HTMLLinkElement) {
      errors.push({ t: Math.round(performance.now()), kind: `load-error ${el.tagName.toLowerCase()}`, what: String(el.currentSrc || el.src || el.href || '').split('/').pop()?.slice(0, 80) });
    }
  }, true);
  addEventListener('error', (e) => errors.push({ t: Math.round(performance.now()), kind: 'error', what: String(e.message).slice(0, 200) }));
  addEventListener('unhandledrejection', (e) => errors.push({ t: Math.round(performance.now()), kind: 'rejection', what: String(e.reason?.message ?? e.reason).slice(0, 200) }));

  /** The element's box as drawn: inside the window and every ancestor that clips its overflow (a lazy image in a
   *  scrolled-off list row is not in view), up to the top layer (a modal dialog or an open popover escapes its parents). */
  const topLayer = (e) => { try { return e.matches(':modal, :popover-open'); } catch { return false; } };
  const drawnRect = (el) => {
    const r = el.getBoundingClientRect();
    let left = Math.max(r.left, 0), top = Math.max(r.top, 0), right = Math.min(r.right, innerWidth), bottom = Math.min(r.bottom, innerHeight);
    for (let e = el.parentElement, child = el; e && e !== document.documentElement && right > left && bottom > top; child = e, e = e.parentElement) {
      if (topLayer(child)) break;
      const cs = getComputedStyle(e);
      if (cs.position === 'fixed') break;
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const c = e.getBoundingClientRect();
      left = Math.max(left, c.left); top = Math.max(top, c.top); right = Math.min(right, c.right); bottom = Math.min(bottom, c.bottom);
    }
    return { width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  };
  const visible = (el) => {
    if (!el) return false;
    const r = drawnRect(el);
    return r.width > 2 && r.height > 2 && drawnOpacity(el) > 0.05;
  };
  /** Laid out at all (display, visibility, a box), whatever its opacity: what `gone:` asks of a cover that fades in. */
  const rendered = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && !el.closest('[hidden]');
  };
  // a skeleton, or a revealed box still on its tone (src/ui/components/reveal.ts)
  const SKELETON = '[data-skeleton],[class*="skeleton"],[class*="shimmer"],[class*="placeholder"],.cot-c-skel,[data-reveal]:not([data-ready])';
  // a skeleton a sheet draws on an empty box: its tiles cut from its tone by a gradient mask (the /docs takes' box below
  // 1100 px). An icon's mask is a url and a scrim's gradient is a background, so neither counts.
  const drawnSkeleton = (el) => {
    if (el.childElementCount || el.textContent?.trim() || el.getBoundingClientRect().height < 48) return false;
    const css = getComputedStyle(el);
    return /gradient/.test(css.maskImage || css.webkitMaskImage || '');
  };
  const BUSY = '[aria-busy="true"]';
  const STATUS = '[role="status"],[role="progressbar"],[role="alert"],[aria-live="polite"],[aria-live="assertive"],output';
  // a control that runs the load again, or a notice that names the network (a stat called "Reload" is neither)
  const RETRY_CONTROL = /retry|try again|reload page|reconnect|重试|再试|重新加载/i;
  const NETWORK_NOTE = /offline|connection|network|retry|try again|离线|网络|连接|重试/i;
  /** What one box shows right now. */
  const read = (box) => {
    const r = box.getBoundingClientRect();
    const out = { skeleton: false, poster: false, media: false, text: false, spinner: false };
    for (const el of box.querySelectorAll('*')) {
      if (out.skeleton && out.media && out.text && out.spinner) break;
      if (!visible(el)) continue;
      if (!out.skeleton && (el.matches(SKELETON) || drawnSkeleton(el))) out.skeleton = true;
      if (el instanceof HTMLVideoElement && el.poster) out.poster = true;
      if ((el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0) || el instanceof HTMLCanvasElement
        || (el instanceof HTMLVideoElement && el.readyState >= 2)) out.media = true;
      if (!out.text && el.childElementCount === 0 && (el.textContent ?? '').trim().length > 1) out.text = true;
      for (const a of el.getAnimations?.() ?? []) {
        const frames = a.effect?.getKeyframes?.() ?? [];
        if (a.effect?.getTiming?.().iterations === Infinity && frames.some((k) => /rotate/.test(String(k.transform ?? k.rotate ?? '')))) out.spinner = true;
      }
    }
    out.height = Math.round(r.height);
    return out;
  };
  /** An accessible signal of the wait somewhere on the page, or on the box. */
  const announced = (box) => {
    if (box?.closest(BUSY) || box?.querySelector(BUSY)) return 'aria-busy';
    for (const el of document.querySelectorAll(STATUS)) {
      if ((el.textContent ?? '').trim() || el.getAttribute('aria-valuenow') !== null || el.getAttribute('aria-valuetext')) return el.getAttribute('role') || 'live';
    }
    return null;
  };
  /** A layer over most of the window, on top at the navigation's links, that is not the surface being loaded. */
  const navCovered = (box, navSelector) => {
    const links = [...document.querySelectorAll(navSelector)].filter(visible);
    for (const link of links) {
      // an inert page refuses the press as surely as a layer over it
      const inert = link.closest('[inert]');
      if (inert) return `inert ${describe(inert)}`;
      const r = link.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (!top || link.contains(top) || top.contains(link)) continue;
      if (box && (box.contains(top) || top.contains(box))) continue;
      const tr = top.getBoundingClientRect();
      if (tr.width * tr.height > innerWidth * innerHeight * 0.5) return describe(top);
    }
    return null;
  };
  /** A quiet retry state: a visible control or note that names a retry or the network, inside the box or announced. */
  const retryShown = (box) => {
    const scope = box ?? document.body;
    for (const el of scope.querySelectorAll('button,[role="button"],a,[role="alert"],[role="status"],[data-load-state="error"],.cot-c-notice')) {
      if (!visible(el)) continue;
      const words = `${el.textContent ?? ''} ${el.getAttribute('aria-label') ?? ''}`;
      if (el.matches('[data-load-state="error"]')) return describe(el);
      if (el.matches('button,[role="button"],a') ? RETRY_CONTROL.test(words) : NETWORK_NOTE.test(words)) return `${describe(el)} "${words.trim().slice(0, 60)}"`;
    }
    return null;
  };
  /** The broken images in view: on the page, or under a box's matches (an in-app row's own). */
  const brokenMedia = (scope = null) => [...document.querySelectorAll('img')]
    .filter((img) => img.complete && img.naturalWidth === 0 && img.getAttribute('src') && visible(img)
      && (!scope || [...document.querySelectorAll(scope)].some((b) => b.contains(img)))).map(describe);

  /**
   * Follow one surface's load. `box`: its container's selector; `ready`: the selector (or a function source) that holds
   * once its content is in; `nav`: the page's navigation links. Resolves with the timeline.
   */
  /**
   * A row's `ready`: `loaded:<sel>` holds once every image in view under the matches has decoded (one at least);
   * `frame:<sel>` once a matching video has a frame (readyState 2, or the shared player's has-frame); `gone:<sel>` once
   * no match is in view; a bare selector once a match is in view.
   */
  const readiness = (ready) => {
    const [, kind, sel] = /^(loaded|frame|gone):(.*)$/.exec(ready) ?? [null, 'shown', ready];
    if (kind === 'loaded') {
      return () => {
        const imgs = [...document.querySelectorAll(sel)].flatMap((el) => (el instanceof HTMLImageElement ? [el] : [...el.querySelectorAll('img')])).filter(visible);
        return imgs.length > 0 && imgs.every((img) => img.complete && img.naturalWidth > 0);
      };
    }
    if (kind === 'frame') {
      return () => [...document.querySelectorAll(sel)].some((v) => visible(v) && (v.readyState >= 2 || v.closest('.has-frame')));
    }
    if (kind === 'gone') {
      // gone once seen: a cover the parser has not reached yet is not a cover that left
      let seen = false;
      return () => {
        const shown = [...document.querySelectorAll(sel)].some(rendered);
        seen ||= shown;
        return seen && !shown;
      };
    }
    return () => [...document.querySelectorAll(sel)].some(visible);
  };

  async function watch({ box: boxSel, ready, nav = 'nav a[href], a[data-boot-link]', timeoutMs = 60_000, offline = false, since = performance.now(), inBox = false }) {
    const start = Math.round(since);
    const isReady = readiness(ready);
    const samples = [];
    let boxAt = null, readyAt = null, covered = null, retry = null, spinnerSeen = false, announcedAs = null, bareSamples = 0, waitSamples = 0, textSamples = 0;
    for (;;) {
      const now = performance.now();
      // the box: its first match in view (a hidden twin earlier in the document is not the surface)
      const box = [...document.querySelectorAll(boxSel)].find(visible) ?? document.querySelector(boxSel);
      if (box && visible(box) && boxAt === null) boxAt = Math.round(now);
      if (isReady()) { readyAt = Math.round(now); break; }
      if (box && visible(box)) {
        const state = read(box);
        waitSamples++;
        if (state.spinner) spinnerSeen = true;
        if (!state.skeleton && !state.poster && !state.media && !state.text) bareSamples++;
        if (state.text) textSamples++;
        announcedAs ??= announced(box);
        covered ??= navCovered(box, nav);
        if (samples.length < 40 && (samples.length === 0 || JSON.stringify(state) !== JSON.stringify(samples.at(-1).state))) samples.push({ t: Math.round(now) - start, state });
      }
      // offline, a retry anywhere counts: the surface may never have opened (a failed chunk), or have closed into a notice
      if (offline) retry ??= retryShown(box && visible(box) ? box : null) ?? retryShown(null);
      if (offline && retry) break;
      if (now - since > timeoutMs) break;
      await new Promise((done) => setTimeout(done, 100));
    }
    // two more frames of settling: a shift the content's arrival causes lands after its first paint
    await new Promise((done) => setTimeout(done, 1500));
    const end = performance.now();
    const windowShifts = shifts.filter((s) => s.t >= start && s.t <= end && !s.input);
    return {
      boxMs: boxAt === null ? null : boxAt - start, readyMs: readyAt === null ? null : readyAt - start,
      waitSamples, bareSamples, textSamples, spinnerSeen, announcedAs, covered, retry,
      cls: Math.round(windowShifts.reduce((n, s) => n + s.value, 0) * 1000) / 1000,
      shifts: windowShifts.slice(0, 12),
      // an in-app row's pops are its box's (Deploy's own pictures are not the battle entry's)
      popped: media.filter((m) => m.popped && m.t >= start && m.t <= end && (!inBox || [...document.querySelectorAll(boxSel)].some((b) => b.contains(m.el)))).slice(0, 12)
        .map(({ el, ...rest }) => rest),
      broken: offline ? brokenMedia(inBox ? boxSel : null).slice(0, 12) : [], errors: errors.filter((e) => e.t >= start && e.t <= end).slice(0, 12), samples,
    };
  }

  /** What a selector matches right now, for a step or a box that never showed: each match's box, display and opacity. */
  const diagnose = (sel) => [...document.querySelectorAll(sel)].slice(0, 4).map((el) => {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el), d = drawnRect(el);
    return `${describe(el)} rect ${rect(r).join(',')} drawn ${Math.round(d.width)}x${Math.round(d.height)} display ${cs.display} `
      + `visibility ${cs.visibility} opacity ${Math.round(drawnOpacity(el) * 100) / 100}${el.closest('[hidden]') ? ' hidden' : ''}${el.closest('[inert]') ? ' inert' : ''}`;
  });
  window.__ls = { t0, shifts, media, errors, paints, watch, read, announced, retryShown, brokenMedia, describe, diagnose };
})();
