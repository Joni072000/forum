import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function rankPos(admin: any, userId: string) {
  const { data } = await admin.from('profiles').select('banned, ranks(position, can_manage)').eq('id', userId).maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Nur POST erlaubt' }, 405);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u?.user) return json({ error: 'Nicht angemeldet' }, 401);
  let body: { action?: string; user_id?: string; password?: string };
  try { body = await req.json(); } catch { return json({ error: 'Ungültige Anfrage' }, 400); }
  const caller = await rankPos(admin, u.user.id);
  if (!caller || caller.banned || !caller.ranks?.can_manage) return json({ error: 'Keine Berechtigung' }, 403);
  const targetId = String(body.user_id ?? '');
  if (!targetId || targetId === u.user.id) return json({ error: 'Ungültiges Mitglied' }, 400);
  const target = await rankPos(admin, targetId);
  if (!target) return json({ error: 'Mitglied nicht gefunden' }, 404);
  if (target.ranks.position >= caller.ranks.position) return json({ error: 'Du kannst nur Mitglieder mit niedrigerem Rang bearbeiten' }, 403);

  if (body.action === 'reset_password') {
    const pw = String(body.password ?? '');
    if (pw.length < 6 || pw.length > 72) return json({ error: 'Passwort muss 6–72 Zeichen lang sein' }, 400);
    const { error } = await admin.auth.admin.updateUserById(targetId, { password: pw });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }
  if (body.action === 'delete_user') {
    const { data: files } = await admin.storage.from('avatars').list(targetId);
    if (files?.length) await admin.storage.from('avatars').remove(files.map((f: { name: string }) => `${targetId}/${f.name}`));
    const { error } = await admin.auth.admin.deleteUser(targetId);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }
  return json({ error: 'Unbekannte Aktion' }, 400);
});
