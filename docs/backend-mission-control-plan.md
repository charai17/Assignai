# Assignment Humanizer Backend Mission Control Plan

Purpose: coordinate backend development for the Assignment Writer and Humanizer website without overwriting the existing UI. The frontend already exists in `/opt/hermes/assignment-humanizer` and currently calls `POST /api/assignment` and `POST /api/humanize`.

## Current baseline

- Project: `/opt/hermes/assignment-humanizer`
- Stack: Next.js App Router, TypeScript, Tailwind
- Existing UI: `app/page.tsx`
- Existing API routes:
  - `app/api/assignment/route.ts`
  - `app/api/humanize/route.ts`
- Existing n8n helper: `lib/n8n.ts`
- Existing env variables:
  - `N8N_ASSIGNMENT_WEBHOOK_URL`
  - `N8N_HUMANIZER_WEBHOOK_URL`
  - `N8N_WEBHOOK_AUTH_HEADER`
  - `N8N_WEBHOOK_AUTH_VALUE`

## Mission Control agent roster

### 1. Coordinator Agent

Owns:
- Overall task sequence
- File ownership boundaries
- Merge/review order
- Final integration verification

Must not:
- Rewrite the UI from scratch
- Let multiple agents edit the same file at the same time without explicit coordination

Primary output:
- Updated plan/checklist
- Final integration summary

### 2. Webhook Integration Agent

Owns:
- n8n request/response contract
- `lib/n8n.ts`
- n8n timeout/retry behavior
- response normalization
- webhook-test vs production webhook handling

Inputs needed from user:
- Assignment webhook URL
- Humanizer webhook URL
- Optional PowerPoint webhook URL
- Auth header/token, if any
- Exact expected JSON request and response examples

Acceptance checks:
- Mock mode still works if env vars are missing
- Real webhook mode works when env vars are present
- Clear errors for 401/403/404/429/5xx
- `/webhook-test/` 404 is explained as n8n test-webhook registration issue, not a site bug

### 3. API Safety Agent

Owns:
- `lib/config.ts`
- `lib/api.ts`
- `lib/rate-limit.ts`
- Input limits and validation
- Request IDs
- Health endpoint

Recommended files:
- `lib/config.ts`
- `lib/api.ts`
- `lib/rate-limit.ts`
- `app/api/health/route.ts`

Acceptance checks:
- `MAX_INPUT_CHARS` enforced
- Rate limit works for MVP single-instance use
- Every API response includes or returns a request ID
- Health endpoint returns service status

### 4. Data/History Agent

Owns only if user wants saved history now:
- Database choice
- Request/output history schema
- User/session relationship later
- Persistence boundary

Default recommendation:
- Do not add database until webhooks are working.
- Prepare interfaces only if needed.

Possible future files:
- `prisma/schema.prisma`
- `lib/db.ts`
- `app/api/history/route.ts`

Acceptance checks:
- No private webhook secrets stored in browser/client
- Prompts/outputs are stored only if user approves
- Migration path is documented

### 5. Auth/Credits Agent

Owns only if user wants login or paid usage now:
- Authentication provider decision
- User accounts
- Usage limits by user
- Credits/subscription model later

Default recommendation:
- Phase 2, after webhooks work.

Acceptance checks:
- Public preview can stay unauthenticated if user chooses
- Backend can later switch rate limits from IP-based to user-based

### 6. Frontend Contract Agent

Owns:
- Keeping the existing UI connected to backend contracts
- Minimal frontend updates only when API response shape changes
- Loading/error/request ID display improvements

Files:
- `app/page.tsx`
- possibly `app/globals.css`

Must not:
- Redesign the site unless requested
- Break current Assignment Writer / Humanizer tabs

Acceptance checks:
- Assignment form still posts to `/api/assignment`
- Humanizer form still posts to `/api/humanize`
- Output copy button still works
- Errors are user-friendly

### 7. QA/Observability Agent

Owns:
- Build/test verification
- API curl tests
- Browser smoke test
- Console error check
- Public preview verification

Acceptance checks:
- `npm run build` passes
- Local API calls pass in mock mode
- Health endpoint works
- Public preview loads correct Assignment Humanizer app
- Browser console has no app-breaking errors

## Recommended build phases

### Phase 1: Safer MVP backend

Build this first.

Tasks:
1. Add centralized config parsing.
2. Add shared API helpers: JSON parsing, request ID, validation, error formatting.
3. Add in-memory fixed-window rate limiting.
4. Harden n8n helper with configurable timeout/retries and better error mapping.
5. Add `/api/health`.
6. Update assignment/humanizer routes to use the shared helpers.
7. Verify mock mode and public preview.

### Phase 2: Real n8n wiring

Requires user-provided webhook details.

Tasks:
1. Add real webhook URLs to `.env.local`.
2. Add auth header/token if required.
3. Test assignment workflow.
4. Test humanizer workflow.
5. Adjust request payload mapping if n8n expects different field names.
6. Adjust response normalization if n8n returns a different shape.

### Phase 3: Persistence/accounts, only if requested

Tasks:
1. Choose database and auth approach.
2. Add saved history.
3. Add login.
4. Add usage/credits limits.
5. Add admin/debug views.

## Implementation rule

No implementation agent should start modifying backend code until the user confirms:

- Backend phase: Simple, Safer MVP, or Scalable
- Webhook URLs, or confirmation to build in mock mode first
- Auth required: yes/no
- Whether to save prompts/outputs now

## Minimum user input needed

- Assignment webhook URL:
- Humanizer webhook URL:
- Auth needed: yes/no
- Example assignment request JSON:
- Example assignment response JSON:
- Example humanizer request JSON:
- Example humanizer response JSON:
- Backend version: Simple / Safer MVP / Scalable
- Save history now: yes/no
