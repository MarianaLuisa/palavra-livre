-- =====================================================================
-- Diagnostico de cd_submit_attempt
--
-- Rode no SQL Editor do Supabase se o envio de tentativa voltar a falhar.
-- Cada bloco isola uma camada. O primeiro que der erro ou trouxer numero
-- estranho e a causa.
--
-- Nada aqui escreve: sao apenas consultas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Campeonato de hoje e estado das rodadas
-- ---------------------------------------------------------------------
select
  c.id,
  c.championship_date,
  c.status,
  c.starts_at,
  (select count(*) from championship_rounds r where r.championship_id = c.id) as rodadas,
  (select count(*) from championship_answers a where a.championship_id = c.id) as respostas
from championships c
where c.is_official and c.status <> 'CANCELLED'
order by c.championship_date desc
limit 3;

-- ---------------------------------------------------------------------
-- 2. Integridade das respostas sorteadas
--
-- Esta e a checagem mais importante. Toda linha precisa ter:
--   len_normalizada = 5  e  alinhado = true
-- Se alinhado vier false, a grafia oficial nao casa caractere a caractere
-- com a forma normalizada, e era isso que derrubava a rodada inteira
-- antes da migration 11.
-- ---------------------------------------------------------------------
select
  r.mode,
  a.board_index,
  a.answer,
  a.normalized_answer,
  char_length(a.answer) as len_grafia,
  char_length(a.normalized_answer) as len_normalizada,
  char_length(cd_normalize_word(a.answer)) as len_renormalizada,
  char_length(a.answer) = char_length(a.normalized_answer) as alinhado,
  cd_normalize_word(a.answer) = a.normalized_answer as normalizacao_bate
from championship_answers a
join championship_rounds r on r.id = a.championship_round_id
join championships c on c.id = a.championship_id
where c.championship_date = (now() at time zone 'America/Sao_Paulo')::date
order by r.round_order, a.board_index;

-- ---------------------------------------------------------------------
-- 3. A avaliacao funciona com as respostas reais de hoje?
--
-- Se algum board devolver erro, o problema esta em cd_evaluate_guess.
-- ---------------------------------------------------------------------
select
  r.mode,
  a.board_index,
  cd_evaluate_guess('termo', a.answer, a.normalized_answer) as avaliacao
from championship_answers a
join championship_rounds r on r.id = a.championship_round_id
join championships c on c.id = a.championship_id
where c.championship_date = (now() at time zone 'America/Sao_Paulo')::date
  and r.mode = 'SIMPLE'
order by a.board_index;

-- ---------------------------------------------------------------------
-- 4. A palavra digitada e aceita?
--
-- Troque 'termo' pela palavra que falhou.
-- ---------------------------------------------------------------------
select
  'termo' as palavra,
  cd_normalize_word('termo') as normalizada,
  cd_word_is_accepted('termo') as aceita,
  (select count(*) from championship_valid_words) as total_palavras_aceitas;

-- ---------------------------------------------------------------------
-- 5. Estado da sua participacao
--
-- Troque o UUID pelo seu user id (Authentication > Users).
-- ---------------------------------------------------------------------
select
  p.display_name_snapshot,
  p.status as status_participante,
  r.mode,
  pr.status as status_rodada,
  pr.attempts_used,
  pr.words_solved,
  (select count(*) from participant_attempts pa where pa.participant_round_id = pr.id) as tentativas_gravadas
from championship_participants p
join championships c on c.id = p.championship_id
left join participant_rounds pr on pr.championship_participant_id = p.id
left join championship_rounds r on r.id = pr.championship_round_id
where p.user_id = 'COLE-SEU-UUID-AQUI'
  and c.championship_date = (now() at time zone 'America/Sao_Paulo')::date
order by r.round_order;

-- ---------------------------------------------------------------------
-- 6. Calculo de pontuacao isolado
-- ---------------------------------------------------------------------
select * from cd_calculate_round_score(0, 1, 1, 6);
select * from cd_calculate_round_score(1, 1, 1, 6);

-- ---------------------------------------------------------------------
-- 7. Simulacao completa, sem gravar
--
-- Executa cd_submit_attempt dentro de uma transacao que e desfeita.
-- Precisa rodar com a SUA sessao para auth.uid() existir, entao use o app
-- ou um token. No SQL Editor, auth.uid() e nulo e a funcao devolve
-- NOT_AUTHENTICATED, o que ja confirma que ela ao menos executa.
-- ---------------------------------------------------------------------
begin;
  select cd_submit_attempt(
    (select r.id
     from championship_rounds r
     join championships c on c.id = r.championship_id
     where c.championship_date = (now() at time zone 'America/Sao_Paulo')::date
       and r.mode = 'SIMPLE'),
    'termo'
  );
rollback;
