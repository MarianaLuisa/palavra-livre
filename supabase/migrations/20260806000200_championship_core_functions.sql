-- =====================================================================
-- Palavra Livre - Campeonato Diario
-- Migration 02: funcoes puras de dominio.
--   normalizacao, avaliacao de letras, pontuacao e ordenacao.
-- Estas funcoes espelham exatamente src/utils/normalizeWord.ts,
-- src/utils/evaluateGuess.ts e src/championship/scoring.ts.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Normalizacao: minusculas, sem acentos, ç -> c.
-- ---------------------------------------------------------------------
create or replace function cd_normalize_word(word text)
returns text
language sql
immutable
strict
as $$
  select lower(
    translate(
      btrim(word),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝáàâãäéèêëíìîïóòôõöúùûüçñý',
      'AAAAAEEEEIIIIOOOOOUUUUCNYaaaaaeeeeiiiiooooouuuucny'
    )
  );
$$;

-- ---------------------------------------------------------------------
-- Avaliacao de uma tentativa contra uma resposta.
-- Retorna jsonb: [{ "letter": "c", "status": "correct" }, ...]
-- Trata letras repetidas com contagem de restantes, igual ao frontend.
-- A letra devolvida em posicoes corretas preserva a grafia oficial
-- (ex.: tentativa "cocar" contra "cocar" revela "c","o","ç","a","r").
-- ---------------------------------------------------------------------
create or replace function cd_evaluate_guess(guess text, answer text)
returns jsonb
language plpgsql
immutable
as $$
declare
  normalized_guess text := cd_normalize_word(guess);
  normalized_answer text := cd_normalize_word(answer);
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
    select jsonb_agg(
      jsonb_build_object('letter', letters[index], 'status', statuses[index])
      order by index
    )
    from generate_series(1, word_length) as index
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Pontuacao de uma modalidade.
--   base  = palavras resolvidas * points_per_word
--   bonus = (tentativas restantes * bonus) apenas se resolveu todas
-- ---------------------------------------------------------------------
create or replace function cd_calculate_round_score(
  words_solved integer,
  total_words integer,
  attempts_used integer,
  max_attempts integer
)
returns table (base_score integer, bonus_score integer, total_score integer)
language plpgsql
stable
as $$
declare
  config championship_config%rowtype;
  calculated_base integer;
  calculated_bonus integer := 0;
  remaining_attempts integer;
begin
  select * into config from championship_config where id;

  if words_solved < 0 or total_words < 0 or words_solved > total_words then
    raise exception 'INVALID_SCORE_INPUT' using errcode = 'P0001';
  end if;

  calculated_base := words_solved * config.points_per_word;

  if words_solved = total_words and total_words > 0 then
    remaining_attempts := greatest(max_attempts - attempts_used, 0);
    calculated_bonus := remaining_attempts * config.bonus_per_remaining_attempt;
  end if;

  base_score := calculated_base;
  bonus_score := calculated_bonus;
  total_score := calculated_base + calculated_bonus;
  return next;
end;
$$;

-- ---------------------------------------------------------------------
-- Validacao de tentativa contra a base aceita.
-- ---------------------------------------------------------------------
create or replace function cd_word_is_accepted(word text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from championship_valid_words
    where normalized_word = cd_normalize_word(word)
  );
$$;

-- ---------------------------------------------------------------------
-- Verificacao de permissao administrativa.
-- ---------------------------------------------------------------------
create or replace function cd_is_admin(target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user is not null
    and exists (select 1 from championship_admins where user_id = target_user);
$$;

-- ---------------------------------------------------------------------
-- Configuracao padrao das modalidades do campeonato.
-- ---------------------------------------------------------------------
create or replace function cd_round_blueprint()
returns table (
  mode championship_mode,
  round_order smallint,
  board_count smallint,
  max_attempts smallint
)
language sql
immutable
as $$
  select * from (values
    ('SIMPLE'::championship_mode,  1::smallint, 1::smallint,  6::smallint),
    ('DUET'::championship_mode,    2::smallint, 2::smallint,  7::smallint),
    ('QUARTET'::championship_mode, 3::smallint, 4::smallint,  9::smallint),
    ('SEXTET'::championship_mode,  4::smallint, 6::smallint, 12::smallint)
  ) as blueprint(mode, round_order, board_count, max_attempts);
$$;
