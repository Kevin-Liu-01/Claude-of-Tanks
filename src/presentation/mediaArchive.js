const MANIFEST_URL = '/media/showcase-r1/manifest.json';
let manifestPromise;

export function loadPresentationManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST_URL).then((response) => {
      if (!response.ok) throw new Error(`Presentation archive unavailable (${response.status})`);
      return response.json();
    });
  }
  return manifestPromise;
}

function ensureLightbox() {
  let dialog = document.querySelector('.media-lightbox');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'media-lightbox';
  dialog.innerHTML = `<figure><img alt=""><figcaption><div><span></span><strong></strong><small></small></div><button type="button" aria-label="Close full-screen image">×</button></figcaption></figure>`;
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  document.body.appendChild(dialog);
  return dialog;
}

function openShot(shot) {
  const dialog = ensureLightbox();
  const image = dialog.querySelector('img');
  image.src = shot.src;
  image.alt = shot.alt;
  dialog.querySelector('span').textContent = `${shot.feature} // ${shot.map}`;
  dialog.querySelector('strong').textContent = shot.title;
  dialog.querySelector('small').textContent = shot.effects?.length ? shot.effects.join(' · ').replaceAll('_', ' ') : 'Live renderer capture';
  dialog.showModal();
}

function shotCard(shot, index) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'media-archive-card';
  button.setAttribute('aria-label', `Open ${shot.title}`);
  const image = document.createElement('img');
  image.src = shot.src;
  image.alt = shot.alt;
  image.loading = index < 3 ? 'eager' : 'lazy';
  image.decoding = 'async';
  const copy = document.createElement('span');
  copy.className = 'media-archive-card-copy';
  copy.innerHTML = `<span><span>${shot.feature}</span><strong>${shot.title}</strong></span><small>${shot.map}</small>`;
  const count = document.createElement('span');
  count.className = 'media-archive-card-index';
  count.textContent = String(shot.sequence || index + 1).padStart(2, '0');
  button.append(image, copy, count);
  button.addEventListener('click', () => openShot(shot));
  return button;
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

export async function mountMediaArchive(root, options = {}) {
  if (!root || root.dataset.mediaMounted === 'true') return null;
  root.dataset.mediaMounted = 'true';
  root.classList.add('media-archive');
  if (options.mode) root.classList.add(`media-archive--${options.mode}`);
  const manifest = await loadPresentationManifest();
  const allowedKinds = options.kinds?.length ? new Set(options.kinds.map(normalize)) : null;
  const source = manifest.shots.filter((shot) => !allowedKinds || allowedKinds.has(normalize(shot.kind)));
  const limit = Number.isFinite(options.limit) ? options.limit : source.length;
  const pageSize = Number.isFinite(options.pageSize) ? Math.max(1, options.pageSize) : limit;
  let visibleLimit = Math.min(pageSize, limit);
  let active = normalize(options.feature || 'all');

  const toolbar = document.createElement('div');
  toolbar.className = 'media-archive-toolbar';
  const filters = document.createElement('div');
  filters.className = 'media-archive-filters';
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', 'Filter captured game frames');
  const count = document.createElement('output');
  count.className = 'media-archive-count';
  const status = document.createElement('div');
  status.className = 'media-archive-status';
  const loadMore = document.createElement('button');
  loadMore.type = 'button';
  loadMore.className = 'media-archive-more';
  const grid = document.createElement('div');
  grid.className = 'media-archive-grid';

  const featureOrder = ['all', 'studio direction', 'interface', 'killcam', 'gunnery', 'destruction', 'armor impacts', 'track physics', 'world system', 'tank design', 'battlefield atmosphere'];
  const available = new Set(source.map((shot) => normalize(shot.feature)));
  const features = featureOrder.filter((feature) => feature === 'all' || available.has(feature));
  function render() {
    const filtered = source.filter((shot) => active === 'all' || normalize(shot.feature) === active).slice(0, limit);
    const visible = filtered.slice(0, visibleLimit);
    grid.replaceChildren(...visible.map(shotCard));
    count.value = `${String(visible.length).padStart(2, '0')} / ${String(filtered.length).padStart(2, '0')} frames`;
    const remaining = filtered.length - visible.length;
    loadMore.hidden = remaining <= 0;
    loadMore.textContent = remaining > 0 ? `Load ${Math.min(pageSize, remaining)} more` : '';
    filters.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.feature === active)));
  }
  if (options.filters !== false) {
    for (const feature of features) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'media-archive-filter';
      button.dataset.feature = feature;
      button.textContent = feature;
      button.setAttribute('aria-pressed', String(feature === active));
      button.addEventListener('click', () => { active = feature; visibleLimit = Math.min(pageSize, limit); render(); });
      filters.appendChild(button);
    }
  }
  loadMore.addEventListener('click', () => { visibleLimit = Math.min(limit, visibleLimit + pageSize); render(); });
  status.append(count, loadMore);
  toolbar.append(filters, status);
  root.replaceChildren(toolbar, grid);
  render();
  return { manifest, render, root };
}

export function autoMountMediaArchives(scope = document) {
  for (const root of scope.querySelectorAll('[data-media-archive]')) {
    const kinds = root.dataset.kinds ? root.dataset.kinds.split(',') : undefined;
    mountMediaArchive(root, {
      mode: root.dataset.mode || undefined,
      limit: root.dataset.limit ? Number(root.dataset.limit) : undefined,
      pageSize: root.dataset.pageSize ? Number(root.dataset.pageSize) : undefined,
      feature: root.dataset.feature || undefined,
      kinds,
      filters: root.dataset.filters !== 'false',
    }).catch((error) => {
      root.innerHTML = `<p class="media-archive-count">${error.message}</p>`;
    });
  }
}
