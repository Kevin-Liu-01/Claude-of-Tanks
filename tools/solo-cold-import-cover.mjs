// The emitted module must remain separately interceptable. Never substitute a
// different merged chunk or synthetic module merely to make the scenario run.
export function resolveColdLoadingAsset(assetNames) {
  const matches = assetNames.filter(name => /^soloBattleLoadingRuntime-[A-Za-z0-9_-]+\.js$/.test(name));
  if (matches.length !== 1) throw new Error(`cold_import_asset_unsupported:${matches.length}`);
  return matches[0];
}

/** Own exactly one real Fetch.requestPaused request. All continuations settle
 * before Fetch is disabled/browser cleanup; the hold timer never outlives stop.
 */
export function createColdImportHold({ targetUrl, continueRequest, now = () => performance.now(),
  setTimer = setTimeout, clearTimer = clearTimeout, maxHoldMs = 5000 }) {
  let armed = false, stopped = false, heldId = null, timer = null, releasePromise = null;
  let resolveSeen;
  const seen = new Promise(resolve => { resolveSeen = resolve; });
  const pending = new Set();
  const state = { targetCount: 0, earlyCount: 0, held: false, interceptedAtMs: null,
    releaseStartedAtMs: null, releasedAtMs: null, releaseReason: null, errors: [], errorsDropped: 0 };
  const fail = message => { if (state.errors.length < 16) state.errors.push(message); else state.errorsDropped++; };
  const snapshot = () => ({ ...state, errors: [...state.errors], stopped });
  const continueOwned = requestId => {
    const operation = Promise.resolve().then(() => continueRequest(requestId))
      .catch(() => { fail('request_continue_failed'); }).finally(() => pending.delete(operation));
    pending.add(operation);
    return operation;
  };
  const release = reason => {
    if (releasePromise) return releasePromise;
    if (!heldId) return Promise.resolve(snapshot());
    clearTimer(timer); timer = null;
    state.releaseReason = reason;
    state.releaseStartedAtMs = now();
    releasePromise = continueOwned(heldId).then(() => {
      state.held = false; state.releasedAtMs = now(); heldId = null;
      return snapshot();
    });
    return releasePromise;
  };
  return {
    seen, snapshot, release,
    arm() {
      if (stopped || armed || state.targetCount) throw new Error('cold_import_arm_not_pristine');
      armed = true;
    },
    pause(event) {
      if (event.request?.url !== targetUrl || event.resourceType !== 'Script') {
        fail('unexpected_interception');
        void continueOwned(event.requestId);
        return;
      }
      state.targetCount++;
      if (stopped || state.targetCount !== 1 || !armed) {
        if (!armed) state.earlyCount++;
        fail(stopped ? 'interception_after_stop' : !armed ? 'target_requested_before_click_arm' : 'duplicate_target_interception');
        void continueOwned(event.requestId);
        resolveSeen(snapshot());
        return;
      }
      heldId = event.requestId;
      state.held = true;
      state.interceptedAtMs = now();
      timer = setTimer(() => {
        fail('hold_deadline');
        void release('hold-deadline');
      }, maxHoldMs);
      resolveSeen(snapshot());
    },
    async stop() {
      stopped = true;
      clearTimer(timer); timer = null;
      await release('cleanup');
      await Promise.allSettled([...pending]);
      return snapshot();
    },
  };
}

// Serialized before boot. Only passive DOM/readiness evidence; requestAnimationFrame
// is a browser callback opportunity, not acknowledgement of physical GPU scanout.
export function installColdImportCoverObserver() {
  const LIMIT = 128;
  const roots = new WeakMap();
  let serial = 0, armed = false, raf = 0, stopped = false, clickedAtMs = null;
  const state = { clicks: [], samples: [], dropped: 0 };
  const gameState = () => ({ phase: window.__DEBUG?.game?.phase ?? null,
    battleOrdinal: window.__DEBUG?.game?.battleCount ?? null, preBattleS: window.__DEBUG?.game?.preBattleS ?? null,
    resultPresent: !!window.__DEBUG?.game?.result });
  const content = root => ({ mapName: root?.querySelector('.mapname')?.textContent?.trim().slice(0, 120) ?? '',
    stage: root?.querySelector('.fstage')?.textContent?.trim().slice(0, 120) ?? '',
    allyRows: root?.querySelectorAll('.team.ally .rows .row').length ?? 0,
    enemyRows: root?.querySelectorAll('.team.foe .rows .row').length ?? 0 });
  const read = () => {
    const root = document.querySelector('.cot-bl');
    if (root && !roots.has(root)) roots.set(root, ++serial);
    const rect = root?.getBoundingClientRect(), style = root ? getComputedStyle(root) : null;
    const displayed = !!root && root.getClientRects().length > 0 && style.display !== 'none';
    const viewportCovered = !!rect && rect.left <= 1 && rect.top <= 1
      && rect.right >= innerWidth - 1 && rect.bottom >= innerHeight - 1;
    const visible = displayed && root.classList.contains('on')
      && style.visibility !== 'hidden' && Number(style.opacity) >= 0.95;
    const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return { atMs: performance.now(), clickedAtMs, ...gameState(), ...content(root),
      visible, displayed, viewportCovered, topmostAtCenter: !!root && (hit === root || root.contains(hit)),
      rootId: root ? roots.get(root) : null, opacity: style ? Number(style.opacity) : null,
      hidden: document.hidden, focused: document.hasFocus(),
      viewport: { width: innerWidth, height: innerHeight } };
  };
  const record = () => {
    const sample = read();
    if (clickedAtMs !== null) {
      if (state.samples.length < LIMIT) state.samples.push(sample);
      else state.dropped++;
    }
    return sample;
  };
  const tick = () => { if (!stopped) { record(); raf = requestAnimationFrame(tick); } };
  const click = event => {
    if (!armed || !(event.target instanceof Element) || !event.target.closest('.cot-battle')) return;
    const before = read();
    clickedAtMs ??= performance.now();
    if (state.clicks.length < 4) state.clicks.push({ atMs: performance.now(), trusted: event.isTrusted, before });
  };
  document.addEventListener('click', click, true);
  raf = requestAnimationFrame(tick);
  window.__COLD_IMPORT_COVER = {
    arm() { if (armed) throw new Error('cold_cover_already_armed'); armed = true; },
    read: () => ({ ...state, clicks: state.clicks.map(row => ({ ...row })), samples: state.samples.map(row => ({ ...row })), current: record() }),
    stop() { stopped = true; cancelAnimationFrame(raf); document.removeEventListener('click', click, true); },
  };
}

function visibleCover(sample) {
  return sample?.visible === true && sample.viewportCovered === true && sample.topmostAtCenter === true
    && sample.hidden === false && sample.focused === true;
}

function checkHeldCover(receipt) {
  const failures = [];
  const click = receipt?.heldCover?.clicks?.[0];
  if (receipt?.heldCover?.clicks?.length !== 1 || click?.trusted !== true || click?.before?.phase !== 'garage') {
    failures.push('missing_single_trusted_garage_battle_click');
  }
  const held = receipt?.heldRequest;
  if (held?.targetCount !== 1 || held.earlyCount !== 0 || held.held !== true || held.releaseStartedAtMs !== null || held.errors?.length) {
    failures.push('cold_import_not_exclusively_held');
  }
  const current = receipt?.heldCover?.current;
  if (!visibleCover(current)) failures.push('no_visible_fullscreen_loader_while_import_held');
  if (current?.allyRows !== 0 || current?.enemyRows !== 0 || current?.phase !== 'garage') {
    failures.push('held_import_was_not_pending_pre_enrichment');
  }
  const witness = receipt?.heldCover?.samples?.find(sample => visibleCover(sample));
  if (!witness || !Number.isFinite(click?.atMs) || witness.atMs < click.atMs
    || witness.atMs - click.atMs > receipt.coverLimitMs) failures.push('first_cover_missing_or_late');
  if (receipt?.screenshotWhileHeld !== true || !receipt?.heldScreenshotSha256) failures.push('missing_held_import_screenshot');
  return failures;
}

function checkReleasedCover(receipt) {
  const failures = [];
  const click = receipt?.heldCover?.clicks?.[0], current = receipt?.heldCover?.current;
  const enriched = receipt?.enrichedCover;
  if (!visibleCover(enriched) || enriched.rootId !== current?.rootId || enriched.allyRows < 1 || enriched.enemyRows < 1) {
    failures.push('same_loader_not_enriched_after_real_import_release');
  }
  const released = receipt?.releasedRequest;
  if (released?.targetCount !== 1 || released.held !== false || released.releaseReason !== 'observed' || released.errors?.length) {
    failures.push('cold_import_release_incomplete_or_failed');
  }
  if (receipt?.targetResponse?.status !== 200 || receipt.targetResponse.sha256 !== receipt?.targetAssetSha256) {
    failures.push('released_target_response_did_not_match_build_asset');
  }
  if (receipt?.targetResponseCount !== 1) failures.push('missing_or_duplicate_target_response');
  const final = receipt?.completed;
  if (final?.phase !== 'battle' || final.battleOrdinal !== click?.before?.battleOrdinal + 1
    || !Number.isFinite(final.preBattleS) || final.preBattleS > 0 || final.resultPresent || final.displayed !== false) {
    failures.push('real_battle_not_completed_after_release');
  }
  return failures;
}

export function checkColdImportCover(receipt) {
  return [...checkHeldCover(receipt), ...checkReleasedCover(receipt)];
}
