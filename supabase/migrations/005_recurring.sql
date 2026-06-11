-- ── Transações recorrentes ────────────────────────────────────────────
-- Rode este script no Supabase SQL Editor APÓS 002_transactions.sql.
--
-- Acrescenta suporte a lançamentos recorrentes: a "transação-modelo" guarda o
-- padrão de repetição e a próxima data a gerar; as ocorrências geradas apontam
-- de volta para o modelo via `recurring_parent`.
--
-- Também corrige a ausência do default de `user_id` nas tabelas transactions e
-- categories (accounts, budgets e goals já usam `default auth.uid()`); sem isso,
-- inserts que não enviam user_id falham na política de RLS.

alter table public.transactions
  alter column user_id set default auth.uid();

alter table public.categories
  alter column user_id set default auth.uid();

alter table public.transactions
  add column if not exists recurrence text
    check (recurrence in ('daily','weekly','biweekly','monthly','quarterly','annual')),
  add column if not exists recurrence_end  date,
  add column if not exists recurrence_next date,
  add column if not exists recurring_parent uuid
    references public.transactions(id) on delete set null;

-- Índice para localizar rapidamente os modelos cuja próxima ocorrência venceu.
create index if not exists transactions_recurrence_idx
  on public.transactions (user_id, recurrence_next)
  where recurrence is not null;
