// Public settings and small shared helpers. The publishable key belongs in the browser:
// what anyone can read or write is decided by Row Level Security, and only the two seats are members.
export const SUPABASE_URL = 'https://pyjqbnsuspmatwtgxgga.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_cYzfcf4DCauSUZDLLk7iGg_FkL0scIl';
export const BUCKET = 'chambre';
const DEFAULT_WORLD = '56852333-d542-4b43-8c09-f2219dc8f74d';
export const WORLD = (() => {
  const q = new URLSearchParams(location.search).get('w');
  try { if (q) localStorage.setItem('dk-world', q); return q || localStorage.getItem('dk-world') || DEFAULT_WORLD; } catch { return q || DEFAULT_WORLD; }
})();

// "keep the door open on this device" stores the session in localStorage; otherwise it dies with the tab
export const keepOpen = () => { try { return localStorage.getItem('dk-keep') === '1'; } catch { return false; } };
export function setKeepOpen(on) {
  try {
    const from = on ? sessionStorage : localStorage, to = on ? localStorage : sessionStorage;
    for (const k of Object.keys(from)) if (k.startsWith('dk-auth') || k.startsWith('dk-url')) { to.setItem(k, from.getItem(k)); from.removeItem(k); }
    on ? localStorage.setItem('dk-keep', '1') : localStorage.removeItem('dk-keep');
  } catch {}
}
export const box = () => (keepOpen() ? localStorage : sessionStorage);

let client = null;
export function sb() {
  if (!client) client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, detectSessionInUrl: false, autoRefreshToken: true, storageKey: 'dk-auth', storage: { getItem: (k) => box().getItem(k), setItem: (k, v) => box().setItem(k, v), removeItem: (k) => box().removeItem(k) } },
  });
  return client;
}

export async function door(action, body = {}) {
  const { data: { session } } = await sb().auth.getSession();
  const r = await fetch(`${SUPABASE_URL}/functions/v1/dk-enter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify({ world: WORLD, action, ...body }),
  });
  let j = {}; try { j = await r.json(); } catch {}
  return { status: r.status, ...j };
}

/* ---------- language ---------- */
const STR = {
  fr: {
    key: 'Ta clé', wrong: 'Pas cette clé.', resting: 'La porte se repose. Reviens dans {n} min.', offline: 'Pas de réseau.',
    welcome: 'Première fois ici.', yourName: 'Ton prénom', yourColor: 'Ta couleur', newKey: 'Ta clé à toi', newKey2: 'Encore une fois',
    keyRule: '6 caractères au moins', keyMismatch: 'Les deux clés diffèrent.', keyTaken: 'Choisis une autre clé.', keyWeak: '6 caractères au moins, différents de l’invitation.',
    enter: 'Entrer', tapToEnter: 'Toucher pour entrer',
    chambre: 'Chambre', planche: 'Planche', plancheTab: 'Planche', rouleaux: 'Rouleaux', echos: 'Échos', expose: 'Exposer', atelier: 'Atelier',
    today: 'Aujourd’hui', yearsAgo: 'Il y a {n} an|Il y a {n} ans', onThisDay: 'Ce jour-là', fromRoll: 'Du rouleau {r}',
    inTheDark: 'Dans le noir', darkFrom: '{n} tirage de {who} attend|{n} tirages de {who} attendent', developAll: 'Tout révéler', develop: 'Révéler',
    envelopes: 'Plis', opensIn: 'S’ouvre dans {n} j', opensToday: 'S’ouvre aujourd’hui', open: 'Ouvrir', sealedBy: 'Scellé par {who}', opened: 'Ouvert',
    dates: 'Dates', inDays: 'Dans {n} j', isToday: 'C’est aujourd’hui', nth: '{n} an|{n} ans',
    wrote: '{who} a écrit au dos', echoOfDay: 'Écho', anotherEcho: 'Un autre écho', apart: '{n} an d’écart|{n} ans d’écart', samePlace: 'Même endroit', sameDay: 'Même jour',
    emptyTitle: 'La chambre est encore vide.', emptyBody: 'Expose une première photo.', all: 'Tout', favorites: 'Favoris',
    photos: '{n} photo|{n} photos', newRoll: 'Nouveau rouleau', rollName: 'Nom du rouleau', noRolls: 'Aucun rouleau.', line: 'Fil', grid: 'Planche',
    back: 'Dos', front: 'Face', writeBack: 'Écrire au dos…', save: 'Enregistrer', cancel: 'Annuler', del: 'Supprimer', edit: 'Modifier', done: 'Terminé',
    title: 'Titre', caption: 'Légende', place: 'Lieu', date: 'Date', download: 'Original', favorite: 'Favori', addToRoll: 'Dans un rouleau', removeFromRoll: 'Retirer du rouleau', setCover: 'Couverture du rouleau',
    trash: 'Corbeille', trashEmpty: 'La corbeille est vide.', restore: 'Restaurer', deleteForever: 'Effacer', deleteForeverQ: 'Effacer définitivement {n} photo ? Impossible à annuler.|Effacer définitivement {n} photos ? Impossible à annuler.', trashKeep: 'Gardées 30 jours.',
    movedToTrash: '{n} photo à la corbeille|{n} photos à la corbeille', undo: 'Annuler',
    dropHere: 'Dépose tes photos ici', choose: 'Choisir des photos', into: 'Dans', noRoll: 'Aucun rouleau', seal: 'Sceller jusqu’au', sealHint: 'Invisible pour l’autre jusqu’à cette date.', message: 'Un mot', envTitle: 'Titre du pli',
    uploading: 'Exposition {a} / {b}', uploaded: '{n} photo exposée|{n} photos exposées', dup: '{n} déjà là', failed: '{n} échec|{n} échecs',
    select: 'Choisir', selected: '{n} choisie|{n} choisies', selectAll: 'Tout', move: 'Déplacer', setDate: 'Changer la date',
    settings: 'Réglages', me: 'Moi', worldName: 'Nom du monde', keep: 'Garder la porte ouverte sur cet appareil', changeKey: 'Changer ma clé', oldKey: 'Clé actuelle', keyChanged: 'Clé changée.',
    otherKey: 'Nouvelle clé pour {who}', otherKeyQ: 'Créer une nouvelle clé d’invitation pour {who} ? L’ancienne ne marchera plus.', otherKeyIs: 'Clé à usage unique pour {who} :', copy: 'Copier', copied: 'Copié',
    lock: 'Fermer la porte', export: 'Exporter', exportAll: 'Tout exporter', exporting: 'Préparation {a} / {b}', language: 'Langue',
    newDate: 'Nouvelle date', yearly: 'Chaque année', dateName: 'Ce qui s’est passé',
    renameRoll: 'Renommer', deleteRoll: 'Supprimer le rouleau', deleteRollQ: 'Supprimer « {r} » ? Les photos restent dans la planche.', rollUp: 'Monter', rollDown: 'Descendre',
    other: 'l’autre', you: 'toi', nobody: 'personne', confirm: 'Confirmer', close: 'Fermer', sorted: 'Ordre', byDate: 'Par date', custom: 'Libre',
    newEnvelope: 'Nouveau pli', envEmpty: 'Rien de scellé.', arrived: '{who} vient d’exposer {n} photo|{who} vient d’exposer {n} photos', more: 'Plus', random: 'Au hasard',
    storage: '{a} utilisés', none: 'Rien ici.', untitled: 'Sans titre', noDate: 'Sans date',
  },
  en: {
    key: 'Your key', wrong: 'Not this key.', resting: 'The door is resting. Come back in {n} min.', offline: 'No network.',
    welcome: 'First time here.', yourName: 'Your name', yourColor: 'Your colour', newKey: 'Your own key', newKey2: 'Once more',
    keyRule: 'At least 6 characters', keyMismatch: 'The two keys differ.', keyTaken: 'Choose another key.', keyWeak: 'At least 6 characters, not the invitation.',
    enter: 'Enter', tapToEnter: 'Touch to enter',
    chambre: 'Darkroom', planche: 'Contact sheet', plancheTab: 'Sheet', rouleaux: 'Rolls', echos: 'Echoes', expose: 'Expose', atelier: 'Workshop',
    today: 'Today', yearsAgo: '{n} year ago|{n} years ago', onThisDay: 'On this day', fromRoll: 'From the roll {r}',
    inTheDark: 'In the dark', darkFrom: '{n} print from {who} is waiting|{n} prints from {who} are waiting', developAll: 'Develop all', develop: 'Develop',
    envelopes: 'Sealed', opensIn: 'Opens in {n} d', opensToday: 'Opens today', open: 'Open', sealedBy: 'Sealed by {who}', opened: 'Opened',
    dates: 'Dates', inDays: 'In {n} d', isToday: 'It is today', nth: '{n} year|{n} years',
    wrote: '{who} wrote on the back', echoOfDay: 'Echo', anotherEcho: 'Another echo', apart: '{n} year apart|{n} years apart', samePlace: 'Same place', sameDay: 'Same day',
    emptyTitle: 'The darkroom is still empty.', emptyBody: 'Expose a first photograph.', all: 'All', favorites: 'Favourites',
    photos: '{n} photo|{n} photos', newRoll: 'New roll', rollName: 'Roll name', noRolls: 'No rolls yet.', line: 'Line', grid: 'Sheet',
    back: 'Back', front: 'Front', writeBack: 'Write on the back…', save: 'Save', cancel: 'Cancel', del: 'Delete', edit: 'Edit', done: 'Done',
    title: 'Title', caption: 'Caption', place: 'Place', date: 'Date', download: 'Original', favorite: 'Favourite', addToRoll: 'Into a roll', removeFromRoll: 'Remove from roll', setCover: 'Roll cover',
    trash: 'Bin', trashEmpty: 'The bin is empty.', restore: 'Restore', deleteForever: 'Erase', deleteForeverQ: 'Erase {n} photo for good? This cannot be undone.|Erase {n} photos for good? This cannot be undone.', trashKeep: 'Kept for 30 days.',
    movedToTrash: '{n} photo moved to the bin|{n} photos moved to the bin', undo: 'Undo',
    dropHere: 'Drop your photographs here', choose: 'Choose photographs', into: 'Into', noRoll: 'No roll', seal: 'Seal until', sealHint: 'Hidden from the other one until that date.', message: 'A note', envTitle: 'Envelope title',
    uploading: 'Exposing {a} / {b}', uploaded: '{n} photo exposed|{n} photos exposed', dup: '{n} already here', failed: '{n} failed|{n} failed',
    select: 'Select', selected: '{n} selected|{n} selected', selectAll: 'All', move: 'Move', setDate: 'Change date',
    settings: 'Settings', me: 'Me', worldName: 'World name', keep: 'Keep the door open on this device', changeKey: 'Change my key', oldKey: 'Current key', keyChanged: 'Key changed.',
    otherKey: 'New key for {who}', otherKeyQ: 'Create a new invitation key for {who}? The old one will stop working.', otherKeyIs: 'One-time key for {who}:', copy: 'Copy', copied: 'Copied',
    lock: 'Close the door', export: 'Export', exportAll: 'Export everything', exporting: 'Preparing {a} / {b}', language: 'Language',
    newDate: 'New date', yearly: 'Every year', dateName: 'What happened',
    renameRoll: 'Rename', deleteRoll: 'Delete roll', deleteRollQ: 'Delete “{r}”? The photos stay on the contact sheet.', rollUp: 'Up', rollDown: 'Down',
    other: 'the other one', you: 'you', nobody: 'nobody', confirm: 'Confirm', close: 'Close', sorted: 'Order', byDate: 'By date', custom: 'Custom',
    newEnvelope: 'New envelope', envEmpty: 'Nothing sealed.', arrived: '{who} just exposed {n} photo|{who} just exposed {n} photos', more: 'More', random: 'At random',
    storage: '{a} used', none: 'Nothing here.', untitled: 'Untitled', noDate: 'No date',
  },
};
export let LANG = (() => { try { return localStorage.getItem('dk-lang'); } catch { return null; } })() || ((navigator.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en');
export function setLang(l) { LANG = l; try { localStorage.setItem('dk-lang', l); } catch {} document.documentElement.lang = l; }
document.documentElement.lang = LANG;
export function t(key, vars = {}) {
  let s = STR[LANG][key] ?? STR.fr[key] ?? key;
  if (s.includes('|')) { const [one, many] = s.split('|'); s = Math.abs(vars.n ?? 0) === 1 ? one : many; }
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

/* ---------- small helpers ---------- */
export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function h(html) { const tpl = document.createElement('template'); tpl.innerHTML = html.trim(); return tpl.content.firstElementChild; }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const locale = () => (LANG === 'fr' ? 'fr-FR' : 'en-GB');
export const fmtDay = (d) => new Date(d).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });
export const fmtMonth = (d) => new Date(d).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
export const fmtMonthOnly = (d) => new Date(d).toLocaleDateString(locale(), { month: 'long' });
export const fmtWeekday = (d) => new Date(d).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
// the orange date imprint of old film cameras:  '21 7 14
export function stamp(d) {
  if (!d) return '';
  const x = new Date(d);
  return `'${String(x.getFullYear()).slice(2)} ${x.getMonth() + 1} ${String(x.getDate()).padStart(2, ' ')}`;
}
export const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
export const bytes = (n) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} Go` : n > 1e6 ? `${Math.round(n / 1e6)} Mo` : `${Math.round(n / 1e3)} ko`).replace('Go', LANG === 'fr' ? 'Go' : 'GB').replace('Mo', LANG === 'fr' ? 'Mo' : 'MB').replace('ko', LANG === 'fr' ? 'ko' : 'KB');

// a seeded random, so "the print of the day" is the same on both phones
export function seeded(str) {
  let x = 2166136261;
  for (const c of str) x = Math.imul(x ^ c.charCodeAt(0), 16777619);
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 1e9) / 1e9; };
}

let toastTimer;
export function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { el.classList.remove('on'); action.run(); };
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), action ? 6000 : 3200);
}

// a calm modal in the same language as the rest; resolves with the clicked value
export function ask({ title = '', body = '', html = '', actions = [{ label: t('cancel'), value: false }, { label: t('confirm'), value: true, danger: false }] } = {}) {
  return new Promise((resolve) => {
    const el = h(`<div class="modal" role="dialog" aria-modal="true"><div class="modal-card">
      ${title ? `<h3>${esc(title)}</h3>` : ''}${body ? `<p>${esc(body)}</p>` : ''}${html}
      <div class="modal-actions">${actions.map((a, i) => `<button type="button" class="btn ${a.danger ? 'danger' : ''} ${i === actions.length - 1 ? 'primary' : ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>
    </div></div>`);
    const close = (v) => { el.classList.remove('on'); setTimeout(() => el.remove(), 220); document.removeEventListener('keydown', key); resolve(v); };
    const key = (e) => { if (e.key === 'Escape') close(false); };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) { const a = actions[+b.dataset.i]; close(typeof a.value === 'function' ? a.value(el) : a.value); }
      else if (e.target === el) close(false);
    });
    document.addEventListener('keydown', key);
    document.body.append(el);
    requestAnimationFrame(() => { el.classList.add('on'); (el.querySelector('input,textarea,select') || el.querySelector('.primary'))?.focus(); });
  });
}
