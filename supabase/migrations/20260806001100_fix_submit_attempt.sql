-- =====================================================================
-- Palavra Livre - Campeonato Diario
-- Migration 11: correcao e diagnostico de cd_submit_attempt.
--
-- ADITIVA. Substitui apenas duas funcoes, sem tocar em tabelas, dados,
-- politicas ou nas regras do campeonato.
--
-- ---------------------------------------------------------------------
-- PROBLEMA 1 - normalizacao redundante e fragil
-- ---------------------------------------------------------------------
-- cd_submit_attempt chamava cd_evaluate_guess passando a GRAFIA OFICIAL
-- (championship_answers.answer) e a funcao RE-DERIVAVA a forma normalizada
-- e o comprimento a partir dela, ignorando championship_answers
-- .normalized_answer, que ja e a fonte da verdade e tem constraint de
-- 5 caracteres.
--
-- Consequencia: bastava a grafia oficial nao casar caractere a caractere
-- com a forma normalizada para TODA tentativa da rodada falhar com
-- GUESS_LENGTH_MISMATCH. Isso acontece com:
--   - texto em forma decomposta NFD ("o" + acento combinante conta 2);
--   - qualquer caractere fora do mapa de translate de cd_normalize_word;
--   - espaco interno ou caractere invisivel na palavra.
--
-- A base semeada por scripts/gerar-seed-palavras.mjs esta limpa hoje, mas
-- qualquer palavra inserida a mao ou vinda de outra fonte reintroduz o
-- problema. Passar normalized_answer elimina a classe inteira.
--
-- ---------------------------------------------------------------------
-- PROBLEMA 2 - erro opaco
-- ---------------------------------------------------------------------
-- Qualquer falha inesperada dentro da funcao chegava ao jogador como um
-- 400 sem codigo reconhecivel, exibido como "algo deu errado". Agora
-- erros de regra (P0001) passam intactos e qualquer outra falha vira
-- ATTEMPT_FAILED carregando o SQLSTATE e a mensagem original.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Avaliacao com a forma normalizada informada explicitamente.
--
-- A versao de dois argumentos continua existindo e nao foi alterada:
-- ela normaliza a resposta sozinha e serve a chamadas antigas.
-- ---------------------------------------------------------------------
create or replace function cd_evaluate_guess(
  guess text,
  answer text,
  answer_normalized text
)
returns jsonb
language plpgsql
immutable
as $$
declare
  normalized_guess text := cd_normalize_word(guess);
  -- Fonte da verdade: a forma normalizada gravada no banco.
  normalized_answer text := coalesce(
    nullif(btrim(answer_normalized), ''),
    cd_normalize_word(answer)
  );
  display_answer text := lower(btrim(answer));
  word_length integer := char_length(normalized_answer);
  statuses text[];
  letters text[];
  remaining jsonb := '{}'::jsonb;
  position_index integer;
  current_letter text;
  remaining_count integer;
begin
  if char_length(normalized_guess) <> word_length then
    raise exception 'GUESS_LENGTH_MISMATCH' using errcode = 'P0001';
  end if;

  -- A grafia oficial so e usada para revelar letras quando alinha
  -- caractere a caractere com a forma normalizada. Se nao alinhar, o jogo
  -- segue com a forma normalizada em vez de quebrar a rodada inteira.
  if char_length(display_answer) <> word_length then
    display_answer := normalized_answer;
  end if;

  statuses := array_fill('absent'::text, array[word_length]);
  letters := array_fill(''::text, array[word_length]);

  -- Primeira passagem: posicoes corretas.
  for position_index in 1 .. word_length loop
    if substr(normalized_guess, position_index, 1) = substr(normalized_answer, position_index, 1) then
      statuses[position_index] := 'correct';
      letters[position_index] := coalesce(
        nullif(substr(display_answer, position_index, 1), ''),
        substr(normalized_guess, position_index, 1)
      );
    else
      current_letter := substr(normalized_answer, position_index, 1);
      remaining := jsonb_set(
        remaining,
        array[current_letter],
        to_jsonb(coalesce((remaining ->> current_letter)::integer, 0) + 1),
        true
      );
    end if;
  end loop;

  -- Segunda passagem: presentes fora de posicao, respeitando o saldo.
  for position_index in 1 .. word_length loop
    if statuses[position_index] = 'correct' then
      continue;
    end if;

    current_letter := substr(normalized_guess, position_index, 1);
    letters[position_index] := current_letter;
    remaining_count := coalesce((remaining ->> current_letter)::integer, 0);

    if remaining_count > 0 then
      statuses[position_index] := 'present';
      remaining := jsonb_set(
        remaining,
        array[current_letter],
        to_jsonb(remaining_count - 1),
        true
      );
    end if;
  end loop;

  return (
    -- Alias 'idx': 'position' e col_name_keyword no Postgres e da dor
    -- de cabeca como nome de coluna.
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'letter', letters[serie.idx],
          'status', statuses[serie.idx]
        )
        order by serie.idx
      ),
      '[]'::jsonb
    )
    from generate_series(1, word_length) as serie(idx)
  );
end;
$$;

-- =====================================================================
-- cd_submit_attempt
-- =====================================================================
-- Mesmas regras de antes, com duas mudancas:
--   1. usa answer_record.normalized_answer na comparacao e na avaliacao;
--   2. traduz falhas inesperadas em ATTEMPT_FAILED com a causa real.
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

    -- Passa a forma normalizada gravada: nao re-deriva nada da grafia.
    board_letters := cd_evaluate_guess(
      normalized_guess,
      answer_record.answer,
      answer_record.normalized_answer
    );
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
      status = (case
        when not round_finished then 'IN_PROGRESS'
        when solved_total >= round_record.board_count then 'COMPLETED'
        else 'FAILED'
      end)::participant_round_status,
      finished_at = case when round_finished then now() else null end
  where id = participant_round.id;

  if round_finished then
    perform cd_recalculate_participant_totals(participant.id);
    perform cd_try_auto_finish(championship.id);
  end if;

  return cd_build_state(championship.id, current_user_id);

exception
  -- Erros de regra ja tem codigo proprio e chegam traduzidos na interface.
  when sqlstate 'P0001' then
    raise;
  -- Qualquer outra falha deixa de ser um 400 sem explicacao: o SQLSTATE e
  -- a mensagem original viajam ate o jogador e ate o console.
  when others then
    raise exception 'ATTEMPT_FAILED [%] %', sqlstate, sqlerrm using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------
-- Permissoes: identicas as anteriores.
-- ---------------------------------------------------------------------
revoke all on function cd_evaluate_guess(text, text, text) from public, anon, authenticated;
revoke all on function cd_submit_attempt(uuid, text) from public, anon;
grant execute on function cd_submit_attempt(uuid, text) to authenticated;
