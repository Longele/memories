// Everything the world knows, loaded once after the door opens and kept live with Realtime.
import { sb, WORLD, BUCKET, box, seeded, dayKey } from './core.js';

export const S = {
  user: null, me: null, other: null, members: [], world: null,
  photos: new Map(),      // visible, not in the bin
  bin: new Map(),         // soft-deleted photos
  albums: [],             // { ...row, ids: [photoId...] } ordered by position
  binAlbums: [],
  notes: new Map(),       // photoId -> [note]
  loose: [],              // notes without a photo
  seen: new Set(),
  dates: [], envelopes: [],
};
const listeners = new Set();
export const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const emit = (what) => listeners.forEach((fn) => fn(what));

const PAGE = 1000;
async function all(q) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await q().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

export async function load() {
  const { data: { user } } = await sb().auth.getUser();
  S.user = user;
  const db = sb();
  const [world, members, photos, albums, links, notes, seen, dates] = await Promise.all([
    db.from('dk_worlds').select('*').eq('id', WORLD).maybeSingle(),
    db.from('dk_members').select('id, user_id, name, color, joined_at').eq('world_id', WORLD),
    all(() => db.from('dk_photos').select('*').eq('world_id', WORLD).order('taken_at', { ascending: true, nullsFirst: true }).order('created_at')),
    all(() => db.from('dk_albums').select('*').eq('world_id', WORLD).order('position')),
    all(() => db.from('dk_album_photos').select('album_id, photo_id, position').eq('world_id', WORLD).order('position')),
    all(() => db.from('dk_notes').select('*').eq('world_id', WORLD).order('created_at')),
    all(() => db.from('dk_seen').select('photo_id').eq('user_id', user.id)),
    db.from('dk_dates').select('*').eq('world_id', WORLD).order('day'),
  ]);
  S.world = world.data;
  S.members = members.data || [];
  S.me = S.members.find((m) => m.user_id === user.id) || null;
  S.other = S.members.find((m) => m.user_id !== user.id) || null;
  S.photos.clear(); S.bin.clear();
  for (const p of photos) (p.deleted_at ? S.bin : S.photos).set(p.id, p);
  const byAlbum = new Map();
  const posOf = new Map();
  for (const l of links) {
    if (!byAlbum.has(l.album_id)) { byAlbum.set(l.album_id, []); posOf.set(l.album_id, new Map()); }
    byAlbum.get(l.album_id).push(l.photo_id); posOf.get(l.album_id).set(l.photo_id, l.position);
  }
  const withIds = (a) => ({ ...a, ids: byAlbum.get(a.id) || [], pos: posOf.get(a.id) || new Map() });
  S.albums = albums.filter((a) => !a.deleted_at).map(withIds);
  S.binAlbums = albums.filter((a) => a.deleted_at).map(withIds);
  S.notes.clear(); S.loose = [];
  for (const n of notes) {
    if (!n.photo_id) { S.loose.push(n); continue; }
    if (!S.notes.has(n.photo_id)) S.notes.set(n.photo_id, []);
    S.notes.get(n.photo_id).push(n);
  }
  S.seen = new Set(seen.map((s) => s.photo_id));
  S.dates = dates.data || [];
  await loadEnvelopes();
  emit('load');
}

export async function loadEnvelopes() {
  const { data } = await sb().rpc('dk_envelopes', { w: WORLD });
  S.envelopes = data || [];
}

/* ---------- reading helpers ---------- */
export const who = (uid) => S.members.find((m) => m.user_id === uid) || null;
export const nameOf = (uid) => who(uid)?.name || '·';
export const colorOf = (uid) => who(uid)?.color || '#d9c7a7';
export const isMine = (p) => p.created_by === S.user.id;
export const ready = (p) => p.ready || isMine(p);
export const timeOf = (p) => new Date(p.taken_at || p.created_at).getTime();

export function list({ album = null, favorites = false } = {}) {
  let out;
  if (album) out = album.ids.map((id) => S.photos.get(id)).filter(Boolean);
  else out = [...S.photos.values()].sort((a, b) => timeOf(a) - timeOf(b));
  out = out.filter(ready);
  if (favorites) out = out.filter((p) => p.favorite);
  return out;
}
export const developed = (p) => isMine(p) || S.seen.has(p.id);
export const latent = () => list().filter((p) => !developed(p));
export const albumsOf = (id) => S.albums.filter((a) => a.ids.includes(id));

// the print of the day: a memory from this very day in an earlier year, else one drawn the same way on both phones
// (only developed prints: what the other one left in the dark stays a surprise)
export function printOfDay(now = new Date()) {
  const ps = list().filter(developed);
  if (!ps.length) return null;
  const md = `${now.getMonth()}-${now.getDate()}`;
  const same = ps.filter((p) => { const d = new Date(timeOf(p)); return `${d.getMonth()}-${d.getDate()}` === md && d.getFullYear() < now.getFullYear(); });
  const rnd = seeded(dayKey(now) + WORLD);
  if (same.length) return { photo: same[Math.floor(rnd() * same.length)], why: 'onThisDay' };
  const favs = ps.filter((p) => p.favorite);
  const pool = favs.length >= 6 && rnd() < 0.6 ? favs : ps;
  return { photo: pool[Math.floor(rnd() * pool.length)], why: 'random' };
}

// two pictures that answer each other: same calendar day years apart, same place, or same roll far apart
export function echoes(limit = 24, seed = 'x') {
  const ps = list().filter((p) => p.taken_at && developed(p));
  const out = [], used = new Set();
  const byMD = new Map();
  for (const p of ps) { const d = new Date(p.taken_at); const k = `${d.getMonth()}-${d.getDate()}`; if (!byMD.has(k)) byMD.set(k, []); byMD.get(k).push(p); }
  for (const g of byMD.values()) {
    const years = new Map(); for (const p of g) years.set(new Date(p.taken_at).getFullYear(), p);
    const ys = [...years.keys()].sort();
    if (ys.length > 1) out.push({ a: years.get(ys[0]), b: years.get(ys[ys.length - 1]), kind: 'sameDay' });
  }
  const byPlace = new Map();
  for (const p of ps) { const k = (p.place || '').trim().toLowerCase(); if (!k) continue; if (!byPlace.has(k)) byPlace.set(k, []); byPlace.get(k).push(p); }
  for (const g of byPlace.values()) {
    g.sort((x, y) => timeOf(x) - timeOf(y));
    const a = g[0], b = g[g.length - 1];
    if (g.length > 1 && timeOf(b) - timeOf(a) > 1000 * 86400 * 60) out.push({ a, b, kind: 'samePlace' });
  }
  for (const al of S.albums) {
    const g = al.ids.map((id) => S.photos.get(id)).filter((p) => p && p.taken_at && developed(p)).sort((x, y) => timeOf(x) - timeOf(y));
    if (g.length > 3 && timeOf(g[g.length - 1]) - timeOf(g[0]) > 1000 * 86400 * 300) out.push({ a: g[0], b: g[g.length - 1], kind: 'roll', album: al });
  }
  const rnd = seeded(seed);
  const res = [];
  for (const e of out.sort(() => rnd() - 0.5)) {
    if (used.has(e.a.id) || used.has(e.b.id)) continue;
    used.add(e.a.id); used.add(e.b.id); res.push(e);
    if (res.length >= limit) break;
  }
  return res;
}

/* ---------- photo files: signed links, cached so the browser cache keeps working ---------- */
const ext = (p, size) => (size === 'o' ? p.ext || 'jpg' : 'jpg');
export const pathOf = (p, size) => `${p.world_id}/${p.id}/${size}.${ext(p, size)}`;
let urls = null;
const loadUrls = () => { if (!urls) { try { urls = JSON.parse(box().getItem('dk-urls') || '{}'); } catch { urls = {}; } } return urls; };
let saveTimer;
const saveUrls = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => {
  const now = Date.now(); const e = Object.entries(urls).filter(([, v]) => v.x > now + 3600e3).slice(-4000);
  urls = Object.fromEntries(e); try { box().setItem('dk-urls', JSON.stringify(urls)); } catch {}
}, 800); };
let queue = new Map(), flushTimer = null;
async function flush() {
  const batch = queue; queue = new Map(); flushTimer = null;
  const paths = [...batch.keys()];
  for (let i = 0; i < paths.length; i += 200) {
    const chunk = paths.slice(i, i + 200);
    const { data } = await sb().storage.from(BUCKET).createSignedUrls(chunk, 43200);
    for (const row of data || []) {
      const ok = row.signedUrl && !row.error;
      if (ok) loadUrls()[row.path] = { u: row.signedUrl, x: Date.now() + 43200e3 };
      for (const r of batch.get(row.path) || []) r(ok ? row.signedUrl : null);
    }
  }
  saveUrls();
}
export function url(p, size = 't') {
  const path = pathOf(p, size);
  const c = loadUrls()[path];
  if (c && c.x > Date.now() + 3600e3) return Promise.resolve(c.u);
  return new Promise((resolve) => {
    if (!queue.has(path)) queue.set(path, []);
    queue.get(path).push(resolve);
    if (!flushTimer) flushTimer = setTimeout(flush, 30);
  });
}
export async function downloadUrl(p) {
  const name = p.filename || `${p.id}.${p.ext || 'jpg'}`;
  const { data } = await sb().storage.from(BUCKET).createSignedUrl(pathOf(p, 'o'), 600, { download: name });
  return data?.signedUrl;
}

/* ---------- writing ---------- */
const db = () => sb();
function put(p) { (p.deleted_at ? S.bin : S.photos).set(p.id, p); (p.deleted_at ? S.photos : S.bin).delete(p.id); }

export async function updatePhoto(id, patch) {
  const { data, error } = await db().from('dk_photos').update(patch).eq('id', id).select().single();
  if (error) throw error;
  put(data); emit('photo');
  return data;
}
export async function updatePhotos(ids, patch) {
  if (!ids.length) return;
  const { data, error } = await db().from('dk_photos').update(patch).in('id', ids).select();
  if (error) throw error;
  data.forEach(put); emit('photo');
}
export const toBin = (ids) => updatePhotos(ids, { deleted_at: new Date().toISOString() });
export const restore = (ids) => updatePhotos(ids, { deleted_at: null });

export async function erase(ids) {
  const ps = ids.map((id) => S.bin.get(id) || S.photos.get(id)).filter(Boolean);
  for (let i = 0; i < ps.length; i += 30) {
    const chunk = ps.slice(i, i + 30);
    await sb().storage.from(BUCKET).remove(chunk.flatMap((p) => ['t', 'd', 'o'].map((s) => pathOf(p, s))));
    const { error } = await db().from('dk_photos').delete().in('id', chunk.map((p) => p.id));
    if (error) throw error;
    chunk.forEach((p) => { S.bin.delete(p.id); S.photos.delete(p.id); S.notes.delete(p.id); S.albums.forEach((a) => (a.ids = a.ids.filter((x) => x !== p.id))); });
  }
  emit('photo');
}
// the bin keeps things 30 days, then lets them go
export async function purgeOld() {
  const limit = Date.now() - 30 * 86400e3;
  const old = [...S.bin.values()].filter((p) => new Date(p.deleted_at).getTime() < limit).map((p) => p.id);
  if (old.length) await erase(old);
  const oldAlbums = S.binAlbums.filter((a) => new Date(a.deleted_at).getTime() < limit);
  for (const a of oldAlbums) await db().from('dk_albums').delete().eq('id', a.id);
  S.binAlbums = S.binAlbums.filter((a) => !oldAlbums.includes(a));
}

export async function markSeen(ids) {
  ids = ids.filter((id) => !S.seen.has(id));
  if (!ids.length) return;
  ids.forEach((id) => S.seen.add(id));
  await db().from('dk_seen').upsert(ids.map((photo_id) => ({ user_id: S.user.id, photo_id })), { ignoreDuplicates: true });
  emit('seen');
}

/* rolls */
export async function createAlbum(title) {
  const pos = Math.max(0, ...S.albums.map((a) => a.position)) + 1;
  const { data, error } = await db().from('dk_albums').insert({ world_id: WORLD, title, position: pos }).select().single();
  if (error) throw error;
  const a = { ...data, ids: [] }; S.albums.push(a); emit('album');
  return a;
}
export async function updateAlbum(id, patch) {
  const { data, error } = await db().from('dk_albums').update(patch).eq('id', id).select().single();
  if (error) throw error;
  const all = [...S.albums, ...S.binAlbums];
  const a = all.find((x) => x.id === id); Object.assign(a, data);
  S.albums = all.filter((x) => !x.deleted_at).sort((x, y) => x.position - y.position);
  S.binAlbums = all.filter((x) => x.deleted_at);
  emit('album');
}
export async function addToAlbum(ids, album) {
  ids = ids.filter((id) => !album.ids.includes(id));
  if (!ids.length) return;
  // a roll keeps time order by default: the position is the moment the photo was taken
  // (a hand-made order uses 1..n, so later additions still land at the end)
  const pos = (id) => { const p = S.photos.get(id); return p ? timeOf(p) / 1000 : Date.now() / 1000; };
  const { error } = await db().from('dk_album_photos').insert(ids.map((photo_id) => ({ album_id: album.id, photo_id, world_id: WORLD, position: pos(photo_id) })));
  if (error) throw error;
  if (!album.pos) album.pos = new Map();
  ids.forEach((id) => album.pos.set(id, pos(id)));
  album.ids = [...album.ids, ...ids].sort((x, y) => (album.pos.get(x) ?? 0) - (album.pos.get(y) ?? 0));
  if (!album.cover_id) await updateAlbum(album.id, { cover_id: ids[0] }); else emit('album');
}
export async function removeFromAlbum(ids, album) {
  const { error } = await db().from('dk_album_photos').delete().eq('album_id', album.id).in('photo_id', ids);
  if (error) throw error;
  album.ids = album.ids.filter((x) => !ids.includes(x));
  if (ids.includes(album.cover_id)) await updateAlbum(album.id, { cover_id: album.ids[0] || null }); else emit('album');
}
export async function orderAlbum(album, ids) {
  album.ids = ids;
  album.pos = new Map(ids.map((id, i) => [id, i + 1]));
  const rows = ids.map((photo_id, i) => ({ album_id: album.id, photo_id, world_id: WORLD, position: i + 1 }));
  for (let i = 0; i < rows.length; i += 500) await db().from('dk_album_photos').upsert(rows.slice(i, i + 500));
  emit('album');
}
export async function orderAlbums(list) {
  S.albums = list;
  await Promise.all(list.map((a, i) => (a.position !== i + 1 ? db().from('dk_albums').update({ position: (a.position = i + 1) }).eq('id', a.id) : null)));
  emit('album');
}

/* notes on the back */
export async function addNote(photoId, body) {
  const { data, error } = await db().from('dk_notes').insert({ world_id: WORLD, photo_id: photoId, body }).select().single();
  if (error) throw error;
  if (!S.notes.has(photoId)) S.notes.set(photoId, []);
  S.notes.get(photoId).push(data); emit('note');
  return data;
}
export async function deleteNote(n) {
  await db().from('dk_notes').delete().eq('id', n.id);
  S.notes.set(n.photo_id, (S.notes.get(n.photo_id) || []).filter((x) => x.id !== n.id)); emit('note');
}

/* dates that matter */
export async function saveDate(row) {
  const q = row.id ? db().from('dk_dates').update(row).eq('id', row.id) : db().from('dk_dates').insert({ ...row, world_id: WORLD });
  const { error } = await q;
  if (error) throw error;
  const { data } = await db().from('dk_dates').select('*').eq('world_id', WORLD).order('day');
  S.dates = data || []; emit('date');
}
export async function deleteDate(id) { await db().from('dk_dates').delete().eq('id', id); S.dates = S.dates.filter((d) => d.id !== id); emit('date'); }
export function upcoming(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return S.dates.map((d) => {
    const [y, m, dd] = d.day.split('-').map(Number);
    let next = new Date(y, m - 1, dd);
    if (d.yearly) { next = new Date(today.getFullYear(), m - 1, dd); if (next < today) next = new Date(today.getFullYear() + 1, m - 1, dd); }
    return { ...d, next, inDays: Math.round((next - today) / 86400e3), years: next.getFullYear() - y };
  }).filter((d) => d.inDays >= 0).sort((a, b) => a.inDays - b.inDays);
}

/* sealed envelopes */
export async function createEnvelope({ title, message, open_at }) {
  const { data, error } = await db().from('dk_surprises').insert({ world_id: WORLD, title, message, open_at }).select().single();
  if (error) throw error;
  await loadEnvelopes(); emit('envelope');
  return data;
}
export async function openEnvelope(id) {
  const { data } = await db().from('dk_surprises').select('*').eq('id', id).maybeSingle();
  if (data && !data.opened_at && data.created_by !== S.user.id) await db().from('dk_surprises').update({ opened_at: new Date().toISOString() }).eq('id', id);
  await loadEnvelopes();
  // the photos inside became readable the moment the date passed
  const { data: ps } = await db().from('dk_photos').select('*').eq('surprise_id', id);
  (ps || []).forEach(put); emit('envelope');
  return { env: data, photos: (ps || []).filter((p) => !p.deleted_at) };
}
export async function deleteEnvelope(id) { await db().from('dk_surprises').delete().eq('id', id); await loadEnvelopes(); emit('envelope'); }

export async function saveMe(patch) {
  const { error } = await db().from('dk_members').update(patch).eq('id', S.me.id);
  if (error) throw error;
  Object.assign(S.me, patch); emit('me');
}
export async function saveWorld(patch) {
  const { error } = await db().from('dk_worlds').update(patch).eq('id', WORLD);
  if (error) throw error;
  Object.assign(S.world, patch); emit('world');
}

/* live: when the other one exposes something while you are inside */
let channel = null;
export function live(onArrive) {
  if (channel) return;
  channel = sb().channel(`dk-${WORLD}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dk_photos', filter: `world_id=eq.${WORLD}` }, (e) => {
      const p = e.new;
      if (e.eventType === 'DELETE') { S.photos.delete(e.old.id); S.bin.delete(e.old.id); emit('photo'); return; }
      const fresh = !S.photos.has(p.id) && !S.bin.has(p.id);
      const was = S.photos.get(p.id);
      put(p); emit('photo');
      if (p.created_by !== S.user.id && p.ready && !p.deleted_at && (fresh || (was && !was.ready))) onArrive(p);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dk_notes', filter: `world_id=eq.${WORLD}` }, (e) => {
      const n = e.new; if (!n.photo_id) return;
      if (!S.notes.has(n.photo_id)) S.notes.set(n.photo_id, []);
      if (!S.notes.get(n.photo_id).some((x) => x.id === n.id)) { S.notes.get(n.photo_id).push(n); emit('note'); }
    })
    .subscribe();
}
export async function closeLive() { if (channel) { await sb().removeChannel(channel); channel = null; } }
