-- =====================================================================
-- Reparo de acentuacao (mojibake) na base de palavras
--
-- SINTOMA
--   "Respostas: parto, ronco, Ã³tico, Ã³bvia"
--
-- CAUSA
--   "Ã³" e o resultado dos bytes UTF-8 de "ó" (0xC3 0xB3) sendo lidos como
--   LATIN1. O arquivo supabase/seed/palavras.sql e UTF-8; a corrupcao
--   acontece no CARREGAMENTO, quando o cliente declara outro encoding.
--   O jogo continua funcionando porque a comparacao usa normalized_word,
--   que so tem ASCII. Quebra apenas a exibicao da grafia oficial.
--
-- ESTE SCRIPT E SEGURO
--   Converte de volta apenas as linhas em que a reconversao produz uma
--   palavra valida de 5 caracteres. Linhas ja corretas nao sao tocadas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Diagnostico: quantas linhas estao corrompidas?
-- ---------------------------------------------------------------------
select
  'championship_word_pool' as tabela,
  count(*) filter (where char_length(display_word) <> 5) as corrompidas,
  count(*) as total
from championship_word_pool
union all
select
  'championship_answers',
  count(*) filter (where char_length(answer) <> 5),
  count(*)
from championship_answers;

-- Amostra do que seria corrigido, sem alterar nada.
select
  display_word as atual,
  convert_from(convert_to(display_word, 'LATIN1'), 'UTF8') as reparado,
  normalized_word
from championship_word_pool
where char_length(display_word) <> 5
limit 20;

-- ---------------------------------------------------------------------
-- 2. Reparo
--
-- convert_to(x,'LATIN1') recupera os bytes UTF-8 originais;
-- convert_from(...,'UTF8') os decodifica corretamente.
--
-- O filtro garante que so gravamos quando o resultado faz sentido:
-- 5 caracteres e normalizacao batendo com a coluna normalizada.
-- ---------------------------------------------------------------------
begin;

update championship_word_pool
set display_word = convert_from(convert_to(display_word, 'LATIN1'), 'UTF8')
where char_length(display_word) <> 5
  and char_length(convert_from(convert_to(display_word, 'LATIN1'), 'UTF8')) = 5
  and cd_normalize_word(convert_from(convert_to(display_word, 'LATIN1'), 'UTF8'))
      = normalized_word;

update championship_answers
set answer = convert_from(convert_to(answer, 'LATIN1'), 'UTF8')
where char_length(answer) <> 5
  and char_length(convert_from(convert_to(answer, 'LATIN1'), 'UTF8')) = 5
  and cd_normalize_word(convert_from(convert_to(answer, 'LATIN1'), 'UTF8'))
      = normalized_answer;

commit;

-- ---------------------------------------------------------------------
-- 3. Verificacao: as duas contagens precisam voltar zeradas.
-- ---------------------------------------------------------------------
select
  'championship_word_pool' as tabela,
  count(*) filter (where char_length(display_word) <> 5) as ainda_corrompidas
from championship_word_pool
union all
select
  'championship_answers',
  count(*) filter (where char_length(answer) <> 5)
from championship_answers;

-- Conferencia final das respostas do campeonato de hoje.
select r.mode, a.board_index, a.answer, a.normalized_answer
from championship_answers a
join championship_rounds r on r.id = a.championship_round_id
join championships c on c.id = a.championship_id
where c.championship_date = (now() at time zone 'America/Sao_Paulo')::date
order by r.round_order, a.board_index;

-- =====================================================================
-- COMO EVITAR QUE VOLTE
--
-- Ao recarregar supabase/seed/palavras.sql, force UTF-8 no cliente:
--
--   PGCLIENTENCODING=UTF8 psql "$DATABASE_URL" -f supabase/seed/palavras.sql
--
-- ou, dentro do psql, antes do \i:
--
--   \encoding UTF8
--
-- Pelo SQL Editor do painel do Supabase o encoding ja e UTF-8; o problema
-- costuma aparecer ao colar o conteudo por outro cliente ou terminal
-- Windows com code page 1252.
-- =====================================================================
