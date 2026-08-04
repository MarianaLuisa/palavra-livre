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

## Arquivos gerados

- `src/data/validWords.json`: palavras aceitas como tentativas.
- `src/data/answers.json`: palavras que podem ser sorteadas como respostas.

As palavras aceitas partem da uniao de `lexico`, `verbos`, `conjugacoes` e `icf`. `validWords.json` fica normalizado para aceitar digitacao sem acento, enquanto `answers.json` preserva a grafia original da fonte quando houver acento ou cedilha. Assim, `cocar` e uma tentativa valida, mas a resposta pode ser exibida como `coçar`.

As respostas usam a pontuacao ICF para evitar palavras raras demais. Por padrao, respostas automaticas entram quando a pontuacao ICF e menor ou igual a `17.0`; pontuacoes menores indicam palavras mais comuns.

`answers.json` tambem respeita `scripts/answer-blocklist.txt`, para evitar sortear termos que ja foram marcados como ruins para o jogo.

## Regras de preparacao

O script `scripts/preparar-palavras.py`:

1. Le os arquivos locais `fserb-pt-br-lexico.txt`, `fserb-lista-verbos.txt`, `fserb-pt-br-conjugacoes.txt` e `fserb-pt-br-icf.txt`.
2. Normaliza para minusculas.
3. Remove acentos.
4. Converte `ç` para `c`.
5. Filtra apenas palavras com exatamente 5 letras apos normalizacao.
6. Remove duplicadas.
7. Gera `validWords.json` com palavras normalizadas.
8. Gera `answers.json` preservando acentos e cedilha da fonte quando houver.
9. Aplica `scripts/blocklist.txt` em `validWords.json`.
10. Aplica `scripts/answer-blocklist.txt` somente em `answers.json`.

## Como atualizar

1. Baixe os arquivos `lexico`, `listas/verbos`, `conjugacoes` e `icf` do `fserb/pt-br`.
2. Salve como `word-sources/fserb-pt-br-lexico.txt`, `word-sources/fserb-lista-verbos.txt`, `word-sources/fserb-pt-br-conjugacoes.txt` e `word-sources/fserb-pt-br-icf.txt`.
3. Rode:

```bash
python scripts/preparar-palavras.py
```

## Resultado atual

Resultado da geracao atual:

- `validWords.json`: 11.301 palavras.
- `answers.json`: 5.817 respostas sorteaveis.
- `answers.json`: 1.209 respostas com acento ou cedilha preservados.

Comparacao local com a fonte:

- `lexico`: 145.744 entradas brutas; 6.046 palavras unicas de 5 letras apos normalizacao.
- `listas/verbos`: 4.022 entradas brutas; 246 verbos unicos de 5 letras apos normalizacao.
- `conjugacoes`: 195.751 entradas brutas; 3.480 formas unicas de 5 letras apos normalizacao.
- `icf`: 419.486 entradas brutas; 11.302 palavras unicas de 5 letras apos normalizacao.
- Uniao de `lexico`, `verbos`, `conjugacoes` e `icf`: 11.302 palavras unicas de 5 letras antes da blocklist geral.
- Corte de respostas por ICF `<= 17.0`: remove termos mais raros das respostas, mas eles continuam aceitos como tentativa quando aparecem em `validWords.json`.

Validacao feita:

- sem duplicatas;
- somente palavras normalizadas com 5 letras;
- respostas com pelo menos 5.000 palavras;
- respostas sem casos ruins conhecidos como `apolo`, `crato`, `hobby` e `bosta`.
