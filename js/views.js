import { $, $$, esc, h, t, stamp, fmtDay, fmtMonth, toast, ask, sleep, reduced, seeded } from './core.js';
import {
  S, list, latent, developed, printOfDay, echoes, url, markSeen, isMine, nameOf, colorOf, upcoming, timeOf,
  toBin, restore, updatePhotos, addToAlbum, removeFromAlbum, createAlbum, updateAlbum, orderAlbum, orderAlbums, openEnvelope,
} from './store.js';
import { sheet, frame, selection, watch } from './gallery.js';
import { openViewer, pickRoll } from './viewer.js';

const yearsBetween = (a, b) => Math.round((b - a) / (365.25 * 86400e3));

/* ================= Chambre: the room you walk into ================= */
async function chambre(view) {
  const draw = () => {
    const all = list();
    view.innerHTML = '';
    if (!all.length && !latent().length) return empty(view);
    const pod = printOfDay();
    if (pod) view.append(hero(pod));
    const dark = latent();
    if (dark.length) view.append(darkSection(dark));
    const env = S.envelopes.filter((e) => !e.opened_at || e.created_by === S.user.id).slice(0, 4);
    if (env.length) view.append(envelopesSection(env));
    const up = upcoming().slice(0, 3);
    if (up.length) view.append(datesSection(up));
    const notes = recentNotes();
    if (notes.length) view.append(notesSection(notes));
    const ech = echoes(1, new Date().toDateString());
    if (ech.length) view.append(echoSection(ech[0]));
    if (all.some(developed)) view.append(recentSection(all));
  };
  draw();
  return { refresh: (w) => { if (w !== 'seen') draw(); } };
}

function empty(view) {
  view.append(h(`<section class="empty">
    <div class="latent-big"><i class="paper"></i></div>
    <h2>${esc(t('emptyTitle'))}</h2>
    <a class="btn primary" href="#/exposer">${esc(t('expose'))}</a>
  </section>`));
}

let developedToday = false;
function hero({ photo: p, why }) {
  const r = p.w && p.h ? p.w / p.h : 1.5;
  const d = p.taken_at ? new Date(p.taken_at) : null;
  const ago = d ? new Date().getFullYear() - d.getFullYear() : 0;
  const line = why === 'onThisDay' && ago > 0 ? t('yearsAgo', { n: ago }) : t('today');
  const el = h(`<section class="hero">
    <div class="easel"><button type="button" class="print" style="--r:${r};--c:${p.color || '#222'}" aria-label="${esc(p.title || line)}">
      <img class="lq" alt="" src="${p.lqip || ''}"><img class="im" alt=""><i class="wash"></i>
    </button></div>
    <div class="hero-cap">
      <p class="kicker">${esc(line)}</p>
      ${p.title ? `<h1>${esc(p.title)}</h1>` : d ? `<h1>${esc(fmtDay(d))}</h1>` : ''}
      <p class="meta">${d ? `<s class="stamp">${esc(stamp(d))}</s>` : ''}${p.place ? `<span>${esc(p.place)}</span>` : ''}${p.title && d ? `<span>${esc(fmtDay(d))}</span>` : ''}</p>
      ${p.caption ? `<p class="hero-text">${esc(p.caption)}</p>` : ''}
    </div>
  </section>`);
  const btn = $('.print', el), im = $('.im', el);
  url(p, 'd').then((u) => {
    if (!u) return;
    im.onload = () => { im.classList.add('in'); if (!developedToday && !reduced()) { btn.classList.add('developing'); developedToday = true; } };
    im.src = u;
  });
  btn.onclick = () => { const all = list(); openViewer(all, all.indexOf(p)); };
  return el;
}

function darkSection(dark) {
  const other = nameOf(dark[0].created_by);
  const el = h(`<section class="block dark">
    <header class="bh"><h2>${esc(t('inTheDark'))}</h2><p>${esc(t('darkFrom', { n: dark.length, who: other }))}</p>
      <button type="button" class="btn red">${esc(t('developAll'))}</button></header>
    <div class="tray"></div>
  </section>`);
  const tray = $('.tray', el);
  for (const p of dark.slice(-14).reverse()) {
    const f = frame(p, { latent: true });
    f.style.setProperty('--r', p.w && p.h ? p.w / p.h : 1.5);
    f.onclick = () => developInPlace(f, p);
    tray.append(f);
  }
  if (dark.length > 14) tray.append(h(`<span class="more-n">+${dark.length - 14}</span>`));
  $('.btn', el).onclick = () => openViewer([...dark], 0, { bath: true });
  return el;
}
async function developInPlace(f, p) {
  if (f.classList.contains('dev')) { const all = list(); openViewer(all, all.indexOf(p)); return; }
  f.classList.add('dev');
  f.innerHTML = `<img class="lq" alt="" src="${p.lqip || ''}"><img class="im" alt=""><i class="wash"></i>`;
  const u = await url(p, 't');
  const im = $('.im', f);
  im.onload = () => { im.classList.add('in'); f.classList.add('developing'); };
  im.src = u;
  await markSeen([p.id]);
}

function envelopesSection(env) {
  const el = h(`<section class="block env"><header class="bh"><h2>${esc(t('envelopes'))}</h2><a href="#/plis">${esc(t('more'))}</a></header><div class="envs"></div></section>`);
  const box = $('.envs', el);
  env.forEach((e) => box.append(envelopeCard(e)));
  return el;
}
export function envelopeCard(e) {
  const mine = e.created_by === S.user.id;
  const days = Math.ceil((new Date(e.open_at) - Date.now()) / 86400e3);
  const state = e.is_open ? (e.opened_at ? t('opened') : t('open')) : days <= 0 ? t('opensToday') : t('opensIn', { n: days });
  const el = h(`<button type="button" class="envelope ${e.is_open ? 'ready' : 'sealed'} ${mine ? 'mine' : ''}" style="--who:${colorOf(e.created_by)}">
    <i class="flap"></i><i class="seal"></i>
    <span class="e-t">${esc(e.title || (mine ? '' : t('sealedBy', { who: nameOf(e.created_by) })))}</span>
    <span class="e-s">${esc(state)} · ${esc(t('photos', { n: e.count }))}</span>
    <span class="e-d">${esc(fmtDay(e.open_at))}</span>
  </button>`);
  el.onclick = async () => {
    if (!e.is_open && !mine) { el.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-2deg)' }, { transform: 'rotate(2deg)' }, { transform: 'rotate(0)' }], { duration: 380 }); return; }
    el.classList.add('opening');
    const { env, photos } = await openEnvelope(e.id);
    await sleep(reduced() ? 0 : 700);
    await ask({ html: `<div class="letter"><h3>${esc(env?.title || '')}</h3><p class="hand">${esc(env?.message || '')}</p><p class="sig" style="--who:${colorOf(e.created_by)}">${esc(nameOf(e.created_by))}</p></div>`, actions: [{ label: photos.length ? t('develop') : t('close'), value: true }] });
    if (photos.length) openViewer(photos.sort((a, b) => timeOf(a) - timeOf(b)), 0, { bath: !mine });
  };
  return el;
}

function datesSection(up) {
  const el = h(`<section class="block dates"><header class="bh"><h2>${esc(t('dates'))}</h2><a href="#/dates">${esc(t('more'))}</a></header><ul class="dlist"></ul></section>`);
  const ul = $('ul', el);
  for (const d of up) {
    const memories = list().filter((p) => { if (!p.taken_at || !developed(p)) return false; const x = new Date(p.taken_at); return x.getMonth() === d.next.getMonth() && x.getDate() === d.next.getDate(); });
    const li = h(`<li class="${d.inDays === 0 ? 'now' : ''}"><span class="when">${esc(d.inDays === 0 ? t('isToday') : t('inDays', { n: d.inDays }))}</span><b>${esc(d.title)}</b><span class="yrs">${d.yearly && d.years > 0 ? esc(t('nth', { n: d.years })) : esc(fmtDay(d.next))}</span><span class="mini"></span></li>`);
    memories.slice(0, 4).forEach((p) => { const f = frame(p, { w: 34 * (p.w / p.h || 1.5), h: 34 }); f.onclick = () => openViewer(memories, memories.indexOf(p)); $('.mini', li).append(f); });
    ul.append(li);
  }
  return el;
}

function recentNotes() {
  const out = [];
  for (const [pid, ns] of S.notes) for (const n of ns) if (n.author !== S.user.id && S.photos.has(pid) && developed(S.photos.get(pid))) out.push(n);
  return out.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 3);
}
function notesSection(notes) {
  const el = h(`<section class="block notes-b"><header class="bh"><h2>${esc(t('wrote', { who: nameOf(notes[0].author) }))}</h2></header><div class="nlist"></div></section>`);
  for (const n of notes) {
    const p = S.photos.get(n.photo_id);
    const card = h(`<button type="button" class="ncard" style="--who:${colorOf(n.author)}"><span class="nthumb"></span><span class="hand">${esc(n.body)}</span></button>`);
    const f = frame(p, { w: 64, h: 64 / (p.w / p.h || 1.5) > 90 ? 90 : 64 / (p.w / p.h || 1.5) });
    $('.nthumb', card).append(f);
    card.onclick = () => { const all = list(); openViewer(all, all.indexOf(p)); };
    $('.nlist', el).append(card);
  }
  return el;
}

function echoPair(e) {
  const gap = Math.abs(yearsBetween(timeOf(e.a), timeOf(e.b)));
  const label = e.kind === 'sameDay' ? `${t('sameDay')} · ${t('apart', { n: gap })}` : e.kind === 'samePlace' ? `${esc(e.a.place)} · ${t('apart', { n: Math.max(gap, 0) })}` : `${e.album.title} · ${t('apart', { n: gap })}`;
  const el = h(`<div class="echo"><div class="e-a"></div><div class="e-mid"><i></i><span>${esc(label)}</span></div><div class="e-b"></div></div>`);
  for (const [k, p] of [['.e-a', e.a], ['.e-b', e.b]]) {
    const f = frame(p, { stampIt: true, size: 't' });
    f.onclick = () => openViewer([e.a, e.b], p === e.a ? 0 : 1);
    $(k, el).append(f);
  }
  return el;
}
function echoSection(e) {
  const el = h(`<section class="block echo-b"><header class="bh"><h2>${esc(t('echoOfDay'))}</h2><a href="#/echos">${esc(t('more'))}</a></header></section>`);
  el.append(echoPair(e));
  return el;
}

function recentSection(all) {
  const recent = all.filter(developed).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 18);
  const el = h(`<section class="block recent"><header class="bh"><h2>${esc(t('planche'))}</h2><a href="#/planche">${esc(t('more'))}</a></header><div class="strip-h"></div></section>`);
  const box = $('.strip-h', el);
  for (const p of recent) {
    const f = frame(p, { w: 150 * (p.w / p.h || 1.5), h: 150, stampIt: true });
    f.onclick = () => openViewer(recent, recent.indexOf(p));
    box.append(f);
  }
  return el;
}

/* ================= Planche: everything, by time ================= */
function photoActions(ctx) {
  return [
    { label: t('addToRoll'), run: async (ids, sel) => { const a = await pickRoll(ctx.album?.id); if (a) { await addToAlbum(ids, a); toast(`${a.title} ✓`); sel.stop(); } } },
    ...(ctx.album ? [{ label: t('removeFromRoll'), run: async (ids, sel) => { await removeFromAlbum(ids, ctx.album); sel.stop(); } }] : []),
    { label: t('favorite'), run: async (ids, sel) => { const any = ids.some((id) => !S.photos.get(id)?.favorite); await updatePhotos(ids, { favorite: any }); sel.stop(); } },
    { label: t('setDate'), run: async (ids, sel) => {
      const v = await ask({ title: t('setDate'), html: '<input class="field" type="datetime-local" required>', actions: [{ label: t('cancel'), value: false }, { label: t('save'), value: (m) => m.querySelector('input').value }] });
      if (v) { await updatePhotos(ids, { taken_at: new Date(v).toISOString() }); sel.stop(); }
    } },
    { label: t('trash'), danger: true, run: async (ids, sel) => { await toBin(ids); sel.stop(); toast(t('movedToTrash', { n: ids.length }), { label: t('undo'), run: () => restore(ids) }); } },
  ];
}

async function planche(view) {
  let fav = false, g = null;
  view.innerHTML = `<header class="vh"><h1>${esc(t('planche'))}</h1><div class="chips"><button type="button" class="chip on" data-f="all">${esc(t('all'))}</button><button type="button" class="chip" data-f="fav">${esc(t('favorites'))}</button></div><button type="button" class="btn ghost small selb">${esc(t('select'))}</button></header><nav class="years"></nav><div class="grid"></div>`;
  const sel = selection(photoActions({}));
  const items = () => { const l = list({ favorites: fav }); const dark = fav ? [] : latent(); return l; };
  const paint = () => {
    g?.destroy();
    const l = items();
    sel.all = () => l.map((p) => p.id);
    if (!l.length) { $('.grid', view).innerHTML = `<p class="none">${esc(t('none'))}</p>`; $('.years', view).innerHTML = ''; return; }
    g = sheet($('.grid', view), l, { group: 'month', sel, latentOf: (p) => !isMine(p) && !S.seen.has(p.id), onOpen: (p, f) => {
      if (f.classList.contains('latent')) { developInPlace(f, p); f.classList.remove('latent'); return; }
      openViewer(l, l.indexOf(p));
    } });
    const years = [...new Set(l.filter((p) => p.taken_at).map((p) => new Date(p.taken_at).getFullYear()))];
    $('.years', view).innerHTML = years.length > 1 ? years.map((y) => `<button type="button" data-y="${y}">${y}</button>`).join('') : '';
  };
  $('.years', view).onclick = (e) => { const y = e.target.closest('[data-y]')?.dataset.y; const s = y && $(`.month[data-year="${y}"]`, view); if (s) s.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' }); };
  $('.chips', view).onclick = (e) => { const c = e.target.closest('.chip'); if (!c) return; fav = c.dataset.f === 'fav'; $$('.chip', view).forEach((x) => x.classList.toggle('on', x === c)); paint(); };
  $('.selb', view).onclick = () => (sel.on ? sel.stop() : sel.start());
  paint();
  return { refresh: (w) => { if (w !== 'seen') paint(); }, leave: () => { sel.stop(); g?.destroy(); } };
}

/* ================= Rouleaux: the rolls ================= */
async function rouleaux(view) {
  let editing = false;
  const paint = () => {
    view.innerHTML = `<header class="vh"><h1>${esc(t('rouleaux'))}</h1><span class="sp"></span>${S.albums.length > 1 ? `<button type="button" class="btn ghost small ord">${esc(editing ? t('done') : t('sorted'))}</button>` : ''}</header><div class="rolls ${editing ? 'editing' : ''}"></div>`;
    const box = $('.rolls', view);
    S.albums.forEach((a, i) => box.append(rollCard(a, i, editing, paint)));
    const add = h(`<button type="button" class="roll new"><span class="stack"><i></i></span><b>${esc(t('newRoll'))}</b></button>`);
    add.onclick = async () => {
      const name = await ask({ title: t('newRoll'), html: `<input class="field" maxlength="80" placeholder="${esc(t('rollName'))}">`, actions: [{ label: t('cancel'), value: false }, { label: t('save'), value: (m) => m.querySelector('input').value.trim() }] });
      if (name) { const a = await createAlbum(name); location.hash = `#/rouleau/${a.id}`; }
    };
    box.append(add);
    $('.ord', view)?.addEventListener('click', () => { editing = !editing; paint(); });
  };
  paint();
  return { refresh: paint };
}
function rollCard(a, i, editing, repaint) {
  const all = a.ids.map((id) => S.photos.get(id)).filter(Boolean);
  const ps = all.filter(developed);
  const cover = S.photos.get(a.cover_id) || ps[0];
  const others = ps.filter((p) => p !== cover).slice(0, 2);
  const times = ps.filter((p) => p.taken_at).map(timeOf);
  const span = times.length ? [...new Set([new Date(Math.min(...times)).getFullYear(), new Date(Math.max(...times)).getFullYear()])].join(' – ') : '';
  const el = h(`<a class="roll" href="#/rouleau/${a.id}"><span class="stack"></span><b>${esc(a.title)}</b><small>${esc(t('photos', { n: all.length }))}${span ? ` · ${esc(span)}` : ''}</small>
    ${editing ? `<span class="ordbtns"><button type="button" data-d="-1" aria-label="${esc(t('rollUp'))}">↑</button><button type="button" data-d="1" aria-label="${esc(t('rollDown'))}">↓</button></span>` : ''}</a>`);
  const st = $('.stack', el);
  [...others.reverse(), cover].filter(Boolean).forEach((p, k, arr) => {
    const img = h(`<img alt="" data-id="${p.id}" data-size="t" style="--k:${arr.length - 1 - k};--c:${p.color || '#222'}">`);
    img.src = p.lqip || '';
    url(p, 't').then((u) => { if (u) { const n = new Image(); n.onload = () => (img.src = u); n.src = u; } });
    st.append(img);
  });
  if (!cover) st.append(h(all.length ? '<i class="sleeve"></i>' : '<i></i>'));
  if (editing) el.querySelectorAll('[data-d]').forEach((b) => (b.onclick = async (e) => {
    e.preventDefault();
    const l = [...S.albums]; const j = i + Number(b.dataset.d);
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    await orderAlbums(l); repaint();
  }));
  return el;
}

/* ================= Rouleau: one roll, as a drying line or a sheet ================= */
async function rouleau(view, id) {
  const a = S.albums.find((x) => x.id === id);
  if (!a) { location.hash = '#/rouleaux'; return; }
  let mode = (() => { try { return localStorage.getItem('dk-mode') || 'line'; } catch { return 'line'; } })();
  let g = null, ordering = false;
  const sel = selection(photoActions({ album: a }));
  const paint = () => {
    g?.destroy();
    const ps = list({ album: a });
    sel.all = () => ps.map((p) => p.id);
    view.innerHTML = `<header class="vh roll-h">
        <a class="backlink" href="#/rouleaux">← ${esc(t('rouleaux'))}</a>
        <h1>${esc(a.title)}</h1>
        ${a.note ? `<p class="roll-note">${esc(a.note)}</p>` : ''}
        <p class="roll-meta">${esc(t('photos', { n: ps.length }))}</p>
        <div class="tools">
          <div class="chips"><button type="button" class="chip ${mode === 'line' ? 'on' : ''}" data-m="line">${esc(t('line'))}</button><button type="button" class="chip ${mode === 'grid' ? 'on' : ''}" data-m="grid">${esc(t('grid'))}</button></div>
          <button type="button" class="btn ghost small selb">${esc(t('select'))}</button>
          <button type="button" class="btn ghost small ordb">${esc(ordering ? t('done') : t('sorted'))}</button>
          <button type="button" class="btn ghost small edb">${esc(t('edit'))}</button>
        </div>
      </header><div class="body"></div>`;
    const body = $('.body', view);
    if (!ps.length) body.innerHTML = `<p class="none">${esc(t('none'))}</p>`;
    else if (ordering) orderGrid(body, ps, a);
    else if (mode === 'line') drying(body, ps, a);
    else g = sheet(body, ps, { sel, latentOf: (p) => !developed(p), onOpen: (p) => openViewer(ps, ps.indexOf(p), { album: a }) });
    $('.chips', view).onclick = (e) => { const c = e.target.closest('[data-m]'); if (!c) return; mode = c.dataset.m; try { localStorage.setItem('dk-mode', mode); } catch {} paint(); };
    $('.selb', view).onclick = () => { if (mode === 'line') { mode = 'grid'; paint(); } sel.on ? sel.stop() : sel.start(); };
    $('.ordb', view).onclick = async () => { if (ordering) { ordering = false; paint(); return; } const v = await ask({ title: t('sorted'), actions: [{ label: t('cancel'), value: false }, { label: t('byDate'), value: 'date' }, { label: t('custom'), value: 'custom' }] });
      if (v === 'date') { await orderAlbum(a, [...a.ids].sort((x, y) => timeOf(S.photos.get(x) || {}) - timeOf(S.photos.get(y) || {}))); paint(); }
      if (v === 'custom') { ordering = true; paint(); } };
    $('.edb', view).onclick = () => editRoll(a);
  };
  paint();
  return { refresh: (w) => { if (w === 'album' && !S.albums.includes(a)) { location.hash = '#/rouleaux'; return; } if (w !== 'seen' && !ordering) paint(); }, leave: () => { sel.stop(); g?.destroy(); } };
}

async function editRoll(a) {
  const v = await ask({
    title: a.title,
    html: `<label class="lab">${esc(t('rollName'))}<input class="field" name="t" maxlength="80" value="${esc(a.title)}"></label><label class="lab">${esc(t('caption'))}<textarea class="field" name="n" rows="3" maxlength="600">${esc(a.note || '')}</textarea></label>`,
    actions: [{ label: t('deleteRoll'), value: 'del', danger: true }, { label: t('export'), value: 'exp' }, { label: t('cancel'), value: false },{ label: t('save'), value: (m) => ({ t: m.querySelector('[name=t]').value.trim(), n: m.querySelector('[name=n]').value.trim() }) }],
  });
  if (v === 'del') {
    if (await ask({ body: t('deleteRollQ', { r: a.title }), actions: [{ label: t('cancel'), value: false }, { label: t('del'), value: true, danger: true }] })) {
      await updateAlbum(a.id, { deleted_at: new Date().toISOString() });
      location.hash = '#/rouleaux';
      toast(`${a.title} → ${t('trash')}`, { label: t('undo'), run: () => updateAlbum(a.id, { deleted_at: null }) });
    }
  } else if (v === 'exp') {
    const { exportPhotos } = await import('./atelier.js');
    exportPhotos(list({ album: a }), a.title.replace(/[^\w\- ]+/g, '').trim() || 'rouleau');
  } else if (v && v.t) await updateAlbum(a.id, { title: v.t, note: v.n || null });
}

// the prints hang from a line and sway a little when you move along it
function drying(body, ps, a) {
  const wrap = h('<div class="line-wrap"><div class="line"><i class="string"></i></div></div>');
  const line = $('.line', wrap);
  const rnd = seeded(a.id);
  ps.forEach((p, i) => {
    const r = p.w && p.h ? p.w / p.h : 1.5;
    const pin = h(`<figure class="hang" style="--r:${r};--tilt:${(rnd() - 0.5) * 3.2}deg;--drop:${Math.round(rnd() * 26)}px"><i class="clip"></i></figure>`);
    const f = frame(p, { size: 'd', latent: !developed(p) });
    f.onclick = () => openViewer(ps, i, { album: a });
    pin.append(f);
    if (p.title || p.taken_at) pin.append(h(`<figcaption>${p.taken_at ? `<s class="stamp">${esc(stamp(p.taken_at))}</s>` : ''}${p.title ? `<span>${esc(p.title)}</span>` : ''}</figcaption>`));
    line.append(pin);
  });
  body.append(wrap);
  let last = wrap.scrollLeft, sway = 0, raf = 0;
  const tick = () => {
    const v = wrap.scrollLeft - last; last = wrap.scrollLeft;
    sway = sway * 0.9 + Math.max(-6, Math.min(6, v * 0.25)) * 0.1;
    line.style.setProperty('--sway', `${-sway}deg`);
    raf = Math.abs(sway) > 0.02 ? requestAnimationFrame(tick) : 0;
  };
  wrap.addEventListener('scroll', () => { if (!raf && !reduced()) raf = requestAnimationFrame(tick); }, { passive: true });
  wrap.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { wrap.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
}

// custom order: drag prints (long press on touch) to where they belong
function orderGrid(body, ps, a) {
  const box = h('<div class="ordgrid"></div>');
  ps.forEach((p) => { const f = frame(p); f.classList.add('sq'); box.append(f); });
  body.append(box);
  let drag = null, timer = null;
  box.addEventListener('pointerdown', (e) => {
    const f = e.target.closest('.ph'); if (!f) return;
    const begin = () => { drag = f; f.classList.add('dragging'); box.setPointerCapture(e.pointerId); navigator.vibrate?.(10); };
    if (e.pointerType === 'mouse') { e.preventDefault(); begin(); } else timer = setTimeout(begin, 280);
  });
  box.addEventListener('pointermove', (e) => {
    if (timer && !drag) { clearTimeout(timer); timer = null; }
    if (!drag) return;
    e.preventDefault();
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.ordgrid .ph');
    if (over && over !== drag) { const r = over.getBoundingClientRect(); const after = e.clientX > r.left + r.width / 2; over[after ? 'after' : 'before'](drag); }
  });
  const end = async () => {
    clearTimeout(timer); timer = null;
    if (!drag) return;
    drag.classList.remove('dragging'); drag = null;
    await orderAlbum(a, $$('.ph', box).map((f) => f.dataset.id));
  };
  box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
  box.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });
  box.addEventListener('click', (e) => e.preventDefault(), true);
}

/* ================= Échos ================= */
async function echos(view) {
  let seed = new Date().toDateString();
  const paint = () => {
    const es = echoes(30, seed);
    view.innerHTML = `<header class="vh"><h1>${esc(t('echos'))}</h1><span class="sp"></span>${es.length ? `<button type="button" class="btn ghost small again">${esc(t('anotherEcho'))}</button>` : ''}</header><div class="echoes"></div>`;
    const box = $('.echoes', view);
    if (!es.length) box.innerHTML = `<p class="none">${esc(t('none'))}</p>`;
    es.forEach((e) => box.append(echoPair(e)));
    $('.again', view)?.addEventListener('click', () => { seed = String(Math.random()); paint(); });
  };
  paint();
  return { refresh: (w) => { if (w !== 'seen') paint(); } };
}

export const views = { chambre, planche, rouleaux, rouleau, echos };
