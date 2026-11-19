// admin-users — creates staff accounts without email confirmation.
// Runs with the service-role key on Supabase's servers; the key never reaches the browser.
//
// Actions (POST JSON):
//   { action: "bootstrap", email, password, full_name }      — only while no admin exists,
//                                                              and only for the configured bootstrap email
//   { action: "create", email, password, full_name, role }   — caller must be an active admin
//   { action: "reset_password", user_id, password }          — caller must be an active admin
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROLES = ["admin", "treasurer", "collector", "auditor"] as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function validEmail(e: unknown): e is string {
  return typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()) && e.length <= 254;
}

function validPassword(p: unknown): p is string {
  return typeof p === "string" && p.length >= 8 && p.length <= 72;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const action = body.action;

  // ---------------------------------------------------------------- bootstrap
  if (action === "bootstrap") {
    const { email, password } = body;
    const fullName = String(body.full_name ?? "").trim().slice(0, 120);
    if (!validEmail(email)) return json({ error: "Enter a valid email address" }, 400);
    if (!validPassword(password)) return json({ error: "Password must be 8–72 characters" }, 400);
    const { data: allowed, error } = await admin.rpc("bootstrap_email_allowed", { p_email: email });
    if (error) return json({ error: "Setup check failed" }, 500);
    if (!allowed) return json({ error: "Setup is closed, or this email is not the configured owner email" }, 403);
    const { error: cErr } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (cErr) return json({ error: cErr.message }, 400);
    return json({ ok: true });
  }

  // ---------------------------------------------------------------- admin-only actions
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Not signed in" }, 401);
  const { data: who, error: whoErr } = await admin.auth.getUser(token);
  if (whoErr || !who?.user) return json({ error: "Not signed in" }, 401);
  const { data: me } = await admin.from("profiles").select("role, is_active").eq("id", who.user.id).single();
  if (!me || me.role !== "admin" || !me.is_active) return json({ error: "Only administrators can manage accounts" }, 403);

  if (action === "create") {
    const { email, password, role } = body;
    const fullName = String(body.full_name ?? "").trim().slice(0, 120);
    if (!validEmail(email)) return json({ error: "Enter a valid email address" }, 400);
    if (!validPassword(password)) return json({ error: "Password must be 8–72 characters" }, 400);
    if (!ROLES.includes(role as (typeof ROLES)[number])) return json({ error: "Invalid role" }, 400);
    if (!fullName) return json({ error: "Name is required" }, 400);
    const { data, error } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
      app_metadata: { invited_role: role, invited_by: who.user.id },
    });
    if (error) {
      const msg = /already/i.test(error.message)
        ? "An account with this email already exists"
        : /database error/i.test(error.message) && role === "collector"
          ? "Could not create the account: the collector limit has been reached"
          : error.message;
      return json({ error: msg }, 400);
    }
    return json({ ok: true, user_id: data.user?.id });
  }

  if (action === "reset_password") {
    const { user_id, password } = body;
    if (typeof user_id !== "string") return json({ error: "user_id is required" }, 400);
    if (user_id === who.user.id) return json({ error: "Use 'Change password' in your profile for your own account" }, 400);
    if (!validPassword(password)) return json({ error: "Password must be 8–72 characters" }, 400);
    const { error } = await admin.auth.admin.updateUserById(user_id, { password });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});
