import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://agoocharlie11-luffy.github.io",
  "https://agoocharlie11.github.io",
]);

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://agoocharlie11-luffy.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const allowedUserId = Deno.env.get("OFFICE_ALLOWED_USER_ID");
  const n8nBaseUrl = Deno.env.get("N8N_BASE_URL")?.replace(/\/$/, "");
  const webhookSecret = Deno.env.get("N8N_WEBHOOK_SECRET");

  if (!supabaseUrl || !supabaseAnonKey || !allowedUserId || !n8nBaseUrl || !webhookSecret) {
    return json({ error: "Server configuration incomplete" }, 503, origin);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authHeader.slice(7);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user || userData.user.id !== allowedUserId) {
    return json({ error: "Forbidden" }, 403, origin);
  }

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, origin);
  }
  if (body.action !== "overview") return json({ error: "Unsupported action" }, 400, origin);

  try {
    const response = await fetch(`${n8nBaseUrl}/webhook/ai-office`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-office-secret": webhookSecret,
        "Accept": "application/json",
      },
      body: JSON.stringify({ action: "overview" }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return json({ error: "n8n webhook returned HTTP " + response.status }, 502, origin);
    }

    // The current n8n webhook only acknowledges receipt. It does not yet query
    // workflow states or execution history, so report those as unverified.
    return json({
      backendConnected: true,
      webhook: payload,
      workflows: [
        { id: "invoice", name: "Gmail Invoice to Xero", status: "pending", checked: false },
        { id: "reporting", name: "Weekly Xero Financial Summary", status: "pending", checked: false },
      ],
      recentExecutions: [],
      note: "Webhook connection verified. Live workflow status and execution history are not connected yet.",
      checkedAt: new Date().toISOString(),
    }, 200, origin);
  } catch {
    return json({ error: "Unable to reach the n8n webhook. Check that the workflow is active and the production URL is correct." }, 502, origin);
  }
});
