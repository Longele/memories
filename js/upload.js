// Exposing: the original is kept untouched; the browser makes a screen print and a contact print next to it.
import { sb, WORLD, BUCKET } from './core.js';
import { S, emit, addToAlbum, pathOf, isMine } from './store.js';

const DISP = 2400, THUMB = 640;
let exifr = null, heic = null;
const script = (src) => new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.head.append(s); });
async function getExifr() { if (!exifr) { await script('https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.umd.js'); exifr = window.exifr; } return exifr; }
async function getHeic() { if (!heic) { await script('https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js'); heic = window.heic2any; } return heic; }

const isHeic = (f) => /hei[cf]$/i.test(f.name) || /hei[cf]/i.test(f.type);
async function bitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    if (isHeic(file)) { const jpg = await (await getHeic())({ blob: file, toType: 'image/jpeg', quality: 0.92 }); return createImageBitmap(Array.isArray(jpg) ? jpg[0] : jpg); }
    // last resort: let an <img> decode it
    const u = URL.createObjectURL(file);
    try { const img = new Image(); img.src = u; await img.decode(); return await createImageBitmap(img); } finally { URL.revokeObjectURL(u); }
  }
}
function scaled(bmp, max) {
  const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * r)); c.height = Math.max(1, Math.round(bmp.height * r));
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}
const blob = (c, q) => new Promise((r) => c.toBlob(r, 'image/jpeg', q));

async function readMeta(file) {
  const out = { taken_at: null, lat: null, lng: null };
  try {
    const x = await getExifr();
    const m = await x.parse(file);
    const d = m?.DateTimeOriginal || m?.CreateDate || m?.DateTimeDigitized || m?.ModifyDate;
    if (d instanceof Date && !isNaN(d)) out.taken_at = d.toISOString();
    if (typeof m?.latitude === 'number') { out.lat = m.latitude; out.lng = m.longitude; }
  } catch {}
  if (!out.taken_at && file.lastModified) out.taken_at = new Date(file.lastModified).toISOString();
  return out;
}

export async function prepare(file) {
  const bmp = await bitmap(file);
  const disp = scaled(bmp, DISP), thumb = scaled(bmp, THUMB), tiny = scaled(bmp, 24), dot = scaled(bmp, 1);
  const [d, t] = await Promise.all([blob(disp, 0.86), blob(thumb, 0.8)]);
  const px = dot.getContext('2d').getImageData(0, 0, 1, 1).data;
  const meta = await readMeta(file);
  const extn = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
  const out = {
    w: bmp.width, h: bmp.height, d, t,
    lqip: tiny.toDataURL('image/jpeg', 0.5),
    color: '#' + [px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, '0')).join(''),
    ext: extn, mime: file.type || 'image/jpeg', bytes: file.size, filename: file.name, ...meta,
  };
  bmp.close?.();
  return out;
}

const up = (path, body, type) => sb().storage.from(BUCKET).upload(path, body, { contentType: type, upsert: true, cacheControl: '31536000' });

// one file, start to finish; resolves with the photo row, or { dup } / throws
export async function exposeOne(file, { album = null, surprise = null } = {}) {
  const m = await prepare(file);
  const dup = [...S.photos.values(), ...S.bin.values()].find((p) => isMine(p) && p.filename === m.filename && Number(p.bytes) === m.bytes);
  if (dup) return { dup };
  const row = {
    world_id: WORLD, created_by: S.user.id, taken_at: m.taken_at, lat: m.lat, lng: m.lng, w: m.w, h: m.h,
    bytes: m.bytes, mime: m.mime, filename: m.filename, ext: m.ext, color: m.color, lqip: m.lqip, surprise_id: surprise,
  };
  const { data: p, error } = await sb().from('dk_photos').insert(row).select().single();
  if (error) throw error;
  try {
    const r1 = await up(pathOf(p, 't'), m.t, 'image/jpeg'); if (r1.error) throw r1.error;
    const r2 = await up(pathOf(p, 'd'), m.d, 'image/jpeg'); if (r2.error) throw r2.error;
    const r3 = await up(pathOf(p, 'o'), file, m.mime); if (r3.error) throw r3.error;
  } catch (e) {
    await sb().storage.from(BUCKET).remove(['t', 'd', 'o'].map((s) => pathOf(p, s)));
    await sb().from('dk_photos').delete().eq('id', p.id);
    throw e;
  }
  const { data: done } = await sb().from('dk_photos').update({ ready: true }).eq('id', p.id).select().single();
  S.photos.set(done.id, done);
  if (album) await addToAlbum([done.id], album);
  return done;
}

// many files, two at a time; onTick(doneCount, total, lastPhoto)
export async function exposeMany(files, opts, onTick) {
  files = [...files].filter((f) => /^image\//.test(f.type) || /\.(hei[cf]|jpe?g|png|webp|gif|avif|tiff?)$/i.test(f.name));
  const res = { ok: [], dup: 0, failed: 0 };
  let i = 0, n = 0;
  async function worker() {
    while (i < files.length) {
      const f = files[i++];
      try { const r = await exposeOne(f, opts); if (r.dup) res.dup++; else res.ok.push(r); }
      catch (e) { console.error(e); res.failed++; }
      onTick?.(++n, files.length, res.ok[res.ok.length - 1]);
    }
  }
  await Promise.all([worker(), worker()]);
  emit('photo');
  return res;
}
