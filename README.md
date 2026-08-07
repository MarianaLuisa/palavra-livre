# Palavra Livre

Palavra Livre e um jogo web em PT-BR de adivinhar palavras de 5 letras. Ele se inspira no formato de jogos como Wordle/Termo, mas tem uma proposta propria: nao existe limite diario.

Sao **duas formas de jogar**:

| | Jogo Livre | Campeonato Diario |
| --- | --- | --- |
| Partidas | ilimitadas | uma por dia |
| Palavras | sorteadas no seu navegador | as mesmas para todo mundo |
| Modalidades | escolha livre | Simples, Dueto, Quarteto e Sexteto em sequencia |
| Login | nao precisa | nome de exibicao |
| Ranking | nao tem | classificacao, podio e campeao do dia |
| Backend | nenhum | Supabase (opcional na instalacao) |

O Jogo Livre continua funcionando sozinho. Sem as variaveis de ambiente do
Supabase, o app roda normalmente e o campeonato apenas informa que nao esta
configurado.

## Contas e progresso

Criar uma conta e opcional. Com ela, cada partida concluida entra no seu
historico e voce acompanha a evolucao ao longo do mes.

- **Cadastro** em `/cadastro`: nome de usuario, e-mail e senha.
- **Login** em `/login`, com recuperacao de senha em `/recuperar-senha`.
- **Meu progresso** em `/progresso`: calendario mensal, sequencia de dias,
  resumo do mes e desempenho por modo.
- **Estatisticas** em `/estatisticas`: por periodo e comparacao entre meses.
- **Perfil** em `/perfil` e historico de campeonatos em `/campeonatos/historico`.

O nome de usuario e unico, sem diferenciar maiusculas: `Mariana` e `mariana`
nao podem pertencer a pessoas diferentes.

Autenticacao e Supabase Auth com e-mail e senha. O projeto nao guarda senha em
lugar nenhum: nao existe tabela de senhas e nada vai para o localStorage alem
do token de sessao.

**Quem ja jogava sem conta nao perde nada.** Ao criar a conta no mesmo
navegador, a sessao anonima e convertida preservando o mesmo identificador, e
o historico e as inscricoes no campeonato continuam seus.

Detalhes de arquitetura, RLS e regra de sequencia em
[docs/CONTAS-E-PROGRESSO.md](docs/CONTAS-E-PROGRESSO.md).

### O que conta como dia jogado

Pelo menos uma partida concluida, em qualquer modo, ou uma etapa do Campeonato
Diario efetivamente jogada. Abrir e abandonar nao conta. A data e a do servidor,
em `America/Sao_Paulo`, e todas as estatisticas sao calculadas no banco: o
navegador nunca envia vitorias, sequencia ou pontuacao.

## Modos de jogo

- **Simples**: 1 palavra secreta, 6 tentativas.
- **Dueto**: 2 palavras secretas simultaneas, 7 tentativas.
- **Quarteto**: 4 palavras secretas simultaneas, 9 tentativas.
- **Sexteto**: 6 palavras secretas simultaneas, 12 tentativas.

A mesma tentativa e aplicada a todos os tabuleiros ativos. Quando um tabuleiro e resolvido, ele para de receber novas linhas avaliadas.

## Campeonato Diario

Um campeonato oficial por dia. Todos os participantes recebem exatamente as
mesmas 13 palavras e jogam as quatro modalidades na mesma ordem.

**Fluxo:** inscricoes abrem → participante entra com o nome → sala de espera com
contagem regressiva → inicio no horario definido → Simples → Dueto → Quarteto →
Sexteto → apuracao → campeao, podio e classificacao completa.

Nao ha eliminacao: quem vai mal em uma etapa joga as seguintes do mesmo jeito.

**Pontuacao**

```
pontuacao da modalidade = palavrasResolvidas x 100
se resolveu todas:        pontuacao += tentativasRestantes x 10
```

Maximo base: 13 palavras x 100 = **1.300 pontos**, mais ate 210 de bonus.
Exemplo: Quarteto resolvido em 6 de 9 tentativas = 400 + 3x10 = 430 pontos.

**Desempate**, nesta ordem: pontuacao total, palavras descobertas, modalidades
concluidas, menor numero de tentativas, menor tempo total, horario de conclusao
e, por fim, o identificador da participacao. O tempo nunca e o criterio principal.

**Seguranca:** as respostas ficam apenas no servidor e so sao reveladas quando o
tabuleiro e resolvido, quando a modalidade do participante termina ou quando o
campeonato encerra. Pontuacao, palavras resolvidas, posicao e tempo sao
calculados no banco; o navegador nunca envia esses valores.

Detalhes de arquitetura, modelagem, RLS e decisoes tecnicas estao em
[docs/CAMPEONATO-DIARIO.md](docs/CAMPEONATO-DIARIO.md).

### Rotas

| Rota | Tela |
| --- | --- |
| `/` | escolha entre Jogo Livre e Campeonato |
| `/jogo-livre` | jogo tradicional ilimitado |
| `/campeonato` | inscricao, sala de espera, rodada ou resultado |
| `/campeonato/classificacao` | classificacao |
| `/campeonato/historico` | campeonatos anteriores e estatisticas |
| `/campeonato/admin` | administracao (exige permissao no banco) |

Para renomear a modalidade (por exemplo para "Palavra Livre Arena"), edite
apenas `src/championship/config.ts`. Textos, navegacao e rotas acompanham.

## Tecnologias

- React
- TypeScript
- Vite
- CSS puro
- Vitest
- localStorage (Jogo Livre)
- Supabase / PostgreSQL (Campeonato Diario)

O Jogo Livre nao usa backend, banco de dados ou API externa em runtime.
O campeonato usa Supabase, e o acesso e feito com `fetch` puro: o projeto
continua sem nenhuma dependencia de runtime alem do React.

## Requisitos

- Node.js 20 ou superior
- Um projeto Supabase, apenas se quiser o Campeonato Diario

## Instalar

```bash
npm install
```

## Variaveis de ambiente

Copie `.env.example` para `.env.local`:

```bash
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon
```

Use sempre a chave **anon**, nunca a `service_role`: ela ignora RLS e daria
acesso as respostas do campeonato.

Sem essas variaveis o Jogo Livre funciona normalmente.

## Configurar o Supabase

Estes passos sao manuais, no dashboard. Nenhum e feito por migration.

1. Crie o projeto em [supabase.com](https://supabase.com).
2. Ligue `Authentication > Providers > Anonymous sign-ins` (campeonato sem conta).
3. Ligue `Authentication > Providers > Email` (contas permanentes).
   `Confirm email` pode ficar ligado ou desligado: o app trata os dois casos.
4. Em `Authentication > URL Configuration`, defina a **Site URL** de producao e
   adicione em **Redirect URLs**:

   ```
   http://localhost:5173/recuperar-senha
   https://SEU-DOMINIO/recuperar-senha
   ```

   Sem isso o link de recuperacao de senha nao volta para a tela certa.
5. Aplique as migrations e a base de palavras (secao abaixo).
6. Cadastre um administrador:

```sql
insert into championship_admins (user_id) values ('SEU-USER-UUID');
```

7. Copie URL e chave anon de `Project Settings > API` para o `.env.local`.

Passo a passo completo em [supabase/README.md](supabase/README.md).

## Migrations

```bash
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

Depois carregue a base de palavras no servidor:

```bash
npm run seed:palavras
psql "$DATABASE_URL" -f supabase/seed/palavras.sql
```

O seed espelha `src/data/validWords.json` e `src/data/answers.json` para as
tabelas `championship_valid_words` e `championship_word_pool`. Rode de novo
sempre que atualizar a base de palavras do jogo.

## Criar o primeiro campeonato

Pelo painel em `/campeonato/admin`, botao **Criar campeonato de hoje**, ou por SQL:

```sql
select cd_admin_create_championship();
```

Horarios padrao: inscricoes das 09h ate 19h55 e inicio as 20h, no fuso
`America/Sao_Paulo`. A funcao ja cria as quatro modalidades e sorteia as 13
palavras no servidor.

As transicoes de status acontecem sozinhas, comparando `now()` do banco com os
horarios do campeonato. Nao e necessario cron.

## Painel administrativo

A tela `/campeonato/admin` permite operar o campeonato sem abrir o SQL Editor:

- painel do campeonato do dia com status, horarios e contadores de participantes;
- **Comecar agora**: antecipa o inicio para o instante atual do servidor;
- edicao dos tres horarios em hora de Brasilia;
- acoes rapidas para testar: abrir/fechar inscricoes, iniciar em 5 ou 10 minutos;
- acompanhamento das quatro rodadas e da situacao de cada participante;
- resultado final com campeao, podio e ranking;
- cancelar ou finalizar o campeonato, com confirmacao.

### Comecar agora

O botao aparece quando o campeonato esta `SCHEDULED`, `REGISTRATION_OPEN` ou
`WAITING`. Ao confirmar, o servidor encerra as inscricoes, move `starts_at` para
`now()` e ativa as rodadas.

O que **nao** muda: as 13 palavras ja sorteadas, as inscricoes existentes, as
rodadas, as tentativas e as pontuacoes. Chamar duas vezes nao causa efeito
duplicado.

Detalhe importante: o status do campeonato e derivado do relogio do banco. Por
isso a acao antecipa o horario de inicio em vez de so gravar o status — do
contrario a proxima leitura desfaria a mudanca.

### Autorizacao

A tela fica acessivel por URL, mas todas as acoes chamam `cd_require_admin()` no
banco, que confere `auth.uid()` contra `championship_admins`. Quem nao for
administrador ve a mensagem de acesso restrito, e uma chamada manual a qualquer
RPC `cd_admin_*` retorna erro de permissao.

As respostas do campeonato nunca acompanham a visao geral. Elas saem apenas por
`cd_admin_championship_answers`, que exige administrador e status `FINISHED`.

## Rodar localmente

```bash
npm run dev
```

Depois abra o endereco exibido pelo Vite, normalmente `http://localhost:5173`.

## Jogabilidade

- Clique em uma celula da linha atual para escolher a posicao ativa.
- Digite no teclado fisico ou no teclado virtual.
- A letra entra na celula ativa e o foco avanca automaticamente.
- Clique em uma celula preenchida para substituir a letra.
- Use Backspace para apagar a celula ativa ou a anterior.
- Use setas esquerda/direita para mover a celula ativa.
- Ao enviar uma palavra valida, as letras sao reveladas uma por uma.

## Historico de respostas

O Palavra Livre salva no localStorage quais respostas ja foram sorteadas. Enquanto houver respostas disponiveis, novas partidas evitam repetir palavras ja usadas. Quando a lista se esgota para o tamanho do modo atual, o historico e reiniciado automaticamente.

Esse historico e local ao navegador do jogador e nao depende de servidor.

No Campeonato Diario a logica e outra: o sorteio roda no banco
(`cd_draw_championship_words`), evita palavras usadas nos ultimos 60 dias e
nunca repete uma palavra dentro do mesmo campeonato.

## Testar

```bash
npm run test
```

A suite cobre normalizacao, letras repetidas, pontuacao, bonus, criterios de
desempate, ordenacao da classificacao, validacao de tentativas, limites,
avanco entre rodadas, restauracao de estado, ocultacao de respostas,
encerramento e cenarios de duplicacao e concorrencia.

Os testes de integracao rodam sobre `src/championship/localEngine.ts`, que
espelha as regras das funcoes SQL. Assim a suite nao precisa de um Postgres.
Ao mudar uma regra, altere os dois lados: a migration e o motor local.

Checagem de tipos isolada:

```bash
npm run typecheck
```

## Build de producao

```bash
npm run build
```

Para inspecionar o build:

```bash
npm run preview
```

## Atualizar a base oficial de palavras

Os dados finais ficam em:

- `src/data/validWords.json`: palavras aceitas como tentativa.
- `src/data/answers.json`: palavras que podem ser sorteadas como resposta.

As fontes brutas devem ficar em `word-sources/`. Essa pasta aceita arquivos locais e os arquivos brutos sao ignorados pelo Git.

Fonte principal atual:

- `fserb/pt-br`: corpus PT-BR sob licenca MIT, a mesma fonte indicada pelo Termo.
- Arquivos usados para a base do jogo: `lexico`, `listas/verbos`, `conjugacoes` e `icf`.
- `hermitdave/FrequencyWords`: lista de frequencia PT-BR derivada do OpenSubtitles, usada somente como sinal auxiliar de palavras comuns na geracao das respostas.
- `wordfreq`: biblioteca usada apenas no script de preparacao para cortar respostas raras demais.
- `word-sources/termo-respostas-historicas.txt`: lista publica de respostas historicas do Termo, usada como nucleo curado quando presente.

Fluxo:

1. Baixe os arquivos `lexico`, `listas/verbos`, `conjugacoes` e `icf` do repositorio `fserb/pt-br` para `word-sources/`.
2. Salve como `fserb-pt-br-lexico.txt`, `fserb-lista-verbos.txt`, `fserb-pt-br-conjugacoes.txt` e `fserb-pt-br-icf.txt`.
3. Opcionalmente, baixe `pt_br_50k.txt` de `hermitdave/FrequencyWords` e salve como `word-sources/frequencywords-pt_br-50k.txt`.
4. Opcionalmente, salve uma lista historica/curada do Termo como `word-sources/termo-respostas-historicas.txt`.
5. Ajuste `scripts/blocklist.txt` para termos que nao devem entrar nem como tentativa.
6. Ajuste `scripts/answer-blocklist.txt` para palavras que nao devem ser sorteadas como resposta.
7. Ajuste `scripts/answers-curadas.txt`, se quiser priorizar respostas manuais.
8. Rode:

```bash
python scripts/preparar-palavras.py
```

O script normaliza acentos, transforma `ç` em `c`, remove duplicadas, filtra apenas palavras de 5 letras e gera os JSONs finais. As tentativas aceitas ficam normalizadas em `validWords.json`; as respostas preservam a grafia da fonte quando houver acento ou cedilha, como `coçar`, `açude` e `órgão`. Na comparação, o jogo continua ignorando acentos e cedilha, entao digitar `cocar` pode acertar e revelar `coçar`.

As tentativas aceitas saem da uniao de `lexico`, `verbos`, `conjugacoes`, `icf` e listas curadas locais. As respostas sao mais restritas: usam a lista historica/curada do Termo como nucleo, complementam apenas com palavras que passam por cortes de frequencia (`wordfreq`/`FrequencyWords`) e respeitam `scripts/answer-blocklist.txt`.

Base atual gerada:

- `validWords.json`: 11.433 palavras aceitas.
- `answers.json`: 2.657 respostas sorteaveis.

Veja detalhes em [WORDS_SOURCE.md](WORDS_SOURCE.md).
## GitHub

Depois de criar um repositorio remoto:

```bash
git remote add origin URL_DO_REPOSITORIO
git branch -M main
git push -u origin main
```

Para subir atualizacoes futuras:

```bash
git status
git add .
git commit -m "Describe the change"
git push
```

## Deploy

O app usa rotas reais (History API), entao o host precisa devolver
`index.html` para qualquer caminho. Os arquivos de configuracao ja estao no
repositorio: `vercel.json` e `public/_redirects`.

### Vercel

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
- Rewrite para SPA: ja configurado em `vercel.json`

### Netlify

- Build command: `npm run build`
- Publish directory: `dist`
- Environment variables: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
- Redirect para SPA: ja configurado em `public/_redirects`

### Checklist de producao

1. Migrations aplicadas (`supabase db push`).
2. `supabase/seed/palavras.sql` carregado.
3. Login anonimo habilitado no Supabase.
4. Login por e-mail habilitado no Supabase.
5. Site URL e Redirect URLs configuradas, incluindo `/recuperar-senha`.
6. Pelo menos um registro em `championship_admins`.
7. Variaveis de ambiente com a chave **anon** (nunca a `service_role`).
8. Campeonato do dia criado.
9. Conferido que `select * from championship_answers` como `authenticated`
   nao retorna nada.
10. Conferido que `select * from player_games` como `authenticated` retorna
    apenas as proprias linhas.

### Variaveis no Vercel

Nenhuma variavel nova. As duas existentes continuam servindo:

| Nome | Onde | Tipo |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Vercel > Settings > Environment Variables | publica |
| `VITE_SUPABASE_ANON_KEY` | Vercel > Settings > Environment Variables | publica |

Toda variavel `VITE_*` vai para o navegador. **Nunca** coloque a
`service_role` nem qualquer secret em variavel `VITE_*`: ela ignora RLS e
daria acesso as respostas do campeonato e ao historico de todo mundo.

Lembre de incluir o dominio do Vercel nas Redirect URLs do Supabase, senao a
recuperacao de senha nao funciona em producao.

## Licenca

MIT. Confira tambem as licencas das fontes usadas para gerar as listas de palavras.


