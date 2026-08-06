-- =====================================================================
-- Palavra Livre - Campeonato Diario
-- Migration 05: RPCs administrativas.
-- Todas exigem championship_admins.
-- =====================================================================

create or replace function cd_require_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not cd_is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Cria o campeonato do dia com as quatro modalidades e sorteia as palavras.
-- Horarios sao informados no fuso do campeonato (default America/Sao_Paulo).
-- ---------------------------------------------------------------------
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

  -- Padrao: inscricoes das 09h as 19h55, inicio as 20h, horario de Sao Paulo.
  starts_at := coalesce(
    p_starts_at,
    ((target_date::text || ' 20:00:00')::timestamp at time zone config.default_timezone)
  );
  opens_at := coalesce(p_registration_opens_at, starts_at - interval '11 hours');
  closes_at := coalesce(p_registration_closes_at, starts_at - interval '5 minutes');

  insert into championships (
    name,
    championship_date,
    timezone,
    registration_opens_at,
    registration_closes_at,
    starts_at,
    created_by
  ) values (
    coalesce(nullif(btrim(p_name), ''), 'Campeonato Diario'),
    target_date,
    config.default_timezone,
    opens_at,
    closes_at,
    starts_at,
    auth.uid()
  )
  returning * into created;

  for blueprint in select * from cd_round_blueprint() loop
    insert into championship_rounds (
      championship_id, mode, round_order, board_count, max_attempts
    ) values (
      created.id, blueprint.mode, blueprint.round_order,
      blueprint.board_count, blueprint.max_attempts
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

-- ---------------------------------------------------------------------
-- Ajuste de horarios antes do inicio.
-- ---------------------------------------------------------------------
create or replace function cd_admin_update_schedule(
  p_championship_id uuid,
  p_registration_opens_at timestamptz default null,
  p_registration_closes_at timestamptz default null,
  p_starts_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated championships%rowtype;
begin
  perform cd_require_admin();

  update championships
  set registration_opens_at = coalesce(p_registration_opens_at, registration_opens_at),
      registration_closes_at = coalesce(p_registration_closes_at, registration_closes_at),
      starts_at = coalesce(p_starts_at, starts_at)
  where id = p_championship_id
    and status in ('SCHEDULED', 'REGISTRATION_OPEN', 'WAITING')
  returning * into updated;

  if not found then
    raise exception 'SCHEDULE_UPDATE_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  return to_jsonb(updated);
end;
$$;

-- ---------------------------------------------------------------------
-- Transicoes manuais de status.
-- ---------------------------------------------------------------------
create or replace function cd_admin_set_status(
  p_championship_id uuid,
  p_status championship_status
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated championships%rowtype;
begin
  perform cd_require_admin();

  if p_status = 'FINISHED' then
    perform cd_finish_championship(p_championship_id);
    select * into updated from championships where id = p_championship_id;
    return to_jsonb(updated);
  end if;

  update championships
  set status = p_status,
      finished_at = case when p_status = 'CANCELLED' then coalesce(finished_at, now()) else finished_at end
  where id = p_championship_id
  returning * into updated;

  if not found then
    raise exception 'CHAMPIONSHIP_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_status = 'IN_PROGRESS' then
    update championship_rounds
    set status = 'ACTIVE', starts_at = coalesce(starts_at, now())
    where championship_id = p_championship_id and status = 'PENDING';
  end if;

  return to_jsonb(updated);
end;
$$;

-- ---------------------------------------------------------------------
-- Novo sorteio de palavras (bloqueado depois do inicio).
-- ---------------------------------------------------------------------
create or replace function cd_admin_redraw_words(p_championship_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  championship championships%rowtype;
  drawn integer;
begin
  perform cd_require_admin();

  select * into championship from championships where id = p_championship_id;

  if not found then
    raise exception 'CHAMPIONSHIP_NOT_FOUND' using errcode = 'P0001';
  end if;

  if championship.status not in ('SCHEDULED', 'REGISTRATION_OPEN', 'WAITING') then
    raise exception 'REDRAW_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  drawn := cd_draw_championship_words(p_championship_id);
  return jsonb_build_object('championshipId', p_championship_id, 'wordsDrawn', drawn);
end;
$$;

-- ---------------------------------------------------------------------
-- Recalculo da classificacao.
-- ---------------------------------------------------------------------
create or replace function cd_admin_recalculate(p_championship_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  participant_record record;
  updated integer;
begin
  perform cd_require_admin();

  for participant_record in
    select id from championship_participants where championship_id = p_championship_id
  loop
    perform cd_recalculate_participant_totals(participant_record.id);
  end loop;

  updated := cd_consolidate_ranking(p_championship_id);
  return jsonb_build_object('championshipId', p_championship_id, 'updatedPositions', updated);
end;
$$;

-- ---------------------------------------------------------------------
-- Visao administrativa do campeonato.
-- ---------------------------------------------------------------------
create or replace function cd_admin_overview(p_championship_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(p_championship_id, cd_current_championship_id());
  championship championships%rowtype;
begin
  perform cd_require_admin();

  if target is null then
    return jsonb_build_object('championship', null, 'participants', '[]'::jsonb, 'rounds', '[]'::jsonb);
  end if;

  championship := cd_refresh_championship_status(target);

  return jsonb_build_object(
    'championship', to_jsonb(championship),
    'rounds', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', rounds.id,
        'mode', rounds.mode,
        'roundOrder', rounds.round_order,
        'boardCount', rounds.board_count,
        'maxAttempts', rounds.max_attempts,
        'status', rounds.status,
        'answerCount', (
          select count(*) from championship_answers as answers
          where answers.championship_round_id = rounds.id
        ),
        'answers', case
          when championship.status = 'FINISHED' then (
            select coalesce(jsonb_agg(answers.answer order by answers.board_index), '[]'::jsonb)
            from championship_answers as answers
            where answers.championship_round_id = rounds.id
          )
          else null
        end
      ) order by rounds.round_order), '[]'::jsonb)
      from championship_rounds as rounds
      where rounds.championship_id = target
    ),
    'participants', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', participants.id,
        'displayName', participants.display_name_snapshot,
        'status', participants.status,
        'registeredAt', participants.registered_at,
        'completedRounds', participants.completed_rounds,
        'totalScore', participants.total_score,
        'finalPosition', participants.final_position
      ) order by participants.registered_at), '[]'::jsonb)
      from championship_participants as participants
      where participants.championship_id = target
    ),
    'wordPoolSize', (select count(*) from championship_word_pool where is_enabled),
    'validWordCount', (select count(*) from championship_valid_words)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Atualizacao das regras configuraveis.
-- ---------------------------------------------------------------------
create or replace function cd_admin_update_config(
  p_points_per_word integer default null,
  p_bonus_per_remaining_attempt integer default null,
  p_recent_answer_cooldown_days integer default null,
  p_max_championship_duration_minutes integer default null,
  p_allow_late_registration boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated championship_config%rowtype;
begin
  perform cd_require_admin();

  update championship_config
  set points_per_word = coalesce(p_points_per_word, points_per_word),
      bonus_per_remaining_attempt = coalesce(p_bonus_per_remaining_attempt, bonus_per_remaining_attempt),
      recent_answer_cooldown_days = coalesce(p_recent_answer_cooldown_days, recent_answer_cooldown_days),
      max_championship_duration_minutes = coalesce(
        p_max_championship_duration_minutes, max_championship_duration_minutes
      ),
      allow_late_registration = coalesce(p_allow_late_registration, allow_late_registration),
      updated_at = now()
  where id
  returning * into updated;

  return to_jsonb(updated);
end;
$$;
