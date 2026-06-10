-- ─────────────────────────────────────────────────────────────────────
-- 000_accounts.sql
-- Tabela de carteiras (contas) do usuário. Idempotente: seguro rodar
-- mesmo que a tabela já exista no banco.
-- ─────────────────────────────────────────────────────────────────────

-- Tipo de carteira
do $$
begin
  if not exists (select 1 from pg_type where typname = 'account_type') then
    create type account_type as enum (
      'checking', 'savings', 'cash', 'credit_card', 'investment', 'other'
    );
  end if;
end $$;

-- Tabela
create table if not exists public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name            text not null,
  type            account_type not null default 'checking',
  initial_balance numeric(14,2) not null default 0,
  currency        text not null default 'BRL',
  color           text,
  icon            text,
  is_archived     boolean not null default false,
  created_at      timestamptz not null default now()
);

-- Garante colunas em bancos que já tinham a tabela em versão antiga
alter table public.accounts add column if not exists is_archived boolean not null default false;
alter table public.accounts add column if not exists color text;
alter table public.accounts add column if not exists icon text;
alter table public.accounts add column if not exists currency text not null default 'BRL';

-- Índices
create index if not exists accounts_user_idx on public.accounts (user_id);
create index if not exists accounts_active_idx on public.accounts (user_id, is_archived);

-- ── RLS ──────────────────────────────────────────────────────────────
alter table public.accounts enable row level security;

drop policy if exists "accounts_select_own" on public.accounts;
create policy "accounts_select_own" on public.accounts
  for select using (auth.uid() = user_id);

drop policy if exists "accounts_insert_own" on public.accounts;
create policy "accounts_insert_own" on public.accounts
  for insert with check (auth.uid() = user_id);

drop policy if exists "accounts_update_own" on public.accounts;
create policy "accounts_update_own" on public.accounts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "accounts_delete_own" on public.accounts;
create policy "accounts_delete_own" on public.accounts
  for delete using (auth.uid() = user_id);
