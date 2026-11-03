import { sb, t, $, $$, esc, h, keepOpen, toast } from './core.js';
import { S, load, live, onChange, purgeOld, nameOf } from './store.js';
import { lockedDoor, touchDoor, openDoor } from './door.js';
import { views } from './views.js';
import { atelier } from './atelier.js';

const ICON = {
  chambre: '<svg viewBox="0 0 24 24"><circle cx="12" cy="11" r="4"/><path d="M12 3v2M12 17v4M8 21h8"/></svg>',
  planche: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 8h18M3 16h18M7 4v4M11 4v4M15 4v4M7 16v4M11 16v4M15 16v4"/></svg>',
  rouleaux: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="10" height="14" rx="2"/><path d="M15 8h4v8h-4M8 3v2M12 3v2"/></svg>',
  echos: '<svg viewBox="0 0 24 24"><rect x="2.5" y="7" width="7" height="10"/><rect x="14.5" y="7" width="7" height="10"/><path d="M9.5 12h5" stroke-dasharray="1.5 1.5"/></svg>',
  expose: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  atelier: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>',
};
const TABS = ['chambre', 'planche', 'rouleaux', 'echos'];

function shell() {
  const app = $('#app');
  app.innerHTML = `
    <header class="top">
      <a class="brand" href="#/"><i class="dot"></i><span></span></a>
      <nav class="tabs">${TABS.map((k) => `<a href="#/${k === 'chambre' ? '' : k}" data-tab="${k}">${ICON[k]}<span>${esc(t(k === 'planche' ? 'plancheTab' : k))}</span></a>`).join('')}
        <a href="#/exposer" data-tab="exposer" class="plus">${ICON.expose}<span>${esc(t('expose'))}</span></a>
        <a href="#/atelier" data-tab="atelier">${ICON.atelier}<span>${esc(t('atelier'))}</span></a>
      </nav>
    </header>
    <main id="view" tabindex="-1"></main>`;
  paintBrand();
}
function paintBrand() {
  const b = $('.brand span', $('#app'));
  if (b) b.textContent = S.world?.name || 'Chambre noire';
  document.title = S.world?.name || 'Chambre noire';
  document.documentElement.style.setProperty('--me', S.me?.color || '#e3a35c');
  document.documentElement.style.setProperty('--them', S.other?.color || '#86a9c9');
}

let current = null;
export async function route() {
  const [, name = '', arg = ''] = location.hash.replace(/^#/, '').split('/');
  const key = name || 'chambre';
  $$('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === key || (key === 'rouleau' && a.dataset.tab === 'rouleaux') || (['corbeille', 'dates', 'plis', 'reglages'].includes(key) && a.dataset.tab === 'atelier')));
  const view = $('#view');
  current?.leave?.();
  view.innerHTML = '';
  view.className = `view v-${key}`;
  const fn = views[key] || atelier[key] || views.chambre;
  current = (await fn(view, arg)) || null;
  if (!history.state?.keepScroll) window.scrollTo(0, 0);
}

async function inside() {
  await load();
  shell();
  $('#app').hidden = false;
  await route();
  window.addEventListener('hashchange', route);
  onChange((w) => { if (w === 'me' || w === 'world') paintBrand(); if (['photo', 'album', 'note', 'date', 'envelope', 'seen'].includes(w)) current?.refresh?.(w); });
  let arrivals = 0, timer;
  live(() => {
    arrivals++;
    clearTimeout(timer);
    timer = setTimeout(() => { toast(t('arrived', { who: nameOf(S.other?.user_id), n: arrivals }), { label: t('inTheDark'), run: () => (location.hash = '#/') }); arrivals = 0; }, 1500);
  });
  purgeOld().catch(() => {});
}

async function start() {
  const { data: { session } } = await sb().auth.getSession();
  let ok = false;
  if (session) {
    const { data, error } = await sb().auth.getUser();
    ok = !!data?.user && !error;
  }
  if (ok) await touchDoor(); else await lockedDoor();
  try { await inside(); }
  catch (e) {
    console.error(e);
    await sb().auth.signOut().catch(() => {});
    location.reload();
    return;
  }
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', '#f1ece3');
  await openDoor();
}

export async function lock() {
  await sb().auth.signOut().catch(() => {});
  try { sessionStorage.clear(); localStorage.removeItem('dk-urls'); } catch {}
  location.hash = '';
  location.reload();
}

sb().auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT' && !$('#app').hidden) location.reload(); });
start();
