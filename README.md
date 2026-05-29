# AssignAI

AssignAI is a focused writing and presentation studio with three tools:

- Assignment Writer: analyzes a brief, optional rubric, and extra information, then plans, writes section by section, humanizes, and exports the result.
- Humanizer: takes pasted text and returns a cleaner, more natural version while preserving meaning.
- PowerPoint Creator: turns a topic into a slide-by-slide outline and exports a `.pptx` deck.

The app now has a simple pre-sign-up landing page, Supabase auth, cloud saved history, local fallback history, OpenRouter generation routes, DOCX export, and PPTX export.

## Product Flow

1. Visitors land on a simple marketing/sign-up page.
2. They can create a free account, sign in, or try the studio without an account.
3. Signed-in users get Supabase cloud history.
4. Signed-out users can still generate work with browser-only history.
5. Every signed-in generation creates a project, generation record, and usage event.
6. Users can reopen saved outputs from the sidebar.
7. Outputs can be edited, copied, downloaded as text, exported as DOCX, or exported as PPTX for presentations.

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

Supabase is used for accounts, projects, saved generations, and usage events.

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

Tables:

- `profiles`: one profile per Supabase auth user.
- `projects`: one saved project shell per generation.
- `generations`: saved input/output records.
- `usage_events`: usage tracking for future credits and billing.

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

## Backend Routes

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

## Deployment Checklist

1. Run the Supabase schema in SQL Editor.
2. Enable Email auth in Supabase.
3. Add local and Vercel URLs to Supabase auth redirect settings.
4. Add OpenRouter and Supabase env vars to Vercel.
5. Deploy the PR to a preview environment.
6. Test sign up, sign in, all three tools, saved history, DOCX export, and PPTX export.

## Product Notes

AssignAI should remain a drafting and study-support tool. Generated content must be reviewed, fact-checked, and cited before use in academic work.

## Next Up

- Credit limits and payment plans.
- Project folders and richer document naming.
- Editable PowerPoint themes and document templates.
