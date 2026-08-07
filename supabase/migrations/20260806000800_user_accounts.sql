-- =====================================================================
-- Palavra Livre - Contas de jogador
-- Migration 08: evolucao de profiles com username unico.
--
-- ADITIVA E SEGURA PARA BANCO COM DADOS.
-- Nao recria profiles, nao apaga linha nenhuma, nao mexe em campeonatos.
--
-- ESTRATEGIA DE COMPATIBILIDADE
-- Hoje existem usuarios anonimos (Supabase Auth) com perfil e display_name.
-- Eles continuam validos. A conversao para conta permanente acontece pelo
-- proprio Supabase Auth (PUT /auth/v1/user com email e senha), o que
-- PRESERVA o mesmo auth.users.id. Como profiles, championship_admins e
-- championship_participants referenciam esse id, nada precisa migrar:
-- o historico, a inscricao e o acesso administrativo continuam intactos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Colunas novas em profiles.
-- username fica NULLABLE de proposito: perfis anonimos antigos nao tem um,
-- e forcar NOT NULL quebraria linhas existentes.
-- ---------------------------------------------------------------------
alter table profiles add column if not exists username text;

alter table profiles
  add column if not exists username_normalized text
  generated always as (lower(btrim(username))) stored;

-- Data de entrada no Palavra Livre. created_at ja existe e serve.
-- Mantemos apenas um marcador de conta permanente.
alter table profiles add column if not exists is_permanent boolean not null default false;

-- ---------------------------------------------------------------------
-- Unicidade real do username, no banco.
-- Indice UNIQUE parcial: ignora perfis sem username e resolve corrida
-- entre dois cadastros simultaneos (um dos dois recebe unique_violation).
-- ---------------------------------------------------------------------
create unique index if not exists profiles_username_normalized_key
  on profiles (username_normalized)
  where username_normalized is not null;

-- ---------------------------------------------------------------------
-- Regras de formato do username.
-- Letras, numeros, ponto, hifen e underscore. De 3 a 20 caracteres.
-- Validado por constraint para nao depender do frontend.
-- NOT VALID: nao verifica linhas antigas na aplicacao da migration,
-- mas passa a valer para toda escrita nova.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_username_format'
  ) then
    alter table profiles
      add constraint profiles_username_format
      check (
        username is null
        or (
          char_length(btrim(username)) between 3 and 20
          and btrim(username) ~ '^[A-Za-z0-9][A-Za-z0-9._-]*[A-Za-z0-9]$'
        )
      )
      not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Normalizacao e validacao reutilizaveis.
-- ---------------------------------------------------------------------
create or replace function pl_normalize_username(p_username text)
returns text
language sql
immutable
as $$
  select lower(btrim(coalesce(p_username, '')));
$$;

create or replace function pl_username_is_valid(p_username text)
returns boolean
language sql
immutable
as $$
  select btrim(coalesce(p_username, '')) <> ''
    and char_length(btrim(p_username)) between 3 and 20
    and btrim(p_username) ~ '^[A-Za-z0-9][A-Za-z0-9._-]*[A-Za-z0-9]$';
$$;

-- ---------------------------------------------------------------------
-- Consulta de disponibilidade, usada pelo formulario de cadastro.
-- Nao revela nada sobre o dono do username: apenas livre ou ocupado.
-- ---------------------------------------------------------------------
create or replace function pl_username_available(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized text := pl_normalize_username(p_username);
begin
  if not pl_username_is_valid(p_username) then
    return jsonb_build_object('available', false, 'reason', 'INVALID_USERNAME');
  end if;

  if exists (
    select 1 from profiles
    where username_normalized = normalized
      and id is distinct from auth.uid()
  ) then
    return jsonb_build_object('available', false, 'reason', 'USERNAME_TAKEN');
  end if;

  return jsonb_build_object('available', true, 'reason', null);
end;
$$;

-- ---------------------------------------------------------------------
-- Define ou troca o username do usuario autenticado.
-- Sempre auth.uid(): o cliente nunca informa de quem e o perfil.
-- ---------------------------------------------------------------------
create or replace function pl_set_username(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_username text := btrim(p_username);
  saved profiles%rowtype;
begin
  if current_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if not pl_username_is_valid(clean_username) then
    raise exception 'INVALID_USERNAME' using errcode = 'P0001';
  end if;

  begin
    insert into profiles (id, display_name, username)
    values (current_user_id, clean_username, clean_username)
    on conflict (id) do update
      set username = excluded.username,
          -- display_name acompanha o username enquanto forem iguais.
          display_name = case
            when profiles.display_name = profiles.username or profiles.username is null
              then excluded.username
            else profiles.display_name
          end
    returning * into saved;
  exception
    when unique_violation then
      raise exception 'USERNAME_TAKEN' using errcode = 'P0001';
  end;

  return jsonb_build_object(
    'id', saved.id,
    'username', saved.username,
    'displayName', saved.display_name,
    'createdAt', saved.created_at,
    'isPermanent', saved.is_permanent
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Perfil do usuario autenticado, com o que a interface precisa.
-- Nunca devolve e-mail nem qualquer dado de autenticacao.
-- ---------------------------------------------------------------------
create or replace function pl_get_my_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  profile_record profiles%rowtype;
  is_permanent_account boolean;
begin
  if current_user_id is null then
    return null;
  end if;

  select * into profile_record from profiles where id = current_user_id;

  if not found then
    return null;
  end if;

  -- Fonte da verdade sobre "conta permanente": existir e-mail em auth.users.
  select coalesce(users.email, '') <> ''
    into is_permanent_account
  from auth.users as users
  where users.id = current_user_id;

  return jsonb_build_object(
    'id', profile_record.id,
    'username', profile_record.username,
    'displayName', profile_record.display_name,
    'createdAt', profile_record.created_at,
    'isPermanent', coalesce(is_permanent_account, false),
    'isAdmin', cd_is_admin(current_user_id)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Sincroniza is_permanent quando a conta ganha e-mail.
-- Cobre a conversao de sessao anonima em conta permanente.
-- ---------------------------------------------------------------------
create or replace function pl_sync_permanent_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set is_permanent = coalesce(new.email, '') <> ''
  where id = new.id
    and is_permanent is distinct from (coalesce(new.email, '') <> '');

  return new;
end;
$$;

drop trigger if exists pl_on_auth_user_updated on auth.users;
create trigger pl_on_auth_user_updated
  after update of email on auth.users
  for each row execute function pl_sync_permanent_flag();

-- ---------------------------------------------------------------------
-- Criacao do perfil no cadastro.
-- Substitui cd_handle_new_user (migration 06) mantendo o comportamento
-- anterior e passando a aproveitar o username enviado no metadata.
-- Se o username escolhido colidir, o perfil nasce sem username e a
-- interface pede outro. O cadastro nunca falha por causa disso.
-- ---------------------------------------------------------------------
create or replace function cd_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_username text := nullif(btrim(new.raw_user_meta_data ->> 'username'), '');
  requested_display text := nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '');
  fallback_name text := 'Jogador ' || substr(new.id::text, 1, 6);
  username_free boolean := false;
begin
  if requested_username is not null and pl_username_is_valid(requested_username) then
    username_free := not exists (
      select 1 from public.profiles
      where username_normalized = pl_normalize_username(requested_username)
    );
  end if;

  insert into public.profiles (id, display_name, username, is_permanent)
  values (
    new.id,
    coalesce(requested_display, requested_username, fallback_name),
    case when username_free then requested_username else null end,
    coalesce(new.email, '') <> ''
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Permissoes.
-- ---------------------------------------------------------------------
revoke all on function pl_normalize_username(text) from public, anon, authenticated;
revoke all on function pl_username_is_valid(text)   from public, anon, authenticated;
revoke all on function pl_username_available(text)  from public, anon, authenticated;
revoke all on function pl_set_username(text)        from public, anon, authenticated;
revoke all on function pl_get_my_profile()          from public, anon, authenticated;

-- Disponibilidade precisa ser consultavel na tela de cadastro, antes do login.
grant execute on function pl_username_available(text) to anon, authenticated;
grant execute on function pl_set_username(text)       to authenticated;
grant execute on function pl_get_my_profile()         to authenticated;

-- ---------------------------------------------------------------------
-- RLS de profiles ja existe (migration 06) e continua valendo:
-- cada pessoa le e edita apenas o proprio perfil.
-- As colunas novas herdam essas policies automaticamente.
-- ---------------------------------------------------------------------
