# AssignAI

AssignAI is a focused writing and presentation studio with three tools:

- Assignment Writer: creates structured academic drafts from a prompt, level, word target, tone, and subject.
- Humanizer: rewrites stiff text so it reads more naturally while preserving meaning.
- PowerPoint Creator: turns a topic into a slide-by-slide outline with bullets, visuals, and speaker notes.

The UI is built with Next.js, React, TypeScript, and Tailwind CSS. The backend is now owned by the app directly instead of n8n webhooks.

## Run Locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open:

```text
http://localhost:3000
```

## Backend

The app exposes these routes:

```text
POST /api/assignment
POST /api/humanize
POST /api/powerpoint
GET  /api/health
```

All generation routes return JSON shaped as:

```json
{ "ok": true, "result": "Generated text" }
```

If `OPENAI_API_KEY` is not configured, the backend returns useful mock output so the UI can still be tested.

## Environment

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
SERVICE_NAME=assignai
AI_REQUEST_TIMEOUT_MS=45000
MAX_INPUT_CHARS=20000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=20
```

## Product Notes

AssignAI should remain a drafting and study-support tool. Generated content must be reviewed, fact-checked, and cited before use in academic work.

## Next Up

- Saved project history and user accounts.
- True `.pptx` file export after the slide-outline flow is validated.
- Credits, payments, and usage limits before public launch.
