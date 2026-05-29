# AssignAI

AssignAI is a focused writing and presentation studio with three tools:

- Assignment Writer: analyzes a brief, optional rubric, and extra information, then plans, writes section by section, checks each section's word count with code, rewrites out-of-range sections, humanizes, alphabetizes references, and exports the result.
- Humanizer: takes pasted text and returns a cleaner, more natural version while preserving meaning.
- PowerPoint Creator: turns a topic into a slide-by-slide outline and exports a `.pptx` deck.

The app starts with an Assignment Writer pre-sign-up screen. Visitors fill in the brief first. When they click Generate, AssignAI sends them to sign up with Google or email so the generated work can be saved.

## Product Flow

1. Visitors land directly on the Assignment Writer form.
2. They paste the assignment brief and optionally add rubric, citation style, word count, subject, tone, and extra notes.
3. Clicking Generate before sign-up scrolls the visitor to the account creation section.
4. The user signs up with Google or email.
5. Signed-in users enter the full studio and get Supabase cloud history.
6. Every signed-in generation creates a project, generation record, and usage event.
7. Users can reopen saved outputs from the sidebar.
8. Outputs can be edited, copied, downloaded as text, exported as DOCX, or exported as PPTX for presentations.

## Supabase Auth

Supabase is used for Google auth, email auth, projects, saved generations, and usage events.

1. In Supabase, go to SQL Editor and run `supabase/schema.sql`.
2. In Authentication > Providers, enable Email.
3. In Authentication > Providers, enable Google and add the Google OAuth client details.
4. In Authentication > URL Configuration, add your local and deployed URLs.
5. Add these env vars to `.env.local` and Vercel:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

Google sign-in uses Supabase OAuth with `redirectTo: window.location.origin`, so the deployed domain must be allowed in Supabase URL Configuration.

Tables:

- `profiles`: one profile per Supabase auth user.
- `projects`: one saved project shell per generation.
- `generations`: saved input/output records.
- `usage_events`: usage tracking for future credits and billing.

## Assignment Writer Pipeline

1. User enters the assignment brief as the main prompt.
2. User can optionally add rubric / marking criteria.
3. User can optionally add extra information such as source notes, required readings, tutor instructions, a preferred argument, or an existing draft.
4. Stage 1 analyzes the assignment and identifies topic, task type, citation style, academic level, marking priorities, missing information, and target word count.
5. Stage 1 also creates a section plan with target word counts that add up to the selected assignment word count.
6. Stage 2 writes the assignment section by section and includes "References used in this section" under each section.
7. Stage 3 checks every drafted section with code before humanizing. Each section gets its own 90% to 110% accepted range based on the section target.
8. If any section is outside its own 10% range, the backend sends only that section back through a rewrite loop. The loop can rewrite the section up to two times while preserving the heading, meaning, citations, placeholders, and section reference list.
9. Stage 4 humanizes and polishes the verified section draft while keeping meaning, structure, citations, placeholders, and section balance intact.
10. The backend still runs a final whole-draft word count check after humanizing. If the final draft is outside 10% of the selected target, it sends the full draft through an automatic adjustment pass.
11. The backend extracts reference lines and citation placeholders from the section drafts, deduplicates them, and sorts them alphabetically in an `Alphabetized References` section.
12. The final output includes `Brief Analysis`, `Section Plan With Word Counts`, `Writing Plan`, `Section-by-Section Draft`, `Section Word Count Checks`, `Humanized Final Draft`, `Alphabetized References`, `Word Count Check`, and `Final Checks Before Submission`.

The word counter is deterministic code, not an AI guess. Section checks count each section before humanizing and exclude that section's reference list. The final check counts the words inside the Humanized Final Draft only, excluding the plan, references, and checklist.

## Humanizer Flow

1. User opens the Humanizer section.
2. User pastes the original text into the input box.
3. User selects a tone such as Natural, Conversational, Professional, Friendly, or Confident.
4. The UI sends the text to `POST /api/humanize`.
5. The backend calls OpenRouter with the natural writing policy adapted from `blader/humanizer`.
6. The response returns only the humanized text, with no labels, notes, scores, or extra commentary.
7. The user can edit the humanized output, copy it, download it as text, or export it as `.docx`.

## Humanizer Policy

The backend includes a natural writing policy adapted from [`blader/humanizer`](https://github.com/blader/humanizer), which is MIT licensed. It is used as prompt guidance for Assignment Writer, Humanizer, and PowerPoint outputs.

AssignAI uses this as an editing quality layer, not as a guarantee against AI detection. Users still need to verify sources, citations, facts, and whether the work follows their institution's rules.

## Backend Routes

```text
POST /api/assignment
POST /api/humanize
POST /api/document/download
POST /api/powerpoint
POST /api/powerpoint/download
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
2. Enable Email and Google auth in Supabase.
3. Add local and Vercel URLs to Supabase auth redirect settings.
4. Add OpenRouter and Supabase env vars to Vercel.
5. Deploy the PR to a preview environment.
6. Test Google sign-up, email sign-up, all three tools, saved history, DOCX export, and PPTX export.

## Product Notes

AssignAI should remain a drafting and study-support tool. Generated content must be reviewed, fact-checked, and cited before use in academic work.
