-- =====================================================================
-- Palavra Livre - Aba de jogadores no painel administrativo
-- Migration 12: listagem de contas e do historico de partidas.
--
-- ADITIVA. Nao cria tabela, nao altera coluna, nao toca em dado nenhum.
--
-- PRIVACIDADE
--   Nenhuma destas funcoes devolve e-mail nem qualquer dado de
--   autenticacao. A identificacao e feita por nome de usuario, como no
--   resto do projeto. O e-mail continua acessivel apenas pelo painel do
--   Supabase, para quem tem acesso ao projeto.
--
-- SEGURANCA
--   As duas aceitam identificador de outra pessoa, o que so e admissivel
--   porque sao administrativas: a primeira coisa que fazem e
--   cd_require_admin(), que confere auth.uid() contra championship_admins.
--   Um usuario autenticado comum recebe FORBIDDEN.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Lista de contas com o resumo de atividade de cada uma.
--
-- Uma unica chamada monta a tabela inteira: sem N+1 por jogador.
-- ---------------------------------------------------------------------
create or replace function cd_admin_list_players()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform cd_require_admin();

  return coalesce((
    select jsonb_agg(item order by sort_last_played desc nulls last, sort_created desc)
    from (
      select
        coalesce(games.last_played, championships.last_played) as sort_last_played,
        profiles.created_at as sort_created,
        jsonb_build_object(
          'userId', profiles.id,
          'username', profiles.username,
          'displayName', profiles.display_name,
          'createdAt', profiles.created_at,
          -- Conta permanente = tem e-mail. O e-mail em si nao sai daqui.
          'isPermanent', coalesce(profiles.is_permanent, false),
          'isAdmin', exists (
            select 1 from championship_admins as admins
            where admins.user_id = profiles.id
          ),
          'dailyGoal', coalesce(profiles.daily_goal, 3),

          'games', coalesce(games.total, 0),
          'completedGames', coalesce(games.completed_total, 0),
          'completionRate', case
            when coalesce(games.total, 0) = 0 then 0
            else round(games.completed_total::numeric * 100 / games.total, 1)
          end,
          'wordsSolved', coalesce(games.words_solved, 0),
          'attempts', coalesce(games.attempts, 0),
          'durationMs', coalesce(games.duration_ms, 0),
          'activeDays', coalesce(games.active_days, 0),
          'lastPlayedDate', games.last_played,

          'championshipsPlayed', coalesce(championships.played, 0),
          'championshipWins', coalesce(championships.wins, 0),
          'championshipPodiums', coalesce(championships.podiums, 0),
          'championshipBestPosition', championships.best_position,
          'championshipBestScore', coalesce(championships.best_score, 0),
          'lastChampionshipDate', championships.last_played
        ) as item
      from profiles

      left join lateral (
        select
          count(*)::integer as total,
          count(*) filter (where completed)::integer as completed_total,
          sum(words_solved)::integer as words_solved,
          sum(attempts_used)::integer as attempts,
          sum(duration_ms)::bigint as duration_ms,
          count(distinct played_date)::integer as active_days,
          max(played_date) as last_played
        from player_games
        where player_games.user_id = profiles.id
      ) as games on true

      left join lateral (
        select
          count(*)::integer as played,
          count(*) filter (where participants.final_position = 1)::integer as wins,
          count(*) filter (where participants.final_position between 1 and 3)::integer as podiums,
          min(participants.final_position)::integer as best_position,
          max(participants.total_score)::integer as best_score,
          max(events.championship_date) as last_played
        from championship_participants as participants
        join championships as events on events.id = participants.championship_id
        where participants.user_id = profiles.id
          and participants.started_at is not null
          and participants.status <> 'CANCELLED'
          and events.status <> 'CANCELLED'
      ) as championships on true
    ) as players
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------
-- Historico de uma pessoa: Jogo Livre e campeonato na mesma linha do
-- tempo, do mais recente para o mais antigo.
--
-- Carregado sob demanda, ao abrir a linha na tabela.
-- ---------------------------------------------------------------------
create or replace function cd_admin_player_games(
  p_user_id uuid,
  p_limit integer default 40,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  safe_limit integer := least(greatest(coalesce(p_limit, 40), 1), 200);
  safe_offset integer := greatest(coalesce(p_offset, 0), 0);
  target_profile profiles%rowtype;
begin
  perform cd_require_admin();

  if p_user_id is null then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into target_profile from profiles where id = p_user_id;

  if not found then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'userId', target_profile.id,
    'username', target_profile.username,
    'displayName', target_profile.display_name,
    'entries', coalesce((
      select jsonb_agg(entry order by entry_date desc, entry_time desc nulls last)
      from (
        -- Partidas do Jogo Livre.
        select
          games.played_date as entry_date,
          games.finished_at as entry_time,
          jsonb_build_object(
            'source', 'FREE_PLAY',
            'date', games.played_date,
            'finishedAt', games.finished_at,
            'mode', games.mode,
            'attemptsUsed', games.attempts_used,
            'maxAttempts', games.max_attempts,
            'wordsSolved', games.words_solved,
            'wordsTotal', games.words_total,
            'completed', games.completed,
            'durationMs', games.duration_ms,
            'position', null,
            'totalScore', null
          ) as entry
        from player_games as games
        where games.user_id = p_user_id

        union all

        -- Participacoes no Campeonato Diario.
        select
          events.championship_date,
          participants.finished_at,
          jsonb_build_object(
            'source', 'CHAMPIONSHIP',
            'date', events.championship_date,
            'finishedAt', participants.finished_at,
            'mode', null,
            'attemptsUsed', participants.total_attempts,
            'maxAttempts', null,
            'wordsSolved', participants.words_solved,
            'wordsTotal', (
              select coalesce(sum(rounds.board_count), 0)
              from championship_rounds as rounds
              where rounds.championship_id = events.id
            ),
            'completed', participants.status = 'FINISHED',
            'durationMs', participants.total_duration_ms,
            'position', participants.final_position,
            'totalScore', participants.total_score,
            'completedRounds', participants.completed_rounds,
            'championshipStatus', events.status
          )
        from championship_participants as participants
        join championships as events on events.id = participants.championship_id
        where participants.user_id = p_user_id
          and participants.started_at is not null
          and participants.status <> 'CANCELLED'
        order by 1 desc, 2 desc nulls last
        limit safe_limit offset safe_offset
      ) as history
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Permissoes: mesmas das demais RPCs administrativas.
-- ---------------------------------------------------------------------
revoke all on function cd_admin_list_players() from public, anon, authenticated;
revoke all on function cd_admin_player_games(uuid, integer, integer)
  from public, anon, authenticated;

grant execute on function cd_admin_list_players() to authenticated;
grant execute on function cd_admin_player_games(uuid, integer, integer) to authenticated;
