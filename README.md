# Assignment + Humanizer Website

Simple Next.js website that lets users generate assignments or humanize text through your n8n agents.

## Run locally/on VPS

```bash
cd /opt/hermes/assignment-humanizer
npm install
cp .env.example .env.local
npm run dev
```

Open:

```text
http://localhost:3000
```

## Connect n8n

Edit `.env.local`:

```env
N8N_ASSIGNMENT_WEBHOOK_URL=https://your-n8n-domain.com/webhook/assignment
N8N_HUMANIZER_WEBHOOK_URL=https://your-n8n-domain.com/webhook/humanizer
```

Optional auth header:

```env
N8N_WEBHOOK_AUTH_HEADER=x-api-key
N8N_WEBHOOK_AUTH_VALUE=your-secret
```

## Payload sent to assignment webhook

```json
{
  "input": "Write about climate change",
  "prompt": "Write about climate change",
  "level": "University",
  "wordCount": 1000,
  "tone": "Academic",
  "subject": "Science"
}
```

## Payload sent to humanizer webhook

```json
{
  "input": "Text to rewrite",
  "text": "Text to rewrite",
  "tone": "Natural"
}
```

## Accepted n8n response fields

The app will display the first string it finds from:

```text
result, output, text, message, content, response, data[0], data
```

If webhook URLs are blank, the app runs in mock mode so the UI can be tested.

## Backend production notes

The API routes intentionally stay lightweight and n8n-compatible:

- Frontend contract: `/api/assignment` and `/api/humanize` return JSON shaped as `{ ok: boolean, result: string, raw?: unknown }`.
- Each request gets an `x-request-id` response header and the same `requestId` is forwarded to n8n.
- Request bodies are validated as JSON objects with a non-empty `input` string (also accepts `text`, `assignment`, or `content` for compatibility).
- n8n calls use a configurable timeout and a small retry for transient network/HTTP errors.
- A simple in-memory fixed-window rate limiter protects the MVP without Redis.
- Health check: `GET /api/health` returns `{ ok, service, time }`.

Optional environment variables:

```env
SERVICE_NAME=assignment-humanizer
N8N_WEBHOOK_TIMEOUT_MS=30000
N8N_WEBHOOK_RETRIES=1
MAX_INPUT_CHARS=20000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=20
```

Production upgrade path when traffic grows:

1. Replace the in-memory rate limiter with Redis/Upstash so limits work across Vercel/server instances.
2. Add auth and abuse controls before public launch; later connect Stripe credits/subscriptions to enforce paid usage.
3. Store requests/jobs in Postgres if users need history, retries, or dashboard visibility.
4. Add a queue plus background workers if n8n workflows become slow or unreliable; return a job ID immediately and poll/stream results.
5. Add structured logs/metrics around `requestId`, route, status, latency, and n8n response codes.

Note: n8n `webhook-test` URLs can return 404 unless the workflow is actively waiting after clicking `Execute workflow`; that is an n8n workflow state issue, not necessarily an app failure.
