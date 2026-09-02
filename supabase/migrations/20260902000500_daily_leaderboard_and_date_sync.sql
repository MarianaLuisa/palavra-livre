-- =====================================================================
-- Palavra Livre - Sincronização da Data da Rodada e Ranking Diário Ao Vivo
--
-- 1. Corrige constraint championships_window_check para permitir rodadas diárias.
-- 2. Migra/atualiza campeonatos em andamento para a data de hoje (02/09/2026).
-- 3. Atualiza cd_leaderboard para exibir pontuações e palavras acertadas
--    em tempo real (nunca zeradas/nulas).
-- 4. Garante que cd_current_championship_id retorne sempre a rodada de hoje.
-- =====================================================================

-- 1. Constraint de janela para formato diário
alter table championships
  drop constraint if exists championships_window_check;

alter table championships
  add constraint championships_window_check check (
    registration_opens_at < registration_closes_at
    and registration_opens_at <= starts_at
  );

-- 2. Migração da rodada de hoje e finalização de rodadas anteriores
do $$
declare
  v_today date := brazil_current_date();
begin
  -- Se o campeonato que estava em andamento é de ontem (2026-09-01) e ainda não
  -- existe campeonato oficial para hoje (2026-09-02), sincroniza a data para hoje
  -- para que as jogadas de hoje fiquem registradas na rodada correta.
  if not exists (
    select 1 from championships
    where championship_date = v_today
      and (is_official or weekly_championship_id is not null or name = 'Campeonato Norte')
      and status <> 'CANCELLED'
  ) then
    update championships
    set championship_date = v_today,
        status = 'IN_PROGRESS'
    where championship_date = v_today - interval '1 day'
      and status in ('IN_PROGRESS', 'SCHEDULED', 'WAITING', 'REGISTRATION_OPEN')
      and (is_official or weekly_championship_id is not null or name = 'Campeonato Norte');
  end if;

  -- Finaliza qualquer campeonato de datas anteriores que tenha ficado aberto
  update championships
  set status = 'FINISHED'
  where championship_date < v_today
    and status in ('SCHEDULED', 'WAITING', 'REGISTRATION_OPEN', 'IN_PROGRESS')
    and (is_official or weekly_championship_id is not null or name = 'Campeonato Norte');
end $$;

-- 3. Auto-garantia da rodada atual do Norte
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
  on conflict (weekly_championship_id, weekday) do update
    set round_date = excluded.round_date
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
    -- Garante vinculo com o Campeonato Norte semanal e status correto
    update championships
    set weekly_championship_id = weekly_champ_id,
        weekly_round_id = round_id,
        name = 'Campeonato Norte',
        status = case
          when ref_date = brazil_current_date() and status in ('SCHEDULED', 'WAITING', 'REGISTRATION_OPEN') then 'IN_PROGRESS'::championship_status
          when ref_date < brazil_current_date() and status in ('SCHEDULED', 'WAITING', 'REGISTRATION_OPEN', 'IN_PROGRESS') then 'FINISHED'::championship_status
          else status
        end
    where id = daily_champ_id;
  end if;

  -- Finaliza campeonatos anteriores que ainda estavam como IN_PROGRESS
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

grant execute on function public.ensure_current_norte_round(date) to authenticated, anon;

-- 4. Função para obter o campeonato oficial atual
create or replace function public.cd_current_championship_id()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  today_date date := brazil_current_date();
  today_weekday integer := extract(isodow from today_date)::int;
  target uuid;
  auto_res jsonb;
begin
  -- Se for dia util (segunda a sexta), garante a rodada de hoje e retorna
  if today_weekday between 1 and 5 then
    begin
      auto_res := ensure_current_norte_round(today_date);
      target := (auto_res->>'dailyChampionshipId')::uuid;
      if target is not null then
        return target;
      end if;
    exception when others then
      null;
    end;

    -- Busca direta para a data de hoje
    select id into target
    from championships
    where championship_date = today_date
      and (is_official or weekly_championship_id is not null or name = 'Campeonato Norte')
      and status <> 'CANCELLED'
    limit 1;

    if target is not null then
      return target;
    end if;
  end if;

  -- Fallback para fim de semana ou campeonato mais recente
  select id into target
  from championships
  where (is_official or weekly_championship_id is not null or name = 'Campeonato Norte')
    and status <> 'CANCELLED'
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

grant execute on function public.cd_current_championship_id() to authenticated, anon;

-- 5. Classificação da rodada diária com pontuações em tempo real (NUNCA zeradas)
create or replace function public.cd_leaderboard(p_championship_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  today_date date := brazil_current_date();
  today_weekday integer := extract(isodow from today_date)::int;
  target uuid := p_championship_id;
  championship championships%rowtype;
  is_final boolean;
  entries jsonb;
begin
  -- Se nenhum campeonato foi passado, garante e busca o campeonato de hoje
  if target is null then
    if today_weekday between 1 and 5 then
      begin
        perform ensure_current_norte_round(today_date);
      exception when others then
        null;
      end;
    end if;

    select id into target
    from championships
    where championship_date = today_date
      and (is_official or weekly_championship_id is not null or name = 'Campeonato Norte')
      and status <> 'CANCELLED'
    limit 1;

    if target is null then
      target := cd_current_championship_id();
    end if;
  end if;

  if target is null then
    return jsonb_build_object(
      'championshipId', null,
      'isFinal', false,
      'entries', '[]'::jsonb,
      'championshipDate', to_char(today_date, 'YYYY-MM-DD')
    );
  end if;

  championship := cd_refresh_championship_status(target);
  is_final := championship.status in ('FINISHED', 'CALCULATING_RESULTS');

  -- Recalcula os totais de cada participante ativo para garantir dados atualizados
  perform cd_recalculate_participant_totals(cp.id)
  from championship_participants cp
  where cp.championship_id = target and cp.status <> 'CANCELLED';

  -- Monta o ranking com pontuações reais atualizadas (mesmo com a rodada em andamento)
  select coalesce(jsonb_agg(entry order by entry_position), '[]'::jsonb) into entries
  from (
    select
      row_number() over (
        order by
          coalesce(total_score, 0) desc,
          coalesce(words_solved, 0) desc,
          coalesce(completed_rounds, 0) desc,
          coalesce(total_attempts, 9999) asc,
          coalesce(total_duration_ms, 999999999) asc,
          coalesce(finished_at, 'infinity'::timestamptz) asc,
          registered_at asc,
          id asc
      ) as entry_position,
      jsonb_build_object(
        'participantId', id,
        'userId', user_id,
        'position', row_number() over (
          order by
            coalesce(total_score, 0) desc,
            coalesce(words_solved, 0) desc,
            coalesce(completed_rounds, 0) desc,
            coalesce(total_attempts, 9999) asc,
            coalesce(total_duration_ms, 999999999) asc,
            coalesce(finished_at, 'infinity'::timestamptz) asc,
            registered_at asc,
            id asc
        ),
        'displayName', display_name_snapshot,
        'totalScore', coalesce(total_score, 0),
        'wordsSolved', coalesce(words_solved, 0),
        'completedRounds', coalesce(completed_rounds, 0),
        'totalAttempts', total_attempts,
        'totalDurationMs', total_duration_ms,
        'status', status
      ) as entry
    from championship_participants
    where championship_id = target and status <> 'CANCELLED'
  ) as ranked;

  return jsonb_build_object(
    'championshipId', target,
    'championshipName', championship.name,
    'championshipDate', championship.championship_date,
    'status', championship.status,
    'isFinal', is_final,
    'entries', entries
  );
end;
$$;

grant execute on function public.cd_leaderboard(uuid) to authenticated, anon;

-- 6. Execução imediata para garantir a rodada de hoje ativa e sincronizada
select public.ensure_current_norte_round(public.brazil_current_date());
