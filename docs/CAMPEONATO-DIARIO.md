# Campeonato Diario - arquitetura e decisoes

Documento tecnico da modalidade competitiva do Palavra Livre.
O Jogo Livre continua exatamente como estava: partidas ilimitadas, sem
backend, sem login e com sorteio no proprio navegador.

---

## 1. Analise da arquitetura anterior

O projeto era 100% frontend:

| Camada | Como estava |
| --- | --- |
| Estado do jogo | `src/hooks/useGame.ts` concentrava boards, tentativas, status e ciclo |
| Regras dos modos | `src/utils/constants.ts` (`MODE_CONFIG`) |
| Avaliacao de letras | `src/utils/evaluateGuess.ts` |
| Normalizacao | `src/utils/normalizeWord.ts` (acentos e cedilha) |
| Sorteio | `src/utils/getRandomWords.ts` + `wordHistory.ts` (historico em localStorage) |
| Persistencia | `src/hooks/useLocalStorage.ts` |
| Base de palavras | `src/data/validWords.json` (11.433) e `answers.json` (2.657) |
| Apresentacao | `Board`, `Row`, `Tile`, `Keyboard`, `ModeSelector`, modais |
| Testes | `src/utils/evaluateGuess.test.ts` |
| Rotas | nao existiam: `App.tsx` renderizava uma unica tela |

**O que foi reaproveitado sem alteracao:** `evaluateGuess`, `normalizeWord`,
`guessInput`, `keyboardStatus`, `Board`, `Row`, `Tile`, `Keyboard`, o CSS de
tabuleiro e teclado, e toda a base de palavras.

**Riscos identificados antes de comecar:**

1. `GameBoardGrid` usa `board.answer` como `key`. No campeonato a resposta e
   desconhecida, entao seria impossivel reutiliza-lo diretamente.
   Solucao: `ChampionshipBoardGrid`, que chaveia por `boardIndex` e reusa `Board`.
2. `useGame` mistura sorteio, avaliacao e pontuacao com o estado de UI.
   Como no campeonato tudo isso e do servidor, `useGame` nao foi tocado:
   a modalidade tem o proprio hook (`useChampionship`).
3. `html, body { overflow: hidden }` impede rolagem. As telas do campeonato
   precisam rolar, entao ganharam containers proprios com `overflow-y: auto`.

---

## 2. Arquitetura da nova modalidade

```
Navegador                          Supabase (Postgres)
-----------------------------      ------------------------------------
useChampionship  ──┐
                   ├─► ChampionshipService ──► POST /rest/v1/rpc/cd_*
paineis/telas    ──┘        (fetch puro)              │
                                                      ▼
                                        funcoes SECURITY DEFINER
                                        (validam, avaliam, pontuam)
                                                      │
                                                      ▼
                                        tabelas protegidas por RLS
                                        championship_answers: sem policy
```

### Decisoes tecnicas

**Logica sensivel em funcoes SQL (RPC), nao em Edge Functions.**
Cada tentativa precisa ler o estado da rodada, avaliar, gravar e pontuar de
forma atomica. Em plpgsql isso e uma unica transacao com `SELECT ... FOR UPDATE`;
com Edge Function seriam varias chamadas de rede com controle manual de
concorrencia. Alem disso, o deploy passa a ser so `supabase db push`.

**Cliente Supabase escrito com `fetch`, sem `@supabase/supabase-js`.**
Como todo acesso passa por RPC, o app so precisa de dois endpoints:
`/auth/v1` (sessao anonima e refresh) e `/rest/v1/rpc`. Sao ~250 linhas em
`src/championship/supabaseClient.ts` e o projeto continua com zero dependencias
de runtime alem de React, atendendo ao pedido de evitar bibliotecas
desnecessarias.

**Identificacao por sessao anonima + nome de exibicao.**
`signInAnonymously` cria um `auth.users` real, com `user_id` estavel e token
JWT — ou seja, RLS e `auth.uid()` funcionam normalmente. O participante so
digita um nome. A troca para magic link exige mudar apenas
`SupabaseChampionshipService.signIn`, sem tocar em banco ou telas.
Limitacao aceita e documentada: limpar o storage do navegador cria uma nova
identidade. Como a inscricao acontece antes do inicio e o campeonato tem
horario fixo, isso nao permite jogar duas vezes de forma util.

**Roteador proprio (`src/router/router.tsx`).**
80 linhas sobre a History API, com `useSyncExternalStore`. Mantem URLs
compartilhaveis e o botao voltar sem adicionar `react-router-dom`.

**Maquina de status sem cron.**
`cd_refresh_championship_status` roda no inicio de toda RPC de jogo e compara
`now()` do banco com os horarios do campeonato. O relogio do dispositivo nunca
decide nada: a contagem regressiva da sala de espera e apenas visual e o
estado real vem do servidor a cada sincronizacao.

**Motor local espelhado (`src/championship/localEngine.ts`).**
Reimplementa as mesmas regras em TypeScript. Serve para os testes de
integracao e concorrencia rodarem sem um Postgres. Nao substitui o backend:
e o espelho executavel das regras, e qualquer mudanca de regra deve ser feita
nos dois lugares (o teste de pontuacao quebra se divergirem).

---

## 3. Arquivos criados

### Backend

| Arquivo | Conteudo |
| --- | --- |
| `supabase/migrations/20260806000100_championship_schema.sql` | enums, tabelas, restricoes, indices, `updated_at` |
| `supabase/migrations/20260806000200_championship_core_functions.sql` | `cd_normalize_word`, `cd_evaluate_guess`, `cd_calculate_round_score`, `cd_word_is_accepted`, `cd_is_admin`, `cd_round_blueprint` |
| `supabase/migrations/20260806000300_championship_lifecycle.sql` | sorteio, ranking, encerramento, auto-encerramento, maquina de status, recalculo de totais |
| `supabase/migrations/20260806000400_championship_player_rpc.sql` | `cd_get_state`, `cd_register`, `cd_cancel_registration`, `cd_abandon_championship`, `cd_start_round`, `cd_submit_attempt`, `cd_leaderboard`, `cd_championship_results`, `cd_championship_history`, `cd_my_stats` |
| `supabase/migrations/20260806000500_championship_admin_rpc.sql` | criacao, horarios, status, novo sorteio, recalculo, visao geral, config |
| `supabase/migrations/20260806000600_championship_security.sql` | RLS, policies, grants, trigger de perfil |
| `supabase/seed/palavras.sql` | base de palavras (gerado) |
| `supabase/README.md` | como aplicar e operar |
| `scripts/gerar-seed-palavras.mjs` | gera o seed a partir dos JSONs do jogo |

### Frontend

| Arquivo | Conteudo |
| --- | --- |
| `src/championship/config.ts` | nome da modalidade, rotas, rotulos, pontuacao, fuso |
| `src/championship/types.ts` | tipos do dominio |
| `src/championship/errors.ts` | `ChampionshipError` e mensagens em PT-BR |
| `src/championship/scoring.ts` | pontuacao e bonus (puro) |
| `src/championship/ranking.ts` | criterios de classificacao e desempate (puro) |
| `src/championship/format.ts` | datas, horas, duracao e contagem no fuso oficial |
| `src/championship/share.ts` | texto de compartilhamento |
| `src/championship/supabaseClient.ts` | cliente HTTP e sessao |
| `src/championship/service.ts` | interface `ChampionshipService` e implementacao Supabase |
| `src/championship/localEngine.ts` | motor local espelhado + adaptador |
| `src/championship/useChampionship.ts` | estado do campeonato e `useCountdown` |
| `src/championship/useRoundInput.ts` | digitacao e animacao de revelacao |
| `src/championship/championship.css` | estilos da modalidade |
| `src/championship/components/*` | `ChampionshipBoardGrid`, `Countdown`, `LeaderboardTable`, `Podium`, `RoundProgress` |
| `src/championship/panels/*` | `JoinPanel`, `LobbyPanel`, `RoundPanel`, `ResultsPanel` |
| `src/championship/pages/*` | `ChampionshipPage`, `LeaderboardPage`, `HistoryPage`, `AdminPage` |
| `src/components/SiteHeader.tsx` | cabecalho das telas do campeonato |
| `src/pages/HomePage.tsx` | escolha entre Jogo Livre e Campeonato |
| `src/pages/FreePlayPage.tsx` | o Jogo Livre, extraido do antigo `App.tsx` |
| `src/router/router.tsx` | roteador |
| `.env.example`, `vercel.json`, `public/_redirects` | configuracao e deploy |

### Testes

`src/championship/scoring.test.ts`, `ranking.test.ts`, `share.test.ts`,
`localEngine.test.ts`.

## 4. Arquivos alterados

| Arquivo | Alteracao |
| --- | --- |
| `src/App.tsx` | virou shell de rotas + tema. Todo o conteudo do jogo foi para `FreePlayPage` sem mudanca de comportamento |
| `src/main.tsx` | importa o CSS da modalidade |
| `package.json` | scripts `typecheck` e `seed:palavras` |
| `README.md` | documentacao da nova modalidade |

**Nao foram alterados:** `useGame.ts`, `evaluateGuess.ts`, `normalizeWord.ts`,
`guessInput.ts`, `keyboardStatus.ts`, `storage.ts`, `wordHistory.ts`,
`getRandomWords.ts`, `constants.ts`, `Board`, `Row`, `Tile`, `Keyboard`,
`ModeSelector`, `Header`, os modais, `styles.css` e os JSONs de palavras.

---

## 5. Modelagem do banco

```
profiles (id = auth.users.id, display_name)
   │
   └─< championship_participants >── championships ──< championship_rounds ──< championship_answers
                    │                                          │                    (protegida)
                    └─< participant_rounds >───────────────────┘
                              │
                              └─< participant_attempts
```

### Restricoes que garantem as regras

| Restricao | Regra que protege |
| --- | --- |
| `championships_one_official_per_date` (unique parcial) | um campeonato oficial por dia |
| `championship_answers (championship_round_id, board_index)` | um tabuleiro por posicao |
| `championship_answers (championship_id, normalized_answer)` | sem palavra repetida no mesmo campeonato |
| `championship_participants (championship_id, user_id)` | uma inscricao por pessoa |
| `championship_participants (championship_id, normalized_display_name)` | sem dois nomes iguais no mesmo dia |
| `participant_rounds (participant_id, round_id)` | uma participacao por modalidade |
| `participant_attempts (participant_round_id, attempt_number)` | sem contagem duplicada de tentativa |
| `participant_attempts (participant_round_id, normalized_word)` | sem repetir a mesma palavra na modalidade |
| `championships_window_check` | abertura < fechamento <= inicio |

### Formato de `participant_attempts.evaluation`

```json
[
  {
    "boardIndex": 0,
    "solved": true,
    "letters": [
      { "letter": "c", "status": "correct" },
      { "letter": "o", "status": "correct" },
      { "letter": "ç", "status": "correct" },
      { "letter": "a", "status": "correct" },
      { "letter": "r", "status": "correct" }
    ]
  }
]
```

Tabuleiros ja resolvidos nao aparecem na avaliacao das tentativas seguintes —
mesmo comportamento do Jogo Livre.

---

## 6. Pontuacao

```
pontuacao da modalidade = palavrasResolvidas x 100
se resolveu todas:        pontuacao += tentativasRestantes x 10
```

| Modalidade | Palavras | Tentativas | Base maxima | Bonus maximo |
| --- | --- | --- | --- | --- |
| Simples | 1 | 6 | 100 | 50 |
| Dueto | 2 | 7 | 200 | 50 |
| Quarteto | 4 | 9 | 400 | 50 |
| Sexteto | 6 | 12 | 600 | 60 |
| **Total** | **13** | **34** | **1.300** | **210** |

Exemplo oficial: Quarteto resolvido em 6 de 9 tentativas = 400 + 3x10 = **430**.

Calculada em `cd_calculate_round_score` no momento em que a modalidade fecha.
Os valores vem de `championship_config`, entao mudar a regra e um `UPDATE`.
`src/championship/scoring.ts` espelha a formula para exibicao e testes.

---

## 7. Classificacao e desempate

1. maior pontuacao total
2. maior numero de palavras descobertas
3. maior numero de modalidades completamente concluidas
4. menor quantidade de tentativas utilizadas
5. menor tempo total de jogo
6. **desempate tecnico:** quem concluiu o campeonato primeiro (`finished_at`;
   quem nao concluiu vai para o fim)
7. **desempate final determinista:** menor identificador da participacao (`id`)

O criterio 7 nunca produz empate porque o `id` e unico. Ele existe para que a
mesma lista sempre gere a mesma ordem, independentemente do plano de execucao
do Postgres ou da ordem de chegada dos dados no frontend.

Implementado em `cd_consolidate_ranking` e espelhado em
`src/championship/ranking.ts`.

---

## 8. Seguranca

### O que o servidor valida em toda tentativa

campeonato existe · status e `IN_PROGRESS` · participante inscrito e nao
cancelado · rodada pertence ao campeonato · rodadas anteriores fechadas ·
rodada iniciada e ainda aberta · restam tentativas · palavra tem 5 letras ·
palavra esta em `championship_valid_words` · palavra ainda nao foi tentada
nesta modalidade.

### O que o cliente nunca envia

pontuacao · palavras resolvidas · posicao · tempo total · respostas ·
indicacao de acerto. Todos esses valores sao calculados no banco.

### Politicas RLS

| Tabela | Leitura pelo participante |
| --- | --- |
| `profiles` | apenas o proprio |
| `championships`, `championship_rounds` | publica (nao contem respostas) |
| `championship_answers` | **nenhuma** — sem policy, invisivel ao PostgREST |
| `championship_participants` | apenas a propria inscricao |
| `participant_rounds`, `participant_attempts` | apenas as proprias |
| `championship_admins`, `championship_config`, `championship_word_pool`, `championship_valid_words` | nenhuma |

Detalhe importante: essas tabelas **nao** usam `FORCE ROW LEVEL SECURITY`.
Com `FORCE`, as proprias funcoes `SECURITY DEFINER` passariam a respeitar as
policies e, como nao ha policy alguma, o servidor deixaria de enxergar as
respostas. A protecao vem de RLS habilitada + ausencia de policy + `REVOKE`
explicito para `anon` e `authenticated`.

### Ocultacao das respostas

Uma resposta so chega ao cliente quando:

- o tabuleiro daquela resposta foi resolvido; **ou**
- a modalidade do participante fechou (`COMPLETED`, `FAILED`, `EXPIRED`); **ou**
- o campeonato inteiro esta `FINISHED`.

Ate la, `board.answer` vem `null` no payload. Nao existe bundle, JSON,
estado inicial ou requisicao que carregue a lista completa.

### Reducao de compartilhamento

horario de inicio unico · inscricoes fechadas antes do inicio · entrada tardia
desabilitada por padrao (`allow_late_registration`) · classificacao parcial sem
pontuacao durante o evento · tentativas de terceiros nunca expostas ·
compartilhamento sem resultado enquanto o campeonato roda · horarios de inicio,
tentativa e conclusao registrados.

---

## 9. Concorrencia

| Risco | Protecao |
| --- | --- |
| Duas tentativas com o mesmo numero | `SELECT ... FOR UPDATE` na participacao + unique `(participant_round_id, attempt_number)` |
| Tentativa contada duas vezes | mesma trava; `attempts_used` so avanca dentro da transacao |
| Pontuacao calculada duas vezes | `status` sai de `IN_PROGRESS` na mesma transacao; nova tentativa e recusada com `ROUND_ALREADY_FINISHED` |
| Avanco duplicado de rodada | `cd_start_round` e idempotente (`on conflict do update`) e checa ordem |
| Duas finalizacoes simultaneas | `cd_finish_championship` trava o campeonato com `FOR UPDATE` e sai cedo se ja encerrado |
| Classificacao inconsistente | `cd_consolidate_ranking` roda em uma unica instrucao com `row_number()` |
| Recalculo revertendo estado | `CANCELLED` e `ABANDONED` sao terminais em `cd_recalculate_participant_totals` |

---

## 10. Ausencia, abandono e reconexao

Nada de relevante vive no `localStorage` do campeonato — apenas o token da
sessao. `cd_get_state` reconstroi tudo: campeonato, participante, rodada atual,
tentativas ja feitas (com as cores), tabuleiros resolvidos, pontuacao parcial
permitida e status.

Fechar a aba, perder conexao, recarregar ou trocar de dispositivo devolvem o
jogador ao mesmo ponto. `cd_start_round` chamado de novo nao apaga tentativas
nem sorteia palavras diferentes.

---

## 11. Como renomear a modalidade

Edite apenas `src/championship/config.ts`:

```ts
export const CHAMPIONSHIP_BRAND = {
  name: "Palavra Livre Arena",
  shortName: "Arena",
  eventLabel: "torneio",
  routeBase: "/arena",
  ...
};
```

Textos, titulos, navegacao, compartilhamento e **todas as rotas** acompanham.
Para o nome gravado em cada campeonato, use o parametro `p_name` de
`cd_admin_create_championship` ou altere o default da coluna `championships.name`.

---

## 12. Funcionalidades futuras

A modelagem ja suporta, sem migration nova:

- limites de tempo por etapa (`championship_rounds.time_limit_seconds`)
- entrada tardia (`championship_config.allow_late_registration`)
- campeonatos nao oficiais / amistosos (`championships.is_official`)
- ranking semanal e mensal (agregacao sobre `championship_participants`)
- sequencia de participacoes e de vitorias
- media de colocacao, melhor tempo, total de palavras (parcialmente em `cd_my_stats`)

Precisam de trabalho adicional:

- Supabase Realtime para a sala de espera e o ranking ao vivo
- notificacao de inicio (push ou e-mail)
- vinculo de e-mail a uma conta anonima, para recuperar identidade
- exportacao do historico
- modalidades extras no campeonato (basta inserir linhas em `cd_round_blueprint`)
- badge visual de campeao no perfil
