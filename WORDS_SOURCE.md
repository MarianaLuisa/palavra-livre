# Fonte de palavras

## Fonte principal

A base de palavras atual do Palavra Livre segue a mesma fonte indicada pelo Termo: o repositorio `fserb/pt-br`, disponivel sob licenca MIT.

- https://github.com/fserb/pt-br
- https://github.com/fserb/pt-br/tree/master

O jogo nao acessa essa fonte em runtime. O arquivo bruto fica em `word-sources/` apenas para preparacao local, e os JSONs finais ficam versionados em `src/data/`.

## Arquivos usados

- `word-sources/fserb-pt-br-lexico.txt`: copia local do arquivo `lexico` do `fserb/pt-br`.
- `word-sources/fserb-lista-verbos.txt`: copia local de `listas/verbos`.
- `word-sources/fserb-pt-br-conjugacoes.txt`: copia local de `conjugacoes`.

## Arquivos gerados

- `src/data/validWords.json`: palavras aceitas como tentativas.
- `src/data/answers.json`: palavras que podem ser sorteadas como respostas.

As duas listas partem da mesma base: a uniao de `lexico`, `verbos` e `conjugacoes`. A diferenca e que `answers.json` tambem respeita `scripts/answer-blocklist.txt`, para evitar sortear termos que ja foram marcados como ruins para o jogo.

## Regras de preparacao

O script `scripts/preparar-palavras.py`:

1. Le os arquivos locais `fserb-pt-br-lexico.txt`, `fserb-lista-verbos.txt` e `fserb-pt-br-conjugacoes.txt`.
2. Normaliza para minusculas.
3. Remove acentos.
4. Converte `ç` para `c`.
5. Filtra apenas palavras com exatamente 5 letras apos normalizacao.
6. Remove duplicadas.
7. Aplica `scripts/blocklist.txt` em `validWords.json`.
8. Aplica `scripts/answer-blocklist.txt` somente em `answers.json`.

## Como atualizar

1. Baixe os arquivos `lexico`, `listas/verbos` e `conjugacoes` do `fserb/pt-br`.
2. Salve como `word-sources/fserb-pt-br-lexico.txt`, `word-sources/fserb-lista-verbos.txt` e `word-sources/fserb-pt-br-conjugacoes.txt`.
3. Rode:

```bash
python scripts/preparar-palavras.py
```

## Resultado atual

Resultado da geracao atual:

- `validWords.json`: 8.628 palavras.
- `answers.json`: 8.486 respostas sorteaveis.

Comparacao local com a fonte:

- `lexico`: 145.744 entradas brutas; 6.046 palavras unicas de 5 letras apos normalizacao.
- `listas/verbos`: 4.022 entradas brutas; 246 verbos unicos de 5 letras apos normalizacao.
- `conjugacoes`: 195.751 entradas brutas; 3.480 formas unicas de 5 letras apos normalizacao.
- Uniao de `lexico`, `verbos` e `conjugacoes`: 8.628 palavras unicas de 5 letras.
- Acrescimo de `verbos` e `conjugacoes` sobre o `lexico`: 2.582 palavras unicas.

Validacao feita:

- sem duplicatas;
- somente palavras normalizadas com 5 letras;
- respostas com pelo menos 5.000 palavras;
- respostas sem os casos ruins conhecidos: `apolo`, `crato`, `beija`, `hobby`, `bosta` e `olhou`.
