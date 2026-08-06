-- =====================================================================
-- Palavra Livre - Campeonato Diario
-- Migration 01: extensoes, enums, tabelas, restricoes e indices.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

do $$ begin
  create type championship_status as enum (
    'SCHEDULED',
    'REGISTRATION_OPEN',
    'WAITING',
    'IN_PROGRESS',
    'CALCULATING_RESULTS',
    'FINISHED',
    'CANCELLED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type championship_mode as enum ('SIMPLE', 'DUET', 'QUARTET', 'SEXTET');
exception when duplicate_object then null; end $$;

do $$ begin
  create type championship_round_status as enum ('PENDING', 'ACTIVE', 'CLOSED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type participation_status as enum (
    'REGISTERED',
    'IN_PROGRESS',
    'FINISHED',
    'ABANDONED',
    'CANCELLED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type participant_round_status as enum (
    'NOT_STARTED',
    'IN_PROGRESS',
    'COMPLETED',
    'FAILED',
    'EXPIRED'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Configuracao global (mantem as regras configuraveis fora do codigo)
-- ---------------------------------------------------------------------

create table if not exists championship_config (
  id boolean primary key default true,
  points_per_word integer not null default 100 check (points_per_word >= 0),
  bonus_per_remaining_attempt integer not null default 10 check (bonus_per_remaining_attempt >= 0),
  recent_answer_cooldown_days integer not null default 60 check (recent_answer_cooldown_days >= 0),
  max_championship_duration_minutes integer not null default 180 check (max_championship_duration_minutes > 0),
  allow_late_registration boolean not null default false,
  default_timezone text not null default 'America/Sao_Paulo',
  updated_at timestamptz not null default now(),
  constraint championship_config_singleton check (id)
);

insert into championship_config (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Base de palavras no servidor (fonte oficial das respostas)
-- ---------------------------------------------------------------------

create table if not exists championship_valid_words (
  normalized_word text primary key check (char_length(normalized_word) = 5)
);

create table if not exists championship_word_pool (
  normalized_word text primary key check (char_length(normalized_word) = 5),
  display_word text not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Perfis
-- ---------------------------------------------------------------------

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    check (char_length(btrim(display_name)) between 2 and 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Administradores
-- ---------------------------------------------------------------------

create table if not exists championship_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Campeonatos
-- ---------------------------------------------------------------------

create table if not exists championships (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Campeonato Diario',
  championship_date date not null,
  timezone text not null default 'America/Sao_Paulo',
  registration_opens_at timestamptz not null,
  registration_closes_at timestamptz not null,
  starts_at timestamptz not null,
  finished_at timestamptz,
  status championship_status not null default 'SCHEDULED',
  is_official boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint championships_window_check check (
    registration_opens_at < registration_closes_at
    and registration_closes_at <= starts_at
  )
);

-- Apenas um campeonato oficial ativo por data.
create unique index if not exists championships_one_official_per_date
  on championships (championship_date)
  where is_official and status <> 'CANCELLED';

create index if not exists championships_status_idx on championships (status);
create index if not exists championships_date_idx on championships (championship_date desc);

-- ---------------------------------------------------------------------
-- Rodadas do campeonato
-- ---------------------------------------------------------------------

create table if not exists championship_rounds (
  id uuid primary key default gen_random_uuid(),
  championship_id uuid not null references championships (id) on delete cascade,
  mode championship_mode not null,
  round_order smallint not null check (round_order between 1 and 10),
  board_count smallint not null check (board_count > 0),
  max_attempts smallint not null check (max_attempts > 0),
  -- Reservado para limites de tempo por etapa. NULL = sem limite.
  time_limit_seconds integer check (time_limit_seconds is null or time_limit_seconds > 0),
  status championship_round_status not null default 'PENDING',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  unique (championship_id, round_order),
  unique (championship_id, mode)
);

create index if not exists championship_rounds_championship_idx
  on championship_rounds (championship_id, round_order);

-- ---------------------------------------------------------------------
-- Respostas secretas (tabela protegida: nenhuma policy de leitura)
-- ---------------------------------------------------------------------

create table if not exists championship_answers (
  id uuid primary key default gen_random_uuid(),
  championship_id uuid not null references championships (id) on delete cascade,
  championship_round_id uuid not null references championship_rounds (id) on delete cascade,
  board_index smallint not null check (board_index >= 0),
  answer text not null,
  normalized_answer text not null check (char_length(normalized_answer) = 5),
  created_at timestamptz not null default now(),
  unique (championship_round_id, board_index),
  -- Nao repete a mesma palavra dentro do mesmo campeonato.
  unique (championship_id, normalized_answer)
);

-- ---------------------------------------------------------------------
-- Participantes
-- ---------------------------------------------------------------------

create table if not exists championship_participants (
  id uuid primary key default gen_random_uuid(),
  championship_id uuid not null references championships (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name_snapshot text not null,
  normalized_display_name text generated always as (lower(btrim(display_name_snapshot))) stored,
  status participation_status not null default 'REGISTERED',
  registered_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  total_score integer not null default 0,
  words_solved integer not null default 0,
  completed_rounds integer not null default 0,
  total_attempts integer not null default 0,
  total_duration_ms bigint not null default 0,
  final_position integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Um usuario so pode se inscrever uma vez no mesmo campeonato.
  unique (championship_id, user_id),
  -- Dois participantes nao podem usar o mesmo nome no mesmo campeonato.
  unique (championship_id, normalized_display_name)
);

create index if not exists championship_participants_ranking_idx
  on championship_participants (championship_id, total_score desc, words_solved desc);

create index if not exists championship_participants_user_idx
  on championship_participants (user_id, championship_id);

-- ---------------------------------------------------------------------
-- Participacao por rodada
-- ---------------------------------------------------------------------

create table if not exists participant_rounds (
  id uuid primary key default gen_random_uuid(),
  championship_participant_id uuid not null
    references championship_participants (id) on delete cascade,
  championship_round_id uuid not null
    references championship_rounds (id) on delete cascade,
  status participant_round_status not null default 'NOT_STARTED',
  started_at timestamptz,
  finished_at timestamptz,
  attempts_used integer not null default 0 check (attempts_used >= 0),
  words_solved integer not null default 0 check (words_solved >= 0),
  all_words_solved boolean not null default false,
  base_score integer not null default 0,
  bonus_score integer not null default 0,
  total_score integer not null default 0,
  duration_ms bigint not null default 0,
  -- Estado dos tabuleiros: [{ boardIndex, solved, solvedAtAttempt }]
  board_state jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (championship_participant_id, championship_round_id)
);

create index if not exists participant_rounds_round_idx
  on participant_rounds (championship_round_id);

-- ---------------------------------------------------------------------
-- Tentativas
-- ---------------------------------------------------------------------

create table if not exists participant_attempts (
  id uuid primary key default gen_random_uuid(),
  participant_round_id uuid not null references participant_rounds (id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  word text not null,
  normalized_word text not null check (char_length(normalized_word) = 5),
  -- [{ boardIndex, solved, letters: [{ letter, status }] }]
  evaluation jsonb not null,
  created_at timestamptz not null default now(),
  -- Impede contagem duplicada da mesma tentativa sob concorrencia.
  unique (participant_round_id, attempt_number),
  -- Impede repetir a mesma palavra na mesma rodada.
  unique (participant_round_id, normalized_word)
);

create index if not exists participant_attempts_round_idx
  on participant_attempts (participant_round_id, attempt_number);

-- ---------------------------------------------------------------------
-- updated_at automatico
-- ---------------------------------------------------------------------

create or replace function cd_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  target text;
begin
  foreach target in array array[
    'profiles',
    'championships',
    'championship_participants',
    'participant_rounds'
  ] loop
    execute format('drop trigger if exists %I_touch_updated_at on %I', target, target);
    execute format(
      'create trigger %I_touch_updated_at before update on %I
         for each row execute function cd_touch_updated_at()',
      target, target
    );
  end loop;
end $$;
