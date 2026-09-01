-- =====================================================================
-- Palavra Livre - Estrutura do Campeonato Norte semanal.
-- Migration 31: entidade semanal + rodadas diarias + garantia idempotente.
--
-- Objetivo:
--   - weekly_championships representa o Campeonato Norte semanal.
--   - weekly_championship_rounds representa as rodadas diarias do campeonato.
--   - o modelo antigo (championships) continua preservado para historico,
--     mas nao e mais a fonte de verdade do fluxo semanal.
-- =====================================================================

create table if not exists weekly_championships (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Campeonato Norte',
  week_start date not null,
  week_end date not null,
  status championship_status not null default 'SCHEDULED',
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  constraint weekly_championship_name_check check (name = 'Campeonato Norte'),
  constraint weekly_championship_week_range_check check (week_start <= week_end),
  constraint weekly_championship_start_is_monday check (extract(isodow from week_start) = 1),
  constraint weekly_championship_end_is_friday check (week_end = week_start + 4),
  constraint weekly_championship_unique_name_week unique (name, week_start)
);

create index if not exists weekly_championships_week_idx
  on weekly_championships (week_start, name);

create index if not exists weekly_championships_status_idx
  on weekly_championships (status, week_start);

create table if not exists weekly_championship_rounds (
  id uuid primary key default gen_random_uuid(),
  weekly_championship_id uuid not null references weekly_championships (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 5),
  day_label text not null check (day_label in ('SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA')),
  round_date date not null,
  started_at timestamptz,
  finished_at timestamptz,
  status championship_round_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  constraint weekly_championship_rounds_unique_weekday unique (weekly_championship_id, weekday),
  constraint weekly_championship_rounds_unique_date unique (weekly_championship_id, round_date)
);

create index if not exists weekly_championship_rounds_week_idx
  on weekly_championship_rounds (weekly_championship_id, weekday, round_date);

-- ---------------------------------------------------------------------
-- Datas e semana do Brasil.
-- ---------------------------------------------------------------------
create or replace function public.brazil_week_start(p_date date default current_date)
returns date
language sql
stable
set search_path = public
as $$
  select p_date - ((extract(isodow from p_date)::int - 1));
$$;

create or replace function public.brazil_week_end(p_date date default current_date)
returns date
language sql
stable
set search_path = public
as $$
  select brazil_week_start(p_date) + 4;
$$;

create or replace function public.brazil_current_date()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- ---------------------------------------------------------------------
-- Garantia do campeonato semanal do Norte.
-- O modelo exige uma semana = segunda a sexta.
-- ---------------------------------------------------------------------
create or replace function public.ensure_current_norte_championship(p_reference_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ref_date date := coalesce(p_reference_date, brazil_current_date());
  weekday_number integer := extract(isodow from ref_date)::int;
  target_week_start date := brazil_week_start(ref_date);
  target_week_end date := brazil_week_end(ref_date);
  existing_championship_id uuid;
  inserted_championship_id uuid;
  created boolean := false;
  persisted_status championship_status;
begin
  if weekday_number in (6, 7) then
    return jsonb_build_object(
      'created', false,
      'weekend', true,
      'championship', null,
      'weekStart', target_week_start,
      'weekEnd', target_week_end,
      'reason', 'weekend_noop'
    );
  end if;

  select id, status
    into existing_championship_id, persisted_status
  from weekly_championships
  where name = 'Campeonato Norte' and week_start = target_week_start;

  if existing_championship_id is null then
    insert into weekly_championships (
      name,
      week_start,
      week_end,
      status,
      timezone
    ) values (
      'Campeonato Norte',
      target_week_start,
      target_week_end,
      'SCHEDULED',
      'America/Sao_Paulo'
    )
    on conflict (name, week_start) do nothing
    returning id into inserted_championship_id;

    if inserted_championship_id is not null then
      existing_championship_id := inserted_championship_id;
      created := true;
      persisted_status := 'SCHEDULED';
    else
      select id, status
        into existing_championship_id, persisted_status
      from weekly_championships
      where name = 'Campeonato Norte' and week_start = target_week_start;
    end if;
  end if;

  return jsonb_build_object(
    'created', created,
    'weekend', false,
    'weekStart', target_week_start,
    'weekEnd', target_week_end,
    'championship', jsonb_build_object(
      'id', existing_championship_id,
      'name', 'Campeonato Norte',
      'weekStart', target_week_start,
      'weekEnd', target_week_end,
      'status', persisted_status
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Garantia da rodada diaria da semana atual.
-- Apenas segunda a sexta geram rodada. Sabado e domingo nao criam.
-- ---------------------------------------------------------------------
create or replace function public.ensure_current_norte_round(p_reference_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ref_date date := coalesce(p_reference_date, brazil_current_date());
  weekday_number integer := extract(isodow from ref_date)::int;
  target_week_start date := brazil_week_start(ref_date);
  target_week_end date := brazil_week_end(ref_date);
  championship jsonb;
  championship_id uuid;
  round_label text;
  created boolean := false;
  round_id uuid;
begin
  if weekday_number not between 1 and 5 then
    return jsonb_build_object(
      'created', false,
      'weekend', true,
      'championship', null,
      'round', null,
      'weekStart', target_week_start,
      'weekEnd', target_week_end,
      'reason', 'weekend_noop'
    );
  end if;

  championship := ensure_current_norte_championship(ref_date);
  championship_id := (championship->'championship'->>'id')::uuid;

  round_label := case weekday_number
    when 1 then 'SEGUNDA'
    when 2 then 'TERCA'
    when 3 then 'QUARTA'
    when 4 then 'QUINTA'
    when 5 then 'SEXTA'
  end;

  insert into weekly_championship_rounds (
    weekly_championship_id,
    weekday,
    day_label,
    round_date,
    status
  ) values (
    championship_id,
    weekday_number,
    round_label,
    ref_date,
    'PENDING'
  )
  on conflict (weekly_championship_id, weekday) do nothing
  returning id into round_id;

  if round_id is null then
    select id into round_id
    from weekly_championship_rounds
    where weekly_championship_id = championship_id and weekday = weekday_number;
  else
    created := true;
  end if;

  return jsonb_build_object(
    'created', created,
    'weekend', false,
    'weekStart', target_week_start,
    'weekEnd', target_week_end,
    'championship', championship->'championship',
    'round', jsonb_build_object(
      'id', round_id,
      'weeklyChampionshipId', championship_id,
      'weekday', weekday_number,
      'dayLabel', round_label,
      'roundDate', ref_date,
      'status', (
        select status
        from weekly_championship_rounds
        where id = round_id
      )
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Permissoes de leitura publica, sem expor dados pessoais.
-- ---------------------------------------------------------------------
alter table weekly_championships enable row level security;
alter table weekly_championship_rounds enable row level security;

drop policy if exists weekly_championships_public_read on weekly_championships;
create policy weekly_championships_public_read on weekly_championships
  for select using (true);

drop policy if exists weekly_championship_rounds_public_read on weekly_championship_rounds;
create policy weekly_championship_rounds_public_read on weekly_championship_rounds
  for select using (true);

revoke all on table weekly_championships from public, anon, authenticated;
revoke all on table weekly_championship_rounds from public, anon, authenticated;

grant select on table weekly_championships to anon, authenticated;
grant select on table weekly_championship_rounds to anon, authenticated;

grant execute on function public.brazil_week_start(date) to authenticated, anon;
grant execute on function public.brazil_week_end(date) to authenticated, anon;
grant execute on function public.brazil_current_date() to authenticated, anon;
grant execute on function public.ensure_current_norte_championship(date) to authenticated;
grant execute on function public.ensure_current_norte_round(date) to authenticated;
