create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('assignment', 'humanizer', 'powerpoint')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  title text not null default 'Untitled generation',
  input text not null,
  payload jsonb not null default '{}'::jsonb,
  output text,
  error text,
  request_id text,
  model text,
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  generation_id uuid references public.generations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists generation_jobs_user_created_idx on public.generation_jobs (user_id, created_at desc);
create index if not exists generation_jobs_user_status_idx on public.generation_jobs (user_id, status, created_at desc);

alter table public.generation_jobs enable row level security;

drop policy if exists "Users can manage their own generation jobs" on public.generation_jobs;

create policy "Users can manage their own generation jobs"
  on public.generation_jobs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
