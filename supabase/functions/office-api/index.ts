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
    return json({ error: "Server configuration incomplete. Check Supabase Edge Function secrets." }, 503, origin);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authHeader.slice(7);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user || userData.user.id !== allowedUserId) {
    return json({ error: "Forbidden" }, 403, origin);
  }

  let body: { action?: string; message?: string; language?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, origin);
  }

  if (body.action !== "overview" && body.action !== "chat") {
    return json({ error: "Unsupported action" }, 400, origin);
  }

  if (body.action === "chat" && (typeof body.message !== "string" || !body.message.trim() || body.message.length > 2000)) {
    return json({ error: "A message between 1 and 2,000 characters is required." }, 400, origin);
  }

  try {
    const payloadIn = body.action === "chat"
      ? { action: "chat", message: body.message!.trim(), language: body.language === "fil-PH" ? "fil-PH" : "en-US" }
      : { action: "overview" };

    const response = await fetch(`${n8nBaseUrl}/webhook/ai-office`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-office-secret": webhookSecret,
        "Accept": "application/json",
      },
      body: JSON.stringify(payloadIn),
      signal: AbortSignal.timeout(body.action === "chat" ? 60000 : 15000),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return json({ error: "n8n webhook returned HTTP " + response.status }, 502, origin);
    }

    if (body.action === "chat") {
      const result = Array.isArray(payload) ? payload[0] : payload;
      const reply = result?.reply ?? result?.output ?? result?.text ?? result?.response ?? "";
      if (typeof reply !== "string" || !reply.trim()) {
        return json({ error: "The n8n webhook received the chat request but did not return a reply. Add an AI chat branch and return { reply: \"... \" }." }, 200, origin);
      }
      return json({ reply: reply.trim() }, 200, origin);
    }

    // The current overview workflow is an acknowledgement only; do not claim
    // that live n8n workflow states or execution history have been queried.
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
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "The n8n webhook timed out."
      : "Unable to reach the n8n webhook. Check that the workflow is active and the production URL is correct.";
    return json({ error: message }, 502, origin);
  }
});
