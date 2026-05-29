# AssignAI

AssignAI is a focused writing and presentation studio with three tools:

- Assignment Writer: analyzes a brief, optional rubric, and extra information, then plans, writes section by section, humanizes, and exports the result.
- Humanizer: takes pasted text and returns a cleaner, more natural version while preserving meaning.
- PowerPoint Creator: turns a topic into a slide-by-slide outline and exports a `.pptx` deck.

The UI is built with Next.js, React, TypeScript, Tailwind CSS, and Supabase. The backend is owned by the app directly and routes generation through OpenRouter when a key is configured.

## Assignment Writer Flow

1. User enters the assignment brief as the main prompt.
2. User can optionally add rubric / marking criteria.
3. User can optionally add extra information such as source notes, required readings, tutor instructions, a preferred argument, or an existing draft.
4. The AI analyzes what the assignment is about.
5. It infers or uses the selected word count, citation style, academic level, tone, and subject.
6. It breaks the assignment into sections with target word counts.
7. It writes the assignment section by section.
8. It humanizes the final draft while keeping the academic meaning and citation placeholders intact.
9. The user edits the result in-app, then exports text or `.docx`.

## Humanizer Flow

1. User opens the Humanizer section.
2. User pastes the original text into the input box.
3. User selects a tone such as Natural, Conversational, Professional, Friendly, or Confident.
4. The UI sends the text to `POST /api/humanize`.
5. The backend calls OpenRouter with the natural writing policy adapted from `blader/humanizer`.
6. The response returns only the humanized text, with no labels, notes, scores, or extra commentary.
7. The user can edit the humanized output, copy it, download it as text, or export it as `.docx`.

## Supabase Auth and History

Supabase is used for accounts and saved generation history.

1. Create or open a Supabase project.
2. In Supabase, go to SQL Editor.
3. Paste and run `supabase/schema.sql`.
4. In Authentication > Providers, enable Email.
5. In Authentication > URL Configuration, add your local and deployed URLs.
6. Add these env vars to `.env.local` and Vercel:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

When Supabase is configured, users can sign up, sign in, and save generations to cloud history. When it is not configured, AssignAI still works with local browser history.

## Humanizer Policy

The backend includes a natural writing policy adapted from [`blader/humanizer`](https://github.com/blader/humanizer), which is MIT licensed. It is used as prompt guidance for Assignment Writer, Humanizer, and PowerPoint outputs.

The policy focuses on:

- preserving meaning and factual claims;
- avoiding fabricated sources, quotes, statistics, URLs, DOI values, and references;
- replacing inflated or vague wording with clearer language;
- removing chatbot artifacts, filler phrases, generic conclusions, and decorative formatting;
- keeping academic writing precise while making sentence rhythm more natural.

AssignAI uses this as an editing quality layer, not as a guarantee against AI detection. Users still need to verify sources, citations, facts, and whether the work follows their institution's rules.

## How It Works

1. The user chooses Assignment Writer, Humanizer, or PowerPoint Creator.
2. The UI sends the prompt and settings to the matching API route.
3. The backend validates input, rate-limits requests, and calls OpenRouter.
4. If no OpenRouter key is configured, mock output is returned so the UI can still be tested.
5. Outputs save to Supabase cloud history for signed-in users, or browser history for signed-out users.
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
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
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

- Project folders and document naming.
- Editable PowerPoint themes and document templates.
- Credits, payments, and usage limits before public launch.
