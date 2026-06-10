-- ─────────────────────────────────────────────────────────────────────
-- 004_budgets_goals.sql
-- Orçamentos (limite mensal por categoria) e Metas (objetivos de economia).
-- ─────────────────────────────────────────────────────────────────────

-- ══ ORÇAMENTOS ════════════════════════════════════════════════════════
-- Um limite de gasto mensal recorrente por categoria de despesa.
create table if not exists public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  amount      numeric(14,2) not null check (amount >= 0),
  created_at  timestamptz not null default now(),
  -- Um único orçamento por categoria por usuário
  unique (user_id, category_id)
);

create index if not exists budgets_user_idx on public.budgets (user_id);

alter table public.budgets enable row level security;

drop policy if exists "budgets_select_own" on public.budgets;
create policy "budgets_select_own" on public.budgets
  for select using (auth.uid() = user_id);

drop policy if exists "budgets_insert_own" on public.budgets;
create policy "budgets_insert_own" on public.budgets
  for insert with check (auth.uid() = user_id);

drop policy if exists "budgets_update_own" on public.budgets;
create policy "budgets_update_own" on public.budgets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "budgets_delete_own" on public.budgets;
create policy "budgets_delete_own" on public.budgets
  for delete using (auth.uid() = user_id);

-- ══ METAS ═════════════════════════════════════════════════════════════
-- Objetivos de economia, com valor alvo e quanto já foi guardado.
create table if not exists public.goals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name           text not null,
  target_amount  numeric(14,2) not null check (target_amount > 0),
  current_amount numeric(14,2) not null default 0 check (current_amount >= 0),
  color          text,
  icon           text,
  target_date    date,
  is_completed   boolean not null default false,
  created_at     timestamptz not null default now()
);

create index if not exists goals_user_idx on public.goals (user_id);

alter table public.goals enable row level security;

drop policy if exists "goals_select_own" on public.goals;
create policy "goals_select_own" on public.goals
  for select using (auth.uid() = user_id);

drop policy if exists "goals_insert_own" on public.goals;
create policy "goals_insert_own" on public.goals
  for insert with check (auth.uid() = user_id);

drop policy if exists "goals_update_own" on public.goals;
create policy "goals_update_own" on public.goals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "goals_delete_own" on public.goals;
create policy "goals_delete_own" on public.goals
  for delete using (auth.uid() = user_id);
