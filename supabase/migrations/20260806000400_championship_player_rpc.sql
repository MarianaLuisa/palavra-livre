-- =====================================================================
-- Palavra Livre - Campeonato Diario
-- Migration 04: RPCs usadas pelo jogador.
-- O cliente NUNCA le tabelas diretamente para jogar: tudo passa por aqui.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Campeonato oficial "atual": o do dia, ou o proximo agendado,
-- ou o ultimo encerrado quando nao houver nada em aberto.
-- ---------------------------------------------------------------------
create or replace function cd_current_championship_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from championships
  where is_official and status <> 'CANCELLED'
  order by
    case
      when status in ('SCHEDULED', 'REGISTRATION_OPEN', 'WAITING', 'IN_PROGRESS', 'CALCULATING_RESULTS') then 0
      else 1
    end,
    starts_at desc
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- Perfil do usuario autenticado.
-- ---------------------------------------------------------------------
create or replace function cd_upsert_profile(p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_name text := btrim(p_display_name);
  saved profiles%rowtype;
begin
  if current_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if char_length(clean_name) < 2 or char_length(clean_name) > 24 then
    raise exception 'INVALID_DISPLAY_NAME' using errcode = 'P0001';
  end if;

  insert into profiles (id, display_name)
  values (current_user_id, clean_name)
  on conflict (id) do update set display_name = excluded.display_name
  returning * into saved;

  return jsonb_build_object(
    'id', saved.id,
    'displayName', saved.display_name,
    'createdAt', saved.created_at
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Monta o estado completo visivel para um usuario.
-- Respostas so aparecem quando o tabuleiro foi resolvido,
-- quando a rodada do participante fechou ou quando o campeonato terminou.
-- ---------------------------------------------------------------------
create or replace function cd_build_state(
  target_championship uuid,
  target_user uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  championship championships%rowtype;
  participant championship_participants%rowtype;
  round_record record;
  rounds_payload jsonb := '[]'::jsonb;
  boards_payload jsonb;
  board_rows jsonb;
  participant_round participant_rounds%rowtype;
  participant_count integer := 0;
  previous_rounds_closed boolean := true;
  round_unlocked boolean;
  reveal_answers boolean;
  current_round_id uuid;
  championship_finished boolean;
  profile_payload jsonb := null;
  profile_record profiles%rowtype;
begin
  if target_championship is null then
    return jsonb_build_object(
      'now', now(),
      'championship', null,
      'participant', null,
      'profile', null,
      'rounds', '[]'::jsonb,
      'currentRoundId', null
    );
  end if;

  championship := cd_refresh_championship_status(target_championship);
  championship_finished := championship.status in ('FINISHED', 'CANCELLED');

  select count(*) into participant_count
  from championship_participants
  where championship_id = championship.id and status <> 'CANCELLED';

  if target_user is not null then
    select * into profile_record from profiles where id = target_user;
    if found then
      profile_payload := jsonb_build_object(
        'id', profile_record.id,
        'displayName', profile_record.display_name,
        'createdAt', profile_record.created_at
      );
    end if;

    select * into participant
    from championship_participants
    where championship_id = championship.id and user_id = target_user;

    if not found then
      participant := null;
    end if;
  end if;

  for round_record in
    select * from championship_rounds
    where championship_id = championship.id
    order by round_order
  loop
    participant_round := null;
    boards_payload := '[]'::jsonb;

    if participant.id is not null then
      select * into participant_round
      from participant_rounds
      where championship_participant_id = participant.id
        and championship_round_id = round_record.id;

      if not found then
        participant_round := null;
      end if;
    end if;

    round_unlocked :=
      championship.status = 'IN_PROGRESS'
      and previous_rounds_closed
      and participant.id is not null
      and participant.status <> 'CANCELLED';

    reveal_answers :=
      championship_finished
      or coalesce(participant_round.status in ('COMPLETED', 'FAILED', 'EXPIRED'), false);

    -- Tabuleiros com as linhas ja avaliadas do participante.
    select coalesce(jsonb_agg(board_payload order by board_index), '[]'::jsonb)
      into boards_payload
    from (
      select
        board_position as board_index,
        jsonb_build_object(
          'boardIndex', board_position,
          'solved', coalesce(solved_state.solved, false),
          'answer', case
            when reveal_answers or coalesce(solved_state.solved, false)
              then (
                select answers.answer
                from championship_answers as answers
                where answers.championship_round_id = round_record.id
                  and answers.board_index = board_position
              )
            else null
          end,
          'rows', coalesce(row_data.rows, '[]'::jsonb)
        ) as board_payload
      from generate_series(0, round_record.board_count - 1) as board_position
      left join lateral (
        select bool_or((board_entry ->> 'solved')::boolean) as solved
        from participant_attempts as attempts
        cross join lateral jsonb_array_elements(attempts.evaluation) as board_entry
        where participant_round.id is not null
          and attempts.participant_round_id = participant_round.id
          and (board_entry ->> 'boardIndex')::integer = board_position
      ) as solved_state on true
      left join lateral (
        select jsonb_agg(board_entry -> 'letters' order by attempts.attempt_number) as rows
        from participant_attempts as attempts
        cross join lateral jsonb_array_elements(attempts.evaluation) as board_entry
        where participant_round.id is not null
          and attempts.participant_round_id = participant_round.id
          and (board_entry ->> 'boardIndex')::integer = board_position
      ) as row_data on true
    ) as boards;

    rounds_payload := rounds_payload || jsonb_build_array(jsonb_build_object(
      'id', round_record.id,
      'mode', round_record.mode,
      'roundOrder', round_record.round_order,
      'boardCount', round_record.board_count,
      'maxAttempts', round_record.max_attempts,
      'timeLimitSeconds', round_record.time_limit_seconds,
      'unlocked', round_unlocked,
      'status', coalesce(participant_round.status::text, 'NOT_STARTED'),
      'attemptsUsed', coalesce(participant_round.attempts_used, 0),
      'wordsSolved', coalesce(participant_round.words_solved, 0),
      'allWordsSolved', coalesce(participant_round.all_words_solved, false),
      'baseScore', coalesce(participant_round.base_score, 0),
      'bonusScore', coalesce(participant_round.bonus_score, 0),
      'totalScore', coalesce(participant_round.total_score, 0),
      'durationMs', coalesce(participant_round.duration_ms, 0),
      'startedAt', participant_round.started_at,
      'finishedAt', participant_round.finished_at,
      'boards', boards_payload
    ));

    if current_round_id is null
      and round_unlocked
      and coalesce(participant_round.status, 'NOT_STARTED') in ('NOT_STARTED', 'IN_PROGRESS')
    then
      current_round_id := round_record.id;
    end if;

    previous_rounds_closed := previous_rounds_closed
      and coalesce(participant_round.status in ('COMPLETED', 'FAILED', 'EXPIRED'), false);
  end loop;

  return jsonb_build_object(
    'now', now(),
    'championship', jsonb_build_object(
      'id', championship.id,
      'name', championship.name,
      'championshipDate', championship.championship_date,
      'timezone', championship.timezone,
      'registrationOpensAt', championship.registration_opens_at,
      'registrationClosesAt', championship.registration_closes_at,
      'startsAt', championship.starts_at,
      'finishedAt', championship.finished_at,
      'status', championship.status,
      'participantCount', participant_count
    ),
    'profile', profile_payload,
    'participant', case when participant.id is null then null else jsonb_build_object(
      'id', participant.id,
      'displayName', participant.display_name_snapshot,
      'status', participant.status,
      'registeredAt', participant.registered_at,
      'startedAt', participant.started_at,
      'finishedAt', participant.finished_at,
      'totalScore', participant.total_score,
      'wordsSolved', participant.words_solved,
      'completedRounds', participant.completed_rounds,
      'totalAttempts', participant.total_attempts,
      'totalDurationMs', participant.total_duration_ms,
      'finalPosition', participant.final_position
    ) end,
    'rounds', rounds_payload,
    'currentRoundId', current_round_id
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Estado atual (restauracao apos recarregar a pagina ou trocar de device).
-- ---------------------------------------------------------------------
create or replace function cd_get_state(p_championship_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(p_championship_id, cd_current_championship_id());
begin
  return cd_build_state(target, auth.uid());
end;
$$;

-- ---------------------------------------------------------------------
-- Inscricao.
-- ---------------------------------------------------------------------
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
  config championship_config%rowtype;
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

  select * into config from championship_config where id;

  perform cd_upsert_profile(clean_name);
  championship := cd_refresh_championship_status(target);

  if championship.status = 'REGISTRATION_OPEN' then
    null;
  elsif config.allow_late_registration
    and championship.status in ('WAITING', 'IN_PROGRESS') then
    null;
  else
    raise exception 'REGISTRATION_CLOSED' using errcode = 'P0001';
  end if;

  begin
    insert into championship_participants (championship_id, user_id, display_name_snapshot)
    values (championship.id, current_user_id, clean_name);
  exception
    when unique_violation then
      -- Reinscricao do mesmo usuario e idempotente; nome duplicado e erro.
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

-- ---------------------------------------------------------------------
-- Cancelamento da propria inscricao (apenas antes do inicio).
-- ---------------------------------------------------------------------
create or replace function cd_cancel_registration(p_championship_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  championship championships%rowtype;
  target uuid := coalesce(p_championship_id, cd_current_championship_id());
begin
  if current_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  championship := cd_refresh_championship_status(target);

  if championship.status not in ('REGISTRATION_OPEN', 'WAITING') then
    raise exception 'CANCELLATION_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  delete from championship_participants
  where championship_id = championship.id and user_id = current_user_id;

  return cd_build_state(championship.id, current_user_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Inicio de uma rodada. Idempotente e obrigatoriamente em ordem.
-- ---------------------------------------------------------------------
create or replace function cd_start_round(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  round_record championship_rounds%rowtype;
  championship championships%rowtype;
  participant championship_participants%rowtype;
  pending_previous integer;
begin
  if current_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select * into round_record from championship_rounds where id = p_round_id;
  if not found then
    raise exception 'ROUND_NOT_FOUND' using errcode = 'P0001';
  end if;

  championship := cd_refresh_championship_status(round_record.championship_id);

  if championship.status <> 'IN_PROGRESS' then
    raise exception 'CHAMPIONSHIP_NOT_IN_PROGRESS' using errcode = 'P0001';
  end if;

  select * into participant
  from championship_participants
  where championship_id = championship.id and user_id = current_user_id
  for update;

  if not found or participant.status = 'CANCELLED' then
    raise exception 'NOT_REGISTERED' using errcode = 'P0001';
  end if;

  -- Todas as rodadas anteriores precisam estar fechadas.
  select count(*) into pending_previous
  from championship_rounds as previous_round
  left join participant_rounds as previous_participation
    on previous_participation.championship_round_id = previous_round.id
   and previous_participation.championship_participant_id = participant.id
  where previous_round.championship_id = championship.id
    and previous_round.round_order < round_record.round_order
    and coalesce(previous_participation.status, 'NOT_STARTED')
        not in ('COMPLETED', 'FAILED', 'EXPIRED');

  if pending_previous > 0 then
    raise exception 'PREVIOUS_ROUND_PENDING' using errcode = 'P0001';
  end if;

  insert into participant_rounds (
    championship_participant_id,
    championship_round_id,
    status,
    started_at
  )
  values (participant.id, round_record.id, 'IN_PROGRESS', now())
  on conflict (championship_participant_id, championship_round_id) do update
    set status = case
          when participant_rounds.status = 'NOT_STARTED' then 'IN_PROGRESS'
          else participant_rounds.status
        end,
        started_at = coalesce(participant_rounds.started_at, now());

  update championship_participants
  set started_at = coalesce(started_at, now()),
      status = case when status = 'REGISTERED' then 'IN_PROGRESS' else status end
  where id = participant.id;

  return cd_build_state(championship.id, current_user_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Envio de tentativa. Coracao da modalidade.
-- Valida, avalia, pontua, persiste e devolve apenas o necessario.
-- ---------------------------------------------------------------------
create or replace function cd_submit_attempt(p_round_id uuid, p_word text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  round_record championship_rounds%rowtype;
  championship championships%rowtype;
  participant championship_participants%rowtype;
  participant_round participant_rounds%rowtype;
  normalized_guess text := cd_normalize_word(p_word);
  next_attempt_number integer;
  answer_record record;
  already_solved boolean;
  evaluation jsonb := '[]'::jsonb;
  board_letters jsonb;
  board_solved boolean;
  solved_total integer := 0;
  round_finished boolean;
  score record;
  round_duration bigint;
begin
  if current_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if char_length(normalized_guess) <> 5 then
    raise exception 'INVALID_WORD_LENGTH' using errcode = 'P0001';
  end if;

  if not cd_word_is_accepted(normalized_guess) then
    raise exception 'WORD_NOT_ACCEPTED' using errcode = 'P0001';
  end if;

  select * into round_record from championship_rounds where id = p_round_id;
  if not found then
    raise exception 'ROUND_NOT_FOUND' using errcode = 'P0001';
  end if;

  championship := cd_refresh_championship_status(round_record.championship_id);

  if championship.status <> 'IN_PROGRESS' then
    raise exception 'CHAMPIONSHIP_NOT_IN_PROGRESS' using errcode = 'P0001';
  end if;

  select * into participant
  from championship_participants
  where championship_id = championship.id and user_id = current_user_id;

  if not found or participant.status = 'CANCELLED' then
    raise exception 'NOT_REGISTERED' using errcode = 'P0001';
  end if;

  -- Trava a participacao na rodada: serializa tentativas simultaneas.
  select * into participant_round
  from participant_rounds
  where championship_participant_id = participant.id
    and championship_round_id = round_record.id
  for update;

  if not found then
    raise exception 'ROUND_NOT_STARTED' using errcode = 'P0001';
  end if;

  if participant_round.status not in ('NOT_STARTED', 'IN_PROGRESS') then
    raise exception 'ROUND_ALREADY_FINISHED' using errcode = 'P0001';
  end if;

  if participant_round.attempts_used >= round_record.max_attempts then
    raise exception 'NO_ATTEMPTS_LEFT' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from participant_attempts
    where participant_round_id = participant_round.id
      and normalized_word = normalized_guess
  ) then
    raise exception 'DUPLICATE_ATTEMPT' using errcode = 'P0001';
  end if;

  next_attempt_number := participant_round.attempts_used + 1;

  -- Avalia apenas os tabuleiros ainda nao resolvidos, como no jogo livre.
  for answer_record in
    select board_index, answer, normalized_answer
    from championship_answers
    where championship_round_id = round_record.id
    order by board_index
  loop
    select coalesce(bool_or((board_entry ->> 'solved')::boolean), false)
      into already_solved
    from participant_attempts as attempts
    cross join lateral jsonb_array_elements(attempts.evaluation) as board_entry
    where attempts.participant_round_id = participant_round.id
      and (board_entry ->> 'boardIndex')::integer = answer_record.board_index;

    if already_solved then
      solved_total := solved_total + 1;
      continue;
    end if;

    board_letters := cd_evaluate_guess(normalized_guess, answer_record.answer);
    board_solved := normalized_guess = answer_record.normalized_answer;

    if board_solved then
      solved_total := solved_total + 1;
    end if;

    evaluation := evaluation || jsonb_build_array(jsonb_build_object(
      'boardIndex', answer_record.board_index,
      'solved', board_solved,
      'letters', board_letters
    ));
  end loop;

  insert into participant_attempts (
    participant_round_id,
    attempt_number,
    word,
    normalized_word,
    evaluation
  ) values (
    participant_round.id,
    next_attempt_number,
    btrim(p_word),
    normalized_guess,
    evaluation
  );

  round_finished := solved_total >= round_record.board_count
    or next_attempt_number >= round_record.max_attempts;

  select * into score from cd_calculate_round_score(
    solved_total,
    round_record.board_count,
    next_attempt_number,
    round_record.max_attempts
  );

  round_duration := case
    when participant_round.started_at is null then 0
    else greatest(
      (extract(epoch from (now() - participant_round.started_at)) * 1000)::bigint,
      0
    )
  end;

  update participant_rounds
  set attempts_used = next_attempt_number,
      words_solved = solved_total,
      all_words_solved = solved_total >= round_record.board_count,
      base_score = case when round_finished then score.base_score else 0 end,
      bonus_score = case when round_finished then score.bonus_score else 0 end,
      total_score = case when round_finished then score.total_score else 0 end,
      duration_ms = round_duration,
      status = case
        when not round_finished then 'IN_PROGRESS'
        when solved_total >= round_record.board_count then 'COMPLETED'
        else 'FAILED'
      end,
      finished_at = case when round_finished then now() else null end
  where id = participant_round.id;

  if round_finished then
    perform cd_recalculate_participant_totals(participant.id);
    perform cd_try_auto_finish(championship.id);
  end if;

  return cd_build_state(championship.id, current_user_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Desistencia explicita do campeonato.
-- ---------------------------------------------------------------------
create or replace function cd_abandon_championship(p_championship_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target uuid := coalesce(p_championship_id, cd_current_championship_id());
  participant championship_participants%rowtype;
begin
  if current_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select * into participant
  from championship_participants
  where championship_id = target and user_id = current_user_id;

  if not found then
    raise exception 'NOT_REGISTERED' using errcode = 'P0001';
  end if;

  update participant_rounds
  set status = 'EXPIRED',
      finished_at = coalesce(finished_at, now())
  where championship_participant_id = participant.id
    and status in ('NOT_STARTED', 'IN_PROGRESS');

  perform cd_recalculate_participant_totals(participant.id);

  update championship_participants
  set status = 'ABANDONED',
      finished_at = coalesce(finished_at, now())
  where id = participant.id;

  perform cd_try_auto_finish(target);

  return cd_build_state(target, current_user_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Classificacao.
-- Durante o evento a lista e parcial: sem pontuacao e sem detalhes.
-- Depois do encerramento vira a classificacao oficial completa.
-- ---------------------------------------------------------------------
create or replace function cd_leaderboard(p_championship_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(p_championship_id, cd_current_championship_id());
  championship championships%rowtype;
  is_final boolean;
  entries jsonb;
begin
  if target is null then
    return jsonb_build_object('championshipId', null, 'isFinal', false, 'entries', '[]'::jsonb);
  end if;

  championship := cd_refresh_championship_status(target);
  is_final := championship.status in ('FINISHED', 'CALCULATING_RESULTS');

  if is_final then
    select coalesce(jsonb_agg(entry order by entry_position), '[]'::jsonb) into entries
    from (
      select
        coalesce(
          final_position,
          row_number() over (
            order by total_score desc, words_solved desc, completed_rounds desc,
                     total_attempts asc, total_duration_ms asc,
                     coalesce(finished_at, 'infinity'::timestamptz) asc, id asc
          )
        ) as entry_position,
        jsonb_build_object(
          'participantId', id,
          'userId', user_id,
          'position', coalesce(
            final_position,
            row_number() over (
              order by total_score desc, words_solved desc, completed_rounds desc,
                       total_attempts asc, total_duration_ms asc,
                       coalesce(finished_at, 'infinity'::timestamptz) asc, id asc
            )
          ),
          'displayName', display_name_snapshot,
          'totalScore', total_score,
          'wordsSolved', words_solved,
          'completedRounds', completed_rounds,
          'totalAttempts', total_attempts,
          'totalDurationMs', total_duration_ms,
          'status', status
        ) as entry
      from championship_participants
      where championship_id = target and status <> 'CANCELLED'
    ) as ranked;
  else
    -- Parcial: nada que ajude outro participante a jogar melhor.
    select coalesce(jsonb_agg(entry order by entry_position), '[]'::jsonb) into entries
    from (
      select
        row_number() over (order by registered_at asc, id asc) as entry_position,
        jsonb_build_object(
          'participantId', id,
          'userId', user_id,
          'position', null,
          'displayName', display_name_snapshot,
          'totalScore', null,
          'wordsSolved', null,
          'completedRounds', completed_rounds,
          'totalAttempts', null,
          'totalDurationMs', null,
          'status', status
        ) as entry
      from championship_participants
      where championship_id = target and status <> 'CANCELLED'
    ) as partial;
  end if;

  return jsonb_build_object(
    'championshipId', target,
    'championshipName', championship.name,
    'championshipDate', championship.championship_date,
    'status', championship.status,
    'isFinal', championship.status = 'FINISHED',
    'entries', entries
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Resultado detalhado do campeonato encerrado (inclui as respostas).
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
        'rounds', (
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
-- Historico de campeonatos encerrados.
-- ---------------------------------------------------------------------
create or replace function cd_championship_history(
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  safe_offset integer := greatest(coalesce(p_offset, 0), 0);
  current_user_id uuid := auth.uid();
begin
  return coalesce((
    select jsonb_agg(item order by championship_date desc)
    from (
      select
        championships.championship_date,
        jsonb_build_object(
          'championshipId', championships.id,
          'name', championships.name,
          'championshipDate', championships.championship_date,
          'startsAt', championships.starts_at,
          'finishedAt', championships.finished_at,
          'durationMs', case
            when championships.finished_at is null then null
            else (extract(epoch from (championships.finished_at - championships.starts_at)) * 1000)::bigint
          end,
          'participantCount', (
            select count(*) from championship_participants as counted
            where counted.championship_id = championships.id and counted.status <> 'CANCELLED'
          ),
          'podium', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'position', podium.final_position,
              'displayName', podium.display_name_snapshot,
              'totalScore', podium.total_score,
              'wordsSolved', podium.words_solved
            ) order by podium.final_position), '[]'::jsonb)
            from championship_participants as podium
            where podium.championship_id = championships.id
              and podium.final_position between 1 and 3
          ),
          'answers', (
            select coalesce(jsonb_agg(answers.answer order by rounds.round_order, answers.board_index), '[]'::jsonb)
            from championship_answers as answers
            join championship_rounds as rounds on rounds.id = answers.championship_round_id
            where answers.championship_id = championships.id
          ),
          'myResult', (
            select jsonb_build_object(
              'position', mine.final_position,
              'totalScore', mine.total_score,
              'wordsSolved', mine.words_solved,
              'completedRounds', mine.completed_rounds
            )
            from championship_participants as mine
            where mine.championship_id = championships.id
              and mine.user_id = current_user_id
          )
        ) as item
      from championships
      where championships.status = 'FINISHED'
      order by championships.championship_date desc
      limit safe_limit offset safe_offset
    ) as history
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------
-- Estatisticas acumuladas do participante autenticado.
-- ---------------------------------------------------------------------
create or replace function cd_my_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  stats record;
begin
  if current_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select
    count(*) as championships_played,
    count(*) filter (where final_position = 1) as wins,
    count(*) filter (where final_position between 1 and 3) as podiums,
    coalesce(max(total_score), 0) as best_score,
    coalesce(round(avg(total_score))::integer, 0) as average_score,
    coalesce(round(avg(final_position), 2), 0) as average_position,
    coalesce(sum(words_solved), 0) as total_words_solved,
    min(total_duration_ms) filter (where total_duration_ms > 0) as best_duration_ms
  into stats
  from championship_participants as participants
  join championships on championships.id = participants.championship_id
  where participants.user_id = current_user_id
    and championships.status = 'FINISHED';

  return jsonb_build_object(
    'championshipsPlayed', coalesce(stats.championships_played, 0),
    'wins', coalesce(stats.wins, 0),
    'podiums', coalesce(stats.podiums, 0),
    'bestScore', coalesce(stats.best_score, 0),
    'averageScore', coalesce(stats.average_score, 0),
    'averagePosition', coalesce(stats.average_position, 0),
    'totalWordsSolved', coalesce(stats.total_words_solved, 0),
    'bestDurationMs', stats.best_duration_ms
  );
end;
$$;
