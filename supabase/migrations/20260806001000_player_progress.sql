-- =====================================================================
-- Palavra Livre - Progresso e estatisticas do jogador
-- Migration 10: RPCs de calendario, sequencia, resumo mensal e estatisticas.
--
-- ADITIVA. Nenhuma tabela alterada alem de indices de leitura.
--
-- PRINCIPIO
-- Nada e pre-agregado em coluna. Toda metrica e derivada, em tempo de
-- consulta, de player_games (Jogo Livre) e das tabelas do campeonato.
-- Assim e impossivel existir "total_games = 100" divergindo de 97 linhas.
--
-- DESEMPENHO
-- Uma unica chamada devolve calendario, resumo do mes, sequencia e
-- desempenho por modo. A tela mensal faz 1 request, nao N.
--
-- FUSO
-- Todo agrupamento por dia usa a data ja normalizada no fuso do jogo:
-- player_games.played_date e championships.championship_date.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Dias com atividade do jogador, das duas origens.
-- Uma partida de Jogo Livre concluida OU participacao efetiva no
-- campeonato (comecou a jogar, nao apenas se inscreveu).
-- ---------------------------------------------------------------------
create or replace function pl_activity_days(target_user uuid)
returns table (
  activity_date date,
  free_play_games integer,
  championship_played boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with free_play as (
    select played_date as day, count(*)::integer as games
    from player_games
    where user_id = target_user
    group by played_date
  ),
  championship as (
    select distinct championships.championship_date as day
    from championship_participants as participants
    join championships on championships.id = participants.championship_id
    where participants.user_id = target_user
      and participants.started_at is not null
      and participants.status <> 'CANCELLED'
      and championships.status <> 'CANCELLED'
  )
  select
    coalesce(free_play.day, championship.day) as activity_date,
    coalesce(free_play.games, 0) as free_play_games,
    championship.day is not null as championship_played
  from free_play
  full outer join championship on championship.day = free_play.day;
$$;

-- ---------------------------------------------------------------------
-- Sequencia de dias.
--
-- Regra adotada, documentada porque a especificacao era ambigua:
--   - a sequencia continua viva se a ultima atividade foi HOJE ou ONTEM;
--   - passado um dia inteiro sem jogar, ela zera;
--   - "em risco" significa jogou ontem e ainda nao jogou hoje.
-- Isso evita mostrar sequencia 0 a meia-noite e um segundo, mas mantem o
-- comportamento pedido: nao jogou o dia 7 inteiro, sequencia vai a zero.
--
-- A maior sequencia historica nunca diminui.
-- ---------------------------------------------------------------------
create or replace function pl_calculate_streak(target_user uuid)
returns table (
  current_streak integer,
  longest_streak integer,
  last_active_date date,
  streak_at_risk boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select distinct activity_date as day from pl_activity_days(target_user)
  ),
  numbered as (
    -- Dias consecutivos compartilham o mesmo (data - posicao).
    select day, day - (row_number() over (order by day))::integer as run_key
    from days
  ),
  runs as (
    select run_key, count(*)::integer as run_length, max(day) as run_end
    from numbered
    group by run_key
  )
  select
    coalesce((
      select run_length from runs
      where run_end = pl_today() or run_end = pl_today() - 1
      order by run_end desc
      limit 1
    ), 0) as current_streak,
    coalesce((select max(run_length) from runs), 0) as longest_streak,
    (select max(day) from days) as last_active_date,
    coalesce((select max(day) from days) = pl_today() - 1, false) as streak_at_risk;
$$;

-- ---------------------------------------------------------------------
-- Agregado de estatisticas para um intervalo de datas.
-- p_from e p_to nulos significam "todo o periodo".
--
-- Definicao de desempenho por modo:
--   - "completa" = resolveu todas as palavras da modalidade;
--   - no Simples isso equivale a vitoria;
--   - no Dueto, Quarteto e Sexteto e a taxa de conclusao completa,
--     e as palavras resolvidas contam o desempenho parcial.
-- Nao existe uma metrica unica de "vitoria" imposta a todos os modos.
-- ---------------------------------------------------------------------
create or replace function pl_aggregate_stats(
  target_user uuid,
  p_from date default null,
  p_to date default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with games as (
    select * from player_games
    where user_id = target_user
      and (p_from is null or played_date >= p_from)
      and (p_to is null or played_date <= p_to)
  ),
  participations as (
    select
      participants.final_position,
      participants.total_score,
      participants.words_solved,
      participants.total_attempts,
      participants.total_duration_ms,
      participants.completed_rounds
    from championship_participants as participants
    join championships on championships.id = participants.championship_id
    where participants.user_id = target_user
      and participants.started_at is not null
      and participants.status <> 'CANCELLED'
      and championships.status = 'FINISHED'
      and (p_from is null or championships.championship_date >= p_from)
      and (p_to is null or championships.championship_date <= p_to)
  ),
  active as (
    select distinct activity_date from pl_activity_days(target_user)
    where (p_from is null or activity_date >= p_from)
      and (p_to is null or activity_date <= p_to)
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'games', (select count(*) from games),
    'completedGames', (select count(*) filter (where completed) from games),
    'incompleteGames', (select count(*) filter (where not completed) from games),
    'completionRate', (
      select case when count(*) = 0 then 0
        else round(count(*) filter (where completed)::numeric * 100 / count(*), 1)
      end from games
    ),
    'wordsSolved', (select coalesce(sum(words_solved), 0) from games),
    'wordsTotal', (select coalesce(sum(words_total), 0) from games),
    'attempts', (select coalesce(sum(attempts_used), 0) from games),
    'averageAttempts', (
      select case when count(*) = 0 then 0
        else round(avg(attempts_used)::numeric, 1) end
      from games
    ),
    'durationMs', (select coalesce(sum(duration_ms), 0) from games),
    'averageDurationMs', (
      select case when count(*) = 0 then 0
        else round(avg(duration_ms))::bigint end
      from games
    ),
    'activeDays', (select count(*) from active),

    'byMode', (
      select coalesce(jsonb_agg(mode_stats order by mode_order), '[]'::jsonb)
      from (
        select
          blueprint.round_order as mode_order,
          jsonb_build_object(
            'mode', blueprint.mode,
            'games', count(games.id),
            'completed', count(games.id) filter (where games.completed),
            'incomplete', count(games.id) filter (where not games.completed),
            'completionRate', case
              when count(games.id) = 0 then 0
              else round(count(games.id) filter (where games.completed)::numeric * 100 / count(games.id), 1)
            end,
            'averageAttempts', case
              when count(games.id) = 0 then 0
              else round(avg(games.attempts_used)::numeric, 1)
            end,
            -- Melhor resultado: menor numero de tentativas numa partida completa.
            'bestAttempts', min(games.attempts_used) filter (where games.completed),
            'wordsSolved', coalesce(sum(games.words_solved), 0),
            'wordsTotal', coalesce(sum(games.words_total), 0),
            'durationMs', coalesce(sum(games.duration_ms), 0)
          ) as mode_stats
        from cd_round_blueprint() as blueprint
        left join games on games.mode = blueprint.mode
        group by blueprint.round_order, blueprint.mode
      ) as per_mode
    ),

    'championship', jsonb_build_object(
      'played', (select count(*) from participations),
      'wins', (select count(*) filter (where final_position = 1) from participations),
      'podiums', (select count(*) filter (where final_position between 1 and 3) from participations),
      'bestPosition', (select min(final_position) from participations),
      'bestScore', (select coalesce(max(total_score), 0) from participations),
      'averageScore', (
        select case when count(*) = 0 then 0 else round(avg(total_score))::integer end
        from participations
      ),
      'wordsSolved', (select coalesce(sum(words_solved), 0) from participations),
      'attempts', (select coalesce(sum(total_attempts), 0) from participations),
      'durationMs', (select coalesce(sum(total_duration_ms), 0) from participations)
    )
  );
$$;

-- =====================================================================
-- PROGRESSO MENSAL - uma unica chamada monta a tela inteira
-- =====================================================================
create or replace function pl_get_month_progress(p_month date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  today_date date := pl_today();
  month_start date;
  month_end date;
  days_possible integer;
  streak record;
begin
  if current_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  month_start := date_trunc('month', coalesce(p_month, today_date))::date;
  month_end := (month_start + interval '1 month - 1 day')::date;

  -- Dias possiveis: no mes corrente conta so ate hoje.
  days_possible := case
    when month_end > today_date then greatest(today_date - month_start + 1, 0)
    else month_end - month_start + 1
  end;

  select * into streak from pl_calculate_streak(current_user_id);

  return jsonb_build_object(
    'month', month_start,
    'monthEnd', month_end,
    'today', today_date,
    'timezone', coalesce(
      (select default_timezone from championship_config where id),
      'America/Sao_Paulo'
    ),
    'daysInMonth', month_end - month_start + 1,
    'daysPossible', days_possible,
    'isCurrentMonth', month_start = date_trunc('month', today_date)::date,
    'dailyGoal', coalesce((select daily_goal from profiles where id = current_user_id), 3),

    'streak', jsonb_build_object(
      'current', streak.current_streak,
      'longest', streak.longest_streak,
      'lastActiveDate', streak.last_active_date,
      'atRisk', streak.streak_at_risk
    ),

    -- Somente dias COM atividade. O calendario preenche o resto como
    -- "nao jogou", o que mantem o payload pequeno.
    'days', coalesce((
      select jsonb_agg(day_payload order by day)
      from (
        select
          activity.day,
          jsonb_build_object(
            'date', activity.day,
            'games', coalesce(games.total, 0),
            'completedGames', coalesce(games.completed_total, 0),
            'wordsSolved', coalesce(games.words_solved, 0) + coalesce(champ.words_solved, 0),
            'attempts', coalesce(games.attempts, 0) + coalesce(champ.attempts, 0),
            'durationMs', coalesce(games.duration_ms, 0) + coalesce(champ.duration_ms, 0),
            'byMode', jsonb_build_object(
              'SIMPLE', coalesce(games.simple_games, 0),
              'DUET', coalesce(games.duet_games, 0),
              'QUARTET', coalesce(games.quartet_games, 0),
              'SEXTET', coalesce(games.sextet_games, 0)
            ),
            'championship', case
              when champ.day is null then null
              else jsonb_build_object(
                'championshipId', champ.championship_id,
                'position', champ.final_position,
                'totalScore', champ.total_score,
                'wordsSolved', champ.words_solved,
                'completedRounds', champ.completed_rounds,
                'status', champ.participation_status
              )
            end
          ) as day_payload
        from (
          select distinct activity_date as day
          from pl_activity_days(current_user_id)
          where activity_date between month_start and month_end
        ) as activity
        left join (
          select
            played_date as day,
            count(*)::integer as total,
            count(*) filter (where completed)::integer as completed_total,
            sum(words_solved)::integer as words_solved,
            sum(attempts_used)::integer as attempts,
            sum(duration_ms)::bigint as duration_ms,
            count(*) filter (where mode = 'SIMPLE')::integer as simple_games,
            count(*) filter (where mode = 'DUET')::integer as duet_games,
            count(*) filter (where mode = 'QUARTET')::integer as quartet_games,
            count(*) filter (where mode = 'SEXTET')::integer as sextet_games
          from player_games
          where user_id = current_user_id
            and played_date between month_start and month_end
          group by played_date
        ) as games on games.day = activity.day
        left join (
          select
            championships.championship_date as day,
            championships.id as championship_id,
            participants.final_position,
            participants.total_score,
            participants.words_solved,
            participants.total_attempts as attempts,
            participants.total_duration_ms as duration_ms,
            participants.completed_rounds,
            participants.status as participation_status
          from championship_participants as participants
          join championships on championships.id = participants.championship_id
          where participants.user_id = current_user_id
            and participants.started_at is not null
            and participants.status <> 'CANCELLED'
            and championships.status <> 'CANCELLED'
            and championships.championship_date between month_start and month_end
        ) as champ on champ.day = activity.day
      ) as calendar
    ), '[]'::jsonb),

    -- Dias do mes em que houve campeonato oficial, participando ou nao.
    -- Permite o calendario dizer "nao participou do campeonato".
    'championshipDays', coalesce((
      select jsonb_agg(championship_date order by championship_date)
      from championships
      where is_official
        and status <> 'CANCELLED'
        and championship_date between month_start and month_end
    ), '[]'::jsonb),

    'summary', pl_aggregate_stats(current_user_id, month_start, month_end)
  );
end;
$$;

-- =====================================================================
-- ESTATISTICAS POR PERIODO
-- =====================================================================
create or replace function pl_get_player_stats(
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  streak record;
begin
  if current_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select * into streak from pl_calculate_streak(current_user_id);

  return jsonb_build_object(
    'today', pl_today(),
    'stats', pl_aggregate_stats(current_user_id, p_from, p_to),
    'streak', jsonb_build_object(
      'current', streak.current_streak,
      'longest', streak.longest_streak,
      'lastActiveDate', streak.last_active_date,
      'atRisk', streak.streak_at_risk
    ),
    'memberSince', (select created_at from profiles where id = current_user_id)
  );
end;
$$;

-- Comparacao entre dois periodos numa unica chamada.
create or replace function pl_compare_periods(
  p_first_from date,
  p_first_to date,
  p_second_from date,
  p_second_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'first', pl_aggregate_stats(current_user_id, p_first_from, p_first_to),
    'second', pl_aggregate_stats(current_user_id, p_second_from, p_second_to)
  );
end;
$$;

-- =====================================================================
-- HISTORICO PESSOAL DE CAMPEONATOS
-- =====================================================================
-- "Nao participou" nao e armazenado: e derivado da existencia do
-- campeonato somada a ausencia de participacao.
-- ---------------------------------------------------------------------
create or replace function pl_get_my_championship_history(
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  safe_limit integer := least(greatest(coalesce(p_limit, 30), 1), 200);
  safe_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if current_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  return coalesce((
    select jsonb_agg(item order by championship_date desc)
    from (
      select
        championships.championship_date,
        jsonb_build_object(
          'championshipId', championships.id,
          'championshipDate', championships.championship_date,
          'status', championships.status,
          'participantCount', (
            select count(*) from championship_participants as counted
            where counted.championship_id = championships.id
              and counted.status <> 'CANCELLED'
          ),
          'participated', participants.id is not null,
          'position', participants.final_position,
          'totalScore', participants.total_score,
          'wordsSolved', participants.words_solved,
          'wordsTotal', (
            select coalesce(sum(rounds.board_count), 0)
            from championship_rounds as rounds
            where rounds.championship_id = championships.id
          ),
          'attempts', participants.total_attempts,
          'durationMs', participants.total_duration_ms,
          'completedRounds', participants.completed_rounds
        ) as item
      from championships
      left join championship_participants as participants
        on participants.championship_id = championships.id
       and participants.user_id = current_user_id
       and participants.status <> 'CANCELLED'
      where championships.is_official
        and championships.status = 'FINISHED'
      order by championships.championship_date desc
      limit safe_limit offset safe_offset
    ) as history
  ), '[]'::jsonb);
end;
$$;

-- =====================================================================
-- RESUMO DA HOME DO USUARIO LOGADO
-- =====================================================================
create or replace function pl_get_home_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  today_date date := pl_today();
  streak record;
  profile_record profiles%rowtype;
  today_championship_id uuid;
begin
  if current_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select * into profile_record from profiles where id = current_user_id;
  select * into streak from pl_calculate_streak(current_user_id);
  today_championship_id := cd_today_championship_id();

  return jsonb_build_object(
    'serverNow', now(),
    'today', today_date,
    'username', profile_record.username,
    'displayName', profile_record.display_name,
    'dailyGoal', coalesce(profile_record.daily_goal, 3),
    'todayGames', (
      select count(*) from player_games
      where user_id = current_user_id and played_date = today_date
    ),
    'streak', jsonb_build_object(
      'current', streak.current_streak,
      'longest', streak.longest_streak,
      'lastActiveDate', streak.last_active_date,
      'atRisk', streak.streak_at_risk
    ),
    'todayChampionship', case
      when today_championship_id is null then null
      else (
        select jsonb_build_object(
          'id', championships.id,
          'status', championships.status,
          'startsAt', championships.starts_at,
          'registrationClosesAt', championships.registration_closes_at,
          'registered', exists (
            select 1 from championship_participants as participants
            where participants.championship_id = championships.id
              and participants.user_id = current_user_id
              and participants.status <> 'CANCELLED'
          )
        )
        from championships
        where championships.id = today_championship_id
      )
    end
  );
end;
$$;

-- Meta diaria configuravel.
create or replace function pl_set_daily_goal(p_goal integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if p_goal is null or p_goal < 1 or p_goal > 20 then
    raise exception 'INVALID_DAILY_GOAL' using errcode = 'P0001';
  end if;

  update profiles set daily_goal = p_goal where id = current_user_id;

  return jsonb_build_object('dailyGoal', p_goal);
end;
$$;

-- =====================================================================
-- CONQUISTAS - modelagem para a proxima fase
-- =====================================================================
-- Tabelas criadas agora para que o historico ja possa ser avaliado
-- retroativamente quando a tela existir. Sem logica de desbloqueio ainda.
-- ---------------------------------------------------------------------
create table if not exists achievements (
  code text primary key,
  title text not null,
  description text not null,
  category text not null,
  -- Meta numerica do criterio, quando fizer sentido.
  threshold integer,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists player_achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_code text not null references achievements (code) on delete cascade,
  unlocked_at timestamptz not null default now(),
  progress integer not null default 0,
  primary key (user_id, achievement_code)
);

insert into achievements (code, title, description, category, threshold, sort_order) values
  ('FIRST_WORD', 'Primeira Palavra', 'Complete sua primeira partida.', 'INICIO', 1, 10),
  ('WEEK_STREAK', 'Semana Completa', 'Jogue 7 dias consecutivos.', 'SEQUENCIA', 7, 20),
  ('THIRTY_DAYS', '30 Dias', 'Jogue em 30 dias diferentes.', 'SEQUENCIA', 30, 30),
  ('SIMPLE_50', 'Especialista Simples', 'Complete 50 partidas do modo Simples.', 'MODO', 50, 40),
  ('DUET_30', 'Dueto Afinado', 'Complete 30 partidas do modo Dueto.', 'MODO', 30, 50),
  ('QUARTET_20', 'Quarteto Completo', 'Complete 20 partidas do modo Quarteto.', 'MODO', 20, 60),
  ('SEXTET_10', 'Sexteto Dominado', 'Complete 10 partidas do modo Sexteto.', 'MODO', 10, 70),
  ('CHAMPION', 'Campeao', 'Venca um Campeonato Diario.', 'CAMPEONATO', 1, 80),
  ('PODIUM', 'Podio', 'Fique entre os tres primeiros de um Campeonato Diario.', 'CAMPEONATO', 1, 90)
on conflict (code) do nothing;

alter table achievements enable row level security;
alter table player_achievements enable row level security;

drop policy if exists achievements_public_read on achievements;
create policy achievements_public_read on achievements
  for select using (is_active);

drop policy if exists player_achievements_select_own on player_achievements;
create policy player_achievements_select_own on player_achievements
  for select using (user_id = auth.uid());

grant select on table achievements to anon, authenticated;
grant select on table player_achievements to authenticated;
revoke insert, update, delete on table achievements from anon, authenticated;
revoke insert, update, delete on table player_achievements from anon, authenticated;

-- =====================================================================
-- PERMISSOES
-- =====================================================================
revoke all on function pl_activity_days(uuid)                     from public, anon, authenticated;
revoke all on function pl_calculate_streak(uuid)                  from public, anon, authenticated;
revoke all on function pl_aggregate_stats(uuid, date, date)       from public, anon, authenticated;
revoke all on function pl_get_month_progress(date)                from public, anon, authenticated;
revoke all on function pl_get_player_stats(date, date)            from public, anon, authenticated;
revoke all on function pl_compare_periods(date, date, date, date) from public, anon, authenticated;
revoke all on function pl_get_my_championship_history(integer, integer) from public, anon, authenticated;
revoke all on function pl_get_home_summary()                      from public, anon, authenticated;
revoke all on function pl_set_daily_goal(integer)                 from public, anon, authenticated;

-- Funcoes internas recebem o user como parametro e ficam SEM grant:
-- so podem ser chamadas de dentro do banco. As publicas usam auth.uid()
-- e nunca aceitam de quem e o progresso.
grant execute on function pl_get_month_progress(date)                to authenticated;
grant execute on function pl_get_player_stats(date, date)            to authenticated;
grant execute on function pl_compare_periods(date, date, date, date) to authenticated;
grant execute on function pl_get_my_championship_history(integer, integer) to authenticated;
grant execute on function pl_get_home_summary()                      to authenticated;
grant execute on function pl_set_daily_goal(integer)                 to authenticated;
