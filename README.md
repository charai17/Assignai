# AssignAI

AssignAI is a writing and presentation studio with three tools:

- Assignment Writer: extracts assignment briefs from pasted text or PDF, detects the word count where possible, plans real content sections, drafts section by section, checks word counts with code, polishes the draft, and sorts references.
- Humanizer: rewrites pasted text more naturally while preserving meaning, claims, and citations.
- PowerPoint Creator: turns a topic or draft into a slide outline and exports a `.pptx` deck.

The app opens on the Assignment Writer. Visitors can paste or upload a brief first, then sign up with Google or email when they are ready to generate and save work.

## Current Product Flow

1. User pastes an assignment brief or uploads a text-based PDF.
2. Optional fields let the user add rubric/marking criteria, citation style, word count, and extra notes.
3. Word count defaults to `Auto-detect` and is capped at 5000 words.
4. Clicking Generate before sign-up moves the user to account creation.
5. Signed-in users get the full studio and Supabase cloud history.
6. Outputs can be edited, copied, downloaded as text, exported as DOCX, or exported as PPTX for presentations.

## Assignment Writer Pipeline

1. **Intake:** code reads pasted text or extracts text from a PDF.
2. **Brief analyzer:** AI identifies the task, word count, citation style, marking priorities, constraints, and missing information.
3. **Section planner:** AI creates only real assignment/report sections. Marking criteria such as referencing, grammar, structure, spelling, presentation, and formatting are integrated across the draft, not treated as standalone sections.
4. **Section writer:** AI writes the planned sections using only supplied project details. Missing sources are left as placeholders.
5. **Section word counter:** code checks each section against its 90% to 110% target range.
6. **Section rewriter:** AI rewrites only sections that fail the code word-count check.
7. **Humanizer/editor:** AI polishes the verified draft without adding facts, sources, or hidden planning notes.
8. **Reference sorter:** code extracts citation placeholders and source lines, deduplicates them, and sorts them alphabetically.
9. **Final word counter:** code checks the final report draft and adds a short notice if the count still needs review.

The user-facing output should be the assignment/report draft, alphabetized references, and word-count note only. It should not expose brief analysis, section planning, pipeline stages, or internal checklists.

## Supabase

Supabase is used for Google auth, email auth, projects, saved generations, and usage events.

1. Run `supabase/schema.sql` in the Supabase SQL Editor.
2. Enable Email auth.
3. Enable Google auth and add the Google OAuth client details.
4. In Authentication > URL Configuration, add local and deployed URLs.
5. Add these env vars locally and in Vercel:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

Google sign-in uses `redirectTo: window.location.origin`, so the deployed domain must be allowed in Supabase URL Configuration.

## AI Provider

AssignAI can use OpenAI directly or OpenRouter. If `OPENAI_API_KEY` is set, the backend uses OpenAI. If only `OPENROUTER_API_KEY` is set, it uses OpenRouter. If no AI key is set, mock output keeps the UI testable.

```env
AI_PROVIDER=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1
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

Signed-in users send their Supabase session token to the backend when generating. The backend saves successful generations to Supabase through row-level security, then the browser refreshes cloud history.

## Backend Routes

```text
POST /api/assignment
POST /api/humanize
POST /api/document/download
POST /api/powerpoint
POST /api/powerpoint/download
POST /api/upload/pdf
GET  /api/health
```

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

## Product Notes

AssignAI should remain a drafting and study-support tool. Generated content must be reviewed, fact-checked, sourced, and edited before academic use.
