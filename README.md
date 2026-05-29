# AssignAI

AssignAI is a focused writing and presentation studio with three tools:

- Assignment Writer: creates structured academic drafts from a prompt, level, word target, tone, subject, rubric, citation style, and source notes.
- Humanizer: rewrites stiff text so it reads more naturally while preserving meaning.
- PowerPoint Creator: turns a topic into a slide-by-slide outline and exports a `.pptx` deck.

The UI is built with Next.js, React, TypeScript, and Tailwind CSS. The backend is owned by the app directly and routes generation through OpenRouter when a key is configured.

## How It Works

1. The user chooses Assignment Writer, Humanizer, or PowerPoint Creator.
2. The UI sends the prompt and settings to the matching API route.
3. The backend validates input, rate-limits requests, and calls OpenRouter.
4. If no OpenRouter key is configured, mock output is returned so the UI can still be tested.
5. Outputs are saved in browser history using local storage.
6. Generated text opens in an editable output editor, so the user can revise before exporting.
7. Assignment and Humanizer outputs can export `.docx` through `/api/document/download`.
8. PowerPoint mode can export a real `.pptx` through `/api/powerpoint/download`.

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
POST /api/document/download
POST /api/powerpoint
POST /api/powerpoint/download
GET  /api/health
```

Text generation routes return JSON shaped as:

```json
{ "ok": true, "result": "Generated text" }
```

The document route returns a `.docx` file, and the PowerPoint route returns a `.pptx` file.

## Environment

```env
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-4.1-mini
OPENROUTER_APP_URL=
OPENROUTER_APP_TITLE=AssignAI
SERVICE_NAME=assignai
AI_REQUEST_TIMEOUT_MS=45000
MAX_INPUT_CHARS=20000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=20
```

## Product Notes

AssignAI should remain a drafting and study-support tool. Generated content must be reviewed, fact-checked, and cited before use in academic work.

## Next Up

- Real accounts and cloud-saved project history.
- Editable PowerPoint themes and document templates.
- Credits, payments, and usage limits before public launch.
