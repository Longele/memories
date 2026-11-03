// The door of the darkroom. A seat's code is checked here (bcrypt, in the database), never in the browser.
// A right code returns a one-time token the page trades for a normal session; no e-mail is ever sent.
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const emailOf = (member: string) => `dk-${member}@members.unfoldworlds.com`;
const UUID = /^[0-9a-f-]{36}$/;

async function resting(world: string) {
  const since = (m: number) => new Date(Date.now() - m * 60000).toISOString();
  const q = (m: number) => admin.from('dk_attempts').select('id', { count: 'exact', head: true }).eq('world_id', world).eq('ok', false).gte('at', since(m));
  const [{ count: short }, { count: day }] = await Promise.all([q(15), q(1440)]);
  if ((day ?? 0) >= 40) return 60 * 6;
  if ((short ?? 0) >= 10) return 15;
  return 0;
}
const log = (world: string, ok: boolean) => admin.from('dk_attempts').insert({ world_id: world, ok });

async function check(world: string, code: string) {
  const { data, error } = await admin.rpc('dk_check_code', { w: world, code });
  if (error) throw error;
  return data?.[0] ?? null;
}

function validCode(c: unknown) {
  return typeof c === 'string' && c.length >= 6 && c.length <= 64;
}

async function sessionFor(member: { member_id: string; user_id: string | null }) {
  let uid = member.user_id;
  const email = emailOf(member.member_id);
  if (!uid) {
    // the shared auth has closed sign-ups; the allowlist lets this one seat in, once
    await admin.from('signup_allowlist').insert({ email });
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { darkroom: true } });
    if (error) throw error;
    uid = data.user.id;
    await admin.from('dk_members').update({ user_id: uid, joined_at: new Date().toISOString() }).eq('id', member.member_id);
  }
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  return data.properties.hashed_token;
}

async function caller(req: Request) {
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data } = await admin.auth.getUser(jwt);
  return data.user ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'bad' }, 400); }
  const world = String(body.world || '');
  if (!UUID.test(world)) return json({ error: 'bad' }, 400);

  try {
    const wait = await resting(world);
    if (wait) return json({ error: 'resting', minutes: wait }, 429);

    if (body.action === 'enter') {
      const code = String(body.code || '');
      const m = code ? await check(world, code) : null;
      if (!m) { await log(world, false); await sleep(700); return json({ error: 'nope' }, 401); }
      if (m.is_invite) {
        const s = body.setup;
        if (!s) return json({ setup: true });
        if (!validCode(s.code) || s.code === code) return json({ error: 'weak' }, 400);
        const clash = await check(world, s.code);
        if (clash && clash.member_id !== m.member_id) return json({ error: 'taken' }, 400);
        await admin.rpc('dk_set_code', { member: m.member_id, code: s.code, invite: false });
        await admin.from('dk_members').update({ name: String(s.name || '').slice(0, 40) || null, color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : null }).eq('id', m.member_id);
      }
      await log(world, true);
      return json({ token_hash: await sessionFor(m) });
    }

    // the rest needs someone already inside
    const user = await caller(req);
    if (!user) return json({ error: 'auth' }, 401);
    const { data: me } = await admin.from('dk_members').select('id, world_id').eq('user_id', user.id).eq('world_id', world).maybeSingle();
    if (!me) return json({ error: 'auth' }, 403);

    if (body.action === 'rekey') {
      const m = await check(world, String(body.old || ''));
      if (!m || m.member_id !== me.id) { await log(world, false); await sleep(700); return json({ error: 'nope' }, 401); }
      if (!validCode(body.code)) return json({ error: 'weak' }, 400);
      const clash = await check(world, body.code);
      if (clash && clash.member_id !== me.id) return json({ error: 'taken' }, 400);
      await admin.rpc('dk_set_code', { member: me.id, code: body.code, invite: false });
      return json({ ok: true });
    }

    if (body.action === 'reinvite') {
      // a new one-time key for the other seat (forgotten code, or the first invitation)
      const { data: other } = await admin.from('dk_members').select('id').eq('world_id', world).neq('id', me.id).maybeSingle();
      if (!other) return json({ error: 'bad' }, 400);
      const bytes = crypto.getRandomValues(new Uint32Array(2));
      const code = String((bytes[0] * 4294967296 + bytes[1]) % 100000000).padStart(8, '0');
      await admin.rpc('dk_set_code', { member: other.id, code, invite: true });
      return json({ code });
    }
    return json({ error: 'bad' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: 'server' }, 500);
  }
});
