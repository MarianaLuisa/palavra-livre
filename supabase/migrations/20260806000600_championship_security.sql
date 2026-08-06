-- =====================================================================
-- Palavra Livre - Campeonato Diario
-- Migration 06: Row Level Security e permissoes de execucao.
--
-- Principio: o cliente nao escreve em nenhuma tabela diretamente.
-- Toda escrita passa por funcoes SECURITY DEFINER validadas.
-- A tabela de respostas nao possui NENHUMA policy: e invisivel ao cliente.
-- =====================================================================

alter table profiles                  enable row level security;
alter table championships             enable row level security;
alter table championship_rounds       enable row level security;
alter table championship_answers      enable row level security;
alter table championship_participants enable row level security;
alter table participant_rounds        enable row level security;
alter table participant_attempts      enable row level security;
alter table championship_admins       enable row level security;
alter table championship_config       enable row level security;
alter table championship_word_pool    enable row level security;
alter table championship_valid_words  enable row level security;

-- Atencao: NAO use "force row level security" nestas tabelas.
-- As funcoes SECURITY DEFINER rodam como dono; com FORCE elas passariam a
-- respeitar as policies e, como estas tabelas nao tem policy nenhuma,
-- o proprio servidor deixaria de enxergar respostas e base de palavras.
-- A protecao vem de RLS habilitada + ausencia de policy + REVOKE abaixo.

-- ---------------------------------------------------------------------
-- profiles: cada um enxerga e edita apenas o proprio perfil.
-- ---------------------------------------------------------------------
drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles
  for select using (id = auth.uid());

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_insert_own on profiles;
create policy profiles_insert_own on profiles
  for insert with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- championships e rounds: informacao publica do evento.
-- Nao contem nenhuma resposta.
-- ---------------------------------------------------------------------
drop policy if exists championships_public_read on championships;
create policy championships_public_read on championships
  for select using (true);

drop policy if exists championship_rounds_public_read on championship_rounds;
create policy championship_rounds_public_read on championship_rounds
  for select using (true);

-- ---------------------------------------------------------------------
-- championship_answers: sem policy = ninguem le pelo PostgREST.
-- Apenas funcoes SECURITY DEFINER acessam.
-- ---------------------------------------------------------------------
-- (intencionalmente vazio)

-- ---------------------------------------------------------------------
-- Participacoes: cada um enxerga a propria.
-- A classificacao publica sai por RPC, que controla o que revelar.
-- ---------------------------------------------------------------------
drop policy if exists participants_select_own on championship_participants;
create policy participants_select_own on championship_participants
  for select using (user_id = auth.uid());

drop policy if exists participant_rounds_select_own on participant_rounds;
create policy participant_rounds_select_own on participant_rounds
  for select using (
    exists (
      select 1 from championship_participants as participants
      where participants.id = participant_rounds.championship_participant_id
        and participants.user_id = auth.uid()
    )
  );

drop policy if exists participant_attempts_select_own on participant_attempts;
create policy participant_attempts_select_own on participant_attempts
  for select using (
    exists (
      select 1
      from participant_rounds as rounds
      join championship_participants as participants
        on participants.id = rounds.championship_participant_id
      where rounds.id = participant_attempts.participant_round_id
        and participants.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- Tabelas administrativas e base de palavras: sem leitura pelo cliente.
-- ---------------------------------------------------------------------
-- championship_admins, championship_config, championship_word_pool,
-- championship_valid_words: sem policies.

-- ---------------------------------------------------------------------
-- Permissoes de execucao das funcoes.
-- ---------------------------------------------------------------------
revoke all on all functions in schema public from public, anon, authenticated;

-- Funcoes internas continuam sem grant: so o proprio banco as chama.
grant execute on function cd_get_state(uuid)                  to authenticated;
grant execute on function cd_upsert_profile(text)             to authenticated;
grant execute on function cd_register(text, uuid)             to authenticated;
grant execute on function cd_cancel_registration(uuid)        to authenticated;
grant execute on function cd_abandon_championship(uuid)       to authenticated;
grant execute on function cd_start_round(uuid)                to authenticated;
grant execute on function cd_submit_attempt(uuid, text)       to authenticated;
grant execute on function cd_leaderboard(uuid)                to authenticated, anon;
grant execute on function cd_championship_results(uuid)       to authenticated, anon;
grant execute on function cd_championship_history(integer, integer) to authenticated, anon;
grant execute on function cd_my_stats()                       to authenticated;
grant execute on function cd_current_championship_id()        to authenticated, anon;

grant execute on function cd_admin_create_championship(date, timestamptz, timestamptz, timestamptz, text) to authenticated;
grant execute on function cd_admin_update_schedule(uuid, timestamptz, timestamptz, timestamptz) to authenticated;
grant execute on function cd_admin_set_status(uuid, championship_status) to authenticated;
grant execute on function cd_admin_redraw_words(uuid)         to authenticated;
grant execute on function cd_admin_recalculate(uuid)          to authenticated;
grant execute on function cd_admin_overview(uuid)             to authenticated;
grant execute on function cd_admin_update_config(integer, integer, integer, integer, boolean) to authenticated;

-- Leitura publica basica do evento (as RPCs cobrem o resto).
grant select on table championships to anon, authenticated;
grant select on table championship_rounds to anon, authenticated;
grant select on table profiles to authenticated;
grant select on table championship_participants to authenticated;
grant select on table participant_rounds to authenticated;
grant select on table participant_attempts to authenticated;

-- Nunca exponha as respostas nem a base de sorteio.
revoke all on table championship_answers from anon, authenticated;
revoke all on table championship_word_pool from anon, authenticated;
revoke all on table championship_valid_words from anon, authenticated;
revoke all on table championship_admins from anon, authenticated;
revoke all on table championship_config from anon, authenticated;

-- ---------------------------------------------------------------------
-- Criacao automatica de profile quando um usuario e criado.
-- ---------------------------------------------------------------------
create or replace function cd_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      'Jogador ' || substr(new.id::text, 1, 6)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists cd_on_auth_user_created on auth.users;
create trigger cd_on_auth_user_created
  after insert on auth.users
  for each row execute function cd_handle_new_user();
