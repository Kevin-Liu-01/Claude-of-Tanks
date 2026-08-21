import { mountBattleReels } from './battleReels.js';

const navLinks = [...document.querySelectorAll('.docs-toc a[href^="#"]')];
const sections = navLinks.map((link) => document.querySelector(link.hash)).filter(Boolean);

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    navLinks.forEach((link) => {
      const active = link.hash === `#${entry.target.id}`;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
}, { rootMargin: '-16% 0px -73%' });
sections.forEach((section) => observer.observe(section));

let toastTimer = 0;
function announce(message) {
  const toast = document.querySelector('#docsToast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
}

document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const target = document.querySelector(button.dataset.copy);
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target.textContent.trim());
      const original = button.textContent;
      button.textContent = 'Copied';
      announce('Copied to clipboard');
      setTimeout(() => { button.textContent = original; }, 1400);
    } catch (_) {
      announce('Clipboard permission unavailable');
    }
  });
});

document.querySelector('#docsMenu')?.addEventListener('click', () => {
  const toc = document.querySelector('.docs-toc');
  const open = toc.classList.toggle('open');
  document.querySelector('#docsMenu').setAttribute('aria-expanded', String(open));
});

navLinks.forEach((link) => link.addEventListener('click', () => {
  document.querySelector('.docs-toc').classList.remove('open');
  document.querySelector('#docsMenu')?.setAttribute('aria-expanded', 'false');
}));

mountBattleReels();
