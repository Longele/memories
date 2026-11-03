// Contact sheets that never crop: justified rows computed from each print's real proportions,
// rendered month by month only when they come near the screen, so thousands of photos stay light.
import { $, $$, esc, h, stamp, dayKey, fmtMonth, t } from './core.js';
import { url, S, timeOf, isMine } from './store.js';

const GAP = 6;
const ratio = (p) => (p.w && p.h ? p.w / p.h : 1.5);

const seenObs = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const img = e.target; seenObs.unobserve(img);
    const p = S.photos.get(img.dataset.id) || S.bin.get(img.dataset.id);
    if (!p) continue;
    url(p, img.dataset.size || 't').then((u) => { if (!u) return; img.onload = () => img.classList.add('in'); img.src = u; });
  }
}, { rootMargin: '600px 0px' });
export const watch = (img) => seenObs.observe(img);

export function frame(p, { w, h: hh, stampIt = false, size = 't', latent = false } = {}) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'ph' + (p.favorite ? ' fav' : '') + (latent ? ' latent' : '');
  el.dataset.id = p.id;
  if (w) { el.style.width = `${w}px`; el.style.height = `${hh}px`; }
  else el.style.aspectRatio = String(ratio(p));
  el.style.setProperty('--c', p.color || '#2a2420');
  el.setAttribute('aria-label', p.title || (p.taken_at ? new Date(p.taken_at).toLocaleDateString() : t('untitled')));
  el.innerHTML = latent ? '<i class="paper"></i>' : `<img class="lq" alt="" src="${p.lqip || ''}"><img class="im" alt="" data-id="${p.id}" data-size="${size}" decoding="async">${stampIt && p.taken_at ? `<s class="stamp">${esc(stamp(p.taken_at))}</s>` : ''}<i class="tick"></i>`;
  if (!latent) watch(el.querySelector('.im'));
  return el;
}

function rows(list, width, target) {
  const out = []; let cur = [], sum = 0;
  for (const p of list) {
    cur.push(p); sum += ratio(p);
    const wAt = sum * target + GAP * (cur.length - 1);
    if (wAt >= width) {
      const hh = (width - GAP * (cur.length - 1)) / sum;
      out.push({ items: cur, h: hh }); cur = []; sum = 0;
    }
  }
  if (cur.length) out.push({ items: cur, h: Math.min(target, (width - GAP * (cur.length - 1)) / sum), last: true });
  return out;
}

// list: photos in display order; opts: { group: 'month'|null, onOpen(p), sel, rowH, latentOf(p) }
export function sheet(host, list, opts = {}) {
  const target = () => opts.rowH || (innerWidth < 600 ? 120 : innerWidth < 1100 ? 170 : 210);
  const groups = [];
  if (opts.group === 'month') {
    let key = null;
    for (const p of list) {
      const d = new Date(timeOf(p)); const k = p.taken_at ? `${d.getFullYear()}-${d.getMonth()}` : 'none';
      if (k !== key) { groups.push({ key: k, label: p.taken_at ? fmtMonth(d) : t('noDate'), year: p.taken_at ? d.getFullYear() : null, items: [] }); key = k; }
      groups[groups.length - 1].items.push(p);
    }
  } else groups.push({ key: 'all', label: '', items: list });

  host.innerHTML = '';
  host.classList.add('sheetwrap');
  const secs = groups.map((g) => {
    const sec = h(`<section class="month" data-key="${g.key}" ${g.year ? `data-year="${g.year}"` : ''}>${g.label ? `<h3 class="month-h"><span>${esc(g.label)}</span><small>${g.items.length}</small></h3>` : ''}<div class="rows"></div></section>`);
    sec._g = g; host.append(sec); return sec;
  });

  const width = () => host.clientWidth || innerWidth - 32;
  function estimate(sec) {
    const sum = sec._g.items.reduce((a, p) => a + ratio(p), 0);
    const n = Math.max(1, Math.ceil((sum * target()) / width()));
    $('.rows', sec).style.minHeight = `${n * (target() + GAP)}px`;
  }
  function paint(sec) {
    const box = $('.rows', sec);
    box.innerHTML = ''; box.style.minHeight = '';
    let lastDay = null;
    for (const r of rows(sec._g.items, width(), target())) {
      const row = document.createElement('div'); row.className = 'row';
      for (const p of r.items) {
        const day = p.taken_at ? dayKey(p.taken_at) : null;
        const lat = opts.latentOf?.(p);
        const f = frame(p, { w: ratio(p) * r.h, h: r.h, stampIt: opts.group === 'month' && day !== lastDay, latent: lat });
        lastDay = day;
        if (opts.sel?.ids.has(p.id)) f.classList.add('picked');
        row.append(f);
      }
      box.append(row);
    }
    sec._painted = true;
  }
  const near = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting && !e.target._painted) paint(e.target); }), { rootMargin: '1200px 0px' });
  secs.forEach((s) => { estimate(s); near.observe(s); });

  let lastW = width(), rt;
  const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { if (Math.abs(width() - lastW) < 2) return; lastW = width(); secs.forEach((s) => (s._painted ? paint(s) : estimate(s))); }, 120); });
  ro.observe(host);

  host.onclick = (e) => {
    const f = e.target.closest('.ph'); if (!f) return;
    const p = S.photos.get(f.dataset.id) || S.bin.get(f.dataset.id);
    if (!p) return;
    if (opts.sel?.on || e.shiftKey || e.metaKey || e.ctrlKey) { opts.sel?.toggle(p.id, f); return; }
    opts.onOpen?.(p, f);
  };
  longPress(host, (f) => opts.sel && opts.sel.toggle(f.dataset.id, f, true));
  return { destroy() { near.disconnect(); ro.disconnect(); }, groups, secs };
}

export function longPress(host, fn) {
  let timer = null, sx = 0, sy = 0;
  host.addEventListener('pointerdown', (e) => {
    const f = e.target.closest('.ph'); if (!f || e.pointerType === 'mouse') return;
    sx = e.clientX; sy = e.clientY;
    timer = setTimeout(() => { timer = null; f.dataset.lp = '1'; navigator.vibrate?.(12); fn(f); }, 480);
  });
  const stop = (e) => { if (timer && (e.type !== 'pointermove' || Math.hypot(e.clientX - sx, e.clientY - sy) > 8)) { clearTimeout(timer); timer = null; } };
  host.addEventListener('pointermove', stop); host.addEventListener('pointerup', stop); host.addEventListener('pointercancel', stop);
  host.addEventListener('click', (e) => { const f = e.target.closest('.ph'); if (f?.dataset.lp) { delete f.dataset.lp; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
}

// selection with a bottom bar of actions
export function selection(actions) {
  const bar = h(`<div class="selbar"><button type="button" class="x" aria-label="${esc(t('close'))}">×</button><b class="n"></b><button type="button" class="all">${esc(t('selectAll'))}</button><div class="acts"></div></div>`);
  const sel = {
    on: false, ids: new Set(), all: () => [],
    toggle(id, el, force) {
      if (!sel.on) sel.start();
      if (sel.ids.has(id) && !force) sel.ids.delete(id); else sel.ids.add(id);
      el?.classList.toggle('picked', sel.ids.has(id));
      sel.paint();
    },
    start() { sel.on = true; document.body.classList.add('selecting'); document.body.append(bar); requestAnimationFrame(() => bar.classList.add('on')); sel.paint(); },
    stop() { sel.on = false; sel.ids.clear(); document.body.classList.remove('selecting'); bar.classList.remove('on'); setTimeout(() => bar.remove(), 200); $$('.ph.picked').forEach((f) => f.classList.remove('picked')); },
    paint() { $('.n', bar).textContent = t('selected', { n: sel.ids.size }); $$('.acts button', bar).forEach((b) => (b.disabled = !sel.ids.size)); },
  };
  $('.acts', bar).append(...actions.map((a) => { const b = h(`<button type="button" class="${a.danger ? 'danger' : ''}">${esc(a.label)}</button>`); b.onclick = () => a.run([...sel.ids], sel); return b; }));
  $('.x', bar).onclick = () => sel.stop();
  $('.all', bar).onclick = () => { sel.all().forEach((id) => sel.ids.add(id)); $$('.ph').forEach((f) => f.classList.toggle('picked', sel.ids.has(f.dataset.id))); sel.paint(); };
  return sel;
}
