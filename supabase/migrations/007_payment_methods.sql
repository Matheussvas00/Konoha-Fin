-- ── Formas de pagamento (CRUD) ─────────────────────────────────────────
-- Rode este script no Supabase SQL Editor APÓS 006_payment_method.sql.
--
-- Transforma a "forma de pagamento" (até aqui uma lista fixa via CHECK) em
-- uma tabela própria do usuário, permitindo criar/editar/excluir formas.
-- A coluna transactions.payment_method passa a guardar a `key` da forma.

create table if not exists public.payment_methods (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key        text not null,                 -- identificador estável guardado no lançamento
  name       text not null,                 -- rótulo exibido
  icon       text,
  is_default boolean not null default false,
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);

-- RLS
alter table public.payment_methods enable row level security;

drop policy if exists "pm_select_own" on public.payment_methods;
create policy "pm_select_own" on public.payment_methods
  for select using (auth.uid() = user_id);

drop policy if exists "pm_insert_own" on public.payment_methods;
create policy "pm_insert_own" on public.payment_methods
  for insert with check (auth.uid() = user_id);

drop policy if exists "pm_update_own" on public.payment_methods;
create policy "pm_update_own" on public.payment_methods
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "pm_delete_own" on public.payment_methods;
create policy "pm_delete_own" on public.payment_methods
  for delete using (auth.uid() = user_id);

create index if not exists payment_methods_user_idx on public.payment_methods (user_id, sort);

-- A coluna payment_method deixa de ser limitada ao CHECK fixo (agora aceita
-- as keys das formas personalizadas).
alter table public.transactions
  drop constraint if exists transactions_payment_method_check;

-- Semeia as formas padrão para todos os usuários que ainda não as têm.
insert into public.payment_methods (user_id, key, name, icon, is_default, sort)
select u.id, d.key, d.name, d.icon, true, d.sort
from auth.users u
cross join (values
  ('pix',           'Pix',                     'qr-code-outline',        1),
  ('cash',          'Dinheiro',                'cash-outline',           2),
  ('credit',        'Crédito',                 'card-outline',           3),
  ('debit',         'Débito',                  'card',                   4),
  ('bank_transfer', 'Transferência bancária',  'swap-horizontal-outline', 5)
) as d(key, name, icon, sort)
where not exists (
  select 1 from public.payment_methods pm
  where pm.user_id = u.id and pm.key = d.key
);
