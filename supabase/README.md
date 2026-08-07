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
    20260806000700_championship_admin_controls.sql controles do painel administrativo
    20260806000800_user_accounts.sql               contas de jogador e username unico
    20260806000900_player_games.sql                historico de partidas do Jogo Livre
    20260806001000_player_progress.sql             calendario, sequencia e estatisticas
  seed/
    palavras.sql                                   base de palavras (arquivo gerado)
```

As migrations 08 a 10 sao aditivas: criam tabelas e colunas novas, nao recriam
nada e nao apagam linha nenhuma. Podem ser aplicadas com campeonatos,
participantes e tentativas ja em producao.

A migration 07 e aditiva: cria funcoes novas e substitui apenas
`cd_admin_overview` (mesma assinatura, payload mais completo e sem respostas).
Nenhuma tabela e alterada e nenhum dado existente e tocado, entao ela pode ser
aplicada com campeonatos, participantes e tentativas ja em producao.

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

## Configuracao manual no painel do Supabase

Estes passos NAO sao feitos por migration. Precisam ser feitos no dashboard.

### 1. Login anonimo

`Authentication > Providers > Anonymous sign-ins`: **ligado**.

O campeonato permite participar sem conta. Sem isso, `signInAnonymously`
devolve erro e a inscricao anonima falha.

### 2. Login por e-mail e senha

`Authentication > Providers > Email`: **ligado**.

`Confirm email`: escolha uma das duas opcoes. As duas funcionam.

- **Desligado**: a pessoa cria a conta e entra na hora. Melhor para comecar.
- **Ligado**: a tela de cadastro mostra "Confirme seu e-mail" e o login so
  funciona depois do clique no link.

### 3. Site URL e Redirect URLs

`Authentication > URL Configuration`:

- **Site URL**: a URL de producao, por exemplo `https://palavra-livre.vercel.app`
- **Redirect URLs**: adicione as duas linhas abaixo, uma por ambiente:

```
http://localhost:5173/recuperar-senha
https://SEU-DOMINIO/recuperar-senha
```

Sem isso o link de recuperacao de senha volta para o lugar errado e a tela de
nova senha nao aparece.

### 4. Modelos de e-mail (opcional)

`Authentication > Email Templates`: os textos padrao vem em ingles. Traduzir
"Confirm signup" e "Reset password" deixa a experiencia coerente com o jogo.

## Definir um administrador

Descubra o `id` do seu usuario em `Authentication > Users` e rode:

```sql
insert into championship_admins (user_id)
values ('SEU-USER-UUID')
on conflict do nothing;
```

Sem pelo menos um administrador nao e possivel criar campeonatos.

### Se voce ja e administradora com sessao anonima

Nao precisa de SQL. Abra `/cadastro` no mesmo navegador onde a sessao anonima
esta ativa e crie a conta normalmente: o app detecta a sessao e usa
`PUT /auth/v1/user`, que **preserva o mesmo UUID**. Sua linha em
`championship_admins`, suas participacoes e suas tentativas continuam suas.

Se por algum motivo a conversao falhar, crie uma conta nova, pegue o UUID em
`Authentication > Users` e rode o insert acima. O administrador antigo nao e
removido automaticamente; apague a linha antiga so quando quiser:

```sql
delete from championship_admins where user_id = 'UUID-ANTIGO';
```

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

## Operar pelo painel

Depois da migration 07, o dia a dia acontece em `/campeonato/admin`:
criar o campeonato, ajustar horarios, abrir e fechar inscricoes, **Comecar
agora**, acompanhar participantes, cancelar e finalizar.

O SQL abaixo continua funcionando, mas nao e mais necessario para operacao
normal.

Equivalencias, se precisar do SQL Editor:

```sql
-- Comecar agora
select cd_admin_start_championship_now('UUID-DO-CAMPEONATO');

-- Ajustar horarios (instantes absolutos; -03 e o fuso de Brasilia)
select cd_admin_update_championship_schedule(
  'UUID-DO-CAMPEONATO',
  '2026-08-06 09:00-03'::timestamptz,
  '2026-08-06 19:55-03'::timestamptz,
  '2026-08-06 20:00-03'::timestamptz
);

-- Atalhos de teste
select cd_admin_open_registration_now('UUID-DO-CAMPEONATO');
select cd_admin_close_registration_now('UUID-DO-CAMPEONATO');
select cd_admin_schedule_start_in('UUID-DO-CAMPEONATO', 5);

-- Cancelar (nao apaga nada)
select cd_admin_cancel_championship('UUID-DO-CAMPEONATO');

-- Respostas: so depois de FINISHED
select cd_admin_championship_answers('UUID-DO-CAMPEONATO');
```

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
