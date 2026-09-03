-- =====================================================================
-- Palavra Livre - Fix Horário de Encerramento (23:59) e Liberação do Botão de Entrada
--
-- 1. cd_day_end passa a retornar 23:59:59 (em vez de 00:00 do dia seguinte).
-- 2. Atualiza championships para fechar as 23:59:59.
-- 3. Garante status IN_PROGRESS e liberacao da inscricao durante todo o dia util.
-- =====================================================================

-- 1. cd_day_end retorna 23:59:59 da data oficial
create or replace function public.cd_day_end(p_date date, p_timezone text default 'America/Sao_Paulo')
returns timestamptz
language sql
stable
set search_path = public
as $$
  select ((p_date::text || ' 23:59:59')::timestamp at time zone coalesce(p_timezone, 'America/Sao_Paulo'));
$$;

-- 2. Atualiza horarios de fechamento em aberto
update championships
set registration_closes_at = cd_day_end(championship_date, timezone),
    status = case
      when championship_date = brazil_current_date() and status in ('SCHEDULED', 'WAITING', 'REGISTRATION_OPEN') then 'IN_PROGRESS'::championship_status
      else status
    end
where status <> 'CANCELLED';

-- 3. Atualiza cd_refresh_championship_status para manter IN_PROGRESS até as 23:59:59
create or replace function public.cd_refresh_championship_status(target_championship uuid)
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

  today_date := (now() at time zone coalesce(championship.timezone, 'America/Sao_Paulo'))::date;

  -- Se a data ja passou ou agora e depois de 23:59:59, finaliza
  if today_date > championship.championship_date
    or now() > cd_day_end(championship.championship_date, championship.timezone) then
    perform cd_finish_championship(target_championship);
    select * into championship from championships where id = target_championship;
    return championship;
  end if;

  -- Se hoje e o dia da rodada, fica IN_PROGRESS o dia inteiro
  if today_date = championship.championship_date then
    next_status := 'IN_PROGRESS';
  elsif today_date < championship.championship_date then
    next_status := 'SCHEDULED';
  else
    next_status := 'FINISHED';
  end if;

  if next_status <> championship.status
    or championship.registration_closes_at <> cd_day_end(championship.championship_date, championship.timezone) then
    update championships
    set status = next_status,
        starts_at = case
          when next_status = 'IN_PROGRESS' then cd_day_start(championship.championship_date, championship.timezone)
          else starts_at
        end,
        registration_closes_at = cd_day_end(championship.championship_date, championship.timezone),
        updated_at = now()
    where id = target_championship
    returning * into championship;
  end if;

  return championship;
end;
$$;

-- 4. Atualiza ensure_current_norte_round para usar 23:59:59
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

  championship_json := ensure_current_norte_championship(ref_date);
  weekly_champ_id := (championship_json->'championship'->>'id')::uuid;

  round_label := case weekday_number
    when 1 then 'SEGUNDA'
    when 2 then 'TERCA'
    when 3 then 'QUARTA'
    when 4 then 'QUINTA'
    when 5 then 'SEXTA'
  end;

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
  on conflict (weekly_championship_id, weekday) do update
    set round_date = excluded.round_date
  returning id into round_id;

  if round_id is null then
    select id into round_id
    from weekly_championship_rounds
    where weekly_championship_id = weekly_champ_id and weekday = weekday_number;
  end if;

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
    and (is_official or weekly_championship_id is not null or name = 'Campeonato Norte')
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
      when others then
        select id into daily_champ_id
        from championships
        where championship_date = ref_date
          and (is_official or weekly_championship_id is not null or name = 'Campeonato Norte')
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
    update championships
    set weekly_championship_id = weekly_champ_id,
        weekly_round_id = round_id,
        name = 'Campeonato Norte',
        registration_closes_at = closes_at,
        status = case
          when ref_date = brazil_current_date() and status in ('SCHEDULED', 'WAITING', 'REGISTRATION_OPEN') then 'IN_PROGRESS'::championship_status
          when ref_date < brazil_current_date() and status in ('SCHEDULED', 'WAITING', 'REGISTRATION_OPEN', 'IN_PROGRESS') then 'FINISHED'::championship_status
          else status
        end
    where id = daily_champ_id;
  end if;

  update championships
  set status = 'FINISHED'
  where championship_date < brazil_current_date()
    and status in ('SCHEDULED', 'WAITING', 'REGISTRATION_OPEN', 'IN_PROGRESS')
    and (is_official or weekly_championship_id is not null or name = 'Campeonato Norte');

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

-- 5. Atualiza cd_register para auto-ativar a rodada caso ainda estivesse como SCHEDULED/WAITING
create or replace function public.cd_register(
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
  today_date date;
begin
  if current_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if target is null then
    raise exception 'CHAMPIONSHIP_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform cd_upsert_profile(clean_name);
  championship := cd_refresh_championship_status(target);

  today_date := (now() at time zone coalesce(championship.timezone, 'America/Sao_Paulo'))::date;

  -- Se for o campeonato de hoje e ainda não foi ativado, ativa imediatamente
  if championship.status in ('SCHEDULED', 'WAITING', 'REGISTRATION_OPEN') and championship.championship_date = today_date then
    update championships
    set status = 'IN_PROGRESS',
        registration_closes_at = cd_day_end(championship.championship_date, championship.timezone),
        updated_at = now()
    where id = championship.id
    returning * into championship;
  end if;

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

grant execute on function public.cd_register(text, uuid) to authenticated, anon;
grant execute on function public.cd_day_end(date, text) to authenticated, anon;
grant execute on function public.cd_refresh_championship_status(uuid) to authenticated, anon;
grant execute on function public.ensure_current_norte_round(date) to authenticated, anon;

-- 6. Executa imediatamente para a rodada de hoje ficar 100% ativa com fechamento às 23:59:59
select public.ensure_current_norte_round(public.brazil_current_date());
