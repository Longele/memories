// The entrance: a dark room, one safelight, a strip of film. Each character of the key exposes a frame.
import { sb, door, t, h, $, $$, esc, sleep, reduced } from './core.js';

const COLORS = ['#e3a35c', '#d97a6c', '#a7b98a', '#86a9c9', '#b49ac9', '#e6d3a8'];
const el = () => $('#door');

const frame = (i) => `<span class="frame" style="--i:${i}"><b>${String(i + 1).padStart(2, '0')}</b></span>`;
const strip = (n) => Array.from({ length: n }, (_, i) => frame(i)).join('');

function room(inner) {
  el().innerHTML = `<div class="door-room">
    <div class="lamp" aria-hidden="true"><i></i></div>
    ${inner}
    <p class="door-msg" role="alert"></p>
    <div class="door-mark">CHAMBRE NOIRE</div>
  </div>`;
  el().hidden = false;
  el().classList.remove('opening', 'gone');
}
const msg = (s) => { const m = $('.door-msg', el()); m.textContent = s || ''; m.classList.toggle('on', !!s); };

// returns when someone is inside (a session exists)
export function lockedDoor() {
  return new Promise((resolve) => {
    room(`<form class="key" autocomplete="on">
        <label class="sr" for="dk-key">${esc(t('key'))}</label>
        <div class="strip" aria-hidden="true">${strip(8)}</div>
        <input id="dk-key" name="password" type="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" maxlength="64">
        <div class="key-row">
          <button type="button" class="kbd" aria-label="123 / abc">123</button>
          <span class="key-hint">${esc(t('key'))}</span>
          <button type="submit" class="go" aria-label="${esc(t('enter'))}" disabled><svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button>
        </div>
      </form>`);
    const form = $('.key', el()), input = $('#dk-key', el()), s = $('.strip', el()), go = $('.go', el()), kbd = $('.kbd', el());
    const focus = () => input.focus({ preventScroll: true });
    el().onclick = (e) => { if (!e.target.closest('button')) focus(); };
    kbd.onclick = () => { const num = input.inputMode !== 'numeric'; input.inputMode = num ? 'numeric' : 'text'; kbd.textContent = num ? 'abc' : '123'; input.blur(); setTimeout(focus, 30); };
    setTimeout(focus, 400);
    let last = 0;
    input.addEventListener('input', () => {
      const n = input.value.length;
      while (s.children.length < Math.max(8, n + 1)) s.insertAdjacentHTML('beforeend', frame(s.children.length));
      while (s.children.length > Math.max(8, n + 1) && s.children.length > 8) s.lastElementChild.remove();
      $$('.frame', s).forEach((f, i) => { f.classList.toggle('lit', i < n); if (i === n - 1 && n > last) { f.classList.remove('flash'); void f.offsetWidth; f.classList.add('flash'); } });
      s.style.setProperty('--n', n);
      el().style.setProperty('--glow', Math.min(1, n / 8));
      go.disabled = n < 6;
      last = n; msg('');
    });
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (input.value.length < 6 || form.classList.contains('busy')) return;
      form.classList.add('busy');
      const code = input.value;
      let r;
      try { r = await door('enter', { code }); } catch { r = { error: 'offline' }; }
      form.classList.remove('busy');
      if (r.token_hash) { await trade(r.token_hash); resolve(); return; }
      if (r.setup) { resolve(await setupDoor(code)); return; }
      s.classList.remove('fog'); void s.offsetWidth; s.classList.add('fog');
      msg(r.error === 'resting' ? t('resting', { n: r.minutes }) : r.error === 'offline' || r.status >= 500 ? t('offline') : t('wrong'));
      setTimeout(() => { input.value = ''; input.dispatchEvent(new Event('input')); s.classList.remove('fog'); focus(); }, 900);
    };
  });
}

async function trade(token_hash) {
  let { error } = await sb().auth.verifyOtp({ token_hash, type: 'email' });
  if (error) ({ error } = await sb().auth.verifyOtp({ token_hash, type: 'magiclink' }));
  if (error) throw error;
}

// first time with an invitation: a name, a colour, a key of one's own
function setupDoor(invite) {
  return new Promise((resolve) => {
    room(`<form class="setup">
        <p class="setup-lead">${esc(t('welcome'))}</p>
        <label><span>${esc(t('yourName'))}</span><input name="name" maxlength="40" autocomplete="given-name" required></label>
        <div class="swatches" role="radiogroup" aria-label="${esc(t('yourColor'))}"><span>${esc(t('yourColor'))}</span>
          ${COLORS.map((c, i) => `<label class="sw"><input type="radio" name="color" value="${c}" ${i === 0 ? 'checked' : ''}><i style="--c:${c}"></i></label>`).join('')}
        </div>
        <label><span>${esc(t('newKey'))}</span><input name="k1" type="password" autocomplete="new-password" minlength="6" maxlength="64" required placeholder="${esc(t('keyRule'))}"></label>
        <label><span>${esc(t('newKey2'))}</span><input name="k2" type="password" autocomplete="new-password" minlength="6" maxlength="64" required></label>
        <button class="btn primary" type="submit">${esc(t('enter'))}</button>
      </form>`);
    const f = $('.setup', el());
    setTimeout(() => f.name.focus(), 300);
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (f.k1.value !== f.k2.value) return msg(t('keyMismatch'));
      f.querySelector('button').disabled = true;
      const r = await door('enter', { code: invite, setup: { code: f.k1.value, name: f.name.value.trim(), color: f.color.value } }).catch(() => ({ error: 'offline' }));
      f.querySelector('button').disabled = false;
      if (r.token_hash) { await trade(r.token_hash); resolve(); return; }
      msg(r.error === 'taken' ? t('keyTaken') : r.error === 'weak' ? t('keyWeak') : r.error === 'resting' ? t('resting', { n: r.minutes }) : t('offline'));
    };
  });
}

// the door was left open on this device: one touch turns the light on
export function touchDoor() {
  return new Promise((resolve) => {
    room(`<button type="button" class="touch">${esc(t('tapToEnter'))}</button>`);
    el().style.setProperty('--glow', 0.35);
    const go = () => { document.removeEventListener('keydown', key); resolve(); };
    const key = (e) => { if (e.key === 'Enter' || e.key === ' ') go(); };
    el().onclick = go;
    document.addEventListener('keydown', key);
  });
}

// the light goes on, the room floods red, then the red drains away and the world is there
// names: the world's name, read from the database once inside, so it never sits on the public page
export async function openDoor(names = '') {
  const d = el();
  d.onclick = null;
  if (names) {
    const parts = names.split('&').map((s) => s.trim()).filter(Boolean);
    const inner = parts.length === 2 ? `<span>${esc(parts[0])}</span><i>&amp;</i><span>${esc(parts[1])}</span>` : `<span>${esc(names)}</span>`;
    d.insertAdjacentHTML('beforeend', `<p class="door-names" aria-hidden="true">${inner}</p>`);
  }
  d.classList.add('opening');
  await sleep(reduced() ? 50 : names ? 3000 : 1300);
  d.classList.add('gone');
  await sleep(reduced() ? 50 : 1400);
  d.hidden = true;
  d.classList.remove('opening', 'gone');
  d.innerHTML = '';
}
