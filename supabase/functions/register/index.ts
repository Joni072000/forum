import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
// Reservierte Domain: hier kann nie echte Post ankommen
const DOMAIN = 'mitglied.sp-forum.invalid';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Nur POST erlaubt' }, 405);
  let body: { username?: string; password?: string };
  try { body = await req.json(); } catch { return json({ error: 'Ungültige Anfrage' }, 400); }
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  if (!/^[A-Za-z0-9_\-]{3,20}$/.test(username)) {
    return json({ error: 'Benutzername: 3–20 Zeichen, nur Buchstaben, Zahlen, _ und -' }, 400);
  }
  if (password.length < 6 || password.length > 72) {
    return json({ error: 'Passwort muss 6–72 Zeichen lang sein' }, 400);
  }
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: existing } = await admin.from('profiles').select('id').eq('username', username).maybeSingle();
  if (existing) return json({ error: 'Dieser Benutzername ist schon vergeben' }, 409);
  const { error } = await admin.auth.admin.createUser({
    email: `${username.toLowerCase()}@${DOMAIN}`,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error) {
    const taken = /already|registered|exists|database error/i.test(error.message);
    return json({ error: taken ? 'Dieser Benutzername ist schon vergeben' : 'Registrierung fehlgeschlagen. Bitte später erneut versuchen.' }, 400);
  }
  return json({ ok: true });
});
