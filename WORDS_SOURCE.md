# Fonte de palavras

## Fonte principal

A base de palavras atual do Palavra Livre segue a mesma fonte indicada pelo Termo: o `lexico` do repositorio `fserb/pt-br`, disponivel sob licenca MIT.

- https://github.com/fserb/pt-br
- https://github.com/fserb/pt-br/tree/master

O jogo nao acessa essa fonte em runtime. O arquivo bruto fica em `word-sources/` apenas para preparacao local, e os JSONs finais ficam versionados em `src/data/`.

## Arquivo usado

- `word-sources/fserb-pt-br-lexico.txt`: copia local do arquivo `lexico` do `fserb/pt-br`.

## Arquivos gerados

- `src/data/validWords.json`: palavras aceitas como tentativas.
- `src/data/answers.json`: palavras que podem ser sorteadas como respostas.

As duas listas partem da mesma base: o `lexico`. A diferenca e que `answers.json` tambem respeita `scripts/answer-blocklist.txt`, para evitar sortear termos que ja foram marcados como ruins para o jogo.

## Regras de preparacao

O script `scripts/preparar-palavras.py`:

1. Le o arquivo local `fserb-pt-br-lexico.txt`.
2. Normaliza para minusculas.
3. Remove acentos.
4. Converte `ç` para `c`.
5. Filtra apenas palavras com exatamente 5 letras apos normalizacao.
6. Remove duplicadas.
7. Aplica `scripts/blocklist.txt` em `validWords.json`.
8. Aplica `scripts/answer-blocklist.txt` somente em `answers.json`.

## Como atualizar

1. Baixe o arquivo `lexico` do `fserb/pt-br`.
2. Salve como `word-sources/fserb-pt-br-lexico.txt`.
3. Rode:

```bash
python scripts/preparar-palavras.py
```

## Resultado atual

Resultado da geracao atual:

- `validWords.json`: 6.032 palavras.
- `answers.json`: 5.893 respostas sorteaveis.

Validacao feita:

- sem duplicatas;
- somente palavras normalizadas com 5 letras;
- respostas com pelo menos 5.000 palavras;
- respostas sem os casos ruins conhecidos: `apolo`, `crato`, `beija`, `hobby`, `bosta` e `olhou`.
