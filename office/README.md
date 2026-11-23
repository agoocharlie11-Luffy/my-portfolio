# Private 3D AI Office — setup

This is a separate static app at `/office/`. The existing portfolio homepage is not modified.

## Current build

- Three.js 3D office with six selectable bot profiles.
- Supabase email/password authentication; there is no public sign-up UI.
- Two known n8n workflows are listed from the previously inspected workspace:
  - Gmail Invoice to Xero — `tQI3pUdsQbnJuuaK`
  - Weekly Xero Financial Summary — `mRYVXiXmHJYcbaud`
- Both workflows are marked **setup/pending** until the server-side API successfully verifies their live state.
- No run buttons or workflow mutation actions are exposed yet.

## 1. Configure Supabase Auth

1. Create or use a Supabase project on the Free plan.
2. In Supabase Project Settings → API, copy the Project URL and anon/publishable key.
3. Edit `office/config.js` and enter those two public client values.
4. In Authentication → URL Configuration, set:
   - Site URL: `https://agoocharlie11-luffy.github.io`
   - Redirect URL: `https://agoocharlie11-luffy.github.io/my-portfolio/office/`
5. Disable public sign-ups. Create/invite only approved users from the Supabase dashboard.
6. Keep email/password sign-in enabled.

The anon/publishable key is designed to be public. Never place a Supabase service-role/secret key, database password, n8n API key, or webhook secret in this repository.

## 2. Deploy the secure n8n monitoring function

The Edge Function source is in `supabase/functions/office-api/index.ts`. It verifies the caller's Supabase JWT and checks an allowlisted Supabase user ID before contacting n8n. It only implements read-only overview monitoring.

Install the Supabase CLI, log in and link this project, then set secrets and deploy:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set N8N_BASE_URL=https://agoocharlie11.app.n8n.cloud
supabase secrets set N8N_API_KEY=YOUR_N8N_API_KEY
supabase secrets set OFFICE_ALLOWED_USER_ID=YOUR_SUPABASE_AUTH_USER_UUID
supabase functions deploy office-api
```

Supabase provides `SUPABASE_URL` and `SUPABASE_ANON_KEY` to Edge Functions. Do not commit secret values.

## 3. Security and controls

- GitHub Pages is public hosting; the login screen gates the UI but does not make source files private.
- Supabase Auth protects access to the app.
- The Edge Function independently verifies the JWT and allowlisted user ID.
- n8n API credentials remain in Supabase Edge Function secrets.
- This first function is read-only. It does not trigger workflows, modify Xero, or expose a generic n8n proxy.
- Do not add run controls until dedicated n8n webhook entry points have been created, protected with Header Auth, tested, and explicitly allowlisted server-side.

## 4. Publish

The app URL is:

https://agoocharlie11-luffy.github.io/my-portfolio/office/

GitHub Pages must publish from the repository's `main` branch. Static assets under `office/` are served automatically. The portfolio root page remains untouched.
