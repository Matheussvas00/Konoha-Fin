-- ── Categorias ────────────────────────────────────────────────────────
-- Rode este script no Supabase SQL Editor.

create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  parent_id  uuid references public.categories(id) on delete set null,
  name       text not null,
  type       text not null check (type in ('income', 'expense')),
  color      text,
  icon       text,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.categories enable row level security;

create policy "Usuário vê próprias categorias"
  on public.categories for select
  using (auth.uid() = user_id);

create policy "Usuário insere próprias categorias"
  on public.categories for insert
  with check (auth.uid() = user_id);

create policy "Usuário atualiza próprias categorias"
  on public.categories for update
  using (auth.uid() = user_id);

create policy "Usuário exclui próprias categorias"
  on public.categories for delete
  using (auth.uid() = user_id);

-- Índices
create index if not exists categories_user_id_idx on public.categories(user_id);
create index if not exists categories_type_idx    on public.categories(type);
