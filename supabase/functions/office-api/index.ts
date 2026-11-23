import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://agoocharlie11-luffy.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const workflowAllowlist = [
  { id: "invoice", n8nId: "tQI3pUdsQbnJuuaK", name: "Gmail Invoice to Xero" },
  { id: "reporting", n8nId: "mRYVXiXmHJYcbaud", name: "Weekly Xero Financial Summary" },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const allowedUserId = Deno.env.get("OFFICE_ALLOWED_USER_ID");
  const n8nBaseUrl = Deno.env.get("N8N_BASE_URL")?.replace(/\/$/, "");
  const n8nApiKey = Deno.env.get("N8N_API_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !allowedUserId || !n8nBaseUrl || !n8nApiKey) {
    return json({ error: "Server configuration incomplete" }, 503);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user || userData.user.id !== allowedUserId) {
    return json({ error: "Forbidden" }, 403);
  }

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (body.action !== "overview") return json({ error: "Unsupported action" }, 400);

  const headers = { "X-N8N-API-KEY": n8nApiKey, "Accept": "application/json" };
  try {
    const workflowResults = await Promise.all(workflowAllowlist.map(async (w) => {
      const response = await fetch(
        `${n8nBaseUrl}/api/v1/workflows/${encodeURIComponent(w.n8nId)}`,
        { headers },
      );
      if (!response.ok) {
        return { id: w.id, name: w.name, status: "pending", checked: false };
      }
      const workflow = await response.json();
      return {
        id: w.id,
        name: w.name,
        status: workflow.active ? "active" : "pending",
        checked: true,
      };
    }));

    const executionResponses = await Promise.all(workflowAllowlist.map(async (w) => {
      const response = await fetch(
        `${n8nBaseUrl}/api/v1/executions?workflowId=${encodeURIComponent(w.n8nId)}&limit=5`,
        { headers },
      );
      if (!response.ok) return [];
      const payload = await response.json();
      const rows = Array.isArray(payload.data) ? payload.data : [];
      return rows.map((run: Record<string, unknown>) => ({
        workflowName: w.name,
        status: String(run.status ?? (run.finished ? "success" : "running")),
        startedAt: String(run.startedAt ?? ""),
      }));
    }));

    const recentExecutions = executionResponses.flat()
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, 10);

    return json({ workflows: workflowResults, recentExecutions, checkedAt: new Date().toISOString() });
  } catch {
    return json({ error: "Unable to reach n8n monitoring API" }, 502);
  }
});
