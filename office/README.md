# Charlie AI Office — hybrid hologram edition

Private static app served at `/office/`. The portfolio homepage is separate and is not changed by this app.

## What this branch adds

- A Three.js transparent projection chamber with animated blue plasma particles.
- A human-shaped particle silhouette that fades in while listening / speaking and recedes during idle.
- Text chat UI, browser microphone input (Web Speech API), and browser speech output (SpeechSynthesis).
- English and Filipino speech locale selection.
- Authenticated Supabase Edge Function actions for read-only overview and chat forwarding to n8n.
- Existing six department profiles and Supabase email/password sign-in are retained.

The browser voice animation is a visual speech-state animation. Browser SpeechSynthesis does not expose a reliable raw audio stream to this page, so this build animates to the speaking state rather than claiming waveform-perfect audio analysis. Actual AI responses require the n8n chat branch described below.

## 1. Supabase Auth

The app uses the public Supabase URL and publishable/anon key in `office/config.js`. These are browser-safe values. Never put service-role keys, database passwords, model API keys, or webhook secrets in this file or in GitHub.

In Supabase Authentication → URL Configuration:
- Site URL: `https://agoocharlie11-luffy.github.io`
- Redirect URL: `https://agoocharlie11-luffy.github.io/my-portfolio/office/`

Disable public sign-ups and create only approved users. The Edge Function checks both the Supabase JWT and `OFFICE_ALLOWED_USER_ID`.

## 2. Deploy the Edge Function

Install the Supabase CLI, log in and link the existing project. Use the project ref from your Supabase dashboard.

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set OFFICE_ALLOWED_USER_ID=YOUR_AUTH_USER_UUID
supabase secrets set N8N_BASE_URL=https://YOUR_PUBLIC_N8N_HTTPS_HOST
supabase secrets set N8N_WEBHOOK_SECRET=YOUR_LONG_RANDOM_WEBHOOK_SECRET
supabase functions deploy office-api
```

The exact secret name expected by the function is `N8N_WEBHOOK_SECRET` (not `N8N_API_KEY`). Supabase supplies `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the function.

## 3. Required n8n webhook contract

Create and activate a Webhook-triggered workflow with production path:

`POST /webhook/ai-office`

Protect the webhook with a header check for `x-office-secret` matching the Supabase secret. Do not expose the n8n editor publicly.

The Edge Function sends one of these JSON bodies:

Overview:
```json
{ "action": "overview" }
```

Chat:
```json
{ "action": "chat", "message": "Hello Charlie", "language": "en-US" }
```

For chat, the workflow must call an AI model using an API credential stored inside n8n, then respond synchronously with JSON such as:

```json
{ "reply": "Hello! How can I help you today?" }
```

The function also accepts `output`, `text`, or `response` instead of `reply`. For Filipino, the language value is `fil-PH`.

The current Edge Function verifies the signed-in user and allowlisted user ID before sending the request. It does not expose a generic n8n proxy.

## 4. Local Docker n8n

Supabase Edge Functions run on the internet and cannot reach `http://localhost:5678` on your PC. If n8n stays on local Docker, configure a secure HTTPS tunnel to the n8n webhook endpoint and set `N8N_BASE_URL` to that HTTPS host. Keep the n8n editor protected; do not publish port 5678 openly. A stable hosted n8n endpoint is another option.

The webhook workflow must be active and return the chat response in the same request. If it only acknowledges receipt, the chat UI will accurately report that no AI reply was returned.

## 5. Voice support and browser notes

- Microphone input uses `SpeechRecognition` / `webkitSpeechRecognition`; it is supported in current Chromium browsers, but support varies by browser and platform.
- Speech output uses the browser's `speechSynthesis`. Available Filipino voices depend on the operating system/browser.
- GitHub Pages uses HTTPS, which is required for microphone permission outside localhost.
- Text chat remains available if microphone recognition is unsupported or denied.

## 6. Known limitations

- Department cards are informational profiles; they do not run accounting or publishing workflows.
- Overview still reports the two known Xero workflows as pending until a real monitoring API is implemented.
- Live execution history, workflow controls, invoice processing, and reporting actions are not enabled by this UI update.
- AI chat becomes operational only after the n8n webhook, AI model credential, public HTTPS route, and Edge Function deployment are configured and tested.

## 7. Publish

The app URL remains:

https://agoocharlie11-luffy.github.io/my-portfolio/office/

This branch is a feature branch. Review and merge it into `main` only after the visual and backend tests pass. The portfolio root page is untouched.
