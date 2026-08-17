-- =====================================================================
-- Palavra Livre - Campeonato semanal
-- Migration: rodada diaria jogavel o dia todo + ranking semanal.
-- =====================================================================

-- O modelo antigo exigia registration_closes_at <= starts_at. No modelo novo,
-- starts_at marca o inicio da rodada diaria e registration_closes_at marca o
-- fim do dia jogavel.
alter table championships
  drop constraint if exists championships_window_check;

alter table championships
  add constraint championships_window_check check (
    registration_opens_at < registration_closes_at
    and registration_opens_at <= starts_at
  );

create or replace function cd_day_start(p_date date, p_timezone text)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select ((p_date::text || ' 00:00:00')::timestamp at time zone p_timezone);
$$;

create or replace function cd_day_end(p_date date, p_timezone text)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select (((p_date + 1)::text || ' 00:00:00')::timestamp at time zone p_timezone);
$$;

-- Campeonato oficial atual: prioriza a rodada diaria de hoje. Se nao existir,
-- mostra a proxima rodada criada; se nao houver, cai no ultimo resultado.
create or replace function cd_current_championship_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  config championship_config%rowtype;
  today_date date;
  target uuid;
begin
  select * into config from championship_config where id;
  today_date := (now() at time zone config.default_timezone)::date;

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

-- Encerra automaticamente apenas quando o dia acabou. Terminar todos os
-- jogadores atuais nao fecha a rodada, porque outras pessoas podem entrar mais
-- tarde no mesmo dia.
create or replace function cd_try_auto_finish(target_championship uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  championship championships%rowtype;
  day_end timestamptz;
begin
  select * into championship from championships where id = target_championship;

  if not found or championship.status <> 'IN_PROGRESS' then
    return false;
  end if;

  day_end := cd_day_end(championship.championship_date, championship.timezone);

  if now() >= day_end then
    perform cd_finish_championship(target_championship);
    return true;
  end if;

  return false;
end;
$$;

-- Status guiado pelo relogio do servidor:
-- futuro = SCHEDULED, hoje = IN_PROGRESS, passado = FINISHED.
create or replace function cd_refresh_championship_status(target_championship uuid)
returns championships
language plpgsql
security definer
set search_path = public
as $$
declare
  championship championships%rowtype;
  today_date date;
  next_status championship_status;
begin
  select * into championship from championships where id = target_championship;

  if not found then
    raise exception 'CHAMPIONSHIP_NOT_FOUND' using errcode = 'P0001';
  end if;

  if championship.status in ('FINISHED', 'CANCELLED', 'CALCULATING_RESULTS') then
    return championship;
  end if;

  today_date := (now() at time zone championship.timezone)::date;

  if today_date > championship.championship_date
    or now() >= cd_day_end(championship.championship_date, championship.timezone) then
    perform cd_finish_championship(target_championship);
    select * into championship from championships where id = target_championship;
    return championship;
  end if;

  if today_date = championship.championship_date
    and now() >= cd_day_start(championship.championship_date, championship.timezone) then
    next_status := 'IN_PROGRESS';
  else
    next_status := 'SCHEDULED';
  end if;

  if next_status <> championship.status then
    update championships
    set status = next_status,
        starts_at = case
          when next_status = 'IN_PROGRESS' then cd_day_start(championship.championship_date, championship.timezone)
          else starts_at
        end,
        registration_closes_at = case
          when next_status = 'IN_PROGRESS' then cd_day_end(championship.championship_date, championship.timezone)
          else registration_closes_at
        end,
        updated_at = now()
    where id = target_championship
    returning * into championship;
  end if;

  if championship.status = 'IN_PROGRESS' then
    update championship_rounds
    set status = 'ACTIVE',
        starts_at = coalesce(starts_at, now())
    where championship_id = target_championship
      and status = 'PENDING';
  end if;

  return championship;
end;
$$;

-- A RPC antiga continua existindo, mas agora significa "participar da rodada
-- diaria de hoje". Nao ha janela de inscricao separada.
create or replace function cd_register(
  p_display_name text,
  p_championship_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  championship championships%rowtype;
  clean_name text := btrim(p_display_name);
  target uuid := coalesce(p_championship_id, cd_current_championship_id());
begin
  if current_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if target is null then
    raise exception 'CHAMPIONSHIP_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform cd_upsert_profile(clean_name);
  championship := cd_refresh_championship_status(target);

  if championship.status <> 'IN_PROGRESS' then
    raise exception 'CHAMPIONSHIP_NOT_IN_PROGRESS' using errcode = 'P0001';
  end if;

  begin
    insert into championship_participants (championship_id, user_id, display_name_snapshot)
    values (championship.id, current_user_id, clean_name);
  exception
    when unique_violation then
      if exists (
        select 1 from championship_participants
        where championship_id = championship.id and user_id = current_user_id
      ) then
        update championship_participants
        set status = case when status = 'CANCELLED' then 'REGISTERED' else status end
        where championship_id = championship.id and user_id = current_user_id;
      else
        raise exception 'DISPLAY_NAME_TAKEN' using errcode = 'P0001';
      end if;
  end;

  return cd_build_state(championship.id, current_user_id);
end;
$$;

-- Criacao padrao: uma rodada diaria, disponivel de 00:00 ate 23:59:59 no
-- fuso oficial. Se for criada no proprio dia, ja nasce IN_PROGRESS.
create or replace function cd_admin_create_championship(
  p_championship_date date default null,
  p_registration_opens_at timestamptz default null,
  p_registration_closes_at timestamptz default null,
  p_starts_at timestamptz default null,
  p_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  config championship_config%rowtype;
  target_date date;
  opens_at timestamptz;
  closes_at timestamptz;
  starts_at timestamptz;
  initial_status championship_status;
  created championships%rowtype;
  blueprint record;
  drawn integer;
begin
  perform cd_require_admin();
  select * into config from championship_config where id;

  target_date := coalesce(
    p_championship_date,
    (now() at time zone config.default_timezone)::date
  );
  starts_at := coalesce(p_starts_at, cd_day_start(target_date, config.default_timezone));
  opens_at := coalesce(p_registration_opens_at, starts_at - interval '1 second');
  closes_at := coalesce(p_registration_closes_at, cd_day_end(target_date, config.default_timezone));
  initial_status := case
    when (now() at time zone config.default_timezone)::date = target_date
      and now() < closes_at then 'IN_PROGRESS'::championship_status
    else 'SCHEDULED'::championship_status
  end;

  begin
    insert into championships (
      name,
      championship_date,
      timezone,
      registration_opens_at,
      registration_closes_at,
      starts_at,
      status,
      created_by
    ) values (
      coalesce(nullif(btrim(p_name), ''), 'Campeonato Diario'),
      target_date,
      config.default_timezone,
      opens_at,
      closes_at,
      starts_at,
      initial_status,
      auth.uid()
    )
    returning * into created;
  exception
    when unique_violation then
      raise exception 'CHAMPIONSHIP_DATE_TAKEN' using errcode = 'P0001';
  end;

  for blueprint in select * from cd_round_blueprint() loop
    insert into championship_rounds (
      championship_id, mode, round_order, board_count, max_attempts, status, starts_at
    ) values (
      created.id, blueprint.mode, blueprint.round_order,
      blueprint.board_count, blueprint.max_attempts,
      case when initial_status = 'IN_PROGRESS' then 'ACTIVE'::championship_round_status else 'PENDING'::championship_round_status end,
      case when initial_status = 'IN_PROGRESS' then now() else null end
    );
  end loop;

  drawn := cd_draw_championship_words(created.id);

  return jsonb_build_object(
    'championshipId', created.id,
    'championshipDate', created.championship_date,
    'registrationOpensAt', created.registration_opens_at,
    'registrationClosesAt', created.registration_closes_at,
    'startsAt', created.starts_at,
    'status', created.status,
    'wordsDrawn', drawn
  );
end;
$$;

create or replace function cd_weekly_leaderboard(p_week_start date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  config championship_config%rowtype;
  week_start date;
  week_end date;
  finished_days integer;
  entries jsonb;
begin
  select * into config from championship_config where id;
  week_start := coalesce(
    p_week_start,
    date_trunc('week', (now() at time zone config.default_timezone)::timestamp)::date
  );
  week_end := week_start + 6;

  select count(*) into finished_days
  from championships
  where is_official
    and status = 'FINISHED'
    and championship_date between week_start and week_end;

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
        'status', 'FINISHED'
      ) as entry
    from (
      select
        participants.user_id,
        (array_agg(participants.display_name_snapshot order by championships.championship_date desc))[1] as display_name,
        coalesce(sum(participants.total_score), 0)::integer as total_score,
        coalesce(sum(participants.words_solved), 0)::integer as words_solved,
        coalesce(sum(participants.completed_rounds), 0)::integer as completed_rounds,
        coalesce(sum(participants.total_attempts), 0)::integer as total_attempts,
        coalesce(sum(participants.total_duration_ms), 0)::bigint as total_duration_ms
      from championship_participants as participants
      join championships on championships.id = participants.championship_id
      where championships.is_official
        and championships.status = 'FINISHED'
        and championships.championship_date between week_start and week_end
        and participants.status <> 'CANCELLED'
      group by participants.user_id
    ) as weekly_totals
  ) as ranked;

  return jsonb_build_object(
    'championshipId', null,
    'championshipName', 'Campeonato Semanal',
    'period', 'weekly',
    'periodLabel', to_char(week_start, 'DD/MM/YYYY') || ' a ' || to_char(week_end, 'DD/MM/YYYY'),
    'weekStart', week_start,
    'weekEnd', week_end,
    'totalWords', finished_days * 13,
    'totalRounds', finished_days * 4,
    'status', case when finished_days >= 7 then 'FINISHED' else 'IN_PROGRESS' end,
    'isFinal', true,
    'entries', entries
  );
end;
$$;

revoke all on function cd_weekly_leaderboard(date) from public, anon, authenticated;
grant execute on function cd_weekly_leaderboard(date) to anon, authenticated;
