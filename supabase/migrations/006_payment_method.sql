-- ── Forma de pagamento ─────────────────────────────────────────────────
-- Rode este script no Supabase SQL Editor APÓS 002_transactions.sql.
--
-- Acrescenta a forma de pagamento do lançamento (opcional):
--   pix · cash (dinheiro) · credit (crédito) · debit (débito) ·
--   bank_transfer (transferência bancária).

alter table public.transactions
  add column if not exists payment_method text
    check (payment_method in ('pix','cash','credit','debit','bank_transfer'));
