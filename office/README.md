# Private 3D AI Office — setup

This folder is the first frontend scaffold for Charlie's private n8n operations room. The main portfolio is untouched.

## Security model

- GitHub Pages serves only the static UI. It does not store n8n API keys.
- Supabase Auth provides email/password sign-in. Disable public sign-ups and create only your own user.
- A Supabase Edge Function must verify the user's JWT and an allowlisted user ID before it calls n8n.
- Keep the n8n API key and webhook URLs in Edge Function secrets only.
- The office is not private/production-ready until Supabase is configured, the Edge Function is deployed, and an allowlisted user is created. Do not put passwords, API keys, webhook URLs, or Xero credentials in this repository.

## 1. Create Supabase project

1. Create a Supabase project.
2. In Authentication > Providers, enable Email. Disable public sign-ups.
3. Create your own user from the Supabase dashboard (invite/create user).
4. Copy the Project URL and anon/publishable key into app.js as supabaseUrl and supabaseAnonKey. These are public client config values, not service secrets.
5. Deploy the Edge Function in supabase/functions/office-api.
6. Set Edge Function secrets:
   - N8N_BASE_URL=https://agoocharlie11.app.n8n.cloud
   - N8N_API_KEY=your n8n API key
   - OFFICE_ALLOWED_USER_ID=your Supabase auth user UUID
   - Optional trigger webhook secrets only after authenticated webhook workflows have been built and tested.

## 2. Deploy the Edge Function

Install Supabase CLI, log in, link your project, then run:

    supabase functions deploy office-api
    supabase secrets set N8N_BASE_URL=https://agoocharlie11.app.n8n.cloud
    supabase secrets set N8N_API_KEY=YOUR_N8N_API_KEY
    supabase secrets set OFFICE_ALLOWED_USER_ID=YOUR_SUPABASE_USER_UUID

Never commit secret values to GitHub.

## 3. n8n integration status

Existing inspected workflows:
- Gmail Invoice to Xero (tQI3pUdsQbnJuuaK) — active, 19 nodes, two triggers (hourly labelled Gmail intake and invoice upload form). It has no dedicated authenticated office-control webhook yet.
- Weekly Xero Financial Summary (mRYVXiXmHJYcbaud) — active, scheduled Mondays at 8:00 AM Asia/Manila, plus a manual trigger. It has no dedicated authenticated office-control webhook yet.

The frontend therefore does not expose Run buttons yet. Before enabling actions, create dedicated webhook entry points with Header Auth in n8n, verify their behavior, and store the webhook URLs and header secrets as Supabase Edge Function secrets. Preserve the existing schedules and human review controls.

## 4. Deploy the website

GitHub Pages already publishes the portfolio from main. Once Supabase configuration and the Edge Function are complete, the office will be at:

https://agoocharlie11-luffy.github.io/my-portfolio/office/

The app is noindex and uses an invitation-only Supabase sign-in. A public URL alone is not a security boundary; Supabase and the Edge Function must be correctly configured before private data or controls are exposed.
