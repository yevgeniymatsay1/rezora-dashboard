-- Prompt Factory supporting tables
-- creates lead_specs, compiled_prompts, and compiler_feedback

create table if not exists public.lead_specs (
  id uuid primary key default gen_random_uuid(),
  lead_type text not null,
  title text,
  description text,
  version integer not null default 1,
  spec jsonb not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_type, version)
);

create table if not exists public.compiled_prompts (
  id uuid primary key default gen_random_uuid(),
  lead_spec_id uuid not null references public.lead_specs(id) on delete cascade,
  compiled_by uuid not null references public.profiles(id) on delete cascade,
  system_base_prompt text not null,
  state_graph jsonb not null,
  variant jsonb not null default '{}'::jsonb,
  notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.compiler_feedback (
  id uuid primary key default gen_random_uuid(),
  lead_type text not null,
  compiled_prompt_id uuid references public.compiled_prompts(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  feedback text,
  edited_prompt text,
  created_at timestamptz not null default now()
);

create index if not exists compiled_prompts_lead_spec_id_idx on public.compiled_prompts (lead_spec_id);
create index if not exists compiler_feedback_lead_type_idx on public.compiler_feedback (lead_type);
create index if not exists compiler_feedback_compiled_prompt_id_idx on public.compiler_feedback (compiled_prompt_id);

-- Updated at trigger for lead_specs
drop trigger if exists handle_lead_specs_updated_at on public.lead_specs;
create trigger handle_lead_specs_updated_at
  before update on public.lead_specs
  for each row
  execute function public.handle_updated_at();

alter table public.lead_specs enable row level security;
alter table public.compiled_prompts enable row level security;
alter table public.compiler_feedback enable row level security;

grant select, insert, update, delete on table public.lead_specs to authenticated, service_role;
grant select, insert, update, delete on table public.compiled_prompts to authenticated, service_role;
grant select, insert, update, delete on table public.compiler_feedback to authenticated, service_role;

-- Service role full access (edge functions run with service_role key)
create policy "Service role can manage lead_specs"
  on public.lead_specs
  for all
  using (auth.jwt()->>'role' = 'service_role')
  with check (auth.jwt()->>'role' = 'service_role');

create policy "Service role can manage compiled_prompts"
  on public.compiled_prompts
  for all
  using (auth.jwt()->>'role' = 'service_role')
  with check (auth.jwt()->>'role' = 'service_role');

create policy "Service role can manage compiler_feedback"
  on public.compiler_feedback
  for all
  using (auth.jwt()->>'role' = 'service_role')
  with check (auth.jwt()->>'role' = 'service_role');

-- Allow owners (admins logged into dashboard) to access their own records when not using service role
create policy "Owners can manage their lead_specs"
  on public.lead_specs
  for all
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create policy "Owners can manage their compiled_prompts"
  on public.compiled_prompts
  for all
  using (auth.uid() = compiled_by)
  with check (auth.uid() = compiled_by);

create policy "Owners can manage their compiler_feedback"
  on public.compiler_feedback
  for all
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);
