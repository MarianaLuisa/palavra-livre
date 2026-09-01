-- =====================================================================
-- Palavra Livre - Unificacao do Campeonato Norte Semanal
-- Migration 20260901000100: Relacionamento de rodadas diarias com semanas,
-- auto-garantia idempotente, ranking semanal em tempo real e privacidade estrita.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Relacionamento relacional seguro (aditivo, sem drops)
-- ---------------------------------------------------------------------
alter table championships
  add column if not exists weekly_championship_id uuid
    references weekly_championships (id) on delete set null;

alter table championships
  add column if not exists weekly_round_id uuid
    references weekly_championship_rounds (id) on delete set null;

create index if not exists championships_weekly_champ_idx
  on championships (weekly_championship_id);

create index if not exists championships_weekly_round_idx
  on championships (weekly_round_id);

-- ---------------------------------------------------------------------
-- 2. Backfill seguro: associar campeonatos passados a semanas
-- ---------------------------------------------------------------------
do $$
declare
  champ record;
  w_start date;
  w_end date;
  w_id uuid;
  w_round_id uuid;
  w_weekday integer;
  w_label text;
begin
  for champ in
    select id, championship_date, name
    from championships
    where is_official and status <> 'CANCELLED'
  loop
    w_weekday := extract(isodow from champ.championship_date)::int;

    if w_weekday between 1 and 5 then
      w_start := brazil_week_start(champ.championship_date);
      w_end := brazil_week_end(champ.championship_date);

      -- Garante o Campeonato Norte semanal
      insert into weekly_championships (
        name, week_start, week_end, status, timezone
      ) values (
        'Campeonato Norte', w_start, w_end, 'FINISHED', 'America/Sao_Paulo'
      )
      on conflict (name, week_start) do update
        set status = case
          when weekly_championships.week_end < brazil_current_date() then 'FINISHED'::championship_status
          else weekly_championships.status
        end
      returning id into w_id;

      if w_id is null then
        select id into w_id
        from weekly_championships
        where name = 'Campeonato Norte' and week_start = w_start;
      end if;

      w_label := case w_weekday
        when 1 then 'SEGUNDA'
        when 2 then 'TERCA'
        when 3 then 'QUARTA'
        when 4 then 'QUINTA'
        when 5 then 'SEXTA'
      end;

      -- Garante a rodada semanal correspondente
      insert into weekly_championship_rounds (
        weekly_championship_id, weekday, day_label, round_date, status
      ) values (
        w_id, w_weekday, w_label, champ.championship_date, 'CLOSED'
      )
      on conflict (weekly_championship_id, weekday) do nothing
      returning id into w_round_id;

      if w_round_id is null then
        select id into w_round_id
        from weekly_championship_rounds
        where weekly_championship_id = w_id and weekday = w_weekday;
      end if;

      -- Associa o campeonato diario a semana
      update championships
      set weekly_championship_id = w_id,
          weekly_round_id = w_round_id,
          name = 'Campeonato Norte'
      where id = champ.id
        and (weekly_championship_id is null or weekly_round_id is null or name <> 'Campeonato Norte');
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Garantia automatica e idempotente da rodada do Campeonato Norte
-- ---------------------------------------------------------------------
create or replace function public.ensure_current_norte_round(p_reference_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ref_date date := coalesce(p_reference_date, brazil_current_date());
  weekday_number integer := extract(isodow from ref_date)::int;
  target_week_start date := brazil_week_start(ref_date);
  target_week_end date := brazil_week_end(ref_date);
  championship_json jsonb;
  weekly_champ_id uuid;
  round_label text;
  round_id uuid;
  daily_champ_id uuid;
  daily_status championship_status;
  blueprint record;
  drawn integer := 0;
  created boolean := false;
  config championship_config%rowtype;
  starts_at timestamptz;
  opens_at timestamptz;
  closes_at timestamptz;
begin
  if weekday_number not between 1 and 5 then
    return jsonb_build_object(
      'created', false,
      'weekend', true,
      'championship', null,
      'round', null,
      'dailyChampionshipId', null,
      'weekStart', target_week_start,
      'weekEnd', target_week_end,
      'reason', 'weekend_noop'
    );
  end if;

  select * into config from championship_config where id;

  -- 1. Garante a entidade semanal
  championship_json := ensure_current_norte_championship(ref_date);
  weekly_champ_id := (championship_json->'championship'->>'id')::uuid;

  round_label := case weekday_number
    when 1 then 'SEGUNDA'
    when 2 then 'TERCA'
    when 3 then 'QUARTA'
    when 4 then 'QUINTA'
    when 5 then 'SEXTA'
  end;

  -- 2. Garante a rodada em weekly_championship_rounds
  insert into weekly_championship_rounds (
    weekly_championship_id,
    weekday,
    day_label,
    round_date,
    status
  ) values (
    weekly_champ_id,
    weekday_number,
    round_label,
    ref_date,
    'PENDING'
  )
  on conflict (weekly_championship_id, weekday) do nothing
  returning id into round_id;

  if round_id is null then
    select id into round_id
    from weekly_championship_rounds
    where weekly_championship_id = weekly_champ_id and weekday = weekday_number;
  end if;

  -- 3. Garante a rodada jogavel em championships
  starts_at := cd_day_start(ref_date, coalesce(config.default_timezone, 'America/Sao_Paulo'));
  opens_at := starts_at - interval '1 second';
  closes_at := cd_day_end(ref_date, coalesce(config.default_timezone, 'America/Sao_Paulo'));

  daily_status := case
    when ref_date = brazil_current_date() then 'IN_PROGRESS'::championship_status
    when ref_date < brazil_current_date() then 'FINISHED'::championship_status
    else 'SCHEDULED'::championship_status
  end;

  select id into daily_champ_id
  from championships
  where championship_date = ref_date
    and is_official
    and status <> 'CANCELLED';

  if daily_champ_id is null then
    begin
      insert into championships (
        name,
        championship_date,
        timezone,
        registration_opens_at,
        registration_closes_at,
        starts_at,
        status,
        is_official,
        weekly_championship_id,
        weekly_round_id
      ) values (
        'Campeonato Norte',
        ref_date,
        coalesce(config.default_timezone, 'America/Sao_Paulo'),
        opens_at,
        closes_at,
        starts_at,
        daily_status,
        true,
        weekly_champ_id,
        round_id
      )
      returning id into daily_champ_id;
      created := true;
    exception
      when unique_violation then
        select id into daily_champ_id
        from championships
        where championship_date = ref_date
          and is_official
          and status <> 'CANCELLED';
    end;

    if created and daily_champ_id is not null then
      for blueprint in select * from cd_round_blueprint() loop
        insert into championship_rounds (
          championship_id, mode, round_order, board_count, max_attempts, status, starts_at
        ) values (
          daily_champ_id, blueprint.mode, blueprint.round_order,
          blueprint.board_count, blueprint.max_attempts,
          case when daily_status = 'IN_PROGRESS' then 'ACTIVE'::championship_round_status else 'PENDING'::championship_round_status end,
          case when daily_status = 'IN_PROGRESS' then now() else null end
        )
        on conflict (championship_id, round_order) do nothing;
      end loop;

      drawn := cd_draw_championship_words(daily_champ_id);
    end if;
  else
    -- Garante vinculo com o Campeonato Norte semanal
    update championships
    set weekly_championship_id = weekly_champ_id,
        weekly_round_id = round_id,
        name = 'Campeonato Norte'
    where id = daily_champ_id
      and (weekly_championship_id is null or weekly_round_id is null or name <> 'Campeonato Norte');
  end if;

  return jsonb_build_object(
    'created', created,
    'weekend', false,
    'weekStart', target_week_start,
    'weekEnd', target_week_end,
    'championship', championship_json->'championship',
    'round', jsonb_build_object(
      'id', round_id,
      'weeklyChampionshipId', weekly_champ_id,
      'weekday', weekday_number,
      'dayLabel', round_label,
      'roundDate', ref_date,
      'dailyChampionshipId', daily_champ_id,
      'wordsDrawn', drawn
    ),
    'dailyChampionshipId', daily_champ_id
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Campeonato oficial atual conectado a auto-garantia
-- ---------------------------------------------------------------------
create or replace function cd_current_championship_id()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  config championship_config%rowtype;
  today_date date;
  target uuid;
  today_weekday integer;
  auto_res jsonb;
begin
  select * into config from championship_config where id;
  today_date := brazil_current_date();
  today_weekday := extract(isodow from today_date)::int;

  -- Se for dia util (segunda a sexta), garante a rodada automaticamente
  if today_weekday between 1 and 5 then
    auto_res := ensure_current_norte_round(today_date);
    target := (auto_res->>'dailyChampionshipId')::uuid;
    if target is not null then
      return target;
    end if;
  end if;

  -- Fallback para fim de semana ou campeonato mais relevante
  select id into target
  from championships
  where is_official and status <> 'CANCELLED'
  order by
    case
      when championship_date = today_date then 0
      when championship_date > today_date then 1
      else 2
    end,
    case when championship_date >= today_date then championship_date end asc,
    championship_date desc,
    starts_at desc
  limit 1;

  return target;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Classificacao semanal em tempo real (fonte da verdade principal)
-- ---------------------------------------------------------------------
create or replace function cd_weekly_leaderboard(p_week_start date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  week_start date;
  week_end date;
  days_count integer;
  entries jsonb;
  is_week_finished boolean;
begin
  -- Sempre normaliza para a Segunda-feira da semana (independente se p_week_start for terca, quarta, etc.)
  week_start := brazil_week_start(coalesce(p_week_start, brazil_current_date()));
  week_end := brazil_week_end(week_start);

  select count(distinct championship_date) into days_count
  from championships
  where (is_official or weekly_championship_id is not null or name = 'Campeonato Norte')
    and status <> 'CANCELLED'
    and championship_date between week_start and week_end;

  is_week_finished := brazil_current_date() > week_end;

  select coalesce(jsonb_agg(entry order by entry_position), '[]'::jsonb) into entries
  from (
    select
      row_number() over (
        order by total_score desc, words_solved desc, completed_rounds desc,
                 total_attempts asc, total_duration_ms asc, user_id asc
      ) as entry_position,
      jsonb_build_object(
        'participantId', user_id::text,
        'userId', user_id,
        'position', row_number() over (
          order by total_score desc, words_solved desc, completed_rounds desc,
                   total_attempts asc, total_duration_ms asc, user_id asc
        ),
        'displayName', display_name,
        'totalScore', total_score,
        'wordsSolved', words_solved,
        'completedRounds', completed_rounds,
        'totalAttempts', total_attempts,
        'totalDurationMs', total_duration_ms,
        'status', case when is_week_finished then 'FINISHED' else 'IN_PROGRESS' end,
        'days', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'weekday', extract(isodow from d.day_date)::int,
              'date', to_char(d.day_date, 'YYYY-MM-DD'),
              'label', case extract(isodow from d.day_date)::int
                when 1 then 'Seg (' || to_char(d.day_date, 'DD/MM') || ')'
                when 2 then 'Ter (' || to_char(d.day_date, 'DD/MM') || ')'
                when 3 then 'Qua (' || to_char(d.day_date, 'DD/MM') || ')'
                when 4 then 'Qui (' || to_char(d.day_date, 'DD/MM') || ')'
                when 5 then 'Sex (' || to_char(d.day_date, 'DD/MM') || ')'
              end,
              'played', (cp.id is not null and (
                cp.status = 'FINISHED'
                or cp.completed_rounds > 0
                or coalesce(cp.total_score, 0) > 0
                or cp.started_at is not null
              )),
              'wordsSolved', case
                when cp.id is not null and (
                  cp.status = 'FINISHED'
                  or cp.completed_rounds > 0
                  or coalesce(cp.total_score, 0) > 0
                  or cp.started_at is not null
                ) then coalesce(cp.words_solved, 0)
                else 0
              end,
              'wordsTotal', 13,
              'score', case
                when cp.id is not null and (
                  cp.status = 'FINISHED'
                  or cp.completed_rounds > 0
                  or coalesce(cp.total_score, 0) > 0
                  or cp.started_at is not null
                ) then coalesce(cp.total_score, 0)
                else 0
              end
            ) order by d.day_date
          ), '[]'::jsonb)
          from generate_series(week_start::timestamp, week_end::timestamp, '1 day'::interval) as d(day_date)
          left join championships c on c.championship_date = d.day_date::date 
            and (c.is_official or c.weekly_championship_id is not null or c.name = 'Campeonato Norte') 
            and c.status <> 'CANCELLED'
          left join championship_participants cp on cp.championship_id = c.id 
            and cp.user_id = weekly_totals.user_id 
            and cp.status <> 'CANCELLED'
          where extract(isodow from d.day_date)::int between 1 and 5
        )
      ) as entry
    from (
      select
        participants.user_id,
        (array_agg(coalesce(nullif(btrim(participants.display_name_snapshot), ''), 'Jogador') order by championships.championship_date desc))[1] as display_name,
        coalesce(sum(participants.total_score), 0)::integer as total_score,
        coalesce(sum(participants.words_solved), 0)::integer as words_solved,
        coalesce(sum(participants.completed_rounds), 0)::integer as completed_rounds,
        coalesce(sum(participants.total_attempts), 0)::integer as total_attempts,
        coalesce(sum(participants.total_duration_ms), 0)::bigint as total_duration_ms
      from championship_participants as participants
      join championships on championships.id = participants.championship_id
      where (championships.is_official or championships.weekly_championship_id is not null or championships.name = 'Campeonato Norte')
        and championships.status <> 'CANCELLED'
        and championships.championship_date between week_start and week_end
        and participants.status <> 'CANCELLED'
        -- Inclui se o jogador participou (finalizou, fez pontos, jogou rodadas ou iniciou)
        and (
          participants.status = 'FINISHED'
          or participants.completed_rounds > 0
          or coalesce(participants.total_score, 0) > 0
          or participants.started_at is not null
        )
      group by participants.user_id
    ) as weekly_totals
  ) as ranked;

  return jsonb_build_object(
    'championshipId', null,
    'championshipName', 'Campeonato Norte',
    'period', 'weekly',
    'periodLabel', to_char(week_start, 'DD/MM/YYYY') || ' – ' || to_char(week_end, 'DD/MM/YYYY'),
    'weekStart', week_start,
    'weekEnd', week_end,
    'totalWords', 65, -- 5 dias x 13 palavras
    'totalRounds', 20, -- 5 dias x 4 modalidades
    'status', case when is_week_finished then 'FINISHED' else 'IN_PROGRESS' end,
    'isFinal', is_week_finished,
    'entries', entries
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Historico pessoal com isolamento estrito de privacidade
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
          'championshipName', championships.name,
          'championshipDate', championships.championship_date,
          'weekday', extract(isodow from championships.championship_date)::int,
          'weekStart', brazil_week_start(championships.championship_date),
          'weekEnd', brazil_week_end(championships.championship_date),
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
        and championships.status in ('FINISHED', 'IN_PROGRESS')
      order by championships.championship_date desc
      limit safe_limit offset safe_offset
    ) as history
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Resultados do campeonato: sem vazar dados individuais de terceiros
-- ---------------------------------------------------------------------
create or replace function cd_championship_results(p_championship_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(p_championship_id, cd_current_championship_id());
  championship championships%rowtype;
  rounds_payload jsonb;
  breakdown jsonb;
  current_user_id uuid := auth.uid();
begin
  if target is null then
    raise exception 'CHAMPIONSHIP_NOT_FOUND' using errcode = 'P0001';
  end if;

  championship := cd_refresh_championship_status(target);

  if championship.status <> 'FINISHED' then
    raise exception 'CHAMPIONSHIP_NOT_FINISHED' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(round_payload order by round_order), '[]'::jsonb)
    into rounds_payload
  from (
    select
      rounds.round_order,
      jsonb_build_object(
        'roundId', rounds.id,
        'mode', rounds.mode,
        'roundOrder', rounds.round_order,
        'boardCount', rounds.board_count,
        'maxAttempts', rounds.max_attempts,
        'answers', (
          select coalesce(jsonb_agg(answers.answer order by answers.board_index), '[]'::jsonb)
          from championship_answers as answers
          where answers.championship_round_id = rounds.id
        )
      ) as round_payload
    from championship_rounds as rounds
    where rounds.championship_id = target
  ) as data;

  select coalesce(jsonb_agg(participant_payload order by entry_position), '[]'::jsonb)
    into breakdown
  from (
    select
      participants.final_position as entry_position,
      jsonb_build_object(
        'participantId', participants.id,
        'userId', participants.user_id,
        'position', participants.final_position,
        'displayName', participants.display_name_snapshot,
        'totalScore', participants.total_score,
        'wordsSolved', participants.words_solved,
        'completedRounds', participants.completed_rounds,
        'totalAttempts', participants.total_attempts,
        'totalDurationMs', participants.total_duration_ms,
        'status', participants.status,
        -- Detalhes das rodadas internas aparecem APENAS para o proprio usuario logado
        'rounds', case
          when current_user_id is not null and participants.user_id = current_user_id then (
            select coalesce(jsonb_agg(jsonb_build_object(
              'mode', rounds.mode,
              'roundOrder', rounds.round_order,
              'status', participation.status,
              'attemptsUsed', participation.attempts_used,
              'attemptsLeft', greatest(rounds.max_attempts - participation.attempts_used, 0),
              'wordsSolved', participation.words_solved,
              'totalWords', rounds.board_count,
              'allWordsSolved', participation.all_words_solved,
              'baseScore', participation.base_score,
              'bonusScore', participation.bonus_score,
              'totalScore', participation.total_score,
              'durationMs', participation.duration_ms
            ) order by rounds.round_order), '[]'::jsonb)
            from participant_rounds as participation
            join championship_rounds as rounds on rounds.id = participation.championship_round_id
            where participation.championship_participant_id = participants.id
          )
          else '[]'::jsonb
        end
      ) as participant_payload
    from championship_participants as participants
    where participants.championship_id = target and participants.status <> 'CANCELLED'
  ) as data;

  return jsonb_build_object(
    'championship', jsonb_build_object(
      'id', championship.id,
      'name', championship.name,
      'championshipDate', championship.championship_date,
      'status', championship.status,
      'startsAt', championship.starts_at,
      'finishedAt', championship.finished_at,
      'timezone', championship.timezone
    ),
    'rounds', rounds_payload,
    'participants', breakdown
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Integracao de Progresso e Calendario
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
      and participants.status <> 'CANCELLED'
      and championships.status <> 'CANCELLED'
      and (
        participants.started_at is not null
        or participants.completed_rounds > 0
        or coalesce(participants.total_score, 0) > 0
        or participants.status in ('PLAYING', 'FINISHED')
      )
  )
  select
    coalesce(free_play.day, championship.day) as activity_date,
    coalesce(free_play.games, 0) as free_play_games,
    championship.day is not null as championship_played
  from free_play
  full outer join championship on championship.day = free_play.day;
$$;

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
      and participants.status <> 'CANCELLED'
      and championships.status <> 'CANCELLED'
      and (
        participants.started_at is not null
        or participants.completed_rounds > 0
        or coalesce(participants.total_score, 0) > 0
      )
      and (p_from is null or championships.championship_date >= p_from)
      and (p_to is null or championships.championship_date <= p_to)
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'general', jsonb_build_object(
      'games', (select count(*)::integer from games),
      'completedGames', (select count(*) filter (where completed)::integer from games),
      'completionRate', coalesce((
        select round(count(*) filter (where completed)::numeric / nullif(count(*), 0) * 100, 1)
        from games
      ), 0),
      'wordsSolved', coalesce((select sum(words_solved)::integer from games), 0),
      'totalAttempts', coalesce((select sum(attempts_used)::integer from games), 0),
      'averageAttempts', coalesce((
        select round(avg(attempts_used)::numeric, 1) from games
      ), 0),
      'totalDurationMs', coalesce((select sum(duration_ms)::bigint from games), 0),
      'bestDurationMs', (select min(duration_ms)::bigint from games where completed),
      'activeDays', (
        select count(distinct activity_date)::integer
        from pl_activity_days(target_user)
        where (p_from is null or activity_date >= p_from)
          and (p_to is null or activity_date <= p_to)
      )
    ),
    'modes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'mode', mode,
          'games', count(*)::integer,
          'completed', count(*) filter (where completed)::integer,
          'completionRate', round(count(*) filter (where completed)::numeric / count(*) * 100, 1),
          'wordsSolved', sum(words_solved)::integer,
          'wordsTotal', sum(case mode when 'SIMPLE' then 1 when 'DUET' then 2 when 'QUARTET' then 4 when 'SEXTET' then 6 end)::integer,
          'attempts', sum(attempts_used)::integer,
          'averageAttempts', round(avg(attempts_used)::numeric, 1),
          'bestAttempts', min(attempts_used) filter (where completed),
          'averageDurationMs', coalesce(avg(duration_ms)::bigint, 0),
          'bestDurationMs', min(duration_ms)::bigint filter (where completed)
        )
      )
      from games
      group by mode
    ), '[]'::jsonb),
    'championship', jsonb_build_object(
      'played', (select count(*)::integer from participations),
      'wins', (select count(*) filter (where final_position = 1)::integer from participations),
      'podiums', (select count(*) filter (where final_position between 1 and 3)::integer from participations),
      'bestPosition', (select min(final_position) from participations),
      'bestScore', coalesce((select max(total_score) from participations), 0),
      'averageScore', coalesce((select round(avg(total_score))::integer from participations), 0),
      'totalWordsSolved', coalesce((select sum(words_solved)::integer from participations), 0),
      'averagePosition', coalesce((select round(avg(final_position)::numeric, 2) from participations where final_position is not null), 0)
    )
  );
$$;

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

  days_possible := case
    when month_end > today_date then greatest(today_date - month_start + 1, 0)
    else month_end - month_start + 1
  end;

  select * into streak from pl_calculate_streak(current_user_id);

  return jsonb_build_object(
    'month', month_start,
    'monthEnd', month_end,
    'today', today_date,
    'timezone', 'America/Sao_Paulo',
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
            and participants.status <> 'CANCELLED'
            and championships.status <> 'CANCELLED'
            and championships.championship_date between month_start and month_end
        ) as champ on champ.day = activity.day
      ) as calendar
    ), '[]'::jsonb),
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

-- ---------------------------------------------------------------------
-- Permissoes
-- ---------------------------------------------------------------------
grant execute on function public.ensure_current_norte_round(date) to authenticated, anon;
grant execute on function public.cd_current_championship_id() to authenticated, anon;
grant execute on function public.cd_weekly_leaderboard(date) to authenticated, anon;
grant execute on function public.pl_get_my_championship_history(integer, integer) to authenticated;
grant execute on function public.cd_championship_results(uuid) to authenticated, anon;
grant execute on function public.pl_activity_days(uuid) to authenticated;
grant execute on function public.pl_aggregate_stats(uuid, date, date) to authenticated;
grant execute on function public.pl_get_month_progress(date) to authenticated;
