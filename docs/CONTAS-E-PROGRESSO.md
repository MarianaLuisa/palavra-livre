# Contas, progresso e estatísticas

Documento técnico do sistema de contas do Palavra Livre. O Campeonato Diário
está descrito em [CAMPEONATO-DIARIO.md](CAMPEONATO-DIARIO.md).

---

## 1. Arquitetura escolhida

```
Navegador                                Supabase
--------------------------------------   ---------------------------------
AuthProvider / useAuth ──┐
                         ├─► AccountService ──► /auth/v1  (sessão)
páginas de conta       ──┘   (fetch puro)  └──► /rest/v1/rpc/pl_*
                                                        │
                                                        ▼
                                          funções SECURITY DEFINER
                                          que resolvem o dono por auth.uid()
                                                        │
                                                        ▼
                                    player_games  +  tabelas do campeonato
                                    (Jogo Livre)      (fonte da verdade)
```

### Duas decisões que orientam o resto

**Nada é pré-agregado.** Não existe coluna `total_games` nem `streak` gravada.
Toda métrica é derivada em tempo de consulta de `player_games` e das tabelas do
campeonato. É impossível o número exibido divergir das linhas reais, porque não
há um segundo número para divergir.

**O campeonato não é duplicado.** `player_games` guarda apenas Jogo Livre. As
partidas do campeonato continuam em `championship_participants` e
`participant_rounds`, e as RPCs de progresso fazem `UNION` das duas origens.
Copiar seria mais rápido de consultar e criaria duas verdades para o mesmo fato.

---

## 2. Tabelas novas

| Tabela | Conteúdo |
| --- | --- |
| `player_games` | uma linha por partida de Jogo Livre concluída |
| `achievements` | catálogo de conquistas (modelado, sem tela ainda) |
| `player_achievements` | conquistas desbloqueadas por jogador |

### `player_games`

| Coluna | Observação |
| --- | --- |
| `client_game_id` | criado quando a partida começa, sobrevive ao refresh |
| `mode` | reusa o enum `championship_mode` |
| `played_date` | data em `America/Sao_Paulo`, calculada por `pl_today()` |
| `attempts_used`, `max_attempts` | limite vem do servidor, não do cliente |
| `words_total`, `words_solved` | idem |
| `completed` | derivado de `words_solved = words_total` |
| `duration_ms`, `started_at`, `finished_at` | tempo da partida |

Restrições que sustentam as regras:

- `unique (user_id, client_game_id)` — idempotência;
- `check (attempts_used <= max_attempts)` e `check (words_solved <= words_total)`;
- `check (completed = (words_solved = words_total))`;
- `check (words_solved = words_total or attempts_used = max_attempts)` — só entra
  partida realmente terminada, o que impede partida abandonada virar dia jogado.

**O que não é guardado:** nenhuma palavra secreta. O histórico registra
desempenho, não respostas.

## 3. Tabela alterada

`profiles` ganhou colunas, sem recriação e sem perder linha:

| Coluna | Observação |
| --- | --- |
| `username` | NULLABLE de propósito: perfis anônimos antigos não têm um |
| `username_normalized` | gerada, `lower(btrim(username))` |
| `is_permanent` | conta com e-mail, sincronizada por trigger |
| `daily_goal` | meta diária, padrão 3 |

Unicidade real: índice `UNIQUE` parcial em `username_normalized`. `Mariana` e
`mariana` não podem pertencer a pessoas diferentes, e dois cadastros
simultâneos com o mesmo nome fazem um dos dois receber `unique_violation`.
A validação no formulário é ergonomia; a garantia é o índice.

---

## 4. Migrations criadas

| Arquivo | Conteúdo |
| --- | --- |
| `20260806000800_user_accounts.sql` | colunas de perfil, username único, RPCs de username, triggers de conta |
| `20260806000900_player_games.sql` | `player_games`, `pl_record_game`, meta diária, RLS |
| `20260806001000_player_progress.sql` | calendário, sequência, estatísticas, histórico, conquistas |

Todas aditivas. Nenhuma migration de 01 a 07 foi tocada, nenhuma tabela foi
recriada e nenhum `TRUNCATE` existe em lugar nenhum. Podem ser aplicadas com
campeonatos, participantes e tentativas já em produção.

## 5. RPCs novas

| Função | Uso |
| --- | --- |
| `pl_username_available(text)` | checagem no cadastro (também para anônimo) |
| `pl_set_username(text)` | define ou troca o username |
| `pl_get_my_profile()` | perfil da sessão, sem e-mail |
| `pl_record_game(...)` | registra partida do Jogo Livre, idempotente |
| `pl_get_month_progress(date)` | **uma chamada** monta a tela do mês inteira |
| `pl_get_player_stats(date, date)` | agregado por período |
| `pl_compare_periods(date, date, date, date)` | comparação entre dois meses |
| `pl_get_my_championship_history(int, int)` | histórico pessoal de campeonatos |
| `pl_get_home_summary()` | resumo da home logada |
| `pl_set_daily_goal(int)` | meta diária |
| `pl_today()`, `pl_activity_days()`, `pl_calculate_streak()`, `pl_aggregate_stats()` | internas, sem grant |

---

## 6. Autenticação

Supabase Auth com e-mail e senha. Nenhuma senha passa pelo nosso código: o
formulário envia direto para o GoTrue e só o token volta. Não existe tabela de
senhas, e senha nunca vai para `localStorage` — só o token de sessão, que já era
o caso antes.

`AuthProvider` centraliza tudo e expõe `useAuth()` com `profile`, `loading`,
`isAuthenticated`, `isAnonymous`, `isAdmin`, `signIn`, `signUp`, `signOut`,
`requestPasswordReset`, `updatePassword`, `setUsername` e `refreshProfile`.
Nenhum componente lê sessão por conta própria.

### Usuários anônimos

A sessão anônima que o campeonato já usava **continua funcionando**. Um
visitante anônimo joga, se inscreve no campeonato e não recebe erro em lugar
nenhum. O que ele não tem é área pessoal: `isAuthenticated` exige conta
permanente.

### Conversão preservando o UUID

Quando existe sessão anônima ativa, a tela de cadastro não cria um usuário novo:
chama `PUT /auth/v1/user` com e-mail e senha. O Supabase **mantém o mesmo
`auth.users.id`**.

Como `profiles`, `championship_admins`, `championship_participants` e
`player_games` referenciam esse id, nada precisa migrar: histórico, inscrições,
tentativas e acesso administrativo continuam válidos. Um teste verifica
exatamente isso, incluindo a preservação do papel de administrador.

---

## 7. Calendário

`pl_get_month_progress` devolve numa única chamada: dias com atividade, dias em
que houve campeonato, resumo do mês, sequência e desempenho por modo. A tela
mensal faz 1 request, não N.

Só os dias **com** atividade viajam. O calendário desenha a grade do mês e
preenche o resto como "não jogou", o que mantém o payload pequeno.

Estados de um dia: jogou · jogou e disputou o campeonato · não jogou · hoje ·
futuro. Dias sem partida mas com campeonato ganham um marcador discreto, para o
detalhe poder dizer "Não participou do campeonato".

### O que conta como dia jogado

Pelo menos uma partida **concluída**: Simples, Dueto, Quarteto, Sexteto ou uma
etapa do Campeonato Diário efetivamente iniciada.

Não conta: abrir e abandonar, entrar no site, digitar uma tentativa, ou apenas
se inscrever no campeonato sem jogar. Isso é garantido pelo servidor:
`pl_record_game` recusa partida inacabada, e a participação no campeonato só
entra com `started_at` preenchido.

## 8. Sequência

Regra adotada, documentada porque a especificação era ambígua:

- a sequência continua viva se a última atividade foi **hoje ou ontem**;
- passado um dia inteiro sem jogar, ela zera;
- `atRisk` significa jogou ontem e ainda não jogou hoje.

Isso evita mostrar "0 dias" à meia-noite e um segundo, mas mantém o
comportamento pedido: não jogou o dia 7 inteiro, a sequência vai a zero.

A maior sequência histórica nunca diminui.

O cálculo usa a técnica de agrupar por `data - número da linha`: dias
consecutivos compartilham a mesma chave, e o tamanho de cada grupo é o tamanho
da sequência.

## 9. Estatísticas

Não existe uma definição única de "vitória" imposta a todos os modos:

- **Simples**: resolver a palavra é vitória, e a taxa é taxa de vitória;
- **Dueto, Quarteto, Sexteto**: a métrica é conclusão completa (todas as
  palavras) e a taxa é de conclusão. As palavras resolvidas medem o desempenho
  parcial, que é o que realmente importa nesses modos.

`pl_aggregate_stats` aceita um intervalo de datas e serve às três telas: mês,
período livre e comparação. `pl_compare_periods` devolve os dois períodos numa
chamada só.

---

## 10. Timezone

Todo agrupamento por dia e por mês usa `America/Sao_Paulo`. A data de uma
partida vem de `pl_today()` no servidor — o navegador nunca decide.

O front converte para exibição com `src/championship/timezone.ts`, que já era
usado pelo painel administrativo.

Um teste cobre o caso que quebra implementações ingênuas: 01:00 UTC do dia 7
ainda é dia 6 em São Paulo.

## 11. Segurança

### RLS

| Tabela | Leitura |
| --- | --- |
| `player_games` | apenas as próprias linhas (`user_id = auth.uid()`) |
| `player_achievements` | apenas as próprias |
| `achievements` | catálogo público |
| `profiles` | apenas o próprio (policy da migration 06, mantida) |

`player_games` **não tem policy de insert, update ou delete**. Escrita só por
`pl_record_game`, que valida tudo. Um cliente autenticado não consegue inventar
partida, alterar tentativas nem mudar datas.

### Nada de estatística vinda do frontend

O cliente envia apenas: identificador da partida, modo, tentativas usadas,
palavras resolvidas e duração. O servidor decide o resto:

- a data (`pl_today()`);
- o total de palavras e o limite de tentativas (`cd_round_blueprint()`);
- se venceu (`words_solved = words_total`);
- todos os agregados.

Abrir o DevTools e mandar "SIMPLE com 9 palavras resolvidas" recebe
`INVALID_WORDS_SOLVED`. Streak, vitórias e conquistas não são enviáveis: não
existe parâmetro para isso.

### Nenhuma RPC aceita "de quem" é o progresso

As funções públicas resolvem o dono por `auth.uid()`. Não há `p_user_id` em
nenhuma delas. Trocar um UUID na URL não expõe nada de ninguém — há teste para
isso.

### Privacidade

`pl_get_my_profile` nunca devolve e-mail. O ranking do campeonato continua
mostrando apenas nome de exibição, posição e métricas da disputa.

---

## 12. Rotas criadas

| Rota | Tela | Protegida |
| --- | --- | --- |
| `/login` | entrar | não |
| `/cadastro` | criar conta | não |
| `/recuperar-senha` | pedir link e definir nova senha | não |
| `/perfil` | perfil e edição de username | sim |
| `/progresso` | calendário, sequência, resumo do mês, por modo | sim |
| `/estatisticas` | períodos e comparação entre meses | sim |
| `/campeonatos/historico` | histórico pessoal no campeonato | sim |

Rota protegida sem conta redireciona para `/login?proximo=<destino>` e volta ao
destino depois de entrar. A proteção é conveniência de navegação: a segurança
real está na RLS e no `auth.uid()` das RPCs.

## 13. Migração do localStorage

Preservada como está. O Jogo Livre de visitante continua 100% local, e nada foi
apagado. Para quem tem conta, as partidas novas passam a ser gravadas no
servidor, com uma fila local de reenvio caso a rede caia no momento da
conclusão.

O histórico local antigo **não** é importado. Ele guarda apenas o ciclo atual e
estatísticas agregadas por modo, sem data de partida — não dá para reconstruir
calendário nem sequência a partir dele sem inventar datas. Importar agregados
sem data produziria um calendário falso, então a decisão foi não importar.

Se quiser aproveitar algo depois, o caminho seguro seria importar apenas os
totais por modo como um marco histórico separado, nunca como partidas datadas.

## 14. Funcionalidades futuras

Já modelado, faltando apenas a tela e a lógica de desbloqueio:

- conquistas (`achievements` e `player_achievements` já existem e estão semeadas);
- meta diária personalizável (`profiles.daily_goal` e `pl_set_daily_goal` prontos);
- resumo de fim de mês (todos os dados vêm de `pl_get_month_progress`).

Precisam de trabalho adicional: ranking global de sequência, exportação do
histórico e vínculo de mais de um provedor de login na mesma conta.
