-- ─────────────────────────────────────────────────────────────────────
-- seed_demo.sql — Dados de demonstração para o Konoha Fin
--
-- Popula o MÊS ATUAL com 4 carteiras, várias receitas e despesas
-- (categorias e formas de pagamento variadas) e 2 transferências, para
-- demonstrar a IA (análises e relatórios) e os saldos por carteira.
--
-- COMO USAR: Supabase → SQL Editor → cole tudo → Run.
-- Rode UMA VEZ só (rodar de novo duplica os lançamentos). As carteiras e
-- categorias não duplicam (só cria as que faltam). Para limpar os
-- lançamentos, veja o bloco comentado no final.
-- ─────────────────────────────────────────────────────────────────────

-- Garante a coluna opcional de forma de pagamento (idempotente).
alter table public.transactions
  add column if not exists payment_method text
    check (payment_method in ('pix','cash','credit','debit','bank_transfer'));

do $$
declare
  uid uuid;
begin
  -- 1) Usuário (pelo e-mail do login)
  select id into uid from auth.users
   where lower(email) = lower('matheussvasconcelos13@gmail.com')
   limit 1;
  if uid is null then
    raise exception 'Usuário não encontrado — confira o e-mail no script.';
  end if;

  -- 2) Carteiras (cria só as que ainda não existem, por nome).
  insert into public.accounts (user_id, name, type, initial_balance, currency, icon)
  select uid, x.name, x.atype::account_type, x.bal, 'BRL', x.icon
  from (values
    ('Conta Corrente',    'checking',    1000.00, 'card-outline'),
    ('Poupança',          'savings',     5000.00, 'wallet-outline'),
    ('Cartão de Crédito', 'credit_card',    0.00, 'card-outline'),
    ('Dinheiro',          'cash',         150.00, 'cash-outline')
  ) as x(name, atype, bal, icon)
  where not exists (
    select 1 from public.accounts a
    where a.user_id = uid and a.name = x.name
  );

  -- 3) Categorias (cria só as que ainda não existem).
  insert into public.categories (user_id, name, type, icon)
  select uid, x.name, 'expense', x.icon
  from (values
    ('Mercado','cart-outline'),
    ('Transporte','car-outline'),
    ('Restaurante','restaurant-outline'),
    ('Moradia','home-outline'),
    ('Saúde','medkit-outline'),
    ('Lazer','game-controller-outline'),
    ('Educação','school-outline'),
    ('Contas','receipt-outline')
  ) as x(name, icon)
  where not exists (
    select 1 from public.categories c
    where c.user_id = uid and c.name = x.name and c.type = 'expense'
  );

  insert into public.categories (user_id, name, type, icon)
  select uid, x.name, 'income', x.icon
  from (values
    ('Salário','cash-outline'),
    ('Freelance','laptop-outline'),
    ('Investimentos','trending-up-outline')
  ) as x(name, icon)
  where not exists (
    select 1 from public.categories c
    where c.user_id = uid and c.name = x.name and c.type = 'income'
  );

  -- 4) Lançamentos do mês atual, distribuídos pelas carteiras.
  --    (compras no crédito → Cartão de Crédito; em espécie → Dinheiro;
  --     pix/débito/transferência → Conta Corrente; rendimento → Poupança)
  insert into public.transactions
    (user_id, account_id, category_id, type, status, description, amount, date, payment_method)
  select uid, a.id, c.id, v.type, 'effected', v.descr, v.amount,
         (date_trunc('month', current_date)::date + (v.day - 1)), v.pay
  from (values
    -- tipo,     categoria,       descrição,                  valor,   dia, forma,           carteira
    ('income',  'Salário',       'Salário mensal',           4800.00,  5, 'bank_transfer', 'Conta Corrente'),
    ('income',  'Freelance',     'Projeto site cliente',     1500.00, 12, 'pix',           'Conta Corrente'),
    ('income',  'Freelance',     'Manutenção sistema',        650.00, 21, 'pix',           'Conta Corrente'),
    ('income',  'Investimentos', 'Rendimento CDB',            220.50,  1, 'bank_transfer', 'Poupança'),
    ('income',  'Salário',       'Venda de usados (OLX)',     350.00, 18, 'pix',           'Conta Corrente'),

    ('expense', 'Moradia',       'Aluguel',                  1300.00,  5, 'bank_transfer', 'Conta Corrente'),
    ('expense', 'Moradia',       'Condomínio',                380.00,  5, 'bank_transfer', 'Conta Corrente'),
    ('expense', 'Contas',        'Conta de energia',          178.45, 11, 'bank_transfer', 'Conta Corrente'),
    ('expense', 'Contas',        'Internet fibra',             99.90, 11, 'debit',         'Conta Corrente'),
    ('expense', 'Contas',        'Plano de celular',           49.90, 15, 'credit',        'Cartão de Crédito'),
    ('expense', 'Mercado',       'Compras Pão de Açúcar',     412.80,  3, 'credit',        'Cartão de Crédito'),
    ('expense', 'Mercado',       'Feira da semana',            95.00, 10, 'cash',          'Dinheiro'),
    ('expense', 'Mercado',       'Mercado do mês',            268.40, 20, 'debit',         'Conta Corrente'),
    ('expense', 'Transporte',    'Gasolina',                  250.00,  7, 'credit',        'Cartão de Crédito'),
    ('expense', 'Transporte',    'Corrida de Uber',            38.50, 14, 'pix',           'Conta Corrente'),
    ('expense', 'Transporte',    'Recarga do bilhete',         60.00,  2, 'cash',          'Dinheiro'),
    ('expense', 'Restaurante',   'Almoço de trabalho',         45.90,  8, 'debit',         'Conta Corrente'),
    ('expense', 'Restaurante',   'Jantar com amigos',         132.00, 16, 'credit',        'Cartão de Crédito'),
    ('expense', 'Restaurante',   'iFood',                      58.70, 23, 'pix',           'Conta Corrente'),
    ('expense', 'Saúde',         'Farmácia',                   87.30,  9, 'debit',         'Conta Corrente'),
    ('expense', 'Saúde',         'Consulta médica',           200.00, 17, 'pix',           'Conta Corrente'),
    ('expense', 'Lazer',         'Assinatura Spotify',         21.90,  1, 'credit',        'Cartão de Crédito'),
    ('expense', 'Lazer',         'Cinema',                     64.00, 13, 'credit',        'Cartão de Crédito'),
    ('expense', 'Lazer',         'Ingresso de show',          150.00, 25, 'credit',        'Cartão de Crédito'),
    ('expense', 'Educação',      'Curso online',               89.90,  6, 'credit',        'Cartão de Crédito'),
    ('expense', 'Educação',      'Livros',                    120.00, 19, 'cash',          'Dinheiro')
  ) as v(type, cat, descr, amount, day, pay, wallet)
  join public.categories c
    on c.user_id = uid and c.name = v.cat and c.type::text = v.type
  join public.accounts a
    on a.user_id = uid and a.name = v.wallet;

  -- 5) Transferências entre carteiras (sem categoria).
  insert into public.transactions
    (user_id, account_id, to_account_id, category_id, type, status, description, amount, date)
  select uid, ao.id, ad.id, null, 'transfer', 'effected', v.descr, v.amount,
         (date_trunc('month', current_date)::date + (v.day - 1))
  from (values
    ('Reserva para a poupança', 500.00,  6, 'Conta Corrente', 'Poupança'),
    ('Saque em dinheiro',       200.00,  2, 'Conta Corrente', 'Dinheiro')
  ) as v(descr, amount, day, origem, destino)
  join public.accounts ao on ao.user_id = uid and ao.name = v.origem
  join public.accounts ad on ad.user_id = uid and ad.name = v.destino;

  raise notice 'Dados de demonstração inseridos para %', uid;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- Para LIMPAR os lançamentos de demonstração depois (apaga só o mês atual;
-- as carteiras e categorias permanecem):
--   delete from public.transactions
--   where user_id = (select id from auth.users
--                    where lower(email)=lower('matheussvasconcelos13@gmail.com'))
--     and date >= date_trunc('month', current_date)::date
--     and date <  (date_trunc('month', current_date) + interval '1 month')::date;
-- ─────────────────────────────────────────────────────────────────────
