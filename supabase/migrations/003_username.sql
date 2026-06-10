-- ─────────────────────────────────────────────────────────────────────
-- 003_username.sql
-- Adiciona "username" ao perfil para permitir login por nome de usuário.
-- ─────────────────────────────────────────────────────────────────────

-- 1. Coluna username (única, opcional até ser definida)
alter table public.profiles
  add column if not exists username text;

-- Garante unicidade case-insensitive (joao == JOAO)
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username))
  where username is not null;

-- 2. Função para resolver username -> email no momento do login.
--    SECURITY DEFINER: executa com privilégios do dono, ignorando RLS,
--    pois o usuário ainda não está autenticado quando faz login.
create or replace function public.get_email_by_username(p_username text)
returns text
language sql
security definer
set search_path = public
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(trim(p_username))
  limit 1;
$$;

-- 3. Permite que anon (tela de login) e usuários autenticados chamem a função
grant execute on function public.get_email_by_username(text) to anon, authenticated;

-- 4. Função auxiliar: verifica se um username está disponível.
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
    where lower(username) = lower(trim(p_username))
  );
$$;

grant execute on function public.is_username_available(text) to anon, authenticated;
