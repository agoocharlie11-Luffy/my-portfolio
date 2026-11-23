// Public browser configuration only. These values are safe to expose when Supabase RLS/Auth are configured.
// NEVER place a Supabase service-role key, database password, n8n API key, or webhook secret here.
window.OFFICE_CONFIG = {
  supabaseUrl: "YOUR_SUPABASE_PROJECT_URL",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY",
  edgeFunction: "office-api"
};
