// The workshop: exposing new photographs and the quiet housekeeping behind the world.
import { sb, door, t, $, $$, esc, h, ask, toast, fmtDay, bytes, LANG, setLang, keepOpen, setKeepOpen, sleep } from './core.js';
import { S, list, timeOf, restore, erase, updateAlbum, saveDate, deleteDate, upcoming, createEnvelope, deleteEnvelope, saveMe, saveWorld, downloadUrl, url, nameOf, closeLive, createAlbum } from './store.js';
import { exposeMany } from './upload.js';
import { sheet, frame, selection } from './gallery.js';
import { openViewer, pickRoll } from './viewer.js';
import { envelopeCard } from './views.js';

const COLORS = ['#e3a35c', '#d97a6c', '#a7b98a', '#86a9c9', '#b49ac9', '#e6d3a8'];

/* ================= Exposer ================= */
let busy = false;
async function exposer(view, arg) {
  const pre = arg ? S.albums.find((a) => a.id === arg) : null;
  view.innerHTML = `<header class="vh"><h1>${esc(t('expose'))}</h1></header>
    <form class="expose">
      <label class="drop" tabindex="0">
        <input type="file" accept="image/*,.heic,.heif" multiple hidden>
        <span class="drop-paper"><i></i><i></i><i></i></span>
        <b>${esc(t('dropHere'))}</b>
        <span class="btn primary">${esc(t('choose'))}</span>
      </label>
      <div class="opts">
        <label class="lab">${esc(t('into'))}
          <select class="field" name="album"><option value="">${esc(t('noRoll'))}</option>${S.albums.map((a) => `<option value="${a.id}" ${pre?.id === a.id ? 'selected' : ''}>${esc(a.title)}</option>`).join('')}<option value="__new">+ ${esc(t('newRoll'))}</option></select>
        </label>
        <label class="lab newname" hidden>${esc(t('rollName'))}<input class="field" name="newname" maxlength="80"></label>
      </div>
      <div class="tray-up"></div>
      <p class="up-msg" role="status"></p>
    </form>`;
  const f = $('.expose', view), input = $('input[type=file]', f), drop = $('.drop', f);
  f.album.onchange = () => ($('.newname', f).hidden = f.album.value !== '__new');
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.onchange = () => { if (input.files.length) go([...input.files]); input.value = ''; };
  const over = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.addEventListener('dragover', over); drop.addEventListener('dragenter', over);
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files.length) go([...e.dataTransfer.files]); });

  async function go(files, surprise = null) {
    if (busy) return;
    busy = true;
    let album = null;
    if (f.album.value === '__new') { const n = f.newname.value.trim(); if (n) album = await createAlbum(n); }
    else if (f.album.value) album = S.albums.find((a) => a.id === f.album.value);
    const tray = $('.tray-up', f), m = $('.up-msg', f);
    tray.innerHTML = '';
    const res = await exposeMany(files, { album, surprise }, (n, total, last) => {
      m.textContent = t('uploading', { a: n, b: total });
      if (last && !tray.querySelector(`[data-id="${last.id}"]`)) { const fr = frame(last, { w: 90 * (last.w / last.h || 1.5), h: 90 }); fr.classList.add('fresh'); tray.prepend(fr); }
    });
    busy = false;
    const parts = [t('uploaded', { n: res.ok.length })];
    if (res.dup) parts.push(t('dup', { n: res.dup }));
    if (res.failed) parts.push(t('failed', { n: res.failed }));
    m.textContent = parts.join(' · ');
    tray.onclick = (e) => { const fr = e.target.closest('.ph'); if (!fr) return; const l = res.ok; openViewer(l, l.findIndex((p) => p.id === fr.dataset.id)); };
    return res;
  }
  // a file dropped anywhere on this screen counts too
  const anyDrop = (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); if (e.type === 'drop' && e.dataTransfer.files.length && !e.target.closest('.drop')) go([...e.dataTransfer.files]); } };
  window.addEventListener('dragover', anyDrop); window.addEventListener('drop', anyDrop);
  return { leave: () => { window.removeEventListener('dragover', anyDrop); window.removeEventListener('drop', anyDrop); } };
}

/* ================= Atelier: the index of the workshop ================= */
async function atelierHome(view) {
  const total = [...S.photos.values(), ...S.bin.values()].reduce((a, p) => a + Number(p.bytes || 0), 0);
  view.innerHTML = `<header class="vh"><h1>${esc(t('atelier'))}</h1></header>
    <nav class="desk">
      <a href="#/exposer"><b>${esc(t('expose'))}</b><small>${esc(t('photos', { n: S.photos.size }))} · ${esc(t('storage', { a: bytes(total) }))}</small></a>
      <a href="#/plis"><b>${esc(t('envelopes'))}</b><small>${S.envelopes.length}</small></a>
      <a href="#/dates"><b>${esc(t('dates'))}</b><small>${S.dates.length}</small></a>
      <a href="#/corbeille"><b>${esc(t('trash'))}</b><small>${S.bin.size + S.binAlbums.length}</small></a>
      <a href="#/reglages"><b>${esc(t('settings'))}</b><small>${esc(S.me?.name || '')}</small></a>
      <button type="button" class="exp"><b>${esc(t('exportAll'))}</b><small>.zip</small></button>
      <button type="button" class="lockb"><b>${esc(t('lock'))}</b><small></small></button>
    </nav>`;
  $('.exp', view).onclick = () => exportPhotos(list(), 'chambre-noire');
  $('.lockb', view).onclick = lock;
}

/* ================= Corbeille ================= */
async function corbeille(view) {
  let g = null;
  const sel = selection([
    { label: t('restore'), run: async (ids, s) => { await restore(ids); s.stop(); } },
    { label: t('deleteForever'), danger: true, run: async (ids, s) => {
      if (await ask({ body: t('deleteForeverQ', { n: ids.length }), actions: [{ label: t('cancel'), value: false }, { label: t('deleteForever'), value: true, danger: true }] })) { await erase(ids); s.stop(); }
    } },
  ]);
  const paint = () => {
    g?.destroy();
    const ps = [...S.bin.values()].sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at));
    sel.all = () => ps.map((p) => p.id);
    view.innerHTML = `<header class="vh"><a class="backlink" href="#/atelier">← ${esc(t('atelier'))}</a><h1>${esc(t('trash'))}</h1><p class="roll-meta">${esc(t('trashKeep'))}</p>${ps.length ? `<div class="tools"><button type="button" class="btn ghost small selb">${esc(t('select'))}</button></div>` : ''}</header><div class="rollbin"></div><div class="grid"></div>`;
    const rb = $('.rollbin', view);
    for (const a of S.binAlbums) {
      const row = h(`<div class="binroll"><b>${esc(a.title)}</b><small>${esc(t('photos', { n: a.ids.length }))}</small><button type="button" class="btn small">${esc(t('restore'))}</button></div>`);
      $('button', row).onclick = () => updateAlbum(a.id, { deleted_at: null });
      rb.append(row);
    }
    if (!ps.length && !S.binAlbums.length) { $('.grid', view).innerHTML = `<p class="none">${esc(t('trashEmpty'))}</p>`; return; }
    if (ps.length) g = sheet($('.grid', view), ps, { sel, onOpen: (p, fr) => sel.toggle(p.id, fr) });
    $('.selb', view)?.addEventListener('click', () => (sel.on ? sel.stop() : sel.start()));
  };
  paint();
  return { refresh: paint, leave: () => { sel.stop(); g?.destroy(); } };
}

/* ================= Dates ================= */
async function dates(view) {
  const paint = () => {
    const up = new Map(upcoming().map((d) => [d.id, d]));
    view.innerHTML = `<header class="vh"><a class="backlink" href="#/atelier">← ${esc(t('atelier'))}</a><h1>${esc(t('dates'))}</h1><div class="tools"><button type="button" class="btn small add">${esc(t('newDate'))}</button></div></header><ul class="dlist big"></ul>`;
    const ul = $('ul', view);
    if (!S.dates.length) ul.innerHTML = `<li class="none">${esc(t('none'))}</li>`;
    for (const d of S.dates) {
      const u = up.get(d.id);
      const li = h(`<li><span class="when">${u ? esc(u.inDays === 0 ? t('isToday') : t('inDays', { n: u.inDays })) : ''}</span><b>${esc(d.title)}</b><span class="yrs">${esc(fmtDay(d.day + 'T12:00'))}${d.yearly ? ' · ↻' : ''}</span><button type="button" class="btn ghost small">${esc(t('edit'))}</button></li>`);
      $('button', li).onclick = () => editDate(d);
      ul.append(li);
    }
    $('.add', view).onclick = () => editDate(null);
  };
  async function editDate(d) {
    const v = await ask({
      title: d ? d.title : t('newDate'),
      html: `<label class="lab">${esc(t('dateName'))}<input class="field" name="t" maxlength="80" value="${esc(d?.title || '')}"></label>
        <label class="lab">${esc(t('date'))}<input class="field" type="date" name="d" value="${d?.day || ''}"></label>
        <label class="check"><input type="checkbox" name="y" ${!d || d.yearly ? 'checked' : ''}> ${esc(t('yearly'))}</label>`,
      actions: [...(d ? [{ label: t('del'), value: 'del', danger: true }] : []), { label: t('cancel'), value: false }, { label: t('save'), value: (m) => ({ title: m.querySelector('[name=t]').value.trim(), day: m.querySelector('[name=d]').value, yearly: m.querySelector('[name=y]').checked }) }],
    });
    if (v === 'del') await deleteDate(d.id);
    else if (v && v.title && v.day) await saveDate({ ...(d ? { id: d.id } : {}), ...v });
  }
  paint();
  return { refresh: paint };
}

/* ================= Plis: sealed envelopes ================= */
async function plis(view) {
  const paint = () => {
    view.innerHTML = `<header class="vh"><a class="backlink" href="#/atelier">← ${esc(t('atelier'))}</a><h1>${esc(t('envelopes'))}</h1><div class="tools"><button type="button" class="btn small add">${esc(t('newEnvelope'))}</button></div></header><div class="envs wide"></div>`;
    const box = $('.envs', view);
    if (!S.envelopes.length) box.innerHTML = `<p class="none">${esc(t('envEmpty'))}</p>`;
    for (const e of S.envelopes) {
      const c = envelopeCard(e);
      if (e.created_by === S.user.id) {
        const wrap = h('<div class="envwrap"></div>');
        const rm = h(`<button type="button" class="btn ghost small">${esc(t('del'))}</button>`);
        rm.onclick = async () => { if (await ask({ body: `${t('del')} ?`, actions: [{ label: t('cancel'), value: false }, { label: t('del'), value: true, danger: true }] })) await deleteEnvelope(e.id); };
        wrap.append(c, rm); box.append(wrap);
      } else box.append(c);
    }
    $('.add', view).onclick = newEnvelope;
  };
  async function newEnvelope() {
    const tomorrow = new Date(Date.now() + 86400e3).toISOString().slice(0, 10);
    const v = await ask({
      title: t('newEnvelope'),
      html: `<label class="lab">${esc(t('envTitle'))}<input class="field" name="t" maxlength="80"></label>
        <label class="lab">${esc(t('message'))}<textarea class="field hand" name="m" rows="4" maxlength="4000"></textarea></label>
        <label class="lab">${esc(t('seal'))}<input class="field" type="date" name="d" value="${tomorrow}" min="${new Date().toISOString().slice(0, 10)}"></label>
        <p class="hint">${esc(t('sealHint'))}</p>
        <label class="btn ghost filepick">${esc(t('choose'))}<input type="file" accept="image/*,.heic,.heif" multiple hidden name="f"></label><span class="fcount"></span>`,
      actions: [{ label: t('cancel'), value: false }, { label: t('save'), value: (m) => ({ title: m.querySelector('[name=t]').value.trim(), message: m.querySelector('[name=m]').value.trim(), day: m.querySelector('[name=d]').value, files: [...m.querySelector('[name=f]').files] }) }],
    });
    if (!v || !v.day) return;
    const open_at = new Date(`${v.day}T00:00`).toISOString();
    const env = await createEnvelope({ title: v.title || null, message: v.message || null, open_at });
    if (v.files.length) {
      toast(t('uploading', { a: 0, b: v.files.length }));
      const res = await exposeMany(v.files, { surprise: env.id }, (n, total) => toast(t('uploading', { a: n, b: total })));
      toast(t('uploaded', { n: res.ok.length }));
    }
    const { loadEnvelopes, emit } = await import('./store.js');
    await loadEnvelopes(); emit('envelope');
  }
  document.addEventListener('change', (e) => { if (e.target.matches('.filepick input')) { const c = e.target.closest('.modal')?.querySelector('.fcount'); if (c) c.textContent = t('photos', { n: e.target.files.length }); } });
  paint();
  return { refresh: paint };
}

/* ================= Réglages ================= */
async function reglages(view) {
  const paint = () => {
    const other = S.other;
    view.innerHTML = `<header class="vh"><a class="backlink" href="#/atelier">← ${esc(t('atelier'))}</a><h1>${esc(t('settings'))}</h1></header>
      <form class="settings">
        <fieldset><legend>${esc(t('me'))}</legend>
          <label class="lab">${esc(t('yourName'))}<input class="field" name="name" maxlength="40" value="${esc(S.me?.name || '')}"></label>
          <div class="swatches"><span>${esc(t('yourColor'))}</span>${COLORS.map((c) => `<label class="sw"><input type="radio" name="color" value="${c}" ${S.me?.color === c ? 'checked' : ''}><i style="--c:${c}"></i></label>`).join('')}</div>
        </fieldset>
        <fieldset><legend>${esc(t('worldName'))}</legend><input class="field" name="world" maxlength="60" value="${esc(S.world?.name || '')}"></fieldset>
        <fieldset><legend>${esc(t('language'))}</legend><div class="chips"><button type="button" class="chip ${LANG === 'fr' ? 'on' : ''}" data-l="fr">Français</button><button type="button" class="chip ${LANG === 'en' ? 'on' : ''}" data-l="en">English</button></div></fieldset>
        <fieldset><legend>${esc(t('key'))}</legend>
          <label class="check"><input type="checkbox" name="keep" ${keepOpen() ? 'checked' : ''}> ${esc(t('keep'))}</label>
          <button type="button" class="btn ghost rekey">${esc(t('changeKey'))}</button>
          <button type="button" class="btn ghost reinv">${esc(t('otherKey', { who: other?.name || t('other') }))}</button>
        </fieldset>
        <div class="row-btns"><button type="button" class="btn ghost lockb">${esc(t('lock'))}</button><button class="btn primary">${esc(t('save'))}</button></div>
      </form>`;
    const f = $('.settings', view);
    f.onsubmit = async (e) => {
      e.preventDefault();
      await saveMe({ name: f.name.value.trim() || null, color: f.color.value || S.me.color });
      if (f.world.value.trim() && f.world.value.trim() !== S.world.name) await saveWorld({ name: f.world.value.trim() });
      toast('✓');
    };
    f.keep.onchange = () => setKeepOpen(f.keep.checked);
    $$('[data-l]', f).forEach((b) => (b.onclick = () => { setLang(b.dataset.l); location.reload(); }));
    $('.lockb', f).onclick = lock;
    $('.rekey', f).onclick = rekey;
    $('.reinv', f).onclick = reinvite;
  };
  paint();
  return { refresh: () => {} };
}

async function rekey() {
  const v = await ask({
    title: t('changeKey'),
    html: `<label class="lab">${esc(t('oldKey'))}<input class="field" type="password" name="o" autocomplete="current-password"></label>
      <label class="lab">${esc(t('newKey'))}<input class="field" type="password" name="a" autocomplete="new-password" minlength="6" placeholder="${esc(t('keyRule'))}"></label>
      <label class="lab">${esc(t('newKey2'))}<input class="field" type="password" name="b" autocomplete="new-password"></label>`,
    actions: [{ label: t('cancel'), value: false }, { label: t('save'), value: (m) => ({ o: m.querySelector('[name=o]').value, a: m.querySelector('[name=a]').value, b: m.querySelector('[name=b]').value }) }],
  });
  if (!v) return;
  if (v.a !== v.b) return toast(t('keyMismatch'));
  const r = await door('rekey', { old: v.o, code: v.a });
  toast(r.ok ? t('keyChanged') : r.error === 'nope' ? t('wrong') : r.error === 'taken' ? t('keyTaken') : r.error === 'resting' ? t('resting', { n: r.minutes }) : t('keyWeak'));
}
async function reinvite() {
  const who = S.other?.name || t('other');
  if (!(await ask({ body: t('otherKeyQ', { who }), actions: [{ label: t('cancel'), value: false }, { label: t('confirm'), value: true }] }))) return;
  const r = await door('reinvite');
  if (!r.code) return toast(t('offline'));
  await ask({ html: `<p>${esc(t('otherKeyIs', { who }))}</p><p class="bigcode">${esc(r.code.replace(/(\d{4})(\d{4})/, '$1 $2'))}</p>`, actions: [{ label: t('copy'), value: () => { navigator.clipboard?.writeText(r.code); toast(t('copied')); return true; } }, { label: t('close'), value: true }] });
}

export async function lock() {
  await closeLive();
  await sb().auth.signOut().catch(() => {});
  try { sessionStorage.clear(); localStorage.removeItem('dk-urls'); localStorage.removeItem('dk-auth'); } catch {}
  location.hash = '';
  location.reload();
}

/* ================= export: originals + their stories, one zip per year ================= */
let JSZip = null;
async function zipLib() {
  if (!JSZip) { await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = ok; s.onerror = ko; document.head.append(s); }); JSZip = window.JSZip; }
  return JSZip;
}
export async function exportPhotos(ps, base) {
  if (!ps.length) return;
  const Z = await zipLib();
  const byYear = new Map();
  for (const p of ps) { const y = p.taken_at ? new Date(p.taken_at).getFullYear() : 'sans-date'; if (!byYear.has(y)) byYear.set(y, []); byYear.get(y).push(p); }
  let n = 0;
  for (const [y, group] of byYear) {
    const zip = new Z();
    const meta = [];
    for (const p of group) {
      toast(t('exporting', { a: ++n, b: ps.length }));
      const u = await downloadUrl(p); if (!u) continue;
      const blob = await (await fetch(u)).blob();
      const d = p.taken_at ? new Date(p.taken_at) : null;
      const name = `${d ? d.toISOString().slice(0, 10) : 'x'}_${(p.filename || p.id).replace(/[^\w.\-]+/g, '_')}`;
      zip.file(name, blob, { date: d || new Date() });
      meta.push({ file: name, title: p.title, caption: p.caption, place: p.place, taken_at: p.taken_at, favorite: p.favorite, by: nameOf(p.created_by), rolls: S.albums.filter((a) => a.ids.includes(p.id)).map((a) => a.title), notes: (S.notes.get(p.id) || []).map((x) => ({ by: nameOf(x.author), at: x.created_at, text: x.body })) });
    }
    zip.file('souvenirs.json', JSON.stringify(meta, null, 2));
    const out = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(out); a.download = `${base}-${y}.zip`; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    await sleep(400);
  }
  toast('✓');
}

export const atelier = { exposer, atelier: atelierHome, corbeille, dates, plis, reglages };
