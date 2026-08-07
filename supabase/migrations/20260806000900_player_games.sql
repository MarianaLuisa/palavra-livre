-- =====================================================================
-- Palavra Livre - Historico de partidas do Jogo Livre
-- Migration 09: tabela player_games e registro idempotente.
--
-- ADITIVA. Nao toca em nada do campeonato.
--
-- FONTE DA VERDADE
-- player_games guarda SOMENTE partidas do Jogo Livre.
-- As partidas do Campeonato Diario continuam vivendo em
-- championship_participants / participant_rounds. As estatisticas de
-- progresso fazem UNION das duas origens em vez de duplicar dados, o que
-- torna impossivel as duas versoes divergirem.
--
-- O QUE NAO E GUARDADO
-- Nenhuma resposta secreta. O historico registra desempenho, nao palavras.
-- =====================================================================

-- Reaproveita o enum de modalidades ja existente (SIMPLE/DUET/QUARTET/SEXTET).
-- Criar um segundo enum identico so criaria duas listas para manter.

create table if not exists player_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Identificador gerado no cliente quando a partida COMECA e mantido no
  -- localStorage. E o que torna o registro idempotente: refresh, dois
  -- cliques ou duas abas mandam o mesmo id e gravam uma linha so.
  client_game_id text not null check (char_length(client_game_id) between 8 and 64),

  mode championship_mode not null,

  -- Data no fuso do jogo, calculada no servidor. O navegador nunca decide.
  played_date date not null,

  started_at timestamptz,
  finished_at timestamptz not null default now(),
  duration_ms bigint not null default 0 check (duration_ms >= 0),

  attempts_used integer not null check (attempts_used > 0),
  max_attempts integer not null check (max_attempts > 0),
  words_total integer not null check (words_total > 0),
  words_solved integer not null check (words_solved >= 0),

  -- Resolveu todas as palavras da modalidade.
  completed boolean not null,

  created_at timestamptz not null default now(),

  constraint player_games_attempts_within_limit check (attempts_used <= max_attempts),
  constraint player_games_words_within_total check (words_solved <= words_total),
  constraint player_games_completed_matches check (completed = (words_solved = words_total)),
  -- So entra partida realmente terminada: resolveu tudo ou esgotou tentativas.
  constraint player_games_is_finished check (
    words_solved = words_total or attempts_used = max_attempts
  ),

  -- Idempotencia no banco, nao no frontend.
  constraint player_games_client_id_unique unique (user_id, client_game_id)
);

create index if not exists player_games_user_date_idx
  on player_games (user_id, played_date desc);

create index if not exists player_games_user_mode_idx
  on player_games (user_id, mode);

-- ---------------------------------------------------------------------
-- Meta diaria configuravel por jogador (usada na home e no progresso).
-- ---------------------------------------------------------------------
alter table profiles
  add column if not exists daily_goal integer not null default 3;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_daily_goal_range') then
    alter table profiles
      add constraint profiles_daily_goal_range check (daily_goal between 1 and 20)
      not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Data de hoje no fuso oficial do jogo.
-- ---------------------------------------------------------------------
create or replace function pl_today()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone coalesce(
    (select default_timezone from championship_config where id),
    'America/Sao_Paulo'
  ))::date;
$$;

-- ---------------------------------------------------------------------
-- Configuracao oficial de uma modalidade.
-- Reaproveita cd_round_blueprint: uma unica definicao de quantas palavras
-- e quantas tentativas cada modo tem, valida para campeonato e jogo livre.
-- ---------------------------------------------------------------------
create or replace function pl_mode_setup(p_mode championship_mode)
returns table (board_count smallint, max_attempts smallint)
language sql
stable
as $$
  select blueprint.board_count, blueprint.max_attempts
  from cd_round_blueprint() as blueprint
  where blueprint.mode = p_mode;
$$;

-- =====================================================================
-- REGISTRO DE PARTIDA
-- =====================================================================
-- O cliente informa apenas o que aconteceu na partida dele:
-- identificador, modo, tentativas usadas, palavras resolvidas e duracao.
--
-- O cliente NAO informa e nao consegue influenciar:
--   - a data (vem de pl_today());
--   - o total de palavras e o limite de tentativas (vem do blueprint);
--   - se venceu (derivado de words_solved = words_total);
--   - qualquer estatistica agregada.
--
-- Abrir DevTools nao concede vitorias: os limites do modo sao do servidor.
-- ---------------------------------------------------------------------
create or replace function pl_record_game(
  p_client_game_id text,
  p_mode championship_mode,
  p_attempts_used integer,
  p_words_solved integer,
  p_duration_ms bigint default 0,
  p_started_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  setup record;
  clean_id text := btrim(coalesce(p_client_game_id, ''));
  safe_duration bigint := greatest(coalesce(p_duration_ms, 0), 0);
  is_completed boolean;
  existing player_games%rowtype;
  inserted player_games%rowtype;
begin
  if current_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if char_length(clean_id) < 8 or char_length(clean_id) > 64 then
    raise exception 'INVALID_GAME_ID' using errcode = 'P0001';
  end if;

  select * into setup from pl_mode_setup(p_mode);

  if not found then
    raise exception 'INVALID_GAME_MODE' using errcode = 'P0001';
  end if;

  if p_attempts_used is null
    or p_attempts_used < 1
    or p_attempts_used > setup.max_attempts then
    raise exception 'INVALID_ATTEMPTS' using errcode = 'P0001';
  end if;

  if p_words_solved is null
    or p_words_solved < 0
    or p_words_solved > setup.board_count then
    raise exception 'INVALID_WORDS_SOLVED' using errcode = 'P0001';
  end if;

  is_completed := p_words_solved = setup.board_count;

  -- Partida inacabada nao entra no historico e nao conta como dia jogado.
  if not is_completed and p_attempts_used < setup.max_attempts then
    raise exception 'GAME_NOT_FINISHED' using errcode = 'P0001';
  end if;

  -- Idempotencia: mesma partida enviada de novo nao duplica nada.
  select * into existing
  from player_games
  where user_id = current_user_id and client_game_id = clean_id;

  if found then
    return jsonb_build_object(
      'gameId', existing.id,
      'playedDate', existing.played_date,
      'recorded', false,
      'alreadyRecorded', true
    );
  end if;

  begin
    insert into player_games (
      user_id, client_game_id, mode, played_date,
      started_at, finished_at, duration_ms,
      attempts_used, max_attempts, words_total, words_solved, completed
    ) values (
      current_user_id, clean_id, p_mode, pl_today(),
      p_started_at, now(), safe_duration,
      p_attempts_used, setup.max_attempts, setup.board_count, p_words_solved, is_completed
    )
    returning * into inserted;
  exception
    when unique_violation then
      -- Duas abas enviaram ao mesmo tempo: a segunda vira no-op.
      select * into existing
      from player_games
      where user_id = current_user_id and client_game_id = clean_id;

      return jsonb_build_object(
        'gameId', existing.id,
        'playedDate', existing.played_date,
        'recorded', false,
        'alreadyRecorded', true
      );
  end;

  return jsonb_build_object(
    'gameId', inserted.id,
    'playedDate', inserted.played_date,
    'recorded', true,
    'alreadyRecorded', false,
    'completed', inserted.completed,
    'wordsSolved', inserted.words_solved,
    'wordsTotal', inserted.words_total
  );
end;
$$;

-- =====================================================================
-- SEGURANCA
-- =====================================================================

alter table player_games enable row level security;

-- Cada pessoa le apenas o proprio historico. Trocar o UUID na URL nao
-- ajuda: a policy filtra por auth.uid(), nao por parametro.
drop policy if exists player_games_select_own on player_games;
create policy player_games_select_own on player_games
  for select using (user_id = auth.uid());

-- Nenhuma policy de insert, update ou delete: escrita so por RPC validada.
-- Sem elas, um cliente autenticado nao consegue inventar partida nem
-- alterar tentativas, palavras resolvidas ou datas.

grant select on table player_games to authenticated;
revoke insert, update, delete on table player_games from anon, authenticated;
revoke all on table player_games from anon;

revoke all on function pl_today()                          from public, anon, authenticated;
revoke all on function pl_mode_setup(championship_mode)     from public, anon, authenticated;
revoke all on function pl_record_game(text, championship_mode, integer, integer, bigint, timestamptz)
  from public, anon, authenticated;

grant execute on function pl_record_game(text, championship_mode, integer, integer, bigint, timestamptz)
  to authenticated;
