# Backend do Campeonato Diario

Esta pasta contem tudo o que o Campeonato Diario precisa no servidor.
O Jogo Livre continua funcionando sem nada disto.

## Estrutura

```
supabase/
  migrations/
    20260806000100_championship_schema.sql        tabelas, enums, restricoes, indices
    20260806000200_championship_core_functions.sql normalizacao, avaliacao, pontuacao
    20260806000300_championship_lifecycle.sql      status, sorteio, ranking, encerramento
    20260806000400_championship_player_rpc.sql     RPCs do jogador
    20260806000500_championship_admin_rpc.sql      RPCs administrativas
    20260806000600_championship_security.sql       RLS, grants, trigger de perfil
  seed/
    palavras.sql                                   base de palavras (arquivo gerado)
```

## Ordem de aplicacao

As migrations sao idempotentes o suficiente para rodar em sequencia por
ordem alfabetica do nome do arquivo, que e a ordem numerica acima.

## Aplicar em um projeto Supabase

### Opcao 1 - Supabase CLI (recomendado)

```bash
npm install -g supabase
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

Depois carregue a base de palavras:

```bash
npm run seed:palavras          # gera supabase/seed/palavras.sql a partir dos JSONs
psql "$DATABASE_URL" -f supabase/seed/palavras.sql
```

### Opcao 2 - SQL Editor do painel

1. Abra o SQL Editor do projeto.
2. Cole e execute cada migration, na ordem numerica.
3. Cole e execute `supabase/seed/palavras.sql`.

O arquivo de seed tem cerca de 200 KB. Se o editor reclamar do tamanho,
use `psql` com a connection string de `Project Settings > Database`.

## Habilitar login anonimo

O campeonato identifica participantes com sessao anonima do Supabase Auth.

`Authentication > Providers > Anonymous sign-ins` precisa estar ligado.

Sem isso, `signInAnonymously` devolve erro e a inscricao falha.

## Definir um administrador

Descubra o `id` do seu usuario em `Authentication > Users` e rode:

```sql
insert into championship_admins (user_id)
values ('SEU-USER-UUID')
on conflict do nothing;
```

Sem pelo menos um administrador nao e possivel criar campeonatos.

## Criar o campeonato do dia

Pelo painel administrativo do app (`/campeonato/admin`) ou por SQL:

```sql
-- Horarios padrao: inscricoes das 09h ate 19h55, inicio as 20h (America/Sao_Paulo).
select cd_admin_create_championship();

-- Ou com horarios explicitos:
select cd_admin_create_championship(
  p_championship_date      => current_date,
  p_registration_opens_at  => '2026-08-06 09:00-03'::timestamptz,
  p_registration_closes_at => '2026-08-06 19:55-03'::timestamptz,
  p_starts_at              => '2026-08-06 20:00-03'::timestamptz
);
```

A funcao ja cria as quatro modalidades e sorteia as 13 palavras no servidor.

## Automatizar a criacao diaria

Com a extensao `pg_cron` (Database > Extensions):

```sql
select cron.schedule(
  'campeonato-diario',
  '0 6 * * *',
  $$ select cd_admin_create_championship() $$
);
```

Como `cd_admin_create_championship` exige `cd_is_admin()`, rode o agendamento
com um usuario administrador ou crie um wrapper `SECURITY DEFINER` proprio.

## Transicoes de status

Nao e necessario cron para mover o campeonato entre os status.
`cd_refresh_championship_status` roda no inicio de toda RPC de jogo e usa
`now()` do banco como unica fonte de horario:

```
SCHEDULED -> REGISTRATION_OPEN -> WAITING -> IN_PROGRESS -> FINISHED
```

O encerramento acontece quando todos os inscritos terminam ou quando passa
`championship_config.max_championship_duration_minutes` desde o inicio.

## Configuracao das regras

```sql
select cd_admin_update_config(
  p_points_per_word                   => 100,
  p_bonus_per_remaining_attempt       => 10,
  p_recent_answer_cooldown_days       => 60,
  p_max_championship_duration_minutes => 180,
  p_allow_late_registration           => false
);
```

## Verificacao rapida de seguranca

```sql
-- Deve retornar 0 linhas para o papel authenticated.
set role authenticated;
select * from championship_answers;   -- erro de permissao / zero linhas
reset role;
```
