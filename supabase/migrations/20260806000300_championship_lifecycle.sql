-- =====================================================================
-- Palavra Livre - Campeonato Diario
-- Migration 03: ciclo de vida do campeonato.
--   maquina de status baseada no relogio do servidor,
--   sorteio de palavras e consolidacao da classificacao.
-- Todas as funcoes aqui sao internas (nao expostas ao cliente).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Sorteio das palavras de um campeonato.
-- Regras:
--   - usa apenas championship_word_pool (espelho de answers.json);
--   - nao repete palavra dentro do mesmo campeonato;
--   - evita palavras usadas nos ultimos N dias, quando houver folga;
--   - roda no servidor e persiste o resultado.
-- ---------------------------------------------------------------------
create or replace function cd_draw_championship_words(target_championship uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  config championship_config%rowtype;
  required_words integer;
  available_words integer;
  cooldown_cutoff date;
  round_record record;
  board_position integer;
  drawn record;
  inserted_count integer := 0;
begin
  select * into config from championship_config where id;

  select coalesce(sum(board_count), 0) into required_words
  from championship_rounds
  where championship_id = target_championship;

  if required_words = 0 then
    raise exception 'CHAMPIONSHIP_WITHOUT_ROUNDS' using errcode = 'P0001';
  end if;

  select count(*) into available_words
  from championship_word_pool
  where is_enabled;

  if available_words < required_words then
    raise exception 'WORD_POOL_TOO_SMALL' using errcode = 'P0001';
  end if;

  delete from championship_answers where championship_id = target_championship;

  cooldown_cutoff := (current_date - config.recent_answer_cooldown_days);

  -- Palavras usadas recentemente ficam no fim da fila de sorteio,
  -- mas continuam disponiveis se a base nao for suficiente.
  drop table if exists cd_draw_pool;
  drop table if exists cd_draw_taken;

  create temporary table cd_draw_pool on commit drop as
  select
    pool.normalized_word,
    pool.display_word,
    case when recent.normalized_answer is null then 0 else 1 end as recently_used,
    random() as draw_order
  from championship_word_pool as pool
  left join lateral (
    select distinct answers.normalized_answer
    from championship_answers as answers
    join championships as past on past.id = answers.championship_id
    where answers.normalized_answer = pool.normalized_word
      and past.championship_date >= cooldown_cutoff
      and past.status <> 'CANCELLED'
    limit 1
  ) as recent on true
  where pool.is_enabled;

  create temporary table cd_draw_taken (normalized_word text primary key) on commit drop;

  for round_record in
    select id, board_count
    from championship_rounds
    where championship_id = target_championship
    order by round_order
  loop
    for board_position in 0 .. (round_record.board_count - 1) loop
      select candidate.normalized_word, candidate.display_word
        into drawn
      from cd_draw_pool as candidate
      where not exists (
        select 1 from cd_draw_taken as taken
        where taken.normalized_word = candidate.normalized_word
      )
      order by candidate.recently_used, candidate.draw_order
      limit 1;

      if not found then
        raise exception 'WORD_POOL_EXHAUSTED' using errcode = 'P0001';
      end if;

      insert into cd_draw_taken (normalized_word) values (drawn.normalized_word);

      insert into championship_answers (
        championship_id,
        championship_round_id,
        board_index,
        answer,
        normalized_answer
      ) values (
        target_championship,
        round_record.id,
        board_position,
        drawn.display_word,
        drawn.normalized_word
      );

      inserted_count := inserted_count + 1;
    end loop;
  end loop;

  return inserted_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Consolidacao da classificacao final.
-- Criterios, em ordem:
--   1. maior pontuacao total
--   2. maior numero de palavras descobertas
--   3. maior numero de modalidades concluidas
--   4. menor numero de tentativas usadas
--   5. menor tempo total
--   6. desempate tecnico: quem concluiu primeiro
--   7. desempate final determinista: id da participacao
-- ---------------------------------------------------------------------
create or replace function cd_consolidate_ranking(target_championship uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  with ranked as (
    select
      id,
      row_number() over (
        order by
          total_score desc,
          words_solved desc,
          completed_rounds desc,
          total_attempts asc,
          total_duration_ms asc,
          coalesce(finished_at, 'infinity'::timestamptz) asc,
          id asc
      ) as ranked_position
    from championship_participants
    where championship_id = target_championship
      and status <> 'CANCELLED'
  )
  update championship_participants as participants
  set final_position = ranked.ranked_position
  from ranked
  where participants.id = ranked.id
    and participants.final_position is distinct from ranked.ranked_position;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Encerramento do campeonato (idempotente).
-- ---------------------------------------------------------------------
create or replace function cd_finish_championship(target_championship uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  championship championships%rowtype;
begin
  select * into championship
  from championships
  where id = target_championship
  for update;

  if not found then
    raise exception 'CHAMPIONSHIP_NOT_FOUND' using errcode = 'P0001';
  end if;

  if championship.status in ('FINISHED', 'CANCELLED') then
    return;
  end if;

  update championships
  set status = 'CALCULATING_RESULTS'
  where id = target_championship;

  -- Participacoes abertas sao encerradas por abandono.
  update championship_participants
  set status = 'ABANDONED',
      finished_at = coalesce(finished_at, now())
  where championship_id = target_championship
    and status in ('REGISTERED', 'IN_PROGRESS');

  update participant_rounds as rounds
  set status = 'EXPIRED',
      finished_at = coalesce(rounds.finished_at, now())
  from championship_participants as participants
  where rounds.championship_participant_id = participants.id
    and participants.championship_id = target_championship
    and rounds.status in ('NOT_STARTED', 'IN_PROGRESS');

  update championship_rounds
  set status = 'CLOSED',
      ends_at = coalesce(ends_at, now())
  where championship_id = target_championship
    and status <> 'CLOSED';

  -- Consolida os totais antes de ordenar, incluindo rodadas interrompidas.
  perform cd_recalculate_participant_totals(participants.id)
  from championship_participants as participants
  where participants.championship_id = target_championship;

  perform cd_consolidate_ranking(target_championship);

  update championships
  set status = 'FINISHED',
      finished_at = coalesce(finished_at, now())
  where id = target_championship;
end;
$$;

-- ---------------------------------------------------------------------
-- Tenta encerrar quando todos ja terminaram ou quando estourou o tempo.
-- ---------------------------------------------------------------------
create or replace function cd_try_auto_finish(target_championship uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  config championship_config%rowtype;
  championship championships%rowtype;
  open_participants integer;
  registered_participants integer;
begin
  select * into config from championship_config where id;
  select * into championship from championships where id = target_championship;

  if not found or championship.status <> 'IN_PROGRESS' then
    return false;
  end if;

  if now() >= championship.starts_at
      + make_interval(mins => config.max_championship_duration_minutes) then
    perform cd_finish_championship(target_championship);
    return true;
  end if;

  select count(*) into registered_participants
  from championship_participants
  where championship_id = target_championship and status <> 'CANCELLED';

  select count(*) into open_participants
  from championship_participants
  where championship_id = target_championship
    and status in ('REGISTERED', 'IN_PROGRESS');

  if registered_participants > 0 and open_participants = 0 then
    perform cd_finish_championship(target_championship);
    return true;
  end if;

  return false;
end;
$$;

-- ---------------------------------------------------------------------
-- Maquina de status guiada pelo relogio do servidor.
-- Chamada no inicio de toda RPC de jogo, o que dispensa cron.
-- ---------------------------------------------------------------------
create or replace function cd_refresh_championship_status(target_championship uuid)
returns championships
language plpgsql
security definer
set search_path = public
as $$
declare
  championship championships%rowtype;
  next_status championship_status;
begin
  select * into championship from championships where id = target_championship;

  if not found then
    raise exception 'CHAMPIONSHIP_NOT_FOUND' using errcode = 'P0001';
  end if;

  if championship.status in ('FINISHED', 'CANCELLED', 'CALCULATING_RESULTS') then
    return championship;
  end if;

  next_status := championship.status;

  if now() >= championship.starts_at then
    next_status := 'IN_PROGRESS';
  elsif now() >= championship.registration_closes_at then
    next_status := 'WAITING';
  elsif now() >= championship.registration_opens_at then
    next_status := 'REGISTRATION_OPEN';
  else
    next_status := 'SCHEDULED';
  end if;

  if next_status <> championship.status then
    update championships
    set status = next_status,
        -- As rodadas ficam disponiveis quando o campeonato comeca;
        -- a ordem por participante e garantida em participant_rounds.
        updated_at = now()
    where id = target_championship
    returning * into championship;

    if next_status = 'IN_PROGRESS' then
      update championship_rounds
      set status = 'ACTIVE',
          starts_at = coalesce(starts_at, now())
      where championship_id = target_championship
        and status = 'PENDING';
    end if;
  end if;

  if next_status = 'IN_PROGRESS' and cd_try_auto_finish(target_championship) then
    select * into championship from championships where id = target_championship;
  end if;

  return championship;
end;
$$;

-- ---------------------------------------------------------------------
-- Recalculo dos totais de um participante a partir das rodadas.
-- Fonte unica de verdade: participant_rounds.
-- ---------------------------------------------------------------------
create or replace function cd_recalculate_participant_totals(target_participant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  totals record;
  total_round_count integer;
begin
  select
    coalesce(sum(total_score), 0) as total_score,
    coalesce(sum(words_solved), 0) as words_solved,
    coalesce(sum(attempts_used), 0) as total_attempts,
    coalesce(sum(duration_ms), 0) as total_duration_ms,
    coalesce(count(*) filter (where all_words_solved), 0) as completed_rounds,
    coalesce(count(*) filter (where status in ('COMPLETED', 'FAILED', 'EXPIRED')), 0) as closed_rounds,
    min(started_at) as first_started_at,
    max(finished_at) as last_finished_at
  into totals
  from participant_rounds
  where championship_participant_id = target_participant;

  select count(*) into total_round_count
  from championship_rounds as rounds
  join championship_participants as participants
    on participants.championship_id = rounds.championship_id
  where participants.id = target_participant;

  update championship_participants
  set total_score = totals.total_score,
      words_solved = totals.words_solved,
      total_attempts = totals.total_attempts,
      total_duration_ms = totals.total_duration_ms,
      completed_rounds = totals.completed_rounds,
      started_at = coalesce(started_at, totals.first_started_at),
      -- CANCELLED e ABANDONED sao terminais: o recalculo nunca os reverte.
      status = case
        when status in ('CANCELLED', 'ABANDONED') then status
        when totals.closed_rounds >= total_round_count and total_round_count > 0 then 'FINISHED'
        when totals.first_started_at is not null then 'IN_PROGRESS'
        else status
      end,
      finished_at = case
        when totals.closed_rounds >= total_round_count and total_round_count > 0
          then coalesce(finished_at, totals.last_finished_at, now())
        else finished_at
      end
  where id = target_participant;
end;
$$;
