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

O MVP nao usa backend, banco de dados ou API externa em runtime.

## Instalar

```bash
npm install
```

## Rodar localmente

```bash
npm run dev
```

Depois abra o endereco exibido pelo Vite, normalmente `http://localhost:5173`.

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

## Trocar a lista de palavras

Os dados ficam em:

- `src/data/validWords.json`: palavras aceitas como tentativa.
- `src/data/answers.json`: palavras que podem ser sorteadas como resposta.

Para gerar as listas a partir de uma fonte maior:

1. Coloque a lista bruta em `palavras-originais.txt`, na raiz do projeto.
2. Ajuste `scripts/blocklist.txt` com palavras proibidas, se necessario.
3. Ajuste `scripts/answers-curadas.txt` com respostas boas e comuns, se quiser uma lista menor e curada.
4. Rode:

```bash
python scripts/preparar-palavras.py
```

O script normaliza acentos, transforma `ç` em `c`, remove duplicadas e filtra apenas palavras de 5 letras.

## Fonte recomendada das palavras

A fonte principal recomendada e o lexico `fserb/pt-br`, disponibilizado sob licenca MIT. Use essa base para gerar `validWords.json` e mantenha `answers.json` como uma selecao manualmente curada, evitando termos ofensivos, nomes proprios, siglas e palavras raras demais.

Veja mais detalhes em [WORDS_SOURCE.md](WORDS_SOURCE.md).

## Deploy

### Vercel

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`

### Netlify

- Build command: `npm run build`
- Publish directory: `dist`

## Prints

Secao reservada para imagens futuras da interface.

## Licenca

MIT. Confira tambem a licenca da fonte de palavras usada para gerar as listas finais.
