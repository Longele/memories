// Full screen, nothing between you and the photograph. Swipe, pinch, double tap; turn the print to read its back.
import { $, $$, esc, h, t, stamp, fmtWeekday, toast, ask, reduced } from './core.js';
import { S, url, downloadUrl, updatePhoto, toBin, restore, addNote, deleteNote, markSeen, isMine, nameOf, colorOf, albumsOf, addToAlbum, removeFromAlbum, updateAlbum, createAlbum } from './store.js';

let V = null;
const root = () => $('#viewer');

export function openViewer(list, index = 0, opts = {}) {
  if (!list.length) return;
  closeViewer(true);
  V = { list, i: Math.max(0, Math.min(index, list.length - 1)), opts, z: 1, x: 0, y: 0, flipped: false, idle: null };
  const el = root();
  el.innerHTML = `
    <div class="vw-stage"><div class="card"><div class="face front"><img class="lq" alt=""><img class="im" alt=""><i class="wash"></i></div><div class="face backside"></div></div></div>
    <header class="vw-top">
      <button type="button" class="ic close" aria-label="${esc(t('close'))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <span class="count"></span>
      <span class="sp"></span>
      <button type="button" class="ic fav" aria-label="${esc(t('favorite'))}"><svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg></button>
      <button type="button" class="ic flip" aria-label="${esc(t('back'))}"><svg viewBox="0 0 24 24"><path d="M4 7h11a5 5 0 0 1 0 10H8"/><path d="M8 3L4 7l4 4"/></svg><span>${esc(t('back'))}</span></button>
      <button type="button" class="ic dl" aria-label="${esc(t('download'))}"><svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg></button>
      <button type="button" class="ic more" aria-label="${esc(t('more'))}"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg></button>
    </header>
    <button type="button" class="nav prev" aria-label="←"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
    <button type="button" class="nav next" aria-label="→"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
    <footer class="vw-cap"></footer>`;
  el.hidden = false;
  el.classList.toggle('bath', !!opts.bath);
  document.body.classList.add('viewing');
  requestAnimationFrame(() => el.classList.add('on'));
  $('.close', el).onclick = () => closeViewer();
  $('.prev', el).onclick = () => go(-1);
  $('.next', el).onclick = () => go(1);
  $('.fav', el).onclick = toggleFav;
  $('.flip', el).onclick = flip;
  $('.dl', el).onclick = download;
  $('.more', el).onclick = more;
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', fit);
  el.addEventListener('pointermove', wake);
  gestures($('.vw-stage', el));
  history.pushState({ viewer: 1 }, '');
  window.addEventListener('popstate', onPop);
  show(0);
}

function onPop() { if (V) closeViewer(true); }
export function closeViewer(silent) {
  if (!V) return;
  const el = root();
  const { opts } = V;
  clearTimeout(V.auto); clearTimeout(V.idle);
  V = null;
  document.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', fit);
  window.removeEventListener('popstate', onPop);
  document.body.classList.remove('viewing');
  el.classList.remove('on');
  setTimeout(() => { if (!V) { el.hidden = true; el.innerHTML = ''; } }, 260);
  if (!silent && history.state?.viewer) history.back();
  opts.onClose?.();
}

const cur = () => V.list[V.i];
function onKey(e) {
  if (!V || e.target.closest('input,textarea,select')) return;
  if (e.key === 'ArrowRight') go(1);
  else if (e.key === 'ArrowLeft') go(-1);
  else if (e.key === 'Escape') V.flipped ? flip() : closeViewer();
  else if (e.key === 'f') toggleFav();
  else if (e.key === 'b' || e.key === 'Enter') flip();
}
function wake() {
  const el = root(); el.classList.remove('idle');
  clearTimeout(V?.idle);
  if (V) V.idle = setTimeout(() => el.classList.add('idle'), 2600);
}

function fit() {
  if (!V) return;
  const p = cur(), el = root(), card = $('.card', el);
  const sw = innerWidth, sh = innerHeight;
  const pad = sw < 700 ? 0 : 56, top = sw < 700 ? 56 : 72, bottom = sw < 700 ? 76 : 88;
  const r = p.w && p.h ? p.w / p.h : 1.5;
  let w = sw - pad * 2, hh = w / r;
  const maxH = sh - top - bottom;
  if (hh > maxH) { hh = maxH; w = hh * r; }
  if (V.flipped) { w = Math.min(sw - 24, Math.max(w, 340, Math.min(560, sw - 24))); hh = Math.min(sh - top - 24, Math.max(hh, 460)); }
  card.style.width = `${w}px`; card.style.height = `${hh}px`;
  card.style.marginTop = `${(top - bottom) / 2}px`;
}

async function show(dir) {
  const el = root(), p = cur(), card = $('.card', el);
  V.z = 1; V.x = 0; V.y = 0; applyZoom();
  if (V.flipped) { V.flipped = false; card.classList.remove('flipped'); el.classList.remove('flipped'); }
  const front = $('.front', el), lq = $('.lq', front), im = $('.im', front);
  front.style.setProperty('--c', p.color || '#222');
  el.style.setProperty('--vc', p.color || '#000');
  lq.src = p.lqip || '';
  im.classList.remove('in'); im.removeAttribute('src');
  const develop = V.opts.bath || (!isMine(p) && !S.seen.has(p.id));
  front.classList.remove('developing');
  card.classList.remove('slide-l', 'slide-r');
  if (dir && !reduced()) { void card.offsetWidth; card.classList.add(dir > 0 ? 'slide-l' : 'slide-r'); }
  fit();
  paintTop(); paintCap();
  const token = (V.token = Symbol());
  const u = await url(p, 'd');
  if (!V || V.token !== token) return;
  im.onload = () => {
    if (!V || V.token !== token) return;
    im.classList.add('in');
    if (develop && !reduced()) { void front.offsetWidth; front.classList.add('developing'); }
  };
  im.src = u;
  if (!isMine(p)) markSeen([p.id]);
  // the neighbours, so swiping feels instant
  [V.list[V.i + 1], V.list[V.i - 1]].filter(Boolean).forEach((n) => url(n, 'd').then((x) => { if (x) new Image().src = x; }));
  clearTimeout(V.auto);
  if (V.opts.bath) V.auto = setTimeout(() => (V.i < V.list.length - 1 ? go(1) : endBath()), 4200);
  wake();
}
function endBath() { const n = V.list.length; closeViewer(); toast(t('photos', { n })); }

function go(d) {
  if (!V) return;
  const n = V.i + d;
  if (n < 0 || n >= V.list.length) { if (V.opts.bath && n >= V.list.length) endBath(); else nudge(d); return; }
  V.i = n; show(d);
}
function nudge(d) { const c = $('.card', root()); c.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-d * 18}px)` }, { transform: 'translateX(0)' }], { duration: 260, easing: 'ease-out' }); }

function paintTop() {
  const el = root(), p = cur();
  $('.count', el).textContent = V.list.length > 1 ? `${V.i + 1} / ${V.list.length}` : '';
  $('.fav', el).classList.toggle('on', !!p.favorite);
  $('.prev', el).hidden = V.i === 0;
  $('.next', el).hidden = V.i === V.list.length - 1;
  const notes = S.notes.get(p.id) || [];
  $('.flip', el).classList.toggle('has', notes.length > 0 || !!p.caption);
}
function paintCap() {
  const p = cur(), bits = [];
  if (p.title) bits.push(`<b>${esc(p.title)}</b>`);
  if (p.place) bits.push(`<span>${esc(p.place)}</span>`);
  $('.vw-cap', root()).innerHTML = `${p.taken_at ? `<s class="stamp">${esc(stamp(p.taken_at))}</s>` : ''}<span class="cap-t">${bits.join('<i>·</i>')}</span>`;
}

async function toggleFav() {
  const p = cur();
  const d = await updatePhoto(p.id, { favorite: !p.favorite });
  V.list[V.i] = d; paintTop();
}
async function download() {
  const u = await downloadUrl(cur());
  if (!u) return;
  const a = document.createElement('a'); a.href = u; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove();
}

/* ---------- the back of the print ---------- */
function flip() {
  const el = root(), card = $('.card', el);
  V.flipped = !V.flipped;
  if (V.flipped) paintBack();
  card.classList.toggle('flipped', V.flipped);
  el.classList.toggle('flipped', V.flipped);
  $('.flip span', el).textContent = V.flipped ? t('front') : t('back');
  V.z = 1; applyZoom();
  fit();
}
function paintBack(editing = false) {
  const p = cur(), back = $('.backside', root());
  const notes = S.notes.get(p.id) || [];
  const rolls = albumsOf(p.id);
  const dateVal = p.taken_at ? new Date(new Date(p.taken_at).getTime() - new Date(p.taken_at).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  back.innerHTML = editing ? `
    <form class="back-edit">
      <label><span>${esc(t('title'))}</span><input name="title" value="${esc(p.title || '')}" maxlength="120"></label>
      <label><span>${esc(t('date'))}</span><input name="taken_at" type="datetime-local" value="${dateVal}"></label>
      <label><span>${esc(t('place'))}</span><input name="place" value="${esc(p.place || '')}" maxlength="120"></label>
      <label><span>${esc(t('caption'))}</span><textarea name="caption" rows="4" maxlength="2000">${esc(p.caption || '')}</textarea></label>
      <div class="row-btns"><button type="button" class="btn ghost cancel">${esc(t('cancel'))}</button><button class="btn primary">${esc(t('save'))}</button></div>
    </form>` : `
    <div class="back-paper">
      <div class="back-head">
        ${p.taken_at ? `<p class="hand-date">${esc(fmtWeekday(p.taken_at))} ${new Date(p.taken_at).getFullYear()}</p>` : ''}
        ${p.title ? `<h4 class="hand-title">${esc(p.title)}</h4>` : ''}
        ${p.place ? `<p class="hand-place">${esc(p.place)}</p>` : ''}
        ${p.caption ? `<p class="hand-cap">${esc(p.caption)}</p>` : ''}
        <button type="button" class="pencil">${esc(t('edit'))}</button>
      </div>
      <ul class="notes">${notes.map((n) => `<li style="--who:${colorOf(n.author)}" data-id="${n.id}"><p>${esc(n.body)}</p><span class="sig">${esc(nameOf(n.author))}</span>${n.author === S.user.id ? `<button type="button" class="rm" aria-label="${esc(t('del'))}">×</button>` : ''}</li>`).join('')}</ul>
      <form class="write"><textarea name="body" rows="2" maxlength="2000" placeholder="${esc(t('writeBack'))}"></textarea><button class="btn small">${esc(t('save'))}</button></form>
      <p class="back-foot">${rolls.map((r) => `<a href="#/rouleau/${r.id}">${esc(r.title)}</a>`).join(' · ')}${p.filename ? `<span>${esc(p.filename)}</span>` : ''}<span>${esc(nameOf(p.created_by))}</span></p>
    </div>`;
  if (editing) {
    const f = $('.back-edit', back);
    $('.cancel', f).onclick = () => paintBack();
    f.onsubmit = async (e) => {
      e.preventDefault();
      const patch = { title: f.title.value.trim() || null, place: f.place.value.trim() || null, caption: f.caption.value.trim() || null, taken_at: f.taken_at.value ? new Date(f.taken_at.value).toISOString() : null };
      V.list[V.i] = await updatePhoto(p.id, patch);
      paintBack(); paintCap();
    };
    return;
  }
  $('.pencil', back).onclick = () => paintBack(true);
  const w = $('.write', back);
  w.onsubmit = async (e) => { e.preventDefault(); const b = w.body.value.trim(); if (!b) return; await addNote(p.id, b); paintBack(); paintTop(); };
  w.body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) w.requestSubmit(); });
  $$('.rm', back).forEach((b) => (b.onclick = async () => { const n = notes.find((x) => x.id === b.closest('li').dataset.id); if (await ask({ body: t('del') + ' ?', actions: [{ label: t('cancel'), value: false }, { label: t('del'), value: true, danger: true }] })) { await deleteNote(n); paintBack(); } }));
}

/* ---------- more: rolls, cover, bin ---------- */
async function more() {
  const p = cur(), album = V.opts.album;
  const acts = [
    { k: 'roll', label: t('addToRoll') },
    ...(album ? [{ k: 'cover', label: t('setCover') }, { k: 'out', label: t('removeFromRoll') }] : []),
    { k: 'edit', label: t('edit') },
    { k: 'bin', label: t('trash'), danger: true },
  ];
  const k = await ask({ html: `<div class="menu">${acts.map((a) => `<button type="button" class="${a.danger ? 'danger' : ''}" data-k="${a.k}">${esc(a.label)}</button>`).join('')}</div>`, actions: [{ label: t('close'), value: false }] , pick: true });
  void k;
}
// the menu uses data-k buttons; catch them globally while the viewer is open
document.addEventListener('click', async (e) => {
  const b = e.target.closest('.modal .menu [data-k]');
  if (!b || !V) return;
  const modal = b.closest('.modal'); modal.querySelector('[data-i]')?.click();
  const p = cur(), album = V.opts.album;
  if (b.dataset.k === 'roll') { const a = await pickRoll(); if (a) { await addToAlbum([p.id], a); toast(`${a.title} ✓`); } }
  if (b.dataset.k === 'cover' && album) { await updateAlbum(album.id, { cover_id: p.id }); toast(t('setCover') + ' ✓'); }
  if (b.dataset.k === 'out' && album) { await removeFromAlbum([p.id], album); dropCurrent(); }
  if (b.dataset.k === 'edit') { if (!V.flipped) flip(); paintBack(true); }
  if (b.dataset.k === 'bin') {
    await toBin([p.id]);
    dropCurrent();
    toast(t('movedToTrash', { n: 1 }), { label: t('undo'), run: () => restore([p.id]) });
  }
});
function dropCurrent() {
  V.list.splice(V.i, 1);
  if (!V.list.length) return closeViewer();
  V.i = Math.min(V.i, V.list.length - 1); show(0);
}

export async function pickRoll(exclude = null) {
  const rolls = S.albums.filter((a) => a.id !== exclude);
  const v = await ask({
    title: t('addToRoll'),
    html: `<div class="menu rolls">${rolls.map((a) => `<label><input type="radio" name="roll" value="${a.id}"><span>${esc(a.title)}</span><small>${a.ids.length}</small></label>`).join('')}
      <label class="new"><input type="radio" name="roll" value="__new" ${rolls.length ? '' : 'checked'}><input class="nn" placeholder="${esc(t('newRoll'))}" maxlength="80"></label></div>`,
    actions: [{ label: t('cancel'), value: false }, { label: t('save'), value: (m) => ({ id: m.querySelector('input[name=roll]:checked')?.value, name: m.querySelector('.nn').value.trim() }) }],
  });
  if (!v || !v.id) return null;
  if (v.id === '__new') return v.name ? createAlbum(v.name) : null;
  return S.albums.find((a) => a.id === v.id) || null;
}
document.addEventListener('focusin', (e) => { if (e.target.matches?.('.menu.rolls .nn')) e.target.closest('label').querySelector('input[type=radio]').checked = true; });

/* ---------- touch: swipe, pinch, double tap, pan ---------- */
function applyZoom() {
  const im = $('.front', root());
  if (!im) return;
  im.style.transform = V && V.z > 1 ? `translate(${V.x}px, ${V.y}px) scale(${V.z})` : '';
  root().classList.toggle('zoomed', !!V && V.z > 1);
}
let fullLoaded = null;
function loadFull() {
  const p = cur();
  if (fullLoaded === p.id || !/^(jpe?g|png|webp|avif|gif)$/i.test(p.ext || '')) return;
  fullLoaded = p.id;
  url(p, 'o').then((u) => { if (u && V && cur().id === p.id) { const im = $('.front .im', root()); const n = new Image(); n.onload = () => { if (V && cur().id === p.id) im.src = u; }; n.src = u; } });
}
function gestures(stage) {
  const pts = new Map();
  let start = null, lastTap = 0, pinch = null, moved = false;
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.backside')) return;
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (pts.size === 1) start = { x: e.clientX, y: e.clientY, vx: V.x, vy: V.y, t: performance.now() };
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: V.z }; }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !V) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()];
      V.z = Math.max(1, Math.min(6, (pinch.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d));
      if (V.z > 1.6) loadFull();
      applyZoom(); moved = true; return;
    }
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) > 6) moved = true;
    if (V.z > 1) { V.x = start.vx + dx; V.y = start.vy + dy; applyZoom(); return; }
    if (V.flipped) return;
    $('.card', root()).style.transform = `translateX(${dx}px) rotate(${dx / 60}deg)`;
    if (dy > 0 && Math.abs(dy) > Math.abs(dx)) { $('.card', root()).style.transform = `translateY(${dy}px) scale(${1 - Math.min(dy, 300) / 1500})`; root().style.setProperty('--fade', String(1 - Math.min(dy, 300) / 400)); }
  });
  const up = (e) => {
    if (!pts.has(e.pointerId) || !V) return;
    pts.delete(e.pointerId);
    if (pts.size === 1) { const [a] = [...pts.values()]; start = { x: a.x, y: a.y, vx: V.x, vy: V.y, t: performance.now() }; pinch = null; return; }
    if (pts.size) return;
    pinch = null;
    const card = $('.card', root());
    const dx = e.clientX - (start?.x ?? e.clientX), dy = e.clientY - (start?.y ?? e.clientY);
    card.style.transform = ''; root().style.removeProperty('--fade');
    if (V.z <= 1 && !V.flipped && moved) {
      if (dy > 120 && Math.abs(dy) > Math.abs(dx)) return closeViewer();
      if (Math.abs(dx) > 60) return go(dx < 0 ? 1 : -1);
    }
    if (!moved && !V.flipped) {
      const now = performance.now();
      if (now - lastTap < 300) {
        // double tap: zoom on that point, or back to fit
        if (V.z > 1) { V.z = 1; V.x = 0; V.y = 0; } else { const r = card.getBoundingClientRect(); V.z = 2.6; V.x = (r.left + r.width / 2 - e.clientX) * 1.6; V.y = (r.top + r.height / 2 - e.clientY) * 1.6; loadFull(); }
        applyZoom(); lastTap = 0;
      } else {
        lastTap = now;
        if (V.opts.bath) setTimeout(() => { if (lastTap === now) go(1); }, 300);
      }
    }
    start = null;
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', (e) => {
    if (!V || V.flipped) return;
    if (e.ctrlKey || V.z > 1) {
      e.preventDefault();
      V.z = Math.max(1, Math.min(6, V.z * (e.deltaY < 0 ? 1.12 : 0.89)));
      if (V.z === 1) { V.x = 0; V.y = 0; }
      if (V.z > 1.6) loadFull();
      applyZoom();
    }
  }, { passive: false });
}
