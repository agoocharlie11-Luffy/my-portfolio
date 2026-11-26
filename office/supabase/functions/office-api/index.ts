import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://agoocharlie11-luffy.github.io",
  "https://agoocharlie11.github.io",
]);

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin)
      ? origin
      : "https://agoocharlie11-luffy.github.io",
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

type OfficeRequestBody = {
  action?: string;
  message?: string;
  language?: string;
  voice?: boolean;
};

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

  let body: OfficeRequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, origin);
  }

  if (body.action === "overview") {
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
      return json({
        error: "Unable to reach the n8n webhook. Check that the workflow is active and the production URL is correct.",
      }, 502, origin);
    }
  }

  if (body.action === "chat") {
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return json({ error: "Message is required" }, 400, origin);
    }
    if (message.length > 2000) {
      return json({ error: "Message exceeds 2,000 characters" }, 400, origin);
    }

    const language = typeof body.language === "string" && body.language.trim()
      ? body.language.trim()
      : "en-US";
    const voice = body.voice !== false;

    try {
      const response = await fetch(`${n8nBaseUrl}/webhook/ai-office`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-office-secret": webhookSecret,
          "Accept": "application/json",
        },
        body: JSON.stringify({
          action: "chat",
          message,
          language,
          voice,
          userId: userData.user.id,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return json({ error: "n8n webhook returned HTTP " + response.status }, 502, origin);
      }

      const dataObj = (payload && typeof payload === "object") ? payload as Record<string, unknown> : {};
      const reply =
        typeof dataObj.reply === "string" ? dataObj.reply :
        typeof dataObj.output === "string" ? dataObj.output :
        typeof dataObj.text === "string" ? dataObj.text :
        typeof dataObj.response === "string" ? dataObj.response :
        "";

      const audioBase64 =
        typeof dataObj.audioBase64 === "string" ? dataObj.audioBase64 :
        typeof dataObj.audio_base64 === "string" ? dataObj.audio_base64 :
        undefined;

      const audioMimeType =
        typeof dataObj.audioMimeType === "string" ? dataObj.audioMimeType :
        typeof dataObj.audio_mime_type === "string" ? dataObj.audio_mime_type :
        "audio/mpeg";

      return json({
        reply,
        audioBase64,
        audioMimeType,
        raw: payload,
      }, 200, origin);
    } catch {
      return json({
        error: "Unable to reach the n8n chat webhook. Check that the workflow is active and the production URL is correct.",
      }, 502, origin);
    }
  }

  return json({ error: "Unsupported action" }, 400, origin);
});
