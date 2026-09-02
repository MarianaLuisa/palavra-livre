-- Dedicated, player-scoped board reconstruction. This is deliberately based
-- on the append-only attempt log, so a stale cd_build_state implementation
-- cannot make evaluated tiles disappear from an active game.
create or replace function public.cd_my_round_boards(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_round_record championship_rounds%rowtype;
  v_participant_round_id uuid;
  v_participant_round participant_rounds%rowtype;
  v_reveal_answers boolean := false;
  v_championship championships%rowtype;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select * into v_round_record from championship_rounds where id = p_round_id;
  if not found then
    raise exception 'ROUND_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_championship from championships where id = v_round_record.championship_id;

  select rounds.id, rounds.* into v_participant_round_id, v_participant_round
  from participant_rounds rounds
  join championship_participants participants on participants.id = rounds.championship_participant_id
  where rounds.championship_round_id = p_round_id
    and participants.user_id = v_user_id
  order by rounds.created_at desc
  limit 1;

  v_reveal_answers :=
    coalesce(v_championship.status in ('FINISHED', 'CANCELLED'), false)
    or coalesce(v_participant_round.status in ('COMPLETED', 'FAILED', 'EXPIRED'), false);

  return jsonb_build_object(
    'roundId', p_round_id,
    'boards', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'boardIndex', gen.board_position,
          'solved', coalesce(solved_state.solved, false),
          'answer', case
            when v_reveal_answers or coalesce(solved_state.solved, false) then (
              select answers.answer
              from championship_answers answers
              where answers.championship_round_id = p_round_id
                and answers.board_index = gen.board_position
              limit 1
            )
            else null
          end,
          'rows', coalesce(row_data.rows, '[]'::jsonb)
        )
        order by gen.board_position
      ), '[]'::jsonb)
      from generate_series(0, v_round_record.board_count - 1) as gen(board_position)
      left join lateral (
        select bool_or((board_entry ->> 'solved')::boolean) as solved
        from participant_attempts attempts
        cross join lateral jsonb_array_elements(attempts.evaluation) board_entry
        where v_participant_round_id is not null
          and attempts.participant_round_id = v_participant_round_id
          and (board_entry ->> 'boardIndex')::integer = gen.board_position
      ) solved_state on true
      left join lateral (
        select jsonb_agg(board_entry -> 'letters' order by attempts.attempt_number) as rows
        from participant_attempts attempts
        cross join lateral jsonb_array_elements(attempts.evaluation) board_entry
        where v_participant_round_id is not null
          and attempts.participant_round_id = v_participant_round_id
          and (board_entry ->> 'boardIndex')::integer = gen.board_position
      ) row_data on true
    )
  );
end;
$$;

grant execute on function public.cd_my_round_boards(uuid) to authenticated, anon;
