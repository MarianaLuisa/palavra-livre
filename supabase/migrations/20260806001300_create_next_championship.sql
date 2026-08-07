-- =====================================================================
-- Palavra Livre - Criacao do proximo campeonato
-- Migration 13: resolve a colisao de data ao criar pelo atalho.
--
-- ADITIVA. Cria duas funcoes e substitui cd_admin_create_championship
-- mantendo a mesma assinatura e o mesmo comportamento, apenas trocando o
-- erro cru de constraint por um codigo tratavel.
--
-- ---------------------------------------------------------------------
-- PROBLEMA
-- ---------------------------------------------------------------------
-- O indice championships_one_official_per_date e:
--
--   unique (championship_date) where is_official and status <> 'CANCELLED'
--
-- Ou seja, um campeonato FINISHED continua ocupando a data. Isso esta
-- correto: o historico do dia nao deve ser sobrescrito.
--
-- Só que cd_admin_create_championship(), sem parametros, sempre mira em
-- HOJE. Depois que o campeonato de hoje encerra, chamar o atalho tenta
-- criar um segundo para a mesma data e estoura
-- 23505 duplicate key value violates unique constraint.
--
-- ---------------------------------------------------------------------
-- SOLUCAO
-- ---------------------------------------------------------------------
-- cd_admin_create_next_championship() procura a proxima data SEM
-- campeonato oficial ativo, a partir de hoje, e cria nela. Se hoje esta
-- livre, cria hoje; se hoje ja tem um (agendado, em andamento ou
-- encerrado), cria amanha, e assim por diante.
--
-- E a colisao que ainda puder acontecer na criacao com data explicita
-- passa a chegar como CHAMPIONSHIP_DATE_TAKEN, com mensagem em portugues.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Proxima data sem campeonato oficial ativo, olhando ate 60 dias a frente.
-- ---------------------------------------------------------------------
create or replace function cd_admin_next_free_championship_date()
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  config championship_config%rowtype;
  today_date date;
  found_date date;
begin
  select * into config from championship_config where id;
  today_date := (now() at time zone config.default_timezone)::date;

  select candidate::date into found_date
  from generate_series(today_date, today_date + 60, interval '1 day') as candidate
  where not exists (
    select 1
    from championships
    where championships.is_official
      and championships.status <> 'CANCELLED'
      and championships.championship_date = candidate::date
  )
  order by candidate
  limit 1;

  return found_date;
end;
$$;

-- ---------------------------------------------------------------------
-- Cria o campeonato na proxima data livre.
--
-- Reaproveita cd_admin_create_championship: mesmas rodadas, mesmo sorteio
-- das 13 palavras no servidor, mesmos horarios padrao daquele dia.
-- ---------------------------------------------------------------------
create or replace function cd_admin_create_next_championship()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  config championship_config%rowtype;
  target_date date;
  today_date date;
  created jsonb;
begin
  perform cd_require_admin();

  select * into config from championship_config where id;
  today_date := (now() at time zone config.default_timezone)::date;
  target_date := cd_admin_next_free_championship_date();

  if target_date is null then
    raise exception 'NO_FREE_CHAMPIONSHIP_DATE' using errcode = 'P0001';
  end if;

  created := cd_admin_create_championship(p_championship_date => target_date);

  return created || jsonb_build_object(
    'isToday', target_date = today_date,
    'daysAhead', target_date - today_date
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Mesma funcao de antes, com a colisao de data traduzida.
--
-- Sem esta captura, o painel recebia o texto cru do Postgres. Agora
-- recebe um codigo que a interface sabe explicar.
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

  begin
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
  exception
    when unique_violation then
      -- Ja existe campeonato oficial ativo nesta data. Encerrado tambem conta:
      -- o historico do dia nao pode ser sobrescrito.
      raise exception 'CHAMPIONSHIP_DATE_TAKEN' using errcode = 'P0001';
  end;

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
-- Permissoes.
-- ---------------------------------------------------------------------
revoke all on function cd_admin_next_free_championship_date()
  from public, anon, authenticated;
revoke all on function cd_admin_create_next_championship()
  from public, anon, authenticated;
revoke all on function cd_admin_create_championship(date, timestamptz, timestamptz, timestamptz, text)
  from public, anon;

grant execute on function cd_admin_create_next_championship() to authenticated;
grant execute on function cd_admin_create_championship(date, timestamptz, timestamptz, timestamptz, text)
  to authenticated;
