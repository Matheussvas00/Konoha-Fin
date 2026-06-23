-- ─────────────────────────────────────────────────────────────────────
-- seed_demo.sql — Dados de demonstração para o Konoha Fin
--
-- Popula o MÊS ATUAL com várias receitas e despesas (categorias e formas
-- de pagamento variadas), para demonstrar a IA (análises e relatórios).
--
-- COMO USAR: Supabase → SQL Editor → cole tudo → Run.
-- É seguro rodar mais de uma vez? NÃO — cada execução insere os lançamentos
-- de novo (duplica). Rode uma vez só. Para limpar, veja o bloco no final.
-- ─────────────────────────────────────────────────────────────────────

-- Garante a coluna opcional de forma de pagamento (idempotente).
alter table public.transactions
  add column if not exists payment_method text
    check (payment_method in ('pix','cash','credit','debit','bank_transfer'));

do $$
declare
  uid uuid;
  acc uuid;
begin
  -- 1) Usuário (pelo e-mail do login)
  select id into uid from auth.users
   where lower(email) = lower('matheussvasconcelos13@gmail.com')
   limit 1;
  if uid is null then
    raise exception 'Usuário não encontrado — confira o e-mail no script.';
  end if;

  -- 2) Carteira: usa a primeira existente; se não houver, cria uma.
  select id into acc from public.accounts
   where user_id = uid order by created_at limit 1;
  if acc is null then
    insert into public.accounts (user_id, name, type, initial_balance, currency)
    values (uid, 'Conta Corrente', 'checking', 1000, 'BRL')
    returning id into acc;
  end if;

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

  -- 4) Lançamentos do mês atual (data = 1º dia do mês + (dia-1)).
  insert into public.transactions
    (user_id, account_id, category_id, type, status, description, amount, date, payment_method)
  select uid, acc, c.id, v.type, 'effected', v.descr, v.amount,
         (date_trunc('month', current_date)::date + (v.day - 1)), v.pay
  from (values
    -- tipo,     categoria,       descrição,                  valor,   dia, forma
    ('income',  'Salário',       'Salário mensal',           4800.00,  5, 'bank_transfer'),
    ('income',  'Freelance',     'Projeto site cliente',     1500.00, 12, 'pix'),
    ('income',  'Freelance',     'Manutenção sistema',        650.00, 21, 'pix'),
    ('income',  'Investimentos', 'Rendimento CDB',            220.50,  1, 'bank_transfer'),
    ('income',  'Salário',       'Venda de usados (OLX)',     350.00, 18, 'pix'),

    ('expense', 'Moradia',       'Aluguel',                  1300.00,  5, 'bank_transfer'),
    ('expense', 'Moradia',       'Condomínio',                380.00,  5, 'bank_transfer'),
    ('expense', 'Contas',        'Conta de energia',          178.45, 11, 'bank_transfer'),
    ('expense', 'Contas',        'Internet fibra',             99.90, 11, 'debit'),
    ('expense', 'Contas',        'Plano de celular',           49.90, 15, 'credit'),
    ('expense', 'Mercado',       'Compras Pão de Açúcar',     412.80,  3, 'credit'),
    ('expense', 'Mercado',       'Feira da semana',            95.00, 10, 'cash'),
    ('expense', 'Mercado',       'Mercado do mês',            268.40, 20, 'debit'),
    ('expense', 'Transporte',    'Gasolina',                  250.00,  7, 'credit'),
    ('expense', 'Transporte',    'Corrida de Uber',            38.50, 14, 'pix'),
    ('expense', 'Transporte',    'Recarga do bilhete',         60.00,  2, 'debit'),
    ('expense', 'Restaurante',   'Almoço de trabalho',         45.90,  8, 'debit'),
    ('expense', 'Restaurante',   'Jantar com amigos',         132.00, 16, 'credit'),
    ('expense', 'Restaurante',   'iFood',                      58.70, 23, 'pix'),
    ('expense', 'Saúde',         'Farmácia',                   87.30,  9, 'debit'),
    ('expense', 'Saúde',         'Consulta médica',           200.00, 17, 'pix'),
    ('expense', 'Lazer',         'Assinatura Spotify',         21.90,  1, 'credit'),
    ('expense', 'Lazer',         'Cinema',                     64.00, 13, 'credit'),
    ('expense', 'Lazer',         'Ingresso de show',          150.00, 25, 'credit'),
    ('expense', 'Educação',      'Curso online',               89.90,  6, 'credit'),
    ('expense', 'Educação',      'Livros',                    120.00, 19, 'pix')
  ) as v(type, cat, descr, amount, day, pay)
  join public.categories c
    on c.user_id = uid and c.name = v.cat and c.type = v.type;

  raise notice 'Dados de demonstração inseridos para %', uid;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- Para LIMPAR os dados de demonstração depois (apaga só o mês atual):
--   delete from public.transactions
--   where user_id = (select id from auth.users
--                    where lower(email)=lower('matheussvasconcelos13@gmail.com'))
--     and date >= date_trunc('month', current_date)::date
--     and date <  (date_trunc('month', current_date) + interval '1 month')::date;
-- ─────────────────────────────────────────────────────────────────────
