# Palavra Livre

Palavra Livre e um jogo web em PT-BR de adivinhar palavras de 5 letras. Ele se inspira no formato de jogos como Wordle/Termo, mas tem uma proposta propria: nao existe limite diario. O jogador pode clicar em **Jogar novamente** e iniciar novas partidas quantas vezes quiser.

## Modos de jogo

- **Simples**: 1 palavra secreta, 6 tentativas.
- **Dueto**: 2 palavras secretas simultaneas, 7 tentativas.
- **Quarteto**: 4 palavras secretas simultaneas, 9 tentativas.
- **Sexteto**: 6 palavras secretas simultaneas, 12 tentativas.

A mesma tentativa e aplicada a todos os tabuleiros ativos. Quando um tabuleiro e resolvido, ele para de receber novas linhas avaliadas.

## Tecnologias

- React
- TypeScript
- Vite
- CSS puro
- Vitest
- localStorage

O jogo nao usa backend, banco de dados ou API externa em runtime.

## Instalar

```bash
npm install
```

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

## Testar

```bash
npm run test
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

Fluxo:

1. Baixe os arquivos `lexico`, `listas/verbos`, `conjugacoes` e `icf` do repositorio `fserb/pt-br` para `word-sources/`.
2. Salve como `fserb-pt-br-lexico.txt`, `fserb-lista-verbos.txt`, `fserb-pt-br-conjugacoes.txt` e `fserb-pt-br-icf.txt`.
3. Ajuste `scripts/blocklist.txt` para termos que nao devem entrar nem como tentativa.
4. Ajuste `scripts/answer-blocklist.txt` para palavras que nao devem ser sorteadas como resposta.
5. Ajuste `scripts/answers-curadas.txt`, se quiser priorizar respostas manuais.
6. Rode:

```bash
python scripts/preparar-palavras.py
```

O script normaliza acentos, transforma `ç` em `c`, remove duplicadas, filtra apenas palavras de 5 letras e gera os JSONs finais. As tentativas aceitas ficam normalizadas em `validWords.json`; as respostas preservam a grafia da fonte quando houver acento ou cedilha, como `coçar`, `açude` e `órgão`. Na comparação, o jogo continua ignorando acentos e cedilha, entao digitar `cocar` pode acertar e revelar `coçar`.

As tentativas aceitas saem da uniao de `lexico`, `verbos`, `conjugacoes` e `icf`. As respostas usam essa mesma base, mas filtram palavras automaticas por pontuacao ICF maxima `17.0`, priorizando termos mais comuns. A blocklist manual continua removendo termos que nao devem ser sorteados.

Base atual gerada:

- `validWords.json`: 11.301 palavras aceitas.
- `answers.json`: 5.817 respostas sorteaveis.

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

### Vercel

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`

### Netlify

- Build command: `npm run build`
- Publish directory: `dist`

## Licenca

MIT. Confira tambem as licencas das fontes usadas para gerar as listas de palavras.


