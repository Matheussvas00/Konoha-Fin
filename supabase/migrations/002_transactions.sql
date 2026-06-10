-- ── Transações ────────────────────────────────────────────────────────
-- Rode este script no Supabase SQL Editor APÓS 001_categories.sql.
-- Requer que a tabela `accounts` já exista.

create table if not exists public.transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  account_id      uuid not null references public.accounts(id) on delete restrict,
  to_account_id   uuid references public.accounts(id) on delete restrict,  -- transferências
  category_id     uuid references public.categories(id) on delete set null,
  type            text not null check (type in ('income', 'expense', 'transfer')),
  status          text not null default 'effected' check (status in ('effected', 'pending')),
  description     text not null,
  amount          numeric(14,2) not null check (amount > 0),
  date            date not null,
  notes           text,
  created_at      timestamptz not null default now()
);

-- RLS
alter table public.transactions enable row level security;

create policy "Usuário vê próprios lançamentos"
  on public.transactions for select
  using (auth.uid() = user_id);

create policy "Usuário insere próprios lançamentos"
  on public.transactions for insert
  with check (auth.uid() = user_id);

create policy "Usuário atualiza próprios lançamentos"
  on public.transactions for update
  using (auth.uid() = user_id);

create policy "Usuário exclui próprios lançamentos"
  on public.transactions for delete
  using (auth.uid() = user_id);

-- Índices
create index if not exists transactions_user_id_idx    on public.transactions(user_id);
create index if not exists transactions_account_id_idx on public.transactions(account_id);
create index if not exists transactions_date_idx       on public.transactions(date desc);
create index if not exists transactions_status_idx     on public.transactions(status);

-- ── View de saldo de conta ────────────────────────────────────────────
-- Recria a view account_balances considerando as transações efetivadas.
-- Se a view já existir com outra definição, faça DROP VIEW primeiro.

create or replace view public.account_balances as
select
  a.id,
  a.user_id,
  a.initial_balance
  + coalesce(sum(
      case
        when t.type = 'income'   then  t.amount
        when t.type = 'expense'  then -t.amount
        -- transferência: subtrai da conta de origem
        when t.type = 'transfer' and t.account_id = a.id then -t.amount
        -- transferência: soma na conta de destino
        when t.type = 'transfer' and t.to_account_id = a.id then t.amount
        else 0
      end
    ) filter (where t.status = 'effected'), 0
  ) as balance
from public.accounts a
left join public.transactions t
  on (t.account_id = a.id or t.to_account_id = a.id)
  and t.user_id = a.user_id
where a.is_archived = false
group by a.id, a.user_id, a.initial_balance;
