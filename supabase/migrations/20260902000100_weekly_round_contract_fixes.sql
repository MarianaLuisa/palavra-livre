-- Keeps the weekly/daily contract consistent for installations that already
-- applied the September 1st migration.

create or replace function public.cd_round_blueprint()
returns table (mode championship_mode, round_order smallint, board_count smallint, max_attempts smallint)
language sql immutable as $$
  select * from (values
    ('SIMPLE'::championship_mode, 1::smallint, 1::smallint, 6::smallint),
    ('DUET'::championship_mode, 2::smallint, 2::smallint, 7::smallint),
    ('QUARTET'::championship_mode, 3::smallint, 4::smallint, 9::smallint),
    ('SEXTET'::championship_mode, 4::smallint, 6::smallint, 11::smallint)
  ) as blueprint(mode, round_order, board_count, max_attempts);
$$;

-- Do not change a Sexteto which has already received attempts; its historical
-- score must remain reproducible.  New and not-yet-played daily rounds use 11.
update championship_rounds rounds
set max_attempts = 11
where rounds.mode = 'SEXTET'
  and rounds.max_attempts <> 11
  and not exists (
    select 1 from participant_rounds participant_round
    where participant_round.championship_round_id = rounds.id
      and participant_round.attempts_used > 0
  );

create or replace function public.cd_start_round(p_round_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  current_user_id uuid := auth.uid();
  round_record championship_rounds%rowtype;
  championship championships%rowtype;
  participant championship_participants%rowtype;
  pending_previous integer;
begin
  if current_user_id is null then raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001'; end if;
  select * into round_record from championship_rounds where id = p_round_id;
  if not found then raise exception 'ROUND_NOT_FOUND' using errcode = 'P0001'; end if;
  championship := cd_refresh_championship_status(round_record.championship_id);
  if championship.status <> 'IN_PROGRESS' then raise exception 'CHAMPIONSHIP_NOT_IN_PROGRESS' using errcode = 'P0001'; end if;
  select * into participant from championship_participants
  where championship_id = championship.id and user_id = current_user_id for update;
  if not found or participant.status in ('CANCELLED', 'ABANDONED', 'FINISHED') then raise exception 'NOT_REGISTERED' using errcode = 'P0001'; end if;
  select count(*) into pending_previous
  from championship_rounds previous_round left join participant_rounds previous_participation
    on previous_participation.championship_round_id = previous_round.id
   and previous_participation.championship_participant_id = participant.id
  where previous_round.championship_id = championship.id
    and previous_round.round_order < round_record.round_order
    and coalesce(previous_participation.status::text, 'NOT_STARTED') not in ('COMPLETED', 'FAILED', 'EXPIRED');
  if pending_previous > 0 then raise exception 'PREVIOUS_ROUND_PENDING' using errcode = 'P0001'; end if;
  insert into participant_rounds (championship_participant_id, championship_round_id, status, started_at)
  values (participant.id, round_record.id, 'IN_PROGRESS', now())
  on conflict (championship_participant_id, championship_round_id) do update
  set status = case when participant_rounds.status = 'NOT_STARTED' then 'IN_PROGRESS'::participant_round_status else participant_rounds.status end,
      started_at = coalesce(participant_rounds.started_at, now());
  update championship_participants set started_at = coalesce(started_at, now()),
    status = case when status = 'REGISTERED' then 'IN_PROGRESS'::participation_status else status end where id = participant.id;
  return cd_build_state(championship.id, current_user_id);
end;
$$;

create or replace function public.cd_submit_attempt(p_round_id uuid, p_word text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  current_user_id uuid := auth.uid(); round_record championship_rounds%rowtype; championship championships%rowtype;
  participant championship_participants%rowtype; participant_round participant_rounds%rowtype;
  normalized_guess text := cd_normalize_word(p_word); next_attempt_number integer; answer_record record;
  already_solved boolean; evaluation jsonb := '[]'::jsonb; board_letters jsonb; board_solved boolean;
  solved_total integer := 0; round_finished boolean; score record; round_duration bigint;
begin
  if current_user_id is null then raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001'; end if;
  if char_length(normalized_guess) <> 5 then raise exception 'INVALID_WORD_LENGTH' using errcode = 'P0001'; end if;
  if not cd_word_is_accepted(normalized_guess) then raise exception 'WORD_NOT_ACCEPTED' using errcode = 'P0001'; end if;
  select * into round_record from championship_rounds where id = p_round_id;
  if not found then raise exception 'ROUND_NOT_FOUND' using errcode = 'P0001'; end if;
  championship := cd_refresh_championship_status(round_record.championship_id);
  if championship.status <> 'IN_PROGRESS' then raise exception 'CHAMPIONSHIP_NOT_IN_PROGRESS' using errcode = 'P0001'; end if;
  select * into participant from championship_participants where championship_id = championship.id and user_id = current_user_id;
  if not found or participant.status in ('CANCELLED', 'ABANDONED', 'FINISHED') then raise exception 'NOT_REGISTERED' using errcode = 'P0001'; end if;
  select * into participant_round from participant_rounds where championship_participant_id = participant.id and championship_round_id = round_record.id for update;
  if not found or participant_round.status <> 'IN_PROGRESS' then raise exception 'ROUND_NOT_STARTED' using errcode = 'P0001'; end if;
  if participant_round.attempts_used >= round_record.max_attempts then raise exception 'NO_ATTEMPTS_LEFT' using errcode = 'P0001'; end if;
  if exists (select 1 from participant_attempts where participant_round_id = participant_round.id and normalized_word = normalized_guess) then raise exception 'DUPLICATE_ATTEMPT' using errcode = 'P0001'; end if;
  next_attempt_number := participant_round.attempts_used + 1;
  for answer_record in select board_index, answer, normalized_answer from championship_answers where championship_round_id = round_record.id order by board_index loop
    select coalesce(bool_or((entry ->> 'solved')::boolean), false) into already_solved from participant_attempts attempts cross join lateral jsonb_array_elements(attempts.evaluation) entry where attempts.participant_round_id = participant_round.id and (entry ->> 'boardIndex')::integer = answer_record.board_index;
    if already_solved then solved_total := solved_total + 1; continue; end if;
    board_letters := cd_evaluate_guess(normalized_guess, answer_record.answer, answer_record.normalized_answer);
    board_solved := normalized_guess = answer_record.normalized_answer;
    if board_solved then solved_total := solved_total + 1; end if;
    evaluation := evaluation || jsonb_build_array(jsonb_build_object('boardIndex', answer_record.board_index, 'solved', board_solved, 'letters', board_letters));
  end loop;
  insert into participant_attempts (participant_round_id, attempt_number, word, normalized_word, evaluation) values (participant_round.id, next_attempt_number, btrim(p_word), normalized_guess, evaluation);
  round_finished := solved_total >= round_record.board_count or next_attempt_number >= round_record.max_attempts;
  select * into score from cd_calculate_round_score(solved_total, round_record.board_count, next_attempt_number, round_record.max_attempts);
  round_duration := greatest((extract(epoch from (now() - participant_round.started_at)) * 1000)::bigint, 0);
  update participant_rounds set attempts_used = next_attempt_number, words_solved = solved_total, all_words_solved = solved_total >= round_record.board_count,
    base_score = case when round_finished then score.base_score else 0 end, bonus_score = case when round_finished then score.bonus_score else 0 end,
    total_score = case when round_finished then score.total_score else 0 end, duration_ms = round_duration,
    status = case when not round_finished then 'IN_PROGRESS'::participant_round_status when solved_total >= round_record.board_count then 'COMPLETED'::participant_round_status else 'FAILED'::participant_round_status end,
    finished_at = case when round_finished then now() else null end where id = participant_round.id;
  if round_finished then perform cd_recalculate_participant_totals(participant.id); perform cd_try_auto_finish(championship.id); end if;
  return cd_build_state(championship.id, current_user_id);
end;
$$;

grant execute on function public.cd_start_round(uuid) to authenticated, anon;
grant execute on function public.cd_submit_attempt(uuid, text) to authenticated, anon;
