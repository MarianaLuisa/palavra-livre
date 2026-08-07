-- =====================================================================
-- Palavra Livre - Campeonato Diario
-- Migration 07: controles administrativos do painel /campeonato/admin.
--
-- Objetivo: permitir operar o campeonato inteiro pelo painel, sem SQL Editor.
--
-- Nada aqui altera migrations anteriores. Todas as funcoes novas usam
-- SECURITY DEFINER + search_path fixo + cd_require_admin().
--
-- PONTO CENTRAL DE DESIGN
-- cd_refresh_championship_status() deriva o status a partir de now() e dos
-- horarios do campeonato. Ou seja, gravar apenas status = 'IN_PROGRESS'
-- seria desfeito na proxima leitura. Por isso toda acao de controle aqui
-- ajusta os HORARIOS, e o status vira consequencia. E o que torna
-- "Comecar agora" realmente persistente.
--
-- Invariante da tabela (championships_window_check):
--   registration_opens_at < registration_closes_at <= starts_at
-- Todas as funcoes abaixo escrevem os tres campos numa unica instrucao
-- para nunca passar por um estado intermediario invalido.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Campeonato oficial de HOJE, no fuso do campeonato.
-- Diferente de cd_current_championship_id(), que pode devolver o proximo
-- agendado ou o ultimo encerrado.
-- ---------------------------------------------------------------------
create or replace function cd_today_championship_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  config championship_config%rowtype;
  found_id uuid;
begin
  select * into config from championship_config where id;

  select id into found_id
  from championships
  where is_official
    and status <> 'CANCELLED'
    and championship_date = (now() at time zone config.default_timezone)::date
  order by starts_at desc
  limit 1;

  return found_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Trava o campeonato para escrita e valida que a acao e possivel.
-- Uso interno: garante que dois cliques simultaneos serializem aqui.
-- ---------------------------------------------------------------------
create or replace function cd_admin_lock_championship(p_championship_id uuid)
returns championships
language plpgsql
security definer
set search_path = public
as $$
declare
  championship championships%rowtype;
begin
  if p_championship_id is null then
    raise exception 'CHAMPIONSHIP_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into championship
  from championships
  where id = p_championship_id
  for update;

  if not found then
    raise exception 'CHAMPIONSHIP_NOT_FOUND' using errcode = 'P0001';
  end if;

  return championship;
end;
$$;

-- =====================================================================
-- COMECAR AGORA
-- =====================================================================
-- Antecipa o inicio do campeonato para o instante atual do BANCO.
--
-- Preserva integralmente:
--   - championship_answers (as 13 palavras ja sorteadas)
--   - championship_rounds (nao recria, apenas ativa as pendentes)
--   - championship_participants e suas inscricoes
--   - participant_rounds e participant_attempts
--
-- Idempotente: chamar duas vezes nao muda nada na segunda vez.
-- Concorrente: o FOR UPDATE em cd_admin_lock_championship serializa.
-- ---------------------------------------------------------------------
create or replace function cd_admin_start_championship_now(p_championship_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  championship championships%rowtype;
  moment timestamptz;
  answer_count integer;
  participant_count integer;
begin
  perform cd_require_admin();

  championship := cd_admin_lock_championship(p_championship_id);

  if championship.status = 'CANCELLED' then
    raise exception 'CHAMPIONSHIP_CANCELLED' using errcode = 'P0001';
  end if;

  if championship.status in ('FINISHED', 'CALCULATING_RESULTS') then
    raise exception 'CHAMPIONSHIP_ALREADY_FINISHED' using errcode = 'P0001';
  end if;

  -- Ja esta em andamento: nada a fazer, resposta identica a primeira chamada.
  if championship.status = 'IN_PROGRESS' then
    return jsonb_build_object(
      'championshipId', championship.id,
      'status', championship.status,
      'startsAt', championship.starts_at,
      'registrationClosesAt', championship.registration_closes_at,
      'alreadyStarted', true
    );
  end if;

  -- Sem palavras sorteadas o campeonato nao pode comecar.
  select count(*) into answer_count
  from championship_answers
  where championship_id = championship.id;

  if answer_count = 0 then
    raise exception 'CHAMPIONSHIP_WITHOUT_ANSWERS' using errcode = 'P0001';
  end if;

  moment := now();

  -- Uma unica instrucao: o CHECK da tabela nunca ve estado intermediario.
  --   opens  : recuado apenas se necessario para manter opens < closes
  --   closes : encerra as inscricoes imediatamente
  --   starts : agora
  update championships
  set registration_opens_at = least(registration_opens_at, moment - interval '1 minute'),
      registration_closes_at = least(registration_closes_at, moment),
      starts_at = moment,
      status = 'IN_PROGRESS'
  where id = championship.id
  returning * into championship;

  -- Libera as rodadas ja existentes. Nao cria rodada nova.
  update championship_rounds
  set status = 'ACTIVE',
      starts_at = coalesce(starts_at, moment)
  where championship_id = championship.id
    and status = 'PENDING';

  select count(*) into participant_count
  from championship_participants
  where championship_id = championship.id and status <> 'CANCELLED';

  return jsonb_build_object(
    'championshipId', championship.id,
    'status', championship.status,
    'startsAt', championship.starts_at,
    'registrationClosesAt', championship.registration_closes_at,
    'alreadyStarted', false,
    'participantCount', participant_count,
    'answerCount', answer_count
  );
end;
$$;

-- =====================================================================
-- EDICAO DE HORARIOS
-- =====================================================================
-- Recebe instantes absolutos (timestamptz). A conversao do horario local
-- de America/Sao_Paulo para UTC e feita no frontend, que envia ISO 8601.
--
-- Nao toca em respostas, rodadas, participantes, tentativas ou pontuacao.
-- ---------------------------------------------------------------------
create or replace function cd_admin_update_championship_schedule(
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
  championship championships%rowtype;
  next_opens timestamptz;
  next_closes timestamptz;
  next_starts timestamptz;
  refreshed_status championship_status;
begin
  perform cd_require_admin();

  championship := cd_admin_lock_championship(p_championship_id);

  if championship.status not in ('SCHEDULED', 'REGISTRATION_OPEN', 'WAITING') then
    raise exception 'SCHEDULE_UPDATE_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  next_opens := coalesce(p_registration_opens_at, championship.registration_opens_at);
  next_closes := coalesce(p_registration_closes_at, championship.registration_closes_at);
  next_starts := coalesce(p_starts_at, championship.starts_at);

  if next_opens >= next_closes then
    raise exception 'INVALID_SCHEDULE_ORDER' using errcode = 'P0001';
  end if;

  if next_closes > next_starts then
    raise exception 'INVALID_SCHEDULE_ORDER' using errcode = 'P0001';
  end if;

  update championships
  set registration_opens_at = next_opens,
      registration_closes_at = next_closes,
      starts_at = next_starts
  where id = championship.id
  returning * into championship;

  refreshed_status := (cd_refresh_championship_status(championship.id)).status;

  return jsonb_build_object(
    'championshipId', championship.id,
    'registrationOpensAt', championship.registration_opens_at,
    'registrationClosesAt', championship.registration_closes_at,
    'startsAt', championship.starts_at,
    'status', refreshed_status
  );
end;
$$;

-- =====================================================================
-- ACOES RAPIDAS (atalhos de teste)
-- =====================================================================
-- Todas mexem apenas nos horarios; o status e derivado depois.
-- ---------------------------------------------------------------------

-- Abre as inscricoes imediatamente.
create or replace function cd_admin_open_registration_now(p_championship_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  championship championships%rowtype;
  moment timestamptz;
  refreshed_status championship_status;
begin
  perform cd_require_admin();
  championship := cd_admin_lock_championship(p_championship_id);

  if championship.status not in ('SCHEDULED', 'REGISTRATION_OPEN', 'WAITING') then
    raise exception 'SCHEDULE_UPDATE_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  moment := now();

  update championships
  set registration_opens_at = moment,
      -- Garante que ainda sobra janela de inscricao.
      registration_closes_at = greatest(registration_closes_at, moment + interval '1 minute'),
      starts_at = greatest(starts_at, greatest(registration_closes_at, moment + interval '1 minute'))
  where id = championship.id
  returning * into championship;

  refreshed_status := (cd_refresh_championship_status(championship.id)).status;

  return jsonb_build_object(
    'championshipId', championship.id,
    'registrationOpensAt', championship.registration_opens_at,
    'registrationClosesAt', championship.registration_closes_at,
    'startsAt', championship.starts_at,
    'status', refreshed_status
  );
end;
$$;

-- Fecha as inscricoes imediatamente, sem iniciar o campeonato.
create or replace function cd_admin_close_registration_now(p_championship_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  championship championships%rowtype;
  moment timestamptz;
  refreshed_status championship_status;
begin
  perform cd_require_admin();
  championship := cd_admin_lock_championship(p_championship_id);

  if championship.status not in ('SCHEDULED', 'REGISTRATION_OPEN', 'WAITING') then
    raise exception 'SCHEDULE_UPDATE_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  moment := now();

  update championships
  set registration_opens_at = least(registration_opens_at, moment - interval '1 minute'),
      registration_closes_at = moment,
      -- O inicio programado e mantido; se ja passou, fica no mesmo instante.
      starts_at = greatest(starts_at, moment)
  where id = championship.id
  returning * into championship;

  refreshed_status := (cd_refresh_championship_status(championship.id)).status;

  return jsonb_build_object(
    'championshipId', championship.id,
    'registrationOpensAt', championship.registration_opens_at,
    'registrationClosesAt', championship.registration_closes_at,
    'startsAt', championship.starts_at,
    'status', refreshed_status
  );
end;
$$;

-- Programa o inicio para daqui a N minutos, mantendo inscricoes abertas.
create or replace function cd_admin_schedule_start_in(
  p_championship_id uuid,
  p_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  championship championships%rowtype;
  moment timestamptz;
  target_start timestamptz;
  refreshed_status championship_status;
begin
  perform cd_require_admin();

  if p_minutes is null or p_minutes < 1 or p_minutes > 1440 then
    raise exception 'INVALID_SCHEDULE_ORDER' using errcode = 'P0001';
  end if;

  championship := cd_admin_lock_championship(p_championship_id);

  if championship.status not in ('SCHEDULED', 'REGISTRATION_OPEN', 'WAITING') then
    raise exception 'SCHEDULE_UPDATE_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  moment := now();
  target_start := moment + make_interval(mins => p_minutes);

  update championships
  set registration_opens_at = least(registration_opens_at, moment - interval '1 minute'),
      -- Inscricoes ficam abertas ate o inicio.
      registration_closes_at = target_start,
      starts_at = target_start
  where id = championship.id
  returning * into championship;

  refreshed_status := (cd_refresh_championship_status(championship.id)).status;

  return jsonb_build_object(
    'championshipId', championship.id,
    'registrationOpensAt', championship.registration_opens_at,
    'registrationClosesAt', championship.registration_closes_at,
    'startsAt', championship.starts_at,
    'status', refreshed_status
  );
end;
$$;

-- =====================================================================
-- CANCELAR
-- =====================================================================
-- Nao apaga nada: apenas muda o estado. Historico e auditoria preservados.
-- Idempotente.
-- ---------------------------------------------------------------------
create or replace function cd_admin_cancel_championship(p_championship_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  championship championships%rowtype;
begin
  perform cd_require_admin();
  championship := cd_admin_lock_championship(p_championship_id);

  if championship.status = 'CANCELLED' then
    return jsonb_build_object(
      'championshipId', championship.id,
      'status', championship.status,
      'alreadyCancelled', true
    );
  end if;

  if championship.status = 'FINISHED' then
    raise exception 'CHAMPIONSHIP_ALREADY_FINISHED' using errcode = 'P0001';
  end if;

  update championships
  set status = 'CANCELLED',
      finished_at = coalesce(finished_at, now())
  where id = championship.id
  returning * into championship;

  update championship_rounds
  set status = 'CLOSED',
      ends_at = coalesce(ends_at, now())
  where championship_id = championship.id
    and status <> 'CLOSED';

  return jsonb_build_object(
    'championshipId', championship.id,
    'status', championship.status,
    'alreadyCancelled', false
  );
end;
$$;

-- =====================================================================
-- FINALIZAR MANUALMENTE (excecao)
-- =====================================================================
-- O caminho normal continua sendo o encerramento automatico em
-- cd_try_auto_finish. Este e o botao de emergencia.
-- ---------------------------------------------------------------------
create or replace function cd_admin_finish_championship(p_championship_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  championship championships%rowtype;
begin
  perform cd_require_admin();
  championship := cd_admin_lock_championship(p_championship_id);

  if championship.status = 'CANCELLED' then
    raise exception 'CHAMPIONSHIP_CANCELLED' using errcode = 'P0001';
  end if;

  if championship.status = 'FINISHED' then
    return jsonb_build_object(
      'championshipId', championship.id,
      'status', championship.status,
      'alreadyFinished', true
    );
  end if;

  perform cd_finish_championship(championship.id);
  select * into championship from championships where id = p_championship_id;

  return jsonb_build_object(
    'championshipId', championship.id,
    'status', championship.status,
    'finishedAt', championship.finished_at,
    'alreadyFinished', false
  );
end;
$$;

-- =====================================================================
-- RESPOSTAS (somente apos o encerramento)
-- =====================================================================
-- RPC dedicada: as respostas NUNCA viajam junto com cd_admin_overview.
-- Mesmo para administradores, so saem depois de FINISHED.
-- ---------------------------------------------------------------------
create or replace function cd_admin_championship_answers(p_championship_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  championship championships%rowtype;
begin
  perform cd_require_admin();

  select * into championship from championships where id = p_championship_id;

  if not found then
    raise exception 'CHAMPIONSHIP_NOT_FOUND' using errcode = 'P0001';
  end if;

  if championship.status <> 'FINISHED' then
    raise exception 'ANSWERS_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'roundId', rounds.id,
        'mode', rounds.mode,
        'roundOrder', rounds.round_order,
        'answers', (
          select coalesce(jsonb_agg(answers.answer order by answers.board_index), '[]'::jsonb)
          from championship_answers as answers
          where answers.championship_round_id = rounds.id
        )
      ) order by rounds.round_order
    )
    from championship_rounds as rounds
    where rounds.championship_id = championship.id
  ), '[]'::jsonb);
end;
$$;

-- =====================================================================
-- VISAO GERAL DO PAINEL
-- =====================================================================
-- Substitui o payload anterior de cd_admin_overview por um mais completo,
-- em camelCase, com contadores e progresso por rodada.
--
-- IMPORTANTE: nao devolve mais nenhuma resposta secreta em hipotese alguma.
-- Para isso existe cd_admin_championship_answers.
-- ---------------------------------------------------------------------
create or replace function cd_admin_overview(p_championship_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  config championship_config%rowtype;
  today_id uuid;
  target uuid;
  championship championships%rowtype;
  today_date date;
begin
  perform cd_require_admin();

  select * into config from championship_config where id;
  today_date := (now() at time zone config.default_timezone)::date;
  today_id := cd_today_championship_id();
  target := coalesce(p_championship_id, today_id, cd_current_championship_id());

  if target is null then
    return jsonb_build_object(
      'serverNow', now(),
      'today', today_date,
      'timezone', config.default_timezone,
      'hasChampionshipToday', false,
      'isToday', false,
      'championship', null,
      'counters', jsonb_build_object(
        'registered', 0, 'started', 0, 'playing', 0, 'finished', 0, 'abandoned', 0
      ),
      'rounds', '[]'::jsonb,
      'participants', '[]'::jsonb,
      'wordPoolSize', (select count(*) from championship_word_pool where is_enabled),
      'validWordCount', (select count(*) from championship_valid_words)
    );
  end if;

  championship := cd_refresh_championship_status(target);

  return jsonb_build_object(
    'serverNow', now(),
    'today', today_date,
    'timezone', config.default_timezone,
    'hasChampionshipToday', today_id is not null,
    'isToday', championship.championship_date = today_date,

    'championship', jsonb_build_object(
      'id', championship.id,
      'name', championship.name,
      'championshipDate', championship.championship_date,
      'timezone', championship.timezone,
      'status', championship.status,
      'isOfficial', championship.is_official,
      'registrationOpensAt', championship.registration_opens_at,
      'registrationClosesAt', championship.registration_closes_at,
      'startsAt', championship.starts_at,
      'finishedAt', championship.finished_at,
      'createdAt', championship.created_at,
      -- Horario real em que a primeira rodada foi ativada.
      'actualStartedAt', (
        select min(rounds.starts_at)
        from championship_rounds as rounds
        where rounds.championship_id = championship.id
      ),
      'answerCount', (
        select count(*) from championship_answers as answers
        where answers.championship_id = championship.id
      ),
      'expectedAnswerCount', (
        select coalesce(sum(rounds.board_count), 0)
        from championship_rounds as rounds
        where rounds.championship_id = championship.id
      )
    ),

    'counters', (
      select jsonb_build_object(
        'registered', count(*) filter (where status <> 'CANCELLED'),
        'started', count(*) filter (where started_at is not null and status <> 'CANCELLED'),
        'playing', count(*) filter (where status = 'IN_PROGRESS'),
        'finished', count(*) filter (where status = 'FINISHED'),
        'abandoned', count(*) filter (where status = 'ABANDONED')
      )
      from championship_participants
      where championship_id = championship.id
    ),

    'rounds', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', rounds.id,
        'mode', rounds.mode,
        'roundOrder', rounds.round_order,
        'boardCount', rounds.board_count,
        'maxAttempts', rounds.max_attempts,
        'status', rounds.status,
        'startsAt', rounds.starts_at,
        'endsAt', rounds.ends_at,
        'answerCount', (
          select count(*) from championship_answers as answers
          where answers.championship_round_id = rounds.id
        ),
        'notStarted', (
          select count(*)
          from championship_participants as participants
          left join participant_rounds as participation
            on participation.championship_participant_id = participants.id
           and participation.championship_round_id = rounds.id
          where participants.championship_id = championship.id
            and participants.status <> 'CANCELLED'
            and coalesce(participation.status::text, 'NOT_STARTED') = 'NOT_STARTED'
        ),
        'inProgress', (
          select count(*)
          from participant_rounds as participation
          join championship_participants as participants
            on participants.id = participation.championship_participant_id
          where participation.championship_round_id = rounds.id
            and participants.status <> 'CANCELLED'
            and participation.status = 'IN_PROGRESS'
        ),
        'completed', (
          select count(*)
          from participant_rounds as participation
          join championship_participants as participants
            on participants.id = participation.championship_participant_id
          where participation.championship_round_id = rounds.id
            and participants.status <> 'CANCELLED'
            and participation.status in ('COMPLETED', 'FAILED', 'EXPIRED')
        )
      ) order by rounds.round_order), '[]'::jsonb)
      from championship_rounds as rounds
      where rounds.championship_id = championship.id
    ),

    'participants', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', participants.id,
        'displayName', participants.display_name_snapshot,
        'status', participants.status,
        'registeredAt', participants.registered_at,
        'startedAt', participants.started_at,
        'finishedAt', participants.finished_at,
        'completedRounds', participants.completed_rounds,
        'wordsSolved', participants.words_solved,
        'totalScore', participants.total_score,
        'totalAttempts', participants.total_attempts,
        'totalDurationMs', participants.total_duration_ms,
        'finalPosition', participants.final_position,
        'currentRoundMode', (
          select rounds.mode
          from participant_rounds as participation
          join championship_rounds as rounds
            on rounds.id = participation.championship_round_id
          where participation.championship_participant_id = participants.id
            and participation.status = 'IN_PROGRESS'
          order by rounds.round_order
          limit 1
        ),
        'currentRoundOrder', (
          select rounds.round_order
          from participant_rounds as participation
          join championship_rounds as rounds
            on rounds.id = participation.championship_round_id
          where participation.championship_participant_id = participants.id
            and participation.status = 'IN_PROGRESS'
          order by rounds.round_order
          limit 1
        )
      ) order by
        participants.final_position nulls last,
        participants.total_score desc,
        participants.registered_at
      ), '[]'::jsonb)
      from championship_participants as participants
      where participants.championship_id = championship.id
    ),

    'wordPoolSize', (select count(*) from championship_word_pool where is_enabled),
    'validWordCount', (select count(*) from championship_valid_words)
  );
end;
$$;

-- =====================================================================
-- PERMISSOES
-- =====================================================================
-- Funcoes novas nascem com EXECUTE para PUBLIC. Revogamos explicitamente
-- e liberamos apenas para authenticated. A autorizacao real continua
-- sendo cd_require_admin() dentro de cada funcao: um usuario autenticado
-- comum que chame a RPC direto recebe FORBIDDEN.
-- ---------------------------------------------------------------------

revoke all on function cd_today_championship_id()                          from public, anon, authenticated;
revoke all on function cd_admin_lock_championship(uuid)                    from public, anon, authenticated;
revoke all on function cd_admin_start_championship_now(uuid)               from public, anon, authenticated;
revoke all on function cd_admin_update_championship_schedule(uuid, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function cd_admin_open_registration_now(uuid)                from public, anon, authenticated;
revoke all on function cd_admin_close_registration_now(uuid)               from public, anon, authenticated;
revoke all on function cd_admin_schedule_start_in(uuid, integer)           from public, anon, authenticated;
revoke all on function cd_admin_cancel_championship(uuid)                  from public, anon, authenticated;
revoke all on function cd_admin_finish_championship(uuid)                  from public, anon, authenticated;
revoke all on function cd_admin_championship_answers(uuid)                 from public, anon, authenticated;
revoke all on function cd_admin_overview(uuid)                             from public, anon, authenticated;

-- cd_admin_lock_championship e cd_today_championship_id sao internas:
-- ficam sem grant nenhum e so podem ser chamadas de dentro do banco.

grant execute on function cd_admin_start_championship_now(uuid)            to authenticated;
grant execute on function cd_admin_update_championship_schedule(uuid, timestamptz, timestamptz, timestamptz) to authenticated;
grant execute on function cd_admin_open_registration_now(uuid)             to authenticated;
grant execute on function cd_admin_close_registration_now(uuid)            to authenticated;
grant execute on function cd_admin_schedule_start_in(uuid, integer)        to authenticated;
grant execute on function cd_admin_cancel_championship(uuid)               to authenticated;
grant execute on function cd_admin_finish_championship(uuid)               to authenticated;
grant execute on function cd_admin_championship_answers(uuid)              to authenticated;
grant execute on function cd_admin_overview(uuid)                          to authenticated;

-- ---------------------------------------------------------------------
-- Reforco: as RPCs administrativas anteriores continuam restritas.
-- Reaplicado aqui para o caso de a migration 06 ter rodado antes de
-- alguma delas existir.
-- ---------------------------------------------------------------------
revoke all on function cd_admin_create_championship(date, timestamptz, timestamptz, timestamptz, text) from public, anon;
revoke all on function cd_admin_update_schedule(uuid, timestamptz, timestamptz, timestamptz) from public, anon;
revoke all on function cd_admin_set_status(uuid, championship_status)      from public, anon;
revoke all on function cd_admin_redraw_words(uuid)                         from public, anon;
revoke all on function cd_admin_recalculate(uuid)                          from public, anon;
revoke all on function cd_admin_update_config(integer, integer, integer, integer, boolean) from public, anon;
