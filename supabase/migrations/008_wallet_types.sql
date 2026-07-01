-- ── Tipos de carteira (CRUD) ───────────────────────────────────────────
-- Rode no Supabase SQL Editor APÓS 000_accounts.sql.
--
-- Transforma o "tipo" da carteira (até aqui um enum fixo) em uma tabela do
-- usuário, permitindo criar/editar/excluir tipos. accounts.type passa a
-- guardar a `key` do tipo (texto livre).

create table if not exists public.wallet_types (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key        text not null,
  name       text not null,
  icon       text,
  color      text,
  is_default boolean not null default false,
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);

alter table public.wallet_types enable row level security;

drop policy if exists "wt_select_own" on public.wallet_types;
create policy "wt_select_own" on public.wallet_types
  for select using (auth.uid() = user_id);

drop policy if exists "wt_insert_own" on public.wallet_types;
create policy "wt_insert_own" on public.wallet_types
  for insert with check (auth.uid() = user_id);

drop policy if exists "wt_update_own" on public.wallet_types;
create policy "wt_update_own" on public.wallet_types
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "wt_delete_own" on public.wallet_types;
create policy "wt_delete_own" on public.wallet_types
  for delete using (auth.uid() = user_id);

create index if not exists wallet_types_user_idx on public.wallet_types (user_id, sort);

-- Converte accounts.type de enum (account_type) para texto livre, para aceitar
-- as keys dos tipos personalizados.
alter table public.accounts alter column type drop default;
alter table public.accounts alter column type type text using type::text;
alter table public.accounts alter column type set default 'checking';

-- Semeia os tipos padrão para todos os usuários que ainda não os têm.
insert into public.wallet_types (user_id, key, name, icon, color, is_default, sort)
select u.id, d.key, d.name, d.icon, d.color, true, d.sort
from auth.users u
cross join (values
  ('checking',    'Conta Corrente',    'business-outline',            '#2563eb', 1),
  ('savings',     'Poupança',          'leaf-outline',                '#16a34a', 2),
  ('cash',        'Dinheiro',          'cash-outline',                '#ca8a04', 3),
  ('credit_card', 'Cartão de Crédito', 'card-outline',                '#7c3aed', 4),
  ('investment',  'Investimento',      'trending-up-outline',         '#ea580c', 5),
  ('other',       'Outro',             'ellipsis-horizontal-outline', '#64748b', 6)
) as d(key, name, icon, color, sort)
where not exists (
  select 1 from public.wallet_types wt
  where wt.user_id = u.id and wt.key = d.key
);
