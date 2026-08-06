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
- `word-sources/fserb-pt-br-icf.txt`: copia local de `icf`.
- `word-sources/frequencywords-pt_br-50k.txt`: lista de frequencia PT-BR do projeto `hermitdave/FrequencyWords`, derivada do OpenSubtitles, usada apenas para priorizar respostas mais comuns.
- `word-sources/termo-respostas-historicas.txt`: lista publica de respostas historicas/curadas do Termo, usada como nucleo de respostas quando presente.

## Arquivos gerados

- `src/data/validWords.json`: palavras aceitas como tentativas.
- `src/data/answers.json`: palavras que podem ser sorteadas como respostas.

As palavras aceitas partem da uniao de `lexico`, `verbos`, `conjugacoes` e `icf`. `validWords.json` fica normalizado para aceitar digitacao sem acento, enquanto `answers.json` preserva a grafia original da fonte quando houver acento ou cedilha. Assim, `cocar` e uma tentativa valida, mas a resposta pode ser exibida como `coçar`.

As respostas sao mais restritas do que as tentativas. Elas usam a lista historica/curada do Termo como nucleo, aceitam excecoes manuais de `scripts/answers-curadas.txt`, e complementam apenas com palavras que passam por cortes de frequencia (`wordfreq` e `FrequencyWords`). O ICF continua como sinal secundario de ordenacao, mas nao e mais usado sozinho para decidir resposta.

`answers.json` tambem respeita `scripts/answer-blocklist.txt`, para evitar sortear termos que ja foram marcados como ruins para o jogo.

## Regras de preparacao

O script `scripts/preparar-palavras.py`:

1. Le os arquivos locais `fserb-pt-br-lexico.txt`, `fserb-lista-verbos.txt`, `fserb-pt-br-conjugacoes.txt`, `fserb-pt-br-icf.txt` e, se existirem, `frequencywords-pt_br-50k.txt` e `termo-respostas-historicas.txt`.
2. Normaliza para minusculas.
3. Remove acentos.
4. Converte `ç` para `c`.
5. Filtra apenas palavras com exatamente 5 letras apos normalizacao.
6. Remove duplicadas.
7. Gera `validWords.json` com palavras normalizadas.
8. Gera `answers.json` com grafia natural priorizada pela lista de frequencia e pela base lexica.
9. Aplica `scripts/blocklist.txt` em `validWords.json`.
10. Aplica `scripts/answer-blocklist.txt` somente em `answers.json`.

## Como atualizar

1. Baixe os arquivos `lexico`, `listas/verbos`, `conjugacoes` e `icf` do `fserb/pt-br`.
2. Salve como `word-sources/fserb-pt-br-lexico.txt`, `word-sources/fserb-lista-verbos.txt`, `word-sources/fserb-pt-br-conjugacoes.txt` e `word-sources/fserb-pt-br-icf.txt`.
3. Opcionalmente, baixe `pt_br_50k.txt` de `hermitdave/FrequencyWords` e salve como `word-sources/frequencywords-pt_br-50k.txt`.
4. Opcionalmente, salve uma lista historica/curada do Termo como `word-sources/termo-respostas-historicas.txt`.
5. Rode:

```bash
python scripts/preparar-palavras.py
```

## Resultado atual

Resultado da geracao atual:

- `validWords.json`: 11.433 palavras.
- `answers.json`: 2.657 respostas sorteaveis.

Comparacao local com a fonte:

- `lexico`: 145.744 entradas brutas; 6.046 palavras unicas de 5 letras apos normalizacao.
- `listas/verbos`: 4.022 entradas brutas; 246 verbos unicos de 5 letras apos normalizacao.
- `conjugacoes`: 195.751 entradas brutas; 3.480 formas unicas de 5 letras apos normalizacao.
- `icf`: 419.486 entradas brutas; 11.302 palavras unicas de 5 letras apos normalizacao.
- Uniao de `lexico`, `verbos`, `conjugacoes` e `icf`: 11.302 palavras unicas de 5 letras antes da blocklist geral.
- As respostas nao usam a cauda rara do lexico para inflar quantidade.
- `frequencywords-pt_br-50k.txt` ajuda a ordenar respostas por uso real; por ser uma lista de legendas, ela nao e usada crua como resposta.
- `wordfreq` corta palavras sem frequencia suficiente em portugues.

Validacao feita:

- sem duplicatas;
- somente palavras normalizadas com 5 letras;
- respostas com pelo menos 1.500 palavras curadas;
- respostas sem casos ruins conhecidos como `apolo`, `crato`, `hobby`, `bosta`, `anona`, `sande`, `liceu`, `touri`, `atiçu`, `agror` e similares.
