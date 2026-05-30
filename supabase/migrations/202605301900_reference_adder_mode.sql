alter table public.projects drop constraint if exists projects_kind_check;
alter table public.projects
  add constraint projects_kind_check
  check (kind in ('assignment', 'references', 'humanizer', 'powerpoint'));

alter table public.generations drop constraint if exists generations_mode_check;
alter table public.generations
  add constraint generations_mode_check
  check (mode in ('assignment', 'references', 'humanizer', 'powerpoint'));

alter table public.usage_events drop constraint if exists usage_events_mode_check;
alter table public.usage_events
  add constraint usage_events_mode_check
  check (mode in ('assignment', 'references', 'humanizer', 'powerpoint'));

alter table public.generation_jobs drop constraint if exists generation_jobs_mode_check;
alter table public.generation_jobs
  add constraint generation_jobs_mode_check
  check (mode in ('assignment', 'references', 'humanizer', 'powerpoint'));
